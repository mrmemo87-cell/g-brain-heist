-- ============================================================
-- View: assignment_question_details
-- ============================================================

-- Drop and recreate view to add image_url column
DROP VIEW IF EXISTS assignment_question_details;

CREATE VIEW assignment_question_details AS
SELECT
  aq.assignment_id,
  aq.question_id,
  aq.order_index,
  q.teacher_id,
  q.subject,
  q.subject_id,
  q.topic,
  q.topic_name,
  q.difficulty,
  q.question_text,
  q.image_url,
  q.question_type,
  q.options,
  q.correct_answer,
  q.explanation,
  q.hints,
  q.time_limit,
  q.points,
  q.tags,
  q.grade_level,
  q.is_public,
  q.is_active,
  q.times_answered,
  q.times_correct,
  q.created_at,
  q.updated_at
FROM assignment_questions aq
JOIN questions q ON q.id = aq.question_id;
-- ============================================================
-- Teacher Assignment + Topic Upgrade
-- ============================================================

-- Extend questions table with subject/topic metadata
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS subject_id TEXT,
  ADD COLUMN IF NOT EXISTS topic_name TEXT;

UPDATE questions
SET topic_name = COALESCE(topic_name, topic, 'General')
WHERE topic_name IS NULL;

ALTER TABLE questions
  ALTER COLUMN topic_name SET NOT NULL,
  ALTER COLUMN topic_name SET DEFAULT 'General';

-- ============================================================
-- Assignment Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  subject_id TEXT,
  subject_name TEXT NOT NULL,
  topic_name TEXT NOT NULL,
  batch TEXT NOT NULL CHECK (batch IN ('8A','8B','8C','All')),
  difficulty TEXT CHECK (difficulty IN ('easy','medium','hard')),
  title TEXT,
  instructions TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assignment_questions (
  assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  PRIMARY KEY (assignment_id, question_id)
);

CREATE TABLE IF NOT EXISTS student_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
  student_id UUID REFERENCES users(id) ON DELETE CASCADE,
  batch TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed')),
  assigned_at TIMESTAMPTZ NOT NULL,
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS student_assignment_results (
  assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
  student_id UUID REFERENCES users(id) ON DELETE CASCADE,
  correct INT NOT NULL DEFAULT 0,
  incorrect INT NOT NULL DEFAULT 0,
  accuracy INT NOT NULL DEFAULT 0,
  score INT NOT NULL DEFAULT 0,
  time_taken_seconds INT NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (assignment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_assignment_questions_assignment ON assignment_questions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_student_assignments_student ON student_assignments(student_id);
CREATE INDEX IF NOT EXISTS idx_student_assignments_status ON student_assignments(status);
CREATE INDEX IF NOT EXISTS idx_student_results_assignment ON student_assignment_results(assignment_id);

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_assignment_results ENABLE ROW LEVEL SECURITY;
ALTER VIEW assignment_question_details SET (security_invoker = true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'assignments'
      AND policyname = 'Teachers manage own assignments'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Teachers manage own assignments"
      ON assignments
      USING (EXISTS (SELECT 1 FROM teachers t WHERE t.id = assignments.teacher_id AND t.user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM teachers t WHERE t.id = assignments.teacher_id AND t.user_id = auth.uid()))
    $policy$;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'assignment_questions'
      AND policyname = 'Teachers manage assignment questions'
  ) THEN
    EXECUTE $policy_assignment_questions$
      CREATE POLICY "Teachers manage assignment questions"
      ON assignment_questions
      USING (EXISTS (
        SELECT 1 FROM assignments a
        JOIN teachers t ON t.id = a.teacher_id
        WHERE a.id = assignment_id AND t.user_id = auth.uid()
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM assignments a
        JOIN teachers t ON t.id = a.teacher_id
        WHERE a.id = assignment_id AND t.user_id = auth.uid()
      ))
    $policy_assignment_questions$;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'assignments'
      AND policyname = 'Students view assigned assignments'
  ) THEN
    EXECUTE $policy_assignments_students$
      CREATE POLICY "Students view assigned assignments"
      ON assignments
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM student_assignments sa
          WHERE sa.assignment_id = assignments.id
            AND sa.student_id = auth.uid()
        )
      )
    $policy_assignments_students$;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'assignment_questions'
      AND policyname = 'Students view assigned questions'
  ) THEN
    EXECUTE $policy_assignment_questions_students$
      CREATE POLICY "Students view assigned questions"
      ON assignment_questions
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM student_assignments sa
          WHERE sa.assignment_id = assignment_questions.assignment_id
            AND sa.student_id = auth.uid()
        )
      )
    $policy_assignment_questions_students$;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'student_assignments'
      AND policyname = 'Students view own assignments'
  ) THEN
    EXECUTE $policy_student_assignments_select$
      CREATE POLICY "Students view own assignments"
      ON student_assignments
      FOR SELECT
      USING (student_id = auth.uid())
    $policy_student_assignments_select$;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'student_assignments'
      AND policyname = 'Students update own assignments'
  ) THEN
    EXECUTE $policy_student_assignments_update$
      CREATE POLICY "Students update own assignments"
      ON student_assignments
      FOR UPDATE
      USING (student_id = auth.uid())
    $policy_student_assignments_update$;
  END IF;
