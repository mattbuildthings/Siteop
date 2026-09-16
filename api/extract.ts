import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateWithLimits } from '../src/lib/geminiCall.js';
import {
  AI_DAILY_CALL_LIMIT,
  MAX_OUTPUT_TOKENS,
  MAX_TRANSCRIPT_CHARS
} from '../src/lib/geminiConfig.js';
import { bumpAiUsage, readAccessToken, requireUser } from '../src/lib/serverSupabase.js';

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

  // Auth first: this route spends money, so it is not open to the internet.
  const auth = await requireUser(readAccessToken(req));
  if (!auth) {
    return res.status(401).json({ error: 'Sign-in required', code: 'unauthenticated' });
  }

  const usage = await bumpAiUsage(auth.client, 'extract', AI_DAILY_CALL_LIMIT);
  if (!usage.allowed) {
    return res.status(429).json({
      error: 'Daily AI limit reached for this account',
      code: 'daily_limit_reached',
      calls: usage.calls,
      limit: AI_DAILY_CALL_LIMIT
    });
  }

  try {
    const { transcription, entryId } = req.body || {};

    if (!transcription) {
      return res.status(400).json({ error: 'Missing transcription input' });
    }

    if (typeof transcription !== 'string' || transcription.length > MAX_TRANSCRIPT_CHARS) {
      return res.status(413).json({
        error: `Transcript too long (max ${MAX_TRANSCRIPT_CHARS} characters)`,
        code: 'transcript_too_long'
      });
    }

    const prompt = `Bạn là chuyên gia quản lý công trình xây dựng tại Việt Nam.
Hãy phân tích đoạn nhật ký công trình sau và trích xuất dữ liệu cấu trúc JSON:

VĂN BẢN:
"${transcription}"

CHỈ điền các mục dưới đây (delays, deliveries, equipment, visitors, safety, quantities)
nếu văn bản có nhắc tới -- để mảng rỗng [] hoặc bỏ trống nếu không có, đừng suy diễn.

YÊU CẦU TRẢ VỀ JSON THUẦN TÚY (không kèm markdown):
{
  "category": "Ép cọc / Bê tông / Thợ nề / Xây tô / Điện nước / Vật tư / Khác",
  "materials": [
    { "item": "Tên vật tư", "quantity": "Số lượng", "unit": "Đơn vị", "note": "Ghi chú" }
  ],
  "labor": [
    { "role": "Vị trí thợ", "count": 1, "hours": "Thời gian", "note": "Ghi chú" }
  ],
  "delays": [
    { "cause": "Nguyên nhân chậm trễ / sự cố", "duration": "Thời gian dừng việc", "note": "Ghi chú" }
  ],
  "deliveries": [
    { "item": "Vật tư nhận về", "quantity": "Số lượng", "supplier": "Nhà cung cấp", "note": "Ghi chú" }
  ],
  "equipment": [
    { "name": "Tên thiết bị / máy móc", "hours_used": "Giờ hoạt động", "idle_hours": "Giờ chờ/ngừng", "note": "Ghi chú" }
  ],
  "visitors": [
    { "name": "Tên khách", "role": "Vai trò (chủ đầu tư/tư vấn giám sát/thanh tra...)", "purpose": "Mục đích đến" }
  ],
  "safety": {
    "toolbox_talk": "Nội dung họp an toàn đầu giờ nếu có",
    "observations": "Quan sát về an toàn lao động",
    "incidents": "Sự cố / tai nạn an toàn nếu có"
  },
  "quantities": [
    { "item": "Hạng mục", "planned": "Khối lượng kế hoạch", "installed": "Khối lượng đã thi công", "unit": "Đơn vị" }
  ],
  "summary_bullet": "Tóm tắt 1 câu ngắn gọn về nhật ký",
  "is_flagged": false
}`;

    const result = await generateWithLimits(apiKey, [prompt], {
      maxOutputTokens: MAX_OUTPUT_TOKENS.extract,
      label: 'extract'
    });
    const responseText = result.text;

    // Parse failures must NOT fall through to an empty-but-successful response.
    // This previously seeded an all-empty default object and only overwrote it
    // inside a try/catch, so a malformed or truncated reply returned HTTP 200
    // with zero materials, zero labour and zero delays -- indistinguishable in
    // the UI from "the AI read your log and found nothing". Now that
    // maxOutputTokens caps the reply, truncation is a live possibility, so this
    // has to surface rather than silently zero out the user's log.
    let extractedData: Record<string, any>;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('no JSON object in model response');
      extractedData = JSON.parse(jsonMatch[0]);
    } catch (e: any) {
      console.error(
        `[extract] unparseable model response after ${result.attempts} attempt(s),` +
          ` ${responseText.length} chars:`,
        e?.message
      );
      return res.status(502).json({
        error: 'AI returned an unreadable response',
        code: 'malformed_ai_response'
      });
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

    const supabase = auth.client;

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
