# Teacher Class Access Control - Implementation Guide

## Overview

This implementation ensures that teachers can only see and interact with students from classes assigned to them by the school admin. The system displays the teacher's name and assigned classes in the portal and filters all relevant features accordingly.

## Features Implemented

### 1. **Teacher Portal Header Enhancement**
- Displays teacher's name prominently
- Shows assigned classes with class codes and subjects
- Visual badges for each class assignment
- Warning message if no classes are assigned

### 2. **Class Assignment Management**
- School admins assign teachers to specific classes via School Admin Portal
- Each assignment links: `teacher_user_id` → `class_id` → `subject`
- Uses existing `class_teacher_assignments` table
- Supports multiple classes and subjects per teacher

### 3. **Filtered Access Control**

#### Cambridge Test Results
- Teachers only see test submissions from students in their assigned classes
- RLS (Row Level Security) policy on `quiz_scores` table restricts access
- Class filter dropdown shows only relevant classes
- Visual indicator shows number of assigned classes

#### Assignment Creation
- **Batch Mode**: Still shows all batches, but students are filtered by assigned classes
- **Custom Mode**: Student list only includes students from assigned classes
- Visual notification informs teachers about class filtering
- Maintains existing batch structure (8A, 8B, 8C, All)

#### Student Visibility
- `rpc_get_students_for_assignment()` automatically filters students
- If teacher has class assignments: Shows only students from those classes
- Fallback: If no assignments, shows all students from teacher's school

## Database Changes

### New SQL Functions (in `TEACHER_CLASS_ACCESS_CONTROL.sql`)

1. **`get_teacher_assigned_classes(p_teacher_user_id)`**
   - Returns all classes assigned to a teacher
   - Includes class info, subject, school details
   - Only returns active assignments

2. **`teacher_has_class_access(p_teacher_user_id, p_class_id)`**
   - Boolean check if teacher can access a specific class
   - Used for authorization checks

3. **`get_students_in_teacher_classes(p_teacher_user_id)`**
   - Returns all students enrolled in teacher's classes
   - Joins class_teacher_assignments → class_students → users
   - Excludes banned students

4. **`get_teacher_profile_with_classes(p_teacher_user_id)`**
   - Complete teacher profile with all assigned classes
   - Returns JSON with profile, classes array, school info
   - Single query to get all teacher context

5. **`filter_classes_for_teacher(p_teacher_user_id, p_school_id)`**
   - Get classes for dropdown filtering
   - Groups subjects taught in each class
   - Used in UI for class selection

6. **Updated `rpc_get_students_for_assignment(p_teacher_id)`**
   - Enhanced to check if teacher has class assignments
   - If yes: Only shows students from assigned classes
   - If no: Falls back to school-wide students

### Row Level Security (RLS) Updates

#### `quiz_scores` Table Policy
```sql
CREATE POLICY "Teachers see assigned classes" ON quiz_scores
FOR SELECT
USING (
    -- Admins see everything
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'school_admin'))
    OR
    -- Students see their own scores
    auth.uid()::TEXT = student_id
    OR
    -- Teachers see scores from students in their assigned classes
    EXISTS (
        SELECT 1
        FROM class_teacher_assignments cta
        JOIN class_students cs ON cs.class_id = cta.class_id
        WHERE cta.teacher_user_id = auth.uid()
        AND cta.active = true
        AND cs.student_id::TEXT = quiz_scores.student_id
    )
);
```

## Frontend Changes

### Service Layer (`services/schoolAdminService.ts`)

Added new interfaces:
```typescript
export interface TeacherAssignedClass {
  class_id: string;
  class_code: string;
  class_name: string;
  grade_level: number | null;
  subject: string;
  is_active: boolean;
  school_id: string;
  school_name: string;
}

export interface TeacherProfileWithClasses {
  success: boolean;
  profile: {...};
  assigned_classes: TeacherAssignedClass[];
  school: {...} | null;
  total_classes: number;
}
```

Added service functions:
- `getTeacherAssignedClasses(teacherUserId?)`
- `getTeacherProfileWithClasses(teacherUserId?)`
- `teacherHasClassAccess(teacherUserId, classId)`
- `filterClassesForTeacher(teacherUserId?, schoolId?)`

### Teacher Portal (`components/TeacherPortal.tsx`)

#### New State Variables
```typescript
const [assignedClasses, setAssignedClasses] = useState<SchoolAdminService.TeacherAssignedClass[]>([]);
const [teacherHasClassAssignments, setTeacherHasClassAssignments] = useState(false);
const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all');
```

#### Updated `loadTeacherData()`
- Fetches assigned classes on portal load
- Sets `teacherHasClassAssignments` flag
- Logs classes for debugging

#### UI Enhancements

1. **Header Section**:
   - Shows teacher username with avatar
   - Displays assigned classes as badges (first 6, then "+X more")
   - Warning badge if no classes assigned
   - Clean cyan color scheme for class badges

2. **Cambridge Reports**:
   - Added notice under "Classes" filter
   - Shows "✓ Showing only students from your X assigned class(es)"
   - Auto-filtered by RLS policy

3. **Assignment Creation**:
   - Added notice in custom student selection
   - Informs teacher that students are pre-filtered
   - Maintains seamless UX with automatic filtering

## How School Admin Assigns Classes

