-- Create Admin User: Mr. Sobbi
-- Run this in Supabase SQL Editor

-- Step 1: Add admin_visible column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS admin_visible BOOLEAN DEFAULT false;

-- Step 2: Create or update Mr. Sobbi as admin
-- First, check if user exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE username = 'Mr. Sobbi') THEN
    -- Create new admin user
    INSERT INTO users (
      email,
      username,
      role,
      batch,
      level,
      xp,
      coins,
      streak,
      ap_now,
      ap_max,
      attack_power,
      defense_power,
      avatar_url,
      admin_visible,
      last_seen,
      last_ap_update
    ) VALUES (
      'admin@g-brain-heist.com',
      'Mr. Sobbi',
      'admin',
      NULL,
      999,
      999999,
      999999,
      999,
      999,
      999,
      999,
      999,
      'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin&backgroundColor=b6e3f4&skinColor=ffdbb4&eyes=default&eyebrows=default&mouth=smile&accessories=prescription01&clothesColor=262e33',
      false,
      NOW(),
      NOW()
    );
  ELSE
    -- Update existing user to admin
    UPDATE users 
    SET 
      role = 'admin',
      level = 999,
      xp = 999999,
      coins = 999999,
      streak = 999,
      ap_now = 999,
      ap_max = 999,
      attack_power = 999,
      defense_power = 999,
      admin_visible = false
    WHERE username = 'Mr. Sobbi';
  END IF;
END $$;

-- Step 3: Verify admin was created/updated
SELECT 
  username, 
  role, 
  level, 
  xp, 
  coins,
  admin_visible
FROM users 
WHERE username = 'Mr. Sobbi';

-- Expected: username='Mr. Sobbi', role='admin', godly stats, admin_visible=false
