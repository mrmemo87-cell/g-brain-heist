-- ============================================================================
-- FIX: Chemistry Test Anonymous Submissions Not Recording Answers
-- ============================================================================
-- Problem:
-- - Students taking AS Chemistry tests couldn't submit answers
-- - Root cause: RLS policy changed from "Anyone can submit" to "Authenticated users only"
-- - This blocked anonymous submissions that chemistry tests rely on
--
-- Affected files:
-- - FIX_CAMBRIDGE_TESTS_ISOLATION.sql changed the INSERT policy incorrectly
-- - This broke chemistry test submissions for unauthenticated users
--
-- Solution:
-- - Restore the permissive INSERT policy for anonymous users
-- - Keep the school_id trigger for data organization
-- - Maintain SELECT policies that respect school_id for security
-- ============================================================================

-- STEP 1: Drop the restrictive policy and ensure clean slate
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated users can submit quiz scores" ON quiz_scores;
DROP POLICY IF EXISTS "Anyone can submit quiz scores" ON quiz_scores;

-- STEP 2: Restore the permissive INSERT policy
-- ============================================================================
-- This allows both anonymous and authenticated users to submit quiz scores
-- The school_id trigger will auto-populate school context where available
CREATE POLICY "Anyone can submit quiz scores" ON quiz_scores
  FOR INSERT
  WITH CHECK (true);

-- STEP 3: Ensure grants are set for anonymous access
-- ============================================================================
GRANT INSERT ON quiz_scores TO anon;
GRANT INSERT ON quiz_scores TO authenticated;

-- STEP 4: Verify the fix
-- ============================================================================
-- Check that INSERT policy now allows anonymous submissions
SELECT 
  policyname,
  cmd,
  permissive,
  roles
FROM pg_policies 
WHERE tablename = 'quiz_scores' 
  AND cmd = 'INSERT'
ORDER BY policyname;

-- Check that anon role has INSERT permission
SELECT 
  grantee,
  privilege_type
FROM information_schema.role_table_grants 
WHERE table_name = 'quiz_scores' 
  AND grantee = 'anon'
  AND privilege_type = 'INSERT';

-- STEP 5: Test the fix (optional - run as admin in Supabase)
-- ============================================================================
-- Uncomment to test anonymous insertion:
/*
INSERT INTO quiz_scores (
  student_name,
  student_class,
  quiz_name,
  score,
  total_questions,
  percentage,
  answers
) VALUES (
  'Test_Student_Anonymous_' || to_char(now(), 'YYYYMMDDHH24MISS'),
  'Test Class',
  'AS Chemistry Ch2 (Atoms, molecules and stoichiometry)',
  25,
  64,
  39,
  jsonb_build_object(
    'responses', jsonb_build_object('1', 'C', '2', 'C', '3', 'C'),
    'answer_key_ready', true,
    'pending_answer_key', false,
    'quiz_version', 'v1-64q-part1'
  )
);
-- Expected result: INSERT 0 1 (success)
*/

-- ============================================================================
-- Summary of Changes
-- ============================================================================
-- ✓ Dropped restrictive "Authenticated users can submit quiz scores" policy
-- ✓ Restored permissive "Anyone can submit quiz scores" policy
-- ✓ Granted INSERT permission to anon role
-- ✓ Chemistry tests can now accept anonymous submissions again
-- ✓ school_id trigger still auto-populates for students in users table
-- ✓ SELECT policies maintain school-scoped security
-- ============================================================================
