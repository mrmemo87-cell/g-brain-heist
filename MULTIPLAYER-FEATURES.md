# 🎮 Multiplayer Features Guide

## Overview

Your G-Brain Heist game now has **shared multiplayer features** using localStorage! Students on the same device/browser can see each other in the game and their actions appear in the activity feed.

---

## ✅ New Features Implemented

### 1. 🎯 **Shared PvP Targets (Hack Rivals)**

**How it works:**
- When students login, their profile is automatically added to a shared list (`gbh_all_players` in localStorage)
- When students view "Hack Rival" section, they see OTHER students who have played on that device
- Each student sees real profiles: username, level, coins, batch, avatar, and shield status
- If no other students exist yet, mock targets appear as fallback

**What students see:**
- Real classmates appear as hack targets
- Current shield status shown accurately
- Win rates calculated dynamically
- Updated every time they refresh the target list

**Technical details:**
- Storage key: `gbh_all_players`
- Updated on every login via `whoami()` function
- Players filtered by ID (won't see themselves)

---

### 2. 📰 **Shared Activity Feed**

**How it works:**
- Every PvP attack (win, loss, or blocked) is logged to a shared activity feed
- All students on the same device see these events in their News Feed
- Events show: attacker name, defender name, result, and timestamp

**Event types logged:**
- `pvp_win` - Successful hack with coins stolen
- `pvp_blocked` - Attack blocked by defender's shield
- `pvp_lose` - Failed hack attempt

**What students see:**
```
🔥 NeonGhost hacked CypherPunk - Stole 50 Coins (Just now)
😂 DataWraith's attack on NeonGhost was blocked by Shield (2m ago)
```

**Technical details:**
- Storage key: `gbh_activity_feed`
- Max 50 events stored (older ones auto-deleted)
- Shown in real-time in the News Feed section

---

### 3. 🚪 **Leave Clan Button (Enhanced)**

**How it works:**
- Non-leader members can now easily leave their clan
- Two locations to leave:
  1. **Home tab** - Prominent red button at bottom left
  2. **Management tab** - In the "Danger Zone" section
- Confirmation modal prevents accidental leaves
- Leader still sees "Delete Clan" instead

**What happens when leaving:**
- Clan is removed from student's profile
- They return to "no clan" state
- Can join or create a new clan immediately
- No penalty or cooldown

**UI locations:**
- Home tab: Red "Leave Clan" button below vault/buffs
- Management tab: "Danger Zone" section (if privileged to see it)

---

## 🎓 For Educators

### Understanding the Multiplayer System

**Important Notes:**
1. **Device/Browser-Based**: Students share data only if using the same browser on the same device
2. **Not Real Multiplayer**: No server or network communication - purely localStorage
3. **Perfect for Classrooms**: Works great on shared computer labs or single devices

### Use Cases

**Best for:**
- ✅ Computer lab environments (shared computers)
- ✅ Single-device demos with multiple students
- ✅ Turn-based classroom activities
- ✅ Small groups sharing one device

**Not ideal for:**
- ❌ Students on different computers (they won't see each other)
- ❌ Different browsers on same computer (separate storage)
- ❌ Home use with no shared device

### Converting to Real Multiplayer

If you need TRUE multiplayer (students on different devices):

1. **Add a Backend**:
   - Node.js/Express server
   - Database (PostgreSQL, MongoDB)
   - Real-time updates (WebSockets or polling)

2. **Key Changes Needed**:
   - Replace localStorage calls with API calls
   - Add authentication system
   - Sync player data to server
   - Implement WebSocket for real-time activity feed

3. **Estimated Effort**: 20-40 hours for experienced developer

---

## 🔧 Technical Implementation

### New Storage Keys

```typescript
STORAGE_KEYS = {
  PROFILE: 'gbh_profile',          // Individual student
  INVENTORY: 'gbh_inventory',      // Individual student
  CLAN: 'gbh_clan',                // Individual student
  CHAT: 'gbh_chat',                // Individual student
  ALL_PLAYERS: 'gbh_all_players',  // ✨ NEW: Shared list
  ACTIVITY_FEED: 'gbh_activity_feed', // ✨ NEW: Shared events
  // ... other keys
}
```

### New Functions in `storageService.ts`

```typescript
// Add/update player in shared list
addPlayerToSharedList(profile)

// Get all registered players
getSharedPlayers()

// Add event to shared activity feed
addActivityEvent(event)

// Get all activity events
getActivityFeed()
```

### Modified Functions in `gameService.ts`

**`whoami()`** - Now registers player in shared list on every call

**`raid_targets()`** - Now returns real students from shared list

**`raid_attack()`** - Now logs events to shared activity feed

**`news_feed()`** - Now shows shared activity events

---

## 📊 Testing the Features

### Test 1: Shared PvP Targets

1. Open game in browser (Student A logs in)
2. Note their username
3. Open game in incognito/private window (Student B logs in)
4. Student B clicks "Hack Rival"
5. **Expected**: Student A appears in the target list

### Test 2: Activity Feed

1. Student A attacks Student B
2. Student B refreshes their dashboard
3. Click "Activity Feed"
4. **Expected**: See event like "Student A hacked Student B"

### Test 3: Leave Clan

1. Join a clan as non-leader member
2. Go to Clan view → Home tab
3. Scroll down
4. **Expected**: See red "Leave Clan" button
5. Click it → Confirmation modal appears
6. Confirm → Return to "no clan" state

---

## 🐛 Troubleshooting

### Issue: Students don't see each other

**Cause**: Different browsers or devices  
**Solution**: Ensure using same browser on same device

### Issue: Activity feed empty

**Cause**: No PvP attacks yet  
**Solution**: Perform a hack attack - event will appear immediately

### Issue: Leave button not visible

**Cause**: User is clan leader (see "Delete Clan" instead)  
**Solution**: Working as intended - leaders delete, members leave

### Issue: Old mock targets still showing

**Cause**: No real students in shared list yet  
**Solution**: Have 2+ students log in, then check again

---

## 📈 Future Enhancements

### Short-term (Easy)
- [ ] Show "online" status for recently active players
- [ ] Add timestamp to player list (last seen)
- [ ] Filter targets by level range
- [ ] Add "revenge" quick button in activity feed

### Medium-term (Moderate)
- [ ] Friend system (mark favorite rivals)
- [ ] Achievement events in activity feed
- [ ] Quest completion events
- [ ] Shop purchase events

### Long-term (Requires Backend)
- [ ] Real-time multiplayer with server
- [ ] Cross-device synchronization
- [ ] True online status indicators
- [ ] Matchmaking system
- [ ] Global leaderboards

---

## 🎉 Summary

Your students can now:
- ✅ **See real classmates** as hack targets
- ✅ **View shared activity feed** with everyone's actions
- ✅ **Leave clans easily** with prominent buttons

All without needing a backend server! Perfect for classroom environments with shared devices.

---

**Questions?** Check the main README.md or STUDENT-GUIDE.md for more information.

**Made with 💙 for education | October 31, 2025**
