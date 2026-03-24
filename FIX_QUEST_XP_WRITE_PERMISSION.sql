-- ============================================================
-- FIX: Add XP write permission to quest RPCs + abandon RPC
-- ============================================================
-- The trigger `block_direct_xp_level_updates` on `users` requires
-- set_config('app.allow_xp_level_write', '1', true) before any
-- UPDATE that touches xp/coins. All three quest RPCs were missing this.
-- Also adds rpc_quest_abandon to let players force-abandon stuck runs.
-- Run this in the Supabase SQL Editor after the V2 migration.
-- ============================================================

-- 0. Clean up any stuck active runs from failed attempts
DELETE FROM quest_run_nodes WHERE run_id IN (SELECT id FROM quest_runs WHERE status = 'active');
DELETE FROM quest_runs WHERE status = 'active';

-- 1. Fix rpc_quest_answer_node
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

  -- Allow XP/level writes within this transaction
  PERFORM set_config('app.allow_xp_level_write', '1', true);

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

  v_is_correct := (p_answer = v_correct_answer);

  IF v_is_correct THEN
    PERFORM pg_advisory_xact_lock(
      hashtext(v_user_id::text),
      hashtext(COALESCE(v_question_id::text, p_run_id::text))
    );

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
    v_xp_delta := -5;
    v_coins_delta := 0;
  END IF;

  IF v_question_id IS NOT NULL THEN
    INSERT INTO question_attempts (student_id, question_id, answer_given, is_correct, points_earned)
    VALUES (v_user_id, v_question_id, p_answer, v_is_correct,
      CASE WHEN v_is_correct AND NOT v_duplicate THEN v_xp_delta ELSE 0 END);

    UPDATE questions
    SET times_answered = COALESCE(times_answered, 0) + 1,
        times_correct  = COALESCE(times_correct, 0) + CASE WHEN v_is_correct THEN 1 ELSE 0 END
    WHERE id = v_question_id;
  END IF;

  IF v_xp_delta <> 0 OR v_coins_delta <> 0 THEN
    UPDATE users
    SET xp = GREATEST(0, xp + v_xp_delta),
        coins = GREATEST(0, coins + v_coins_delta),
        xp_from_quests = COALESCE(xp_from_quests, 0) + GREATEST(0, v_xp_delta),
        coins_from_quests = COALESCE(coins_from_quests, 0) + GREATEST(0, v_coins_delta)
    WHERE id = v_user_id;
  END IF;

  v_new_streak := CASE WHEN v_is_correct THEN v_run.streak + 1 ELSE 0 END;
  v_next_node := p_node_index + 1;

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

  IF v_next_node >= v_node_count THEN
    v_new_status := 'completed';
  END IF;

  UPDATE quest_runs
  SET current_node = v_next_node,
      streak = v_new_streak,
      rewards_xp = rewards_xp + GREATEST(0, v_xp_delta),
      rewards_coins = rewards_coins + GREATEST(0, v_coins_delta),
      route = v_route,
      status = v_new_status,
      completed_at = CASE WHEN v_new_status = 'completed' THEN now() ELSE NULL END
  WHERE id = p_run_id;

  INSERT INTO quest_run_nodes (run_id, node_index, node_type, question_id, answer_given, is_correct, xp_delta, coins_delta)
  VALUES (p_run_id, p_node_index, v_node->>'type', v_question_id, p_answer, v_is_correct, v_xp_delta, v_coins_delta);

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


