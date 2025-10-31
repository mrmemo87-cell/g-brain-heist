-- Achievements table
CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  condition_type TEXT NOT NULL, -- 'pvp_wins_count', 'total_xp', 'quests_completed', 'coins_earned', 'items_purchased', 'clan_member'
  condition_value INTEGER NOT NULL,
  reward_xp INTEGER DEFAULT 0,
  reward_coins INTEGER DEFAULT 0,
  icon TEXT DEFAULT '🏆',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User achievements (earned badges)
CREATE TABLE IF NOT EXISTS user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);

-- Insert default achievements
INSERT INTO achievements (id, name, description, condition_type, condition_value, reward_xp, reward_coins, icon) VALUES
  ('first_hack', 'First Hack', 'Successfully hack your first rival', 'pvp_wins_count', 1, 50, 25, '⚔️'),
  ('pvp_warrior', 'PvP Warrior', 'Win 10 PvP battles', 'pvp_wins_count', 10, 200, 100, '🛡️'),
  ('pvp_legend', 'PvP Legend', 'Win 50 PvP battles', 'pvp_wins_count', 50, 1000, 500, '👑'),
  ('xp_rookie', 'XP Rookie', 'Reach 500 total XP', 'total_xp', 500, 100, 50, '⭐'),
  ('xp_master', 'XP Master', 'Reach 5000 total XP', 'total_xp', 5000, 500, 250, '💫'),
  ('xp_legend', 'XP Legend', 'Reach 20000 total XP', 'total_xp', 20000, 2000, 1000, '🌟'),
  ('quest_beginner', 'Quest Beginner', 'Complete 10 quests', 'quests_completed', 10, 100, 50, '📚'),
  ('quest_master', 'Quest Master', 'Complete 100 quests', 'quests_completed', 100, 1000, 500, '📖'),
  ('rich_hacker', 'Rich Hacker', 'Earn 10000 total coins', 'coins_earned', 10000, 500, 0, '💰'),
  ('shopaholic', 'Shopaholic', 'Purchase 20 items from the shop', 'items_purchased', 20, 300, 150, '🛒'),
  ('clan_member', 'Clan Member', 'Join a clan', 'clan_member', 1, 100, 50, '🏴')
ON CONFLICT (id) DO NOTHING;
