# Technical Details: AS Chemistry Test Deleted State Handling

## Problem Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Student submits AS Chemistry test                           │
│ - Record inserted into quiz_scores table                    │
│ - localStorage set with quiz_submitted_${QUIZ_ID}           │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Admin deletes submission                                    │
│ - Record deleted from quiz_scores table                     │
│ - But student's localStorage still has submission data      │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Student opens test again                                    │
│ 1. checkPreviousSubmission() finds localStorage entry       │
│ 2. Sets hasSubmitted = true, disables inputs                │
│ 3. Calls checkScoreReleaseStatus()                          │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ ❌ OLD BEHAVIOR (BUG):                                      │
│ checkScoreReleaseStatus() queries database                  │
│ - Query returns error (no record found)                     │
│ - OLD CODE: Shows "waiting for teacher..."                  │
│ - Student thinks test is pending release                    │
│ - Student cannot retake test                                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ ✅ NEW BEHAVIOR (FIXED):                                    │
│ checkScoreReleaseStatus() queries database                  │
│ - Query returns error (no record found)                     │
│ - NEW CODE: Clears localStorage                             │
│ - Resets UI (hasSubmitted=false, re-enable inputs)          │
│ - Shows "▶️ Start Test" button                              │
│ - Student can retake the test                               │
└─────────────────────────────────────────────────────────────┘
```

## Code Changes

### Before Fix
Location: `checkScoreReleaseStatus()` function in all Chemistry HTML files

```javascript
async function checkScoreReleaseStatus(savedData) {
  const scoreDiv = document.getElementById('score');
  const studentName = document.getElementById('studentName')?.value || 
                      localStorage.getItem(`quiz_student_${QUIZ_ID}`) || '';
  
  try {
    const { data, error } = await supabaseClient
      .from('quiz_scores')
      .select('scores_released, score, total_questions, percentage, answers, time_taken_seconds')
      .eq('quiz_name', QUIZ_NAME)
      .eq('student_name', studentName)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .single();
    
    // ❌ BUG: When test is deleted, error is truthy
    if (error || !data) {
      scoreDiv.textContent = '📊 Score submitted. Waiting for teacher to release results.';
      scoreDiv.className = 'score-box pending';
      return; // ❌ Exits without clearing localStorage or resetting UI
    }
    
    if (data.scores_released) {
      // Show released score
    } else {
      // Show pending message
    }
  } catch (err) {
    console.error('Failed to check score release status:', err);
    scoreDiv.textContent = '📊 Score submitted. Waiting for teacher to release results.';
    scoreDiv.className = 'score-box pending';
  }
}
```

### After Fix
```javascript
async function checkScoreReleaseStatus(savedData) {
  const scoreDiv = document.getElementById('score');
  const studentName = document.getElementById('studentName')?.value || 
                      localStorage.getItem(`quiz_student_${QUIZ_ID}`) || '';
  
  try {
    const { data, error } = await supabaseClient
      .from('quiz_scores')
      .select('scores_released, score, total_questions, percentage, answers, time_taken_seconds')
      .eq('quiz_name', QUIZ_NAME)
      .eq('student_name', studentName)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .single();
    
    // ✅ FIX: When test is deleted, properly reset everything
    if (error || !data) {
      // Submission was deleted - reset UI to allow retake
      localStorage.removeItem(`quiz_submitted_${QUIZ_ID}`);
      localStorage.removeItem(`quiz_student_${QUIZ_ID}`);
      localStorage.removeItem(`quiz_class_${QUIZ_ID}`);
      
      // Reset UI state
      hasSubmitted = false;
      const submitBtn = document.getElementById('submitBtn');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Answers';
      }
      const statusDiv = document.getElementById('status');
      if (statusDiv) statusDiv.textContent = '';
      scoreDiv.style.display = 'none';
      
      // Re-enable all questions
      document.querySelectorAll('input').forEach(i => i.disabled = false);
      
      return; // ✅ Now properly cleaned up
    }
    
    if (data.scores_released) {
      // Show released score
    } else {
      // Show pending message
    }
  } catch (err) {
    console.error('Failed to check score release status:', err);
    scoreDiv.textContent = '📊 Score submitted. Waiting for teacher to release results.';
    scoreDiv.className = 'score-box pending';
  }
}
```

## Key Changes

### 1. localStorage Cleanup
```javascript
localStorage.removeItem(`quiz_submitted_${QUIZ_ID}`);
localStorage.removeItem(`quiz_student_${QUIZ_ID}`);
localStorage.removeItem(`quiz_class_${QUIZ_ID}`);
```
- Removes the cached submission data that was preventing retake
- Matches what `checkServerSubmission()` does when detecting deletion

### 2. UI State Reset
```javascript
hasSubmitted = false;
const submitBtn = document.getElementById('submitBtn');
if (submitBtn) {
  submitBtn.disabled = false;
  submitBtn.textContent = 'Submit Answers';
}
```
- Sets the global `hasSubmitted` flag to false
- Enables the submit button
- Restores button text from "✓ Submitted" to "Submit Answers"

### 3. Clear Feedback Messages
```javascript
const statusDiv = document.getElementById('status');
if (statusDiv) statusDiv.textContent = '';
scoreDiv.style.display = 'none';
```
- Removes any status messages
- Hides the score display box

### 4. Re-enable Input Fields
```javascript
document.querySelectorAll('input').forEach(i => i.disabled = false);
```
- Re-enables all question inputs that were locked after submission
- Allows student to answer questions fresh

## State Machine

### Before Fix (BROKEN)
```
NOT_SUBMITTED
    ↓ (Submit)
