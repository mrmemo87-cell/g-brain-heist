-- Add attack cooldown column to users table
-- This prevents players from being attacked multiple times in quick succession

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_attacked_at TIMESTAMPTZ;

-- Create index for performance when checking cooldowns
CREATE INDEX IF NOT EXISTS idx_users_last_attacked_at ON users(last_attacked_at);

-- Verification
-- SELECT username, last_attacked_at, 
--        CASE 
--          WHEN last_attacked_at IS NULL THEN 'Never attacked'
--          WHEN NOW() - last_attacked_at < INTERVAL '5 minutes' THEN 'On cooldown'
--          ELSE 'Available to attack'
--        END as status
-- FROM users
-- LIMIT 10;
