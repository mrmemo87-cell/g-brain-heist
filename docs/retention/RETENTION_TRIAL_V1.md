# Brains Heist retention trial v1

A reversible, additive student and teacher experience. The server defaults to disabled. No existing assessment, reward, assignment, IELTS or authentication procedure is replaced.

## Experience

- Existing student Up Next is preserved. Weekly Drop offers five globally verified, hash-current, grade-eligible text MCQs.
- Skill Rescue requires recent current-year registry evidence and a suitable exact skill pool. Missing evidence/pools produce a clear recovery message.
- Comeback requires a previous skill-mapped practice and five different questions at the same difficulty. Scores are practice checkpoints, not calibrated mastery claims.
- Heist Identity unlocks local decorative titles from server-confirmed completed rounds. No XP, coins, AP or ranking effects.
- Class Vault aggregates submissions from the student's latest published assignment this week. Confirmed paper work contributes; individual identities are not exposed.
- Monthly Learning Wrapped separates online work, trial practice and paper results. Paper results never become online visits.
- Teacher Radar reuses already-authorized current-scope dashboard metrics. Appreciation shows private weekly counts of optional student thank-yous. No free text, public teacher ranking, push messages or reward incentive.
- All extra panels and GSAP motion are lazy-loaded. A brief entrance respects reduced motion, has cleanup, and leaves the static UI usable if animation fails.

## Owner controls and recovery

Superadmin → System → Retention trial. Select named pilot accounts, one school, or all eligible accounts. Pause trial everywhere blocks new actions on the server immediately and retains records. Open dashboards remove extras on reload/refocus after the 30-second status check interval. Users can Hide trial and restore it on their own device; the global pause overrides that choice.

Failed status reads keep the normal dashboard. A rendering boundary contains extra-panel failures. Practice submission failures keep selections visible for retry; server submissions are idempotent. Closing an unfinished practice discards client selections but the server round can restart within 24 hours. Three started rounds per Bishkek calendar day cap selection/write traffic.

## Privacy, evidence and load

Private tables have RLS enabled and no PUBLIC/anon/authenticated table grants. RPCs derive student identity from auth.uid(); owner controls and metrics require the existing superadmin authority. Correct answers are withheld until an authorized completed practice. No service keys enter the browser.

No new realtime channels, cron jobs, AI generation or per-answer requests. Status checks are throttled to 30 seconds on lifecycle events; summaries are deduplicated and cached for one client minute/five server minutes. Each practice has start and final save requests. Engagement writes are batched, bounded and deduplicated by user/day/event. Owner metrics load only on request.

Six-week metrics count server-authoritative online assignments, completed quests/trial practice, assignment creation and confirmed paper capture by teachers. They are first-observed-in-window cohorts, not signup cohorts. Immature return windows show Not yet. Page views and paper student completions remain separate. Historical activity is a baseline and does not establish a causal trial effect.

## Release validation

Run npm run test:retention, the standard CI portal guard/typecheck/security/build/test suite, and database identity/scope/pause checks. Use Gulzada's existing account as the named student pilot; preserve all prior work. Wider rollout follows pilot/device acceptance. Actual concurrent load testing is separate from the bounded traffic design above.
