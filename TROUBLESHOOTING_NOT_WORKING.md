# Still Not Working? Step-by-Step Troubleshooting

## What to Do Right Now

### Step 1: Run the Specific Diagnostic

1. Open `DEBUG_SPECIFIC_TEACHER_CLASS.sql`
2. **Edit lines 6-7** with your actual values:
   ```sql
   v_teacher_email TEXT := 'teacher@example.com';  -- ← Change to real email
   v_class_code TEXT := '11B';                      -- ← Change to real class code
   ```
3. Copy the entire file
4. Paste into Supabase SQL Editor
5. Click "Run"
6. **Read the output carefully** - it will tell you exactly what's wrong

---

## Common Issues & Fixes

### Issue 1: RPC Function Was Not Actually Updated

**Symptoms:** Diagnostic shows "Function still has OLD code"

**Fix:**
```sql
-- Force drop and recreate
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

---

### Issue 2: Assignment Not Active

**Symptoms:** Diagnostic shows "Assignment is INACTIVE"

**Fix:** Replace with actual teacher email and class code:
```sql
UPDATE class_teacher_assignments
SET active = true
WHERE teacher_user_id = (SELECT id FROM users WHERE email = 'teacher@email.com' LIMIT 1)
  AND class_id = (SELECT id FROM classes WHERE LOWER(class_code) = LOWER('11B') LIMIT 1);
```

---

### Issue 3: Class Not Active

**Symptoms:** Diagnostic shows "Class is INACTIVE"

**Fix:** Replace with actual class code:
```sql
UPDATE classes
SET is_active = true
WHERE LOWER(class_code) = LOWER('11B');
```

---

### Issue 4: Teacher Not Assigned to Class

**Symptoms:** Diagnostic shows "Teacher is NOT assigned to this class"

**Fix:** Replace with actual values:
```sql
-- First, get the IDs
SELECT 
    u.id as teacher_user_id,
    c.id as class_id,
    c.school_id
FROM users u
CROSS JOIN classes c
WHERE u.email = 'teacher@email.com'
  AND LOWER(c.class_code) = LOWER('11B');

-- Then insert (replace the UUIDs from above)
INSERT INTO class_teacher_assignments (
    school_id,
    class_id,
    teacher_user_id,
    subject,
    active
)
VALUES (
    'SCHOOL_ID_FROM_ABOVE',
    'CLASS_ID_FROM_ABOVE',
    'TEACHER_USER_ID_FROM_ABOVE',
    'Maths',
    true
);
```

---

### Issue 5: No Students in School

**Symptoms:** Diagnostic shows "No students in this school"

**Fix:**
1. Add students to the school using School Admin Portal
2. Or check that students have the correct `school_id` in the users table

---

### Issue 6: Teacher Not in School Members

**Symptoms:** Assignment fails to create or teacher gets "Forbidden" error

**Fix:** Check school membership:
```sql
SELECT * FROM school_members
WHERE user_id = (SELECT id FROM users WHERE email = 'teacher@email.com')
  AND school_id = (SELECT school_id FROM classes WHERE LOWER(class_code) = LOWER('11B'));
```

If no record, add:
```sql
INSERT INTO school_members (school_id, user_id, role, status)
VALUES (
    (SELECT school_id FROM classes WHERE LOWER(class_code) = LOWER('11B')),
    (SELECT id FROM users WHERE email = 'teacher@email.com'),
    'teacher',
    'active'
);
```

---

### Issue 7: Browser Cache

**Symptoms:** RPC returns data correctly, but frontend still doesn't show it

**Fix:**
1. Have teacher open browser DevTools (F12)
2. Go to Network tab
3. Check "Disable cache" checkbox
4. Refresh page (Ctrl+R)
5. If still doesn't work:
   - Clear all browser data (Ctrl+Shift+Delete)
   - Select "All time"
   - Check all boxes
   - Clear
   - Close browser completely
   - Re-open and try again

---

### Issue 8: Wrong Teacher Email or Class Code

**Symptoms:** Diagnostic shows "No user found" or "No class found"

**Fix:**
1. List all teachers:
   ```sql
   SELECT u.email, u.username, u.role 
   FROM users u 
   WHERE u.role = 'teacher' 
   ORDER BY u.email;
   ```

2. List all classes:
   ```sql
   SELECT class_code, class_name, is_active 
   FROM classes 
   ORDER BY class_code;
   ```

3. Update the diagnostic with correct values

---

## Nuclear Option: Complete Reset

If nothing works, do a complete reset:

```sql
-- 1. Drop and recreate ALL relevant functions
DROP FUNCTION IF EXISTS get_teacher_assigned_classes(UUID) CASCADE;
DROP FUNCTION IF EXISTS rpc_get_students_for_assignment(UUID) CASCADE;

-- 2. Run the entire FIX_TEACHER_VISIBILITY_ISSUE.sql file

-- 3. Verify the teacher assignment
UPDATE class_teacher_assignments
SET active = true
WHERE teacher_user_id = (SELECT id FROM users WHERE email = 'teacher@email.com')
  AND class_id = (SELECT id FROM classes WHERE LOWER(class_code) = LOWER('11B'));

-- 4. Verify the class is active
UPDATE classes
SET is_active = true
WHERE LOWER(class_code) = LOWER('11B');

-- 5. Test
SELECT * FROM get_teacher_assigned_classes(
    (SELECT id FROM users WHERE email = 'teacher@email.com')
);

SELECT COUNT(*) FROM rpc_get_students_for_assignment(
    (SELECT id FROM teachers WHERE user_id = (SELECT id FROM users WHERE email = 'teacher@email.com'))
);
```

---

## Verification Checklist

After any fix, verify these:

- [ ] Teacher user exists: `SELECT * FROM users WHERE email = 'teacher@email.com';`
- [ ] Teacher profile exists: `SELECT * FROM teachers WHERE user_id = (SELECT id FROM users WHERE email = 'teacher@email.com');`
- [ ] Class exists: `SELECT * FROM classes WHERE LOWER(class_code) = LOWER('11B');`
- [ ] Class is active: Check `is_active = true` from above
- [ ] Assignment exists: `SELECT * FROM class_teacher_assignments WHERE teacher_user_id = ... AND class_id = ...;`
- [ ] Assignment is active: Check `active = true` from above
- [ ] Students in school: `SELECT COUNT(*) FROM users WHERE school_id = ... AND role = 'student';`
- [ ] RPC function updated: Check for "LEFT JOIN class_students" in function definition
- [ ] RPC returns classes: `SELECT * FROM get_teacher_assigned_classes(teacher_user_id);`
- [ ] RPC returns students: `SELECT * FROM rpc_get_students_for_assignment(teacher_profile_id);`
- [ ] Browser cache cleared
- [ ] Teacher logged out and back in

---

## Still Stuck?

Share the output from `DEBUG_SPECIFIC_TEACHER_CLASS.sql` and I'll help you identify the exact issue.
