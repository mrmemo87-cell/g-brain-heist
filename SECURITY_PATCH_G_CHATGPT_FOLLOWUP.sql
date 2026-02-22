-- ============================================================
-- SECURITY PATCH G — ChatGPT Follow-up Findings
-- ============================================================
-- Paste the ENTIRE file in one go in the Supabase SQL Editor.
-- If you see "Success" you are done.
--
-- What this fixes:
--
-- SECTION 1 — rpc_adm_consume_quota (Priority 0)
--   Was wide open: any user could burn any school's quota.
--   Now requires auth + the caller must belong to the school
--   (or be a superadmin).
--
-- SECTION 2 — Full REVOKE on 8 internal-only functions
--   Upgrades Patch F partial revokes to full lockdown for:
--     • 5 PvP notify functions (not used from frontend)
--     • log_user_activity / log_user_activity_enhanced
--     • get_user_complete_profile
--
-- SECTION 3 — Self-only enforcement on notify_ap_full +
--   notify_level_up.  Patch F added auth gate; this now
--   forces user_id_param := auth.uid() so users can only
--   send notifications to themselves.
--
-- SECTION 4 — rpc_hack_attempt school isolation (Priority 1)
--   The live 2-arg version already has role checks, ban checks,
--   cooldown, AP enforcement, and idempotency.
--   This adds the one missing guard: attackers and defenders
--   must be in the same school.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- SECTION 1: rpc_adm_consume_quota
-- Drop + recreate with auth + school membership gate
-- ════════════════════════════════════════════════════════════
DO $outer$
DECLARE
  v_iargs text;
BEGIN
  -- Drop ALL existing overloads safely
  FOR v_iargs IN
    SELECT pg_get_function_identity_arguments(p.oid)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_adm_consume_quota'
  LOOP
    EXECUTE format('DROP FUNCTION public.rpc_adm_consume_quota(%s)', v_iargs);
  END LOOP;
END;
$outer$;

