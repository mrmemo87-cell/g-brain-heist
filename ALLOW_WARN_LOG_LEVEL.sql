-- ============================================================================
-- G-BRAINS HEIST: EXPAND rpc_event_log LOG LEVEL CHECK
-- ============================================================================
-- Adds support for the "warn" level so helper functions that log warnings do
-- not violate the existing CHECK constraint. Run this once after the base
-- schema (supabase-schema.sql) has been applied.
-- ============================================================================

DO $$
BEGIN
  -- Only proceed if the table exists
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'rpc_event_log'
  ) THEN

    -- Drop the old check constraint if it still only allows info/error
    IF EXISTS (
      SELECT 1
      FROM information_schema.table_constraints tc
      JOIN information_schema.check_constraints cc
        ON tc.constraint_name = cc.constraint_name
       AND tc.constraint_schema = cc.constraint_schema
      WHERE tc.table_schema = 'public'
        AND tc.table_name = 'rpc_event_log'
        AND tc.constraint_name = 'rpc_event_log_log_level_check'
        AND cc.check_clause NOT LIKE '%warn%'
    ) THEN
      ALTER TABLE rpc_event_log
        DROP CONSTRAINT rpc_event_log_log_level_check;
    END IF;

    -- Recreate constraint permitting warn in addition to info/error
    BEGIN
      ALTER TABLE rpc_event_log
        ADD CONSTRAINT rpc_event_log_log_level_check
        CHECK (log_level IN ('info', 'warn', 'error'));
    EXCEPTION
      WHEN duplicate_object THEN
        -- Constraint already updated, nothing else to do
        NULL;
    END;
  ELSE
    RAISE NOTICE 'rpc_event_log table not found; nothing to update';
  END IF;
END;
$$;

-- Optional sanity check
SELECT DISTINCT log_level
FROM rpc_event_log
ORDER BY log_level;
