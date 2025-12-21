-- ============================================================================
-- FORCE DELETE FAKE ACHIEVEMENTS - Run this AFTER RUN_THIS_TO_FIX_ACHIEVEMENTS.sql
-- ============================================================================
-- This script FORCEFULLY removes achievements that couldn't have been earned
-- ============================================================================

-- ============================================================================
-- STEP 1: Delete ALL PvP achievements (no one has done real PvP yet)
-- ============================================================================

DELETE FROM user_achievements 
WHERE achievement_id IN (
  'pvp_champion', 
  'pvp_5', 
  'pvp_veteran', 
  'pvp_master', 
  'pvp_10_wins', 
  'first_pvp_win',
  'first_blood'  -- Just in case
);

SELECT 'Deleted PvP achievements' AS status, COUNT(*) AS deleted 
FROM user_achievements 
WHERE achievement_id LIKE '%pvp%';

-- ============================================================================
-- STEP 2: Delete coin_hoarder for users with < 1000 coins AND < 500 XP
-- ============================================================================

DELETE FROM user_achievements ua
WHERE ua.achievement_id = 'coin_hoarder'
AND EXISTS (
  SELECT 1 FROM users u 
  WHERE u.id = ua.user_id 
  AND u.coins < 1000 
  AND u.xp < 500
);

-- Also delete 'wealthy' for users with < 5000 coins
DELETE FROM user_achievements ua
WHERE ua.achievement_id = 'wealthy'
AND EXISTS (
  SELECT 1 FROM users u 
  WHERE u.id = ua.user_id 
  AND u.coins < 5000
);

SELECT 'Remaining coin achievements:' AS status;
SELECT ua.achievement_id, u.username, u.coins, u.xp
FROM user_achievements ua
JOIN users u ON u.id = ua.user_id
WHERE ua.achievement_id IN ('coin_hoarder', 'wealthy');

-- ============================================================================
-- STEP 3: Delete streak achievements that exceed account age
-- ============================================================================

-- Delete streak_3 for accounts < 3 days old
DELETE FROM user_achievements ua
WHERE ua.achievement_id = 'streak_3'
AND EXISTS (
  SELECT 1 FROM users u 
  WHERE u.id = ua.user_id 
  AND EXTRACT(DAY FROM NOW() - u.created_at) < 3
);

-- Delete streak_7 for accounts < 7 days old
DELETE FROM user_achievements ua
WHERE ua.achievement_id = 'streak_7'
AND EXISTS (
  SELECT 1 FROM users u 
  WHERE u.id = ua.user_id 
  AND EXTRACT(DAY FROM NOW() - u.created_at) < 7
);

-- Delete streak_30 for accounts < 30 days old
DELETE FROM user_achievements ua
WHERE ua.achievement_id = 'streak_30'
AND EXISTS (
  SELECT 1 FROM users u 
  WHERE u.id = ua.user_id 
  AND EXTRACT(DAY FROM NOW() - u.created_at) < 30
);

-- ============================================================================
-- STEP 4: Fix user streak values
-- ============================================================================

UPDATE users
SET streak = LEAST(streak, GREATEST(0, EXTRACT(DAY FROM NOW() - created_at)::INT))
WHERE streak > EXTRACT(DAY FROM NOW() - created_at);

-- ============================================================================
-- STEP 5: Verify Early Bird achievement (needs actual early submission)
-- ============================================================================

-- Delete early_bird if no actual early submissions exist
DELETE FROM user_achievements ua
WHERE ua.achievement_id = 'assignment_early'
AND NOT EXISTS (
  SELECT 1 
  FROM student_assignment_results sar
  JOIN assignments a ON a.id = sar.assignment_id
  WHERE sar.student_id = ua.user_id
    AND a.due_at IS NOT NULL
    AND sar.completed_at < a.due_at - INTERVAL '1 day'
);

-- ============================================================================
-- STEP 6: Show what's left for each user
-- ============================================================================

SELECT 
  u.username,
  u.coins,
  u.xp,
  u.level,
  u.streak,
  EXTRACT(DAY FROM NOW() - u.created_at)::INT AS account_age_days,
  COUNT(ua.achievement_id) AS achievements,
  STRING_AGG(ua.achievement_id, ', ' ORDER BY ua.achievement_id) AS achievement_ids
FROM users u
LEFT JOIN user_achievements ua ON ua.user_id = u.id 
  AND (ua.earned_at IS NOT NULL OR ua.unlocked_at IS NOT NULL)
WHERE u.role = 'student' OR u.role IS NULL
GROUP BY u.id, u.username, u.coins, u.xp, u.level, u.streak, u.created_at
ORDER BY u.username;

-- ============================================================================
-- DONE!
-- ============================================================================
-- After running this:
-- - ALL PvP achievements are removed (no real PvP exists yet)
-- - Coin achievements removed for users who don't have enough coins/XP
-- - Streak achievements removed for accounts too young
-- - Early Bird removed if no actual early submissions
-- ============================================================================
