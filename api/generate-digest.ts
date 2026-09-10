import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_MODEL } from '../src/lib/geminiConfig.js';
import { createUserClient, readAccessToken } from '../src/lib/serverSupabase.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY server environment variable not configured' });
  }

  const supabase = createUserClient(readAccessToken(req));
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase is not configured on the server' });
  }

  try {
    let targetDate = (req.query.date as string) || (req.body && req.body.date);
    if (!targetDate) {
      const now = new Date();
      targetDate = now.toISOString().split('T')[0];
    }

    // A digest belongs to one site. Without this, two sites logging on the same
    // day were merged into a single narrative and upserted over each other,
    // because daily_digests is UNIQUE(digest_date).
    const projectId: string | null =
      (req.query.projectId as string) || (req.body && req.body.projectId) || null;

    // Entry ids on this project, via the entry_meta side table.
    let projectEntryIds: string[] | null = null;
    if (projectId) {
      const { data: metaRows, error: metaErr } = await supabase
        .from('entry_meta')
        .select('entry_id')
        .eq('project_id', projectId);

      if (metaErr) {
        throw new Error(`Failed fetching project entries: ${metaErr.message}`);
      }
      projectEntryIds = (metaRows || []).map((m: any) => m.entry_id);
    }

    const startIso = `${targetDate}T00:00:00.000Z`;
    const endIso = `${targetDate}T23:59:59.999Z`;

    // 1. Fetch diary entries for targetDate (flat select to avoid schema cache join issues)
    let entriesQuery = supabase
      .from('diary_entries')
      .select('*')
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .order('created_at', { ascending: true });

    if (projectEntryIds !== null) {
      // No entries on this project at all -> short-circuit to the empty digest.
      entriesQuery = entriesQuery.in('id', projectEntryIds.length > 0 ? projectEntryIds : ['00000000-0000-0000-0000-000000000000']);
    }

    const { data: entries, error: fetchErr } = await entriesQuery;

    if (fetchErr) {
      throw new Error(`Failed fetching date entries: ${fetchErr.message}`);
    }

    const count = entries ? entries.length : 0;

    if (count === 0) {
      const emptyDigest = {
        digest_date: targetDate,
        agenda_text: 'Chưa có mục cần chú ý cho ngày này.',
        summary_text: 'Không có ghi nhận nhật ký công trình nào trong ngày.',
        entries_count: 0
      };

      if (projectId) {
        await supabase
          .from('project_digests')
          .upsert({ ...emptyDigest, project_id: projectId }, { onConflict: 'project_id,digest_date' });
        return res.status(200).json({ ...emptyDigest, project_id: projectId });
      }

      await supabase.from('daily_digests').upsert(emptyDigest, { onConflict: 'digest_date' });
      return res.status(200).json(emptyDigest);
    }

    // 2. Fetch flags for targetDate
    const { data: flags } = await supabase.from('entry_flags').select('*');
    const flagsByEntryId: Record<string, any> = {};
    if (flags) {
      flags.forEach((f) => {
        flagsByEntryId[f.entry_id] = f;
      });
    }

    // 3. Build Gemini prompt
    let promptContent = `Dưới đây là danh sách tất cả nhật ký công trình trong ngày ${targetDate}:\n\n`;

    entries.forEach((e: any, idx: number) => {
      const flagInfo = flagsByEntryId[e.id];
      const isFlagged = flagInfo?.is_flagged || false;
      const bullet = flagInfo?.summary_bullet || e.extracted_data?.summary_bullet || e.transcription?.substring(0, 100) || 'Ghi nhận công trình';
      const jobNum = e.extracted_data?.job_number ? `[Mã: ${e.extracted_data.job_number}] ` : '';

      promptContent += `### Mục #${idx + 1} ${jobNum}${isFlagged ? '[⚠️ CẦN CHÚ Ý / FLAGGED]' : ''}\n`;
      promptContent += `- Tóm tắt ngắn: ${bullet}\n`;

      if (isFlagged && e.transcription) {
        promptContent += `- Nội dung đầy đủ (Flagged): "${e.transcription}"\n`;
        if (flagInfo?.flag_reason) {
          promptContent += `- Lý do lưu ý: ${flagInfo.flag_reason}\n`;
        }
      }

      promptContent += `\n`;
    });

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const systemPrompt = `Bạn là chuyên gia quản lý công trình xây dựng tại Việt Nam.
Dựa vào danh sách nhật ký công trình ngày ${targetDate} được cung cấp bên dưới, hãy tổng hợp báo cáo ngày theo đúng JSON format:

${promptContent}

YÊU CẦU TRẢ VỀ JSON THUẦN TÚY (không kèm markdown):
{
  "agenda_text": "Danh sách việc cần làm / cần chú ý ngắn gọn cho ngày mai (tổng hợp từ các mục flagged Cần Chú Ý). Gạch đầu dòng rõ ràng từng việc.",
  "summary_text": "Tóm tắt tổng quan tiến độ công trình trong ngày, vật tư và nhân công các hạng mục còn lại."
}`;

    const result = await model.generateContent(systemPrompt);
    const responseText = result.response.text();

    let agendaText = 'Chưa có mục chú ý đặc biệt.';
    let summaryText = 'Đã hoàn thành các công việc theo kế hoạch.';

    try {
      const match = responseText.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        agendaText = parsed.agenda_text || agendaText;
        summaryText = parsed.summary_text || summaryText;
      }
    } catch (e) {
      console.warn('Failed parsing digest JSON:', e);
    }

    const digestPayload = {
      digest_date: targetDate,
      agenda_text: agendaText,
      summary_text: summaryText,
      entries_count: count,
      generated_at: new Date().toISOString()
    };

    const { data: upsertedData, error: upsertErr } = projectId
      ? await supabase
          .from('project_digests')
          .upsert({ ...digestPayload, project_id: projectId }, { onConflict: 'project_id,digest_date' })
          .select()
          .single()
      : await supabase
          .from('daily_digests')
          .upsert(digestPayload, { onConflict: 'digest_date' })
          .select()
          .single();

    if (upsertErr) {
      throw new Error(`Failed saving daily digest: ${upsertErr.message}`);
    }

    return res.status(200).json(upsertedData || digestPayload);
  } catch (error: any) {
    console.error('Generate Digest API Error:', error);
    return res.status(500).json({ error: error.message || 'Digest generation failed' });
  }
}
