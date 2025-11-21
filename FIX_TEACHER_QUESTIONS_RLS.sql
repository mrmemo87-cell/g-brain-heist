-- ============================================================
-- Fix teacher_questions RLS for Clan Territory Battles
-- ============================================================
-- Allow all authenticated users to READ all questions
-- (Teachers can still only edit their own questions)
-- ============================================================

-- Drop ALL existing policies to start fresh
DROP POLICY IF EXISTS "teacher_questions_student_read" ON teacher_questions;
DROP POLICY IF EXISTS "teacher_questions_teacher_access" ON teacher_questions;
DROP POLICY IF EXISTS "teacher_questions_read_all" ON teacher_questions;
DROP POLICY IF EXISTS "teacher_questions_write_own" ON teacher_questions;
DROP POLICY IF EXISTS "Enable read access for all users" ON teacher_questions;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON teacher_questions;
DROP POLICY IF EXISTS "Enable update for users based on teacher_id" ON teacher_questions;
DROP POLICY IF EXISTS "Enable delete for users based on teacher_id" ON teacher_questions;

-- Allow ALL authenticated users to read questions
-- This lets students and teachers see questions from any teacher for battles
CREATE POLICY "teacher_questions_read_all"
ON teacher_questions
FOR SELECT
TO authenticated
USING (true);

-- Teachers can only INSERT their own questions
CREATE POLICY "teacher_questions_insert_own"
ON teacher_questions
FOR INSERT
TO authenticated
WITH CHECK (teacher_id = auth.uid());

-- Teachers can only UPDATE their own questions
CREATE POLICY "teacher_questions_update_own"
ON teacher_questions
FOR UPDATE
TO authenticated
USING (teacher_id = auth.uid())
WITH CHECK (teacher_id = auth.uid());

-- Teachers can only DELETE their own questions
CREATE POLICY "teacher_questions_delete_own"
ON teacher_questions
FOR DELETE
TO authenticated
USING (teacher_id = auth.uid());

-- Verify the policies
SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'teacher_questions'
ORDER BY policyname;
