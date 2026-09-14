-- Corrective Migration for Siteop — drop the actual leftover anon policies
-- CRITICAL RULE: Additive-only. Never alter or drop existing tables, never touch
-- expense_* tables, and never change the `diary_entries` schema.
--
-- 20260910b re-enabled RLS and re-asserted the intended policies, but the
-- anon leak persisted (confirmed via pg_class.relrowsecurity = true and a
-- fresh `NOTIFY pgrst, 'reload schema'`). Listing pg_policies directly found
-- the real cause: four policies whose names don't appear in ANY migration
-- file in this repo --
--
--   diary_entries  "Allow anon access to diary_entries"   {anon}               ALL  USING(true)
--   sync_logs      "Allow anon access to sync_logs"       {anon}               ALL  USING(true)
--   entry_flags    "Allow entry_flags access"             {anon,authenticated} ALL  USING(true)
--   daily_digests  "Allow daily_digests access"           {anon,authenticated} ALL  USING(true)
--
-- These were created outside the migration history (most likely by hand
-- through the Supabase dashboard's Table Editor / Policies UI at some point),
-- so every previous `DROP POLICY IF EXISTS "..."` in this repo was guessing
-- at names from the migration files and never matched them. Postgres RLS
-- policies are permissive and OR'd together: as long as any one policy grants
-- a role access, that role sees the rows, regardless of how restrictive the
-- other policies on the same table are. That's what let the anon key read
-- full diary_entries rows even with siteop_entries_select correctly scoped
-- to `authenticated`.
--
-- todo_items had no such extra policy (confirmed by the same pg_policies
-- listing), which is exactly why it tested clean throughout.

DROP POLICY IF EXISTS "Allow anon access to diary_entries" ON diary_entries;
DROP POLICY IF EXISTS "Allow anon access to sync_logs" ON sync_logs;
DROP POLICY IF EXISTS "Allow entry_flags access" ON entry_flags;
DROP POLICY IF EXISTS "Allow daily_digests access" ON daily_digests;

-- Verification: run after applying. Only the siteop_* policies (all scoped
-- to {authenticated}) should remain on these four tables.
-- SELECT tablename, policyname, roles, cmd
-- FROM pg_policies
-- WHERE tablename IN ('diary_entries', 'sync_logs', 'entry_flags', 'daily_digests')
-- ORDER BY tablename, policyname;
