-- Ensure users table has active_cosmetic_frame column
-- This migration adds the column if it doesn't exist

ALTER TABLE users
ADD COLUMN IF NOT EXISTS active_cosmetic_frame VARCHAR(20) DEFAULT NULL;

-- Add a constraint to ensure it's either 'neon' or NULL
ALTER TABLE users
ADD CONSTRAINT check_active_cosmetic_frame 
  CHECK (active_cosmetic_frame IS NULL OR active_cosmetic_frame = 'neon')
  NOT VALID;

-- Now sync all existing active neon frames to this column
UPDATE users
SET active_cosmetic_frame = 'neon'
WHERE id IN (
    SELECT DISTINCT inv.user_id
    FROM inventory inv
    WHERE inv.state = 'active'
      AND inv.kind = 'cosmetic'
      AND inv.item_id = 'item_cosmetic_frame'
);

-- Create an index for faster lookups during leaderboard/clan queries
CREATE INDEX IF NOT EXISTS idx_users_active_cosmetic_frame
ON users(active_cosmetic_frame)
WHERE active_cosmetic_frame IS NOT NULL;
