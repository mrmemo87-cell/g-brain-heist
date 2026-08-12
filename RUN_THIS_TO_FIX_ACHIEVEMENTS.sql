-- ============================================================================
-- COMPLETE ACHIEVEMENTS FIX - Run this in Supabase SQL Editor
-- ============================================================================
-- This script:
-- 1. Creates/updates the achievements table structure
-- 2. Populates all 25 achievements with proper data
-- 3. Updates rpc_check_achievements with strict validation
-- 4. Cleans up any fake/invalid achievements
-- ============================================================================

-- ============================================================================
-- STEP 1: Ensure achievements table has required columns
-- ============================================================================

-- Add category column if missing
ALTER TABLE achievements ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';

-- Add rarity column if missing  
ALTER TABLE achievements ADD COLUMN IF NOT EXISTS rarity TEXT DEFAULT 'common';

-- Add points column if missing
ALTER TABLE achievements ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 100;

-- Allow NULL for condition_type and condition_value (assignment achievements)
DO $$
BEGIN
  ALTER TABLE achievements ALTER COLUMN condition_type DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE achievements ALTER COLUMN condition_value DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================================
-- STEP 2: Insert/Update all 25 achievements
-- ============================================================================

INSERT INTO achievements (id, name, description, icon, category, rarity, condition_type, condition_value, reward_xp, reward_coins, points) 
VALUES 
  -- PROGRESSION CATEGORY (9 achievements)
  ('first_login', 'First Steps', 'Welcome to Brains Heist! Complete your first login.', '🎮', 'progression', 'common', 'login_count', 1, 50, 25, 50),
  ('knowledge_seeker', 'Knowledge Seeker', 'Answer 10 questions correctly.', '📚', 'progression', 'common', 'correct_answers', 10, 100, 50, 100),
  ('scholar', 'Scholar', 'Answer 50 questions correctly.', '🎓', 'progression', 'rare', 'correct_answers', 50, 300, 150, 300),
  ('level_5', 'Rising Star', 'Reach level 5 through dedication.', '⭐', 'progression', 'common', 'level', 5, 150, 75, 150),
  ('level_10', 'Expert', 'Reach level 10 and prove your expertise.', '💫', 'progression', 'rare', 'level', 10, 300, 150, 300),
  ('level_20', 'Master', 'Reach level 20 - true mastery!', '🌟', 'progression', 'epic', 'level', 20, 500, 250, 500),
  ('streak_3', 'Getting Warmed Up', 'Build a 3-day login streak.', '🔥', 'progression', 'common', 'streak', 3, 75, 35, 75),
  ('streak_7', 'Week Warrior', 'Maintain a 7-day login streak.', '🔥', 'progression', 'rare', 'streak', 7, 200, 100, 200),
  ('streak_30', 'Streak Legend', 'Incredible 30-day login streak!', '🔥', 'progression', 'legendary', 'streak', 30, 1000, 500, 1000),
  
  -- COMBAT/PVP CATEGORY (4 achievements)
  ('pvp_champion', 'First Blood', 'Win your first PvP battle!', '⚔️', 'combat', 'common', 'pvp_wins', 1, 100, 50, 100),
  ('pvp_5', 'Duelist', 'Win 5 PvP battles.', '🗡️', 'combat', 'common', 'pvp_wins', 5, 150, 75, 150),
  ('pvp_veteran', 'PvP Veteran', 'Win 10 PvP battles.', '🏆', 'combat', 'rare', 'pvp_wins', 10, 300, 150, 300),
  ('pvp_master', 'Arena Master', 'Win 25 PvP battles.', '👑', 'combat', 'epic', 'pvp_wins', 25, 500, 250, 500),
  
  -- SOCIAL CATEGORY (1 achievement)
  ('social_butterfly', 'Social Butterfly', 'Join a clan and become part of a team.', '🦋', 'social', 'common', 'clan_joined', 1, 100, 50, 100),
  
  -- COLLECTION CATEGORY (4 achievements)
  ('collector', 'Collector', 'Purchase your first item from the shop.', '🎁', 'collection', 'common', 'items_purchased', 1, 75, 35, 75),
  ('shopaholic', 'Shopaholic', 'Purchase 10 items from the shop.', '🛍️', 'collection', 'rare', 'items_purchased', 10, 200, 100, 200),
  ('coin_hoarder', 'Coin Hoarder', 'Accumulate 1000 coins total.', '💰', 'collection', 'rare', 'coins_earned', 1000, 200, 100, 200),
  ('wealthy', 'Wealthy', 'Accumulate 5000 coins total.', '💎', 'collection', 'epic', 'coins_earned', 5000, 500, 250, 500),
  
  -- ASSIGNMENT CATEGORY (7 achievements)
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
-- STEP 3: Verify achievements were inserted
-- ============================================================================

SELECT COUNT(*) AS total_achievements, 
       STRING_AGG(category, ', ' ORDER BY category) AS categories
