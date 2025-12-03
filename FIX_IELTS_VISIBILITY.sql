-- FIX IELTS SETS VISIBILITY
-- Run each section one at a time in Supabase SQL Editor

-- ============================================
-- STEP 1: CHECK IF is_active IS THE ISSUE
-- ============================================

-- See all reading sets with their is_active status
SELECT id, title, is_active FROM ielts_reading_sets;

-- See all listening sets with their is_active status  
SELECT id, title, is_active FROM ielts_listening_sets;

-- See all writing tasks with their is_active status
SELECT id, title, task_type, is_active FROM ielts_writing_tasks;

-- See all speaking tasks with their is_active status
SELECT id, part, prompt, is_active FROM ielts_speaking_tasks;

-- ============================================
-- STEP 2: ACTIVATE ALL SETS (set is_active = true)
-- ============================================

UPDATE ielts_reading_sets SET is_active = true;
UPDATE ielts_listening_sets SET is_active = true;
UPDATE ielts_writing_tasks SET is_active = true;
UPDATE ielts_speaking_tasks SET is_active = true;

-- ============================================
-- STEP 3: CHECK RLS POLICIES
-- ============================================

-- Check if RLS is enabled on these tables
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('ielts_reading_sets', 'ielts_listening_sets', 'ielts_writing_tasks', 'ielts_speaking_tasks');

-- ============================================
-- STEP 4: ADD PUBLIC READ POLICIES (if RLS is blocking)
-- ============================================

-- Allow anyone to read active reading sets
DROP POLICY IF EXISTS "Anyone can view active reading sets" ON ielts_reading_sets;
CREATE POLICY "Anyone can view active reading sets" ON ielts_reading_sets
    FOR SELECT USING (is_active = true);

-- Allow anyone to read active listening sets
DROP POLICY IF EXISTS "Anyone can view active listening sets" ON ielts_listening_sets;
CREATE POLICY "Anyone can view active listening sets" ON ielts_listening_sets
    FOR SELECT USING (is_active = true);

-- Allow anyone to read active writing tasks
DROP POLICY IF EXISTS "Anyone can view active writing tasks" ON ielts_writing_tasks;
CREATE POLICY "Anyone can view active writing tasks" ON ielts_writing_tasks
    FOR SELECT USING (is_active = true);

-- Allow anyone to read active speaking tasks
DROP POLICY IF EXISTS "Anyone can view active speaking tasks" ON ielts_speaking_tasks;
CREATE POLICY "Anyone can view active speaking tasks" ON ielts_speaking_tasks
    FOR SELECT USING (is_active = true);

-- ============================================
-- STEP 5: VERIFY EVERYTHING WORKS
-- ============================================

SELECT 'Reading Sets' as type, COUNT(*) as count FROM ielts_reading_sets WHERE is_active = true
UNION ALL
SELECT 'Listening Sets', COUNT(*) FROM ielts_listening_sets WHERE is_active = true
UNION ALL
SELECT 'Writing Tasks', COUNT(*) FROM ielts_writing_tasks WHERE is_active = true
UNION ALL
SELECT 'Speaking Tasks', COUNT(*) FROM ielts_speaking_tasks WHERE is_active = true;
