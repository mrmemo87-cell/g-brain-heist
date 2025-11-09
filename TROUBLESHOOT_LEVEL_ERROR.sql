-- ============================================
-- Troubleshooting: Column "level" Error
-- ============================================
-- This script helps identify where the "column level does not exist" error comes from

-- Verify users table structure
\d users;

-- Check if profiles view can be queried
SELECT * FROM profiles LIMIT 1;

-- Check columns in all tables
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name IN ('users', 'profiles', 'activities', 'attempts', 'mcq_questions')
ORDER BY table_name, ordinal_position;

-- Check for any table with a 'level' column
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
AND column_name = 'level'
ORDER BY table_name;

-- Verify the users table has the level column
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'users'
AND column_name = 'level';
