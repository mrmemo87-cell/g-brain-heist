# 🧪 Local Testing Guide - G-Brain Heist

## Prerequisites

### 1. Deploy Database Migrations to Supabase

**Run these SQL files in Supabase SQL Editor** (in order):

```sql
-- 1. AP Regeneration (supabase-functions/migration_add_ap_regen.sql)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'last_ap_update'
    ) THEN
        ALTER TABLE users ADD COLUMN last_ap_update TIMESTAMPTZ DEFAULT NOW();
        UPDATE users SET last_ap_update = NOW() WHERE last_ap_update IS NULL;
    END IF;
END $$;

-- 2. Level-Up Rewards (supabase-functions/rpc_grant_levelup_rewards.sql)
CREATE OR REPLACE FUNCTION rpc_grant_levelup_rewards(p_user_id UUID, p_new_level INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_coins_reward INTEGER;
BEGIN
  v_coins_reward := p_new_level * 100;
  
  UPDATE users
  SET 
    coins = coins + v_coins_reward,
    ap_now = ap_max
  WHERE id = p_user_id;
  
  RETURN jsonb_build_object(
    'coins', v_coins_reward,
    'ap_refill', true
  );
END;
$$;

-- 3. Achievements Schema (supabase-functions/achievements_schema.sql)
-- [Run the full file - creates achievements and user_achievements tables]

-- 4. Achievement Checker (supabase-functions/rpc_check_achievements.sql)
-- [Run the full file - creates rpc_check_achievements function]

-- 5. Tutorial Column (supabase-functions/migration_add_tutorial.sql)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'tutorial_completed'
    ) THEN
        ALTER TABLE users ADD COLUMN tutorial_completed BOOLEAN DEFAULT FALSE;
        UPDATE users SET tutorial_completed = FALSE WHERE tutorial_completed IS NULL;
    END IF;
END $$;
```

### 2. Start Local Development Server

```powershell
# In your terminal
cd C:\Users\reigh\OneDrive\Documents\GitHub\g-brain-heist
npm run dev
```

Open browser to: **http://localhost:5173**

---

## ✅ Feature Testing Checklist

### 1. AP Regeneration System ⚡

- [ ] **Login** and check header shows current AP
- [ ] **Wait 10 minutes** (or modify `last_ap_update` in DB to 11 minutes ago)
- [ ] **Refresh page** - AP should increase by 1
- [ ] **Check countdown timer** - Header should show "next AP in Xm Ys"
- [ ] **Max AP check** - Countdown disappears when AP = 20

**Test Query** (run in Supabase SQL Editor to fast-forward time):
```sql
UPDATE users 
SET last_ap_update = NOW() - INTERVAL '11 minutes' 
WHERE username = 'YOUR_USERNAME';
```

---

### 2. Task Claim Rewards 🎁

- [ ] **View Dashboard** - See daily/weekly tasks
- [ ] **Complete a task** (e.g., complete 3 quests by doing quests)
- [ ] **Claim button appears** when progress = target
- [ ] **Click "✨ Claim"** button
- [ ] **Hear tada sound** effect
- [ ] **See "✓ Claimed"** status
- [ ] **Check XP/coins increased** in profile
- [ ] **Next day** - Claimed status resets (localStorage clears)

**Manual Test** (browser console):
```javascript
localStorage.setItem('task_claims_2025-11-01', JSON.stringify(['task_daily_1']));
// Refresh page - task should show as claimed
```

---

### 3. Level-Up Modal 🎉

- [ ] **Gain enough XP** to level up (complete quests/PvP)
- [ ] **Modal appears** automatically with celebration
- [ ] **Check rewards display**: 
  - Coins granted (100 × new level)
  - AP refilled to max
  - XP bonus mentioned
- [ ] **Hear tada sound** effect
- [ ] **Close modal** - returns to game
- [ ] **Verify profile** - coins increased, AP = max

**Fast Test** (Supabase SQL):
```sql
-- Give yourself XP to level up
UPDATE users 
SET xp = xp + 1000 
WHERE username = 'YOUR_USERNAME';
```

