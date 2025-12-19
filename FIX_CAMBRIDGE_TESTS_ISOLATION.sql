-- ============================================================================
-- FIX CAMBRIDGE TESTS CROSS-SCHOOL DATA LEAKAGE
-- ============================================================================
-- Problem: Teachers can see Cambridge test results from ALL schools
-- Root cause: quiz_scores table has no school_id, RLS allows anyone to SELECT
-- Solution: Add school_id column, backfill via username→users.school_id,
--           create SECURITY DEFINER RPCs for school-scoped access
-- ============================================================================

-- ============================================================================
-- STEP 1: Add school_id column to quiz_scores
-- ============================================================================

ALTER TABLE quiz_scores ADD COLUMN IF NOT EXISTS school_id UUID;

-- Create index for efficient school-based queries
CREATE INDEX IF NOT EXISTS idx_quiz_scores_school_id ON quiz_scores(school_id);

-- ============================================================================
-- STEP 2: Backfill school_id for existing records
-- ============================================================================
-- Join via student_name → users.username → users.school_id

UPDATE quiz_scores qs
SET school_id = u.school_id
FROM users u
WHERE qs.student_name = u.username
  AND qs.school_id IS NULL
  AND u.school_id IS NOT NULL;

-- ============================================================================
-- STEP 3: Add trigger to auto-populate school_id on INSERT
-- ============================================================================

CREATE OR REPLACE FUNCTION set_quiz_score_school_id()
RETURNS TRIGGER AS $$
BEGIN
  -- If school_id not provided, derive from student_name → users.school_id
  IF NEW.school_id IS NULL THEN
    SELECT u.school_id INTO NEW.school_id
    FROM users u
    WHERE u.username = NEW.student_name
    LIMIT 1;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS quiz_scores_set_school_id ON quiz_scores;
CREATE TRIGGER quiz_scores_set_school_id
  BEFORE INSERT ON quiz_scores
  FOR EACH ROW
  EXECUTE FUNCTION set_quiz_score_school_id();

-- ============================================================================
-- STEP 4: Update RLS policies to be school-scoped
-- ============================================================================

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Anyone can view scores" ON quiz_scores;
DROP POLICY IF EXISTS "Allow select for authenticated users" ON quiz_scores;
DROP POLICY IF EXISTS "Users can view own school scores" ON quiz_scores;

-- Students can only see their own scores
CREATE POLICY "Students can view own scores" ON quiz_scores
  FOR SELECT
  USING (
    student_name = (SELECT username FROM users WHERE id = auth.uid())
  );

-- Teachers/admins can see scores from their school only
CREATE POLICY "Teachers view school scores" ON quiz_scores
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('teacher', 'admin')
        AND u.school_id = quiz_scores.school_id
    )
  );

-- Keep insert policy for students
DROP POLICY IF EXISTS "Anyone can submit quiz scores" ON quiz_scores;
CREATE POLICY "Authenticated users can submit quiz scores" ON quiz_scores
  FOR INSERT
  WITH CHECK (true);

-- Teachers can update scores in their school (for marking)
DROP POLICY IF EXISTS "Teachers can update quiz scores" ON quiz_scores;
CREATE POLICY "Teachers can update school scores" ON quiz_scores
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('teacher', 'admin')
        AND u.school_id = quiz_scores.school_id
    )
  );

-- ============================================================================
-- STEP 5: Create SECURITY DEFINER RPC for school-scoped Cambridge scores
-- ============================================================================
-- This is the preferred access pattern - bypasses RLS with controlled filtering

CREATE OR REPLACE FUNCTION get_school_cambridge_scores(p_limit INT DEFAULT 100)
RETURNS TABLE (
  id UUID,
  student_name TEXT,
  student_class TEXT,
  quiz_name TEXT,
  score INT,
  total_questions INT,
  percentage INT,
  answers JSONB,
  time_taken_seconds INT,
  submitted_at TIMESTAMPTZ,
  school_id UUID
) AS $$
DECLARE
  v_school_id UUID;
  v_role TEXT;
