# Clan Competition System - Implementation Guide

## Overview
Complete clan-based scoring system where clans compete based on **total score** of their members.

**Formula:**
- **Player Total Score** = XP + (PvP Score × 10)
- **Clan Score** = Sum of all member total scores (max 5 members)
- **Competition**: Highest clan score wins

## Features

### 1. PvP Score Tracking
- **Win**: +3 PvP score
- **Loss**: +1 PvP score
- Automatic update on every PvP battle result
- Contributes to both individual and clan scores

### 2. Clan System
- **Create Clan**: Leader creates clan for competition
- **Join Clan**: Players join existing clans (max 5 members per clan)
- **Leave Clan**: Players can leave (clan disbanded if leader leaves)
- **Unique Names**: Each clan has a unique name

### 3. Clan Leaderboard
- **Ranked by**: Total clan score (sum of member scores)
- **Tiebreakers**: 
  1. Highest average member score
  2. Highest individual member score
  3. Most recent activity
- **Member Count**: 1-5 players per clan

## Database Changes

### New Columns
- `users.pvp_score` - INTEGER, default 0

### New Tables
- `clans` - Clan information (id, name, description, leader_id, avatar_url, is_active)
- `clan_members` - Clan membership (clan_id, player_id, role, joined_at)

### New Views
- `player_total_scores` - Player scores with total_score calculated
- `clan_scores` - Clan information with aggregated scores

### New RPC Functions
- `rpc_create_clan(name, description, avatar_url)` - Create new clan
- `rpc_join_clan(clan_id)` - Join existing clan
- `rpc_leave_clan()` - Leave current clan
- `rpc_update_pvp_score(user_id, is_win)` - Update PvP score after battle
- `rpc_get_clan_leaderboard(limit)` - Get ranked clan list
- `rpc_get_clan_members(clan_id)` - Get clan members with scores

## Implementation Steps

### Step 1: Deploy Database Migration
```bash
# In Supabase SQL Editor, run:
# CLAN_SCORING_SYSTEM.sql
```

**Verifies:**
- `pvp_score` column added to users table
- `clans` table created with correct structure
- `clan_members` table created with max 5 members per clan
- All RPC functions available
- Views calculating scores correctly

### Step 2: Update TypeScript Types
✅ Already done in `types.ts`:
- Added `pvp_score: number` to Profile interface
- Added Clan interface
- Added ClanMember interface
- Added ClanScore interface
- Added ClanLeaderboardEntry interface

### Step 3: Integrate Clan Services
✅ Already done in `gameService.ts`:
- `createClan(name, description?, avatarUrl?)` - Create clan
- `joinClan(clanId)` - Join clan
- `leaveClan()` - Leave clan
- `getClanLeaderboard(limit)` - Get clan rankings
- `getClanMembers(clanId)` - Get members with scores
- `getUserClan(userId)` - Get user's clan
- `updatePvPScore(userId, isWin)` - Update PvP score

### Step 4: Update PvP Battle Logic
✅ Already done in `gameService.ts`:
- On PvP win: `updatePvPScore(user.id, true)` → +3 points
- On PvP loss: `updatePvPScore(user.id, false)` → +1 point
- Automatic clan score recalculation

### Step 5: Create UI Components (TODO)
Components needed:
- **ClanCreationModal** - Create new clan
- **ClanBrowserView** - Browse and join clans
- **ClanLeaderboardView** - View all clans ranked by score
- **ClanDetailsView** - See clan members and scores
- **ClanManagementPanel** - Manage clan settings (for leader)

### Step 6: Add Routes (TODO)
- `/clans` - Clan browser/leaderboard
- `/clan/:id` - Clan details
- `/clan/:id/manage` - Clan management (leader only)

## Usage Examples

### Create a Clan
```typescript
const result = await createClan('Alpha Team', 'Top tier clan', 'avatar-url');
if (result.success) {
    console.log('Clan created:', result.clanId);
}
```