END;
$$;

GRANT SELECT ON assignment_question_details TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'student_assignment_results'
      AND policyname = 'Students view own assignment results'
  ) THEN
    EXECUTE $policy_student_results_select$
      CREATE POLICY "Students view own assignment results"
      ON student_assignment_results
      FOR SELECT
      USING (student_id = auth.uid())
    $policy_student_results_select$;
  END IF;
END;
$$;

-- ============================================================
-- Helper function
-- ============================================================

CREATE OR REPLACE FUNCTION ensure_teacher(p_teacher_id uuid)
RETURNS BOOLEAN AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM teachers t
    WHERE t.id = p_teacher_id AND t.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RPC: Create assignment
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_create_assignment(
  p_teacher_id uuid,
  p_subject_id text,
  p_subject_name text,
  p_topic_name text,
  p_batch text,
  p_question_ids uuid[],
  p_assigned_at timestamptz,
  p_due_at timestamptz,
  p_title text,
  p_instructions text,
  p_difficulty text
)
RETURNS assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_assignment assignments;
BEGIN
  PERFORM ensure_teacher(p_teacher_id);
  IF coalesce(array_length(p_question_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Assignment must include at least one question';
  END IF;

  INSERT INTO assignments (
    teacher_id,
    subject_id,
    subject_name,
    topic_name,
    batch,
    difficulty,
    title,
    instructions,
    assigned_at,
    due_at
  ) VALUES (
    p_teacher_id,
    p_subject_id,
    p_subject_name,
    p_topic_name,
    p_batch,
    p_difficulty,
    p_title,
    p_instructions,
    COALESCE(p_assigned_at, NOW()),
    p_due_at
  ) RETURNING * INTO new_assignment;

  INSERT INTO assignment_questions (assignment_id, question_id, order_index)
  SELECT new_assignment.id, question_id, row_number() OVER ()
  FROM unnest(p_question_ids) AS question_id;

  INSERT INTO student_assignments (assignment_id, student_id, batch, status, assigned_at, due_at)
  SELECT
    new_assignment.id,
    u.id,
    u.batch,
    'pending',
    new_assignment.assigned_at,
    new_assignment.due_at
  FROM users u
  WHERE COALESCE(u.role, 'student') = 'student'
    AND (
      p_batch = 'All'
      OR u.batch = p_batch
    );

  RETURN new_assignment;
END;
$$;

-- ============================================================
-- RPC: Teacher assignments summary
-- ============================================================

DROP FUNCTION IF EXISTS rpc_get_assignments_for_teacher(uuid);

CREATE OR REPLACE FUNCTION rpc_get_assignments_for_teacher(p_teacher_id uuid)
RETURNS TABLE (
  id uuid,
  teacher_id uuid,
  subject_id text,
  subject_name text,
  topic_name text,
  batch text,
  difficulty text,
  title text,
  instructions text,
  assigned_at timestamptz,
  due_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  question_count int,
  completed_count int,
  student_count int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
    a.teacher_id,
    a.subject_id,
    a.subject_name,
    a.topic_name,
    a.batch,
    a.difficulty,
    a.title,
    a.instructions,
    a.assigned_at,
    a.due_at,
    a.created_at,
    a.updated_at,
    COALESCE((SELECT COUNT(*) FROM assignment_questions aq WHERE aq.assignment_id = a.id), 0) AS question_count,
    COALESCE((SELECT COUNT(*) FROM student_assignments sa WHERE sa.assignment_id = a.id AND sa.status = 'completed'), 0) AS completed_count,
    COALESCE((SELECT COUNT(*) FROM student_assignments sa WHERE sa.assignment_id = a.id), 0) AS student_count
  FROM assignments a
  WHERE a.teacher_id = p_teacher_id
    AND EXISTS (
      SELECT 1 FROM teachers t WHERE t.id = p_teacher_id AND t.user_id = auth.uid()
    )
  ORDER BY a.assigned_at DESC;
$$;

-- ============================================================
-- RPC: Active assignment for student
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_get_student_active_assignment()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid := auth.uid();
  v_assignment_id uuid;
  payload jsonb;
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  -- First, find the active assignment for this student
  -- Only select assignments that actually have questions
  SELECT sa.assignment_id INTO v_assignment_id
  FROM student_assignments sa
  WHERE sa.student_id = v_student_id
    AND sa.status = 'pending'
    AND EXISTS (
      SELECT 1 FROM assignment_questions aq
      WHERE aq.assignment_id = sa.assignment_id
    )
  ORDER BY sa.assigned_at
  LIMIT 1;

  -- If no assignment found, return null
  IF v_assignment_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Build the payload with all assignment details and questions
  -- Using SECURITY DEFINER context to bypass RLS on questions table
  SELECT jsonb_build_object(
    'assignment_id', a.id,
    'subject_id', a.subject_id,
    'subject_name', a.subject_name,
    'topic_name', a.topic_name,
    'batch', a.batch,
    'teacher_username', u.username,
    'assigned_at', a.assigned_at,
    'due_at', a.due_at,
    'title', a.title,
    'instructions', a.instructions,
    'questions', (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', q.id,
            'teacher_id', q.teacher_id,
            'subject', q.subject,
            'subject_id', q.subject_id,
            'topic', q.topic,
            'topic_name', q.topic_name,
            'difficulty', q.difficulty,
            'question_text', q.question_text,
            'image_url', q.image_url,
            'question_type', q.question_type,
            'options', q.options,
            'correct_answer', q.correct_answer,
            'explanation', q.explanation,
            'hints', q.hints,
            'time_limit', q.time_limit,
            'points', q.points,
            'tags', q.tags,
            'grade_level', q.grade_level,
            'is_public', q.is_public,
            'is_active', q.is_active,
            'times_answered', q.times_answered,
            'times_correct', q.times_correct,
            'created_at', q.created_at,
            'updated_at', q.updated_at
          )
          ORDER BY aq.order_index
        ),
        '[]'::jsonb
      )
      FROM assignment_questions aq
      JOIN questions q ON q.id = aq.question_id
      WHERE aq.assignment_id = v_assignment_id
    )
  ) INTO payload
  FROM assignments a
  JOIN teachers t ON t.id = a.teacher_id
  JOIN users u ON u.id = t.user_id
  WHERE a.id = v_assignment_id;

  RETURN payload;
