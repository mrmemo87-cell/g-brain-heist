# Quick Fix: Teacher Not Seeing Class and Students

## The Problem
✗ Teacher assigned to class 11B but doesn't see it
✗ No students appear when creating assignments

## The Solution (TL;DR)

Run this SQL in Supabase SQL Editor:

```sql
-- Fix the RPC function that retrieves students for assignment
DROP FUNCTION IF EXISTS rpc_get_students_for_assignment(UUID) CASCADE;

CREATE OR REPLACE FUNCTION rpc_get_students_for_assignment(p_teacher_id UUID DEFAULT NULL)
RETURNS TABLE (id UUID, username TEXT, display_name TEXT, grade TEXT, batch TEXT, avatar_url TEXT, school_id UUID, class_id UUID, class_code TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_teacher_user_id UUID;
    v_teacher_school_id UUID;
    v_has_assignments BOOLEAN;
BEGIN
    IF p_teacher_id IS NOT NULL THEN
        SELECT t.user_id, t.school_id INTO v_teacher_user_id, v_teacher_school_id FROM teachers t WHERE t.id = p_teacher_id;
    END IF;
    
    IF v_teacher_user_id IS NULL THEN
        v_teacher_user_id := auth.uid();
        SELECT u.school_id INTO v_teacher_school_id FROM users u WHERE u.id = v_teacher_user_id;
    END IF;
    
    SELECT EXISTS (SELECT 1 FROM class_teacher_assignments cta_check WHERE cta_check.teacher_user_id = v_teacher_user_id AND cta_check.active = true) INTO v_has_assignments;
    
    IF v_has_assignments THEN
        RETURN QUERY
        SELECT DISTINCT u.id, u.username::TEXT, u.username::TEXT, u.grade::TEXT, u.batch::TEXT, u.avatar_url::TEXT, u.school_id, COALESCE(cs.class_id, c.id), c.class_code::TEXT
        FROM class_teacher_assignments cta
        JOIN classes c ON c.id = cta.class_id
        JOIN users u ON u.school_id = c.school_id AND u.role = 'student'
        LEFT JOIN class_students cs ON cs.class_id = c.id AND cs.student_id = u.id
        WHERE cta.teacher_user_id = v_teacher_user_id AND cta.active = true AND NOT COALESCE(u.is_banned, false)
        ORDER BY u.grade NULLS LAST, u.batch NULLS LAST, u.username;
    ELSE
        RETURN QUERY
        SELECT u.id, u.username::TEXT, u.username::TEXT, u.grade::TEXT, u.batch::TEXT, u.avatar_url::TEXT, u.school_id, cs.class_id, c.class_code::TEXT
        FROM users u
        LEFT JOIN class_students cs ON cs.student_id = u.id
        LEFT JOIN classes c ON c.id = cs.class_id
        WHERE COALESCE(u.role, 'student') = 'student' AND NOT COALESCE(u.is_banned, false) AND (v_teacher_school_id IS NULL OR u.school_id = v_teacher_school_id OR u.school_id IS NULL)
        ORDER BY u.grade NULLS LAST, u.batch NULLS LAST, u.username;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_get_students_for_assignment(UUID) TO authenticated;
```

## Then
1. Have the teacher **refresh their browser** (Ctrl+R or Cmd+R)
2. They should now see class 11B on their dashboard
3. Students should appear when creating assignments

## If Still Not Working

Run diagnostic query:
```sql
SELECT * FROM class_teacher_assignments 
WHERE teacher_user_id = (SELECT id FROM users WHERE email = 'teacher@email' LIMIT 1)
  AND class_id = (SELECT id FROM classes WHERE class_code = '11B' LIMIT 1);
```

Check that:
- ✅ Record exists
- ✅ `active = true`

If not, run:
```sql
UPDATE class_teacher_assignments
SET active = true
WHERE teacher_user_id = (SELECT id FROM users WHERE email = 'teacher@email' LIMIT 1)
  AND class_id = (SELECT id FROM classes WHERE class_code = '11B' LIMIT 1);
```

## Why This Happens

The original `rpc_get_students_for_assignment` function used an INNER JOIN with `class_students` table. If no students were enrolled in that table, it returned nothing - even though students existed in the school.

The fix uses LEFT JOIN so it:
- Returns students explicitly enrolled in `class_students` 
- Also returns all students from the school (for new classes)

## Full Details

See: `TEACHER_VISIBILITY_ISSUE_SOLUTION.md` for comprehensive documentation
