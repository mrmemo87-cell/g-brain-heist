-- NUCLEAR RESET - Complete cleanup and fresh start
-- Run this to completely remove the admin user and start over

-- Delete ANY user with this email OR username
DELETE FROM users WHERE email = 'admin@g-brain-heist.com';
DELETE FROM users WHERE username = 'Mr. Sobbi';

-- Verify they're gone
SELECT id, email, username FROM users 
WHERE email = 'admin@g-brain-heist.com' OR username = 'Mr. Sobbi';

-- Should return NO ROWS

-- Step 2: You need to MANUALLY delete from Supabase Auth Dashboard:
-- Go to: Authentication → Users
-- Find: admin@g-brain-heist.com
-- Click the trash icon to DELETE the auth user

-- Step 3: After deleting both, SIGN UP as a new user in the app:
-- Email: admin@g-brain-heist.com
-- Password: 123Memoo@
-- Username: Mr. Sobbi
-- Batch: 8A
-- Role: Student (we'll change this next)

-- Step 4: After signup succeeds, run COMPLETE_ADMIN_SETUP.sql
-- to convert the account to admin

-- This ensures auth and database IDs match perfectly!
