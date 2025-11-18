-- ============================================================
-- DIAGNOSE LOGIN ISSUES
-- ============================================================
-- Run this to check why existing users can't log in
-- ============================================================

-- Check if users table exists and has required columns
SELECT 
    'Users Table Columns' as check_type,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'users'
ORDER BY ordinal_position;

-- Check RLS status on users table
SELECT 
    'RLS Status' as check_type,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename = 'users';

-- Check RLS policies on users table
SELECT 
    'RLS Policies' as check_type,
    policyname as policy_name,
    cmd as command,
    qual as using_clause,
    with_check as with_check_clause
FROM pg_policies
WHERE tablename = 'users';

-- Sample user data (check for issues)
SELECT 
    'Sample Users' as check_type,
    id,
    email,
    username,
    role,
    grade,
    batch,
    is_banned,
    created_at
FROM users
ORDER BY created_at DESC
LIMIT 5;

-- Check for users with missing critical fields
SELECT 
    'Users Missing Role' as check_type,
    COUNT(*) as count
FROM users
WHERE role IS NULL;

SELECT 
    'Users Missing Username' as check_type,
    COUNT(*) as count
FROM users
WHERE username IS NULL OR username = '';

-- Check auth.users vs users table mismatch
SELECT 
    'Auth Users Not In Users Table' as check_type,
    au.id,
    au.email,
    au.created_at
FROM auth.users au
LEFT JOIN users u ON au.id = u.id
WHERE u.id IS NULL
LIMIT 10;
