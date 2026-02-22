-- ============================================================
-- SECURITY PATCH F — Mass Cleanup
-- ============================================================
-- Paste the ENTIRE file in one go in the Supabase SQL Editor.
-- If you see "Success" you are done.
--
-- What this fixes (based on 5 diagnostic queries):
--
-- SECTION 1 — REVOKE access from 14 internal-only functions
--   These are never called from the frontend but are currently
--   callable by any authenticated user.  An attacker could call
--   them directly to grant XP, win PvP, give achievements, etc.
--   to any user.
--   1a) 8 write functions → REVOKE from everyone (only SECURITY
--       DEFINER callers can reach them now).
--   1b) 6 read/helper functions → REVOKE from anon only.
--
-- SECTION 2 — Inject auth.uid() gate into 8 functions
--   Notification helpers + record_geometry_attempt.
--   Currently callable without authentication.
--
-- SECTION 3 — Inject auth + self-only gate into 2 functions
--   rpc_update_pvp_score, check_assignment_achievements.
--   Currently any authenticated user can modify ANY user's data.
--   After patch: p_user_id is overridden with auth.uid().
--
-- SECTION 4 — Inject auth + role gate into 4 school admin functions
--   auto_enroll_students_by_grade, get_class_roster,
--   get_school_class_rosters, get_unassigned_students.
--   Currently callable by any user (no auth, no role check).
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- SECTION 1a: Lock down internal WRITE functions
-- Revoke ALL access — only reachable from SECURITY DEFINER chains.
-- ════════════════════════════════════════════════════════════
DO $outer$
DECLARE
  v_func  text;
  v_iargs text;
  v_count int := 0;
BEGIN
  FOREACH v_func IN ARRAY ARRAY[
    'increment_pvp_wins',
    'update_user_stats',
    'track_assignment_earnings',
    'track_pvp_earnings',
    'track_quest_earnings',
    'grant_levelup_rewards',
    'check_achievements',
    'brains_heist_generate_adaptive_snapshot'
  ]
  LOOP
    FOR v_iargs IN
      SELECT pg_get_function_identity_arguments(p.oid)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = v_func
    LOOP
      EXECUTE format(
        'REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
        v_func, v_iargs
      );
      v_count := v_count + 1;
    END LOOP;
  END LOOP;
  RAISE NOTICE '[F-1a] Locked down % internal WRITE function overload(s)', v_count;
END;
$outer$;


-- ════════════════════════════════════════════════════════════
-- SECTION 1b: Revoke anon from internal READ / helper functions
-- Keeps authenticated access in case of SECURITY INVOKER callers.
-- ════════════════════════════════════════════════════════════
DO $outer$
DECLARE
  v_func  text;
  v_iargs text;
  v_count int := 0;
BEGIN
  FOREACH v_func IN ARRAY ARRAY[
    'get_user_complete_profile',
    'log_user_activity',
    'log_user_activity_enhanced',
    'check_invite_rate_limit',
    'can_access_content',
    'can_attempt_skill'
  ]
  LOOP
    FOR v_iargs IN
      SELECT pg_get_function_identity_arguments(p.oid)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = v_func
    LOOP
      EXECUTE format(
        'REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon',
        v_func, v_iargs
      );
      v_count := v_count + 1;
    END LOOP;
  END LOOP;
  RAISE NOTICE '[F-1b] Revoked anon from % internal READ function overload(s)', v_count;
END;
$outer$;


-- ════════════════════════════════════════════════════════════
-- SECTION 2: Auth-only gate injection
-- Injects  IF auth.uid() IS NULL THEN RAISE EXCEPTION ...
-- right after the first BEGIN in each function body.
-- ════════════════════════════════════════════════════════════
DO $outer$
DECLARE
  v_func   text;
  v_oid    oid;
  v_iargs  text;
  v_fargs  text;
  v_ret    text;
  v_body   text;
  v_lang   text;
  v_vol    char;
  v_strict boolean;
  v_new    text;
  v_count  int := 0;
