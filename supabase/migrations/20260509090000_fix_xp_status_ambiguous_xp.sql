-- Fix XP status RPCs that can fail with: column reference "xp" is ambiguous.
--
-- PL/pgSQL RETURNS TABLE output columns are variables in the function scope. If an
-- implementation also reads users.xp as an unqualified `xp`, PostgreSQL can resolve
-- that reference as both a table column and the output variable. Recreate the XP
-- helpers with qualified source columns and internal aliases that never shadow the
-- returned `xp` field.

DROP FUNCTION IF EXISTS public.rpc_my_xp_status();
DROP FUNCTION IF EXISTS public.xp_status(integer);

CREATE OR REPLACE FUNCTION public.xp_status(p_xp integer)
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

CREATE OR REPLACE FUNCTION public.rpc_my_xp_status()
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

COMMENT ON FUNCTION public.xp_status(integer) IS
  'Returns level progress for an XP value without unqualified xp references.';
COMMENT ON FUNCTION public.rpc_my_xp_status() IS
  'Returns the authenticated user XP status with users.xp fully qualified to avoid ambiguous xp errors.';
