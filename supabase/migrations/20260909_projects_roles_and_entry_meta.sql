-- Additive Migration for Siteop — Field Ops Tier 1
-- CRITICAL RULE: Additive-only. Never alter or drop existing tables, never touch
-- expense_* tables, and never change the `diary_entries` COLUMN schema.
--
-- Everything that would otherwise have been a new column on diary_entries
-- (project, weather, work date, lock state, review state) lives in the
-- `entry_meta` side table instead, keyed 1:1 by entry_id. Extra photos live in
-- `entry_photos`. diary_entries.photo_url still holds the cover photo so any
-- other reader of that table keeps working unchanged.
--
-- RLS POLICIES (not schema) on diary_entries and the other Siteop tables ARE
-- replaced here: the previous policies were `USING (true)` for `authenticated,
-- anon`, meaning any visitor could read, edit and delete every site's records.
-- That is the thing this migration exists to fix.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT,                                  -- short site code, prefixes log numbers (e.g. VH-014)
  address TEXT,
  latitude DOUBLE PRECISION,                  -- used for the automatic weather stamp
  longitude DOUBLE PRECISION,
  client_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users (id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Role per user. Roles, strongest first:
--   admin          — everything, including unlocking filed logs and hard deletes
--   superintendent — all projects, can approve/unlock
--   foreman        — create + edit own logs on projects they are a member of
--   subcontractor  — create + see only their own logs
--   viewer         — read-only (owner, architect, lender)
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name TEXT,
  company TEXT,
  role TEXT NOT NULL DEFAULT 'foreman',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (project_id, user_id)
);

