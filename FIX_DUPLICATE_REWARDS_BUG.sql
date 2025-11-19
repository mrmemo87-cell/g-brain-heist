-- ============================================================
-- FIX DUPLICATE REWARDS BUG - Multi-Tab Reward Exploit
-- ============================================================
-- Issue: Users can get duplicate rewards by submitting the same
-- quest from multiple browser tabs simultaneously
--
-- Root Cause: Race condition - duplicate check happens BEFORE
-- insert, so multiple concurrent requests all pass the check
--
-- Solution: Add unique constraint to prevent duplicate reward claims
-- ============================================================

-- STEP 1: Add unique constraint on question_attempts table
-- This ensures only ONE correct attempt per student per question
-- that earned rewards. Concurrent submissions will get constraint violation.

ALTER TABLE question_attempts
ADD CONSTRAINT unique_student_question_correct_reward 
UNIQUE (student_id, question_id) 
WHERE is_correct = true;

-- This constraint means:
-- - Student can answer a question many times (wrong answers are fine)
-- - But only ONE correct answer per student per question
-- - Concurrent submissions will fail with unique constraint violation
-- - App must catch this and return "already claimed" instead of error

-- STEP 2: Update finalizeMcqAnswer to handle constraint violation
-- The function should catch unique constraint violations and treat them
-- as duplicate rewards (silently zero out the reward)

-- STEP 3: Create helper function for upsert-safe attempt insertion
CREATE OR REPLACE FUNCTION rpc_insert_question_attempt_safe(
    p_student_id uuid,
    p_question_id uuid,
    p_answer_given text,
    p_is_correct boolean,
    p_points_earned int
)
RETURNS TABLE (
    success boolean,
    is_duplicate boolean,
    error_message text
) AS $$
BEGIN
    INSERT INTO question_attempts (
        student_id,
        question_id,
        answer_given,
        is_correct,
        points_earned
    ) VALUES (
        p_student_id,
        p_question_id,
        p_answer_given,
        p_is_correct,
        CASE WHEN p_is_correct THEN p_points_earned ELSE 0 END
    );
    
    RETURN QUERY SELECT true, false, NULL::text;
    
EXCEPTION WHEN unique_violation THEN
    -- This is expected for duplicate correct answers
    RETURN QUERY SELECT false, true, 'Duplicate correct answer detected'::text;
EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT false, false, SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- STEP 4: Verification query - check if any users have multiple correct rewards
-- Run this to identify if any users exploited the bug before fix was deployed
SELECT 
    u.id,
    u.username,
    q.id as question_id,
    q.title,
    COUNT(*) as correct_attempt_count,
    SUM(qa.points_earned) as total_rewards_claimed,
    MAX(qa.attempted_at) as last_attempt
FROM users u
INNER JOIN question_attempts qa ON qa.student_id = u.id
INNER JOIN questions q ON q.id = qa.question_id
WHERE qa.is_correct = true
GROUP BY u.id, u.username, q.id, q.title
HAVING COUNT(*) > 1
ORDER BY total_rewards_claimed DESC;

-- If the above query returns results, users exploited the bug.
-- You can identify how many extra rewards they got and consider:
-- 1. Leaving it as-is (they earned it)
-- 2. Manually adjusting their profile downward
-- 3. Contacting them to explain the issue

-- STEP 5: Monitor for constraint violations after deployment
-- After deploying the fix, monitor logs for constraint violation errors
-- These will indicate users trying to submit from multiple tabs
-- The app should catch the error code 23505 (unique_violation) and:
-- - Not throw an error to the user
-- - Set deltas to 0
-- - Show message "Correct, but rewards already claimed"

-- ============================================================
-- DEPLOYMENT CHECKLIST
-- ============================================================
-- 1. Run this SQL script to add the constraint
-- 2. Update finalizeMcqAnswer in gameService.ts to handle error code 23505:
--    - Catch the error from the insert statement
--    - Check if it's error code 23505 (unique violation)
--    - If yes, set duplicateCorrect = true and don't apply rewards
--    - If no, throw the error
-- 3. Deploy updated code
-- 4. Monitor error logs for any 23505 errors
-- 5. Run verification query to check for past exploits
-- 6. Decide on remediation for affected users (if any found)
