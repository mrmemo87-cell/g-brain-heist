-- ============================================================================
-- QUEST MODE 2.0 — Route-Based Mission System
-- ============================================================================
-- Tables: quest_missions, quest_events, quest_runs, quest_run_nodes
-- RPCs:   rpc_quest_start_run, rpc_quest_answer_node, rpc_quest_claim_event,
--         rpc_quest_retreat, rpc_quest_open_chest
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- 1. QUEST_MISSIONS — mission definitions (admin-managed)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS quest_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL,                    -- Geography, Science, Maths, etc.
  code TEXT NOT NULL UNIQUE,                -- slug: 'northern_spire_route'
  title TEXT NOT NULL,
  description TEXT,
  mission_type TEXT NOT NULL DEFAULT 'standard'
    CHECK (mission_type IN ('standard', 'risk', 'daily')),
  difficulty TEXT NOT NULL DEFAULT 'medium'
    CHECK (difficulty IN ('easy', 'medium', 'hard')),
  route_template JSONB NOT NULL,            -- array of node objects (no state)
  energy_cost INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE quest_missions ENABLE ROW LEVEL SECURITY;

-- Everyone can read active missions
CREATE POLICY quest_missions_select ON quest_missions
  FOR SELECT TO authenticated
  USING (is_active = true);

-- Only admins can insert/update/delete
CREATE POLICY quest_missions_admin_insert ON quest_missions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY quest_missions_admin_update ON quest_missions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY quest_missions_admin_delete ON quest_missions
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE INDEX IF NOT EXISTS idx_quest_missions_subject ON quest_missions(subject);
CREATE INDEX IF NOT EXISTS idx_quest_missions_active ON quest_missions(is_active, sort_order);


-- ════════════════════════════════════════════════════════════════════════════
-- 2. QUEST_EVENTS — event pool for reward/surprise nodes (admin-managed)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS quest_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN ('reward', 'surprise')),
  title TEXT NOT NULL,
  description TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- payload: { "xp": 30, "coins": 40, "effect": "Streak Shield Active" }
  weight INTEGER NOT NULL DEFAULT 1,       -- higher = more likely in pool
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE quest_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY quest_events_select ON quest_events
  FOR SELECT TO authenticated
  USING (is_active = true);

CREATE POLICY quest_events_admin_insert ON quest_events
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY quest_events_admin_update ON quest_events
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );


-- ════════════════════════════════════════════════════════════════════════════
-- 3. QUEST_RUNS — active/completed player runs
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS quest_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_id UUID NOT NULL REFERENCES quest_missions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'retreated')),
  current_node INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  rewards_xp INTEGER NOT NULL DEFAULT 0,
  rewards_coins INTEGER NOT NULL DEFAULT 0,
  route JSONB NOT NULL,                     -- hydrated QuestNode[] with state
  chest_tier TEXT,                          -- bronze/silver/gold on completion
  chest_rewards JSONB,                      -- { xp, coins }
  perfect_run BOOLEAN,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE quest_runs ENABLE ROW LEVEL SECURITY;

-- Players can only see their own runs
CREATE POLICY quest_runs_select ON quest_runs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Inserts/updates only via RPCs (security definer), but add base policies
CREATE POLICY quest_runs_insert ON quest_runs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY quest_runs_update ON quest_runs
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_quest_runs_user ON quest_runs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_quest_runs_mission ON quest_runs(mission_id);
CREATE INDEX IF NOT EXISTS idx_quest_runs_started ON quest_runs(started_at DESC);


-- ════════════════════════════════════════════════════════════════════════════
-- 4. QUEST_RUN_NODES — per-node attempt log (analytics + anti-cheat)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS quest_run_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES quest_runs(id) ON DELETE CASCADE,
  node_index INTEGER NOT NULL,
  node_type TEXT NOT NULL,
  question_id UUID REFERENCES questions(id) ON DELETE SET NULL,
  answer_given TEXT,
  is_correct BOOLEAN,
  xp_delta INTEGER NOT NULL DEFAULT 0,
  coins_delta INTEGER NOT NULL DEFAULT 0,
  time_taken_ms INTEGER,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE quest_run_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY quest_run_nodes_select ON quest_run_nodes
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM quest_runs WHERE id = run_id AND user_id = auth.uid())
  );