-- 1:1 side table for diary_entries. See header note on why this is not columns.
CREATE TABLE IF NOT EXISTS entry_meta (
  entry_id UUID PRIMARY KEY REFERENCES diary_entries (id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects (id) ON DELETE SET NULL,
  log_number TEXT,                            -- per-project sequential, e.g. "VH-014"
  work_date DATE,                             -- when the work happened (may differ from created_at)
  weather JSONB,                              -- { temp_c, precip_mm, wind_kph, code, label_vi, label_en, source, fetched_at }
  locked_at TIMESTAMP WITH TIME ZONE,         -- set on file/submit; makes the record immutable
  locked_by UUID REFERENCES auth.users (id),
  reviewed_at TIMESTAMP WITH TIME ZONE,       -- human confirmed the AI extraction
  reviewed_by UUID REFERENCES auth.users (id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entry_meta_project_idx ON entry_meta (project_id);
CREATE INDEX IF NOT EXISTS entry_meta_work_date_idx ON entry_meta (work_date);

CREATE TABLE IF NOT EXISTS entry_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES diary_entries (id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  caption TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  taken_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entry_photos_entry_idx ON entry_photos (entry_id, sort_order);

-- Append-only audit trail. A locked entry is never edited in place; a manager
-- unlocking or amending one writes a row here so the original stays accountable.
CREATE TABLE IF NOT EXISTS entry_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES diary_entries (id) ON DELETE CASCADE,
  changed_by UUID REFERENCES auth.users (id),
  action TEXT NOT NULL,                       -- filed | unlocked | amended
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entry_revisions_entry_idx ON entry_revisions (entry_id, created_at DESC);

-- Per-project daily digest. daily_digests is UNIQUE(digest_date) with no project
-- column and must not be altered, so per-site digests get their own table.
CREATE TABLE IF NOT EXISTS project_digests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  digest_date DATE NOT NULL,
  agenda_text TEXT,
  summary_text TEXT,
  entries_count INT,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (project_id, digest_date)
);

-- ---------------------------------------------------------------------------
-- 2. Role helpers (SECURITY DEFINER so policies can read user_profiles
--    without recursing through user_profiles' own RLS)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION siteop_role()
RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT p.role FROM user_profiles p WHERE p.user_id = auth.uid()), 'foreman');
$$;

-- Manager = can see every project, approve, unlock and hard delete.
CREATE OR REPLACE FUNCTION siteop_is_manager()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT siteop_role() IN ('admin', 'superintendent');
$$;

CREATE OR REPLACE FUNCTION siteop_is_admin()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT siteop_role() = 'admin';
$$;

-- Viewers never write anything.
CREATE OR REPLACE FUNCTION siteop_can_write()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND siteop_role() <> 'viewer';
$$;

CREATE OR REPLACE FUNCTION siteop_can_see_project(p UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p IS NULL
      OR siteop_is_manager()
      OR EXISTS (
           SELECT 1 FROM project_members m
           WHERE m.project_id = p AND m.user_id = auth.uid()
         );
$$;

CREATE OR REPLACE FUNCTION siteop_can_see_entry(e UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT siteop_is_manager()
      OR EXISTS (
           SELECT 1 FROM diary_entries d
           WHERE d.id = e
             AND (
               d.created_by = auth.uid()
               OR siteop_can_see_project((SELECT em.project_id FROM entry_meta em WHERE em.entry_id = d.id))
             )
         );
$$;

-- ---------------------------------------------------------------------------
-- 3. Profile bootstrap — every signup gets a profile row.
--    The very first account to sign up becomes the admin.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION siteop_handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  is_first BOOLEAN;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM user_profiles) INTO is_first;

  INSERT INTO user_profiles (user_id, display_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1)),
    CASE WHEN is_first THEN 'admin' ELSE 'foreman' END
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS siteop_on_auth_user_created ON auth.users;
CREATE TRIGGER siteop_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION siteop_handle_new_user();

-- Backfill profiles for accounts that already exist.
INSERT INTO user_profiles (user_id, display_name, role)
SELECT u.id, split_part(u.email, '@', 1), 'foreman'
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM user_profiles p WHERE p.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;

-- If nobody is an admin yet, promote the oldest account so the install is usable.
UPDATE user_profiles
SET role = 'admin'
WHERE user_id = (
  SELECT p.user_id FROM user_profiles p
  JOIN auth.users u ON u.id = p.user_id
  ORDER BY u.created_at ASC
  LIMIT 1
)
AND NOT EXISTS (SELECT 1 FROM user_profiles WHERE role = 'admin');

-- ---------------------------------------------------------------------------
-- 4. Immutability — a filed log is a contemporaneous record.
--    Once entry_meta.locked_at is set, the entry and its attachments are
--    frozen for everyone except a manager, and only a manager can unlock.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION siteop_entry_is_locked(e UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM entry_meta em WHERE em.entry_id = e AND em.locked_at IS NOT NULL);
$$;

CREATE OR REPLACE FUNCTION siteop_guard_locked_entry()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  target UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target := OLD.id;
  ELSE
    target := NEW.id;
  END IF;

  IF siteop_entry_is_locked(target) AND NOT siteop_is_manager() THEN
    RAISE EXCEPTION 'Nhật ký đã khóa (entry is filed and locked) — chỉ quản lý mới sửa/mở khóa được';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS siteop_guard_diary_entries ON diary_entries;
CREATE TRIGGER siteop_guard_diary_entries
  BEFORE UPDATE OR DELETE ON diary_entries
  FOR EACH ROW EXECUTE FUNCTION siteop_guard_locked_entry();

-- Unlocking (locked_at NOT NULL -> NULL) is manager-only, and every lock state
-- change is written to entry_revisions.
CREATE OR REPLACE FUNCTION siteop_guard_entry_meta_lock()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL AND NEW.locked_at IS NULL THEN
    IF NOT siteop_is_manager() THEN
      RAISE EXCEPTION 'Chỉ quản lý mới mở khóa được nhật ký (only a manager can unlock a filed log)';
    END IF;
    INSERT INTO entry_revisions (entry_id, changed_by, action, note)
    VALUES (OLD.entry_id, auth.uid(), 'unlocked', 'Mở khóa nhật ký đã lưu kho');

  ELSIF OLD.locked_at IS NOT NULL AND NEW.locked_at IS NOT NULL AND NOT siteop_is_manager() THEN
    RAISE EXCEPTION 'Nhật ký đã khóa (entry is filed and locked)';

  ELSIF OLD.locked_at IS NULL AND NEW.locked_at IS NOT NULL THEN
    INSERT INTO entry_revisions (entry_id, changed_by, action, note)
    VALUES (NEW.entry_id, auth.uid(), 'filed', 'Lưu kho & khóa nhật ký');
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS siteop_guard_entry_meta ON entry_meta;
CREATE TRIGGER siteop_guard_entry_meta
  BEFORE UPDATE ON entry_meta
  FOR EACH ROW EXECUTE FUNCTION siteop_guard_entry_meta_lock();

-- The capture flow inserts entry_meta already locked (so there is no window in
-- which a filed entry is still mutable). That INSERT never reaches the BEFORE
-- UPDATE trigger above, so the audit trail needs its own insert-side hook --
-- otherwise a log filed straight from capture has no "filed" revision at all.
CREATE OR REPLACE FUNCTION siteop_log_entry_meta_insert()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.locked_at IS NOT NULL THEN
    INSERT INTO entry_revisions (entry_id, changed_by, action, note)
    VALUES (NEW.entry_id, auth.uid(), 'filed', 'Lưu kho & khóa ngay khi ghi nhận');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS siteop_log_entry_meta_insert ON entry_meta;
CREATE TRIGGER siteop_log_entry_meta_insert
  AFTER INSERT ON entry_meta
  FOR EACH ROW EXECUTE FUNCTION siteop_log_entry_meta_insert();

-- ---------------------------------------------------------------------------
-- 5. Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE entry_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE entry_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE entry_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_digests ENABLE ROW LEVEL SECURITY;

-- --- Replace the old permissive policies -----------------------------------
DROP POLICY IF EXISTS "Authenticated users can manage diary_entries" ON diary_entries;
DROP POLICY IF EXISTS "Authenticated users can manage sync_logs" ON sync_logs;
DROP POLICY IF EXISTS "Allow authenticated and anon access on entry_flags" ON entry_flags;
DROP POLICY IF EXISTS "Allow authenticated and anon access on daily_digests" ON daily_digests;
DROP POLICY IF EXISTS "Allow authenticated and anon access on todo_items" ON todo_items;
DROP POLICY IF EXISTS "Allow authenticated and anon access on diary-assets" ON storage.objects;

-- --- user_profiles ----------------------------------------------------------
DROP POLICY IF EXISTS "siteop_profiles_select" ON user_profiles;
CREATE POLICY "siteop_profiles_select" ON user_profiles
  FOR SELECT TO authenticated USING (true);          -- author names must be readable

DROP POLICY IF EXISTS "siteop_profiles_insert_self" ON user_profiles;
CREATE POLICY "siteop_profiles_insert_self" ON user_profiles
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "siteop_profiles_update" ON user_profiles;
CREATE POLICY "siteop_profiles_update" ON user_profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR siteop_is_admin())
  WITH CHECK (user_id = auth.uid() OR siteop_is_admin());

DROP POLICY IF EXISTS "siteop_profiles_delete" ON user_profiles;
CREATE POLICY "siteop_profiles_delete" ON user_profiles
  FOR DELETE TO authenticated USING (siteop_is_admin());

-- --- projects ---------------------------------------------------------------
DROP POLICY IF EXISTS "siteop_projects_select" ON projects;
CREATE POLICY "siteop_projects_select" ON projects
  FOR SELECT TO authenticated USING (siteop_can_see_project(id));

DROP POLICY IF EXISTS "siteop_projects_write" ON projects;
CREATE POLICY "siteop_projects_write" ON projects
  FOR ALL TO authenticated
  USING (siteop_is_manager()) WITH CHECK (siteop_is_manager());

-- --- project_members --------------------------------------------------------
DROP POLICY IF EXISTS "siteop_members_select" ON project_members;
CREATE POLICY "siteop_members_select" ON project_members
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR siteop_can_see_project(project_id));

