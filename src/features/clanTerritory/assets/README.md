# Place your territory_map.svg here

## Instructions

1. **Export your Inkscape map** as `territory_map.svg`
2. **Place it in this directory:** `src/features/clanTerritory/assets/territory_map.svg`
3. **Ensure your SVG has these group IDs:**
   - `region_5` → Server Room (zone-1)
   - `region_7` → Mainframe (zone-2)
   - `region_6` → Security Hub (zone-3)
   - `region_4` → Data Vault (zone-4)
   - `region_8` → Power Grid (zone-5)
   - `region_3` → Control Room (zone-6)

## Mapping Your Regions

In Inkscape:
1. Select each island/region
2. Right-click → Object Properties
3. Set the `id` field to match the names above (e.g., `region_5`)
4. Make sure each region is a `<g>` group element

## After Adding the File

1. Open `ClanTerritoryMap.tsx`
2. Uncomment line 16: `import mapMarkup from "./assets/territory_map.svg?raw";`
3. Remove or comment out the `placeholderMap` constant
4. Update `const mapMarkup = placeholderMap;` to use the imported value

The map will automatically color regions based on which clan controls each zone!
