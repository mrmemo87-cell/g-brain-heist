-- ============================================================
-- FIX: Make quest_start_run auto-clean old active runs
-- ============================================================
-- Run EACH statement one at a time if the whole script errors.
-- ============================================================

-- Step 1: Find and delete stuck active runs (run this FIRST)
DELETE FROM quest_run_nodes WHERE run_id IN (SELECT id FROM quest_runs WHERE status = 'active');

-- Step 2: Delete the active runs themselves
DELETE FROM quest_runs WHERE status = 'active';

-- Step 3: Replace rpc_quest_start_run so it auto-cleans instead of erroring
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
  v_fallback_question_count INTEGER := 0;
  v_node_type TEXT;
  v_node_diff TEXT;
  v_subject_name TEXT;
  v_run_id UUID;
  v_i INTEGER;
  v_node_count INTEGER;
  v_old_run_id UUID;
  v_template_question_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Instead of blocking, auto-delete any stale active runs for this user
  FOR v_old_run_id IN
    SELECT id FROM quest_runs
    WHERE user_id = v_user_id AND status = 'active'
  LOOP
    DELETE FROM quest_run_nodes WHERE run_id = v_old_run_id;
    DELETE FROM quest_runs WHERE id = v_old_run_id;
  END LOOP;

  -- Get mission
  SELECT * INTO v_mission
  FROM quest_missions
  WHERE id = p_mission_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mission not found or inactive';
  END IF;

  v_route := v_mission.route_template;
  v_node_count := jsonb_array_length(v_route);
  v_subject_name := v_mission.subject;

  -- Fetch fallback random questions only for nodes that do not already
  -- specify a question_id in the mission template.
  WITH question_needs AS (
    SELECT
      ordinality - 1 AS idx,
      elem->>'type' AS ntype
    FROM jsonb_array_elements(v_route) WITH ORDINALITY AS t(elem, ordinality)
    WHERE elem->>'type' IN ('question', 'elite_question')
      AND NULLIF(elem->>'question_id', '') IS NULL
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

  SELECT COUNT(*) INTO v_fallback_question_count
  FROM jsonb_array_elements(v_route) AS elem
  WHERE elem->>'type' IN ('question', 'elite_question')
    AND NULLIF(elem->>'question_id', '') IS NULL;

  IF v_fallback_question_count > 0 AND (
       array_length(v_questions, 1) IS NULL OR
       array_length(v_questions, 1) < v_fallback_question_count
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
        v_template_question_id := NULLIF(v_node->>'question_id', '')::uuid;

        IF v_template_question_id IS NOT NULL THEN
          SELECT q.id, q.question_text, q.options, q.correct_answer,
                 q.explanation, q.difficulty, q.time_limit
          INTO v_question
          FROM questions q
          WHERE q.id = v_template_question_id
            AND q.is_active = true;

          IF NOT FOUND THEN
            RAISE EXCEPTION 'Mission template question % was not found or inactive', v_template_question_id;
          END IF;
        ELSE
        SELECT q.id, q.question_text, q.options, q.correct_answer,
               q.explanation, q.difficulty, q.time_limit
        INTO v_question
        FROM questions q
        WHERE q.id = v_questions[v_q_cursor];
        END IF;

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

        IF v_template_question_id IS NULL THEN
          v_q_cursor := v_q_cursor + 1;
        END IF;

      -- Hydrate event nodes
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
