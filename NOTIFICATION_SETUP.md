# 🔔 Notification System Setup Guide

## Overview
Comprehensive real-time notification system designed for **emotional engagement** through danger alerts, celebrations, and exciting moments.

## Features
- ✅ 17 notification types categorized by emotion
- ✅ Real-time Supabase subscriptions
- ✅ Toast notifications with auto-dismiss
- ✅ Notification center with history
- ✅ Unread count badge
- ✅ Priority levels (low, medium, high, urgent)
- ✅ Sound effects integration ready
- ✅ Color-coded by type
- ✅ Mobile-responsive

## Setup Steps

### 1. Create Notifications Table in Supabase

Run the SQL script in your Supabase SQL Editor:

**Location:** `supabase-functions/notifications_system.sql`

This will create:
- `notifications` table with RLS policies
- Helper functions for common notifications
- Indexes for performance

### 2. Enable Real-time for Notifications

In Supabase Dashboard:
1. Go to **Database** → **Replication**
2. Find the `notifications` table
3. Enable **INSERT** replication
4. Save changes

### 3. Verify Table Creation

Run this query in Supabase SQL Editor:
```sql
SELECT * FROM notifications LIMIT 1;
```

Should return empty result (no errors).

### 4. Test Creating a Notification

Use the helper function:
```sql
SELECT notify_level_up(
  auth.uid(),  -- your user ID
  5,           -- new level
  100,         -- xp reward
  50           -- coin reward
);
```

Then check:
```sql
SELECT * FROM notifications WHERE user_id = auth.uid();
```

## Notification Types

### 🚨 Danger (Red)
- `attack_incoming` - Someone is attacking you
- `coins_lost` - You lost coins in battle
- `low_ap` - Action points running low
- `streak_danger` - Daily streak about to break

### 🎉 Happiness (Green/Yellow)
- `level_up` - You leveled up
- `achievement_earned` - New achievement unlocked
- `coins_earned` - Earned significant coins
- `quest_completed` - Quest finished

### ⚔️ Excitement (Purple/Pink)
- `attack_success` - Your attack succeeded
- `challenge_received` - Someone challenged you
- `revenge_available` - Revenge opportunity
- `new_rival` - New rival appeared

### 🛡️ Victory (Green)
- `attack_defended` - Successfully defended

### ⚡ Ready (Cyan)
- `ap_full` - Action points fully recharged

### 👥 Social (Blue)
- `clan_invite` - Clan invitation
- `leaderboard_change` - Your rank changed

## Usage in Code

### Creating Notifications

```typescript
import { notificationService } from './services/notificationService';

// Create a notification
await notificationService.createNotification(
  userId,
  'attack_incoming',
  '🚨 UNDER ATTACK!',
  'Shadow is attacking you with 150 power!',
  'urgent',
  { attacker: 'Shadow', power: 150 }
);
```

### Using SQL Helper Functions

In your game service functions, call the SQL helpers:

```typescript
// After raid_attack success
await supabase.rpc('notify_attack_incoming', {
  target_user_id: defenderId,
  attacker_username: attackerUsername,
  attacker_power: attackPower
});

// After level up
await supabase.rpc('notify_level_up', {
  user_id_param: userId,
  new_level: newLevel,
  rewards_xp: xpReward,
  rewards_coins: coinReward
});
```

## Next Steps: Integration Points

### 1. Attack Events (HIGH PRIORITY)
**File:** `services/gameService.ts` → `raid_attack()`

```typescript
// On successful attack
await supabase.rpc('notify_attack_incoming', {
  target_user_id: target_id,
  attacker_username: attacker.username,
  attacker_power: attack_power
});

// If coins stolen
if (coins_stolen > 100) {
  await supabase.rpc('notify_coins_lost', {
    user_id_param: target_id,
    attacker_username: attacker.username,
    coins_lost: coins_stolen
  });
}
```

### 2. Level Up Events
**File:** `services/gameService.ts` → `mcq_answer_submit()`

```typescript
if (leveledUp) {
  await supabase.rpc('notify_level_up', {
    user_id_param: userId,
    new_level: newLevel,
    rewards_xp: xpGained,
    rewards_coins: coinsGained
  });
}
```

### 3. AP Warnings
**File:** `services/gameService.ts` → `whoami()`

```typescript
// Check AP level
if (profile.ap_now < 5) {
  await supabase.rpc('notify_low_ap', {
    user_id_param: userId,
    current_ap: profile.ap_now,
    max_ap: profile.ap_max
  });
}
```

## New User Created Notifications

Yes — you can notify "anywhere" when a new user is created by hooking into the existing `auth.users` creation flow.

### ✅ If you specifically need EMAIL

