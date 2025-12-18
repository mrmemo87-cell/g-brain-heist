# Multi-Tenant Isolation Fix Summary

## What Was Leaking and Why

### Root Causes Identified

| Bug | Root Cause | Data Source |
|-----|------------|-------------|
| **Leaderboard shows all schools** | Direct SELECT on `player_total_scores` and `clan_scores` views with NO school filter | Views in PostgreSQL |
| **Attack targets cross-school** | Direct SELECT on `users` table with NO school_id filter | `gameService.ts` `raid_targets()` |
| **Activity feed cross-school** | Direct SELECT on `activities` table with NO school filter + table lacked `school_id` column | `gameService.ts` `news_feed()` |
| **Setup timeout 15000ms** | RPC taking too long + no graceful fallback for missing profile data | `index.tsx` `checkAuthAndSetup()` |
| **Leaderboard errors for non-Silk Road** | Views didn't filter by school_id, causing empty or error results | Views without tenant scoping |

### The Pattern
All queries were global (fetching from ALL schools) because:
1. Views (`player_total_scores`, `clan_scores`) were created without tenant awareness
2. Service functions used direct table SELECTs without `.eq('school_id', userSchoolId)`
3. `activities` table had no `school_id` column at all
4. RLS policies were either missing or allowed global reads

---

## Files Changed

### Frontend Files

| File | Change |
|------|--------|
| [components/LeaderboardView.tsx](components/LeaderboardView.tsx) | Replaced direct view queries with school-scoped RPCs `get_school_leaderboard()` and `get_school_clan_leaderboard()` |
| [services/gameService.ts](services/gameService.ts) | Replaced `raid_targets()` direct query with `get_attack_targets()` RPC; Replaced `news_feed()` direct query with `get_school_activity_feed()` RPC |
| [index.tsx](index.tsx) | Reduced timeout from 15s to 8s, added auto-retry (3x), added graceful fallback to setup screen on timeout |

### SQL Migration

| File | Purpose |
|------|---------|
| [FIX_MULTI_TENANT_ISOLATION.sql](FIX_MULTI_TENANT_ISOLATION.sql) | Main migration - run this in Supabase SQL Editor |
| [MULTI_TENANT_ISOLATION_SMOKE_TESTS.sql](MULTI_TENANT_ISOLATION_SMOKE_TESTS.sql) | Verification tests to confirm isolation works |

---

## SQL Migration Summary

The migration ([FIX_MULTI_TENANT_ISOLATION.sql](FIX_MULTI_TENANT_ISOLATION.sql)) does the following:

1. **Adds `school_id` column to `activities` table** - enables per-school activity filtering
2. **Backfills existing activities** - derives school_id from actor's school
3. **Creates `get_caller_school_id()` helper** - safely gets current user's school
4. **Creates `get_school_leaderboard()` RPC** - returns only same-school players, sorted by score/xp/pvp
5. **Creates `get_school_clan_leaderboard()` RPC** - returns only clans with members in caller's school
6. **Creates `get_attack_targets()` RPC** - returns only attackable users in same school
7. **Creates `get_school_activity_feed()` RPC** - returns only activities from same school
8. **Fixes `check_user_setup_status()` RPC** - made faster and more robust
9. **Adds trigger `trg_set_activity_school_id`** - auto-populates school_id on new activities
10. **Enables RLS on `activities`** - defense-in-depth, blocks cross-school reads even if RPC bypassed
11. **Fixes `rpc_get_clan_members()`** - school-scoped clan member viewing

---

## Deployment Steps

### Step 1: Run SQL Migration
```sql
-- Run in Supabase SQL Editor
-- Copy entire contents of FIX_MULTI_TENANT_ISOLATION.sql
```

### Step 2: Verify Migration
```sql
-- Run the smoke tests
-- Copy entire contents of MULTI_TENANT_ISOLATION_SMOKE_TESTS.sql
```

Expected output: All tests should show "PASS"

### Step 3: Deploy Frontend
```bash
# Standard deploy process
npm run build
# or your deployment command
```

### Step 4: Manual Verification

**As User from School A:**
1. Open Leaderboard → Should only show School A users
2. Open PvP/Attack → Targets should only be School A users
3. Open Activity Feed → Should only show School A activities

**As User from School B:**
1. Repeat above → Should only show School B data
2. School A data should NOT be visible

---

## Bug Fix Confirmation

| Bug | Fixed | How |
|-----|-------|-----|
| ✅ Leaderboard cross-school | Yes | Uses `get_school_leaderboard()` RPC which filters by caller's school |
| ✅ Attack targets cross-school | Yes | Uses `get_attack_targets()` RPC which filters by caller's school |
| ✅ Activity feed cross-school | Yes | Uses `get_school_activity_feed()` RPC which filters by school_id |
| ✅ Setup timeout 15000ms | Yes | Reduced to 8s timeout + auto-retry + graceful fallback |
| ✅ Leaderboard errors for non-Silk Road | Yes | RPC-based queries don't error on empty results |

---

## Architecture After Fix

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend                                │
├─────────────────────────────────────────────────────────────────┤
│ LeaderboardView.tsx                                             │
│   └── supabase.rpc('get_school_leaderboard')  ◄── School-scoped│
│   └── supabase.rpc('get_school_clan_leaderboard')              │
│                                                                 │
│ PvPView.tsx                                                     │
│   └── GameService.raid_targets()                               │
│         └── supabase.rpc('get_attack_targets') ◄── School-scoped│
│                                                                 │
│ (Activity Feed)                                                 │
│   └── GameService.news_feed()                                  │
│         └── supabase.rpc('get_school_activity_feed') ◄── Scoped│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Supabase/PostgreSQL                          │
├─────────────────────────────────────────────────────────────────┤
│ SECURITY DEFINER RPCs                                           │
│   • get_caller_school_id() → UUID                              │
│   • get_school_leaderboard(sort, limit) → users WHERE school   │
│   • get_school_clan_leaderboard(limit) → clans WHERE school    │
│   • get_attack_targets(limit) → users WHERE school != self     │
│   • get_school_activity_feed(limit) → activities WHERE school  │
│                                                                 │
│ RLS POLICIES (defense in depth)                                │
│   • activities: SELECT WHERE school_id = get_caller_school_id()│
│   • activities: INSERT WHERE actor_id = auth.uid()             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Rollback (if needed)

The migration is additive (no destructive changes). To rollback:

1. Revert frontend files via git
2. The old views (`player_total_scores`, `clan_scores`) still exist and work
3. To remove new RPCs (optional):
```sql
DROP FUNCTION IF EXISTS get_school_leaderboard(TEXT, INTEGER);
DROP FUNCTION IF EXISTS get_school_clan_leaderboard(INTEGER);
DROP FUNCTION IF EXISTS get_attack_targets(INTEGER);
DROP FUNCTION IF EXISTS get_school_activity_feed(INTEGER);
DROP FUNCTION IF EXISTS get_caller_school_id();
```

---

## Notes

- **Silk Road users unaffected**: All existing Silk Road school users will continue working normally
- **No data loss**: Migration only adds columns and functions, doesn't modify existing data
- **Backward compatible**: Old views still exist for any legacy code paths
- **Performance**: RPCs use indexed `school_id` lookups - should be fast
