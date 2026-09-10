import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_MODEL } from '../src/lib/geminiConfig.js';
import { createUserClient, readAccessToken } from '../src/lib/serverSupabase.js';

// Deterministic trigger word check helper
function removeVietnameseDiacritics(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

function checkTriggerWords(rawText: string): { isFlagged: boolean; matchedReason: string | null } {
  if (!rawText) return { isFlagged: false, matchedReason: null };

  const normalizedText = removeVietnameseDiacritics(rawText);

  for (const triggerWord of ['luu y', 'quan trong', 'khan', 'gap', 'can', 'chu y', 'nho']) {
    const regex = new RegExp(`\\b${triggerWord}\\b`, 'i');
    if (regex.test(normalizedText)) {
      let originalDisplay = triggerWord;
      if (triggerWord === 'luu y') originalDisplay = 'lưu ý';
      else if (triggerWord === 'quan trong') originalDisplay = 'quan trọng';
      else if (triggerWord === 'khan') originalDisplay = 'khẩn';
      else if (triggerWord === 'gap') originalDisplay = 'gấp';
      else if (triggerWord === 'can') originalDisplay = 'cần';
      else if (triggerWord === 'chu y') originalDisplay = 'chú ý';
      else if (triggerWord === 'nho') originalDisplay = 'nhớ';

      return { isFlagged: true, matchedReason: originalDisplay };
    }
  }

  return { isFlagged: false, matchedReason: null };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY server environment variable not configured' });
  }

  try {
    const { transcription, entryId } = req.body || {};

    if (!transcription) {
      return res.status(400).json({ error: 'Missing transcription input' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt = `Bạn là chuyên gia quản lý công trình xây dựng tại Việt Nam.
Hãy phân tích đoạn nhật ký công trình sau và trích xuất dữ liệu cấu trúc JSON:

VĂN BẢN:
"${transcription}"

YÊU CẦU TRẢ VỀ JSON THUẦN TÚY (không kèm markdown):
{
  "category": "Ép cọc / Bê tông / Thợ nề / Xây tô / Điện nước / Vật tư / Khác",
  "materials": [
    { "item": "Tên vật tư", "quantity": "Số lượng", "unit": "Đơn vị", "note": "Ghi chú" }
  ],
  "labor": [
    { "role": "Vị trí thợ", "count": 1, "hours": "Thời gian", "note": "Ghi chú" }
  ],
  "summary_bullet": "Tóm tắt 1 câu ngắn gọn về nhật ký",
  "is_flagged": false
}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    let extractedData = {
      category: 'Khác',
      materials: [],
      labor: [],
      summary_bullet: transcription.substring(0, 80),
      is_flagged: false
    };

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.warn('Fallback parsing extraction response:', e);
    }

    // Deterministic trigger word check
    const triggerCheck = checkTriggerWords(transcription);
    let finalIsFlagged = false;
    let finalFlagReason: string | null = null;

    if (triggerCheck.isFlagged) {
      finalIsFlagged = true;
      finalFlagReason = triggerCheck.matchedReason;
    } else if (extractedData.is_flagged) {
      finalIsFlagged = true;
      finalFlagReason = 'gemini_judgment';
    }

    let existingJobNumber: string | undefined;

    const supabase = createUserClient(readAccessToken(req));

    if (entryId && supabase) {
      // Fetch existing entry to preserve job_number
      const { data: existingEntry } = await supabase
        .from('diary_entries')
        .select('extracted_data')
        .eq('id', entryId)
        .maybeSingle();

      existingJobNumber = (existingEntry as any)?.extracted_data?.job_number;

      const mergedExtracted = {
        ...extractedData,
        ...(existingJobNumber ? { job_number: existingJobNumber } : {})
      };

      // Update extracted_data on diary_entries
      await supabase
        .from('diary_entries')
        .update({
          extracted_data: mergedExtracted
        })
        .eq('id', entryId);

      // Write one row to entry_flags table
      const summaryBulletText = extractedData.summary_bullet || transcription.substring(0, 100);

      await supabase.from('entry_flags').insert({
        entry_id: entryId,
        summary_bullet: summaryBulletText,
        is_flagged: finalIsFlagged,
        flag_reason: finalFlagReason
      });
    }

    return res.status(200).json({
      ...extractedData,
      ...(existingJobNumber ? { job_number: existingJobNumber } : {}),
      is_flagged: finalIsFlagged,
      flag_reason: finalFlagReason
    });
  } catch (error: any) {
    console.error('Extract API error:', error);
    return res.status(500).json({ error: error.message || 'Extraction failed' });
  }
}
