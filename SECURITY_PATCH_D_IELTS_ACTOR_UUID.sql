-- ============================================================
-- SECURITY PATCH D — Remove hardcoded IELTS admin UUID fallback
-- ============================================================
--
-- VULNERABILITY
-- ~~~~~~~~~~~~~
-- 10 IELTS admin functions fall back to a hardcoded UUID
-- ('d3ce5bf4-423a-4b2d-9efe-62311fad4be9') when auth.uid()
-- is NULL.  An unauthenticated caller (e.g. service-role,
-- bypassed auth) silently impersonates that admin account.
--
-- AFFECTED
-- ~~~~~~~~
--   Helper (fixes 6 callers automatically)
--     1. ielts_actor_uid
--
--   Called through the helper (auto-fixed by Part 1):
--     2. admin_ielts_mark_notification_sent
--     3. admin_ielts_set_user_tags
--     4. admin_ielts_add_note
--     5. admin_ielts_note_delete
--     6. admin_ielts_reset_progress
--     7. admin_ielts_violation_set_status
--
--   Inline COALESCE (fixed by Part 2):
--     8. admin_ielts_membership_grant
--     9. admin_ielts_membership_extend
--    10. admin_ielts_membership_revoke
--    11. admin_ielts_prime_approve_and_grant
--
-- FIX
-- ~~~
-- Replace every COALESCE(auth.uid(), '<hardcoded>') with
--   auth.uid()  +  RAISE EXCEPTION 'not_authenticated'
-- when auth.uid() IS NULL.
--
-- HOW TO RUN
-- ~~~~~~~~~~
-- Paste the ENTIRE file in one go in the Supabase SQL Editor.
-- If you see "Success" you are done.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- PART 1: Patch ielts_actor_uid helper
-- Automatically secures the 6 functions that call through it.
-- ────────────────────────────────────────────────────────────
DO $outer$
DECLARE
  v_iargs text;   -- identity args  (for DROP / GRANT)
  v_fargs text;   -- full args      (for CREATE)
  v_ret   text;   -- return type
BEGIN
  SELECT pg_get_function_identity_arguments(p.oid),
         pg_get_function_arguments(p.oid),
         pg_get_function_result(p.oid)
    INTO v_iargs, v_fargs, v_ret
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'ielts_actor_uid'
  LIMIT 1;

  IF v_iargs IS NULL THEN
    RAISE NOTICE '[D-1] ielts_actor_uid not found — skipping';
    RETURN;
  END IF;

  EXECUTE format('DROP FUNCTION public.ielts_actor_uid(%s)', v_iargs);

  EXECUTE format($cr$
    CREATE FUNCTION public.ielts_actor_uid(%s)
    RETURNS %s
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    BEGIN
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
      END IF;
      RETURN auth.uid();
      -- p_actor fallback intentionally removed (security patch D)
    END;
    $fn$
  $cr$, v_fargs, v_ret);

  EXECUTE format(
    'REVOKE ALL ON FUNCTION public.ielts_actor_uid(%s) FROM PUBLIC, anon',
    v_iargs
  );
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION public.ielts_actor_uid(%s) TO authenticated',
    v_iargs
  );

  RAISE NOTICE '[D-1] ielts_actor_uid patched';
END;
$outer$;


-- ────────────────────────────────────────────────────────────
-- PART 2a: Patch admin_ielts_membership_grant
-- ────────────────────────────────────────────────────────────
DO $outer$
DECLARE
  v_iargs text;
  v_fargs text;
  v_ret   text;
