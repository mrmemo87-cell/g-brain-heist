-- ============================================================
-- DIAGNOSE: User Rewards Not Being Saved
-- ============================================================
-- This script helps identify why users don't receive XP/coins
-- when completing quests with correct answers
-- ============================================================

-- 1. CHECK USER PROFILE STATS
SELECT 
    'USER PROFILES' as diagnostic,
    id,
    username,
    xp,
    coins,
    level,
    gemstones,
    created_at,
    updated_at,
    last_seen
FROM users
WHERE is_admin = false AND is_banned = false
ORDER BY updated_at DESC
LIMIT 5;

-- 2. CHECK RECENT QUESTION ATTEMPTS
SELECT 
    'QUESTION ATTEMPTS' as diagnostic,
    qa.id,
    qa.student_id,
    u.username,
    qa.question_id,
    qa.is_correct,
    qa.points_earned,
    qa.attempted_at,
    NOW() - qa.attempted_at as time_ago
FROM question_attempts qa
LEFT JOIN users u ON u.id = qa.student_id
WHERE qa.attempted_at > NOW() - INTERVAL '1 hour'
ORDER BY qa.attempted_at DESC
LIMIT 20;

-- 3. CHECK RLS POLICIES ON USERS TABLE
SELECT 
    'RLS POLICIES ON USERS' as diagnostic,
    schemaname,
    tablename,
    policyname,
    cmd,
    qual
FROM pg_policies
WHERE tablename = 'users'
ORDER BY policyname;

-- 4. AUDIT PROFILE UPDATE ATTEMPTS (check logs)
SELECT 
    'PROFILE UPDATE LOGS' as diagnostic,
    function_name,
    log_level,
    message,
    user_id,
    context,
    created_at
FROM rpc_event_log
WHERE function_name IN ('rpc_admin_grant', 'update_user_stats')
    OR message LIKE '%profile%'
    OR message LIKE '%reward%'
ORDER BY created_at DESC
LIMIT 10;

-- 5. CHECK FOR FAILED TRANSACTIONS
SELECT 
    'ERROR LOGS' as diagnostic,
    function_name,
    log_level,
    message,
    user_id,
    created_at
FROM rpc_event_log
WHERE log_level = 'error'
    AND created_at > NOW() - INTERVAL '2 hours'
ORDER BY created_at DESC
LIMIT 20;

-- 6. CHECK USER XP PROGRESSION
WITH user_attempts AS (
    SELECT 
        qa.student_id,
        u.username,
        COUNT(*) as total_attempts,
        COUNT(CASE WHEN is_correct THEN 1 END) as correct_answers,
        SUM(CASE WHEN is_correct THEN COALESCE(points_earned, 20) ELSE 0 END) as expected_xp_earned
    FROM question_attempts qa
    LEFT JOIN users u ON u.id = qa.student_id
    WHERE qa.attempted_at > NOW() - INTERVAL '24 hours'
    GROUP BY qa.student_id, u.username
)
SELECT 
    'XP MISMATCH CHECK' as diagnostic,
    ua.username,
    ua.correct_answers,
    ua.expected_xp_earned,
    u.xp as actual_xp,
    CASE 
        WHEN ua.expected_xp_earned > 0 AND u.xp < ua.expected_xp_earned THEN 'MISMATCH - Rewards not saved!'
        WHEN ua.expected_xp_earned > 0 AND u.xp >= ua.expected_xp_earned THEN 'OK - Rewards received'
        ELSE 'No recent attempts'
    END as status
FROM user_attempts ua
LEFT JOIN users u ON u.id = ua.student_id
ORDER BY ua.username;

-- 7. CHECK FOR DUPLICATE CORRECT ANSWERS (they should prevent re-reward)
SELECT 
    'DUPLICATE CHECK' as diagnostic,
    student_id,
    question_id,
    COUNT(*) as attempt_count,
    COUNT(CASE WHEN is_correct THEN 1 END) as correct_count,
    MAX(attempted_at) as last_attempt
FROM question_attempts
WHERE is_correct = true
GROUP BY student_id, question_id
HAVING COUNT(*) > 1
LIMIT 10;
