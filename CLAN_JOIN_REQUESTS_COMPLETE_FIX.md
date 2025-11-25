# Clan Join Requests 404 Error - Complete Fix Guide

## Error Summary
```
HEAD https://sozodkxwhubespiedgxm.supabase.co/rest/v1/clan_join_requests?... 404 (Not Found)
```

This error occurs when leaders/moderators try to approve or reject clan join requests.

## Root Causes

The 404 error means the `clan_join_requests` table either:
1. **Doesn't exist** in the Supabase database (most likely)
2. Exists but RLS policies are blocking access
3. Has incorrect table schema

## Step-by-Step Fix

### ✅ STEP 1: Run the Migration SQL

1. Go to your Supabase project dashboard: https://app.supabase.com
2. Select your project
3. Go to **SQL Editor** (left sidebar)
4. Click **New Query**
5. Copy the entire contents of `FIX_CLAN_JOIN_REQUESTS_RLS.sql`
6. Paste it into the SQL editor
7. Click **Run**

**What this does:**
- Creates `clan_join_requests` table (if it doesn't exist)
- Creates proper indexes for performance
- Enables Row Level Security (RLS)
- Sets up RLS policies so:
  - Leaders/moderators can view pending requests for their clan
  - Users can view their own requests
  - Users can submit join requests
  - Leaders/moderators can approve/reject requests

### ✅ STEP 2: Clear Browser Cache

Hard refresh your browser to clear any cached data:
- **Chrome/Firefox**: `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac)
- **Safari**: `Cmd + Option + R`

### ✅ STEP 3: Test the Fix

1. Log in as a clan leader or moderator
2. Go to **Clan** section
3. Click the **Management** tab
4. Look for **Join Requests** section
5. Click **Refresh**
6. You should see pending requests (if any exist)

## What Works Now

After running the migration:

| Feature | Leaders | Moderators | Members | Regular Users |
|---------|---------|-----------|---------|---------------|
| View pending requests for their clan | ✅ | ✅ | ❌ | ❌ |
| Approve join requests | ✅ | ✅ | ❌ | ❌ |
| Reject join requests | ✅ | ✅ | ❌ | ❌ |
| Submit join requests | ✅ | ✅ | ✅ | ✅ |
| View own requests | ✅ | ✅ | ✅ | ✅ |

## Code Improvements

Enhanced error handling in `services/gameService.ts`:

1. **`clan_get_pending_join_requests()`**
   - Now detects 404 errors and returns empty list instead of crashing
   - Logs helpful message directing to migration SQL
   - Provides better console logging for debugging

2. **`clan_approve_join_request()`**
   - Better error detection and reporting
   - Handles missing table gracefully
   - Validates all permissions before approving

3. **`clan_reject_join_request()`**
   - Enhanced error handling
   - Detects missing table
   - More informative error messages

## Files Updated

1. **FIX_CLAN_JOIN_REQUESTS_RLS.sql** (NEW)
   - SQL migration to fix the table and RLS policies

2. **services/gameService.ts**
   - Enhanced error handling in clan request functions
   - Better logging and diagnostics

3. **CLAN_JOIN_REQUESTS_FIX.md** (THIS FILE)
   - Complete fix documentation

## If It Still Doesn't Work

### Check if table exists:
1. Go to Supabase SQL Editor
2. Run: `SELECT COUNT(*) FROM clan_join_requests;`
3. If you get an error about "relation does not exist", the table creation failed - run the migration again

### Check RLS policies:
1. Go to Supabase **Authentication** → **Policies**
2. Look for `clan_join_requests` policies
3. You should see policies for: `SELECT`, `INSERT`, `UPDATE`, `DELETE`

### Check permissions:
1. Make sure the user is logged in
2. Make sure the user is a leader or moderator in a clan
3. Check browser console (F12) for detailed error messages

## Database Schema

The `clan_join_requests` table has:
- `id` (UUID) - Primary key
- `clan_id` (UUID) - Foreign key to clans
- `user_id` (UUID) - Foreign key to users (requester)
- `status` (TEXT) - 'pending', 'approved', or 'rejected'
- `created_at` (TIMESTAMP) - When request was made
- `approved_by` (UUID) - Who approved it (NULL if pending)
- `approved_at` (TIMESTAMP) - When it was approved/rejected

## RLS Policy Details

**SELECT Policy** - Who can read requests:
- Leaders/Moderators: Can see all requests for their clan
- Users: Can see their own requests

**INSERT Policy** - Who can create requests:
- Authenticated users: Can only create for themselves

**UPDATE Policy** - Who can modify requests:
- Leaders/Moderators: Can only update requests in their clan

**DELETE Policy** - Who can delete requests:
- Leaders/Moderators: Can only delete requests in their clan

## Questions?

Check these resources:
1. Browser console (F12) - Shows detailed error messages
2. Supabase Logs - https://app.supabase.com → your-project → Logs
3. SQL Query results in Supabase SQL Editor

Common issues and solutions:
- **"table does not exist"** → Run the migration SQL
- **"permission denied"** → Check RLS policies in Supabase
- **"user is not authenticated"** → Make sure you're logged in
- **"cannot approve request"** → Make sure you're a leader/moderator of the clan
