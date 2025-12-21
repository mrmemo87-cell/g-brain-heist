-- ============================================================================
-- FIX FAKE ACHIEVEMENTS - Comprehensive Fix & Prevention
-- ============================================================================
-- This script:
-- 1. Updates rpc_check_achievements to PREVENT awarding fake achievements
-- 2. Cleans up all incorrectly awarded achievements
-- ============================================================================

-- ============================================================================
-- STEP 1: Update rpc_check_achievements with STRICT validation
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
    
    -- Also require some PvP-related activity as evidence
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
      -- PVP: Must have ACTUAL battle participation, not just activity records
      WHEN 'pvp_wins_count', 'pvp_wins' THEN
        -- Only count if they actually participated in battles
        IF v_pvp_battles_participated > 0 THEN
          v_current_value := v_pvp_wins;
        ELSE
          v_current_value := 0;  -- No participation = no wins
        END IF;
        
      -- STREAK: Can't exceed account age
      WHEN 'streak' THEN
        -- Streak achievement requires: streak >= value AND account_age >= value
        IF v_user_streak >= v_achievement.condition_value AND v_account_age_days >= v_achievement.condition_value THEN
          v_current_value := v_user_streak;
        ELSE
          v_current_value := 0;  -- Not possible yet
        END IF;
        
      -- COINS: Current balance is the best we can verify
      -- But we should NOT award if they clearly haven't earned enough
      WHEN 'coins_earned', 'total_coins_earned' THEN
        -- Be conservative: only award if current coins + XP suggests real earnings
        -- Rough estimate: assignments give ~50-100 coins, ~50 XP each
        -- If they have 1000 coins requirement but only 50 XP, something is wrong
        IF v_user_coins >= v_achievement.condition_value THEN
          v_current_value := v_user_coins;
        ELSIF v_user_xp >= (v_achievement.condition_value / 2) THEN
          -- They might have spent coins, check if XP supports it
          v_current_value := v_achievement.condition_value;
        ELSE
          v_current_value := v_user_coins;  -- Use actual coins
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
        v_current_value := 1;  -- Always 1 for login
        
      WHEN 'correct_answers' THEN
        v_current_value := COALESCE(v_user_correct_answers, 0);
        
      ELSE
        v_current_value := 0;
    END CASE;

    -- Award if condition met
    IF v_current_value >= v_achievement.condition_value THEN
      -- Insert with earned_at timestamp
      INSERT INTO user_achievements (user_id, achievement_id, earned_at, progress, target)
      VALUES (
        p_user_id, 
        v_achievement.id, 
        NOW(),
        v_current_value,
        v_achievement.condition_value
      )
      ON CONFLICT (user_id, achievement_id) 
      DO UPDATE SET 
        earned_at = COALESCE(user_achievements.earned_at, NOW()),
        progress = EXCLUDED.progress,
        target = EXCLUDED.target;

      -- Build achievement JSON
      v_achievement_json := jsonb_build_object(
        'id', v_achievement.id,
        'name', v_achievement.name,
        'description', v_achievement.description,
        'icon', v_achievement.icon,
        'category', COALESCE(v_achievement.category, 'general'),
        'rarity', COALESCE(v_achievement.rarity, 'common'),
        'xp_reward', COALESCE(v_achievement.xp_reward, 0),
        'coin_reward', COALESCE(v_achievement.coin_reward, 0)
      );
      v_newly_earned := v_newly_earned || v_achievement_json;

      -- Award XP and coins if specified
      IF COALESCE(v_achievement.xp_reward, 0) > 0 OR COALESCE(v_achievement.coin_reward, 0) > 0 THEN
        UPDATE users 
        SET 
          xp = xp + COALESCE(v_achievement.xp_reward, 0),
          coins = coins + COALESCE(v_achievement.coin_reward, 0)
        WHERE id = p_user_id;
      END IF;

      -- Log to activities
      BEGIN
        INSERT INTO activities (actor_id, kind, payload, created_at)
        VALUES (
          p_user_id,
          'achievement_earned',
          jsonb_build_object(
            'achievement_id', v_achievement.id,
            'achievement_name', v_achievement.name,
            'icon', v_achievement.icon,
            'rarity', COALESCE(v_achievement.rarity, 'common')
          ),
          NOW()
        );
      EXCEPTION WHEN OTHERS THEN
        -- Ignore activity logging errors
        NULL;
      END;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_newly_earned;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_check_achievements(UUID) TO authenticated;

-- ============================================================================
-- STEP 2: Create validation function for cleanup
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
  v_pvp_wins INT := 0;
  v_pvp_battles_participated INT := 0;
  v_quests_completed INT := 0;
  v_items_purchased INT := 0;
  v_assignment_count INT := 0;
  v_perfect_score_count INT := 0;
  v_early_submission_count INT := 0;
  v_correct_answers INT := 0;
  v_has_clan BOOLEAN := FALSE;
  v_total_coins_from_activities INT := 0;
