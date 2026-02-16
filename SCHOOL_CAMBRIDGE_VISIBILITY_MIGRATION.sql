-- ============================================================================
-- SCHOOL-LEVEL CAMBRIDGE TEST VISIBILITY MIGRATION
-- ============================================================================
-- Purpose: Per-school visibility overrides for Cambridge tests.
--          School admins can hide/show tests for their entire school.
--          Takes precedence over teacher-level visibility settings.
--
-- Precedence:
--   1. school_cambridge_test_visibility row with is_visible=FALSE → HIDDEN (override)
--   2. school_cambridge_test_visibility row with is_visible=TRUE  → VISIBLE (normal)
--   3. No school_cambridge_test_visibility row                    → VISIBLE (default)
--
-- Objects created:
--   TABLE  school_cambridge_test_visibility
--   INDEX  idx_school_cambridge_vis_school_visible
--   FUNC   trg_fn_school_cambridge_vis_updated_at (trigger fn)
--   TRIGGER trg_school_cambridge_vis_updated_at
--   POLICY (4) on school_cambridge_test_visibility
--   FUNC   set_school_cambridge_test_visibility(TEXT, BOOLEAN)
--   FUNC   bulk_set_school_cambridge_test_visibility(TEXT[], BOOLEAN)
--   FUNC   get_school_cambridge_test_visibility_settings(UUID)
--
-- Objects patched (CREATE OR REPLACE, signature unchanged):
--   FUNC   get_visible_cambridge_tests_for_student(INTEGER, UUID)
--   FUNC   get_all_cambridge_tests(INTEGER, TEXT)
--   FUNC   is_cambridge_test_visible_to_student(TEXT, INTEGER, UUID, TEXT)
--
-- Dependencies: schools, cambridge_tests, users, school_members,
--              cambridge_test_visibility, is_school_admin(), is_superadmin()
-- ============================================================================


-- ============================================================================
-- (a) MIGRATION SQL
-- ============================================================================

-- ────────────────────────────────────────────
-- 1. Table: school_cambridge_test_visibility
-- ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS school_cambridge_test_visibility (
  school_id   UUID          NOT NULL REFERENCES schools(id)         ON DELETE CASCADE,
  test_id     TEXT          NOT NULL REFERENCES cambridge_tests(id) ON DELETE CASCADE,
  is_visible  BOOLEAN       NOT NULL DEFAULT TRUE,
  updated_by  UUID          REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  PRIMARY KEY (school_id, test_id)
);

COMMENT ON TABLE school_cambridge_test_visibility IS
  'School-level visibility override for Cambridge tests. is_visible=false hides a test school-wide regardless of teacher settings. No row = default visible (backward compatible).';

-- ────────────────────────────────────────────
-- 2. Index for filtered lookups
-- ────────────────────────────────────────────
-- PK already creates a unique index on (school_id, test_id).
-- This partial index accelerates the NOT EXISTS(...is_visible=FALSE) check.

CREATE INDEX IF NOT EXISTS idx_school_cambridge_vis_school_visible
  ON school_cambridge_test_visibility (school_id, is_visible);

-- ────────────────────────────────────────────
-- 3. updated_at trigger
-- ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_fn_school_cambridge_vis_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_school_cambridge_vis_updated_at
  ON school_cambridge_test_visibility;

CREATE TRIGGER trg_school_cambridge_vis_updated_at
  BEFORE UPDATE ON school_cambridge_test_visibility
  FOR EACH ROW
  EXECUTE FUNCTION trg_fn_school_cambridge_vis_updated_at();

-- ────────────────────────────────────────────
-- 4. RLS policies
-- ────────────────────────────────────────────

ALTER TABLE school_cambridge_test_visibility ENABLE ROW LEVEL SECURITY;

-- 4a. Read: any authenticated member of the school (or superadmin)
DROP POLICY IF EXISTS "School members can view own school visibility"
  ON school_cambridge_test_visibility;

CREATE POLICY "School members can view own school visibility"
  ON school_cambridge_test_visibility
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.school_id = school_cambridge_test_visibility.school_id
    )
    OR is_superadmin()
  );

