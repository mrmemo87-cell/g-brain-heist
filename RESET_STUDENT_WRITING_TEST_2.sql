-- ============================================================================
-- RESET WRITING TEST 2 - GIVE STUDENT ANOTHER CHANCE
-- ============================================================================
-- This SQL clears ALL saved progress for a student on Cambridge Writing Test 2
-- so they can retake it from scratch.
-- ============================================================================

-- Profile ID: 446baa3c-d2a0-4ac1-8654-5769920832c4

-- STEP 1: Find the student's username
SELECT id, username FROM users WHERE id = '446baa3c-d2a0-4ac1-8654-5769920832c4';

-- STEP 2: Delete ALL Writing Test 2 submissions for this student
DELETE FROM quiz_scores
WHERE student_name = (
  SELECT username FROM users WHERE id = '446baa3c-d2a0-4ac1-8654-5769920832c4'
)
AND quiz_name = 'Cambridge Writing Test 2';

-- STEP 3: Verify deletion - should show 0 rows
SELECT COUNT(*) as remaining_records
FROM quiz_scores
WHERE student_name = (
  SELECT username FROM users WHERE id = '446baa3c-d2a0-4ac1-8654-5769920832c4'
)
AND quiz_name = 'Cambridge Writing Test 2';

-- STEP 4: Confirmation message
SELECT 'SUCCESS: Student can now retake Cambridge Writing Test 2' as status,
       (SELECT username FROM users WHERE id = '446baa3c-d2a0-4ac1-8654-5769920832c4') as student_username;
