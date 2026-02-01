-- SPECIFIC TEACHER + CLASS DIAGNOSTIC
-- Replace the email and class code with your actual values
-- Then run this entire script in Supabase SQL Editor

DO $$ 
DECLARE
    -- ⚠️ UPDATE THESE VALUES:
    v_teacher_email TEXT := 'teacher@example.com';  -- ← CHANGE THIS
    v_class_code TEXT := '11B';                      -- ← CHANGE THIS
    
    -- Variables (don't change):
    v_teacher_user_id UUID;
    v_teacher_id UUID;
    v_class_id UUID;
    v_school_id UUID;
    v_teacher_school_id UUID;
    v_count INT;
    v_result RECORD;
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'TEACHER + CLASS DIAGNOSTIC';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Teacher Email: %', v_teacher_email;
    RAISE NOTICE 'Class Code: %', v_class_code;
    RAISE NOTICE '';
    
    -- STEP 1: Find the teacher user
    RAISE NOTICE '1️⃣ CHECKING TEACHER USER...';
    SELECT id, school_id, role INTO v_teacher_user_id, v_teacher_school_id, v_result
    FROM users 
    WHERE email = v_teacher_email 
    LIMIT 1;
    
    IF v_teacher_user_id IS NULL THEN
        RAISE NOTICE '❌ ERROR: No user found with email: %', v_teacher_email;
        RAISE NOTICE '   ACTION: Check the email address is correct';
        RETURN;
    END IF;
    
    RAISE NOTICE '✅ Teacher user found: %', v_teacher_user_id;
    RAISE NOTICE '   School ID: %', COALESCE(v_teacher_school_id::TEXT, 'NULL');
    
    -- STEP 2: Check teacher profile
    RAISE NOTICE '';
    RAISE NOTICE '2️⃣ CHECKING TEACHER PROFILE...';
    SELECT id INTO v_teacher_id
    FROM teachers 
    WHERE user_id = v_teacher_user_id;
    
    IF v_teacher_id IS NULL THEN
        RAISE NOTICE '❌ ERROR: No teacher profile found';
        RAISE NOTICE '   ACTION: Create teacher profile in the app';
        RETURN;
    END IF;
    
    RAISE NOTICE '✅ Teacher profile found: %', v_teacher_id;
    
    -- STEP 3: Find the class
    RAISE NOTICE '';
    RAISE NOTICE '3️⃣ CHECKING CLASS...';
    SELECT id, school_id, is_active, class_name INTO v_class_id, v_school_id, v_count, v_result
    FROM classes 
    WHERE LOWER(class_code) = LOWER(v_class_code) 
    LIMIT 1;
    
    IF v_class_id IS NULL THEN
        RAISE NOTICE '❌ ERROR: No class found with code: %', v_class_code;
        RAISE NOTICE '   ACTION: Check class code is correct or create the class';
        RETURN;
    END IF;
    
    RAISE NOTICE '✅ Class found: %', v_class_id;
    RAISE NOTICE '   Name: %', v_result;
    RAISE NOTICE '   School ID: %', v_school_id;
    RAISE NOTICE '   Active: %', CASE WHEN v_count = 1 THEN 'YES ✅' ELSE 'NO ❌' END;
    
    IF v_count = 0 THEN
        RAISE NOTICE '   ⚠️  WARNING: Class is INACTIVE';
        RAISE NOTICE '   ACTION: Run: UPDATE classes SET is_active = true WHERE id = ''%'';', v_class_id;
    END IF;
    
    -- STEP 4: Check teacher assignment
    RAISE NOTICE '';
    RAISE NOTICE '4️⃣ CHECKING TEACHER ASSIGNMENT...';
    
    SELECT COUNT(*), MAX(active::INT), MAX(subject) INTO v_count, v_result, v_teacher_email
    FROM class_teacher_assignments
    WHERE teacher_user_id = v_teacher_user_id
      AND class_id = v_class_id;
    
    IF v_count = 0 THEN
        RAISE NOTICE '❌ ERROR: Teacher is NOT assigned to this class';
        RAISE NOTICE '   ACTION: Use School Admin Portal to assign teacher to class';
        RAISE NOTICE '   OR run this SQL:';
        RAISE NOTICE '   INSERT INTO class_teacher_assignments (school_id, class_id, teacher_user_id, subject, active)';
        RAISE NOTICE '   VALUES (''%'', ''%'', ''%'', ''Maths'', true);', v_school_id, v_class_id, v_teacher_user_id;
        RETURN;
    END IF;
    
    RAISE NOTICE '✅ Assignment exists';
    RAISE NOTICE '   Subject: %', v_teacher_email;
    RAISE NOTICE '   Active: %', CASE WHEN v_result = 1 THEN 'YES ✅' ELSE 'NO ❌' END;
    
    IF v_result = 0 THEN
        RAISE NOTICE '   ⚠️  WARNING: Assignment is INACTIVE';
        RAISE NOTICE '   ACTION: Run this:';
        RAISE NOTICE '   UPDATE class_teacher_assignments SET active = true';
        RAISE NOTICE '   WHERE teacher_user_id = ''%'' AND class_id = ''%'';', v_teacher_user_id, v_class_id;
    END IF;
    
    -- STEP 5: Check students in class_students
    RAISE NOTICE '';
    RAISE NOTICE '5️⃣ CHECKING STUDENTS IN CLASS_STUDENTS TABLE...';
    SELECT COUNT(*) INTO v_count
    FROM class_students
    WHERE class_id = v_class_id;
    
    RAISE NOTICE '   Students in class_students: %', v_count;
    
    IF v_count = 0 THEN
        RAISE NOTICE '   ℹ️  Note: No students in class_students (this is OK with the fix)';
    END IF;
    
    -- STEP 6: Check students in school
    RAISE NOTICE '';
    RAISE NOTICE '6️⃣ CHECKING STUDENTS IN SCHOOL...';
    SELECT COUNT(*) INTO v_count
    FROM users
    WHERE school_id = v_school_id
      AND role = 'student'
      AND NOT COALESCE(is_banned, false);
    
    RAISE NOTICE '   Total students in school: %', v_count;
    
    IF v_count = 0 THEN
        RAISE NOTICE '   ❌ ERROR: No students in this school!';
        RAISE NOTICE '   ACTION: Add students to the school';
        RETURN;
    END IF;
    
    -- STEP 7: Test RPC functions
    RAISE NOTICE '';
    RAISE NOTICE '7️⃣ TESTING RPC FUNCTIONS...';
    
    -- Test get_teacher_assigned_classes
    RAISE NOTICE '   Testing get_teacher_assigned_classes...';
    SELECT COUNT(*) INTO v_count
    FROM get_teacher_assigned_classes(v_teacher_user_id);
    
    RAISE NOTICE '   Classes returned: %', v_count;
    
    IF v_count = 0 THEN
        RAISE NOTICE '   ❌ ERROR: RPC returns 0 classes';
        RAISE NOTICE '   This should show at least 1 class';
    ELSE
        RAISE NOTICE '   ✅ Classes are being returned';
    END IF;
    
    -- Test rpc_get_students_for_assignment
    RAISE NOTICE '';
    RAISE NOTICE '   Testing rpc_get_students_for_assignment...';
    SELECT COUNT(*) INTO v_count
    FROM rpc_get_students_for_assignment(v_teacher_id);
    
    RAISE NOTICE '   Students returned: %', v_count;
    
    IF v_count = 0 THEN
        RAISE NOTICE '   ❌ ERROR: RPC returns 0 students';
        RAISE NOTICE '   This is the problem!';
    ELSE
        RAISE NOTICE '   ✅ Students are being returned';
    END IF;
    
    -- STEP 8: Check RPC function definition
    RAISE NOTICE '';
    RAISE NOTICE '8️⃣ CHECKING RPC FUNCTION EXISTS...';
    
    SELECT COUNT(*) INTO v_count
    FROM pg_proc 
    WHERE proname = 'rpc_get_students_for_assignment';
    
    IF v_count = 0 THEN
        RAISE NOTICE '   ❌ ERROR: rpc_get_students_for_assignment does NOT exist';
        RAISE NOTICE '   ACTION: The SQL fix was not applied correctly';
        RAISE NOTICE '   Re-run FIX_TEACHER_VISIBILITY_ISSUE.sql';
    ELSE
        RAISE NOTICE '   ✅ Function exists';
        
        -- Check if it was updated recently
        RAISE NOTICE '';
        RAISE NOTICE '   Checking function definition...';
        
        PERFORM 1
        FROM pg_get_functiondef('rpc_get_students_for_assignment'::regprocedure)
        WHERE pg_get_functiondef LIKE '%LEFT JOIN class_students%';
        
        IF FOUND THEN
            RAISE NOTICE '   ✅ Function has been UPDATED with LEFT JOIN fix';
        ELSE
            RAISE NOTICE '   ❌ ERROR: Function still has OLD code (uses INNER JOIN)';
            RAISE NOTICE '   ACTION: Re-run FIX_TEACHER_VISIBILITY_ISSUE.sql';
        END IF;
    END IF;
    
    -- SUMMARY
    RAISE NOTICE '';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'SUMMARY & ACTIONS';
    RAISE NOTICE '================================================';
    
    -- Final test
    SELECT COUNT(*) INTO v_count
    FROM get_teacher_assigned_classes(v_teacher_user_id)
    WHERE LOWER(class_code) = LOWER(v_class_code);
    
    IF v_count > 0 THEN
        RAISE NOTICE '✅ Teacher CAN see class % in RPC', v_class_code;
    ELSE
        RAISE NOTICE '❌ Teacher CANNOT see class % in RPC', v_class_code;
    END IF;
    
    SELECT COUNT(*) INTO v_count
    FROM rpc_get_students_for_assignment(v_teacher_id);
    
    IF v_count > 0 THEN
        RAISE NOTICE '✅ Teacher CAN see % students in RPC', v_count;
    ELSE
        RAISE NOTICE '❌ Teacher CANNOT see any students in RPC';
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE 'If both checks above are ✅, the issue is in the frontend.';
    RAISE NOTICE 'Tell the teacher to:';
    RAISE NOTICE '  1. Clear browser cache (Ctrl+Shift+Delete)';
    RAISE NOTICE '  2. Log out completely';
    RAISE NOTICE '  3. Close browser';
    RAISE NOTICE '  4. Re-open browser and log in';
    
END $$;
