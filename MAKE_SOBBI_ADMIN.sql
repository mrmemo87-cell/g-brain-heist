-- CONVERT Sobbi@bh.com TO ADMIN
-- Give this account full admin powers

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
  tutorial_completed = true,
  avatar_url = 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin&backgroundColor=b6e3f4&skinColor=ffdbb4&eyes=default&eyebrows=default&mouth=smile&accessories=prescription01&clothesColor=262e33'
WHERE email = 'Sobbi@bh.com';

-- Verify admin powers
SELECT 
  id,
  email,
  username,
  role,
  level,
  xp,
  coins,
  ap_now,
  admin_visible
FROM users 
WHERE email = 'Sobbi@bh.com';

-- Should show: username='Mr. Sobbi', role='admin', level=999, godly stats
