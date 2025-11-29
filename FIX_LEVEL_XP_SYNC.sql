-- ==============================================================================
-- G-BRAIN HEIST: FIX LEVEL/XP SYNCHRONIZATION
-- ==============================================================================
-- This migration fixes the level/XP mismatch issue where:
--   - XP gets updated (e.g., 12015)
--   - Level doesn't get recalculated (stuck at 16 instead of 121)
-- 
-- Level formula: GREATEST(1, FLOOR(xp / 100.0) + 1)
-- ==============================================================================

-- ============================================
-- 0. FIX THE COSMETIC THEME CONSTRAINT FIRST
-- ============================================
-- The constraint only allows NULL or 'glitch', but 'flicker' is also used

ALTER TABLE users DROP CONSTRAINT IF EXISTS check_active_cosmetic_theme;
ALTER TABLE users ADD CONSTRAINT check_active_cosmetic_theme 
  CHECK (active_cosmetic_theme IS NULL OR active_cosmetic_theme IN ('glitch', 'flicker'))
  NOT VALID;

-- ============================================
-- 1. SYNC ALL USER LEVELS WITH THEIR XP (ONE-TIME FIX)
-- ============================================

-- First, show current mismatches
SELECT 'CURRENT LEVEL/XP MISMATCHES' as check_type;
SELECT 
    id,
    username,
    xp,
    level as current_level,
    GREATEST(1, FLOOR(xp / 100.0) + 1)::INTEGER as calculated_level,
    GREATEST(1, FLOOR(xp / 100.0) + 1)::INTEGER - level as level_difference
FROM users
WHERE level != GREATEST(1, FLOOR(xp / 100.0) + 1)::INTEGER
ORDER BY ABS(GREATEST(1, FLOOR(xp / 100.0) + 1)::INTEGER - level) DESC;

-- Fix all levels to match XP
UPDATE users
SET level = GREATEST(1, FLOOR(xp / 100.0) + 1)::INTEGER
WHERE level != GREATEST(1, FLOOR(xp / 100.0) + 1)::INTEGER;

-- Show results
SELECT 'LEVELS SYNCED' as status;
SELECT 
    COUNT(*) as users_fixed,
    (SELECT COUNT(*) FROM users) as total_users
FROM users
WHERE level = GREATEST(1, FLOOR(xp / 100.0) + 1)::INTEGER;

-- ============================================
-- 2. FIX RPC_CHECK_ACHIEVEMENTS TO RECALCULATE LEVEL
-- ============================================

