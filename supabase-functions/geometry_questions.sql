-- ============================================================
-- Geometry Questions System
-- Interactive diagram-based questions with blank fields
-- ============================================================

-- Create geometry_questions table
CREATE TABLE IF NOT EXISTS geometry_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled Diagram',
  diagram_json JSONB NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}',
  subject TEXT NOT NULL DEFAULT 'Maths',
  subject_id TEXT,
  topic TEXT DEFAULT 'Geometry',
  difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')) DEFAULT 'medium',
  points INT NOT NULL DEFAULT 15 CHECK (points >= 1 AND points <= 30),
  time_limit INT DEFAULT 60,
  is_active BOOLEAN DEFAULT true,
  is_public BOOLEAN DEFAULT true,
  times_answered INT DEFAULT 0,
  times_correct INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_geometry_questions_teacher ON geometry_questions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_geometry_questions_subject ON geometry_questions(subject);
CREATE INDEX IF NOT EXISTS idx_geometry_questions_difficulty ON geometry_questions(difficulty);
CREATE INDEX IF NOT EXISTS idx_geometry_questions_active ON geometry_questions(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE geometry_questions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'geometry_questions'
      AND policyname = 'Teachers manage own geometry questions'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Teachers manage own geometry questions"
      ON geometry_questions
      USING (EXISTS (SELECT 1 FROM teachers t WHERE t.id = geometry_questions.teacher_id AND t.user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM teachers t WHERE t.id = geometry_questions.teacher_id AND t.user_id = auth.uid()))
    $policy$;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'geometry_questions'
      AND policyname = 'Students view active geometry questions'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Students view active geometry questions"
      ON geometry_questions
      FOR SELECT
      USING (is_active = true AND is_public = true)
    $policy$;
  END IF;
END;
$$;

-- Function to get random geometry question
CREATE OR REPLACE FUNCTION get_random_geometry_question(
  p_subject TEXT DEFAULT NULL,
  p_difficulty TEXT DEFAULT NULL
)
RETURNS geometry_questions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result geometry_questions;
BEGIN
  SELECT * INTO result
  FROM geometry_questions
  WHERE is_active = true
    AND is_public = true
    AND (p_subject IS NULL OR subject = p_subject)
    AND (p_difficulty IS NULL OR difficulty = p_difficulty)
  ORDER BY RANDOM()
  LIMIT 1;
  
  RETURN result;
END;
$$;

-- Function to record geometry question attempt
CREATE OR REPLACE FUNCTION record_geometry_attempt(
  p_question_id UUID,
  p_is_correct BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE geometry_questions
  SET 
    times_answered = times_answered + 1,
    times_correct = times_correct + CASE WHEN p_is_correct THEN 1 ELSE 0 END,
    updated_at = NOW()
  WHERE id = p_question_id;
END;
$$;
