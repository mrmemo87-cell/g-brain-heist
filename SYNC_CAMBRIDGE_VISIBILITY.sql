-- ============================================================================
-- SYNCHRONIZED CAMBRIDGE TEST VISIBILITY
-- ============================================================================
-- Purpose: Change teacher-level visibility from per-teacher to shared
--          (per school/grade/subject). When any teacher toggles a test,
--          ALL teachers in the same school teaching the same grade+subject
--          see the same state.
--
-- Before:  UNIQUE(school_id, teacher_user_id, test_id, subject, grade_level)
--          → each teacher manages independent settings
--
-- After:   UNIQUE(school_id, test_id, subject, grade_level)
--          → teacher_user_id becomes "last modified by"
--          → all teachers share one visibility row per test/grade/subject
--
-- Changes:
--   1. Deduplicate existing rows (keep most recent per school/test/subject/grade)
--   2. Drop old unique constraint, add new one
--   3. Update RLS policies (school-scoped instead of teacher-scoped)
--   4. Update toggle_cambridge_test_visibility (shared upsert)
--   5. Update bulk_set_cambridge_test_visibility (shared upsert)
--   6. Update get_all_cambridge_tests (remove teacher_user_id join filter)
--   7. Update get_teacher_test_visibility_settings (return school-shared settings)
--   8. get_visible_cambridge_tests_for_student — no change needed
--   9. is_cambridge_test_visible_to_student — no change needed
-- ============================================================================


-- ============================================================================
-- STEP 1: Deduplicate existing rows
-- ============================================================================
-- Multiple teachers may have toggled the same test. Keep only the most
-- recently updated row for each (school_id, test_id, subject, grade_level).

DELETE FROM cambridge_test_visibility
WHERE id NOT IN (
  SELECT DISTINCT ON (school_id, test_id, subject, grade_level) id
  FROM cambridge_test_visibility
  ORDER BY school_id, test_id, subject, grade_level, updated_at DESC
);


-- ============================================================================
-- STEP 2: Swap the unique constraint
-- ============================================================================

-- Drop old per-teacher unique constraint
ALTER TABLE cambridge_test_visibility
  DROP CONSTRAINT IF EXISTS cambridge_test_visibility_school_id_teacher_user_id_test_id_key;

-- Also try the shorter auto-generated name variant
ALTER TABLE cambridge_test_visibility
  DROP CONSTRAINT IF EXISTS cambridge_test_visibility_school_id_teacher_user_id_test__key;

-- Add new shared unique constraint (no teacher_user_id) — skip if already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cambridge_test_visibility_school_test_subject_grade_key'
  ) THEN
    ALTER TABLE cambridge_test_visibility
      ADD CONSTRAINT cambridge_test_visibility_school_test_subject_grade_key
      UNIQUE (school_id, test_id, subject, grade_level);
  END IF;
END $$;


-- ============================================================================
-- STEP 3: Update RLS policies — school-scoped instead of teacher-scoped
-- ============================================================================

-- Drop old teacher-scoped policies
DROP POLICY IF EXISTS "Teachers can view own visibility settings" ON cambridge_test_visibility;
DROP POLICY IF EXISTS "Teachers can manage own visibility settings" ON cambridge_test_visibility;
DROP POLICY IF EXISTS "School admins can view school visibility settings" ON cambridge_test_visibility;

-- Drop new policies too (idempotent re-run)
DROP POLICY IF EXISTS "Teachers can view school visibility settings" ON cambridge_test_visibility;
DROP POLICY IF EXISTS "Teachers can manage school visibility settings" ON cambridge_test_visibility;

-- Teachers can view all shared visibility settings for their school
CREATE POLICY "Teachers can view school visibility settings"
  ON cambridge_test_visibility
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('teacher', 'admin')
        AND u.school_id = cambridge_test_visibility.school_id
    )
  );

-- Teachers can insert/update/delete shared visibility settings for their school
CREATE POLICY "Teachers can manage school visibility settings"
  ON cambridge_test_visibility
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('teacher', 'admin')
        AND u.school_id = cambridge_test_visibility.school_id
    )
  );


-- ============================================================================
-- STEP 4: Update toggle_cambridge_test_visibility — shared upsert
-- ============================================================================

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
  v_teacher_user_id := auth.uid();

  IF v_teacher_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

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

  -- Check if teacher is assigned to this grade/subject
  SELECT EXISTS (
    SELECT 1
    FROM class_teacher_assignments cta
    JOIN classes c ON c.id = cta.class_id
    WHERE cta.teacher_user_id = v_teacher_user_id
      AND cta.school_id = v_school_id
      AND cta.active = TRUE
      AND c.grade_level::INTEGER = p_grade_level
      AND (
        cta.subject ILIKE '%' || SPLIT_PART(p_subject, ' ', 1) || '%'
        OR p_subject ILIKE '%' || cta.subject || '%'
        OR v_role = 'admin'
      )
  ) INTO v_has_assignment;

  IF NOT v_has_assignment AND v_role != 'admin' THEN
    RETURN jsonb_build_object('error', 'Not assigned to this grade/subject');
  END IF;

  -- Shared upsert — keyed on school/test/subject/grade (NOT per-teacher)
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
  ON CONFLICT (school_id, test_id, subject, grade_level)
  DO UPDATE SET
    is_visible = p_is_visible,
    teacher_user_id = v_teacher_user_id,   -- track who last changed it
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
  'Toggle Cambridge test visibility (shared across all teachers in the same school/grade/subject)';


