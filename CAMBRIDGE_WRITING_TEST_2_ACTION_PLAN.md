# Cambridge Writing Test 2 - What to Do Next

## For the Student (to test the fix)

### Step 1: Clear Browser Cache
1. Press **Ctrl + Shift + Delete** (or Cmd + Shift + Delete on Mac)
2. Select "All time"
3. Check "Cached images and files"
4. Click "Clear data"

### Step 2: Test the Fix
1. Go to Cambridge Tests → Cambridge Writing Test 2
2. **Start typing** → You should see "Draft restored" message (if old draft exists)
3. Type your answers
4. **Keep typing** → Every few seconds, check Console (F12) for "💾 Draft auto-saved" message
5. **Close the tab completely**
6. **Reopen** → Your writing should reappear automatically
7. Try **submitting** → Should either succeed or show detailed error

### Step 3: Report the Error
If submission fails:
1. Open **F12** → **Console** tab
2. **Submit again**
3. Look for red error message starting with `❌ HTTP` or `💥`
4. **Copy the error message** and send to teacher/admin

---

## For the Teacher/Admin (to diagnose)

### First, Check if RLS Fix Applied
1. Go to **Supabase Dashboard**
2. Open **SQL Editor**
3. Run this query:
   ```sql
   SELECT policyname, cmd FROM pg_policies 
   WHERE tablename = 'quiz_scores' 
   ORDER BY policyname;
   ```

**You should see:**
- `Anyone can submit quiz scores` (INSERT)
- `Anyone can view scores` (SELECT)

**If you see:**
- `Authenticated users can submit quiz scores` → The RLS fix didn't apply! Run it again.

### Second, Check Permissions
```sql
SELECT * FROM information_schema.table_privileges 
WHERE table_name = 'quiz_scores' 
ORDER BY grantee;
```

**You should see:**
- `anon` role with `INSERT` privilege
- `anon` role with `SELECT` privilege
- `authenticated` role with `INSERT` privilege
- `authenticated` role with `SELECT` privilege

### Third, Test Submission Directly (Backend Check)
In Supabase SQL Editor, try inserting a test row:
```sql
INSERT INTO quiz_scores (
  student_name,
  student_class,
  quiz_name,
  score,
  total_questions,
  percentage,
  answers
) VALUES (
  'Test Student',
  '9A',
  'Cambridge Writing Test 2',
  0,
  35,
  0,
  jsonb_build_object(
    'part1', 'Test answer 1',
    'part2', 'Test answer 2',
    'requires_marking', true
  )
);
```

- If this works → RLS is fine, problem is with frontend/auth
- If this fails → There's a database constraint or trigger blocking inserts

---

## What I Changed in the HTML File

### 1. **Enhanced Supabase Client**
Added detailed logging to see exact errors:
```javascript
console.log('📤 Attempting to submit to:', table);
console.log('🔑 Using token:', accessToken ? 'authenticated' : 'anonymous');
console.log('✅ Response status:', response.status);
```

### 2. **Better Error Messages**
Detects error type and gives helpful advice:
```javascript
if (error.message?.includes('403')) {
  statusDiv.textContent = '❌ Failed to submit: Permission denied. Contact your teacher.';
}
```

### 3. **Instant Auto-Save Function**
Saves draft 1 second after user stops typing:
```javascript
function autoSaveDraft() {
  autoSaveTimeout = setTimeout(() => {
    localStorage.setItem(`${QUIZ_ID}_draft`, JSON.stringify(draftData));
    console.log('💾 Draft auto-saved');
  }, 1000);
}
```

### 4. **Emergency Saves**
Saves draft before AND after submission attempts:
- Before: `localStorage.setItem(...) // Save draft before submit`
- After failure: `localStorage.setItem(...) // Save draft after failure`

### 5. **Textarea Updates**
Added `autoSaveDraft()` to textarea `oninput`:
```html
<textarea oninput="updateWordCount(1); startTimer(); autoSaveDraft();"></textarea>
```

---

## If Still Getting "Failed to Submit"

### Most Likely Causes (in order):

1. **RLS Policy Fix Didn't Apply**
   - ✅ Run SQL fix again
   - ✅ Verify with diagnostic query above

2. **Browser Cache Issue**
   - ✅ Clear cache (Ctrl + Shift + Delete)
   - ✅ Hard refresh (Ctrl + F5)

3. **Authentication Context Lost**
   - ✅ Have student log out and back in
   - ✅ Clear localStorage: `localStorage.clear()` in console

4. **Supabase Configuration Issue**
   - ✅ Check `.env` has correct `VITE_SUPABASE_URL`
   - ✅ Check `.env` has correct `VITE_SUPABASE_ANON_KEY`
   - ✅ Verify these match Supabase Dashboard settings

5. **Database Constraint Error**
   - ✅ Check if `quiz_scores` table has any `CHECK` constraints
   - ✅ Check if there are any triggers that might reject inserts
   - ✅ Run test insert above to verify

---

## How to Verify Fix is Working

### Test 1: Draft Auto-Save ✅
1. Open page
2. Type in Part 1: "This is a test sentence with at least 10 words here"
3. Wait 2 seconds
4. Open Console (F12) → should see "💾 Draft auto-saved"
5. Close browser tab
6. Reopen page → text should reappear

### Test 2: Error Logging ✅
1. Open Console (F12)
2. Attempt to submit
3. Should see detailed messages in console (even if submission fails)
4. Should see helpful error message in red box on page

### Test 3: Submission Success ✅
1. Fill both parts
2. Submit
3. If RLS fix worked → "✅ Submitted successfully!"
4. If not → Detailed error message + console logs

---

## Emergency Workaround (While Debugging)

If student is losing their work:

**For Student:**
1. Copy your answers to a text file on your computer
2. Keep this file open while taking the test
3. If page breaks, paste from the file back into the test
4. Save frequently to text file

**Better Solution:**
Once this is fixed, auto-save will handle this automatically.

---

## Summary

✅ **HTML file updated** with better error logging and auto-save  
✅ **SQL fix provided** to update RLS policies  
❓ **Need to verify** RLS fix actually applied  
❓ **Need to test** with real student  
❓ **Need to check console** for actual error message  

**Next step:** Have student test and share console error, or run diagnostic SQL queries above.
