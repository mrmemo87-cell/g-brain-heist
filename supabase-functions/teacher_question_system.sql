-- ============================================================
-- Teacher Question System Schema
-- ============================================================
-- This adds the ability for teachers to create custom questions
-- that students can answer in quests.

-- Step 1: Add role to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'admin'));

-- Step 2: Create teachers table (extended profile for teachers)
CREATE TABLE IF NOT EXISTS teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  school_name TEXT,
  subject_specializations TEXT[], -- ["Math", "Science", "History"]
  verified BOOLEAN DEFAULT false,
  bio TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 3: Create questions table
CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID REFERENCES teachers(id) ON DELETE CASCADE NOT NULL,
  
  -- Question content
  subject TEXT NOT NULL, -- Math, Science, History, English, etc.
  subject_id TEXT, -- Optional subject slug for legacy compatibility
  topic TEXT, -- Algebra, World War II, etc.
  topic_name TEXT, -- Legacy topic label support
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  question_text TEXT NOT NULL,
  
  -- Question type and answers
  question_type TEXT NOT NULL CHECK (question_type IN ('multiple_choice', 'true_false', 'short_answer')),
  options JSONB, -- For multiple choice: ["Option A", "Option B", "Option C", "Option D"]
  correct_answer TEXT NOT NULL, -- The correct answer (text or option index/letter)
  
  -- Additional info
  explanation TEXT, -- Why this answer is correct
  hints TEXT[], -- Array of hints
  time_limit INTEGER DEFAULT 30, -- seconds to answer
  points INTEGER DEFAULT 10, -- XP reward for correct answer
  
  -- Organization
  tags TEXT[], -- ["algebra", "equations", "beginner"]
  grade_level TEXT, -- "Grade 9", "High School", etc.
  is_public BOOLEAN DEFAULT false, -- Share with other teachers
  is_active BOOLEAN DEFAULT true, -- Can be deactivated without deleting
  
  -- Stats
  times_answered INTEGER DEFAULT 0,
  times_correct INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 4: Create question_attempts table (track student answers)
CREATE TABLE IF NOT EXISTS question_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE NOT NULL,
  quest_session_id UUID, -- Optional: group attempts by quest session
  
  answer_given TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  time_taken INTEGER, -- seconds taken to answer
  points_earned INTEGER DEFAULT 0,
  
  attempted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (attempted_at) STORED
);

-- Ensure legacy subject_id column exists for compatibility
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS subject_id TEXT;

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS topic_name TEXT;

-- Backfill subject_id values when missing
DO $$
BEGIN
  UPDATE questions
  SET subject_id = CASE subject
    WHEN 'Maths' THEN 'subj_math'
    WHEN 'Mathematics' THEN 'subj_math'
    WHEN 'Science' THEN 'subj_science'
    WHEN 'English' THEN 'subj_english'
    WHEN 'Russian Language' THEN 'subj_russian_language'
    WHEN 'Russian Literature' THEN 'subj_russian_literature'
    WHEN 'Kyrgyz Language' THEN 'subj_kyrgyz_language'
    WHEN 'Kyrgyz History' THEN 'subj_kyrgyz_history'
    WHEN 'German Language' THEN 'subj_german_language'
    WHEN 'Geography' THEN 'subj_geography'
    WHEN 'Global Perspective' THEN 'subj_global_perspective'
    WHEN 'ICT' THEN 'subj_ict'
    ELSE subject_id
  END
  WHERE subject IS NOT NULL AND subject_id IS NULL;
END;
$$;

DO $$
BEGIN
  UPDATE questions
  SET topic_name = topic
  WHERE topic IS NOT NULL AND topic_name IS NULL;
END;
$$;

-- Backfill compatibility column if table already existed without generated created_at
ALTER TABLE question_attempts
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ GENERATED ALWAYS AS (attempted_at) STORED;

