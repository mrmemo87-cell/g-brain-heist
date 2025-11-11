# Fix Deployment: Competition Phase 1 RPC Functions

## Problem
The frontend is getting 404 errors when trying to call:
- `POST https://.../rest/v1/rpc/rpc_questions_next` → **404 Not Found**
- `POST https://.../rest/v1/rpc/rpc_leaderboard_batch` → **400 Bad Request**

## Root Cause
These RPC functions were never deployed to Supabase. They are defined in `supabase-functions/competition_phase1.sql` but weren't run in the migration sequence.

## Solution
Deploy the **`DEPLOY_COMPETITION_PHASE1.sql`** script to Supabase SQL Editor.

This script includes:
- ✅ Helper function: `is_current_user_admin()`
- ✅ Question system: `rpc_questions_next()`
- ✅ Answer submission: `rpc_submit_attempt()`
- ✅ Leaderboards: `rpc_leaderboard_grade()`, `rpc_leaderboard_batch()`
- ✅ Admin tools: `rpc_admin_grant()`, `rpc_admin_reset_user()`, `rpc_admin_ban_user()`, etc.

## Deployment Steps

1. **Prep:** Re-run the latest `HOTFIX_PRODUCTION_ERRORS.sql` to ensure `regenerate_user_ap` and the announcement RPCs are up to date.

2. **Copy the full script:**
   - Open: `DEPLOY_COMPETITION_PHASE1.sql` in your editor

3. **Paste into Supabase:**
   - Go to: Supabase Project → SQL Editor
   - Click: "New Query"
   - Paste the entire script
   - Click: "Run"

4. **Verify success:**
   - Should see: `✅ COMPETITION PHASE 1 DEPLOYMENT COMPLETE`
   - Should list all RPC functions at the bottom

5. **Test the game:**
   - Load the quest view and try answering a question
   - Check leaderboards for grade/batch rankings
   - Verify admin tools (ban, grant XP, reset progress) work end-to-end

## Expected Result
- Quest loading works instantly (rpc_questions_next returns 200)
- Leaderboards display correctly (rpc_leaderboard_batch returns 200)
- Admin actions available (grant rewards, reset user, ban/unban, reset all, refill AP)

## Deployment Order (Complete)
1. ✅ `SAFE_DATABASE_MIGRATION.sql` (base tables)
2. ✅ `COMPLETE_SUPABASE_MIGRATION.sql` (notifications, tournaments, etc.)
3. ✅ `HOTFIX_PRODUCTION_ERRORS.sql` (schema fixes, error handling)
4. ⏳ **`DEPLOY_COMPETITION_PHASE1.sql`** (THIS STEP - competition RPCs)

After this deployment, all 404/400 errors should be resolved!
