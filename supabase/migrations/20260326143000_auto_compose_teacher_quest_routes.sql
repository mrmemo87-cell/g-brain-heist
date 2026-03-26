-- Auto-compose pacing/breaker nodes for teacher-generated quest missions.
-- Reuses existing production-safe node types: question, elite_question, reward, surprise, final_chest.

CREATE OR REPLACE FUNCTION internal_compose_teacher_route(
  p_question_ids UUID[],
  p_difficulty TEXT DEFAULT 'medium'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_route JSONB := '[]'::jsonb;
  v_qid UUID;
  v_total INTEGER := COALESCE(array_length(p_question_ids, 1), 0);
  v_question_index INTEGER := 0;
  v_node_index INTEGER := 0;
  v_break_after_one INTEGER := NULL;
  v_break_after_two INTEGER := NULL;
  v_added_breakers INTEGER := 0;
BEGIN
  IF v_total = 0 THEN
    RAISE EXCEPTION 'At least one question is required';
  END IF;

  IF v_total > 20 THEN
    RAISE EXCEPTION 'A quest may contain at most 20 question nodes';
  END IF;

  -- START node
  v_route := v_route || jsonb_build_array(
    jsonb_build_object('index', v_node_index, 'type', 'start', 'label', 'Mission Start', 'auto_composed', true)
  );
  v_node_index := v_node_index + 1;

  -- Balanced pacing: insert a breaker after 2-3 questions, optionally a second breaker
  -- after another 2-3 questions while leaving >=2 questions for the end segment.
  IF v_total >= 4 THEN
    v_break_after_one := CASE WHEN v_total >= 8 THEN 3 ELSE 2 END;

    IF (v_total - v_break_after_one) >= 5 THEN
      v_break_after_two := v_break_after_one + 3;
    ELSIF (v_total - v_break_after_one) >= 4 THEN
      v_break_after_two := v_break_after_one + 2;
    END IF;
  END IF;

  FOREACH v_qid IN ARRAY p_question_ids LOOP
    v_question_index := v_question_index + 1;

    v_route := v_route || jsonb_build_array(
      jsonb_build_object(
        'index', v_node_index,
        'type', CASE WHEN v_question_index = v_total THEN 'elite_question' ELSE 'question' END,
        'label', 'Station ' || v_question_index,
        'difficulty', p_difficulty,
        'question_id', v_qid
      )
    );
    v_node_index := v_node_index + 1;

    IF v_break_after_one IS NOT NULL AND v_question_index = v_break_after_one THEN
      v_route := v_route || jsonb_build_array(
        jsonb_build_object('index', v_node_index, 'type', 'reward', 'label', 'Supply Cache')
      );
      v_node_index := v_node_index + 1;
      v_added_breakers := v_added_breakers + 1;
    ELSIF v_break_after_two IS NOT NULL AND v_question_index = v_break_after_two THEN
      v_route := v_route || jsonb_build_array(
        jsonb_build_object(
          'index', v_node_index,
          'type', CASE WHEN v_total >= 7 THEN 'surprise' ELSE 'reward' END,
          'label', CASE WHEN v_total >= 7 THEN 'Spin Node' ELSE 'Intel Cache' END
        )
      );
      v_node_index := v_node_index + 1;
      v_added_breakers := v_added_breakers + 1;
    END IF;
  END LOOP;

  -- Guarantee at least one mid-mission breaker for very short missions.
  IF v_added_breakers = 0 THEN
    v_route := v_route || jsonb_build_array(
      jsonb_build_object('index', v_node_index, 'type', 'reward', 'label', 'Supply Cache')
    );
    v_node_index := v_node_index + 1;
  END IF;

  -- FINAL CHEST node
  v_route := v_route || jsonb_build_array(
    jsonb_build_object('index', v_node_index, 'type', 'final_chest', 'label', 'Mission Vault')
  );

  RETURN v_route;
END;
$$;

REVOKE ALL ON FUNCTION internal_compose_teacher_route(UUID[], TEXT) FROM PUBLIC, anon;


CREATE OR REPLACE FUNCTION internal_create_teacher_quest_mission(
  p_owner_id UUID,
  p_title TEXT,
  p_subject TEXT,
  p_question_ids UUID[],
  p_difficulty TEXT DEFAULT 'medium',
  p_description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mission_id UUID;
  v_qid UUID;
  v_code TEXT;
  v_route JSONB;
  v_has_created_by BOOLEAN := false;
BEGIN
  IF p_owner_id IS NULL THEN
    RAISE EXCEPTION 'Mission owner is required';
  END IF;

  FOREACH v_qid IN ARRAY p_question_ids LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM questions
      WHERE id = v_qid
        AND (teacher_id = p_owner_id OR is_public = true)
    ) THEN
      RAISE EXCEPTION 'Question % is not accessible to mission owner %', v_qid, p_owner_id;
    END IF;
  END LOOP;

  v_route := internal_compose_teacher_route(p_question_ids, p_difficulty);

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'quest_missions'
      AND column_name = 'created_by'
  ) INTO v_has_created_by;

  v_code := 'teacher_' ||
    lower(regexp_replace(p_title, '[^a-zA-Z0-9]+', '_', 'g')) ||
    '_' || floor(random() * 9000 + 1000)::text;

  IF v_has_created_by THEN
    INSERT INTO quest_missions (
      subject,
      code,
      title,
      description,
      mission_type,
      difficulty,
      route_template,
      energy_cost,
      sort_order,
      is_active,
      created_by
    )
    VALUES (
      p_subject,
      v_code,
      p_title,
      COALESCE(p_description, 'Teacher-created quest mission'),
      'standard',
      p_difficulty,
      v_route,
      0,
      999,
      false,
      p_owner_id
    )
    RETURNING id INTO v_mission_id;
  ELSE
    INSERT INTO quest_missions (
      subject,
      code,
      title,
      description,
      mission_type,
      difficulty,
      route_template,
      energy_cost,
      sort_order,
      is_active
    )
    VALUES (
      p_subject,
      v_code,
      p_title,
      COALESCE(p_description, 'Teacher-created quest mission'),
      'standard',
      p_difficulty,
      v_route,
      0,
      999,
      false
    )
    RETURNING id INTO v_mission_id;
  END IF;

  RETURN v_mission_id;