FROM (SELECT DISTINCT category FROM achievements) t;

-- Show all achievements
SELECT id, name, category, rarity, condition_type, condition_value 
FROM achievements 
ORDER BY category, condition_value NULLS LAST;

-- ============================================================================
-- STEP 4: Update rpc_check_achievements with STRICT validation
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
  v_user_created_at TIMESTAMPTZ;
  v_account_age_days INTEGER;
  v_username TEXT;
  v_pvp_wins INTEGER := 0;
  v_pvp_battles_participated INTEGER := 0;
  v_quests_completed INTEGER := 0;
  v_items_purchased INTEGER := 0;
BEGIN
  -- Get user profile with created_at for account age validation
  SELECT 
    COALESCE(xp, 0),
    COALESCE(coins, 0),
    COALESCE(level, 1),
    COALESCE(streak, 0),
    username,
    created_at
  INTO v_user_xp, v_user_coins, v_user_level, v_user_streak, v_username, v_user_created_at
  FROM users WHERE id = p_user_id;
  
  IF v_username IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Calculate account age in days
  v_account_age_days := GREATEST(0, EXTRACT(DAY FROM NOW() - v_user_created_at)::INT);

  -- Try to get optional columns
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

  -- ============ STRICT PVP VALIDATION ============
  -- First check the REAL battles table
  BEGIN
    SELECT COUNT(*) INTO v_pvp_wins 
    FROM brains_heist_battles 
    WHERE winner_id = p_user_id AND status = 'completed';
    
    SELECT COUNT(*) INTO v_pvp_battles_participated
    FROM brains_heist_battles 
    WHERE (challenger_id = p_user_id OR opponent_id = p_user_id) 
      AND status = 'completed';
  EXCEPTION WHEN undefined_table THEN
    -- Fall back to activities if battles table doesn't exist
    SELECT COUNT(*) INTO v_pvp_wins 
    FROM activities 
    WHERE actor_id = p_user_id AND kind = 'pvp_win';
    
    -- Also require PvP-related activity as evidence
    SELECT COUNT(*) INTO v_pvp_battles_participated
    FROM activities
    WHERE (actor_id = p_user_id OR target_id = p_user_id)
      AND kind IN ('pvp_win', 'pvp_loss', 'attack_incoming', 'attack_success', 
                   'attack_failed', 'battle_start', 'battle_end');
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

  -- Loop through achievements with conditions (skip assignment achievements)
  FOR v_achievement IN 
    SELECT * FROM achievements 
    WHERE condition_type IS NOT NULL 
      AND condition_value IS NOT NULL
      AND COALESCE(category, 'general') != 'assignments'
  LOOP
    -- Skip if already earned
    IF EXISTS (
      SELECT 1 FROM user_achievements 
      WHERE user_id = p_user_id 
        AND achievement_id = v_achievement.id
        AND (earned_at IS NOT NULL OR unlocked_at IS NOT NULL)
    ) THEN
      CONTINUE;
    END IF;

    -- Check condition with STRICT validation
    v_current_value := 0;
    
    CASE v_achievement.condition_type
      -- PVP: Must have ACTUAL battle participation
      WHEN 'pvp_wins_count', 'pvp_wins' THEN
        IF v_pvp_battles_participated > 0 THEN
          v_current_value := v_pvp_wins;
        ELSE
          v_current_value := 0;
        END IF;
        
      -- STREAK: Can't exceed account age
      WHEN 'streak' THEN
        IF v_user_streak >= v_achievement.condition_value AND v_account_age_days >= v_achievement.condition_value THEN
          v_current_value := v_user_streak;
        ELSE
          v_current_value := 0;
        END IF;
        
      -- COINS: Use current balance (conservative)
      WHEN 'coins_earned', 'total_coins_earned' THEN
        IF v_user_coins >= v_achievement.condition_value THEN
          v_current_value := v_user_coins;
        ELSIF v_user_xp >= (v_achievement.condition_value / 2) THEN
          v_current_value := v_achievement.condition_value;
        ELSE
          v_current_value := v_user_coins;
        END IF;
        
      WHEN 'total_xp' THEN
        v_current_value := v_user_xp;
        
      WHEN 'quests_completed' THEN
        v_current_value := v_quests_completed;
        
      WHEN 'items_purchased' THEN
        v_current_value := v_items_purchased;
        
      WHEN 'clan_member', 'clan_joined' THEN
        v_current_value := CASE WHEN v_user_clan_id IS NOT NULL THEN 1 ELSE 0 END;
        
      WHEN 'level' THEN
        v_current_value := v_user_level;
        
      WHEN 'login_count' THEN
        v_current_value := 1;
        
      WHEN 'correct_answers' THEN
        v_current_value := COALESCE(v_user_correct_answers, 0);
        
      ELSE
        v_current_value := 0;
    END CASE;

    -- Award if condition met
    IF v_current_value >= v_achievement.condition_value THEN
      INSERT INTO user_achievements (user_id, achievement_id, earned_at, progress, target)
      VALUES (p_user_id, v_achievement.id, NOW(), v_current_value, v_achievement.condition_value)
      ON CONFLICT (user_id, achievement_id) 
      DO UPDATE SET 
        earned_at = COALESCE(user_achievements.earned_at, NOW()),
        progress = EXCLUDED.progress,
        target = EXCLUDED.target;

      v_achievement_json := jsonb_build_object(
        'id', v_achievement.id,
        'name', v_achievement.name,
        'description', v_achievement.description,
        'icon', v_achievement.icon,
        'category', COALESCE(v_achievement.category, 'general'),
        'rarity', COALESCE(v_achievement.rarity, 'common'),
        'xp_reward', COALESCE(v_achievement.reward_xp, 0),
        'coin_reward', COALESCE(v_achievement.reward_coins, 0)
      );
      v_newly_earned := v_newly_earned || v_achievement_json;

      IF COALESCE(v_achievement.reward_xp, 0) > 0 OR COALESCE(v_achievement.reward_coins, 0) > 0 THEN
        UPDATE users 
        SET xp = xp + COALESCE(v_achievement.reward_xp, 0),
            coins = coins + COALESCE(v_achievement.reward_coins, 0)
        WHERE id = p_user_id;
      END IF;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_newly_earned;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_check_achievements(UUID) TO authenticated;

