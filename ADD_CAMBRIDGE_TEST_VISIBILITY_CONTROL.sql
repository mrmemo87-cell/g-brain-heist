-- ============================================================================
-- CAMBRIDGE TEST VISIBILITY CONTROL
-- ============================================================================
-- Purpose: Allow teachers to control which Cambridge tests are visible to 
--          their assigned grade/subject students
-- Features:
--   1. All tests available to teachers by default
--   2. Teachers toggle visibility per test for their grade/subject
--   3. Students only see tests marked as visible by their teachers
--   4. Fallback: If no visibility settings exist, show all grade-appropriate tests
-- ============================================================================

-- ============================================================================
-- STEP 1: Create cambridge_test_visibility table
-- ============================================================================

CREATE TABLE IF NOT EXISTS cambridge_test_visibility (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL,
  teacher_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  test_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  grade_level INTEGER NOT NULL,
  is_visible BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique visibility setting per teacher/test combo
  UNIQUE(school_id, teacher_user_id, test_id, subject, grade_level)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_cambridge_test_visibility_school 
  ON cambridge_test_visibility(school_id);
  
CREATE INDEX IF NOT EXISTS idx_cambridge_test_visibility_teacher 
  ON cambridge_test_visibility(teacher_user_id);
  
CREATE INDEX IF NOT EXISTS idx_cambridge_test_visibility_lookup 
  ON cambridge_test_visibility(school_id, grade_level, subject, is_visible);

COMMENT ON TABLE cambridge_test_visibility IS 
  'Controls which Cambridge tests are visible to students per teacher/grade/subject';

-- ============================================================================
-- STEP 2: Enable RLS on cambridge_test_visibility
-- ============================================================================

ALTER TABLE cambridge_test_visibility ENABLE ROW LEVEL SECURITY;

-- Teachers can view their own visibility settings
CREATE POLICY "Teachers can view own visibility settings" 
  ON cambridge_test_visibility
  FOR SELECT
  USING (
    teacher_user_id = auth.uid()
  );

-- Teachers can insert/update their own visibility settings
CREATE POLICY "Teachers can manage own visibility settings" 
  ON cambridge_test_visibility
  FOR ALL
  USING (
    teacher_user_id = auth.uid()
  );

-- School admins can view all visibility settings for their school
CREATE POLICY "School admins can view school visibility settings" 
  ON cambridge_test_visibility
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'admin'
        AND u.school_id = cambridge_test_visibility.school_id
    )
  );

-- ============================================================================
-- STEP 3: RPC Function - Get Visible Tests for Student
-- ============================================================================
-- Returns list of test IDs that should be visible to a student
-- based on their grade and their teachers' visibility settings