END;
$$;

REVOKE ALL ON FUNCTION internal_create_teacher_quest_mission(UUID, TEXT, TEXT, UUID[], TEXT, TEXT) FROM PUBLIC, anon;


-- Keep existing teacher mission creator RPC entrypoint, now using auto-composed pacing.
CREATE OR REPLACE FUNCTION rpc_teacher_create_quest_mission(
  p_title TEXT,
  p_subject TEXT,
  p_question_ids UUID[],
  p_difficulty TEXT DEFAULT 'medium',
  p_description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'teacher') THEN
    RAISE EXCEPTION 'Forbidden: only teachers can create quest missions';
  END IF;

  RETURN internal_create_teacher_quest_mission(
    auth.uid(),
    p_title,
    p_subject,
    p_question_ids,
    p_difficulty,
    p_description
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_teacher_create_quest_mission(TEXT, TEXT, UUID[], TEXT, TEXT) TO authenticated;


-- Idempotent backfill/recomposition for existing auto-generated teacher missions.
-- Skips custom/manual missions by targeting auto-generated description patterns and teacher code prefix.
WITH existing_teacher_auto_missions AS (
  SELECT
    m.id,
    COALESCE(NULLIF(m.difficulty, ''), 'medium') AS difficulty,
    array_agg((e.elem->>'question_id')::UUID ORDER BY e.ord) AS question_ids
  FROM quest_missions m
  JOIN LATERAL jsonb_array_elements(m.route_template) WITH ORDINALITY e(elem, ord) ON true
  WHERE m.code LIKE 'teacher_%'
    AND (
      m.description = 'Teacher-created quest mission'
      OR m.description LIKE 'Auto-generated from existing uploaded questions%'
    )
    AND e.elem->>'type' IN ('question', 'elite_question')
    AND e.elem ? 'question_id'
  GROUP BY m.id, m.difficulty
)
UPDATE quest_missions m
SET route_template = internal_compose_teacher_route(c.question_ids, c.difficulty)
FROM existing_teacher_auto_missions c
WHERE m.id = c.id
  AND COALESCE(array_length(c.question_ids, 1), 0) > 0
  AND m.route_template IS DISTINCT FROM internal_compose_teacher_route(c.question_ids, c.difficulty);
