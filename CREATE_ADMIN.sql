-- Create Admin User: Mr. Sobbi
-- Run this in Supabase SQL Editor

-- IMPORTANT: Before running this SQL, you need to:
-- 1. Go to Supabase Dashboard → Authentication → Users
-- 2. Click "Add user" → "Create new user"
-- 3. Email: admin@g-brain-heist.com
-- 4. Password: 123Memoo@
-- 5. Auto Confirm User: YES (check this box)
-- 6. Click "Create user"
-- 
-- THEN run this SQL to give that user admin powers:

-- Step 1: Add admin_visible column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS admin_visible BOOLEAN DEFAULT false;

-- Step 2: Update the existing authenticated user to be admin
-- Find the user by email and update their username and role
UPDATE users 
SET 
  username = 'Mr. Sobbi',
  role = 'admin',
  level = 999,
  xp = 999999,
  coins = 999999,
  streak = 999,
  ap_now = 999,
  ap_max = 999,
  attack_power = 999,
  defense_power = 999,
  admin_visible = false,
  avatar_url = 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin&backgroundColor=b6e3f4&skinColor=ffdbb4&eyes=default&eyebrows=default&mouth=smile&accessories=prescription01&clothesColor=262e33'
WHERE email = 'admin@g-brain-heist.com';

WHERE email = 'admin@g-brain-heist.com';

-- Step 3: Verify admin was created/updated
SELECT 
  email,
  username, 
  role, 
  level, 
  xp, 
  coins,
  admin_visible
FROM users 
WHERE email = 'admin@g-brain-heist.com';

-- Expected: email='admin@g-brain-heist.com', username='Mr. Sobbi', role='admin', godly stats
