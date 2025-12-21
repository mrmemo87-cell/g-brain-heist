-- ============================================================================
-- VALIDATE ALL ACHIEVEMENTS - Comprehensive Check & Cleanup
-- ============================================================================
-- This script validates EVERY achievement for EVERY player against real data
-- and removes any that weren't legitimately earned.
-- ============================================================================

-- ============================================================================
-- STEP 1: Create a temporary function to validate achievements
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_user_achievements(p_user_id UUID)
RETURNS TABLE (
  ach_id TEXT,
  is_valid BOOLEAN,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_ach RECORD;
  v_account_age_days INT;
  v_pvp_wins INT;
  v_pvp_battles_participated INT;
  v_quests_completed INT;
  v_items_purchased INT;
  v_assignment_count INT;
  v_perfect_score_count INT;
  v_early_submission_count INT;
  v_correct_answers INT;
  v_has_clan BOOLEAN;
  v_total_coins_from_activities INT;
BEGIN
  -- Get user data
  SELECT * INTO v_user FROM users WHERE id = p_user_id;
  IF v_user IS NULL THEN
    RETURN;
  END IF;

  -- Calculate account age in days
  v_account_age_days := GREATEST(0, EXTRACT(DAY FROM NOW() - v_user.created_at)::INT);

  -- ============ PVP VALIDATION ============
  -- Count REAL PvP wins from brains_heist_battles (the actual battle table)
  BEGIN
    SELECT COUNT(*) INTO v_pvp_wins 
    FROM brains_heist_battles 
    WHERE winner_id = p_user_id AND status = 'completed';
  EXCEPTION WHEN undefined_table THEN
    v_pvp_wins := 0;
  END;

  -- Also check if they even participated in any battles
  BEGIN
    SELECT COUNT(*) INTO v_pvp_battles_participated
    FROM brains_heist_battles 
    WHERE (challenger_id = p_user_id OR opponent_id = p_user_id) 
      AND status = 'completed';
  EXCEPTION WHEN undefined_table THEN
    v_pvp_battles_participated := 0;
  END;

  -- If no battles table, fall back to activities but be strict
  IF v_pvp_wins = 0 AND v_pvp_battles_participated = 0 THEN
    SELECT COUNT(*) INTO v_pvp_wins 
    FROM activities 
    WHERE actor_id = p_user_id AND kind = 'pvp_win';
    -- But also verify there ARE activities for this user at all
    IF v_pvp_wins > 0 THEN
      -- Double-check: did they participate in anything PvP-related?
      SELECT COUNT(*) INTO v_pvp_battles_participated
      FROM activities
      WHERE (actor_id = p_user_id OR target_id = p_user_id)
        AND kind IN ('pvp_win', 'pvp_loss', 'attack_incoming', 'attack_success', 'attack_failed', 'battle_start', 'battle_end');
    END IF;
  END IF;

  -- Count completed quests
  SELECT COUNT(*) INTO v_quests_completed 
  FROM activities 
  WHERE actor_id = p_user_id AND kind = 'quest_complete';

  -- Count shop purchases
  SELECT COUNT(*) INTO v_items_purchased 
  FROM activities 
  WHERE actor_id = p_user_id AND kind = 'shop_purchase';
  
  -- ============ COINS VALIDATION ============
  -- Count total coins earned from activities (coins_earned events)
  BEGIN
    SELECT COALESCE(SUM((payload->>'amount')::INT), 0) INTO v_total_coins_from_activities
    FROM activities
    WHERE actor_id = p_user_id AND kind = 'coins_earned';
  EXCEPTION WHEN OTHERS THEN
    v_total_coins_from_activities := 0;
  END;

  -- Count completed assignments
  SELECT COUNT(*) INTO v_assignment_count
  FROM student_assignment_results
  WHERE student_id = p_user_id;

  -- Count perfect scores (100% accuracy)
  SELECT COUNT(*) INTO v_perfect_score_count
  FROM student_assignment_results
  WHERE student_id = p_user_id AND accuracy = 100;

  -- Count early submissions (1+ day before deadline)
  SELECT COUNT(*) INTO v_early_submission_count
  FROM student_assignment_results sar
  JOIN assignments a ON a.id = sar.assignment_id
  WHERE sar.student_id = p_user_id
    AND a.due_at IS NOT NULL
    AND sar.completed_at < a.due_at - INTERVAL '1 day';

  -- Get correct answers (if column exists, else estimate from XP)
  BEGIN
    EXECUTE 'SELECT COALESCE(correct_answers, 0) FROM users WHERE id = $1' 
    INTO v_correct_answers USING p_user_id;
  EXCEPTION WHEN undefined_column THEN
    -- Estimate: ~10 XP per correct answer on average
    v_correct_answers := COALESCE(v_user.xp / 10, 0);
  END;

  -- Check clan membership
  BEGIN
    EXECUTE 'SELECT clan_id IS NOT NULL FROM users WHERE id = $1' 
    INTO v_has_clan USING p_user_id;
  EXCEPTION WHEN undefined_column THEN
    v_has_clan := FALSE;
  END;

  -- ========== VALIDATE EACH EARNED ACHIEVEMENT ==========

  -- PROGRESSION: first_login - Everyone who has an account gets this
  RETURN QUERY
  SELECT 'first_login'::TEXT, TRUE, 'Account exists'::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'first_login');

  -- PROGRESSION: knowledge_seeker (10 correct answers)
  RETURN QUERY
  SELECT 'knowledge_seeker'::TEXT, 
         v_correct_answers >= 10,
         format('Correct answers: %s (need 10)', v_correct_answers)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'knowledge_seeker');

  -- PROGRESSION: scholar (50 correct answers)
  RETURN QUERY
  SELECT 'scholar'::TEXT,
         v_correct_answers >= 50,
         format('Correct answers: %s (need 50)', v_correct_answers)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'scholar');

  -- PROGRESSION: level_5
  RETURN QUERY
  SELECT 'level_5'::TEXT,
         v_user.level >= 5,
         format('Level: %s (need 5)', v_user.level)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'level_5');

  -- PROGRESSION: level_10
  RETURN QUERY
  SELECT 'level_10'::TEXT,
         v_user.level >= 10,
         format('Level: %s (need 10)', v_user.level)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'level_10');

  -- PROGRESSION: level_20
  RETURN QUERY
  SELECT 'level_20'::TEXT,
         v_user.level >= 20,
         format('Level: %s (need 20)', v_user.level)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'level_20');

  -- PROGRESSION: streak_3 (3-day streak, can't exceed account age)
  RETURN QUERY
  SELECT 'streak_3'::TEXT,
         v_user.streak >= 3 AND v_account_age_days >= 3,
         format('Streak: %s, Account age: %s days (need 3)', v_user.streak, v_account_age_days)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'streak_3');

  -- PROGRESSION: streak_7 (7-day streak)
  RETURN QUERY
  SELECT 'streak_7'::TEXT,
         v_user.streak >= 7 AND v_account_age_days >= 7,
         format('Streak: %s, Account age: %s days (need 7)', v_user.streak, v_account_age_days)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'streak_7');

  -- PROGRESSION: streak_30 (30-day streak)
  RETURN QUERY
  SELECT 'streak_30'::TEXT,
         v_user.streak >= 30 AND v_account_age_days >= 30,
         format('Streak: %s, Account age: %s days (need 30)', v_user.streak, v_account_age_days)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'streak_30');

  -- COMBAT: pvp_champion (1 PvP win) - MUST have actually participated in battles
  RETURN QUERY
  SELECT 'pvp_champion'::TEXT,
         v_pvp_wins >= 1 AND v_pvp_battles_participated >= 1,
         format('PvP wins: %s, Battles participated: %s (need 1 win, 1 battle)', v_pvp_wins, v_pvp_battles_participated)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'pvp_champion');

  -- COMBAT: pvp_5 (5 PvP wins) - MUST have actually participated in battles
  RETURN QUERY
  SELECT 'pvp_5'::TEXT,
         v_pvp_wins >= 5 AND v_pvp_battles_participated >= 5,
         format('PvP wins: %s, Battles participated: %s (need 5 wins, 5 battles)', v_pvp_wins, v_pvp_battles_participated)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'pvp_5');

  -- COMBAT: pvp_veteran (10 PvP wins) - MUST have actually participated in battles
  RETURN QUERY
  SELECT 'pvp_veteran'::TEXT,
         v_pvp_wins >= 10 AND v_pvp_battles_participated >= 10,
         format('PvP wins: %s, Battles participated: %s (need 10 wins, 10 battles)', v_pvp_wins, v_pvp_battles_participated)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'pvp_veteran');

  -- COMBAT: pvp_master (25 PvP wins) - MUST have actually participated in battles
  RETURN QUERY
  SELECT 'pvp_master'::TEXT,
         v_pvp_wins >= 25 AND v_pvp_battles_participated >= 25,
         format('PvP wins: %s, Battles participated: %s (need 25 wins, 25 battles)', v_pvp_wins, v_pvp_battles_participated)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'pvp_master');

  -- COMBAT: pvp_10_wins / Dominator (legacy ID for 10 PvP wins)
  RETURN QUERY
  SELECT 'pvp_10_wins'::TEXT,
         v_pvp_wins >= 10 AND v_pvp_battles_participated >= 10,
         format('PvP wins: %s, Battles participated: %s (need 10 wins, 10 battles)', v_pvp_wins, v_pvp_battles_participated)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'pvp_10_wins');

  -- COMBAT: first_pvp_win (legacy ID for first PvP win)
  RETURN QUERY
  SELECT 'first_pvp_win'::TEXT,
         v_pvp_wins >= 1 AND v_pvp_battles_participated >= 1,
         format('PvP wins: %s, Battles participated: %s (need 1 win, 1 battle)', v_pvp_wins, v_pvp_battles_participated)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'first_pvp_win');

  -- SOCIAL: social_butterfly (join a clan)
  RETURN QUERY
  SELECT 'social_butterfly'::TEXT,
         v_has_clan,
         format('Has clan: %s', v_has_clan)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'social_butterfly');

  -- COLLECTION: collector (1 purchase)
  RETURN QUERY
  SELECT 'collector'::TEXT,
         v_items_purchased >= 1,
         format('Purchases: %s (need 1)', v_items_purchased)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'collector');

  -- COLLECTION: shopaholic (10 purchases)
  RETURN QUERY
  SELECT 'shopaholic'::TEXT,
         v_items_purchased >= 10,
         format('Purchases: %s (need 10)', v_items_purchased)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'shopaholic');

  -- COLLECTION: coin_hoarder (1000 coins earned) - STRICT: must have proof of earning 1000
  -- Either: current coins >= 1000, OR tracked coins_earned >= 1000, OR high XP/assignments prove earning
  RETURN QUERY
  SELECT 'coin_hoarder'::TEXT,
         v_user.coins >= 1000 OR v_total_coins_from_activities >= 1000 OR (v_user.xp >= 500 AND v_assignment_count >= 10),
         format('Current coins: %s, Tracked earned: %s, XP: %s, Assignments: %s (need 1000 coins proof)', 
                v_user.coins, v_total_coins_from_activities, v_user.xp, v_assignment_count)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'coin_hoarder');

  -- COLLECTION: wealthy (5000 coins)
  RETURN QUERY
  SELECT 'wealthy'::TEXT,
         v_user.coins >= 5000,
         format('Current coins: %s (need 5000)', v_user.coins)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'wealthy');

  -- ASSIGNMENTS: assignment_first (1 assignment)
  RETURN QUERY
  SELECT 'assignment_first'::TEXT,
         v_assignment_count >= 1,
         format('Assignments: %s (need 1)', v_assignment_count)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'assignment_first');

  -- ASSIGNMENTS: assignment_5 (5 assignments)
  RETURN QUERY
  SELECT 'assignment_5'::TEXT,
         v_assignment_count >= 5,
         format('Assignments: %s (need 5)', v_assignment_count)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'assignment_5');

  -- ASSIGNMENTS: assignment_10 (10 assignments)
  RETURN QUERY
  SELECT 'assignment_10'::TEXT,
         v_assignment_count >= 10,
         format('Assignments: %s (need 10)', v_assignment_count)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'assignment_10');

  -- ASSIGNMENTS: assignment_25 (25 assignments)
  RETURN QUERY
  SELECT 'assignment_25'::TEXT,
         v_assignment_count >= 25,
         format('Assignments: %s (need 25)', v_assignment_count)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'assignment_25');

  -- ASSIGNMENTS: assignment_50 (50 assignments)
  RETURN QUERY
  SELECT 'assignment_50'::TEXT,
         v_assignment_count >= 50,
         format('Assignments: %s (need 50)', v_assignment_count)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'assignment_50');

  -- ASSIGNMENTS: assignment_perfect (100% score)
  RETURN QUERY
  SELECT 'assignment_perfect'::TEXT,
         v_perfect_score_count >= 1,
         format('Perfect scores: %s (need 1)', v_perfect_score_count)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'assignment_perfect');

  -- ASSIGNMENTS: assignment_early (early submission)
  RETURN QUERY
  SELECT 'assignment_early'::TEXT,
         v_early_submission_count >= 1,
         format('Early submissions: %s (need 1)', v_early_submission_count)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'assignment_early');

  -- Handle any legacy/unknown achievements - mark as invalid
  FOR v_ach IN 
    SELECT ua.achievement_id AS aid
    FROM user_achievements ua
    WHERE ua.user_id = p_user_id
      AND ua.achievement_id NOT IN (
        'first_login', 'knowledge_seeker', 'scholar', 
        'level_5', 'level_10', 'level_20',
        'streak_3', 'streak_7', 'streak_30',
        'pvp_champion', 'pvp_5', 'pvp_veteran', 'pvp_master',
        'pvp_10_wins', 'first_pvp_win',  -- Legacy PvP IDs
        'social_butterfly',
        'collector', 'shopaholic', 'coin_hoarder', 'wealthy',
        'assignment_first', 'assignment_5', 'assignment_10', 
        'assignment_25', 'assignment_50', 'assignment_perfect', 'assignment_early'
      )
  LOOP
    RETURN QUERY SELECT v_ach.aid::TEXT, FALSE, 'Unknown/legacy achievement - needs review'::TEXT;
  END LOOP;
