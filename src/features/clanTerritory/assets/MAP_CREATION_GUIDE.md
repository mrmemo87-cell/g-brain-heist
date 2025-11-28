# Territory Map Creation Guide

## How to Add New Maps to Clan Territory Control

Currently, all map options (Default, City, Fortress, Islands) use the same `territory_map.svg` file. To add custom maps for each option, follow these steps:

### 1. Create Your SVG Map Files

Create SVG files in this `assets` folder:
- `city_map.svg` - Urban warfare map with 10 districts
- `fortress_map.svg` - Defensive stronghold with 6 layers
- `islands_map.svg` - Archipelago with 12 territories

### 2. SVG Structure Requirements

Your SVG must have **groups (`<g>`)** with specific IDs that match the zone mappings. For example:

```xml
<svg viewBox="0 0 1000 800" xmlns="http://www.w3.org/2000/svg">
  <!-- For City Map -->
  <g id="district_1">
    <path d="..." fill="#1e293b" stroke="#475569"/>
    <text x="100" y="100">District 1</text>
  </g>
  <g id="district_2">
    <path d="..." fill="#1e293b" stroke="#475569"/>
    <text x="200" y="100">District 2</text>
  </g>
  <!-- Add districts 3-8 -->
</svg>
```

**Important:** The group IDs must match what's defined in `ClanTerritoryMap.tsx` in the `MAP_CONFIGS` object.

### 3. Current Zone Mappings

#### Default Map
- zone-1 → region_5
- zone-2 → region_7
- zone-3 → region_6
- zone-4 → region_4
- zone-5 → region_8
- zone-6 → region_3
- zone-7 → region_2
- zone-8 → region_1

#### City Map
- zone-1 → district_1
- zone-2 → district_2
- zone-3 → district_3
- zone-4 → district_4
- zone-5 → district_5
- zone-6 → district_6
- zone-7 → district_7
- zone-8 → district_8

#### Fortress Map
- zone-1 → layer_1
- zone-2 → layer_2
- zone-3 → layer_3
- zone-4 → layer_4
- zone-5 → layer_5
- zone-6 → layer_6
- zone-7 → central_keep
- zone-8 → outer_wall

#### Islands Map
- zone-1 → island_1
- zone-2 → island_2
- zone-3 → island_3
- zone-4 → island_4
- zone-5 → island_5
- zone-6 → island_6
- zone-7 → island_7
- zone-8 → island_8

### 4. Enable the New Maps in Code

After creating your SVG files, update `ClanTerritoryMap.tsx`:

1. **Uncomment the imports** at the top:
```typescript
// @ts-expect-error
import cityMapSvgRaw from "../assets/city_map.svg?raw";
// @ts-expect-error
import fortressMapSvgRaw from "../assets/fortress_map.svg?raw";
// @ts-expect-error
import islandsMapSvgRaw from "../assets/islands_map.svg?raw";
```

2. **Update the MAP_CONFIGS** object to use the new imports:
```typescript
city: {
  svg: cityMapSvgRaw, // Change from territoryMapSvgRaw
  // ... rest of config
},
fortress: {
  svg: fortressMapSvgRaw, // Change from territoryMapSvgRaw
  // ... rest of config
},
islands: {
  svg: islandsMapSvgRaw, // Change from territoryMapSvgRaw
  // ... rest of config
},
```

### 5. Design Tips

**Colors:**
- Use dark neutral colors for base territories: `#1e293b` (background), `#475569` (stroke)
- The system will dynamically color territories based on clan control
- Text should be light colored: `#94a3b8` or `#cbd5e1`

**Structure:**
- Group related paths within `<g>` tags
- Each zone/region should be a separate group
- Keep viewBox proportions reasonable (e.g., 800x600, 1000x800)
- Ensure all paths are closed for proper fill behavior

**Testing:**
- Start with a simple layout and test it in-game
- Verify all zones can be selected and colored correctly
- Check that zone boundaries are clear and visually distinct

### 6. Advanced: Adding More Than 8 Zones

If you want maps with more zones (like the 10-district City map):

1. Update `clanTerritoryTypes.ts` to add more zones to the `ZONES` array
2. Update the zone mappings in `MAP_CONFIGS`
3. Create corresponding regions in your SVG

### Example: Creating a Simple Test Map

```xml
<svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
  <rect width="800" height="600" fill="#0f172a"/>
  
  <!-- Row 1 -->
  <g id="district_1">
    <rect x="50" y="50" width="150" height="150" fill="#1e293b" stroke="#475569" stroke-width="2"/>
    <text x="125" y="125" text-anchor="middle" fill="#94a3b8" font-size="14">District 1</text>
  </g>
  
  <g id="district_2">
    <rect x="220" y="50" width="150" height="150" fill="#1e293b" stroke="#475569" stroke-width="2"/>
    <text x="295" y="125" text-anchor="middle" fill="#94a3b8" font-size="14">District 2</text>
  </g>
  
  <!-- Add more districts... -->
</svg>
```

Save this as `city_map.svg`, follow steps 4 above, and you're done!

## Troubleshooting

**Map doesn't appear:**
- Check that the file is in the correct `assets` folder
- Verify the import path in `ClanTerritoryMap.tsx`
- Make sure the file has the `.svg` extension

**Zones don't color:**
- Verify group IDs match the `zoneToRegion` mapping
- Check that groups contain fillable paths/shapes
- Ensure paths are properly closed

**Visual glitches:**
- Remove any hardcoded fills from child elements in your SVG
- Use consistent stroke widths
- Test with different clan colors to ensure visibility
