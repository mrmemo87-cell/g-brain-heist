-- Add active_cosmetic_theme column to users table for flicker theme cosmetic
-- This mirrors the neon frame cosmetic implementation

-- Step 1: Add the column if it doesn't exist
ALTER TABLE users
ADD COLUMN IF NOT EXISTS active_cosmetic_theme VARCHAR(20) DEFAULT NULL;

-- Step 2: Add a constraint to ensure it is a supported theme value or NULL
ALTER TABLE users
ADD CONSTRAINT check_active_cosmetic_theme 
  CHECK (active_cosmetic_theme IS NULL OR active_cosmetic_theme IN ('flicker', 'glitch'))
  NOT VALID;

-- Step 3: Sync existing flicker theme cosmetics from inventory to users table
-- Users with active flicker theme in inventory will have the canonical value recorded in users table
UPDATE users
SET active_cosmetic_theme = 'flicker'
WHERE id IN (
    SELECT DISTINCT inv.user_id
    FROM inventory inv
    WHERE inv.state = 'active'
      AND inv.kind = 'cosmetic'
      AND inv.item_id = 'item_cosmetic_theme'
);

-- Step 4: Create an index for faster lookups during leaderboard/clan queries
CREATE INDEX IF NOT EXISTS idx_users_active_cosmetic_theme 
ON users(active_cosmetic_theme) 
WHERE active_cosmetic_theme IS NOT NULL;

-- Step 5: Add comment for documentation
COMMENT ON COLUMN users.active_cosmetic_theme IS 'Active cosmetic theme: flicker for Flicker Theme cosmetic. Legacy glitch reads as flicker during migration. NULL if none active';