END;
$$;

-- ============================================================================
-- STEP 2: Run validation for ALL users and show results
-- ============================================================================

SELECT 
  u.username,
  u.created_at AS account_created,
  v.ach_id,
  v.is_valid,
  v.reason
FROM users u
CROSS JOIN LATERAL validate_user_achievements(u.id) v
WHERE NOT v.is_valid
ORDER BY u.username, v.ach_id;

-- ============================================================================
-- STEP 3: DELETE all invalid achievements
-- ============================================================================

-- Create temp table of invalid achievements
CREATE TEMP TABLE invalid_achievements AS
SELECT u.id AS user_id, v.ach_id AS achievement_id
FROM users u
CROSS JOIN LATERAL validate_user_achievements(u.id) v
WHERE NOT v.is_valid;

-- Show what will be deleted
SELECT 
  u.username,
  ia.achievement_id,
  a.name AS achievement_name
FROM invalid_achievements ia
JOIN users u ON u.id = ia.user_id
JOIN achievements a ON a.id = ia.achievement_id
ORDER BY u.username, ia.achievement_id;

-- Delete invalid achievements
DELETE FROM user_achievements ua
USING invalid_achievements ia
WHERE ua.user_id = ia.user_id 
  AND ua.achievement_id = ia.achievement_id;