-- Step 5: Create quest_templates table (teacher-created quests)
CREATE TABLE IF NOT EXISTS quest_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID REFERENCES teachers(id) ON DELETE CASCADE NOT NULL,
  
  title TEXT NOT NULL,
  description TEXT,
  subject TEXT NOT NULL,
  difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
  
  question_ids UUID[] NOT NULL, -- Array of question IDs
  question_count INTEGER GENERATED ALWAYS AS (array_length(question_ids, 1)) STORED,
  
  -- Rewards
  xp_reward INTEGER DEFAULT 0,
  coins_reward INTEGER DEFAULT 0,
  
  -- Requirements
  min_level INTEGER DEFAULT 1,
  max_attempts INTEGER, -- null = unlimited
  
  is_public BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  
  -- Stats
  times_completed INTEGER DEFAULT 0,
  average_score NUMERIC(5,2) DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 6: Create classes table (optional but useful)
CREATE TABLE IF NOT EXISTS classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID REFERENCES teachers(id) ON DELETE CASCADE NOT NULL,
  class_name TEXT NOT NULL,
  class_code TEXT UNIQUE NOT NULL, -- e.g., "MATH101-2024"
  description TEXT,
  subject TEXT,
  grade_level TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 7: Create class_students junction table
CREATE TABLE IF NOT EXISTS class_students (
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  student_id UUID REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (class_id, student_id)
);

-- ============================================================
-- INDEXES for performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_teachers_user_id ON teachers(user_id);
CREATE INDEX IF NOT EXISTS idx_questions_teacher_id ON questions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject);
CREATE INDEX IF NOT EXISTS idx_questions_subject_id ON questions(subject_id);
CREATE INDEX IF NOT EXISTS idx_questions_difficulty ON questions(difficulty);
CREATE INDEX IF NOT EXISTS idx_questions_is_public ON questions(is_public);
CREATE INDEX IF NOT EXISTS idx_question_attempts_student_id ON question_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_question_attempts_question_id ON question_attempts(question_id);
CREATE INDEX IF NOT EXISTS idx_quest_templates_teacher_id ON quest_templates(teacher_id);
CREATE INDEX IF NOT EXISTS idx_quest_templates_subject ON quest_templates(subject);
CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_class_students_student_id ON class_students(student_id);

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- Teachers table policies
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'teachers'
      AND policyname = 'Teachers are viewable by everyone'
  ) THEN
    EXECUTE 'CREATE POLICY "Teachers are viewable by everyone"
      ON teachers FOR SELECT
      USING (true)';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'teachers'
      AND policyname = 'Users can insert their own teacher profile'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can insert their own teacher profile"
      ON teachers FOR INSERT
      WITH CHECK (auth.uid() = user_id)';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'teachers'
      AND policyname = 'Users can update their own teacher profile'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can update their own teacher profile"
      ON teachers FOR UPDATE
      USING (auth.uid() = user_id)';
  END IF;
END;
$$;

-- Questions table policies
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'questions'
      AND policyname = 'Public questions are viewable by everyone'
  ) THEN
    EXECUTE 'CREATE POLICY "Public questions are viewable by everyone"
      ON questions FOR SELECT
      USING (is_public = true OR teacher_id IN (
        SELECT id FROM teachers WHERE user_id = auth.uid()
      ))';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'questions'
      AND policyname = 'Students view assignment questions'
  ) THEN
    EXECUTE 'CREATE POLICY "Students view assignment questions"
      ON questions FOR SELECT
      USING (EXISTS (
        SELECT 1
        FROM assignment_questions aq
        JOIN student_assignments sa ON sa.assignment_id = aq.assignment_id
        WHERE aq.question_id = questions.id
          AND sa.student_id = auth.uid()
      ))';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'questions'
      AND policyname = 'Teachers can insert their own questions'
  ) THEN
    EXECUTE 'CREATE POLICY "Teachers can insert their own questions"
      ON questions FOR INSERT
      WITH CHECK (teacher_id IN (
        SELECT id FROM teachers WHERE user_id = auth.uid()
      ))';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'questions'
      AND policyname = 'Teachers can update their own questions'
  ) THEN
    EXECUTE 'CREATE POLICY "Teachers can update their own questions"
      ON questions FOR UPDATE
      USING (teacher_id IN (
        SELECT id FROM teachers WHERE user_id = auth.uid()
      ))';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'questions'
      AND policyname = 'Teachers can delete their own questions'
  ) THEN
    EXECUTE 'CREATE POLICY "Teachers can delete their own questions"
      ON questions FOR DELETE
      USING (teacher_id IN (
        SELECT id FROM teachers WHERE user_id = auth.uid()
      ))';
  END IF;
END;
$$;

