# CH2 Test Visibility Issue - Database Diagnosis

**Date:** February 9, 2026  
**Issue:** Students can see "AS Chemistry Ch2 (Atoms, molecules and stoichiometry)" Part 1 & 2 tests even though they should be hidden

---

## Database Query Results

### 1. Cambridge Tests Catalog
✓ **Both Ch2 tests exist in the `cambridge_tests` table:**
- `as-chemistry-ch2-atoms-molecules-stoichiometry-part-1`
- `as-chemistry-ch2-atoms-molecules-stoichiometry-part-2`

### 2. Test Visibility Records
⚠️ **NO visibility records found for these tests in `cambridge_test_visibility` table**

**For Ch2 tests specifically:** 0 records  
**For ALL Chemistry tests:** 0 records  

---

## Root Cause Analysis

### Why Students Can See Hidden Tests

The visibility system has a **fallback mechanism** that's being triggered:

```typescript
// From CambridgeTestsHub.tsx lines 664-672
const loadVisibleTests = async () => {
  try {
    const { data, error } = await supabase.rpc('get_visible_cambridge_tests_for_student', {
      p_student_grade: profile.grade,
      p_school_id: profile.school_id
    });

    if (error) {
      console.error('Error fetching visible tests:', error);
      // ❌ FALLBACK: Show all tests on error
      setVisibleTestIds(new Set(AVAILABLE_TESTS.map(t => t.id)));
      return;
    }

    if (!data || data.length === 0) {
      // No visibility settings found - show no tests
      setVisibleTestIds(new Set());
    } else {
      // Show only visible tests
      const visibleIds = new Set(data.map((row) => row.test_id));
      setVisibleTestIds(visibleIds);
    }
  } catch (err) {
    // ❌ FALLBACK: Show all tests on error
    setVisibleTestIds(new Set(AVAILABLE_TESTS.map(t => t.id)));
  }
};
```

### What's Actually Happening

1. **No visibility settings exist** - The `cambridge_test_visibility` table has 0 records for Chemistry tests
2. **RPC returns empty** - `get_visible_cambridge_tests_for_student()` returns no data
3. **Frontend logic problem** - There are two possible paths:
   - **Path A (Correct):** If `data.length === 0` → `setVisibleTestIds(new Set())` (show no tests) ✓
   - **Path B (Error Fallback):** If RPC has an error → Show all tests as fallback ❌

### Why This Happens

The visibility system assumes:
- **Either** teachers have explicitly configured visibility (records exist in DB)
- **Or** the system hasn't been set up yet (graceful fallback shows all tests)

**But there's a disconnect:**
- Tests exist in `cambridge_tests` catalog
- No visibility records in `cambridge_test_visibility` 
- **Solution is ambiguous:** Should these be visible or hidden by default?

---

## Solution Options

### Option 1: Create Visibility Records (RECOMMENDED)
**Have a teacher explicitly hide these tests via Teacher Portal:**

1. Log in as a teacher with Chemistry Grade 11 access
2. Go to **Teacher Portal** → **Cambridge Tests**
3. Click **"👁️ Test Visibility"** button (top right)
4. Find **"AS Chemistry Ch2 (Atoms, molecules and stoichiometry) (Part 1)"**
5. Click **"🔒 Hidden"** button to hide it
6. Repeat for Part 2
7. Click **"Done"**

**Result:** This creates `cambridge_test_visibility` records with `is_visible = FALSE`

**When this works:** The RPC will correctly return empty data, and students won't see these tests.

### Option 2: Create Visibility Records via SQL (FASTER)
**Run this SQL in Supabase to hide the Ch2 tests:**

```sql
-- First, get a teacher ID (you'll need to find one from your database)
-- Then insert visibility records to hide Ch2 tests:

INSERT INTO cambridge_test_visibility (
  school_id,
  teacher_user_id,
  test_id,
  subject,
  grade_level,
  is_visible,
  created_at,
  updated_at
)
SELECT
  u.school_id,
  u.id as teacher_user_id,
  'as-chemistry-ch2-atoms-molecules-stoichiometry-part-1'::text,
  'Chemistry'::text,
  11::integer,
  false::boolean,
  NOW(),
  NOW()
FROM users u
WHERE u.role = 'teacher' 
  AND u.school_id IS NOT NULL
ON CONFLICT (school_id, teacher_user_id, test_id, subject, grade_level)
DO UPDATE SET is_visible = false, updated_at = NOW();

-- Repeat for Part 2
INSERT INTO cambridge_test_visibility (
  school_id,
  teacher_user_id,
  test_id,
  subject,
  grade_level,
  is_visible,
  created_at,
  updated_at
)
SELECT
  u.school_id,
  u.id as teacher_user_id,
  'as-chemistry-ch2-atoms-molecules-stoichiometry-part-2'::text,
  'Chemistry'::text,
  11::integer,
  false::boolean,
  NOW(),
  NOW()
FROM users u
WHERE u.role = 'teacher'
  AND u.school_id IS NOT NULL
ON CONFLICT (school_id, teacher_user_id, test_id, subject, grade_level)
DO UPDATE SET is_visible = false, updated_at = NOW();
```

### Option 3: Fix the Fallback Logic (CODE CHANGE)
**Modify the frontend to NOT show all tests on error:**

In [CambridgeTestsHub.tsx#L664-L680](CambridgeTestsHub.tsx#L664-L680):

Change the error handler from showing all tests to showing NO tests:

```typescript
if (error) {
  console.error('Error fetching visible tests:', error);
  // Changed: Don't show all tests on error
  // Instead, show nothing (conservative approach)
  setVisibleTestIds(new Set());
  return;
}
```

---

## Recommendation

**Use Option 1 or Option 2** to create explicit visibility records.

**Why not Option 3?**
- Option 3 just hides the symptom
- The real issue is that no visibility settings exist for Chemistry tests
- Once Option 1/2 is done, the system works correctly even if there are errors

---

## Verification Steps

After implementing the solution:

1. **Check database:**
   ```sql
   SELECT * FROM cambridge_test_visibility
   WHERE test_id LIKE '%ch2-atoms-molecules-stoichiometry%';
   ```
   Should show 2 records with `is_visible = FALSE`

2. **Test as student:**
   - Log in as a Grade 11 student
   - Go to Cambridge Tests Hub
   - Ch2 tests should NOT appear in the list

3. **Check frontend:**
   - Browser console should show `visibleTestIds` set with appropriate tests (excluding Ch2)

---

## Summary

| Aspect | Status |
|--------|--------|
| Tests in catalog | ✓ YES (2 tests found) |
| Visibility records | ✗ NONE (0 records) |
| Default behavior | ❌ Shows all tests (fallback) |
| **Why students see them** | **No visibility configuration exists** |
| **How to fix** | **Create visibility records** |

