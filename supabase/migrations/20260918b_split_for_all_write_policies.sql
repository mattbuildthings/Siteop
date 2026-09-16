-- Stop write policies from granting cross-project reads
-- CRITICAL RULE: Additive-only. Never alter or drop existing tables, never touch
-- expense_* tables, and never change the `diary_entries` schema.
--
-- `CREATE POLICY ... FOR ALL` applies its USING clause to SELECT as well as to
-- UPDATE/DELETE, and multiple permissive policies on a table are OR'd together.
-- So a broad "can this person write here?" policy silently becomes an equally
-- broad "can this person read everything here?" policy, overriding whatever the
-- carefully scoped SELECT policy next to it says.
--
-- Three tables were affected:
--
--   todo_items    siteop_todo_write USING (siteop_can_write())
--   entry_flags   siteop_entry_flags_write USING (siteop_can_write())
--   daily_digests siteop_daily_digests_write USING (siteop_can_write())
--
-- In each case siteop_todo_select and friends were doing nothing at all: any
-- non-guest could read every row regardless of project.
--
-- Caught on 2026-09-16 while verifying the previous migration. After closing the
-- null-project hole, a 'user' assigned to one empty project correctly saw 0
-- diary entries -- but still saw all 3 to-dos, which belong to a project they
-- are not a member of. The to-do SELECT policy was correct; siteop_todo_write
-- was overriding it.
--
-- The fix is to state the write policies per command so they stop applying to
-- SELECT, and to scope them to records the person can actually see, so they
-- cannot edit another site's rows either.
--
-- The other FOR ALL policies (entry_meta, entry_photos, project_digests,
-- projects, project_members, sync_logs) are left alone: their USING clauses are
-- already at least as narrow as the matching SELECT policy, so OR-ing them in
-- widens nothing.

-- ---------------------------------------------------------------------------
-- todo_items
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "siteop_todo_write" ON todo_items;

CREATE POLICY "siteop_todo_insert" ON todo_items
  FOR INSERT TO authenticated
  WITH CHECK (siteop_can_write() AND entry_id IS NOT NULL AND siteop_can_see_entry(entry_id));

CREATE POLICY "siteop_todo_update" ON todo_items
  FOR UPDATE TO authenticated
  USING (siteop_can_write() AND entry_id IS NOT NULL AND siteop_can_see_entry(entry_id))
  WITH CHECK (siteop_can_write() AND entry_id IS NOT NULL AND siteop_can_see_entry(entry_id));

CREATE POLICY "siteop_todo_delete" ON todo_items
  FOR DELETE TO authenticated
  USING (siteop_can_write() AND entry_id IS NOT NULL AND siteop_can_see_entry(entry_id));

-- ---------------------------------------------------------------------------
-- entry_flags
--
-- These carry summary_bullet -- a one-line précis of the log -- so a leak here
-- exposes the substance of other sites' entries, not just their existence.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "siteop_entry_flags_write" ON entry_flags;

CREATE POLICY "siteop_entry_flags_insert" ON entry_flags
  FOR INSERT TO authenticated
  WITH CHECK (siteop_can_write() AND siteop_can_see_entry(entry_id));

CREATE POLICY "siteop_entry_flags_update" ON entry_flags
  FOR UPDATE TO authenticated
  USING (siteop_can_write() AND siteop_can_see_entry(entry_id))
  WITH CHECK (siteop_can_write() AND siteop_can_see_entry(entry_id));

CREATE POLICY "siteop_entry_flags_delete" ON entry_flags
  FOR DELETE TO authenticated
  USING (siteop_can_write() AND siteop_can_see_entry(entry_id));

-- ---------------------------------------------------------------------------
-- daily_digests
--
-- The legacy, project-less digest table: one row per date summarising every
-- site at once. Its SELECT policy was USING (true), which alongside the FOR ALL
-- write policy made cross-site summaries readable by everyone. A digest that
-- spans all projects is admin material by definition, so both are narrowed to
-- managers. Per-project digests live in project_digests and are unaffected --
-- that is what a guest or user actually sees, correctly scoped by membership.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "siteop_daily_digests_write" ON daily_digests;
DROP POLICY IF EXISTS "siteop_daily_digests_select" ON daily_digests;

CREATE POLICY "siteop_daily_digests_select" ON daily_digests
  FOR SELECT TO authenticated USING (siteop_is_manager());

CREATE POLICY "siteop_daily_digests_insert" ON daily_digests
  FOR INSERT TO authenticated WITH CHECK (siteop_is_manager());

CREATE POLICY "siteop_daily_digests_update" ON daily_digests
  FOR UPDATE TO authenticated
  USING (siteop_is_manager()) WITH CHECK (siteop_is_manager());

CREATE POLICY "siteop_daily_digests_delete" ON daily_digests
  FOR DELETE TO authenticated USING (siteop_is_manager());

-- ---------------------------------------------------------------------------
-- Verification: impersonating a non-admin who is a member of one project --
--   SELECT COUNT(*) FROM todo_items;      -- only their project's
--   SELECT COUNT(*) FROM entry_flags;     -- only their project's
--   SELECT COUNT(*) FROM daily_digests;   -- 0
-- ---------------------------------------------------------------------------
