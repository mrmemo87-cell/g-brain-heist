-- CLASS ROSTER MANAGEMENT SYSTEM
-- Complete database functions for managing class rosters in the School Admin Portal
-- Run this entire file in Supabase SQL Editor

-- ============================================
-- PART 1: Get Class Roster with Student Details
-- ============================================

DROP FUNCTION IF EXISTS get_class_roster(UUID) CASCADE;

CREATE OR REPLACE FUNCTION get_class_roster(p_class_id UUID)
RETURNS TABLE (
    student_id UUID,
    username TEXT,
    email TEXT,
    avatar_url TEXT,
    grade TEXT,
    batch TEXT,
    level INT,
    xp INT,
    last_seen TIMESTAMPTZ,
    is_banned BOOLEAN,
    enrolled_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id AS student_id,
        u.username::TEXT,
        u.email::TEXT,
        u.avatar_url::TEXT,
        COALESCE(u.grade, '')::TEXT AS grade,
        COALESCE(u.batch, '')::TEXT AS batch,
        COALESCE(u.level, 1)::INT AS level,
        COALESCE(u.xp, 0)::INT AS xp,
        u.last_seen,
        COALESCE(u.is_banned, false) AS is_banned,
        cs.created_at AS enrolled_at
    FROM class_students cs
    JOIN users u ON u.id = cs.student_id
    WHERE cs.class_id = p_class_id
      AND COALESCE(u.role, 'student') = 'student'
    ORDER BY u.username;
END;
$$;

GRANT EXECUTE ON FUNCTION get_class_roster(UUID) TO authenticated;

-- ============================================
-- PART 2: Get All Class Rosters for a School
-- ============================================

DROP FUNCTION IF EXISTS get_school_class_rosters(UUID) CASCADE;

CREATE OR REPLACE FUNCTION get_school_class_rosters(p_school_id UUID)
RETURNS TABLE (
    class_id UUID,
    class_code TEXT,
    class_name TEXT,
    grade_level TEXT,
    is_active BOOLEAN,
    student_count BIGINT,
    teacher_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id AS class_id,
        c.class_code::TEXT,
        COALESCE(c.class_name, c.class_code)::TEXT AS class_name,
        c.grade_level::TEXT,
        c.is_active,
        (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = c.id)::BIGINT AS student_count,
        (SELECT COUNT(*) FROM class_teacher_assignments cta WHERE cta.class_id = c.id AND cta.active = true)::BIGINT AS teacher_count
    FROM classes c
    WHERE c.school_id = p_school_id
    ORDER BY c.grade_level NULLS LAST, c.class_code;
END;
$$;

GRANT EXECUTE ON FUNCTION get_school_class_rosters(UUID) TO authenticated;

-- ============================================
-- PART 3: Get Students Not in Any Class
-- ============================================

DROP FUNCTION IF EXISTS get_unassigned_students(UUID) CASCADE;

CREATE OR REPLACE FUNCTION get_unassigned_students(p_school_id UUID)
RETURNS TABLE (
    student_id UUID,
    username TEXT,
    email TEXT,
    avatar_url TEXT,
    grade TEXT,
    batch TEXT,
    level INT,
    xp INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id AS student_id,
        u.username::TEXT,
        u.email::TEXT,
        u.avatar_url::TEXT,
        COALESCE(u.grade, '')::TEXT AS grade,
        COALESCE(u.batch, '')::TEXT AS batch,
        COALESCE(u.level, 1)::INT AS level,
        COALESCE(u.xp, 0)::INT AS xp
    FROM users u
    WHERE u.school_id = p_school_id
      AND COALESCE(u.role, 'student') = 'student'
      AND NOT COALESCE(u.is_banned, false)
      AND NOT EXISTS (
        SELECT 1 FROM class_students cs 
        JOIN classes c ON c.id = cs.class_id
        WHERE cs.student_id = u.id
          AND c.school_id = p_school_id
      )
    ORDER BY u.grade NULLS LAST, u.username;
END;
$$;

GRANT EXECUTE ON FUNCTION get_unassigned_students(UUID) TO authenticated;

-- ============================================
-- PART 4: Add Student to Class
-- ============================================

DROP FUNCTION IF EXISTS add_student_to_class(UUID, UUID) CASCADE;

CREATE OR REPLACE FUNCTION add_student_to_class(
    p_class_id UUID,
    p_student_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_class RECORD;
    v_student RECORD;
    v_exists BOOLEAN;
BEGIN
    -- Verify class exists
    SELECT id, school_id, class_code INTO v_class
    FROM classes
    WHERE id = p_class_id;
    
    IF v_class IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Class not found');
    END IF;
    
    -- Verify student exists and is in same school
    SELECT id, username, school_id INTO v_student
    FROM users
    WHERE id = p_student_id
      AND COALESCE(role, 'student') = 'student';
    
    IF v_student IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Student not found');
    END IF;
    
    IF v_student.school_id != v_class.school_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Student is not in the same school as the class');
    END IF;
    
    -- Check if already enrolled
    SELECT EXISTS (
        SELECT 1 FROM class_students 
        WHERE class_id = p_class_id AND student_id = p_student_id
    ) INTO v_exists;
    
    IF v_exists THEN
        RETURN jsonb_build_object('success', false, 'error', 'Student is already enrolled in this class');
    END IF;
    
    -- Add student to class
    INSERT INTO class_students (class_id, student_id)
    VALUES (p_class_id, p_student_id);
    
    -- Update student's batch field to match class code
    UPDATE users
    SET batch = v_class.class_code
    WHERE id = p_student_id;
    
    RETURN jsonb_build_object(
        'success', true, 
        'message', format('Student %s added to class %s', v_student.username, v_class.class_code)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION add_student_to_class(UUID, UUID) TO authenticated;

-- ============================================
-- PART 5: Remove Student from Class
-- ============================================

DROP FUNCTION IF EXISTS remove_student_from_class(UUID, UUID) CASCADE;

CREATE OR REPLACE FUNCTION remove_student_from_class(
    p_class_id UUID,
    p_student_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted INT;
BEGIN
    DELETE FROM class_students
    WHERE class_id = p_class_id
      AND student_id = p_student_id;
    
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    
    IF v_deleted = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Student was not enrolled in this class');
    END IF;
    
    -- Clear student's batch field
    UPDATE users
    SET batch = NULL
    WHERE id = p_student_id;
    
    RETURN jsonb_build_object('success', true, 'message', 'Student removed from class');
END;
$$;

GRANT EXECUTE ON FUNCTION remove_student_from_class(UUID, UUID) TO authenticated;

-- ============================================
-- PART 6: Move Student Between Classes
-- ============================================

DROP FUNCTION IF EXISTS move_student_between_classes(UUID, UUID, UUID) CASCADE;

CREATE OR REPLACE FUNCTION move_student_between_classes(
    p_student_id UUID,
    p_from_class_id UUID,
    p_to_class_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_to_class RECORD;
    v_student_name TEXT;
BEGIN
    -- Get destination class info
    SELECT id, class_code, school_id INTO v_to_class
    FROM classes
    WHERE id = p_to_class_id;
    
    IF v_to_class IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Destination class not found');
    END IF;
    
    -- Get student name for message
    SELECT username INTO v_student_name
    FROM users
    WHERE id = p_student_id;
    
    -- Remove from old class (if specified)
    IF p_from_class_id IS NOT NULL THEN
        DELETE FROM class_students
        WHERE class_id = p_from_class_id
          AND student_id = p_student_id;
    END IF;
    
    -- Check if already in destination class
    IF EXISTS (SELECT 1 FROM class_students WHERE class_id = p_to_class_id AND student_id = p_student_id) THEN
        -- Already there, just update batch
        UPDATE users SET batch = v_to_class.class_code WHERE id = p_student_id;
        RETURN jsonb_build_object('success', true, 'message', 'Student already in destination class');
    END IF;
    
    -- Add to new class
    INSERT INTO class_students (class_id, student_id)
    VALUES (p_to_class_id, p_student_id);
    
    -- Update batch
    UPDATE users
    SET batch = v_to_class.class_code
    WHERE id = p_student_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'message', format('Student %s moved to class %s', COALESCE(v_student_name, 'Unknown'), v_to_class.class_code)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION move_student_between_classes(UUID, UUID, UUID) TO authenticated;

-- ============================================
-- PART 7: Bulk Add Students to Class
-- ============================================

DROP FUNCTION IF EXISTS bulk_add_students_to_class(UUID, UUID[]) CASCADE;

CREATE OR REPLACE FUNCTION bulk_add_students_to_class(
    p_class_id UUID,
    p_student_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_class RECORD;
    v_added INT := 0;
    v_skipped INT := 0;
    v_student_id UUID;
BEGIN
    -- Get class info
    SELECT id, class_code, school_id INTO v_class
    FROM classes
    WHERE id = p_class_id;
    
    IF v_class IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Class not found');
    END IF;
    
    -- Process each student
    FOREACH v_student_id IN ARRAY p_student_ids
    LOOP
        -- Check if already enrolled
        IF EXISTS (SELECT 1 FROM class_students WHERE class_id = p_class_id AND student_id = v_student_id) THEN
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;
        
        -- Check student is in same school
        IF NOT EXISTS (
            SELECT 1 FROM users 
            WHERE id = v_student_id 
              AND school_id = v_class.school_id
              AND COALESCE(role, 'student') = 'student'
        ) THEN
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;
        
        -- Add to class
        INSERT INTO class_students (class_id, student_id)
        VALUES (p_class_id, v_student_id);
        
        -- Update batch
        UPDATE users SET batch = v_class.class_code WHERE id = v_student_id;
        
        v_added := v_added + 1;
    END LOOP;
    
    RETURN jsonb_build_object(
        'success', true,
        'added', v_added,
        'skipped', v_skipped,
        'message', format('Added %s students to class %s (skipped %s)', v_added, v_class.class_code, v_skipped)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION bulk_add_students_to_class(UUID, UUID[]) TO authenticated;

-- ============================================
-- PART 8: Bulk Remove Students from Class
-- ============================================

DROP FUNCTION IF EXISTS bulk_remove_students_from_class(UUID, UUID[]) CASCADE;

CREATE OR REPLACE FUNCTION bulk_remove_students_from_class(
    p_class_id UUID,
    p_student_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_removed INT;
BEGIN
    -- Remove students
    DELETE FROM class_students
    WHERE class_id = p_class_id
      AND student_id = ANY(p_student_ids);
    
    GET DIAGNOSTICS v_removed = ROW_COUNT;
    
    -- Clear batch for removed students
    UPDATE users
    SET batch = NULL
    WHERE id = ANY(p_student_ids);
    
    RETURN jsonb_build_object(
        'success', true,
        'removed', v_removed,
        'message', format('Removed %s students from class', v_removed)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION bulk_remove_students_from_class(UUID, UUID[]) TO authenticated;

-- ============================================
-- PART 9: Get Class Statistics
-- ============================================

DROP FUNCTION IF EXISTS get_class_statistics(UUID) CASCADE;

CREATE OR REPLACE FUNCTION get_class_statistics(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
    v_class RECORD;
BEGIN
    -- Get class info
    SELECT * INTO v_class FROM classes WHERE id = p_class_id;
    
    IF v_class IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Class not found');
    END IF;
    
    SELECT jsonb_build_object(
        'success', true,
        'class_id', p_class_id,
        'class_code', v_class.class_code,
        'class_name', COALESCE(v_class.class_name, v_class.class_code),
        'grade_level', v_class.grade_level,
        'student_count', (SELECT COUNT(*) FROM class_students WHERE class_id = p_class_id),
        'teacher_count', (SELECT COUNT(*) FROM class_teacher_assignments WHERE class_id = p_class_id AND active = true),
        'avg_level', (
            SELECT COALESCE(ROUND(AVG(u.level)::numeric, 1), 0)
            FROM class_students cs
            JOIN users u ON u.id = cs.student_id
            WHERE cs.class_id = p_class_id
        ),
        'avg_xp', (
            SELECT COALESCE(ROUND(AVG(u.xp)::numeric, 0), 0)
            FROM class_students cs
            JOIN users u ON u.id = cs.student_id
            WHERE cs.class_id = p_class_id
        ),
        'total_xp', (
            SELECT COALESCE(SUM(u.xp), 0)
            FROM class_students cs
            JOIN users u ON u.id = cs.student_id
            WHERE cs.class_id = p_class_id
        ),
        'teachers', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'user_id', cta.teacher_user_id,
                'username', u.username,
                'subject', cta.subject
            )), '[]'::jsonb)
            FROM class_teacher_assignments cta
            JOIN users u ON u.id = cta.teacher_user_id
            WHERE cta.class_id = p_class_id AND cta.active = true
        )
    ) INTO v_result;
    
    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_class_statistics(UUID) TO authenticated;

-- ============================================
-- PART 10: Auto-Enroll Students by Grade
-- ============================================

DROP FUNCTION IF EXISTS auto_enroll_students_by_grade(UUID) CASCADE;

CREATE OR REPLACE FUNCTION auto_enroll_students_by_grade(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_class RECORD;
    v_enrolled INT := 0;
BEGIN
    -- Get class info
    SELECT * INTO v_class FROM classes WHERE id = p_class_id;
    
    IF v_class IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Class not found');
    END IF;
    
    IF v_class.grade_level IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Class has no grade level set');
    END IF;
    
    -- Enroll all students matching the grade level who aren't already in a class
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
    
    -- Update batch for enrolled students
    UPDATE users
    SET batch = v_class.class_code
    WHERE id IN (
        SELECT cs.student_id
        FROM class_students cs
        WHERE cs.class_id = p_class_id
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'enrolled', v_enrolled,
        'message', format('Auto-enrolled %s students matching grade %s', v_enrolled, v_class.grade_level)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION auto_enroll_students_by_grade(UUID) TO authenticated;

-- ============================================
-- SUMMARY
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'CLASS ROSTER MANAGEMENT SYSTEM INSTALLED ✅';
    RAISE NOTICE '================================================';
    RAISE NOTICE '';
    RAISE NOTICE 'New RPC Functions Available:';
    RAISE NOTICE '  📋 get_class_roster(class_id) - Get all students in a class';
    RAISE NOTICE '  📊 get_school_class_rosters(school_id) - Get all classes with student counts';
    RAISE NOTICE '  🔍 get_unassigned_students(school_id) - Get students not in any class';
    RAISE NOTICE '  ➕ add_student_to_class(class_id, student_id) - Add student to class';
    RAISE NOTICE '  ➖ remove_student_from_class(class_id, student_id) - Remove student from class';
    RAISE NOTICE '  🔄 move_student_between_classes(student_id, from_class, to_class) - Move student';
    RAISE NOTICE '  📦 bulk_add_students_to_class(class_id, student_ids[]) - Bulk add';
    RAISE NOTICE '  🗑️ bulk_remove_students_from_class(class_id, student_ids[]) - Bulk remove';
    RAISE NOTICE '  📈 get_class_statistics(class_id) - Get class stats (avg XP, level, etc)';
    RAISE NOTICE '  🎯 auto_enroll_students_by_grade(class_id) - Auto-enroll by grade';
    RAISE NOTICE '';
    RAISE NOTICE 'All functions are SECURITY DEFINER and granted to authenticated users.';
    RAISE NOTICE '';
END $$;
