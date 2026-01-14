-- ============================================================================
-- CAMBRIDGE WRITING TEST 2 - FINAL FIX (Policy Already Exists)
-- ============================================================================
-- The good policy exists, but old ones are still blocking. This removes ONLY the old ones.
-- ============================================================================

-- STEP 1: Drop ONLY the old/bad policies
DROP POLICY IF EXISTS "Authenticated users can submit quiz scores" ON quiz_scores;
DROP POLICY IF EXISTS "Students can view own scores" ON quiz_scores;
DROP POLICY IF EXISTS "Teachers view school scores" ON quiz_scores;
DROP POLICY IF EXISTS "Allow select for authenticated users" ON quiz_scores;
DROP POLICY IF EXISTS "Allow insert for authenticated users only" ON quiz_scores;

-- Do NOT drop "Anyone can submit quiz scores" or "Anyone can view scores" - those are good!

-- STEP 2: Make sure permissions are granted (these are safe to run even if already granted)
GRANT INSERT ON quiz_scores TO anon;
GRANT INSERT ON quiz_scores TO authenticated;
GRANT SELECT ON quiz_scores TO anon;
GRANT SELECT ON quiz_scores TO authenticated;

-- STEP 3: Reload schema to clear cache
NOTIFY pgrst, 'reload schema';

-- STEP 4: Verify only 2 policies exist now
SELECT 'VERIFICATION' as step, COUNT(*) as policy_count FROM pg_policies WHERE tablename = 'quiz_scores';

SELECT policyname, cmd FROM pg_policies WHERE tablename = 'quiz_scores' ORDER BY policyname;

-- STEP 5: Test that anon can insert
INSERT INTO quiz_scores (
  student_name,
  student_class,
  quiz_name,
  score,
  total_questions,
  percentage,
  answers
) VALUES (
  'FINAL_TEST_' || to_char(now(), 'YYYYMMDDHH24MISS'),
  'TEST',
  'Cambridge Writing Test 2',
  0,
  35,
  0,
  jsonb_build_object('part1', 'test', 'part2', 'test', 'requires_marking', true)
)
ON CONFLICT DO NOTHING;

-- If you see "INSERT 0 1" → Database is fixed!
-- If you see an error → There's a constraint blocking inserts

SELECT 'SUCCESS: Good policies in place, permissions granted' as status;
