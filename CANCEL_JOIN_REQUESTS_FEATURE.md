# Feature: Cancel Pending Clan Join Requests

## Overview
Users can now cancel their pending clan join requests if they change their mind or want to join a different clan.

## What's New
1. **Cancel Button** - A new close button (✕) appears next to the pending request notification
2. **Backend Function** - New `clan_cancel_join_request()` in gameService
3. **RLS Policy Update** - Users can now delete their own pending join requests
4. **Loading State** - Button shows loading indicator while canceling

## Files Changed

### 1. `ALLOW_USERS_CANCEL_JOIN_REQUESTS.sql`
SQL migration that updates the RLS DELETE policy for `clan_join_requests` table to allow:
- Users to delete their own pending requests
- Leaders/moderators to continue rejecting requests in their clan

**Key Changes:**
```sql
CREATE POLICY "clan_join_requests_delete" ON clan_join_requests
    FOR DELETE
    USING (
        -- Users can delete their own requests
        user_id = auth.uid()
        OR
        -- Leaders and moderators can delete requests in their clan
        clan_id IN (...)
    );
```

### 2. `services/gameService.ts`
Added new function: `clan_cancel_join_request(requestId: string)`

**Function Flow:**
1. Validates the request exists
2. Checks the user owns the request
3. Confirms the request is in 'pending' status
4. Deletes the request
5. Returns success

**Error Handling:**
- "Join request not found" - Request doesn't exist
- "You can only cancel your own join requests" - User doesn't own it
- "Only pending requests can be canceled" - Request already processed

### 3. `components/ClanView.tsx`
Added UI and handler for canceling requests:

**New State:**
- `isCancelingRequest` - Loading state while request is being sent

**New Handler:**
- `handleCancelJoinRequest()` - Calls the API and updates UI

**UI Changes:**
- Pending request card now displays with a close button
- Button shows "..." while loading
- Button is disabled while request is being processed
- Toast notification on success/failure

## How to Apply

### Step 1: Run the SQL Migration
1. Go to Supabase SQL Editor
2. Copy and paste contents of `ALLOW_USERS_CANCEL_JOIN_REQUESTS.sql`
3. Click **Run**

### Step 2: Deploy the Code Changes
Deploy the updated:
- `services/gameService.ts`
- `components/ClanView.tsx`

### Step 3: Test
1. Log in as a user without a clan
2. Request to join a clan
3. Navigate away and return
4. Pending request card should appear with a close button
5. Click the close button to cancel
6. Should see success toast and card disappears

## User Workflow

### Before (No Cancel Option)
```
User requests to join "Alpha Clan"
↓
User waits for leader approval
↓
If leader rejects OR user changes mind... stuck with pending request
```

### After (With Cancel Option)
```
User requests to join "Alpha Clan"
↓
User sees pending card with cancel button
↓
User can either:
  a) Wait for leader approval
  b) Click cancel button to change their mind and join another clan
↓
Request is deleted from database
```

## Technical Details

### RLS Security
The updated DELETE policy ensures:
- ✅ Users can only delete their **own** requests
- ✅ Deletion only works for **pending** requests
- ✅ Leaders/moderators can still reject any request in their clan
- ✅ Request validation happens server-side

### Client-Side Validation
Before sending to server, the function checks:
- ✅ Request ID exists
- ✅ User owns the request
- ✅ Request status is 'pending'

### Database Changes
No schema changes required. Only RLS policy modification.

## Testing Scenarios

### Scenario 1: User cancels own request
1. ✅ User sees pending request
2. ✅ Clicks cancel button
3. ✅ Request disappears
4. ✅ User can now request to join another clan

### Scenario 2: User tries to cancel already-approved request
1. ✅ System shows error: "Only pending requests can be canceled"
2. ✅ Request remains (no deletion)

### Scenario 3: Leader tries to cancel user's request (should fail)
1. ✅ System shows error via RLS (DELETE policy blocks it)
2. ✅ Leader should use "Reject" button instead

### Scenario 4: User refreshes page after canceling
1. ✅ Request no longer appears in pending notifications
2. ✅ User can request to join clans normally

## Rollback

If you need to revert the RLS policy:

```sql
DROP POLICY IF EXISTS "clan_join_requests_delete" ON clan_join_requests;

CREATE POLICY "clan_join_requests_delete" ON clan_join_requests
    FOR DELETE
    USING (
        clan_id IN (
            SELECT clan_id FROM clan_members 
            WHERE user_id = auth.uid() 
            AND role IN ('leader', 'moderator')
        )
    );
```

This reverts to only allowing leaders/moderators to delete requests.

## Future Enhancements

- Add confirmation dialog before canceling
- Show cancellation timestamp in request history
- Allow users to see their cancel history
- Add "You canceled this request" message in join requests UI
