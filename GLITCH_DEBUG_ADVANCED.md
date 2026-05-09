# Glitch Theme - Advanced Debugging Guide

## What I've Done

I've added console logging to help identify where the issue is:

1. **cosmeticService.ts**: Logs when glitch theme owners are fetched
2. **PlayerProfileCard.tsx**: Logs cosmetic data when rendering
3. **AvatarWithFrame.tsx**: Logs when glitch theme is applied
4. **CSS**: Completely revamped glitch animations to be much more prominent
   - Stronger magenta (#ff00de) and cyan (#00ffff) colors
   - More visible box-shadow animations
   - Better scan line effect
   - Enhanced hue-rotate filter

---

## Step-by-Step Debug Instructions

### Step 1: Open Browser DevTools
Press `F12` to open Developer Tools, then go to **Console** tab

### Step 2: Log In As The Test User with Glitch Theme
- Make sure the user has **active glitch theme**
- You should see console logs like:
  ```
  [Cosmetic] Glitch theme owners fetched: Set(1) {"user_id_here"}
  [ProfileCard] Rendering with cosmetics: {active_cosmetic_frame: null, active_cosmetic_theme: "flicker"}
  [AvatarWithFrame] Glitch theme enabled for: username_here
  ```

### Step 3: Verify Each Step

**A) Check if profile has glitch theme:**
```javascript
// Run this in browser console
const profile = window.__profileData; // This won't work - try inspecting React state instead
// Or manually check in React DevTools → App component → profile prop
```

**B) Check if CSS is loaded:**
```javascript
// In console, check if glitch CSS exists
const style = document.createElement('style');
const sheetList = document.styleSheets;
console.log('Total stylesheets:', sheetList.length);

// Look for glitch-frame class
for (let sheet of sheetList) {
  try {
    const rules = sheet.cssRules;
    for (let rule of rules) {
      if (rule.selectorText && rule.selectorText.includes('glitch')) {
        console.log('Found glitch rule:', rule.selectorText);
      }
    }
  } catch (e) {
    // CORS restriction, expected
  }
}
```

**C) Check if element has glitch classes:**
```javascript
// Find avatar element
const avatarElements = document.querySelectorAll('img[alt*="avatar"], img[alt*="player"]');
console.log('Found avatar elements:', avatarElements.length);
avatarElements.forEach((el, idx) => {
  console.log(`Avatar ${idx}:`, {
    alt: el.alt,
    classes: el.className,
    parentClasses: el.parentElement?.className,
    hasgGlitch: el.className.includes('glitch') || el.parentElement?.className.includes('glitch')
  });
});
```

**D) Check computed styles:**
```javascript
// For first avatar with potential glitch
const avatar = document.querySelector('.glitch-frame-avatar');
if (avatar) {
  const computed = getComputedStyle(avatar);
  console.log('Glitch avatar computed style:', {
    borderColor: computed.borderColor,
    boxShadow: computed.boxShadow,
    animation: computed.animation,
    filter: computed.filter
  });
} else {
  console.log('No .glitch-frame-avatar found');
}
```

### Step 4: Check the DOM

1. Open **Inspector/Elements** tab
2. Search for `class="glitch-frame"`
3. You should see:
   ```html
   <div class="inline-flex rounded-full items-center justify-center transition-transform duration-150 glitch-frame">
     <img src="..." class="rounded-full object-cover w-20 h-20 glitch-frame-avatar" alt="...">
   </div>
   ```

4. Click on the element and in **Styles** panel:
   - Should show `.glitch-frame` rules applied
   - Should show `.glitch-frame-avatar` rules applied
   - Should show animations: `glitch-shift`, `glitch-rgb-shift`, `scan-lines`

### Step 5: Force Test the CSS Manually

In **Inspector**, find any avatar `<img>` and add this to its parent `<div>`:
```
class="glitch-frame"
```

Add to the `<img>`:
```
class="glitch-frame-avatar"
```

The avatar should immediately show:
- Cyan/Magenta glow
- Pulsing color shift
- Scan line overlay

