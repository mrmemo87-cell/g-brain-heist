-- Ensure quest answer rewards pass the users XP/level write guard trigger.
-- Root cause: rpc_quest_answer_node updates users.xp/users.coins directly without
-- setting app.allow_xp_level_write, so block_direct_xp_level_updates rejects writes.

CREATE OR REPLACE FUNCTION public.rpc_quest_answer_node(
  p_run_id UUID,
  p_node_index INTEGER,
  p_answer TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_run RECORD;
  v_node JSONB;
  v_question_id UUID;
  v_correct_answer TEXT;
  v_is_correct BOOLEAN;
  v_reward_xp INTEGER;
  v_reward_coins INTEGER;
  v_xp_delta INTEGER := 0;
  v_coins_delta INTEGER := 0;
  v_new_streak INTEGER;
  v_next_node INTEGER;
  v_new_status TEXT := 'active';
  v_route JSONB;
  v_profile RECORD;
  v_duplicate BOOLEAN := false;
  v_node_count INTEGER;
  v_explanation TEXT;
  v_time_taken_ms INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Allow guarded XP/coins profile writes inside this server-authoritative RPC.
  PERFORM set_config('app.allow_xp_level_write', '1', true);

  -- Lock the run row to prevent concurrent modifications
  SELECT * INTO v_run
  FROM quest_runs
  WHERE id = p_run_id AND user_id = v_user_id AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quest run not found or already completed';
  END IF;

  IF v_run.current_node <> p_node_index THEN
    RAISE EXCEPTION 'Node index mismatch. Expected %, got %', v_run.current_node, p_node_index;
  END IF;

  v_route := v_run.route;
  v_node := v_route->p_node_index;
  v_node_count := jsonb_array_length(v_route);

  IF v_node->>'type' NOT IN ('question', 'elite_question') THEN
    RAISE EXCEPTION 'Node % is not a question node', p_node_index;
  END IF;

  IF v_node->>'state' <> 'active' THEN
    RAISE EXCEPTION 'Node % is not active', p_node_index;
  END IF;

  v_question_id := (v_node->>'question_id')::uuid;
  v_correct_answer := v_node->>'correct_option';
  v_explanation := v_node->>'explanation';

  -- Validate answer
  v_is_correct := (p_answer = v_correct_answer);

  -- Calculate rewards (mirrors rpc_submit_mcq_answer logic)
  IF v_is_correct THEN
    -- Advisory lock per user+question to prevent double-dipping
    PERFORM pg_advisory_xact_lock(
      hashtext(v_user_id::text),
      hashtext(COALESCE(v_question_id::text, p_run_id::text))
    );

    -- Check for recent duplicate
    SELECT EXISTS (
      SELECT 1
      FROM question_attempts
      WHERE student_id = v_user_id
        AND question_id = v_question_id
        AND is_correct = true
        AND attempted_at > now() - interval '24 hours'
    ) INTO v_duplicate;

    IF NOT v_duplicate THEN
      v_reward_xp := COALESCE((v_node->'points')::int,
        CASE (v_node->>'difficulty')
          WHEN 'easy' THEN 15
          WHEN 'hard' THEN 30
          ELSE 20
        END);
      v_reward_coins := floor(v_reward_xp * 1.5);
      v_xp_delta := v_reward_xp;
      v_coins_delta := v_reward_coins;
    END IF;
  ELSE
    -- Wrong answer: small XP penalty (matches existing behavior)
    v_xp_delta := -5;
    v_coins_delta := 0;
  END IF;

  -- Record the attempt in question_attempts (same as MCQ flow)
  IF v_question_id IS NOT NULL THEN
    INSERT INTO question_attempts (student_id, question_id, answer_given, is_correct, points_earned)
    VALUES (v_user_id, v_question_id, p_answer, v_is_correct,
      CASE WHEN v_is_correct AND NOT v_duplicate THEN v_xp_delta ELSE 0 END);

    -- Update question stats
    UPDATE questions
    SET times_answered = COALESCE(times_answered, 0) + 1,
        times_correct  = COALESCE(times_correct, 0) + CASE WHEN v_is_correct THEN 1 ELSE 0 END
    WHERE id = v_question_id;
  END IF;

  -- Update user profile
  IF v_xp_delta <> 0 OR v_coins_delta <> 0 THEN
    UPDATE users
    SET xp = GREATEST(0, xp + v_xp_delta),
        coins = GREATEST(0, coins + v_coins_delta),
        xp_from_quests = COALESCE(xp_from_quests, 0) + GREATEST(0, v_xp_delta),
        coins_from_quests = COALESCE(coins_from_quests, 0) + GREATEST(0, v_coins_delta)
    WHERE id = v_user_id;
  END IF;

  -- Update streak
  v_new_streak := CASE WHEN v_is_correct THEN v_run.streak + 1 ELSE 0 END;

  -- Advance route state
  v_next_node := p_node_index + 1;

  -- Mark current node as cleared, next as active
  v_route := (
    SELECT jsonb_agg(
      CASE
        WHEN (elem->>'index')::int = p_node_index THEN
          elem || '{"state":"cleared"}'::jsonb
        WHEN (elem->>'index')::int = v_next_node THEN
          elem || '{"state":"active"}'::jsonb
        ELSE elem
      END
      ORDER BY (elem->>'index')::int
    )
    FROM jsonb_array_elements(v_route) AS elem
  );

  -- Check if we've reached the end
  IF v_next_node >= v_node_count THEN
    v_new_status := 'completed';
  END IF;

  -- Update the run
  UPDATE quest_runs
  SET current_node = v_next_node,
      streak = v_new_streak,
      rewards_xp = rewards_xp + GREATEST(0, v_xp_delta),
      rewards_coins = rewards_coins + GREATEST(0, v_coins_delta),
      route = v_route,
      status = v_new_status,
      completed_at = CASE WHEN v_new_status = 'completed' THEN now() ELSE NULL END
  WHERE id = p_run_id;

  -- Log node attempt
  INSERT INTO quest_run_nodes (run_id, node_index, node_type, question_id, answer_given, is_correct, xp_delta, coins_delta)
  VALUES (p_run_id, p_node_index, v_node->>'type', v_question_id, p_answer, v_is_correct, v_xp_delta, v_coins_delta);

  -- Get updated profile
  SELECT xp, coins, level, gemstones INTO v_profile
  FROM users WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'is_correct', v_is_correct,
    'duplicate_reward', v_duplicate,
    'deltas', jsonb_build_object('xp', v_xp_delta, 'coins', v_coins_delta),
    'streak', v_new_streak,
    'next_node_index', v_next_node,
    'run_status', v_new_status,
    'explanation', CASE
      WHEN v_is_correct THEN COALESCE(v_explanation, 'Well done, agent!')
      ELSE 'Incorrect. ' || COALESCE(v_explanation, 'The correct answer was: ' || v_correct_answer)
    END,
    'final_profile_values', jsonb_build_object(
      'xp', v_profile.xp,
      'coins', v_profile.coins,
      'level', v_profile.level,
      'gemstones', v_profile.gemstones
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_quest_answer_node(UUID, INTEGER, TEXT) TO authenticated;
