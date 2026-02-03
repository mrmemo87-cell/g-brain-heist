# Grade Selection Feature - Complete Implementation

## Summary
The School Admin Portal's Student Enrollment section now supports selecting and updating a student's grade during the enrollment process.

## User Workflow
1. Admin opens the **Students** tab in School Admin Portal
2. Admin selects a **student** from the dropdown
   - Student's current grade auto-loads into the Grade field
   - Student's current class is shown below the form
3. Admin selects a **grade** (6-12) from the dropdown
   - Class dropdown automatically filters to show only classes with matching grade_level
4. Admin selects a **class** from the filtered list
5. Admin clicks **Save Enrollment**
   - Student's grade is updated in the database
   - Student is enrolled in the selected class
   - Student is automatically removed from any other classes in the school

## Implementation Details

### 1. Database Layer (SCHOOL_ADMIN_COMPREHENSIVE_SETUP.sql)

**RPC Function Enhanced:** `school_admin_move_student_to_class()`
- **Parameters:** 
  - `p_student_id UUID` - Student to enroll
  - `p_class_id UUID` - Target class
  - `p_grade SMALLINT DEFAULT NULL` - Target grade (optional)
- **Logic:**
  - Validates user is school admin
  - Removes student from all other classes in school
  - Adds student to new class
  - Updates `users.grade` to provided grade (or class's grade_level if not provided)
  - Updates `users.batch` to class code
- **Permissions:** Updated GRANT statement to include all three parameters (UUID, UUID, SMALLINT)

**Location:** Lines 261-325

### 2. Service Layer (services/schoolAdminService.ts)

**Function Updated:** `moveStudentToClassViaRPC()`
- **Signature:** 
  ```typescript
  export async function moveStudentToClassViaRPC(
    studentId: string,
    classId: string,
    grade?: number
  ): Promise<{ success: boolean; error?: string }>
  ```
- **Implementation:**
  - Passes `p_grade: grade || null` to RPC
  - Maintains error handling and response mapping
- **Location:** Lines 1126-1150

### 3. UI Layer (components/SchoolAdminPortal.tsx)

#### State Variables
```typescript
const [selectedGrade, setSelectedGrade] = useState<number | ''>('');
```
- Stores selected grade (6-12)
- Resets when grade changes to filter available classes

#### UI Components (Student Enrollment Form)
- **Student Dropdown:** Shows all students with their current grade
- **Grade Dropdown:** Shows grades 6-12 for selection
- **Class Dropdown:** 
  - Dynamically filters to show only classes where `grade_level === selectedGrade`
  - Resets selection when grade changes
- **Save Enrollment Button:** Passes student ID, class ID, and grade to RPC

#### Event Handlers

**When Student Selected:**
```typescript
const student = students.find(s => s.user_id === studentId);
setSelectedGrade(student?.grade ? Number(student.grade) : '');
setSelectedClassId(studentAssignments[studentId] || '');
```
- Auto-fills grade from student's current grade
- Auto-fills class from student's current assignment

**When Grade Changed:**
```typescript
setSelectedGrade(grade);
setSelectedClassId('');  // Reset class selection
```
- Filters classes by selected grade
- Resets class selection to avoid invalid combinations

**When Enrolling:**
```typescript
const result = await SchoolAdminService.moveStudentToClassViaRPC(
  selectedStudentId,
  selectedClassId,
  selectedGrade ? Number(selectedGrade) : undefined
);
```
- Passes grade to RPC (or undefined if no grade selected)

**Location:** Lines 79 (state), 438-466 (handler), UI around lines 1620-1700

## Data Flow

```
Admin selects student
    ↓
Load student's current grade → setSelectedGrade(student.grade)
Load student's current class → setSelectedClassId(currentClass)
    ↓
Admin selects grade
    ↓
Filter classes: classes.filter(cls => !selectedGrade || cls.grade_level === selectedGrade)
Reset class selection → setSelectedClassId('')
    ↓
Admin selects class (from filtered list)
    ↓
Admin clicks Save
    ↓
Call RPC with: (studentId, classId, selectedGrade)
    ↓
RPC validates and executes:
  - Removes from other classes
  - Adds to new class
  - Updates users.grade = selectedGrade
  - Updates users.batch = class_code
    ↓
Success → Reset form, reload data, show toast
```

## Features

✅ **Grade Selection** - Admin can set/change student's grade  
✅ **Dynamic Class Filtering** - Only classes matching grade appear  
✅ **Auto-fill Current Grade** - Loads student's existing grade  
✅ **Auto-fill Current Class** - Shows which class student is currently in  
✅ **Class Removal** - Student automatically removed from other classes  
✅ **Database Sync** - Both `users.grade` and `batch` columns updated  
✅ **Validation** - RPC validates school admin permission and class ownership  

## Grade to Class Mapping

The system assumes class names or grade_levels follow this pattern:
- Grade 6 → Classes with `grade_level = 6` (e.g., "6A", "6B", "6C")
- Grade 7 → Classes with `grade_level = 7` (e.g., "7A", "7B", "7C")
- Grade 11 → Classes with `grade_level = 11` (e.g., "11A", "11B", "11C")
- etc.

This mapping is configured during class creation via the `classes` table `grade_level` column.

## Error Handling

- **Validation Errors:** RPC returns `{ success: false, error: "reason" }`
- **Permission Denied:** If user is not school admin for selected school
- **Class Not Found:** If class doesn't belong to the school
- **Database Errors:** Caught and reported via toast notifications

## Testing Checklist

- [ ] Create a test student in grade 10
- [ ] Verify grade auto-loads when student selected
- [ ] Change grade to 11
- [ ] Verify class dropdown shows only grade 11 classes
- [ ] Select a grade 11 class (e.g., "11A")
- [ ] Click Save and verify:
  - [ ] Toast shows success
  - [ ] Student is now assigned to 11A
  - [ ] Student's grade is updated to 11 in database
  - [ ] Student is removed from any previous class
- [ ] Select different grade and class, verify class dropdown updates
- [ ] Test with student who has no current assignment

## Files Modified

1. **SCHOOL_ADMIN_COMPREHENSIVE_SETUP.sql**
   - Enhanced `school_admin_move_student_to_class()` RPC function
   - Updated GRANT statement for new function signature

2. **services/schoolAdminService.ts**
   - Updated `moveStudentToClassViaRPC()` function signature
   - Added `grade?: number` parameter

3. **components/SchoolAdminPortal.tsx**
   - Added state variable `selectedGrade`
   - Added grade dropdown selector
   - Updated class dropdown to filter by selected grade
   - Updated student selector to auto-load grade
   - Updated enrollment handler to pass grade to RPC
   - Modified UI grid from 3 columns to 4 columns (student, grade, class, button)

## Notes

- Grade parameter is optional (DEFAULT NULL in RPC) for backward compatibility
- If grade not provided, RPC uses class's grade_level
- When changing grade, class selection is reset to prevent invalid state
- Current class display shows previously assigned class before changes