-- 4b. Insert: school admin of that school only
DROP POLICY IF EXISTS "School admins can insert school visibility"
  ON school_cambridge_test_visibility;

CREATE POLICY "School admins can insert school visibility"
  ON school_cambridge_test_visibility
  FOR INSERT
  WITH CHECK (
    is_school_admin(school_cambridge_test_visibility.school_id)
  );

-- 4c. Update: school admin of that school only
DROP POLICY IF EXISTS "School admins can update school visibility"
  ON school_cambridge_test_visibility;

CREATE POLICY "School admins can update school visibility"
  ON school_cambridge_test_visibility
  FOR UPDATE
  USING (
    is_school_admin(school_cambridge_test_visibility.school_id)
  )
  WITH CHECK (
    is_school_admin(school_cambridge_test_visibility.school_id)
  );

-- 4d. Delete: school admin of that school only
DROP POLICY IF EXISTS "School admins can delete school visibility"
  ON school_cambridge_test_visibility;

CREATE POLICY "School admins can delete school visibility"
  ON school_cambridge_test_visibility
  FOR DELETE
  USING (
    is_school_admin(school_cambridge_test_visibility.school_id)
  );


-- ────────────────────────────────────────────
-- 5. New RPC: set_school_cambridge_test_visibility
--    Toggle a single test's school-level visibility.
-- ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_school_cambridge_test_visibility(
  p_test_id    TEXT,
  p_is_visible BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        UUID := auth.uid();
  v_school_id      UUID;
  v_is_admin       BOOLEAN;
  v_test_subject   TEXT;
  v_has_assignment BOOLEAN;
BEGIN
  -- Auth check
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Resolve caller's school
  SELECT u.school_id INTO v_school_id
  FROM users u WHERE u.id = v_user_id;

  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No school membership');
  END IF;

  -- Authorize: school admin/superadmin OR teacher with matching subject assignment
  v_is_admin := is_school_admin(v_school_id);

  IF NOT v_is_admin THEN
    -- Look up the test's subject
    SELECT ct.subject INTO v_test_subject
    FROM cambridge_tests ct WHERE ct.id = p_test_id;

    IF v_test_subject IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Test not found: ' || p_test_id);
    END IF;

    -- Check if caller has a matching active class assignment for this subject
    SELECT EXISTS (
      SELECT 1
      FROM class_teacher_assignments cta
      JOIN classes c ON c.id = cta.class_id
      WHERE cta.teacher_user_id = v_user_id
        AND cta.school_id = v_school_id
        AND cta.active = TRUE
        AND (
          cta.subject ILIKE '%' || SPLIT_PART(v_test_subject, ' ', 1) || '%'
          OR v_test_subject ILIKE '%' || cta.subject || '%'
        )
    ) INTO v_has_assignment;

    IF NOT v_has_assignment THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Access denied: school admin or assigned teacher required');
    END IF;
  END IF;

  -- Validate test exists (admin path — teacher path already validated above)
  IF v_is_admin AND NOT EXISTS (SELECT 1 FROM cambridge_tests WHERE id = p_test_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Test not found: ' || p_test_id);
  END IF;

  -- Upsert visibility row
  INSERT INTO school_cambridge_test_visibility (school_id, test_id, is_visible, updated_by)
  VALUES (v_school_id, p_test_id, p_is_visible, v_user_id)
  ON CONFLICT (school_id, test_id)
  DO UPDATE SET
    is_visible = EXCLUDED.is_visible,
    updated_by = EXCLUDED.updated_by,
    updated_at = NOW();

  RETURN jsonb_build_object(
    'success', true,
    'test_id', p_test_id,
    'is_visible', p_is_visible,
    'message', CASE
      WHEN p_is_visible THEN 'Test visible for school'
      ELSE 'Test hidden for school'
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION set_school_cambridge_test_visibility(TEXT, BOOLEAN)
  TO authenticated;

COMMENT ON FUNCTION set_school_cambridge_test_visibility IS
  'School admin or assigned teacher toggles a single Cambridge test visible/hidden for their school.';


-- ────────────────────────────────────────────
-- 6. New RPC: bulk_set_school_cambridge_test_visibility
--    Batch toggle for multiple test IDs at once.
-- ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION bulk_set_school_cambridge_test_visibility(
  p_test_ids   TEXT[],
  p_is_visible BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_school_id UUID;
  v_is_admin  BOOLEAN;
  v_count     INT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT u.school_id INTO v_school_id
  FROM users u WHERE u.id = v_user_id;

  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No school membership');
  END IF;

  -- Authorize: school admin/superadmin OR teacher with at least one active assignment
  v_is_admin := is_school_admin(v_school_id);

  IF NOT v_is_admin AND NOT EXISTS (
    SELECT 1 FROM class_teacher_assignments cta
    WHERE cta.teacher_user_id = v_user_id
      AND cta.school_id = v_school_id
      AND cta.active = TRUE
  ) THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Access denied: school admin or assigned teacher required');
  END IF;

  -- Upsert for test_ids that exist AND caller is authorized for:
  --   Admin  -> all tests
  --   Teacher -> only tests whose subject matches an active assignment
  INSERT INTO school_cambridge_test_visibility (school_id, test_id, is_visible, updated_by)
  SELECT v_school_id, ct.id, p_is_visible, v_user_id
  FROM cambridge_tests ct
  WHERE ct.id = ANY(p_test_ids)
    AND (
      v_is_admin
      OR EXISTS (
        SELECT 1
        FROM class_teacher_assignments cta
        JOIN classes c ON c.id = cta.class_id
        WHERE cta.teacher_user_id = v_user_id
          AND cta.school_id = v_school_id
          AND cta.active = TRUE
          AND (
            cta.subject ILIKE '%' || SPLIT_PART(ct.subject, ' ', 1) || '%'
            OR ct.subject ILIKE '%' || cta.subject || '%'
          )
      )
    )
  ON CONFLICT (school_id, test_id)
  DO UPDATE SET
    is_visible = EXCLUDED.is_visible,
    updated_by = EXCLUDED.updated_by,
    updated_at = NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'updated_count', v_count,
    'is_visible', p_is_visible,
    'message', v_count || ' test(s) updated'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION bulk_set_school_cambridge_test_visibility(TEXT[], BOOLEAN)
  TO authenticated;

COMMENT ON FUNCTION bulk_set_school_cambridge_test_visibility IS
  'School admin or assigned teacher batch-toggles Cambridge test visibility for their school.';


-- ────────────────────────────────────────────
-- 7. New RPC: get_school_cambridge_test_visibility_settings
--    Returns ALL cambridge_tests with the school's override status.
--    No row in the mapping table → is_visible defaults to TRUE.
-- ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_school_cambridge_test_visibility_settings(
  p_school_id UUID DEFAULT NULL
)
RETURNS TABLE (
  test_id    TEXT,
  test_name  TEXT,
  subject    TEXT,
  category   TEXT,
  is_visible BOOLEAN,
  updated_by UUID,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_school_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Resolve school: explicit param or caller's school
  v_school_id := COALESCE(
    p_school_id,
    (SELECT u.school_id FROM users u WHERE u.id = v_user_id)
  );

  IF v_school_id IS NULL THEN
    RETURN;
  END IF;

  -- Must be a member of the school or superadmin
  IF NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = v_user_id AND u.school_id = v_school_id
  ) AND NOT is_superadmin() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ct.id          AS test_id,
    ct.name        AS test_name,
    ct.subject     AS subject,
    ct.category    AS category,
    COALESCE(sctv.is_visible, TRUE) AS is_visible,
    sctv.updated_by,
    sctv.updated_at
  FROM cambridge_tests ct
  LEFT JOIN school_cambridge_test_visibility sctv
    ON sctv.test_id = ct.id
    AND sctv.school_id = v_school_id
  ORDER BY ct.subject,
    COALESCE((regexp_match(ct.name, 'Ch(\d+)'))[1]::INTEGER, 0),
    COALESCE((regexp_match(ct.name, '\(Part (\d+)\)'))[1]::INTEGER, 1),
    ct.name;
END;
$$;

GRANT EXECUTE ON FUNCTION get_school_cambridge_test_visibility_settings(UUID)
  TO authenticated;

COMMENT ON FUNCTION get_school_cambridge_test_visibility_settings IS
  'Returns all Cambridge tests with school-level visibility status (default TRUE).';


-- ============================================================================
-- (b) UPDATED FUNCTION SQL — Patches to existing RPCs
-- ============================================================================

-- ────────────────────────────────────────────
-- PATCH 1: get_visible_cambridge_tests_for_student
-- Adds NOT EXISTS filter for school-level hidden tests.
-- Signature unchanged: (INTEGER, UUID) → TABLE(test_id TEXT, subject TEXT)
-- ────────────────────────────────────────────

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
  RETURN QUERY
  SELECT DISTINCT
    ctv.test_id,
    ctv.subject
  FROM cambridge_test_visibility ctv
  WHERE ctv.school_id = p_school_id
    AND ctv.grade_level = p_student_grade
    AND ctv.is_visible = TRUE
    -- ── school-level override ──
    AND NOT EXISTS (
      SELECT 1
      FROM school_cambridge_test_visibility sctv
      WHERE sctv.school_id = p_school_id
        AND sctv.test_id = ctv.test_id
        AND sctv.is_visible = FALSE
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_visible_cambridge_tests_for_student(INTEGER, UUID)
  TO authenticated;


-- ────────────────────────────────────────────
-- PATCH 2: get_all_cambridge_tests
-- Filters out school-hidden tests from the teacher's test list.
-- Uses SHARED visibility (no teacher_user_id filter) to match
-- SYNC_CAMBRIDGE_VISIBILITY migration. All teachers in the same
-- school see the same visibility state.
-- Signature unchanged: (INTEGER, TEXT) → TABLE(...)
-- ────────────────────────────────────────────

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

  -- Return tests with SHARED visibility (no teacher_user_id filter),
  -- excluding any tests the school admin has hidden.
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
    -- ── school-level override ──
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


-- ────────────────────────────────────────────
-- PATCH 3: is_cambridge_test_visible_to_student
-- School-level FALSE overrides teacher-level TRUE.
-- Signature unchanged: (TEXT, INTEGER, UUID, TEXT) → BOOLEAN
-- ────────────────────────────────────────────

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
  -- School-level override check first
  IF EXISTS (
    SELECT 1
    FROM school_cambridge_test_visibility sctv
    WHERE sctv.school_id = p_school_id
      AND sctv.test_id = p_test_id
      AND sctv.is_visible = FALSE
  ) THEN
    RETURN FALSE;
  END IF;

  -- Teacher-level check (existing logic)
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

GRANT EXECUTE ON FUNCTION is_cambridge_test_visible_to_student(TEXT, INTEGER, UUID, TEXT)
  TO authenticated;


-- ============================================================================
-- (c) VERIFICATION SQL
-- ============================================================================
-- Run these after migration to confirm everything is correct.
-- Expected results are in comments after each query.

-- ── CHECK 1: Table exists with correct columns ──
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'school_cambridge_test_visibility'
ORDER BY ordinal_position;
-- Expected: 6 rows (school_id, test_id, is_visible, updated_by, updated_at, created_at)

-- ── CHECK 2: Primary key and FK constraints exist ──
SELECT
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name
  AND kcu.table_schema = tc.table_schema
WHERE tc.table_name = 'school_cambridge_test_visibility'
  AND tc.table_schema = 'public'
ORDER BY tc.constraint_type, kcu.column_name;
-- Expected: PRIMARY KEY on (school_id, test_id), FOREIGN KEY on school_id→schools(id),
--           FOREIGN KEY on test_id→cambridge_tests(id), FOREIGN KEY on updated_by→users(id)

-- ── CHECK 3: RLS is enabled ──
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'school_cambridge_test_visibility';
-- Expected: relrowsecurity = true

-- ── CHECK 4: 4 RLS policies exist ──
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'school_cambridge_test_visibility'
ORDER BY policyname;
-- Expected: 4 rows —
--   "School admins can delete school visibility"  | DELETE
--   "School admins can insert school visibility"  | INSERT
--   "School admins can update school visibility"  | UPDATE
--   "School members can view own school visibility" | SELECT

-- ── CHECK 5: All 3 new functions exist ──
SELECT routine_name, data_type AS return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'set_school_cambridge_test_visibility',
    'bulk_set_school_cambridge_test_visibility',
    'get_school_cambridge_test_visibility_settings'
  )
ORDER BY routine_name;
-- Expected: 3 rows

-- ── CHECK 6: Patched functions still have original signatures ──
SELECT p.proname, pg_get_function_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
WHERE p.proname IN (
  'get_visible_cambridge_tests_for_student',
  'get_all_cambridge_tests',
  'is_cambridge_test_visible_to_student'
)
ORDER BY p.proname;
-- Expected: signatures unchanged:
--   get_all_cambridge_tests(p_grade_level integer, p_subject text)
--   get_visible_cambridge_tests_for_student(p_student_grade integer, p_school_id uuid)
--   is_cambridge_test_visible_to_student(p_test_id text, p_student_grade integer, p_school_id uuid, p_subject text)

-- ── CHECK 7: Default visibility — no rows means visible ──
-- (assuming no rows have been inserted into school_cambridge_test_visibility yet)
SELECT COUNT(*) AS hidden_count
FROM school_cambridge_test_visibility
WHERE is_visible = FALSE;
-- Expected: 0 (no tests hidden, backward compatible)

-- ── CHECK 8: Trigger exists ──
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'school_cambridge_test_visibility';
-- Expected: trg_school_cambridge_vis_updated_at | UPDATE | BEFORE


-- ============================================================================
-- (c) continued — FUNCTIONAL TEST SCENARIOS
-- ============================================================================
-- These require test data. Run in a transaction and rollback after verification.
-- Replace UUIDs with real values from your environment.

/*
-- ── FUNCTIONAL TEST: Insert + precedence ──
-- Use real school_id and test_id values from your DB:

BEGIN;

  -- Setup: pick a school and a test that exists
  -- SELECT id FROM schools LIMIT 1;          -- → e.g. 'aaaa-...'
  -- SELECT id FROM cambridge_tests LIMIT 1;  -- → e.g. 'cambridge-reading-25'

  -- TEST A: School admin hides a test
  INSERT INTO school_cambridge_test_visibility (school_id, test_id, is_visible, updated_by)
  VALUES ('<school_id>', 'cambridge-reading-25', FALSE, '<admin_user_id>');

  -- Verify: student should NOT see this test
  SELECT * FROM get_visible_cambridge_tests_for_student(8, '<school_id>')
  WHERE test_id = 'cambridge-reading-25';
  -- Expected: 0 rows (hidden by school override even if teacher enabled it)

  -- Verify: teacher list should NOT include this test
  -- (must be called as a teacher of that school)
  -- SELECT * FROM get_all_cambridge_tests(8, 'English stage 9')
  -- WHERE test_id = 'cambridge-reading-25';
  -- Expected: 0 rows

  -- Verify: helper function returns FALSE
  SELECT is_cambridge_test_visible_to_student(
    'cambridge-reading-25', 8, '<school_id>', 'English stage 9'
  );
  -- Expected: FALSE

  -- TEST B: Different school is unaffected
  -- SELECT * FROM get_visible_cambridge_tests_for_student(8, '<other_school_id>');
  -- Expected: cambridge-reading-25 still appears (if teacher-enabled for that school)

  -- TEST C: Unhide the test
  UPDATE school_cambridge_test_visibility
  SET is_visible = TRUE
  WHERE school_id = '<school_id>' AND test_id = 'cambridge-reading-25';

  -- Verify: test reappears (subject to teacher-level visibility)
  SELECT is_cambridge_test_visible_to_student(
    'cambridge-reading-25', 8, '<school_id>', 'English stage 9'
  );
  -- Expected: depends on teacher-level setting (TRUE if a teacher enabled it)

  -- TEST D: Delete override row → default visible behavior restored
  DELETE FROM school_cambridge_test_visibility
  WHERE school_id = '<school_id>' AND test_id = 'cambridge-reading-25';

  -- Same as TEST C — back to normal

ROLLBACK;
*/


-- ============================================================================
-- (d) ROLLBACK SQL
-- ============================================================================
-- Safe, minimal rollback. Restores original function behavior.
-- Run this ONLY if you need to completely undo this migration.

/*
-- Step 1: Drop new objects
DROP FUNCTION IF EXISTS set_school_cambridge_test_visibility(TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS bulk_set_school_cambridge_test_visibility(TEXT[], BOOLEAN);
DROP FUNCTION IF EXISTS get_school_cambridge_test_visibility_settings(UUID);
DROP TRIGGER IF EXISTS trg_school_cambridge_vis_updated_at ON school_cambridge_test_visibility;
DROP FUNCTION IF EXISTS trg_fn_school_cambridge_vis_updated_at();
DROP TABLE IF EXISTS school_cambridge_test_visibility CASCADE;

-- Step 2: Restore original get_visible_cambridge_tests_for_student
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

-- Step 3: Restore original get_all_cambridge_tests
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
    AND ctv.teacher_user_id = v_teacher_user_id
    AND ctv.school_id = v_school_id
    AND ctv.grade_level = p_grade_level
    AND ctv.subject = ct.subject
  WHERE ct.subject = p_subject
  ORDER BY ct.subject, ct.name;
END;
$$;
GRANT EXECUTE ON FUNCTION get_all_cambridge_tests(INTEGER, TEXT) TO authenticated;

-- Step 4: Restore original is_cambridge_test_visible_to_student
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
*/


-- ============================================================================
-- (e) CHANGED OBJECTS CHECKLIST
-- ============================================================================
--
-- CREATED (new):
--   [TABLE]   school_cambridge_test_visibility  (PK: school_id + test_id)
--   [INDEX]   idx_school_cambridge_vis_school_visible
--   [FUNC]    trg_fn_school_cambridge_vis_updated_at()
--   [TRIGGER] trg_school_cambridge_vis_updated_at
--   [POLICY]  "School members can view own school visibility"   (SELECT)
--   [POLICY]  "School admins can insert school visibility"      (INSERT)
--   [POLICY]  "School admins can update school visibility"      (UPDATE)
--   [POLICY]  "School admins can delete school visibility"      (DELETE)
--   [FUNC]    set_school_cambridge_test_visibility(TEXT, BOOLEAN) → JSONB
--   [FUNC]    bulk_set_school_cambridge_test_visibility(TEXT[], BOOLEAN) → JSONB
--   [FUNC]    get_school_cambridge_test_visibility_settings(UUID) → TABLE
--
-- PATCHED (CREATE OR REPLACE, signature preserved):
--   [FUNC]    get_visible_cambridge_tests_for_student(INTEGER, UUID)
--             + added NOT EXISTS check against school_cambridge_test_visibility
--   [FUNC]    get_all_cambridge_tests(INTEGER, TEXT)
--             + added NOT EXISTS check against school_cambridge_test_visibility
--   [FUNC]    is_cambridge_test_visible_to_student(TEXT, INTEGER, UUID, TEXT)
--             + school-level FALSE now overrides teacher-level TRUE
--
-- UNCHANGED (confirmed no patch needed):
--   [FUNC]    toggle_cambridge_test_visibility        (teacher-level, untouched)
--   [FUNC]    bulk_set_cambridge_test_visibility       (teacher-level, untouched)
--   [FUNC]    get_teacher_test_visibility_settings     (teacher-level, untouched)
--   [FUNC]    get_school_cambridge_scores              (score data, not listings)
--   [FUNC]    get_school_cambridge_stats               (aggregation, not listings)
--   [FUNC]    release_quiz_scores / hide_quiz_scores   (score release, not listings)
--   [TABLE]   cambridge_test_visibility                (untouched)
--   [TABLE]   cambridge_tests                          (untouched)
--   [TABLE]   quiz_scores                              (untouched)
--
-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