### Join a Clan
```typescript
const result = await joinClan(clanId);
if (result.success) {
    console.log(`Joined! Members: ${result.memberCount}/5`);
}
```

### Get Clan Leaderboard
```typescript
const leaderboard = await getClanLeaderboard(20);
leaderboard.forEach((clan, index) => {
    console.log(`${clan.rank}. ${clan.clan_name}: ${clan.clan_total_score} points`);
});
```

### Get Clan Members
```typescript
const members = await getClanMembers(clanId);
members.forEach(member => {
    console.log(`${member.username}: ${member.total_score} points`);
});
```

## Scoring Mechanics

### Individual Player Score
```
total_score = xp + (pvp_score * 10)

Example:
- Player with 1000 XP and 5 PvP wins (pvp_score = 15)
- total_score = 1000 + (15 * 10) = 1150
```

### Clan Score
```
clan_score = sum(all member total_scores)

Example:
- 5 members with scores: 1150, 1100, 950, 890, 800
- clan_score = 1150 + 1100 + 950 + 890 + 800 = 4890
```

### PvP Score Increment
```
Win: pvp_score += 3    (significant boost)
Loss: pvp_score += 1   (participation reward)

Example of quick progression:
- 10 wins = 30 points × 10 = 300 total score boost
- This encourages PvP participation
```

## Competition Format Ideas

### Format 1: Weekly Clan Wars
- Reset leaderboard each week
- Clans compete for highest score
- Winning clan gets special rewards
- Best for quick seasonal tournaments

### Format 2: Season-Based (Monthly/Quarterly)
- Longer season = more stable standings
- Mid-season can add special events
- Accumulation of wins matters
- Better for ranking accuracy

### Format 3: Tournament Brackets
- 8 clans per bracket
- Direct clan vs clan battles
- Aggregate member scores to determine winner
- Knockout format

## Verification Queries

### Check PvP Scores Updated
```sql
SELECT username, xp, pvp_score, (xp + (pvp_score * 10)) as total_score
FROM users
WHERE pvp_score > 0
ORDER BY total_score DESC
LIMIT 10;
```

### View All Clans
```sql
SELECT * FROM clan_scores
ORDER BY clan_total_score DESC;
```

### View Specific Clan Members
```sql
SELECT * FROM rpc_get_clan_members('clan-uuid');
```

### Get Full Clan Leaderboard
```sql
SELECT * FROM rpc_get_clan_leaderboard(50);
```

## Testing Checklist

- [ ] Database migration runs without errors
- [ ] `users.pvp_score` column exists and defaults to 0
- [ ] `clans` table created with correct structure
- [ ] `clan_members` max 5 per clan enforced
- [ ] Create clan function works
- [ ] Join clan function works
- [ ] Leave clan function works
- [ ] PvP win updates pvp_score to +3
- [ ] PvP loss updates pvp_score to +1
- [ ] Clan score calculated correctly (sum of member scores)
- [ ] Clan leaderboard returns sorted by score
- [ ] New clan members affect clan score immediately
- [ ] Clan score updates after each PvP battle

## Performance Considerations

### Indexes
- `idx_clan_members_clan_id` - Fast member lookups
- `idx_clan_members_player_id` - Fast clan lookups for players
- `idx_users_pvp_score` - Fast sorting by PvP score

### Query Optimization
- Views pre-calculate totals
- RPC functions use efficient joins
- Leaderboard queries use aggregates

### Scalability
- Max 5 members per clan = small clan tables
- Views are materialized on-demand
- No complex recursive queries

## Future Enhancements

1. **Clan Buffs**: Leader can activate clan-wide bonuses
2. **Territory Control**: Clans can own areas for bonus XP
3. **Clan Quests**: Special missions that reward clan score
4. **Raid Participation**: Clan raids give bonus XP
5. **Season Rewards**: Top clans get cosmetics/titles
6. **Clan Chat**: Private messaging for clan members
7. **Clan Leveling**: Clan levels up with member activity
