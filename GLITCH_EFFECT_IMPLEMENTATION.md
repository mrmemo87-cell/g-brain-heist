# Glitch Effect Cosmetic Implementation

## Overview
The Glitch Effect is a new legendary cosmetic item available in the shop for **50,000 coins + 150 gemstones**. It provides a unique digital corruption/cybernetic distortion effect on player avatars.

## Database Requirements
Run the following migration in Supabase SQL Editor:
```sql
-- See ADD_GLITCH_EFFECT_COLUMN.sql for full migration
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS active_cosmetic_effect text DEFAULT NULL;

ALTER TABLE users 
ADD CONSTRAINT check_active_cosmetic_effect 
CHECK (active_cosmetic_effect IS NULL OR active_cosmetic_effect IN ('glitch'));
```

## Files Modified

### Types
- `types.ts`: Added `active_cosmetic_effect?: 'glitch' | null` to Profile, RaidTarget, ClanMember, ClanMemberWithScore interfaces

### Services
- `services/gameService.ts`:
  - Added shop item `item_cosmetic_glitch` (50000 coins, 150 gems, legendary)
  - Added `getActiveCosmeticEffect()` function
  - Updated `whoami()` to load active glitch effect
  - Updated `inventory_activate()` to handle glitch cosmetic activation
  - Added `deactivate_glitch_effect()` function
  - Updated raid targets and clan members to include glitch effect data

- `services/cosmeticService.ts`:
  - Added `GLITCH_EFFECT_ITEM_ID` constant
  - Added `fetchGlitchEffectOwners()` function
  - Added `fetchGlitchEffectOwnersFromInventory()` fallback function

### Components
- `components/AvatarWithFrame.tsx`:
  - Added `hasGlitchEffect` prop
  - Added `glitch-effect-frame` and `glitch-effect-avatar` CSS classes

- `components/InventoryView.tsx`:
  - Added glitch effect deactivation state and handler
  - Added deactivation UI for glitch cosmetic items

- `components/LeaderboardView.tsx`:
  - Imports `fetchGlitchEffectOwners`
  - Fetches and displays glitch effect on avatars

- `components/PvPView.tsx`:
  - Imports `fetchGlitchEffectOwners`
  - Displays glitch effect on raid targets and battle screen

- `components/ClanView.tsx`:
  - Added `hasGlitchEffect` prop to all AvatarWithFrame instances

- `components/PlayerProfileCard.tsx`:
  - Added `hasGlitchEffect` prop to avatar display

### CSS (src/index.css)
New CSS animations and styles:
- `@keyframes glitch-effect-distort` - Digital distortion animation
- `@keyframes glitch-effect-flash` - Color flash animation
- `@keyframes glitch-effect-noise` - Scan line clip-path animation
- `.glitch-effect-frame` - Green neon frame with digital corruption
- `.glitch-effect-avatar` - Avatar with glitch border and animations
- Combined styles for neon + glitch effect

## Visual Effect
The glitch effect features:
- **Green neon glow** (matrix/hacker aesthetic)
- **Digital distortion** - avatar shakes and shifts colors
- **"ERROR" badge** - small red badge on top-right
- **Scan lines** - horizontal green scan lines
- **Color cycling** - periodic hue rotation

## Cosmetic Priority
When multiple cosmetics are active:
1. **Glitch Effect** takes visual priority over Flicker Theme
2. All three (Neon Frame, Flicker Theme, Glitch Effect) can be active simultaneously
3. Each provides distinct visual layering

## Usage Flow
1. User purchases "Glitch Effect" from shop (50,000 coins + 150 gems)
2. Item appears in inventory as "unused" state
3. User clicks "Activate" to enable the effect
4. Cosmetic becomes "active" and displays on all avatar instances
5. User can permanently deactivate from inventory if desired

## Shop Item Details
```typescript
{
  id: 'item_cosmetic_glitch',
  name: 'Glitch Effect',
  kind: 'cosmetic',
  price: 50000,
  rarity: 'legendary',
  gemstone_price: 150,
  daily_limit: 1,
  owned_today: 0,
  description: 'A cybernetic glitch distortion effect for your avatar. Stand out with digital corruption!',
  effect_summary: 'Purely cosmetic'
}
```