1. School Admin logs into **School Admin Portal**
2. Navigates to **"Teachers"** tab
3. Selects class from dropdown
4. Selects teacher from dropdown
5. Selects subject (Maths, Science, English, etc.)
6. Clicks **"Assign Teacher"**
7. Assignment is saved to `class_teacher_assignments` table

## User Experience Flow

### For Teachers

1. **Login** → Teacher Portal loads
2. **Header displays**: 
   - "Welcome back, **John Smith**"
   - Assigned classes: `8A • Maths`, `8B • Science`, `7C • English`
3. **Creating assignment**:
   - Student list automatically shows only students from assigned classes
   - No manual filtering needed
4. **Viewing Cambridge results**:
   - Only sees test submissions from assigned class students
   - Class dropdown only shows relevant classes
5. **Reports & Analytics**:
   - All data automatically scoped to assigned classes

### For School Admins

1. Login → School Admin Portal
2. Navigate to **Teachers** tab
3. View current assignments in table
4. Add new assignments with dropdowns
5. Delete assignments as needed
6. Teachers immediately see updated class access

## Security Considerations

### RLS Enforcement
- All queries pass through PostgreSQL RLS policies
- Teachers cannot bypass restrictions via API
- `SECURITY DEFINER` functions prevent privilege escalation

### Authorization Checks
- Every query validates `auth.uid()` matches teacher
- No client-side filtering that could be bypassed
- Database-level security = secure by design

### Fallback Behavior
- If teacher has no assignments: Shows all school students (backward compatibility)
- Prevents locked-out scenarios during migration
- School admin can immediately assign classes to fix

## Migration Steps

1. **Run SQL Migration**:
   ```sql
   psql -f TEACHER_CLASS_ACCESS_CONTROL.sql
   ```

2. **Deploy Frontend Changes**:
   - `services/schoolAdminService.ts` (new functions)
   - `components/TeacherPortal.tsx` (UI updates)

3. **Verify RLS Policies**:
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'quiz_scores';
   ```

4. **Test with Teacher Account**:
   - Login as teacher with assignments
   - Verify class badges display
   - Check student filtering works
   - Test Cambridge reports access

5. **School Admin Training**:
   - Show how to assign teachers to classes
   - Demonstrate class management
   - Explain teacher visibility rules

## Testing Checklist

- [ ] Teacher sees assigned classes in portal header
- [ ] Teacher name displays correctly
- [ ] Cambridge test results filtered by assigned classes
- [ ] Assignment creation shows only assigned class students
- [ ] Reports filtered to assigned classes
- [ ] School admin can assign/remove teachers
- [ ] No class assignment shows warning message
- [ ] Multiple classes display correctly (with "+X more")
- [ ] RLS policy prevents unauthorized access
- [ ] Batch mode assignment still works
- [ ] Custom mode student selection filtered
- [ ] Lockdown mode respects class assignments (via student filtering)

## Future Enhancements

1. **Class-based Dashboard Stats**
   - Show separate stats per assigned class
   - Class performance comparisons
   - Individual class analytics

2. **Class Switching UI**
   - Dropdown to switch active class context
   - Filter entire portal by selected class
   - "View All Classes" option

3. **Subject-based Filtering**
   - Filter by subject taught
   - Subject-specific student lists
   - Multi-subject support in dropdowns

4. **Notification System**
   - Alert when new classes assigned
   - Notify when class removed
   - Class roster change notifications

## Troubleshooting

### Issue: Teacher sees no students
**Cause**: No class assignments
**Solution**: School admin must assign classes in School Admin Portal

### Issue: Cambridge tests not filtered
**Cause**: RLS policy not applied
**Solution**: Re-run `TEACHER_CLASS_ACCESS_CONTROL.sql`

### Issue: Assignment creation fails
**Cause**: Student IDs not from assigned classes
**Solution**: Check `rpc_get_students_for_assignment` function

### Issue: Classes not showing in header
**Cause**: `getTeacherAssignedClasses()` failing
**Solution**: Check network tab, verify SQL function exists

## Database Schema Reference

### Key Tables

1. **`class_teacher_assignments`**
   - Links teachers to classes
   - Managed by school admins
   - Columns: `id`, `school_id`, `class_id`, `teacher_user_id`, `subject`, `active`

2. **`classes`**
   - School's classes/sections
   - Columns: `id`, `school_id`, `class_code`, `class_name`, `grade_level`, `is_active`

3. **`class_students`**
   - Student enrollment in classes
   - Columns: `class_id`, `student_id`

4. **`quiz_scores`** (Cambridge Tests)
   - Test submissions
   - RLS policy restricts teacher access
   - Columns include: `student_id`, `student_class`, `quiz_name`, etc.

## Support & Maintenance

### Monitoring
- Check RLS policy hit rate: `SELECT * FROM pg_stat_all_tables WHERE relname = 'quiz_scores';`
- Monitor function execution: `SELECT * FROM pg_stat_user_functions WHERE funcname LIKE 'get_teacher%';`
- Log slow queries involving class filtering

### Maintenance
- Periodically review class assignments
- Clean up inactive assignments
- Archive old class data
- Update RLS policies as needed

## Conclusion

This implementation provides robust class-based access control for teachers while maintaining a smooth user experience. Teachers see exactly what they need, school admins have full control, and security is enforced at the database level.

The system is flexible enough to handle:
- Multiple classes per teacher
- Multiple subjects per class
- Cross-grade teaching
- School-wide visibility fallback
- Future enhancements

All while keeping the UI clean and the data secure.
