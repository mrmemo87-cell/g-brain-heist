-- ============================================================
-- Notifications System Schema
-- ============================================================
-- Real-time notification system for creating emotional engagement
-- Supports danger, happiness, excitement, warnings, and victories

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'attack_incoming', 'attack_defended', 'attack_success', 'attack_failed',
    'level_up', 'achievement_earned', 'coins_earned', 'coins_lost',
    'quest_completed', 'low_ap', 'ap_full', 'challenge_received',
    'clan_invite', 'revenge_available', 'streak_danger', 'new_rival',
    'leaderboard_change'
  )),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB, -- Additional contextual data
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON notifications(user_id, priority, read);

-- Enable Row Level Security
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only see their own notifications
CREATE POLICY notifications_select_own ON notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY notifications_update_own ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY notifications_delete_own ON notifications
  FOR DELETE USING (auth.uid() = user_id);

-- System can insert notifications for any user
CREATE POLICY notifications_insert_system ON notifications
  FOR INSERT WITH CHECK (true);

-- ============================================================
-- Helper Functions for Creating Notifications
-- ============================================================

-- Notify user of incoming attack
CREATE OR REPLACE FUNCTION notify_attack_incoming(
  target_user_id UUID,
  attacker_username TEXT,
  attacker_power INT
)
RETURNS UUID AS $$
DECLARE
  notification_id UUID;
BEGIN
  INSERT INTO notifications (user_id, type, title, message, priority, data)
  VALUES (
    target_user_id,
    'attack_incoming',
    '🚨 UNDER ATTACK!',
    attacker_username || ' is attacking you with ' || attacker_power || ' power!',
    'urgent',
    jsonb_build_object('attacker', attacker_username, 'power', attacker_power)
  )
  RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Notify user of successful defense
CREATE OR REPLACE FUNCTION notify_attack_defended(
  user_id_param UUID,
  attacker_username TEXT,
  coins_kept INT
)
RETURNS UUID AS $$
DECLARE
  notification_id UUID;
BEGIN
  INSERT INTO notifications (user_id, type, title, message, priority, data)
  VALUES (
    user_id_param,
    'attack_defended',
    '🛡️ Victory! Defense Successful',
    'You defended against ' || attacker_username || ' and kept ' || coins_kept || ' coins!',
    'high',
    jsonb_build_object('attacker', attacker_username, 'coins', coins_kept)
  )
  RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Notify user of level up
CREATE OR REPLACE FUNCTION notify_level_up(
  user_id_param UUID,
  new_level INT,
  rewards_xp INT,
  rewards_coins INT
)
RETURNS UUID AS $$
DECLARE
  notification_id UUID;
BEGIN
  INSERT INTO notifications (user_id, type, title, message, priority, data)
  VALUES (
    user_id_param,
    'level_up',
    '🎉 LEVEL UP!',
    'You reached Level ' || new_level || '! Earned ' || rewards_xp || ' XP and ' || rewards_coins || ' coins!',
    'high',
    jsonb_build_object('level', new_level, 'xp', rewards_xp, 'coins', rewards_coins)
  )
  RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Notify user of low AP
CREATE OR REPLACE FUNCTION notify_low_ap(
  user_id_param UUID,
  current_ap INT,
  max_ap INT
)
RETURNS UUID AS $$
DECLARE
  notification_id UUID;
BEGIN
  -- Only notify if AP is below 20% and user hasn't been notified recently
  IF current_ap::FLOAT / max_ap < 0.2 THEN
    -- Check if similar notification exists in last hour
    IF NOT EXISTS (
      SELECT 1 FROM notifications
      WHERE user_id = user_id_param
        AND type = 'low_ap'
        AND created_at > NOW() - INTERVAL '1 hour'
    ) THEN
      INSERT INTO notifications (user_id, type, title, message, priority, data)
      VALUES (
        user_id_param,
        'low_ap',
        '⚠️ Low Action Points',
        'You only have ' || current_ap || '/' || max_ap || ' AP left. Time to rest!',
        'low',
        jsonb_build_object('current_ap', current_ap, 'max_ap', max_ap)
      )
      RETURNING id INTO notification_id;
    END IF;
  END IF;
  
  RETURN notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Notify user when AP is full
CREATE OR REPLACE FUNCTION notify_ap_full(
  user_id_param UUID
)
RETURNS UUID AS $$
DECLARE
  notification_id UUID;
BEGIN
  -- Check if similar notification exists in last 2 hours
  IF NOT EXISTS (
    SELECT 1 FROM notifications
    WHERE user_id = user_id_param
      AND type = 'ap_full'
      AND created_at > NOW() - INTERVAL '2 hours'
  ) THEN
    INSERT INTO notifications (user_id, type, title, message, priority)
    VALUES (
      user_id_param,
      'ap_full',
      '⚡ Action Points Full!',
      'Your AP is fully recharged. Time to take action!',
      'medium'
    )
    RETURNING id INTO notification_id;
  END IF;
  
  RETURN notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Notify user of coins lost
CREATE OR REPLACE FUNCTION notify_coins_lost(
  user_id_param UUID,
  attacker_username TEXT,
  coins_lost INT
)
RETURNS UUID AS $$
DECLARE
  notification_id UUID;
BEGIN
  INSERT INTO notifications (user_id, type, title, message, priority, data)
  VALUES (
    user_id_param,
    'coins_lost',
    '😰 Coins Stolen!',
    attacker_username || ' stole ' || coins_lost || ' coins from you!',
    'high',
    jsonb_build_object('attacker', attacker_username, 'coins', coins_lost)
  )
  RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Notify user of revenge opportunity
CREATE OR REPLACE FUNCTION notify_revenge_available(
  user_id_param UUID,
  target_username TEXT,
  target_user_id UUID
)
RETURNS UUID AS $$
DECLARE
  notification_id UUID;
BEGIN
  INSERT INTO notifications (user_id, type, title, message, priority, data)
  VALUES (
    user_id_param,
    'revenge_available',
    '💢 Revenge Available!',
    'Get your revenge on ' || target_username || ' who attacked you!',
    'high',
    jsonb_build_object('target_username', target_username, 'target_id', target_user_id)
  )
  RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verification Queries:
-- SELECT * FROM notifications ORDER BY created_at DESC LIMIT 10;
-- SELECT type, COUNT(*) FROM notifications GROUP BY type;
-- SELECT * FROM notifications WHERE read = false AND user_id = 'your-user-id';
