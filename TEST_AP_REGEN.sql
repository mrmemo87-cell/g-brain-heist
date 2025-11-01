-- IMMEDIATE AP REGENERATION TEST
-- Run this in Supabase SQL Editor to test AP regeneration right now

-- Step 1: Set your AP timer to 35 minutes ago (should regenerate 3 AP)
UPDATE users 
SET last_ap_update = NOW() - INTERVAL '35 minutes',
    ap_now = 10  -- Start with 10 AP for testing
WHERE username = 'YOUR_USERNAME_HERE';  -- Replace with your actual username

-- Step 2: Check the result
SELECT 
  username,
  ap_now,
  ap_max,
  last_ap_update,
  EXTRACT(EPOCH FROM (NOW() - last_ap_update)) / 60 AS minutes_ago,
  FLOOR(EXTRACT(EPOCH FROM (NOW() - last_ap_update)) / 600) AS ap_should_regen
FROM users 
WHERE username = 'YOUR_USERNAME_HERE';

-- Expected result: 
-- - minutes_ago should be ~35
-- - ap_should_regen should be 3
-- After refreshing the game, you should have 13 AP (10 + 3)