DROP POLICY IF EXISTS "siteop_members_write" ON project_members;
CREATE POLICY "siteop_members_write" ON project_members
  FOR ALL TO authenticated
  USING (siteop_is_manager()) WITH CHECK (siteop_is_manager());

-- --- diary_entries ----------------------------------------------------------
DROP POLICY IF EXISTS "siteop_entries_select" ON diary_entries;
CREATE POLICY "siteop_entries_select" ON diary_entries
  FOR SELECT TO authenticated
  USING (
    siteop_is_manager()
    OR created_by = auth.uid()
    OR siteop_can_see_project((SELECT em.project_id FROM entry_meta em WHERE em.entry_id = diary_entries.id))
  );

DROP POLICY IF EXISTS "siteop_entries_insert" ON diary_entries;
CREATE POLICY "siteop_entries_insert" ON diary_entries
  FOR INSERT TO authenticated
  WITH CHECK (siteop_can_write() AND (created_by = auth.uid() OR created_by IS NULL));

DROP POLICY IF EXISTS "siteop_entries_update" ON diary_entries;
CREATE POLICY "siteop_entries_update" ON diary_entries
  FOR UPDATE TO authenticated
  USING (siteop_is_manager() OR (siteop_can_write() AND created_by = auth.uid()))
  WITH CHECK (siteop_is_manager() OR (siteop_can_write() AND created_by = auth.uid()));