END;
$$;

-- ============================================================
-- RPC: Pending assignments for student
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_get_student_pending_assignments()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid := auth.uid();
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(payload ORDER BY assigned_at), '[]'::jsonb)
    FROM (
      SELECT
        jsonb_build_object(
          'assignment_id', a.id,
          'subject_id', a.subject_id,
          'subject_name', a.subject_name,
          'topic_name', a.topic_name,
          'batch', a.batch,
          'teacher_username', u.username,
          'assigned_at', a.assigned_at,
          'due_at', a.due_at,
          'title', a.title,
          'instructions', a.instructions,
          'questions', (
            SELECT COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'id', q.id,
                  'teacher_id', q.teacher_id,
                  'subject', q.subject,
                  'subject_id', q.subject_id,
                  'topic', q.topic,
                  'topic_name', q.topic_name,
                  'difficulty', q.difficulty,
                  'question_text', q.question_text,
                  'image_url', q.image_url,
                  'question_type', q.question_type,
                  'options', q.options,
                  'correct_answer', q.correct_answer,
                  'explanation', q.explanation,
                  'hints', q.hints,
                  'time_limit', q.time_limit,
                  'points', q.points,
                  'tags', q.tags,
                  'grade_level', q.grade_level,
                  'is_public', q.is_public,
                  'is_active', q.is_active,
                  'times_answered', q.times_answered,
                  'times_correct', q.times_correct,
                  'created_at', q.created_at,
                  'updated_at', q.updated_at
                )
                ORDER BY aq.order_index
              ),
              '[]'::jsonb
            )
            FROM assignment_questions aq
            JOIN questions q ON q.id = aq.question_id
            WHERE aq.assignment_id = a.id
          )
        ) AS payload,
        sa.assigned_at
      FROM student_assignments sa
      JOIN assignments a ON a.id = sa.assignment_id
      JOIN teachers t ON t.id = a.teacher_id
      JOIN users u ON u.id = t.user_id
      WHERE sa.student_id = v_student_id
        AND sa.status = 'pending'
        AND EXISTS (
          SELECT 1 FROM assignment_questions aq
          WHERE aq.assignment_id = a.id
        )
      ORDER BY sa.assigned_at
    ) pending;
  );
END;
$$;

