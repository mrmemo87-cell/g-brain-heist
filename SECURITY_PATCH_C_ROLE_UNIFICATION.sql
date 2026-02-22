-- ============================================================
-- SECURITY PATCH C — Mixed Role System Unification
-- ============================================================
-- DEADLOCK FIX: Split into 3 steps. Run each one separately
-- in the Supabase SQL Editor. Wait for "Success" before the next.
--
--   STEP 1  ▸  Paste from here down to "-- END STEP 1"
--   STEP 2  ▸  Paste from "-- STEP 2" down to "-- END STEP 2"
--   STEP 3  ▸  Paste from "-- STEP 3" down to "-- END STEP 3"
-- ============================================================


-- ************************************************************
-- STEP 1: Replace quiz_scores + cambridge_test_visibility policies
-- ************************************************************
-- Set a 5-second lock timeout so we fail fast instead of deadlocking.
-- If you get "lock timeout", just wait 10 seconds and re-run Step 1.
SET lock_timeout = '5s';

-- Grab an exclusive lock on quiz_scores up front so all drops+creates
-- happen atomically without interleaving with user queries.
LOCK TABLE quiz_scores IN ACCESS EXCLUSIVE MODE;

-- Drop ALL existing quiz_scores policies
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT policyname
    FROM pg_policies
    WHERE tablename = 'quiz_scores'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON quiz_scores', rec.policyname);
  END LOOP;
END;
$$;

-- 1a. SELECT — Students see own scores
CREATE POLICY "qs_select_own"
  ON quiz_scores
  FOR SELECT
  USING (
    student_name = (SELECT username FROM users WHERE id = auth.uid())
  );

-- 1b. SELECT — Teachers/school_admins see scores in their school
CREATE POLICY "qs_select_school_staff"
  ON quiz_scores
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM school_members sm
      WHERE sm.user_id = auth.uid()
        AND sm.status = 'active'
        AND sm.role_in_school IN ('teacher', 'school_admin')
        AND sm.school_id = quiz_scores.school_id
    )
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.is_admin = true
    )
  );

-- 1c. SELECT — Released scores visible to same-school members
CREATE POLICY "qs_select_released"
  ON quiz_scores
  FOR SELECT
  USING (
    scores_released = TRUE
    AND EXISTS (
      SELECT 1 FROM school_members sm
      WHERE sm.user_id = auth.uid()
        AND sm.status = 'active'
        AND sm.school_id = quiz_scores.school_id
    )
  );

-- 1d. INSERT — Authenticated users can submit
CREATE POLICY "qs_insert_authenticated"
  ON quiz_scores
  FOR INSERT
  WITH CHECK (true);

-- 1e. UPDATE — School staff can update scores in their school
CREATE POLICY "qs_update_school_staff"
  ON quiz_scores
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM school_members sm
      WHERE sm.user_id = auth.uid()
        AND sm.status = 'active'
        AND sm.role_in_school IN ('teacher', 'school_admin')
        AND sm.school_id = quiz_scores.school_id
    )
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM school_members sm
      WHERE sm.user_id = auth.uid()
        AND sm.status = 'active'
        AND sm.role_in_school IN ('teacher', 'school_admin')
        AND sm.school_id = quiz_scores.school_id
    )
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.is_admin = true
    )
  );

-- 1f. DELETE — School staff can delete scores in their school
CREATE POLICY "qs_delete_school_staff"
  ON quiz_scores
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM school_members sm
      WHERE sm.user_id = auth.uid()
        AND sm.status = 'active'
        AND sm.role_in_school IN ('teacher', 'school_admin')
        AND sm.school_id = quiz_scores.school_id
    )
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.is_admin = true
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON quiz_scores TO authenticated;

-- Now do cambridge_test_visibility (same pattern: lock first)
LOCK TABLE cambridge_test_visibility IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT policyname
    FROM pg_policies
    WHERE tablename = 'cambridge_test_visibility'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON cambridge_test_visibility', rec.policyname);
  END LOOP;
END;
$$;

CREATE POLICY "ctv_own_teacher"
  ON cambridge_test_visibility
  FOR ALL
  USING (teacher_user_id = auth.uid());

CREATE POLICY "ctv_select_school_staff"
  ON cambridge_test_visibility
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM school_members sm
      WHERE sm.user_id = auth.uid()
        AND sm.status = 'active'
        AND sm.role_in_school IN ('teacher', 'school_admin')
        AND sm.school_id = cambridge_test_visibility.school_id
    )
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.is_admin = true
    )
  );