BEGIN
  -- Get caller's school and role directly from users table
  SELECT u.school_id, u.role INTO v_school_id, v_role
  FROM users u
  WHERE u.id = auth.uid();
  
  -- Only teachers/admins can use this RPC
  IF v_role NOT IN ('teacher', 'admin') THEN
    RAISE EXCEPTION 'Access denied: teachers/admins only';
  END IF;
  
  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'No school membership found';
  END IF;
  
  RETURN QUERY
  SELECT 
    qs.id,
    qs.student_name,
    qs.student_class,
    qs.quiz_name,
    qs.score,
    qs.total_questions,
    qs.percentage,
    qs.answers,
    qs.time_taken_seconds,
    qs.submitted_at,
    qs.school_id
  FROM quiz_scores qs
  WHERE qs.school_id = v_school_id
  ORDER BY qs.submitted_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 6: Create RPC for school-scoped Cambridge stats
-- ============================================================================

CREATE OR REPLACE FUNCTION get_school_cambridge_stats()
RETURNS JSONB AS $$
DECLARE
  v_school_id UUID;
  v_role TEXT;
  v_result JSONB;
BEGIN
  -- Get caller's school and role directly from users table
  SELECT u.school_id, u.role INTO v_school_id, v_role
  FROM users u
  WHERE u.id = auth.uid();
  
  -- Only teachers/admins can use this RPC
  IF v_role NOT IN ('teacher', 'admin') THEN
    RETURN jsonb_build_object('error', 'Access denied');
  END IF;
  
  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No school membership');
  END IF;
  
  -- Build stats JSON
  SELECT jsonb_build_object(
    'totalSubmissions', COUNT(*),
    'avgPercentage', COALESCE(ROUND(AVG(percentage)), 0),
    'highestScore', (
      SELECT jsonb_build_object('name', qs2.student_name, 'percentage', qs2.percentage)
      FROM quiz_scores qs2
      WHERE qs2.school_id = v_school_id
      ORDER BY qs2.percentage DESC
      LIMIT 1
    ),
    'lowestScore', (
      SELECT jsonb_build_object('name', qs3.student_name, 'percentage', qs3.percentage)
      FROM quiz_scores qs3
      WHERE qs3.school_id = v_school_id
      ORDER BY qs3.percentage ASC
      LIMIT 1
    ),
    'classStats', (
      SELECT COALESCE(jsonb_object_agg(
        COALESCE(class_data.student_class, 'Unknown'),
        jsonb_build_object(
          'count', class_data.cnt,
          'avg', class_data.avg_pct
        )
      ), '{}'::jsonb)
      FROM (
        SELECT 
          qs4.student_class,
          COUNT(*) as cnt,
          ROUND(AVG(qs4.percentage)) as avg_pct
        FROM quiz_scores qs4
        WHERE qs4.school_id = v_school_id
        GROUP BY qs4.student_class
      ) class_data
    )
  ) INTO v_result
  FROM quiz_scores qs
  WHERE qs.school_id = v_school_id;
  
  RETURN COALESCE(v_result, jsonb_build_object(
    'totalSubmissions', 0,
    'avgPercentage', 0,
    'highestScore', null,
    'lowestScore', null,
    'classStats', '{}'::jsonb
  ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 7: Grant execute permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION get_school_cambridge_scores(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_school_cambridge_stats() TO authenticated;

-- ============================================================================
-- VERIFICATION: Check the migration worked
-- ============================================================================

-- Check how many records were backfilled
SELECT 
  COUNT(*) FILTER (WHERE school_id IS NOT NULL) as with_school,
  COUNT(*) FILTER (WHERE school_id IS NULL) as without_school,
  COUNT(*) as total
FROM quiz_scores;

-- List policies on quiz_scores
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'quiz_scores';

-- ============================================================================
-- DONE! 
-- Teachers will now only see Cambridge test results from their own school.
-- ============================================================================
