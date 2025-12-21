-- ============================================================================
-- FIX ACHIEVEMENT SYSTEM - Accurate Tracking & Categorization
-- ============================================================================
-- Issues Fixed:
-- 1. Achievements incorrectly marked as earned (checking row existence vs unlocked_at)
-- 2. Assignment achievements not counting correctly
-- 3. Missing category field in achievements table
-- ============================================================================

-- ============================================================================
-- FIX 1: Clean up incorrectly awarded achievements
-- ============================================================================
-- Delete user_achievements where unlocked_at AND earned_at are both NULL
-- These are "progress tracking" rows, not actually earned

DELETE FROM user_achievements
WHERE unlocked_at IS NULL AND earned_at IS NULL;

-- ============================================================================
-- FIX 2: Add category and rarity columns if missing
-- ============================================================================

DO $$
BEGIN
  -- Add category column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'achievements' AND column_name = 'category'
  ) THEN
    ALTER TABLE achievements ADD COLUMN category TEXT DEFAULT 'general';
    RAISE NOTICE 'Added category column to achievements';
  END IF;
  
  -- Add rarity column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'achievements' AND column_name = 'rarity'
  ) THEN
    ALTER TABLE achievements ADD COLUMN rarity TEXT DEFAULT 'common';
    RAISE NOTICE 'Added rarity column to achievements';
  END IF;
  
  -- Add points column if missing (alias for reward_xp in some schemas)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'achievements' AND column_name = 'points'
  ) THEN
    ALTER TABLE achievements ADD COLUMN points INTEGER DEFAULT 50;
    RAISE NOTICE 'Added points column to achievements';
  END IF;
END;
$$;

-- ============================================================================
-- FIX 3: Update existing achievements with proper categories
-- ============================================================================

-- Progression achievements
UPDATE achievements SET category = 'progression', rarity = 'common' 
WHERE condition_type IN ('login_count', 'correct_answers', 'total_xp') AND category IS NULL;

UPDATE achievements SET category = 'progression', rarity = 'common' 
WHERE id IN ('first_login', 'knowledge_seeker', 'scholar', 'level_5');

UPDATE achievements SET category = 'progression', rarity = 'rare' 
WHERE id IN ('level_10', 'streak_master');

-- Combat/PvP achievements
UPDATE achievements SET category = 'combat', rarity = 'common' 
WHERE condition_type IN ('pvp_wins_count', 'pvp_wins') AND category IS NULL;

UPDATE achievements SET category = 'combat', rarity = 'common' 
WHERE id = 'pvp_champion';

UPDATE achievements SET category = 'combat', rarity = 'rare' 
WHERE id = 'pvp_veteran';

-- Social achievements
UPDATE achievements SET category = 'social', rarity = 'common' 
WHERE condition_type IN ('clan_member', 'clan_joined') AND category IS NULL;

UPDATE achievements SET category = 'social', rarity = 'common' 
WHERE id = 'social_butterfly';

-- Collection/Shop achievements
UPDATE achievements SET category = 'collection', rarity = 'common' 
WHERE condition_type IN ('items_purchased', 'coins_earned', 'total_coins_earned') AND category IS NULL;

UPDATE achievements SET category = 'collection', rarity = 'common' 
WHERE id IN ('collector', 'coin_hoarder');

-- Assignment achievements (already have category = 'assignments')
UPDATE achievements SET rarity = 'common' 
WHERE id IN ('assignment_first', 'assignment_5', 'assignment_early');

UPDATE achievements SET rarity = 'rare' 
WHERE id IN ('assignment_10', 'assignment_perfect', 'assignment_streak_3');

UPDATE achievements SET rarity = 'epic' 
WHERE id IN ('assignment_25', 'assignment_50');

-- Set default for any remaining
UPDATE achievements SET category = 'general' WHERE category IS NULL;
UPDATE achievements SET rarity = 'common' WHERE rarity IS NULL;

-- ============================================================================
-- FIX 4: Insert comprehensive achievement set
-- ============================================================================

