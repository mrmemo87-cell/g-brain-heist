-- Fix AP Regeneration System
-- This script ensures last_ap_update column exists and is properly initialized
-- Run this in Supabase SQL Editor

-- Step 1: Add the column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'last_ap_update'
    ) THEN
        ALTER TABLE users ADD COLUMN last_ap_update TIMESTAMPTZ DEFAULT NOW();
        RAISE NOTICE 'Column last_ap_update added successfully';
    ELSE
        RAISE NOTICE 'Column last_ap_update already exists';
    END IF;
END $$;

-- Step 2: Update NULL values to NOW()
UPDATE users 
SET last_ap_update = NOW() 
WHERE last_ap_update IS NULL;

-- Step 3: Verify the column exists and has data
DO $$
DECLARE
    null_count INTEGER;
    total_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_count FROM users;
    SELECT COUNT(*) INTO null_count FROM users WHERE last_ap_update IS NULL;
    
    RAISE NOTICE 'Total users: %, Users with NULL last_ap_update: %', total_count, null_count;
END $$;

-- Step 4: Manual AP regeneration for testing
-- Uncomment and run this to manually regenerate AP for your user
/*
UPDATE users
SET 
    ap_now = LEAST(
        ap_now + (EXTRACT(EPOCH FROM (NOW() - COALESCE(last_ap_update, NOW())))::INT / 60 / 10),
        ap_max
    ),
    last_ap_update = NOW()
WHERE ap_now < ap_max
    AND (EXTRACT(EPOCH FROM (NOW() - COALESCE(last_ap_update, NOW())))::INT / 60) >= 10;
*/

-- Step 5: Check your current AP status
-- Replace 'YOUR_USER_ID' with your actual user ID
/*
SELECT 
    username,
    ap_now,
    ap_max,
    last_ap_update,
    EXTRACT(EPOCH FROM (NOW() - last_ap_update))::INT / 60 as minutes_since_update,
    FLOOR((EXTRACT(EPOCH FROM (NOW() - last_ap_update))::INT / 60) / 10) as ap_should_regen,
    LEAST(ap_now + FLOOR((EXTRACT(EPOCH FROM (NOW() - last_ap_update))::INT / 60) / 10), ap_max) as calculated_current_ap
FROM users
WHERE id = 'YOUR_USER_ID';
*/
