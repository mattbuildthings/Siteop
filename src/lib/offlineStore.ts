import { ExtractedData, Weather } from './types';
import { supabase } from './supabase';
import { blobToBase64, base64ToBlob } from './blobEncoding';
import {
  OfflineQueueItem,
  getOfflineQueue,
  getOfflineQueueItem,
  updateOfflineQueueItem,
  removeFromOfflineQueue
} from './offlineDb';

// Re-exported so existing call sites (CaptureRoute, DiaryRoute) don't need to
// know these moved -- the offline queue itself now lives in offlineDb.ts
// (IndexedDB), but blob/base64 conversion is still needed here for uploads
// and for the Gemini retry payload.
export { blobToBase64, base64ToBlob };

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
  /** Typed name confirming the log is accurate. Only recorded when fileAndLock is true. */
  signedOffName?: string | null;
}

/**
 * Single place an entry is created, shared by the capture flow and the offline
 * queue flush. Writes diary_entries, then the entry_meta side table (project,
 * weather, work date, lock state, sign-off), the photo gallery, and the flag row.
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

  // entry_meta is inserted already locked (and signed) when filing, so the
  // lock lands in the same write rather than leaving a window where the
  // filed record is still mutable.
  const { error: metaErr } = await supabase.from('entry_meta').insert({
    entry_id: entryId,
    project_id: input.projectId ?? null,
    log_number: input.logNumber ?? null,
    work_date: input.workDate ?? now.split('T')[0],
    weather: input.weather ?? null,
    locked_at: input.fileAndLock ? now : null,
    locked_by: input.fileAndLock ? userId : null,
    reviewed_at: input.reviewed ? now : null,
    reviewed_by: input.reviewed ? userId : null,
    signed_off_by: input.fileAndLock ? userId : null,
    signed_off_name: input.fileAndLock ? input.signedOffName ?? null : null,
    signed_off_at: input.fileAndLock ? now : null
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

/** Uploads one queued item's media and creates its diary_entries row. */
async function syncQueueItem(item: OfflineQueueItem): Promise<{ id: string } | { error: string }> {
  let voiceUrl: string | null = null;
  const photoUrls: string[] = [];

  if (item.voiceBlob) {
    voiceUrl = await uploadMediaToSupabase(item.voiceBlob, 'voice-memos', 'voice.mp4');
  }

  for (const photoBlob of item.photoBlobs || []) {
    photoUrls.push(await uploadMediaToSupabase(photoBlob, 'photos', 'photo.jpg'));
  }

  // Offline entries are always created as drafts, sign-off unset: nothing
  // captured without a signal gets filed and locked until somebody has
  // reviewed and signed it -- through the diary screen once it syncs up.
  return createEntry({
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
}

/** Syncs every queued offline entry to Supabase, updating each item's visible status as it goes. */
export async function processOfflineQueue(
  onEntryProcessed?: (syncedCount: number) => void
): Promise<{ success: number; failed: number }> {
  const queue = await getOfflineQueue();
  if (queue.length === 0) return { success: 0, failed: 0 };

  let successCount = 0;
  let failedCount = 0;

  for (const item of queue) {
    try {
      await updateOfflineQueueItem(item.id, { status: 'syncing', errorMessage: null });
      const result = await syncQueueItem(item);

      if ('id' in result) {
        await removeFromOfflineQueue(item.id);
        successCount++;
        if (onEntryProcessed) onEntryProcessed(successCount);
      } else {
        console.error('Failed to insert queued entry into Supabase:', result.error);
        await updateOfflineQueueItem(item.id, {
          status: 'failed',
          errorMessage: result.error,
          retryCount: item.retryCount + 1
        });
        failedCount++;
      }
    } catch (err: any) {
      console.error('Error processing offline queue item:', err);
      await updateOfflineQueueItem(item.id, {
        status: 'failed',
        errorMessage: err?.message || 'Đồng bộ thất bại',
        retryCount: item.retryCount + 1
      });
      failedCount++;
    }
  }

  return { success: successCount, failed: failedCount };
}

/** Manual per-item retry, for the "Thử lại" button on a failed queue entry. */
export async function retryOfflineQueueItem(id: string): Promise<{ success: boolean; error?: string }> {
  const item = await getOfflineQueueItem(id);
  if (!item) return { success: false, error: 'Không tìm thấy mục trong hàng chờ.' };

  try {
    await updateOfflineQueueItem(id, { status: 'syncing', errorMessage: null });
    const result = await syncQueueItem(item);

    if ('id' in result) {
      await removeFromOfflineQueue(id);
      return { success: true };
    }

    await updateOfflineQueueItem(id, {
      status: 'failed',
      errorMessage: result.error,
      retryCount: item.retryCount + 1
    });
    return { success: false, error: result.error };
  } catch (err: any) {
    const message = err?.message || 'Đồng bộ thất bại';
    await updateOfflineQueueItem(id, { status: 'failed', errorMessage: message, retryCount: item.retryCount + 1 });
    return { success: false, error: message };
  }
}