CREATE FUNCTION public.rpc_adm_consume_quota(
  p_school_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
BEGIN
  -- [Patch G] Auth gate
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Derive school from caller if not provided
  v_school_id := COALESCE(
    p_school_id,
    (SELECT school_id FROM users WHERE id = auth.uid())
  );

  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'No school found for caller';
  END IF;

  -- [Patch G] Caller must belong to this school (or be superadmin)
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND school_id = v_school_id
  ) AND NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: not a member of this school';
  END IF;

  UPDATE school_pilot_usage
  SET used_count = used_count + 1, updated_at = NOW()
  WHERE school_id = v_school_id AND feature_id = 'admission_tests';
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_adm_consume_quota(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_adm_consume_quota(UUID) TO authenticated;


-- ════════════════════════════════════════════════════════════
-- SECTION 2: Full REVOKE on 8 internal-only functions
-- Upgrades Patch F partial revokes to complete lockdown.
-- These are NEVER called from the frontend.
-- ════════════════════════════════════════════════════════════
DO $outer$
DECLARE
  v_func  text;
  v_iargs text;
  v_count int := 0;
BEGIN
  FOREACH v_func IN ARRAY ARRAY[
    -- PvP notify functions (unused from frontend, only in rpcGateway exports)
    'notify_attack_incoming',
    'notify_coins_lost',
    'notify_revenge_available',
    'notify_attack_defended',
    'notify_low_ap',
    -- Internal logging / profile functions
    'log_user_activity',
    'log_user_activity_enhanced',
    'get_user_complete_profile'
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
  RAISE NOTICE '[G-2] Fully locked down % internal-only function overload(s)', v_count;
END;
$outer$;


-- ════════════════════════════════════════════════════════════
-- SECTION 3: notify_ap_full + notify_level_up — self-only
-- Patch F already injected auth gate. This adds:
--   user_id_param := auth.uid();
-- so users can only notify THEMSELVES.
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
    'notify_level_up'
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
      -- Skip if already has self-only enforcement
      IF v_body ILIKE '%force self-only%' THEN
        RAISE NOTICE '[G-3] %(%): already has self-only — skip', v_func, v_iargs;
        CONTINUE;
      END IF;

      -- Inject self-only enforcement after the auth gate's END IF
      -- Pattern: "RAISE EXCEPTION 'Not authenticated';" → "END IF;" → inject after
      v_new := regexp_replace(
        v_body,
        E'(RAISE\\s+EXCEPTION\\s+''Not authenticated'';\\s*\\n\\s*END\\s+IF;)(\\s*\\n)',
        E'\\1\\2  user_id_param := auth.uid();  -- [Patch G] force self-only\\2',
        'i'
      );

      IF v_new = v_body THEN
        -- Fallback: try injecting after the BEGIN + auth gate as a block
        v_new := regexp_replace(
          v_body,
          E'(\\bBEGIN\\b)(\\s*\\n)',
          E'\\1\\2  IF auth.uid() IS NULL THEN RAISE EXCEPTION ''Not authenticated''; END IF;\\2  user_id_param := auth.uid();  -- [Patch G] force self-only\\2',
          'i'
        );
      END IF;

      IF v_new = v_body THEN
        RAISE WARNING '[G-3] %: regex did not match — skipping', v_func;
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
      RAISE NOTICE '[G-3] % — self-only gate injected', v_func;
    END LOOP;
  END LOOP;

  RAISE NOTICE '[G-3] Total: % function(s) patched with self-only', v_count;
END;
$outer$;


-- ════════════════════════════════════════════════════════════
-- SECTION 4: rpc_hack_attempt — school isolation
-- The live function already has role checks, ban checks,
-- cooldown, AP enforcement, and idempotency.
-- This injects: attacker and defender must be in same school.
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
  WHERE n.nspname = 'public' AND p.proname = 'rpc_hack_attempt'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE WARNING '[G-4] rpc_hack_attempt not found — skipping';
    RETURN;
  END IF;

  -- Skip if already patched
  IF v_body ILIKE '%cross_school_attack%' THEN
    RAISE NOTICE '[G-4] rpc_hack_attempt: already has school isolation — skip';
    RETURN;
  END IF;

  -- Inject school isolation check right after "Invalid defender" check.
  -- Match: raise exception 'Invalid defender'; ... end if;
  -- Inject: school_id comparison.
  v_new := regexp_replace(
    v_body,
    E'(raise\\s+exception\\s+''Invalid defender'';\\s*\\n\\s*end\\s+if;)(\\s*\\n)',
    E'\\1\\2\\2  -- [Patch G] School isolation — cannot attack across schools\\2  IF (SELECT school_id FROM users WHERE id = v_attacker_id)\\2     IS DISTINCT FROM\\2     (SELECT school_id FROM users WHERE id = p_defender_id)\\2  THEN\\2    RAISE EXCEPTION ''cross_school_attack'';\\2  END IF;\\2',
    'i'
  );

  IF v_new = v_body THEN
    RAISE WARNING '[G-4] rpc_hack_attempt: regex did not match "Invalid defender" — skipping';
    RETURN;
  END IF;

  EXECUTE format('DROP FUNCTION public.rpc_hack_attempt(%s)', v_iargs);

  EXECUTE format(
    'CREATE FUNCTION public.rpc_hack_attempt(%s) RETURNS %s LANGUAGE %s %s %s SECURITY DEFINER SET search_path = public AS %L',
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
    'REVOKE ALL ON FUNCTION public.rpc_hack_attempt(%s) FROM PUBLIC, anon',
    v_iargs
  );
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION public.rpc_hack_attempt(%s) TO authenticated',
    v_iargs
  );

  RAISE NOTICE '[G-4] rpc_hack_attempt — school isolation injected';
END;
$outer$;


-- ============================================================
-- VERIFICATION — paste separately after "Success"
-- ============================================================
--
-- 1. rpc_adm_consume_quota has auth + school gate (expect has_auth = true):
--    SELECT p.proname,
--           p.prosrc ILIKE '%Not authenticated%' AS has_auth,
--           p.prosrc ILIKE '%not a member of this school%' AS has_school_gate
--    FROM pg_proc p
--    JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname = 'rpc_adm_consume_quota';
--    -- Expect: has_auth = true, has_school_gate = true
--
--
-- 2. Internal-only functions fully locked (expect 0 rows):
--    SELECT p.proname,
--           array_to_string(p.proacl, ', ') AS grants
--    FROM pg_proc p
--    JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN (
--        'notify_attack_incoming',
--        'notify_coins_lost',
--        'notify_revenge_available',
--        'notify_attack_defended',
--        'notify_low_ap',
--        'log_user_activity',
--        'log_user_activity_enhanced',
--        'get_user_complete_profile'
--      )
--      AND (   array_to_string(p.proacl, ',') ILIKE '%authenticated%'
--           OR array_to_string(p.proacl, ',') ILIKE '%anon%'  );
--    -- Expect: 0 rows (fully locked)
--
--
-- 3. notify_ap_full + notify_level_up have self-only (expect both true):
--    SELECT p.proname,
--           p.prosrc ILIKE '%force self-only%' AS has_self_only
--    FROM pg_proc p
--    JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN ('notify_ap_full', 'notify_level_up');
--    -- Expect: has_self_only = true for both
--
--
-- 4. rpc_hack_attempt has school isolation (expect true):
--    SELECT p.proname,
--           p.prosrc ILIKE '%cross_school_attack%' AS has_school_gate
--    FROM pg_proc p
--    JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname = 'rpc_hack_attempt';
--    -- Expect: has_school_gate = true
--
-- ============================================================
