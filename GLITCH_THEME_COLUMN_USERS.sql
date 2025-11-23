-- Add active_cosmetic_theme column to users table for glitch theme cosmetic
-- This mirrors the neon frame cosmetic implementation

-- Step 1: Add the column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'active_cosmetic_theme'
  ) THEN
    ALTER TABLE users ADD COLUMN active_cosmetic_theme VARCHAR(50) DEFAULT NULL;
  END IF;
END $$;

-- Step 2: Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_users_active_cosmetic_theme 
ON users(active_cosmetic_theme) 
WHERE active_cosmetic_theme IS NOT NULL;

-- Step 3: Sync existing glitch theme cosmetics from inventory to users table
-- Users with active glitch theme in inventory will have it recorded in users table
WITH glitch_theme_users AS (
  SELECT DISTINCT i.user_id
  FROM inventory i
  WHERE i.item_id = 'item_cosmetic_theme'
    AND i.state = 'active'
    AND i.kind = 'cosmetic'
)
UPDATE users u
SET active_cosmetic_theme = 'glitch'
FROM glitch_theme_users gtu
WHERE u.id = gtu.user_id
  AND u.active_cosmetic_theme IS NULL;

-- Step 4: Ensure users without active glitch theme have NULL value
UPDATE users 
SET active_cosmetic_theme = NULL
WHERE id NOT IN (
  SELECT DISTINCT i.user_id
  FROM inventory i
  WHERE i.item_id = 'item_cosmetic_theme'
    AND i.state = 'active'
    AND i.kind = 'cosmetic'
)
AND active_cosmetic_theme IS NOT NULL;

-- Step 5: Add comment for documentation
COMMENT ON COLUMN users.active_cosmetic_theme IS 'Active cosmetic theme: glitch for glitch theme cosmetic, NULL if none active';
