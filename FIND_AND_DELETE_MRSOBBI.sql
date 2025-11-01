-- Find and delete the account using "Mr. Sobbi" username

-- Step 1: Find who has this username
SELECT id, email, username, role, level, xp, created_at 
FROM users 
WHERE username = 'Mr. Sobbi';

-- Step 2: After reviewing, delete it (uncomment the line below)
-- DELETE FROM users WHERE username = 'Mr. Sobbi';

-- Step 3: Verify it's gone
-- SELECT id, email, username FROM users WHERE username = 'Mr. Sobbi';
-- Should return NO ROWS
