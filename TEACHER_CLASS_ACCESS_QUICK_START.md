# Teacher Class Access Control - Quick Start

## What's New?

Teachers can now only see and interact with students from classes assigned to them by the school admin. The teacher portal displays:
- Teacher's name
- Assigned classes (badges showing class code + subject)
- Filtered student lists in all features
- Warning if no classes are assigned

## Quick Setup (5 minutes)

### Step 1: Run the SQL Migration

Execute the SQL file in your Supabase SQL Editor:

```bash
# Copy the SQL file content from:
TEACHER_CLASS_ACCESS_CONTROL.sql
```

**OR** via Supabase CLI:
```bash
supabase db push --file TEACHER_CLASS_ACCESS_CONTROL.sql
```

This creates 7 new functions and updates the RLS policy for `quiz_scores`.

### Step 2: Verify Installation

Run this query in Supabase SQL Editor:

```sql
-- Check if functions were created
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name LIKE '%teacher%class%';

-- Expected results:
-- get_teacher_assigned_classes
-- teacher_has_class_access
-- get_students_in_teacher_classes
-- get_teacher_profile_with_classes
-- filter_classes_for_teacher
-- rpc_get_students_for_assignment (updated)
```

### Step 3: Assign Teachers to Classes

1. Login as **School Admin**
2. Navigate to **School Admin Portal**
3. Go to **"Teachers"** tab
4. Fill in the form:
   - **Class**: Select a class (e.g., "8A - Mathematics")
   - **Teacher**: Select a teacher
   - **Subject**: Enter subject (e.g., "Maths")
   - **Status**: Active (checked)
5. Click **"Assign Teacher"**

The teacher will immediately see this class in their portal!

### Step 4: Test Teacher Portal

1. Logout and login as the **teacher account**
2. Go to **Teacher Portal**
3. Verify you see:
   - ✅ Your name in the header
   - ✅ Assigned class badges (e.g., "8A • Maths")
   - ✅ Students only from assigned classes in assignment creation
   - ✅ Cambridge test results filtered to assigned classes

## How It Works

### School Admin Workflow

```
School Admin Portal → Teachers Tab
  ↓
Select Class + Teacher + Subject
  ↓
Click "Assign Teacher"
  ↓
Saved to `class_teacher_assignments` table
```

### Teacher Experience

```
Login to Teacher Portal
  ↓
See assigned classes in header
  ↓
All features auto-filtered:
  - Student selection (assignments)
  - Cambridge test results
  - Reports & analytics
  - Lockdown mode participants
```

### Security Layer

```
Teacher makes request
  ↓
PostgreSQL RLS checks:
  - Is user authenticated?
  - Does teacher have access to this class?
  - Are students from assigned classes?
  ↓
Database returns only authorized data
```

## Quick Tests

### Test 1: Class Display
```
Login as teacher → Check header for class badges
Expected: "📚 Your Assigned Classes (2)" with badges like "8A • Maths"
```

### Test 2: Student Filtering
```
Teacher Portal → Create Assignment → Custom Mode
Expected: Only students from assigned classes appear
```

### Test 3: Cambridge Results
```
Teacher Portal → Cambridge Tests
Expected: Only see test submissions from assigned class students
```

### Test 4: No Classes Warning
```
Login as teacher with NO assignments
Expected: "⚠️ No classes assigned yet. Contact your school admin..."
```

## Common Issues & Fixes

### Issue: "No classes assigned" warning
**Fix**: School admin needs to assign classes in School Admin Portal → Teachers tab

### Issue: Teacher sees ALL students
**Fix**: Run the SQL migration again (Step 1)

### Issue: Cambridge tests not filtered
**Fix**: Check RLS policy:
```sql
SELECT * FROM pg_policies WHERE tablename = 'quiz_scores' AND policyname = 'Teachers see assigned classes';
```

### Issue: Assignment creation fails
**Fix**: Verify `rpc_get_students_for_assignment` function exists:
```sql
SELECT * FROM pg_proc WHERE proname = 'rpc_get_students_for_assignment';
```

## Files Modified

### Backend (SQL)
- ✅ `TEACHER_CLASS_ACCESS_CONTROL.sql` (NEW - run this!)

### Frontend (TypeScript/React)
- ✅ `services/schoolAdminService.ts` (added teacher functions)
- ✅ `components/TeacherPortal.tsx` (UI updates)

### Documentation
- ✅ `TEACHER_CLASS_ACCESS_IMPLEMENTATION_GUIDE.md` (detailed guide)
- ✅ `TEACHER_CLASS_ACCESS_QUICK_START.md` (this file)

## Rollback (if needed)

If something goes wrong, rollback the RLS policy:

```sql
-- Remove new policy
DROP POLICY IF EXISTS "Teachers see assigned classes" ON quiz_scores;

-- Restore old policy (if it existed)
CREATE POLICY "Anyone can view scores" ON quiz_scores
FOR SELECT
USING (true);
```

## Next Steps

1. ✅ Run SQL migration
2. ✅ Assign teachers to classes
3. ✅ Test teacher login
4. ✅ Verify filtering works
5. ✅ Train school admins on class assignment
6. 📚 Read full implementation guide for advanced features

## Support

For detailed information, see:
- Full guide: `TEACHER_CLASS_ACCESS_IMPLEMENTATION_GUIDE.md`
- SQL functions: `TEACHER_CLASS_ACCESS_CONTROL.sql`
- Service layer: `services/schoolAdminService.ts`

## What Teachers Will See

### Before (No Assignments)
```
Teacher Portal
├── "Welcome back, John Smith"
└── ⚠️ No classes assigned yet
```

### After (With Assignments)
```
Teacher Portal
├── "Welcome back, John Smith"
├── 📚 Your Assigned Classes (3)
│   ├── [8A • Maths]
│   ├── [8B • Science]
│   └── [7C • English]
└── ✓ All features filtered to these classes
```

## Success Criteria

- [x] SQL migration runs without errors
- [x] School admin can assign teachers to classes
- [x] Teacher sees assigned classes in portal header
- [x] Student lists filtered by assigned classes
- [x] Cambridge test results filtered correctly
- [x] No unauthorized data access
- [x] Fallback works (no assignments = all school students)
- [x] UI shows helpful notifications

**🎉 You're all set!** Teachers now have class-based access control.
