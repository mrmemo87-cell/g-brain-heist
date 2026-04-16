-- Ensure superadmins can grant XP/coins via Admin Portal.
-- Idempotent: always drops/recreates the canonical rpc_admin_grant(uuid,int,int).

DROP FUNCTION IF EXISTS public.rpc_admin_grant(uuid, integer, integer);

CREATE FUNCTION public.rpc_admin_grant(
  p_user_id uuid,
  p_xp_delta integer,
  p_coins_delta integer
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
    FROM public.superadmins s
    WHERE s.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Required by the profile write guard trigger for xp/coins/level writes.
  PERFORM set_config('app.allow_xp_level_write', '1', true);

  UPDATE public.users u
  SET xp = COALESCE(u.xp, 0) + COALESCE(p_xp_delta, 0),
      coins = COALESCE(u.coins, 0) + COALESCE(p_coins_delta, 0)
  WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
END;
$$;
