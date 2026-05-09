-- Fix Super Admin reward grants by removing every old rpc_admin_grant overload
-- and recreating one canonical XP/coin/gemstone grant RPC.
--
-- Also keeps the XP status helpers on their unambiguous implementations so
-- users.xp is always referenced as u.xp inside rpc_my_xp_status().

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS gemstones integer NOT NULL DEFAULT 0;

UPDATE public.users AS u
SET gemstones = 0
WHERE u.gemstones IS NULL;

ALTER TABLE public.users
  ALTER COLUMN gemstones SET DEFAULT 0,
  ALTER COLUMN gemstones SET NOT NULL;

DO $$
DECLARE
  v_function record;
BEGIN
  FOR v_function IN
    SELECT pg_get_function_identity_arguments(p.oid) AS identity_arguments
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'rpc_admin_grant'
  LOOP
    EXECUTE format(
      'DROP FUNCTION IF EXISTS public.rpc_admin_grant(%s)',
      v_function.identity_arguments
    );
  END LOOP;
END;
$$;

CREATE FUNCTION public.rpc_admin_grant(
  p_user_id uuid,
  p_xp_delta integer DEFAULT 0,
  p_coins_delta integer DEFAULT 0,
  p_gemstones_delta integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.superadmins AS s
    WHERE s.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Required by the profile write guard trigger for xp/coins/level writes.
  PERFORM set_config('app.allow_xp_level_write', '1', true);

  UPDATE public.users AS u
  SET xp = GREATEST(0, COALESCE(u.xp, 0) + COALESCE(p_xp_delta, 0)),
      coins = GREATEST(0, COALESCE(u.coins, 0) + COALESCE(p_coins_delta, 0)),
      gemstones = GREATEST(0, COALESCE(u.gemstones, 0) + COALESCE(p_gemstones_delta, 0))
  WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_admin_grant(uuid, integer, integer, integer) TO authenticated;

DROP FUNCTION IF EXISTS public.rpc_my_xp_status();
DROP FUNCTION IF EXISTS public.xp_status(integer);

CREATE FUNCTION public.xp_status(p_xp integer)
RETURNS TABLE (
  level integer,
  xp integer,
  level_xp_start integer,
  level_xp_next integer,
  xp_into_level integer,
  xp_to_next integer,
  progress double precision
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH normalized AS (
    SELECT GREATEST(0, COALESCE(p_xp, 0))::integer AS total_xp
  ), calculated AS (
    SELECT
      normalized.total_xp,
      GREATEST(1, FLOOR(normalized.total_xp / 100.0) + 1)::integer AS calculated_level
    FROM normalized
  )
  SELECT
    calculated.calculated_level AS level,
    calculated.total_xp AS xp,
    ((calculated.calculated_level - 1) * 100)::integer AS level_xp_start,
    (calculated.calculated_level * 100)::integer AS level_xp_next,
    (calculated.total_xp - ((calculated.calculated_level - 1) * 100))::integer AS xp_into_level,
    GREATEST(0, (calculated.calculated_level * 100) - calculated.total_xp)::integer AS xp_to_next,
    LEAST(
      1,
      GREATEST(
        0,
        (calculated.total_xp - ((calculated.calculated_level - 1) * 100))::double precision / 100
      )
    ) AS progress
  FROM calculated;
$$;

CREATE FUNCTION public.rpc_my_xp_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_total_xp integer := 0;
  v_status jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  SELECT COALESCE(u.xp, 0)::integer
  INTO v_total_xp
  FROM public.users AS u
  WHERE u.id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND';
  END IF;

  SELECT to_jsonb(status_row)
  INTO v_status
  FROM public.xp_status(p_xp => v_total_xp) AS status_row;

  RETURN v_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.xp_status(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_my_xp_status() TO authenticated;

COMMENT ON FUNCTION public.rpc_admin_grant(uuid, integer, integer, integer) IS
  'Canonical Super Admin grant RPC for XP, coins, and gemstones with qualified users column reads.';
COMMENT ON FUNCTION public.xp_status(integer) IS
  'Returns level progress for an XP value without unqualified xp references.';
COMMENT ON FUNCTION public.rpc_my_xp_status() IS
  'Returns the authenticated user XP status with users.xp fully qualified to avoid ambiguous xp errors.';