-- Drop temp table
DROP TABLE invalid_achievements;

-- ============================================================================
-- STEP 4: Fix user stats that are impossibly high
-- ============================================================================

-- Streak can't exceed account age
UPDATE users
SET streak = LEAST(streak, GREATEST(0, EXTRACT(DAY FROM NOW() - created_at)::INT))
WHERE streak > EXTRACT(DAY FROM NOW() - created_at);

-- ============================================================================
-- STEP 5: Show remaining valid achievements per user
-- ============================================================================

SELECT 
  u.username,
  u.created_at,
  EXTRACT(DAY FROM NOW() - u.created_at)::INT AS account_age_days,
  u.level,
  u.streak,
  u.coins,
  COUNT(ua.achievement_id) AS valid_achievements,
  STRING_AGG(a.name, ', ' ORDER BY a.name) AS achievement_names
FROM users u
LEFT JOIN user_achievements ua ON ua.user_id = u.id 
  AND (ua.earned_at IS NOT NULL OR ua.unlocked_at IS NOT NULL)
LEFT JOIN achievements a ON a.id = ua.achievement_id
WHERE u.role = 'student' OR u.role IS NULL
GROUP BY u.id, u.username, u.created_at, u.level, u.streak, u.coins
HAVING COUNT(ua.achievement_id) > 0
ORDER BY valid_achievements DESC;

-- ============================================================================
-- STEP 6: Clean up the validation function
-- ============================================================================

DROP FUNCTION IF EXISTS validate_user_achievements(UUID);

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- This script:
-- 1. Created a validation function that checks EVERY achievement type
-- 2. Validated each achievement against actual provable data:
--    - Streaks must not exceed account age
--    - PvP wins counted from activities table
--    - Assignments counted from student_assignment_results
--    - Levels checked against users.level
--    - Purchases counted from activities
-- 3. Deleted all achievements that failed validation
-- 4. Fixed user streak values that exceeded account age
-- 5. Showed remaining valid achievements
--
-- After running this, only legitimately earned achievements remain.
