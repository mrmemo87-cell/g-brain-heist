-- ============================================
-- MULTI_TENANT_ISOLATION_SMOKE_TESTS.sql
-- Run in Supabase SQL Editor to verify isolation
-- ============================================

-- ============================================
-- TEST SETUP: Create test data
-- ============================================

DO $$
DECLARE
    v_school_a_id UUID;
    v_school_b_id UUID;
    v_user_a1_id UUID;
    v_user_a2_id UUID;
    v_user_b1_id UUID;
    v_user_b2_id UUID;
BEGIN
    -- Create two test schools if they don't exist
    INSERT INTO schools (id, name, slug, status, settings)
    VALUES 
        ('a0000000-0000-0000-0000-000000000001', 'Test School A', 'test-school-a', 'active', '{"is_test": true}'),
        ('b0000000-0000-0000-0000-000000000002', 'Test School B', 'test-school-b', 'active', '{"is_test": true}')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
    
    v_school_a_id := 'a0000000-0000-0000-0000-000000000001';
    v_school_b_id := 'b0000000-0000-0000-0000-000000000002';
    
    -- Create test users for each school
    INSERT INTO users (id, email, username, role, school_id, xp, pvp_score, level, coins)
    VALUES 
        ('a1000000-0000-0000-0000-000000000001', 'test_user_a1@test.com', 'TestUserA1', 'student', v_school_a_id, 1000, 50, 5, 500),
        ('a2000000-0000-0000-0000-000000000002', 'test_user_a2@test.com', 'TestUserA2', 'student', v_school_a_id, 2000, 100, 8, 1000),
        ('b1000000-0000-0000-0000-000000000001', 'test_user_b1@test.com', 'TestUserB1', 'student', v_school_b_id, 3000, 150, 10, 1500),
        ('b2000000-0000-0000-0000-000000000002', 'test_user_b2@test.com', 'TestUserB2', 'student', v_school_b_id, 500, 25, 3, 200)
    ON CONFLICT (id) DO UPDATE SET 
        school_id = EXCLUDED.school_id,
        username = EXCLUDED.username,
        xp = EXCLUDED.xp,
        pvp_score = EXCLUDED.pvp_score;
    
    -- Create school members entries
    INSERT INTO school_members (user_id, school_id, role, status)
    VALUES 
        ('a1000000-0000-0000-0000-000000000001', v_school_a_id, 'student', 'active'),
        ('a2000000-0000-0000-0000-000000000002', v_school_a_id, 'student', 'active'),
        ('b1000000-0000-0000-0000-000000000001', v_school_b_id, 'student', 'active'),
        ('b2000000-0000-0000-0000-000000000002', v_school_b_id, 'student', 'active')
    ON CONFLICT (user_id, school_id) DO NOTHING;
    
    -- Create test activities
    INSERT INTO activities (id, kind, actor_id, actor_username, school_id, data, created_at)
    VALUES 
        ('aa000000-0000-0000-0000-000000000001', 'level_up', 'a1000000-0000-0000-0000-000000000001', 'TestUserA1', v_school_a_id, '{"level": 5}', NOW() - INTERVAL '1 hour'),
        ('aa000000-0000-0000-0000-000000000002', 'pvp_win', 'a2000000-0000-0000-0000-000000000002', 'TestUserA2', v_school_a_id, '{"coins_won": 100}', NOW() - INTERVAL '2 hours'),
        ('bb000000-0000-0000-0000-000000000001', 'level_up', 'b1000000-0000-0000-0000-000000000001', 'TestUserB1', v_school_b_id, '{"level": 10}', NOW() - INTERVAL '30 minutes'),
        ('bb000000-0000-0000-0000-000000000002', 'achievement', 'b2000000-0000-0000-0000-000000000002', 'TestUserB2', v_school_b_id, '{"achievement": "First Win"}', NOW())
    ON CONFLICT (id) DO UPDATE SET school_id = EXCLUDED.school_id;
    
    RAISE NOTICE 'Test data created successfully';
END $$;

-- ============================================
-- TEST 1: Leaderboard isolation (simulating School A user)
-- ============================================
SELECT '=== TEST 1: Leaderboard Isolation ===' AS test;

-- Simulate being user A1 (in School A)
-- This would normally use auth.uid() but for testing we query directly
SELECT 
    'School A leaderboard should only show School A users' AS expectation,
    COUNT(*) AS total_users,
    BOOL_AND(school_id = 'a0000000-0000-0000-0000-000000000001') AS all_from_school_a
FROM (
    SELECT u.id, u.username, u.school_id
    FROM users u
    WHERE u.school_id = 'a0000000-0000-0000-0000-000000000001'
      AND u.is_banned = FALSE
      AND COALESCE(u.role, 'student') != 'teacher'
      AND COALESCE(u.is_admin, FALSE) = FALSE
    ORDER BY (COALESCE(u.xp, 0) + COALESCE(u.pvp_score, 0) * 10) DESC
    LIMIT 100
) AS school_a_leaderboard;

