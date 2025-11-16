-- ============================================================
<<<<<<< HEAD
-- Teacher Assignment System
-- ============================================================
-- Provides schema and secure RPCs for teachers to schedule
-- assignments that target specific grades and batches.
=======
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
>>>>>>> 201c1acc3663b15e1c735f9c503144bc53bef4b4

-- ============================================================
-- Assignment Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  subject_id TEXT,
  subject_name TEXT NOT NULL,
<<<<<<< HEAD
  topic_name TEXT DEFAULT 'General',
  grade_levels SMALLINT[] DEFAULT ARRAY[]::SMALLINT[],
  batch_codes TEXT[] DEFAULT ARRAY[]::TEXT[],
=======
  topic_name TEXT NOT NULL,
  batch TEXT NOT NULL CHECK (batch IN ('8A','8B','8C','All')),
>>>>>>> 201c1acc3663b15e1c735f9c503144bc53bef4b4
  difficulty TEXT CHECK (difficulty IN ('easy','medium','hard')),
  title TEXT,
  instructions TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

<<<<<<< HEAD
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS grade_levels SMALLINT[] DEFAULT ARRAY[]::SMALLINT[];
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS batch_codes TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS subject_id TEXT;
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS subject_name TEXT DEFAULT 'Unknown';
ALTER TABLE assignments
  ALTER COLUMN subject_name SET NOT NULL;
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS topic_name TEXT DEFAULT 'General';
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS difficulty TEXT;
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS instructions TEXT;
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE assignments
  ALTER COLUMN assigned_at SET NOT NULL;
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE assignments
  ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE assignments
  ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE assignments
  ALTER COLUMN difficulty DROP NOT NULL;
ALTER TABLE assignments
  ALTER COLUMN difficulty TYPE TEXT;
ALTER TABLE assignments
  ALTER COLUMN title DROP NOT NULL;
ALTER TABLE assignments
  ALTER COLUMN instructions DROP NOT NULL;
ALTER TABLE assignments
  ALTER COLUMN topic_name SET DEFAULT 'General';

=======
>>>>>>> 201c1acc3663b15e1c735f9c503144bc53bef4b4
CREATE TABLE IF NOT EXISTS assignment_questions (
  assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  PRIMARY KEY (assignment_id, question_id)
);

CREATE TABLE IF NOT EXISTS student_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
<<<<<<< HEAD
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_grade SMALLINT,
  target_batch TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE (assignment_id, student_id)
=======
  assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
  student_id UUID REFERENCES users(id) ON DELETE CASCADE,
  batch TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed')),
  assigned_at TIMESTAMPTZ NOT NULL,
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
>>>>>>> 201c1acc3663b15e1c735f9c503144bc53bef4b4
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

<<<<<<< HEAD
CREATE INDEX IF NOT EXISTS idx_assignments_teacher ON assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_assignments_subject ON assignments(subject_name);
CREATE INDEX IF NOT EXISTS idx_assignment_questions_assignment ON assignment_questions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_questions_question ON assignment_questions(question_id);
CREATE INDEX IF NOT EXISTS idx_student_assignments_assignment ON student_assignments(assignment_id);
=======
CREATE INDEX IF NOT EXISTS idx_assignment_questions_assignment ON assignment_questions(assignment_id);
>>>>>>> 201c1acc3663b15e1c735f9c503144bc53bef4b4
CREATE INDEX IF NOT EXISTS idx_student_assignments_student ON student_assignments(student_id);
CREATE INDEX IF NOT EXISTS idx_student_assignments_status ON student_assignments(status);
CREATE INDEX IF NOT EXISTS idx_student_results_assignment ON student_assignment_results(assignment_id);

-- ============================================================
<<<<<<< HEAD
-- Triggers
-- ============================================================

CREATE OR REPLACE FUNCTION set_assignments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assignments_set_updated_at ON assignments;
CREATE TRIGGER trg_assignments_set_updated_at
  BEFORE UPDATE ON assignments
  FOR EACH ROW
  EXECUTE FUNCTION set_assignments_updated_at();

-- ============================================================
=======
>>>>>>> 201c1acc3663b15e1c735f9c503144bc53bef4b4
-- RLS Policies
-- ============================================================

ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_assignment_results ENABLE ROW LEVEL SECURITY;

