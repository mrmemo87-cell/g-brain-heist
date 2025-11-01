-- INITIALIZE ADMIN GAME DATA
-- Creates required records for admin user to work properly

-- Set tutorial as completed for admin
UPDATE users 
SET tutorial_completed = true 
WHERE email = 'admin@g-brain-heist.com';

-- Verify admin setup
SELECT 
  u.id,
  u.email,
  u.username,
  u.role,
  u.batch,
  u.level,
  u.xp,
  u.coins,
  u.tutorial_completed
FROM users u
WHERE u.email = 'admin@g-brain-heist.com';
