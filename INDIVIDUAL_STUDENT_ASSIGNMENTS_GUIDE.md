# Individual Student Assignments - Implementation Guide

## Overview
This feature allows teachers to assign work to specific students regardless of their grade or batch, providing much more flexibility than the previous batch-only system.

## What's New

### 🎯 Two Assignment Modes

1. **Batch Mode** (Default - Original Behavior)
   - Assign to entire batches (8A, 8B, 8C, or All)
   - Quick and easy for class-wide assignments
   - Students are automatically added based on their batch

2. **Custom Mode** (New Feature)
   - Select specific students individually
   - Mix students from different grades and batches
   - Perfect for differentiated learning or targeted interventions
   - Search and filter students by name or batch

## Database Changes

### New Tables

#### `assignment_students`
Tracks which students are selected for custom assignments.
```sql
- assignment_id: UUID (references assignments)
- student_id: UUID (references users)
- added_at: TIMESTAMPTZ
```

### Modified Tables

#### `assignments`
- **New column:** `assignment_mode` ('batch' | 'custom')
- **Changed:** `batch` is now nullable (NULL for custom assignments)
- **Updated constraint:** Validates batch based on mode

### New RPC Functions

#### `rpc_get_students_for_assignment(p_teacher_id)`
Returns all active, non-banned students available for assignment selection.

**Returns:**
- id, username, display_name, grade, batch, avatar_url

#### `rpc_create_assignment` (Updated)
**New Parameters:**
- `p_assignment_mode` ('batch' | 'custom')
- `p_student_ids` (UUID array, required for custom mode)

**Validation:**
- Batch mode: requires `p_batch`
- Custom mode: requires at least one `p_student_ids`

## Frontend Changes

### TypeScript Types Updated

```typescript
interface TeacherAssignmentSummary {
  // ... existing fields
  assignment_mode?: 'batch' | 'custom';
  batch: AssignmentBatch | null; // Now nullable
}

interface CreateAssignmentRequest {
  // ... existing fields
  batch?: AssignmentBatch; // Now optional
  assignment_mode?: 'batch' | 'custom';
  student_ids?: string[];
}

interface StudentForAssignment {
  id: string;
  username: string;
  display_name: string;
  grade: number;
  batch: Batch | null;
  avatar_url?: string | null;
}
```

### UI Components Updated

#### Teacher Portal - Create Assignment Form

**New Features:**
1. **Mode Selector:** Toggle between "Assign to Batch" and "Select Students"
2. **Student Selector:** 
   - Multi-select checkboxes for individual students
   - Search functionality to filter by name or batch
   - Select All / Clear buttons
   - Shows grade, batch, and username for each student
   - Selected count display
3. **Dynamic Form:** Shows batch dropdown OR student selector based on mode

#### Assignment Display
- Shows "Custom (X students)" for custom assignments
- Shows "Batch: [batch name]" for batch assignments

### Service Layer Updates

#### gameService.ts
- **Updated:** `create_assignment()` validates mode-specific requirements
- **New:** `get_students_for_assignment()` fetches available students

#### rpcGateway.ts
- **New:** `getStudentsForAssignment()` wrapper

## Usage Instructions

### For Teachers

#### Creating a Batch Assignment (Original Method)
1. Go to Teacher Portal → Assignments → New Assignment
2. Select "📚 Assign to Batch" mode
3. Choose a batch (8A, 8B, 8C, or All)
4. Select subject, questions, and other details
5. Create assignment

#### Creating a Custom Assignment (New Feature)
1. Go to Teacher Portal → Assignments → New Assignment
2. Select "👥 Select Students" mode
3. Use search bar to find specific students
4. Click checkboxes to select individual students
5. Use "Select All" or "Clear" buttons as needed
6. Select subject, questions, and other details
7. Create assignment

### Student Selection Features
- **Search:** Type student name, username, or batch
- **Filter:** Results update in real-time
- **Visual Feedback:** Selected students are highlighted
- **Count Display:** Shows "X selected" in the header
- **Batch Info:** Each student shows their grade and batch

