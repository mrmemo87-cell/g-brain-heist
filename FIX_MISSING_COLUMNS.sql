-- ============================================================
-- FIX MISSING COLUMNS IN USERS TABLE
-- ============================================================
-- Run this to add any missing columns that prevent login
-- Safe to run multiple times (uses IF NOT EXISTS)
-- ============================================================

-- Add role column (required for login)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'role'
    ) THEN
        ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'student' 
        CHECK (role IN ('student', 'teacher', 'admin'));
        RAISE NOTICE 'Added role column to users table';
    ELSE
        RAISE NOTICE 'role column already exists';
    END IF;
END $$;

-- Add gemstones column (required by whoami)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'gemstones'
    ) THEN
        ALTER TABLE users ADD COLUMN gemstones INTEGER DEFAULT 0;
        RAISE NOTICE 'Added gemstones column to users table';
    ELSE
        RAISE NOTICE 'gemstones column already exists';
    END IF;
END $$;

-- Add tutorial_completed column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'tutorial_completed'
    ) THEN
        ALTER TABLE users ADD COLUMN tutorial_completed BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Added tutorial_completed column to users table';
    ELSE
        RAISE NOTICE 'tutorial_completed column already exists';
    END IF;
END $$;

-- Add last_attacked_at column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'last_attacked_at'
    ) THEN
        ALTER TABLE users ADD COLUMN last_attacked_at TIMESTAMPTZ;
        RAISE NOTICE 'Added last_attacked_at column to users table';
    ELSE
        RAISE NOTICE 'last_attacked_at column already exists';
    END IF;
END $$;

-- Add total_questions_answered column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'total_questions_answered'
    ) THEN
        ALTER TABLE users ADD COLUMN total_questions_answered INTEGER DEFAULT 0;
        RAISE NOTICE 'Added total_questions_answered column to users table';
    ELSE
        RAISE NOTICE 'total_questions_answered column already exists';
    END IF;
END $$;

-- Add achievement_points column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'achievement_points'
    ) THEN
        ALTER TABLE users ADD COLUMN achievement_points INTEGER DEFAULT 0;
        RAISE NOTICE 'Added achievement_points column to users table';
    ELSE
        RAISE NOTICE 'achievement_points column already exists';
    END IF;
END $$;

-- First, modify the batch constraint to allow 'N/A'
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_batch_check;
ALTER TABLE users ADD CONSTRAINT users_batch_check 
    CHECK (batch IS NULL OR batch IN ('8A', '8B', '8C', '9A', '9B', '9C', 'N/A'));

-- Update existing users without role to have student role
UPDATE users SET role = 'student' WHERE role IS NULL;

-- Update existing users without batch to 'N/A'
UPDATE users SET batch = 'N/A' WHERE batch IS NULL AND role = 'student';

-- Verify all columns exist
SELECT 
    'Column Verification' as status,
    CASE 
        WHEN COUNT(*) = 6 THEN '✅ All required columns exist'
        ELSE '⚠️ Missing ' || (6 - COUNT(*))::TEXT || ' columns'
    END as result
FROM information_schema.columns
WHERE table_name = 'users' 
AND column_name IN ('role', 'gemstones', 'tutorial_completed', 'last_attacked_at', 'total_questions_answered', 'achievement_points');

-- Show sample user to verify
SELECT 
    '✅ Sample User Data' as status,
    username,
    role,
    gemstones,
    tutorial_completed
FROM users
LIMIT 1;
