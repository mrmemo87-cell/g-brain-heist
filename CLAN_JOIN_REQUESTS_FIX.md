# Fix for clan_join_requests 404 Error

## Problem
When leaders/moderators try to view pending clan join requests, they get a 404 error:
```
HEAD https://sozodkxwhubespiedgxm.supabase.co/rest/v1/clan_join_requests?... 404 (Not Found)
```

This means the `clan_join_requests` table either:
1. Doesn't exist in the Supabase database
2. Exists but has RLS policies blocking access

## Solution: Run the Migration

### Step 1: Open Supabase SQL Editor
1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**

### Step 2: Copy and Run the SQL Migration
Copy the entire contents of `FIX_CLAN_JOIN_REQUESTS_RLS.sql` and run it in Supabase.

This will:
- ✅ Create the `clan_join_requests` table if it doesn't exist
- ✅ Create necessary indexes
- ✅ Enable RLS (Row Level Security)
- ✅ Set up proper RLS policies so leaders/moderators can:
  - View pending requests for their clan
  - Approve/reject join requests
  - Users can view their own requests

### Step 3: Verify the Fix
1. Hard refresh the browser (Ctrl+Shift+R)
2. As a clan leader/moderator, go to the **Clan Management** tab
3. Click **Refresh** on the "Join Requests" section
4. You should now see pending join requests (if any exist)

## What the RLS Policies Do

| Action | Who Can Do It | Condition |
|--------|---------------|-----------|
| **View** | Leaders/Moderators | Only for their own clan |
| | Users | Only their own requests |
| **Insert** | Any User | For themselves only |
| **Update** | Leaders/Moderators | Only for their clan |
| **Delete** | Leaders/Moderators | Only for their clan |

## If You Still See 404 After Migration

The issue might be that:
1. The table creation failed (check Supabase logs)
2. RLS policies are incorrectly configured
3. The user doesn't have proper permissions

Try these steps:
1. In Supabase, go to **SQL Editor**
2. Run: `SELECT * FROM clan_join_requests LIMIT 1;`
3. If this fails, the table doesn't exist - run the migration again
4. If it succeeds but returns no data, the table exists but is empty (this is normal)

## Code Changes
The gameService functions that use `clan_join_requests`:
- `clan_get_pending_join_requests()` - Fetch pending requests
- `clan_approve_join_request()` - Approve a request
- `clan_reject_join_request()` - Reject a request

These are already implemented and will work once the table exists with proper RLS.
