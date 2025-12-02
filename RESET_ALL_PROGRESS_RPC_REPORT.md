# Reset All Progress RPC Report

## Overview
The `rpc_admin_reset_all()` function is a comprehensive admin tool that resets all game progress across all players and associated systems in a single atomic operation.

## Function Signature
```sql
CREATE OR REPLACE FUNCTION rpc_admin_reset_all()
RETURNS TABLE (affected_rows INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
```

## Authorization
- **Requires Admin Status**: The function checks that the calling user has `is_admin = TRUE` or `role = 'admin'` in the users table
- **Throws Exception**: Raises 'forbidden' if the caller is not authenticated or not an admin

## What Gets Reset

### 1. **Players & Bots (Updated)**
- **users table**: All non-admin, non-banned players
  - `xp = 0`
  - `coins = 0`
  - `gemstones = 0`
  - `streak = 0`
  - `level = 1`
  - `attack_power = 10`
  - `defense_power = 10`
  - `ap_now = ap_max` (fully refills action points)
  - `pvp_score = 0`
  - `last_attacked_at = NULL`

- **bot_users table** (if exists): Same resets as players
  - Additional fields reset: `total_questions_answered = 0`, `achievement_points = 0`

### 2. **Activity History (Deleted)**
- **activities**: All activity records cleared
- **activity_reactions**: All reactions to activities cleared

### 3. **Inventory & Items (Deleted)**
- **inventory**: All player inventory items cleared
- **shop_purchases**: All purchase history deleted

### 4. **Clan System (Deleted)**
- **clans**: All clans deleted
- **clan_members**: All clan membership records deleted
- **clan_chat**: All clan chat messages deleted
- **clan_buffs**: All clan buff records deleted

### 5. **Tasks & Progression (Deleted)**
- **tasks**: All tasks deleted
- **task_progress**: All task progress records deleted

### 6. **Sessions & Caps (Deleted/Reset)**
- **sessions**: All active sessions cleared
- **caps**: Daily and weekly earning caps reset to 0, reset dates set to current date

## Optional Tables
The function uses `to_regclass()` checks to safely handle optional tables that may not exist in all environments:
```sql
IF to_regclass('public.bot_users') IS NOT NULL THEN
  -- Only updates if table exists
END IF;
```

This pattern is applied to all optional tables, ensuring the function works across:
- Development environments (minimal schema)
- Staging environments (partial features)
- Production environments (full schema)

## Return Value
Returns a single row with:
```json
{
  "affected_rows": <total_rows_updated_or_deleted>
}
```

Example: If 50 players were reset, returns `{"affected_rows": 50}`

## Logging
All operations are logged to `rpc_event_log` table with:
- **function_name**: 'rpc_admin_reset_all'
- **log_level**: 'info' (on success) or 'error' (on failure)
- **user_id**: ID of the admin who initiated the reset
- **context**: Detailed JSON breakdown of affected rows:
  ```json
  {
    "player_rows": 50,
    "bot_rows": 10,
    "activities_cleared": 245,
    "activity_reactions_cleared": 1203,
    "inventory_cleared": 456,
    "clans_deleted": 8,
    "clan_members_deleted": 96,
    "clan_chat_deleted": 3421,
    "clan_buffs_deleted": 24,
    "tasks_deleted": 0,
    "task_progress_deleted": 0,
    "sessions_deleted": 3,
    "caps_reset": 50,
    "shop_purchases_deleted": 134
  }
  ```

## Usage from Frontend

### Via TypeScript Service Layer
```typescript
import { resetAllPlayerProgress } from './services/competitionService';

try {
  const affectedRows = await resetAllPlayerProgress();
  console.log(`Reset applied to ${affectedRows} accounts`);
} catch (error) {
  console.error('Failed to reset all progress:', error.message);
}
```

### Via Supabase REST API
```javascript
const { data, error } = await supabase.rpc('rpc_admin_reset_all');

if (error) {
  console.error('RPC error:', error);
} else {
  console.log('Rows affected:', data[0]?.affected_rows);
}
```

## Integration Points

### Admin Portal Button
Located in `components/AdminPortal.tsx`:
- Label: "Reset ALL player progress"
- Requires confirmation dialog
- Updates dashboard leaderboards on success
- Toast notification with row count

### Related Functions
- `rpc_admin_reset_user(uuid)` - Reset individual player
- `rpc_admin_refill_all_ap()` - Refill AP without full reset
- `rpc_admin_reset_pvp_wins()` - Reset only PvP scores

## Important Notes

### ⚠️ Data Destruction
This operation is **irreversible and permanent**. All player progress, purchases, and historical data are deleted. Use only in:
- Development/testing environments
- Before season resets in production
- After confirmed admin decision

### Transaction Safety
The function uses PostgreSQL's `GET DIAGNOSTICS` to track rows affected. If an error occurs mid-execution, the entire transaction rolls back (no partial state).

### Performance Considerations
- For databases with millions of rows, this operation may take 10-30 seconds
- During execution, player queries may experience slight latency
- Recommended to run during low-activity periods

### Admin Verification
Before deploying to production:
1. Confirm the calling user has `is_admin = true` in the users table
2. Verify admin permissions were granted via admin portal or SQL:
   ```sql
   UPDATE users SET is_admin = true WHERE id = '<user_uuid>';
   ```

## Troubleshooting

### 400 Bad Request Error
**Cause**: Function signature mismatch (typically a malformed return column)
**Fix**: Ensure the deployment script has been run with the latest `RETURN QUERY SELECT ... AS affected_rows;` syntax

### 403 Forbidden Error
**Cause**: User lacks admin privileges
**Fix**: Set `is_admin = true` or `role = 'admin'` for the user in the users table

### Operation Timeouts
**Cause**: Too many rows to delete in single transaction
**Fix**: Run during maintenance window or break reset into smaller operations

## Related Files
- `supabase-functions/competition_phase1.sql` - Source definition
- `DEPLOY_COMPETITION_PHASE1.sql` - Deployment script
- `services/competitionService.ts` - Frontend integration
- `components/AdminPortal.tsx` - UI implementation
- `rpc_event_log` table - Execution logs and audit trail

---

**Last Updated**: December 2, 2025  
**Status**: ✅ Fully Functional - Fixed HTTP 400 return type issue
