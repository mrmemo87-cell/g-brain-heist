# Glitch Theme Cosmetic - Debugging Checklist

## Issue: Glitch effect not visible for user with active cosmetic

### Step 1: Verify SQL Migration
**Status: ❌ ACTION REQUIRED**
- The file `GLITCH_THEME_COLUMN_USERS.sql` has been created and updated
- **You must execute this migration in Supabase**:
  1. Go to Supabase Dashboard → Project → SQL Editor
  2. Copy the entire content of `GLITCH_THEME_COLUMN_USERS.sql`
  3. Run the SQL script
  4. Verify the column exists: `SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`

### Step 2: Check if Column Exists
In Supabase SQL Editor, run:
```sql
SELECT 1 FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name = 'active_cosmetic_theme';
```
- If result is empty → Column doesn't exist → Run migration
- If result shows 1 row → Column exists → Continue to Step 3

### Step 3: Verify Item Purchase and Activation
For the test user, run:
```sql
SELECT 
  inv.user_id,
  inv.item_id,
  inv.state,
  inv.activated_at,
  inv.kind
FROM inventory inv
WHERE inv.item_id = 'item_cosmetic_theme'
AND inv.user_id = 'USER_ID_HERE'
ORDER BY inv.created_at DESC;
```
- Should show: `state = 'active'`, `kind = 'cosmetic'`
- If not active → User needs to activate in inventory
- If active → Continue to Step 4

### Step 4: Check Users Table Sync
For the same user:
```sql
SELECT 
  id,
  username,
  active_cosmetic_frame,
  active_cosmetic_theme
FROM users
WHERE id = 'USER_ID_HERE';
```
- Should show: `active_cosmetic_theme = 'glitch'`
- If NULL → Data didn't sync → Run migration Step 3
- If 'glitch' → Continue to Step 5

### Step 5: Test Frontend Data Fetching
In browser console (after logging in as the test user):
```javascript
// Call the cosmetic service directly
import { fetchGlitchThemeOwners } from './services/cosmeticService';
const userId = 'USER_ID_HERE';
fetchGlitchThemeOwners([userId]).then(owners => {
  console.log('Glitch owners:', owners);
  console.log('User has glitch?', owners.has(userId));
});
```
- Should return Set with user ID included
- If empty Set → Issue with query or data not synced

### Step 6: Verify CSS is Loaded
In browser console:
```javascript
// Check if glitch CSS classes exist
const style = getComputedStyle(document.documentElement);
console.log('Has animation:', style.getPropertyValue('--animate-glitch'));
// Or check a specific element with glitch-frame class
const glitchEl = document.querySelector('.glitch-frame');
console.log('Glitch frame element:', glitchEl);
console.log('Computed style:', getComputedStyle(glitchEl));
```

### Step 7: Check React Component Props
Use React DevTools or add console logs:
In `AvatarWithFrame.tsx`, add:
```javascript
console.log('hasGlitchTheme:', hasGlitchTheme, 'wrapperClass:', wrapperClass);
```
- Should see `hasGlitchTheme: true` for the test user's avatar
- Should see `glitch-frame` in the class list

### Step 8: Verify Animation Rendering
Open browser DevTools:
1. Go to Elements/Inspector
2. Find the avatar element
3. Check if it has classes: `glitch-frame` and `glitch-frame-avatar`
4. Check Applied Styles → should show glitch-related rules
5. Check Animations panel → should show `glitch-rgb-shift` and `glitch-shift` running

---

## Common Causes & Solutions

### ❌ "Column doesn't exist"
**Fix**: Run `GLITCH_THEME_COLUMN_USERS.sql` in Supabase SQL Editor

### ❌ "Column exists but user has NULL"
**Fix**: 
- Ensure item was activated in inventory (state = 'active')
- Run Step 3 of the migration to sync existing cosmetics:
```sql
UPDATE users
SET active_cosmetic_theme = 'glitch'
WHERE id IN (
    SELECT DISTINCT inv.user_id
    FROM inventory inv
    WHERE inv.state = 'active'
      AND inv.kind = 'cosmetic'
      AND inv.item_id = 'item_cosmetic_theme'
);
```

### ❌ "fetchGlitchThemeOwners returns empty"
**Fix**: Check if query is falling back to inventory
- Add console.warn logging to cosmeticService.ts
- Verify users table query works: `SELECT id FROM users WHERE active_cosmetic_theme = 'glitch';`

### ❌ "React props show hasGlitchTheme=false"
**Fix**: Check if view component is fetching glitch data
- Verify LeaderboardView calls `fetchGlitchThemeOwners`
- Verify data is being passed to `AvatarWithFrame` as prop
- Add console logs in component to verify data flow

### ❌ "CSS not applying (no classes in DOM)"
**Fix**: Check HTML output
- Verify `combineClasses` function works: `console.log(combineClasses('glitch-frame', 'rounded-full'))`
- Check if CSS is loaded: `document.styleSheets` should include index.css
- Verify no CSS conflicts: `.glitch-frame` not overridden

### ❌ "Animation not running"
**Fix**: CSS issue
- Check `@keyframes glitch-shift` and `@keyframes glitch-rgb-shift` defined
- Verify animation property: `animation: glitch-shift 2.5s infinite;`
- Check browser DevTools Animations tab

---

## Quick Fix Checklist

- [ ] Run SQL migration in Supabase
- [ ] Verify column with: `SELECT * FROM users WHERE active_cosmetic_theme IS NOT NULL;`
- [ ] Check user has active glitch item: `SELECT * FROM inventory WHERE item_id = 'item_cosmetic_theme' AND state = 'active';`
- [ ] Refresh browser page (hard refresh: Ctrl+Shift+R)
- [ ] Check browser console for errors
- [ ] Inspect avatar element in DevTools
- [ ] Verify CSS classes present: `glitch-frame`, `glitch-frame-avatar`
- [ ] Check Animations tab in DevTools

---

## Still Not Working?

1. **Export test user ID**: What is the exact user ID with glitch theme?
2. **Run diagnostic query**:
```sql
SELECT 
  u.id,
  u.username,
  u.active_cosmetic_frame,
  u.active_cosmetic_theme,
  COUNT(i.id) as inventory_count,
  SUM(CASE WHEN i.item_id = 'item_cosmetic_theme' AND i.state = 'active' THEN 1 ELSE 0 END) as active_glitch_count
FROM users u
LEFT JOIN inventory i ON u.id = i.user_id
WHERE u.username = 'TEST_USERNAME_HERE'
GROUP BY u.id, u.username, u.active_cosmetic_frame, u.active_cosmetic_theme;
```
3. **Share the output** of this query for debugging
