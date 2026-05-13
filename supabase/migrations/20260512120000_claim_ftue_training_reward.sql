-- Award the first-run starter assignment once, using a server-verified path.
-- The reward is intentionally large enough to push a brand-new Level 1 learner
-- into the next level so the FTUE ends with a real dopamine hit.

CREATE OR REPLACE FUNCTION public.rpc_claim_ftue_training_reward()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_xp_reward integer := 125;
  v_coin_reward integer := 75;
  v_gemstone_reward integer := 0;
  v_already_claimed boolean := false;
  v_now timestamptz := now();
  v_profile record;
  v_xp_status jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  INSERT INTO public.user_onboarding (user_id, current_step, metadata, created_at, updated_at)
  VALUES (
    v_user_id,
    'mission_started',
    jsonb_build_object(
      'ftue_training_mission',
      jsonb_build_object('id', 'first_signal', 'status', 'started', 'started_at', v_now)
    ),
    v_now,
    v_now
  )
  ON CONFLICT (user_id) DO NOTHING;

  SELECT (metadata #>> '{ftue_training_mission,reward_claimed_at}') IS NOT NULL
  INTO v_already_claimed
  FROM public.user_onboarding
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ONBOARDING_STATE_NOT_FOUND';
  END IF;

  IF NOT v_already_claimed THEN
    -- Required by the profile write guard trigger for xp/coins/level writes.
    PERFORM set_config('app.allow_xp_level_write', '1', true);

    UPDATE public.users AS u
    SET xp = GREATEST(0, COALESCE(u.xp, 0) + v_xp_reward),
        coins = GREATEST(0, COALESCE(u.coins, 0) + v_coin_reward),
        gemstones = GREATEST(0, COALESCE(u.gemstones, 0) + v_gemstone_reward),
        level = GREATEST(COALESCE(u.level, 1), FLOOR((GREATEST(0, COALESCE(u.xp, 0) + v_xp_reward)) / 100.0)::integer + 1)
    WHERE u.id = v_user_id
    RETURNING u.xp, u.coins, u.level, u.gemstones
    INTO v_profile;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;

    UPDATE public.user_onboarding AS uo
    SET metadata = jsonb_set(
          COALESCE(uo.metadata, '{}'::jsonb),
          '{ftue_training_mission}',
          COALESCE(uo.metadata->'ftue_training_mission', '{}'::jsonb)
            || jsonb_build_object(
              'id', 'first_signal',
              'status', 'completed',
              'reward_claimed_at', v_now,
              'reward', jsonb_build_object('xp', v_xp_reward, 'coins', v_coin_reward, 'gemstones', v_gemstone_reward)
            ),
          true
        ),
        updated_at = v_now
    WHERE uo.user_id = v_user_id;
  ELSE
    SELECT u.xp, u.coins, u.level, u.gemstones
    INTO v_profile
    FROM public.users AS u
    WHERE u.id = v_user_id;

    v_xp_reward := 0;
    v_coin_reward := 0;
    v_gemstone_reward := 0;
  END IF;

  SELECT to_jsonb(status_row)
  INTO v_xp_status
  FROM public.xp_status(COALESCE(v_profile.xp, 0)::integer) AS status_row;

  RETURN jsonb_build_object(
    'deltas', jsonb_build_object(
      'xp', v_xp_reward,
      'coins', v_coin_reward,
      'gemstones', v_gemstone_reward
    ),
    'final_profile_values', jsonb_build_object(
      'xp', COALESCE(v_profile.xp, 0),
      'coins', COALESCE(v_profile.coins, 0),
      'level', COALESCE(v_profile.level, 1),
      'gemstones', COALESCE(v_profile.gemstones, 0),
      'xp_status', v_xp_status
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_claim_ftue_training_reward() TO authenticated;

COMMENT ON FUNCTION public.rpc_claim_ftue_training_reward() IS
  'Claims the idempotent FTUE starter assignment reward (+125 XP, +75 coins) for the authenticated learner.';
