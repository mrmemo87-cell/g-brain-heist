# Teacher Visibility Fix - Implementation Checklist

## Pre-Implementation

- [ ] Identify the teacher email/username
- [ ] Identify the class code (e.g., "11B")
- [ ] Have access to Supabase SQL Editor
- [ ] Know teacher was assigned to the class in admin panel

## Apply the Fix

### Step 1: Access Supabase
- [ ] Open Supabase Dashboard
- [ ] Navigate to your project
- [ ] Go to SQL Editor (left sidebar)

### Step 2: Run the Fix
- [ ] Open `TEACHER_VISIBILITY_QUICK_FIX.md` file
- [ ] Copy the entire SQL code block
- [ ] Paste into Supabase SQL Editor
- [ ] Click "Run" button
- [ ] Verify it executes without errors

### Step 3: Verify in Database
- [ ] Run diagnostic query:
  ```sql
  SELECT proname FROM pg_proc WHERE proname = 'rpc_get_students_for_assignment';
  ```
- [ ] Confirm it shows the function exists

### Step 4: Teacher Tests
- [ ] Have teacher **clear browser cache** (Ctrl+Shift+Delete)
- [ ] Teacher logs out
- [ ] Teacher logs back in
- [ ] Check teacher dashboard - should see class 11B in "Your Assigned Classes"
- [ ] Go to "Create Assignment" section
- [ ] Check "Select Students" mode
- [ ] Confirm students from class 11B appear

## Troubleshooting (If It Doesn't Work)

### Issue 1: No class appears on dashboard
- [ ] Run this query:
  ```sql
  SELECT * FROM class_teacher_assignments 
  WHERE teacher_user_id = (SELECT id FROM users WHERE email = 'TEACHER_EMAIL' LIMIT 1);
  ```
- [ ] Check results:
  - Does record exist? If no → Teacher wasn't assigned
  - Is `active = true`? If no → Run Fix #1 in TEACHER_VISIBILITY_FIX_GUIDE.md

### Issue 2: No students appear in assignment creation
- [ ] Run this query:
  ```sql
  SELECT COUNT(*) FROM users 
  WHERE school_id = (SELECT school_id FROM classes WHERE class_code = '11B' LIMIT 1)
    AND role = 'student';
  ```
- [ ] If count is 0 → No students in the school
- [ ] If count > 0 → Check SQL fix was applied correctly

### Issue 3: Still not working after all checks
- [ ] Run `DIAGNOSE_TEACHER_VISIBILITY_ISSUE.sql` for comprehensive diagnostic
- [ ] Check browser console (F12) for API errors
- [ ] Clear browser cache (Ctrl+Shift+Delete)
- [ ] Have teacher try in incognito/private window

## Verification Checklist

### Database Level
- [ ] `rpc_get_students_for_assignment` uses LEFT JOIN (not INNER JOIN)
- [ ] Query references both class_students and users tables correctly
- [ ] No syntax errors in RPC definition

### Teacher Dashboard
- [ ] Class code appears (e.g., "11B")
- [ ] Subject appears next to class code
- [ ] Status shows "📚 Your Assigned Classes"

### Assignment Creation
- [ ] In "Custom" mode, students from class are listed
- [ ] Each student shows: username, grade, batch
- [ ] Can select individual students or "Select All"
- [ ] Student count updates correctly

## Rollback (If Needed)

If something goes wrong:

1. [ ] Note the error message
2. [ ] Run this to see current function:
   ```sql
   SELECT pg_get_functiondef('rpc_get_students_for_assignment'::regprocedure);
   ```
3. [ ] Take a screenshot for troubleshooting
4. [ ] Check `TEACHER_VISIBILITY_ISSUE_SOLUTION.md` for root cause
5. [ ] Don't delete the function - we might need diagnostics

## Sign-Off

- [ ] Issue resolved - teacher can see class
- [ ] Teacher can see students for assignment
- [ ] Teacher confirmed they can create assignments
- [ ] No errors in browser console
- [ ] No errors in Supabase logs

---

## Quick Reference

| Step | Time | What to Do |
|------|------|-----------|
| 1. Copy SQL | 1 min | Copy from TEACHER_VISIBILITY_QUICK_FIX.md |
| 2. Run SQL | 30 sec | Paste in Supabase and click Run |
| 3. Browser refresh | 1 min | Teacher clears cache and refreshes |
| 4. Test | 2 min | Check dashboard and create assignment |
| **Total** | **~5 min** | Done! |

## Contact/Support

If issues persist:
- See `TEACHER_VISIBILITY_FIX_GUIDE.md` for detailed troubleshooting
- See `DIAGNOSE_TEACHER_VISIBILITY_ISSUE.sql` for automated diagnostics
- See `TEACHER_VISIBILITY_ISSUE_SOLUTION.md` for technical details

---

## Notes Section

```
Teacher: ____________________________
Class: ______________________________
Date Applied: ________________________
Applied By: ___________________________
Issues Encountered: _____________________
__________________________________________
__________________________________________
Resolution: ________________________________
__________________________________________
```