If it does → CSS works, problem is data/props
If it doesn't → CSS is broken or not loaded

---

## Common Issues & Solutions

### Issue: Console shows empty Set for glitch owners
```
[Cosmetic] Glitch theme owners fetched: Set(0) {}
```
**Problem**: User doesn't have active glitch in database
**Solution**:
1. Check inventory: `SELECT * FROM inventory WHERE item_id = 'item_cosmetic_theme' AND state = 'active' AND user_id = 'USER_ID';`
2. If found: Update users table: `UPDATE users SET active_cosmetic_theme = 'flicker' WHERE id = 'USER_ID';`
3. If not found: User needs to purchase and activate glitch theme first

### Issue: Profile shows NULL for active_cosmetic_theme
```
[ProfileCard] Rendering with cosmetics: {active_cosmetic_frame: null, active_cosmetic_theme: null}
```
**Problem**: Either column doesn't exist OR data not synced
**Solution**:
1. Verify column exists: `SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'active_cosmetic_theme';`
2. If not found: Run migration again
3. If found: Sync data: `UPDATE users SET active_cosmetic_theme = 'flicker' WHERE id IN (SELECT DISTINCT user_id FROM inventory WHERE item_id = 'item_cosmetic_theme' AND state = 'active');`

### Issue: Console shows glitch enabled but nothing renders
```
[AvatarWithFrame] Glitch theme enabled for: username
```
But no visual effect.

**Problem**: CSS not loading or animation not running
**Solution**:
1. Hard refresh browser: `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac)
2. Check if `.glitch-frame` in element's classes (Inspector)
3. Check computed styles - should show animation properties
4. If still nothing: Check browser console for CSS errors

### Issue: Classes NOT showing in DOM
```
// Inspector shows:
<div class="inline-flex rounded-full...">
  // NO glitch-frame class!
```
**Problem**: Props not being passed or conditional logic broken
**Solution**:
1. Check React DevTools → AvatarWithFrame component
2. Verify `hasGlitchTheme` prop is `true`
3. Check if `combineClasses` function works:
   ```javascript
   // In console
   const result = ['class1', true && 'class2', false && 'class3'].filter(Boolean).join(' ');
   console.log(result); // Should be "class1 class2"
   ```

---

## What to Report Back

After following these steps, tell me:

1. **Console logs**: What do you see for glitch cosmetics?
   - Does it show the user ID in the Set?
   - Does profile show `active_cosmetic_theme: "flicker"`?
   - Does AvatarWithFrame log the glitch enabled message?

2. **DOM inspection**: 
   - Does the avatar div have `class="glitch-frame"`?
   - Does the img have `class="glitch-frame-avatar"`?

3. **Computed styles**:
   - What does `box-shadow` show for .glitch-frame-avatar?
   - What does `animation` show?
   - What does `filter` show?

4. **Manual test**:
   - When you manually add `glitch-frame` class, does it show?

5. **Database check**:
   ```sql
   SELECT 
     u.id,
     u.username,
     u.active_cosmetic_theme,
     COUNT(CASE WHEN i.item_id = 'item_cosmetic_theme' AND i.state = 'active' THEN 1 END) as active_glitch
   FROM users u
   LEFT JOIN inventory i ON u.id = i.user_id
   WHERE u.id = 'TEST_USER_ID'
   GROUP BY u.id, u.username, u.active_cosmetic_theme;
   ```
   What does this show?

---

## CSS Changes Made

Your new glitch animation is **much more prominent**:

- **Colors**: Pure magenta (#ff00de) and cyan (#00ffff) 
- **Glow**: 3 layers of box-shadow (10px, 30px, 45px)
- **Animation**: Glitch shift (3s cycle) + RGB shift (hue-rotate)
- **Scan lines**: Visible overlay with faster animation (0.08s)
- **Filter**: Increased contrast (1.1) and saturation (1.2)
- **Light mode**: Even stronger colors and opacity

The effect should be very noticeable now - a pulsing cyan/magenta glow with scan lines.