CREATE POLICY quest_run_nodes_insert ON quest_run_nodes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM quest_runs WHERE id = run_id AND user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_quest_run_nodes_run ON quest_run_nodes(run_id);


-- ════════════════════════════════════════════════════════════════════════════
-- 5. SEED DATA — Geography missions + event pool
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO quest_missions (subject, code, title, description, mission_type, difficulty, route_template, energy_cost, sort_order)
VALUES
  ('Geography', 'northern_spire_route', 'Northern Spire Route',
   'Navigate through the frozen atlas stations. Answer geography questions, collect rewards, and reach the Northern Vault.',
   'standard', 'medium',
   '[
     {"index":0,"type":"start","label":"Launch Pad"},
     {"index":1,"type":"question","label":"Outpost Alpha","difficulty":"easy"},
     {"index":2,"type":"reward","label":"Supply Cache"},
     {"index":3,"type":"surprise","label":"Mystery Signal"},
     {"index":4,"type":"question","label":"Relay Station","difficulty":"medium"},
     {"index":5,"type":"elite_question","label":"The Spire","difficulty":"hard"},
     {"index":6,"type":"final_chest","label":"Northern Vault"}
   ]'::jsonb,
   0, 1),

  ('Geography', 'coastal_recon', 'Coastal Recon',
   'Scout the coastal data buoys. A shorter reconnaissance mission to warm up your atlas skills.',
   'standard', 'easy',
   '[
     {"index":0,"type":"start","label":"Shore Base"},
     {"index":1,"type":"question","label":"Buoy Alpha","difficulty":"easy"},
     {"index":2,"type":"reward","label":"Drift Cache"},
     {"index":3,"type":"question","label":"Buoy Beta","difficulty":"easy"},
     {"index":4,"type":"final_chest","label":"Coastal Vault"}
   ]'::jsonb,
   0, 2),

  ('Science', 'lab_infiltration', 'Lab Infiltration',
   'Break into the abandoned research lab. Science questions guard each checkpoint.',
   'standard', 'medium',
   '[
     {"index":0,"type":"start","label":"Ventilation Shaft"},
     {"index":1,"type":"question","label":"Security Terminal","difficulty":"easy"},
     {"index":2,"type":"surprise","label":"Unstable Flask"},
     {"index":3,"type":"question","label":"Data Core","difficulty":"medium"},
     {"index":4,"type":"reward","label":"Research Notes"},
     {"index":5,"type":"elite_question","label":"Director''s Office","difficulty":"hard"},
     {"index":6,"type":"final_chest","label":"Lab Vault"}
   ]'::jsonb,
   0, 1),

  ('Maths', 'cipher_tower', 'Cipher Tower',
   'Climb the tower by cracking mathematical ciphers at each floor.',
   'standard', 'medium',
   '[
     {"index":0,"type":"start","label":"Ground Floor"},
     {"index":1,"type":"question","label":"Floor 2 - Equations","difficulty":"easy"},
     {"index":2,"type":"reward","label":"Floor 3 - Locker"},
     {"index":3,"type":"question","label":"Floor 4 - Algebra","difficulty":"medium"},
     {"index":4,"type":"surprise","label":"Floor 5 - Trap"},
     {"index":5,"type":"elite_question","label":"Floor 6 - Proof","difficulty":"hard"},
     {"index":6,"type":"final_chest","label":"Tower Vault"}
   ]'::jsonb,
   0, 1)
ON CONFLICT (code) DO NOTHING;


