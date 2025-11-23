-- Remove glitch and neon cosmetics from Aigul01

-- Step 1: Find Aigul01's user ID
-- SELECT id FROM users WHERE username = 'Aigul01';

-- Step 2: Remove cosmetics from users table
UPDATE users
SET 
  active_cosmetic_frame = NULL,
  active_cosmetic_theme = NULL
WHERE username = 'Aigul01';

-- Step 3: Remove cosmetics from inventory
UPDATE inventory
SET state = 'inactive'
WHERE user_id IN (SELECT id FROM users WHERE username = 'Aigul01')
  AND item_id IN ('item_cosmetic_frame', 'item_cosmetic_theme')
  AND state = 'active';

-- Verify the changes
SELECT id, username, active_cosmetic_frame, active_cosmetic_theme
FROM users
WHERE username = 'Aigul01';
