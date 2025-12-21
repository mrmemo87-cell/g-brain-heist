-- ============================================================================
-- ADD EARNINGS TRACKING COLUMNS
-- ============================================================================
-- Track coins and XP earned from different sources:
-- - Achievements
-- - PvP Wins  
-- - Assignments
-- - Quests (MCQ questions)
-- ============================================================================

-- Add tracking columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS coins_from_achievements INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS xp_from_achievements INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS coins_from_pvp INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS xp_from_pvp INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS coins_from_assignments INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS xp_from_assignments INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS coins_from_quests INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS xp_from_quests INTEGER DEFAULT 0;

-- ============================================================================
-- Update rpc_hack_attempt to track PvP earnings
-- ============================================================================
-- Note: This update is already in supabase-functions/rpc_hack_attempt.sql
-- Run that file OR uncomment this if you need to update the function:
/*
-- When attacker wins, update:
UPDATE public.users
SET xp = xp + xp_delta,
    coins = coins + coins_delta,
    xp_from_pvp = COALESCE(xp_from_pvp, 0) + GREATEST(0, xp_delta),
    coins_from_pvp = COALESCE(coins_from_pvp, 0) + GREATEST(0, coins_delta)
WHERE id = v_attacker_id;
*/

-- ============================================================================
-- Update rpc_check_achievements to track achievement earnings
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
      WHEN 'login_count' THEN
        v_current_value := 1;
      WHEN 'level' THEN
        v_current_value := v_user_level;
      WHEN 'streak' THEN
        IF v_account_age_days >= v_achievement.condition_value THEN
          v_current_value := v_user_streak;
        ELSE
          v_current_value := 0;
        END IF;
      WHEN 'pvp_wins' THEN
        v_current_value := v_pvp_wins;
      WHEN 'coins_balance' THEN
        v_current_value := v_user_coins;
      WHEN 'clan_member' THEN
        v_current_value := CASE WHEN v_clan_id IS NOT NULL THEN 1 ELSE 0 END;
      WHEN 'items_purchased' THEN
        v_current_value := v_items_purchased;
      WHEN 'assignments_completed' THEN
        v_current_value := v_assignments_completed;
      WHEN 'perfect_scores' THEN
        v_current_value := v_perfect_scores;
      WHEN 'early_submissions' THEN
        v_current_value := v_early_submissions;
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

      -- Award XP/coins AND track source
      UPDATE users 
      SET xp = xp + COALESCE(v_achievement.reward_xp, 0),
          coins = coins + COALESCE(v_achievement.reward_coins, 0),
          xp_from_achievements = COALESCE(xp_from_achievements, 0) + COALESCE(v_achievement.reward_xp, 0),
          coins_from_achievements = COALESCE(coins_from_achievements, 0) + COALESCE(v_achievement.reward_coins, 0)
      WHERE id = p_user_id;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_newly_earned;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_check_achievements(UUID) TO authenticated;

-- ============================================================================
-- Create function to track PvP earnings
-- ============================================================================

CREATE OR REPLACE FUNCTION track_pvp_earnings(
  p_user_id UUID,
  p_xp_delta INTEGER,
  p_coins_delta INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE users 
  SET xp_from_pvp = COALESCE(xp_from_pvp, 0) + GREATEST(0, p_xp_delta),
      coins_from_pvp = COALESCE(coins_from_pvp, 0) + GREATEST(0, p_coins_delta)
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION track_pvp_earnings(UUID, INTEGER, INTEGER) TO authenticated;

-- ============================================================================
-- Create function to track assignment earnings
-- ============================================================================

CREATE OR REPLACE FUNCTION track_assignment_earnings(
  p_user_id UUID,
  p_xp_delta INTEGER,
  p_coins_delta INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE users 
  SET xp_from_assignments = COALESCE(xp_from_assignments, 0) + GREATEST(0, p_xp_delta),
      coins_from_assignments = COALESCE(coins_from_assignments, 0) + GREATEST(0, p_coins_delta)
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION track_assignment_earnings(UUID, INTEGER, INTEGER) TO authenticated;

-- ============================================================================
-- Create function to track quest/MCQ earnings
-- ============================================================================

CREATE OR REPLACE FUNCTION track_quest_earnings(
  p_user_id UUID,
  p_xp_delta INTEGER,
  p_coins_delta INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE users 
  SET xp_from_quests = COALESCE(xp_from_quests, 0) + GREATEST(0, p_xp_delta),
      coins_from_quests = COALESCE(coins_from_quests, 0) + GREATEST(0, p_coins_delta)
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION track_quest_earnings(UUID, INTEGER, INTEGER) TO authenticated;

-- ============================================================================
-- DONE!
-- ============================================================================
-- New tracking columns added:
-- - coins_from_achievements, xp_from_achievements
-- - coins_from_pvp, xp_from_pvp  
-- - coins_from_assignments, xp_from_assignments
-- - coins_from_quests, xp_from_quests
--
-- These will accumulate as users earn rewards from each source.
-- ============================================================================
