-- VERIFICATION SCRIPT
-- Run this to check if admin user exists

-- Check if user exists in database
SELECT 
  id,
  email,
  username,
  role,
  level,
  xp,
  coins,
  admin_visible
FROM users 
WHERE email = 'admin@g-brain-heist.com';

-- If this returns NO ROWS, then you need to:
-- 1. Go to Authentication → Users in Supabase
-- 2. Create user with email: admin@g-brain-heist.com
-- 3. Then run CREATE_ADMIN.sql again
