import { ExtractedData, OfflineEntry, Weather } from './types';
import { supabase } from './supabase';
import { getNextLogNumber } from './session';

const QUEUE_STORAGE_KEY = 'siteop_offline_queue_v1';

export function getOfflineQueue(): OfflineEntry[] {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to read offline queue from localStorage:', err);
    return [];
  }
}

export function saveOfflineQueue(queue: OfflineEntry[]): void {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch (err) {
    // localStorage is ~5MB and base64 inflates blobs by a third, so a couple of
    // photos can fill it. Surface it rather than dropping the entry silently.
    console.error('Failed to save offline queue to localStorage:', err);
    throw new Error(
      'Bộ nhớ offline đã đầy — vui lòng kết nối mạng để đồng bộ các nhật ký đang chờ trước khi ghi thêm.'
    );
  }
}

export function addToOfflineQueue(entry: Omit<OfflineEntry, 'id' | 'createdAt' | 'retryCount'>): OfflineEntry {
  const queue = getOfflineQueue();
  const newEntry: OfflineEntry = {
    ...entry,
    id: `offline_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    createdAt: new Date().toISOString(),
    retryCount: 0
  };
  queue.push(newEntry);
  saveOfflineQueue(queue);
  return newEntry;
}

export function removeFromOfflineQueue(id: string): void {
  const queue = getOfflineQueue().filter((item) => item.id !== id);
  saveOfflineQueue(queue);
}

// Convert File / Blob to Base64 String for offline localStorage storage
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function base64ToBlob(base64Data: string, fallbackMime: string = 'application/octet-stream'): Blob {
  const parts = base64Data.split(';base64,');
  const contentType = parts.length > 1 ? parts[0].replace('data:', '') : fallbackMime;
  const raw = window.atob(parts.length > 1 ? parts[1] : parts[0]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);

  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }

  return new Blob([uInt8Array], { type: contentType });
}

/**
 * Uploads a blob to Supabase Storage (or returns an inline Data URL if the
 * bucket write fails, so a photo is never lost to a storage misconfiguration).
 */
export async function uploadMediaToSupabase(
  blob: Blob,
  folder: 'voice-memos' | 'photos',
  filename: string
): Promise<string> {
  try {
    const filePath = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${filename}`;
    const { data, error } = await supabase.storage.from('diary-assets').upload(filePath, blob, {
      cacheControl: '3600',
      upsert: true,
      contentType: blob.type
    });

    if (error) {
      console.warn(`Supabase Storage upload to 'diary-assets' warning (${error.message}). Using data URL fallback.`);
      return await blobToBase64(blob);
    }

    const { data: publicUrlData } = supabase.storage.from('diary-assets').getPublicUrl(data.path);
    return publicUrlData.publicUrl;
  } catch (err) {
    console.warn('Storage bucket upload fallback:', err);
    return await blobToBase64(blob);
  }
}

export interface CreateEntryInput {
  voiceUrl?: string | null;
  photoUrls?: string[];
  transcription?: string | null;
  extractedData?: ExtractedData | null;
  projectId?: string | null;
  logNumber?: string | null;
  workDate?: string | null;
  weather?: Weather | null;
  createdAt?: string;
  /** true => file and lock immediately; false => keep as an editable draft. */
  fileAndLock?: boolean;
  /** A human read the AI extraction before this was saved. */
  reviewed?: boolean;
}

/**
 * Single place an entry is created, shared by the capture flow and the offline
 * queue flush. Writes diary_entries, then the entry_meta side table (project,
 * weather, work date, lock state), the photo gallery, and the flag row.
 *
 * diary_entries keeps its original column shape -- everything new lives in
 * entry_meta. See the header of the 20260909 migration for why.
 */
