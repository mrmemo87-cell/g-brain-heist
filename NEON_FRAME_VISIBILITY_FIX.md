# Neon Frame Visibility Fix - Setup Guide

## Problem
Users with active neon frames were not showing the glow effect to other players in Leaderboards, Clan rosters, and PvP views. The avatar would glow to themselves but not to others.

## Root Cause
The neon frame status was only stored in the `inventory` table, which had RLS (Row Level Security) restrictions preventing other users from querying it. We needed to expose the cosmetic status in a more accessible location.

## Solution
We now:
1. Store `active_cosmetic_frame` status in the `users` table (public profile info)
2. Update the `users` table whenever a cosmetic is activated/deactivated
3. Query the `users` table instead of `inventory` when checking cosmetic status for display purposes

## Migration Steps

### Step 1: Add the column to users table
Run this SQL in your Supabase dashboard:

```sql
-- File: ADD_NEON_COLUMN_TO_USERS.sql
ALTER TABLE users
ADD COLUMN IF NOT EXISTS active_cosmetic_frame VARCHAR(20) DEFAULT NULL;

ALTER TABLE users
ADD CONSTRAINT check_active_cosmetic_frame 
  CHECK (active_cosmetic_frame IS NULL OR active_cosmetic_frame = 'neon')
  NOT VALID;

CREATE INDEX IF NOT EXISTS idx_users_active_cosmetic_frame
ON users(active_cosmetic_frame)
WHERE active_cosmetic_frame IS NOT NULL;
```

### Step 2: Sync existing neon frames
Run this SQL to populate existing active neon frames:

```sql
UPDATE users
SET active_cosmetic_frame = 'neon'
WHERE id IN (
    SELECT DISTINCT inv.user_id
    FROM inventory inv
    WHERE inv.state = 'active'
      AND inv.kind = 'cosmetic'
      AND inv.item_id = 'item_cosmetic_frame'
);
```

### Step 3: Create the RPC function (optional, for fallback)
If needed, you can create an RPC function for cross-user queries:

```sql
-- File: GET_NEON_FRAME_OWNERS.sql
CREATE OR REPLACE FUNCTION rpc_get_users_with_neon(p_user_ids UUID[])
RETURNS TABLE (user_id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT inv.user_id
  FROM inventory inv
  WHERE inv.user_id = ANY(p_user_ids)
    AND inv.state = 'active'
    AND inv.kind = 'cosmetic'
    AND inv.item_id = 'item_cosmetic_frame';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_get_users_with_neon(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_get_users_with_neon(UUID[]) TO anon;
```

## Code Changes

### cosmeticService.ts
- Now queries `users` table first (faster, no RLS issues)
- Falls back to `inventory` table if needed
- Has RPC fallback as last resort

### gameService.ts
- `inventory_activate`: Updates `users.active_cosmetic_frame = 'neon'` when cosmetic activated
- `deactivate_neon_frame`: Clears `users.active_cosmetic_frame = null` when deactivated
- `getActiveCosmeticFrame`: Syncs inventory status back to users table automatically

## Testing
After running migrations:
1. Have a user activate a neon frame in Settings > Cosmetics
2. View their profile in:
   - Leaderboard rows
   - Leaderboard clan member modal
   - PvP target list
   - Clan member lists
   - Clan browse view
3. The neon glow should now be visible to all players

## Benefits
- ✅ Neon frames visible everywhere across the game
- ✅ No RLS permission issues
- ✅ Faster queries (users table indexed)
- ✅ Automatic sync when cosmetics change
- ✅ Consistent experience in all views
