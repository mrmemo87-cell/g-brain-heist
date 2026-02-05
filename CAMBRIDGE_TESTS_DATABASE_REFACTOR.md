# Cambridge Tests Database Refactor

## Overview
The visibility manager has been refactored to eliminate hardcoded test ID lists. All test metadata is now stored in a dedicated `cambridge_tests` database table.

## What Changed

### Before (Hardcoded)
```typescript
// TeacherPortal.tsx - Hard to maintain!
const ENGLISH_TESTS = [
  { id: 'cambridge-end-unit-4', name: 'End of Unit 4 Test' },
  { id: 'cambridge-reading-25', name: 'Cambridge Reading Test 25' },
  // ... manually add every new test here
];

const CHEMISTRY_TESTS = [
  { id: 'as-chemistry-atomic-structure-part-1', name: 'AS Chemistry — Atomic Structure (Part 1)' },
  // ... manually add every new test here
];
```

**Problems:**
- Test IDs must be manually kept in sync with `CambridgeTestsHub.tsx`
- Adding new tests requires code changes in two places
- Risk of test IDs going out of sync
- Not scalable as tests grow

### After (Database-Driven)
```sql
-- ADD_CAMBRIDGE_TEST_VISIBILITY_CONTROL.sql
CREATE TABLE cambridge_tests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  subject TEXT NOT NULL,
  -- ... other fields
);

-- Insert all tests (26 tests + any new ones)
INSERT INTO cambridge_tests (...) VALUES
('cambridge-end-unit-4', 'End of Unit 4 Test', ...),
('cambridge-reading-25', 'Cambridge Reading Test 25', ...),
-- ... all tests in one place
```

**Benefits:**
✅ Single source of truth for all test metadata
✅ Add new tests by inserting into `cambridge_tests` table
✅ Visibility manager automatically shows new tests
✅ No frontend code changes needed for new tests
✅ Scalable to hundreds of tests

## Migration Details

### New Table: `cambridge_tests`
Stores the catalog of all available Cambridge tests.

```sql
CREATE TABLE cambridge_tests (
  id TEXT PRIMARY KEY,                    -- e.g., 'cambridge-reading-25'
  name TEXT NOT NULL,                     -- e.g., 'Cambridge Reading Test 25'
  description TEXT,                       -- Test description
  duration TEXT,                          -- e.g., '45 min'
  total_questions INTEGER,                -- Number of questions
  difficulty TEXT,                        -- 'Beginner', 'Intermediate', 'Advanced'
  category TEXT,                          -- 'Reading', 'Listening', 'Grammar', etc
  subject TEXT NOT NULL,                  -- 'English stage 9', 'AS Chemistry'
  test_url TEXT NOT NULL,                 -- URL to test content
  requires_marking BOOLEAN DEFAULT FALSE, -- True if teacher needs to mark
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

### New RPC Function: `get_all_cambridge_tests()`
Returns all tests for a grade/subject with the teacher's visibility settings.

```sql
SELECT * FROM get_all_cambridge_tests(8, 'English stage 9');
```

**Returns:**
| test_id | test_name | description | ... | is_visible |
|---------|-----------|-------------|-----|-----------|
| cambridge-end-unit-4 | End of Unit 4 Test | ... | true |
| cambridge-reading-25 | Cambridge Reading Test 25 | ... | false |

## Frontend Updates Needed

### TeacherPortal.tsx
Replace hardcoded test list with RPC call:

```typescript
// OLD: Hardcoded list
const ENGLISH_TESTS = [
  { id: 'cambridge-end-unit-4', ... },
  // ...
];

// NEW: Dynamic query
const loadTests = async () => {
  const { data } = await supabase.rpc('get_all_cambridge_tests', {
    p_grade_level: 8,
    p_subject: 'English stage 9'
  });
  setTests(data);
};
```

The visibility manager UI remains the same - it just gets tests from the database instead of hardcoded lists.

## Adding New Tests

### Workflow
1. Add test to `CambridgeTestsHub.tsx` `AVAILABLE_TESTS` array
2. Insert test into `cambridge_tests` table:

```sql
INSERT INTO cambridge_tests (id, name, description, duration, total_questions, difficulty, category, subject, test_url, requires_marking) 
VALUES (
  'cambridge-new-test-id',
  'New Test Name',
  'Test description...',
  '45 min',
  40,
  'Intermediate',
  'Reading',
  'English stage 9',
  '/cambridge-tests/English%20stage%209/new_test.html',
  false
);
```

3. **Done!** The test automatically appears in:
   - Teacher visibility manager
   - `get_all_cambridge_tests()` RPC results
   - All teacher screens

## Current Test Coverage

**English Stage 9** (6 tests)
- cambridge-end-unit-4
- cambridge-reading-25
- cambridge-listening-1
- cambridge-writing-1
- cambridge-writing-2
- cambridge-end-unit-4-stage-8

**AS Chemistry** (20 tests)
- as-chemistry-atomic-structure-part-1/2
- as-chemistry-ch2-atoms-molecules-stoichiometry-part-1/2
- as-chemistry-ch3-chemical-bonding-part-1/2
- as-chemistry-ch4-states-of-matter-part-1/2
- as-chemistry-ch5-chemical-energetics-part-1/2
- as-chemistry-ch6-electrochemistry-part-1/2
- as-chemistry-ch7-equilibria-part-1/2
- as-chemistry-ch8-reaction-kinetics-part-1/2
- as-chemistry-ch9-chemical-periodicity-part-1/2
- as-chemistry-ch10-group-2-part-1/2

**Total:** 26 tests (easily extensible)

## Implementation Status

✅ **Database Schema:** `cambridge_tests` table created and populated
✅ **RPC Function:** `get_all_cambridge_tests()` ready to use
✅ **Data Population:** All 26 current tests inserted

⏳ **Next:** Update `TeacherPortal.tsx` to use `get_all_cambridge_tests()` instead of hardcoded lists

## Query Examples

### Get all tests for Grade 8 English
```sql
SELECT * FROM get_all_cambridge_tests(8, 'English stage 9');
```

### Get teacher's current visibility settings
```sql
SELECT * FROM get_teacher_test_visibility_settings();
```

### Toggle a test's visibility
```sql
SELECT toggle_cambridge_test_visibility('cambridge-reading-25', 'English stage 9', 8, true);
```

### Bulk show/hide tests
```sql
SELECT bulk_set_cambridge_test_visibility(
  ARRAY['cambridge-end-unit-4', 'cambridge-reading-25'],
  'English stage 9',
  8,
  true
);
```

## Maintenance Notes

- When adding new tests, update BOTH:
  1. `AVAILABLE_TESTS` in `CambridgeTestsHub.tsx` (for test content/questions)
  2. `cambridge_tests` table (for metadata)
  
- The frontend will automatically show the test in the visibility manager once it's in the database
- No code redeployment needed for new tests - just database update

