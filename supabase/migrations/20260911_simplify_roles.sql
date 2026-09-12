-- Corrective Migration for Siteop — simplify to 3 roles, default new signups to admin
-- CRITICAL RULE: Additive-only. Never alter or drop existing tables, never touch
-- expense_* tables, and never change the `diary_entries` schema.
--
-- The 5-tier model (admin/superintendent/foreman/subcontractor/viewer) from
-- 20260909 was more than this team needs, and its "first signup only" admin
-- rule meant every later signup landed as foreman (Đội trưởng) -- which
-- cannot create a project, so a brand-new team member hit a dead end trying
-- to capture a log with nowhere to put it.
--
-- New model, 3 roles:
--   admin — everything: manage projects, manage user roles, see every
--           project, file/unlock/delete any entry, export/sync
--   user  — normal field work: create + edit own entries, file/lock own
--           entries, see projects they belong to. Cannot manage projects,
--           users, or other people's filed entries.
--   guest — read-only on whatever projects they belong to. Cannot write
--           anything.
--
-- Every new signup now becomes admin (not just the first one). For a small
-- team this trades default-restrictive for default-usable: nobody hits a
-- wall for lacking a role, and an existing admin dials a given person back
-- to `user` or `guest` from the team panel (Công Trình tab) when that's the
-- right fit for them.

-- ---------------------------------------------------------------------------
-- 1. Remap existing rows to the new 3 values.
-- ---------------------------------------------------------------------------

UPDATE user_profiles
SET role = CASE
  WHEN role IN ('admin', 'superintendent') THEN 'admin'
  WHEN role IN ('foreman', 'subcontractor') THEN 'user'
  WHEN role = 'viewer' THEN 'guest'
  ELSE role
END
WHERE role IN ('admin', 'superintendent', 'foreman', 'subcontractor', 'viewer');

-- Guard going forward -- catches a typo'd role value at write time instead of
-- silently falling through siteop_role()'s COALESCE default.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_role_check'
  ) THEN
    ALTER TABLE user_profiles
      ADD CONSTRAINT user_profiles_role_check CHECK (role IN ('admin', 'user', 'guest'));
  END IF;
END $$;

ALTER TABLE user_profiles ALTER COLUMN role SET DEFAULT 'user';

-- ---------------------------------------------------------------------------
-- 2. Role helpers -- same function names as 20260909 (every RLS policy calls
--    these), bodies updated for the 3-role model.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION siteop_role()
RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT p.role FROM user_profiles p WHERE p.user_id = auth.uid()), 'user');
$$;

-- No more separate superintendent tier -- manager and admin are now the same
-- check. Left as two functions (rather than collapsing call sites) so no RLS
-- policy body needs to change.
CREATE OR REPLACE FUNCTION siteop_is_manager()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT siteop_role() = 'admin';
$$;

CREATE OR REPLACE FUNCTION siteop_can_write()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND siteop_role() <> 'guest';
$$;

-- ---------------------------------------------------------------------------
-- 3. Every new signup becomes admin -- not just the first one.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION siteop_handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO user_profiles (user_id, display_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1)),
    'admin'
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END $$;
-- Trigger itself (siteop_on_auth_user_created) is unchanged from 20260909 --
-- CREATE OR REPLACE FUNCTION above is enough, no need to redeclare it.
