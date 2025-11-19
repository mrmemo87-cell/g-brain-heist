-- ============================================================
-- REPAIR QUEST REWARDS - Manual User XP/Coins Correction
-- ============================================================
-- Use this script to manually fix users who didn't receive
-- XP/coins for questions they answered correctly
-- ============================================================

-- STEP 1: IDENTIFY USERS WITH MISSING REWARDS
-- Run this first to see who needs fixing
SELECT 
    u.id,
    u.username,
    u.xp as current_xp,
    u.coins as current_coins,
    COUNT(qa.id) as total_attempts,
    COUNT(CASE WHEN qa.is_correct THEN 1 END) as correct_attempts,
    SUM(CASE WHEN qa.is_correct THEN COALESCE(qa.points_earned, 20) ELSE 0 END) as expected_xp_from_correct,
    SUM(CASE WHEN qa.is_correct THEN COALESCE(qa.points_earned, 30) ELSE 0 END) as expected_coins_from_correct
FROM users u
LEFT JOIN question_attempts qa ON qa.student_id = u.id
WHERE qa.attempted_at > NOW() - INTERVAL '7 days'
GROUP BY u.id, u.username, u.xp, u.coins
HAVING COUNT(CASE WHEN qa.is_correct THEN 1 END) > 0
    AND (
        -- Check if actual XP is significantly less than expected
        u.xp < SUM(CASE WHEN qa.is_correct THEN COALESCE(qa.points_earned, 20) ELSE 0 END) * 0.8
        -- OR coins are significantly less than expected
        OR u.coins < SUM(CASE WHEN qa.is_correct THEN COALESCE(qa.points_earned, 30) ELSE 0 END) * 0.8
    )
ORDER BY expected_xp_from_correct DESC;

-- ============================================================
-- STEP 2: CALCULATE OWED REWARDS FOR SPECIFIC USER
-- ============================================================
-- Replace 'USER_USERNAME' with actual username
-- This shows exactly how much XP/coins the user should receive
SELECT 
    'REWARDS CALCULATION' as calculation_type,
    users.username,
    users.xp as current_xp,
    users.coins as current_coins,
    COUNT(qa.id) as total_correct_answers,
    COALESCE(SUM(qa.points_earned), 0) as total_xp_earned_recorded,
    COUNT(qa.id) * 25 as default_coins_per_correct,
    (COUNT(qa.id) * 25) - COALESCE(SUM(qa.points_earned), 0) as xp_deficit,
    CASE 
        WHEN COUNT(qa.id) * 25 > COALESCE(SUM(qa.points_earned), 0) THEN 'YES - User is owed rewards'
        ELSE 'NO - User has received rewards'
    END as needs_correction
FROM users
LEFT JOIN question_attempts qa ON qa.student_id = users.id AND qa.is_correct = true
WHERE users.username = 'USER_USERNAME'
GROUP BY users.id, users.username, users.xp, users.coins;

-- ============================================================
-- STEP 3: GRANT REWARDS MANUALLY (IF NEEDED)
-- ============================================================
-- This function grants XP/Coins directly
-- Syntax: rpc_admin_grant(user_id_uuid, xp_amount, coins_amount)

-- Example 1: Grant 100 XP and 500 coins to a specific user
-- SELECT rpc_admin_grant(
--     '00000000-0000-0000-0000-000000000000'::uuid,  -- Replace with actual user UUID
--     100,  -- XP to grant
--     500   -- Coins to grant
-- );

-- Example 2: Auto-generate grant for all affected users
-- (Run SELECT from Step 1 first, then use the IDs)
-- SELECT 
--     u.id,
--     u.username,
--     rpc_admin_grant(
--         u.id,
--         GREATEST(0, COUNT(qa.id) * 20 - COALESCE(u.xp, 0))::INT,
--         GREATEST(0, COUNT(qa.id) * 25 - COALESCE(u.coins, 0))::INT
--     ) as grant_result
-- FROM users u
-- LEFT JOIN question_attempts qa ON qa.student_id = u.id AND qa.is_correct = true
-- GROUP BY u.id, u.username, u.xp, u.coins;

-- ============================================================
-- STEP 4: VERIFY THE CORRECTION
-- ============================================================
-- Run this after granting rewards to confirm they were applied
SELECT 
    users.id,
    users.username,
    users.xp,
    users.coins,
    users.updated_at,
    'VERIFIED' as status
FROM users
WHERE users.id = '00000000-0000-0000-0000-000000000000'::uuid;  -- Replace with user UUID

-- ============================================================
-- STEP 5: AUDIT TRAIL
-- ============================================================
-- Check all manual grants made
SELECT 
    id,
    username,
    xp,
    coins,
    updated_at,
    'AUDITED' as status
FROM users
ORDER BY updated_at DESC
LIMIT 20;

-- ============================================================
-- BULK CORRECTION SCRIPT
-- ============================================================
-- Uncomment below to automatically correct ALL users with missing rewards
-- Only run after verifying Step 1-2!

/*
DO $$
DECLARE
    v_user RECORD;
    v_xp_owed INT;
    v_coins_owed INT;
BEGIN
    FOR v_user IN
        SELECT 
            u.id,
            u.username,
            COUNT(qa.id) * 20 as total_xp_owed,
            COUNT(qa.id) * 25 as total_coins_owed
        FROM users u
        LEFT JOIN question_attempts qa ON qa.student_id = u.id AND qa.is_correct = true
        WHERE qa.attempted_at > NOW() - INTERVAL '7 days'
        GROUP BY u.id, u.username
        HAVING COUNT(qa.id) > 0 AND u.xp < COUNT(qa.id) * 20 * 0.8
    LOOP
        -- Calculate deficit
        v_xp_owed := GREATEST(0, v_user.total_xp_owed - (SELECT xp FROM users WHERE id = v_user.id));
        v_coins_owed := GREATEST(0, v_user.total_coins_owed - (SELECT coins FROM users WHERE id = v_user.id));
        
        -- Grant via admin function
        PERFORM rpc_admin_grant(v_user.id, v_xp_owed, v_coins_owed);
        
        RAISE NOTICE 'Granted % XP and % coins to %', v_xp_owed, v_coins_owed, v_user.username;
    END LOOP;
END;
$$;
*/
