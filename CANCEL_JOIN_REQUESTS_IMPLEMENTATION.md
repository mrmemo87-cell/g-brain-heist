# Implementation Guide: Cancel Pending Clan Join Requests

## Quick Summary
Users can now cancel their pending clan join requests to join a different clan instead. This is implemented with a new "✕" button that appears next to the pending request notification.

## Implementation Steps

### Step 1: Update Database RLS Policy (Supabase)
1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy the entire contents of: `ALLOW_USERS_CANCEL_JOIN_REQUESTS.sql`
5. Paste into the SQL editor
6. Click **Run**

✅ This allows users to delete their own pending join requests while keeping the ability for leaders/moderators to reject requests.

### Step 2: Deploy Code Changes
Deploy the following updated files:
- `services/gameService.ts` - New `clan_cancel_join_request()` function added
- `components/ClanView.tsx` - New cancel button and handler added

### Step 3: Clear Browser Cache (if needed)
If users are seeing outdated UI:
1. Users can do `Ctrl+Shift+R` (hard refresh)
2. Or clear browser cache

### Step 4: Test the Feature
1. Log in as a user
2. Request to join a clan (if not already in one)
3. You should see a pending request card with a close button (✕)
4. Click the close button
5. Request should disappear and you get a success toast
6. You can now request to join another clan

## Files Modified

### 1. ALLOW_USERS_CANCEL_JOIN_REQUESTS.sql ✨ NEW
- Updates RLS policy for `clan_join_requests` DELETE action
- Allows users to delete their own requests
- Preserves leader/moderator rejection ability

### 2. services/gameService.ts 
- ✨ **NEW** Function: `clan_cancel_join_request(requestId: string)`
  - Validates request ownership
  - Confirms pending status
  - Deletes request from database
  - Returns true on success

### 3. components/ClanView.tsx
- ✨ **NEW** State: `isCancelingRequest` (boolean)
- ✨ **NEW** Handler: `handleCancelJoinRequest()` (async function)
- ✨ **UPDATED** UI: Pending request card now includes cancel button
  - Shows "✕" normally
  - Shows "..." while processing
  - Disabled state during request

## What Users See

### Before
```
┌─────────────────────────────────┐
│ Request Pending                 │
│ Awaiting approval to join       │
│ Alpha Clan. A leader or         │
│ moderator will review soon.     │
└─────────────────────────────────┘
```

### After
```
┌─────────────────────────────────────────┐
│ Request Pending         ✕              │
│ Awaiting approval to join Alpha Clan.   │
│ A leader or moderator will review soon. │
└─────────────────────────────────────────┘
```

Click ✕ to cancel.

## Security Details

### Client-Side Validation
```typescript
1. Check request exists
2. Check user owns the request (user_id matches)
3. Check request is still pending
4. Send delete request to backend
```

### Server-Side Validation (RLS)
```sql
user_id = auth.uid()  -- User can only delete their own requests
```

### What This Prevents
- ❌ User A deleting User B's request
- ❌ Deleting already-approved requests
- ❌ Deleting rejected requests
- ❌ Bypassing RLS with direct API calls

## Error Handling

Users will see toast notifications for:

| Scenario | Message |
|----------|---------|
| ✅ Request canceled | "Join request canceled." |
| ❌ Request not found | "Join request not found." |
| ❌ Not owner of request | "You can only cancel your own join requests." |
| ❌ Already processed | "Only pending requests can be canceled." |
| ❌ Server error | "Failed to cancel request." |

## User Workflows

### Workflow 1: Changed mind about clan
```
1. User requests to join Alpha Clan
2. User sees pending request notification
3. User decides Alpha Clan isn't a good fit
4. User clicks ✕ button
5. Request is canceled
6. User can now request to join Beta Clan
```

### Workflow 2: Multiple pending requests (not possible)
```
System prevents having multiple pending requests:
- User can only have 1 pending request at a time
- If they cancel their pending request
- They can then request to join a different clan
```

### Workflow 3: Request was rejected
```
1. User has pending request
2. Leader/moderator clicks Reject
3. Request status changes to 'rejected'
4. If user clicks cancel button, they get error: "Only pending requests can be canceled"
5. They can request to join a different clan normally
```

## Verification Commands

### Check RLS Policy is Applied
In Supabase SQL Editor:
```sql
SELECT schemaname, tablename, policyname, permissive
FROM pg_policies
WHERE tablename = 'clan_join_requests'
AND policyname = 'clan_join_requests_delete';
```

Should show the policy with `permissive = true`

### Check Request Was Deleted
```sql
-- This should show 0 rows for a canceled request
SELECT COUNT(*) FROM clan_join_requests 
WHERE id = '<request-id>' AND status = 'pending';
```

## Troubleshooting

### Problem: Cancel button doesn't appear
- **Solution 1**: Clear browser cache (Ctrl+Shift+R)
- **Solution 2**: Check that `ClanView.tsx` has the update
- **Solution 3**: Refresh page

### Problem: "Only pending requests can be canceled" error
- **Cause**: Request was already processed (approved/rejected)
- **Solution**: The request can no longer be canceled, request a new one to a different clan

### Problem: Button shows "..." indefinitely
- **Cause**: Network issue or API error
- **Solution**: Check browser console (F12) for error details

### Problem: Permission error from Supabase
- **Cause**: RLS policy not updated
- **Solution**: Run `ALLOW_USERS_CANCEL_JOIN_REQUESTS.sql` in Supabase SQL Editor

## Rollback Procedure

If you need to remove this feature:

### Step 1: Revert RLS Policy
In Supabase SQL Editor, run:
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

### Step 2: Revert Code Changes
Restore previous versions of:
- `services/gameService.ts`
- `components/ClanView.tsx`

### Step 3: Clear Cache
Users should hard refresh their browsers.

## Support

For issues or questions:
1. Check the Troubleshooting section above
2. Review browser console (F12) for error messages
3. Verify all SQL migrations were applied successfully
4. Ensure code deployment completed without errors
