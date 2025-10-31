-- ==============================================================================
-- G-BRAIN HEIST: COMPLETE DATABASE MIGRATIONS
-- ==============================================================================
-- Instructions:
-- 1. Open Supabase Dashboard > SQL Editor
-- 2. Copy and paste this entire file
-- 3. Execute the script
-- 4. Verify success by checking tables and functions exist
-- ==============================================================================

-- ==============================================================================
-- MIGRATION 1: Add AP Regeneration System
-- ==============================================================================
-- Adds last_ap_update column to track when AP was last regenerated
-- This enables the 10-minute AP regeneration feature
-- ==============================================================================

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS last_ap_update TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Initialize existing users with current timestamp
UPDATE profiles 
SET last_ap_update = NOW() 
WHERE last_ap_update IS NULL;

-- Verification Query:
-- SELECT username, ap_now, ap_max, last_ap_update FROM profiles LIMIT 5;


-- ==============================================================================
-- MIGRATION 2: Grant Level-Up Rewards Function
-- ==============================================================================
-- Creates RPC function to grant rewards when player levels up
-- Rewards: +10 max AP, full AP refill, +100 coins
-- ==============================================================================

CREATE OR REPLACE FUNCTION grant_levelup_rewards(player_id UUID)
RETURNS TABLE(new_ap_max INT, coins_added INT) AS $$
DECLARE
  v_new_ap_max INT;
  v_coins_added INT := 100;
BEGIN
  -- Increase max AP by 10
  UPDATE profiles
  SET 
    ap_max = ap_max + 10,
    ap_now = ap_max + 10,  -- Full refill to new max
    coins = coins + v_coins_added,
    last_ap_update = NOW()
  WHERE id = player_id
  RETURNING ap_max INTO v_new_ap_max;

  -- Return the rewards granted
  RETURN QUERY SELECT v_new_ap_max, v_coins_added;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verification Query:
-- SELECT proname FROM pg_proc WHERE proname = 'grant_levelup_rewards';


-- ==============================================================================
-- MIGRATION 3: Achievements System Schema
-- ==============================================================================
-- Creates achievements and user_achievements tables with 11 default achievements
-- Includes first login, combat, exploration, social, and progression achievements
-- ==============================================================================

-- Create achievements master table
CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT DEFAULT '🎖️',
  tier TEXT DEFAULT 'bronze' CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum')),
  condition_type TEXT NOT NULL,
  condition_value JSONB,
  reward_coins INT DEFAULT 0,
  reward_xp INT DEFAULT 0,
  is_hidden BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user achievements tracking table
CREATE TABLE IF NOT EXISTS user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, achievement_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_earned_at ON user_achievements(earned_at DESC);

-- Insert default achievements (only if not already present)
INSERT INTO achievements (id, title, description, icon, tier, condition_type, condition_value, reward_coins, reward_xp)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'First Steps', 'Complete your first quest', '🚀', 'bronze', 'quest_count', '{"threshold": 1}', 50, 25),
  ('22222222-2222-2222-2222-222222222222', 'Quest Master', 'Complete 10 quests', '⚔️', 'silver', 'quest_count', '{"threshold": 10}', 200, 100),
  ('33333333-3333-3333-3333-333333333333', 'PvP Initiate', 'Win your first PvP battle', '🥊', 'bronze', 'pvp_wins', '{"threshold": 1}', 50, 25),
  ('44444444-4444-4444-4444-444444444444', 'Combat Veteran', 'Win 10 PvP battles', '🏆', 'silver', 'pvp_wins', '{"threshold": 10}', 200, 100),
  ('55555555-5555-5555-5555-555555555555', 'Level Up!', 'Reach level 5', '⭐', 'bronze', 'level', '{"threshold": 5}', 100, 50),
  ('66666666-6666-6666-6666-666666666666', 'Rising Star', 'Reach level 10', '🌟', 'silver', 'level', '{"threshold": 10}', 300, 150),
  ('77777777-7777-7777-7777-777777777777', 'Dedicated', 'Maintain a 7-day login streak', '🔥', 'bronze', 'streak', '{"threshold": 7}', 150, 75),
  ('88888888-8888-8888-8888-888888888888', 'On Fire!', 'Maintain a 30-day login streak', '🔥🔥', 'gold', 'streak', '{"threshold": 30}', 500, 250),
  ('99999999-9999-9999-9999-999999999999', 'Wealthy', 'Accumulate 1000 coins', '💰', 'silver', 'coins', '{"threshold": 1000}', 0, 100),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Shopaholic', 'Purchase 5 items from the shop', '🛒', 'bronze', 'shop_purchases', '{"threshold": 5}', 100, 50),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Social Butterfly', 'Join a clan', '👥', 'bronze', 'clan_joined', '{"threshold": 1}', 50, 25)
