-- RESET ALL USERS: AP, Audio Settings, and Defaults
-- Run this in Supabase SQL Editor

-- Step 1: Add last_ap_update column if it doesn't exist
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS last_ap_update TIMESTAMPTZ DEFAULT NOW();

-- Step 2: Reset ALL users to full AP (20/20) and set timer to now
UPDATE users 
SET 
    ap_now = 20,
    ap_max = 20,
    last_ap_update = NOW();

-- Step 3: Verify all users have been reset
SELECT 
    username, 
    ap_now, 
    ap_max, 
    last_ap_update,
    EXTRACT(EPOCH FROM (NOW() - last_ap_update)) / 60 AS minutes_since_update
FROM users 
ORDER BY username;

-- Expected result: All users should have ap_now=20, ap_max=20, and last_ap_update = current time

-- Note about audio settings:
-- Audio preferences (background music and sound effects) are stored in browser localStorage,
-- not in the database. They default to ON when a user first visits the game.
-- If you want to ensure audio is enabled, users need to check their settings in-game.
