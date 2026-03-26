-- ════════════════════════════════════════════════════════════════════════════
-- Backfill teacher quest missions from already-existing questions
--
-- Goal:
--   Create real quest_missions for historical teacher-uploaded questions
--   without re-uploading CSV files.
--
-- Grouping:
--   teacher_id + subject + (topic_name or topic)
--
-- Idempotency:
--   Deterministic title per group/part; skip if quest_missions row already exists
--   for the same teacher + subject + title.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Shared internal creator so both normal teacher flow and backfill share
--    the same route-building logic.
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
  v_route JSONB := '[]'::jsonb;
  v_qid UUID;
  v_idx INTEGER := 0;
  v_code TEXT;
  v_total INTEGER;
BEGIN
  IF p_owner_id IS NULL THEN
    RAISE EXCEPTION 'Mission owner is required';
  END IF;

  v_total := array_length(p_question_ids, 1);

  IF v_total IS NULL OR v_total = 0 THEN
    RAISE EXCEPTION 'At least one question is required';
  END IF;

  IF v_total > 20 THEN
    RAISE EXCEPTION 'A quest may contain at most 20 question nodes';
  END IF;

  -- START node
  v_route := v_route || jsonb_build_array(
    jsonb_build_object('index', 0, 'type', 'start', 'label', 'Mission Start')
  );

  v_idx := 1;
  FOREACH v_qid IN ARRAY p_question_ids LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM questions
      WHERE id = v_qid
        AND (teacher_id = p_owner_id OR is_public = true)
    ) THEN
      RAISE EXCEPTION 'Question % is not accessible to mission owner %', v_qid, p_owner_id;
    END IF;

    v_route := v_route || jsonb_build_array(
      jsonb_build_object(
        'index', v_idx,
        'type', CASE WHEN v_idx = v_total THEN 'elite_question' ELSE 'question' END,
        'label', 'Station ' || v_idx,
        'difficulty', p_difficulty,
        'question_id', v_qid
      )
    );
    v_idx := v_idx + 1;
  END LOOP;

  -- REWARD node
  v_route := v_route || jsonb_build_array(
    jsonb_build_object('index', v_idx, 'type', 'reward', 'label', 'Supply Cache')
  );
  v_idx := v_idx + 1;

  -- FINAL CHEST node
  v_route := v_route || jsonb_build_array(
    jsonb_build_object('index', v_idx, 'type', 'final_chest', 'label', 'Mission Vault')
  );

  v_code := 'teacher_' ||
    lower(regexp_replace(p_title, '[^a-zA-Z0-9]+', '_', 'g')) ||
    '_' || floor(random() * 9000 + 1000)::text;

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

  RETURN v_mission_id;
END;
$$;

REVOKE ALL ON FUNCTION internal_create_teacher_quest_mission(UUID, TEXT, TEXT, UUID[], TEXT, TEXT) FROM PUBLIC, anon;


-- 2) Keep existing teacher flow intact, now routed through the shared helper.
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


