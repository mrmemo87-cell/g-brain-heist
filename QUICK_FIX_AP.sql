-- QUICK FIX: Initialize last_ap_update for all users
-- Run this in Supabase SQL Editor to fix the AP timer

-- Set last_ap_update to current time for any users where it's NULL
UPDATE users 
SET last_ap_update = NOW() 
WHERE last_ap_update IS NULL;

-- Verify the fix
SELECT username, ap_now, ap_max, last_ap_update 
FROM users 
ORDER BY username;
