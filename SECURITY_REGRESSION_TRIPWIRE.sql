-- ============================================================
-- SECURITY REGRESSION TRIPWIRE
-- ============================================================
-- Run this after ANY migration, function edit, or deployment.
-- If every check says PASS, your security posture from
-- Patches A → H is intact.
--
-- Any FAIL row = something regressed. Investigate immediately.
--
-- Usage: paste the entire file in Supabase SQL Editor.
-- Expected result: a single table with all rows showing PASS.
-- ============================================================

WITH checks AS (

  -- ═══════════════════════════════════════════════════════
  -- PATCH A — Duplicate function overloads dropped
  -- ═══════════════════════════════════════════════════════
  SELECT 'A-1: No duplicate overloads for rpc_hack_attempt' AS check_name,
    CASE WHEN (
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'rpc_hack_attempt'
    ) <= 1 THEN 'PASS' ELSE 'FAIL' END AS result

  UNION ALL

  -- ═══════════════════════════════════════════════════════
  -- PATCH B — SECURITY DEFINER functions have search_path
  -- (spot-check 5 critical functions)
  -- ═══════════════════════════════════════════════════════
  SELECT 'B-1: SECURITY DEFINER funcs have search_path set' AS check_name,
    CASE WHEN (
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.prosecdef = true
        AND p.proname IN (
          'rpc_hack_attempt',
          'rpc_create_clan',
          'rpc_admin_dashboard_stats',
          'rpc_submit_mcq_answer',
          'rpc_create_assignment'
        )
        AND (p.proconfig IS NULL
             OR NOT EXISTS (
               SELECT 1 FROM unnest(p.proconfig) c
               WHERE c ILIKE 'search_path%'
             ))
    ) = 0 THEN 'PASS' ELSE 'FAIL' END AS result

  UNION ALL

  -- ═══════════════════════════════════════════════════════
  -- PATCH D — Hardcoded IELTS UUID no longer used as
  -- fallback (ielts_actor_uid ignores the parameter)
  -- ═══════════════════════════════════════════════════════
  SELECT 'D-1: ielts_actor_uid has no hardcoded UUID fallback' AS check_name,
    CASE WHEN (
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'ielts_actor_uid'
        AND p.prosrc ILIKE '%d3ce5bf4-423a-4b2d-9efe-62311fad4be9%'
        AND p.prosrc NOT ILIKE '%-- dead code%'
    ) = 0 THEN 'PASS' ELSE 'FAIL' END AS result

  UNION ALL

  -- ═══════════════════════════════════════════════════════
  -- PATCH F — Notify functions have self-only enforcement
  -- ═══════════════════════════════════════════════════════
  SELECT 'F-1: notify_ap_full has self-only enforcement' AS check_name,
    CASE WHEN (
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'notify_ap_full'
        AND p.prosrc ILIKE '%auth.uid()%'
    ) > 0 THEN 'PASS' ELSE 'FAIL' END AS result

  UNION ALL

  SELECT 'F-2: notify_level_up has self-only enforcement' AS check_name,
    CASE WHEN (
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'notify_level_up'
        AND p.prosrc ILIKE '%auth.uid()%'
    ) > 0 THEN 'PASS' ELSE 'FAIL' END AS result

  UNION ALL

  -- ═══════════════════════════════════════════════════════
  -- PATCH G — rpc_hack_attempt has school isolation
  -- ═══════════════════════════════════════════════════════
  SELECT 'G-1: rpc_hack_attempt has school isolation' AS check_name,
    CASE WHEN (
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'rpc_hack_attempt'
        AND p.prosrc ILIKE '%cross_school_attack%'
    ) > 0 THEN 'PASS' ELSE 'FAIL' END AS result

  UNION ALL

  SELECT 'G-2: rpc_adm_consume_quota has auth gate' AS check_name,
    CASE WHEN (
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'rpc_adm_consume_quota'
        AND p.prosrc ILIKE '%Not authenticated%'
    ) > 0 THEN 'PASS' ELSE 'FAIL' END AS result

  UNION ALL

  -- ═══════════════════════════════════════════════════════
  -- PATCH H SEC 1 — Test/example functions dropped
  -- ═══════════════════════════════════════════════════════
  SELECT 'H1-1: test/example functions do not exist' AS check_name,
    CASE WHEN (
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN (
          'example_bh_rpc',
          'test_global_question_visibility',
          'test_student_question_visibility'
        )
    ) = 0 THEN 'PASS' ELSE 'FAIL' END AS result

  UNION ALL

  -- ═══════════════════════════════════════════════════════
  -- PATCH H SEC 2 — Internal/trigger functions locked
  -- (no anon or authenticated grants)
  -- ═══════════════════════════════════════════════════════
  SELECT 'H2-1: trigger functions locked from anon+authenticated' AS check_name,
    CASE WHEN (
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN (
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
        )
        AND (
          array_to_string(p.proacl, ',') ILIKE '%authenticated%'
          OR array_to_string(p.proacl, ',') ILIKE '%anon%'
        )
    ) = 0 THEN 'PASS' ELSE 'FAIL' END AS result

  UNION ALL

  -- Also check Patch G revoked functions
  SELECT 'H2-2: PvP notify + internal functions locked' AS check_name,
    CASE WHEN (
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN (
          'notify_attack_incoming',
          'notify_coins_lost',
          'notify_revenge_available',
          'notify_attack_defended',
          'log_user_activity',
          'get_user_complete_profile'
        )
        AND (
          array_to_string(p.proacl, ',') ILIKE '%anon%'
        )
    ) = 0 THEN 'PASS' ELSE 'FAIL' END AS result

  UNION ALL

  -- ═══════════════════════════════════════════════════════
  -- PATCH H SEC 3 — Anon access limited to exactly 5
  -- SECURITY DEFINER functions
  -- ═══════════════════════════════════════════════════════
  SELECT 'H3-1: anon access limited to ≤5 SECURITY DEFINER funcs' AS check_name,
    CASE WHEN (
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.prosecdef = true
        AND (
          p.proacl IS NULL
          OR array_to_string(p.proacl, ',') ILIKE '%anon%'
        )
    ) <= 5 THEN 'PASS' ELSE 'FAIL' END AS result

  UNION ALL

  SELECT 'H3-2: allowed anon funcs are only the expected 5' AS check_name,
    CASE WHEN (
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.prosecdef = true
        AND (
          p.proacl IS NULL
          OR array_to_string(p.proacl, ',') ILIKE '%anon%'
        )
        AND p.proname NOT IN (
          'rpc_adm_save_answer',
          'rpc_adm_start_attempt',
          'rpc_adm_submit_attempt',
          'validate_invite_code',
          'get_available_schools'
        )
    ) = 0 THEN 'PASS' ELSE 'FAIL' END AS result

  UNION ALL

  -- ═══════════════════════════════════════════════════════
  -- PATCH H SEC 4 — Auth gates on 14 critical functions
  -- (check for 'Not authenticated' in body)
  -- ═══════════════════════════════════════════════════════
  SELECT 'H4-1: auth gate on write functions' AS check_name,
    CASE WHEN (
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN (
          'release_quiz_score',
          'rpc_adm_close_form',
          'rpc_adm_publish_form',
          'rpc_adm_record_placement',
          'rpc_adm_check_entitlement',
          'rpc_create_assignment',
          'rpc_submit_assignment_result'
        )
        AND p.prosrc NOT ILIKE '%Not authenticated%'
    ) = 0 THEN 'PASS' ELSE 'FAIL' END AS result

  UNION ALL

  SELECT 'H4-2: auth gate on read functions' AS check_name,
    CASE WHEN (
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN (
          'rpc_get_assignment_question_analysis',
          'rpc_get_assignment_student_answers',
          'rpc_get_assignments_for_teacher',
          'rpc_teacher_assignment_report',
          'get_students_in_teacher_classes'
        )
        AND p.prosrc NOT ILIKE '%Not authenticated%'
    ) = 0 THEN 'PASS' ELSE 'FAIL' END AS result

  UNION ALL

  -- Patch H1 hotfix — the 2 SQL-to-plpgsql converted functions
  SELECT 'H4-3: auth gate on brains_heist functions (H1 hotfix)' AS check_name,
    CASE WHEN (
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN (
          'brains_heist_get_performance_summary',
          'brains_heist_get_progress_map'
        )
        AND p.prosrc NOT ILIKE '%Not authenticated%'
    ) = 0 THEN 'PASS' ELSE 'FAIL' END AS result

  UNION ALL

  -- ═══════════════════════════════════════════════════════
  -- PATCH H SEC 5 — rpc_admin_dashboard_stats has admin gate
  -- ═══════════════════════════════════════════════════════
  SELECT 'H5-1: rpc_admin_dashboard_stats has auth + admin gate' AS check_name,
    CASE WHEN (
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'rpc_admin_dashboard_stats'
        AND p.prosrc ILIKE '%Not authenticated%'
        AND p.prosrc ILIKE '%admin only%'
    ) > 0 THEN 'PASS' ELSE 'FAIL' END AS result

  UNION ALL

  -- ═══════════════════════════════════════════════════════
  -- GENERAL — No SECURITY DEFINER function with NULL ACL
  -- (NULL = default PUBLIC grant = wide open)
  -- Only the 5 allowed anon functions may have NULL ACL
  -- ═══════════════════════════════════════════════════════
  SELECT 'GEN-1: no SECURITY DEFINER func with NULL ACL (except allowed 5)' AS check_name,
    CASE WHEN (
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.prosecdef = true
        AND p.proacl IS NULL
        AND p.proname NOT IN (
          'rpc_adm_save_answer',
          'rpc_adm_start_attempt',
          'rpc_adm_submit_attempt',
          'validate_invite_code',
          'get_available_schools'
        )
    ) = 0 THEN 'PASS' ELSE 'FAIL' END AS result

  UNION ALL

  -- ═══════════════════════════════════════════════════════
  -- GENERAL — IELTS admin functions have admin_roles check
  -- ═══════════════════════════════════════════════════════
  SELECT 'GEN-2: IELTS admin functions have admin guard' AS check_name,
    CASE WHEN (
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname LIKE 'admin_ielts_%'
        AND p.prosrc NOT ILIKE '%admin_roles%'
        AND p.prosrc NOT ILIKE '%is_ielts_admin%'
    ) = 0 THEN 'PASS' ELSE 'FAIL' END AS result

  UNION ALL

  -- ═══════════════════════════════════════════════════════
  -- GENERAL — Superadmin functions have is_superadmin check
  -- ═══════════════════════════════════════════════════════
  SELECT 'GEN-3: rpc_admin_* functions have superadmin guard' AS check_name,
    CASE WHEN (
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname LIKE 'rpc_admin_%'
        AND p.proname <> 'rpc_admin_dashboard_stats'  -- uses is_current_user_admin
        AND p.prosrc NOT ILIKE '%is_superadmin%'
        AND p.prosrc NOT ILIKE '%is_current_user_admin%'
        AND p.prosrc NOT ILIKE '%superadmins%'
        AND p.prosrc NOT ILIKE '%is_admin%'
    ) = 0 THEN 'PASS' ELSE 'FAIL' END AS result

  UNION ALL

  -- ═══════════════════════════════════════════════════════
  -- GENERAL — rpc_hack_attempt has all critical guards
  -- ═══════════════════════════════════════════════════════
  SELECT 'GEN-4: rpc_hack_attempt has ban check' AS check_name,
    CASE WHEN (
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'rpc_hack_attempt'
        AND p.prosrc ILIKE '%banned%'
    ) > 0 THEN 'PASS' ELSE 'FAIL' END AS result

  UNION ALL

  SELECT 'GEN-5: rpc_hack_attempt has cooldown' AS check_name,
    CASE WHEN (
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'rpc_hack_attempt'
        AND p.prosrc ILIKE '%cooldown%'
    ) > 0 THEN 'PASS' ELSE 'FAIL' END AS result

  UNION ALL

  SELECT 'GEN-6: rpc_hack_attempt has AP enforcement' AS check_name,
    CASE WHEN (
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'rpc_hack_attempt'
        AND p.prosrc ILIKE '%c_ap_cost%'
    ) > 0 THEN 'PASS' ELSE 'FAIL' END AS result

  -- === PATCH J: School Admin Portal Hardening ===

  UNION ALL

  SELECT 'J-1: All 11 Patch J RPCs exist' AS check_name,
    CASE WHEN (
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN (
          'school_admin_list_classes',
          'school_admin_save_class',
          'school_admin_archive_class',
          'school_admin_list_teacher_assignments',
          'school_admin_delete_teacher_assignment',
          'school_admin_list_class_students',
          'school_admin_list_teachers',
          'school_admin_list_subjects',
          'school_admin_create_subject',
          'school_admin_update_subject',
          'school_admin_delete_subject'
        )
    ) = 11 THEN 'PASS' ELSE 'FAIL' END AS result

  UNION ALL

  SELECT 'J-2: All Patch J RPCs have auth gate' AS check_name,
    CASE WHEN (
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname LIKE 'school_admin_%'
        AND p.proname IN (
          'school_admin_list_classes',
          'school_admin_save_class',
          'school_admin_archive_class',
          'school_admin_list_teacher_assignments',
          'school_admin_delete_teacher_assignment',
          'school_admin_list_class_students',
          'school_admin_list_teachers',
          'school_admin_list_subjects',
          'school_admin_create_subject',
          'school_admin_update_subject',
          'school_admin_delete_subject'
        )
        AND p.prosrc ILIKE '%auth.uid()%IS NULL%'
    ) = 11 THEN 'PASS' ELSE 'FAIL' END AS result

  UNION ALL

  SELECT 'J-3: All Patch J RPCs have school_admin gate' AS check_name,
    CASE WHEN (
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN (
          'school_admin_list_classes',
          'school_admin_save_class',
          'school_admin_archive_class',
          'school_admin_list_teacher_assignments',
          'school_admin_delete_teacher_assignment',
          'school_admin_list_class_students',
          'school_admin_list_teachers',
          'school_admin_list_subjects',
          'school_admin_create_subject',
          'school_admin_update_subject',
          'school_admin_delete_subject'
        )
        AND p.prosrc ILIKE '%is_school_admin_of%'
    ) = 11 THEN 'PASS' ELSE 'FAIL' END AS result

  UNION ALL

  SELECT 'J-4: All Patch J RPCs are SECURITY DEFINER with search_path' AS check_name,
    CASE WHEN (
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN (
          'school_admin_list_classes',
          'school_admin_save_class',
          'school_admin_archive_class',
          'school_admin_list_teacher_assignments',
          'school_admin_delete_teacher_assignment',
          'school_admin_list_class_students',
          'school_admin_list_teachers',
          'school_admin_list_subjects',
          'school_admin_create_subject',
          'school_admin_update_subject',
          'school_admin_delete_subject'
        )
        AND p.prosecdef = true
        AND p.proconfig @> ARRAY['search_path=public']
    ) = 11 THEN 'PASS' ELSE 'FAIL' END AS result

  UNION ALL

  SELECT 'J-5: All Patch J RPCs revoked from anon' AS check_name,
    CASE WHEN (
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN (
          'school_admin_list_classes',
          'school_admin_save_class',
          'school_admin_archive_class',
          'school_admin_list_teacher_assignments',
          'school_admin_delete_teacher_assignment',
          'school_admin_list_class_students',
          'school_admin_list_teachers',
          'school_admin_list_subjects',
          'school_admin_create_subject',
          'school_admin_update_subject',
          'school_admin_delete_subject'
        )
        AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
    ) = 11 THEN 'PASS' ELSE 'FAIL' END AS result

)

SELECT check_name, result
FROM checks
ORDER BY check_name;
