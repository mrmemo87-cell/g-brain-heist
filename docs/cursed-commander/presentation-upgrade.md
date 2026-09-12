# Cursed Commander presentation upgrade

The existing signed practice API, combat engine, formation points, unit IDs, scoring, and turn playback are unchanged.

Startup awaits the existing sprite registry (now decoding images before completion) alongside the practice request and audio preload. Failed or timed-out sprites use the existing fallback marker; optional audio fails silently. Normal gameplay is gated both in the arena action handler and the battlefield/dock until the intro finishes. The intro derives teams and deployment order from the actual roster. The current practice engine supports player/enemy sides; the timeline itself supports arbitrary side names and unit counts without introducing new game teams or formation slots.

The typical six-unit intro takes about six seconds. Skip reveals every unit and cancels pending presentation timers and audio; it cannot bypass asset readiness because the battlefield mounts after preloading. Unmount/restart clears timers and pending sound requests. Sound preference survives restart. Reduced motion removes deployment transforms and shortens the introduction.

Unit dimensions use the battlefield's width and height. On narrow screens, a 640px minimum tactical canvas scrolls within its container, keeping existing positions and readable unit labels. The intro pans to each side; normal gameplay supports touch scrolling. At larger widths the canvas expands and units grow, capped at 150px before existing formation scale. No formation coordinates were changed. The existing formation function still owns placement for future units; duplicate fallback slots must be addressed by a separate gameplay change if the engine adds such units.

Projectile motion follows the existing path, with automatic rotation disabled. Authored arrows are calibrated separately to vertical inside a square SVG viewport, preventing responsive aspect ratios from rotating their axes. Target indicators remain outside rotating reticle groups.

## Audio mapping

All files below are existing files in `src/assets`; the Commander service no longer synthesizes tones/noise.

| Asset | Cues |
| --- | --- |
| mixkit-futuristic-space-war-percussion-2787.wav | intro ambience, charge, draw |
| mixkit-drums-of-war-call-2780.wav | team reveal, battle start, victory |
| sheilded hit.wav | deployment, selection, focus, shield impact, guard |
| deep hit.wav | countdown, damage |
| mixkit-metal-arrow-fast-hit-2770.wav | ranged fire |
| death bolt.wav | Death Bolt impact |
| mixkit-voice-from-effort-to-punch-2174.wav | melee windup |
| defeated.wav | knockout, defeat |

Clips are decoded once, gain-controlled and duration-limited with envelopes. Repeating a cue stops its previous source. Stop/mute invalidates pending plays as well as fading active sources. AudioContext resume is requested from Start or the sound control, respecting autoplay policy.

## Validation

- Typecheck and production Vite build passed.
- Full suite: 1,440 passed, 11 failed, 2 skipped. The same 11 failures reproduced against unchanged Commander source/tests: five practice HTTP tests and six stale source-text assertions. No unrelated fixes included.
- Five new timeline cases passed: 3+3, one team, 2+5+1, empty roster, 30+30. They check every team/unit appears before BATTLE, order, immutability, one completion, and reduced-motion duration.
- Browser component harness passed at widths 320, 375, 390, 430, 768, 1024, 1440: all six units present, no intersecting unit shell rectangles, no document horizontal overflow. Desktop and 320px screenshots inspected.
- Browser harness passed controls disabled during intro, normal team/countdown sequence, Skip Intro, second/third starts, no delayed intro returning after skip, action callback after readiness, reduced motion, all eight audio asset requests succeeding, and zero page errors.
- The harness uses fixture combatants, not a signed production login. Authenticated end-to-end combat and subjective listening remain manual release checks. No deployment or database changes performed.
