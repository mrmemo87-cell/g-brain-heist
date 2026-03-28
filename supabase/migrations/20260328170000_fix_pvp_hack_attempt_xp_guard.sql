-- Ensure rpc_hack_attempt enables trusted XP/level writes under
-- block_direct_xp_level_updates trigger hardening.
--
-- Some environments still have rpc_hack_attempt without the
-- app.allow_xp_level_write session flag, causing PvP attacks to fail with:
-- "Direct XP/level updates are not allowed. Use RPCs."

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
      AND p.proname = 'rpc_hack_attempt'
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
      RAISE NOTICE '[fix_pvp_hack_attempt_xp_guard] patched %.%(%)', fn.schema_name, fn.proname, fn.identity_args;
    ELSE
      RAISE NOTICE '[fix_pvp_hack_attempt_xp_guard] no change needed for %.%(%)', fn.schema_name, fn.proname, fn.identity_args;
    END IF;
  END LOOP;
END
$$;
