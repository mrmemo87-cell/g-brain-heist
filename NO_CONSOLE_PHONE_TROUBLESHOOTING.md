# Cambridge Writing Test 2 - Phone Troubleshooting (No Console Needed)

## Quick Questions (Ask the Student Over Phone)

### Q1: Browser Cache
**Ask:** "Have you cleared your browser cache since we made the fix?"

**If NO:**
1. Press Ctrl+Shift+Delete (all at once)
2. Check "Cookies and cached data"
3. Click Clear
4. Reload the page
5. Try submitting again

**If YES:** → Go to Q2

---

### Q2: Are They Using the Right Test?
**Ask:** "Are you opening 'Cambridge Writing Test 2' or 'Cambridge Writing Test 1'?"

**If Test 1:** → Try Test 2 instead (Test 1 might have different RLS settings)

**If Test 2:** → Go to Q3

---

### Q3: Can They Submit Test 1?
**Ask:** "Can you try Cambridge Writing Test 1 instead? Does that submit successfully?"

**If YES (Test 1 works, Test 2 doesn't):**
→ Test 2 file has a different issue, not the RLS fix

**If NO (Neither works):**
→ It's a general RLS/authentication issue

---

### Q4: Are They Logged In?
**Ask:** "When you opened the page, did it show 'Logged in as [your name]' or did you have to type your name?"

**If they had to TYPE their name:**
→ They're NOT authenticated, using anon token only

**If it said "Logged in as":**
→ They ARE authenticated

---

## Immediate Fixes (In Order)

### Fix #1: Clear Everything and Reload (Do This FIRST)
1. Clear browser cache (Ctrl+Shift+Delete)
2. Close the page completely
3. Close browser completely
4. Reopen browser
5. Go back to Cambridge Writing Test 2
6. Try submitting

**If this works** → Done! Problem was cached old version.

**If not** → Do Fix #2

---

### Fix #2: Try Different Browser (or Private/Incognito Mode)
**Ask:** "Can you try opening the page in a different browser? Or try Private/Incognito mode?"

- Chrome: Ctrl+Shift+N (opens Incognito)
- Firefox: Ctrl+Shift+P (opens Private)
- Edge: Ctrl+Shift+InPrivate

Private mode doesn't use cache, so if it works there → cache issue confirmed.

**If it works in private mode** → Cache was the problem

**If it fails in private mode too** → Problem is deeper, go to Fix #3

---

### Fix #3: Database Issue
If they can't submit in private mode or fresh browser, the database itself might still be broken.

**What you (teacher/admin) need to do:**
1. Open Supabase SQL Editor
2. Run this query to see what's wrong:

```sql
-- What policies are blocking?
SELECT policyname, cmd FROM pg_policies 
WHERE tablename = 'quiz_scores' ORDER BY policyname;

-- Test if inserts work
INSERT INTO quiz_scores (student_name, student_class, quiz_name, score, total_questions, percentage, answers)
VALUES ('TEST_' || now()::text, 'TEST', 'Cambridge Writing Test 2', 0, 35, 0, '{"test":"test"}');

-- Did the INSERT work? If error shown, that's the problem.
```

If INSERT fails → There's a constraint/trigger blocking it
If INSERT succeeds but student still can't submit → It's an auth issue

---

## Quick Workarounds (While You Fix This)

### Workaround 1: Use Test 1
If Test 1 works but Test 2 doesn't, have the student use Test 1 instead temporarily.

### Workaround 2: Different Browser
If it works in a different browser, use that until you fix the cache issue.

### Workaround 3: Copy Their Answers
1. Student copies their writing to a text file
2. Try submitting again
3. If it fails, at least you have a backup of their answers
4. Once fixed, can re-enter and submit

---

## What You Need to Know

To debug this properly, you need:

1. **What the diagnostic showed:**
   - How many policies? (Should be 2)
   - Did the INSERT test work?

2. **Does Test 1 work?** (Yes/No)

3. **Are they authenticated or anonymous?** 
   - (Logged in as name / Had to type name)

4. **What browser/OS?**
   - Windows Chrome/Firefox/Edge/Safari?
   - Mac Chrome/Safari?
   - Mobile?

---

## Most Likely Root Cause

Based on "FIX APPLIED 3" showing:

**Most Likely:** 3 policies means 2 good ones + 1 old conflicting one

**Solution:** Delete the old policy

Run this in Supabase:
```sql
-- Delete old conflicting policies
DROP POLICY IF EXISTS "Authenticated users can submit quiz scores" ON quiz_scores;
DROP POLICY IF EXISTS "Anyone can view scores" ON quiz_scores;

-- Keep only these 2
CREATE POLICY IF NOT EXISTS "Anyone can submit quiz scores" ON quiz_scores
  FOR INSERT WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Anyone can view scores" ON quiz_scores
  FOR SELECT USING (true);

GRANT INSERT ON quiz_scores TO anon, authenticated;
GRANT SELECT ON quiz_scores TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
```

Then have student clear cache and reload.

---

## Summary

**Try these IN ORDER without console access:**

1. ✅ Clear cache (Ctrl+Shift+Delete)
2. ✅ Close and reopen browser
3. ✅ Try again
4. ✅ If fails, try private/incognito mode
5. ✅ If fails there too, run the "DELETE OLD POLICY" SQL above
6. ✅ Then have student try again

**Should resolve it in 10 minutes without needing console access.**
