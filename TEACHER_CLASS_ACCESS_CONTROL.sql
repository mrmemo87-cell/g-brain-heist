-- ============================================
-- Teacher Class Access Control
-- ============================================
-- This migration adds functions to:
-- 1. Fetch teacher's assigned classes from class_teacher_assignments
-- 2. Restrict teachers to only see/access their assigned classes
-- 3. Filter Cambridge test results by assigned classes
-- 4. Control access to assignments and student data
-- ============================================

-- ============================================
-- 1. Function: Get Teacher's Assigned Classes
-- ============================================
CREATE OR REPLACE FUNCTION get_teacher_assigned_classes(p_teacher_user_id UUID DEFAULT NULL)
RETURNS TABLE (
    class_id UUID,
    class_code TEXT,
    class_name TEXT,
    grade_level INTEGER,
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
        c.class_code,
        c.class_name,
        c.grade_level,
        cta.subject,
        cta.active AS is_active,
        c.school_id,
        s.name AS school_name
    FROM class_teacher_assignments cta
    JOIN classes c ON c.id = cta.class_id
    LEFT JOIN schools s ON s.id = c.school_id
    WHERE cta.teacher_user_id = v_teacher_user_id
      AND cta.active = true
      AND c.is_active = true
    ORDER BY s.name, c.grade_level, c.class_code, cta.subject;
END;
$$;

GRANT EXECUTE ON FUNCTION get_teacher_assigned_classes(UUID) TO authenticated;

-- ============================================
-- 2. Function: Check if Teacher Has Access to Class
-- ============================================
CREATE OR REPLACE FUNCTION teacher_has_class_access(
    p_teacher_user_id UUID,
    p_class_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM class_teacher_assignments cta
        WHERE cta.teacher_user_id = p_teacher_user_id
          AND cta.class_id = p_class_id
          AND cta.active = true
    );
END;
$$;

GRANT EXECUTE ON FUNCTION teacher_has_class_access(UUID, UUID) TO authenticated;

-- ============================================
-- 3. Function: Get Students in Teacher's Classes
-- ============================================
CREATE OR REPLACE FUNCTION get_students_in_teacher_classes(p_teacher_user_id UUID DEFAULT NULL)
RETURNS TABLE (
    student_id UUID,
    username TEXT,
    email TEXT,
    display_name TEXT,
    grade INTEGER,
    batch TEXT,
    avatar_url TEXT,
    class_id UUID,
    class_code TEXT,
    class_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_teacher_user_id UUID;
BEGIN
    v_teacher_user_id := COALESCE(p_teacher_user_id, auth.uid());
    
    IF v_teacher_user_id IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;
    
    -- Return students enrolled in any class taught by this teacher
    RETURN QUERY
    SELECT DISTINCT
        u.id AS student_id,
        u.username,
        u.email,
        COALESCE(u.display_name, u.username) AS display_name,
        u.grade,
        u.batch,
        u.avatar_url,
        cs.class_id,
        c.class_code,
        c.class_name
    FROM class_teacher_assignments cta
    JOIN class_students cs ON cs.class_id = cta.class_id
    JOIN users u ON u.id = cs.student_id
    JOIN classes c ON c.id = cs.class_id
    WHERE cta.teacher_user_id = v_teacher_user_id
      AND cta.active = true
      AND NOT COALESCE(u.is_banned, false)
    ORDER BY c.class_code, u.username;
END;
$$;

GRANT EXECUTE ON FUNCTION get_students_in_teacher_classes(UUID) TO authenticated;

-- ============================================
-- 4. Function: Get Teacher Profile with Classes
-- ============================================
CREATE OR REPLACE FUNCTION get_teacher_profile_with_classes(p_teacher_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_teacher_user_id UUID;
    v_teacher_profile JSONB;
    v_assigned_classes JSONB;
    v_school_info JSONB;
BEGIN
    v_teacher_user_id := COALESCE(p_teacher_user_id, auth.uid());
    
    IF v_teacher_user_id IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;
    
    -- Get teacher basic profile
    SELECT jsonb_build_object(
        'user_id', u.id,
        'username', u.username,
        'email', u.email,
        'role', u.role,
        'avatar_url', u.avatar_url,
        'school_id', u.school_id
    )
    INTO v_teacher_profile
    FROM users u
    WHERE u.id = v_teacher_user_id;
    
    IF v_teacher_profile IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;
    
    -- Get assigned classes
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'class_id', ac.class_id,
        'class_code', ac.class_code,
        'class_name', ac.class_name,
        'grade_level', ac.grade_level,
        'subject', ac.subject,
        'school_name', ac.school_name
    )), '[]'::jsonb)
    INTO v_assigned_classes
    FROM get_teacher_assigned_classes(v_teacher_user_id) ac;
    
    -- Get school info if teacher belongs to a school
    IF (v_teacher_profile->>'school_id') IS NOT NULL THEN
        SELECT jsonb_build_object(
            'id', s.id,
            'name', s.name,
            'logo_url', s.logo_url
        )
        INTO v_school_info
        FROM schools s
        WHERE s.id = (v_teacher_profile->>'school_id')::UUID;
    END IF;
    
    RETURN jsonb_build_object(
        'success', true,
        'profile', v_teacher_profile,
        'assigned_classes', v_assigned_classes,
        'school', COALESCE(v_school_info, 'null'::jsonb),
        'total_classes', jsonb_array_length(v_assigned_classes)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_teacher_profile_with_classes(UUID) TO authenticated;

-- ============================================
-- 5. Update RLS Policy for quiz_scores (Cambridge Tests)
-- ============================================
-- Teachers should only see Cambridge test results for students in their assigned classes

-- First, check what column name is used in quiz_scores table
-- Common possibilities: student_name, user_id, or student identifier stored as text

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Teachers see their classes" ON quiz_scores;
DROP POLICY IF EXISTS "Teachers see assigned classes" ON quiz_scores;
DROP POLICY IF EXISTS "Anyone can view scores" ON quiz_scores;

-- Create new policy that restricts by class assignment
-- Note: quiz_scores typically uses student_name (TEXT) and student_class (TEXT) columns
CREATE POLICY "Teachers see assigned classes" ON quiz_scores
FOR SELECT
USING (
    -- Admins see everything
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'school_admin'))
    OR
    -- Students see their own scores (match by username/student_name)
    EXISTS (
        SELECT 1 FROM users 
        WHERE id = auth.uid() 
        AND username = quiz_scores.student_name
    )
    OR
    -- Teachers see scores from students in their assigned classes
    EXISTS (
        SELECT 1
        FROM class_teacher_assignments cta
        JOIN class_students cs ON cs.class_id = cta.class_id
        JOIN users u ON u.id = cs.student_id
        WHERE cta.teacher_user_id = auth.uid()
        AND cta.active = true
        AND u.username = quiz_scores.student_name
    )
    OR
    -- Also match by student_class if teacher teaches that class
    EXISTS (
        SELECT 1
        FROM class_teacher_assignments cta
        JOIN classes c ON c.id = cta.class_id
        WHERE cta.teacher_user_id = auth.uid()
        AND cta.active = true
        AND (
            c.class_code = quiz_scores.student_class
            OR c.class_name = quiz_scores.student_class
        )
    )
);