-- Question attempts policies
ALTER TABLE question_attempts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'question_attempts'
      AND policyname = 'Students can view their own attempts'
  ) THEN
    EXECUTE 'CREATE POLICY "Students can view their own attempts"
      ON question_attempts FOR SELECT
      USING (student_id = auth.uid())';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'question_attempts'
      AND policyname = 'Teachers can view attempts on their questions'
  ) THEN
    EXECUTE 'CREATE POLICY "Teachers can view attempts on their questions"
      ON question_attempts FOR SELECT
      USING (question_id IN (
        SELECT q.id FROM questions q
        JOIN teachers t ON q.teacher_id = t.id
        WHERE t.user_id = auth.uid()
      ))';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'question_attempts'
      AND policyname = 'Students can insert their own attempts'
  ) THEN
    EXECUTE 'CREATE POLICY "Students can insert their own attempts"
      ON question_attempts FOR INSERT
      WITH CHECK (student_id = auth.uid())';
  END IF;
END;
$$;

-- Quest templates policies
ALTER TABLE quest_templates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'quest_templates'
      AND policyname = 'Public quest templates are viewable by everyone'
  ) THEN
    EXECUTE 'CREATE POLICY "Public quest templates are viewable by everyone"
      ON quest_templates FOR SELECT
      USING (is_public = true OR teacher_id IN (
        SELECT id FROM teachers WHERE user_id = auth.uid()
      ))';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'quest_templates'
      AND policyname = 'Teachers can manage their own quest templates'
  ) THEN
    EXECUTE 'CREATE POLICY "Teachers can manage their own quest templates"
      ON quest_templates FOR ALL
      USING (teacher_id IN (
        SELECT id FROM teachers WHERE user_id = auth.uid()
      ))';
  END IF;
END;
$$;

-- Classes policies
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'classes'
      AND policyname = 'Teachers can view their own classes'
  ) THEN
    EXECUTE 'CREATE POLICY "Teachers can view their own classes"
      ON classes FOR SELECT
      USING (teacher_id IN (
        SELECT id FROM teachers WHERE user_id = auth.uid()
      ))';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'classes'
      AND policyname = 'Students can view classes they''re in'
  ) THEN
    EXECUTE 'CREATE POLICY "Students can view classes they''re in"
      ON classes FOR SELECT
      USING (id IN (
        SELECT get_my_student_class_ids()
      ))';    
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'classes'
      AND policyname = 'Teachers can manage their own classes'
  ) THEN
    EXECUTE 'CREATE POLICY "Teachers can manage their own classes"
      ON classes FOR ALL
      USING (teacher_id IN (
        SELECT id FROM teachers WHERE user_id = auth.uid()
      ))';
  END IF;
END;
$$;

-- Class students policies
ALTER TABLE class_students ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'class_students'
      AND policyname = 'Students can view their class enrollments'
  ) THEN
    EXECUTE 'CREATE POLICY "Students can view their class enrollments"
      ON class_students FOR SELECT
      USING (student_id = auth.uid())';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'class_students'
      AND policyname = 'Teachers can manage students in their classes'
  ) THEN
    EXECUTE 'CREATE POLICY "Teachers can manage students in their classes"
      ON class_students FOR ALL
      USING (class_id IN (
        SELECT get_my_teacher_class_ids()
      ))';
  END IF;
END;
$$;

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Break RLS circular dependency between classes <-> class_students
CREATE OR REPLACE FUNCTION get_my_teacher_class_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT c.id FROM classes c
  JOIN teachers t ON c.teacher_id = t.id
  WHERE t.user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_my_student_class_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT cs.class_id FROM class_students cs
  WHERE cs.student_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION get_my_teacher_class_ids TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_student_class_ids TO authenticated;

-- Function to create a teacher profile
DO $$
DECLARE
  rec RECORD;
