-- FIX AUTH/DB MISMATCH
-- This deletes the old database user and lets auth create the correct one

-- Step 1: Delete the existing database user (wrong ID)
DELETE FROM users WHERE email = 'admin@g-brain-heist.com';

-- Step 2: Now login through the app
-- Supabase will automatically create a users row with the CORRECT ID
-- that matches the auth user

-- Step 3: After first login, run COMPLETE_ADMIN_SETUP.sql again
-- to give the user admin powers
