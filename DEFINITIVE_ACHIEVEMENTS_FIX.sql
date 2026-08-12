-- ============================================================================
-- DEFINITIVE ACHIEVEMENTS FIX - CLEAN SLATE
-- ============================================================================
-- This script:
-- 1. DELETES all existing achievements
-- 2. DELETES all user_achievements  
-- 3. Creates ONE clean set of 25 achievements
-- 4. Re-awards only legitimate achievements based on real data
-- ============================================================================

-- ============================================================================
-- STEP 0: Add pvp_wins column to users table if missing
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS pvp_wins INTEGER DEFAULT 0;

-- Create RPC function to increment PvP wins
CREATE OR REPLACE FUNCTION increment_pvp_wins(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_wins INTEGER;
BEGIN
  UPDATE users 
  SET pvp_wins = COALESCE(pvp_wins, 0) + 1
  WHERE id = p_user_id
  RETURNING pvp_wins INTO v_new_wins;
  
  RETURN v_new_wins;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_pvp_wins(UUID) TO authenticated;

-- ============================================================================
-- STEP 0B: Credit existing PvP wins from pvp_score
-- ============================================================================
-- pvp_score = (wins * 3) + (losses * 1), so estimate wins as pvp_score / 3
-- This is a rough estimate to give credit for existing wins

UPDATE users 
SET pvp_wins = GREATEST(COALESCE(pvp_wins, 0), COALESCE(pvp_score / 3, 0))
WHERE pvp_score > 0;

-- ============================================================================
-- STEP 1: NUCLEAR OPTION - Delete everything and start fresh
-- ============================================================================

-- Delete ALL user achievements
DELETE FROM user_achievements;

-- Delete ALL achievements
DELETE FROM achievements;

-- ============================================================================
-- STEP 2: Ensure proper table structure
-- ============================================================================

ALTER TABLE achievements ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
ALTER TABLE achievements ADD COLUMN IF NOT EXISTS rarity TEXT DEFAULT 'common';
ALTER TABLE achievements ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 100;

DO $$ BEGIN
  ALTER TABLE achievements ALTER COLUMN condition_type DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE achievements ALTER COLUMN condition_value DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================================
-- STEP 3: Insert THE DEFINITIVE 25 achievements (NO DUPLICATES)
-- ============================================================================

INSERT INTO achievements (id, name, description, icon, category, rarity, condition_type, condition_value, reward_xp, reward_coins, points) 
VALUES 
  -- ==================== PROGRESSION (9) ====================
  ('first_login', 'First Steps', 'Welcome to Brains Heist! Complete your first login.', '🎮', 'progression', 'common', 'login_count', 1, 50, 25, 50),
  ('knowledge_seeker', 'Knowledge Seeker', 'Answer 10 questions correctly.', '📚', 'progression', 'common', 'correct_answers', 10, 100, 50, 100),
  ('scholar', 'Scholar', 'Answer 50 questions correctly.', '🎓', 'progression', 'rare', 'correct_answers', 50, 300, 150, 300),
  ('level_5', 'Rising Star', 'Reach level 5.', '⭐', 'progression', 'common', 'level', 5, 150, 75, 150),
  ('level_10', 'Expert', 'Reach level 10.', '💫', 'progression', 'rare', 'level', 10, 300, 150, 300),
  ('level_20', 'Master', 'Reach level 20.', '🌟', 'progression', 'epic', 'level', 20, 500, 250, 500),
  ('streak_3', 'Getting Warmed Up', 'Maintain a 3-day login streak.', '🔥', 'progression', 'common', 'streak', 3, 75, 35, 75),
  ('streak_7', 'Week Warrior', 'Maintain a 7-day login streak.', '🔥', 'progression', 'rare', 'streak', 7, 200, 100, 200),
  ('streak_30', 'Streak Legend', 'Maintain a 30-day login streak!', '🔥', 'progression', 'legendary', 'streak', 30, 1000, 500, 1000),
  
  -- ==================== COMBAT/PVP (4) - Using "Attack" terminology ====================
  ('pvp_first', 'First Strike', 'Win your first PvP attack.', '⚔️', 'combat', 'common', 'pvp_wins', 1, 100, 50, 100),
  ('pvp_5', 'Attacker', 'Win 5 PvP attacks.', '🗡️', 'combat', 'common', 'pvp_wins', 5, 150, 75, 150),
  ('pvp_10', 'Raider', 'Win 10 PvP attacks.', '🏆', 'combat', 'rare', 'pvp_wins', 10, 300, 150, 300),
  ('pvp_25', 'Warlord', 'Win 25 PvP attacks.', '👑', 'combat', 'epic', 'pvp_wins', 25, 500, 250, 500),
  
  -- ==================== SOCIAL (1) ====================
  ('clan_joined', 'Team Player', 'Join a clan.', '🦋', 'social', 'common', 'clan_member', 1, 100, 50, 100),
  
  -- ==================== COLLECTION (4) ====================
  ('shop_first', 'First Purchase', 'Buy your first item from the shop.', '🎁', 'collection', 'common', 'items_purchased', 1, 75, 35, 75),
  ('shop_10', 'Shopaholic', 'Buy 10 items from the shop.', '🛍️', 'collection', 'rare', 'items_purchased', 10, 200, 100, 200),
  ('coins_1000', 'Coin Collector', 'Have 1000 coins at once.', '💰', 'collection', 'rare', 'coins_balance', 1000, 200, 100, 200),
  ('coins_5000', 'Wealthy', 'Have 5000 coins at once.', '💎', 'collection', 'epic', 'coins_balance', 5000, 500, 250, 500),
  
  -- ==================== ASSIGNMENTS (7) ====================
  ('assignment_1', 'First Assignment', 'Complete your first assignment.', '📋', 'assignments', 'common', 'assignments_completed', 1, 50, 25, 50),
  ('assignment_5', 'Assignment Ace', 'Complete 5 assignments.', '🎯', 'assignments', 'common', 'assignments_completed', 5, 100, 50, 100),
  ('assignment_10', 'Homework Hero', 'Complete 10 assignments.', '📚', 'assignments', 'rare', 'assignments_completed', 10, 200, 100, 200),
  ('assignment_25', 'Dedicated Learner', 'Complete 25 assignments.', '🌟', 'assignments', 'epic', 'assignments_completed', 25, 500, 250, 500),
  ('assignment_50', 'Assignment Master', 'Complete 50 assignments.', '👑', 'assignments', 'legendary', 'assignments_completed', 50, 1000, 500, 1000),
  ('perfect_score', 'Perfectionist', 'Score 100% on any assignment.', '💯', 'assignments', 'rare', 'perfect_scores', 1, 150, 75, 150),
  ('early_bird', 'Early Bird', 'Submit an assignment 1+ day early.', '🐦', 'assignments', 'common', 'early_submissions', 1, 100, 50, 100);

-- Verify
SELECT 'Total achievements created:' AS status, COUNT(*) AS count FROM achievements;
SELECT category, COUNT(*) AS count FROM achievements GROUP BY category ORDER BY category;

-- ============================================================================
-- STEP 4: Create the DEFINITIVE achievement checking function
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_check_achievements(p_user_id UUID)
RETURNS TABLE(newly_earned JSONB) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_achievement RECORD;
  v_current_value INTEGER;
  v_newly_earned JSONB := '[]'::JSONB;
  v_achievement_json JSONB;
  -- User stats
  v_user_xp INTEGER;
  v_user_coins INTEGER;
  v_user_level INTEGER;
  v_user_streak INTEGER;
  v_user_created_at TIMESTAMPTZ;
  v_account_age_days INTEGER;
  v_username TEXT;
  v_clan_id UUID;
  -- Activity counts
  v_pvp_wins INTEGER := 0;
  v_items_purchased INTEGER := 0;
  v_assignments_completed INTEGER := 0;
  v_perfect_scores INTEGER := 0;
  v_early_submissions INTEGER := 0;
BEGIN
  -- Get user profile
  SELECT 
    COALESCE(xp, 0), COALESCE(coins, 0), COALESCE(level, 1), 
    COALESCE(streak, 0), username, created_at
  INTO v_user_xp, v_user_coins, v_user_level, v_user_streak, v_username, v_user_created_at
  FROM users WHERE id = p_user_id;
  
  IF v_username IS NULL THEN
    RETURN QUERY SELECT '[]'::JSONB;
    RETURN;
  END IF;

  -- Account age
  v_account_age_days := GREATEST(0, EXTRACT(DAY FROM NOW() - v_user_created_at)::INT);

  -- Get clan_id and pvp_wins directly from users table
  BEGIN
    EXECUTE 'SELECT clan_id, COALESCE(pvp_wins, 0) FROM users WHERE id = $1' 
    INTO v_clan_id, v_pvp_wins USING p_user_id;
  EXCEPTION WHEN OTHERS THEN
    v_clan_id := NULL;
    v_pvp_wins := 0;
  END;

  -- Count shop purchases
  SELECT COUNT(*) INTO v_items_purchased 
  FROM activities 
  WHERE actor_id = p_user_id AND kind = 'shop_purchase';

  -- Count completed assignments
  SELECT COUNT(*) INTO v_assignments_completed
  FROM student_assignment_results
  WHERE student_id = p_user_id;

  -- Count perfect scores
  SELECT COUNT(*) INTO v_perfect_scores
  FROM student_assignment_results
  WHERE student_id = p_user_id AND accuracy = 100;

  -- Count early submissions
  SELECT COUNT(*) INTO v_early_submissions
  FROM student_assignment_results sar
  JOIN assignments a ON a.id = sar.assignment_id
  WHERE sar.student_id = p_user_id
    AND a.due_at IS NOT NULL
    AND sar.completed_at < a.due_at - INTERVAL '1 day';

  -- Loop through all achievements
  FOR v_achievement IN SELECT * FROM achievements LOOP
    -- Skip if already earned
    IF EXISTS (
      SELECT 1 FROM user_achievements 
      WHERE user_id = p_user_id AND achievement_id = v_achievement.id
      AND (earned_at IS NOT NULL OR unlocked_at IS NOT NULL)
    ) THEN
      CONTINUE;
    END IF;

    -- Calculate current value based on condition_type
    v_current_value := 0;
    
    CASE v_achievement.condition_type
      -- Login
      WHEN 'login_count' THEN
        v_current_value := 1;
        
      -- Level
      WHEN 'level' THEN
        v_current_value := v_user_level;
        
      -- Streak (must be <= account age)
      WHEN 'streak' THEN
        IF v_account_age_days >= v_achievement.condition_value THEN
          v_current_value := v_user_streak;
        ELSE
          v_current_value := 0;
        END IF;
        
      -- PvP wins (must have real battles)
      WHEN 'pvp_wins' THEN
        v_current_value := v_pvp_wins;
        
      -- Coins (current balance)
      WHEN 'coins_balance' THEN
        v_current_value := v_user_coins;
        
      -- Clan membership
      WHEN 'clan_member' THEN
        v_current_value := CASE WHEN v_clan_id IS NOT NULL THEN 1 ELSE 0 END;
        
      -- Shop purchases
      WHEN 'items_purchased' THEN
        v_current_value := v_items_purchased;
        
      -- Assignments
      WHEN 'assignments_completed' THEN
        v_current_value := v_assignments_completed;
        
      -- Perfect scores
      WHEN 'perfect_scores' THEN
        v_current_value := v_perfect_scores;
        
      -- Early submissions
      WHEN 'early_submissions' THEN
        v_current_value := v_early_submissions;
        
      -- Correct answers
      WHEN 'correct_answers' THEN
        BEGIN
          EXECUTE 'SELECT COALESCE(correct_answers, 0) FROM users WHERE id = $1' 
          INTO v_current_value USING p_user_id;
        EXCEPTION WHEN OTHERS THEN
          v_current_value := 0;
        END;
        
      ELSE
        v_current_value := 0;
    END CASE;

    -- Award if condition met
    IF v_achievement.condition_value IS NOT NULL AND v_current_value >= v_achievement.condition_value THEN
      -- Insert earned achievement
      INSERT INTO user_achievements (user_id, achievement_id, earned_at, progress, target)
      VALUES (p_user_id, v_achievement.id, NOW(), v_current_value, v_achievement.condition_value)
      ON CONFLICT (user_id, achievement_id) DO UPDATE SET 
        earned_at = COALESCE(user_achievements.earned_at, NOW()),
        progress = EXCLUDED.progress;

      -- Build achievement JSON
      v_achievement_json := jsonb_build_object(
        'id', v_achievement.id,
        'name', v_achievement.name,
        'description', v_achievement.description,
        'icon', v_achievement.icon,
        'category', v_achievement.category,
        'rarity', v_achievement.rarity,
        'xp_reward', COALESCE(v_achievement.reward_xp, 0),
        'coin_reward', COALESCE(v_achievement.reward_coins, 0)
      );
      v_newly_earned := v_newly_earned || v_achievement_json;

      -- Award XP/coins
      UPDATE users 
      SET xp = xp + COALESCE(v_achievement.reward_xp, 0),
          coins = coins + COALESCE(v_achievement.reward_coins, 0)
      WHERE id = p_user_id;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_newly_earned;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_check_achievements(UUID) TO authenticated;

-- ============================================================================
-- STEP 5: Create assignment achievement checker
-- ============================================================================

CREATE OR REPLACE FUNCTION check_assignment_achievements(p_user_id UUID)
RETURNS TABLE (
  achievement_id TEXT,
  achievement_name TEXT,
  achievement_icon TEXT,
  xp_reward INT,
  coin_reward INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignments_completed INT;
  v_perfect_scores INT;
  v_early_submissions INT;
  v_achievement RECORD;
BEGIN
  -- Count assignments
  SELECT COUNT(*) INTO v_assignments_completed
  FROM student_assignment_results WHERE student_id = p_user_id;

  SELECT COUNT(*) INTO v_perfect_scores
  FROM student_assignment_results WHERE student_id = p_user_id AND accuracy = 100;

  SELECT COUNT(*) INTO v_early_submissions
  FROM student_assignment_results sar
  JOIN assignments a ON a.id = sar.assignment_id
  WHERE sar.student_id = p_user_id
    AND a.due_at IS NOT NULL
    AND sar.completed_at < a.due_at - INTERVAL '1 day';

  -- Check each assignment achievement
  FOR v_achievement IN 
    SELECT * FROM achievements 
    WHERE category = 'assignments'
  LOOP
    -- Skip if earned
    IF EXISTS (
      SELECT 1 FROM user_achievements 
      WHERE user_id = p_user_id AND user_achievements.achievement_id = v_achievement.id
      AND earned_at IS NOT NULL
    ) THEN
      CONTINUE;
    END IF;

    -- Check condition
    IF (v_achievement.condition_type = 'assignments_completed' AND v_assignments_completed >= v_achievement.condition_value) OR
       (v_achievement.condition_type = 'perfect_scores' AND v_perfect_scores >= v_achievement.condition_value) OR
       (v_achievement.condition_type = 'early_submissions' AND v_early_submissions >= v_achievement.condition_value) THEN
       
      -- Award achievement
      INSERT INTO user_achievements (user_id, achievement_id, earned_at, progress, target)
      VALUES (p_user_id, v_achievement.id, NOW(), v_achievement.condition_value, v_achievement.condition_value)
      ON CONFLICT (user_id, achievement_id) DO UPDATE SET earned_at = NOW();

      -- Award rewards
      UPDATE users 
      SET xp = xp + COALESCE(v_achievement.reward_xp, 0),
          coins = coins + COALESCE(v_achievement.reward_coins, 0)
      WHERE id = p_user_id;

      RETURN QUERY SELECT 
        v_achievement.id::TEXT,
        v_achievement.name::TEXT,
        v_achievement.icon::TEXT,
        COALESCE(v_achievement.reward_xp, 0)::INT,
        COALESCE(v_achievement.reward_coins, 0)::INT;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION check_assignment_achievements(UUID) TO authenticated;

-- ============================================================================
-- STEP 6: Award "First Steps" to all existing students
-- ============================================================================

INSERT INTO user_achievements (user_id, achievement_id, earned_at, progress, target)
SELECT u.id, 'first_login', u.created_at, 1, 1
FROM users u
WHERE (u.role = 'student' OR u.role IS NULL)
ON CONFLICT (user_id, achievement_id) DO NOTHING;

-- ============================================================================
-- STEP 7: Award PvP achievements based on users.pvp_wins
-- ============================================================================

-- First Strike (1 PvP win)
INSERT INTO user_achievements (user_id, achievement_id, earned_at, progress, target)
SELECT u.id, 'pvp_first', NOW(), u.pvp_wins, 1
FROM users u
WHERE u.pvp_wins >= 1 AND (u.role = 'student' OR u.role IS NULL)
ON CONFLICT (user_id, achievement_id) DO NOTHING;

-- Attacker (5 PvP wins)
INSERT INTO user_achievements (user_id, achievement_id, earned_at, progress, target)
SELECT u.id, 'pvp_5', NOW(), u.pvp_wins, 5
FROM users u
WHERE u.pvp_wins >= 5 AND (u.role = 'student' OR u.role IS NULL)
ON CONFLICT (user_id, achievement_id) DO NOTHING;

-- Raider (10 PvP wins)
INSERT INTO user_achievements (user_id, achievement_id, earned_at, progress, target)
SELECT u.id, 'pvp_10', NOW(), u.pvp_wins, 10
FROM users u
WHERE u.pvp_wins >= 10 AND (u.role = 'student' OR u.role IS NULL)
ON CONFLICT (user_id, achievement_id) DO NOTHING;

-- Warlord (25 PvP wins)
INSERT INTO user_achievements (user_id, achievement_id, earned_at, progress, target)
SELECT u.id, 'pvp_25', NOW(), u.pvp_wins, 25
FROM users u
WHERE u.pvp_wins >= 25 AND (u.role = 'student' OR u.role IS NULL)
ON CONFLICT (user_id, achievement_id) DO NOTHING;

-- ============================================================================
-- STEP 8: Award assignment achievements based on REAL data
-- ============================================================================

-- First Assignment (1 completed)
INSERT INTO user_achievements (user_id, achievement_id, earned_at, progress, target)
SELECT sar.student_id, 'assignment_1', MIN(sar.completed_at), 1, 1
FROM student_assignment_results sar
GROUP BY sar.student_id
HAVING COUNT(*) >= 1
ON CONFLICT (user_id, achievement_id) DO NOTHING;

-- Assignment Ace (5 completed)
INSERT INTO user_achievements (user_id, achievement_id, earned_at, progress, target)
SELECT sar.student_id, 'assignment_5', MAX(sar.completed_at), 5, 5
FROM student_assignment_results sar
GROUP BY sar.student_id
HAVING COUNT(*) >= 5
ON CONFLICT (user_id, achievement_id) DO NOTHING;

-- Perfect Score
INSERT INTO user_achievements (user_id, achievement_id, earned_at, progress, target)
SELECT sar.student_id, 'perfect_score', MIN(sar.completed_at), 1, 1
FROM student_assignment_results sar
WHERE sar.accuracy = 100
GROUP BY sar.student_id
ON CONFLICT (user_id, achievement_id) DO NOTHING;

-- Early Bird
INSERT INTO user_achievements (user_id, achievement_id, earned_at, progress, target)
SELECT sar.student_id, 'early_bird', MIN(sar.completed_at), 1, 1
FROM student_assignment_results sar
JOIN assignments a ON a.id = sar.assignment_id
WHERE a.due_at IS NOT NULL AND sar.completed_at < a.due_at - INTERVAL '1 day'
GROUP BY sar.student_id
ON CONFLICT (user_id, achievement_id) DO NOTHING;

-- ============================================================================
-- STEP 8: Show final state
-- ============================================================================

SELECT 'ACHIEVEMENTS TABLE:' AS info;
SELECT id, name, category, rarity, condition_type, condition_value 
FROM achievements ORDER BY category, condition_value NULLS LAST;

SELECT 'USER ACHIEVEMENTS:' AS info;
SELECT u.username, u.coins, u.xp, 
       COUNT(ua.achievement_id) AS earned_count,
       STRING_AGG(ua.achievement_id, ', ' ORDER BY ua.achievement_id) AS achievements
FROM users u
LEFT JOIN user_achievements ua ON ua.user_id = u.id AND ua.earned_at IS NOT NULL
WHERE u.role = 'student' OR u.role IS NULL
GROUP BY u.id, u.username, u.coins, u.xp
ORDER BY earned_count DESC;

-- ============================================================================
-- DONE!
-- ============================================================================
-- Clean slate with:
-- - 25 unique achievements (no duplicates)
-- - Consistent naming (PvP "Attack" not "Hack")
-- - Only REAL earned achievements restored
-- - Single source of truth
-- ============================================================================
