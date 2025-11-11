-- 001_drop_conflicting_functions.sql
-- Run this first in Supabase SQL Editor if you saw "cannot change return type" errors.
-- This file safely drops functions whose signatures/return types changed during iteration
-- so you can re-create them by running your canonical migration files afterwards.

-- IMPORTANT: Run this in Supabase SQL Editor (SQL -> New query). After it succeeds,
-- run the migration files in the order shown in the README / migration plan.

BEGIN;

-- Drop announcement-related RPCs that had return/param signature changes
DROP FUNCTION IF EXISTS rpc_announcement_mark_seen(bigint);
DROP FUNCTION IF EXISTS rpc_announcement_next();
DROP FUNCTION IF EXISTS rpc_announcement_post(text);

-- Drop AP regeneration RPC that changed OUT parameter types
DROP FUNCTION IF EXISTS regenerate_user_ap(uuid);

COMMIT;

-- After running this drop script, run the migration files in this order:
-- 1) SAFE_DATABASE_MIGRATION.sql (adds missing tables/columns like announcement_receipts, rpc_event_log.message/context)
-- 2) supabase-functions/function_calculate_ap.sql (creates regenerate_user_ap and calculate_current_ap)
-- 3) supabase-functions/competition_phase1.sql (creates rpc_announcement_post/next/mark_seen and other admin RPCs)

-- Verification queries you can run after steps (optional):
-- Check that functions are gone (should return no rows for those names):
-- SELECT proname, oidvectortypes(proargtypes) FROM pg_proc WHERE proname LIKE 'rpc_announcement_%' OR proname = 'regenerate_user_ap';

-- If you prefer a single-run approach you can copy the contents of the two function files
-- (function_calculate_ap.sql and competition_phase1.sql) into the SQL editor and run after the DROP block above.

-- NOTE: If any DROP fails because the function does not exist, that's fine — it was already dropped or never created.
