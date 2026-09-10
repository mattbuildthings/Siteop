import { supabase } from './supabase';
import { DiaryEntry, Project, UserProfile, UserRole } from './types';

/**
 * Role + project helpers.
 *
 * These mirror the SQL predicates in
 * supabase/migrations/20260909_projects_roles_and_entry_meta.sql. The database
 * is the enforcement point -- RLS policies and the lock triggers will reject a
 * forbidden write no matter what the client believes. These functions exist so
 * the UI can hide actions that would fail, not to make the decision.
 */

export const ROLE_RANK: Record<UserRole, number> = {
  admin: 5,
  superintendent: 4,
  foreman: 3,
  subcontractor: 2,
  viewer: 1
};

export function isManager(profile: UserProfile | null): boolean {
  if (!profile) return false;
  return profile.role === 'admin' || profile.role === 'superintendent';
}

export function isAdmin(profile: UserProfile | null): boolean {
  return profile?.role === 'admin';
}

export function canWrite(profile: UserProfile | null): boolean {
  return Boolean(profile) && profile!.role !== 'viewer';
}

export function isEntryLocked(entry: DiaryEntry): boolean {
  return Boolean(entry.entry_meta?.locked_at);
}

/** Locked logs are frozen for everyone but a manager -- that is the point of filing. */
export function canEditEntry(entry: DiaryEntry, profile: UserProfile | null, userId?: string): boolean {
  if (!canWrite(profile)) return false;
  if (isEntryLocked(entry)) return isManager(profile);
  return isManager(profile) || entry.created_by === userId;
}

export function canDeleteEntry(entry: DiaryEntry, profile: UserProfile | null, userId?: string): boolean {
  if (isAdmin(profile)) return true;
  if (isEntryLocked(entry)) return false;
  return canWrite(profile) && entry.created_by === userId;
}

export function canUnlockEntry(profile: UserProfile | null): boolean {
  return isManager(profile);
}

/** Fetches the signed-in user's profile, creating one if the signup trigger missed it. */
export async function fetchOrCreateProfile(userId: string, email?: string | null): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (!error && data) return data as UserProfile;

  const fallbackName = (email || '').split('@')[0] || 'Người dùng';
  const { data: inserted, error: insertErr } = await supabase
    .from('user_profiles')
    .insert({ user_id: userId, display_name: fallbackName, role: 'foreman' })
    .select()
    .maybeSingle();

  if (insertErr) {
    console.warn('Could not create user profile:', insertErr);
    return null;
  }

  return (inserted as UserProfile) ?? null;
}

export async function fetchAllProfiles(): Promise<Record<string, UserProfile>> {
  const { data, error } = await supabase.from('user_profiles').select('*');
  if (error || !data) return {};

  const byId: Record<string, UserProfile> = {};
  (data as UserProfile[]).forEach((p) => {
    byId[p.user_id] = p;
  });
  return byId;
}

/** RLS already limits this to projects the user may see. */
export async function fetchProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('is_active', { ascending: false })
    .order('name', { ascending: true });

  if (error) {
    console.warn('Could not load projects:', error);
    return [];
  }
  return (data as Project[]) || [];
}

const ACTIVE_PROJECT_KEY = 'siteop_active_project_v1';

/** A foreman works one site all day -- remember it so they never pick twice. */
export function getStoredProjectId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PROJECT_KEY);
  } catch {
    return null;
  }
}

export function storeProjectId(projectId: string | null): void {
  try {
    if (projectId) localStorage.setItem(ACTIVE_PROJECT_KEY, projectId);
    else localStorage.removeItem(ACTIVE_PROJECT_KEY);
  } catch {
    /* private mode / blocked storage -- the picker just won't be sticky */
  }
}

/**
 * Next log number for a site, scoped per project: "VH-014", not a global #014.
 * A number that restarts per site is the one people actually cite on the phone.
 */
export async function getNextLogNumber(project: Project | null): Promise<string> {
  const prefix = (project?.code || '').trim().toUpperCase();

  try {
    let query = supabase.from('entry_meta').select('log_number');
    query = project ? query.eq('project_id', project.id) : query.is('project_id', null);

    const { data, error } = await query;
    if (error || !data) return prefix ? `${prefix}-001` : '#001';

    let max = 0;
    for (const row of data as Array<{ log_number: string | null }>) {
      const match = row.log_number?.match(/(\d+)\s*$/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > max) max = n;
      }
    }

    const next = String(max + 1).padStart(3, '0');
    return prefix ? `${prefix}-${next}` : `#${next}`;
  } catch (err) {
    console.warn('Could not compute the next log number:', err);
    return prefix ? `${prefix}-001` : '#001';
  }
}

export function displayName(profile: UserProfile | null | undefined): string {
  if (!profile) return 'Không rõ';
  return profile.display_name || 'Không rõ';
}

export function initials(profile: UserProfile | null | undefined): string {
  const name = displayName(profile);
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** The access token API routes use so their Supabase writes run as this user. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
