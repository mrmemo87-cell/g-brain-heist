# Fix: Unreachable Zones in Lockdown Mode

## Problem
Students could only capture 6 zones in lockdown mode, leaving 2 zones on the map unreachable and uncontrollable.

## Root Cause
The `ZONES` array in `src/features/clanTerritory/clanTerritoryTypes.ts` only contained 6 zone definitions:
- zone-1 to zone-6

However, the lockdown territory map (both in the placeholder SVG and the actual game logic) displays 8 regions, making regions 7 and 8 visible but unreachable.

## Solution
Added 2 new zones to make all 8 zones on the map capturable by students.

### Changes Made

#### 1. Updated `src/features/clanTerritory/clanTerritoryTypes.ts`
Added 2 new zones to the `ZONES` array:

```typescript
export const ZONES: Zone[] = [
  { id: "zone-1", name: "Server Room", baseValue: 100 },
  { id: "zone-2", name: "Mainframe", baseValue: 150 },
  { id: "zone-3", name: "Security Hub", baseValue: 120 },
  { id: "zone-4", name: "Data Vault", baseValue: 200 },
  { id: "zone-5", name: "Power Grid", baseValue: 100 },
  { id: "zone-6", name: "Network Core", baseValue: 180 },
  { id: "zone-7", name: "Quantum Vault", baseValue: 220 },  // NEW
  { id: "zone-8", name: "Neural Hub", baseValue: 190 },     // NEW
];
```

**Zone Values:**
- **Zone 7 (Quantum Vault):** 220 points - High value zone
- **Zone 8 (Neural Hub):** 190 points - Strategic zone

#### 2. Updated `src/features/clanTerritory/components/ClanConquestMap.tsx`
Added SVG layout coordinates for the 2 new zones:

```typescript
const REGION_LAYOUT: RegionLayout[] = [
  // ... existing zones 1-6 ...
  { id: "zone-7", path: "M40 360 H220 V480 H40 Z", labelPosition: { x: 80, y: 420 } },   // NEW
  { id: "zone-8", path: "M260 360 H580 V480 H260 Z", labelPosition: { x: 380, y: 420 } }, // NEW
];
```

These positions place zones 7-8 in the bottom row of the map grid.

## Impact

### Before
- 6/8 zones capturable
- 2 zones visible but unreachable
- Students limited in strategy options

### After
- ✅ 8/8 zones fully capturable
- ✅ All visible regions are playable
- ✅ More strategic depth with 2 additional high-value targets
- ✅ Balanced territory control across the full map

## Technical Details

### Automatic Initialization
The `clanTerritoryEngine.ts` automatically initializes all zones from the `ZONES` array:

```typescript
export const INITIAL_STATE: ClanTerritoryGameState = {
  // ...
  zones: ZONES.reduce((acc, zone) => {
    acc[zone.id] = {
      id: zone.id,
      influence: {},
    };
    return acc;
  }, {} as Record<ZoneId, any>),
};
```

This means any new zones added to the array are automatically available in:
- Zone selection UI
- Territory tracking
- Influence calculations
- Reward distributions

### Map Consistency
The lockdown map already had 8 regions defined in the placeholder SVG (`LockdownMap.tsx`), so adding these 2 zones brings the game logic in sync with the UI.

## Testing Recommendations

1. **Verify all 8 zones appear** in the zone selection list
2. **Test zone capture** for zones 7 and 8
3. **Check influence calculations** include all 8 zones
4. **Verify rewards** are distributed correctly for high-value zones
5. **Test clan territory display** shows all 8 zones on the map

## Deployment
No database migrations needed. Changes are purely code-level and will take effect on the next deployment.
