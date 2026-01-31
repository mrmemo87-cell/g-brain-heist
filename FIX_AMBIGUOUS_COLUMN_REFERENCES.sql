-- ============================================
-- Fix Ambiguous Column References in RPC Functions
-- ============================================
-- This fixes the "column reference 'id' is ambiguous" error
-- that occurs when multiple tables with 'id' columns are joined
-- ============================================

-- ============================================
-- Fix 1: get_teacher_assigned_classes
-- ============================================
-- Drop ALL versions of the function first
DROP FUNCTION IF EXISTS get_teacher_assigned_classes(UUID);
DROP FUNCTION IF EXISTS get_teacher_assigned_classes();

CREATE OR REPLACE FUNCTION get_teacher_assigned_classes(p_teacher_user_id UUID DEFAULT NULL)
RETURNS TABLE (
    class_id UUID,
    class_code TEXT,
    class_name TEXT,
    grade_level TEXT,
    subject TEXT,
    is_active BOOLEAN,
    school_id UUID,
    school_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_teacher_user_id UUID;
BEGIN
    -- Use provided user ID or current authenticated user
    v_teacher_user_id := COALESCE(p_teacher_user_id, auth.uid());
    
    IF v_teacher_user_id IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;
    
    -- Return all classes assigned to this teacher
    RETURN QUERY
    SELECT 
        c.id AS class_id,
        c.class_code AS class_code,
        c.class_name AS class_name,
        c.grade_level AS grade_level,
        cta.subject AS subject,
        cta.active AS is_active,
        c.school_id AS school_id,
        s.name AS school_name
    FROM class_teacher_assignments cta
    JOIN classes c ON c.id = cta.class_id
    LEFT JOIN schools s ON s.id = c.school_id
    WHERE cta.teacher_user_id = v_teacher_user_id
      AND cta.active = true
      AND c.is_active = true
    ORDER BY s.name NULLS LAST, c.grade_level, c.class_code, cta.subject;
END;
$$;

GRANT EXECUTE ON FUNCTION get_teacher_assigned_classes(UUID) TO authenticated;

-- ============================================
-- Fix 2: rpc_get_students_for_assignment
-- ============================================
-- Drop ALL versions of the function first
DROP FUNCTION IF EXISTS rpc_get_students_for_assignment(UUID);
DROP FUNCTION IF EXISTS rpc_get_students_for_assignment();

CREATE OR REPLACE FUNCTION rpc_get_students_for_assignment(
    p_teacher_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    username TEXT,
    display_name TEXT,
    grade TEXT,
    batch TEXT,
    avatar_url TEXT,
    school_id UUID,
    class_id UUID,
    class_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_teacher_user_id UUID;
    v_teacher_school_id UUID;
    v_has_assignments BOOLEAN;
BEGIN
    -- Get teacher user ID from teachers table if p_teacher_id provided
    IF p_teacher_id IS NOT NULL THEN
        SELECT t.user_id INTO v_teacher_user_id
        FROM teachers t
        WHERE t.id = p_teacher_id;
    END IF;
    
    -- Fallback to current user if not found
    IF v_teacher_user_id IS NULL THEN
        v_teacher_user_id := auth.uid();
    END IF;
    
    -- Get teacher's school
    SELECT u.school_id INTO v_teacher_school_id
    FROM users u
    WHERE u.id = v_teacher_user_id;
    
    -- Check if teacher has any class assignments
    SELECT EXISTS (
        SELECT 1
        FROM class_teacher_assignments cta_check
        WHERE cta_check.teacher_user_id = v_teacher_user_id
        AND cta_check.active = true
    ) INTO v_has_assignments;
    
    -- If teacher has class assignments, only show students from those classes
    IF v_has_assignments THEN
        RETURN QUERY
        SELECT DISTINCT
            u.id AS id,
            u.username AS username,
            u.username AS display_name,  -- Use username as display_name (column doesn't exist)
            u.grade AS grade,
            u.batch AS batch,
            u.avatar_url AS avatar_url,
            u.school_id AS school_id,
            cs.class_id AS class_id,
            c.class_code AS class_code
        FROM get_students_in_teacher_classes(v_teacher_user_id) gstc
        JOIN users u ON u.id = gstc.student_id
        LEFT JOIN class_students cs ON cs.student_id = u.id
        LEFT JOIN classes c ON c.id = cs.class_id
        WHERE NOT COALESCE(u.is_banned, false)
        ORDER BY u.grade NULLS LAST, u.batch NULLS LAST, u.username;
    ELSE
        -- Fallback: If no class assignments, show all students from teacher's school
        RETURN QUERY
        SELECT
            u.id AS id,
            u.username AS username,
            u.username AS display_name,  -- Use username as display_name (column doesn't exist)
            u.grade AS grade,
            u.batch AS batch,
            u.avatar_url AS avatar_url,
            u.school_id AS school_id,
            cs.class_id AS class_id,
            c.class_code AS class_code
        FROM users u
        LEFT JOIN class_students cs ON cs.student_id = u.id
        LEFT JOIN classes c ON c.id = cs.class_id
        WHERE COALESCE(u.role, 'student') = 'student'
          AND NOT COALESCE(u.is_banned, false)
          AND (v_teacher_school_id IS NULL OR u.school_id = v_teacher_school_id OR u.school_id IS NULL)
        ORDER BY u.grade NULLS LAST, u.batch NULLS LAST, u.username;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_get_students_for_assignment(UUID) TO authenticated;

-- ============================================
-- Verification Queries
-- ============================================

-- Test get_teacher_assigned_classes
-- SELECT * FROM get_teacher_assigned_classes(NULL);

-- Test rpc_get_students_for_assignment  
-- SELECT * FROM rpc_get_students_for_assignment(NULL);
