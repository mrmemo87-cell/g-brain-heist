-- ============================================================================
-- DIAGNOSE & FIX FAKE ACHIEVEMENTS
-- ============================================================================
-- Problem: User created 2 days ago has achievements requiring 7-day streak,
-- 1000 coins, 10 PvP wins, etc.
-- ============================================================================

-- ============================================================================
-- STEP 1: Find users with suspicious achievement patterns
-- ============================================================================

-- Show users who earned many achievements on the same day (suspicious)
SELECT 
  u.username,
  u.created_at AS account_created,
  COUNT(ua.achievement_id) AS achievements_earned,
  MIN(COALESCE(ua.earned_at, ua.unlocked_at)) AS first_achievement,
  MAX(COALESCE(ua.earned_at, ua.unlocked_at)) AS last_achievement
FROM users u
JOIN user_achievements ua ON ua.user_id = u.id
WHERE ua.earned_at IS NOT NULL OR ua.unlocked_at IS NOT NULL
GROUP BY u.id, u.username, u.created_at
HAVING COUNT(ua.achievement_id) > 5
ORDER BY COUNT(ua.achievement_id) DESC;

-- ============================================================================
-- STEP 2: Check actual user stats vs achievement requirements
-- ============================================================================

-- Find users whose achievements don't match their actual stats
SELECT 
  u.username,
  u.created_at AS account_created,
  EXTRACT(DAY FROM NOW() - u.created_at) AS days_since_signup,
  u.streak,
  u.coins,
  u.xp,
  u.level,
  (SELECT COUNT(*) FROM activities WHERE actor_id = u.id AND kind = 'pvp_win') AS actual_pvp_wins,
  (SELECT COUNT(*) FROM student_assignment_results WHERE student_id = u.id) AS actual_assignments,
  (SELECT COUNT(*) FROM user_achievements WHERE user_id = u.id AND (earned_at IS NOT NULL OR unlocked_at IS NOT NULL)) AS achievements_earned
FROM users u
WHERE u.role = 'student' OR u.role IS NULL
ORDER BY achievements_earned DESC
LIMIT 20;

-- ============================================================================
-- STEP 3: List all earned achievements with their conditions
-- ============================================================================

SELECT 
  u.username,
  a.id AS achievement_id,
  a.name,
  a.condition_type,
  a.condition_value,
  COALESCE(ua.earned_at, ua.unlocked_at) AS earned_at,
  CASE 
    WHEN a.condition_type = 'streak' THEN u.streak::TEXT
    WHEN a.condition_type = 'coins_earned' THEN u.coins::TEXT
    WHEN a.condition_type = 'level' THEN u.level::TEXT
    WHEN a.condition_type = 'pvp_wins' THEN (SELECT COUNT(*)::TEXT FROM activities WHERE actor_id = u.id AND kind = 'pvp_win')
    ELSE 'N/A'
  END AS actual_value,
  CASE
    WHEN a.condition_type = 'streak' AND u.streak < a.condition_value THEN '❌ FAKE'
    WHEN a.condition_type = 'level' AND u.level < a.condition_value THEN '❌ FAKE'
    WHEN a.condition_type = 'coins_earned' AND u.coins < a.condition_value THEN '⚠️ SPENT?'
    ELSE '✓'
  END AS valid
FROM user_achievements ua
JOIN users u ON u.id = ua.user_id
JOIN achievements a ON a.id = ua.achievement_id
WHERE ua.earned_at IS NOT NULL OR ua.unlocked_at IS NOT NULL
ORDER BY u.username, ua.earned_at;

-- ============================================================================
-- STEP 4: NUCLEAR OPTION - Reset ALL achievements and let them re-earn naturally
-- ============================================================================
-- UNCOMMENT TO RUN:

-- DELETE FROM user_achievements;

-- ============================================================================
-- STEP 5: Safer option - Remove achievements that don't match actual stats
-- ============================================================================

-- Remove streak achievements where user's streak is less than required
DELETE FROM user_achievements ua
USING achievements a, users u
WHERE ua.achievement_id = a.id
  AND ua.user_id = u.id
  AND a.condition_type = 'streak'
  AND u.streak < a.condition_value;

-- Remove level achievements where user's level is less than required
DELETE FROM user_achievements ua
USING achievements a, users u
WHERE ua.achievement_id = a.id
  AND ua.user_id = u.id
  AND a.condition_type = 'level'
  AND u.level < a.condition_value;

-- Remove PvP achievements where actual wins don't match
DELETE FROM user_achievements ua
USING achievements a
WHERE ua.achievement_id = a.id
  AND a.condition_type IN ('pvp_wins', 'pvp_wins_count')
  AND a.condition_value > (
    SELECT COUNT(*) FROM activities 
    WHERE actor_id = ua.user_id AND kind = 'pvp_win'
  );

-- Remove assignment achievements where actual completions don't match
DELETE FROM user_achievements ua
WHERE ua.achievement_id LIKE 'assignment_%'
  AND ua.achievement_id != 'assignment_first'
  AND (
    SELECT COUNT(*) FROM student_assignment_results 
    WHERE student_id = ua.user_id
  ) < CASE 
    WHEN ua.achievement_id = 'assignment_5' THEN 5
    WHEN ua.achievement_id = 'assignment_10' THEN 10
    WHEN ua.achievement_id = 'assignment_25' THEN 25
    WHEN ua.achievement_id = 'assignment_50' THEN 50
    ELSE 1
  END;

-- ============================================================================
-- STEP 6: Also fix user streak values that are impossibly high
-- ============================================================================

-- Users can't have a streak higher than their account age in days
UPDATE users
SET streak = GREATEST(0, EXTRACT(DAY FROM NOW() - created_at)::INT)
WHERE streak > EXTRACT(DAY FROM NOW() - created_at);

-- ============================================================================
-- STEP 7: Verify cleanup worked
-- ============================================================================

SELECT 
  u.username,
  u.created_at,
  u.streak,
  COUNT(ua.achievement_id) AS remaining_achievements
FROM users u
LEFT JOIN user_achievements ua ON ua.user_id = u.id AND (ua.earned_at IS NOT NULL OR ua.unlocked_at IS NOT NULL)
GROUP BY u.id, u.username, u.created_at, u.streak
HAVING COUNT(ua.achievement_id) > 0
ORDER BY remaining_achievements DESC;

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- This script:
-- 1. Diagnoses which achievements are fake (don't match actual stats)
-- 2. Removes achievements that don't match real activity data
-- 3. Fixes user streak values that exceed account age
-- 4. Verifies the cleanup worked
-- 
-- After running this, achievements will only be earned through actual gameplay.