-- First, allow NULL for condition_type and condition_value (assignment achievements use separate logic)
ALTER TABLE achievements ALTER COLUMN condition_type DROP NOT NULL;
ALTER TABLE achievements ALTER COLUMN condition_value DROP NOT NULL;

-- Clear and re-insert achievements with proper data
INSERT INTO achievements (id, name, description, icon, category, rarity, condition_type, condition_value, reward_xp, reward_coins, points) 
VALUES 
  -- PROGRESSION CATEGORY
  ('first_login', 'First Steps', 'Welcome to Brain Heist! Complete your first login.', '🎮', 'progression', 'common', 'login_count', 1, 50, 25, 50),
  ('knowledge_seeker', 'Knowledge Seeker', 'Answer 10 questions correctly.', '📚', 'progression', 'common', 'correct_answers', 10, 100, 50, 100),
  ('scholar', 'Scholar', 'Answer 50 questions correctly.', '🎓', 'progression', 'rare', 'correct_answers', 50, 300, 150, 300),
  ('level_5', 'Rising Star', 'Reach level 5 through dedication.', '⭐', 'progression', 'common', 'level', 5, 150, 75, 150),
  ('level_10', 'Expert', 'Reach level 10 and prove your expertise.', '💫', 'progression', 'rare', 'level', 10, 300, 150, 300),
  ('level_20', 'Master', 'Reach level 20 - true mastery!', '🌟', 'progression', 'epic', 'level', 20, 500, 250, 500),
  ('streak_3', 'Getting Warmed Up', 'Build a 3-day login streak.', '🔥', 'progression', 'common', 'streak', 3, 75, 35, 75),
  ('streak_7', 'Week Warrior', 'Maintain a 7-day login streak.', '🔥', 'progression', 'rare', 'streak', 7, 200, 100, 200),
  ('streak_30', 'Streak Legend', 'Incredible 30-day login streak!', '🔥', 'progression', 'legendary', 'streak', 30, 1000, 500, 1000),
  
  -- COMBAT/PVP CATEGORY
  ('pvp_champion', 'First Blood', 'Win your first PvP battle!', '⚔️', 'combat', 'common', 'pvp_wins', 1, 100, 50, 100),
  ('pvp_5', 'Duelist', 'Win 5 PvP battles.', '🗡️', 'combat', 'common', 'pvp_wins', 5, 150, 75, 150),
  ('pvp_veteran', 'PvP Veteran', 'Win 10 PvP battles.', '🏆', 'combat', 'rare', 'pvp_wins', 10, 300, 150, 300),
  ('pvp_master', 'Arena Master', 'Win 25 PvP battles.', '👑', 'combat', 'epic', 'pvp_wins', 25, 500, 250, 500),
  
  -- SOCIAL CATEGORY
  ('social_butterfly', 'Social Butterfly', 'Join a clan and become part of a team.', '🦋', 'social', 'common', 'clan_joined', 1, 100, 50, 100),
  
  -- COLLECTION CATEGORY
  ('collector', 'Collector', 'Purchase your first item from the shop.', '🎁', 'collection', 'common', 'items_purchased', 1, 75, 35, 75),
  ('shopaholic', 'Shopaholic', 'Purchase 10 items from the shop.', '🛍️', 'collection', 'rare', 'items_purchased', 10, 200, 100, 200),
  ('coin_hoarder', 'Coin Hoarder', 'Accumulate 1000 coins total.', '💰', 'collection', 'rare', 'coins_earned', 1000, 200, 100, 200),
  ('wealthy', 'Wealthy', 'Accumulate 5000 coins total.', '💎', 'collection', 'epic', 'coins_earned', 5000, 500, 250, 500),
  
  -- ASSIGNMENT CATEGORY
  ('assignment_first', 'First Assignment', 'Complete your first teacher assignment.', '📋', 'assignments', 'common', NULL, NULL, 50, 25, 50),
  ('assignment_5', 'Assignment Ace', 'Complete 5 teacher assignments.', '🎯', 'assignments', 'common', NULL, NULL, 100, 50, 100),
  ('assignment_10', 'Homework Hero', 'Complete 10 teacher assignments.', '📚', 'assignments', 'rare', NULL, NULL, 200, 100, 200),
  ('assignment_25', 'Dedicated Learner', 'Complete 25 teacher assignments.', '🌟', 'assignments', 'epic', NULL, NULL, 500, 250, 500),
  ('assignment_50', 'Assignment Master', 'Complete 50 teacher assignments.', '👑', 'assignments', 'legendary', NULL, NULL, 1000, 500, 1000),
  ('assignment_perfect', 'Perfect Score', 'Score 100% on any assignment.', '💯', 'assignments', 'rare', NULL, NULL, 150, 75, 150),
  ('assignment_early', 'Early Bird', 'Complete an assignment 1+ day before deadline.', '🐦', 'assignments', 'common', NULL, NULL, 100, 50, 100)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  category = EXCLUDED.category,
  rarity = EXCLUDED.rarity,
  condition_type = EXCLUDED.condition_type,
  condition_value = EXCLUDED.condition_value,
  reward_xp = EXCLUDED.reward_xp,
  reward_coins = EXCLUDED.reward_coins,
  points = EXCLUDED.points;

