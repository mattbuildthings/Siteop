-- Corrective Migration for Siteop — RLS enforcement was off on 4 tables
-- CRITICAL RULE: Additive-only. Never alter or drop existing tables, never touch
-- expense_* tables, and never change the `diary_entries` schema.
--
-- After applying 20260909 and 20260910, an anonymous request using only the
-- public anon key could still read every row of diary_entries, sync_logs,
-- entry_flags and daily_digests -- full transcripts, voice/photo URLs,
-- flagged-entry summaries, and sync history, no login required. Every other
-- table (projects, user_profiles, entry_meta, ...) was correctly locked down.
--
-- The difference: those other tables had `ALTER TABLE ... ENABLE ROW LEVEL
-- SECURITY` inside the SAME migration that also (re)created their policies.
-- diary_entries/sync_logs (20260811) and entry_flags/daily_digests (20260812)
-- had RLS enabled in an earlier migration, and 20260909 only replaced their
-- POLICIES, on the assumption RLS was still active on the table itself --
-- which turned out not to hold in the live database, so the new
-- `TO authenticated` policies were never actually being enforced: with
-- row-level security off, every row is visible to every role regardless of
-- policy definitions.
--
-- todo_items (RLS enabled in 20260813, policies replaced in 20260909) fits
-- the exact same at-risk pattern. It happened to test as empty for anon
-- rather than leaking -- which just as easily means the table has zero rows
-- right now as it does that RLS is working, so it's covered here too rather
-- than trusted on an inconclusive result.
--
-- ENABLE ROW LEVEL SECURITY is idempotent -- safe to run again even where it
-- was already on.

ALTER TABLE diary_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE entry_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_digests ENABLE ROW LEVEL SECURITY;
ALTER TABLE todo_items ENABLE ROW LEVEL SECURITY;

-- Belt-and-suspenders: re-assert the intended policies in case a leftover
-- permissive policy (rather than RLS being off) turns out to be a
-- contributing cause on any of these four. DROP ... IF EXISTS is a no-op
-- where nothing is left to drop.

DROP POLICY IF EXISTS "Authenticated users can manage diary_entries" ON diary_entries;
DROP POLICY IF EXISTS "Authenticated users can manage sync_logs" ON sync_logs;
DROP POLICY IF EXISTS "Allow authenticated and anon access on entry_flags" ON entry_flags;
DROP POLICY IF EXISTS "Allow authenticated and anon access on daily_digests" ON daily_digests;

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

DROP POLICY IF EXISTS "siteop_entries_delete" ON diary_entries;
CREATE POLICY "siteop_entries_delete" ON diary_entries
  FOR DELETE TO authenticated
  USING (siteop_is_admin() OR (created_by = auth.uid() AND NOT siteop_entry_is_locked(id)));

DROP POLICY IF EXISTS "siteop_sync_logs_select" ON sync_logs;
CREATE POLICY "siteop_sync_logs_select" ON sync_logs
  FOR SELECT TO authenticated USING (siteop_is_manager());

DROP POLICY IF EXISTS "siteop_sync_logs_write" ON sync_logs;
CREATE POLICY "siteop_sync_logs_write" ON sync_logs
  FOR ALL TO authenticated USING (siteop_is_manager()) WITH CHECK (siteop_is_manager());

DROP POLICY IF EXISTS "siteop_entry_flags_select" ON entry_flags;
CREATE POLICY "siteop_entry_flags_select" ON entry_flags
  FOR SELECT TO authenticated USING (siteop_can_see_entry(entry_id));

DROP POLICY IF EXISTS "siteop_entry_flags_write" ON entry_flags;
CREATE POLICY "siteop_entry_flags_write" ON entry_flags
  FOR ALL TO authenticated
  USING (siteop_can_write()) WITH CHECK (siteop_can_write());

DROP POLICY IF EXISTS "siteop_daily_digests_select" ON daily_digests;
CREATE POLICY "siteop_daily_digests_select" ON daily_digests
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "siteop_daily_digests_write" ON daily_digests;
CREATE POLICY "siteop_daily_digests_write" ON daily_digests
  FOR ALL TO authenticated USING (siteop_can_write()) WITH CHECK (siteop_can_write());

DROP POLICY IF EXISTS "Allow authenticated and anon access on todo_items" ON todo_items;

DROP POLICY IF EXISTS "siteop_todo_select" ON todo_items;
CREATE POLICY "siteop_todo_select" ON todo_items
  FOR SELECT TO authenticated
  USING (entry_id IS NULL OR siteop_can_see_entry(entry_id));

DROP POLICY IF EXISTS "siteop_todo_write" ON todo_items;
CREATE POLICY "siteop_todo_write" ON todo_items
  FOR ALL TO authenticated USING (siteop_can_write()) WITH CHECK (siteop_can_write());

-- ---------------------------------------------------------------------------
-- Verification: run this SELECT after applying. Every row must show
-- rowsecurity = true. If any show false, RLS is still off on that table and
-- anon can still read it regardless of the policies above.
-- ---------------------------------------------------------------------------
-- SELECT relname, relrowsecurity
-- FROM pg_class
-- WHERE relname IN ('diary_entries', 'sync_logs', 'entry_flags', 'daily_digests',
--                    'todo_items', 'projects', 'user_profiles', 'project_members',
--                    'entry_meta', 'entry_photos', 'entry_revisions', 'project_digests');
