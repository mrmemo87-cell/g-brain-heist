-- ============================================================
-- SECURITY PATCH H — Full Abuse Scan Remediation
-- ============================================================
-- Paste the ENTIRE file in one go in the Supabase SQL Editor.
-- If you see "Success" you are done.
--
-- What this fixes (based on the fresh abuse scan):
--
-- SECTION 1 — DROP 3 test/example functions
--   These are debug scaffolding that should not exist in
--   production.
--
-- SECTION 2 — REVOKE ALL from 13 internal-only functions
--   Trigger functions, cron jobs, data migration helpers, and
--   the audit logger.  None should ever be callable via RPC.
--
-- SECTION 3 — Bulk REVOKE anon from ALL SECURITY DEFINER
--   functions except 5 intentionally-anonymous ones.
--   This is the single biggest fix: 60+ functions were
--   callable by the Supabase anon key (no login needed).
--
-- SECTION 4 — Auth gate injection for 14 unprotected
--   data-modifying + data-leaking functions.
--
-- SECTION 5 — Auth + admin gate for rpc_admin_dashboard_stats.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- SECTION 1: DROP 3 test / example functions
-- ════════════════════════════════════════════════════════════
DO $outer$
DECLARE
  v_func  text;
  v_iargs text;
  v_count int := 0;
BEGIN
  FOREACH v_func IN ARRAY ARRAY[
    'example_bh_rpc',
    'test_global_question_visibility',
    'test_student_question_visibility'
  ]
  LOOP
    FOR v_iargs IN
      SELECT pg_get_function_identity_arguments(p.oid)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = v_func
    LOOP
      EXECUTE format('DROP FUNCTION public.%I(%s)', v_func, v_iargs);
      v_count := v_count + 1;
    END LOOP;
  END LOOP;
  RAISE NOTICE '[H-1] Dropped % test/example function(s)', v_count;
END;
$outer$;


-- ════════════════════════════════════════════════════════════
-- SECTION 2: REVOKE ALL from 13 internal-only functions
-- Trigger functions, cron jobs, data-migration, audit logger.
-- These should NEVER be callable via supabase.rpc().
-- (Triggers still fire normally; they use table-owner privs.)
-- ════════════════════════════════════════════════════════════
DO $outer$
DECLARE
  v_func  text;
  v_iargs text;
  v_count int := 0;
BEGIN
  FOREACH v_func IN ARRAY ARRAY[
    -- Trigger functions
    'block_direct_school_id_updates',
    'block_direct_xp_level_updates',
    'handle_new_ielts_user',
    'handle_new_user',
    'ielts_sync_user_tier',
    'set_activity_school_id',
    'set_quiz_score_school_id',
    'sync_user_role_from_school_members',
    'sync_user_school_id',
    -- Cron / migration / internal
    'ielts_memberships_expire_job',
    'sync_auth_users_to_ielts',
    'ielts_audit',
    'init_school_pilot_usage'
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
  RAISE NOTICE '[H-2] Locked down % internal-only function(s)', v_count;
END;
$outer$;


-- ════════════════════════════════════════════════════════════
-- SECTION 3: Bulk REVOKE anon from ALL public SECURITY DEFINER
-- functions — except 5 that genuinely need anonymous access.
--
-- After this, ONLY authenticated users can call RPCs.
-- The 5 exceptions are admission-test flows (anonymous
-- candidates) and pre-login helpers.
-- ════════════════════════════════════════════════════════════
DO $outer$
DECLARE
  v_func  text;
  v_iargs text;
  v_count int := 0;
  v_keep_anon text[] := ARRAY[
    'rpc_adm_save_answer',
    'rpc_adm_start_attempt',
    'rpc_adm_submit_attempt',
    'validate_invite_code',
    'get_available_schools'
  ];
BEGIN
  FOR v_func, v_iargs IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true          -- SECURITY DEFINER only
      AND p.proname <> ALL(v_keep_anon)
      AND (
        p.proacl IS NULL              -- NULL = default PUBLIC grant
        OR array_to_string(p.proacl, ',') ILIKE '%anon%'
      )
  LOOP
    -- Revoke anonymous + PUBLIC default
    EXECUTE format(
      'REVOKE ALL ON FUNCTION public.%I(%s) FROM anon, PUBLIC',
      v_func, v_iargs
    );
    -- Re-grant authenticated (safe: Section 2 already locked
    -- its functions, and this only targets anon-accessible ones)
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',
      v_func, v_iargs
    );
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE '[H-3] Revoked anon access from % function overload(s)', v_count;
END;
$outer$;

