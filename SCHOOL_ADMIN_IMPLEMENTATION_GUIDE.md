# School Admin System - Complete Implementation Guide

## 🎯 Overview

This guide provides step-by-step instructions to implement a complete DB-driven School Admin system where school admins can manage subjects, classes, teachers, and students all from the database with proper access control.

---

## 📋 Table of Contents

1. [Backend Setup (SQL)](#backend-setup)
2. [Frontend Updates](#frontend-updates)
3. [Testing Checklist](#testing-checklist)
4. [Deployment](#deployment)

---

## 🗄️ Backend Setup

### Step 1: Run the SQL Migration

Run the file **`SCHOOL_ADMIN_COMPREHENSIVE_SETUP.sql`** in Supabase SQL Editor.

This migration includes:
- ✅ **school_subjects table** - Store subjects per school (no more free-text)
- ✅ **Enhanced RLS policies** - School admins can manage their school data
- ✅ **Helper functions** - `my_school_id()`, `is_school_admin_of()`
- ✅ **Admin RPCs**:
  - `school_admin_list_members(p_search)`
  - `school_admin_set_member_role(p_member_user_id, p_new_role)`
  - `school_admin_move_student_to_class(p_student_id, p_class_id)`
  - `admin_assign_teacher_to_class_subject(...)` ← **This was missing!**

### Step 2: Verify Tables

```sql
-- Check school_subjects table exists
SELECT * FROM school_subjects LIMIT 1;

-- Check class_teacher_assignments table exists
SELECT * FROM class_teacher_assignments LIMIT 1;

-- Verify RLS is enabled
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('school_subjects', 'classes');
```

---

## 🎨 Frontend Updates

### Part A: Update `schoolAdminService.ts`

Add new functions to interact with the `school_subjects` table:

```typescript
// In services/schoolAdminService.ts

export interface SchoolSubject {
  id: string;
  school_id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
}

/**
 * List all subjects for a school
 */
export async function listSchoolSubjects(schoolId: string): Promise<SchoolSubject[]> {
  try {
    const { data, error } = await supabase
      .from('school_subjects')
      .select('*')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching school subjects:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Exception fetching school subjects:', err);
    return [];
  }
}

/**
 * Create a new subject
 */
export async function createSchoolSubject(
  schoolId: string,
  name: string,
  code?: string
): Promise<{ success: boolean; error?: string; subject?: SchoolSubject }> {
  try {
    const { data, error } = await supabase
      .from('school_subjects')
      .insert({
        school_id: schoolId,
        name: name.trim(),
        code: code?.trim() || null,
        is_active: true,
        created_by: (await supabase.auth.getUser()).data.user?.id || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating subject:', error);
      return { success: false, error: error.message };
    }

    return { success: true, subject: data };
  } catch (err) {
    console.error('Exception creating subject:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Update a subject
 */
export async function updateSchoolSubject(
  subjectId: string,
  updates: { name?: string; code?: string; is_active?: boolean }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('school_subjects')
      .update(updates)
      .eq('id', subjectId);

    if (error) {
      console.error('Error updating subject:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Exception updating subject:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Delete (soft delete) a subject
 */
export async function deleteSchoolSubject(subjectId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Soft delete by setting is_active = false
    const { error } = await supabase
      .from('school_subjects')
      .update({ is_active: false })
      .eq('id', subjectId);

    if (error) {
      console.error('Error deleting subject:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Exception deleting subject:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Use new RPCs for member management
 */
export async function listMembersViaRPC(search?: string): Promise<{
  user_id: string;
  username: string;
  email: string;
  role_in_school: string;
  status: string;
  batch: string | null;
}[]> {
  try {
    const { data, error } = await supabase.rpc('school_admin_list_members', {
      p_search: search || null,
    });

    if (error) {
      console.error('Error listing members via RPC:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Exception listing members via RPC:', err);
    return [];
  }
}

export async function setMemberRoleViaRPC(
  memberUserId: string,
  newRole: 'student' | 'teacher'
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('school_admin_set_member_role', {
      p_member_user_id: memberUserId,
      p_new_role: newRole,
    });

    if (error) {
      console.error('Error setting member role via RPC:', error);
      return { success: false, error: error.message };
    }

    if (data && typeof data === 'object' && 'success' in data) {
      return data as { success: boolean; error?: string };
    }

    return { success: true };
  } catch (err) {
    console.error('Exception setting member role via RPC:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export async function moveStudentToClassViaRPC(
  studentId: string,
  classId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('school_admin_move_student_to_class', {
      p_student_id: studentId,
      p_class_id: classId,
    });

    if (error) {
      console.error('Error moving student via RPC:', error);
      return { success: false, error: error.message };
    }

    if (data && typeof data === 'object' && 'success' in data) {
      return data as { success: boolean; error?: string };
    }

    return { success: true };
  } catch (err) {
    console.error('Exception moving student via RPC:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
```

### Part B: Update `SchoolAdminPortal.tsx`

Replace the current subjects management (which is client-side only) with DB-driven management:

**Key Changes:**
1. Load subjects from `school_subjects` table instead of extracting from assignments
2. Add/edit/delete subjects via Supabase
3. Use `school_subjects.name` when assigning teachers
4. Use new RPCs for member role changes and student moves

**Subjects Tab - Replace with DB-driven version:**

```tsx
// State
const [dbSubjects, setDbSubjects] = useState<SchoolAdminService.SchoolSubject[]>([]);
const [subjectName, setSubjectName] = useState('');
const [subjectCode, setSubjectCode] = useState('');
const [subjectSaving, setSubjectSaving] = useState(false);

// Load subjects from DB
const loadSubjects = async (schoolId: string) => {
  const subjectList = await SchoolAdminService.listSchoolSubjects(schoolId);
  setDbSubjects(subjectList);
};

// In loadAdminTools, call loadSubjects:
const loadAdminTools = useCallback(async (schoolId: string) => {
  setClassesLoading(true);
  try {
    const [classList, teacherList, assignmentsList, studentList, subjectList] = await Promise.all([
      SchoolAdminService.listSchoolClasses(schoolId),
      SchoolAdminService.listSchoolTeachers(schoolId),
      SchoolAdminService.listTeacherAssignments(schoolId),
      SchoolAdminService.listSchoolMembers(schoolId, { role: 'student', limit: 200 }).then((res) => res.members),
      SchoolAdminService.listSchoolSubjects(schoolId),
    ]);

    setClasses(classList);
    setTeachers(teacherList);
    setTeacherAssignments(assignmentsList);
    setStudents(studentList);
    setDbSubjects(subjectList);
    
    // ... rest of the function
  } catch (err) {
    // error handling
  } finally {
    setClassesLoading(false);
  }
}, []);

// Handle add subject
const handleAddSubject = async () => {
  if (!school || !subjectName.trim()) {
    addToast('Subject name is required', 'error');
    return;
  }

  setSubjectSaving(true);
  const result = await SchoolAdminService.createSchoolSubject(
    school.id,
    subjectName,
    subjectCode || undefined
  );
  setSubjectSaving(false);

  if (!result.success) {
    addToast(result.error || 'Failed to create subject', 'error');
    return;
  }

  addToast(`Subject "${subjectName}" created successfully`, 'success');
  setSubjectName('');
  setSubjectCode('');
  await loadSubjects(school.id);
};

// Handle delete subject
const handleDeleteSubject = async (subjectId: string, subjectName: string) => {
  if (!confirm(`Delete subject "${subjectName}"? This will mark it as inactive.`)) return;

  const result = await SchoolAdminService.deleteSchoolSubject(subjectId);
  if (!result.success) {
    addToast(result.error || 'Failed to delete subject', 'error');
    return;
  }

  addToast(`Subject "${subjectName}" deleted`, 'success');
  if (school) await loadSubjects(school.id);
};
```

**In the Subjects tab JSX:**

```tsx
{activeTab === 'subjects' && (
  <div className="space-y-6">
    {/* Add Subject Form */}
    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
      <h3 className="text-lg font-semibold mb-4">Add New Subject</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-400 mb-1">Subject Name *</label>
          <input
            type="text"
            value={subjectName}
            onChange={(e) => setSubjectName(e.target.value)}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            placeholder="e.g., Mathematics, Physics, English"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Code (Optional)</label>
          <input
            type="text"
            value={subjectCode}
            onChange={(e) => setSubjectCode(e.target.value)}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            placeholder="e.g., MATH, PHYS"
          />
        </div>
      </div>
      <button
        onClick={handleAddSubject}
        disabled={subjectSaving || !subjectName.trim()}
        className="mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg transition-colors font-medium"
      >
        {subjectSaving ? 'Adding...' : 'Add Subject'}
      </button>
    </div>

    {/* Subjects List */}
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      <div className="p-4 border-b border-gray-700">
        <h4 className="text-sm font-semibold text-gray-300">Active Subjects ({dbSubjects.length})</h4>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-750 border-b border-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Subject Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Code</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Created</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {dbSubjects.map((subject) => (
              <tr key={subject.id} className="hover:bg-gray-750">
                <td className="px-4 py-3 text-sm text-gray-200 font-medium">📚 {subject.name}</td>
                <td className="px-4 py-3 text-sm text-gray-400">{subject.code || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{new Date(subject.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleDeleteSubject(subject.id, subject.name)}
                    className="text-red-400 hover:text-red-300 text-sm font-medium"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dbSubjects.length === 0 && (
        <div className="p-6 text-center text-gray-500">
          No subjects added yet. Add subjects to enable teacher assignments.
        </div>
      )}
    </div>
  </div>
)}
```

**In Teacher Assignments tab - Use DB subjects:**

Replace the subject dropdown to use `dbSubjects`:

```tsx
<select
  value={assignmentSubjectInput}
  onChange={(e) => setAssignmentSubjectInput(e.target.value)}
  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
>
  <option value="">Select subject</option>
  {dbSubjects.map((subject) => (
    <option key={subject.id} value={subject.name}>
      {subject.name} {subject.code && `(${subject.code})`}
    </option>
  ))}
</select>
```

---

## ✅ Testing Checklist

### Backend Tests

Run these SQL queries to verify:

```sql
-- 1. Test school_admin_list_members
SELECT * FROM school_admin_list_members(NULL);

-- 2. Test creating a subject
INSERT INTO school_subjects (school_id, name, code, created_by)
VALUES (
  (SELECT school_id FROM school_members WHERE user_id = auth.uid() LIMIT 1),
  'Test Subject',
  'TEST',
  auth.uid()
);

-- 3. Test admin_assign_teacher_to_class_subject
SELECT admin_assign_teacher_to_class_subject(
  'your-school-id',
  'your-class-id',
  'your-teacher-user-id',
  'Mathematics',
  true
);

-- 4. Verify RLS works (should only see your school's subjects)
SELECT * FROM school_subjects;
```

### Frontend Tests

1. **Subjects Management**
   - [ ] Add a new subject
   - [ ] See subject in the list
   - [ ] Subject appears in teacher assignment dropdown
   - [ ] Delete subject (soft delete)
   - [ ] Verify deleted subject not shown

2. **Teacher Assignment**
   - [ ] Select class, teacher, and subject
   - [ ] Click "Assign Teacher"
   - [ ] See assignment in list
   - [ ] Delete assignment
   - [ ] Verify teacher sees assigned class in Teacher Portal

3. **Member Management**
   - [ ] Search for a member
   - [ ] Change member role (student ↔ teacher)
   - [ ] Verify role updates in school_members table

4. **Student Enrollment**
   - [ ] Select student and class
   - [ ] Move student to class
   - [ ] Verify student's `batch` field updates
   - [ ] Verify student appears in class_students table

---

## 🚀 Deployment

### Step 1: Database Migration
```bash
# Copy the SQL file to Supabase
# Run in Supabase SQL Editor:
# SCHOOL_ADMIN_COMPREHENSIVE_SETUP.sql
```

### Step 2: Update Frontend Code
```bash
# Update services/schoolAdminService.ts
# Update components/SchoolAdminPortal.tsx

git add .
git commit -m "feat: DB-driven school admin with subjects management"
git push
```

### Step 3: Manual Test
1. Login as school_admin
2. Navigate to School Admin Portal
3. Add a subject (e.g., "Mathematics")
4. Assign a teacher to a class + subject
5. Move a student to a class
6. Change a member's role

---

## 📚 Summary

✅ **What's New:**
- Real `school_subjects` table (no more free-text)
- School admin RLS policies for secure data access
- RPCs for member management, role changes, student moves
- Missing `admin_assign_teacher_to_class_subject` RPC now exists
- DB-driven UI with proper validation

✅ **Benefits:**
- **Scalable**: All data stored in DB, not client state
- **Secure**: RLS policies enforce tenant isolation
- **Consistent**: Single source of truth for subjects
- **Maintainable**: Clear separation of concerns

---

## 🐛 Common Issues

### Issue: "Forbidden" error when creating subject
**Fix**: Ensure user has `role_in_school = 'school_admin'` in `school_members` table

```sql
UPDATE school_members
SET role_in_school = 'school_admin'
WHERE user_id = 'your-user-id' AND school_id = 'your-school-id';
```

### Issue: Subject dropdown empty in teacher assignments
**Fix**: Ensure subjects were loaded:
```typescript
await loadSubjects(school.id);
```

### Issue: Teacher assignment fails silently
**Fix**: Check browser console for RPC errors. The `admin_assign_teacher_to_class_subject` RPC now exists and should work.

---

## 📞 Support

If you encounter issues, check:
1. Supabase logs (Database → Logs)
2. Browser console (Network tab for failed RPCs)
3. RLS policies (ensure school admin has proper access)

