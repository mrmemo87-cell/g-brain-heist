-- DIAGNOSTIC SCRIPT: Teacher Not Seeing Class and Students
-- This script helps diagnose why a teacher assigned to class 11B doesn't see the class or students

-- Replace the teacher email and class name with actual values
-- Example: 'teacher@school.com', 'class 11B'
DO $$ 
DECLARE
    v_teacher_user_id UUID;
    v_teacher_id UUID;
    v_teacher_username TEXT;
    v_class_code TEXT := '11B'; -- Update this to match your class code
    v_class_id UUID;
    v_school_id UUID;
    v_count_classes_assigned INT;
    v_count_students_in_class INT;
    v_count_from_rpc INT;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'TEACHER VISIBILITY DIAGNOSTIC';
    RAISE NOTICE '========================================';
    
    -- Step 1: Find the teacher by user ID (you'll need to know this)
    -- For now, let's find all teachers and show their info
    RAISE NOTICE '
    STEP 1: Finding teacher profile...';
    
    -- Get first teacher for testing (modify if needed)
    SELECT u.id, u.username, t.id INTO v_teacher_user_id, v_teacher_username, v_teacher_id
    FROM users u
    JOIN teachers t ON t.user_id = u.id
    WHERE u.role = 'teacher'
    LIMIT 1;
    
    IF v_teacher_user_id IS NULL THEN
        RAISE NOTICE 'ERROR: No teacher found!';
        RETURN;
    END IF;
    
    RAISE NOTICE 'Found teacher: % (user_id: %)', v_teacher_username, v_teacher_user_id;
    RAISE NOTICE 'Teacher profile ID: %', v_teacher_id;
    
    -- Step 2: Check if teacher has any class assignments
    RAISE NOTICE '
    STEP 2: Checking class_teacher_assignments...';
    
    SELECT COUNT(*) INTO v_count_classes_assigned
    FROM class_teacher_assignments
    WHERE teacher_user_id = v_teacher_user_id AND active = true;
    
    RAISE NOTICE 'Teacher has % active class assignments', v_count_classes_assigned;
    
    IF v_count_classes_assigned = 0 THEN
        RAISE NOTICE 'WARNING: Teacher has NO class assignments!';
    ELSE
        -- Show the assigned classes
        RAISE NOTICE 'Assigned classes:';
        PERFORM 1 FROM (
            SELECT 
                c.class_code,
                c.class_name,
                cta.subject,
                s.name as school_name
            FROM class_teacher_assignments cta
            JOIN classes c ON c.id = cta.class_id
            LEFT JOIN schools s ON s.id = c.school_id
            WHERE cta.teacher_user_id = v_teacher_user_id
            AND cta.active = true
        ) t;
    END IF;
    
    -- Step 3: Find the specific class and check students
    RAISE NOTICE '
    STEP 3: Looking for class % ...', v_class_code;
    
    SELECT c.id, c.school_id INTO v_class_id, v_school_id
    FROM classes c
    WHERE LOWER(c.class_code) = LOWER(v_class_code)
    LIMIT 1;
    
    IF v_class_id IS NULL THEN
        RAISE NOTICE 'ERROR: Class % not found in database!', v_class_code;
        RETURN;
    END IF;
    
    RAISE NOTICE 'Found class: % (ID: %)', v_class_code, v_class_id;
    RAISE NOTICE 'School ID: %', v_school_id;
    
    -- Step 4: Check students in this class
    RAISE NOTICE '
    STEP 4: Checking class_students junction table...';
    
    SELECT COUNT(*) INTO v_count_students_in_class
    FROM class_students
    WHERE class_id = v_class_id;
    
    RAISE NOTICE 'Class % has % students enrolled', v_class_code, v_count_students_in_class;
    
    IF v_count_students_in_class = 0 THEN
        RAISE NOTICE 'WARNING: Class has NO students enrolled in class_students table!';
        RAISE NOTICE 'This is why the teacher doesn''t see any students.';
        RAISE NOTICE 'ACTION: Need to enroll students in the class using class_students table.';
    ELSE
        -- Show student details
        RAISE NOTICE 'Students in this class:';
        PERFORM 1 FROM (
            SELECT u.username, u.grade, u.batch
            FROM class_students cs
            JOIN users u ON u.id = cs.student_id
            WHERE cs.class_id = v_class_id
        ) t;
    END IF;
    
    -- Step 5: Verify teacher-to-class relationship
    RAISE NOTICE '
    STEP 5: Verifying teacher is assigned to this specific class...';
    
    SELECT EXISTS (
        SELECT 1
        FROM class_teacher_assignments
        WHERE teacher_user_id = v_teacher_user_id
        AND class_id = v_class_id
        AND active = true
    ) INTO v_count_classes_assigned;
    
    IF v_count_classes_assigned THEN
        RAISE NOTICE 'OK: Teacher IS assigned to class %', v_class_code;
    ELSE
        RAISE NOTICE 'ERROR: Teacher is NOT assigned to class %!', v_class_code;
        RAISE NOTICE 'ACTION: Admin needs to assign this teacher to the class.';
        RETURN;
    END IF;
    
    -- Step 6: Test the RPC function
    RAISE NOTICE '
    STEP 6: Testing rpc_get_students_for_assignment...';
    
    SELECT COUNT(*) INTO v_count_from_rpc
    FROM rpc_get_students_for_assignment(v_teacher_id);
    
    RAISE NOTICE 'RPC returned % students', v_count_from_rpc;
    
    IF v_count_from_rpc = 0 THEN
        RAISE NOTICE 'ERROR: RPC returned 0 students!';
        RAISE NOTICE 'ACTION: Check RPC function logic - it may have a bug.';
    ELSE
        RAISE NOTICE 'OK: RPC is returning students';
    END IF;
    
    -- Step 7: Summary and recommendations
    RAISE NOTICE '
    ========================================';
    RAISE NOTICE 'SUMMARY:';
    RAISE NOTICE '========================================';
    
    IF v_count_classes_assigned = 0 THEN
        RAISE NOTICE 'ISSUE: Teacher has NO class assignments';
        RAISE NOTICE 'ACTION: Use SchoolAdminPortal to assign teacher to class';
    ELSIF v_count_students_in_class = 0 THEN
        RAISE NOTICE 'ISSUE: Class % has NO students enrolled', v_class_code;
        RAISE NOTICE 'ACTION: Use SchoolAdminPortal to add students to the class';
    ELSIF v_count_from_rpc = 0 THEN
        RAISE NOTICE 'ISSUE: RPC function not returning students';
        RAISE NOTICE 'ACTION: There may be a bug in rpc_get_students_for_assignment';
    ELSE
        RAISE NOTICE 'OK: Everything looks correct';
        RAISE NOTICE 'ACTION: Check frontend/client-side caching or try refreshing the page';
    END IF;
    
END $$;