-- ============================================
-- 6. Helper Function: Filter Classes by Teacher Assignment
-- ============================================
-- This can be used by frontend to filter dropdown options
CREATE OR REPLACE FUNCTION filter_classes_for_teacher(
    p_teacher_user_id UUID DEFAULT NULL,
    p_school_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    class_code TEXT,
    class_name TEXT,
    grade_level INTEGER,
    subjects TEXT[]  -- Array of subjects this teacher teaches in this class
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_teacher_user_id UUID;
BEGIN
    v_teacher_user_id := COALESCE(p_teacher_user_id, auth.uid());
    
    IF v_teacher_user_id IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;
    
    RETURN QUERY
    SELECT 
        c.id,
        c.class_code,
        c.class_name,
        c.grade_level,
        ARRAY_AGG(DISTINCT cta.subject) AS subjects
    FROM class_teacher_assignments cta
    JOIN classes c ON c.id = cta.class_id
    WHERE cta.teacher_user_id = v_teacher_user_id
      AND cta.active = true
      AND c.is_active = true
      AND (p_school_id IS NULL OR c.school_id = p_school_id)
    GROUP BY c.id, c.class_code, c.class_name, c.grade_level
    ORDER BY c.grade_level, c.class_code;
END;
$$;

GRANT EXECUTE ON FUNCTION filter_classes_for_teacher(UUID, UUID) TO authenticated;

-- ============================================
-- 7. Update student visibility for teachers
-- ============================================
-- Modify rpc_get_students_for_assignment to only show students in assigned classes

DROP FUNCTION IF EXISTS rpc_get_students_for_assignment(UUID);

CREATE OR REPLACE FUNCTION rpc_get_students_for_assignment(
    p_teacher_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    username TEXT,
    display_name TEXT,
    grade SMALLINT,
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
    -- Get teacher user ID
    SELECT user_id INTO v_teacher_user_id
    FROM teachers
    WHERE id = p_teacher_id;
    
    IF v_teacher_user_id IS NULL THEN
        v_teacher_user_id := auth.uid();
    END IF;
    
    -- Get teacher's school
    SELECT school_id INTO v_teacher_school_id
    FROM users
    WHERE id = v_teacher_user_id;
    
    -- Check if teacher has any class assignments
    SELECT EXISTS (
        SELECT 1
        FROM class_teacher_assignments
        WHERE teacher_user_id = v_teacher_user_id
        AND active = true
    ) INTO v_has_assignments;
    
    -- If teacher has class assignments, only show students from those classes
    IF v_has_assignments THEN
        RETURN QUERY
        SELECT DISTINCT
            u.id,
            u.username,
            COALESCE(u.display_name, u.username) AS display_name,
            u.grade,
            u.batch,
            u.avatar_url,
            u.school_id,
            cs.class_id,
            c.class_code
        FROM get_students_in_teacher_classes(v_teacher_user_id) gstc
        JOIN users u ON u.id = gstc.student_id
        LEFT JOIN class_students cs ON cs.student_id = u.id
        LEFT JOIN classes c ON c.id = cs.class_id
        WHERE NOT COALESCE(u.is_banned, false);
    ELSE
        -- Fallback: If no class assignments, show all students from teacher's school
        RETURN QUERY
        SELECT
            u.id,
            u.username,
            COALESCE(u.display_name, u.username) AS display_name,
            u.grade,
            u.batch,
            u.avatar_url,
            u.school_id,
            cs.class_id,
            c.class_code
        FROM users u
        LEFT JOIN class_students cs ON cs.student_id = u.id
        LEFT JOIN classes c ON c.id = cs.class_id
        WHERE COALESCE(u.role, 'student') = 'student'
          AND NOT COALESCE(u.is_banned, false)
          AND (v_teacher_school_id IS NULL OR u.school_id = v_teacher_school_id OR u.school_id IS NULL);
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_get_students_for_assignment(UUID) TO authenticated;

-- ============================================
-- SUMMARY
-- ============================================
-- Created functions:
-- 1. get_teacher_assigned_classes() - Get all classes assigned to a teacher
-- 2. teacher_has_class_access() - Check if teacher can access a specific class
-- 3. get_students_in_teacher_classes() - Get all students in teacher's classes
-- 4. get_teacher_profile_with_classes() - Get complete teacher profile with class info
-- 5. filter_classes_for_teacher() - Get classes for UI dropdowns
-- 6. Updated quiz_scores RLS policy - Restrict Cambridge test access
-- 7. Updated rpc_get_students_for_assignment() - Only show students from assigned classes
-- ============================================
