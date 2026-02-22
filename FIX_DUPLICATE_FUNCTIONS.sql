-- ================================================================
-- FIX: Drop duplicate / stale function overloads
-- ================================================================
-- Run this in Supabase SQL Editor.
-- Each DROP targets the exact OLD signature so the canonical version
-- remains untouched.
--
-- After running, verify by re-executing:
--   SELECT n.nspname, p.proname, count(*)
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--   GROUP BY 1,2 HAVING count(*) > 1;
-- Expected: 0 rows
-- ================================================================


-- ────────────────────────────────────────────────
-- 1. rpc_hack_attempt
--    KEEP: (uuid, uuid) — has p_request_id idempotency + role guards
--    DROP: (uuid)       — old single-arg version
-- ────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.rpc_hack_attempt(uuid);


-- ────────────────────────────────────────────────
-- 2. get_school_leaderboard
--    KEEP: (text, integer)                            — used by LeaderboardView.tsx
--    DROP: (text, uuid, integer, text, integer, integer) — unused 6-arg JSONB version
-- ────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_school_leaderboard(text, uuid, integer, text, integer, integer);


-- ────────────────────────────────────────────────
-- 3. notify_attack_incoming
--    KEEP: (uuid, text, integer) — returns UUID, stores JSON data
--    DROP: (uuid, text)          — bare 2-arg version, returns VOID
-- ────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.notify_attack_incoming(uuid, text);


-- ────────────────────────────────────────────────
-- 4. ielts_audit
--    Both overloads live only in the DB (no source file).
--    STEP A: Run the query below to inspect them and decide which to keep.
--
--    SELECT p.oid,
--           pg_get_function_identity_arguments(p.oid) AS args,
--           pg_get_functiondef(p.oid)                  AS definition
--    FROM pg_proc p
--    JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'ielts_audit';
--
--    STEP B: Confirmed — old 5-arg version uses weaker is_ielts_admin() check.
--    KEEP: (text, uuid, text, text, jsonb, uuid)  — 6-arg with explicit actor + admin_roles check
--    DROP: (text, uuid, text, text, jsonb)         — old 5-arg version
DROP FUNCTION IF EXISTS public.ielts_audit(text, uuid, text, text, jsonb);
-- ────────────────────────────────────────────────


-- ────────────────────────────────────────────────
-- 5. school_admin_move_student_to_class
--    Both source files define the same signature (uuid, uuid, smallint).
--    If pg_proc shows two overloads, an older version exists with
--    a different arg list (likely (uuid, uuid) without p_grade).
--
--    STEP A: Run:
--    SELECT pg_get_function_identity_arguments(p.oid) AS args
--    FROM pg_proc p
--    JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname = 'school_admin_move_student_to_class';
--
--    STEP B: Confirmed — old signature is (uuid, uuid). Dropping it:
DROP FUNCTION IF EXISTS public.school_admin_move_student_to_class(uuid, uuid);
-- ────────────────────────────────────────────────


-- Reload PostgREST schema cache so clients see the clean API
NOTIFY pgrst, 'reload schema';
