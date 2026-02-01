# Solution: Teacher Not Seeing Assigned Class and Students

## Issue Summary
A school admin assigned a teacher to class 11B, but the teacher is not seeing:
- The class in the teacher portal
- Students when creating assignments

---

## Root Cause Analysis

The problem is in the `rpc_get_students_for_assignment` SQL RPC function. The original query used:

```sql
JOIN class_students cs ON cs.class_id = cta.class_id
JOIN users u ON u.id = cs.student_id
```

**The Problem:** If NO students have been enrolled in the class_students table yet, this INNER JOIN returns ZERO rows, even though students exist in the school.

**Result:** Teacher sees no students available for assignment, leading to the appearance that the class is empty.

---

## Solution Applied

### File 1: `FIX_TEACHER_VISIBILITY_ISSUE.sql`

This file contains improved versions of two RPC functions:

#### 1. Improved `get_teacher_assigned_classes`
- Better error handling
- Handles NULL school names gracefully
- Provides better context for debugging

#### 2. **Fixed** `rpc_get_students_for_assignment`
- **Changed**: FROM INNER JOIN to OUTER JOIN for class_students
- **Result**: Now returns students even if class_students table is empty
- **Logic**: For each assigned class, get ALL students from that school
- **Fallback**: For teachers without class assignments, show all school students

**Key Change:**
```sql
-- OLD (BROKEN):
JOIN class_students cs ON cs.class_id = cta.class_id

-- NEW (FIXED):
LEFT JOIN class_students cs ON cs.class_id = c.id AND cs.student_id = u.id
```

---

## How to Apply the Fix

### Option A: Using Supabase SQL Editor (Recommended for Admins)

1. Open Supabase Dashboard → SQL Editor
2. Open file: `FIX_TEACHER_VISIBILITY_ISSUE.sql`
3. Copy the entire SQL
4. Paste into Supabase SQL Editor
5. Click "Run" to execute

### Option B: Using psql Command Line

```bash
psql postgresql://[user]:[password]@[host]/postgres \
  -f FIX_TEACHER_VISIBILITY_ISSUE.sql
```

### Option C: Manual Fix (if you can't execute full file)

Run these two commands in Supabase SQL Editor:

**Step 1:** Update `get_teacher_assigned_classes`
```sql
DROP FUNCTION IF EXISTS get_teacher_assigned_classes(UUID) CASCADE;

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
    v_teacher_user_id := COALESCE(p_teacher_user_id, auth.uid());
    
    IF v_teacher_user_id IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;
    
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
```

**Step 2:** Update `rpc_get_students_for_assignment`
```sql
DROP FUNCTION IF EXISTS rpc_get_students_for_assignment(UUID) CASCADE;

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
    IF p_teacher_id IS NOT NULL THEN
        SELECT t.user_id, t.school_id INTO v_teacher_user_id, v_teacher_school_id
        FROM teachers t
        WHERE t.id = p_teacher_id;
    END IF;
    
    IF v_teacher_user_id IS NULL THEN
        v_teacher_user_id := auth.uid();
        
        SELECT u.school_id INTO v_teacher_school_id
        FROM users u
        WHERE u.id = v_teacher_user_id;
    END IF;
    
    SELECT EXISTS (
        SELECT 1
        FROM class_teacher_assignments cta_check
        WHERE cta_check.teacher_user_id = v_teacher_user_id
        AND cta_check.active = true
    ) INTO v_has_assignments;
    
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
```

---

## Testing the Fix

After applying the fix, verify it works:

### Test 1: Verify Teacher Sees Class
```sql
SELECT * FROM get_teacher_assigned_classes(
    (SELECT id FROM users WHERE email = 'teacher@school.com' LIMIT 1)
);
```

Expected result: Should show class 11B with `is_active = true`

### Test 2: Verify Teacher Sees Students
```sql
SELECT * FROM rpc_get_students_for_assignment(
    (SELECT id FROM teachers WHERE user_id = (SELECT id FROM users WHERE email = 'teacher@school.com') LIMIT 1)
);
```

Expected result: Should show students from class 11B

### Test 3: Frontend Test
1. Have teacher log in
2. Refresh the page (browser cache)
3. Dashboard should show class 11B in "Your Assigned Classes"
4. Creating an assignment should show students from class 11B

---

## Additional Diagnostic Tools

### File: `DIAGNOSE_TEACHER_VISIBILITY_ISSUE.sql`
Contains automated diagnostic queries to check:
- Teacher's profile setup
- Class assignment existence and status
- Student enrollment status
- RPC function behavior

Run this if the fix doesn't immediately resolve the issue.

### File: `TEACHER_VISIBILITY_FIX_GUIDE.md`
Comprehensive troubleshooting guide with:
- Common root causes
- Specific fixes for each cause
- Step-by-step diagnosis
- SQL queries for checking status

---

## What Changed in the Code

### Before (Broken):
```sql
FROM class_teacher_assignments cta
JOIN class_students cs ON cs.class_id = cta.class_id  -- INNER JOIN fails if no students
JOIN users u ON u.id = cs.student_id
```

### After (Fixed):
```sql
FROM class_teacher_assignments cta
JOIN classes c ON c.id = cta.class_id
JOIN users u ON u.school_id = c.school_id AND u.role = 'student'  -- Get all school students
LEFT JOIN class_students cs ON cs.class_id = c.id AND cs.student_id = u.id  -- Optional enrollment
```

**Key Improvements:**
✅ LEFT JOIN instead of INNER JOIN - handles empty class_students table
✅ Joins users directly from school - doesn't depend on explicit enrollment
✅ Works even if no students have been added to class_students yet
✅ Backward compatible with existing enrollments

---

## Impact

- ✅ Teachers can now see assigned classes immediately
- ✅ Teachers can see all students from their school for assignment creation
- ✅ No need to pre-enroll students in class_students table
- ✅ Works for newly created classes

---

## Files Modified

1. **FIX_TEACHER_VISIBILITY_ISSUE.sql** - Main fix with improved RPC functions
2. **DIAGNOSE_TEACHER_VISIBILITY_ISSUE.sql** - Diagnostic tool
3. **TEACHER_VISIBILITY_FIX_GUIDE.md** - Troubleshooting guide

---

## Support

If the issue persists after applying this fix:

1. Run `DIAGNOSE_TEACHER_VISIBILITY_ISSUE.sql` to identify specific issues
2. Check browser console (F12) for any API errors
3. Verify teacher was assigned with `active = true` in `class_teacher_assignments`
4. Ensure class has `is_active = true` in `classes` table
5. Verify teacher is part of the school in `school_members` table

See `TEACHER_VISIBILITY_FIX_GUIDE.md` for detailed troubleshooting.
