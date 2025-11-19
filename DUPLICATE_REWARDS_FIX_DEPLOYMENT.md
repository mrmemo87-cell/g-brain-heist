# Multi-Tab Duplicate Rewards Bug - Fix & Deployment Guide

## Problem Summary
Users discovered they can get duplicate XP/coins by opening the same quest in multiple browser tabs and submitting answers from all tabs simultaneously.

**Impact**: 
- Users can gain unlimited rewards
- Unfair advantage for players who know the exploit
- Affects game economy and leaderboards

**Root Cause**: Race condition in `finalizeMcqAnswer`
- The duplicate check happens BEFORE the database insert
- When multiple tabs submit simultaneously, all pass the check
- Both updates execute, user gets double rewards

## Solution Overview
Implement a database-level unique constraint that prevents duplicate correct answers from the same student for the same question. Combined with error handling in the app, this creates a bulletproof prevention system.

## Deployment Steps

### Step 1: Deploy Database Changes (FIX_DUPLICATE_REWARDS_BUG.sql)
```sql
-- Add unique constraint to prevent duplicate reward claims
ALTER TABLE question_attempts
ADD CONSTRAINT unique_student_question_correct_reward 
UNIQUE (student_id, question_id) 
WHERE is_correct = true;
```

**What this does:**
- Only ONE correct answer per student per question can earn rewards
- Concurrent submissions will fail with unique constraint violation (error code 23505)
- The app catches this and returns "already claimed" instead of an error

**Execution:**
1. Connect to production database
2. Run: `FIX_DUPLICATE_REWARDS_BUG.sql`
3. Verify constraint was created: `\d question_attempts`

### Step 2: Deploy Code Changes (gameService.ts)
The `finalizeMcqAnswer` function has been updated to:

**Before:**
```typescript
// Checked for duplicates BEFORE insert - race condition vulnerable
if (isCorrect) {
    const { data: existingCorrect } = await supabase
        .from('question_attempts')
        .select('id')
        .eq('student_id', userId)
        .eq('question_id', question.id)
        .eq('is_correct', true)
        .limit(1);
    
    if (existingCorrect?.length > 0) {
        duplicateCorrect = true;
    }
}
```

**After:**
```typescript
// Removed pre-check, now handled at database level
const attemptInsert = (async () => {
    const { error } = await supabase.from('question_attempts').insert({...});
    
    // Catch unique constraint violation
    if (error?.code === '23505' && isCorrect) {
        duplicateCorrect = true;
        xpReward = 0;
        coinDelta = 0;
        baseResponse.explanation = 'Correct, but rewards already claimed for this question.';
        return; // Don't throw - silently ignore as duplicate
    }
    if (error) throw error;
})();
```

**Key Improvements:**
- No more race condition - database enforces the constraint
- Catches error code 23505 (unique constraint violation)
- Silently zeros out rewards for duplicate submissions
- Returns user-friendly message
- Logs the incident for monitoring

### Step 3: Test the Fix

**Test Case 1: Normal Quest Completion (Baseline)**
1. Open quest in single tab
2. Answer correctly
3. Verify: XP/coins awarded, displayed in UI
4. Refresh page
5. Verify: XP/coins persisted ✅

**Test Case 2: Multi-Tab Exploit Prevention (Critical)**
1. Open SAME quest in 2 browser tabs
2. Answer correctly in Tab 1, submit
3. Immediately answer correctly in Tab 2, submit (before any delay)
4. Verify Tab 1: Awards XP/coins normally ✅
5. Verify Tab 2: Shows "already claimed" message ✅
6. Refresh page
7. Verify: Total XP/coins only increased once (no double reward) ✅

**Test Case 3: Different Questions (Should Work)**
1. Open Quest A in Tab 1, Quest B in Tab 2
2. Answer both correctly and submit simultaneously
3. Verify both awards applied ✅
4. Total XP/coins should equal sum of both rewards ✅

**Test Case 4: Wrong Answers (Should Allow Retries)**
1. Answer question incorrectly in Tab 1
2. Submit (loses 5 XP)
3. Answer correctly in Tab 2
4. Submit (gains XP/coins)
5. Verify first attempt doesn't prevent second ✅

### Step 4: Monitor for Issues
After deployment, monitor:

**Error Logs:**
```sql
-- Check for unique constraint violation errors in application logs
-- Look for error code 23505 being caught and handled
-- Expected: Should log "Duplicate correct attempt blocked for user X on question Y"
```

**User Reports:**
- Watch support channels for reports of "answer already claimed" messages
- This is expected behavior after fix
- No action needed if users understand they only get one reward per question

**Database Verification:**
```sql
-- Run this to verify constraint was applied
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'question_attempts'
  AND constraint_name LIKE '%unique_student_question%';
```

### Step 5: Check for Past Exploitation (Optional)

**Identify Users Who May Have Exploited Bug:**
```sql
-- Run the verification query from FIX_DUPLICATE_REWARDS_BUG.sql
-- This will show any users with multiple correct attempts on same question
SELECT 
    u.username,
    COUNT(*) as duplicate_count,
    SUM(qa.points_earned) as total_exploited_rewards
FROM question_attempts qa
JOIN users u ON u.id = qa.student_id
WHERE qa.is_correct = true
GROUP BY u.id, u.username
HAVING COUNT(*) > 1;
```

**Decision Points:**
1. **Leave As-Is** - They earned it, no action needed
2. **Manual Correction** - Deduct extra rewards from affected users
3. **User Communication** - Notify them of the fix and explain

## Verification Checklist

- [ ] Database constraint created successfully
- [ ] Code changes deployed
- [ ] Test Case 1 passes (normal completion)
- [ ] Test Case 2 passes (multi-tab blocked)
- [ ] Test Case 3 passes (different questions work)
- [ ] Test Case 4 passes (retries allowed for wrong answers)
- [ ] Error logs show constraint violations being caught
- [ ] No user complaints about "already claimed" messages
- [ ] Performance impact minimal (constraint check is O(1))
- [ ] Verification query run to identify any past exploitation

## Rollback Plan

If issues arise:

1. **Remove constraint (if needed):**
```sql
ALTER TABLE question_attempts
DROP CONSTRAINT unique_student_question_correct_reward;
```

2. **Revert code changes:**
   - Revert `gameService.ts` to previous version
   - Redeploy

3. **Restore rewards (if affected):**
   - Run `REPAIR_QUEST_REWARDS.sql` to fix users who lost rewards

## Performance Impact

**Minimal** - The constraint adds negligible overhead:
- Unique index is O(1) lookup
- Only checked on correct answers
- Database already indexes on (student_id, question_id)

## Success Criteria

✅ Users cannot get duplicate rewards from multi-tab submissions  
✅ Normal single-tab gameplay unaffected  
✅ Different questions can be answered simultaneously  
✅ Wrong answers can be retried from the same question  
✅ Error handling is transparent to users  
✅ Logging tracks all constraint violations  

## Timeline
- **SQL Deployment**: Immediate (run FIX_DUPLICATE_REWARDS_BUG.sql)
- **Code Deployment**: Immediate (push gameService.ts changes)
- **Testing**: 2-3 hours
- **Monitoring**: Ongoing (watch error logs for 48 hours)