-- ============================================================
-- RPC: Submit assignment result
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_submit_assignment_result(
  p_assignment_id uuid,
  p_correct int,
  p_incorrect int,
  p_accuracy int,
  p_score int,
  p_time_taken int
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid := auth.uid();
  v_assignment_status text;
  v_question_count int;
  v_max_score int;
  v_expected_accuracy int;
  v_updated_assignment_id uuid;
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  IF p_assignment_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ASSIGNMENT_ID';
  END IF;

  SELECT
    sa.status,
    COUNT(aq.question_id)::int AS question_count,
    COALESCE(SUM(COALESCE(q.points, 0)), 0)::int AS max_score
  INTO v_assignment_status, v_question_count, v_max_score
  FROM assignments a
  JOIN student_assignments sa
    ON sa.assignment_id = a.id
   AND sa.student_id = v_student_id
  LEFT JOIN assignment_questions aq
    ON aq.assignment_id = a.id
  LEFT JOIN questions q
    ON q.id = aq.question_id
  WHERE a.id = p_assignment_id
  GROUP BY sa.status;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSIGNMENT_NOT_FOUND_OR_NOT_ASSIGNED';
  END IF;

  IF v_question_count <= 0 THEN
    RAISE EXCEPTION 'ASSIGNMENT_HAS_NO_QUESTIONS';
  END IF;

  IF v_assignment_status NOT IN ('pending', 'in_progress') THEN
    RAISE EXCEPTION 'ASSIGNMENT_NOT_SUBMITTABLE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM student_assignment_results r
    WHERE r.assignment_id = p_assignment_id
      AND r.student_id = v_student_id
  ) THEN
    RAISE EXCEPTION 'ASSIGNMENT_ALREADY_SUBMITTED';
  END IF;

  IF p_correct < 0 OR p_incorrect < 0 OR p_time_taken < 0 OR p_score < 0 OR p_accuracy < 0 THEN
    RAISE EXCEPTION 'INVALID_NEGATIVE_VALUES';
  END IF;

  IF p_accuracy > 100 THEN
    RAISE EXCEPTION 'INVALID_ACCURACY_RANGE';
  END IF;

  IF p_correct > v_question_count OR p_incorrect > v_question_count THEN
    RAISE EXCEPTION 'INVALID_QUESTION_COUNTS';
  END IF;

  IF (p_correct + p_incorrect) <> v_question_count THEN
    RAISE EXCEPTION 'MISMATCHED_QUESTION_TOTAL';
  END IF;

  v_expected_accuracy := ROUND((p_correct::numeric * 100.0) / GREATEST(v_question_count, 1));
  IF ABS(p_accuracy - v_expected_accuracy) > 1 THEN
    RAISE EXCEPTION 'INVALID_ACCURACY_CALCULATION';
  END IF;

  IF p_score > GREATEST(100, v_max_score) THEN
    RAISE EXCEPTION 'INVALID_SCORE_RANGE';
  END IF;

  UPDATE student_assignments
  SET status = 'completed', completed_at = NOW()
  WHERE assignment_id = p_assignment_id
    AND student_id = v_student_id
    AND status IN ('pending', 'in_progress')
  RETURNING assignment_id INTO v_updated_assignment_id;

  IF v_updated_assignment_id IS NULL THEN
    RAISE EXCEPTION 'ASSIGNMENT_STATE_TRANSITION_FAILED';
  END IF;

  INSERT INTO student_assignment_results (
    assignment_id,
    student_id,
    correct,
    incorrect,
    accuracy,
    score,
    time_taken_seconds,
    completed_at
  ) VALUES (
    p_assignment_id,
    v_student_id,
    GREATEST(p_correct, 0),
    GREATEST(p_incorrect, 0),
    GREATEST(p_accuracy, 0),
    GREATEST(p_score, 0),
    GREATEST(p_time_taken, 0),
    NOW()
  );
END;
$$;

-- ============================================================
-- RPC: Teacher report
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_teacher_assignment_report(
  p_assignment_id uuid,
  p_teacher_id uuid
)
RETURNS TABLE (
  student_id uuid,
  student_name text,
  batch text,
  score int,
  correct int,
  incorrect int,
  accuracy int,
  completed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM ensure_teacher(p_teacher_id);
  IF NOT EXISTS (SELECT 1 FROM assignments WHERE id = p_assignment_id AND teacher_id = p_teacher_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  RETURN QUERY
  SELECT
    r.student_id,
    u.username,
    u.batch,
    r.score,
    r.correct,
    r.incorrect,
    r.accuracy,
    r.completed_at
  FROM student_assignment_results r
  JOIN users u ON u.id = r.student_id
  WHERE r.assignment_id = p_assignment_id
  ORDER BY r.completed_at DESC;
END;
$$;
