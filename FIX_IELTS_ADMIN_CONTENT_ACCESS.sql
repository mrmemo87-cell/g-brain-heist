-- ============================================================
-- FIX IELTS ADMIN CONTENT ACCESS
-- ============================================================
-- This script updates RLS policies to allow admins/teachers to see ALL content
-- (not just active content) in the admin dashboard.
-- ============================================================

-- Drop existing restrictive policies and create new ones that allow admin access

-- ============================================================
-- READING SETS
-- ============================================================
DROP POLICY IF EXISTS "Reading sets selectable when active" ON ielts_reading_sets;
DROP POLICY IF EXISTS "Allow read active reading sets" ON ielts_reading_sets;
DROP POLICY IF EXISTS "Anyone can view active reading sets" ON ielts_reading_sets;
DROP POLICY IF EXISTS "Reading sets viewable by authenticated users" ON ielts_reading_sets;

-- Allow authenticated users to see all reading sets (for admin dashboard)
CREATE POLICY "Reading sets viewable by authenticated users" ON ielts_reading_sets
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- ============================================================
-- LISTENING SETS
-- ============================================================
DROP POLICY IF EXISTS "Listening sets selectable when active" ON ielts_listening_sets;
DROP POLICY IF EXISTS "Allow read active listening sets" ON ielts_listening_sets;
DROP POLICY IF EXISTS "Anyone can view active listening sets" ON ielts_listening_sets;
DROP POLICY IF EXISTS "Listening sets viewable by authenticated users" ON ielts_listening_sets;

-- Allow authenticated users to see all listening sets
CREATE POLICY "Listening sets viewable by authenticated users" ON ielts_listening_sets
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- ============================================================
-- WRITING TASKS
-- ============================================================
DROP POLICY IF EXISTS "Writing tasks selectable when active" ON ielts_writing_tasks;
DROP POLICY IF EXISTS "Allow read active writing tasks" ON ielts_writing_tasks;
DROP POLICY IF EXISTS "Anyone can view active writing tasks" ON ielts_writing_tasks;
DROP POLICY IF EXISTS "Writing tasks viewable by authenticated users" ON ielts_writing_tasks;

-- Allow authenticated users to see all writing tasks
CREATE POLICY "Writing tasks viewable by authenticated users" ON ielts_writing_tasks
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- ============================================================
-- SPEAKING TASKS  
-- ============================================================
DROP POLICY IF EXISTS "Speaking tasks selectable when active" ON ielts_speaking_tasks;
DROP POLICY IF EXISTS "Allow read active speaking tasks" ON ielts_speaking_tasks;
DROP POLICY IF EXISTS "Anyone can view active speaking tasks" ON ielts_speaking_tasks;
DROP POLICY IF EXISTS "Speaking tasks viewable by authenticated users" ON ielts_speaking_tasks;

-- Allow authenticated users to see all speaking tasks
CREATE POLICY "Speaking tasks viewable by authenticated users" ON ielts_speaking_tasks
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- ============================================================
-- VERIFICATION
-- ============================================================
SELECT '✅ IELTS Admin Content Access Policies Updated' AS status;

-- Show current counts
SELECT 'Reading Sets' AS table_name, COUNT(*) AS total_count, 
       SUM(CASE WHEN is_active THEN 1 ELSE 0 END) AS active_count
FROM ielts_reading_sets
UNION ALL
SELECT 'Listening Sets', COUNT(*), SUM(CASE WHEN is_active THEN 1 ELSE 0 END)
FROM ielts_listening_sets
UNION ALL
SELECT 'Writing Tasks', COUNT(*), SUM(CASE WHEN is_active THEN 1 ELSE 0 END)
FROM ielts_writing_tasks
UNION ALL
SELECT 'Speaking Tasks', COUNT(*), SUM(CASE WHEN is_active THEN 1 ELSE 0 END)
FROM ielts_speaking_tasks;
