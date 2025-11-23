-- Sync all currently active neon frames to the users table
-- This ensures the active_cosmetic_frame column is populated for existing users

UPDATE users
SET active_cosmetic_frame = 'neon'
WHERE id IN (
    SELECT DISTINCT inv.user_id
    FROM inventory inv
    WHERE inv.state = 'active'
      AND inv.kind = 'cosmetic'
      AND inv.item_id = 'item_cosmetic_frame'
);

-- Clear neon frames for users who don't have an active one
UPDATE users
SET active_cosmetic_frame = NULL
WHERE active_cosmetic_frame = 'neon'
  AND id NOT IN (
    SELECT DISTINCT inv.user_id
    FROM inventory inv
    WHERE inv.state = 'active'
      AND inv.kind = 'cosmetic'
      AND inv.item_id = 'item_cosmetic_frame'
  );