-- Re-lock Section 2 functions (in case Section 3 re-granted authenticated)
DO $outer$
DECLARE
  v_func  text;
  v_iargs text;
BEGIN
  FOREACH v_func IN ARRAY ARRAY[
    'block_direct_school_id_updates',
    'block_direct_xp_level_updates',
    'handle_new_ielts_user',
    'handle_new_user',
    'ielts_sync_user_tier',
    'set_activity_school_id',
    'set_quiz_score_school_id',
    'sync_user_role_from_school_members',
    'sync_user_school_id',
    'ielts_memberships_expire_job',
    'sync_auth_users_to_ielts',
    'ielts_audit',
    'init_school_pilot_usage'
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
    END LOOP;
  END LOOP;
  RAISE NOTICE '[H-3b] Re-confirmed internal-only lockdown';
END;
$outer$;


-- ════════════════════════════════════════════════════════════
-- SECTION 4: Auth gate injection for 14 unprotected functions
-- These modify data or expose sensitive info and currently
-- have NO auth.uid() IS NULL check.
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
    -- WRITE functions (modify data, no auth gate)
    'release_quiz_score',
    'rpc_adm_close_form',
    'rpc_adm_publish_form',
    'rpc_adm_record_placement',
    'rpc_adm_check_entitlement',
    'rpc_create_assignment',
    'rpc_submit_assignment_result',
    -- READ functions (expose sensitive data, no auth gate)
    'rpc_get_assignment_question_analysis',
    'rpc_get_assignment_student_answers',
    'rpc_get_assignments_for_teacher',
    'rpc_teacher_assignment_report',
    'brains_heist_get_performance_summary',
    'brains_heist_get_progress_map',
    'get_students_in_teacher_classes'
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
      -- Skip if already patched
      IF v_body ILIKE '%Not authenticated%' THEN
        RAISE NOTICE '[H-4] %(%): already has auth gate — skip', v_func, v_iargs;
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
        -- Fallback: try matching BEGIN at the very start of the body
        v_new := regexp_replace(
          v_body,
          E'(\\bBEGIN\\b)(\\s*\\n)',
          E'\\1\\2  IF auth.uid() IS NULL THEN RAISE EXCEPTION ''Not authenticated''; END IF;\\2',
          'i'
        );
      END IF;

      IF v_new = v_body THEN
        RAISE WARNING '[H-4] %: regex did not match BEGIN — skipping', v_func;
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
      RAISE NOTICE '[H-4] % — auth gate injected', v_func;
    END LOOP;
  END LOOP;

  RAISE NOTICE '[H-4] Total: % function(s) patched with auth gate', v_count;
END;
$outer$;


-- ════════════════════════════════════════════════════════════
-- SECTION 5: Auth + admin gate for rpc_admin_dashboard_stats
-- This function returns dashboard data and had NO protection.
-- ════════════════════════════════════════════════════════════
DO $outer$
DECLARE
  v_oid    oid;
  v_iargs  text;
  v_fargs  text;
  v_ret    text;
  v_body   text;
  v_lang   text;
  v_vol    char;
  v_strict boolean;
  v_new    text;
BEGIN
  SELECT p.oid,
         pg_get_function_identity_arguments(p.oid),
         pg_get_function_arguments(p.oid),
         pg_get_function_result(p.oid),
         p.prosrc, l.lanname, p.provolatile, p.proisstrict
  INTO v_oid, v_iargs, v_fargs, v_ret, v_body, v_lang, v_vol, v_strict
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language l  ON l.oid = p.prolang
  WHERE n.nspname = 'public' AND p.proname = 'rpc_admin_dashboard_stats'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE WARNING '[H-5] rpc_admin_dashboard_stats not found — skipping';
    RETURN;
  END IF;

  -- Skip if already has admin gate
  IF v_body ILIKE '%Not authenticated%' THEN
    RAISE NOTICE '[H-5] rpc_admin_dashboard_stats: already has auth gate — skip';
    RETURN;
  END IF;

  -- Inject auth + admin gate after BEGIN
  v_new := regexp_replace(
    v_body,
    E'(\\r?\\n)([ \\t]*BEGIN[ \\t]*)(\\r?\\n)',
    E'\\1\\2\\3  IF auth.uid() IS NULL THEN\\3    RAISE EXCEPTION ''Not authenticated'';\\3  END IF;\\3  IF NOT public.is_current_user_admin() THEN\\3    RAISE EXCEPTION ''Forbidden: admin only'';\\3  END IF;\\3',
    'i'
  );

  IF v_new = v_body THEN
    v_new := regexp_replace(
      v_body,
      E'(\\bBEGIN\\b)(\\s*\\n)',
      E'\\1\\2  IF auth.uid() IS NULL THEN RAISE EXCEPTION ''Not authenticated''; END IF;\\2  IF NOT public.is_current_user_admin() THEN RAISE EXCEPTION ''Forbidden: admin only''; END IF;\\2',
      'i'
    );
  END IF;

  IF v_new = v_body THEN
    RAISE WARNING '[H-5] rpc_admin_dashboard_stats: regex did not match — skipping';
    RETURN;
  END IF;

  EXECUTE format('DROP FUNCTION public.rpc_admin_dashboard_stats(%s)', v_iargs);

  EXECUTE format(
    'CREATE FUNCTION public.rpc_admin_dashboard_stats(%s) RETURNS %s LANGUAGE %s %s %s SECURITY DEFINER SET search_path = public AS %L',
    v_fargs, v_ret, v_lang,
    CASE v_vol
      WHEN 'v' THEN 'VOLATILE'
      WHEN 's' THEN 'STABLE'
      WHEN 'i' THEN 'IMMUTABLE'
    END,
    CASE WHEN v_strict THEN 'STRICT' ELSE '' END,
    v_new
  );

  EXECUTE format(
    'REVOKE ALL ON FUNCTION public.rpc_admin_dashboard_stats(%s) FROM PUBLIC, anon',
    v_iargs
  );
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION public.rpc_admin_dashboard_stats(%s) TO authenticated',
    v_iargs
  );

  RAISE NOTICE '[H-5] rpc_admin_dashboard_stats — auth + admin gate injected';
