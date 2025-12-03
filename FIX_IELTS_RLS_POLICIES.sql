-- FIX IELTS RLS POLICIES FOR FRONTEND ACCESS
-- Run this in Supabase SQL Editor

-- ============================================
-- STEP 1: CHECK RLS STATUS ON ALL TABLES
-- ============================================

SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename LIKE 'ielts_%';

-- ============================================
-- STEP 2: CHECK EXISTING POLICIES
-- ============================================

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies 
WHERE tablename LIKE 'ielts_%';

-- ============================================
-- STEP 3: ADD SELECT POLICIES FOR ALL IELTS TABLES
-- These allow authenticated users to read active sets
-- ============================================

-- Reading Sets
DROP POLICY IF EXISTS "Allow read active reading sets" ON ielts_reading_sets;
CREATE POLICY "Allow read active reading sets" ON ielts_reading_sets
    FOR SELECT TO authenticated, anon
    USING (is_active = true);

-- Listening Sets
DROP POLICY IF EXISTS "Allow read active listening sets" ON ielts_listening_sets;
CREATE POLICY "Allow read active listening sets" ON ielts_listening_sets
    FOR SELECT TO authenticated, anon
    USING (is_active = true);

-- Writing Tasks
DROP POLICY IF EXISTS "Allow read active writing tasks" ON ielts_writing_tasks;
CREATE POLICY "Allow read active writing tasks" ON ielts_writing_tasks
    FOR SELECT TO authenticated, anon
    USING (is_active = true);

-- Speaking Tasks
DROP POLICY IF EXISTS "Allow read active speaking tasks" ON ielts_speaking_tasks;
CREATE POLICY "Allow read active speaking tasks" ON ielts_speaking_tasks
    FOR SELECT TO authenticated, anon
    USING (is_active = true);

-- Reading Questions (needed for practice)
DROP POLICY IF EXISTS "Allow read reading questions" ON ielts_reading_questions;
CREATE POLICY "Allow read reading questions" ON ielts_reading_questions
    FOR SELECT TO authenticated, anon
    USING (true);

-- Listening Questions (needed for practice)
DROP POLICY IF EXISTS "Allow read listening questions" ON ielts_listening_questions;
CREATE POLICY "Allow read listening questions" ON ielts_listening_questions
    FOR SELECT TO authenticated, anon
    USING (true);

-- ============================================
-- STEP 4: VERIFY POLICIES WERE CREATED
-- ============================================

SELECT tablename, policyname, cmd
FROM pg_policies 
WHERE tablename IN (
    'ielts_reading_sets', 
    'ielts_listening_sets', 
    'ielts_writing_tasks', 
    'ielts_speaking_tasks',
    'ielts_reading_questions',
    'ielts_listening_questions'
);

-- ============================================
-- STEP 5: TEST - Count active sets
-- ============================================

SELECT 'Reading Sets' as type, COUNT(*) as count FROM ielts_reading_sets WHERE is_active = true
UNION ALL
SELECT 'Listening Sets', COUNT(*) FROM ielts_listening_sets WHERE is_active = true
UNION ALL
SELECT 'Writing Tasks', COUNT(*) FROM ielts_writing_tasks WHERE is_active = true
UNION ALL
SELECT 'Speaking Tasks', COUNT(*) FROM ielts_speaking_tasks WHERE is_active = true;