BEGIN
  -- Get user data
  SELECT * INTO v_user FROM users WHERE id = p_user_id;
  IF v_user IS NULL THEN
    RETURN;
  END IF;

  -- Calculate account age
  v_account_age_days := GREATEST(0, EXTRACT(DAY FROM NOW() - v_user.created_at)::INT);

  -- ============ PVP VALIDATION ============
  -- Check REAL battles table first
  BEGIN
    SELECT COUNT(*) INTO v_pvp_wins 
    FROM brains_heist_battles 
    WHERE winner_id = p_user_id AND status = 'completed';
    
    SELECT COUNT(*) INTO v_pvp_battles_participated
    FROM brains_heist_battles 
    WHERE (challenger_id = p_user_id OR opponent_id = p_user_id) 
      AND status = 'completed';
  EXCEPTION WHEN undefined_table THEN
    -- Fall back to activities
    SELECT COUNT(*) INTO v_pvp_wins 
    FROM activities 
    WHERE actor_id = p_user_id AND kind = 'pvp_win';
    
    SELECT COUNT(*) INTO v_pvp_battles_participated
    FROM activities
    WHERE (actor_id = p_user_id OR target_id = p_user_id)
      AND kind IN ('pvp_win', 'pvp_loss', 'attack_incoming', 'attack_success', 
                   'attack_failed', 'battle_start', 'battle_end');
  END;

  -- Count completed quests
  SELECT COUNT(*) INTO v_quests_completed 
  FROM activities 
  WHERE actor_id = p_user_id AND kind = 'quest_complete';

  -- Count shop purchases
  SELECT COUNT(*) INTO v_items_purchased 
  FROM activities 
  WHERE actor_id = p_user_id AND kind = 'shop_purchase';

  -- Count assignments
  SELECT COUNT(*) INTO v_assignment_count
  FROM student_assignment_results
  WHERE student_id = p_user_id;

  -- Count perfect scores
  SELECT COUNT(*) INTO v_perfect_score_count
  FROM student_assignment_results
  WHERE student_id = p_user_id AND accuracy = 100;

  -- Count early submissions
  SELECT COUNT(*) INTO v_early_submission_count
  FROM student_assignment_results sar
  JOIN assignments a ON a.id = sar.assignment_id
  WHERE sar.student_id = p_user_id
    AND a.due_at IS NOT NULL
    AND sar.completed_at < a.due_at - INTERVAL '1 day';

  -- Get correct answers
  BEGIN
    EXECUTE 'SELECT COALESCE(correct_answers, 0) FROM users WHERE id = $1' 
    INTO v_correct_answers USING p_user_id;
  EXCEPTION WHEN undefined_column THEN
    v_correct_answers := COALESCE(v_user.xp / 10, 0);
  END;

  -- Check clan membership
  BEGIN
    EXECUTE 'SELECT clan_id IS NOT NULL FROM users WHERE id = $1' 
    INTO v_has_clan USING p_user_id;
  EXCEPTION WHEN undefined_column THEN
    v_has_clan := FALSE;
  END;

  -- Get coins from activities
  BEGIN
    SELECT COALESCE(SUM((payload->>'amount')::INT), 0) INTO v_total_coins_from_activities
    FROM activities
    WHERE actor_id = p_user_id AND kind = 'coins_earned';
  EXCEPTION WHEN OTHERS THEN
    v_total_coins_from_activities := 0;
  END;

  -- ========== VALIDATE EACH ACHIEVEMENT ==========

  -- PROGRESSION: first_login
  RETURN QUERY
  SELECT 'first_login'::TEXT, TRUE, 'Account exists'::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'first_login');

  -- PROGRESSION: knowledge_seeker (10 correct answers)
  RETURN QUERY
  SELECT 'knowledge_seeker'::TEXT, v_correct_answers >= 10,
         format('Correct answers: %s (need 10)', v_correct_answers)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'knowledge_seeker');

  -- PROGRESSION: scholar (50 correct answers)
  RETURN QUERY
  SELECT 'scholar'::TEXT, v_correct_answers >= 50,
         format('Correct answers: %s (need 50)', v_correct_answers)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'scholar');

  -- PROGRESSION: level_5/10/20
  RETURN QUERY
  SELECT 'level_5'::TEXT, v_user.level >= 5, format('Level: %s (need 5)', v_user.level)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'level_5');
  
  RETURN QUERY
  SELECT 'level_10'::TEXT, v_user.level >= 10, format('Level: %s (need 10)', v_user.level)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'level_10');
  
  RETURN QUERY
  SELECT 'level_20'::TEXT, v_user.level >= 20, format('Level: %s (need 20)', v_user.level)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'level_20');

  -- PROGRESSION: streak (MUST validate against account age)
  RETURN QUERY
  SELECT 'streak_3'::TEXT, v_user.streak >= 3 AND v_account_age_days >= 3,
         format('Streak: %s, Account age: %s days (both need >= 3)', v_user.streak, v_account_age_days)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'streak_3');
  
  RETURN QUERY
  SELECT 'streak_7'::TEXT, v_user.streak >= 7 AND v_account_age_days >= 7,
         format('Streak: %s, Account age: %s days (both need >= 7)', v_user.streak, v_account_age_days)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'streak_7');
  
  RETURN QUERY
  SELECT 'streak_30'::TEXT, v_user.streak >= 30 AND v_account_age_days >= 30,
         format('Streak: %s, Account age: %s days (both need >= 30)', v_user.streak, v_account_age_days)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'streak_30');

  -- COMBAT: PvP achievements (MUST have actual battle participation)
  RETURN QUERY
  SELECT 'pvp_champion'::TEXT, v_pvp_wins >= 1 AND v_pvp_battles_participated >= 1,
         format('Wins: %s, Battles: %s (need 1 win, 1 battle)', v_pvp_wins, v_pvp_battles_participated)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'pvp_champion');
  
  RETURN QUERY
  SELECT 'first_pvp_win'::TEXT, v_pvp_wins >= 1 AND v_pvp_battles_participated >= 1,
         format('Wins: %s, Battles: %s (need 1 win, 1 battle)', v_pvp_wins, v_pvp_battles_participated)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'first_pvp_win');
  
  RETURN QUERY
  SELECT 'pvp_5'::TEXT, v_pvp_wins >= 5 AND v_pvp_battles_participated >= 5,
         format('Wins: %s, Battles: %s (need 5)', v_pvp_wins, v_pvp_battles_participated)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'pvp_5');
  
  RETURN QUERY
  SELECT 'pvp_veteran'::TEXT, v_pvp_wins >= 10 AND v_pvp_battles_participated >= 10,
         format('Wins: %s, Battles: %s (need 10)', v_pvp_wins, v_pvp_battles_participated)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'pvp_veteran');
  
  RETURN QUERY
  SELECT 'pvp_10_wins'::TEXT, v_pvp_wins >= 10 AND v_pvp_battles_participated >= 10,
         format('Wins: %s, Battles: %s (need 10)', v_pvp_wins, v_pvp_battles_participated)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'pvp_10_wins');
  
  RETURN QUERY
  SELECT 'pvp_master'::TEXT, v_pvp_wins >= 25 AND v_pvp_battles_participated >= 25,
         format('Wins: %s, Battles: %s (need 25)', v_pvp_wins, v_pvp_battles_participated)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'pvp_master');

  -- SOCIAL: clan membership
  RETURN QUERY
  SELECT 'social_butterfly'::TEXT, v_has_clan, format('Has clan: %s', v_has_clan)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'social_butterfly');

  -- COLLECTION: purchases
  RETURN QUERY
  SELECT 'collector'::TEXT, v_items_purchased >= 1, format('Purchases: %s (need 1)', v_items_purchased)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'collector');
  
  RETURN QUERY
  SELECT 'shopaholic'::TEXT, v_items_purchased >= 10, format('Purchases: %s (need 10)', v_items_purchased)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'shopaholic');

  -- COLLECTION: coins (STRICT - must have proof of earning)
  -- Valid if: current coins >= 1000 OR tracked earnings >= 1000 OR high XP+assignments prove earning
  RETURN QUERY
  SELECT 'coin_hoarder'::TEXT, 
         v_user.coins >= 1000 OR v_total_coins_from_activities >= 1000 OR (v_user.xp >= 500 AND v_assignment_count >= 10),
         format('Coins: %s, Tracked: %s, XP: %s, Assignments: %s (need 1000 proof)', 
                v_user.coins, v_total_coins_from_activities, v_user.xp, v_assignment_count)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'coin_hoarder');
  
  RETURN QUERY
  SELECT 'wealthy'::TEXT, v_user.coins >= 5000, format('Coins: %s (need 5000)', v_user.coins)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'wealthy');

  -- ASSIGNMENTS
  RETURN QUERY
  SELECT 'assignment_first'::TEXT, v_assignment_count >= 1, format('Assignments: %s (need 1)', v_assignment_count)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'assignment_first');
  
  RETURN QUERY
  SELECT 'assignment_5'::TEXT, v_assignment_count >= 5, format('Assignments: %s (need 5)', v_assignment_count)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'assignment_5');
  
  RETURN QUERY
  SELECT 'assignment_10'::TEXT, v_assignment_count >= 10, format('Assignments: %s (need 10)', v_assignment_count)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'assignment_10');
  
  RETURN QUERY
  SELECT 'assignment_25'::TEXT, v_assignment_count >= 25, format('Assignments: %s (need 25)', v_assignment_count)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'assignment_25');
  
  RETURN QUERY
  SELECT 'assignment_50'::TEXT, v_assignment_count >= 50, format('Assignments: %s (need 50)', v_assignment_count)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'assignment_50');
  
  RETURN QUERY
  SELECT 'assignment_perfect'::TEXT, v_perfect_score_count >= 1, format('Perfect scores: %s (need 1)', v_perfect_score_count)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'assignment_perfect');
  
  RETURN QUERY
  SELECT 'assignment_early'::TEXT, v_early_submission_count >= 1, format('Early submissions: %s (need 1)', v_early_submission_count)::TEXT
  WHERE EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = p_user_id AND ua.achievement_id = 'assignment_early');

  -- Handle unknown achievements
  FOR v_ach IN 
    SELECT ua.achievement_id AS aid
    FROM user_achievements ua
    WHERE ua.user_id = p_user_id
      AND ua.achievement_id NOT IN (
        'first_login', 'knowledge_seeker', 'scholar', 
        'level_5', 'level_10', 'level_20',
        'streak_3', 'streak_7', 'streak_30',
        'pvp_champion', 'first_pvp_win', 'pvp_5', 'pvp_veteran', 'pvp_10_wins', 'pvp_master',
        'social_butterfly',
        'collector', 'shopaholic', 'coin_hoarder', 'wealthy',
        'assignment_first', 'assignment_5', 'assignment_10', 
        'assignment_25', 'assignment_50', 'assignment_perfect', 'assignment_early'
      )
  LOOP
    RETURN QUERY SELECT v_ach.aid::TEXT, FALSE, 'Unknown/legacy achievement'::TEXT;
  END LOOP;