-- ============================================================================
-- FIX 5: Fix check_assignment_achievements to NOT insert unless earned
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
  v_completed_count INT;
  v_perfect_count INT;
  v_early_count INT;
  v_newly_earned TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Count ACTUAL completed assignments from student_assignment_results
  SELECT COUNT(*) INTO v_completed_count
  FROM student_assignment_results
  WHERE student_id = p_user_id;

  -- Count perfect scores (accuracy = 100)
  SELECT COUNT(*) INTO v_perfect_count
  FROM student_assignment_results
  WHERE student_id = p_user_id AND accuracy = 100;

  -- Count early completions (completed at least 1 day before due date)
  SELECT COUNT(*) INTO v_early_count
  FROM student_assignment_results sar
  JOIN assignments a ON a.id = sar.assignment_id
  WHERE sar.student_id = p_user_id
    AND a.due_at IS NOT NULL
    AND sar.completed_at < a.due_at - INTERVAL '1 day';

  -- Award "First Assignment" (1 completion)
  IF v_completed_count >= 1 THEN
    IF NOT EXISTS (SELECT 1 FROM user_achievements WHERE user_id = p_user_id AND achievement_id = 'assignment_first' AND (earned_at IS NOT NULL OR unlocked_at IS NOT NULL)) THEN
      INSERT INTO user_achievements (user_id, achievement_id, progress, target, earned_at, unlocked_at)
      VALUES (p_user_id, 'assignment_first', 1, 1, NOW(), NOW())
      ON CONFLICT (user_id, achievement_id) DO UPDATE SET progress = 1, earned_at = NOW(), unlocked_at = NOW();
      v_newly_earned := array_append(v_newly_earned, 'assignment_first');
    END IF;
  END IF;

  -- Award "Assignment Ace" (5 completions)
  IF v_completed_count >= 5 THEN
    IF NOT EXISTS (SELECT 1 FROM user_achievements WHERE user_id = p_user_id AND achievement_id = 'assignment_5' AND (earned_at IS NOT NULL OR unlocked_at IS NOT NULL)) THEN
      INSERT INTO user_achievements (user_id, achievement_id, progress, target, earned_at, unlocked_at)
      VALUES (p_user_id, 'assignment_5', v_completed_count, 5, NOW(), NOW())
      ON CONFLICT (user_id, achievement_id) DO UPDATE SET progress = v_completed_count, earned_at = NOW(), unlocked_at = NOW();
      v_newly_earned := array_append(v_newly_earned, 'assignment_5');
    END IF;
  END IF;

  -- Award "Homework Hero" (10 completions)
  IF v_completed_count >= 10 THEN
    IF NOT EXISTS (SELECT 1 FROM user_achievements WHERE user_id = p_user_id AND achievement_id = 'assignment_10' AND (earned_at IS NOT NULL OR unlocked_at IS NOT NULL)) THEN
      INSERT INTO user_achievements (user_id, achievement_id, progress, target, earned_at, unlocked_at)
      VALUES (p_user_id, 'assignment_10', v_completed_count, 10, NOW(), NOW())
      ON CONFLICT (user_id, achievement_id) DO UPDATE SET progress = v_completed_count, earned_at = NOW(), unlocked_at = NOW();
      v_newly_earned := array_append(v_newly_earned, 'assignment_10');
    END IF;
  END IF;

  -- Award "Dedicated Learner" (25 completions)
  IF v_completed_count >= 25 THEN
    IF NOT EXISTS (SELECT 1 FROM user_achievements WHERE user_id = p_user_id AND achievement_id = 'assignment_25' AND (earned_at IS NOT NULL OR unlocked_at IS NOT NULL)) THEN
      INSERT INTO user_achievements (user_id, achievement_id, progress, target, earned_at, unlocked_at)
      VALUES (p_user_id, 'assignment_25', v_completed_count, 25, NOW(), NOW())
      ON CONFLICT (user_id, achievement_id) DO UPDATE SET progress = v_completed_count, earned_at = NOW(), unlocked_at = NOW();
      v_newly_earned := array_append(v_newly_earned, 'assignment_25');
    END IF;
  END IF;

  -- Award "Assignment Master" (50 completions)
  IF v_completed_count >= 50 THEN
    IF NOT EXISTS (SELECT 1 FROM user_achievements WHERE user_id = p_user_id AND achievement_id = 'assignment_50' AND (earned_at IS NOT NULL OR unlocked_at IS NOT NULL)) THEN
      INSERT INTO user_achievements (user_id, achievement_id, progress, target, earned_at, unlocked_at)
      VALUES (p_user_id, 'assignment_50', v_completed_count, 50, NOW(), NOW())
      ON CONFLICT (user_id, achievement_id) DO UPDATE SET progress = v_completed_count, earned_at = NOW(), unlocked_at = NOW();
      v_newly_earned := array_append(v_newly_earned, 'assignment_50');
    END IF;
  END IF;

  -- Award "Perfect Score" achievement
  IF v_perfect_count >= 1 THEN
    IF NOT EXISTS (SELECT 1 FROM user_achievements WHERE user_id = p_user_id AND achievement_id = 'assignment_perfect' AND (earned_at IS NOT NULL OR unlocked_at IS NOT NULL)) THEN
      INSERT INTO user_achievements (user_id, achievement_id, progress, target, earned_at, unlocked_at)
      VALUES (p_user_id, 'assignment_perfect', 1, 1, NOW(), NOW())
      ON CONFLICT (user_id, achievement_id) DO UPDATE SET progress = 1, earned_at = NOW(), unlocked_at = NOW();
      v_newly_earned := array_append(v_newly_earned, 'assignment_perfect');
    END IF;
  END IF;

  -- Award "Early Bird" achievement
  IF v_early_count >= 1 THEN
    IF NOT EXISTS (SELECT 1 FROM user_achievements WHERE user_id = p_user_id AND achievement_id = 'assignment_early' AND (earned_at IS NOT NULL OR unlocked_at IS NOT NULL)) THEN
      INSERT INTO user_achievements (user_id, achievement_id, progress, target, earned_at, unlocked_at)
      VALUES (p_user_id, 'assignment_early', 1, 1, NOW(), NOW())
      ON CONFLICT (user_id, achievement_id) DO UPDATE SET progress = 1, earned_at = NOW(), unlocked_at = NOW();
      v_newly_earned := array_append(v_newly_earned, 'assignment_early');
    END IF;
  END IF;

  -- Return newly unlocked achievements
  RETURN QUERY
  SELECT 
    a.id::TEXT,
    a.name::TEXT,
    a.icon::TEXT,
    COALESCE(a.reward_xp, a.points, 0)::INT AS xp_reward,
    COALESCE(a.reward_coins, a.points / 2, 0)::INT AS coin_reward
  FROM achievements a
  WHERE a.id = ANY(v_newly_earned);
