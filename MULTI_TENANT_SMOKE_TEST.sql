-- Multi-tenant smoke tests (schema + policy presence)
-- Safe to run in Supabase SQL Editor (no auth.uid simulation required).

-- 1) Tables exist
SELECT
  to_regclass('public.schools')          AS schools_table,
  to_regclass('public.school_members')   AS school_members_table,
  to_regclass('public.school_requests')  AS school_requests_table,
  to_regclass('public.invite_code_attempts') AS invite_code_attempts_table,
  to_regclass('public.superadmins')      AS superadmins_table;

-- 2) RLS enabled where expected
SELECT
  c.relname,
  c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('schools','school_members','school_requests','invite_code_attempts');

-- 3) Key policies present
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('schools','school_members','school_requests','invite_code_attempts')
ORDER BY tablename, policyname;

-- 4) Key functions present
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'is_superadmin',
    'normalize_school_name',
    'profile_bootstrap',
    'get_available_schools',
    'check_user_setup_status',
    'validate_invite_code',
    'join_school_by_code',
    'teacher_create_school',
    'request_school',
    'get_school_leaderboard',
    'rotate_school_invite_code',
    'leave_school'
  )
ORDER BY p.proname, args;

-- 5) Index sanity (optional)
SELECT
  tablename,
  indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('schools','school_members','school_requests','invite_code_attempts')
ORDER BY tablename, indexname;
