# TeacherPortal.tsx Update Guide

## Overview
The visibility manager modal in TeacherPortal.tsx currently uses a hardcoded list of 26 tests. This guide shows how to update it to dynamically fetch tests from the database using the new `get_all_cambridge_tests()` RPC function.

## Current Implementation (Lines ~6282-6454)

```typescript
// CURRENT: Hardcoded test list
const testsByGradeAndSubject = {
  '8-English stage 9': [
    { id: 'cambridge-end-unit-4', name: 'End of Unit 4 Test' },
    { id: 'cambridge-reading-25', name: 'Cambridge Reading Test 25' },
    // ... more tests hardcoded
  ],
  '11-AS Chemistry': [
    { id: 'as-chemistry-atomic-structure-part-1', name: 'AS Chemistry — Atomic Structure (Part 1)' },
    // ... more tests hardcoded
  ],
};
```

## New Implementation (Database-Driven)

### Step 1: Add State for Dynamic Test Loading

```typescript
const [testsByGradeAndSubject, setTestsByGradeAndSubject] = useState<Record<string, any[]>>({});
const [testsLoading, setTestsLoading] = useState(false);
```

### Step 2: Create Function to Load Tests from Database

```typescript
const loadTestsForVisibility = async (gradeLevel: number, subject: string) => {
  setTestsLoading(true);
  try {
    const { data, error } = await supabase.rpc('get_all_cambridge_tests', {
      p_grade_level: gradeLevel,
      p_subject: subject
    });

    if (error) {
      console.error('Error loading tests:', error);
      setTestsLoading(false);
      return;
    }

    // Group tests by subject for display
    const grouped: Record<string, any[]> = {};
    data?.forEach((test: any) => {
      const key = `${gradeLevel}-${test.subject}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(test);
    });

    setTestsByGradeAndSubject(grouped);
  } finally {
    setTestsLoading(false);
  }
};
```

### Step 3: Call Load Function When Visibility Manager Opens

```typescript
const handleOpenVisibilityManager = async () => {
  setShowVisibilityManager(true);
  
  // Load tests for all teacher-assigned grades
  // Example: if teacher teaches Grade 8 and 11
  await loadTestsForVisibility(8, 'English stage 9');
  await loadTestsForVisibility(11, 'AS Chemistry');
};
```

### Step 4: Update Modal Rendering

In the modal where tests are displayed, replace the hardcoded list reference with the dynamically loaded state:

```typescript
// BEFORE: Hardcoded mapping
const getTestsForGradeSubject = (grade: number, subject: string) => {
  const key = `${grade}-${subject}`;
  return HARDCODED_TESTS[key] || [];
};

// AFTER: Dynamic from database
const getTestsForGradeSubject = (grade: number, subject: string) => {
  const key = `${grade}-${subject}`;
  return testsByGradeAndSubject[key] || [];
};
```

### Step 5: Add Loading State to Modal

```typescript
{testsLoading && (
  <div className="text-center py-4">
    <p className="text-gray-600">Loading tests...</p>
  </div>
)}

{!testsLoading && Object.keys(testsByGradeAndSubject).length === 0 && (
  <div className="text-center py-4">
    <p className="text-gray-500">No tests available for your assigned grades</p>
  </div>
)}

{!testsLoading && Object.entries(testsByGradeAndSubject).map(([key, tests]) => (
  // ... existing modal content
))}
```

## Benefits

✅ **No More Hardcoding** - Tests come directly from the database
✅ **Automatic Updates** - New tests appear immediately without code changes
✅ **Single Source of Truth** - All test metadata in one place
✅ **Scalable** - Works with any number of tests
✅ **Maintainable** - When adding tests, only update the database

## Testing the Change

### Test 1: Load Tests
1. Open TeacherPortal
2. Click "👁️ Test Visibility" button
3. Verify tests load from database (should see 6 English + 20 Chemistry tests)

### Test 2: Add New Test
1. Run SQL: `INSERT INTO cambridge_tests (...) VALUES (...)`
2. Reload teacher visibility manager
3. New test should appear immediately without redeployment

### Test 3: Toggle Visibility
1. Toggle any test visibility
2. Verify it saves to database
3. Close and reopen modal
4. Verify toggle state persists

## Rollback Plan

If issues occur:
1. Revert TeacherPortal.tsx changes
2. Hardcoded list will still work as fallback
3. Tests already in `cambridge_tests` table are unaffected

## Related Files

- [CAMBRIDGE_TESTS_DATABASE_REFACTOR.md](CAMBRIDGE_TESTS_DATABASE_REFACTOR.md) - Full refactor overview
- [ADD_CAMBRIDGE_TEST_VISIBILITY_CONTROL.sql](ADD_CAMBRIDGE_TEST_VISIBILITY_CONTROL.sql) - Database migration with `get_all_cambridge_tests()` RPC

