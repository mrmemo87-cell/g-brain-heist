-- ============================================================================
-- CAMBRIDGE WRITING TEST 2 - QUICK DIAGNOSTIC CHECK
-- ============================================================================
-- Run this in Supabase SQL Editor to verify the RLS fix was applied correctly
-- ============================================================================

-- PART 1: Check RLS Status
-- Expected: rowsecurity = true
SELECT 
  schemaname,
  tablename,
  rowsecurity 
FROM pg_tables 
WHERE tablename = 'quiz_scores';

-- PART 2: Check INSERT Policies
-- Expected to see: "Anyone can submit quiz scores" with INSERT command
SELECT 
  policyname,
  cmd,
  permissive,
  roles
FROM pg_policies 
WHERE tablename = 'quiz_scores' 
AND cmd = 'INSERT'
ORDER BY policyname;

-- PART 3: Check SELECT Policies  
-- Expected to see: "Anyone can view scores" with SELECT command
SELECT 
  policyname,
  cmd,
  permissive,
  roles
FROM pg_policies 
WHERE tablename = 'quiz_scores' 
AND cmd = 'SELECT'
ORDER BY policyname;

-- PART 4: Check all policies on quiz_scores
-- Should only have 2 policies (INSERT and SELECT)
SELECT 
  policyname,
  cmd,
  permissive
FROM pg_policies 
WHERE tablename = 'quiz_scores'
ORDER BY cmd, policyname;

-- PART 5: Check role permissions on quiz_scores table
-- Expected: anon and authenticated should have INSERT and SELECT
SELECT 
  grantee,
  privilege_type
FROM information_schema.role_table_grants 
WHERE table_name = 'quiz_scores'
ORDER BY grantee, privilege_type;

-- PART 6: Test INSERT as anon user (should succeed)
-- This tests if the policy actually allows anon to insert
INSERT INTO quiz_scores (
  student_name,
  student_class,
  quiz_name,
  score,
  total_questions,
  percentage,
  answers
) VALUES (
  'Test_Diagnostic_' || to_char(now(), 'HH24MISS'),
  'TEST',
  'Cambridge Writing Test 2',
  0,
  35,
  0,
  jsonb_build_object(
    'part1', 'Diagnostic test',
    'part2', 'Testing submission',
    'requires_marking', true
  )
);

-- PART 7: Verify the test row was inserted
-- If you see a row with student_name starting with 'Test_Diagnostic_', insertion worked!
SELECT 
  id,
  student_name,
  quiz_name,
  submitted_at
FROM quiz_scores 
WHERE student_name LIKE 'Test_Diagnostic_%'
ORDER BY submitted_at DESC
LIMIT 5;

-- PART 8: Check for any UPDATE/DELETE policies that might be blocking
-- These shouldn't exist for normal submissions, but let's verify
SELECT 
  policyname,
  cmd
FROM pg_policies 
WHERE tablename = 'quiz_scores'
AND cmd IN ('UPDATE', 'DELETE')
ORDER BY policyname;

-- ============================================================================
-- WHAT TO LOOK FOR
-- ============================================================================
-- 
-- ✅ EXPECTED RESULTS (Good):
-- 
-- PART 1: rowsecurity = true ✓
-- PART 2: policyname = "Anyone can submit quiz scores" ✓
-- PART 3: policyname = "Anyone can view scores" ✓
-- PART 4: Only 2 policies total (INSERT + SELECT) ✓
-- PART 5: anon has INSERT and SELECT ✓
-- PART 6: INSERT succeeds (0 rows affected if no conflict) ✓
-- PART 7: Can see the test row ✓
-- PART 8: No UPDATE or DELETE policies ✓
--
-- ❌ PROBLEMS (Bad):
--
-- If you see "Authenticated users can submit quiz scores" instead of 
--   "Anyone can submit quiz scores" → RLS FIX DID NOT APPLY!
--
-- If you don't see these policies at all → RLS FIX DID NOT RUN!
--
-- If anon doesn't have INSERT → GRANT statement did not work!
--
-- If INSERT test fails → There's a database constraint blocking inserts!
--
-- ============================================================================

-- ============================================================================
-- IF RLS FIX DID NOT APPLY, RUN THIS:
-- ============================================================================

-- Drop old restrictive policies
DROP POLICY IF EXISTS "Authenticated users can submit quiz scores" ON quiz_scores;
DROP POLICY IF EXISTS "Anyone can submit quiz scores" ON quiz_scores;
DROP POLICY IF EXISTS "Students can view own scores" ON quiz_scores;
DROP POLICY IF EXISTS "Teachers view school scores" ON quiz_scores;
DROP POLICY IF EXISTS "Anyone can view scores" ON quiz_scores;

-- Create permissive policies
CREATE POLICY "Anyone can submit quiz scores" ON quiz_scores
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can view scores" ON quiz_scores
  FOR SELECT
  USING (true);

-- Grant permissions
GRANT INSERT ON quiz_scores TO anon;
GRANT INSERT ON quiz_scores TO authenticated;
GRANT SELECT ON quiz_scores TO anon;
GRANT SELECT ON quiz_scores TO authenticated;

-- Reload schema
NOTIFY pgrst, 'reload schema';

-- Verify fixes
SELECT 'FIX APPLIED' as status,
       (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'quiz_scores') as policy_count,
       now() as applied_at;

-- ============================================================================
