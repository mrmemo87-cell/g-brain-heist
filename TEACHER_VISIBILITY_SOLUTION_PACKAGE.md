# Teacher Visibility Issue - Solution Package

## Problem
School admin assigned teacher to class 11B, but teacher doesn't see:
- The class in the teacher portal
- Students when creating assignments

## Root Cause
The `rpc_get_students_for_assignment` RPC function uses INNER JOIN with `class_students` table. If no students are enrolled in that table, the query returns zero rows - even though students exist.

## Solution Files

### 1. **TEACHER_VISIBILITY_QUICK_FIX.md** ⭐ START HERE
- Quick copy-paste SQL to fix the issue
- For non-technical users who just need it fixed NOW
- **Time to fix: 2 minutes**

### 2. **FIX_TEACHER_VISIBILITY_ISSUE.sql**
- Complete SQL fix with detailed comments
- Contains improved versions of:
  - `get_teacher_assigned_classes` RPC
  - `rpc_get_students_for_assignment` RPC
- Includes troubleshooting queries and common fixes
- **Run this in Supabase SQL Editor**

### 3. **TEACHER_VISIBILITY_ISSUE_SOLUTION.md**
- Comprehensive technical documentation
- Explains the problem and solution
- Shows before/after code
- Testing procedures
- **For technical understanding**

### 4. **DIAGNOSE_TEACHER_VISIBILITY_ISSUE.sql**
- Automated diagnostic script
- Checks all components of the system
- Identifies specific issues
- **Use if fix doesn't work immediately**

### 5. **TEACHER_VISIBILITY_FIX_GUIDE.md**
- Detailed troubleshooting guide
- Lists all possible root causes
- Provides specific fixes for each
- Step-by-step diagnosis
- **For advanced troubleshooting**

## How to Apply

### Option A: Quickest (Recommended)
1. Go to `TEACHER_VISIBILITY_QUICK_FIX.md`
2. Copy the SQL code
3. Paste into Supabase SQL Editor
4. Click Run
5. Have teacher refresh browser

### Option B: Using Full Fix File
1. Open `FIX_TEACHER_VISIBILITY_ISSUE.sql`
2. Copy entire file contents
3. Paste into Supabase SQL Editor
4. Click Run
5. Have teacher refresh browser

### Option C: Manual Setup (if auto-run doesn't work)
1. Go to Supabase Dashboard
2. SQL Editor
3. Create new query
4. Copy/paste SQL from `TEACHER_VISIBILITY_QUICK_FIX.md`
5. Execute

## Verification

After applying fix:

```sql
-- Verify the function exists
SELECT proname FROM pg_proc WHERE proname = 'rpc_get_students_for_assignment';

-- Test it works
SELECT COUNT(*) FROM rpc_get_students_for_assignment(
    (SELECT id FROM teachers WHERE user_id = (SELECT id FROM users WHERE email = 'teacher@email.com'))
);
```

Should return a count > 0 if students are in the school.

## What the Fix Does

**BEFORE (Broken):**
```
Teacher assigned to class 11B
  ↓ (SQL query)
  ↓ INNER JOIN class_students
  ↓ NO students in class_students
  ↓ Query returns NOTHING
  ↓
Teacher sees NO students
```

**AFTER (Fixed):**
```
Teacher assigned to class 11B
  ↓ (SQL query)
  ↓ Join with classes table (works always)
  ↓ Join with users from school (works always)
  ↓ LEFT JOIN class_students (optional)
  ↓
Returns ALL students from school
  ↓
Teacher sees STUDENTS ✓
```

## Testing in Frontend

After applying fix:

1. **Teacher logs in** → Should see class 11B on dashboard
2. **Go to Create Assignment** → Students appear in selector
3. **Filter by class** → Students from 11B are available

## Troubleshooting

If fix doesn't work:

1. **Run diagnostic:**
   ```sql
   -- See DIAGNOSE_TEACHER_VISIBILITY_ISSUE.sql
   ```

2. **Check teacher assignment:**
   ```sql
   SELECT * FROM class_teacher_assignments
   WHERE teacher_user_id = (SELECT id FROM users WHERE email = 'teacher@email')
   LIMIT 1;
   ```
   Should show: `active = true`

3. **Check class status:**
   ```sql
   SELECT * FROM classes WHERE class_code = '11B';
   ```
   Should show: `is_active = true`

4. **Check students exist:**
   ```sql
   SELECT COUNT(*) FROM users WHERE school_id = (
       SELECT school_id FROM classes WHERE class_code = '11B'
   ) AND role = 'student';
   ```
   Should be > 0

## Support

For detailed help, see:
- `TEACHER_VISIBILITY_FIX_GUIDE.md` - Comprehensive troubleshooting
- `TEACHER_VISIBILITY_ISSUE_SOLUTION.md` - Technical details
- `DIAGNOSE_TEACHER_VISIBILITY_ISSUE.sql` - Automated diagnostics

## Summary

✅ **What's fixed:** RPC function now handles teachers with empty class_students
✅ **How to apply:** Copy-paste SQL from TEACHER_VISIBILITY_QUICK_FIX.md
✅ **Time needed:** 2-5 minutes
✅ **Impact:** Immediate - after browser refresh

**Ready to fix?** Start with `TEACHER_VISIBILITY_QUICK_FIX.md` ⭐
