-- ============================================================================
-- CAMBRIDGE TEST VISIBILITY CONTROL
-- ============================================================================
-- Purpose: Allow teachers to control which Cambridge tests are visible to 
--          their assigned grade/subject students
-- Features:
--   1. All tests available to teachers by default
--   2. Teachers toggle visibility per test for their grade/subject
--   3. Students only see tests marked as visible by their teachers
--   4. Visibility settings stored in database, no hardcoding needed
-- ============================================================================

-- ============================================================================
-- STEP 1: Create cambridge_tests table (test catalog)
-- ============================================================================

CREATE TABLE IF NOT EXISTS cambridge_tests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  duration TEXT,
  total_questions INTEGER,
  difficulty TEXT CHECK (difficulty IN ('Beginner', 'Intermediate', 'Advanced')),
  category TEXT CHECK (category IN ('Reading', 'Listening', 'Grammar', 'Vocabulary', 'Writing', 'Science')),
  subject TEXT NOT NULL,
  test_url TEXT NOT NULL,
  requires_marking BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(subject, id)
);

CREATE INDEX IF NOT EXISTS idx_cambridge_tests_subject_grade
  ON cambridge_tests(subject);

COMMENT ON TABLE cambridge_tests IS 
  'Catalog of all available Cambridge tests - add new tests here';

-- ============================================================================
-- STEP 1B: Populate cambridge_tests table
-- ============================================================================

-- Clear existing tests (safe for migrations)
TRUNCATE TABLE cambridge_tests CASCADE;

