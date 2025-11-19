# Clan Competition - Quick Start

## What Is This?
A **clan-based competition system** where teams of up to 5 players compete for the highest **total score**.

## How Scoring Works

### Player Score
```
Total Score = XP + (PvP Score × 10)

Example:
- Player has 1000 XP
- Player has 5 PvP wins = 15 PvP score
- Total = 1000 + (15 × 10) = 1150 points
```

### Clan Score
```
Clan Score = Sum of all member scores

Example:
- 5 members with 1150, 1100, 950, 890, 800
- Clan Score = 4890 points
```

### PvP Score Gains
- **Win**: +3 PvP score
- **Loss**: +1 PvP score

## Quick Implementation

### 1. Deploy Database
Run `CLAN_SCORING_SYSTEM.sql` in Supabase:
- Adds `pvp_score` column
- Creates `clans` and `clan_members` tables
- Creates RPC functions for clan management

### 2. Verify Types
`types.ts` already updated with:
- `Profile.pvp_score`
- `Clan`, `ClanMember`, `ClanScore` interfaces

### 3. Use Service Functions
In `gameService.ts`, functions ready to use:
```typescript
// Create clan
await createClan('Team Alpha', 'Our awesome team');

// Join clan
await joinClan(clanId);

// Get leaderboard
const leaderboard = await getClanLeaderboard(20);

// Get clan members
const members = await getClanMembers(clanId);
```

### 4. PvP Battles
Already integrated! When players:
- **Win PvP**: +3 PvP score
- **Lose PvP**: +1 PvP score
- Clan score updates automatically

## Database Schema

### New Columns
```sql
users.pvp_score INTEGER DEFAULT 0
```

### New Tables
```sql
clans (id, name, description, leader_id, avatar_url, is_active, created_at)
clan_members (id, clan_id, player_id, role, joined_at)
```

### Constraints
- Clan names are unique
- Max 5 members per clan
- Only one clan per player
- Leader required to create clan

## Admin Verification

### Check if migration worked
```sql
-- Verify pvp_score column exists
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'pvp_score';

-- Check clans table
SELECT * FROM clans LIMIT 5;

-- View clan scores
SELECT * FROM clan_scores ORDER BY clan_total_score DESC;
```

## Features Implemented

✅ PvP score tracking (+3 wins, +1 losses)  
✅ Clan creation and joining  
✅ Max 5 members per clan  
✅ Automatic score calculation  
✅ Clan leaderboard  
✅ Member score breakdown  

## What's Next (UI Components)

Create React components for:
1. **Clan Browser** - Browse all clans
2. **Clan Creation** - Modal to create new clan
3. **Clan Details** - View clan members and scores
4. **Clan Leaderboard** - Ranked clan list
5. **Clan Management** - Leader controls (name, description, etc)

## Testing the System

### Test Creation
```typescript
const result = await createClan('Test Clan', 'Testing');
console.log(result.success ? 'Clan created!' : result.error);
```

### Test Joining
```typescript
const result = await joinClan(clanId);
console.log(result.success ? `Joined! ${result.memberCount}/5 members` : result.error);
```

### Test Leaderboard
```typescript
const clans = await getClanLeaderboard(5);
clans.forEach(c => console.log(`${c.clan_name}: ${c.clan_total_score}`));
```

## Important Notes

1. **Score Updates**: Happen immediately after PvP battles
2. **Clan Limit**: Max 5 members ensures balanced teams
3. **Score Formula**: XP is primary, PvP is multiplier (×10)
4. **Participation**: Even losses give +1 PvP score
5. **Unique Names**: Clan names cannot be duplicated

## Troubleshooting

**Q: Clan not created?**  
A: Check if user already in a clan or if name is taken

**Q: Can't join clan?**  
A: Check if clan has space (max 5) or if user already in clan

**Q: Scores not updating?**  
A: Verify PvP battles are completing and `updatePvPScore()` is called

**Q: Leaderboard empty?**  
A: Verify clans exist with at least 1 member in `clan_scores` view
