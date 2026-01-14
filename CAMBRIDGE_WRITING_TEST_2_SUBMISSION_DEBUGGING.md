# Cambridge Writing Test 2 - Submission & Data Loss Fix

## Problems Identified

### 1. **"Failed to Submit" Error**
- The custom Supabase client fetch implementation is throwing errors but not showing details
- The error is being swallowed: `return { data: null, error: err };`
- Student sees generic "Failed to submit" message

### 2. **Writing Lost on Refresh**
- Auto-save to localStorage runs **every 30 seconds** but after first failure
- When refresh happens, draft is lost because submission failed and localStorage wasn't updated
- The draft restore works, but only if the tab was never closed

## Root Causes

### Issue #1: Supabase Client Custom Implementation
The HTML file uses a custom Supabase client that:
- Makes raw fetch requests instead of using real Supabase SDK
- Has poor error handling
- Doesn't properly handle authentication

```javascript
// Current broken implementation
const supabaseClient = {
  from: function(table) {
    return {
      insert: async function(data) {
        try {
          const response = await fetch(...);
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || response.statusText);
          }
          return { data: null, error: null };
        } catch (err) {
          return { data: null, error: err }; // Silent failure!
        }
      }
    };
  }
};
```

### Issue #2: Missing Error Details
When error occurs, only shows: "❌ Failed to submit: Error. Please try again."  
Student doesn't know if it's:
- Network error
- Authentication error  
- Database constraint error
- RLS policy still blocking

## Solutions

### Solution 1: Add Better Error Logging
Update the HTML to:
1. Log the full error to browser console
2. Show more detailed error message to student
3. Save draft immediately before attempting submit

### Solution 2: Improve Auto-Save Mechanism
1. Save draft **immediately on any typing** (not just every 30s)
2. Save before submission attempt
3. Show "Draft saved" indicator

### Solution 3: Use Proper Supabase SDK
Replace custom fetch client with actual Supabase JavaScript library

## Implementation

### Option A: Quick Fix (Minimal Changes)
Add console logging and detailed error messages to the HTML file.

### Option B: Recommended Fix (Proper Supabase SDK)
Replace custom client with `@supabase/supabase-js` library.

---

## Step 1: Check Browser Console for Actual Error

Have the student:
1. Open **Developer Tools** (F12 or Right-click → Inspect)
2. Go to **Console** tab
3. Try submitting again
4. Look for red error message
5. Share the error text

**Common errors you might see:**
- `CORS error` → Server blocked the request
- `401 Unauthorized` → Authentication issue
- `403 Forbidden` → RLS policy still blocking
- `400 Bad Request` → Invalid data format
- `500 Internal Server Error` → Database error

---

## Step 2: Immediate Workaround

While we investigate, tell the student:
1. **Before closing tab**: Copy their answers to a text file
2. **If they lose work**: Reload page → Click "Cambridge Writing Test 2" → Draft should restore
3. **If draft doesn't restore**: Paste from text file

---

## Step 3: Apply Recommended Fix

I'll create an updated `cambridge_writing_test_2_FIXED.html` that:
1. ✅ Adds better error logging
2. ✅ Auto-saves on every keystroke
3. ✅ Shows detailed error messages
4. ✅ Includes proper error handling
5. ✅ Uses improved Supabase client code

---

## What I Need From You

**To diagnose the real error:**

Ask the student to:
1. Open F12 Console
2. Try submitting
3. Paste the **exact error message** from the console

**Most likely causes:**
- RLS policy fix didn't actually work (need to verify in Supabase)
- Supabase URL/API key not configured correctly
- Network/CORS issue
- The `answers` JSONB field needs a constraint removed

**To verify RLS was actually fixed:**
1. Go to Supabase SQL Editor
2. Run this query:
   ```sql
   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'quiz_scores';
   ```
3. Look for policies with `INSERT` — should say `Anyone can submit quiz scores`
4. If you still see `Authenticated users` → RLS fix didn't apply properly

---

## Next Steps

Once you get the browser error message, we can:
1. ✅ Fix the actual root cause
2. ✅ Test locally
3. ✅ Verify student can submit
4. ✅ Verify draft auto-save works