BEGIN
  FOREACH v_func IN ARRAY ARRAY[
    'notify_ap_full',
    'notify_attack_defended',
    'notify_attack_incoming',
    'notify_coins_lost',
    'notify_level_up',
    'notify_low_ap',
    'notify_revenge_available',
    'record_geometry_attempt'
  ]
  LOOP
    FOR v_oid, v_iargs, v_fargs, v_ret, v_body, v_lang, v_vol, v_strict IN
      SELECT p.oid,
             pg_get_function_identity_arguments(p.oid),
             pg_get_function_arguments(p.oid),
             pg_get_function_result(p.oid),
             p.prosrc, l.lanname, p.provolatile, p.proisstrict
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_language l  ON l.oid = p.prolang
      WHERE n.nspname = 'public' AND p.proname = v_func
    LOOP
      -- skip if already patched
      IF v_body ILIKE '%Not authenticated%' THEN
        RAISE NOTICE '[F-2] %(%): already has auth gate — skip', v_func, v_iargs;
        CONTINUE;
      END IF;

      -- Inject auth gate after the first standalone BEGIN
      v_new := regexp_replace(
        v_body,
        E'(\\r?\\n)([ \\t]*BEGIN[ \\t]*)(\\r?\\n)',
        E'\\1\\2\\3  IF auth.uid() IS NULL THEN\\3    RAISE EXCEPTION ''Not authenticated'';\\3  END IF;\\3',
        'i'
      );

      IF v_new = v_body THEN
        RAISE WARNING '[F-2] %: regex did not match BEGIN — skipping', v_func;
        CONTINUE;
      END IF;

      EXECUTE format('DROP FUNCTION public.%I(%s)', v_func, v_iargs);

      EXECUTE format(
        'CREATE FUNCTION public.%I(%s) RETURNS %s LANGUAGE %s %s %s SECURITY DEFINER SET search_path = public AS %L',
        v_func, v_fargs, v_ret, v_lang,
        CASE v_vol
          WHEN 'v' THEN 'VOLATILE'
          WHEN 's' THEN 'STABLE'
          WHEN 'i' THEN 'IMMUTABLE'
        END,
        CASE WHEN v_strict THEN 'STRICT' ELSE '' END,
        v_new
      );

      EXECUTE format(
        'REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon',
        v_func, v_iargs
      );
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',
        v_func, v_iargs
      );

      v_count := v_count + 1;
      RAISE NOTICE '[F-2] % — auth gate injected', v_func;
    END LOOP;
  END LOOP;

  RAISE NOTICE '[F-2] Total: % function(s) patched with auth-only gate', v_count;
END;
$outer$;


-- ════════════════════════════════════════════════════════════
-- SECTION 3: Auth + self-only gate
-- Overrides p_user_id with auth.uid() so users can only
-- modify their own data.
-- ════════════════════════════════════════════════════════════
DO $outer$
DECLARE
  v_func   text;
  v_oid    oid;
  v_iargs  text;
  v_fargs  text;
  v_ret    text;
  v_body   text;
  v_lang   text;
  v_vol    char;
  v_strict boolean;
  v_new    text;
  v_count  int := 0;
BEGIN
  FOREACH v_func IN ARRAY ARRAY[
    'rpc_update_pvp_score',
    'check_assignment_achievements'
  ]
  LOOP
    FOR v_oid, v_iargs, v_fargs, v_ret, v_body, v_lang, v_vol, v_strict IN
      SELECT p.oid,
             pg_get_function_identity_arguments(p.oid),
             pg_get_function_arguments(p.oid),
             pg_get_function_result(p.oid),
             p.prosrc, l.lanname, p.provolatile, p.proisstrict
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_language l  ON l.oid = p.prolang
      WHERE n.nspname = 'public' AND p.proname = v_func
    LOOP
      IF v_body ILIKE '%Not authenticated%' THEN
        RAISE NOTICE '[F-3] %(%): already patched — skip', v_func, v_iargs;
        CONTINUE;
      END IF;

      -- Inject auth check + override p_user_id
      v_new := regexp_replace(
        v_body,
        E'(\\r?\\n)([ \\t]*BEGIN[ \\t]*)(\\r?\\n)',
        E'\\1\\2\\3  IF auth.uid() IS NULL THEN\\3    RAISE EXCEPTION ''Not authenticated'';\\3  END IF;\\3  p_user_id := auth.uid();  -- [Patch F] force self-only\\3',
        'i'
      );

      IF v_new = v_body THEN
        RAISE WARNING '[F-3] %: regex did not match BEGIN — skipping', v_func;
        CONTINUE;
      END IF;

      EXECUTE format('DROP FUNCTION public.%I(%s)', v_func, v_iargs);

      EXECUTE format(
        'CREATE FUNCTION public.%I(%s) RETURNS %s LANGUAGE %s %s %s SECURITY DEFINER SET search_path = public AS %L',
        v_func, v_fargs, v_ret, v_lang,
        CASE v_vol
          WHEN 'v' THEN 'VOLATILE'
          WHEN 's' THEN 'STABLE'
          WHEN 'i' THEN 'IMMUTABLE'
        END,
        CASE WHEN v_strict THEN 'STRICT' ELSE '' END,
        v_new
      );

      EXECUTE format(
        'REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon',
        v_func, v_iargs
      );
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',
        v_func, v_iargs
      );

      v_count := v_count + 1;
      RAISE NOTICE '[F-3] % — auth + self-only gate injected', v_func;
    END LOOP;
  END LOOP;

  RAISE NOTICE '[F-3] Total: % function(s) patched with self-only gate', v_count;