Use an **Edge Function relay** (recommended for email). Database triggers are great for DB-side events, but email delivery should happen in an HTTP-capable service layer.

1. Create an Edge Function (for example `supabase/functions/new_user_email/index.ts`)
2. Add provider credentials in secrets (Resend/SendGrid/Postmark)
3. From your new-user path, call that function with:
   - `user_id`
   - `email`
   - `username`
   - `created_at`
4. Send the email to:
   - the new user (welcome email), and/or
   - admin inbox (new signup alert)

Implementation added in this repo:
- `supabase/functions/new_user_email/index.ts`
- expects auth-hook style payload containing `user.id`, `user.email`, metadata username
- sends admin alert email using Resend

Required secrets for the function:
- `NEW_USER_EMAIL_HOOK_SECRET`
- `RESEND_API_KEY`
- `NEW_USER_EMAIL_FROM`
- `NEW_USER_ALERT_TO`

If `NEW_USER_ALERT_TO` is not set, the function currently falls back to:
- `mr.memo87@gmail.com`

Suggested deploy command:
```bash
supabase functions deploy new_user_email
```

Suggested Auth Hook target:
- URL: `https://<project-ref>.supabase.co/functions/v1/new_user_email`
- Event: `user.created`
- Header: `x-hook-secret: <NEW_USER_EMAIL_HOOK_SECRET>`

Example payload:

```json
{
  "event": "user_created",
  "user_id": "uuid",
  "email": "student@example.com",
  "username": "student1",
  "created_at": "2026-04-01T13:00:00Z"
}
```

### Option A (Recommended): DB trigger writes to `notifications`

Create an additional trigger branch in `handle_new_user()` (or a separate trigger function) that inserts an internal/admin notification whenever `auth.users` receives a new row.

```sql
INSERT INTO public.notifications (
  user_id,
  type,
  title,
  body,
  priority,
  data
) VALUES (
  NEW.id,
  'announcement',
  'Welcome to Brains Heist',
  'Your account is ready. Complete onboarding to get started.',
  'low',
  jsonb_build_object('source', 'auth_trigger')
);
```

### Option B: Postgres `NOTIFY` for backend listeners

If you want a backend worker / service (Discord bot, Slack relay, etc.) to receive events, emit `pg_notify(...)` from the trigger and consume it from your server process.

### Option C: Edge Function / webhook relay

Call a Supabase Edge Function (service role) from your backend trigger path to fan out to email, Discord, Slack, or push providers.

### 4. Achievement Unlocks
**File:** Wherever achievements are checked

```typescript
await notificationService.createNotification(
  userId,
  'achievement_earned',
  '🏆 Achievement Unlocked!',
  `You earned "${achievementName}"!`,
  'high',
  { achievement: achievementName }
);
```

### 5. Quest Completion
**File:** Quest completion logic

```typescript
await notificationService.createNotification(
  userId,
  'quest_completed',
  '✅ Quest Complete!',
  `You finished "${questName}" and earned ${rewards} coins!`,
  'high',
  { quest: questName, rewards }
);
```

## Sound Effects TODO

Add these sound files to your audio service:
- `alarm.mp3` - For danger notifications
- `victory.mp3` - For success/win notifications
- `warning.mp3` - For warnings
- `achievement.mp3` - For achievements
- `challenge.mp3` - For battle/challenge notifications

Update `audioService.ts` to include these sounds.

## Testing Checklist

- [ ] Run SQL script in Supabase
- [ ] Enable real-time replication
- [ ] Test creating notification manually
- [ ] Verify notification appears in center
- [ ] Test toast auto-dismiss
- [ ] Check unread count updates
- [ ] Test marking as read
- [ ] Test deleting notifications
- [ ] Integrate first trigger (attacks)
- [ ] Test on mobile (responsive)

## Future Enhancements

- [ ] Notification preferences (enable/disable types)
- [ ] Do Not Disturb mode
- [ ] Browser push notifications
- [ ] Email notifications for critical events
- [ ] Notification grouping (e.g., "3 attacks")
- [ ] Action buttons in notifications ("Revenge", "View")
- [ ] Rich media (avatar images, progress bars)
- [ ] Notification history pagination

## Emotional Design Philosophy

The notification system is designed around **three core emotions**:

1. **🚨 DANGER** - Red colors, urgent sounds, immediate attention
   - Makes users feel threatened and engaged
   - Triggers "must defend" response
   
2. **🎉 HAPPINESS** - Green/yellow colors, celebratory sounds
   - Makes users feel rewarded and successful
   - Encourages continued play
   
3. **⚔️ EXCITEMENT** - Purple/pink colors, battle sounds
   - Makes users feel competitive and challenged
   - Drives PvP engagement

Every notification type is carefully categorized to maximize emotional impact and create a dynamic, engaging experience.
