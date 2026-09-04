export interface ExtractedData {
  job_number?: string;
  category: string;
  materials: Array<{
    item: string;
    quantity?: string;
    unit?: string;
    note?: string;
  }>;
  labor: Array<{
    role: string;
    count?: number;
    hours?: string;
    note?: string;
  }>;
  confidence_score: number; // 0.0 - 1.0
  summary_vi?: string;
  summary_bullet?: string;
  is_flagged?: boolean;
}

export type EntryStatus = 'draft' | 'filed' | 'archived';

export interface DiaryEntry {
  id: string;
  created_by?: string | null;
  created_at: string;
  voice_url?: string | null;
  photo_url?: string | null;
  transcription?: string | null;
  extracted_data?: ExtractedData | null;
  job_number?: string;
  status: EntryStatus;
  submitted_at?: string | null;
  // Transient/Joined fields
  is_pending_sync?: boolean;
  entry_flag?: EntryFlag | null;
  entry_flags?: EntryFlag[];
}

export interface EntryFlag {
  id: string;
  entry_id: string;
  summary_bullet: string;
  is_flagged: boolean;
  flag_reason?: string | null;
  created_at: string;
}

export interface DailyDigest {
  id: string;
  digest_date: string; // YYYY-MM-DD
  agenda_text: string;
  summary_text: string;
  entries_count: number;
  generated_at: string;
}

export interface TodoItem {
  id: string;
  entry_id?: string | null;
  job_number?: string | null;
  week_start: string; // YYYY-MM-DD, Monday of the ISO week
  text: string;
  due_date?: string | null;
  sort_order: number;
  is_done: boolean;
  dismissed: boolean;
  created_at: string;
}

export interface SyncLog {
  id: string;
  synced_at: string;
  entries_count: number;
  google_drive_file_id?: string | null;
  status: 'success' | 'failed' | 'partial';
  error_message?: string | null;
}

export interface OfflineEntry {
  id: string;
  createdAt: string;
  voiceBlobBase64?: string;
  photoBlobBase64?: string;
  audioMimeType?: string;
  photoMimeType?: string;
  retryCount: number;
  jobNumber?: string;
}
