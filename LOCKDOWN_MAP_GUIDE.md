# Lockdown Map Integration Guide

## Overview
The Lockdown mode now includes a dynamic territory map that displays clan control over different regions based on player performance. Each region's color and intensity reflects which clan is dominating that area through correct answers.

## Features

### 1. **Visual Territory Control**
- 8 distinct regions on the map (region_1 through region_8)
- Each region is colored based on the top-performing clan
- Color intensity reflects the clan's percentage of answers in that region
- Smooth transitions and hover effects for better UX

### 2. **Clan Statistics Per Region**
- Shows clan name and percentage control
- Displays clan avatar for the leading clan
- Real-time updates as players answer questions
- Side panel with detailed breakdown

### 3. **Color Coding**
- Each clan gets a unique color (blue, red, amber, violet, pink, cyan, orange)
- Neutral regions (no data) appear in dark slate
- Opacity scales with dominance percentage (30% minimum to 100%)

## Implementation

### Data Structure

```typescript
// Player state includes clan information
type PlayerState = {
  id: string;
  name?: string;
  clanId?: string;
  clanName?: string;
  currentRegion?: string;
  accuracy: {
    correct: number;
    total: number;
  };
  // ... other fields
}

// Region statistics calculated automatically
type RegionStats = {
  regionId: string;
  clanStats: ClanStats[];
  topClan?: ClanStats;
}

type ClanStats = {
  clanId: string;
  clanName: string;
  avatarUrl?: string;
  correctAnswers: number;
  totalAnswers: number;
  percentage: number;
}
```

### Region Assignment
Players are assigned to regions based on a hash of their player ID, ensuring consistent distribution across all 8 regions. The assignment persists throughout the game session.

### Calculation Logic
1. **Group players by region and clan**
2. **Calculate total answers per clan in each region**
3. **Compute percentage: (clan_answers / total_region_answers) × 100**
4. **Determine top clan: highest percentage in each region**
5. **Update map colors in real-time**

## Usage

### Teacher View
The map automatically appears in the Teacher Control Panel:
- Located above the Active Agents list
- Shows real-time clan territory control
- Includes a legend with all region statuses
- Updates automatically with each answer

### Student View (Future Enhancement)
Could show simplified view:
- Just their own region
- Current clan standing
- Nearby contested regions

## How to Populate Clan Data

### When Players Join
Players should have their clan information included when joining:

```typescript
// In your player profile/session
const player = {
  id: userId,
  name: username,
  clanId: profile.clan_id,
  clanName: profile.clan_name,
  // ... other data
};
```

### From Supabase
If using the existing clan system, player clan data comes from:
```sql
SELECT 
  users.id,
  users.username,
  clans.id as clan_id,
  clans.name as clan_name,
  clans.crest_url as avatar_url
FROM users
LEFT JOIN clan_members ON clan_members.user_id = users.id
LEFT JOIN clans ON clans.id = clan_members.clan_id
WHERE users.id = $1;
```

## Files Modified

1. **src/features/lockdown/lockdownTypes.ts**
   - Added `clanId`, `clanName`, `currentRegion` to PlayerState
   - Added `ClanStats` and `RegionStats` types
   - Added `regionStats` to GameState

2. **src/features/lockdown/LockdownMap.tsx** (NEW)
   - React component for rendering the SVG map
   - Handles region coloring based on clan statistics
   - Shows hover tooltips and legend

3. **src/features/lockdown/regionCalculator.ts** (NEW)
   - Calculates clan control percentages per region
   - Assigns players to regions
   - Exports utility functions

4. **src/features/lockdown/lockdownEngine.ts**
   - Integrated region calculator into action pipeline
   - Updates regionStats on every game state change

5. **src/features/lockdown/LockdownTeacherView.tsx**
   - Added LockdownMap component to UI
   - Passes regionStats from game state

6. **src/features/lockdown/assets/lockdown_map.svg** (REQUIRED)
   - SVG file with groups named: region_1, region_2, ... region_8
   - Created in Inkscape with proper layer structure

## Testing

### Manual Test
1. Start a lockdown session with teacher controls
2. Add multiple players from different clans
3. Have them submit answers (correct/incorrect)
4. Watch the map update in real-time
5. Verify colors and percentages in the legend

### With Mock Data
```typescript
const mockRegionStats = {
  region_1: {
    regionId: "region_1",
    clanStats: [
      {
        clanId: "clan-a",
        clanName: "Team Alpha",
        correctAnswers: 15,
        totalAnswers: 20,
        percentage: 60
      },
      {
        clanId: "clan-b",
        clanName: "Team Beta",
        correctAnswers: 5,
        totalAnswers: 8,
        percentage: 40
      }
    ],
    topClan: { /* Team Alpha */ }
  },
  // ... more regions
};

<LockdownMap regionStats={mockRegionStats} />
```

## Future Enhancements

1. **Contested Regions** - Flash border when percentage is close (< 10% difference)
2. **Historical Control** - Show region control over time
3. **Bonus Rewards** - Award coins/XP for controlling specific regions
4. **Strategic Elements** - Different regions give different bonuses
5. **Animation** - Territory capture animations
6. **Sound Effects** - Audio feedback when regions change hands
7. **Student Map View** - Show simplified map to players
8. **Region Challenges** - Special questions tied to specific regions

## Troubleshooting

### Map Not Showing
- Verify `lockdown_map.svg` exists in `src/features/lockdown/assets/`
- Check that group names match: region_1, region_2, etc.
- Ensure Vite config allows `?raw` imports

### Colors Not Updating
- Check browser console for errors
- Verify `regionStats` is being passed to component
- Ensure `calculateRegionStats` is being called

### Players Not Assigned to Clans
- Check that player data includes `clanId` and `clanName`
- Verify clan data is loaded from database
- Test with mock data first

## Performance Considerations

- Region calculations run on every action (optimized with simple iteration)
- SVG manipulation uses direct DOM access (no virtual DOM overhead)
- Map legend has overflow-y-auto for many clans
- Consider throttling updates if > 50 players

## Demo/Development

Use the Lockdown Sandbox mode to test:
```typescript
// In LockdownSandbox.tsx
const mockPlayer = {
  id: "player1",
  name: "Agent Nova",
  clanId: "clan-alpha",
  clanName: "The Alphas",
  coins: 100,
  heat: 20,
  // ...
};
```
