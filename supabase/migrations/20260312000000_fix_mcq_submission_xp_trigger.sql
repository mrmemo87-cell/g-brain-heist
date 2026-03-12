-- Fix quest answer submission under XP/level write hardening.
--
-- Some environments had submission RPCs still using the old config key
-- (app.admin_override) or no config key at all, while trigger
-- block_direct_xp_level_updates enforces app.allow_xp_level_write.
--
-- This migration patches any existing public.record_question_attempt and
-- public.rpc_submit_mcq_answer function bodies to:
-- 1) Replace app.admin_override -> app.allow_xp_level_write
-- 2) Inject PERFORM set_config('app.allow_xp_level_write','1',true)
--    after BEGIN when missing.

DO $$
DECLARE
  fn record;
  def_text text;
  patched_text text;
BEGIN
  FOR fn IN
    SELECT p.oid,
           n.nspname AS schema_name,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS identity_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('record_question_attempt', 'rpc_submit_mcq_answer')
  LOOP
    def_text := pg_get_functiondef(fn.oid);
    patched_text := replace(def_text, 'app.admin_override', 'app.allow_xp_level_write');

    IF patched_text NOT ILIKE '%set_config(''app.allow_xp_level_write''%' THEN
      patched_text := regexp_replace(
        patched_text,
        '(?is)BEGIN',
        E'BEGIN\n  PERFORM set_config(''app.allow_xp_level_write'', ''1'', true);',
        1,
        1
      );
    END IF;

    IF patched_text <> def_text THEN
      EXECUTE patched_text;
      RAISE NOTICE '[fix_mcq_submission_xp_trigger] patched %.%(%)', fn.schema_name, fn.proname, fn.identity_args;
    ELSE
      RAISE NOTICE '[fix_mcq_submission_xp_trigger] no change needed for %.%(%)', fn.schema_name, fn.proname, fn.identity_args;
    END IF;
  END LOOP;
END
$$;

-- Optional verification query (run manually):
-- SELECT proname,
--        prosrc ILIKE '%allow_xp_level_write%' AS uses_allow_flag,
--        prosrc ILIKE '%admin_override%' AS uses_old_flag
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND proname IN ('record_question_attempt', 'rpc_submit_mcq_answer');