BEGIN
  SELECT pg_get_function_identity_arguments(p.oid),
         pg_get_function_arguments(p.oid),
         pg_get_function_result(p.oid)
    INTO v_iargs, v_fargs, v_ret
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'admin_ielts_membership_grant'
  LIMIT 1;

  IF v_iargs IS NULL THEN
    RAISE NOTICE '[D-2a] admin_ielts_membership_grant not found — skipping';
    RETURN;
  END IF;

  EXECUTE format('DROP FUNCTION public.admin_ielts_membership_grant(%s)', v_iargs);

  EXECUTE format($cr$
    CREATE FUNCTION public.admin_ielts_membership_grant(%s)
    RETURNS %s
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      v_expires timestamptz;
      v_actor   uuid;
    BEGIN
      v_actor := auth.uid();
      IF v_actor IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM public.admin_roles ar
        WHERE ar.user_id = v_actor AND ar.scope = 'ielts' AND ar.role = 'admin'
      ) THEN
        RAISE EXCEPTION 'not_ielts_admin';
      END IF;

      IF p_months IS NULL OR p_months <= 0 THEN
        RAISE EXCEPTION 'invalid_months';
      END IF;
      IF p_plan NOT IN ('monthly','quarterly','annually') THEN
        RAISE EXCEPTION 'invalid_plan';
      END IF;

      v_expires := now() + make_interval(months => p_months);

      INSERT INTO public.ielts_memberships(
        user_id, plan, status, starts_at, expires_at, created_by
      )
      VALUES (p_user_id, p_plan, 'active', now(), v_expires, v_actor);

      UPDATE public.ielts_users
        SET tier = 'prime_prep_user'
      WHERE id = p_user_id;

      PERFORM public.ielts_audit(
        'membership_grant', p_user_id, 'membership', NULL,
        jsonb_build_object(
          'plan', p_plan, 'months', p_months, 'expires_at', v_expires
        ),
        v_actor
      );

      RETURN jsonb_build_object('ok', true, 'expires_at', v_expires);
    END;
    $fn$
  $cr$, v_fargs, v_ret);

  RAISE NOTICE '[D-2a] admin_ielts_membership_grant patched';
END;
$outer$;


-- ────────────────────────────────────────────────────────────
-- PART 2b: Patch admin_ielts_membership_extend
-- ────────────────────────────────────────────────────────────
DO $outer$
DECLARE
  v_iargs text;
  v_fargs text;
  v_ret   text;
BEGIN
  SELECT pg_get_function_identity_arguments(p.oid),
         pg_get_function_arguments(p.oid),
         pg_get_function_result(p.oid)
    INTO v_iargs, v_fargs, v_ret
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'admin_ielts_membership_extend'
  LIMIT 1;

  IF v_iargs IS NULL THEN
    RAISE NOTICE '[D-2b] admin_ielts_membership_extend not found — skipping';
    RETURN;
  END IF;

  EXECUTE format('DROP FUNCTION public.admin_ielts_membership_extend(%s)', v_iargs);

  EXECUTE format($cr$
    CREATE FUNCTION public.admin_ielts_membership_extend(%s)
    RETURNS %s
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      v_latest_id bigint;
      v_base      timestamptz;
      v_new       timestamptz;
      v_actor     uuid;
    BEGIN
      v_actor := auth.uid();
      IF v_actor IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM public.admin_roles ar
        WHERE ar.user_id = v_actor AND ar.scope = 'ielts' AND ar.role = 'admin'
      ) THEN
        RAISE EXCEPTION 'not_ielts_admin';
      END IF;

      IF p_months IS NULL OR p_months <= 0 THEN
        RAISE EXCEPTION 'invalid_months';
      END IF;

      SELECT id, greatest(expires_at, now())
        INTO v_latest_id, v_base
      FROM public.ielts_memberships
      WHERE user_id = p_user_id AND status = 'active'
      ORDER BY expires_at DESC
      LIMIT 1;

      IF v_latest_id IS NULL THEN
        RAISE EXCEPTION 'no_active_membership';
      END IF;

      v_new := v_base + make_interval(months => p_months);

      UPDATE public.ielts_memberships SET expires_at = v_new WHERE id = v_latest_id;

      UPDATE public.ielts_users
        SET tier = 'prime_prep_user'
      WHERE id = p_user_id;

      PERFORM public.ielts_audit(
        'membership_extend', p_user_id, 'membership', v_latest_id::text,
        jsonb_build_object('months', p_months, 'new_expires_at', v_new),
        v_actor
      );

      RETURN jsonb_build_object('ok', true, 'expires_at', v_new);
    END;
    $fn$
  $cr$, v_fargs, v_ret);

  RAISE NOTICE '[D-2b] admin_ielts_membership_extend patched';