-- Seed events
INSERT INTO quest_events (event_type, title, description, payload, weight)
VALUES
  ('reward', 'Supply Cache Found', 'A hidden cache of supplies!', '{"xp":30,"coins":40}', 3),
  ('reward', 'Hidden Data Chip', 'Intel from a lost agent.', '{"xp":25,"coins":35}', 2),
  ('reward', 'Bonus Intel Packet', 'Extra intelligence gathered.', '{"xp":20,"coins":45}', 2),
  ('reward', 'Emergency Rations', 'Rations that restore morale.', '{"xp":15,"coins":50}', 1),
  ('surprise', 'Mystery Signal Detected', 'An unknown frequency...', '{"xp":20,"coins":25,"effect":"Streak Shield Active"}', 3),
  ('surprise', 'Anomaly Scan Complete', 'Temporal anomaly found!', '{"xp":15,"coins":30,"effect":"Time Warp +5s"}', 2),
  ('surprise', 'Ghost Frequency Found', 'A phantom data burst.', '{"xp":25,"coins":20,"effect":"Double XP Next Node"}', 2),
  ('surprise', 'Trap Disarmed', 'You neutralized a booby trap.', '{"xp":10,"coins":35,"effect":"Lucky Break"}', 1)
ON CONFLICT DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- 6. RPC: rpc_quest_start_run
-- ════════════════════════════════════════════════════════════════════════════
-- Starts a new quest run. Hydrates the route template with real questions
-- from the questions table and random events from quest_events.
-- Returns the full run state as JSONB.