<<<<<<< HEAD
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'assignments'
      AND policyname = 'Teachers manage own assignments'
  ) THEN
    CREATE POLICY "Teachers manage own assignments"
      ON assignments
      USING (EXISTS (
        SELECT 1 FROM teachers t
        WHERE t.id = assignments.teacher_id AND t.user_id = auth.uid()
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM teachers t
        WHERE t.id = assignments.teacher_id AND t.user_id = auth.uid()
      ));
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
    CREATE POLICY "Teachers manage assignment questions"
      ON assignment_questions
      USING (EXISTS (
        SELECT 1 FROM assignments a
        JOIN teachers t ON t.id = a.teacher_id
        WHERE a.id = assignment_questions.assignment_id AND t.user_id = auth.uid()
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM assignments a
        JOIN teachers t ON t.id = a.teacher_id
        WHERE a.id = assignment_questions.assignment_id AND t.user_id = auth.uid()
      ));
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
    CREATE POLICY "Students view own assignments"
      ON student_assignments
      FOR SELECT
      USING (student_assignments.student_id = auth.uid());
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
    CREATE POLICY "Students update own assignments"
      ON student_assignments
      FOR UPDATE
      USING (student_assignments.student_id = auth.uid());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'student_assignments'
      AND policyname = 'Teachers manage student assignments'
  ) THEN
    CREATE POLICY "Teachers manage student assignments"
      ON student_assignments
      USING (EXISTS (
        SELECT 1 FROM assignments a
        JOIN teachers t ON t.id = a.teacher_id
        WHERE a.id = student_assignments.assignment_id AND t.user_id = auth.uid()
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM assignments a
        JOIN teachers t ON t.id = a.teacher_id
        WHERE a.id = student_assignments.assignment_id AND t.user_id = auth.uid()
      ));
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'student_assignment_results'
      AND policyname = 'Students view own assignment results'
  ) THEN
    CREATE POLICY "Students view own assignment results"
      ON student_assignment_results
      FOR SELECT
      USING (student_assignment_results.student_id = auth.uid());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'student_assignment_results'
      AND policyname = 'Teachers view assignment results'
  ) THEN
    CREATE POLICY "Teachers view assignment results"
      ON student_assignment_results
      FOR SELECT
      USING (EXISTS (
        SELECT 1 FROM assignments a
        JOIN teachers t ON t.id = a.teacher_id
        WHERE a.id = student_assignment_results.assignment_id AND t.user_id = auth.uid()
      ));
  END IF;
END;
$$;

-- ============================================================
-- Helper Functions
-- ============================================================

CREATE OR REPLACE FUNCTION ensure_teacher(p_teacher_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM teachers t
    WHERE t.id = p_teacher_id
      AND t.user_id = auth.uid()
=======
CREATE POLICY "Teachers manage own assignments"
  ON assignments
  USING (EXISTS (SELECT 1 FROM teachers t WHERE t.id = assignments.teacher_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM teachers t WHERE t.id = assignments.teacher_id AND t.user_id = auth.uid()));

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
  ));

CREATE POLICY "Students view own assignments"
  ON student_assignments
  FOR SELECT
  USING (student_id = auth.uid());

CREATE POLICY "Students update own assignments"
  ON student_assignments
  FOR UPDATE
  USING (student_id = auth.uid());

CREATE POLICY "Students view own assignment results"
  ON student_assignment_results
  FOR SELECT
  USING (student_id = auth.uid());

-- ============================================================
-- Helper function
-- ============================================================

CREATE OR REPLACE FUNCTION ensure_teacher(p_teacher_id uuid)
RETURNS BOOLEAN AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM teachers t
    WHERE t.id = p_teacher_id AND t.user_id = auth.uid()
>>>>>>> 201c1acc3663b15e1c735f9c503144bc53bef4b4
  ) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
<<<<<<< HEAD
-- RPC: Create Assignment
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_create_assignment(
  p_teacher_id UUID,
  p_subject_id TEXT,
  p_subject_name TEXT,
  p_topic_name TEXT,
  p_grade_levels SMALLINT[],
  p_batch_codes TEXT[],
  p_question_ids UUID[],
  p_assigned_at TIMESTAMPTZ,
  p_due_at TIMESTAMPTZ,
  p_title TEXT,
  p_instructions TEXT,
  p_difficulty TEXT
=======
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
>>>>>>> 201c1acc3663b15e1c735f9c503144bc53bef4b4
)
RETURNS assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_assignment assignments;
<<<<<<< HEAD
  question_count INTEGER;
  filtered_batch_codes TEXT[] := NULL;
  filtered_grade_levels SMALLINT[] := NULL;
