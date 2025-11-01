-- Step 1: Add the last_ap_update column to users table
-- Run this in Supabase SQL Editor

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS last_ap_update TIMESTAMPTZ DEFAULT NOW();

-- Step 2: Initialize the column for all existing users
UPDATE users 
SET last_ap_update = NOW() - INTERVAL '5 minutes'
WHERE last_ap_update IS NULL OR last_ap_update > NOW();

-- Step 3: Verify the column was added
SELECT username, ap_now, ap_max, last_ap_update 
FROM users 
LIMIT 5;

-- You should see the last_ap_update column with timestamps
