# Lockdown Mode Testing Guide

## Quick Test Procedure

Follow these steps to verify that lockdown mode is working correctly with real-time updates, zone accessibility, and proper battle score calculations.

---

## 🧪 Test 1: Real-Time Connection & Sync (2 minutes)

### Setup
1. Open two browser windows (or use incognito for second window)
2. Window 1: Login as **teacher**
3. Window 2: Login as **student** (with clan assigned)

### Test Steps

#### Teacher Window:
1. Click **"Lockdown Mode"** button
2. Click **"HOST NEW OPERATION"**
3. Note the 4-digit room code displayed
4. Keep this window visible

#### Student Window:
1. Click **"Lockdown Mode"** button
2. Enter the room code from teacher
3. Click **"JOIN ROOM"**
4. **VERIFY**: Student name appears in teacher's "Active Agents" list within 2 seconds ✅

#### Real-Time Sync Test:
5. Teacher clicks **"START OPERATION"**
6. **VERIFY**: Student screen changes to active game phase immediately ✅
7. Student answers a question correctly
8. **VERIFY**: Teacher sees coin total increase instantly ✅
9. **VERIFY**: Teacher sees alarm level update if wrong answer ✅
10. Watch timer count down
11. **VERIFY**: Both screens show same time remaining ✅

### Expected Results
- ✅ Connection established in < 2 seconds
- ✅ All state changes appear on both screens instantly
- ✅ No lag or delay in updates
- ✅ Timer synchronized between teacher and student

---

## 🗺️ Test 2: Zone Accessibility (1 minute)

### Setup
- Continue from Test 1 with game active
- Use student window

### Test Steps

1. Look at the zone selection screen (if in Clan Wars mode)
2. Count available zones
3. **VERIFY**: All 8 zones are visible ✅
   - zone-1: Server Room
   - zone-2: Mainframe
   - zone-3: Security Hub
   - zone-4: Data Vault
   - zone-5: Power Grid
   - zone-6: Network Core
   - zone-7: Quantum Nexus ⭐
   - zone-8: Signal Chamber ⭐

4. Click on each zone
5. **VERIFY**: Each zone is clickable and selectable ✅
6. Select "Quantum Nexus" (zone-7)
7. **VERIFY**: Zone 7 is properly selected and accessible ✅
8. Select "Signal Chamber" (zone-8)
9. **VERIFY**: Zone 8 is properly selected and accessible ✅

### Expected Results
- ✅ All 8 zones are visible and selectable
- ✅ No zones are grayed out or disabled
- ✅ Previously unreachable zones (7 & 8) now work
- ✅ Teacher map shows all 8 regions

---

## 🎯 Test 3: Battle Score Calculation (3 minutes)

### Setup
- Continue from previous tests
- Student has selected a zone
- Have questions ready to answer

### Test Steps & Verification

#### Baseline Score:
1. Note student's current battle score: `_____`
2. Note student's current streak: `_____`

#### Test Case 1: Basic Correct Answer
3. Answer a question **correctly** (take > 5 seconds)
4. **VERIFY**: Battle score increases by **+1** ✅
5. **VERIFY**: Streak increases by **+1** ✅
6. **FORMULA**: Base correct (1) = +1 point

#### Test Case 2: Fast Answer Bonus
7. Answer next question **correctly** in < 5 seconds
8. **VERIFY**: Battle score increases by **+2** ✅
9. **VERIFY**: Streak is now 2 ✅
10. **FORMULA**: Base (1) + Fast bonus (1) = +2 points

#### Test Case 3: Streak Bonus
11. Answer 3rd question **correctly** (any speed)
12. **VERIFY**: Streak is now 3 ✅
13. Answer 4th question **correctly**
14. **VERIFY**: Battle score increases by **+2 or +3** ✅
15. **FORMULA**: Base (1) + Streak bonus (1) = +2, or Base (1) + Fast (1) + Streak (1) = +3

