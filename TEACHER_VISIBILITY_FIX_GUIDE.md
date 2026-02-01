# Fix: Teacher Not Seeing Assigned Class and Students

## Problem
A school admin has assigned a teacher to a class (e.g., 11B), but the teacher is:
- ❌ NOT seeing the class anywhere in the teacher portal
- ❌ NOT seeing students when trying to create assignments

## Root Causes
This can happen due to several reasons:

### Cause 1: Teacher Assignment Not Marked as Active
The entry in `class_teacher_assignments` table has `active = false`

**Check:**
```sql
SELECT * FROM class_teacher_assignments 
WHERE teacher_user_id = (SELECT id FROM users WHERE email = 'teacher@school.com')
  AND class_id = (SELECT id FROM classes WHERE class_code = '11B');
```

If `active = false`, **go to Fix #1** below.

---

### Cause 2: Class Not Marked as Active
The class itself has `is_active = false` in the `classes` table

**Check:**
```sql
SELECT id, class_code, is_active FROM classes WHERE class_code = '11B';
```

If `is_active = false`, **go to Fix #2** below.

---

### Cause 3: No Students Enrolled in the Class
The class exists and is assigned, but no students have been added to the `class_students` junction table.

**Check:**
```sql
SELECT COUNT(*) FROM class_students 
WHERE class_id = (SELECT id FROM classes WHERE class_code = '11B');
```

If count is 0, **go to Fix #3** below.

---

## Quick Fixes

### Fix #1: Activate the Teacher Assignment
If the teacher assignment `active` column is false:

```sql
UPDATE class_teacher_assignments
SET active = true
WHERE teacher_user_id = (
    SELECT id FROM users WHERE email = 'teacher@school.com' LIMIT 1
)
AND class_id = (
    SELECT id FROM classes WHERE class_code = '11B' LIMIT 1
);
```

**Then:** Teacher should refresh their browser to see the class.

---

### Fix #2: Activate the Class
If the class is not marked as active:

```sql
UPDATE classes
SET is_active = true
WHERE class_code = '11B';
```

**Then:** Teacher should refresh their browser to see the class.

---

### Fix #3: Enroll Students in the Class
If no students are in the class, enroll all students from the school into the class:

```sql
-- Option A: Enroll all students from the school into the class
INSERT INTO class_students (class_id, student_id)
SELECT 
    c.id,
    u.id
FROM classes c
CROSS JOIN users u
WHERE c.class_code = '11B'
  AND u.role = 'student'
  AND u.school_id = c.school_id
  AND NOT COALESCE(u.is_banned, false)
  AND NOT EXISTS (
      SELECT 1 FROM class_students cs
      WHERE cs.class_id = c.id
      AND cs.student_id = u.id
  )
ON CONFLICT DO NOTHING;
```

**Or Option B: Use the School Admin Portal**
1. Go to School Admin Portal
2. Select the class (11B)
3. Find "Add Students" button
4. Select students and add them to the class

**Then:** Teacher should refresh their browser to see the students.

---

## Comprehensive Fix: Update Both RPC Functions

This has been fixed in the database. Run the SQL from `FIX_TEACHER_VISIBILITY_ISSUE.sql` to update the RPC functions:

The improvements include:
- ✅ Better handling of edge cases
- ✅ Improved query logic for retrieving students
- ✅ Support for students in the school even if not in `class_students` table
- ✅ Better error handling

---

## Testing the Fix

### Test 1: Verify Teacher Sees Their Class
```sql
SELECT * FROM get_teacher_assigned_classes(
    (SELECT id FROM users WHERE email = 'teacher@school.com' LIMIT 1)
);
```

Should return class 11B with `is_active = true`

---

### Test 2: Verify Teacher Sees Students
First, find the teacher's profile ID:
```sql
SELECT id FROM teachers WHERE user_id = (
    SELECT id FROM users WHERE email = 'teacher@school.com' LIMIT 1
);
```

Then call the RPC:
```sql
SELECT * FROM rpc_get_students_for_assignment(
    'TEACHER_PROFILE_ID_FROM_ABOVE'
);
```

Should return students from class 11B.

---

### Test 3: Frontend Test
1. Have the teacher log in
2. They should see class 11B on the dashboard
3. Go to "Create Assignment"
4. Students from class 11B should appear in the student selector

---

## Still Not Working?

### Step-by-Step Diagnosis

1. **Check if teacher record exists:**
   ```sql
   SELECT id, user_id, school_id FROM teachers 
   WHERE user_id = (SELECT id FROM users WHERE email = 'teacher@school.com');
   ```

2. **Check if teacher is part of school:**
   ```sql
   SELECT * FROM school_members 
   WHERE user_id = (SELECT id FROM users WHERE email = 'teacher@school.com')
   AND status = 'active';
   ```

3. **Check class exists and belongs to school:**
   ```sql
   SELECT id, class_code, school_id, is_active 
   FROM classes 
   WHERE class_code = '11B';
   ```

4. **Check assignment exists:**
   ```sql
   SELECT * FROM class_teacher_assignments 
   WHERE teacher_user_id = (SELECT id FROM users WHERE email = 'teacher@school.com')
   AND class_id = (SELECT id FROM classes WHERE class_code = '11B');
   ```

5. **Check students in class:**
   ```sql
   SELECT COUNT(*) FROM class_students 
   WHERE class_id = (SELECT id FROM classes WHERE class_code = '11B');
   ```

---

## Additional Resources

- See `DIAGNOSE_TEACHER_VISIBILITY_ISSUE.sql` for automated diagnostics
- See `FIX_TEACHER_VISIBILITY_ISSUE.sql` for complete SQL fix
- Frontend: [TeacherPortal.tsx](components/TeacherPortal.tsx)
- Services: [schoolAdminService.ts](services/schoolAdminService.ts)

---

## Summary

Most common issue: **Students not enrolled in `class_students` table**

**Quick fix:** Run Fix #3 above to enroll students in the class.

If that doesn't work, apply the SQL from `FIX_TEACHER_VISIBILITY_ISSUE.sql` and then have the teacher refresh their browser.
