-- Signup approval, tamper-proof role assignment, admin-only project membership
-- CRITICAL RULE: Additive-only. Never alter or drop existing tables, never touch
-- expense_* tables, and never change the `diary_entries` schema.
--
-- Three problems this closes, in order of severity.
--
-- 1. ANY SIGNED-IN USER COULD MAKE THEMSELVES ADMIN.
--    `siteop_profiles_update` (20260909) is USING (user_id = auth.uid() OR
--    siteop_is_admin()). Postgres row-level security is row-level, not
--    column-level: "you may edit your own profile row" therefore also means
--    "you may set your own role column to admin". One direct PostgREST request,
--    no app involved. Any approval process built on top of that would have been
--    decoration, so this is fixed first.
--
-- 2. EVERY NEW SIGNUP BECAME A FULL ADMIN.
--    20260911 deliberately traded default-restrictive for default-usable while
--    the team was two people. With the app reachable on the public internet
--    that means anyone who finds the signup page gets admin over every project.
--    New accounts now land as 'pending' and see nothing until an admin approves
--    them.
--
-- 3. NOBODY COULD BE ADDED TO A PROJECT.
--    project_members rows were only ever written for a project's own creator
--    (ProjectsRoute.tsx), so a non-admin could never be given access to a site.
--    The write policy already restricts this table to admins; what was missing
--    was any UI, which ships alongside this migration.
--
-- The role column keeps its existing three values and gains a fourth,
-- 'pending'. 'guest' is retained deliberately: read-only access for a client or
-- investor who should see the diary and never write to it.

-- ---------------------------------------------------------------------------
-- 1. 'pending' role.
--
-- The CHECK constraint is dropped and recreated rather than added, because
-- 20260911 already created one with three values. This changes a constraint,
-- not the table's shape, and follows the precedent that migration set.
-- ---------------------------------------------------------------------------

ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_role_check CHECK (role IN ('admin', 'user', 'guest', 'pending'));

-- New rows land unapproved. Combined with the column grants in section 3, this
-- default is the ONLY way role gets set on insert -- a client cannot name it.
ALTER TABLE user_profiles ALTER COLUMN role SET DEFAULT 'pending';

-- Existing users are untouched on purpose: nobody currently signed in should be
-- logged out of their own app by this migration.

-- ---------------------------------------------------------------------------
-- 2. Role helpers. Same names as 20260909/20260911 -- every RLS policy calls
--    these, so the bodies change and the call sites do not.
-- ---------------------------------------------------------------------------

-- Default is now 'pending', not 'user'. A missing profile row used to COALESCE
-- into write access; it now fails closed.
CREATE OR REPLACE FUNCTION siteop_role()
RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT p.role FROM user_profiles p WHERE p.user_id = auth.uid()), 'pending');
$$;

-- Explicit allow-list. 'pending' is not 'guest', so the previous
-- `role <> 'guest'` test would have handed every unapproved signup write access
-- -- exactly the hole this migration exists to close.
CREATE OR REPLACE FUNCTION siteop_can_write()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND siteop_role() IN ('admin', 'user');
$$;

/** True once an admin has approved this account. Used by the client to decide
    between the app and the "awaiting approval" screen. */
CREATE OR REPLACE FUNCTION siteop_is_approved()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT siteop_role() IN ('admin', 'user', 'guest');
$$;

-- ---------------------------------------------------------------------------
-- 3. Lock the role column.
--
-- A column-level REVOKE cannot subtract from a table-level grant in Postgres --
-- table-level UPDATE covers every column. The privilege has to be revoked
-- wholesale and re-granted per column, which is what this does. After it,
-- `UPDATE user_profiles SET role = 'admin'` fails for every ordinary client
-- regardless of RLS, and role can only move through the function in section 4.
-- ---------------------------------------------------------------------------

REVOKE UPDATE ON user_profiles FROM authenticated, anon;
GRANT UPDATE (display_name, company) ON user_profiles TO authenticated;

REVOKE INSERT ON user_profiles FROM authenticated, anon;
GRANT INSERT (user_id, display_name, company) ON user_profiles TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. The one way to change a role.
--
-- SECURITY DEFINER, so it runs as the owner and is unaffected by the column
-- grants above. Admin-only, and it refuses to remove the last admin -- without
-- that guard a single mis-click makes the app unadministrable and the only way
-- back is the Supabase SQL editor.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION siteop_set_user_role(p_user_id UUID, p_role TEXT)
RETURNS TABLE (user_id UUID, role TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_current_role TEXT;
  v_admin_count  INTEGER;
BEGIN
  IF NOT siteop_is_admin() THEN
    RAISE EXCEPTION 'Only an admin can change roles' USING ERRCODE = '42501';
  END IF;

  IF p_role NOT IN ('admin', 'user', 'guest', 'pending') THEN
    RAISE EXCEPTION 'Unknown role: %', p_role USING ERRCODE = '22023';
  END IF;

  SELECT p.role INTO v_current_role FROM user_profiles p WHERE p.user_id = p_user_id;

  IF v_current_role IS NULL THEN
    RAISE EXCEPTION 'No such user profile' USING ERRCODE = 'P0002';
  END IF;

  -- Last-admin guard. Counted inside the same statement as the update below
  -- would be racy across two concurrent demotions, so the row is locked first.
  IF v_current_role = 'admin' AND p_role <> 'admin' THEN
    -- Lock the admin rows first, then count them. `SELECT COUNT(*) ... FOR
    -- UPDATE` is rejected by Postgres (no row locking with aggregates), and
    -- counting without the lock lets two concurrent demotions each see two
    -- admins and both succeed, leaving zero.
    PERFORM 1 FROM user_profiles p WHERE p.role = 'admin' FOR UPDATE;

    SELECT COUNT(*) INTO v_admin_count FROM user_profiles p WHERE p.role = 'admin';

    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'Cannot remove the last admin -- promote someone else first'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN QUERY
  UPDATE user_profiles p
  SET role = p_role
  WHERE p.user_id = p_user_id
  RETURNING p.user_id, p.role;
END $$;

REVOKE ALL ON FUNCTION siteop_set_user_role(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION siteop_set_user_role(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. New signups start unapproved.
--
-- Both halves of this matter: this trigger AND the client-side fallback in
-- src/lib/session.ts (fetchOrCreateProfile) used to write role 'admin'. Fixing
-- only one of them leaves the other still minting admins.
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
    'pending'
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Project membership stays admin-only.
--
-- siteop_members_write (20260909) is already USING/WITH CHECK
-- siteop_is_manager(), i.e. admin, so no policy change is needed -- restated
-- here only so the intent is visible in the migration that ships the UI for it.
-- A 'user' sees exactly the projects they have a project_members row for and
-- cannot add themselves to another one.
-- ---------------------------------------------------------------------------

-- Faster membership lookups now that this table is actually used.
CREATE INDEX IF NOT EXISTS project_members_user_idx ON project_members (user_id);

-- ---------------------------------------------------------------------------
-- Verification: run after applying.
--
-- As an ORDINARY user (not admin) -- both must fail:
--   UPDATE user_profiles SET role = 'admin' WHERE user_id = auth.uid();
--   SELECT * FROM siteop_set_user_role(auth.uid(), 'admin');
--
-- As an admin:
--   SELECT * FROM siteop_set_user_role('<some-user-uuid>', 'user');   -- works
--   SELECT * FROM siteop_set_user_role('<last-admin-uuid>', 'user');  -- refused
--
-- Confirm nobody was demoted by this migration:
--   SELECT role, COUNT(*) FROM user_profiles GROUP BY role;
-- ---------------------------------------------------------------------------
