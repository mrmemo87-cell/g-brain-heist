-- DIAGNOSE AUTH MISMATCH
-- Check if auth user ID matches database user ID

-- Get auth user ID
SELECT id as auth_id, email 
FROM auth.users 
WHERE email = 'admin@g-brain-heist.com';

-- Get database user ID
SELECT id as db_id, email, username
FROM users 
WHERE email = 'admin@g-brain-heist.com';

-- They should match! If not, we need to fix it.
