-- ============================================================================
-- CHECK AS CHEMISTRY TEST VISIBILITY ISSUE
-- ============================================================================
-- Run these queries in Supabase SQL Editor to debug why AS Chemistry tests
-- aren't showing in the visibility manager

-- STEP 1: Verify AS Chemistry tests exist in database
-- ============================================================================
SELECT COUNT(*) as total_as_chemistry_tests
FROM cambridge_tests 
WHERE subject = 'AS Chemistry';

-- Show all AS Chemistry tests
SELECT id, name, subject 
FROM cambridge_tests 
WHERE subject = 'AS Chemistry' 
ORDER BY id;

-- STEP 2: Check if the migration was run
-- ============================================================================
-- If the above shows 0 tests, the ADD_MISSING_AS_CHEMISTRY_TESTS.sql 
-- migration hasn't been applied yet!

-- STEP 3: Check teacher's assigned classes and subjects
-- ============================================================================
-- Replace 'YOUR_TEACHER_USER_ID' with actual teacher ID
-- SELECT * FROM get_teacher_assigned_classes('YOUR_TEACHER_USER_ID');

-- STEP 4: Test the get_all_cambridge_tests function
-- ============================================================================
-- Replace values with actual teacher's grade and assigned subject
-- SELECT * FROM get_all_cambridge_tests(8, 'AS Chemistry');
-- SELECT * FROM get_all_cambridge_tests(8, 'Science');

-- STEP 5: Check all unique subjects in cambridge_tests
-- ============================================================================
SELECT DISTINCT subject 
FROM cambridge_tests 
ORDER BY subject;

-- STEP 6: Check class_teacher_assignments to see what subjects are assigned
-- ============================================================================
-- This shows all teacher-to-class assignments with their subjects
SELECT 
    cta.subject,
    COUNT(*) as count,
    STRING_AGG(DISTINCT u.username, ', ') as teachers
FROM class_teacher_assignments cta
LEFT JOIN users u ON u.id = cta.teacher_user_id
WHERE cta.active = true
GROUP BY cta.subject
ORDER BY cta.subject;

-- ============================================================================
-- SOLUTION
-- ============================================================================
-- If the teacher is assigned to "Science" but tests are "AS Chemistry":
-- 
-- Option A: Re-assign the teacher to "AS Chemistry" in School Admin Portal
--   - Go to School Admin Portal
--   - Teachers tab
--   - Change subject from "Science" to "AS Chemistry" for relevant class
--
-- Option B: Update the tests to use "Science" instead of "AS Chemistry"
--   - Run: UPDATE cambridge_tests SET subject = 'Science' 
--           WHERE subject = 'AS Chemistry';
--
-- Option C: Change the visibility function to be more flexible with subjects
--   - Modify get_all_cambridge_tests to handle subject hierarchies
-- ============================================================================
