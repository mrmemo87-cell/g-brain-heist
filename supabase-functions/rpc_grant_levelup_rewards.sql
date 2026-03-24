-- RPC Function: Grant Level-Up Rewards
-- Automatically called when a player levels up
-- Grants coins and refills AP

CREATE OR REPLACE FUNCTION public.rpc_grant_levelup_rewards(p_new_level int)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_coins_reward int;
  v_now timestamptz := now();
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'rpc_grant_levelup_rewards is temporarily disabled for clients; use a server-verified level-up flow';
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_new_level IS DISTINCT FROM (
    SELECT level FROM public.users WHERE id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Invalid level context for reward grant';
  END IF;

  -- Temporary hardening: disable parameter-based level reward minting until event-bound flow is implemented
  v_coins_reward := 0;
  
  -- Grant rewards: coins and AP refill
  UPDATE public.users
  SET 
    coins = coins + v_coins_reward,
    ap_now = ap_now
  WHERE id = v_user_id;
  
  RETURN json_build_object(
    'coins', v_coins_reward,
    'ap_refill', false,
    'message', 'Level-up rewards are temporarily disabled pending server-verified flow'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_grant_levelup_rewards(int) FROM public;
REVOKE EXECUTE ON FUNCTION public.rpc_grant_levelup_rewards(int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_grant_levelup_rewards(int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_grant_levelup_rewards(int) TO service_role;
