# Student Signup Data Flow - Complete Map

## Visual Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    STUDENT SIGNUP PROCESS                        │
└─────────────────────────────────────────────────────────────────┘

STEP 1: Sign-Up Form (UI)
┌──────────────────────────────────────────┐
│ Student fills signup form:               │
│ - Email                                  │
│ - Password                               │
│ - Username                               │
│ - Grade (6-12)                          │
│ - Batch/Class (6A, 6B, etc)            │
│ - School (dropdown OR leave blank)      │
└──────────┬───────────────────────────────┘
           │
           ▼
STEP 2: Authentication (authService.signup())
┌──────────────────────────────────────────────────────────────────┐
│ supabase.auth.signUp({                                           │
│   email, password,                                               │
│   options: { data: { username, role: 'student', grade, batch } } │
│ })                                                               │
│                                                                  │
│ ✅ RESULT: Created in auth.users (Supabase Auth)               │
│    - auth.users.id (UUID)                                       │
│    - auth.users.email                                           │
│    - auth.users.user_metadata (contains username, grade, etc)   │
│    - Email verification sent                                    │
└──────────┬───────────────────────────────────────────────────────┘
           │
           ▼
STEP 3: Database Trigger (Automatic)
┌──────────────────────────────────────────────────────────────────┐
│ Trigger fires on INSERT to auth.users                            │
│                                                                  │
│ Creates entry in users table:                                   │
│ ✅ RESULT: Created in public.users                              │
│    - id = auth.users.id                                         │
│    - email = auth.users.email                                   │
│    - username (from metadata)                                   │
│    - role = 'student'                                           │
│    - grade (from metadata, if provided)                         │
│    - batch (from metadata, if provided)                         │
│    - school_id = NULL (unless provided during signup)           │
│    - avatar_url = generated                                     │
│    - needs_setup = false (if all fields provided)               │
└──────────┬───────────────────────────────────────────────────────┘
           │
           ├─► [OPTION A] User did NOT provide school during signup
           │   └─► DONE - Student is orphaned (no school)
           │
           └─► [OPTION B] User DID provide school during signup
               └──────────┬─────────────────────────────────────────┐
                          │                                         │
                          ▼                                         │
              STEP 4: Verify Email & Bootstrap              │
              ┌──────────────────────────────┐              │
              │ Email verification required  │              │
              │ Student confirms email link  │              │
              │ Session established          │              │
              └──────────┬───────────────────┘              │
                         │                                 │
                         ▼                                 │
              STEP 5: Call profile_bootstrap()             │
              ┌──────────────────────────────────────────┐ │
              │ supabase.rpc('profile_bootstrap', {      │ │
              │   p_school_id,                           │ │
              │   p_role: 'student',                     │ │
              │   p_grade,                               │ │
              │   p_batch                                │ │
              │ })                                       │ │
              │                                          │ │
              │ ✅ RESULT: Updated users + Created      │ │
              │    - users.school_id = provided school   │ │
              │    - users.role = 'student'              │ │
              │    - users.grade, batch updated          │ │
              │    - school_members.school_id = school   │ │
              │    - school_members.user_id = student    │ │
              │    - school_members.role_in_school       │ │
              │    - school_members.status = 'active'    │ │
              │                                          │ │
              │ ❌ NOT CREATED: class_students           │ │
              │    - Student still has no class!         │ │
              │    - Manual enrollment needed next       │ │
              └──────────┬───────────────────────────────┘ │
                         │                                 │
                         └─────────────────────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────────┐
                    │    SIGNUP COMPLETE                  │
                    │                                     │
                    │ Student is now:                     │
                    │ ✅ Authenticated (auth.users)       │
                    │ ✅ Has profile (users)              │
                    │ ✅ Member of school (school_members)│
                    │ ❌ NOT in any class yet             │
                    │    (needs manual enrollment)        │
                    └─────────────────────────────────────┘


STEP 6: Manual Class Enrollment (School Admin Portal)
┌──────────────────────────────────────────────────────────────────┐
│ Admin goes to Student Enrollment tab:                             │
│ 1. Selects student from "Students in School" list               │
│ 2. Selects class from dropdown                                  │
│ 3. Clicks "Save Enrollment"                                     │
│                                                                  │
│ Calls: moveStudentToClassViaRPC(studentId, classId)             │
│                                                                  │
│ ✅ RESULT: Created in class_students                            │
│    - class_id = selected class UUID                             │
│    - student_id = student's UUID                                │
│    - enrolled_at = NOW()                                        │
│                                                                  │
│ Student NOW SHOWS as assigned in UI!                            │
└──────────────────────────────────────────────────────────────────┘
```

---

## Database Tables Affected

### Summary Table

| Table | Populated? | When | Via | Source of Data |
|-------|-----------|------|-----|-----------------|
| `auth.users` | ✅ Yes | Step 2 | Supabase Auth SDK | signup() |
| `users` | ✅ Yes | Step 3 | DB Trigger | auth.users INSERT |
| `school_members` | ⚠️ Conditional | Step 5 | profile_bootstrap() RPC | User provided schoolId |
| `class_students` | ❌ No | MANUAL | Admin Portal | moveStudentToClassViaRPC() |

### What the Admin Portal Sees

```typescript
// Load students for enrollment (SchoolAdminPortal.tsx line 157)
const studentList = await SchoolAdminService.listSchoolMembers(
    schoolId, 
    { role: 'student', limit: 200 }  // ← Gets from school_members table
);