---

### 4. Real-Time PvP Notifications 🔔

- [ ] **Have 2 accounts** logged in (or ask someone to attack you)
- [ ] **Get attacked in PvP** by another player
- [ ] **Toast appears**: "⚔️ [Attacker] hacked you!" (if successful)
- [ ] **Shield blocks**: "🛡️ Your shield blocked [Attacker]'s attack!"
- [ ] **Toast is red** (error type) for successful hacks
- [ ] **Toast is green** (success type) for blocks

**Test Query** (simulate attack notification):
```sql
-- Create fake activity (replace USER_ID with yours)
INSERT INTO activities (kind, actor_id, actor_username, target_id, detail)
VALUES (
  'pvp_win',
  'ATTACKER_UUID',
  'TestAttacker',
  'YOUR_USER_UUID',
  jsonb_build_object('coins_stolen', 100)
);
```

---

### 5. Leaderboards View 🏆

- [ ] **Click "🏆 Leaderboard"** button from dashboard
- [ ] **Top XP tab** - See players ranked by XP
- [ ] **PvP Champions tab** - See players by win count
- [ ] **Top Clans tab** - See clans by total XP
- [ ] **Check your rank** - Highlighted if you're in top 50
- [ ] **Gold/Silver/Bronze** medals for top 3
- [ ] **Avatar images** display correctly
- [ ] **Back button** returns to dashboard

---

### 6. Achievement System 🎖️

- [ ] **Click "🎖️ Achievements"** button from dashboard
- [ ] **See all 11 achievements** with progress bars
- [ ] **Filter tabs work**: All / Earned / Locked
- [ ] **Progress bars** show current progress for locked achievements
- [ ] **Earn achievement** (e.g., win 1 PvP = "First Hack")
- [ ] **Toast notification**: "🎉 Achievement Unlocked: First Hack!"
- [ ] **Check earned tab** - Achievement shows as earned with timestamp
- [ ] **Rewards granted** - XP and coins added to profile

**Fast Unlock Test** (complete 1 PvP battle or run SQL):
```sql
-- Manually grant an achievement
INSERT INTO user_achievements (user_id, achievement_id)
VALUES ('YOUR_USER_UUID', 'first_hack')
ON CONFLICT DO NOTHING;
```

---

### 7. Onboarding Tutorial 📚

- [ ] **Create new test account** OR set `tutorial_completed = false` in DB
- [ ] **Login** - Tutorial modal appears automatically
- [ ] **Step 1**: Welcome message with quest icon
- [ ] **Step 2**: Shop upgrade message
- [ ] **Step 3**: PvP challenge message
- [ ] **Step 4**: "You're ready!" message
- [ ] **Progress bar** updates with each step
- [ ] **"Skip Tutorial"** button works (step 1 only)
- [ ] **"Let's Go!"** button (final step) closes modal
- [ ] **Database updated** - `tutorial_completed = true`

**Reset Tutorial** (Supabase SQL):
```sql
UPDATE users 
SET tutorial_completed = false 
WHERE username = 'YOUR_USERNAME';
```

---

### 8. Mobile Touch Target Optimization 📱

- [ ] **Open browser dev tools** (F12)
- [ ] **Toggle device toolbar** (mobile view)
- [ ] **Test iPhone SE** (375×667) or similar small device
- [ ] **All buttons tap-able** - no missed taps
- [ ] **Action buttons** feel large enough (100px+)
- [ ] **StatChips** easy to see and tap
- [ ] **Claim buttons** on tasks are 44px+ height
- [ ] **No accidental zooming** on input fields
- [ ] **Spacing looks good** - not cramped
- [ ] **Active feedback** - buttons scale down slightly when tapped

**Responsive Breakpoints to Test**:
- Mobile: 375px (iPhone SE)
- Tablet: 768px (iPad)
- Desktop: 1024px+

---

### 9. Error Recovery & Retry Logic 🔄

