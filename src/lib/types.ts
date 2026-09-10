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
  confidence_score?: number; // 0.0 - 1.0 — model self-report, not shown in the UI
  summary_vi?: string;
  summary_bullet?: string;
  is_flagged?: boolean;
}

export type EntryStatus = 'draft' | 'filed' | 'archived' | 'error';

// Roles, strongest first. Kept in sync with siteop_role() in
// supabase/migrations/20260909_projects_roles_and_entry_meta.sql.
export type UserRole = 'admin' | 'superintendent' | 'foreman' | 'subcontractor' | 'viewer';

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Quản trị',
  superintendent: 'Chỉ huy trưởng',
  foreman: 'Đội trưởng',
  subcontractor: 'Nhà thầu phụ',
  viewer: 'Chỉ xem'
};

export interface UserProfile {
  user_id: string;
  display_name?: string | null;
  company?: string | null;
  role: UserRole;
  created_at?: string;
}

export interface Project {
  id: string;
  name: string;
  code?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  client_name?: string | null;
  is_active: boolean;
  created_by?: string | null;
  created_at?: string;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  created_at?: string;
}

export interface Weather {
  temp_c?: number | null;
  precip_mm?: number | null;
  wind_kph?: number | null;
  code?: number | null;
  label_vi?: string;
  label_en?: string;
  source?: string;
  fetched_at?: string;
}

export interface EntryMeta {
  entry_id: string;
  project_id?: string | null;
  log_number?: string | null;
  work_date?: string | null; // YYYY-MM-DD
  weather?: Weather | null;
  locked_at?: string | null;
  locked_by?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  created_at?: string;
}

export interface EntryPhoto {
  id: string;
  entry_id: string;
  photo_url: string;
  caption?: string | null;
  sort_order: number;
  taken_at?: string | null;
  created_at?: string;
}

export interface EntryRevision {
  id: string;
  entry_id: string;
  changed_by?: string | null;
  action: 'filed' | 'unlocked' | 'amended';
  note?: string | null;
  created_at: string;
}

export interface DiaryEntry {
  id: string;
  created_by?: string | null;
  created_at: string;
  voice_url?: string | null;
  photo_url?: string | null; // cover photo; the full set lives in entry_photos
  transcription?: string | null;
  extracted_data?: ExtractedData | null;
  job_number?: string;
  status: EntryStatus;
  submitted_at?: string | null;
  // Transient/Joined fields
  is_pending_sync?: boolean;
  entry_flag?: EntryFlag | null;
  entry_flags?: EntryFlag[];
  entry_meta?: EntryMeta | null;
  entry_photos?: EntryPhoto[];
  author?: UserProfile | null;
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
  project_id?: string | null;
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
  /** Multiple photos per entry — index 0 becomes the cover photo. */
  photoBlobsBase64?: string[];
  audioMimeType?: string;
  photoMimeType?: string;
  retryCount: number;
  jobNumber?: string;
  projectId?: string | null;
  workDate?: string | null;
  weather?: Weather | null;
  transcription?: string | null;
  extractedData?: ExtractedData | null;
}
