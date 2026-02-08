-- ============================================================================
-- FIX: Add DELETE Policy for quiz_scores Table
-- ============================================================================
-- School admins need DELETE permission to remove student submissions
-- and allow students to retake tests.

-- Step 1: Check existing policies
SELECT 
  policyname,
  cmd,
  permissive,
  roles
FROM pg_policies 
WHERE tablename = 'quiz_scores'
ORDER BY cmd, policyname;

-- Step 2: Drop any conflicting DELETE policies
DROP POLICY IF EXISTS "Only admins can delete quiz scores" ON quiz_scores;
DROP POLICY IF EXISTS "Teachers can delete quiz scores" ON quiz_scores;
DROP POLICY IF EXISTS "School admins can delete quiz scores" ON quiz_scores;

-- Step 3: Create DELETE policy for school admins and teachers
-- Allows school admins and teachers to delete quiz submissions
CREATE POLICY "School admins and teachers can delete quiz scores" ON quiz_scores
  FOR DELETE
  USING (
    -- Allow if user is admin or teacher in their school
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND (
          u.role IN ('admin', 'teacher', 'school_admin')
          OR EXISTS (
            SELECT 1 FROM school_members sm
            WHERE sm.user_id = auth.uid()
              AND sm.role_in_school IN ('teacher', 'school_admin')
              AND sm.status = 'active'
          )
        )
    )
  );

-- Step 4: Grant DELETE permission to authenticated users
-- (The policy will still restrict to admins/teachers)
GRANT DELETE ON quiz_scores TO authenticated;

-- Step 5: Verify the new policy was created
SELECT 
  policyname,
  cmd,
  permissive
FROM pg_policies 
WHERE tablename = 'quiz_scores'
  AND cmd = 'DELETE'
ORDER BY policyname;

-- Step 6: Reload schema cache
NOTIFY pgrst, 'reload schema';