END;
$outer$;


-- ════════════════════════════════════════════════════════════
-- SECTION 4a: Auth + is_class_staff gate
-- For functions that take p_class_id — require caller to be
-- a school admin or teacher assigned to the class.
-- ════════════════════════════════════════════════════════════
DO $outer$
DECLARE
  v_func   text;
  v_oid    oid;
  v_iargs  text;
  v_fargs  text;
  v_ret    text;
  v_body   text;
  v_lang   text;
  v_vol    char;
  v_strict boolean;
  v_new    text;
  v_count  int := 0;
BEGIN
  FOREACH v_func IN ARRAY ARRAY[
    'auto_enroll_students_by_grade',
    'get_class_roster'
  ]
  LOOP
    FOR v_oid, v_iargs, v_fargs, v_ret, v_body, v_lang, v_vol, v_strict IN
      SELECT p.oid,
             pg_get_function_identity_arguments(p.oid),
             pg_get_function_arguments(p.oid),
             pg_get_function_result(p.oid),
             p.prosrc, l.lanname, p.provolatile, p.proisstrict
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_language l  ON l.oid = p.prolang
      WHERE n.nspname = 'public' AND p.proname = v_func
    LOOP
      IF v_body ILIKE '%Not authenticated%' THEN
        RAISE NOTICE '[F-4a] %(%): already patched — skip', v_func, v_iargs;
        CONTINUE;
      END IF;

      v_new := regexp_replace(
        v_body,
        E'(\\r?\\n)([ \\t]*BEGIN[ \\t]*)(\\r?\\n)',
        E'\\1\\2\\3  IF auth.uid() IS NULL THEN\\3    RAISE EXCEPTION ''Not authenticated'';\\3  END IF;\\3  IF NOT public.is_class_staff(p_class_id) THEN\\3    RAISE EXCEPTION ''Forbidden: not class staff'';\\3  END IF;\\3',
        'i'
      );

      IF v_new = v_body THEN
        RAISE WARNING '[F-4a] %: regex did not match BEGIN — skipping', v_func;
        CONTINUE;
      END IF;

      EXECUTE format('DROP FUNCTION public.%I(%s)', v_func, v_iargs);

      EXECUTE format(
        'CREATE FUNCTION public.%I(%s) RETURNS %s LANGUAGE %s %s %s SECURITY DEFINER SET search_path = public AS %L',
        v_func, v_fargs, v_ret, v_lang,
        CASE v_vol
          WHEN 'v' THEN 'VOLATILE'
          WHEN 's' THEN 'STABLE'
          WHEN 'i' THEN 'IMMUTABLE'
        END,
        CASE WHEN v_strict THEN 'STRICT' ELSE '' END,
        v_new
      );

      EXECUTE format(
        'REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon',
        v_func, v_iargs
      );
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',
        v_func, v_iargs
      );

      v_count := v_count + 1;
      RAISE NOTICE '[F-4a] % — auth + class staff gate injected', v_func;
    END LOOP;
  END LOOP;

  RAISE NOTICE '[F-4a] Total: % function(s) patched with class staff gate', v_count;
END;
$outer$;


-- ════════════════════════════════════════════════════════════
-- SECTION 4b: Auth + is_school_admin_of gate
-- For functions that take p_school_id — require caller to be
-- a school admin or superadmin.
-- ════════════════════════════════════════════════════════════
DO $outer$
DECLARE
  v_func   text;
  v_oid    oid;
  v_iargs  text;
  v_fargs  text;
  v_ret    text;
  v_body   text;
  v_lang   text;
  v_vol    char;
  v_strict boolean;
  v_new    text;
  v_count  int := 0;