-- 3) Backfill RPC: teacher or admin triggered.
CREATE OR REPLACE FUNCTION rpc_teacher_backfill_quest_missions_from_questions(
  p_teacher_id UUID DEFAULT NULL,
  p_publish BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_actor_role TEXT;
  v_created_count INTEGER := 0;
  v_skipped_count INTEGER := 0;
  v_published_count INTEGER := 0;
  v_groups_count INTEGER := 0;
  v_teachers_count INTEGER := 0;
  v_title TEXT;
  v_mission_id UUID;
  v_total INTEGER;
  v_part_count INTEGER;
  v_part_idx INTEGER;
  v_start_idx INTEGER;
  v_end_idx INTEGER;
  v_chunk UUID[];
  v_teacher_filter UUID;
  r RECORD;
BEGIN
  SELECT role INTO v_actor_role FROM users WHERE id = v_actor_id;

  IF v_actor_role IS NULL THEN
    RAISE EXCEPTION 'Forbidden: user profile not found';
  END IF;

  IF v_actor_role NOT IN ('teacher', 'admin', 'school_admin', 'superadmin') THEN
    RAISE EXCEPTION 'Forbidden: only teacher/admin roles can run quest backfill';
  END IF;

  IF v_actor_role = 'teacher' THEN
    IF p_teacher_id IS NOT NULL AND p_teacher_id <> v_actor_id THEN
      RAISE EXCEPTION 'Forbidden: teachers may only backfill their own questions';
    END IF;
    v_teacher_filter := v_actor_id;
  ELSE
    v_teacher_filter := p_teacher_id;
  END IF;

  FOR r IN
    WITH grouped AS (
      SELECT
        q.teacher_id,
        COALESCE(NULLIF(q.subject, ''), 'General') AS subject,
        COALESCE(NULLIF(q.topic_name, ''), NULLIF(q.topic, ''), 'General') AS topic,
        COALESCE((array_agg(q.difficulty ORDER BY q.created_at, q.id))[1], 'medium') AS difficulty,
        array_agg(q.id ORDER BY q.created_at, q.id) AS question_ids
      FROM questions q
      WHERE q.teacher_id IS NOT NULL
        AND (v_teacher_filter IS NULL OR q.teacher_id = v_teacher_filter)
      GROUP BY
        q.teacher_id,
        COALESCE(NULLIF(q.subject, ''), 'General'),
        COALESCE(NULLIF(q.topic_name, ''), NULLIF(q.topic, ''), 'General')
    )
    SELECT * FROM grouped
    ORDER BY teacher_id, subject, topic
  LOOP
    v_groups_count := v_groups_count + 1;

    v_total := COALESCE(array_length(r.question_ids, 1), 0);
    IF v_total = 0 THEN
      CONTINUE;
    END IF;

    v_part_count := CEIL(v_total / 20.0);

    FOR v_part_idx IN 1..v_part_count LOOP
      v_start_idx := ((v_part_idx - 1) * 20) + 1;
      v_end_idx := LEAST(v_part_idx * 20, v_total);
      v_chunk := r.question_ids[v_start_idx:v_end_idx];

      v_title := CASE
        WHEN v_part_count > 1 THEN format('CSV Upload: %s • %s (Part %s)', r.subject, r.topic, v_part_idx)
        ELSE format('CSV Upload: %s • %s', r.subject, r.topic)
      END;

      IF EXISTS (
        SELECT 1
        FROM quest_missions m
        WHERE m.created_by = r.teacher_id
          AND m.subject = r.subject
          AND m.title = v_title
      ) THEN
        v_skipped_count := v_skipped_count + 1;
        CONTINUE;
      END IF;

      v_mission_id := internal_create_teacher_quest_mission(
        r.teacher_id,
        v_title,
        r.subject,
        v_chunk,
        COALESCE(r.difficulty, 'medium'),
        format('Auto-generated from existing uploaded questions (%s / %s).', r.subject, r.topic)
      );

      v_created_count := v_created_count + 1;

      IF p_publish THEN
        UPDATE quest_missions
        SET is_active = true
        WHERE id = v_mission_id;
        v_published_count := v_published_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  SELECT COUNT(DISTINCT q.teacher_id)
  INTO v_teachers_count
  FROM questions q
  WHERE q.teacher_id IS NOT NULL
    AND (v_teacher_filter IS NULL OR q.teacher_id = v_teacher_filter);

  RETURN jsonb_build_object(
    'actor_id', v_actor_id,
    'actor_role', v_actor_role,
    'teachers_scanned', COALESCE(v_teachers_count, 0),
    'groups_scanned', v_groups_count,
    'created_missions', v_created_count,
    'skipped_missions', v_skipped_count,
    'published_missions', v_published_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_teacher_backfill_quest_missions_from_questions(UUID, BOOLEAN) TO authenticated;
