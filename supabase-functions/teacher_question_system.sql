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
  topic TEXT, -- Algebra, World War II, etc.
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
  
  attempted_at TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE POLICY "Teachers are viewable by everyone"
  ON teachers FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own teacher profile"
  ON teachers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own teacher profile"
  ON teachers FOR UPDATE
  USING (auth.uid() = user_id);

-- Questions table policies
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public questions are viewable by everyone"
  ON questions FOR SELECT
  USING (is_public = true OR teacher_id IN (
    SELECT id FROM teachers WHERE user_id = auth.uid()
  ));

CREATE POLICY "Teachers can insert their own questions"
  ON questions FOR INSERT
  WITH CHECK (teacher_id IN (
    SELECT id FROM teachers WHERE user_id = auth.uid()
  ));

CREATE POLICY "Teachers can update their own questions"
  ON questions FOR UPDATE
  USING (teacher_id IN (
    SELECT id FROM teachers WHERE user_id = auth.uid()
  ));

CREATE POLICY "Teachers can delete their own questions"
  ON questions FOR DELETE
  USING (teacher_id IN (
    SELECT id FROM teachers WHERE user_id = auth.uid()
  ));

-- Question attempts policies
ALTER TABLE question_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view their own attempts"
  ON question_attempts FOR SELECT
  USING (student_id = auth.uid());

CREATE POLICY "Teachers can view attempts on their questions"
  ON question_attempts FOR SELECT
  USING (question_id IN (
    SELECT q.id FROM questions q
    JOIN teachers t ON q.teacher_id = t.id
    WHERE t.user_id = auth.uid()
  ));

CREATE POLICY "Students can insert their own attempts"
  ON question_attempts FOR INSERT
  WITH CHECK (student_id = auth.uid());

-- Quest templates policies
ALTER TABLE quest_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public quest templates are viewable by everyone"
  ON quest_templates FOR SELECT
  USING (is_public = true OR teacher_id IN (
    SELECT id FROM teachers WHERE user_id = auth.uid()
  ));

CREATE POLICY "Teachers can manage their own quest templates"
  ON quest_templates FOR ALL
  USING (teacher_id IN (
    SELECT id FROM teachers WHERE user_id = auth.uid()
  ));

-- Classes policies
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can view their own classes"
  ON classes FOR SELECT
  USING (teacher_id IN (
    SELECT id FROM teachers WHERE user_id = auth.uid()
  ));

CREATE POLICY "Students can view classes they're in"
  ON classes FOR SELECT
  USING (id IN (
    SELECT class_id FROM class_students WHERE student_id = auth.uid()
  ));

CREATE POLICY "Teachers can manage their own classes"
  ON classes FOR ALL
  USING (teacher_id IN (
    SELECT id FROM teachers WHERE user_id = auth.uid()
  ));

-- Class students policies
ALTER TABLE class_students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view their class enrollments"
  ON class_students FOR SELECT
  USING (student_id = auth.uid());

CREATE POLICY "Teachers can manage students in their classes"
  ON class_students FOR ALL
  USING (class_id IN (
    SELECT id FROM classes WHERE teacher_id IN (
      SELECT id FROM teachers WHERE user_id = auth.uid()
    )
  ));

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Function to create a teacher profile
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
  v_question RECORD;
  v_is_correct BOOLEAN;
  v_points_earned INTEGER := 0;
BEGIN
  -- Get question details
  SELECT * INTO v_question FROM questions WHERE id = p_question_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Question not found';
  END IF;

  -- Check if answer is correct (case-insensitive comparison)
  v_is_correct := LOWER(TRIM(p_answer_given)) = LOWER(TRIM(v_question.correct_answer));

  -- Calculate points
  IF v_is_correct THEN
    v_points_earned := v_question.points;
  END IF;

  -- Record the attempt
  INSERT INTO question_attempts (
    student_id, question_id, quest_session_id,
    answer_given, is_correct, time_taken, points_earned
  ) VALUES (
    auth.uid(), p_question_id, p_quest_session_id,
    p_answer_given, v_is_correct, p_time_taken, v_points_earned
  );

  -- Update question stats
  UPDATE questions
  SET times_answered = times_answered + 1,
      times_correct = times_correct + (CASE WHEN v_is_correct THEN 1 ELSE 0 END)
  WHERE id = p_question_id;

  -- Return result
  RETURN jsonb_build_object(
    'is_correct', v_is_correct,
    'points_earned', v_points_earned,
    'correct_answer', v_question.correct_answer,
    'explanation', v_question.explanation
  );
END;
$$;

GRANT EXECUTE ON FUNCTION record_question_attempt TO authenticated;