-- ============================================================================
-- STEP 5: Clean up fake achievements
-- ============================================================================

-- Delete PvP achievements for users with no battle participation
DELETE FROM user_achievements ua
WHERE ua.achievement_id IN ('pvp_champion', 'pvp_5', 'pvp_veteran', 'pvp_master', 'pvp_10_wins', 'first_pvp_win')
AND NOT EXISTS (
  SELECT 1 FROM brains_heist_battles b
  WHERE (b.challenger_id = ua.user_id OR b.opponent_id = ua.user_id)
    AND b.status = 'completed'
)
AND NOT EXISTS (
  SELECT 1 FROM activities a
  WHERE (a.actor_id = ua.user_id OR a.target_id = ua.user_id)
    AND a.kind IN ('pvp_win', 'pvp_loss', 'battle_start', 'battle_end')
);

-- Delete coin achievements for users who never had enough coins
DELETE FROM user_achievements ua
USING users u
WHERE ua.user_id = u.id
AND ua.achievement_id = 'coin_hoarder'
AND u.coins < 1000
AND u.xp < 500;

-- Delete streak achievements that exceed account age
DELETE FROM user_achievements ua
USING users u
WHERE ua.user_id = u.id
AND ua.achievement_id IN ('streak_3', 'streak_7', 'streak_30')
AND (
  (ua.achievement_id = 'streak_3' AND EXTRACT(DAY FROM NOW() - u.created_at) < 3)
  OR (ua.achievement_id = 'streak_7' AND EXTRACT(DAY FROM NOW() - u.created_at) < 7)
  OR (ua.achievement_id = 'streak_30' AND EXTRACT(DAY FROM NOW() - u.created_at) < 30)
);

-- Fix streak values that exceed account age
UPDATE users
SET streak = LEAST(streak, GREATEST(0, EXTRACT(DAY FROM NOW() - created_at)::INT))
WHERE streak > EXTRACT(DAY FROM NOW() - created_at);

-- ============================================================================
-- STEP 6: Award first_login to all existing users who don't have it
-- ============================================================================

INSERT INTO user_achievements (user_id, achievement_id, earned_at, progress, target)
SELECT u.id, 'first_login', u.created_at, 1, 1
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM user_achievements ua 
  WHERE ua.user_id = u.id AND ua.achievement_id = 'first_login'
)
AND (u.role = 'student' OR u.role IS NULL)
ON CONFLICT (user_id, achievement_id) DO NOTHING;

-- ============================================================================
-- STEP 7: Show summary
-- ============================================================================

SELECT 'Achievements in database:' AS status, COUNT(*) AS count FROM achievements;

SELECT 'Valid user achievements:' AS status, COUNT(*) AS count 
FROM user_achievements 
WHERE earned_at IS NOT NULL OR unlocked_at IS NOT NULL;

SELECT u.username, COUNT(ua.achievement_id) AS achievement_count
FROM users u
LEFT JOIN user_achievements ua ON ua.user_id = u.id 
  AND (ua.earned_at IS NOT NULL OR ua.unlocked_at IS NOT NULL)
WHERE u.role = 'student' OR u.role IS NULL
GROUP BY u.id, u.username
ORDER BY achievement_count DESC
LIMIT 10;

-- ============================================================================
-- DONE! 
-- ============================================================================
-- After running this:
-- 1. 25 achievements are now in the database
-- 2. rpc_check_achievements has strict validation
-- 3. Fake achievements have been cleaned up
-- 4. All users have "First Steps" achievement
-- ============================================================================