const studentRows = await SchoolAdminService.listClassStudents(classIds);  
// ← Gets from class_students table (likely empty)

const assignmentMap: Record<string, string | null> = {};
studentRows.forEach((row) => {
    assignmentMap[row.student_id] = row.class_id;
});

// For each student:
// If student NOT in assignmentMap → Shows "Unassigned"
// If student in assignmentMap → Shows class code
```

---

## Why All Students Show as "Unassigned"

### The Logic

```
Students = Query school_members table with role='student'
           Result: [alice, bob, charlie, ...]  ✓

ClassAssignments = Query class_students table
                   Result: []  ✗ (EMPTY!)

For each student in Students:
    If student found in ClassAssignments:
        Show: "Class X"
    Else:
        Show: "Unassigned"  ← This is where we are

Result: ALL students show "Unassigned"
```

### Why ClassAssignments is Empty

1. ✅ Students exist in `school_members` (created during signup)
2. ❌ But NO corresponding rows in `class_students` (never created)
3. ❌ `class_students` is populated ONLY by manual enrollment

---

## Code References

### Signup Flow
- **UI Component:** LoginView.tsx (signup form)
- **Service:** [authService.ts](services/authService.ts#L115) - `signup()` function
- **Bootstrap RPC:** [MULTI_TENANT_FINAL.sql](MULTI_TENANT_FINAL.sql#L301) - `profile_bootstrap()` function

### Data Loading in Admin Portal
- **Component:** [SchoolAdminPortal.tsx](components/SchoolAdminPortal.tsx#L146) - `loadAdminTools()` function
- **Students fetch:** [schoolAdminService.ts](services/schoolAdminService.ts#L339) - `listSchoolMembers()` → calls `get_school_members()` RPC
- **Class assignments fetch:** [schoolAdminService.ts](services/schoolAdminService.ts#L786) - `listClassStudents()` → queries `class_students` table

### Manual Enrollment
- **Button handler:** [SchoolAdminPortal.tsx](components/SchoolAdminPortal.tsx#L428) - `handleEnrollStudent()` function
- **Service:** [schoolAdminService.ts](services/schoolAdminService.ts#L1280) - `moveStudentToClassViaRPC()` function
- **RPC:** [ADD_CLASS_ROSTER_MANAGEMENT.sql](ADD_CLASS_ROSTER_MANAGEMENT.sql#L137) - `add_student_to_class()` function

---

## Verification Queries

### Check 1: Students in school_members
```sql
SELECT COUNT(*) FROM school_members 
WHERE school_id = 'YOUR_SCHOOL_ID' AND role_in_school = 'student';
-- Expected: > 0
```

### Check 2: Students in users table
```sql
SELECT COUNT(*) FROM users 
WHERE school_id = 'YOUR_SCHOOL_ID' AND role = 'student';
-- Expected: > 0
```

### Check 3: Enrollments in class_students
```sql
SELECT COUNT(*) FROM class_students 
WHERE class_id IN (
    SELECT id FROM classes WHERE school_id = 'YOUR_SCHOOL_ID'
);
-- Expected: 0 (if all students show as unassigned)
```

### Check 4: List unassigned students
```sql
SELECT u.username, u.email
FROM school_members sm
JOIN users u ON u.id = sm.user_id
WHERE sm.school_id = 'YOUR_SCHOOL_ID'
  AND NOT EXISTS (
      SELECT 1 FROM class_students cs WHERE cs.student_id = u.id
  );
-- Expected: All your students
```

---

## Summary

**When students sign up:**
- ✅ They get created in auth.users (authentication)
- ✅ They get created in users table (profile)
- ✅ They get added to school_members (school membership) IF they use the schoolId during signup
- ❌ They do NOT automatically get added to class_students (class enrollment)

**The "Unassigned" status is CORRECT** because:
- No entries exist in `class_students`
- Students haven't been manually assigned to classes yet

**To fix it:**
Use the School Admin Portal to manually enroll each student into their class.
