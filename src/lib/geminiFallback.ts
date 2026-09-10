import { supabase } from './supabase';
import { getAccessToken } from './session';
import { ExtractedData } from './types';

/**
 * Transcription & extraction via the Vercel serverless /api routes ONLY.
 * This NEVER calls Gemini directly from the browser -- the Gemini API key must
 * stay server-side. If either serverless call fails, the failure is thrown and
 * surfaced, never swallowed behind a fake success.
 *
 * The routes' Supabase writes now run as the signed-in user (the access token
 * is forwarded and used as the Authorization header server-side), because RLS
 * is no longer `USING (true)` -- an anonymous server-side write would be
 * rejected. See supabase/migrations/20260909_projects_roles_and_entry_meta.sql.
 */

function stripDataUrl(audioBase64: string): string {
  return audioBase64.includes(';base64,') ? audioBase64.split(';base64,')[1] : audioBase64;
}

export interface AnalysisResult {
  text?: string;
  extracted_data?: ExtractedData;
  error?: string;
}

/**
 * Analyse a recording WITHOUT persisting anything.
 *
 * This is the capture path. The transcript and the structured extraction come
 * back to the browser so a human can read and correct them before the entry is
 * created -- an AI guess at material quantities and headcount should not become
 * part of a contemporaneous record with nobody having looked at it.
 */
export async function analyzeAudio(
  audioBase64: string,
  rawMimeType: string = 'audio/mp4'
): Promise<AnalysisResult> {
  const mimeType = (rawMimeType || 'audio/mp4').split(';')[0].trim();
  const cleanBase64 = stripDataUrl(audioBase64);

  try {
    const transcribeRes = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64: cleanBase64, mimeType })
    });

    if (!transcribeRes.ok) {
      const errBody = await transcribeRes.text().catch(() => '');
      throw new Error(`/api/transcribe returned ${transcribeRes.status}: ${errBody}`);
    }

    const transcribeData = await transcribeRes.json();
    const transcriptionText = transcribeData.text;

    if (!transcriptionText) {
      throw new Error('/api/transcribe returned no text');
    }

    const extractRes = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcription: transcriptionText })
    });

    if (!extractRes.ok) {
      const errBody = await extractRes.text().catch(() => '');
      throw new Error(`/api/extract returned ${extractRes.status}: ${errBody}`);
    }

    const extractedData = await extractRes.json();
    return { text: transcriptionText, extracted_data: extractedData };
  } catch (err: any) {
    console.error('analyzeAudio failed:', err);
    return { error: err.message || 'Unknown error calling /api/transcribe or /api/extract' };
  }
}

/** Text-only re-extraction, used when a human edits the transcript in review. */
export async function extractFromText(transcription: string): Promise<AnalysisResult> {
  try {
    const res = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcription })
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`/api/extract returned ${res.status}: ${errBody}`);
    }

    return { text: transcription, extracted_data: await res.json() };
  } catch (err: any) {
    console.error('extractFromText failed:', err);
    return { error: err.message || 'Unknown error calling /api/extract' };
  }
}

/**
 * Retry path for an entry that already exists in the database but has no
 * transcript (offline sync, or an earlier API failure). Here the routes DO
 * write back, so the user's access token goes with the request.
 */
export async function processAudioWithGemini(
  entryId: string,
  audioBase64: string,
  rawMimeType: string = 'audio/mp4'
): Promise<AnalysisResult> {
  const mimeType = (rawMimeType || 'audio/mp4').split(';')[0].trim();
  const cleanBase64 = stripDataUrl(audioBase64);
  const accessToken = await getAccessToken();

  try {
    const transcribeRes = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64: cleanBase64, mimeType, entryId, accessToken })
    });

    if (!transcribeRes.ok) {
      const errBody = await transcribeRes.text().catch(() => '');
      throw new Error(`/api/transcribe returned ${transcribeRes.status}: ${errBody}`);
    }

    const transcribeData = await transcribeRes.json();
    const transcriptionText = transcribeData.text;

    if (!transcriptionText) {
      throw new Error('/api/transcribe returned no text');
    }

    const extractRes = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcription: transcriptionText, entryId, accessToken })
    });

    if (!extractRes.ok) {
      const errBody = await extractRes.text().catch(() => '');
      throw new Error(`/api/extract returned ${extractRes.status}: ${errBody}`);
    }

    const extractedData = await extractRes.json();
    return { text: transcriptionText, extracted_data: extractedData };
  } catch (err: any) {
    console.error('processAudioWithGemini failed:', err);

    // Surface the failure on the entry itself instead of leaving it silently blank.
    await supabase.from('diary_entries').update({ status: 'error' }).eq('id', entryId);

    return { error: err.message || 'Unknown error calling /api/transcribe or /api/extract' };
  }
}
