# Cursed Commander presentation upgrade

Commander is now a regular App page (`?view=commander`) alongside Lockdown, rather than a dialog, portal, or browser fullscreen view. Back returns to the dashboard. The existing signed practice API, combat engine, canonical formation points, unit IDs, scoring, and turn playback remain unchanged.

Startup awaits the existing sprite registry (now decoding images before completion) alongside the practice request and audio preload. Failed or timed-out sprites use the existing fallback marker; optional audio fails silently. Normal gameplay is gated both in the arena action handler and the battlefield/dock until the intro finishes. The intro derives teams and deployment order from the actual roster. The current practice engine supports player/enemy sides; the timeline itself supports arbitrary side names and unit counts without introducing new game teams or formation slots.

The typical six-unit intro takes about six seconds. Skip reveals every unit and cancels pending presentation timers and audio; it cannot bypass asset readiness because the battlefield mounts after preloading. Unmount/restart clears timers and pending sound requests. Sound preference survives restart. Reduced motion removes deployment transforms and shortens the introduction.

Unit dimensions use the battlefield container. Below 900px, a separate presentation projection arranges both squads in two columns and three rows. The whole board fits the page width; normal vertical page scrolling replaces horizontal panning. Desktop retains canonical formation positions. Movement, effects, and projectile endpoints use the same screen projection. Unit panels show explicit HP, shield (SH), and attack (ATK) values with high-contrast bars, including zero HP. Sprite poses replace a single mounted image immediately; no old/new pose crossfade remains.

Projectiles now point toward their target, superseding the earlier vertical-only requirement. The two authored arrow axes are calibrated independently, then rotated toward the target in rendered pixel space. A pixel-sized SVG viewBox prevents tall mobile aspect ratios from distorting that heading. The visual trajectory is straight between projected source and target; hit logic is unchanged.

## Refresh recovery

The latest server-issued transcript is saved in localStorage under the authenticated user's ID. The displayed battle is reconstructed from that transcript on reopening/refresh; combat values are not recalculated or reset. Account mismatch, malformed records, and expired sessions are ignored. The cache is a presentation checkpoint, not an authorization source: the existing API still verifies HMAC, ownership, and expiry on each turn.

A confirmed response is saved before cinematic playback, so refreshing mid-animation restores the confirmed HP, shields, focus, turn, and cooldown. Pending input is saved with its original transcript before submission. On reopening, replaying that exact input recovers the same deterministic practice turn without double-applying damage (the existing practice engine has no persistent combat side effects). Recovery failures offer Retry or an explicit new practice. Storage failures show a notice rather than claiming progress was saved.

Recovery works in the same browser/account during the existing 15-minute practice-session lifetime. It does not introduce permanent progression, cross-device synchronization, or extend signed-token expiry. Only an explicit new practice starts a fresh army. Restored sessions skip deployment after asset loading.

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

- Typecheck, production Vite build, and diff whitespace check passed.
- Full suite: 1,444 passed, 11 failed, 2 skipped. The same 11 Commander failures already existed in the baseline (five practice HTTP tests and six stale source-text assertions).
- New tests cover exact combat-value restoration, pending-intent recovery, user isolation, expiry/corrupt/blocked storage, compact projection, and target-facing arrow math at all seven widths.
- Actual Arena component browser harness passed at widths 320, 375, 390, 430, 768, 1024, 1440: all six unit shells inside the board, no intersecting shells, no horizontal page overflow, and legible numeric font sizes. Desktop/mobile screenshots inspected.
- Browser checks confirmed no dialog/fullscreen element, one sprite image per unit, refresh mid-animation preserving damaged HP/shields/turn/cooldown, no new-start request on reload, pending-turn recovery, and zero page errors. The harness mocks API responses with the real deterministic engine; it does not use a production login.
- Both arrow artworks' actual rendered transformation matrices point at targets at every tested width (14 direction checks).
- Audio service/assets unchanged in this follow-up. No API/engine/database changes or deployment.
