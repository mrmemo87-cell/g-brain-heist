-- Add UPDATE policy for teachers to mark Cambridge Writing tests
-- Run this in your Supabase SQL Editor

-- First, check if the policy exists and drop it if needed
DROP POLICY IF EXISTS "Teachers can update quiz scores" ON quiz_scores;

-- Create policy: Teachers/Admins can update quiz scores (for marking writing tests)
CREATE POLICY "Teachers can update quiz scores" ON quiz_scores
  FOR UPDATE
  USING (
    -- Allow if the current user is a teacher or admin
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND (users.is_admin = true OR users.role IN ('teacher', 'admin'))
    )
  )
  WITH CHECK (
    -- Same check for the updated row
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND (users.is_admin = true OR users.role IN ('teacher', 'admin'))
    )
  );

-- Grant UPDATE permission to authenticated users (policy will still restrict to teachers)
GRANT UPDATE ON quiz_scores TO authenticated;

-- Verify the policies exist
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies 
WHERE tablename = 'quiz_scores';
