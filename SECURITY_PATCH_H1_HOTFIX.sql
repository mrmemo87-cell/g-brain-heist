-- ============================================================
-- SECURITY PATCH H-1 — Hotfix for 2 SQL-language functions
-- where Section 4 regex could not inject an auth gate.
--
--   brains_heist_get_performance_summary  (LANGUAGE sql)
--   brains_heist_get_progress_map         (LANGUAGE sql)
--
-- These functions have NO BEGIN block — they're plain SQL.
-- Strategy: convert them to LANGUAGE plpgsql, wrapping the
-- original SQL body inside:
--   BEGIN
--     IF auth.uid() IS NULL THEN RAISE EXCEPTION …; END IF;
--     RETURN QUERY <original SQL>;
--   END;
-- ============================================================

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
    'brains_heist_get_performance_summary',
    'brains_heist_get_progress_map'
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
      -- Already patched?
      IF v_body ILIKE '%Not authenticated%' THEN
        RAISE NOTICE '[H1] %: already has auth gate — skip', v_func;
        CONTINUE;
      END IF;

      -- Strip trailing whitespace + semicolons from the SQL body.
      -- rtrim(text) only removes spaces, NOT \r\n, so use regex.
      v_body := regexp_replace(v_body, E'[;\\s]+$', '');

      -- Build new PL/pgSQL body wrapping the original SQL
      v_new := E'\nBEGIN\n'
            || E'  IF auth.uid() IS NULL THEN\n'
            || E'    RAISE EXCEPTION ''Not authenticated'';\n'
            || E'  END IF;\n'
            || E'  RETURN QUERY\n'
            || v_body || E';\n'
            || E'END;\n';

      EXECUTE format('DROP FUNCTION public.%I(%s)', v_func, v_iargs);

      -- NOTE: language is now plpgsql regardless of original
      EXECUTE format(
        'CREATE FUNCTION public.%I(%s) RETURNS %s LANGUAGE plpgsql %s %s SECURITY DEFINER SET search_path = public AS %L',
        v_func, v_fargs, v_ret,
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
      RAISE NOTICE '[H1] % — converted to plpgsql + auth gate injected', v_func;
    END LOOP;
  END LOOP;

  RAISE NOTICE '[H1] Total: % function(s) patched', v_count;
END;
$outer$;

-- ============================================================
-- VERIFICATION (run after "Success"):
--
-- SELECT p.proname,
--        l.lanname,
--        p.prosrc ILIKE '%Not authenticated%' AS has_auth
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- JOIN pg_language l  ON l.oid = p.prolang
-- WHERE n.nspname = 'public'
--   AND p.proname IN (
--     'brains_heist_get_performance_summary',
--     'brains_heist_get_progress_map'
--   );
-- -- Expect: lanname = plpgsql, has_auth = true for BOTH
-- ============================================================