BEGIN
  PERFORM ensure_teacher(p_teacher_id);

  IF array_length(p_question_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Assignment must include at least one question';
  END IF;

  SELECT COUNT(*) INTO question_count
  FROM questions q
  WHERE q.id = ANY(p_question_ids) AND q.teacher_id = p_teacher_id;

  IF question_count <> array_length(p_question_ids, 1) THEN
    RAISE EXCEPTION 'One or more questions are not owned by this teacher';
  END IF;

  filtered_batch_codes := NULLIF(p_batch_codes, ARRAY[]::TEXT[]);
  filtered_grade_levels := NULLIF(p_grade_levels, ARRAY[]::SMALLINT[]);

=======
BEGIN
  PERFORM ensure_teacher(p_teacher_id);
  IF coalesce(array_length(p_question_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Assignment must include at least one question';
  END IF;

>>>>>>> 201c1acc3663b15e1c735f9c503144bc53bef4b4
  INSERT INTO assignments (
    teacher_id,
    subject_id,
    subject_name,
    topic_name,
<<<<<<< HEAD
    grade_levels,
    batch_codes,
=======
    batch,
>>>>>>> 201c1acc3663b15e1c735f9c503144bc53bef4b4
    difficulty,
    title,
    instructions,
    assigned_at,
<<<<<<< HEAD
    due_at,
    created_at,
    updated_at
  ) VALUES (
    p_teacher_id,
    p_subject_id,
    COALESCE(p_subject_name, 'Unknown'),
    COALESCE(NULLIF(p_topic_name, ''), 'General'),
    COALESCE(filtered_grade_levels, ARRAY[]::SMALLINT[]),
    COALESCE(filtered_batch_codes, ARRAY[]::TEXT[]),
    p_difficulty,
    NULLIF(p_title, ''),
    NULLIF(p_instructions, ''),
    COALESCE(p_assigned_at, NOW()),
    p_due_at,
    NOW(),
    NOW()
  )
  RETURNING * INTO new_assignment;

  INSERT INTO assignment_questions (assignment_id, question_id, order_index)
  SELECT
    new_assignment.id,
    question_id,
    ord::INT - 1
  FROM unnest(p_question_ids) WITH ORDINALITY AS t(question_id, ord);

  INSERT INTO student_assignments (assignment_id, student_id, target_grade, target_batch, status, assigned_at, due_at)
  SELECT
    new_assignment.id,
    u.id,
    u.grade,
    u.batch,
    'pending',
    COALESCE(p_assigned_at, NOW()),
    p_due_at
  FROM users u
  WHERE u.role = 'student'
    AND (filtered_grade_levels IS NULL OR u.grade = ANY(filtered_grade_levels))
    AND (filtered_batch_codes IS NULL OR u.batch = ANY(filtered_batch_codes));
=======
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
  WHERE u.role = 'student'
    AND (
      (p_batch = 'All' AND u.batch IN ('8A','8B','8C'))
      OR (p_batch <> 'All' AND u.batch = p_batch)
    );
>>>>>>> 201c1acc3663b15e1c735f9c503144bc53bef4b4

  RETURN new_assignment;
END;
$$;

<<<<<<< HEAD
GRANT EXECUTE ON FUNCTION rpc_create_assignment TO authenticated;
***
=======
-- ============================================================
-- RPC: Teacher assignments summary
-- ============================================================

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
  student_id uuid := auth.uid();
  payload jsonb;
BEGIN
  SELECT row_to_json(wrapper) INTO payload
  FROM (
    SELECT
      sa.assignment_id,
      a.subject_id,
      a.subject_name,
      a.topic_name,
      a.batch,
      u.username AS teacher_username,
      a.assigned_at,
      a.due_at,
      a.title,
      a.instructions,
      (SELECT jsonb_agg(row_to_json(q_row))
       FROM (
         SELECT q.*
         FROM assignment_questions aq
         JOIN questions q ON q.id = aq.question_id
         WHERE aq.assignment_id = a.id
         ORDER BY aq.order_index
       ) AS q_row) AS questions
    FROM student_assignments sa
    JOIN assignments a ON a.id = sa.assignment_id
    JOIN teachers t ON t.id = a.teacher_id
    JOIN users u ON u.id = t.user_id
    WHERE sa.student_id = student_id
      AND sa.status = 'pending'
    ORDER BY a.assigned_at
    LIMIT 1
  ) AS wrapper;

  RETURN payload;
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
BEGIN
  UPDATE student_assignments
  SET status = 'completed', completed_at = NOW()
  WHERE assignment_id = p_assignment_id AND student_id = v_student_id;

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
  )
  ON CONFLICT (assignment_id, student_id)
  DO UPDATE SET
    correct = EXCLUDED.correct,
    incorrect = EXCLUDED.incorrect,
    accuracy = EXCLUDED.accuracy,
    score = EXCLUDED.score,
    time_taken_seconds = EXCLUDED.time_taken_seconds,
    completed_at = NOW();
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
>>>>>>> 201c1acc3663b15e1c735f9c503144bc53bef4b4
