# Commander storm arena and combat effects

The existing battle phase remains the authority for every effect. No engine, formation, input, turn, score, API, or checkpoint behavior changes.

- The battlefield uses a painted storm arena with restrained cyan/red side lighting and a dark vignette.
- Death Bolt charges a fractured violet lance, travels toward the target, then breaks into a violet slash/fracture impact. The old circular orb and full-length dotted guide are removed.
- Authored archer arrows retain their calibrated target-facing rotation and carry a short textured wake. Projectiles only exist during windup, are hidden until launch, and finish before impact at both playback speeds.
- Normal hits use an ember slash, shield absorption uses a cyan variation, guarding uses an open-centred segmented energy barrier, and focus uses angular targeting brackets. These overlays never intercept clicks or move the units.
- Death Bolt impact triggers one low-opacity lightning exposure behind the units. The existing audio manager plays `mixkit-fast-thunder-impact-1279.wav` at 0.18 gain for 1.2 seconds, starting at 0.62 seconds to align its attack transient with the flash. Other audio cue mappings remain unchanged. The existing event/phase key prevents rerender-driven duplicate playback.
- Effects and Animations controls remain effective. Reduced motion suppresses flight, lightning, and all old/new motion while retaining a static, restrained impact indicator. No ambient flash loop, additional timers, or animation dependency is introduced.
- The existing sprite preload/decode gate includes all three new textures. Failed art is hidden over the dark fallback; asset failure cannot block gameplay indefinitely.

## Assets and generation

Generated with the built-in image tool, then optimized for delivery. The two effect PNGs retain genuine alpha at 512px; the arena is a 1536×1024 WebP. Total delivered art is approximately 750 KB.

| Asset path | Use |
| --- | --- |
| `src/assets/commander-vfx/storm-arena.webp` | Background |
| `src/assets/commander-vfx/death-lance.png` | Bolt charge, bolt flight, short ranged wake, shield energy |
| `src/assets/commander-vfx/impact-slash.png` | Melee/ranged hit, shield absorption, violet bolt fracture |

The image tool reached its usage limit after these three assets. Shield and target details are bespoke vector treatments composited with the generated energy texture; they are not additional generated PNGs.

### Prompt set

All prompts used this style system: futuristic neon cyber-education game UI, dark slate background, cyan/blue/purple glow accents, occasional amber for rewards/premium, clean high-contrast UI-friendly composition, no clutter, no realistic humans unless requested, no copyrighted logos, no watermarks, no illegible text. Rendering: crisp 2D/2.5D digital art optimized for product UI overlays. Transparent PNG where possible for badges/icons, full-bleed WebP/PNG for banners/cards.

Arena: production landscape 1536×1024 battlefield. An abandoned elevated obsidian tactical arena in a storm, sophisticated painted game environment, crisp stone-metal panels with subtle engraved circuitry, broken monolithic pylons at far edges, cyan rim light left and smouldering ember violet right, distant ruined citadel and layered clouds. Slightly elevated camera, horizon at 25%, empty dark walkable floor across bottom 75%, spacious low-contrast centre for overlaid units. Fine distant rain haze, tiny distant lightning vein. No units, people, UI, text, grid lines, or large objects obscuring play space. Premium dark fantasy meets sci-fi esports.

Death Bolt: production transparent game VFX sprite. Elongated jagged violet plasma lance travelling RIGHT, white-hot spear tip, branching purple lightning wrapping fractured dark crystalline core, exquisite magenta-violet filaments trailing LEFT. Asymmetric, sharp, fierce. Horizontal composition centred on a square canvas, genuine transparent alpha, generous transparent margins, no black matte, scenery, text, UI, circular orb, disk, or frame. Dense detailed core, delicately fading sparks. Intended to rotate as a projectile and shrink during charge.

Impact: premium transparent game VFX sprite. Violent crescent slash impact from upper-left to lower-right; finely detailed white-hot blade arc and central cluster of molten amber shards, ember-red sparks, delicate smoke fading to alpha. Compact asymmetrical explosion, razor-sharp layered fractures with rich light falloff. No circular ring, simple star, UI, background, text, weapon handle, or human. Entire effect contained with transparent padding. Rich texture and convincing sparks, not flat clipart.

## Verification

- Typecheck, production build, and 12 focused Commander cache/projection, intro, and cinematic playback tests passed.
- Browser harness renders the real Battlefield component with real engine combatants and controlled presentation phases. All six units fit without page overflow at 320, 375, 390, 430, 768, 1024, and 1440px.
- All generated textures and the thunder clip returned HTTP 200; desktop, phone impact, and shield screenshots were inspected.
- Charge/flight/impact/settle lifecycle, authored arrows, guard overlay, Effects off, Animations off, reduced motion, single audio playback on rerender, and restart effect cleanup passed with no page errors.
- Audio instrumentation confirmed Death Bolt and thunder start in the same audio clock tick. This harness does not claim a production-account end-to-end session or live deployment.
