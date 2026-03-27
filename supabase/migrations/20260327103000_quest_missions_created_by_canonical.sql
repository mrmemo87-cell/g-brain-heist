-- Canonical ownership convergence for quest_missions.
-- Goal: make created_by (users.id) the single ownership field for teacher-generated missions.

-- 1) Schema contract: created_by exists and is nullable.
ALTER TABLE public.quest_missions
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quest_missions_created_by
  ON public.quest_missions(created_by);

-- 2) RLS policies: keep active missions readable, plus owner drafts.
DROP POLICY IF EXISTS quest_missions_select ON public.quest_missions;
CREATE POLICY quest_missions_select ON public.quest_missions
  FOR SELECT TO authenticated
  USING (is_active = true OR created_by = auth.uid());

DROP POLICY IF EXISTS quest_missions_teacher_insert ON public.quest_missions;
CREATE POLICY quest_missions_teacher_insert ON public.quest_missions
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'teacher'
    )
  );

DROP POLICY IF EXISTS quest_missions_teacher_update ON public.quest_missions;
CREATE POLICY quest_missions_teacher_update ON public.quest_missions
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'teacher'
    )
  )
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS quest_missions_teacher_delete ON public.quest_missions;
CREATE POLICY quest_missions_teacher_delete ON public.quest_missions
  FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'teacher'
    )
  );

-- 3) Mission creation contract: teacher mission creator always writes created_by.
CREATE OR REPLACE FUNCTION public.internal_create_teacher_quest_mission(
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
BEGIN
  IF p_owner_id IS NULL THEN
    RAISE EXCEPTION 'Mission owner is required';
  END IF;

  FOREACH v_qid IN ARRAY p_question_ids LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.questions q
      WHERE q.id = v_qid
        AND (q.teacher_id = p_owner_id OR q.is_public = true)
    ) THEN
      RAISE EXCEPTION 'Question % is not accessible to mission owner %', v_qid, p_owner_id;
    END IF;
  END LOOP;

  v_route := public.internal_compose_teacher_route(p_question_ids, p_difficulty);

  v_code := 'teacher_' ||
    lower(regexp_replace(p_title, '[^a-zA-Z0-9]+', '_', 'g')) ||
    '_' || floor(random() * 9000 + 1000)::text;

  INSERT INTO public.quest_missions (
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

REVOKE ALL ON FUNCTION public.internal_create_teacher_quest_mission(UUID, TEXT, TEXT, UUID[], TEXT, TEXT) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.rpc_teacher_create_quest_mission(
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
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'teacher') THEN
    RAISE EXCEPTION 'Forbidden: only teachers can create quest missions';
  END IF;

  RETURN public.internal_create_teacher_quest_mission(
    auth.uid(),
    p_title,
    p_subject,
    p_question_ids,
    p_difficulty,
    p_description
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_teacher_create_quest_mission(TEXT, TEXT, UUID[], TEXT, TEXT) TO authenticated;

-- 4) Backfill path uses created_by ownership contract.
CREATE OR REPLACE FUNCTION public.rpc_teacher_backfill_quest_missions_from_questions(
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
  v_base_chunk_size INTEGER;
  v_remainder INTEGER;
  v_part_size INTEGER;
  v_start_idx INTEGER;
  v_end_idx INTEGER;
  v_chunk UUID[];
  v_teacher_filter UUID;
  r RECORD;
BEGIN
  IF p_teacher_id IS NOT NULL THEN
    v_teacher_filter := p_teacher_id;

    IF v_actor_id IS NOT NULL THEN
      SELECT role INTO v_actor_role FROM public.users WHERE id = v_actor_id;

      IF v_actor_role IS NULL THEN
        RAISE EXCEPTION 'Forbidden: user profile not found';
      END IF;

      IF v_actor_role NOT IN ('teacher', 'admin', 'school_admin', 'superadmin') THEN
        RAISE EXCEPTION 'Forbidden: only teacher/admin roles can run quest backfill';
      END IF;

      IF v_actor_role = 'teacher' AND p_teacher_id <> v_actor_id THEN
        RAISE EXCEPTION 'Forbidden: teachers may only backfill their own questions';
      END IF;
    END IF;
  ELSE
    SELECT role INTO v_actor_role FROM public.users WHERE id = v_actor_id;

    IF v_actor_role IS NULL THEN
      RAISE EXCEPTION 'Forbidden: user profile not found';
    END IF;

    IF v_actor_role NOT IN ('teacher', 'admin', 'school_admin', 'superadmin') THEN
      RAISE EXCEPTION 'Forbidden: only teacher/admin roles can run quest backfill';
    END IF;

    IF v_actor_role = 'teacher' THEN
      v_teacher_filter := v_actor_id;
    ELSE
      v_teacher_filter := NULL;
    END IF;
  END IF;

  FOR r IN
    WITH grouped AS (
      SELECT
        q.teacher_id,
        COALESCE(NULLIF(q.subject, ''), 'General') AS subject,
        COALESCE(NULLIF(q.topic_name, ''), NULLIF(q.topic, ''), 'General') AS topic,
        COALESCE((array_agg(q.difficulty ORDER BY q.created_at, q.id))[1], 'medium') AS difficulty,
        array_agg(q.id ORDER BY q.created_at, q.id) AS question_ids
      FROM public.questions q
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
    v_base_chunk_size := FLOOR(v_total::numeric / v_part_count);
    v_remainder := MOD(v_total, v_part_count);
    v_start_idx := 1;

    FOR v_part_idx IN 1..v_part_count LOOP
      v_part_size := v_base_chunk_size + CASE WHEN v_part_idx <= v_remainder THEN 1 ELSE 0 END;
      v_end_idx := LEAST(v_start_idx + v_part_size - 1, v_total);
      v_chunk := r.question_ids[v_start_idx:v_end_idx];

      v_title := CASE
        WHEN v_part_count > 1 THEN format('CSV Upload: %s • %s (Part %s)', r.subject, r.topic, v_part_idx)
        ELSE format('CSV Upload: %s • %s', r.subject, r.topic)
      END;

      IF EXISTS (
        SELECT 1
        FROM public.quest_missions m
        WHERE m.created_by = r.teacher_id
          AND m.subject = r.subject
          AND m.title = v_title
      ) THEN
        v_skipped_count := v_skipped_count + 1;
        CONTINUE;
      END IF;

      v_mission_id := public.internal_create_teacher_quest_mission(
        r.teacher_id,
        v_title,
        r.subject,
        v_chunk,
        COALESCE(r.difficulty, 'medium'),
        format('Auto-generated from existing uploaded questions (%s / %s).', r.subject, r.topic)
      );

      v_created_count := v_created_count + 1;

      IF p_publish THEN
        UPDATE public.quest_missions
        SET is_active = true
        WHERE id = v_mission_id;
        v_published_count := v_published_count + 1;
      END IF;

      v_start_idx := v_end_idx + 1;
    END LOOP;
  END LOOP;

  SELECT COUNT(DISTINCT q.teacher_id)
  INTO v_teachers_count
  FROM public.questions q
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

GRANT EXECUTE ON FUNCTION public.rpc_teacher_backfill_quest_missions_from_questions(UUID, BOOLEAN) TO authenticated;
