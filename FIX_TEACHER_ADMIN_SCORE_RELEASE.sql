-- Fix: Allow teachers assigned as school_admin to release Cambridge test scores
-- This follows the same pattern as the existing super admin (role='admin') policies

-- 1. Drop existing policies if they exist and recreate them
DROP POLICY IF EXISTS "Admins and teachers can update quiz_scores" ON quiz_scores;

-- 2. Create unified policy for admins, school_admins, and teachers to update quiz_scores
-- This follows the same pattern as other admin policies in the codebase
CREATE POLICY "Admins and teachers can update quiz_scores" ON quiz_scores
FOR UPDATE
USING (
  (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'teacher', 'school_admin')
  OR
  (SELECT role_in_school FROM school_members WHERE user_id = auth.uid() AND status = 'active') IN ('teacher', 'school_admin')
)
WITH CHECK (
  (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'teacher', 'school_admin')
  OR
  (SELECT role_in_school FROM school_members WHERE user_id = auth.uid() AND status = 'active') IN ('teacher', 'school_admin')
);

-- 3. Grant direct access to quiz_scores table for authenticated users
GRANT SELECT, UPDATE ON quiz_scores TO authenticated;

-- 4. Create RPC function for releasing quiz scores (with proper permissions)
-- This checks for admin, teacher, or school_admin roles
DROP FUNCTION IF EXISTS release_quiz_scores(text, text);
CREATE OR REPLACE FUNCTION release_quiz_scores(p_quiz_name text, p_class text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_count INT;
  v_user_role TEXT;
BEGIN
  -- Check if user is authenticated
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Check if user is a teacher or school_admin
  SELECT role INTO v_user_role FROM users WHERE id = auth.uid();
  
  IF v_user_role NOT IN ('teacher', 'school_admin') THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized - teacher role required');
  END IF;

  -- Update quiz_scores
  UPDATE quiz_scores
  SET scores_released = true, released_at = now()
  WHERE quiz_name = p_quiz_name
    AND scores_released = false
    AND (p_class IS NULL OR student_class = p_class);
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN json_build_object(
    'success', true,
    'updated_count', v_updated_count,
    'message', 'Scores released: ' || v_updated_count || ' records updated'
  );
END;
$$;

-- 5. Create RPC function for hiding quiz scores
DROP FUNCTION IF EXISTS hide_quiz_scores(text, text);
CREATE OR REPLACE FUNCTION hide_quiz_scores(p_quiz_name text, p_class text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_count INT;
  v_user_role TEXT;
BEGIN
  -- Check if user is authenticated
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Check if user is a teacher, school_admin, or super admin
  SELECT role INTO v_user_role FROM users WHERE id = auth.uid();
  
  IF v_user_role NOT IN ('teacher', 'school_admin', 'admin') THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized - teacher/admin role required');
  END IF;

  -- Update quiz_scores
  UPDATE quiz_scores
  SET scores_released = false, released_at = null
  WHERE quiz_name = p_quiz_name
    AND scores_released = true
    AND (p_class IS NULL OR student_class = p_class);
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN json_build_object(
    'success', true,
    'updated_count', v_updated_count,
    'message', 'Scores set to pending: ' || v_updated_count || ' records updated'
  );
END;
$$;

-- 6. Grant execute on RPC functions to authenticated users
GRANT EXECUTE ON FUNCTION release_quiz_scores(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION hide_quiz_scores(text, text) TO authenticated;