END;
$$;

-- ============================================================================
-- STEP 3: Show what will be cleaned up
-- ============================================================================

SELECT 
  u.username,
  EXTRACT(DAY FROM NOW() - u.created_at)::INT AS account_age_days,
  u.coins,
  u.xp,
  v.ach_id AS achievement_id,
  v.is_valid,
  v.reason
FROM users u
CROSS JOIN LATERAL validate_user_achievements(u.id) v
WHERE NOT v.is_valid
ORDER BY u.username, v.ach_id;

-- ============================================================================
-- STEP 4: Delete all invalid achievements
-- ============================================================================

-- Create temp table
CREATE TEMP TABLE invalid_achievements AS
SELECT u.id AS user_id, v.ach_id AS achievement_id
FROM users u
CROSS JOIN LATERAL validate_user_achievements(u.id) v
WHERE NOT v.is_valid;

-- Show count
SELECT COUNT(*) AS invalid_achievements_to_delete FROM invalid_achievements;

-- Delete
DELETE FROM user_achievements ua
USING invalid_achievements ia
WHERE ua.user_id = ia.user_id 
  AND ua.achievement_id = ia.achievement_id;

-- Drop temp table
DROP TABLE invalid_achievements;

-- ============================================================================
-- STEP 5: Fix user streaks that exceed account age
-- ============================================================================

