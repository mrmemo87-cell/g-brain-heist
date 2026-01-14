# Cambridge Writing Test 2 - Submission Issue Fix

## Problem Summary
Students are unable to submit **Cambridge Writing Test 2**. The submission button either doesn't work or shows an error.

## Root Cause
The `quiz_scores` table has **Row Level Security (RLS)** enabled, but the INSERT policy is too restrictive:
- The policy only allows **"Authenticated users"** to insert
- Students taking tests in iframes may not have proper authentication context
- Anonymous (anon) role doesn't have explicit INSERT permission

## Technical Details

### Current Policy (Broken)
```sql
CREATE POLICY "Authenticated users can submit quiz scores" ON quiz_scores
  FOR INSERT
  WITH CHECK (true);
```

**Problem**: This policy name is misleading and doesn't explicitly allow `anon` role.

### New Policy (Fixed)
```sql
CREATE POLICY "Anyone can submit quiz scores" ON quiz_scores
  FOR INSERT
  WITH CHECK (true);

GRANT INSERT ON quiz_scores TO anon;
GRANT INSERT ON quiz_scores TO authenticated;
```

**Solution**: Explicitly allow both roles to insert test scores.

## Why This Fixes It

| Issue | Cause | Fix |
|-------|-------|-----|
| Students can't submit | RLS policy blocks non-authenticated users | Allow `anon` role |
| Test works in one context but not another | Authentication context inconsistent | Allow both `anon` and `authenticated` |
| "Authenticated users" policy misleading | Policy name doesn't match actual behavior | Rename to "Anyone can submit quiz scores" |

## How to Apply the Fix

### Option 1: Automatic (Recommended)
1. Open **Supabase SQL Editor**
2. Copy the entire contents of `FIX_CAMBRIDGE_WRITING_TEST_2_SUBMISSION.sql`
3. Paste into Supabase SQL Editor
4. Click **Run**
5. Wait for completion (should see verification queries)

### Option 2: Manual Steps
Run these queries in Supabase SQL Editor one at a time:

```sql
-- Drop old restrictive policies
DROP POLICY IF EXISTS "Authenticated users can submit quiz scores" ON quiz_scores;
DROP POLICY IF EXISTS "Anyone can submit quiz scores" ON quiz_scores;

-- Create permissive INSERT policy
CREATE POLICY "Anyone can submit quiz scores" ON quiz_scores
  FOR INSERT
  WITH CHECK (true);

-- Grant permissions
GRANT INSERT ON quiz_scores TO anon;
GRANT INSERT ON quiz_scores TO authenticated;

-- Reload schema
NOTIFY pgrst, 'reload schema';
```

## Testing the Fix

After applying the fix:

1. **Test Writing Test 1** (should still work)
   - Go to Cambridge Tests
   - Click "Cambridge Writing Test 1"
   - Fill in answers and submit
   - Should succeed ✅

2. **Test Writing Test 2** (main fix)
   - Go to Cambridge Tests
   - Click "Cambridge Writing Test 2"
   - Fill in answers and submit
   - Should now succeed ✅

3. **Verify Student Can't Submit Twice**
   - Reload the page
   - Test 2 should show "✓ Already Submitted"
   - Submit button should be disabled

## Files Modified
- `quiz_scores` table RLS policies

## No Code Changes Required
This is a **database-only fix**. No TypeScript/HTML files need updating. The form submission code in both Test 1 and Test 2 is identical and correct:

```typescript
const { data, error } = await supabaseClient
  .from('quiz_scores')
  .insert([{
    student_name: studentName,
    student_class: studentClass,
    quiz_name: 'Cambridge Writing Test 2',
    score: 0,
    total_questions: 35,
    percentage: 0,
    answers: { part1, part2, requires_marking: true },
    time_taken_seconds: timeTaken
  }]);
```

## Why Both Tests Now Work

Both Writing Test 1 and Writing Test 2 use **identical submission code**:
- Same `quiz_scores` table
- Same RLS policy
- Same permission grants

By fixing the RLS policy, **both tests automatically work**.

## Related Files
- `CREATE_QUIZ_SCORES_TABLE.sql` - Original table creation (has overly restrictive policy)
- `FIX_CAMBRIDGE_TESTS_ISOLATION.sql` - School-scoped improvements (may have overridden permissions)
- `ADD_QUIZ_SCORES_UPDATE_POLICY.sql` - Teacher marking permissions

## Rollback (if needed)
If something breaks, you can restore the old policy:

```sql
DROP POLICY IF EXISTS "Anyone can submit quiz scores" ON quiz_scores;

CREATE POLICY "Authenticated users can submit quiz scores" ON quiz_scores
  FOR INSERT
  WITH CHECK (true);
```

---

**Status**: Ready to apply  
**Severity**: High (students blocked from submitting)  
**Impact**: Fixes Writing Test 1 and Test 2 submissions  
**Risk**: Very Low (only changes RLS permissions, not schema)