#### Test Case 4: Wrong Answer
16. Answer next question **incorrectly**
17. **VERIFY**: Battle score stays the same (no increase) ✅
18. **VERIFY**: Streak resets to **0** ✅

#### Test Case 5: Zone Influence
19. Check teacher's territory map
20. **VERIFY**: Your clan's color is stronger in your selected zone ✅
21. **FORMULA**: Each score point = +10 influence

### Expected Score Breakdown

| Scenario | Base | Fast | Streak | Total Points |
|----------|------|------|--------|--------------|
| Correct (slow) | +1 | 0 | 0 | **+1** |
| Correct (fast) | +1 | +1 | 0 | **+2** |
| Correct (every 3rd) | +1 | 0 | +1 | **+2** |
| Correct (fast, every 3rd) | +1 | +1 | +1 | **+3** |
| Incorrect | 0 | 0 | -streak | **0** |

---

## 🏆 Test 4: End Game & Rewards (2 minutes)

### Setup
- Continue playing until game ends (timer expires or goal reached)

### Test Steps

#### Game End:
1. Wait for game to end
2. **VERIFY**: Both teacher and student see "ENDED" phase ✅
3. **VERIFY**: Results screen displays on both screens ✅

#### Teacher Results:
4. Teacher sees:
   - Final territory map with zone colors
   - Winning clan displayed
   - Player rewards breakdown
5. **VERIFY**: Clan with most zone control wins ✅
6. **VERIFY**: Zone control correctly calculated (highest influence) ✅

#### Student Results:
7. Student sees:
   - Own battle score
   - Coins earned (if on winning clan)
   - XP earned
   - Gems earned (if eligible)
8. **VERIFY**: Battle score matches expected value ✅
9. **VERIFY**: Rewards proportional to contribution ✅

#### Reward Verification:
10. Check reward values:
    - **Coins**: Should be (your score / team total) × 100,000 (max 20,000)
    - **XP**: Should be (your score / team total) × 5,000 (max 1,000)
    - **Gems**: Only if 5+ questions + 50%+ accuracy (max 1)
11. **VERIFY**: Calculations are correct ✅
12. **VERIFY**: Only winning clan gets rewards ✅

---

## 🚨 Test 5: Panic Mode (1 minute)

### Setup
- Start a new game
- Have students answer questions

### Test Steps

1. Answer questions incorrectly to raise alarm
2. Watch alarm percentage increase
3. When alarm reaches **75%** or time < 30 seconds:
4. **VERIFY**: "PANIC MODE ACTIVE" badge appears on teacher screen ✅
5. **VERIFY**: "Panic Mode" indicator shows on student screen ✅
6. **VERIFY**: Both badges are animated/pulsing ✅
7. **VERIFY**: Safe route becomes disabled (if applicable) ✅

---

## 🎮 Test 6: Teacher Controls (1 minute)

### Setup
- Teacher has active game running

### Test Steps

#### Pause/Resume:
1. Teacher clicks **"PAUSE"** button
2. **VERIFY**: Student sees "Operation Paused" message immediately ✅
3. Teacher clicks **"RESUME"** button
4. **VERIFY**: Student returns to active game instantly ✅

#### Force Panic:
5. Teacher clicks **"TRIGGER PANIC"** button
6. **VERIFY**: Panic mode activates on both screens ✅
7. **VERIFY**: Panic badge appears within 1 second ✅

#### Kick Player:
8. Teacher hovers over a player in the list
9. Teacher clicks **"Remove"** button
10. **VERIFY**: Player disappears from list immediately ✅
11. **VERIFY**: Kicked student sees disconnection message ✅

---

## 📊 Performance Benchmarks

### Expected Timings
- **Join room**: < 2 seconds
- **State sync**: < 350ms (action to UI update)
- **Map update**: < 200ms after answer
- **Score update**: Instant (< 100ms)

### How to Measure
1. Open browser DevTools (F12)
2. Go to **Network** tab
3. Filter by **WS** (WebSocket)
4. Watch for `game_action` and `game_state` messages
5. Check timestamps between messages

