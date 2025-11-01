# AP Regeneration Troubleshooting Guide

## Issue: AP not regenerating after 2+ hours

### Quick Fix Steps:

1. **Open Browser Console (F12)**
   - Go to the Console tab
   - Look for messages starting with `"AP Regeneration:"` or `"Fallback AP Regen:"`
   - Share those messages with me

2. **Run SQL in Supabase Dashboard**
   - Go to: https://supabase.com/dashboard
   - Navigate to: SQL Editor
   - Copy and paste `supabase-functions/fix_ap_regeneration.sql`
   - Click **Run**

3. **Check Your Current Status**
   - In SQL Editor, uncomment the last query
   - Replace `'YOUR_USER_ID'` with your user ID
   - Click **Run**
   - This shows:
     - Current AP
     - Last update time
     - Minutes since last update
     - How much AP should have regenerated

### Common Issues:

#### Issue 1: `last_ap_update` column doesn't exist
**Solution:** Run `fix_ap_regeneration.sql` in Supabase

#### Issue 2: `last_ap_update` is NULL
**Solution:** Run step 2 of `fix_ap_regeneration.sql`

#### Issue 3: Database function doesn't exist
**Solution:** Run `function_calculate_ap.sql` OR just rely on fallback (which should work)

#### Issue 4: Console shows "No AP regeneration needed"
**Reason:** Either:
- You're already at max AP
- Less than 10 minutes have passed
- `last_ap_update` was recently updated

### Manual AP Regeneration:

If nothing works, run this SQL to manually regenerate AP:

```sql
UPDATE users
SET 
    ap_now = LEAST(ap_now + 5, ap_max),  -- Give 5 AP for testing
    last_ap_update = NOW() - INTERVAL '50 minutes'  -- Set time to 50 min ago
WHERE username = 'YOUR_USERNAME';
```

### Expected Behavior:

- **1 AP regenerates every 10 minutes**
- **Frontend shows live countdown**
- **AP updates in database when you refresh/load page**
- **Countdown continues even offline**

### Test It:

1. Note your current AP
2. Wait 10 minutes
3. Refresh the page
4. Check console for log messages
5. AP should increase by 1

### Need More Help?

Share these details:
1. Console log messages
2. Result from the status check query
3. Your current AP and max AP
4. How long since you last played
