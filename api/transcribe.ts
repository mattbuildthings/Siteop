import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_MODEL } from '../src/lib/geminiConfig.js';
import { createUserClient, readAccessToken } from '../src/lib/serverSupabase.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY server environment variable not configured' });
  }

  try {
    const { audioBase64, mimeType = 'audio/mp4', entryId } = req.body || {};

    if (!audioBase64) {
      return res.status(400).json({ error: 'Missing audioBase64 input' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const cleanMimeType = (mimeType || 'audio/mp4').split(';')[0].trim();

    const cleanBase64 = audioBase64.includes(';base64,')
      ? audioBase64.split(';base64,')[1]
      : audioBase64;

    const result = await model.generateContent([
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
    ]);

    let transcriptionText = result.response.text().trim();
    // Clean up code blocks if present
    transcriptionText = transcriptionText.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

    // Update the entry directly if entryId was provided. This runs AS the
    // signed-in user: RLS is no longer USING(true), so an anonymous
    // server-side write to diary_entries is rejected outright.
    const supabase = createUserClient(readAccessToken(req));

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
