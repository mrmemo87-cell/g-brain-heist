# Student Enrollment - Quick Reference

## TL;DR: Why Students Show as "Unassigned"

| When | Where | What | Why |
|------|-------|------|-----|
| Student signs up | `auth.users` + `users` + `school_members` | Student is authenticated and has school membership | ✅ |
| Student needs enrollment | `class_students` | Entry should exist mapping student → class | ❌ **MISSING** |
| Admin looks at enrollment | Compares `school_members` vs `class_students` | Student found in school_members but NOT in class_students | Shows "Unassigned" |

---

## Data Saved During Signup

```
SIGNUP → auth.users (via Supabase Auth)
  ↓ (Trigger fires)
  → users table (auto-created)
  ↓ (if schoolId provided)
  → profile_bootstrap() RPC called
  ↓
  → users table updated (school_id, role, grade, batch)
  ↓
  → school_members table INSERT (adds student to school)
  ↓
  ❌ STOP: class_students NOT populated
     (Must be done manually via Admin Portal)
```

---

## Source of Truth by Table

| Table | Tracks | Source of Truth For | Who Writes |
|-------|--------|-------------------|-----------|
| `users` | User account data | User identity, profile | Auth system + signup form |
| `school_members` | School membership | Is student in this school? | signup + profile_bootstrap RPC |
| `class_students` | Class enrollment | Is student in this class? | **ADMIN PORTAL ONLY** |

---

## How to Fix "All Unassigned"

### Option 1: Manual (GUI)
```
School Admin Portal
  → Student Enrollment tab
  → For each student:
     - Click "Select"
     - Choose class
     - Click "Save Enrollment"
```

### Option 2: Bulk SQL (if many students)
```sql
INSERT INTO class_students (class_id, student_id, enrolled_at)
SELECT 
    c.id as class_id,
    u.id as student_id,
    NOW() as enrolled_at
FROM students u
JOIN classes c ON c.school_id = u.school_id
WHERE u.school_id = 'YOUR_SCHOOL_ID'
  AND c.class_code = 'YOUR_CLASS_CODE'  -- Change this
  AND NOT EXISTS (
      SELECT 1 FROM class_students cs WHERE cs.student_id = u.id
  );
```

### Option 3: Code (Bulk via API)
```typescript
import { moveStudentToClassViaRPC } from './schoolAdminService';

const students = [...]; // Get all students
const classId = '...';  // Target class

for (const student of students) {
    await moveStudentToClassViaRPC(student.user_id, classId);
}
```

---

## Key Code Paths

### When Student Signs Up
```
authService.ts: signup()
    ↓
    auth.signUp()  [Supabase Auth]
    ↓
    [Trigger: creates in users table]
    ↓
    IF schoolId provided:
        bootstrapProfile()
        ↓
        profile_bootstrap() RPC [MULTI_TENANT_FINAL.sql#301]
        ↓
        INSERT INTO school_members
```

### When Admin Enrolls Student
```
SchoolAdminPortal.tsx: handleEnrollStudent()
    ↓
    schoolAdminService: moveStudentToClassViaRPC()
    ↓
    add_student_to_class() RPC
    ↓
    INSERT INTO class_students
```

### When Admin Views Enrollment
```
SchoolAdminPortal.tsx: loadAdminTools()
    ↓
    listSchoolMembers()  [Gets from school_members]
    ↓
    listClassStudents()  [Gets from class_students]
    ↓
    Build studentAssignments map
    ↓
    For each student:
        If NOT in map → "Unassigned"
        If in map → Show class code
```

---

## Diagnostic Commands

```sql
-- How many students in school?
SELECT COUNT(*) FROM school_members 
WHERE school_id = 'UUID' AND role_in_school = 'student';

-- How many assigned to classes?
SELECT COUNT(*) FROM class_students 
WHERE class_id IN (
    SELECT id FROM classes WHERE school_id = 'UUID'
);

-- List unassigned students
SELECT u.username, u.email
FROM school_members sm
JOIN users u ON u.id = sm.user_id
WHERE sm.school_id = 'UUID'
  AND NOT EXISTS (
      SELECT 1 FROM class_students cs WHERE cs.student_id = u.id
  )
ORDER BY u.username;
```

---

## Schema: The Three Tables

```sql
-- Table 1: User Authentication (from Supabase Auth system)
auth.users (managed by Supabase)
  id, email, password_hash, email_confirmed_at, ...

-- Table 2: User Profile (public)
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT,
  username TEXT,
  role TEXT ('student' | 'teacher'),
  school_id UUID,     -- ← Which school?
  grade SMALLINT,     -- ← Student's grade
  batch TEXT,         -- ← Student's batch (6A, 6B, etc)
  ...
);

-- Table 3: School Membership
CREATE TABLE school_members (
  school_id UUID,
  user_id UUID,
  role_in_school TEXT ('student' | 'teacher' | 'school_admin'),
  status TEXT ('active' | 'suspended'),
  joined_at TIMESTAMPTZ,
  PRIMARY KEY (school_id, user_id)
);

-- Table 4: Class Enrollment (THE MISSING LINK)
CREATE TABLE class_students (
  class_id UUID,      -- ← Which class?
  student_id UUID,    -- ← Which student?
  enrolled_at TIMESTAMPTZ,
  PRIMARY KEY (class_id, student_id)
);
```

---

## Files to Review

- **Signup:** `/services/authService.ts` (lines 115-188)
- **Bootstrap:** `/MULTI_TENANT_FINAL.sql` (lines 301-420)
- **Admin Load:** `/components/SchoolAdminPortal.tsx` (lines 146-176)
- **Admin Enroll:** `/components/SchoolAdminPortal.tsx` (lines 428-451)
- **Data Fetch:** `/services/schoolAdminService.ts` (lines 786, 1262)

---

## Bottom Line

✅ Students exist in school membership after signup
❌ Students are NOT automatically added to classes
→ **Manual enrollment required in Admin Portal**

This is by design — students need to be assigned to specific classes before they can start learning.
