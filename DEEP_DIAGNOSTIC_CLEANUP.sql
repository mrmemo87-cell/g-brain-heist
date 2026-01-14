-- ============================================================================
-- CAMBRIDGE WRITING TEST 2 - DEEP DIAGNOSTIC & CLEANUP
-- ============================================================================
-- Run this to see what policies exist and clean up any conflicting ones
-- ============================================================================

-- STEP 1: See ALL policies on quiz_scores with full details
SELECT 
  policyname,
  cmd,
  permissive,
  qual as "using_clause",
  with_check as "with_check_clause",
  roles
FROM pg_policies 
WHERE tablename = 'quiz_scores'
ORDER BY policyname;

-- STEP 2: Count them
SELECT COUNT(*) as total_policies FROM pg_policies WHERE tablename = 'quiz_scores';

-- ============================================================================
-- IF YOU SEE MORE THAN 2 POLICIES, RUN THIS TO CLEAN UP:
-- ============================================================================

-- Drop ALL policies (we'll recreate just the good ones)
DROP POLICY IF EXISTS "Authenticated users can submit quiz scores" ON quiz_scores;
DROP POLICY IF EXISTS "Anyone can submit quiz scores" ON quiz_scores;
DROP POLICY IF EXISTS "Students can view own scores" ON quiz_scores;
DROP POLICY IF EXISTS "Teachers view school scores" ON quiz_scores;
DROP POLICY IF EXISTS "Allow select for authenticated users" ON quiz_scores;
DROP POLICY IF EXISTS "Anyone can view scores" ON quiz_scores;
DROP POLICY IF EXISTS "Authenticated users can submit quiz scores" ON quiz_scores;
DROP POLICY IF EXISTS "Allow insert for authenticated users only" ON quiz_scores;

-- Create ONLY the 2 good policies
CREATE POLICY "Anyone can submit quiz scores" ON quiz_scores
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can view scores" ON quiz_scores
  FOR SELECT
  USING (true);

-- Grant permissions clearly
GRANT INSERT ON quiz_scores TO anon;
GRANT INSERT ON quiz_scores TO authenticated;
GRANT SELECT ON quiz_scores TO anon;
GRANT SELECT ON quiz_scores TO authenticated;

-- Reload schema
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- STEP 3: VERIFY THE FIX
-- ============================================================================

-- Should now show exactly 2 policies
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'quiz_scores' ORDER BY policyname;

-- Verify permissions
SELECT grantee, privilege_type FROM information_schema.role_table_grants 
WHERE table_name = 'quiz_scores' AND grantee IN ('anon', 'authenticated')
ORDER BY grantee, privilege_type;

-- ============================================================================
-- STEP 4: TEST INSERT (This should succeed!)
-- ============================================================================

INSERT INTO quiz_scores (
  student_name,
  student_class,
  quiz_name,
  score,
  total_questions,
  percentage,
  answers
) VALUES (
  'TEST_' || to_char(now(), 'YYYYMMDDHH24MISS'),
  'TEST',
  'Cambridge Writing Test 2',
  0,
  35,
  0,
  jsonb_build_object('part1', 'test', 'part2', 'test', 'requires_marking', true)
);

-- If you see "INSERT 0 1" → Success!
-- If you see an error → There's a constraint/trigger blocking inserts

-- ============================================================================
-- STEP 5: Check for blocking triggers or constraints
-- ============================================================================

-- Check for triggers
SELECT 
  trigger_schema,
  trigger_name,
  event_object_table,
  event_manipulation
FROM information_schema.triggers 
WHERE event_object_table = 'quiz_scores'
ORDER BY trigger_name;

-- Check for constraints
SELECT 
  table_name,
  constraint_name,
  constraint_type
FROM information_schema.table_constraints 
WHERE table_name = 'quiz_scores'
ORDER BY constraint_name;

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- If you see:
--
-- ✅ 2 policies (INSERT + SELECT both with WITH CHECK (true))
-- ✅ anon has INSERT and SELECT
-- ✅ authenticated has INSERT and SELECT  
-- ✅ INSERT test succeeds
-- ✅ No problematic triggers
--
-- Then the database is fine and the error is elsewhere!
-- 
-- The student needs to open F12 Console and show us the actual error message.
-- It will be one of:
-- - "HTTP 403" → Still RLS issue (unlikely given policies)
-- - "HTTP 401" → Auth issue
-- - "HTTP 500" → Database/server error
-- - "CORS error" → Network issue
-- - Something else → Different problem
-- ============================================================================
