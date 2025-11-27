# Coin Animation Usage Guide

## Overview
The `CoinAnimation` component renders an animated spinning coin using the Lottie animation library. It's lightweight, performant, and automatically respects light mode settings.

## Component Location
`components/CoinAnimation.tsx`

## Animation Source
`public/icons/coin.json` (Lottie animation file)

## Basic Usage

### Simple Coin Animation
```tsx
import CoinAnimation from './components/CoinAnimation';

function MyComponent() {
  return (
    <CoinAnimation width={60} height={60} />
  );
}
```

### With Custom Properties
```tsx
<CoinAnimation 
  width={80} 
  height={80} 
  loop={true}
  speed={1.5}
  className="my-custom-class"
/>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `width` | number | 60 | Width in pixels |
| `height` | number | 60 | Height in pixels |
| `loop` | boolean | true | Whether animation loops |
| `speed` | number | 1 | Animation speed multiplier (1 = normal, 2 = double speed) |
| `className` | string | '' | CSS class names for styling |

## Use Cases

### 1. Coin Reward Display
```tsx
// In reward popups or notifications
<div className="reward-display">
  <CoinAnimation width={48} height={48} />
  <span className="text-xl">+500 coins</span>
</div>
```

### 2. Loading States
```tsx
// Show animated coin while loading coin data
{isLoading ? (
  <CoinAnimation width={40} height={40} speed={0.8} />
) : (
  <div>{coinAmount}</div>
)}
```

### 3. Emphasis in UI
```tsx
// Replace static CoinIcon in prominent places
// Before:
<div className="w-6 h-6 text-amber-400"><CoinIcon /></div>

// After:
<CoinAnimation width={24} height={24} className="text-amber-400" />
```

### 4. Celebration Effects
```tsx
// Multiple coins for celebration animation
<div className="celebration">
  <CoinAnimation width={64} height={64} speed={1.5} />
  <CoinAnimation width={56} height={56} speed={1.2} style={{marginLeft: '10px'}} />
  <CoinAnimation width={52} height={52} speed={0.9} style={{marginLeft: '10px'}} />
</div>
```

## Performance Notes

✅ **Optimizations:**
- Automatically disabled in light mode (checks `useLightMode` context)
- Lazy loads animation JSON on first render
- Caches animation data after first load
- Shows placeholder while loading
- Gracefully handles errors

⚠️ **Best Practices:**
- **Limit concurrent animations:** Don't render more than 3-5 coin animations at once
- **Use for emphasis:** Best for key reward moments, not background decorations
- **Size appropriately:** Use 40-80px for most UI elements
- **Consider performance on mobile:** Reduce speed or count on low-end devices

## Integration Examples

### Header Coin Display
```tsx
// components/Header.tsx - Replace CoinIcon with animated version for emphasis
<div className="coin-display">
  <CoinAnimation width={24} height={24} />
  <span>{coins.toLocaleString()}</span>
</div>
```

### Reward Modal
```tsx
// When showing reward amounts
<div className="reward-modal">
  <CoinAnimation width={60} height={60} speed={1.2} />
  <h3>Reward!</h3>
  <p>+1000 coins</p>
</div>
```

### Shop Items
```tsx
// In ShopView - animate coins for premium items
<div className="premium-item">
  <CoinAnimation width={40} height={40} />
  <p className="cost">500 coins</p>
</div>
```

## Light Mode Behavior

In light mode, `CoinAnimation` automatically:
- Shows empty div (no visual)
- Prevents animation rendering
- Improves performance as per light mode requirements
- No changes needed - it's automatic!

## Fallback Behavior

If animation fails to load:
1. Warning logged to console
2. Shows empty div instead
3. No errors thrown
4. UI remains functional

## File Size Impact

- **coin.json:** ~50KB
- **lottie-react:** Already included (dependency)
- **Caching:** Once loaded, reused from browser cache
- **Bundle:** Negligible impact if already using Lottie

## Troubleshooting

**Animation not showing?**
- Check browser console for warnings
- Verify `public/icons/coin.json` exists
- Check network tab for failed requests

**Performance issues?**
- Reduce number of concurrent animations
- Lower the `speed` prop
- Reduce `width` and `height`

**In light mode?**
- This is normal - animations disabled for performance
- Static CoinIcon still available as fallback

## Future Enhancements

Possible additions:
- Different coin types (gold, silver, etc.)
- Start/stop animation controls
- Custom color overlays
- Animation direction (reverse)
- Bounce effect on render