CREATE OR REPLACE FUNCTION public.rpc_quest_start_run(
  p_mission_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_mission RECORD;
  v_route JSONB;
  v_node JSONB;
  v_hydrated_route JSONB := '[]'::jsonb;
  v_question RECORD;
  v_event RECORD;
  v_questions UUID[] := '{}';
  v_node_type TEXT;
  v_node_diff TEXT;
  v_subject_name TEXT;
  v_run_id UUID;
  v_i INTEGER;
  v_node_count INTEGER;
  v_active_run_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get mission
  SELECT * INTO v_mission
  FROM quest_missions
  WHERE id = p_mission_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mission not found or inactive';
  END IF;

  -- Prevent multiple active runs
  SELECT COUNT(*) INTO v_active_run_count
  FROM quest_runs
  WHERE user_id = v_user_id AND status = 'active';

  IF v_active_run_count > 0 THEN
    RAISE EXCEPTION 'You already have an active quest run. Complete or retreat first.';
  END IF;

  v_route := v_mission.route_template;
  v_node_count := jsonb_array_length(v_route);
  v_subject_name := v_mission.subject;

  -- Collect question IDs for question nodes
  -- We fetch all needed questions in one query, ordered randomly
  WITH question_needs AS (
    SELECT
      ordinality - 1 AS idx,
      elem->>'type' AS ntype,
      COALESCE(elem->>'difficulty', 'medium') AS diff
    FROM jsonb_array_elements(v_route) WITH ORDINALITY AS t(elem, ordinality)
    WHERE elem->>'type' IN ('question', 'elite_question')
  ),
  available_questions AS (
    SELECT q.id, q.question_text, q.options, q.correct_answer, q.explanation,
           q.difficulty, q.time_limit, q.points,
           ROW_NUMBER() OVER (ORDER BY random()) AS rn
    FROM questions q
    WHERE q.subject = v_subject_name
      AND q.is_public = true
      AND q.is_active = true
  )
  SELECT ARRAY_AGG(aq.id ORDER BY aq.rn)
  INTO v_questions
  FROM available_questions aq
  LIMIT (SELECT COUNT(*) FROM question_needs);

  IF array_length(v_questions, 1) IS NULL OR
     array_length(v_questions, 1) < (
       SELECT COUNT(*) FROM jsonb_array_elements(v_route) AS elem
       WHERE elem->>'type' IN ('question', 'elite_question')
     ) THEN
    RAISE EXCEPTION 'Not enough questions available for this mission. Need more % questions.', v_subject_name;
  END IF;

  -- Hydrate route: assign questions and events
  DECLARE
    v_q_cursor INTEGER := 1;
  BEGIN
    FOR v_i IN 0 .. v_node_count - 1 LOOP
      v_node := v_route->v_i;
      v_node_type := v_node->>'type';

      -- Set state: first node cleared, second active, rest locked
      IF v_i = 0 THEN
        v_node := v_node || '{"state":"cleared"}'::jsonb;
      ELSIF v_i = 1 THEN
        v_node := v_node || '{"state":"active"}'::jsonb;
      ELSE
        v_node := v_node || '{"state":"locked"}'::jsonb;
      END IF;

      -- Hydrate question nodes
      IF v_node_type IN ('question', 'elite_question') THEN
        SELECT q.id, q.question_text, q.options, q.correct_answer,
               q.explanation, q.difficulty, q.time_limit
        INTO v_question
        FROM questions q
        WHERE q.id = v_questions[v_q_cursor];

        v_node := v_node || jsonb_build_object(
          'question_id', v_question.id,
          'question_body', v_question.question_text,
          'options', v_question.options,
          'correct_option', v_question.correct_answer,
          'time_limit', COALESCE(v_question.time_limit,
            CASE WHEN v_node_type = 'elite_question' THEN 25 ELSE 30 END),
          'explanation', v_question.explanation,
          'difficulty', COALESCE(v_question.difficulty,
            COALESCE(v_node->>'difficulty', 'medium'))
        );

        v_q_cursor := v_q_cursor + 1;

      -- Hydrate event nodes (random from pool)
      ELSIF v_node_type IN ('reward', 'surprise') THEN
        SELECT qe.id, qe.title, qe.payload
        INTO v_event
        FROM quest_events qe
        WHERE qe.event_type = v_node_type
          AND qe.is_active = true
        ORDER BY random()
        LIMIT 1;

        IF FOUND THEN
          v_node := v_node || jsonb_build_object(
            'event_id', v_event.id,
            'event_title', v_event.title,
            'event_payload', v_event.payload
          );
        ELSE
          -- Fallback if no events in pool
          v_node := v_node || jsonb_build_object(
            'event_id', 'fallback_' || v_i,
            'event_title', 'Supply Drop',
            'event_payload', '{"xp":20,"coins":25}'::jsonb
          );
        END IF;
      END IF;

      v_hydrated_route := v_hydrated_route || jsonb_build_array(v_node);
    END LOOP;
  END;

  -- Create the run
  INSERT INTO quest_runs (user_id, mission_id, status, current_node, streak, rewards_xp, rewards_coins, route)
  VALUES (v_user_id, p_mission_id, 'active', 1, 0, 0, 0, v_hydrated_route)
  RETURNING id INTO v_run_id;

  RETURN jsonb_build_object(
    'run_id', v_run_id,
    'mission_id', p_mission_id,
    'mission_title', v_mission.title,
    'mission_type', v_mission.mission_type,
    'status', 'active',
    'current_node', 1,
    'streak', 0,
    'rewards_xp', 0,
    'rewards_coins', 0,
    'route', v_hydrated_route,
    'started_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_quest_start_run(UUID) TO authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 7. RPC: rpc_quest_answer_node
-- ════════════════════════════════════════════════════════════════════════════
-- Validates answer on a question node, awards XP/coins (reuses the same
-- reward logic as rpc_submit_mcq_answer), advances route state.

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


-- ════════════════════════════════════════════════════════════════════════════
-- 8. RPC: rpc_quest_claim_event
-- ════════════════════════════════════════════════════════════════════════════
-- Claims a reward/surprise event node. Awards payload XP/coins, advances.

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

  -- Grant rewards
  IF v_xp_delta > 0 OR v_coins_delta > 0 THEN
    UPDATE users
    SET xp = xp + v_xp_delta,
        coins = coins + v_coins_delta,
        xp_from_quests = COALESCE(xp_from_quests, 0) + v_xp_delta,
        coins_from_quests = COALESCE(coins_from_quests, 0) + v_coins_delta
    WHERE id = v_user_id;
  END IF;

  -- Advance route
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

  -- Log node
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

GRANT EXECUTE ON FUNCTION public.rpc_quest_claim_event(UUID, INTEGER) TO authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 9. RPC: rpc_quest_retreat
-- ════════════════════════════════════════════════════════════════════════════
-- Player retreats early. Keeps accumulated rewards but gets no chest.

CREATE OR REPLACE FUNCTION public.rpc_quest_retreat(
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
    RAISE EXCEPTION 'Quest run not found or already completed';
  END IF;

  -- Must have cleared at least 3 nodes to retreat
  IF v_run.current_node < 3 THEN
    RAISE EXCEPTION 'Must clear at least 3 nodes to retreat';
  END IF;

  UPDATE quest_runs
  SET status = 'retreated',
      completed_at = now()
  WHERE id = p_run_id;

  RETURN jsonb_build_object(
    'status', 'retreated',
    'rewards_xp', v_run.rewards_xp,
    'rewards_coins', v_run.rewards_coins,
    'nodes_cleared', v_run.current_node
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_quest_retreat(UUID) TO authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 10. RPC: rpc_quest_open_chest
-- ════════════════════════════════════════════════════════════════════════════
-- Opens the final chest. Calculates tier (bronze/silver/gold) based on
-- streak and perfect run. Awards bonus XP/coins.

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


-- ════════════════════════════════════════════════════════════════════════════
-- 11. HELPER: rpc_quest_get_missions
-- ════════════════════════════════════════════════════════════════════════════
-- Returns all active missions for a subject, plus the player's best run info.

CREATE OR REPLACE FUNCTION public.rpc_quest_get_missions(
  p_subject TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_result JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', m.id,
      'subject', m.subject,
      'code', m.code,
      'title', m.title,
      'description', m.description,
      'mission_type', m.mission_type,
      'difficulty', m.difficulty,
      'route_template', m.route_template,
      'energy_cost', m.energy_cost,
      'sort_order', m.sort_order,
      'best_run', (
        SELECT jsonb_build_object(
          'chest_tier', r.chest_tier,
          'perfect_run', r.perfect_run,
          'rewards_xp', r.rewards_xp,
          'completed_at', r.completed_at
        )
        FROM quest_runs r
        WHERE r.user_id = v_user_id
          AND r.mission_id = m.id
          AND r.status = 'completed'
        ORDER BY r.rewards_xp DESC
        LIMIT 1
      ),
      'active_run_id', (
        SELECT r.id
        FROM quest_runs r
        WHERE r.user_id = v_user_id
          AND r.mission_id = m.id
          AND r.status = 'active'
        LIMIT 1
      )
    )
    ORDER BY m.sort_order
  ) INTO v_result
  FROM quest_missions m
  WHERE m.is_active = true
    AND (p_subject IS NULL OR m.subject = p_subject);

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_quest_get_missions(TEXT) TO authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 12. HELPER: rpc_quest_resume_run
-- ════════════════════════════════════════════════════════════════════════════
-- Returns a player's active run state (for page reload / reconnection).

CREATE OR REPLACE FUNCTION public.rpc_quest_resume_run(
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
  v_mission RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_run
  FROM quest_runs
  WHERE id = p_run_id AND user_id = v_user_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'No active run found');
  END IF;

  SELECT title, mission_type INTO v_mission
  FROM quest_missions WHERE id = v_run.mission_id;

  RETURN jsonb_build_object(
    'run_id', v_run.id,
    'mission_id', v_run.mission_id,
    'mission_title', v_mission.title,
    'mission_type', v_mission.mission_type,
    'status', v_run.status,
    'current_node', v_run.current_node,
    'streak', v_run.streak,
    'rewards_xp', v_run.rewards_xp,
    'rewards_coins', v_run.rewards_coins,
    'route', v_run.route,
    'started_at', v_run.started_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_quest_resume_run(UUID) TO authenticated;