END;
$outer$;


-- ────────────────────────────────────────────────────────────
-- PART 2c: Patch admin_ielts_membership_revoke
-- ────────────────────────────────────────────────────────────
DO $outer$
DECLARE
  v_iargs text;
  v_fargs text;
  v_ret   text;
BEGIN
  SELECT pg_get_function_identity_arguments(p.oid),
         pg_get_function_arguments(p.oid),
         pg_get_function_result(p.oid)
    INTO v_iargs, v_fargs, v_ret
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'admin_ielts_membership_revoke'
  LIMIT 1;

  IF v_iargs IS NULL THEN
    RAISE NOTICE '[D-2c] admin_ielts_membership_revoke not found — skipping';
    RETURN;
  END IF;

  EXECUTE format('DROP FUNCTION public.admin_ielts_membership_revoke(%s)', v_iargs);

  EXECUTE format($cr$
    CREATE FUNCTION public.admin_ielts_membership_revoke(%s)
    RETURNS %s
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      v_count int;
      v_actor uuid;
    BEGIN
      v_actor := auth.uid();
      IF v_actor IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM public.admin_roles ar
        WHERE ar.user_id = v_actor AND ar.scope = 'ielts' AND ar.role = 'admin'
      ) THEN
        RAISE EXCEPTION 'not_ielts_admin';
      END IF;

      UPDATE public.ielts_memberships
        SET status = 'revoked',
            revoked_at = now(),
            revoked_reason = left(coalesce(p_reason, ''), 500)
      WHERE user_id = p_user_id AND status = 'active';

      GET DIAGNOSTICS v_count = ROW_COUNT;

      IF NOT EXISTS (
        SELECT 1 FROM public.ielts_memberships
        WHERE user_id = p_user_id AND status = 'active' AND expires_at > now()
      ) THEN
        UPDATE public.ielts_users SET tier = 'free' WHERE id = p_user_id;
      END IF;

      PERFORM public.ielts_audit(
        'membership_revoke', p_user_id, 'membership', NULL,
        jsonb_build_object(
          'revoked_count', v_count,
          'reason', left(coalesce(p_reason, ''), 500)
        ),
        v_actor
      );

      RETURN jsonb_build_object('ok', true, 'revoked_count', v_count);
    END;
    $fn$
  $cr$, v_fargs, v_ret);

  RAISE NOTICE '[D-2c] admin_ielts_membership_revoke patched';
END;
$outer$;


-- ────────────────────────────────────────────────────────────
-- PART 2d: Patch admin_ielts_prime_approve_and_grant
-- ────────────────────────────────────────────────────────────
DO $outer$
DECLARE
  v_iargs text;
  v_fargs text;
  v_ret   text;