END;
$outer$;


-- ============================================================
-- VERIFICATION — paste separately after "Success"
-- ============================================================
--
-- 1. Test functions dropped (expect 0 rows):
--    SELECT proname FROM pg_proc p
--    JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND proname IN (
--        'example_bh_rpc',
--        'test_global_question_visibility',
--        'test_student_question_visibility'
--      );
--    -- Expect: 0 rows
--
--
-- 2. Internal functions locked (expect 0 rows):
--    SELECT p.proname, array_to_string(p.proacl, ', ') AS grants
--    FROM pg_proc p
--    JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN (
--        'block_direct_school_id_updates',
--        'handle_new_user',
--        'ielts_audit',
--        'ielts_memberships_expire_job',
--        'sync_auth_users_to_ielts',
--        'init_school_pilot_usage'
--      )
--      AND (   array_to_string(p.proacl, ',') ILIKE '%authenticated%'
--           OR array_to_string(p.proacl, ',') ILIKE '%anon%' );
--    -- Expect: 0 rows
--
--
-- 3. Anon access eliminated (expect only 5 rows):
--    SELECT p.proname
--    FROM pg_proc p
--    JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.prosecdef = true
--      AND (   p.proacl IS NULL
--           OR array_to_string(p.proacl, ',') ILIKE '%anon%' )
--    ORDER BY p.proname;
--    -- Expect: exactly 5 rows:
--    --   get_available_schools
--    --   rpc_adm_save_answer
--    --   rpc_adm_start_attempt
--    --   rpc_adm_submit_attempt
--    --   validate_invite_code
--
--
-- 4. Auth gates present in critical functions (expect all TRUE):
--    SELECT p.proname,
--           p.prosrc ILIKE '%Not authenticated%' AS has_auth
--    FROM pg_proc p
--    JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN (
--        'release_quiz_score',
--        'rpc_adm_close_form',
--        'rpc_adm_publish_form',
--        'rpc_adm_record_placement',
--        'rpc_create_assignment',
--        'rpc_submit_assignment_result',
--        'rpc_admin_dashboard_stats',
--        'brains_heist_get_performance_summary',
--        'brains_heist_get_progress_map',
--        'get_students_in_teacher_classes'
--      );
--    -- Expect: has_auth = true for all
--
--
-- 5. rpc_admin_dashboard_stats has admin gate (expect true):
--    SELECT p.proname,
--           p.prosrc ILIKE '%admin only%' AS has_admin_gate
--    FROM pg_proc p
--    JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname = 'rpc_admin_dashboard_stats';
--    -- Expect: has_admin_gate = true
--
-- ============================================================
