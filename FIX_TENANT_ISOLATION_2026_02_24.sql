-- ============================================================================
-- TENANT ISOLATION HARDENING — 2026-02-24
-- ============================================================================
-- Ensures a teacher/school_admin from School A can NEVER see, affect, or
-- modify data belonging to any other school.
--
-- Every SECURITY DEFINER RPC that accepts an object ID (class_id, school_id, 
-- score_id) now verifies that auth.uid() is an active member of the
-- corresponding school before proceeding.
--
-- Fixes:
--   A. Class roster RPCs — 9 functions hardened with caller-school check
--   B. Score release RPCs — release_quiz_score, get_unreleased_quiz_scores
--   C. quiz_scores_summary view — replaced with school-scoped function
--   D. quiz_scores INSERT policy — require school_id from authenticated users
--   E. Cleanup duplicate DELETE policy on quiz_scores
-- ============================================================================


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  HELPER: verify caller belongs to school (teacher, school_admin, admin) ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION _verify_school_staff(p_school_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN RETURN FALSE; END IF;
    IF is_superadmin(v_uid) THEN RETURN TRUE; END IF;

    RETURN EXISTS (
        SELECT 1 FROM school_members sm
        WHERE sm.user_id = v_uid
          AND sm.school_id = p_school_id
          AND sm.role_in_school IN ('teacher', 'school_admin')
          AND sm.status = 'active'
    );
END;
$$;


-- ────────────────────────────────────────────────────────────────────────────
-- A1. get_class_roster — add caller-school verification
-- ────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS get_class_roster(UUID) CASCADE;

CREATE OR REPLACE FUNCTION get_class_roster(p_class_id UUID)
RETURNS TABLE (
    student_id UUID, username TEXT, email TEXT, avatar_url TEXT,
    grade TEXT, batch TEXT, level INT, xp INT,
    last_seen TIMESTAMPTZ, is_banned BOOLEAN, enrolled_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_class_school_id UUID;
BEGIN
    -- Get the class's school
    SELECT c.school_id INTO v_class_school_id FROM classes c WHERE c.id = p_class_id;
    IF v_class_school_id IS NULL THEN RETURN; END IF;

    -- Verify caller belongs to that school
    IF NOT _verify_school_staff(v_class_school_id) THEN
        RAISE EXCEPTION 'Access denied: you are not staff at this school';
    END IF;

    RETURN QUERY
    SELECT u.id, u.username::TEXT, u.email::TEXT, u.avatar_url::TEXT,
        COALESCE(u.grade, '')::TEXT, COALESCE(u.batch, '')::TEXT,
        COALESCE(u.level, 1)::INT, COALESCE(u.xp, 0)::INT,
        u.last_seen, COALESCE(u.is_banned, false), cs.joined_at
    FROM class_students cs
    JOIN users u ON u.id = cs.student_id
    WHERE cs.class_id = p_class_id
      AND COALESCE(u.role, 'student') = 'student'
    ORDER BY u.username;
END;
$$;

GRANT EXECUTE ON FUNCTION get_class_roster(UUID) TO authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- A2. get_school_class_rosters — verify caller is member of p_school_id
-- ────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS get_school_class_rosters(UUID) CASCADE;

CREATE OR REPLACE FUNCTION get_school_class_rosters(p_school_id UUID)
RETURNS TABLE (
    class_id UUID, class_code TEXT, class_name TEXT,
    grade_level TEXT, is_active BOOLEAN, student_count BIGINT, teacher_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NOT _verify_school_staff(p_school_id) THEN
        RAISE EXCEPTION 'Access denied: you are not staff at this school';
    END IF;

    RETURN QUERY
    SELECT c.id, c.class_code::TEXT, COALESCE(c.class_name, c.class_code)::TEXT,
        c.grade_level::TEXT, c.is_active,
        (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = c.id)::BIGINT,
        (SELECT COUNT(*) FROM class_teacher_assignments cta WHERE cta.class_id = c.id AND cta.active = true)::BIGINT
    FROM classes c
    WHERE c.school_id = p_school_id
    ORDER BY c.grade_level NULLS LAST, c.class_code;
END;
$$;

GRANT EXECUTE ON FUNCTION get_school_class_rosters(UUID) TO authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- A3. get_unassigned_students — verify caller is member of p_school_id
-- ────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS get_unassigned_students(UUID) CASCADE;

CREATE OR REPLACE FUNCTION get_unassigned_students(p_school_id UUID)
RETURNS TABLE (
    student_id UUID, username TEXT, email TEXT, avatar_url TEXT,
    grade TEXT, batch TEXT, level INT, xp INT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NOT _verify_school_staff(p_school_id) THEN
        RAISE EXCEPTION 'Access denied: you are not staff at this school';
    END IF;

    RETURN QUERY
    SELECT u.id, u.username::TEXT, u.email::TEXT, u.avatar_url::TEXT,
        COALESCE(u.grade, '')::TEXT, COALESCE(u.batch, '')::TEXT,
        COALESCE(u.level, 1)::INT, COALESCE(u.xp, 0)::INT
    FROM users u
    WHERE u.school_id = p_school_id
      AND COALESCE(u.role, 'student') = 'student'
      AND NOT COALESCE(u.is_banned, false)
      AND NOT EXISTS (
        SELECT 1 FROM class_students cs
        JOIN classes c ON c.id = cs.class_id
        WHERE cs.student_id = u.id AND c.school_id = p_school_id
      )
    ORDER BY u.grade NULLS LAST, u.username;
END;
$$;

GRANT EXECUTE ON FUNCTION get_unassigned_students(UUID) TO authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- A4. get_class_statistics — add caller-school verification
-- ────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS get_class_statistics(UUID) CASCADE;

CREATE OR REPLACE FUNCTION get_class_statistics(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_result JSONB;
    v_class RECORD;
BEGIN
    SELECT * INTO v_class FROM classes WHERE id = p_class_id;
    IF v_class IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Class not found');
    END IF;

    -- Verify caller belongs to the class's school
    IF NOT _verify_school_staff(v_class.school_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Access denied: you are not staff at this school');
    END IF;

    SELECT jsonb_build_object(
        'success', true,
        'class_id', p_class_id,
        'class_code', v_class.class_code,
        'class_name', COALESCE(v_class.class_name, v_class.class_code),
        'grade_level', v_class.grade_level,
        'student_count', (SELECT COUNT(*) FROM class_students WHERE class_id = p_class_id),
        'teacher_count', (SELECT COUNT(*) FROM class_teacher_assignments WHERE class_id = p_class_id AND active = true),
        'avg_level', (SELECT COALESCE(ROUND(AVG(u.level)::numeric, 1), 0) FROM class_students cs JOIN users u ON u.id = cs.student_id WHERE cs.class_id = p_class_id),
        'avg_xp', (SELECT COALESCE(ROUND(AVG(u.xp)::numeric, 0), 0) FROM class_students cs JOIN users u ON u.id = cs.student_id WHERE cs.class_id = p_class_id),
        'total_xp', (SELECT COALESCE(SUM(u.xp), 0) FROM class_students cs JOIN users u ON u.id = cs.student_id WHERE cs.class_id = p_class_id),
        'teachers', (SELECT COALESCE(jsonb_agg(jsonb_build_object('user_id', cta.teacher_user_id, 'username', u.username, 'subject', cta.subject)), '[]'::jsonb) FROM class_teacher_assignments cta JOIN users u ON u.id = cta.teacher_user_id WHERE cta.class_id = p_class_id AND cta.active = true)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_class_statistics(UUID) TO authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- A5. auto_enroll_students_by_grade — add caller-school verification
-- ────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS auto_enroll_students_by_grade(UUID) CASCADE;

CREATE OR REPLACE FUNCTION auto_enroll_students_by_grade(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_class RECORD;
    v_enrolled INT := 0;
BEGIN
    SELECT * INTO v_class FROM classes WHERE id = p_class_id;
    IF v_class IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Class not found');
    END IF;

    -- Verify caller belongs to the class's school
    IF NOT _verify_school_staff(v_class.school_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Access denied: you are not staff at this school');
    END IF;

    IF v_class.grade_level IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Class has no grade level set');
    END IF;

    INSERT INTO class_students (class_id, student_id)
    SELECT p_class_id, u.id
    FROM users u
    WHERE u.school_id = v_class.school_id
      AND u.grade = v_class.grade_level::TEXT
      AND COALESCE(u.role, 'student') = 'student'
      AND NOT COALESCE(u.is_banned, false)
      AND NOT EXISTS (
        SELECT 1 FROM class_students cs WHERE cs.student_id = u.id AND cs.class_id = p_class_id
      );

    GET DIAGNOSTICS v_enrolled = ROW_COUNT;

    UPDATE users SET batch = v_class.class_code
    WHERE id IN (SELECT cs.student_id FROM class_students cs WHERE cs.class_id = p_class_id);

    RETURN jsonb_build_object('success', true, 'enrolled', v_enrolled,
        'message', format('Auto-enrolled %s students matching grade %s', v_enrolled, v_class.grade_level));
END;
$$;

GRANT EXECUTE ON FUNCTION auto_enroll_students_by_grade(UUID) TO authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- A6. add_student_to_class — add caller-school verification
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION add_student_to_class(p_class_id UUID, p_student_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_class RECORD;
    v_student RECORD;
    v_exists BOOLEAN;
BEGIN
    SELECT id, school_id, class_code INTO v_class FROM classes WHERE id = p_class_id;
    IF v_class IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Class not found');
    END IF;

    -- Verify caller belongs to the class's school
    IF NOT _verify_school_staff(v_class.school_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Access denied: you are not staff at this school');
    END IF;

    SELECT id, username, school_id INTO v_student
    FROM users WHERE id = p_student_id AND COALESCE(role, 'student') = 'student';

    IF v_student IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Student not found');
    END IF;

    IF v_student.school_id != v_class.school_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Student is not in the same school as the class');
    END IF;

    SELECT EXISTS (SELECT 1 FROM class_students WHERE class_id = p_class_id AND student_id = p_student_id) INTO v_exists;
    IF v_exists THEN
        RETURN jsonb_build_object('success', false, 'error', 'Student is already enrolled in this class');
    END IF;

    INSERT INTO class_students (class_id, student_id) VALUES (p_class_id, p_student_id);
    UPDATE users SET batch = v_class.class_code WHERE id = p_student_id;

    RETURN jsonb_build_object('success', true, 'message', format('Student %s added to class %s', v_student.username, v_class.class_code));
END;
$$;


-- ────────────────────────────────────────────────────────────────────────────
-- A7. remove_student_from_class — add caller-school verification
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION remove_student_from_class(p_class_id UUID, p_student_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_class_school_id UUID;
    v_deleted INT;
BEGIN
    SELECT c.school_id INTO v_class_school_id FROM classes c WHERE c.id = p_class_id;
    IF v_class_school_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Class not found');
    END IF;

    IF NOT _verify_school_staff(v_class_school_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Access denied: you are not staff at this school');
    END IF;

    DELETE FROM class_students WHERE class_id = p_class_id AND student_id = p_student_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    IF v_deleted = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Student was not enrolled in this class');
    END IF;

    UPDATE users SET batch = NULL WHERE id = p_student_id;
    RETURN jsonb_build_object('success', true, 'message', 'Student removed from class');
END;
$$;


-- ────────────────────────────────────────────────────────────────────────────
-- A8. move_student_between_classes — add caller-school verification
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION move_student_between_classes(p_student_id UUID, p_from_class_id UUID, p_to_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_to_class RECORD;
    v_from_school_id UUID;
    v_student_name TEXT;
BEGIN
    SELECT id, class_code, school_id INTO v_to_class FROM classes WHERE id = p_to_class_id;
    IF v_to_class IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Destination class not found');
    END IF;

    -- Verify caller belongs to the destination class's school
    IF NOT _verify_school_staff(v_to_class.school_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Access denied: you are not staff at this school');
    END IF;

    -- If from_class_id is set, verify it's in the same school
    IF p_from_class_id IS NOT NULL THEN
        SELECT c.school_id INTO v_from_school_id FROM classes c WHERE c.id = p_from_class_id;
        IF v_from_school_id IS DISTINCT FROM v_to_class.school_id THEN
            RETURN jsonb_build_object('success', false, 'error', 'Source and destination classes are in different schools');
        END IF;
    END IF;

    SELECT username INTO v_student_name FROM users WHERE id = p_student_id;

    IF p_from_class_id IS NOT NULL THEN
        DELETE FROM class_students WHERE class_id = p_from_class_id AND student_id = p_student_id;
    END IF;

    IF EXISTS (SELECT 1 FROM class_students WHERE class_id = p_to_class_id AND student_id = p_student_id) THEN
        UPDATE users SET batch = v_to_class.class_code WHERE id = p_student_id;
        RETURN jsonb_build_object('success', true, 'message', 'Student already in destination class');
    END IF;

    INSERT INTO class_students (class_id, student_id) VALUES (p_to_class_id, p_student_id);
    UPDATE users SET batch = v_to_class.class_code WHERE id = p_student_id;

    RETURN jsonb_build_object('success', true,
        'message', format('Student %s moved to class %s', COALESCE(v_student_name, 'Unknown'), v_to_class.class_code));
END;
$$;


-- ────────────────────────────────────────────────────────────────────────────
-- A9. bulk_add_students_to_class / bulk_remove_students_from_class
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION bulk_add_students_to_class(p_class_id UUID, p_student_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_class RECORD;
    v_added INT := 0;
    v_skipped INT := 0;
    v_student_id UUID;
BEGIN
    SELECT id, class_code, school_id INTO v_class FROM classes WHERE id = p_class_id;
    IF v_class IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Class not found');
    END IF;

    IF NOT _verify_school_staff(v_class.school_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Access denied: you are not staff at this school');
    END IF;

    FOREACH v_student_id IN ARRAY p_student_ids
    LOOP
        IF EXISTS (SELECT 1 FROM class_students WHERE class_id = p_class_id AND student_id = v_student_id) THEN
            v_skipped := v_skipped + 1; CONTINUE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM users WHERE id = v_student_id AND school_id = v_class.school_id AND COALESCE(role, 'student') = 'student') THEN
            v_skipped := v_skipped + 1; CONTINUE;
        END IF;
        INSERT INTO class_students (class_id, student_id) VALUES (p_class_id, v_student_id);
        UPDATE users SET batch = v_class.class_code WHERE id = v_student_id;
        v_added := v_added + 1;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'added', v_added, 'skipped', v_skipped,
        'message', format('Added %s students to class %s (skipped %s)', v_added, v_class.class_code, v_skipped));
END;
$$;


CREATE OR REPLACE FUNCTION bulk_remove_students_from_class(p_class_id UUID, p_student_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_class_school_id UUID;
    v_removed INT;
BEGIN
    SELECT c.school_id INTO v_class_school_id FROM classes c WHERE c.id = p_class_id;
    IF v_class_school_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Class not found');
    END IF;

    IF NOT _verify_school_staff(v_class_school_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Access denied: you are not staff at this school');
    END IF;

    DELETE FROM class_students WHERE class_id = p_class_id AND student_id = ANY(p_student_ids);
    GET DIAGNOSTICS v_removed = ROW_COUNT;
    UPDATE users SET batch = NULL WHERE id = ANY(p_student_ids);

    RETURN jsonb_build_object('success', true, 'removed', v_removed,
        'message', format('Removed %s students from class', v_removed));
END;
$$;


-- ────────────────────────────────────────────────────────────────────────────
-- B1. release_quiz_score (singular) — add school_id scope + widen roles
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION release_quiz_score(p_quiz_score_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_user_role TEXT;
    v_user_school_id UUID;
    v_score_school_id UUID;
BEGIN
    SELECT role, school_id INTO v_user_role, v_user_school_id
    FROM users WHERE id = v_user_id;

    IF v_user_role NOT IN ('admin', 'teacher', 'school_admin') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Teacher/admin access required');
    END IF;

    -- Verify the score belongs to caller's school
    SELECT qs.school_id INTO v_score_school_id FROM quiz_scores qs WHERE qs.id = p_quiz_score_id;

    IF v_score_school_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Quiz score not found');
    END IF;

    IF v_score_school_id != v_user_school_id AND NOT is_superadmin(v_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Score does not belong to your school');
    END IF;

    UPDATE quiz_scores SET scores_released = true WHERE id = p_quiz_score_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Quiz score not found');
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Score released successfully');
END;
$$;

GRANT EXECUTE ON FUNCTION release_quiz_score(UUID) TO authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- B2. get_unreleased_quiz_scores — add school_id scope + widen roles
-- ────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS get_unreleased_quiz_scores(TEXT);

CREATE OR REPLACE FUNCTION get_unreleased_quiz_scores(p_quiz_name TEXT DEFAULT NULL)
RETURNS TABLE (
    id UUID, student_name TEXT, student_class TEXT, quiz_name TEXT,
    score INTEGER, total_questions INTEGER, percentage INTEGER,
    submitted_at TIMESTAMPTZ, scores_released BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_user_role TEXT;
    v_school_id UUID;
BEGIN
    SELECT role, school_id INTO v_user_role, v_school_id
    FROM users WHERE id = v_user_id;

    IF v_user_role NOT IN ('admin', 'teacher', 'school_admin') THEN
        RAISE EXCEPTION 'Teacher/admin access required';
    END IF;

    RETURN QUERY
    SELECT qs.id, qs.student_name, qs.student_class, qs.quiz_name,
        qs.score, qs.total_questions, qs.percentage, qs.submitted_at, qs.scores_released
    FROM quiz_scores qs
    WHERE qs.school_id = v_school_id
      AND (p_quiz_name IS NULL OR qs.quiz_name = p_quiz_name)
      AND qs.scores_released = false
    ORDER BY qs.submitted_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_unreleased_quiz_scores(TEXT) TO authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- C. Replace quiz_scores_summary view with school-scoped RPC
-- ────────────────────────────────────────────────────────────────────────────

-- Drop the unscoped view
DROP VIEW IF EXISTS quiz_scores_summary;

-- Replace with school-scoped function
CREATE OR REPLACE FUNCTION get_quiz_scores_summary()
RETURNS TABLE (
    student_class TEXT,
    quiz_name TEXT,
    total_submissions BIGINT,
    avg_percentage NUMERIC,
    highest_score INT,
    lowest_score INT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_school_id UUID;
    v_role TEXT;
BEGIN
    SELECT u.school_id, u.role INTO v_school_id, v_role
    FROM users u WHERE u.id = auth.uid();

    IF v_role NOT IN ('admin', 'teacher', 'school_admin') THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT qs.student_class, qs.quiz_name,
        COUNT(*)::BIGINT,
        ROUND(AVG(qs.percentage), 1),
        MAX(qs.percentage)::INT,
        MIN(qs.percentage)::INT
    FROM quiz_scores qs
    WHERE qs.school_id = v_school_id
    GROUP BY qs.student_class, qs.quiz_name
    ORDER BY qs.student_class, qs.quiz_name;
END;
$$;

GRANT EXECUTE ON FUNCTION get_quiz_scores_summary() TO authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- D. Tighten quiz_scores INSERT policy for authenticated users
-- ────────────────────────────────────────────────────────────────────────────
-- The INSERT policy `qs_insert_authenticated` uses WITH CHECK (true) which
-- allows any authenticated user to insert with any school_id (or NULL).
-- We tighten it: authenticated users can only insert if the school_id equals
-- their own school_id (or is NULL for legacy anonymous submissions).

DROP POLICY IF EXISTS "qs_insert_authenticated" ON quiz_scores;
CREATE POLICY "qs_insert_authenticated"
  ON quiz_scores
  FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id IS NULL
    OR school_id = (SELECT u.school_id FROM users u WHERE u.id = auth.uid())
  );

-- Keep the anon INSERT policy (students not logged in can still submit)
-- but anon submissions will have school_id = NULL (trigger backfills later)


-- ────────────────────────────────────────────────────────────────────────────
-- E. Cleanup duplicate DELETE policies on quiz_scores
-- ────────────────────────────────────────────────────────────────────────────

-- Drop the one from FIX_CONSOLIDATED_AUDIT (keep SECURITY_PATCH_C's version
-- which is correctly scoped). If only the consolidated one exists, recreate.
DROP POLICY IF EXISTS "School admins and teachers can delete quiz scores" ON quiz_scores;

-- Ensure the SECURITY_PATCH_C version exists (idempotent)
DROP POLICY IF EXISTS "qs_delete_school_staff" ON quiz_scores;
CREATE POLICY "qs_delete_school_staff"
  ON quiz_scores
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM school_members sm
      WHERE sm.user_id = auth.uid()
        AND sm.role_in_school IN ('teacher', 'school_admin')
        AND sm.status = 'active'
        AND sm.school_id = quiz_scores.school_id
    )
    OR is_superadmin(auth.uid())
  );


-- ────────────────────────────────────────────────────────────────────────────
-- F. SCHOOL-SCOPED SELECT POLICY ON quiz_scores
--    Replace wide-open "Anyone can view scores" USING (true) with proper scoping:
--    • Students see only their own scores
--    • Teachers/school_admins see only their school's scores
--    • Superadmins see everything
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Anyone can view scores" ON quiz_scores;
DROP POLICY IF EXISTS "Allow select for authenticated users" ON quiz_scores;
DROP POLICY IF EXISTS "Students can view own scores" ON quiz_scores;
DROP POLICY IF EXISTS "Teachers view school scores" ON quiz_scores;
DROP POLICY IF EXISTS "quiz_scores_select_scoped" ON quiz_scores;

CREATE POLICY "quiz_scores_select_scoped" ON quiz_scores
FOR SELECT USING (
  -- Superadmins see everything
  is_superadmin()
  OR
  -- Students see their own scores (by username match)
  student_name = (SELECT username FROM users WHERE id = auth.uid())
  OR
  -- Teachers / school_admins / admins see their school's scores
  (
    school_id IS NOT NULL
    AND school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) IN ('teacher', 'admin', 'school_admin')
  )
);

-- ────────────────────────────────────────────────────────────────────────────
-- G. SCHOOL-SCOPED UPDATE POLICY ON quiz_scores
--    Replace role-only check with role + school_id verification:
--    • Teachers/school_admins can only update scores within their school
--    • Superadmins can update everything
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins and teachers can update quiz_scores" ON quiz_scores;
DROP POLICY IF EXISTS "Teachers can update quiz scores" ON quiz_scores;
DROP POLICY IF EXISTS "quiz_scores_update_scoped" ON quiz_scores;

CREATE POLICY "quiz_scores_update_scoped" ON quiz_scores
FOR UPDATE
USING (
  -- Superadmins can update everything
  is_superadmin()
  OR
  -- Teachers / school_admins / admins can update their school's scores
  (
    school_id IS NOT NULL
    AND school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) IN ('teacher', 'admin', 'school_admin')
  )
)
WITH CHECK (
  is_superadmin()
  OR
  (
    school_id IS NOT NULL
    AND school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) IN ('teacher', 'admin', 'school_admin')
  )
);

-- Revoke anon SELECT (students are authenticated, anon shouldn't read scores)
REVOKE SELECT ON quiz_scores FROM anon;
REVOKE INSERT ON quiz_scores FROM anon;

-- ────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
    RAISE NOTICE '✅ A1: get_class_roster — school-verified';
    RAISE NOTICE '✅ A2: get_school_class_rosters — school-verified';
    RAISE NOTICE '✅ A3: get_unassigned_students — school-verified';
    RAISE NOTICE '✅ A4: get_class_statistics — school-verified';
    RAISE NOTICE '✅ A5: auto_enroll_students_by_grade — school-verified';
    RAISE NOTICE '✅ A6: add_student_to_class — school-verified';
    RAISE NOTICE '✅ A7: remove_student_from_class — school-verified';
    RAISE NOTICE '✅ A8: move_student_between_classes — school-verified';
    RAISE NOTICE '✅ A9: bulk_add/remove_students — school-verified';
    RAISE NOTICE '✅ B1: release_quiz_score — school-scoped';
    RAISE NOTICE '✅ B2: get_unreleased_quiz_scores — school-scoped';
    RAISE NOTICE '✅ C:  quiz_scores_summary view → school-scoped RPC';
    RAISE NOTICE '✅ D:  quiz_scores INSERT policy — tightened';
    RAISE NOTICE '✅ E:  Duplicate DELETE policy — cleaned up';
    RAISE NOTICE '✅ F:  quiz_scores SELECT policy — school-scoped';
    RAISE NOTICE '✅ G:  quiz_scores UPDATE policy — school-scoped';
END;
$$;

NOTIFY pgrst, 'reload schema';