-- 2. Fix rpc_quest_claim_event
CREATE OR REPLACE FUNCTION public.rpc_quest_claim_event(
  p_run_id UUID,
  p_node_index INTEGER
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
  v_payload JSONB;
  v_xp_delta INTEGER := 0;
  v_coins_delta INTEGER := 0;
  v_next_node INTEGER;
  v_route JSONB;
  v_new_status TEXT := 'active';
  v_node_count INTEGER;
  v_profile RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Allow XP/level writes within this transaction
  PERFORM set_config('app.allow_xp_level_write', '1', true);

  SELECT * INTO v_run
  FROM quest_runs
  WHERE id = p_run_id AND user_id = v_user_id AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quest run not found or already completed';
  END IF;

  IF v_run.current_node <> p_node_index THEN
    RAISE EXCEPTION 'Node index mismatch';
  END IF;

  v_route := v_run.route;
  v_node := v_route->p_node_index;
  v_node_count := jsonb_array_length(v_route);

  IF v_node->>'type' NOT IN ('reward', 'surprise') THEN
    RAISE EXCEPTION 'Node % is not an event node', p_node_index;
  END IF;

  IF v_node->>'state' <> 'active' THEN
    RAISE EXCEPTION 'Node % is not active', p_node_index;
  END IF;

  v_payload := COALESCE(v_node->'event_payload', '{"xp":15,"coins":20}'::jsonb);
  v_xp_delta := COALESCE((v_payload->>'xp')::int, 0);
  v_coins_delta := COALESCE((v_payload->>'coins')::int, 0);

  IF v_xp_delta > 0 OR v_coins_delta > 0 THEN
    UPDATE users
    SET xp = xp + v_xp_delta,
        coins = coins + v_coins_delta,
        xp_from_quests = COALESCE(xp_from_quests, 0) + v_xp_delta,
        coins_from_quests = COALESCE(coins_from_quests, 0) + v_coins_delta
    WHERE id = v_user_id;
  END IF;

  v_next_node := p_node_index + 1;

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

  IF v_next_node >= v_node_count THEN
    v_new_status := 'completed';
  END IF;

  UPDATE quest_runs
  SET current_node = v_next_node,
      rewards_xp = rewards_xp + v_xp_delta,
      rewards_coins = rewards_coins + v_coins_delta,
      route = v_route,
      status = v_new_status,
      completed_at = CASE WHEN v_new_status = 'completed' THEN now() ELSE NULL END
  WHERE id = p_run_id;

  INSERT INTO quest_run_nodes (run_id, node_index, node_type, xp_delta, coins_delta)
  VALUES (p_run_id, p_node_index, v_node->>'type', v_xp_delta, v_coins_delta);

  SELECT xp, coins, level, gemstones INTO v_profile
  FROM users WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'event_title', v_node->>'event_title',
    'event_payload', v_payload,
    'deltas', jsonb_build_object('xp', v_xp_delta, 'coins', v_coins_delta),
    'next_node_index', v_next_node,
    'run_status', v_new_status,
    'final_profile_values', jsonb_build_object(
      'xp', v_profile.xp,
      'coins', v_profile.coins,
      'level', v_profile.level,
      'gemstones', v_profile.gemstones
    )
  );
END;
$$;


-- 3. Fix rpc_quest_open_chest
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
  v_base_xp INTEGER := 15;
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

  -- Allow XP/level writes within this transaction
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

  v_node := v_route->(v_run.current_node);
  IF v_node->>'type' <> 'final_chest' THEN
    RAISE EXCEPTION 'Current node is not the final chest';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE is_correct = true),
    COUNT(*)
  INTO v_questions_correct, v_total_questions
  FROM quest_run_nodes
  WHERE run_id = p_run_id
    AND node_type IN ('question', 'elite_question');

  v_perfect_run := (v_total_questions > 0 AND v_questions_correct = v_total_questions);

  v_streak_bonus := CASE
    WHEN v_streak >= 6 THEN 1.2
    WHEN v_streak >= 4 THEN 1.1
    ELSE 1.0
  END;

  v_chest_xp := ROUND(v_base_xp * v_streak_bonus) + CASE WHEN v_perfect_run THEN 25 ELSE 0 END;
  v_chest_coins := ROUND(v_base_coins * v_streak_bonus) + CASE WHEN v_perfect_run THEN 40 ELSE 0 END;

  v_tier := CASE
    WHEN v_perfect_run THEN 'gold'
    WHEN v_streak >= 4 THEN 'silver'
    ELSE 'bronze'
  END;

  UPDATE users
  SET xp = xp + v_chest_xp,
      coins = coins + v_chest_coins,
      xp_from_quests = COALESCE(xp_from_quests, 0) + v_chest_xp,
      coins_from_quests = COALESCE(coins_from_quests, 0) + v_chest_coins
  WHERE id = v_user_id;

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


-- 4. New RPC: rpc_quest_abandon -- force-abandon a stuck/active run (no rewards)
CREATE OR REPLACE FUNCTION public.rpc_quest_abandon(
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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_run
  FROM quest_runs
  WHERE id = p_run_id AND user_id = v_user_id AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active quest run found';
  END IF;

  UPDATE quest_runs
  SET status = 'abandoned',
      completed_at = now()
  WHERE id = p_run_id;

  RETURN jsonb_build_object(
    'status', 'abandoned',
    'run_id', p_run_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_quest_abandon(UUID) TO authenticated;
