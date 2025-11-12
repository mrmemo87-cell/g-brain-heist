-- ============================================
-- ACHIEVEMENTS SYSTEM SETUP
-- ============================================
-- Run this SQL migration to set up the complete achievements system
-- This creates tables, policies, and default achievements
-- ============================================

-- Clean up old structure if exists
DO $$
BEGIN
    -- Check if achievements table exists with UUID id (wrong type from old migration)
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'achievements' AND column_name = 'id' AND data_type = 'uuid') THEN
        
        DROP TABLE IF EXISTS user_achievements CASCADE;
        DROP TABLE IF EXISTS achievements CASCADE;
        RAISE NOTICE 'Dropped existing achievements tables with incompatible structure';
    END IF;
END $$;

-- ============================================
-- CREATE ACHIEVEMENTS MASTER TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS achievements (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '🏆',
    category TEXT NOT NULL DEFAULT 'general',
    condition_type TEXT NOT NULL,
    condition_value INTEGER NOT NULL DEFAULT 0,
    reward_xp INTEGER DEFAULT 0,
    reward_coins INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CREATE USER ACHIEVEMENTS TRACKING TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS user_achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id TEXT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
    earned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, achievement_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_earned_at ON user_achievements(earned_at DESC);

-- ============================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

-- Everyone can read achievements
DROP POLICY IF EXISTS "achievements_select_all" ON achievements;
CREATE POLICY "achievements_select_all" ON achievements FOR SELECT USING (true);

-- Users can only see their own achievements
DROP POLICY IF EXISTS "user_achievements_select_own" ON user_achievements;
CREATE POLICY "user_achievements_select_own" ON user_achievements FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_achievements_insert_own" ON user_achievements;
CREATE POLICY "user_achievements_insert_own" ON user_achievements FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_achievements_update_own" ON user_achievements;
CREATE POLICY "user_achievements_update_own" ON user_achievements FOR UPDATE USING (auth.uid() = user_id);

-- ============================================
-- INSERT DEFAULT ACHIEVEMENTS
-- ============================================

INSERT INTO achievements (id, name, description, icon, category, condition_type, condition_value, reward_xp, reward_coins)
VALUES
    ('first_login', 'First Steps', 'Welcome to the game! Complete your first login.', '🎮', 'progression', 'login_count', 1, 50, 25),
    ('pvp_champion', 'PvP Champion', 'Win your first PvP battle!', '⚔️', 'combat', 'pvp_wins', 1, 100, 50),
    ('knowledge_seeker', 'Knowledge Seeker', 'Answer 10 questions correctly.', '📚', 'progression', 'correct_answers', 10, 150, 75),
    ('social_butterfly', 'Social Butterfly', 'Join a clan and become part of a team.', '🦋', 'social', 'clan_joined', 1, 100, 50),
    ('collector', 'Collector', 'Acquire your first item from the shop.', '🎁', 'progression', 'items_purchased', 1, 75, 35),
    ('level_5', 'Rising Star', 'Reach level 5 through hard work and dedication.', '⭐', 'progression', 'level', 5, 200, 100),
    ('level_10', 'Expert', 'Reach level 10 and prove your expertise.', '💫', 'progression', 'level', 10, 350, 175),
    ('coin_hoarder', 'Coin Hoarder', 'Accumulate 1000 coins.', '💰', 'progression', 'total_coins_earned', 1000, 200, 100),
    ('streak_master', 'Streak Master', 'Build a 5-day login streak.', '🔥', 'progression', 'streak', 5, 150, 75),
    ('pvp_veteran', 'PvP Veteran', 'Win 10 PvP battles.', '🏆', 'combat', 'pvp_wins', 10, 300, 150),
    ('scholar', 'Scholar', 'Answer 50 questions correctly.', '🎓', 'progression', 'correct_answers', 50, 400, 200)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- CREATE CHECK ACHIEVEMENTS FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION check_achievements(player_id UUID)
RETURNS TABLE(achievement_id TEXT, name TEXT, icon TEXT, reward_xp INT, reward_coins INT)
LANGUAGE plpgsql
AS $$
DECLARE
  achievement_row achievements%ROWTYPE;
  player_data RECORD;
BEGIN
  -- Get player stats
  SELECT 
    level,
    COALESCE(streak, 0) as streak,
    COALESCE((SELECT COUNT(*) FROM question_attempts WHERE student_id = player_id AND is_correct = true), 0) as correct_answers,
    COALESCE((SELECT COUNT(*) FROM pvp_battles WHERE winner_id = player_id), 0) as pvp_wins,
    COALESCE((SELECT COUNT(*) FROM inventory WHERE user_id = player_id), 0) as items_owned,
    COALESCE((SELECT COUNT(*) FROM clan_members WHERE user_id = player_id), 0) as in_clan
  INTO player_data
  FROM users
  WHERE id = player_id;

  -- Loop through all achievements not yet earned
  FOR achievement_row IN
    SELECT a.* FROM achievements a
    WHERE NOT EXISTS (
      SELECT 1 FROM user_achievements ua
      WHERE ua.user_id = player_id AND ua.achievement_id = a.id
    )
  LOOP
    -- Check if player meets condition
    IF (achievement_row.condition_type = 'level' AND player_data.level >= achievement_row.condition_value) OR
       (achievement_row.condition_type = 'streak' AND player_data.streak >= achievement_row.condition_value) OR
       (achievement_row.condition_type = 'correct_answers' AND player_data.correct_answers >= achievement_row.condition_value) OR
       (achievement_row.condition_type = 'pvp_wins' AND player_data.pvp_wins >= achievement_row.condition_value) OR
       (achievement_row.condition_type = 'items_purchased' AND player_data.items_owned >= achievement_row.condition_value) OR
       (achievement_row.condition_type = 'clan_joined' AND player_data.in_clan >= achievement_row.condition_value) OR
       (achievement_row.condition_type = 'login_count' AND player_data.level >= 1)
    THEN
      -- Grant achievement
      INSERT INTO user_achievements (user_id, achievement_id)
      VALUES (player_id, achievement_row.id)
      ON CONFLICT (user_id, achievement_id) DO NOTHING;

      -- Grant rewards
      UPDATE users
      SET xp = COALESCE(xp, 0) + achievement_row.reward_xp,
          coins = COALESCE(coins, 0) + achievement_row.reward_coins,
          updated_at = NOW()
      WHERE id = player_id;

      -- Return newly earned achievement
      RETURN QUERY
      SELECT achievement_row.id, achievement_row.name, achievement_row.icon, 
             achievement_row.reward_xp, achievement_row.reward_coins;
    END IF;
  END LOOP;

  RETURN;
END;
$$;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

DO $$
DECLARE
  achievement_count INT;
BEGIN
  SELECT COUNT(*) INTO achievement_count FROM achievements;
  RAISE NOTICE '✅ Achievements system setup complete!';
  RAISE NOTICE '📊 Total achievements available: %', achievement_count;
  RAISE NOTICE '🎯 Run this to test: SELECT * FROM check_achievements(''your-user-id'');';
END $$;

-- Check tables exist
SELECT 
  CASE 
    WHEN COUNT(*) = 2 THEN '✅ Both tables created successfully'
    ELSE '❌ Missing tables'
  END as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('achievements', 'user_achievements');

-- Display all achievements
SELECT 
  id,
  name,
  category,
  condition_type,
  condition_value,
  reward_xp,
  reward_coins,
  icon
FROM achievements
ORDER BY category, condition_value;
