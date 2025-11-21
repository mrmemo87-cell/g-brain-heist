# Place lockdown_map.svg here

## Required Structure

Your SVG file must have 8 groups with these exact IDs:
- `region_1`
- `region_2`  
- `region_3`
- `region_4`
- `region_5`
- `region_6`
- `region_7`
- `region_8`

These IDs allow the map component to color each region dynamically.

## From Inkscape

1. Save your map as `lockdown_map.svg`
2. Place it in this directory
3. Ensure each region is a `<g>` group with an `id` attribute
4. The system will automatically color regions based on clan control

## Example Structure

```xml
<svg>
  <g id="region_1">
    <!-- paths for region 1 -->
  </g>
  <g id="region_2">
    <!-- paths for region 2 -->
  </g>
  <!-- ... etc -->
</svg>
```
