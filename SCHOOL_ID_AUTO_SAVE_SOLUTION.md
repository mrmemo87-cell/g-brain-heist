# Auto-Save school_id for Authenticated Cambridge Tests ✅

## Problem Solved

When authenticated students (logged in through the game) submitted Cambridge tests, the `school_id` was NOT being saved to the `quiz_scores` table. This made their submissions invisible to teachers/admins because the access control (RLS) requires `school_id` to be present.

## Root Cause

The trigger-based approach (`quiz_scores_set_school_id`) relied on matching student names to usernames in the database. For anonymous/unauthenticated submissions, this worked differently, but for authenticated students, we already have the user's ID in `auth.uid()` - so why not use it directly?

## The Solution

**Simple: Fetch `school_id` directly from the authenticated user's profile at submission time.**

All authenticated Cambridge tests now:
1. Check if the user is authenticated with `supabaseClient.auth.getUser()`
2. If authenticated, fetch their `school_id` from the `users` table
3. Include `school_id` in the quiz submission using conditional spread syntax

### Code Pattern

```javascript
// Fetch school_id from authenticated user
let schoolId = null;
try {
  const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
  if (user && !authError) {
    const { data: userData, error: userError } = await supabaseClient
      .from('users')
      .select('school_id')
      .eq('id', user.id)
      .single();
    
    if (userData && userData.school_id) {
      schoolId = userData.school_id;
      console.log('✅ Fetched school_id:', schoolId);
    }
  }
} catch (e) {
  console.log('ℹ️ Could not fetch school_id (student may be unauthenticated)');
}

// Include in submission (only if we have a school_id)
const { error } = await supabaseClient
  .from('quiz_scores')
  .insert([{
    student_name: studentName,
    student_class: studentClass,
    quiz_name: 'Your Test Name',
    score: score,
    total_questions: total,
    percentage: percentage,
    answers: answers,
    time_taken_seconds: timeTaken,
    ...(schoolId && { school_id: schoolId })  // ✅ Conditionally include
  }]);
```

## Tests Updated

✅ **Cambridge End of Unit 4 Test**
- File: `public/cambridge-tests/English stage 9/cambridge_end_unit_4_test.html`
- Status: Updated with school_id fetching

✅ **Cambridge Writing Test 1**
- File: `public/cambridge-tests/English stage 9/cambridge_writing_test_1.html`
- Status: Updated with school_id fetching

✅ **Cambridge Writing Test 2**
- File: `public/cambridge-tests/English stage 9/cambridge_writing_test_2.html`
- Status: Updated with school_id fetching

✅ **Cambridge Reading Test 25**
- File: `public/cambridge-tests/English stage 9/cambridge_reading_25_answer_form.html`
- Status: Updated with school_id fetching

## Why This Works

### For Authenticated Students (Logged In)
- They have `auth.uid()` available
- We can query their profile from the `users` table
- Their `school_id` is already stored there
- Result: ✅ `school_id` IS SAVED

### For Anonymous Students (Not Logged In)
- No `auth.uid()` available
- The try-catch silently handles the error
- `schoolId` remains `null`
- The `...(schoolId && {...})` spread syntax excludes it from the insert
- Result: ✅ Submission succeeds WITHOUT school_id (backward compatible)

### Error Handling
- All attempts to fetch school_id are wrapped in try-catch
- If anything fails, it logs a friendly message
- Submission continues regardless - never blocks on school_id lookup
- Students see the success message either way

## Console Output

Students will see in DevTools Console:
```
✅ Fetched school_id: 550e8400-e29b-41d4-a716-446655440000
```

Or if not authenticated:
```
ℹ️ Could not fetch school_id (student may be unauthenticated)
```

## Database Impact

### Before Fix
```
quiz_scores record:
{
  student_name: "Ahmed Ali",
  student_class: "10A",
  quiz_name: "Cambridge Writing Test 2",
  school_id: NULL  ❌ Missing!
}
```

### After Fix
```
quiz_scores record:
{
  student_name: "Ahmed Ali",
  student_class: "10A",
  quiz_name: "Cambridge Writing Test 2",
  school_id: 550e8400-e29b-41d4-a716-446655440000  ✅ Saved!
}
```

## Teachers/Admins Can Now See Results

With `school_id` properly saved, the RLS policies work:

✅ Teachers see results from their school
✅ Admins see results from their school
✅ Results appear in "Cambridge Test Reports" panels
✅ CSV export includes all submissions

## Testing

To verify the fix:

1. **Login as a student** in the game
2. **Take Cambridge Writing Test 2** (or any updated test)
3. **Submit the test**
4. **Check browser console** - should see "✅ Fetched school_id"
5. **Go to Teacher Portal** → Cambridge Tests → Load Reports
6. **Verify the submission appears** in the reports list

## Next Steps (If Needed)

If other Cambridge tests also have authenticated users, apply the same pattern:

1. Find the `.insert()` call in the submission code
2. Add the school_id fetching block before the insert
3. Add `...(schoolId && { school_id: schoolId })` to the insert payload

Pattern works for:
- Reading tests
- Listening tests
- Writing tests
- Grammar/Vocabulary tests
- Any test where users are authenticated

---

**Status**: ✅ COMPLETE
**Tested**: Cambridge Writing Test 2, End of Unit 4 Test, Reading Test 25, Writing Test 1
**Backward Compatible**: Yes - works with both authenticated and anonymous submissions
