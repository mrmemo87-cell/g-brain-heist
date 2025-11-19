# Multi-Tab Reward Exploit - Quick Fix Reference

## The Bug
Users can submit the same quest from multiple tabs and get rewards from each tab.

**Example:**
- User opens Quest A in Tab 1, 2, and 3
- Answers correctly in all three tabs within 1 second
- Gets 3x the XP/coins they should have

## The Fix (2 Steps)

### 1. Database Change
Run `FIX_DUPLICATE_REWARDS_BUG.sql`:
```sql
ALTER TABLE question_attempts
ADD CONSTRAINT unique_student_question_correct_reward 
UNIQUE (student_id, question_id) 
WHERE is_correct = true;
```

This makes it impossible for one student to have multiple correct answers on the same question that earn rewards.

### 2. Code Change
Updated `finalizeMcqAnswer` in `gameService.ts` to catch error code 23505 (unique constraint violation) and silently treat it as "already claimed" instead of throwing an error.

## What Changes for Users
**Before Fix:**
- ❌ Can submit same quest from multiple tabs and get rewards from each
- ❌ XP/coins multiply with each tab submission

**After Fix:**
- ✅ First tab submission gets rewards normally
- ✅ Subsequent tab submissions show "already claimed" message
- ✅ Total rewards = one correct attempt only

## Testing
```
1. Open quest in 2 tabs
2. Answer correctly in both
3. Submit both (as fast as possible)
4. Result: Tab 1 gets reward, Tab 2 shows "already claimed"
5. Total XP/coins = single reward only
```

## Deployment
1. Deploy `FIX_DUPLICATE_REWARDS_BUG.sql` to database
2. Deploy updated `gameService.ts` 
3. Run the test case above
4. Monitor error logs for error code 23505 (this is expected and good)

## Verification
```sql
-- Check if any users exploited before fix was deployed
SELECT u.username, COUNT(*) as duplicate_attempts
FROM question_attempts qa
JOIN users u ON u.id = qa.student_id
WHERE qa.is_correct = true
GROUP BY u.id, u.username
HAVING COUNT(*) > 1;
```

If results show users with multiple correct attempts on same question → they exploited the bug.
Decide: Leave as-is, or deduct the extra rewards.

## Files Created
- `FIX_DUPLICATE_REWARDS_BUG.sql` - Database migration
- `DUPLICATE_REWARDS_FIX_DEPLOYMENT.md` - Full deployment guide

## Impact
- Fixes critical vulnerability
- Zero performance impact
- Transparent to legitimate users
- Prevents unfair advantage
