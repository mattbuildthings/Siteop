-- New signups land as guests on a demo project; close the null-project hole
-- CRITICAL RULE: Additive-only. Never alter or drop existing tables, never touch
-- expense_* tables, and never change the `diary_entries` schema.
--
-- Replaces the 'pending' gate from 20260917 with something less hostile: a new
-- signup is immediately a read-only guest on one nominated demo project, rather
-- than staring at a "wait for approval" screen. Admins still get a list of new
-- accounts to act on, they just are not a blocker to someone looking around.
--
-- 'pending' stays in the role CHECK constraint. Nothing creates it any more, so
-- swapping the constraint again would be churn for no benefit, and leaving the
-- value accepted means an old row (if one ever appears) still satisfies it.
--
-- This also closes the hole that would have made the whole idea pointless:
-- siteop_can_see_project(NULL) returned TRUE, so "unassigned" meant "visible to
-- everyone" and a guest confined to the demo project could still read every
-- project-less record in the database. Verified on 2026-09-16 against a real
-- non-admin account: assigned to a project with zero logs, they could read all
-- 10 project-less entries and 3 to-dos.

-- ---------------------------------------------------------------------------
-- 1. Which project new signups land on.
--
-- A flag rather than a hardcoded UUID in the trigger, so the demo project can
-- be moved without a code change. The partial unique index enforces at most one
-- -- otherwise "the" default project becomes whichever row the planner happens
-- to return first.
-- ---------------------------------------------------------------------------

ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_guest_default BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS projects_single_guest_default
  ON projects (is_guest_default) WHERE is_guest_default;

-- This deployment's demo site: "Trịnh Hoài Đực (Test for Guest Viewing Only)".
-- Matched on code rather than UUID so the statement is readable and so a fresh
-- environment without that project simply updates nothing instead of failing.
UPDATE projects SET is_guest_default = true WHERE code = 'THD';

-- ---------------------------------------------------------------------------
-- 2. Which accounts still need an admin's decision.
--
-- Everyone now arrives as a guest, so role alone can no longer distinguish "new
-- signup nobody has looked at" from "deliberately a guest forever" (the client
-- or investor case). NULL reviewed_at means the former.
-- ---------------------------------------------------------------------------

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Everyone who already exists has plainly been dealt with; only genuinely new
-- signups should appear in the admin's list.
UPDATE user_profiles SET reviewed_at = now() WHERE reviewed_at IS NULL;

GRANT UPDATE (display_name, company) ON user_profiles TO authenticated;  -- unchanged; reviewed_at deliberately NOT grantable

-- ---------------------------------------------------------------------------
-- 3. Unassigned no longer means public.
--
-- The rest of the function is unchanged: admins see everything, members see
-- their own projects. Only the `p IS NULL OR` disjunct is removed, so a record
-- with no project is now visible to admins alone.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION siteop_can_see_project(p UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT siteop_is_manager()
      OR EXISTS (
           SELECT 1 FROM project_members m
           WHERE m.project_id = p AND m.user_id = auth.uid()
         );
$$;

-- A to-do with no entry has no project either, and therefore no scope. Nothing
-- in the app creates one (every row is generated from a flagged entry in
-- DigestRoute), and none exist, so requiring a visible entry closes the same
-- "unscoped means public" hole without removing a working feature.
DROP POLICY IF EXISTS "siteop_todo_select" ON todo_items;
CREATE POLICY "siteop_todo_select" ON todo_items
  FOR SELECT TO authenticated
  USING (entry_id IS NOT NULL AND siteop_can_see_entry(entry_id));

-- ---------------------------------------------------------------------------
-- 4. Give the demo project something to show.
--
-- The 10 seed logs have entry_meta rows with a NULL project_id. Moving them
-- onto the demo project means a guest lands on a populated diary instead of an
-- empty app, and leaves zero project-less records behind.
--
-- Deliberately does NOT renumber them. Their log numbers are the global-style
-- '#001'..'#010' rather than the per-project 'THD-001'; rewriting the number on
-- a contemporaneous record to make a listing tidier is not a trade worth making.
--
-- To undo: UPDATE entry_meta SET project_id = NULL WHERE project_id =
-- (SELECT id FROM projects WHERE code = 'THD') AND log_number LIKE '#%';
-- ---------------------------------------------------------------------------

UPDATE entry_meta
SET project_id = (SELECT id FROM projects WHERE code = 'THD')
WHERE project_id IS NULL
  AND EXISTS (SELECT 1 FROM projects WHERE code = 'THD');

-- ---------------------------------------------------------------------------
-- 5. Signup: guest, on the demo project, unreviewed.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION siteop_handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_default_project UUID;
BEGIN
  INSERT INTO user_profiles (user_id, display_name, role, reviewed_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1)),
    'guest',
    NULL
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Read-only access to the demo site. If no project is flagged, the signup
  -- still succeeds and simply sees nothing -- a missing demo project must not
  -- break account creation.
  SELECT id INTO v_default_project FROM projects WHERE is_guest_default LIMIT 1;

  IF v_default_project IS NOT NULL THEN
    INSERT INTO project_members (project_id, user_id)
    VALUES (v_default_project, NEW.id)
    ON CONFLICT (project_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Acting on an account marks it reviewed.
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
  SET role = p_role, reviewed_at = now()
  WHERE p.user_id = p_user_id
  RETURNING p.user_id, p.role;
END $$;

REVOKE ALL ON FUNCTION siteop_set_user_role(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION siteop_set_user_role(UUID, TEXT) TO authenticated;

/** "Keep them as a guest" -- clears the account off the admin's list without
    changing anything about what they can do. */
CREATE OR REPLACE FUNCTION siteop_mark_user_reviewed(p_user_id UUID)
RETURNS TABLE (user_id UUID, reviewed_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT siteop_is_admin() THEN
    RAISE EXCEPTION 'Only an admin can review accounts' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  UPDATE user_profiles p
  SET reviewed_at = now()
  WHERE p.user_id = p_user_id
  RETURNING p.user_id, p.reviewed_at;
END $$;

REVOKE ALL ON FUNCTION siteop_mark_user_reviewed(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION siteop_mark_user_reviewed(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Verification: after applying --
--   SELECT code, is_guest_default FROM projects;            -- exactly one true
--   SELECT COUNT(*) FROM entry_meta WHERE project_id IS NULL;  -- 0
--   SELECT role, reviewed_at IS NULL AS needs_review FROM user_profiles;
-- and, impersonating a guest, that they see the demo project and nothing else.
-- ---------------------------------------------------------------------------