CREATE POLICY "ctv_manage_school_admin"
  ON cambridge_test_visibility
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM school_members sm
      WHERE sm.user_id = auth.uid()
        AND sm.status = 'active'
        AND sm.role_in_school = 'school_admin'
        AND sm.school_id = cambridge_test_visibility.school_id
    )
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.is_admin = true
    )
  );

-- Reset lock timeout to default
RESET lock_timeout;
-- END STEP 1


-- ************************************************************
-- STEP 2: Create the sync trigger (no table locks needed)
-- ************************************************************
-- Paste from this line down to "-- END STEP 2"

CREATE OR REPLACE FUNCTION sync_user_role_from_school_members()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_best_role TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_user_id := OLD.user_id;
  ELSE
    v_user_id := NEW.user_id;
  END IF;

  -- Highest-privilege active role: school_admin > teacher > student
  SELECT
    CASE
      WHEN bool_or(role_in_school = 'school_admin') THEN 'school_admin'
      WHEN bool_or(role_in_school = 'teacher') THEN 'teacher'
      ELSE 'student'
    END
  INTO v_best_role
  FROM school_members
  WHERE user_id = v_user_id
    AND status = 'active';

  IF v_best_role IS NULL THEN
    v_best_role := 'student';
  END IF;

  -- Never demote global admins
  UPDATE users
  SET role = v_best_role
  WHERE id = v_user_id
    AND role <> 'admin'
    AND COALESCE(is_admin, false) = false;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_user_role ON school_members;

CREATE TRIGGER trg_sync_user_role
  AFTER INSERT OR UPDATE OF role_in_school, status OR DELETE
  ON school_members
  FOR EACH ROW
  EXECUTE FUNCTION sync_user_role_from_school_members();
-- END STEP 2


-- ************************************************************
-- STEP 3: Widen role constraint + backfill stale users.role
-- ************************************************************
-- Paste from this line down to "-- END STEP 3"

-- First: widen the CHECK constraint to allow 'school_admin'
-- The old constraint only allows ('student','teacher','admin')
-- but school_members uses 'school_admin' and the frontend checks users.role for it.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('student', 'teacher', 'admin', 'school_admin'));

-- Now fix users whose role doesn't match their school_members record
UPDATE users u
SET role = sub.best_role
FROM (
  SELECT
    sm.user_id,
    CASE
      WHEN bool_or(sm.role_in_school = 'school_admin') THEN 'school_admin'
      WHEN bool_or(sm.role_in_school = 'teacher') THEN 'teacher'
      ELSE 'student'
    END AS best_role
  FROM school_members sm
  WHERE sm.status = 'active'
  GROUP BY sm.user_id
) sub
WHERE u.id = sub.user_id
  AND u.role <> 'admin'
  AND COALESCE(u.is_admin, false) = false
  AND u.role IS DISTINCT FROM sub.best_role;

-- Reset orphaned non-admin/non-student roles
UPDATE users u
SET role = 'student'
WHERE u.role NOT IN ('admin', 'student')
  AND COALESCE(u.is_admin, false) = false
  AND NOT EXISTS (
    SELECT 1 FROM school_members sm
    WHERE sm.user_id = u.id AND sm.status = 'active'
  );
-- END STEP 3


-- ============================================================
-- VERIFICATION — paste separately after all 3 steps succeed
-- ============================================================
--
-- 1. Quiz_scores policies (expect 6):
--    SELECT policyname, cmd FROM pg_policies
--    WHERE tablename = 'quiz_scores' ORDER BY cmd, policyname;
--
-- 2. Cambridge_test_visibility policies (expect 3):
--    SELECT policyname, cmd FROM pg_policies
--    WHERE tablename = 'cambridge_test_visibility' ORDER BY cmd, policyname;
--
-- 3. Sync trigger:
--    SELECT tgname FROM pg_trigger WHERE tgname = 'trg_sync_user_role';
--
-- 4. Stale roles (expect 0 rows):
--    SELECT u.id, u.username, u.role, sm.role_in_school
--    FROM users u
--    LEFT JOIN school_members sm
--      ON sm.user_id = u.id AND sm.status = 'active'
--    WHERE u.role NOT IN ('admin', 'student')
--      AND COALESCE(u.is_admin, false) = false
--      AND (sm.role_in_school IS NULL OR sm.role_in_school <> u.role)
--    LIMIT 20;
-- ============================================================
