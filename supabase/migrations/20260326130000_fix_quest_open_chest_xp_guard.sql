-- Ensure final chest rewards pass the users XP/level write guard trigger.
-- Root cause: rpc_quest_open_chest updates users.xp/users.coins directly without
-- setting app.allow_xp_level_write, so block_direct_xp_level_updates rejects writes.

CREATE OR REPLACE FUNCTION public.rpc_quest_open_chest(
  p_run_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_run RECORD;
  v_route JSONB;
  v_streak INTEGER;
  v_streak_bonus NUMERIC;
  v_questions_correct INTEGER := 0;
  v_total_questions INTEGER := 0;
  v_perfect_run BOOLEAN;
  v_tier TEXT;
  v_base_xp INTEGER := 15;   -- matches MILESTONE_REWARDS.missionCompleted
  v_base_coins INTEGER := 50;
  v_chest_xp INTEGER;
  v_chest_coins INTEGER;
  v_profile RECORD;
  v_node JSONB;
  v_node_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Allow guarded XP/coins profile writes inside this server-authoritative RPC.
  PERFORM set_config('app.allow_xp_level_write', '1', true);

  SELECT * INTO v_run
  FROM quest_runs
  WHERE id = p_run_id AND user_id = v_user_id AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quest run not found or not active';
  END IF;

  v_route := v_run.route;
  v_node_count := jsonb_array_length(v_route);
  v_streak := v_run.streak;

  -- Verify current node is final_chest
  v_node := v_route->(v_run.current_node);
  IF v_node->>'type' <> 'final_chest' THEN
    RAISE EXCEPTION 'Current node is not the final chest';
  END IF;

  -- Count correct questions from run log
  SELECT
    COUNT(*) FILTER (WHERE is_correct = true),
    COUNT(*)
  INTO v_questions_correct, v_total_questions
  FROM quest_run_nodes
  WHERE run_id = p_run_id
    AND node_type IN ('question', 'elite_question');

  v_perfect_run := (v_total_questions > 0 AND v_questions_correct = v_total_questions);

  -- Streak bonus
  v_streak_bonus := CASE
    WHEN v_streak >= 6 THEN 1.2
    WHEN v_streak >= 4 THEN 1.1
    ELSE 1.0
  END;

  -- Calculate chest rewards
  v_chest_xp := ROUND(v_base_xp * v_streak_bonus) + CASE WHEN v_perfect_run THEN 25 ELSE 0 END;
  v_chest_coins := ROUND(v_base_coins * v_streak_bonus) + CASE WHEN v_perfect_run THEN 40 ELSE 0 END;

  -- Determine tier
  v_tier := CASE
    WHEN v_perfect_run THEN 'gold'
    WHEN v_streak >= 4 THEN 'silver'
    ELSE 'bronze'
  END;

  -- Grant chest rewards
  UPDATE users
  SET xp = xp + v_chest_xp,
      coins = coins + v_chest_coins,
      xp_from_quests = COALESCE(xp_from_quests, 0) + v_chest_xp,
      coins_from_quests = COALESCE(coins_from_quests, 0) + v_chest_coins
  WHERE id = v_user_id;

  -- Mark chest node as cleared
  v_route := (
    SELECT jsonb_agg(
      CASE
        WHEN (elem->>'index')::int = v_run.current_node THEN
          elem || '{"state":"cleared"}'::jsonb
        ELSE elem
      END
      ORDER BY (elem->>'index')::int
    )
    FROM jsonb_array_elements(v_route) AS elem
  );

  -- Complete the run
  UPDATE quest_runs
  SET status = 'completed',
      route = v_route,
      chest_tier = v_tier,
      chest_rewards = jsonb_build_object('xp', v_chest_xp, 'coins', v_chest_coins),
      perfect_run = v_perfect_run,
      rewards_xp = rewards_xp + v_chest_xp,
      rewards_coins = rewards_coins + v_chest_coins,
      completed_at = now()
  WHERE id = p_run_id;

  -- Log chest node
  INSERT INTO quest_run_nodes (run_id, node_index, node_type, xp_delta, coins_delta)
  VALUES (p_run_id, v_run.current_node, 'final_chest', v_chest_xp, v_chest_coins);

  SELECT xp, coins, level, gemstones INTO v_profile
  FROM users WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'chest_tier', v_tier,
    'chest_rewards', jsonb_build_object('xp', v_chest_xp, 'coins', v_chest_coins),
    'total_run_xp', v_run.rewards_xp + v_chest_xp,
    'total_run_coins', v_run.rewards_coins + v_chest_coins,
    'streak_peak', v_streak,
    'perfect_run', v_perfect_run,
    'nodes_cleared', v_run.current_node + 1,
    'final_profile_values', jsonb_build_object(
      'xp', v_profile.xp,
      'coins', v_profile.coins,
      'level', v_profile.level,
      'gemstones', v_profile.gemstones
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_quest_open_chest(UUID) TO authenticated;
