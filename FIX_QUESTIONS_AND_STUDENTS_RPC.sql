-- ============================================================
-- Fix Questions Table RLS and Students RPC
-- ============================================================

-- 1. Fix RLS on questions table (not teacher_questions!)
-- ============================================================

-- Drop ALL existing policies on questions table
DROP POLICY IF EXISTS "questions_student_read" ON questions;
DROP POLICY IF EXISTS "questions_teacher_access" ON questions;
DROP POLICY IF EXISTS "questions_read_all" ON questions;
DROP POLICY IF EXISTS "questions_write_own" ON questions;
DROP POLICY IF EXISTS "Enable read access for all users" ON questions;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON questions;
DROP POLICY IF EXISTS "Enable update for users based on teacher_id" ON questions;
DROP POLICY IF EXISTS "Enable delete for users based on teacher_id" ON questions;

-- Allow ALL authenticated users to read questions
CREATE POLICY "questions_read_all"
ON questions
FOR SELECT
TO authenticated
USING (true);

-- Teachers can only INSERT their own questions
CREATE POLICY "questions_insert_own"
ON questions
FOR INSERT
TO authenticated
WITH CHECK (teacher_id = auth.uid());

-- Teachers can only UPDATE their own questions
CREATE POLICY "questions_update_own"
ON questions
FOR UPDATE
TO authenticated
USING (teacher_id = auth.uid())
WITH CHECK (teacher_id = auth.uid());

-- Teachers can only DELETE their own questions
CREATE POLICY "questions_delete_own"
ON questions
FOR DELETE
TO authenticated
USING (teacher_id = auth.uid());

-- 2. Fix rpc_get_students_for_assignment to handle NULL gracefully
-- ============================================================

DROP FUNCTION IF EXISTS rpc_get_students_for_assignment(uuid);

CREATE OR REPLACE FUNCTION rpc_get_students_for_assignment(
  p_teacher_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  grade smallint,
  batch text,
  avatar_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id::uuid,
    u.username::text,
    u.username::text as display_name,
    CASE 
      WHEN u.grade IS NULL THEN 0::smallint
      WHEN u.grade ~ '^\d+$' THEN u.grade::smallint
      ELSE 0::smallint
    END as grade,
    COALESCE(u.batch, 'N/A'::text) as batch,
    u.avatar_url::text
  FROM users u
  WHERE COALESCE(u.role, 'student') = 'student'
    AND NOT COALESCE(u.is_banned, false)
  ORDER BY 
    CASE 
      WHEN u.grade IS NULL THEN 0::smallint
      WHEN u.grade ~ '^\d+$' THEN u.grade::smallint
      ELSE 0::smallint
    END,
    u.batch, 
    u.username;
$$;

-- 3. Verify questions table policies
-- ============================================================
SELECT 
    tablename, 
    policyname, 
    permissive, 
    roles, 
    cmd 
FROM pg_policies
WHERE tablename = 'questions'
ORDER BY policyname;

-- 4. Test questions query
-- ============================================================
SELECT 
    id,
    teacher_id,
    subject,
    topic,
    question_text,
    difficulty,
    question_type,
    created_at
FROM questions
ORDER BY created_at DESC
LIMIT 5;

-- 5. Test students RPC
-- ============================================================
SELECT * FROM rpc_get_students_for_assignment(NULL);
