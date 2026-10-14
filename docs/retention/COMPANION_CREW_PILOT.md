# Companion and crew pilot

Adds a named, privately personalised cyber-fox companion to the existing Gulzada/Jess retention trial. The mascot is a pre-rendered transparent WebP (~31 KB), with original SVG hideout, fallback fox and celebration particles. No WebGL engine, new dependency, continuous animation, AI call, realtime subscription or cron job.

Students can name their companion and choose its aura; these preferences are server-saved across devices and never exposed to classmates. Saved practice rounds advance a four-chapter mystery and remain in a personal keepsake view. There is no decay, absence penalty or story deadline.

Each published class assignment becomes a shared hideout. Completion counts use existing student assignment status (including confirmed paper work), excluding quarantined recipients. First completion opens the signal desk, 50% opens the studio and 100% opens the rooftop. It gives no score/XP/reward and changes no official assessment data. Base camp is explicitly shown when no published assignment is available. Recent 90-day assignments are selectable, up to 12; older teacher encouragement is preserved in up to 12 private keepsakes.

Students may send one of three preset crew cheers; the actual assignment teacher may send one of three encouragements. One signal per person/assignment/Bishkek day, with retries deduplicated. Cheers are anonymous aggregates over seven days; teacher encouragement is attributed to its actual teacher. No free-text chat, student roster, public popularity score, cross-school room or fabricated classmates. Gulzada and Jess only share a room if Gulzada is actually assigned Jess's work. No sample activity is inserted into the pilot.

Teacher trial keeps its private student appreciation summary and adds saved encouragement history. Pilot eligibility, assignment membership, actual teacher ownership, same school, publication and quarantine checks run server-side. Private tables have RLS and no direct public/anon/authenticated access. Public RPCs have fixed empty search paths, revoke anonymous execution, and require the existing pilot gate.

The companion snapshot adds one deduplicated read when mounted; client cache lasts 60 seconds. Manual refresh succeeds at most once a minute per mounted panel. No polling or per-animation writes. Naming changes have a ten-second server cooldown, while identical retries are idempotent. Crew writes are bounded by the daily unique key. Supabase indexes already cover assignment membership and teacher lookup; new signals use assignment/date index.

GSAP loads only for a deliberate character, clue, hideout or saved-action celebration. The scoped sequence lasts under one second, with 12 particles and three room groups. It stops on page hiding, reduced-motion changes or unmount. Existing introductory animation remains. The image is lazy-loaded with a code-native SVG fallback. Layout stacks on small screens; controls are keyboard accessible and have focus styling.

Original synthetic cues remain off by default. Per-account/device volume slider (0–100%, default 45%) and Test sound audition; triangle tones add punch to unlock/completion. At most four voices, replacing previous cues, 120 ms throttle; muting, volume changes and hidden tabs stop voices and cancel deferred audio resumes. Output loudness still depends on the device volume. No automatic background audio.

Rollback: personal Hide trial restores the usual dashboard; the owner System tab can Pause trial everywhere. Server pause immediately refuses new companion/crew actions, while the existing gate hides extras on reload/refocus. Saved companions/messages are preserved for re-enabling. No migration rollback or deletion is required to cancel the pilot.

Validation: focused TypeScript check, DOM flows for personalisation cancel/failure/retry, crew signalling, teacher attribution, image failure and empty state; PGlite tests for grants, role/assignment/school/quarantine boundaries, pause, persistence, validation and duplicate writes; audio opt-in, volume bounds and deferred-resume cancellation; existing retention regressions. Full repository CI is required at the exact PR head before merge. Signed-in iOS listening and human character acceptance remain named-pilot checks; no concurrent load-test claim is made.

Live database checks: Gulzada has 7 real eligible assignment rooms; Jess has 12. Rolled-back smoke test saved a companion, saved/deduplicated teacher encouragement and verified pause refusal. Cold first snapshot measured ~153 ms for Gulzada and ~10 ms for Jess in that single run (not a concurrency benchmark). No test profiles or messages were retained. Anonymous RPC execution and direct table reads are denied. Advisors flag the intentionally private RLS/no-policy tables and intentionally authenticated SECURITY DEFINER RPCs; the ownership gates and explicit privilege checks were tested. Browser screenshot tooling was unavailable locally (browser download failed); DOM acceptance and rendered SVG inspection were completed.

## Floating and pose update

See ECHO_FLOATING_POSES.md for the next additive release: six poses, saved-colour SVG body strands and optional draggable floating mode. Its visible-only CSS bob supersedes the initial no-idle-animation description above; it still adds no continuous JavaScript rendering, server polling or idle audio.
