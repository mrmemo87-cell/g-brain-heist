# Fix: Clan Join Request Approval RLS Error

## Problem
When a clan leader/moderator tries to approve a join request, they get a `403 (Forbidden)` error:
```
new row violates row-level security policy for table "clan_members"
```

## Root Cause
The current RLS policy for `clan_members` INSERT only allows users to insert their own membership:
```sql
CREATE POLICY "Users can join clans"
    ON clan_members FOR INSERT
    WITH CHECK (auth.uid() = user_id);
```

When a leader approves a join request, they're trying to insert a row where:
- `user_id` = the person requesting to join
- `auth.uid()` = the leader approving

This violates the policy because the leader is inserting someone else's membership, not their own.

## Solution
Add a new RLS policy that allows leaders/moderators to insert members into their clan:

### Step 1: Copy the SQL Fix
Copy the contents of `FIX_CLAN_MEMBERS_RLS_APPROVE.sql`

### Step 2: Run in Supabase
1. Go to Supabase Dashboard
2. Navigate to SQL Editor
3. Create a new query
4. Paste the SQL from the fix file
5. Click "Run"

### Step 3: Verify
The SQL includes a verification query at the end. You should see the new policy listed.

## How It Works
The new policy allows leaders and moderators to insert clan members for their clan when:
- The authenticated user (`auth.uid()`) is a member of the clan
- The authenticated user has the role 'leader' or 'moderator'

This enables the approval workflow while maintaining security.

## Testing
After running the migration:
1. Log in as a clan leader
2. Go to Clan > Management tab
3. Find a pending join request
4. Click "Approve"
5. Should now work without errors
