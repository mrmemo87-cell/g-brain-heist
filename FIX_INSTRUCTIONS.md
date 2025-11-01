# AP Timer and Clan Fix Instructions

## Problem
- AP timer shows "+1 in --" instead of actual countdown
- This happens because `last_ap_update` is NULL in the database

## Solution

### Step 1: Fix the Database (Run in Supabase SQL Editor)

Go to: https://supabase.com/dashboard/project/YOUR_PROJECT/sql/new

Paste and run this:

```sql
-- Initialize last_ap_update for all users
UPDATE users 
SET last_ap_update = NOW() - INTERVAL '5 minutes'
WHERE last_ap_update IS NULL;

-- Verify
SELECT username, ap_now, ap_max, last_ap_update 
FROM users 
LIMIT 5;
```

### Step 2: Test the Timer

1. Refresh your browser (Ctrl + Shift + R)
2. You should now see: "+1 in 9m 45s" (and counting down)
3. The timer will update every second

### Step 3: If Timer Still Stuck

Open browser console (F12) and look for these logs:
- "AP Regeneration: X → Y" (successful)
- "Fallback AP Regen: ..." (shows calculation)
- Any errors related to AP

## How the AP Timer Works Now

1. **Client-side countdown**: Updates every second in Header and Profile Card
2. **Server-side regen**: Updates actual AP in database when you load the game
3. **Offline support**: Calculates AP based on time elapsed even if you were offline

## Expected Behavior

- At MAX AP: "+1 in MAX"
- Regenerating: "+1 in 9m 45s" (counts down every second)
- If NULL: "+1 in --" (need to run the SQL fix above)

---

## Clan Structure (Not Changed Yet)

The clan restructure had a code error and was rolled back. Current structure:
- Home tab (if in clan)
- Chat tab
- Browse Clans tab
- Management tab (leaders/officers only)

To implement the new structure (All Clans first, My Clan second), we'll need to do it more carefully.
