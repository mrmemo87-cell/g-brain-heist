-- NUCLEAR RESET - Complete cleanup and fresh start
-- Run this to completely remove the admin user and start over

DELETE FROM users WHERE email = 'sobbi@bh.com';
DELETE FROM users WHERE username = 'Mr. Sobbi';

SELECT id, email, username FROM users 
WHERE email = 'sobbi@bh.com' OR username = 'Mr. Sobbi';


-- Find: sobbi@bh.com

-- Email: sobbi@bh.com


