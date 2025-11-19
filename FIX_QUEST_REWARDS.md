# 🐛 Quest Rewards Not Being Saved - Root Cause & Fix

## Problem
Users see coins/XP gained in the UI when answering quests correctly, but when they refresh the page, the rewards are gone. The database never actually receives the reward updates.

## Root Cause
The `handleGrantReward` function in `App.tsx` performs only an **optimistic UI update** without:
1. Persisting changes to the backend
2. Verifying the database transaction succeeded
3. Handling sync failures

Meanwhile, `finalizeMcqAnswer` in `gameService.ts`:
- Calculates rewards correctly
- Calls `updateProfile()` to save to DB
- Uses `Promise.allSettled()` for error handling, so failures are only logged to console
- Never notifies the UI if the database update failed

## Solution
We need to:
1. **Add error handling** to `finalizeMcqAnswer` to throw on profile update failures
2. **Add verification** in `handleGrantReward` to ensure backend sync
3. **Add recovery logic** to refresh profile on failure
4. **Add telemetry logging** for debugging

## Changes Required

### 1. Update `services/gameService.ts` - `finalizeMcqAnswer`
- Change `Promise.allSettled()` to `Promise.all()` for profile updates
- Add error boundary to catch and log profile update failures

### 2. Update `components/QuestView.tsx`
- Add try-catch around `mcq_answer_submit` call
- Add error toast if submission fails

### 3. Update `App.tsx` - `handleGrantReward`
- Add callback parameter to verify backend sync
- Optionally refresh profile after 2-3 seconds to confirm DB saved changes

### 4. Add Diagnostics
- Create SQL script to audit user stats
- Add console logging for debugging
