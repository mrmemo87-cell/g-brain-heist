-- Levels were computed three different ways: the stored users.level column
-- (trigger sync_level_with_xp → level_from_xp, curve 150·(L−1)^1.7), the
-- xp_status()/rpc_my_xp_status() progress payload (linear 100 XP per level)
-- and the front-end helper. The same student could show "Level 4" in one
-- place and "Level 13" in another. xp_status now derives everything from the
-- canonical curve so every surface agrees with the stored level.

CREATE OR REPLACE FUNCTION public.xp_status(p_xp integer)
 RETURNS TABLE(level integer, xp integer, level_xp_start integer, level_xp_next integer, xp_into_level integer, xp_to_next integer, progress double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH normalized AS (
    SELECT GREATEST(0, COALESCE(p_xp, 0))::integer AS total_xp
  ), calculated AS (
    SELECT
      normalized.total_xp,
      public.level_from_xp(normalized.total_xp) AS calculated_level
    FROM normalized
  ), bounds AS (
    SELECT
      calculated.total_xp,
      calculated.calculated_level,
      public.xp_threshold_for_level(calculated.calculated_level) AS xp_start,
      public.xp_threshold_for_level(calculated.calculated_level + 1) AS xp_next
    FROM calculated
  )
  SELECT
    bounds.calculated_level AS level,
    bounds.total_xp AS xp,
    bounds.xp_start AS level_xp_start,
    bounds.xp_next AS level_xp_next,
    (bounds.total_xp - bounds.xp_start)::integer AS xp_into_level,
    GREATEST(0, bounds.xp_next - bounds.total_xp)::integer AS xp_to_next,
    LEAST(1, GREATEST(0,
      (bounds.total_xp - bounds.xp_start)::double precision
        / GREATEST(1, bounds.xp_next - bounds.xp_start)::double precision)) AS progress
  FROM bounds;
$function$;

-- update_user_stats computed its level-up flag with the linear formula too.
-- The trigger already overwrites users.level from xp, so only the flag was wrong.
DO $$
DECLARE v_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'update_user_stats';
  IF v_src IS NOT NULL AND v_src LIKE '%FLOOR((user_record.xp + p_xp_gain) / 100.0) + 1%' THEN
    EXECUTE replace(v_src,
      'GREATEST(1, FLOOR((user_record.xp + p_xp_gain) / 100.0) + 1)',
      'public.level_from_xp(user_record.xp + p_xp_gain)');
  END IF;
END $$;

-- Any row whose stored level drifted from its XP (rows written before the sync trigger existed).
SELECT set_config('app.allow_xp_level_write', '1', true);
UPDATE public.users
SET level = public.level_from_xp(COALESCE(xp, 0))
WHERE level IS DISTINCT FROM public.level_from_xp(COALESCE(xp, 0));