-- Deleting is deliberately narrow: your own, still-unlocked entry, or an admin.
DROP POLICY IF EXISTS "siteop_entries_delete" ON diary_entries;
CREATE POLICY "siteop_entries_delete" ON diary_entries
  FOR DELETE TO authenticated
  USING (siteop_is_admin() OR (created_by = auth.uid() AND NOT siteop_entry_is_locked(id)));

-- --- entry_meta / entry_photos / entry_flags / entry_revisions ---------------
DROP POLICY IF EXISTS "siteop_entry_meta_select" ON entry_meta;
CREATE POLICY "siteop_entry_meta_select" ON entry_meta
  FOR SELECT TO authenticated USING (siteop_can_see_entry(entry_id));

DROP POLICY IF EXISTS "siteop_entry_meta_write" ON entry_meta;
CREATE POLICY "siteop_entry_meta_write" ON entry_meta
  FOR ALL TO authenticated
  USING (siteop_can_write() AND siteop_can_see_entry(entry_id))
  WITH CHECK (siteop_can_write() AND siteop_can_see_entry(entry_id));

DROP POLICY IF EXISTS "siteop_entry_photos_select" ON entry_photos;
CREATE POLICY "siteop_entry_photos_select" ON entry_photos
  FOR SELECT TO authenticated USING (siteop_can_see_entry(entry_id));

DROP POLICY IF EXISTS "siteop_entry_photos_write" ON entry_photos;
CREATE POLICY "siteop_entry_photos_write" ON entry_photos
  FOR ALL TO authenticated
  USING (siteop_can_write() AND siteop_can_see_entry(entry_id))
  WITH CHECK (siteop_can_write() AND siteop_can_see_entry(entry_id));

DROP POLICY IF EXISTS "siteop_entry_flags_select" ON entry_flags;
CREATE POLICY "siteop_entry_flags_select" ON entry_flags
  FOR SELECT TO authenticated USING (siteop_can_see_entry(entry_id));

DROP POLICY IF EXISTS "siteop_entry_flags_write" ON entry_flags;
CREATE POLICY "siteop_entry_flags_write" ON entry_flags
  FOR ALL TO authenticated
  USING (siteop_can_write()) WITH CHECK (siteop_can_write());

-- Audit trail is readable and append-only; nobody edits or deletes history.
DROP POLICY IF EXISTS "siteop_entry_revisions_select" ON entry_revisions;
CREATE POLICY "siteop_entry_revisions_select" ON entry_revisions
  FOR SELECT TO authenticated USING (siteop_can_see_entry(entry_id));

DROP POLICY IF EXISTS "siteop_entry_revisions_insert" ON entry_revisions;
CREATE POLICY "siteop_entry_revisions_insert" ON entry_revisions
  FOR INSERT TO authenticated WITH CHECK (siteop_can_write());