BEGIN
  SELECT pg_get_function_identity_arguments(p.oid),
         pg_get_function_arguments(p.oid),
         pg_get_function_result(p.oid)
    INTO v_iargs, v_fargs, v_ret
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'admin_ielts_prime_approve_and_grant'
  LIMIT 1;

  IF v_iargs IS NULL THEN
    RAISE NOTICE '[D-2d] admin_ielts_prime_approve_and_grant not found — skipping';
    RETURN;
  END IF;

  EXECUTE format('DROP FUNCTION public.admin_ielts_prime_approve_and_grant(%s)', v_iargs);

  EXECUTE format($cr$
    CREATE FUNCTION public.admin_ielts_prime_approve_and_grant(%s)
    RETURNS %s
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      v_user_id uuid;
      v_actor   uuid;
      v_expires timestamptz;
    BEGIN
      v_actor := auth.uid();
      IF v_actor IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM public.admin_roles ar
        WHERE ar.user_id = v_actor AND ar.scope = 'ielts' AND ar.role = 'admin'
      ) THEN
        RAISE EXCEPTION 'not_ielts_admin';
      END IF;

      IF p_months IS NULL OR p_months <= 0 THEN
        RAISE EXCEPTION 'invalid_months';
      END IF;
      IF p_plan NOT IN ('monthly','quarterly','annually') THEN
        RAISE EXCEPTION 'invalid_plan';
      END IF;

      SELECT user_id INTO v_user_id
      FROM public.ielts_prime_applications
      WHERE id = p_application_id;

      IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'application_not_found';
      END IF;

      UPDATE public.ielts_prime_applications
        SET status = 'approved'
      WHERE id = p_application_id;

      v_expires := now() + make_interval(months => p_months);

      INSERT INTO public.ielts_memberships(
        user_id, plan, status, starts_at, expires_at, created_by
      )
      VALUES (v_user_id, p_plan, 'active', now(), v_expires, v_actor);

      UPDATE public.ielts_users
        SET tier = 'prime_prep_user'
      WHERE id = v_user_id;

      PERFORM public.ielts_audit(
        'prime_approve_and_grant', v_user_id, 'prime_application',
        p_application_id::text,
        jsonb_build_object(
          'plan', p_plan, 'months', p_months, 'expires_at', v_expires
        ),
        v_actor
      );

      RETURN jsonb_build_object(
        'ok', true, 'user_id', v_user_id, 'expires_at', v_expires
      );
    END;
    $fn$
  $cr$, v_fargs, v_ret);

  RAISE NOTICE '[D-2d] admin_ielts_prime_approve_and_grant patched';
END;
$outer$;


-- ────────────────────────────────────────────────────────────
-- PART 3: Lock down permissions on ALL admin_ielts_* functions
-- Revoke anon/public access, grant only to authenticated.
-- ────────────────────────────────────────────────────────────
DO $outer$
DECLARE
  r       RECORD;
  v_count int := 0;
BEGIN
  FOR r IN
    SELECT p.proname,
           pg_get_function_identity_arguments(p.oid) AS iargs
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'admin\_ielts\_%'
  LOOP
    BEGIN
      EXECUTE format(
        'REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon',
        r.proname, r.iargs
      );
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',
        r.proname, r.iargs
      );
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '[D-3] could not update perms on %: %', r.proname, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE '[D-3] permissions locked on % admin_ielts_* functions', v_count;
END;
$outer$;


-- ============================================================
-- VERIFICATION — paste separately after Success
-- ============================================================
--
-- 1. Hardcoded UUID gone (expect 0 rows):
--    SELECT proname
--    FROM pg_proc p
--    JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND prosrc ILIKE '%d3ce5bf4%';
--
-- 2. ielts_actor_uid now rejects NULL auth (expect 'not_authenticated' in body):
--    SELECT prosrc
--    FROM pg_proc p
--    JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'ielts_actor_uid';
--
-- 3. All 4 inline functions patched (expect 4, all with 'not_authenticated'):
--    SELECT proname,
--           prosrc ILIKE '%not_authenticated%' AS has_auth_check,
--           prosrc ILIKE '%d3ce5bf4%' AS has_hardcoded_uuid
--    FROM pg_proc p
--    JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND proname IN (
--        'admin_ielts_membership_grant',
--        'admin_ielts_membership_extend',
--        'admin_ielts_membership_revoke',
--        'admin_ielts_prime_approve_and_grant'
--      );
--    -- Expect: has_auth_check = true, has_hardcoded_uuid = false for all 4
--
-- ============================================================
