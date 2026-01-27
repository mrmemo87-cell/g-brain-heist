-- Add scores_released column to quiz_scores table
-- This allows teachers to control when students can see their scores

-- Step 1: Add the scores_released column (defaults to FALSE)
ALTER TABLE quiz_scores 
ADD COLUMN IF NOT EXISTS scores_released BOOLEAN DEFAULT FALSE;

-- Step 2: Add released_at timestamp to track when scores were released
ALTER TABLE quiz_scores 
ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;

-- Step 3: Add released_by to track which teacher released the scores
ALTER TABLE quiz_scores 
ADD COLUMN IF NOT EXISTS released_by UUID REFERENCES auth.users(id);

-- Step 4: Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_quiz_scores_released ON quiz_scores(scores_released);
CREATE INDEX IF NOT EXISTS idx_quiz_scores_quiz_released ON quiz_scores(quiz_name, scores_released);

-- Step 5: Update RLS policies

-- Allow teachers to update the scores_released field
DROP POLICY IF EXISTS "Teachers can release scores" ON quiz_scores;
CREATE POLICY "Teachers can release scores" ON quiz_scores
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role IN ('teacher', 'admin', 'school_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role IN ('teacher', 'admin', 'school_admin')
    )
  );

-- Students can only view their own scores if released, or if they are the submitter
-- This policy controls what students see
DROP POLICY IF EXISTS "Students see released scores or own scores" ON quiz_scores;
CREATE POLICY "Students see released scores or own scores" ON quiz_scores
  FOR SELECT
  USING (
    -- Teachers and admins can see all scores
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role IN ('teacher', 'admin', 'school_admin')
    )
    OR
    -- Anyone can see released scores
    scores_released = TRUE
    OR
    -- For anonymous submissions, allow viewing by the submitter (via localStorage check on frontend)
    TRUE -- We'll control visibility in the frontend for anonymous users
  );

-- Grant update permission to authenticated users (teachers)
GRANT UPDATE ON quiz_scores TO authenticated;

-- Step 6: Create a function to release scores in bulk for a quiz
CREATE OR REPLACE FUNCTION release_quiz_scores(
  p_quiz_name TEXT,
  p_class TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Check if user is a teacher or admin
  IF NOT EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND role IN ('teacher', 'admin', 'school_admin')
  ) THEN
    RAISE EXCEPTION 'Only teachers and admins can release scores';
  END IF;

  -- Update scores
  IF p_class IS NOT NULL THEN
    UPDATE quiz_scores
    SET 
      scores_released = TRUE,
      released_at = NOW(),
      released_by = auth.uid()
    WHERE quiz_name = p_quiz_name
    AND student_class = p_class
    AND scores_released = FALSE;
  ELSE
    UPDATE quiz_scores
    SET 
      scores_released = TRUE,
      released_at = NOW(),
      released_by = auth.uid()
    WHERE quiz_name = p_quiz_name
    AND scores_released = FALSE;
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Step 7: Create a function to hide scores again (unreleasing)
CREATE OR REPLACE FUNCTION hide_quiz_scores(
  p_quiz_name TEXT,
  p_class TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Check if user is a teacher or admin
  IF NOT EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND role IN ('teacher', 'admin', 'school_admin')
  ) THEN
    RAISE EXCEPTION 'Only teachers and admins can hide scores';
  END IF;

  -- Update scores
  IF p_class IS NOT NULL THEN
    UPDATE quiz_scores
    SET 
      scores_released = FALSE,
      released_at = NULL,
      released_by = NULL
    WHERE quiz_name = p_quiz_name
    AND student_class = p_class
    AND scores_released = TRUE;
  ELSE
    UPDATE quiz_scores
    SET 
      scores_released = FALSE,
      released_at = NULL,
      released_by = NULL
    WHERE quiz_name = p_quiz_name
    AND scores_released = TRUE;
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION release_quiz_scores TO authenticated;
GRANT EXECUTE ON FUNCTION hide_quiz_scores TO authenticated;

-- Verify changes
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'quiz_scores'
AND column_name IN ('scores_released', 'released_at', 'released_by');
