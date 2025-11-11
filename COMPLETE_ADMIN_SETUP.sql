-- COMPLETE ADMIN SETUP
-- Run this all at once to set up admin with all required data

-- Update admin user with ALL essential fields
UPDATE users 
SET 
  username = 'Mr. Sobbi',
  role = 'admin',
  batch = '8A',
  level = 999,
  xp = 999999,
  coins = 999999,
  streak = 999,
  ap_now = 999,
  ap_max = 999,
  attack_power = 999,
  defense_power = 999,
  admin_visible = false,
  tutorial_completed = true,
  last_seen = NOW(),
  last_ap_update = NOW(),
  avatar_url = 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin&backgroundColor=b6e3f4&skinColor=ffdbb4&eyes=default&eyebrows=default&mouth=smile&accessories=prescription01&clothesColor=262e33'
WHERE email = 'sobbi@bh.com';

-- Final verification
SELECT 
  id,
  email,
  username,
  role,
  batch,
  level,
  xp,
  coins,
  ap_now,
  ap_max,
  attack_power,
  defense_power,
  admin_visible,
  tutorial_completed,
  last_ap_update
FROM users 
WHERE email = 'sobbi@bh.com';

-- Should show all godly stats and role='admin'
