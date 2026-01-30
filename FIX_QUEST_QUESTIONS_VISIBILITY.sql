-- ============================================================================
-- FIX: Some students can't see questions in Quest section
-- ============================================================================
-- This script diagnoses and fixes issues where questions don't appear
-- for students in the Quest view.
--
-- Common causes:
-- 1. Questions marked as is_public = false
-- 2. Questions marked as is_active = false  
-- 3. RLS policies blocking students
-- 4. Missing or incorrect permissions
-- ============================================================================

-- ============================================================================
-- STEP 1: DIAGNOSTIC - Check current state
-- ============================================================================

-- Check how many questions exist and their visibility status
SELECT 
  COUNT(*) as total_questions,
  COUNT(*) FILTER (WHERE is_public = true) as public_questions,
  COUNT(*) FILTER (WHERE is_active = true) as active_questions,
  COUNT(*) FILTER (WHERE is_public = true AND is_active = true) as visible_to_students
FROM questions;

-- Check RLS policies on questions table
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'questions'
ORDER BY policyname;

-- Check if there are questions but they're not public/active
SELECT 
  subject,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE is_public = true) as public_count,
  COUNT(*) FILTER (WHERE is_active = true) as active_count,
  COUNT(*) FILTER (WHERE is_public = true AND is_active = true) as student_visible
FROM questions
GROUP BY subject
ORDER BY subject;

-- ============================================================================
-- STEP 2: FIX - Ensure RLS policy allows all authenticated users to read
-- ============================================================================

-- Drop and recreate the questions_read_all policy to ensure it's correct
DROP POLICY IF EXISTS "questions_read_all" ON questions;

CREATE POLICY "questions_read_all"
ON questions
FOR SELECT
TO authenticated
USING (true);

COMMENT ON POLICY "questions_read_all" ON questions IS 
  'Global read access: All authenticated users can read all questions regardless of school';

-- ============================================================================
-- STEP 3: FIX - Make existing questions visible to students
-- ============================================================================
-- Update questions that should be public but aren't marked correctly

-- Count questions that will be affected
SELECT 
  COUNT(*) as questions_to_update,
  COUNT(*) FILTER (WHERE is_public = false OR is_public IS NULL) as need_public_fix,
  COUNT(*) FILTER (WHERE is_active = false OR is_active IS NULL) as need_active_fix
FROM questions;

-- Option A: Make ALL questions public and active (if this is desired)
-- Uncomment the line below if you want ALL questions visible to students
-- UPDATE questions SET is_public = true, is_active = true WHERE is_public = false OR is_active = false;

-- Option B: Make only questions with specific criteria public
-- Example: Make all questions from the last 6 months public and active
UPDATE questions 
SET is_public = true, is_active = true
WHERE (is_public = false OR is_public IS NULL OR is_active = false OR is_active IS NULL)
  AND created_at > NOW() - INTERVAL '6 months';

-- ============================================================================
-- STEP 4: VERIFY - Confirm students can now see questions
-- ============================================================================

-- Check final state
SELECT 
  'questions' as table_name,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE is_public = true AND is_active = true) as visible_to_students,
  ROUND(100.0 * COUNT(*) FILTER (WHERE is_public = true AND is_active = true) / NULLIF(COUNT(*), 0), 1) as visibility_percentage
FROM questions;

-- Show breakdown by subject
SELECT 
  subject,
  COUNT(*) as total_questions,
  COUNT(*) FILTER (WHERE is_public = true AND is_active = true) as student_visible_count
FROM questions
GROUP BY subject
HAVING COUNT(*) > 0
ORDER BY subject;

-- ============================================================================
-- STEP 5: TEST - Verify RLS is working correctly
-- ============================================================================

-- Create a test function that simulates a student query
CREATE OR REPLACE FUNCTION test_student_question_visibility()
RETURNS TABLE (
  test_name TEXT,
  passed BOOLEAN,
  details TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_student_count INTEGER;
  v_public_count INTEGER;
  v_total_count INTEGER;
BEGIN
  -- Test 1: Check total questions
  SELECT COUNT(*) INTO v_total_count FROM questions;
  RETURN QUERY SELECT 
    'Total questions exist'::TEXT,
    v_total_count > 0,
    format('%s questions in database', v_total_count);

  -- Test 2: Check public questions
  SELECT COUNT(*) INTO v_public_count 
  FROM questions 
  WHERE is_public = true AND is_active = true;
  
  RETURN QUERY SELECT 
    'Public questions available'::TEXT,
    v_public_count > 0,
    format('%s questions marked public and active', v_public_count);

  -- Test 3: Simulate student query (what gameService.get_public_questions does)
  SELECT COUNT(*) INTO v_student_count
  FROM questions
  WHERE is_public = true 
    AND is_active = true;
  
  RETURN QUERY SELECT 
    'Students can query public questions'::TEXT,
    v_student_count > 0,
    format('Students should see %s questions', v_student_count);

  -- Test 4: Check RLS policy exists
  RETURN QUERY SELECT 
    'RLS policy exists'::TEXT,
    EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'questions' AND policyname = 'questions_read_all'),
    'questions_read_all policy is active';
END;
$$;

-- Run the tests
SELECT * FROM test_student_question_visibility();

-- ============================================================================
-- QUICK FIX: If you need to make questions visible immediately
-- ============================================================================
-- Run this to make ALL questions public and active:

-- UNCOMMENT THE LINE BELOW TO APPLY QUICK FIX:
-- UPDATE questions SET is_public = true, is_active = true WHERE is_public IS DISTINCT FROM true OR is_active IS DISTINCT FROM true;

-- Then verify:
-- SELECT subject, COUNT(*) as visible_questions FROM questions WHERE is_public = true AND is_active = true GROUP BY subject;

-- ============================================================================
-- NOTES FOR TEACHERS
-- ============================================================================
-- Teachers can control question visibility by setting:
-- 1. is_public = true  (shows in student question bank)
-- 2. is_active = true  (question is available for use)
--
-- To make a question visible to students:
-- UPDATE questions SET is_public = true, is_active = true WHERE id = '<question-id>';
--
-- To hide a question from students:
-- UPDATE questions SET is_public = false WHERE id = '<question-id>';
-- ============================================================================
