import { OfflineEntry, DiaryEntry } from './types';
import { supabase } from './supabase';

const QUEUE_STORAGE_KEY = 'siteop_offline_queue_v1';
const DRAFT_ENTRIES_KEY = 'siteop_local_drafts_v1';

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
    console.error('Failed to save offline queue to localStorage:', err);
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
    reader.onloadend = () => {
      const result = reader.result as string;
      // Strip data URL prefix to get raw base64 or keep string
      resolve(result);
    };
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
 * Uploads a blob to Supabase Storage (or returns inline Data URL if storage bucket fails)
 */
export async function uploadMediaToSupabase(
  blob: Blob,
  folder: 'voice-memos' | 'photos',
  filename: string
): Promise<string> {
  try {
    const filePath = `${folder}/${Date.now()}_${filename}`;
    const { data, error } = await supabase.storage
      .from('diary-assets')
      .upload(filePath, blob, {
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

/**
 * Queries all diary entries to find the highest job number,
 * and increments it to generate the next unique non-repeating number (e.g., #011).
 */
export async function getNextJobNumber(): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('diary_entries')
      .select('extracted_data');

    if (error || !data) {
      return '#001';
    }

    let maxNum = 0;
    for (const row of data) {
      const jn = (row as any)?.extracted_data?.job_number;
      if (jn && typeof jn === 'string') {
        const match = jn.match(/#?(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) {
            maxNum = num;
          }
        }
      }
    }

    const nextNum = maxNum + 1;
    return `#${String(nextNum).padStart(3, '0')}`;
  } catch (err) {
    console.warn('Failed to calculate next job number:', err);
    return '#001';
  }
}

/**
 * Syncs all queued offline entries to Supabase
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
      let photoUrl: string | null = null;

      if (item.voiceBlobBase64) {
        const audioBlob = base64ToBlob(item.voiceBlobBase64, item.audioMimeType || 'audio/mp4');
        voiceUrl = await uploadMediaToSupabase(audioBlob, 'voice-memos', 'voice.mp4');
      }

      if (item.photoBlobBase64) {
        const photoBlob = base64ToBlob(item.photoBlobBase64, item.photoMimeType || 'image/jpeg');
        photoUrl = await uploadMediaToSupabase(photoBlob, 'photos', 'photo.jpg');
      }

      const { data: userData } = await supabase.auth.getUser();
      const jobNumber = item.jobNumber || (await getNextJobNumber());

      const { error } = await supabase.from('diary_entries').insert({
        created_by: userData?.user?.id || null,
        created_at: item.createdAt,
        voice_url: voiceUrl,
        photo_url: photoUrl,
        status: 'draft',
        submitted_at: new Date().toISOString(),
        extracted_data: {
          job_number: jobNumber
        }
      });

      if (!error) {
        removeFromOfflineQueue(item.id);
        successCount++;
        if (onEntryProcessed) onEntryProcessed(successCount);
      } else {
        console.error('Failed to insert queued entry into Supabase:', error);
        failedCount++;
      }
    } catch (err) {
      console.error('Error processing offline queue item:', err);
      failedCount++;
    }
  }

  return { success: successCount, failed: failedCount };
}

