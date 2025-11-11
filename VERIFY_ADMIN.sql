-- VERIFICATION SCRIPT
-- Run this to check if admin user exists

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
WHERE email = 'sobbi@bh.com';

-- 2. Create user with email: sobbi@bh.com
