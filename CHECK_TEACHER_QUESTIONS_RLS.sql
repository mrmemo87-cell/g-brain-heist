-- ============================================================
-- Check teacher_questions RLS policies and test query
-- ============================================================

-- 1. Check all existing RLS policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual as using_expression,
    with_check as with_check_expression
FROM pg_policies
WHERE tablename = 'teacher_questions'
ORDER BY policyname;

-- 2. Check if RLS is enabled on the table
SELECT 
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename = 'teacher_questions';

-- 3. Test query to see what's actually returned
-- Run this as your current authenticated user (mr.smith@bh.com)
SELECT 
    id,
    teacher_id,
    subject,
    topic,
    question_text,
    difficulty,
    question_type,
    created_at
FROM teacher_questions
ORDER BY created_at DESC
LIMIT 10;

-- 4. Check current authenticated user
SELECT 
    auth.uid() as current_user_id,
    auth.email() as current_user_email;

-- 5. Count total questions in the table (bypass RLS with admin privileges if needed)
SELECT COUNT(*) as total_questions
FROM teacher_questions;
