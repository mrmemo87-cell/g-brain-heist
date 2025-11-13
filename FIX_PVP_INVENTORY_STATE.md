# Inventory State Fix for PvP Attacks

## Problem
Users cannot attack each other. Console error:
```
POST https://sozodkxwhubespiedgxm.supabase.co/rest/v1/rpc/rpc_hack_attempt 400 (Bad Request)
Error: new row for relation "inventory" violates check constraint "inventory_state_check"
```

## Root Cause
The `rpc_hack_attempt` function uses invalid inventory state values:
- **Invalid**: `state = 'used'`
- **Valid**: `state IN ('unused', 'active', 'consumed')`

The function tried to set inventory state to `'used'` which violates the CHECK constraint.

## Solution
Replace all `state = 'used'` with `state = 'consumed'` in the `rpc_hack_attempt` function.

### Lines to Fix
1. **Line 138**: When consuming attacker's cracker
2. **Line 151**: When breaking defender's shield

## Deployment Steps

### Option 1: Via Supabase Dashboard (Recommended)
1. Go to: https://app.supabase.com/project/sozodkxwhubespiedgxm/sql/new
2. Copy entire content from `DEPLOY_HACK_ATTEMPT_FIX.sql`
3. Paste into SQL editor
4. Click **Run**
5. Verify success (no errors)

### Option 2: Via psql (if installed)
```bash
cd c:\Users\reigh\OneDrive\Documents\GitHub\g-brain-heist
psql "postgresql://postgres:[PASSWORD]@db.sozodkxwhubespiedgxm.supabase.co:5432/postgres" \
  < DEPLOY_HACK_ATTEMPT_FIX.sql
```

### Option 3: Via Supabase CLI
```bash
supabase link --project-ref sozodkxwhubespiedgxm
supabase db push --file DEPLOY_HACK_ATTEMPT_FIX.sql
```

## Testing After Deployment
1. Open browser Dev Console (F12)
2. Navigate to PvP Attack screen
3. Attempt to attack another player
4. If successful:
   - No 400 errors in console
   - Attack result displays (win/lose/blocked)
   - Player stats update

## Rollback (if needed)
Redeploy the original `rpc_hack_attempt` function from `supabase-functions/rpc_hack_attempt.sql`

---

**Status**: Fix applied to source file. Awaiting deployment to production.
**Files Modified**: 
- `supabase-functions/rpc_hack_attempt.sql` (updated with 'consumed' instead of 'used')
- `DEPLOY_HACK_ATTEMPT_FIX.sql` (created - full deployment script)
