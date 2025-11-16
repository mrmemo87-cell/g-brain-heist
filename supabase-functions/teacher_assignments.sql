-- ============================================================
-- Teacher Assignment System
-- ============================================================
-- Provides schema and secure RPCs for teachers to schedule
-- assignments that target specific grades and batches.

-- ============================================================
-- Assignment Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  subject_id TEXT,
  subject_name TEXT NOT NULL,
  topic_name TEXT DEFAULT 'General',
  grade_levels SMALLINT[] DEFAULT ARRAY[]::SMALLINT[],
  batch_codes TEXT[] DEFAULT ARRAY[]::TEXT[],
  difficulty TEXT CHECK (difficulty IN ('easy','medium','hard')),
  title TEXT,
  instructions TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS assignment_questions (
  assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  PRIMARY KEY (assignment_id, question_id)
);

CREATE TABLE IF NOT EXISTS student_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_grade SMALLINT,
  target_batch TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE (assignment_id, student_id)
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

CREATE INDEX IF NOT EXISTS idx_assignments_teacher ON assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_assignments_subject ON assignments(subject_name);
CREATE INDEX IF NOT EXISTS idx_assignment_questions_assignment ON assignment_questions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_questions_question ON assignment_questions(question_id);
CREATE INDEX IF NOT EXISTS idx_student_assignments_assignment ON student_assignments(assignment_id);
CREATE INDEX IF NOT EXISTS idx_student_assignments_student ON student_assignments(student_id);
CREATE INDEX IF NOT EXISTS idx_student_assignments_status ON student_assignments(status);
CREATE INDEX IF NOT EXISTS idx_student_results_assignment ON student_assignment_results(assignment_id);

-- ============================================================
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
-- RLS Policies
-- ============================================================

ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_assignment_results ENABLE ROW LEVEL SECURITY;

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
  ) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
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
)
RETURNS assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_assignment assignments;
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

  INSERT INTO assignments (
    teacher_id,
    subject_id,
    subject_name,
    topic_name,
    grade_levels,
    batch_codes,
    difficulty,
    title,
    instructions,
    assigned_at,
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

  RETURN new_assignment;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_create_assignment TO authenticated;
***