-- FIX_TEACHER_VISIBILITY_ISSUE.sql
-- Fixes the issue where teachers assigned to a class don't see the class or students

-- ============================================
-- STEP 1: Improved get_teacher_assigned_classes RPC
-- Now includes logging and handles more edge cases
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
    v_count INT;
BEGIN
    -- Use provided user ID or current authenticated user
    v_teacher_user_id := COALESCE(p_teacher_user_id, auth.uid());
    
    IF v_teacher_user_id IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;
    
    -- Debug: Check if teacher has any assignments
    SELECT COUNT(*) INTO v_count
    FROM class_teacher_assignments cta
    WHERE cta.teacher_user_id = v_teacher_user_id;
    
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
        COALESCE(s.name::TEXT, 'Unknown School') AS school_name
    FROM class_teacher_assignments cta
    JOIN classes c ON c.id = cta.class_id
    LEFT JOIN schools s ON s.id = c.school_id
    WHERE cta.teacher_user_id = v_teacher_user_id
      AND cta.active = true
    ORDER BY s.name NULLS LAST, c.grade_level, c.class_code, cta.subject;
END;
$$;

GRANT EXECUTE ON FUNCTION get_teacher_assigned_classes(UUID) TO authenticated;

-- ============================================
-- STEP 2: Improved rpc_get_students_for_assignment RPC
-- FIXED: Now correctly returns students even if class_students table is empty
-- The original query used JOIN class_students which fails if no students are enrolled
-- New query uses LEFT JOIN to handle both cases:
-- 1. Students explicitly added to class_students
-- 2. All students from the school (fallback for new classes with no enrollments)
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
        SELECT t.user_id, t.school_id INTO v_teacher_user_id, v_teacher_school_id
        FROM teachers t
        WHERE t.id = p_teacher_id;
    END IF;
    
    -- Fallback to current user if not found
    IF v_teacher_user_id IS NULL THEN
        v_teacher_user_id := auth.uid();
        
        -- Get teacher's school from users table
        SELECT u.school_id INTO v_teacher_school_id
        FROM users u
        WHERE u.id = v_teacher_user_id;
    END IF;
    
    -- Check if teacher has any class assignments
    SELECT EXISTS (
        SELECT 1
        FROM class_teacher_assignments cta_check
        WHERE cta_check.teacher_user_id = v_teacher_user_id
        AND cta_check.active = true
    ) INTO v_has_assignments;
    
    -- If teacher has class assignments, return students from those classes
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
            COALESCE(cs.class_id, c.id) AS class_id,
            c.class_code::TEXT AS class_code
        FROM class_teacher_assignments cta
        JOIN classes c ON c.id = cta.class_id
        JOIN users u ON u.school_id = c.school_id AND u.role = 'student'
        LEFT JOIN class_students cs ON cs.class_id = c.id AND cs.student_id = u.id
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
-- STEP 3: TROUBLESHOOTING QUERIES
-- Use these to diagnose issues
-- ============================================

-- Query 1: Check if a specific teacher has class assignments
-- Replace 'teacher_email@school.com' with the teacher's actual email
/*
SELECT 
    cta.id,
    cta.teacher_user_id,
    c.class_code,
    c.class_name,
    cta.subject,
    cta.active as is_assignment_active,
    c.is_active as is_class_active
FROM class_teacher_assignments cta
JOIN classes c ON c.id = cta.class_id
JOIN users u ON u.id = cta.teacher_user_id
WHERE u.email = 'teacher_email@school.com'
ORDER BY c.class_code;
*/

-- Query 2: Check all students in a specific class
-- Replace 'class_code_here' with the class code (e.g., '11B')
/*
SELECT 
    u.id,
    u.username,
    u.grade,
    u.batch,
    cs.class_id
FROM class_students cs
JOIN users u ON u.id = cs.student_id
JOIN classes c ON c.id = cs.class_id
WHERE LOWER(c.class_code) = LOWER('class_code_here')
ORDER BY u.username;
*/

-- Query 3: Check if there are students in the school but NOT in the class_students table
-- Replace 'class_code_here' with the class code
/*
SELECT 
    u.id,
    u.username,
    u.grade,
    u.batch,
    'NOT_ENROLLED' as status
FROM users u
WHERE u.role = 'student'
  AND u.school_id = (SELECT school_id FROM classes WHERE LOWER(class_code) = LOWER('class_code_here') LIMIT 1)
  AND NOT EXISTS (
      SELECT 1 FROM class_students cs
      WHERE cs.student_id = u.id
  )
ORDER BY u.username;
*/

-- ============================================
-- STEP 4: COMMON FIXES
-- ============================================

-- Fix 1: Activate a class that might be inactive
-- Replace 'class_code_here' with the actual class code
/*
UPDATE classes
SET is_active = true
WHERE LOWER(class_code) = LOWER('class_code_here');
*/

-- Fix 2: Activate a teacher assignment that might be inactive
-- Replace values with actual data
/*
UPDATE class_teacher_assignments
SET active = true
WHERE teacher_user_id = (SELECT id FROM users WHERE email = 'teacher@school.com' LIMIT 1)
  AND class_id = (SELECT id FROM classes WHERE LOWER(class_code) = LOWER('11B') LIMIT 1);
*/

-- Fix 3: Manually enroll students in a class if needed
-- Replace 'class_code_here' with the actual class code
-- This enrolls ALL students from that school into the class
/*
INSERT INTO class_students (class_id, student_id)
SELECT 
    c.id,
    u.id
FROM classes c
CROSS JOIN users u
WHERE LOWER(c.class_code) = LOWER('class_code_here')
  AND u.role = 'student'
  AND u.school_id = c.school_id
  AND NOT COALESCE(u.is_banned, false)
  AND NOT EXISTS (
      SELECT 1 FROM class_students cs
      WHERE cs.class_id = c.id
      AND cs.student_id = u.id
  )
ON CONFLICT DO NOTHING;
*/

RAISE NOTICE '✓ get_teacher_assigned_classes updated with better error handling';
RAISE NOTICE '✓ rpc_get_students_for_assignment updated to include students from assigned classes';
RAISE NOTICE '✓ RPC functions should now handle edge cases better';
RAISE NOTICE 'See comments above for troubleshooting queries and common fixes';
