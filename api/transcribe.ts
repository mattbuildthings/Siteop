import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateWithLimits } from '../src/lib/geminiCall.js';
import {
  AI_DAILY_CALL_LIMIT,
  MAX_AUDIO_BASE64_CHARS,
  MAX_OUTPUT_TOKENS
} from '../src/lib/geminiConfig.js';
import { bumpAiUsage, readAccessToken, requireUser } from '../src/lib/serverSupabase.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY server environment variable not configured' });
  }

  // Auth first: this route spends money, so it is not open to the internet.
  const auth = await requireUser(readAccessToken(req));
  if (!auth) {
    return res.status(401).json({ error: 'Sign-in required', code: 'unauthenticated' });
  }

  const usage = await bumpAiUsage(auth.client, 'transcribe', AI_DAILY_CALL_LIMIT);
  if (!usage.allowed) {
    return res.status(429).json({
      error: 'Daily AI limit reached for this account',
      code: 'daily_limit_reached',
      calls: usage.calls,
      limit: AI_DAILY_CALL_LIMIT
    });
  }

  try {
    const { audioBase64, mimeType = 'audio/mp4', entryId } = req.body || {};

    if (!audioBase64) {
      return res.status(400).json({ error: 'Missing audioBase64 input' });
    }

    if (typeof audioBase64 !== 'string' || audioBase64.length > MAX_AUDIO_BASE64_CHARS) {
      return res.status(413).json({
        error: 'Recording too large to transcribe',
        code: 'audio_too_large'
      });
    }

    const cleanMimeType = (mimeType || 'audio/mp4').split(';')[0].trim();

    const cleanBase64 = audioBase64.includes(';base64,')
      ? audioBase64.split(';base64,')[1]
      : audioBase64;

    const result = await generateWithLimits(
      apiKey,
      [
        {
          inlineData: {
            mimeType: cleanMimeType,
            data: cleanBase64
          }
        },
        {
          text: `Bạn là trợ lý ảo ghi nhận nhật ký công trình xây dựng bằng tiếng Việt.
Hãy nghe đoạn âm thanh này và chuyển thành văn bản (transcription) tiếng Việt đầy đủ, chính xác.
Không thêm nhận xét, chỉ trả về đúng văn bản ghi âm tiếng Việt.`
        }
      ],
      { maxOutputTokens: MAX_OUTPUT_TOKENS.transcribe, label: 'transcribe' }
    );

    let transcriptionText = result.text.trim();
    // Clean up code blocks if present
    transcriptionText = transcriptionText.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

    // Update the entry directly if entryId was provided. This runs AS the
    // signed-in user: RLS is no longer USING(true), so an anonymous
    // server-side write to diary_entries is rejected outright.
    const supabase = auth.client;

    if (entryId && supabase) {
      const { error: updateErr } = await supabase
        .from('diary_entries')
        .update({
          transcription: transcriptionText
        })
        .eq('id', entryId);

      if (updateErr) {
        console.error('Failed writing transcription to Supabase:', updateErr);
      }
    }

    return res.status(200).json({ text: transcriptionText, confidence_score: 0.95 });
  } catch (error: any) {
    console.error('Transcribe API error:', error);
    return res.status(500).json({ error: error.message || 'Transcription failed' });
  }
}
