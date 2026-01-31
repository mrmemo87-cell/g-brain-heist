-- ============================================
-- COMPREHENSIVE FIX: Teacher Portal RPC Functions
-- ============================================
-- Run this ENTIRE file in Supabase SQL Editor
-- This fixes ALL type mismatches and missing columns
-- ============================================

-- ============================================
-- STEP 1: Drop ALL existing versions of functions
-- ============================================
-- Force drop with CASCADE to remove any dependencies
DO $$
BEGIN
    -- Drop all versions of get_teacher_assigned_classes
    DROP FUNCTION IF EXISTS get_teacher_assigned_classes(UUID) CASCADE;
    DROP FUNCTION IF EXISTS get_teacher_assigned_classes() CASCADE;
    
    -- Drop all versions of rpc_get_students_for_assignment
    DROP FUNCTION IF EXISTS rpc_get_students_for_assignment(UUID) CASCADE;
    DROP FUNCTION IF EXISTS rpc_get_students_for_assignment() CASCADE;
    
    -- Drop helper function
    DROP FUNCTION IF EXISTS get_students_in_teacher_classes(UUID) CASCADE;
    
    RAISE NOTICE 'All existing functions dropped successfully';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Some functions did not exist, continuing...';
END $$;

-- ============================================
-- STEP 2: Recreate get_teacher_assigned_classes
-- Returns classes assigned to a teacher
-- ============================================
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
        c.class_code::TEXT AS class_code,
        c.class_name::TEXT AS class_name,
        c.grade_level::TEXT AS grade_level,
        cta.subject::TEXT AS subject,
        cta.active AS is_active,
        c.school_id AS school_id,
        s.name::TEXT AS school_name
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
-- STEP 3: Recreate rpc_get_students_for_assignment
-- Returns students for teacher assignment creation
-- Uses username for display_name since column doesn't exist
-- ============================================
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
            u.username::TEXT AS username,
            u.username::TEXT AS display_name,
            u.grade::TEXT AS grade,
            u.batch::TEXT AS batch,
            u.avatar_url::TEXT AS avatar_url,
            u.school_id AS school_id,
            cs.class_id AS class_id,
            c.class_code::TEXT AS class_code
        FROM class_teacher_assignments cta
        JOIN class_students cs ON cs.class_id = cta.class_id
        JOIN users u ON u.id = cs.student_id
        LEFT JOIN classes c ON c.id = cs.class_id
        WHERE cta.teacher_user_id = v_teacher_user_id
          AND cta.active = true
          AND NOT COALESCE(u.is_banned, false)
        ORDER BY grade NULLS LAST, batch NULLS LAST, username;
    ELSE
        -- Fallback: If no class assignments, show all students from teacher's school
        RETURN QUERY
        SELECT
            u.id AS id,
            u.username::TEXT AS username,
            u.username::TEXT AS display_name,
            u.grade::TEXT AS grade,
            u.batch::TEXT AS batch,
            u.avatar_url::TEXT AS avatar_url,
            u.school_id AS school_id,
            cs.class_id AS class_id,
            c.class_code::TEXT AS class_code
        FROM users u
        LEFT JOIN class_students cs ON cs.student_id = u.id
        LEFT JOIN classes c ON c.id = cs.class_id
        WHERE COALESCE(u.role, 'student') = 'student'
          AND NOT COALESCE(u.is_banned, false)
          AND (v_teacher_school_id IS NULL OR u.school_id = v_teacher_school_id OR u.school_id IS NULL)
        ORDER BY grade NULLS LAST, batch NULLS LAST, username;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_get_students_for_assignment(UUID) TO authenticated;

-- ============================================
-- STEP 4: Helper function - Get students in teacher's classes
-- ============================================
DROP FUNCTION IF EXISTS get_students_in_teacher_classes(UUID);

CREATE OR REPLACE FUNCTION get_students_in_teacher_classes(p_teacher_user_id UUID)
RETURNS TABLE (
    student_id UUID,
    class_id UUID,
    class_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        cs.student_id,
        cs.class_id,
        c.class_code::TEXT
    FROM class_teacher_assignments cta
    JOIN class_students cs ON cs.class_id = cta.class_id
    JOIN classes c ON c.id = cta.class_id
    WHERE cta.teacher_user_id = p_teacher_user_id
      AND cta.active = true
      AND c.is_active = true;
END;
$$;

GRANT EXECUTE ON FUNCTION get_students_in_teacher_classes(UUID) TO authenticated;

-- ============================================
-- STEP 5: Verification
-- ============================================
DO $$
BEGIN
    RAISE NOTICE '✅ All teacher portal RPC functions recreated successfully!';
    RAISE NOTICE '   - get_teacher_assigned_classes(UUID)';
    RAISE NOTICE '   - rpc_get_students_for_assignment(UUID)';
    RAISE NOTICE '   - get_students_in_teacher_classes(UUID)';
END $$;

-- Verification queries (uncomment to test):
-- SELECT * FROM get_teacher_assigned_classes(NULL);
-- SELECT * FROM rpc_get_students_for_assignment(NULL);