END;
$$;

GRANT EXECUTE ON FUNCTION check_assignment_achievements(UUID) TO authenticated;

-- ============================================================================
-- FIX 6: Create RPC to get user's public achievements (for profile view)
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_get_user_achievements(p_user_id UUID)
RETURNS TABLE (
  achievement_id TEXT,
  name TEXT,
  description TEXT,
  icon TEXT,
  category TEXT,
  rarity TEXT,
  earned_at TIMESTAMPTZ,
  points INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    a.id::TEXT AS achievement_id,
    a.name::TEXT,
    a.description::TEXT,
    a.icon::TEXT,
    COALESCE(a.category, 'general')::TEXT AS category,
    COALESCE(a.rarity, 'common')::TEXT AS rarity,
    COALESCE(ua.earned_at, ua.unlocked_at) AS earned_at,
    COALESCE(a.points, a.reward_xp, 50)::INT AS points
  FROM user_achievements ua
  JOIN achievements a ON a.id = ua.achievement_id
  WHERE ua.user_id = p_user_id
    AND (ua.earned_at IS NOT NULL OR ua.unlocked_at IS NOT NULL)
  ORDER BY COALESCE(ua.earned_at, ua.unlocked_at) DESC;
$$;

GRANT EXECUTE ON FUNCTION rpc_get_user_achievements(UUID) TO authenticated;

-- ============================================================================
-- FIX 7: Update rpc_check_achievements to be more accurate
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_check_achievements(p_user_id UUID)
RETURNS TABLE(
  newly_earned JSONB
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_achievement RECORD;
  v_current_value INTEGER;
  v_newly_earned JSONB := '[]'::JSONB;
  v_achievement_json JSONB;
  v_user_xp INTEGER;
  v_user_coins INTEGER;
  v_user_level INTEGER;
  v_user_streak INTEGER;
  v_user_correct_answers INTEGER;
  v_user_clan_id UUID;
  v_username TEXT;
  v_pvp_wins INTEGER;
  v_quests_completed INTEGER;
  v_items_purchased INTEGER;
BEGIN
  -- Get user profile - fetch only columns that definitely exist
  SELECT 
    COALESCE(xp, 0),
    COALESCE(coins, 0),
    COALESCE(level, 1),
    COALESCE(streak, 0),
    username
  INTO v_user_xp, v_user_coins, v_user_level, v_user_streak, v_username
  FROM users WHERE id = p_user_id;
  
  IF v_username IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Try to get optional columns that may not exist
  BEGIN
    EXECUTE 'SELECT correct_answers FROM users WHERE id = $1' INTO v_user_correct_answers USING p_user_id;
  EXCEPTION WHEN undefined_column THEN
    v_user_correct_answers := 0;
  END;

  BEGIN
    EXECUTE 'SELECT clan_id FROM users WHERE id = $1' INTO v_user_clan_id USING p_user_id;
  EXCEPTION WHEN undefined_column THEN
    v_user_clan_id := NULL;
  END;

  -- Count PvP wins
  BEGIN
    SELECT COUNT(*) INTO v_pvp_wins 
    FROM activities 
    WHERE actor_id = p_user_id AND kind = 'pvp_win';
  EXCEPTION WHEN OTHERS THEN
    v_pvp_wins := 0;
  END;

  -- Count completed quests
  BEGIN
    SELECT COUNT(*) INTO v_quests_completed 
    FROM activities 
    WHERE actor_id = p_user_id AND kind = 'quest_complete';
  EXCEPTION WHEN OTHERS THEN
    v_quests_completed := 0;
  END;

  -- Count items purchased
  BEGIN
    SELECT COUNT(*) INTO v_items_purchased 
    FROM activities 
    WHERE actor_id = p_user_id AND kind = 'shop_purchase';
  EXCEPTION WHEN OTHERS THEN
    v_items_purchased := 0;
  END;

  -- Loop through achievements that have conditions (skip assignment achievements - handled separately)
  FOR v_achievement IN 
    SELECT * FROM achievements 
    WHERE condition_type IS NOT NULL 
      AND condition_value IS NOT NULL
      AND COALESCE(category, 'general') != 'assignments'
  LOOP
    -- Skip if already earned (check for actual earned timestamp)
    IF EXISTS (
      SELECT 1 FROM user_achievements 
      WHERE user_id = p_user_id 
        AND achievement_id = v_achievement.id
        AND (earned_at IS NOT NULL OR unlocked_at IS NOT NULL)
    ) THEN
      CONTINUE;
    END IF;

    -- Check condition
    v_current_value := 0;
    CASE v_achievement.condition_type
      WHEN 'pvp_wins_count', 'pvp_wins' THEN
        v_current_value := v_pvp_wins;
      WHEN 'total_xp' THEN
        v_current_value := v_user_xp;
      WHEN 'quests_completed' THEN
        v_current_value := v_quests_completed;
      WHEN 'coins_earned', 'total_coins_earned' THEN
        v_current_value := v_user_coins;
      WHEN 'items_purchased' THEN
        v_current_value := v_items_purchased;
      WHEN 'clan_member', 'clan_joined' THEN
        v_current_value := CASE WHEN v_user_clan_id IS NOT NULL THEN 1 ELSE 0 END;
      WHEN 'level' THEN
        v_current_value := v_user_level;
      WHEN 'login_count' THEN
        v_current_value := 1;
      WHEN 'streak' THEN
        v_current_value := v_user_streak;
      WHEN 'correct_answers' THEN
        v_current_value := COALESCE(v_user_correct_answers, 0);
      ELSE
        v_current_value := 0;
    END CASE;

    -- Grant achievement ONLY if condition is actually met
    IF v_current_value >= v_achievement.condition_value THEN
      INSERT INTO user_achievements (user_id, achievement_id, progress, target, earned_at, unlocked_at)
      VALUES (p_user_id, v_achievement.id, v_current_value, v_achievement.condition_value, NOW(), NOW())
      ON CONFLICT (user_id, achievement_id) DO UPDATE SET
        earned_at = NOW(),
        unlocked_at = NOW(),
        progress = v_current_value;

      -- Grant rewards
      UPDATE users
      SET 
        xp = xp + COALESCE(v_achievement.reward_xp, v_achievement.points, 0),
        coins = coins + COALESCE(v_achievement.reward_coins, v_achievement.points / 2, 0)
      WHERE id = p_user_id;

      -- Log activity
      BEGIN
        INSERT INTO activities (kind, actor_id, actor_username, data)
        VALUES (
          'achievement_earned',
          p_user_id,
          v_username,
          jsonb_build_object(
            'achievement_id', v_achievement.id,
            'achievement_name', v_achievement.name,
            'achievement_icon', v_achievement.icon,
            'reward_xp', COALESCE(v_achievement.reward_xp, v_achievement.points, 0),
            'reward_coins', COALESCE(v_achievement.reward_coins, v_achievement.points / 2, 0)
          )
        );
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;

      -- Add to newly earned list
      v_achievement_json := jsonb_build_object(
        'id', v_achievement.id,
        'name', v_achievement.name,
        'description', v_achievement.description,
        'icon', v_achievement.icon,
        'category', COALESCE(v_achievement.category, 'general'),
        'rarity', COALESCE(v_achievement.rarity, 'common'),
        'reward_xp', COALESCE(v_achievement.reward_xp, v_achievement.points, 0),
        'reward_coins', COALESCE(v_achievement.reward_coins, v_achievement.points / 2, 0)
      );
      v_newly_earned := v_newly_earned || v_achievement_json;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_newly_earned;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_check_achievements(UUID) TO authenticated;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Check achievements by category
SELECT category, COUNT(*) as count, array_agg(id) as achievement_ids
FROM achievements
GROUP BY category
ORDER BY category;

-- Check earned achievements (should only show ones with timestamps)
SELECT ua.user_id, ua.achievement_id, ua.earned_at, ua.unlocked_at, a.name
FROM user_achievements ua
JOIN achievements a ON a.id = ua.achievement_id
WHERE ua.earned_at IS NOT NULL OR ua.unlocked_at IS NOT NULL
LIMIT 20;

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- ✓ Cleaned up incorrectly awarded achievements (no timestamp = not earned)
-- ✓ Added category and rarity columns to achievements
-- ✓ Created comprehensive achievement set with proper categories
-- ✓ Fixed check_assignment_achievements to only insert when ACTUALLY earned
-- ✓ Created rpc_get_user_achievements for profile display
-- ✓ Updated rpc_check_achievements to be more accurate
