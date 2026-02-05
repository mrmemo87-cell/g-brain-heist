# Cambridge Test Visibility Control - User Guide

## Overview
Teachers can now control which Cambridge tests are visible to students in their assigned grades and subjects. By default, **no tests are visible** until teachers explicitly enable them.

## Features

### ✅ For Teachers
- View all available Cambridge tests for your assigned grades/subjects
- Toggle individual tests as "Visible" or "Hidden" to students
- Bulk show/hide all tests for a grade/subject at once
- Real-time updates - changes take effect immediately for students

### ✅ For Students  
- Only see tests that have been made visible by their teachers
- Clear messaging when no tests are available yet
- Can still retake and view completed tests

### ✅ For School Admins
- Same controls as teachers
- Can manage visibility for all grades/subjects in the school

## How to Use

### For Teachers

#### Step 1: Access the Visibility Manager
1. Log in to the **Teacher Portal**
2. Click **"Cambridge Tests"** in the navigation
3. Click the **"👁️ Test Visibility"** button (top right, purple button)

#### Step 2: Manage Test Visibility
The manager shows tests grouped by **Grade** and **Subject**:

**Individual Test Control:**
- Click **"👁️ Visible"** to hide a test (becomes 🔒 Hidden)
- Click **"🔒 Hidden"** to show a test (becomes 👁️ Visible)

**Bulk Actions:**
- **✅ Show All** - Make all tests in the group visible
- **🚫 Hide All** - Hide all tests in the group

#### Step 3: Close and Verify
- Click **"Done"** to close the manager
- Changes are saved automatically
- Students will see updated test list immediately

### For Students

#### Viewing Available Tests
1. Go to **Cambridge Tests Hub**
2. You'll see only tests that your teacher has made visible
3. If no tests are available, you'll see:
   > 🔒 "No tests are currently available. Your teacher will make tests visible soon!"

#### Completed Tests
- You can always access tests you've already completed
- Your scores and feedback remain visible regardless of test visibility settings

## Test Organization

### Grade 8 - English stage 9
- End of Unit 4 Test
- Cambridge Reading Test 25
- Cambridge Listening Test 1
- Cambridge Writing Test 1
- Cambridge Writing Test 2
- End of Unit 4 Test (Stage 8)

### Grade 11 - AS Chemistry
- 20 chapter tests (Ch1-Ch10, each split into Part 1 & Part 2)
- Topics: Atomic Structure, Bonding, States of Matter, Stoichiometry, Chemical Energetics, Electrochemistry, Equilibria, Reaction Kinetics, Chemical Periodicity, Group 2

## Database Setup

### Step 1: Run the SQL Migration
Execute the migration file in Supabase SQL Editor:
```
ADD_CAMBRIDGE_TEST_VISIBILITY_CONTROL.sql
```

This creates:
- `cambridge_test_visibility` table
- RLS policies for security
- RPC functions for visibility management

### Step 2: Verify Installation
Check that the functions exist:
```sql
SELECT COUNT(*) FROM pg_proc 
WHERE proname LIKE '%cambridge_test_visibility%';
```

Should return 5 functions.

### Step 3: Assign Teachers to Classes
Teachers must be assigned to classes via the **School Admin Portal** to manage test visibility for their grades/subjects.

## How It Works

### Visibility Logic
1. **Teacher makes a test visible** → RPC creates/updates record in `cambridge_test_visibility`
2. **Student loads Cambridge Tests Hub** → Frontend calls `get_visible_cambridge_tests_for_student()`
3. **RPC returns only visible tests** → Frontend filters test list
4. **Student sees filtered tests** → Can only start visible tests

### Security
- Teachers can only manage tests for grades/subjects they're assigned to
- Students cannot bypass visibility restrictions
- All access controlled via RLS policies at database level
- School isolation maintained (teachers only see/manage their school's tests)

## Troubleshooting

### Students can't see any tests
**Cause:** No tests have been made visible yet
**Solution:** Teacher needs to enable tests in the Visibility Manager

### Teacher can't access Visibility Manager
**Cause:** Teacher not assigned to any classes
**Solution:** School admin must assign teacher to classes in School Admin Portal

### Visibility changes not showing for students
**Cause:** Browser cache or page not refreshed
**Solution:** Students should refresh the page (F5) to see updated test list

### "Access denied" error when toggling visibility
**Cause:** Teacher not assigned to that grade/subject
**Solution:** Contact school admin to update class assignments

### RPC function errors
**Cause:** Migration not run or incomplete
**Solution:** Re-run `ADD_CAMBRIDGE_TEST_VISIBILITY_CONTROL.sql` in Supabase

## Best Practices

### For Teachers
- ✅ **Start with a few tests** - Don't overwhelm students
- ✅ **Gradually release tests** - As students progress through material
- ✅ **Communicate with students** - Let them know when new tests are available
- ✅ **Use bulk actions** - Quickly show/hide entire chapters

### For School Admins
- ✅ **Coordinate with teachers** - Ensure consistent test availability across classes
- ✅ **Monitor usage** - Check which tests students are completing
- ✅ **Provide guidance** - Help teachers understand the visibility system

### For Students
- ✅ **Check regularly** - New tests may become available
- ✅ **Complete visible tests** - Don't wait for all tests to be released
- ✅ **Ask your teacher** - If you need access to specific tests

## API Reference

### RPC Functions

#### `get_visible_cambridge_tests_for_student(p_student_grade, p_school_id)`
Returns tests visible to a student based on teacher visibility settings.

#### `toggle_cambridge_test_visibility(p_test_id, p_subject, p_grade_level, p_is_visible)`
Toggles visibility for a single test.

#### `bulk_set_cambridge_test_visibility(p_test_ids[], p_subject, p_grade_level, p_is_visible)`
Sets visibility for multiple tests at once.

#### `get_teacher_test_visibility_settings()`
Returns all visibility settings for the logged-in teacher.

#### `is_cambridge_test_visible_to_student(p_test_id, p_student_grade, p_school_id, p_subject)`
Checks if a specific test is visible to a student.

## Migration Details

**File:** `ADD_CAMBRIDGE_TEST_VISIBILITY_CONTROL.sql`

**What it creates:**
- Table: `cambridge_test_visibility`
- Indexes: 3 indexes for efficient querying
- Policies: 3 RLS policies for access control
- Functions: 5 RPC functions for visibility management

**Safe to run:** Yes - uses `IF NOT EXISTS` and `CREATE OR REPLACE`

## Support

**Questions or issues?**
1. Check the troubleshooting section above
2. Verify database migration completed successfully
3. Ensure teacher has class assignments
4. Contact your system administrator

---

**Version:** 1.0  
**Last Updated:** February 5, 2026  
**Compatible with:** g-brain-heist Cambridge Tests system