-- ============================================================================
-- STEP 5: Update bulk_set_cambridge_test_visibility — shared upsert
-- ============================================================================

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
      AND c.grade_level::INTEGER = p_grade_level
      AND (
        cta.subject ILIKE '%' || SPLIT_PART(p_subject, ' ', 1) || '%'
        OR p_subject ILIKE '%' || cta.subject || '%'
        OR v_role = 'admin'
      )
  ) INTO v_has_assignment;

  IF NOT v_has_assignment AND v_role != 'admin' THEN
    RETURN jsonb_build_object('error', 'Not assigned to this grade/subject');
  END IF;

  -- Shared upsert — keyed on school/test/subject/grade (NOT per-teacher)
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
    ON CONFLICT (school_id, test_id, subject, grade_level)
    DO UPDATE SET
      is_visible = p_is_visible,
      teacher_user_id = v_teacher_user_id,   -- track who last changed it
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
  'Bulk update visibility for multiple Cambridge tests (shared across all teachers in the same school/grade/subject)';


-- ============================================================================
-- STEP 6: Update get_all_cambridge_tests — remove teacher_user_id from join
-- ============================================================================
-- Now ALL teachers in the same school see the same visibility state.

CREATE OR REPLACE FUNCTION get_all_cambridge_tests(
  p_grade_level INTEGER,
  p_subject TEXT
)
RETURNS TABLE (
  test_id TEXT,
  test_name TEXT,
  description TEXT,
  duration TEXT,
  total_questions INTEGER,
  difficulty TEXT,
  category TEXT,
  subject TEXT,
  test_url TEXT,
  requires_marking BOOLEAN,
  is_visible BOOLEAN
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

  SELECT u.school_id INTO v_school_id
  FROM users u
  WHERE u.id = v_teacher_user_id;

  -- Return tests with SHARED visibility (no teacher_user_id filter)
  RETURN QUERY
  SELECT
    ct.id,
    ct.name,
    ct.description,
    ct.duration,
    ct.total_questions,
    ct.difficulty,
    ct.category,
    ct.subject,
    ct.test_url,
    ct.requires_marking,
    COALESCE(ctv.is_visible, FALSE) AS is_visible
  FROM cambridge_tests ct
  LEFT JOIN cambridge_test_visibility ctv
    ON ctv.test_id = ct.id
    AND ctv.school_id = v_school_id
    AND ctv.grade_level = p_grade_level
    AND ctv.subject = ct.subject
  WHERE ct.subject = p_subject
    -- school-level override
    AND NOT EXISTS (
      SELECT 1
      FROM school_cambridge_test_visibility sctv
      WHERE sctv.school_id = v_school_id
        AND sctv.test_id = ct.id
        AND sctv.is_visible = FALSE
    )
  ORDER BY ct.subject,
    COALESCE((regexp_match(ct.name, 'Ch(\d+)'))[1]::INTEGER, 0),
    COALESCE((regexp_match(ct.name, '\(Part (\d+)\)'))[1]::INTEGER, 1),
    ct.name;
END;
$$;

GRANT EXECUTE ON FUNCTION get_all_cambridge_tests(INTEGER, TEXT) TO authenticated;

COMMENT ON FUNCTION get_all_cambridge_tests IS
  'Returns all Cambridge tests for a grade/subject with shared school visibility status';


-- ============================================================================
-- STEP 7: Update get_teacher_test_visibility_settings — return school-shared
-- ============================================================================
-- Returns all shared visibility settings for the teacher's school
-- (not just the calling teacher's rows).

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

  SELECT u.school_id INTO v_school_id
  FROM users u
  WHERE u.id = v_teacher_user_id;

  -- Return ALL shared visibility settings for this school
  RETURN QUERY
  SELECT
    ctv.test_id,
    ctv.subject,
    ctv.grade_level,
    ctv.is_visible,
    ctv.updated_at
  FROM cambridge_test_visibility ctv
  WHERE ctv.school_id = v_school_id
  ORDER BY ctv.grade_level, ctv.subject, ctv.test_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_teacher_test_visibility_settings() TO authenticated;

COMMENT ON FUNCTION get_teacher_test_visibility_settings IS
  'Returns all shared test visibility settings for the teacher school';


-- ============================================================================
-- STEP 8: Update table comment
-- ============================================================================

COMMENT ON TABLE cambridge_test_visibility IS
  'Shared Cambridge test visibility per school/grade/subject. teacher_user_id tracks who last changed the setting.';


-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Check new constraint exists
-- SELECT conname FROM pg_constraint
-- WHERE conrelid = 'cambridge_test_visibility'::regclass AND contype = 'u';
-- Expected: cambridge_test_visibility_school_test_subject_grade_key

-- Check old constraint removed
-- Should NOT see: cambridge_test_visibility_school_id_teacher_user_id_test_id_key

-- Test: Two teachers toggling the same test should produce 1 row, not 2
-- INSERT INTO cambridge_test_visibility (school_id, teacher_user_id, test_id, subject, grade_level, is_visible)
-- VALUES ('<school>', '<teacher_a>', 'test-1', 'English stage 9', 8, TRUE)
-- ON CONFLICT (school_id, test_id, subject, grade_level)
-- DO UPDATE SET is_visible = TRUE, teacher_user_id = '<teacher_a>', updated_at = NOW();
--
-- INSERT INTO cambridge_test_visibility (school_id, teacher_user_id, test_id, subject, grade_level, is_visible)
-- VALUES ('<school>', '<teacher_b>', 'test-1', 'English stage 9', 8, FALSE)
-- ON CONFLICT (school_id, test_id, subject, grade_level)
-- DO UPDATE SET is_visible = FALSE, teacher_user_id = '<teacher_b>', updated_at = NOW();
--
-- SELECT * FROM cambridge_test_visibility WHERE test_id = 'test-1';
-- Expected: 1 row with is_visible=FALSE, teacher_user_id='<teacher_b>'