#### A. Retry Button Test
- [ ] **Disconnect internet** (airplane mode or disable Wi-Fi)
- [ ] **Try to complete quest** or any action
- [ ] **Error toast appears** with "🔄 Retry" button
- [ ] **Reconnect internet**
- [ ] **Click "🔄 Retry"** - action completes successfully
- [ ] **Dismiss button (✕)** works on all toasts

#### B. Offline Detection Test
- [ ] **Disconnect internet** completely
- [ ] **Red banner appears** at top: "📡 No internet connection"
- [ ] **Reconnect internet**
- [ ] **Green toast**: "🌐 Connection restored"
- [ ] **Banner disappears**
- [ ] **Data auto-refreshes**

#### C. Network Status Test
```javascript
// In browser console
// Simulate offline
window.dispatchEvent(new Event('offline'));

// Simulate online
window.dispatchEvent(new Event('online'));
```

---

## 🐛 Known Issues / Expected Behaviors

1. **AP Regeneration**: Requires page refresh to see new AP (not real-time)
2. **Task Claims**: Reset daily based on localStorage date string
3. **Achievements**: Check runs on AchievementView load, not automatically
4. **Tutorial**: Only shows once per account (unless manually reset)
5. **Leaderboards**: Data cached for performance (may be slightly stale)
6. **Retry Logic**: Only shows retry for network/server errors, not validation errors
7. **Mobile**: iOS Safari may behave differently than Chrome DevTools

---

## 🔧 Troubleshooting

### AP Not Regenerating
```sql
-- Check last_ap_update column exists
SELECT last_ap_update FROM users WHERE username = 'YOUR_USERNAME';

-- If NULL, run migration again
UPDATE users SET last_ap_update = NOW() WHERE last_ap_update IS NULL;
```

### Achievements Not Appearing
```sql
-- Check tables exist
SELECT * FROM achievements LIMIT 5;
SELECT * FROM user_achievements WHERE user_id = 'YOUR_UUID';

-- If empty, re-run achievements_schema.sql
```

### Level-Up Modal Not Showing
```sql
-- Check function exists
SELECT routine_name FROM information_schema.routines 
WHERE routine_name = 'rpc_grant_levelup_rewards';

-- If not found, re-run rpc_grant_levelup_rewards.sql
```

### Tutorial Not Showing
```sql
-- Check column exists and value
SELECT tutorial_completed FROM users WHERE username = 'YOUR_USERNAME';

-- If NULL or column doesn't exist, run migration_add_tutorial.sql
```

### Real-time Not Working
- Check Supabase project status (not paused)
- Verify real-time is enabled in Supabase Dashboard > Database > Replication
- Check browser console for connection errors
- Try refreshing the page

---

## 📊 Performance Checks

- [ ] **Bundle size**: ~490 KB (137 KB gzipped) ✅
- [ ] **Initial load**: < 3 seconds on fast connection
- [ ] **Toast animations**: Smooth fade in/out
- [ ] **Modal animations**: No jank or lag
- [ ] **Mobile performance**: 60 FPS scrolling
- [ ] **Memory leaks**: No increasing memory after 5 minutes use

---

## ✅ Ready for Production Checklist

Before pushing to production:

- [ ] All 9 features tested locally ✓
- [ ] All SQL migrations deployed to Supabase ✓
- [ ] Mobile testing on actual device completed ✓
- [ ] No console errors in browser dev tools ✓
- [ ] Real-time subscriptions working ✓
- [ ] Offline mode works correctly ✓
- [ ] Toast retry buttons work ✓
- [ ] Achievements grant rewards ✓
- [ ] Tutorial shows for new users ✓
- [ ] Leaderboards load without errors ✓

**Once all tests pass**, you can push commits:

```powershell
git push origin main
```

Then deploy will auto-trigger on Vercel.

---

## 🆘 Need Help?

If something doesn't work:

1. **Check browser console** (F12) for errors
2. **Check Supabase logs** in Dashboard > Logs
3. **Verify migrations ran** by checking table schemas
4. **Clear localStorage** and cookies, try fresh login
5. **Test in incognito mode** to rule out cache issues

**Test accounts**: Create 2+ accounts to test PvP notifications and leaderboards

Good luck testing! 🚀
