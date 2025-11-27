# CoinAnimation - Quick Start Guide

## Installation ✅
The component is already created and ready to use!
- Location: `components/CoinAnimation.tsx`
- No additional dependencies needed (lottie-react already installed)

## Basic Usage

### Step 1: Import
```tsx
import CoinAnimation from './components/CoinAnimation';
```

### Step 2: Use It
```tsx
<CoinAnimation width={60} height={60} />
```

That's it! 🎉

## Common Use Cases

### 1. In Header (Show player coins)
```tsx
import CoinAnimation from './components/CoinAnimation';

export function Header() {
  return (
    <div className="flex items-center gap-2">
      <CoinAnimation width={24} height={24} />
      <span>{coins.toLocaleString()}</span>
    </div>
  );
}
```

### 2. In Reward Popup
```tsx
<div className="reward-modal">
  <CoinAnimation width={60} height={60} speed={1.5} />
  <h3>Quest Completed!</h3>
  <p>+500 coins earned</p>
</div>
```

### 3. In Shop Item
```tsx
<div className="shop-item">
  <h4>Premium Item</h4>
  <div className="flex items-center gap-2">
    <CoinAnimation width={32} height={32} />
    <span>250 coins</span>
  </div>
</div>
```

### 4. Loading State
```tsx
{isLoadingRewards ? (
  <CoinAnimation width={40} height={40} speed={0.8} />
) : (
  <div>{rewardAmount}</div>
)}
```

## Available Props

```tsx
interface CoinAnimationProps {
  width?: number;        // Default: 60 (pixels)
  height?: number;       // Default: 60 (pixels)
  loop?: boolean;        // Default: true
  speed?: number;        // Default: 1 (1=normal, 2=double)
  className?: string;    // Default: ''
}
```

## Speed Examples

```tsx
<CoinAnimation speed={0.5} />  {/* Slow motion */}
<CoinAnimation speed={1} />    {/* Normal */}
<CoinAnimation speed={1.5} />  {/* Faster */}
<CoinAnimation speed={2} />    {/* Double speed */}
```

## Styling

Add CSS classes:
```tsx
<CoinAnimation 
  className="drop-shadow-lg opacity-80 hover:opacity-100" 
/>
```

## Performance Tips

✅ **DO:**
- Use for important moments (rewards, level-ups)
- Limit to 3-5 animations on screen at once
- Scale size down for mobile (40-48px)

❌ **DON'T:**
- Render dozens at once
- Use in long lists
- Animate constantly in background

## Light Mode

The component automatically:
- Disables in light mode
- Shows empty placeholder
- No configuration needed

## Troubleshooting

**Not showing?**
```
1. Check browser console for errors
2. Verify public/icons/coin.json exists
3. Hard refresh browser (Ctrl+F5)
```

**Too slow/fast?**
```tsx
<CoinAnimation speed={1.5} />  // Adjust speed prop
```

**Performance issues?**
```tsx
<CoinAnimation width={40} height={40} speed={0.8} />  // Smaller & slower
```

## Examples

Complete examples available in:
- `components/CoinAnimation.examples.tsx`

See real implementations:
- RewardIndicator
- CoinCelebration
- ShopItemWithAnimatedPrice
- RewardPopup
- ProfileStatsWithAnimatedCoins

## Full Documentation

For detailed documentation, see:
- `COIN_ANIMATION_GUIDE.md` - Complete reference
- `COIN_ANIMATION_IMPLEMENTATION.md` - Implementation details

---

**Status:** ✅ Ready to use!

Just import, add a component, customize as needed. No build steps required.