CREATE OR REPLACE FUNCTION get_visible_cambridge_tests_for_student(
  p_student_grade INTEGER,
  p_school_id UUID
)
RETURNS TABLE (
  test_id TEXT,
  subject TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Return tests marked as visible by teachers assigned to this grade/subject
  -- If no visibility settings exist for a grade/subject combo, return nothing
  -- (meaning teachers need to explicitly enable tests)
  
  RETURN QUERY
  SELECT DISTINCT 
    ctv.test_id,
    ctv.subject
  FROM cambridge_test_visibility ctv
  WHERE ctv.school_id = p_school_id
    AND ctv.grade_level = p_student_grade
    AND ctv.is_visible = TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION get_visible_cambridge_tests_for_student(INTEGER, UUID) TO authenticated;

COMMENT ON FUNCTION get_visible_cambridge_tests_for_student IS 
  'Returns Cambridge tests visible to students based on teacher visibility settings';

-- ============================================================================
-- STEP 4: RPC Function - Toggle Test Visibility (Teacher)
-- ============================================================================
-- Allows teachers to toggle visibility for a specific test

CREATE OR REPLACE FUNCTION toggle_cambridge_test_visibility(
  p_test_id TEXT,
  p_subject TEXT,
  p_grade_level INTEGER,
  p_is_visible BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher_user_id UUID;
  v_school_id UUID;
  v_role TEXT;
  v_has_assignment BOOLEAN;
BEGIN
  -- Get caller info
  v_teacher_user_id := auth.uid();
  
  IF v_teacher_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;
  
  -- Get school and role
  SELECT u.school_id, u.role 
  INTO v_school_id, v_role
  FROM users u
  WHERE u.id = v_teacher_user_id;
  
  -- Only teachers can use this function
  IF v_role NOT IN ('teacher', 'admin') THEN
    RETURN jsonb_build_object('error', 'Only teachers can manage test visibility');
  END IF;
  
  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No school membership');
  END IF;
  
  -- Check if teacher is assigned to this grade/subject
  -- Teachers can manage visibility for grades they teach
  SELECT EXISTS (
    SELECT 1 
    FROM class_teacher_assignments cta
    JOIN classes c ON c.id = cta.class_id
    WHERE cta.teacher_user_id = v_teacher_user_id
      AND cta.school_id = v_school_id
      AND cta.active = TRUE
      AND c.grade_level = p_grade_level
      AND (cta.subject = p_subject OR v_role = 'admin')
  ) INTO v_has_assignment;
  
  IF NOT v_has_assignment AND v_role != 'admin' THEN
    RETURN jsonb_build_object('error', 'Not assigned to this grade/subject');
  END IF;
  
  -- Upsert visibility setting
  INSERT INTO cambridge_test_visibility (
    school_id,
    teacher_user_id,
    test_id,
    subject,
    grade_level,
    is_visible,
    updated_at
  ) VALUES (
    v_school_id,
    v_teacher_user_id,
    p_test_id,
    p_subject,
    p_grade_level,
    p_is_visible,
    NOW()
  )
  ON CONFLICT (school_id, teacher_user_id, test_id, subject, grade_level)
  DO UPDATE SET
    is_visible = p_is_visible,
    updated_at = NOW();
  
  RETURN jsonb_build_object(
    'success', TRUE,
    'test_id', p_test_id,
    'is_visible', p_is_visible,
    'message', CASE 
      WHEN p_is_visible THEN 'Test is now visible to students'
      ELSE 'Test is now hidden from students'
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION toggle_cambridge_test_visibility(TEXT, TEXT, INTEGER, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION toggle_cambridge_test_visibility IS 
  'Allows teachers to toggle Cambridge test visibility for their assigned grades';

-- ============================================================================
-- STEP 5: RPC Function - Get Teacher's Visibility Settings
-- ============================================================================
-- Returns all visibility settings for the logged-in teacher

CREATE OR REPLACE FUNCTION get_teacher_test_visibility_settings()
RETURNS TABLE (
  test_id TEXT,
  subject TEXT,
  grade_level INTEGER,
  is_visible BOOLEAN,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher_user_id UUID;
  v_school_id UUID;
BEGIN
  v_teacher_user_id := auth.uid();
  
  IF v_teacher_user_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Get teacher's school
  SELECT u.school_id INTO v_school_id
  FROM users u
  WHERE u.id = v_teacher_user_id;
  
  -- Return all visibility settings for this teacher
  RETURN QUERY
  SELECT 
    ctv.test_id,
    ctv.subject,
    ctv.grade_level,
    ctv.is_visible,
    ctv.updated_at
  FROM cambridge_test_visibility ctv
  WHERE ctv.teacher_user_id = v_teacher_user_id
    AND ctv.school_id = v_school_id
  ORDER BY ctv.grade_level, ctv.subject, ctv.test_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_teacher_test_visibility_settings() TO authenticated;

COMMENT ON FUNCTION get_teacher_test_visibility_settings IS 
  'Returns all test visibility settings for the logged-in teacher';

-- ============================================================================
-- STEP 6: RPC Function - Bulk Set Test Visibility
-- ============================================================================
-- Allows teachers to set visibility for multiple tests at once

CREATE OR REPLACE FUNCTION bulk_set_cambridge_test_visibility(
  p_test_ids TEXT[],
  p_subject TEXT,
  p_grade_level INTEGER,
  p_is_visible BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher_user_id UUID;
  v_school_id UUID;
  v_role TEXT;
  v_has_assignment BOOLEAN;
  v_test_id TEXT;
  v_count INTEGER := 0;
BEGIN
  v_teacher_user_id := auth.uid();
  
  IF v_teacher_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;
  
  -- Get school and role
  SELECT u.school_id, u.role 
  INTO v_school_id, v_role
  FROM users u
  WHERE u.id = v_teacher_user_id;
  
  IF v_role NOT IN ('teacher', 'admin') THEN
    RETURN jsonb_build_object('error', 'Only teachers can manage test visibility');
  END IF;
  
  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No school membership');
  END IF;
  
  -- Check assignment
  SELECT EXISTS (
    SELECT 1 
    FROM class_teacher_assignments cta
    JOIN classes c ON c.id = cta.class_id
    WHERE cta.teacher_user_id = v_teacher_user_id
      AND cta.school_id = v_school_id
      AND cta.active = TRUE
      AND c.grade_level = p_grade_level
      AND (cta.subject = p_subject OR v_role = 'admin')
  ) INTO v_has_assignment;
  
  IF NOT v_has_assignment AND v_role != 'admin' THEN
    RETURN jsonb_build_object('error', 'Not assigned to this grade/subject');
  END IF;
  
  -- Process each test ID
  FOREACH v_test_id IN ARRAY p_test_ids
  LOOP
    INSERT INTO cambridge_test_visibility (
      school_id,
      teacher_user_id,
      test_id,
      subject,
      grade_level,
      is_visible,
      updated_at
    ) VALUES (
      v_school_id,
      v_teacher_user_id,
      v_test_id,
      p_subject,
      p_grade_level,
      p_is_visible,
      NOW()
    )
    ON CONFLICT (school_id, teacher_user_id, test_id, subject, grade_level)
    DO UPDATE SET
      is_visible = p_is_visible,
      updated_at = NOW();
    
    v_count := v_count + 1;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', TRUE,
    'updated_count', v_count,
    'message', v_count || ' test(s) updated'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION bulk_set_cambridge_test_visibility(TEXT[], TEXT, INTEGER, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION bulk_set_cambridge_test_visibility IS 
  'Bulk update visibility for multiple Cambridge tests';

-- ============================================================================
-- STEP 7: Helper Function - Check if Test is Visible to Student
-- ============================================================================

CREATE OR REPLACE FUNCTION is_cambridge_test_visible_to_student(
  p_test_id TEXT,
  p_student_grade INTEGER,
  p_school_id UUID,
  p_subject TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_visible BOOLEAN;
BEGIN
  -- Check if any teacher has made this test visible for this grade/subject
  SELECT EXISTS (
    SELECT 1 
    FROM cambridge_test_visibility ctv
    WHERE ctv.school_id = p_school_id
      AND ctv.test_id = p_test_id
      AND ctv.subject = p_subject
      AND ctv.grade_level = p_student_grade
      AND ctv.is_visible = TRUE
  ) INTO v_is_visible;
  
  RETURN v_is_visible;
END;
$$;

GRANT EXECUTE ON FUNCTION is_cambridge_test_visible_to_student(TEXT, INTEGER, UUID, TEXT) TO authenticated;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check table exists
-- SELECT EXISTS (SELECT FROM pg_tables WHERE tablename = 'cambridge_test_visibility');

-- Check functions exist
-- SELECT COUNT(*) FROM pg_proc WHERE proname LIKE '%cambridge_test_visibility%';

-- View all visibility settings (as teacher)
-- SELECT * FROM get_teacher_test_visibility_settings();

-- Test visibility for a student (example)
-- SELECT * FROM get_visible_cambridge_tests_for_student(8, 'school-uuid-here');

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Next Steps:
-- 1. Run this migration in Supabase SQL Editor
-- 2. Update CambridgeTestsHub.tsx to fetch and respect visibility settings
-- 3. Add teacher UI in TeacherPortal.tsx for managing visibility
-- 4. Test with real teacher/student accounts
-- ============================================================================
