import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import { Readable } from 'stream';
import { createUserClient, readAccessToken } from '../src/lib/serverSupabase.js';

const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || '1Bp_KmKCXxZblDCFXtuYVSeLziLVITLz0';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Runs as the caller. sync_logs is manager-only under the new RLS policies,
  // so a non-manager's export now fails loudly instead of silently writing.
  const supabase = createUserClient(readAccessToken(req));
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase is not configured on the server' });
  }

  try {
    // 1. Fetch entries from Supabase (filed or draft)
    const { data: entries, error: fetchErr } = await supabase
      .from('diary_entries')
      .select('*')
      .order('created_at', { ascending: false });

    if (fetchErr) {
      throw new Error(`Failed to fetch diary entries: ${fetchErr.message}`);
    }

    const count = entries ? entries.length : 0;
    const now = new Date();
    const weekFormatted = `${now.getFullYear()}-W${Math.ceil(now.getDate() / 7)}`;
    const filename = `Siteop_Diary_Export_${now.toISOString().split('T')[0]}_${weekFormatted}.md`;

    // 2. Format Markdown Document
    let mdContent = `# Nhật Ký Công Trình Siteop — Xuất Báo Cáo Tuần\n`;
    mdContent += `**Thời gian xuất:** ${now.toLocaleString('vi-VN')}\n`;
    mdContent += `**Tổng số nhật ký:** ${count}\n\n`;
    mdContent += `---\n\n`;

    if (entries && entries.length > 0) {
      entries.forEach((entry: any, idx: number) => {
        const dateStr = new Date(entry.created_at).toLocaleString('vi-VN');
        const ext = entry.extracted_data || {};
        mdContent += `### Entry #${idx + 1} — ${dateStr}\n`;
        mdContent += `- **Trạng thái:** ${entry.status || 'draft'}\n`;
        mdContent += `- **Hạng mục:** ${ext.category || 'Chưa phân loại'}\n`;
        if (ext.confidence_score) {
          mdContent += `- **Độ tin cậy AI:** ${(ext.confidence_score * 100).toFixed(0)}%\n`;
        }
        mdContent += `\n**Nội dung ghi chép / Transcription:**\n`;
        mdContent += `> ${entry.transcription || 'Chưa có ghi chép'}\n\n`;

        if (ext.materials && ext.materials.length > 0) {
          mdContent += `**Vật tư sử dụng:**\n`;
          ext.materials.forEach((m: any) => {
            mdContent += `- ${m.item}: ${m.quantity || ''} ${m.unit || ''} ${m.note ? `(${m.note})` : ''}\n`;
          });
          mdContent += `\n`;
        }

        if (ext.labor && ext.labor.length > 0) {
          mdContent += `**Nhân công công trình:**\n`;
          ext.labor.forEach((l: any) => {
            mdContent += `- ${l.role}: ${l.count || 1} người ${l.hours ? `(${l.hours})` : ''} — ${l.note || ''}\n`;
          });
          mdContent += `\n`;
        }

        if (entry.photo_url) {
          mdContent += `**Hình ảnh:** ![Photo](${entry.photo_url})\n\n`;
        }

        if (entry.voice_url) {
          mdContent += `**Audio Voice Memo:** [Nghe file ghi âm](${entry.voice_url})\n\n`;
        }

        mdContent += `---\n\n`;
      });
    } else {
      mdContent += `*Chưa có nhật ký nào được lưu trữ.*\n`;
    }

    // 3. Upload to Google Drive
    let driveFileId = 'mock_drive_file_id';

    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY)) {
      let credentials;
      if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
        credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
      } else {
        credentials = {
          client_email: process.env.GOOGLE_CLIENT_EMAIL,
          private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
        };
      }

      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/drive.file']
      });

      const drive = google.drive({ version: 'v3', auth });

      const fileMetadata = {
        name: filename,
        parents: [folderId],
        mimeType: 'text/markdown'
      };

      const media = {
        mimeType: 'text/markdown',
        body: Readable.from([mdContent])
      };

      const file = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id'
      });

      driveFileId = file.data.id || 'drive_success';
    }

    // 4. Log to sync_logs table in Supabase
    const { data: logData } = await supabase.from('sync_logs').insert({
      entries_count: count,
      google_drive_file_id: driveFileId,
      status: 'success',
      synced_at: new Date().toISOString()
    }).select();

    return res.status(200).json({
      success: true,
      filename,
      entries_count: count,
      google_drive_file_id: driveFileId,
      log: logData ? logData[0] : null
    });
  } catch (error: any) {
    console.error('Sync API Error:', error);

    try {
      await supabase.from('sync_logs').insert({
        entries_count: 0,
        status: 'failed',
        error_message: error.message || 'Drive sync failed',
        synced_at: new Date().toISOString()
      });
    } catch (e) {
      console.error('Failed to log error to sync_logs table:', e);
    }

    return res.status(500).json({ error: error.message || 'Sync operation failed' });
  }
}
