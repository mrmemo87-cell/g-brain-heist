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
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Calculate rewards: 100 coins per level
  v_coins_reward := 100 * p_new_level;
  
  -- Grant rewards: coins and AP refill
  UPDATE public.users
  SET 
    coins = coins + v_coins_reward,
    ap_now = ap_max  -- Full AP refill
  WHERE id = v_user_id;
  
  RETURN json_build_object(
    'coins', v_coins_reward,
    'ap_refill', true,
    'message', 'Level up rewards granted!'
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.rpc_grant_levelup_rewards(int) TO authenticated;