-- Drop and recreate with level recalculation
CREATE OR REPLACE FUNCTION rpc_check_achievements(p_user_id UUID)
RETURNS TABLE(
  newly_earned JSONB
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_achievement RECORD;
  v_current_value INTEGER;
  v_newly_earned JSONB := '[]'::JSONB;
  v_achievement_json JSONB;
  v_new_xp INTEGER;
  v_new_level INTEGER;
BEGIN
  -- Get user stats
  DECLARE
    v_user RECORD;
    v_pvp_wins INTEGER;
    v_quests_completed INTEGER;
    v_items_purchased INTEGER;
  BEGIN
    -- Get user profile
    SELECT * INTO v_user FROM users WHERE id = p_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'User not found';
    END IF;

    -- Count PvP wins
    SELECT COUNT(*) INTO v_pvp_wins 
    FROM activities 
    WHERE actor_id = p_user_id AND kind = 'pvp_win';

    -- Count completed quests
    SELECT COUNT(*) INTO v_quests_completed 
    FROM activities 
    WHERE actor_id = p_user_id AND kind = 'quest_complete';

    -- Count items purchased
    SELECT COUNT(*) INTO v_items_purchased 
    FROM activities 
    WHERE actor_id = p_user_id AND kind = 'shop_purchase';

    -- Loop through all achievements
    FOR v_achievement IN SELECT * FROM achievements LOOP
      -- Skip if already earned
      IF EXISTS (
        SELECT 1 FROM user_achievements 
        WHERE user_id = p_user_id AND achievement_id = v_achievement.id
      ) THEN
        CONTINUE;
      END IF;

      -- Check condition
      v_current_value := 0;
      CASE v_achievement.condition_type
        WHEN 'pvp_wins_count' THEN
          v_current_value := v_pvp_wins;
        WHEN 'total_xp' THEN
          v_current_value := v_user.xp;
        WHEN 'quests_completed' THEN
          v_current_value := v_quests_completed;
        WHEN 'coins_earned' THEN
          -- Total coins earned = current coins + coins spent
          v_current_value := v_user.coins + COALESCE(
            (SELECT SUM((detail->>'amount')::INTEGER) FROM activities 
             WHERE actor_id = p_user_id AND kind = 'shop_purchase'),
            0
          );
        WHEN 'items_purchased' THEN
          v_current_value := v_items_purchased;
        WHEN 'clan_member' THEN
          v_current_value := CASE WHEN v_user.clan_id IS NOT NULL THEN 1 ELSE 0 END;
        ELSE
          v_current_value := 0;
      END CASE;

      -- Grant achievement if condition met
      IF v_current_value >= v_achievement.condition_value THEN
        -- Insert earned achievement
        INSERT INTO user_achievements (user_id, achievement_id)
        VALUES (p_user_id, v_achievement.id);

        -- Calculate new XP and level
        v_new_xp := v_user.xp + v_achievement.reward_xp;
        v_new_level := GREATEST(1, FLOOR(v_new_xp / 100.0) + 1)::INTEGER;

        -- Grant rewards AND recalculate level
        UPDATE users
        SET 
          xp = v_new_xp,
          coins = coins + v_achievement.reward_coins,
          level = v_new_level
        WHERE id = p_user_id;

        -- Update local variable for subsequent calculations
        v_user.xp := v_new_xp;

        -- Log activity
        INSERT INTO activities (kind, actor_id, actor_username, detail)
        VALUES (
          'achievement_earned',
          p_user_id,
          v_user.username,
          jsonb_build_object(
            'achievement_id', v_achievement.id,
            'achievement_name', v_achievement.name,
            'reward_xp', v_achievement.reward_xp,
            'reward_coins', v_achievement.reward_coins,
            'new_level', v_new_level
          )
        );

        -- Add to newly earned list
        v_achievement_json := jsonb_build_object(
          'id', v_achievement.id,
          'name', v_achievement.name,
          'description', v_achievement.description,
          'icon', v_achievement.icon,
          'reward_xp', v_achievement.reward_xp,
          'reward_coins', v_achievement.reward_coins
        );
        v_newly_earned := v_newly_earned || v_achievement_json;
      END IF;
    END LOOP;
  END;

  RETURN QUERY SELECT v_newly_earned;
END;
$$;

-- ============================================
-- 3. CREATE TRIGGER TO AUTO-SYNC LEVEL ON XP CHANGE
-- ============================================

-- Create the trigger function
-- IMPORTANT: This trigger ONLY fires on XP column changes and 
-- modifies NEW.level in-place before the update commits.
-- It does NOT cause additional UPDATE statements.
CREATE OR REPLACE FUNCTION sync_level_with_xp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  calculated_level INTEGER;
BEGIN
  -- Calculate what level should be based on XP
  calculated_level := GREATEST(1, FLOOR(COALESCE(NEW.xp, 0) / 100.0) + 1)::INTEGER;
  
  -- Only modify NEW if level actually needs to change
  -- This prevents unnecessary changes that could trigger subscriptions
  IF COALESCE(NEW.level, 0) != calculated_level THEN
    NEW.level := calculated_level;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing triggers
DROP TRIGGER IF EXISTS trg_sync_level_with_xp ON users;
DROP TRIGGER IF EXISTS trg_sync_level_on_insert ON users;

-- Create trigger ONLY for XP column updates (not all updates)
-- This prevents infinite loops from level updates triggering more updates
CREATE TRIGGER trg_sync_level_with_xp
  BEFORE UPDATE OF xp ON users
  FOR EACH ROW
  WHEN (OLD.xp IS DISTINCT FROM NEW.xp)
  EXECUTE FUNCTION sync_level_with_xp();

-- Trigger on INSERT to set initial level correctly
CREATE TRIGGER trg_sync_level_on_insert
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION sync_level_with_xp();

-- ============================================
-- 4. VERIFICATION
-- ============================================

SELECT 'VERIFICATION' as check_type;

-- Verify no more mismatches
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ All levels are in sync with XP!'
        ELSE '❌ Still have ' || COUNT(*) || ' mismatched users'
    END as status
FROM users
WHERE level != GREATEST(1, FLOOR(xp / 100.0) + 1)::INTEGER;

-- Show sample of users with high XP
SELECT 'TOP XP USERS' as check_type;
SELECT 
    username,
    xp,
    level,
    GREATEST(1, FLOOR(xp / 100.0) + 1)::INTEGER as expected_level,
    CASE 
        WHEN level = GREATEST(1, FLOOR(xp / 100.0) + 1)::INTEGER THEN '✅ Synced'
        ELSE '❌ Mismatch'
    END as status
FROM users
ORDER BY xp DESC
LIMIT 10;

-- Show trigger exists
SELECT 'TRIGGER CHECK' as check_type;
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'users'
AND trigger_name LIKE '%sync_level%';

-- Success message
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Level/XP Sync Migration Complete!';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 Fixed:';
    RAISE NOTICE '   1. Synced all existing user levels with their XP';
    RAISE NOTICE '   2. Updated rpc_check_achievements to recalculate level';
    RAISE NOTICE '   3. Added trigger to auto-sync level on XP changes';
    RAISE NOTICE '';
    RAISE NOTICE '📝 Level formula: FLOOR(xp / 100) + 1';
    RAISE NOTICE '   Example: 12015 XP = Level 121';
    RAISE NOTICE '';
END;
$$;
