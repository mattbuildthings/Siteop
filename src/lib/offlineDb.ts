import { ExtractedData, Weather } from './types';
import { base64ToBlob } from './blobEncoding';

/**
 * Offline capture queue, backed by IndexedDB instead of localStorage.
 *
 * The old queue (still readable via migrateLegacyLocalStorageQueue below)
 * stored voice/photo blobs as base64 strings inside a single localStorage key.
 * That has two problems on a jobsite: localStorage caps out around 5MB per
 * origin, and base64 inflates binary data by roughly a third -- so two or
 * three photos plus a voice memo could silently fail to save with no
 * indication beyond a thrown error the user may never see, at the exact
 * moment (no signal) the entry has nowhere else to go.
 *
 * IndexedDB stores Blob values natively (no base64 detour at all) and its
 * quota is disk-based -- typically hundreds of MB to several GB depending on
 * the browser and available space, with the browser prompting for more
 * rather than failing silently.
 */

export type QueueItemStatus = 'pending' | 'syncing' | 'failed';

export interface OfflineQueueItem {
  id: string;
  createdAt: string;
  voiceBlob?: Blob | null;
  audioMimeType?: string | null;
  photoBlobs?: Blob[];
  photoMimeType?: string | null;
  projectId?: string | null;
  workDate?: string | null;
  weather?: Weather | null;
  transcription?: string | null;
  extractedData?: ExtractedData | null;
  jobNumber?: string | null;
  status: QueueItemStatus;
  errorMessage?: string | null;
  retryCount: number;
}

const DB_NAME = 'siteop_offline_v1';
const DB_VERSION = 1;
const STORE_NAME = 'queue';
const LEGACY_LOCALSTORAGE_KEY = 'siteop_offline_queue_v1';

function openQueueDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Trình duyệt không hỗ trợ IndexedDB.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getOfflineQueue(): Promise<OfflineQueueItem[]> {
  try {
    const db = await openQueueDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve((request.result as OfflineQueueItem[]) || []);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Failed to read offline queue from IndexedDB:', err);
    return [];
  }
}

export async function getOfflineQueueItem(id: string): Promise<OfflineQueueItem | null> {
  try {
    const db = await openQueueDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve((request.result as OfflineQueueItem) ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Failed to read offline queue item from IndexedDB:', err);
    return null;
  }
}

function putItem(db: IDBDatabase, item: OfflineQueueItem): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function addToOfflineQueue(
  entry: Omit<OfflineQueueItem, 'id' | 'createdAt' | 'retryCount' | 'status'>
): Promise<OfflineQueueItem> {
  const db = await openQueueDb();
  const newItem: OfflineQueueItem = {
    ...entry,
    id: `offline_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    createdAt: new Date().toISOString(),
    retryCount: 0,
    status: 'pending'
  };
  await putItem(db, newItem);
  return newItem;
}

export async function updateOfflineQueueItem(id: string, patch: Partial<OfflineQueueItem>): Promise<void> {
  const db = await openQueueDb();
  const existing = await getOfflineQueueItem(id);
  if (!existing) return;
  await putItem(db, { ...existing, ...patch });
}

export async function removeFromOfflineQueue(id: string): Promise<void> {
  const db = await openQueueDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * One-time migration from the old localStorage+base64 queue to IndexedDB,
 * converting each item's base64 back into real Blobs. Safe to call on every
 * app start: it's a no-op once the legacy key is gone, which it removes as
 * its last step so this only ever runs once per device.
 */
export async function migrateLegacyLocalStorageQueue(): Promise<void> {
  let raw: string | null;
  try {
    raw = localStorage.getItem(LEGACY_LOCALSTORAGE_KEY);
  } catch {
    return;
  }
  if (!raw) return;

  try {
    const legacyItems: Array<Record<string, any>> = JSON.parse(raw);
    const db = await openQueueDb();

    for (const item of legacyItems) {
      const voiceBlob = item.voiceBlobBase64
        ? base64ToBlob(item.voiceBlobBase64, item.audioMimeType || 'audio/mp4')
        : undefined;
      const photoBlobs = (item.photoBlobsBase64 || []).map((b64: string) =>
        base64ToBlob(b64, item.photoMimeType || 'image/jpeg')
      );

      await putItem(db, {
        id: item.id,
        createdAt: item.createdAt,
        voiceBlob,
        audioMimeType: item.audioMimeType ?? null,
        photoBlobs,
        photoMimeType: item.photoMimeType ?? null,
        projectId: item.projectId ?? null,
        workDate: item.workDate ?? null,
        weather: item.weather ?? null,
        transcription: item.transcription ?? null,
        extractedData: item.extractedData ?? null,
        jobNumber: item.jobNumber ?? null,
        status: 'pending',
        errorMessage: null,
        retryCount: item.retryCount ?? 0
      });
    }

    localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
  } catch (err) {
    console.error('Failed migrating legacy offline queue -- leaving the old key in place to retry later:', err);
  }
}