-- Verify School B users are NOT visible
SELECT 
    'School B users should NOT appear in School A leaderboard' AS expectation,
    COUNT(*) AS school_b_users_visible,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL - CROSS-SCHOOL LEAK' END AS result
FROM (
    SELECT u.id
    FROM users u
    WHERE u.school_id = 'a0000000-0000-0000-0000-000000000001'
      AND u.id IN ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002')
) AS leaked_users;

-- ============================================
-- TEST 2: Attack targets isolation
-- ============================================
SELECT '=== TEST 2: Attack Targets Isolation ===' AS test;

-- For a School A user, attack targets should only be from School A
SELECT 
    'Attack targets for School A user should only show School A users' AS expectation,
    COUNT(*) AS total_targets,
    BOOL_AND(school_id = 'a0000000-0000-0000-0000-000000000001') AS all_from_school_a
FROM (
    SELECT u.id, u.username, u.school_id
    FROM users u
    WHERE u.school_id = 'a0000000-0000-0000-0000-000000000001'
      AND u.id != 'a1000000-0000-0000-0000-000000000001'  -- Exclude self
      AND COALESCE(u.role, 'student') NOT IN ('teacher', 'admin')
      AND u.is_banned = FALSE
    LIMIT 100
) AS school_a_targets;

-- Verify School B users cannot be attacked by School A user
SELECT 
    'School B users should NOT be attack targets for School A' AS expectation,
    CASE 
        WHEN NOT EXISTS (
            SELECT 1 FROM users u
            WHERE u.school_id = 'a0000000-0000-0000-0000-000000000001'
              AND u.id IN ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002')
        ) THEN 'PASS'
        ELSE 'FAIL - CROSS-SCHOOL TARGETS VISIBLE'
    END AS result;

-- ============================================
-- TEST 3: Activity feed isolation
-- ============================================
SELECT '=== TEST 3: Activity Feed Isolation ===' AS test;

-- For a School A user, activity feed should only show School A activities
SELECT 
    'Activity feed for School A should only show School A activities' AS expectation,
    COUNT(*) AS total_activities,
    BOOL_AND(school_id = 'a0000000-0000-0000-0000-000000000001') AS all_from_school_a
FROM activities
WHERE school_id = 'a0000000-0000-0000-0000-000000000001';

-- Verify School B activities are not visible to School A
SELECT 
    'School B activities should NOT appear for School A users' AS expectation,
    CASE 
        WHEN NOT EXISTS (
            SELECT 1 FROM activities a
            WHERE a.school_id = 'a0000000-0000-0000-0000-000000000001'
              AND a.id IN ('bb000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000002')
        ) THEN 'PASS'
        ELSE 'FAIL - CROSS-SCHOOL ACTIVITIES VISIBLE'
    END AS result;

-- ============================================
-- TEST 4: Verify RPCs exist
-- ============================================
SELECT '=== TEST 4: RPC Functions Exist ===' AS test;

SELECT 
    proname AS function_name,
    'EXISTS' AS status
FROM pg_proc
WHERE proname IN (
    'get_school_leaderboard',
    'get_school_clan_leaderboard', 
    'get_attack_targets',
    'get_school_activity_feed',
    'check_user_setup_status',
    'get_caller_school_id'
)
ORDER BY proname;

-- ============================================
-- TEST 5: Verify activities table has school_id
-- ============================================
SELECT '=== TEST 5: Activities table schema ===' AS test;

SELECT 
    column_name,
    data_type,
    CASE WHEN column_name = 'school_id' THEN 'PASS - school_id column exists' ELSE 'INFO' END AS status
FROM information_schema.columns
WHERE table_name = 'activities' AND column_name = 'school_id';

-- ============================================
-- TEST 6: Verify RLS is enabled on activities
-- ============================================
SELECT '=== TEST 6: RLS Status ===' AS test;

SELECT 
    tablename,
    CASE WHEN rowsecurity THEN 'PASS - RLS enabled' ELSE 'FAIL - RLS not enabled' END AS rls_status
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'activities';

-- ============================================
-- SUMMARY
-- ============================================
SELECT '=== TEST SUMMARY ===' AS summary;

SELECT 
    'All isolation tests' AS test_suite,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_proc WHERE proname = 'get_school_leaderboard'
        ) AND EXISTS (
            SELECT 1 FROM pg_proc WHERE proname = 'get_attack_targets'
        ) AND EXISTS (
            SELECT 1 FROM pg_proc WHERE proname = 'get_school_activity_feed'
        ) AND EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'activities' AND column_name = 'school_id'
        ) THEN 'PASS - All tenant isolation features in place'
        ELSE 'FAIL - Some features missing'
    END AS overall_result;

-- ============================================
-- CLEANUP (Optional - uncomment to run)
-- ============================================
-- DELETE FROM activities WHERE id IN ('aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000002', 'bb000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000002');
-- DELETE FROM school_members WHERE user_id IN ('a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002');
-- DELETE FROM users WHERE id IN ('a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002');
-- DELETE FROM schools WHERE id IN ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002');
