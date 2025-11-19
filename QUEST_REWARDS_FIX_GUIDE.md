# 🧪 Quest Rewards Fix - Testing & Verification Guide

## What Was Fixed

### Problem
Users completed quests with correct answers but didn't receive XP/coins persistently. The UI showed the rewards, but after refresh, they were gone.

### Root Causes Identified
1. **No error propagation**: `finalizeMcqAnswer` used `Promise.allSettled()` which silently swallowed profile update errors
2. **No verification**: `handleGrantReward` didn't verify rewards were actually saved to the database
3. **Fire-and-forget**: Profile update failures were only logged to console, never reported to user

### Solutions Implemented

#### 1. **Enhanced Error Handling in `finalizeMcqAnswer` (gameService.ts)**
```typescript
// NOW: Throws error if profile update fails
const profileUpdateResult = dataResults[1]; // profileUpdate is operation #1
if (profileUpdateResult.status === 'rejected') {
    throw new Error(`Failed to save profile rewards: ${profileUpdateResult.reason}`);
}
```
- **Impact**: Users now see clear error messages if rewards fail to save
- **User Experience**: Alert tells them to refresh or contact admin

#### 2. **Added Verification Logic in `handleGrantReward` (App.tsx)**
```typescript
// NOW: Verifies rewards 2 seconds after granting
setTimeout(async () => {
    const currentProfile = await getProfile();
    if (currentProfile.xp < expectedXP || currentProfile.coins < expectedCoins) {
        // Mismatch detected! Refresh profile and show warning
        addToast('⚠️ Warning: Your rewards may not have been saved. Refreshing...', 'warning');
        await refreshProfile();
    }
}, 2000);
```
- **Impact**: Automatically detects and recovers from silent failures
- **User Experience**: Users see warning toast and profile auto-refreshes

#### 3. **Improved Error Messages in QuestView**
- **Before**: Generic "Failed to submit answer. Please try again."
- **After**: Specific error for database reward failures with instructions

---

## 🧪 Testing Procedure

### Test 1: Normal Quest Completion
**Goal**: Verify a student can complete a quest and receive XP/coins

1. Login as a student (not admin)
2. Go to **Quest** tab
3. Select a subject
4. Answer questions **CORRECTLY**
5. Observe:
   - ✅ Coins/XP display updates immediately in HUD
   - ✅ Reward particles animate to the HUD
   - ✅ Question marked as correct

### Test 2: Verify Rewards Persist (Critical)
**Goal**: Confirm XP/coins are actually saved to database

1. Complete Test 1
2. Note the XP/Coins shown in HUD
3. **Refresh the page** (F5 or Ctrl+R)
4. Observe:
   - ✅ XP/Coins are still there (not reset to pre-quest values)
   - ✅ HUD shows same values as before refresh

### Test 3: Error Handling
**Goal**: Verify errors are caught and reported

#### Sub-test 3a: Database connection failure
1. Open browser DevTools (F12)
2. Go to **Network** tab
3. Enable **Offline** mode
4. Try to complete a quest
5. Observe:
   - ✅ Alert appears with clear error message
   - ✅ Console shows detailed error logs

#### Sub-test 3b: RLS Policy block (if applicable)
1. Check SQL logs for RLS policy violations
2. Verify error message directs users to contact admin

### Test 4: Multiple Questions in Session
**Goal**: Verify multiple correct answers all get rewards

1. Complete a full quest (3-5 questions)
2. Answer **ALL CORRECTLY**
3. Observe:
   - ✅ Each correct answer gives rewards
   - ✅ Rewards accumulate properly
   - ✅ Final score matches sum of individual rewards

### Test 5: Refresh During Quest (Edge Case)
**Goal**: Verify no rewards are lost if user refreshes mid-quest

1. Start a quest
2. Answer 1 question **CORRECTLY** (rewards given)
3. Refresh the page
4. Observe:
   - ✅ Previously earned rewards are NOT lost
   - ✅ Profile shows correct XP/Coins
   - ✅ Assignment state is preserved

---

## 🔍 Diagnostic Commands

### Check Recent User Activity
```sql
-- In Supabase SQL Editor
SELECT username, xp, coins, level, updated_at 
FROM users 
WHERE is_admin = false 
ORDER BY updated_at DESC 
LIMIT 10;
```

### Check for Reward Failures
```sql
-- Look for recent error logs
SELECT function_name, log_level, message, user_id, created_at 
FROM rpc_event_log 
WHERE log_level = 'error' 
  AND created_at > NOW() - INTERVAL '1 hour' 
ORDER BY created_at DESC;
```

### Verify Question Attempts Are Recorded
```sql
-- Check if answers are being recorded
SELECT 
    COUNT(*) as total_attempts,
    COUNT(CASE WHEN is_correct THEN 1 END) as correct_answers,
    SUM(CASE WHEN is_correct THEN COALESCE(points_earned, 20) ELSE 0 END) as total_xp
FROM question_attempts
WHERE attempted_at > NOW() - INTERVAL '1 hour';
```

### Check for XP/Coins Mismatches
```sql
-- Run the diagnostic script
-- File: DIAGNOSE_REWARD_ISSUES.sql
-- This will show if there are users with recorded correct answers but no XP gains
```

---

## 🚨 If Issues Persist

### Checklist
- [ ] Check browser console for detailed error messages (F12 > Console)
- [ ] Verify RLS policies are correct: `SELECT * FROM pg_policies WHERE tablename = 'users';`
- [ ] Check Supabase logs for update failures
- [ ] Verify `question_attempts` table has records
- [ ] Run `DIAGNOSE_REWARD_ISSUES.sql` to find XP/coins mismatches

### Common Issues

#### Issue: "Profile update failed"
**Solution**: 
1. Check RLS policies on `users` table
2. Verify `auth.uid()` matches user ID
3. Run: `SELECT * FROM users WHERE id = auth.uid();`

#### Issue: Rewards show in UI but not in database
**Solution**:
1. This is likely a timing issue - wait 2-3 seconds
2. Verify the verification logic triggers (check for warning toast)
3. If manual refresh needed: Refresh profile in App.tsx

#### Issue: Duplicate correct answers not being prevented
**Solution**:
1. Check `question_attempts` table has index on (student_id, question_id, is_correct)
2. Verify logic in `finalizeMcqAnswer` that checks `existingCorrect`

---

## 📊 Success Metrics

After this fix, you should observe:
1. ✅ 100% of correct quest answers result in XP/coins awarded
2. ✅ Rewards persist after page refresh
3. ✅ Clear error messages if anything fails
4. ✅ Automatic recovery when transient failures occur
5. ✅ No silent failures (all errors logged and reported)

---

## 🔄 Rollback Plan

If issues occur:
1. Revert `gameService.ts` to use `Promise.allSettled()` instead of `Promise.all()`
2. Remove verification logic from `App.tsx` handleGrantReward
3. Revert error message improvements in QuestView

The application will still function, just with less error visibility.
