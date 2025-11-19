# Clan Competition System - Deployment Checklist

## Pre-Deployment

- [ ] Review `CLAN_SCORING_SYSTEM.sql` for production environment
- [ ] Backup production database
- [ ] Notify team of deployment

## Database Deployment

### Step 1: Run SQL Migration
```bash
# In Supabase SQL Editor:
1. Copy all content from CLAN_SCORING_SYSTEM.sql
2. Paste into SQL Editor
3. Execute all queries
4. Expected execution time: < 30 seconds
```

**Verify with queries:**
```sql
-- Verify pvp_score column
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'pvp_score'
-- Expected: Returns row with pvp_score

-- Verify tables exist
SELECT tablename FROM pg_tables 
WHERE tablename IN ('clans', 'clan_members')
-- Expected: Returns 2 rows (clans, clan_members)

-- Verify views exist
SELECT viewname FROM pg_views 
WHERE viewname IN ('player_total_scores', 'clan_scores')
-- Expected: Returns 2 rows

-- Verify RPC functions exist
SELECT routine_name FROM information_schema.routines 
WHERE routine_name LIKE 'rpc_%' AND routine_schema = 'public'
-- Expected: Returns 6+ rows including new RPC functions
```

- [ ] All queries executed successfully
- [ ] No error messages in SQL editor
- [ ] All verifications passed

### Step 2: Type System Update
```bash
# Already done in types.ts:
- Added pvp_score: number to Profile interface
- Added ClanMemberWithScore interface
- Added CompetitionClanScore interface
- Added CompetitionClanLeaderboardEntry interface

# Verify:
npm run build
# Should compile with no errors
```

- [ ] No TypeScript compilation errors

### Step 3: Service Layer Update
```bash
# Already done in gameService.ts:
- Added createClan() function
- Added joinClan() function
- Added leaveClan() function
- Added getClanLeaderboard() function
- Added getClanMembers() function
- Added getUserClan() function
- Added updatePvPScore() function
- Updated PvP battle logic to call updatePvPScore()

# Verify:
npm run build
# Should compile with no errors
```

- [ ] All service functions are callable
- [ ] No compilation errors
- [ ] PvP battle logic updated

## Production Testing

### Test 1: Create Clan
```typescript
const result = await createClan('Test Clan', 'Testing System');
console.log('Clan created:', result.success);
// Expected: success = true
```
- [ ] Can create clan
- [ ] Clan stored in database
- [ ] Creator is set as leader

### Test 2: Join Clan
```typescript
const result = await joinClan(clanId);
console.log('Joined clan:', result.success, 'Members:', result.memberCount);
// Expected: success = true, memberCount = 2
```
- [ ] Can join clan
- [ ] Member count increases
- [ ] Max 5 members enforced

### Test 3: Get Clan Leaderboard
```typescript
const leaderboard = await getClanLeaderboard(5);
console.log('Clans:', leaderboard.length);
// Expected: Array with clan data
```
- [ ] Returns array of clans
- [ ] Sorted by clan_total_score
- [ ] Rank is sequential

### Test 4: PvP Score Update
```typescript
const result = await updatePvPScore(userId, true);
console.log('PvP Score:', result.newPvpScore, 'Total:', result.newTotalScore);
// Expected: newPvpScore = old + 3, newTotalScore = xp + (pvp_score * 10)
```
- [ ] PvP score increases correctly
- [ ] Total score calculated correctly
- [ ] Database persists changes

### Test 5: Check Clan Members
```typescript
const members = await getClanMembers(clanId);
console.log('Members:', members.length);
members.forEach(m => console.log(m.username, m.total_score));
// Expected: Array of members with scores
```
- [ ] Returns all clan members
- [ ] Scores calculated correctly
- [ ] Ordered by total_score DESC

## Verification in Production

### Check Live Data
```sql
-- View all clans with scores
SELECT * FROM clan_scores ORDER BY clan_total_score DESC LIMIT 5;

-- Check specific player
SELECT username, xp, pvp_score, (xp + pvp_score * 10) as total_score 
FROM users WHERE username = 'player_name';

-- View clan members
SELECT * FROM rpc_get_clan_members('clan-uuid');

-- Get full leaderboard
SELECT * FROM rpc_get_clan_leaderboard(50);
```

- [ ] Clans visible in database
- [ ] Scores calculated correctly
- [ ] Leaderboard returns data

## Post-Deployment

### Monitoring (First 24 Hours)
```sql
-- Check for errors in PvP battles
-- Look for: updatePvPScore failures, clan creation errors

-- Monitor PvP score updates
SELECT COUNT(*) FROM users WHERE pvp_score > 0;
-- Should increase as players battle

-- Check clan growth
SELECT COUNT(*) FROM clans WHERE is_active = TRUE;
-- Should show active clans
```

- [ ] No errors in application logs
- [ ] PvP scores updating
- [ ] Clans being created

### Performance Monitoring
- [ ] Response time for getClanLeaderboard() < 500ms
- [ ] Response time for createClan() < 200ms
- [ ] Response time for getClanMembers() < 300ms
- [ ] Database queries using indexes efficiently

### User Communication
- [ ] Announce clan system is live
- [ ] Explain clan competition rules
- [ ] How to join/create clans
- [ ] Scoring formula (XP + pvp_score × 10)

## Rollback Procedure (If Needed)

### Quick Rollback
```sql
-- Disable clan system without deleting data
UPDATE clans SET is_active = FALSE WHERE is_active = TRUE;

-- Keep pvp_score for historical data
-- Or revert gameService.ts to not call updatePvPScore()
```

### Full Rollback
```sql
-- Drop new tables (will delete clan data!)
DROP TABLE clan_members CASCADE;
DROP TABLE clans CASCADE;

-- Drop views
DROP VIEW IF EXISTS clan_scores;
DROP VIEW IF EXISTS player_total_scores;

-- Drop RPC functions
DROP FUNCTION rpc_create_clan;
DROP FUNCTION rpc_join_clan;
DROP FUNCTION rpc_leave_clan;
DROP FUNCTION rpc_update_pvp_score;
DROP FUNCTION rpc_get_clan_leaderboard;
DROP FUNCTION rpc_get_clan_members;

-- Optional: Remove pvp_score column
-- ALTER TABLE users DROP COLUMN pvp_score;
```

- [ ] Backup taken before rollback
- [ ] Team notified
- [ ] Rollback procedure documented

## Success Criteria

✅ All database migrations executed  
✅ No compilation errors in TypeScript  
✅ All service functions callable  
✅ PvP battles update pvp_score  
✅ Clan leaderboard returns sorted data  
✅ Clan system live to users  
✅ No performance degradation  
✅ Users can create and join clans  
✅ Clan scores reflect member contributions  

## Sign-Off

- [ ] Database team approves deployment
- [ ] Backend team confirms functionality
- [ ] QA team verifies all test cases pass
- [ ] Product owner approves for release
- [ ] Deployment authorized

**Deployed by:** ________________  
**Date:** ________________  
**Version:** ________________  

---

## Important Notes

1. **No Data Loss**: Migration adds columns/tables, doesn't delete existing data
2. **Backward Compatible**: Existing PvP system continues to work
3. **Gradual Adoption**: Clans are optional, players choose to participate
4. **Safe Defaults**: pvp_score defaults to 0, all RLS policies enforced
5. **Performance**: Views use aggregates, indexes on frequently queried columns

## Support Contacts

- **Database Issues**: DBA Team
- **API Issues**: Backend Team
- **UI Components**: Frontend Team
- **Competition Rules**: Product Owner

---

**Ready for deployment!** 🚀