BEGIN
  -- Drop any existing create_teacher_profile overloads to keep redeploys clean
  FOR rec IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'create_teacher_profile'
  LOOP
    EXECUTE format('DROP FUNCTION %s;', rec.signature);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION create_teacher_profile(
  p_school_name TEXT DEFAULT NULL,
  p_subject_specializations TEXT[] DEFAULT NULL,
  p_bio TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_teacher_id UUID;
BEGIN
  -- Check if user already has a teacher profile
  IF EXISTS (SELECT 1 FROM teachers WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'User already has a teacher profile';
  END IF;

  -- Update user role to teacher
  UPDATE users SET role = 'teacher' WHERE id = auth.uid();

  -- Create teacher profile
  INSERT INTO teachers (user_id, school_name, subject_specializations, bio)
  VALUES (auth.uid(), p_school_name, p_subject_specializations, p_bio)
  RETURNING id INTO v_teacher_id;

  RETURN v_teacher_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION create_teacher_profile TO authenticated;

-- Function to record a question attempt and update stats
DO $$
DECLARE
  rec RECORD;
BEGIN
  -- Drop any existing record_question_attempt overloads to avoid signature conflicts
  FOR rec IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'record_question_attempt'
  LOOP
    EXECUTE format('DROP FUNCTION %s;', rec.signature);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION record_question_attempt(
  p_question_id UUID,
  p_answer_given TEXT,
  p_time_taken INTEGER DEFAULT NULL,
  p_quest_session_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_question RECORD;
  v_is_correct BOOLEAN;
  v_recent_correct_reward BOOLEAN := FALSE;
  v_points_earned INTEGER := 0;
  v_coins_earned INTEGER := 0;
  v_duplicate_reward BOOLEAN := FALSE;
  v_profile RECORD;
  v_xp_status JSONB := NULL;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get question details
  SELECT * INTO v_question FROM questions WHERE id = p_question_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Question not found';
  END IF;

  -- Check if answer is correct (case-insensitive comparison)
  v_is_correct := LOWER(TRIM(p_answer_given)) = LOWER(TRIM(v_question.correct_answer));

  -- Calculate rewards atomically under per-user/question lock
  IF v_is_correct THEN
    PERFORM pg_advisory_xact_lock(
      hashtext(v_user_id::text),
      hashtext(p_question_id::text)
    );

    SELECT EXISTS (
      SELECT 1
      FROM question_attempts qa
      WHERE qa.student_id = v_user_id
        AND qa.question_id = p_question_id
        AND qa.is_correct = true
        AND qa.attempted_at > NOW() - INTERVAL '24 hours'
    ) INTO v_recent_correct_reward;

    IF NOT v_recent_correct_reward THEN
      v_points_earned := COALESCE(v_question.points, 0);
      v_coins_earned := GREATEST(0, FLOOR(COALESCE(v_question.points, 0) / 2.0)::INT);
    ELSE
      v_duplicate_reward := TRUE;
    END IF;
  END IF;

  -- Record the attempt
  INSERT INTO question_attempts (
    student_id, question_id, quest_session_id,
    answer_given, is_correct, time_taken, points_earned
  ) VALUES (
    v_user_id, p_question_id, p_quest_session_id,
    p_answer_given, v_is_correct, p_time_taken, v_points_earned
  );

  -- Update rewards in same transaction to avoid race with client-side reward application
  SELECT xp, coins, level, gemstones
  INTO v_profile
  FROM users
  WHERE id = v_user_id
  FOR UPDATE;

  IF v_points_earned <> 0 OR v_coins_earned <> 0 THEN
    UPDATE users
    SET xp = GREATEST(0, xp + v_points_earned),
        coins = GREATEST(0, coins + v_coins_earned),
        updated_at = NOW()
    WHERE id = v_user_id
    RETURNING xp, coins, level, gemstones
    INTO v_profile;
  END IF;

  -- Update question stats
  UPDATE questions
  SET times_answered = times_answered + 1,
      times_correct = times_correct + (CASE WHEN v_is_correct THEN 1 ELSE 0 END)
  WHERE id = p_question_id;

  SELECT to_jsonb(xp_status(p_xp => v_profile.xp)) INTO v_xp_status;

  -- Return result
  RETURN jsonb_build_object(
    'is_correct', v_is_correct,
    'points_earned', v_points_earned,
    'correct_answer', v_question.correct_answer,
    'duplicate_reward', v_duplicate_reward,
    'explanation', v_question.explanation,
    'final_profile_values', jsonb_build_object(
      'xp', v_profile.xp,
      'coins', v_profile.coins,
      'level', v_profile.level,
      'gemstones', v_profile.gemstones,
      'xp_status', v_xp_status
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION record_question_attempt TO authenticated;