BEGIN
  FOREACH v_func IN ARRAY ARRAY[
    'get_school_class_rosters',
    'get_unassigned_students'
  ]
  LOOP
    FOR v_oid, v_iargs, v_fargs, v_ret, v_body, v_lang, v_vol, v_strict IN
      SELECT p.oid,
             pg_get_function_identity_arguments(p.oid),
             pg_get_function_arguments(p.oid),
             pg_get_function_result(p.oid),
             p.prosrc, l.lanname, p.provolatile, p.proisstrict
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_language l  ON l.oid = p.prolang
      WHERE n.nspname = 'public' AND p.proname = v_func
    LOOP
      IF v_body ILIKE '%Not authenticated%' THEN
        RAISE NOTICE '[F-4b] %(%): already patched — skip', v_func, v_iargs;
        CONTINUE;
      END IF;

      v_new := regexp_replace(
        v_body,
        E'(\\r?\\n)([ \\t]*BEGIN[ \\t]*)(\\r?\\n)',
        E'\\1\\2\\3  IF auth.uid() IS NULL THEN\\3    RAISE EXCEPTION ''Not authenticated'';\\3  END IF;\\3  IF NOT public.is_school_admin_of(p_school_id) THEN\\3    RAISE EXCEPTION ''Forbidden: not school admin'';\\3  END IF;\\3',
        'i'
      );

      IF v_new = v_body THEN
        RAISE WARNING '[F-4b] %: regex did not match BEGIN — skipping', v_func;
        CONTINUE;
      END IF;

      EXECUTE format('DROP FUNCTION public.%I(%s)', v_func, v_iargs);

      EXECUTE format(
        'CREATE FUNCTION public.%I(%s) RETURNS %s LANGUAGE %s %s %s SECURITY DEFINER SET search_path = public AS %L',
        v_func, v_fargs, v_ret, v_lang,
        CASE v_vol
          WHEN 'v' THEN 'VOLATILE'
          WHEN 's' THEN 'STABLE'
          WHEN 'i' THEN 'IMMUTABLE'
        END,
        CASE WHEN v_strict THEN 'STRICT' ELSE '' END,
        v_new
      );

      EXECUTE format(
        'REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon',
        v_func, v_iargs
      );
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',
        v_func, v_iargs
      );

      v_count := v_count + 1;
      RAISE NOTICE '[F-4b] % — auth + school admin gate injected', v_func;
    END LOOP;
  END LOOP;

  RAISE NOTICE '[F-4b] Total: % function(s) patched with school admin gate', v_count;
END;
$outer$;


-- ============================================================
-- VERIFICATION — paste separately after "Success"
-- ============================================================
--
-- 1. Internal WRITE functions are locked down (expect 0 rows):
--    SELECT p.proname,
--           array_to_string(p.proacl, ', ') AS grants
--    FROM pg_proc p
--    JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN (
--        'increment_pvp_wins',
--        'update_user_stats',
--        'track_assignment_earnings',
--        'track_pvp_earnings',
--        'track_quest_earnings',
--        'grant_levelup_rewards',
--        'check_achievements',
--        'brains_heist_generate_adaptive_snapshot'
--      )
--      AND (   array_to_string(p.proacl, ',') ILIKE '%authenticated%'
--           OR array_to_string(p.proacl, ',') ILIKE '%anon%'  );
--    -- Expect: 0 rows (no public access remains)
--
--
-- 2. Auth gate injected into notify + geometry (expect all TRUE):
--    SELECT p.proname,
--           p.prosrc ILIKE '%Not authenticated%' AS has_auth_gate
--    FROM pg_proc p
--    JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN (
--        'notify_ap_full',
--        'notify_attack_defended',
--        'notify_attack_incoming',
--        'notify_coins_lost',
--        'notify_level_up',
--        'notify_low_ap',
--        'notify_revenge_available',
--        'record_geometry_attempt'
--      );
--    -- Expect: has_auth_gate = true for all 8
--
--
-- 3. Self-only gate injected (expect all TRUE):
--    SELECT p.proname,
--           p.prosrc ILIKE '%Not authenticated%'  AS has_auth,
--           p.prosrc ILIKE '%force self-only%'     AS has_self_only
--    FROM pg_proc p
--    JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN (
--        'rpc_update_pvp_score',
--        'check_assignment_achievements'
--      );
--    -- Expect: has_auth = true, has_self_only = true for both
--
--
-- 4. School admin / class staff gates (expect all TRUE):
--    SELECT p.proname,
--           p.prosrc ILIKE '%Not authenticated%'  AS has_auth,
--           p.prosrc ILIKE '%is_class_staff%' OR p.prosrc ILIKE '%is_school_admin_of%' AS has_role_gate
--    FROM pg_proc p
--    JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN (
--        'auto_enroll_students_by_grade',
--        'get_class_roster',
--        'get_school_class_rosters',
--        'get_unassigned_students'
--      );
--    -- Expect: has_auth = true, has_role_gate = true for all 4
--
-- ============================================================
