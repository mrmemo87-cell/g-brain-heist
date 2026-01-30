# Fix: Achievement View Student Results Errors

## Issues Fixed

This fix addresses three critical issues in the Achievement View:

### 1. ❌ GET student_assignment_results 400 (Bad Request)
**Error:** `GET .../student_assignment_results?select=id%2Caccuracy%2Ccompleted_at&student_id=eq...`

**Cause:** Missing or incomplete RLS policies preventing authenticated users from querying their own assignment results.

**Fix:** Added comprehensive SELECT, INSERT, and UPDATE RLS policies for `student_assignment_results` table.

### 2. ❌ rpc_check_achievements 400 (Bad Request)  
**Error:** `Direct XP/level updates are not allowed. Use RPCs.`

**Cause:** The `rpc_check_achievements` function was triggering XP update restrictions.

**Fix:** Updated the function to:
- Use `SECURITY DEFINER` properly
- Avoid any XP/level updates (read-only checks)
- Insert achievements without triggering update policies
- Handle assignment-based achievements correctly

### 3. ❌ Crazy Percentages in Assignment Grades
**Error:** Assignment grades showing incorrect percentages like 5000% or random values

**Cause:** Frontend was calculating `(assignment.score / assignment.total_questions) * 100`, but:
- `score` is the **mission score** (points), not a count
- `accuracy` is **already a percentage** (0-100)

**Fix:** Updated AchievementView.tsx to use `assignment.accuracy` directly instead of recalculating.

---

## How to Apply

### Step 1: Run SQL Migration
1. Open **Supabase Dashboard** → **SQL Editor**
2. Open the file: `FIX_ACHIEVEMENT_STUDENT_RESULTS_ERRORS.sql`
3. Copy the entire contents
4. Paste into SQL Editor
5. Click **Run**

Expected output:
```
✅ Fixed student_assignment_results RLS policies
✅ Fixed rpc_check_achievements to avoid XP conflicts
⚠️  Remember: accuracy is already a percentage (0-100)
⚠️  Frontend should use assignment.accuracy, NOT (score/total)*100
```

### Step 2: Frontend Changes (Already Applied)
The following file has been updated:
- `components/AchievementView.tsx` - Fixed percentage calculations

Changes made:
```typescript
// ❌ BEFORE (WRONG):
const scorePercent = assignment.total_questions > 0 
  ? Math.round((assignment.score / assignment.total_questions) * 100) 
  : 0;

// ✅ AFTER (CORRECT):
const scorePercent = assignment.accuracy || 0;
```

### Step 3: Verify the Fix
1. **Test Direct Query:**
   ```sql
   -- Run in Supabase SQL Editor
   SELECT 
     assignment_id,
     correct,
     incorrect,
     accuracy,  -- Should be 0-100 (percentage)
     score,     -- Mission score (points)
     completed_at
   FROM student_assignment_results
   WHERE student_id = auth.uid()
   LIMIT 5;
   ```

2. **Test RLS Policies:**
   ```sql
   -- Should return 3 policies
   SELECT 
     policyname,
     cmd AS command
   FROM pg_policies 
   WHERE tablename = 'student_assignment_results';
   ```

3. **Test in Frontend:**
   - Login as a student
   - Navigate to **Achievements** view
   - Check that assignment grades show correct percentages (0-100%)
   - Verify no console errors about `student_assignment_results` or `rpc_check_achievements`

---

## Technical Details

### Database Schema
```sql
student_assignment_results (
  id uuid PRIMARY KEY,
  student_id uuid,
  assignment_id uuid,
  correct INT,          -- Number of correct answers
  incorrect INT,        -- Number of incorrect answers
  accuracy INT,         -- Percentage 0-100 ← USE THIS
  score INT,            -- Mission points earned (NOT a percentage)
  time_taken_seconds INT,
  completed_at TIMESTAMPTZ
)
```

### RLS Policies Created
1. **student_assignment_results_select** - Students view own + teachers view their assignments
2. **student_assignment_results_insert** - Students insert own results
3. **student_assignment_results_update** - Students update own results

### Updated Functions
- `rpc_check_achievements()` - Now reads stats without triggering XP policies

---

## Verification Checklist

✅ Run SQL migration without errors  
✅ Verify RLS policies exist (should see 3 policies)  
✅ Test student can view their assignment results  
✅ Test achievement view loads without errors  
✅ Verify percentages are in 0-100% range (not 5000%+)  
✅ Verify rpc_check_achievements executes without XP errors  

---

## Rollback (If Needed)

If something goes wrong, you can rollback the RLS policies:

```sql
-- Remove new policies
DROP POLICY IF EXISTS "student_assignment_results_select" ON student_assignment_results;
DROP POLICY IF EXISTS "student_assignment_results_insert" ON student_assignment_results;
DROP POLICY IF EXISTS "student_assignment_results_update" ON student_assignment_results;

-- Re-enable RLS
ALTER TABLE student_assignment_results ENABLE ROW LEVEL SECURITY;
```

For frontend rollback, use git:
```bash
git checkout HEAD -- components/AchievementView.tsx
```

---

## Common Questions

**Q: Why was the percentage wrong?**  
A: The code was dividing `score` (mission points) by `total_questions` (number of questions), treating mission points as if they were correct answer counts. The `accuracy` field already stores the correct percentage.

**Q: Will old assignment results still work?**  
A: Yes! The SQL migration doesn't modify existing data, only adds policies.

**Q: What if I see "Direct XP/level updates" error?**  
A: Make sure you ran the SQL migration which updates `rpc_check_achievements` to avoid XP update triggers.

---

## Support

If you encounter issues:
1. Check browser console for specific error messages
2. Verify SQL migration ran successfully (check for ✅ messages)
3. Confirm you're logged in as a student with completed assignments
4. Check Supabase logs for RLS policy violations

**Last Updated:** January 30, 2026  
**Files Modified:**
- `FIX_ACHIEVEMENT_STUDENT_RESULTS_ERRORS.sql` (new)
- `components/AchievementView.tsx` (updated)
