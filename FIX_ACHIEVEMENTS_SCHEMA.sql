-- ==============================================================================
-- G-BRAINS HEIST: FIX ACHIEVEMENTS TABLE SCHEMA
-- ==============================================================================
-- This migration fixes the achievements table to have all required columns
-- Run this BEFORE running achievements_schema.sql or SETUP_ACHIEVEMENTS.sql
-- ==============================================================================

-- ============================================
-- 1. CHECK CURRENT SCHEMA
-- ============================================

SELECT 'CURRENT ACHIEVEMENTS COLUMNS' as check_type;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'achievements'
ORDER BY ordinal_position;

-- ============================================
-- 2. ADD MISSING COLUMNS
-- ============================================

DO $$
BEGIN
    -- Add condition_type if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'achievements' AND column_name = 'condition_type'
    ) THEN
        ALTER TABLE achievements ADD COLUMN condition_type TEXT NOT NULL DEFAULT 'manual';
        RAISE NOTICE 'Added condition_type column to achievements';
    END IF;

    -- Add condition_value if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'achievements' AND column_name = 'condition_value'
    ) THEN
        ALTER TABLE achievements ADD COLUMN condition_value INTEGER NOT NULL DEFAULT 0;
        RAISE NOTICE 'Added condition_value column to achievements';
    END IF;

    -- Add reward_xp if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'achievements' AND column_name = 'reward_xp'
    ) THEN
        ALTER TABLE achievements ADD COLUMN reward_xp INTEGER DEFAULT 0;
        RAISE NOTICE 'Added reward_xp column to achievements';
    END IF;

    -- Add reward_coins if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'achievements' AND column_name = 'reward_coins'
    ) THEN
        ALTER TABLE achievements ADD COLUMN reward_coins INTEGER DEFAULT 0;
        RAISE NOTICE 'Added reward_coins column to achievements';
    END IF;

    -- Add icon if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'achievements' AND column_name = 'icon'
    ) THEN
        ALTER TABLE achievements ADD COLUMN icon TEXT DEFAULT '🏆';
        RAISE NOTICE 'Added icon column to achievements';
    END IF;

    -- Add category if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'achievements' AND column_name = 'category'
    ) THEN
        ALTER TABLE achievements ADD COLUMN category TEXT DEFAULT 'general';
        RAISE NOTICE 'Added category column to achievements';
    END IF;

    -- Add name if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'achievements' AND column_name = 'name'
    ) THEN
        ALTER TABLE achievements ADD COLUMN name TEXT NOT NULL DEFAULT 'Achievement';
        RAISE NOTICE 'Added name column to achievements';
    END IF;

    -- Add description if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'achievements' AND column_name = 'description'
    ) THEN
        ALTER TABLE achievements ADD COLUMN description TEXT NOT NULL DEFAULT 'Complete this achievement';
        RAISE NOTICE 'Added description column to achievements';
    END IF;

    -- Add created_at if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'achievements' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE achievements ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
        RAISE NOTICE 'Added created_at column to achievements';
    END IF;
END $$;

-- ============================================
-- 3. ENSURE USER_ACHIEVEMENTS TABLE EXISTS
-- ============================================

CREATE TABLE IF NOT EXISTS user_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id TEXT NOT NULL,
    earned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);

-- ============================================
-- 4. INSERT/UPDATE DEFAULT ACHIEVEMENTS
-- ============================================

-- Clear existing achievements and insert fresh
DELETE FROM achievements WHERE id IN (
    'first_hack', 'pvp_warrior', 'pvp_legend', 
    'xp_rookie', 'xp_master', 'xp_legend',
    'quest_beginner', 'quest_master', 'rich_hacker',
    'shopaholic', 'clan_member',
    'first_login', 'pvp_champion', 'knowledge_seeker',
    'social_butterfly', 'collector', 'level_5', 'level_10',
    'coin_hoarder', 'streak_master', 'pvp_veteran', 'scholar'
);

