// Blob <-> base64 conversion, split out from offlineStore.ts so offlineDb.ts
// (the legacy-queue migration) and offlineStore.ts (Supabase upload, the
// Gemini retry payload) can both depend on it without importing each other.

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
