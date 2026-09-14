-- Additive Migration for Siteop — Content fields + issues upgrade
-- CRITICAL RULE: Additive-only. Never alter or drop existing tables, never touch
-- expense_* tables, and never change the `diary_entries` schema. Follows the
-- same ADD COLUMN IF NOT EXISTS convention as 20260813b_todo_items_dismissed.sql.
--
-- Two unrelated additions bundled in one migration, same pattern as 20260909:
--
-- 1. Sign-off on entry_meta. The delay/deliveries/equipment/visitors/safety/
--    quantities content fields themselves need NO schema change -- they live
--    inside diary_entries.extracted_data, which is already JSONB. Only the
--    sign-off act (who confirmed the log is accurate, and when) is structured
--    state, so it gets columns.
--
-- 2. assignee_id + priority on todo_items, for the to-do -> issues upgrade.

-- ---------------------------------------------------------------------------
-- 1. Sign-off
-- ---------------------------------------------------------------------------

ALTER TABLE entry_meta ADD COLUMN IF NOT EXISTS signed_off_by UUID REFERENCES auth.users (id) ON DELETE SET NULL;
ALTER TABLE entry_meta ADD COLUMN IF NOT EXISTS signed_off_name TEXT;
ALTER TABLE entry_meta ADD COLUMN IF NOT EXISTS signed_off_at TIMESTAMP WITH TIME ZONE;

-- ---------------------------------------------------------------------------
-- 2. Issues: assignee + priority
-- ---------------------------------------------------------------------------

ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS assignee_id UUID REFERENCES auth.users (id) ON DELETE SET NULL;
ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal';

-- ADD CONSTRAINT has no IF NOT EXISTS in Postgres, so guard it by name lookup
-- the same way the 20260909 migration guards policies.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'todo_items_priority_check'
  ) THEN
    ALTER TABLE todo_items
      ADD CONSTRAINT todo_items_priority_check CHECK (priority IN ('low', 'normal', 'high'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS todo_items_assignee_idx ON todo_items (assignee_id);

-- No RLS change needed: todo_items already grants any non-viewer full write
-- access (siteop_todo_write, from the 20260909 migration), which covers
-- setting/clearing assignee_id and priority the same as every other column.