-- Insert all Cambridge tests
INSERT INTO cambridge_tests (id, name, description, duration, total_questions, difficulty, category, subject, test_url, requires_marking) VALUES
('cambridge-end-unit-4', 'End of Unit 4 Test', 'Stage 9 end-of-unit assessment focusing on vocabulary and grammar skills.', '40 min', 40, 'Intermediate', 'Grammar', 'English stage 9', '/cambridge-tests/English%20stage%209/cambridge_end_unit_4_test.html', false),
('cambridge-reading-25', 'Cambridge Reading Test 25', 'Comprehensive reading comprehension test covering vocabulary, matching, and detailed analysis.', '45 min', 42, 'Intermediate', 'Reading', 'English stage 9', '/cambridge-tests/English%20stage%209/cambridge_reading_25_answer_form.html', false),
('cambridge-listening-1', 'Cambridge Listening Test 1', 'Complete listening test with 5 parts: picture selection, multiple choice, fill-in-the-blanks, interview, and matching exercises.', '30 min', 25, 'Intermediate', 'Listening', 'English stage 9', '/cambridge-tests/English%20stage%209/cambridge_listening_test_1.html', false),
('cambridge-writing-1', 'Cambridge Writing Test 1', 'E2L Stage 9 Paper 3 writing test with 2 parts: a short message (45-55 words) and an opinion essay (110-130 words). Teacher-marked.', '45 min', 2, 'Intermediate', 'Writing', 'English stage 9', '/cambridge-tests/English%20stage%209/cambridge_writing_test_1.html', true),
('cambridge-writing-2', 'Cambridge Writing Test 2', 'E2L Stage 9 Paper 3 writing test with 2 parts: an email (45-55 words) and a story (110-130 words). Teacher-marked.', '45 min', 2, 'Intermediate', 'Writing', 'English stage 9', '/cambridge-tests/English%20stage%209/cambridge_writing_test_2.html', true),
('cambridge-end-unit-4-stage-8', 'End of Unit 4 Test (Stage 8 English)', 'Comprehensive test covering vocabulary, grammar, and language skills. 40 questions total: vocabulary matching, passive voice, present perfect continuous, and multiple-choice sections.', '60 min', 40, 'Intermediate', 'Vocabulary', 'English stage 9', '/cambridge-tests/English%20stage%209/cambridge_end_unit_4_test.html', false),
('as-chemistry-atomic-structure-part-1', 'AS Chemistry — Atomic Structure (Part 1)', 'Chapter 1 multiple-choice practice focusing on protons, neutrons, electrons, isotopes, and particle behaviour in fields.', '50 min', 25, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/atomic_structure.html?part=1', false),
('as-chemistry-atomic-structure-part-2', 'AS Chemistry — Atomic Structure (Part 2)', 'Chapter 1 multiple-choice practice focusing on protons, neutrons, electrons, isotopes, and particle behaviour in fields.', '48 min', 24, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/atomic_structure.html?part=2', false),
('as-chemistry-ch2-atoms-molecules-stoichiometry-part-1', 'AS Chemistry Ch2 (Atoms, molecules and stoichiometry) (Part 1)', 'Chapter 2 multiple-choice practice covering Avogadro constant, empirical formulae, ionisation trends, and reacting masses.', '64 min', 32, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/atoms_molecules_stoichiometry.html?part=1', false),
('as-chemistry-ch2-atoms-molecules-stoichiometry-part-2', 'AS Chemistry Ch2 (Atoms, molecules and stoichiometry) (Part 2)', 'Chapter 2 multiple-choice practice covering Avogadro constant, empirical formulae, ionisation trends, and reacting masses.', '64 min', 32, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/atoms_molecules_stoichiometry.html?part=2', false),
('as-chemistry-ch3-chemical-bonding-part-1', 'AS Chemistry Ch3 (Chemical bonding) (Part 1)', 'Chapter 3 multiple-choice practice on metallic bonding, shapes, hybridisation, bonding energetics, and dative bonds.', '56 min', 28, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/chemical_bonding.html?part=1', false),
('as-chemistry-ch3-chemical-bonding-part-2', 'AS Chemistry Ch3 (Chemical bonding) (Part 2)', 'Chapter 3 multiple-choice practice on metallic bonding, shapes, hybridisation, bonding energetics, and dative bonds.', '54 min', 27, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/chemical_bonding.html?part=2', false),
('as-chemistry-ch4-states-of-matter-part-1', 'AS Chemistry Ch4 (States of matter) (Part 1)', 'Chapter 4 multiple-choice practice on gas laws, kinetic theory, real gas deviations, and quantitative gas questions.', '62 min', 31, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/states_of_matter.html?part=1', false),
('as-chemistry-ch4-states-of-matter-part-2', 'AS Chemistry Ch4 (States of matter) (Part 2)', 'Chapter 4 multiple-choice practice on gas laws, kinetic theory, real gas deviations, and quantitative gas questions.', '60 min', 30, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/states_of_matter.html?part=2', false),
('as-chemistry-ch5-chemical-energetics-part-1', 'AS Chemistry Ch5 (Chemical Energetics) (Part 1)', 'Chapter 5 multiple-choice practice on enthalpy terminology, energy profiles, Hess'' law reasoning, and calorimetry.', '54 min', 27, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/chemical_energetics.html?part=1', false),
('as-chemistry-ch5-chemical-energetics-part-2', 'AS Chemistry Ch5 (Chemical Energetics) (Part 2)', 'Chapter 5 multiple-choice practice on enthalpy terminology, energy profiles, Hess'' law reasoning, and calorimetry.', '52 min', 26, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/chemical_energetics.html?part=2', false),
('as-chemistry-ch6-electrochemistry-part-1', 'AS Chemistry Ch6 (Electrochemistry) (Part 1)', 'Chapter 6 multiple-choice practice on electrochemical cells, electrode potentials, fuel cells, and redox processes.', '56 min', 28, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/electrochemistry.html?part=1', false),
('as-chemistry-ch6-electrochemistry-part-2', 'AS Chemistry Ch6 (Electrochemistry) (Part 2)', 'Chapter 6 multiple-choice practice on electrochemical cells, electrode potentials, fuel cells, and redox processes.', '56 min', 28, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/electrochemistry.html?part=2', false),
('as-chemistry-ch7-equilibria-part-1', 'AS Chemistry Ch7 (Equilibria) (Part 1)', 'Le Chatelier shifts, Kp / Kc calculations, industrial processes, and equilibrium graphs.', '74 min', 37, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/equilibria.html?part=1', false),
('as-chemistry-ch7-equilibria-part-2', 'AS Chemistry Ch7 (Equilibria) (Part 2)', 'Le Chatelier shifts, Kp / Kc calculations, industrial processes, and equilibrium graphs.', '72 min', 36, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/equilibria.html?part=2', false),
('as-chemistry-ch8-reaction-kinetics-part-1', 'AS Chemistry Ch8 (Reaction kinetics) (Part 1)', 'Collision theory, Maxwell–Boltzmann curves, catalysts, half-life, and rate equation reasoning.', '42 min', 21, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/reaction_kinetics.html?part=1', false),
('as-chemistry-ch8-reaction-kinetics-part-2', 'AS Chemistry Ch8 (Reaction kinetics) (Part 2)', 'Collision theory, Maxwell–Boltzmann curves, catalysts, half-life, and rate equation reasoning.', '40 min', 20, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/reaction_kinetics.html?part=2', false),
('as-chemistry-ch9-chemical-periodicity-part-1', 'AS Chemistry Ch9 (Chemical Periodicity) (Part 1)', 'Period 3 oxides, chlorides, structure trends, acid-base behaviour, and combustion stoichiometry.', '86 min', 43, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/chemical_periodicity.html?part=1', false),
('as-chemistry-ch9-chemical-periodicity-part-2', 'AS Chemistry Ch9 (Chemical Periodicity) (Part 2)', 'Period 3 oxides, chlorides, structure trends, acid-base behaviour, and combustion stoichiometry.', '84 min', 42, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/chemical_periodicity.html?part=2', false),
('as-chemistry-ch10-group-2-part-1', 'AS Chemistry Ch10 (Group 2) (Part 1)', 'Group 2 trends practice on solubility, thermal stability, reactions, and qualitative analysis scenarios.', '74 min', 37, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/group_2.html?part=1', false),
('as-chemistry-ch10-group-2-part-2', 'AS Chemistry Ch10 (Group 2) (Part 2)', 'Group 2 trends practice on solubility, thermal stability, reactions, and qualitative analysis scenarios.', '72 min', 36, 'Advanced', 'Science', 'Chemistry', '/cambridge-tests/Chemistry/group_2.html?part=2', false);

-- ============================================================================
-- STEP 2: Create cambridge_test_visibility table
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
  
  -- Shared visibility: one row per school/test/subject/grade
  -- teacher_user_id tracks who last changed the setting
  UNIQUE(school_id, test_id, subject, grade_level)
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

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Teachers can view own visibility settings" ON cambridge_test_visibility;
DROP POLICY IF EXISTS "Teachers can manage own visibility settings" ON cambridge_test_visibility;
DROP POLICY IF EXISTS "School admins can view school visibility settings" ON cambridge_test_visibility;

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
-- STEP 4: RPC Function - Get All Tests for Teacher (with visibility status)
-- ============================================================================
-- Returns all available Cambridge tests for a given grade/subject with the 
-- teacher's current visibility settings (TRUE/FALSE)
-- This eliminates the need for hardcoded test lists

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
  
  -- Get teacher's school
  SELECT u.school_id INTO v_school_id
  FROM users u
  WHERE u.id = v_teacher_user_id;
  
  -- Return all tests with SHARED visibility (no teacher_user_id filter)
  -- All teachers in the same school see the same visibility state
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
    COALESCE(ctv.is_visible, FALSE) as is_visible
  FROM cambridge_tests ct
  LEFT JOIN cambridge_test_visibility ctv ON 
    ctv.test_id = ct.id
    AND ctv.school_id = v_school_id
    AND ctv.grade_level = p_grade_level
    AND ctv.subject = ct.subject
  WHERE ct.subject = p_subject
  ORDER BY ct.subject,
    COALESCE((regexp_match(ct.name, 'Ch(\d+)'))[1]::INTEGER, 0),
    COALESCE((regexp_match(ct.name, '\(Part (\d+)\)'))[1]::INTEGER, 1),
    ct.name;
END;
$$;

GRANT EXECUTE ON FUNCTION get_all_cambridge_tests(INTEGER, TEXT) TO authenticated;

COMMENT ON FUNCTION get_all_cambridge_tests IS 
  'Returns all Cambridge tests for a grade/subject with teacher visibility status (no hardcoding needed)';

-- ============================================================================
-- STEP 5: RPC Function - Get Visible Tests for Student
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
-- STEP 6: RPC Function - Toggle Test Visibility (Teacher)
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
  -- Use flexible subject matching (e.g., "English" matches "English stage 9")
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
  'Allows teachers to toggle Cambridge test visibility for their assigned grades';

-- ============================================================================
-- STEP 7: RPC Function - Get Teacher's Visibility Settings
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
  
  -- Return ALL shared visibility settings for this school
  -- (not filtered by teacher — all teachers see the same state)
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
  'Returns all test visibility settings for the logged-in teacher';

-- ============================================================================
-- STEP 8: RPC Function - Bulk Set Test Visibility
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
  
  -- Check assignment (flexible subject matching)
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
  'Bulk update visibility for multiple Cambridge tests';

-- ============================================================================
-- STEP 9: Helper Function - Check if Test is Visible to Student
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

-- Check tables exist
-- SELECT EXISTS (SELECT FROM pg_tables WHERE tablename = 'cambridge_tests');
-- SELECT EXISTS (SELECT FROM pg_tables WHERE tablename = 'cambridge_test_visibility');

-- Check all tests are in database
-- SELECT COUNT(*) FROM cambridge_tests;

-- View all tests for a grade/subject (as teacher)
-- SELECT * FROM get_all_cambridge_tests(8, 'English stage 9');

-- View all visibility settings (as teacher)
-- SELECT * FROM get_teacher_test_visibility_settings();

-- Test visibility for a student (example)
-- SELECT * FROM get_visible_cambridge_tests_for_student(8, 'school-uuid-here');

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Next Steps:
-- 1. Run this migration in Supabase SQL Editor
-- 2. Update TeacherPortal.tsx to call get_all_cambridge_tests() instead of hardcoded list
-- 3. Update CambridgeTestsHub.tsx to fetch and respect visibility settings
-- 4. Test with real teacher/student accounts
-- 
-- Key Benefits:
-- - No more hardcoded test IDs in frontend
-- - Adding new tests only requires INSERT into cambridge_tests table
-- - All tests automatically appear in teacher visibility manager
-- ============================================================================