export async function createEntry(input: CreateEntryInput): Promise<{ id: string } | { error: string }> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id || null;
  const photoUrls = input.photoUrls || [];
  const now = new Date().toISOString();

  const extracted: Record<string, unknown> = {
    ...(input.extractedData || {}),
    ...(input.logNumber ? { job_number: input.logNumber } : {})
  };

  const { data: newEntry, error } = await supabase
    .from('diary_entries')
    .insert({
      created_by: userId,
      ...(input.createdAt ? { created_at: input.createdAt } : {}),
      voice_url: input.voiceUrl ?? null,
      photo_url: photoUrls[0] ?? null, // cover photo, kept for existing readers
      transcription: input.transcription ?? null,
      extracted_data: Object.keys(extracted).length > 0 ? extracted : null,
      status: input.fileAndLock ? 'filed' : 'draft',
      submitted_at: now
    })
    .select()
    .single();

  if (error || !newEntry) {
    return { error: error?.message || 'Không tạo được nhật ký' };
  }

  const entryId = (newEntry as { id: string }).id;

  // entry_meta is inserted already locked when filing, so the lock lands in the
  // same write rather than leaving a window where the record is mutable.
  const { error: metaErr } = await supabase.from('entry_meta').insert({
    entry_id: entryId,
    project_id: input.projectId ?? null,
    log_number: input.logNumber ?? null,
    work_date: input.workDate ?? now.split('T')[0],
    weather: input.weather ?? null,
    locked_at: input.fileAndLock ? now : null,
    locked_by: input.fileAndLock ? userId : null,
    reviewed_at: input.reviewed ? now : null,
    reviewed_by: input.reviewed ? userId : null
  });

  if (metaErr) {
    console.warn('Entry saved but its meta row failed:', metaErr);
  }

  if (photoUrls.length > 0) {
    const { error: photoErr } = await supabase.from('entry_photos').insert(
      photoUrls.map((url, idx) => ({
        entry_id: entryId,
        photo_url: url,
        sort_order: idx,
        taken_at: now
      }))
    );
    if (photoErr) console.warn('Entry saved but its photo rows failed:', photoErr);
  }

  // Flag row drives the digest agenda and the weekly to-do list.
  if (input.extractedData) {
    const summary =
      input.extractedData.summary_bullet ||
      input.extractedData.summary_vi ||
      (input.transcription || '').substring(0, 100);

    const { error: flagErr } = await supabase.from('entry_flags').insert({
      entry_id: entryId,
      summary_bullet: summary,
      is_flagged: Boolean(input.extractedData.is_flagged),
      flag_reason: input.extractedData.is_flagged ? summary : null
    });
    if (flagErr) console.warn('Entry saved but its flag row failed:', flagErr);
  }

  return { id: entryId };
}

/**
 * Syncs queued offline entries to Supabase. Offline entries are always created
 * as drafts: nothing captured without a signal gets filed and locked until
 * somebody has looked at it online.
 */
export async function processOfflineQueue(
  onEntryProcessed?: (syncedCount: number) => void
): Promise<{ success: number; failed: number }> {
  const queue = getOfflineQueue();
  if (queue.length === 0) return { success: 0, failed: 0 };

  let successCount = 0;
  let failedCount = 0;

  for (const item of [...queue]) {
    try {
      let voiceUrl: string | null = null;
      const photoUrls: string[] = [];

      if (item.voiceBlobBase64) {
        const audioBlob = base64ToBlob(item.voiceBlobBase64, item.audioMimeType || 'audio/mp4');
        voiceUrl = await uploadMediaToSupabase(audioBlob, 'voice-memos', 'voice.mp4');
      }

      for (const photoBase64 of item.photoBlobsBase64 || []) {
        const photoBlob = base64ToBlob(photoBase64, item.photoMimeType || 'image/jpeg');
        photoUrls.push(await uploadMediaToSupabase(photoBlob, 'photos', 'photo.jpg'));
      }

      const result = await createEntry({
        voiceUrl,
        photoUrls,
        transcription: item.transcription ?? null,
        extractedData: item.extractedData ?? null,
        projectId: item.projectId ?? null,
        logNumber: item.jobNumber ?? null,
        workDate: item.workDate ?? item.createdAt.split('T')[0],
        weather: item.weather ?? null,
        createdAt: item.createdAt,
        fileAndLock: false,
        reviewed: false
      });

      if ('id' in result) {
        removeFromOfflineQueue(item.id);
        successCount++;
        if (onEntryProcessed) onEntryProcessed(successCount);
      } else {
        console.error('Failed to insert queued entry into Supabase:', result.error);
        failedCount++;
      }
    } catch (err) {
      console.error('Error processing offline queue item:', err);
      failedCount++;
    }
  }

  return { success: successCount, failed: failedCount };
}