INSERT INTO achievements (id, name, description, condition_type, condition_value, reward_xp, reward_coins, icon, category) VALUES
    -- Combat achievements
    ('first_hack', 'First Hack', 'Successfully hack your first rival', 'pvp_wins_count', 1, 50, 25, '⚔️', 'combat'),
    ('pvp_warrior', 'PvP Warrior', 'Win 10 PvP battles', 'pvp_wins_count', 10, 200, 100, '🛡️', 'combat'),
    ('pvp_legend', 'PvP Legend', 'Win 50 PvP battles', 'pvp_wins_count', 50, 1000, 500, '👑', 'combat'),
    
    -- XP achievements
    ('xp_rookie', 'XP Rookie', 'Reach 500 total XP', 'total_xp', 500, 100, 50, '⭐', 'progression'),
    ('xp_master', 'XP Master', 'Reach 5000 total XP', 'total_xp', 5000, 500, 250, '💫', 'progression'),
    ('xp_legend', 'XP Legend', 'Reach 20000 total XP', 'total_xp', 20000, 2000, 1000, '🌟', 'progression'),
    
    -- Quest achievements
    ('quest_beginner', 'Quest Beginner', 'Complete 10 quests', 'quests_completed', 10, 100, 50, '📚', 'progression'),
    ('quest_master', 'Quest Master', 'Complete 100 quests', 'quests_completed', 100, 1000, 500, '📖', 'progression'),
    
    -- Economy achievements
    ('rich_hacker', 'Rich Hacker', 'Earn 10000 total coins', 'coins_earned', 10000, 500, 0, '💰', 'economy'),
    ('shopaholic', 'Shopaholic', 'Purchase 20 items from the shop', 'items_purchased', 20, 300, 150, '🛒', 'economy'),
    
    -- Social achievements
    ('clan_member', 'Clan Member', 'Join a clan', 'clan_member', 1, 100, 50, '🏴', 'social'),
    
    -- Level achievements
    ('level_5', 'Rising Star', 'Reach level 5', 'level', 5, 200, 100, '⭐', 'progression'),
    ('level_10', 'Expert', 'Reach level 10', 'level', 10, 350, 175, '💫', 'progression'),
    
    -- Streak achievements  
    ('streak_master', 'Streak Master', 'Build a 5-day login streak', 'streak', 5, 150, 75, '🔥', 'progression'),
    
    -- Questions achievements
    ('knowledge_seeker', 'Knowledge Seeker', 'Answer 10 questions correctly', 'correct_answers', 10, 150, 75, '📚', 'progression'),
    ('scholar', 'Scholar', 'Answer 50 questions correctly', 'correct_answers', 50, 400, 200, '🎓', 'progression')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    condition_type = EXCLUDED.condition_type,
    condition_value = EXCLUDED.condition_value,
    reward_xp = EXCLUDED.reward_xp,
    reward_coins = EXCLUDED.reward_coins,
    icon = EXCLUDED.icon,
    category = EXCLUDED.category;

-- ============================================
-- 5. CREATE/UPDATE CHECK ACHIEVEMENTS FUNCTION
-- ============================================

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
  v_user RECORD;
  v_pvp_wins INTEGER;
  v_quests_completed INTEGER;
  v_items_purchased INTEGER;
  v_correct_answers INTEGER;
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

  -- Count correct answers (try multiple sources)
  SELECT COALESCE(
    (SELECT COUNT(*) FROM question_attempts WHERE student_id = p_user_id AND is_correct = true),
    (SELECT COUNT(*) FROM activities WHERE actor_id = p_user_id AND kind = 'question_correct'),
    0
  ) INTO v_correct_answers;

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
        v_current_value := v_user.coins + COALESCE(
          (SELECT SUM((detail->>'amount')::INTEGER) FROM activities 
           WHERE actor_id = p_user_id AND kind = 'shop_purchase'),
          0
        );
      WHEN 'items_purchased' THEN
        v_current_value := v_items_purchased;
      WHEN 'clan_member' THEN
        v_current_value := CASE WHEN v_user.clan_id IS NOT NULL THEN 1 ELSE 0 END;
      WHEN 'level' THEN
        v_current_value := v_user.level;
      WHEN 'streak' THEN
        v_current_value := COALESCE(v_user.streak, 0);
      WHEN 'correct_answers' THEN
        v_current_value := v_correct_answers;
      ELSE
        v_current_value := 0;
    END CASE;

    -- Grant achievement if condition met
    IF v_current_value >= v_achievement.condition_value THEN
      -- Insert earned achievement
      INSERT INTO user_achievements (user_id, achievement_id)
      VALUES (p_user_id, v_achievement.id)
      ON CONFLICT (user_id, achievement_id) DO NOTHING;

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
      v_user.level := v_new_level;

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

  RETURN QUERY SELECT v_newly_earned;
END;
$$;

-- ============================================
-- 6. ENABLE RLS
-- ============================================

ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

-- Everyone can read achievements
DROP POLICY IF EXISTS "achievements_select_all" ON achievements;
CREATE POLICY "achievements_select_all" ON achievements FOR SELECT USING (true);

-- Users can see their own achievements
DROP POLICY IF EXISTS "user_achievements_select_own" ON user_achievements;
CREATE POLICY "user_achievements_select_own" ON user_achievements FOR SELECT USING (auth.uid() = user_id);

-- ============================================
-- 7. VERIFICATION
-- ============================================

SELECT 'UPDATED ACHIEVEMENTS COLUMNS' as check_type;
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'achievements'
ORDER BY ordinal_position;

SELECT 'ACHIEVEMENTS DATA' as check_type;
SELECT id, name, condition_type, condition_value, reward_xp, reward_coins, icon
FROM achievements
ORDER BY condition_type, condition_value;

-- Success message
DO $$
DECLARE
  achievement_count INT;
BEGIN
  SELECT COUNT(*) INTO achievement_count FROM achievements;
  RAISE NOTICE '';
  RAISE NOTICE '✅ Achievements schema fix complete!';
  RAISE NOTICE '📊 Total achievements: %', achievement_count;
  RAISE NOTICE '';
  RAISE NOTICE '🔧 Fixed:';
  RAISE NOTICE '   1. Added missing columns to achievements table';
  RAISE NOTICE '   2. Inserted/updated default achievements';
  RAISE NOTICE '   3. Updated rpc_check_achievements function';
  RAISE NOTICE '   4. Level now auto-updates when XP changes';
  RAISE NOTICE '';
END $$;