SUBMITTED (hasSubmitted=true, inputs disabled)
    ↓ (Admin deletes, student refreshes)
STUCK_IN_SUBMITTED_STATE ❌
    ↓
Shows "Waiting for teacher..." even though test is deleted
Cannot retake test
```

### After Fix (WORKING)
```
NOT_SUBMITTED
    ↓ (Submit)
SUBMITTED (hasSubmitted=true, inputs disabled)
    ↓ (Admin deletes, student refreshes)
DELETED_DETECTED_BY_ERROR ✅
    ↓ (checkScoreReleaseStatus detects missing record)
RESET_TO_NOT_SUBMITTED ✅
    ↓
Shows "▶️ Start Test" button
CAN_RETAKE_TEST ✅
    ↓ (Student clicks Start Test)
NOT_SUBMITTED (ready for new attempt)
```

## Related Initialization Code

### `checkPreviousSubmission()`
Called on page load to check localStorage for previous submission:
```javascript
function checkPreviousSubmission() {
  const saved = localStorage.getItem(`quiz_submitted_${QUIZ_ID}`);
  if (!saved) return;
  
  const data = JSON.parse(saved);
  hasSubmitted = true;
  document.querySelectorAll('input').forEach(i => i.disabled = true);
  
  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = '✓ Submitted';
  
  const status = document.getElementById('status');
  status.textContent = `You submitted this test on ${new Date(data.submittedAt).toLocaleString()}.`;
  
  const scoreDiv = document.getElementById('score');
  scoreDiv.style.display = 'block';
  
  // Check if score is released by teacher
  checkScoreReleaseStatus(data); // ← Calls fixed function
}
```

### `checkServerSubmission()`
Called after `checkPreviousSubmission()` to verify submission still exists:
```javascript
async function checkServerSubmission() {
  if (hasSubmitted) return; // Already submitted locally
  
  const name = document.getElementById('studentName')?.value.trim();
  if (!name) return;
  
  try {
    const { data, error } = await supabaseClient
      .from('quiz_scores')
      .select('submitted_at, scores_released, score, total_questions, percentage')
      .eq('quiz_name', QUIZ_NAME)
      .eq('student_name', name)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      // Submission was deleted - reset UI to allow retake
      localStorage.removeItem(`quiz_submitted_${QUIZ_ID}`);
      localStorage.removeItem(`quiz_student_${QUIZ_ID}`);
      localStorage.removeItem(`quiz_class_${QUIZ_ID}`);
      
      // Reset UI state (same as our fix!)
      hasSubmitted = false;
      const submitBtn = document.getElementById('submitBtn');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Answers';
      }
      const statusDiv = document.getElementById('status');
      if (statusDiv) statusDiv.textContent = '';
      const scoreDiv = document.getElementById('score');
      if (scoreDiv) scoreDiv.style.display = 'none';
      
      document.querySelectorAll('input').forEach(i => i.disabled = false);
      return;
    }

    // Submission still exists - proceed to verify
    localStorage.setItem(`quiz_submitted_${QUIZ_ID}`, JSON.stringify({...}));
    checkPreviousSubmission();
  } catch (err) {
    console.error('Failed to check previous submission from server:', err);
  }
}
```

The fix makes `checkScoreReleaseStatus()` handle deletion the same way as `checkServerSubmission()` - by resetting all UI state and localStorage.

## Testing Strategy

### Unit Test (per test file)
```javascript
// Test: Deleted submission shows Start Test button
1. localStorage.setItem(`quiz_submitted_${QUIZ_ID}`, '...')
2. Mock supabaseClient.from().select() to return { error: 'PGRST116' }
3. Call checkScoreReleaseStatus()
4. Assert: localStorage is empty
5. Assert: hasSubmitted === false
6. Assert: button text === 'Submit Answers'
7. Assert: scoreDiv.style.display === 'none'
```

### Integration Test
```javascript
// Test: Full flow with deletion
1. Load test page
2. Submit test
3. Verify submission in database
4. Delete submission via admin portal
5. Student refreshes page
6. Assert: Shows "▶️ Start Test" button
7. Student can submit again successfully
```

### Manual Test
```
1. Student: Take Chemistry test → Submit
2. Admin: Verify submission appears in reports
3. Teacher: Release score
4. Student: Verify score is visible
5. Admin: Delete submission
6. Student: Refresh page
7. Verify: Shows "▶️ Start Test" button
8. Student: Retake test successfully
```

## Performance Impact
- **None**: Function logic only changes what happens when record is NOT found
- No additional database queries
- Clearing localStorage is O(1) per key (3 keys max)
- DOM selection and manipulation is minimal and only on error path
- Changes are only executed when deletion is detected

## Backward Compatibility
- **100% Compatible**: Only changes error handling behavior
- When test exists and is released: Works exactly same as before ✓
- When test exists but not released: Works exactly same as before ✓
- When test is deleted: Now works correctly instead of showing false "waiting" state ✓

## Security Considerations
- localStorage operations: Safe (reading from own domain storage)
- No new API calls or permissions required
- No changes to RLS policies or authentication
- Client-side only changes - no backend dependencies