ON CONFLICT (id) DO NOTHING;

-- Verification Query:
-- SELECT COUNT(*) as achievement_count FROM achievements;
-- SELECT title, tier FROM achievements ORDER BY tier, title;


-- ==============================================================================
-- MIGRATION 4: Check Achievements Function
-- ==============================================================================
-- Creates RPC function to automatically check and grant achievements
-- Called after game actions to see if player has earned new achievements
-- ==============================================================================

CREATE OR REPLACE FUNCTION check_achievements(player_id UUID)
RETURNS TABLE(achievement_id UUID, title TEXT, reward_coins INT, reward_xp INT) AS $$
DECLARE
  v_profile RECORD;
  v_achievement RECORD;
  v_earned_count INT;
BEGIN
  -- Get player's current stats
  SELECT * INTO v_profile FROM profiles WHERE id = player_id;

  -- Loop through all achievements
  FOR v_achievement IN 
    SELECT a.* FROM achievements a
    WHERE NOT EXISTS (
      SELECT 1 FROM user_achievements ua
      WHERE ua.user_id = player_id AND ua.achievement_id = a.id
    )
  LOOP
    -- Check if conditions are met based on condition_type
    IF (
      (v_achievement.condition_type = 'quest_count' AND v_profile.quests_completed >= (v_achievement.condition_value->>'threshold')::INT) OR
      (v_achievement.condition_type = 'pvp_wins' AND v_profile.pvp_wins >= (v_achievement.condition_value->>'threshold')::INT) OR
      (v_achievement.condition_type = 'level' AND v_profile.level >= (v_achievement.condition_value->>'threshold')::INT) OR
      (v_achievement.condition_type = 'streak' AND v_profile.streak >= (v_achievement.condition_value->>'threshold')::INT) OR
      (v_achievement.condition_type = 'coins' AND v_profile.coins >= (v_achievement.condition_value->>'threshold')::INT) OR
      (v_achievement.condition_type = 'shop_purchases' AND COALESCE(v_profile.shop_purchases, 0) >= (v_achievement.condition_value->>'threshold')::INT) OR
      (v_achievement.condition_type = 'clan_joined' AND v_profile.clan_id IS NOT NULL)
    ) THEN
      -- Grant achievement
      INSERT INTO user_achievements (user_id, achievement_id)
      VALUES (player_id, v_achievement.id)
      ON CONFLICT DO NOTHING;

      -- Award rewards
      UPDATE profiles
      SET 
        coins = coins + v_achievement.reward_coins,
        xp = xp + v_achievement.reward_xp
      WHERE id = player_id;

      -- Return this achievement
      RETURN QUERY SELECT 
        v_achievement.id, 
        v_achievement.title, 
        v_achievement.reward_coins, 
        v_achievement.reward_xp;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verification Query:
-- SELECT proname FROM pg_proc WHERE proname = 'check_achievements';


-- ==============================================================================
-- MIGRATION 5: Tutorial Tracking
-- ==============================================================================
-- Adds tutorial_completed column to track if player has completed onboarding
-- Enables showing tutorial modal only once for new players
-- ==============================================================================

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS tutorial_completed BOOLEAN DEFAULT FALSE;

-- Initialize existing users as having completed tutorial (grandfathered in)
UPDATE profiles 
SET tutorial_completed = TRUE 
WHERE tutorial_completed IS NULL;

-- Verification Query:
-- SELECT username, tutorial_completed FROM profiles LIMIT 5;


-- ==============================================================================
-- VERIFICATION CHECKLIST
-- ==============================================================================
-- After running this script, verify everything is set up correctly:
--
-- ✓ Check columns exist:
--   SELECT column_name FROM information_schema.columns 
--   WHERE table_name = 'profiles' 
--   AND column_name IN ('last_ap_update', 'tutorial_completed');
--
-- ✓ Check functions exist:
--   SELECT proname FROM pg_proc 
--   WHERE proname IN ('grant_levelup_rewards', 'check_achievements');
--
-- ✓ Check achievements table populated:
--   SELECT COUNT(*) FROM achievements; -- Should be 11
--
-- ✓ Check tables exist:
--   SELECT table_name FROM information_schema.tables 
--   WHERE table_name IN ('achievements', 'user_achievements');
--
-- ✓ Test achievement checking (replace UUID with your user ID):
--   SELECT * FROM check_achievements('your-user-uuid-here');
--
-- ==============================================================================
-- ALL MIGRATIONS COMPLETE! Your database is now ready for production.
-- ==============================================================================