-- --- digests / todos / sync logs --------------------------------------------
DROP POLICY IF EXISTS "siteop_daily_digests_select" ON daily_digests;
CREATE POLICY "siteop_daily_digests_select" ON daily_digests
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "siteop_daily_digests_write" ON daily_digests;
CREATE POLICY "siteop_daily_digests_write" ON daily_digests
  FOR ALL TO authenticated USING (siteop_can_write()) WITH CHECK (siteop_can_write());

DROP POLICY IF EXISTS "siteop_project_digests_select" ON project_digests;
CREATE POLICY "siteop_project_digests_select" ON project_digests
  FOR SELECT TO authenticated USING (siteop_can_see_project(project_id));

DROP POLICY IF EXISTS "siteop_project_digests_write" ON project_digests;
CREATE POLICY "siteop_project_digests_write" ON project_digests
  FOR ALL TO authenticated
  USING (siteop_can_write() AND siteop_can_see_project(project_id))
  WITH CHECK (siteop_can_write() AND siteop_can_see_project(project_id));

DROP POLICY IF EXISTS "siteop_todo_select" ON todo_items;
CREATE POLICY "siteop_todo_select" ON todo_items
  FOR SELECT TO authenticated
  USING (entry_id IS NULL OR siteop_can_see_entry(entry_id));

DROP POLICY IF EXISTS "siteop_todo_write" ON todo_items;
CREATE POLICY "siteop_todo_write" ON todo_items
  FOR ALL TO authenticated USING (siteop_can_write()) WITH CHECK (siteop_can_write());

DROP POLICY IF EXISTS "siteop_sync_logs_select" ON sync_logs;
CREATE POLICY "siteop_sync_logs_select" ON sync_logs
  FOR SELECT TO authenticated USING (siteop_is_manager());

DROP POLICY IF EXISTS "siteop_sync_logs_write" ON sync_logs;
CREATE POLICY "siteop_sync_logs_write" ON sync_logs
  FOR ALL TO authenticated USING (siteop_is_manager()) WITH CHECK (siteop_is_manager());

-- --- storage: diary-assets ---------------------------------------------------
-- Bucket stays public-read (photos are rendered by <img src> and embedded in
-- exported reports), but writing/removing now requires a signed-in non-viewer.
DROP POLICY IF EXISTS "siteop_diary_assets_read" ON storage.objects;
CREATE POLICY "siteop_diary_assets_read" ON storage.objects
  FOR SELECT TO authenticated, anon USING (bucket_id = 'diary-assets');

DROP POLICY IF EXISTS "siteop_diary_assets_insert" ON storage.objects;
CREATE POLICY "siteop_diary_assets_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'diary-assets' AND siteop_can_write());

DROP POLICY IF EXISTS "siteop_diary_assets_update" ON storage.objects;
CREATE POLICY "siteop_diary_assets_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'diary-assets' AND siteop_can_write())
  WITH CHECK (bucket_id = 'diary-assets' AND siteop_can_write());

DROP POLICY IF EXISTS "siteop_diary_assets_delete" ON storage.objects;
CREATE POLICY "siteop_diary_assets_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'diary-assets' AND siteop_can_write());

-- ---------------------------------------------------------------------------
-- 6. Backfill: give existing entries a meta row so joins are uniform.
-- ---------------------------------------------------------------------------

INSERT INTO entry_meta (entry_id, work_date, log_number)
SELECT d.id,
       (d.created_at AT TIME ZONE 'UTC')::date,
       d.extracted_data ->> 'job_number'
FROM diary_entries d
WHERE NOT EXISTS (SELECT 1 FROM entry_meta em WHERE em.entry_id = d.id)
ON CONFLICT (entry_id) DO NOTHING;

-- Existing single photos become the first row of the new photo gallery.
INSERT INTO entry_photos (entry_id, photo_url, sort_order, taken_at)
SELECT d.id, d.photo_url, 0, d.created_at
FROM diary_entries d
WHERE d.photo_url IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM entry_photos ep WHERE ep.entry_id = d.id);