### Acceptable Performance
- ✅ Action → State: < 100ms
- ✅ State → Broadcast: < 200ms
- ✅ UI Re-render: < 50ms
- ⚠️ Total > 500ms: Check network/connection

---

## 🐛 Troubleshooting

### Issue: Student doesn't see updates
**Check:**
1. Browser console for errors
2. Network tab for WebSocket connection
3. Supabase Realtime status indicator
4. Try refreshing student window

**Fix:**
- Ensure both users are connected to internet
- Check Supabase project is active
- Verify room code is correct

### Issue: Scores not calculating correctly
**Check:**
1. Answer timing (< 5 seconds for fast bonus)
2. Streak count (every 3rd answer)
3. Question correctness

**Expected Values:**
- Slow correct: +1
- Fast correct: +2
- 3-in-a-row (4th answer): +2 or +3
- Wrong: 0 (streak resets)

### Issue: Zones not accessible
**Check:**
1. ZONES array has 8 entries
2. Zone initialization in INITIAL_STATE
3. Zone selection UI shows all zones

**Verify:**
- Open `src/features/clanTerritory/clanTerritoryTypes.ts`
- Confirm zones 1-8 are defined
- Check lines 35-44

### Issue: Map not updating
**Check:**
1. `calculateRegionStats()` is called
2. `regionStats` prop passed to LockdownMap
3. useMemo dependencies include gameState

**Debug:**
- Add console.log in regionCalculator.ts
- Check if state changes trigger recalculation
- Verify map component re-renders

---

## ✅ Test Results Template

Copy this template to record your test results:

```
LOCKDOWN MODE TEST RESULTS
Date: ___________
Tester: ___________

[ ] Test 1: Real-Time Sync - PASS / FAIL
    Notes: _______________________________

[ ] Test 2: Zone Accessibility - PASS / FAIL
    Zones accessible: __ / 8
    Notes: _______________________________

[ ] Test 3: Battle Score - PASS / FAIL
    Base correct: +___ (expected +1)
    Fast bonus: +___ (expected +2 total)
    Streak bonus: +___ (expected +2 or +3)
    Notes: _______________________________

[ ] Test 4: Rewards - PASS / FAIL
    Coins: _____ (proportional to score?)
    XP: _____ (proportional to score?)
    Gems: _____ (eligible?)
    Notes: _______________________________

[ ] Test 5: Panic Mode - PASS / FAIL
    Triggered at: ___% alarm
    Visible on both screens?
    Notes: _______________________________

[ ] Test 6: Teacher Controls - PASS / FAIL
    Pause/Resume: working?
    Force Panic: working?
    Kick Player: working?
    Notes: _______________________________

OVERALL RESULT: PASS / FAIL
Performance: Good / Acceptable / Poor
Issues Found: ___________________________
```

---

## 🎯 Quick Checklist

Use this for rapid verification:

- [ ] ✅ Teacher can create room
- [ ] ✅ Student can join with code
- [ ] ✅ Player appears in teacher list instantly
- [ ] ✅ Game starts on both screens simultaneously
- [ ] ✅ All 8 zones visible and selectable
- [ ] ✅ Battle score increases correctly (+1, +2, +3)
- [ ] ✅ Streak resets on wrong answer
- [ ] ✅ Zone influence increases with correct answers
- [ ] ✅ Territory map updates in real-time
- [ ] ✅ Timer counts down on both screens
- [ ] ✅ Panic mode activates correctly
- [ ] ✅ Rewards calculated based on score share
- [ ] ✅ Teacher controls work instantly
- [ ] ✅ No lag or delays (< 350ms latency)

**If all checked: System is PRODUCTION READY! ✅**

---

## 📞 Support

If you encounter issues not covered in troubleshooting:
1. Check browser console for errors
2. Verify Supabase project status
3. Review LOCKDOWN_MODE_VERIFICATION.md for technical details
4. Check network connection for both users

---

**Good luck with testing! 🚀**