## Migration Instructions

### Step 1: Run the SQL Migration
```bash
# In Supabase SQL Editor or via psql
\i ENABLE_INDIVIDUAL_STUDENT_ASSIGNMENTS.sql
```

This will:
- Create `assignment_students` table
- Add `assignment_mode` column to assignments
- Make `batch` nullable
- Update constraints and RLS policies
- Create new RPC functions
- Update existing RPCs

### Step 2: Deploy Frontend Changes
All TypeScript changes are backward compatible:
- Existing batch assignments continue to work
- New fields default to batch mode
- No data migration needed

### Step 3: Verify
1. Check existing assignments still display correctly
2. Try creating a new batch assignment
3. Try creating a new custom assignment
4. Verify students receive assignments correctly

## Technical Details

### How It Works

#### Batch Mode (Original)
1. Teacher selects batch
2. `rpc_create_assignment` receives batch parameter
3. Assignment created with `assignment_mode='batch'`
4. `student_assignments` created for all students matching the batch

#### Custom Mode (New)
1. Teacher selects individual students
2. `rpc_create_assignment` receives array of student IDs
3. Assignment created with `assignment_mode='custom'` and `batch=NULL`
4. Student selections saved to `assignment_students`
5. `student_assignments` created only for selected students

### Security
- RLS policies ensure teachers only see their own assignments
- `ensure_teacher()` validates teacher status before operations
- Student list RPC verifies teacher credentials
- Banned students are automatically excluded

### Performance Considerations
- Student list is loaded once when Teacher Portal opens
- Search/filter happens client-side for instant feedback
- Indexes on `assignment_students` for efficient queries
- Student count is pre-calculated in assignment summaries

## Backward Compatibility

✅ **Fully Backward Compatible**
- Existing batch assignments continue to work
- Old assignments default to `assignment_mode='batch'`
- Batch field remains populated for legacy assignments
- No breaking changes to existing functionality

## Future Enhancements

Potential improvements:
- Save student groups for quick selection
- Import students from CSV
- Copy student list from previous assignment
- Student assignment history view
- Bulk assignment operations
- Assignment templates with saved student lists

## Troubleshooting

### Issue: Students not appearing in list
**Solution:** 
- Verify students have `role='student'`
- Check `is_banned` is not true
- Run: `SELECT * FROM rpc_get_students_for_assignment('[teacher-id]')`

### Issue: Custom assignment creation fails
**Solution:**
- Ensure at least one student is selected
- Check student IDs are valid UUIDs
- Verify teacher has proper permissions

### Issue: Batch assignments not working
**Solution:**
- Ensure `assignment_mode='batch'` is set
- Verify batch value is valid ('8A', '8B', '8C', 'All')
- Check constraint on assignments table

## Files Modified

### SQL
- ✅ `ENABLE_INDIVIDUAL_STUDENT_ASSIGNMENTS.sql` (new)

### TypeScript
- ✅ `types.ts` - Updated interfaces
- ✅ `services/rpcGateway.ts` - Added RPC wrapper
- ✅ `services/gameService.ts` - Updated create/get functions
- ✅ `components/TeacherPortal.tsx` - UI for student selection

## Testing Checklist

- [ ] Run SQL migration successfully
- [ ] Verify existing batch assignments display
- [ ] Create new batch assignment
- [ ] Create new custom assignment with multiple students
- [ ] Search students by name
- [ ] Search students by batch
- [ ] Select/deselect individual students
- [ ] Use "Select All" button
- [ ] Use "Clear" button
- [ ] Verify students receive custom assignments
- [ ] Check assignment reports show correct student count
- [ ] Test with students from different grades
- [ ] Test with students from different batches

## Support

For issues or questions:
1. Check console for error messages
2. Verify SQL migration completed
3. Check RLS policies are active
4. Review teacher permissions

---
**Version:** 1.0  
**Date:** November 18, 2025  
**Status:** Ready for Testing
