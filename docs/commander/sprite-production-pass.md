# Commander authored sprite production pass

This pass keeps the Commander practice engine server-authoritative and upgrades only the visual asset pipeline.

## Runtime goals

- Use the authored PNG pose set for all six combatants.
- Keep tactical formation coordinates authoritative outside the sprite renderer.
- Decode pose art before revealing it to prevent white/blank flashes on first use.
- Crossfade pose swaps inside one foot-anchored canvas so standing/attack/hit/KO art never moves the unit's battlefield slot.
- Preload the complete authored pose/projectile set once per page session, fail-soft and off the critical rendering path.
- Allow future per-pose art calibration without changing formation coordinates.

## Asset model

Each unit supports `standing`, `attacking`, `attacked`, and `defeated`. Shade Archer and Hollow Ranger additionally support `justShot` plus their authored arrow projectile PNGs.

The asset registry remains visual-only. It must not call Supabase, mutate progression, or participate in combat resolution.
