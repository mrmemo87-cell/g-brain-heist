# 🗄️ Database Setup Guide - G-Brain Heist

## ⚠️ IMPORTANT: Run These Scripts in Order!

Your database is currently empty. Follow these steps **in order** to set up your Supabase database correctly.

---

## 📋 Step 1: Run Base Schema (REQUIRED FIRST)

This creates all the core tables (`users`, `clans`, `activities`, `inventory`, etc.)

1. Open **Supabase Dashboard** → **SQL Editor**
2. Copy the entire contents of **`supabase-schema.sql`**
3. Paste and click **Run**
4. Wait for success message (~30 seconds)

### Verify:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

You should see these tables:
- `activities`
- `activity_reactions`
- `caps`
- `clan_chat`
- `clan_members`
- `clans`
- `inventory`
- `sessions`
- `shop_purchases`
- `tasks`
- `users` ✓

---

## 🔒 Step 2: Enable Row Level Security (REQUIRED)

This ensures users can only access their own data.

1. Still in **SQL Editor**
2. Copy the entire contents of **`supabase-rls-policies.sql`**
3. Paste and click **Run**
4. Wait for success message

### Verify:
```sql
SELECT tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public' 
LIMIT 10;
```

You should see policies like "Users can view own profile", "Users can view other users", etc.

---

## 🚀 Step 3: Run Feature Migrations (ADDS NEW FEATURES)

This adds the 9 new features: AP regen, achievements, tutorial, level-up rewards, etc.

1. Still in **SQL Editor**
2. Copy the entire contents of **`DATABASE_MIGRATIONS.sql`**
3. Paste and click **Run**
4. Wait for success message

### Verify:
```sql
-- Check achievements table has 11 achievements
SELECT COUNT(*) FROM achievements;

-- Check functions exist
SELECT proname FROM pg_proc 
WHERE proname IN ('grant_levelup_rewards', 'check_achievements');

-- Check new columns exist
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name IN ('last_ap_update', 'tutorial_completed');
```

---

## ✅ Step 4: Verify Everything Works

Run this complete verification query:

```sql
-- 1. Check all tables exist (should return 13 rows)
SELECT COUNT(*) as table_count 
FROM information_schema.tables 
WHERE table_schema = 'public';

-- 2. Check achievements are loaded (should return 11)
SELECT COUNT(*) as achievement_count FROM achievements;

-- 3. Check functions exist (should return 2 rows)
SELECT proname FROM pg_proc 
WHERE proname IN ('grant_levelup_rewards', 'check_achievements');

-- 4. List all achievements
SELECT title, tier, reward_coins, reward_xp 
FROM achievements 
ORDER BY tier, title;
```

---

## 🎮 Step 5: Test Your App!

1. Open your production URL (Vercel deployment)
2. Create a new account
3. You should see the tutorial modal
4. Complete tutorial or skip it
5. Try these features:
   - ✅ Complete a quest (earns "First Steps" achievement)
   - ✅ Check AP regeneration (wait 10 minutes or check countdown)
   - ✅ Level up (should grant +10 max AP, +100 coins, full AP refill)
   - ✅ Open Achievements tab (should load without error now!)

---

## 🐛 Troubleshooting

### Error: "relation 'users' does not exist"
→ You skipped Step 1. Run `supabase-schema.sql` first!

### Error: "Failed to load achievements"
→ Run Step 3 (`DATABASE_MIGRATIONS.sql`)

### Error: "new row violates row-level security policy"
→ Run Step 2 (`supabase-rls-policies.sql`)

### Achievements not granting automatically
→ Make sure you ran `DATABASE_MIGRATIONS.sql` which creates the `check_achievements()` function

### Tutorial keeps reopening
→ Already fixed in the latest push! Clear browser cache/localStorage if issue persists.

---

## 📊 Quick Stats Query

After setting up, run this to see your database stats:

```sql
SELECT 
  (SELECT COUNT(*) FROM users) as total_users,
  (SELECT COUNT(*) FROM clans) as total_clans,
  (SELECT COUNT(*) FROM activities) as total_activities,
  (SELECT COUNT(*) FROM achievements) as total_achievements,
  (SELECT COUNT(*) FROM user_achievements) as achievements_earned;
```

---

## 🎯 Summary

**Execution Order:**
1. `supabase-schema.sql` (creates tables)
2. `supabase-rls-policies.sql` (enables security)
3. `DATABASE_MIGRATIONS.sql` (adds new features)

**Total Time:** ~2 minutes

**Result:** Fully functional game with all 9 features! 🎉

---

## 🆘 Need Help?

If you encounter any errors:
1. Copy the exact error message
2. Note which step you're on
3. Check which SQL file caused the error
4. Make sure you ran them in order (1 → 2 → 3)

The most common issue is running migrations before the base schema. **Always run `supabase-schema.sql` first!**
