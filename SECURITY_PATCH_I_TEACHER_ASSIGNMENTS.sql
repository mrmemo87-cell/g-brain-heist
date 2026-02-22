-- ============================================================
-- SECURITY PATCH I — Auth gate for rpc_get_assignments_for_teacher
-- ============================================================
-- This is a LANGUAGE sql function that Patch H Section 4 could
-- not inject an auth gate into (same issue as brains_heist funcs).
--
-- The function uses auth.uid() as a filter so authenticated
-- non-teachers get empty results, but for defense-in-depth
-- we convert to plpgsql and add a proper auth gate.
-- ============================================================

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
  WHERE n.nspname = 'public'
    AND p.proname = 'rpc_get_assignments_for_teacher'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE WARNING '[I] rpc_get_assignments_for_teacher not found — skipping';
    RETURN;
  END IF;

  -- Already patched?
  IF v_body ILIKE '%Not authenticated%' THEN
    RAISE NOTICE '[I] rpc_get_assignments_for_teacher: already has auth gate — skip';
    RETURN;
  END IF;

  -- Strip trailing whitespace + semicolons
  v_body := regexp_replace(v_body, E'[;\\s]+$', '');

  -- Build new PL/pgSQL body wrapping the original SQL
  v_new := E'\nBEGIN\n'
        || E'  IF auth.uid() IS NULL THEN\n'
        || E'    RAISE EXCEPTION ''Not authenticated'';\n'
        || E'  END IF;\n'
        || E'  RETURN QUERY\n'
        || v_body || E';\n'
        || E'END;\n';

  EXECUTE format('DROP FUNCTION public.rpc_get_assignments_for_teacher(%s)', v_iargs);

  EXECUTE format(
    'CREATE FUNCTION public.rpc_get_assignments_for_teacher(%s) RETURNS %s LANGUAGE plpgsql %s %s SECURITY DEFINER SET search_path = public AS %L',
    v_fargs, v_ret,
    CASE v_vol
      WHEN 'v' THEN 'VOLATILE'
      WHEN 's' THEN 'STABLE'
      WHEN 'i' THEN 'IMMUTABLE'
    END,
    CASE WHEN v_strict THEN 'STRICT' ELSE '' END,
    v_new
  );

  EXECUTE format(
    'REVOKE ALL ON FUNCTION public.rpc_get_assignments_for_teacher(%s) FROM PUBLIC, anon',
    v_iargs
  );
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION public.rpc_get_assignments_for_teacher(%s) TO authenticated',
    v_iargs
  );

  RAISE NOTICE '[I] rpc_get_assignments_for_teacher — converted to plpgsql + auth gate injected';
END;
$outer$;

-- ============================================================
-- VERIFICATION (run after "Success"):
--
-- SELECT p.proname, l.lanname,
--        p.prosrc ILIKE '%Not authenticated%' AS has_auth
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- JOIN pg_language l  ON l.oid = p.prolang
-- WHERE n.nspname = 'public'
--   AND p.proname = 'rpc_get_assignments_for_teacher';
-- -- Expect: lanname = plpgsql, has_auth = true
-- ============================================================
