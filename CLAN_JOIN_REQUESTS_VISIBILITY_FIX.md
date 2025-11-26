# Fix: Clan Join Requests Not Appearing for Leaders

## Problem
Leaders and moderators cannot see pending join requests in their clan's management panel. The requests exist in the database but don't appear in the UI.

## Root Cause
The RLS (Row Level Security) policy for the `clan_join_requests` table has a SELECT policy that uses a subquery with `IN` operator:

```sql
clan_id IN (
    SELECT clan_id FROM clan_members 
    WHERE user_id = auth.uid() 
    AND role IN ('leader', 'moderator')
)
```

This pattern can fail because:
1. The subquery doesn't explicitly reference `clan_join_requests.clan_id` in the JOIN
2. Supabase's RLS evaluation may not properly correlate the clan_id between the outer and inner query
3. The policy doesn't ensure the returned clan_id matches the request's clan_id

## Solution
Replace the SELECT policy with one that uses `EXISTS` with explicit column comparison:

```sql
CREATE POLICY "clan_join_requests_view" ON clan_join_requests
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM clan_members 
            WHERE clan_members.user_id = auth.uid()
            AND clan_members.clan_id = clan_join_requests.clan_id
            AND clan_members.role IN ('leader', 'moderator')
        )
        OR
        user_id = auth.uid()
    );
```

The key differences:
- Uses `EXISTS` instead of `IN` - more reliable for RLS policies
- Explicitly joins: `clan_members.clan_id = clan_join_requests.clan_id` - eliminates ambiguity
- Uses full table qualifiers - prevents scope confusion

## How to Apply the Fix

### Step 1: Open Supabase Dashboard
1. Go to https://app.supabase.com
2. Select your project
3. Navigate to **SQL Editor**
4. Click **New Query**

### Step 2: Run the Fix SQL
Copy the entire contents of `FIX_CLAN_JOIN_REQUESTS_VISIBILITY.sql` and paste it into the SQL editor.

This will:
- ✅ Drop the old problematic VIEW policy
- ✅ Create a corrected policy with explicit column matching
- ✅ Verify the policy is installed correctly

Click **Run** to execute.

### Step 3: Test
1. Log out and back in (to refresh the JWT)
2. As a clan leader, go to **Clan > Management > Join Requests**
3. Pending requests should now appear

## Verification

To verify the fix is in place, run this query in Supabase SQL Editor:

```sql
SELECT schemaname, tablename, policyname, permissive, qual
FROM pg_policies
WHERE tablename = 'clan_join_requests'
AND policyname = 'clan_join_requests_view';
```

You should see the policy with the `EXISTS` condition in the `qual` column.

## What This Fixes
| Feature | Before | After |
|---------|--------|-------|
| Leaders see join requests | ❌ Returns empty | ✅ Shows requests |
| Moderators see join requests | ❌ Returns empty | ✅ Shows requests |
| Users see own requests | ✅ Works | ✅ Still works |
| Approve/Reject requests | ❌ Can't approve (no requests shown) | ✅ Now works |

## Technical Details

The issue was a classic RLS policy scope problem. When using subqueries in RLS policies:

**❌ Bad Pattern (Original):**
```sql
clan_id IN (SELECT clan_id FROM ... WHERE user_id = auth.uid())
```
- The subquery scope isn't bound to the outer table
- Returns a SET of clan_ids without referencing the row being checked
- RLS evaluator may not correlate it correctly

**✅ Good Pattern (Fixed):**
```sql
EXISTS (SELECT 1 FROM ... 
    WHERE table.column = outer_table.column 
    AND ...)
```
- Explicit row-to-row join condition
- `EXISTS` semantic requires proper correlation
- RLS evaluator can reliably match rows

## Rollback (if needed)

If you need to revert, the original policy can be restored with:

```sql
DROP POLICY IF EXISTS "clan_join_requests_view" ON clan_join_requests;

CREATE POLICY "clan_join_requests_view" ON clan_join_requests
    FOR SELECT
    USING (
        clan_id IN (
            SELECT clan_id FROM clan_members 
            WHERE user_id = auth.uid() 
            AND role IN ('leader', 'moderator')
        )
        OR
        user_id = auth.uid()
    );
```

But this isn't recommended unless you want to revert to the broken behavior.
