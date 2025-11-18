# Troubleshooting: No Students Found

## Debug Steps

### 1. Check Browser Console
Open DevTools (F12) and look for logs when the teacher portal loads. You should see:
```
Loaded students: [{ id: "...", username: "...", ... }, ...]
```

If you see an error instead, it will tell you what went wrong.

### 2. Check if Students Exist in Database
Run this in Supabase SQL Editor:

```sql
-- Count all students
SELECT COUNT(*) as total_students FROM users WHERE COALESCE(role, 'student') = 'student';

-- Count active (non-banned) students  
SELECT COUNT(*) as active_students 
FROM users 
WHERE COALESCE(role, 'student') = 'student' 
  AND NOT COALESCE(is_banned, false);

-- View sample students
SELECT id, username, display_name, grade, batch, role, is_banned 
FROM users 
WHERE COALESCE(role, 'student') = 'student' 
LIMIT 10;
```

### 3. Check Your Teacher Profile
Get your teacher ID:
```sql
-- Find your teacher profile
SELECT t.id, t.user_id, u.username 
FROM teachers t
JOIN users u ON u.id = t.user_id
WHERE u.id = auth.uid();
```

### 4. Test the RPC Function Directly
Copy your teacher ID from step 3, then run:
```sql
-- Replace UUID with your actual teacher ID
SELECT * FROM rpc_get_students_for_assignment('copy-teacher-id-here');
```

This should return a list of students. If it returns nothing, the issue is with the RPC function.

### 5. Check Common Issues

#### Issue: Students table has no data
**Solution:** Create some test students in the UI or database first

#### Issue: All students have is_banned = true
**Solution:** Check the ban status of students:
```sql
SELECT username, is_banned FROM users WHERE COALESCE(role, 'student') = 'student';
```

#### Issue: Students have role ≠ 'student'
**Solution:** Check and fix roles:
```sql
SELECT id, username, role FROM users LIMIT 20;

-- Fix roles if needed (careful with this!)
-- UPDATE users SET role = 'student' WHERE role IS NULL AND id IN (SELECT id FROM users WHERE is_student = true);
```

#### Issue: RPC returns error "NOT_AUTHORIZED"
**Solution:** Verify you have a teacher profile:
```sql
SELECT * FROM teachers WHERE user_id = auth.uid();
```

If empty, you need to create a teacher profile in the UI first.

#### Issue: RPC returns error "permission denied"
**Solution:** Check RLS policies on assignment_students table:
```sql
SELECT * FROM pg_policies WHERE tablename = 'assignment_students';
```

## Quick Test Queries

Copy-paste these to test systematically:

```sql
-- 1. Are there any students at all?
SELECT 'Total users' as check_name, COUNT(*) as count FROM users;

-- 2. Are there any students (role='student')?
SELECT 'Students' as check_name, COUNT(*) as count 
FROM users 
WHERE COALESCE(role, 'student') = 'student';

-- 3. Are any students banned?
SELECT 'Banned students' as check_name, COUNT(*) as count 
FROM users 
WHERE COALESCE(role, 'student') = 'student' AND COALESCE(is_banned, false);

-- 4. Are there any active students?
SELECT 'Active students' as check_name, COUNT(*) as count 
FROM users 
WHERE COALESCE(role, 'student') = 'student' 
  AND NOT COALESCE(is_banned, false);

-- 5. Do you have a teacher profile?
SELECT 'Your teacher profiles' as check_name, COUNT(*) as count 
FROM teachers 
WHERE user_id = auth.uid();
```

## Browser Console Commands

After opening the teacher portal, paste in console (F12):

```javascript
// Check what the app loaded
console.log('Teacher:', window.teacher_profile);

// Check students list in React state (if accessible)
// This depends on your React setup, but you can try:
console.log(document.querySelector('[data-students-list]'));
```

## Common Solutions

### Solution 1: No students exist
Create test data:
```sql
INSERT INTO users (
  id, 
  username, 
  display_name, 
  email, 
  role, 
  grade, 
  batch,
  is_banned,
  created_at,
  updated_at
) VALUES 
  (gen_random_uuid(), 'student1', 'Student One', 'student1@test.com', 'student', 8, '8A', false, NOW(), NOW()),
  (gen_random_uuid(), 'student2', 'Student Two', 'student2@test.com', 'student', 8, '8B', false, NOW(), NOW()),
  (gen_random_uuid(), 'student3', 'Student Three', 'student3@test.com', 'student', 9, '9A', false, NOW(), NOW());
```

### Solution 2: Teacher verification failing
Make sure you have a teacher profile:
```sql
-- In the app, go to Teacher Portal and look for "Create Profile" button
-- Or manually create one:
INSERT INTO teachers (id, user_id, school_name, subject_specializations, bio)
VALUES (
  gen_random_uuid(),
  auth.uid(),
  NULL,
  ARRAY[]::text[],
  NULL
);
```

### Solution 3: RLS policy blocking access
Verify the policy exists:
```sql
SELECT schemaname, tablename, policyname, qual 
FROM pg_policies 
WHERE tablename IN ('assignment_students', 'assignments');
```

## Still Stuck?

1. **Check these files for logs:**
   - Browser Console (F12)
   - Supabase Logs (in project dashboard)
   - Application console output

2. **Verify step-by-step:**
   - [ ] SQL migration ran without errors
   - [ ] Students exist in database
   - [ ] Teacher profile exists
   - [ ] RPC function returns data
   - [ ] Frontend doesn't show errors in console

3. **Try a fresh test:**
   - Create a new test student manually
   - Logout and login as teacher
   - Try loading the teacher portal again
   - Check console for specific error message

4. **Last resort: Re-run migration**
   ```sql
   -- Drop and recreate the RPC function
   DROP FUNCTION IF EXISTS rpc_get_students_for_assignment(uuid);
   
   -- Then copy and run the function definition from ENABLE_INDIVIDUAL_STUDENT_ASSIGNMENTS.sql
   ```

---

**Tip:** The error logs in browser console (F12) will tell you exactly what's wrong. Share that error message for faster debugging!
