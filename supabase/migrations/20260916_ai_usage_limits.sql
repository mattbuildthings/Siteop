-- Per-user daily ceiling on AI calls for Siteop
-- CRITICAL RULE: Additive-only. Never alter or drop existing tables, never touch
-- expense_* tables, and never change the `diary_entries` schema.
--
-- Why this exists
-- ---------------
-- /api/transcribe, /api/extract and /api/generate-digest each spend real money
-- on the Gemini API. Until now nothing bounded how many times a client could
-- call them: the routes accepted an unauthenticated POST, so a plain `curl`
-- against the public URL returned a full extraction and billed it to the
-- project. The routes now require a signed-in user, and this migration adds the
-- counter that makes a per-user ceiling enforceable across serverless
-- invocations (in-process counting is useless -- every request may land on a
-- fresh instance).
--
-- The counter is bumped through a SECURITY DEFINER function rather than a
-- direct table write. Serverless routes run as the calling user with the anon
-- key (see src/lib/serverSupabase.ts -- no service-role key is involved), so a
-- writable counter table would be equally writable from the user's browser:
-- they could zero their own row and the ceiling would mean nothing. Going
-- through a function that can only ever increment closes that.

-- ---------------------------------------------------------------------------
-- 1. Counter table. One row per user, per route, per UTC day.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ai_usage_counters (
  user_id    UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  usage_date DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')::DATE,
  route      TEXT NOT NULL,
  calls      INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, usage_date, route)
);

ALTER TABLE ai_usage_counters ENABLE ROW LEVEL SECURITY;

-- Read-only to the owner, and to admins for support/diagnosis. Deliberately NO
-- insert/update/delete policy: the only write path is the function below, which
-- runs as the definer and bypasses RLS.
DROP POLICY IF EXISTS "siteop_ai_usage_select" ON ai_usage_counters;
CREATE POLICY "siteop_ai_usage_select" ON ai_usage_counters
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR siteop_is_manager());

-- ---------------------------------------------------------------------------
-- 2. Increment-and-check, atomic.
--
-- Returns the post-increment count and whether the caller is still within the
-- ceiling. The INSERT ... ON CONFLICT DO UPDATE is a single statement, so two
-- concurrent calls cannot both read the same pre-increment value.
--
-- Note the call is counted even when it is refused. That is intentional: a
-- client hammering the endpoint should not get a free pass on the attempts that
-- were rejected, and the count is the signal you would want when diagnosing it.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION siteop_bump_ai_usage(p_route TEXT, p_limit INTEGER)
RETURNS TABLE (allowed BOOLEAN, calls INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_calls   INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    -- No session: refuse rather than counting against a null user.
    RETURN QUERY SELECT FALSE, 0;
    RETURN;
  END IF;

  IF p_route IS NULL OR length(p_route) = 0 OR length(p_route) > 64 THEN
    RAISE EXCEPTION 'siteop_bump_ai_usage: invalid route';
  END IF;

  INSERT INTO ai_usage_counters (user_id, usage_date, route, calls, updated_at)
  VALUES (v_user_id, (NOW() AT TIME ZONE 'utc')::DATE, p_route, 1, NOW())
  ON CONFLICT (user_id, usage_date, route)
  DO UPDATE SET calls = ai_usage_counters.calls + 1, updated_at = NOW()
  RETURNING ai_usage_counters.calls INTO v_calls;

  RETURN QUERY SELECT (v_calls <= GREATEST(p_limit, 0)), v_calls;
END $$;

REVOKE ALL ON FUNCTION siteop_bump_ai_usage(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION siteop_bump_ai_usage(TEXT, INTEGER) TO authenticated;

-- ---------------------------------------------------------------------------
-- Verification: after applying, as a signed-in user --
--   SELECT * FROM siteop_bump_ai_usage('extract', 200);   -- allowed=t, calls=1
--   SELECT * FROM ai_usage_counters;                      -- one row, calls=1
--   UPDATE ai_usage_counters SET calls = 0;               -- must affect 0 rows
-- ---------------------------------------------------------------------------