UPDATE users
SET streak = LEAST(streak, GREATEST(0, EXTRACT(DAY FROM NOW() - created_at)::INT))
WHERE streak > EXTRACT(DAY FROM NOW() - created_at);

-- ============================================================================
-- STEP 6: Show remaining valid achievements
-- ============================================================================

SELECT 
  u.username,
  EXTRACT(DAY FROM NOW() - u.created_at)::INT AS account_age_days,
  u.level,
  u.streak,
  u.coins,
  u.xp,
  COUNT(ua.achievement_id) AS valid_achievements,
  STRING_AGG(a.name, ', ' ORDER BY a.name) AS achievements
FROM users u
LEFT JOIN user_achievements ua ON ua.user_id = u.id 
  AND (ua.earned_at IS NOT NULL OR ua.unlocked_at IS NOT NULL)
LEFT JOIN achievements a ON a.id = ua.achievement_id
WHERE u.role = 'student' OR u.role IS NULL
GROUP BY u.id, u.username, u.created_at, u.level, u.streak, u.coins, u.xp
HAVING COUNT(ua.achievement_id) > 0
ORDER BY valid_achievements DESC;

-- ============================================================================
-- STEP 7: Cleanup
-- ============================================================================

DROP FUNCTION IF EXISTS validate_user_achievements(UUID);

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- This script:
-- 1. Updated rpc_check_achievements with STRICT validation:
--    - PvP wins require actual battle participation (brains_heist_battles table)
--    - Streak achievements require account age >= streak requirement
--    - Coins achievements validated against XP/assignments when current balance is low
-- 2. Validated all existing achievements against real data
-- 3. Deleted all achievements that couldn't be verified
-- 4. Fixed user streaks that exceeded account age
--
-- Now achievements will ONLY be awarded when truly earned!
