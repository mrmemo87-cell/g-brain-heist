# Classroom traffic reliability — 7 October 2026

## Implemented

- Assignment lists fetch compact metadata/counts, without question snapshots or per-question resume aggregates. Opening an assignment fetches only its authorized detail. Existing v2 RPCs remain available for previous deployments and rollback.
- Failed/timed-out assignment discovery presents a retry state rather than treating the failure as an empty assignment list and downloading the practice catalog. HTTP reads are aborted on timeout, replacement or unmount; stale detail replies cannot replace the current run.
- Dashboard polling pauses while students are in other views or the browser is hidden. Routine profile polling uses a local authenticated session and a profile read, with server AP regeneration only when the known profile indicates regeneration can be due. It does not re-claim streak rewards, hydrate clan metadata, load cosmetics, or reload assignment lists. Explicit refreshes retain full hydration.
- Realtime profile comparisons use the current local profile; old-row payloads under RLS can contain only a primary key.
- Activity feeds subscribe only on the dashboard; bursts coalesce for five seconds and cannot start overlapping feed reads. Errors are handled and late responses after leaving the dashboard are ignored.
- Full profile hydration now loads all active cosmetics in one query and performs no cosmetic users-table writes. Existing activation/deactivation mutation paths still maintain persisted cosmetic fields.
- Practice progress reuses its already-loaded subject catalog.

Answer-save, finalization, server grading, review, immutable snapshots and their correctness locks are unchanged. SchoolAdminPortal.tsx is unchanged. IELTS contract consulted: IELTS_DIAGNOSTIC_BIBLE.md v1.2.0; no scoring, content, evidence or entitlement changes.

## Validation

`npm run verify` passed: portal guard, content/taxonomy validators, TypeScript checks, migration security guard, production build and regression suite. 1,851 checks executed successfully, two pre-existing skips. The new checks exercise cancellation/timeout, rendered assignment-error retry and resume, stale detail replies after unmount, assigned-student authorization, future/closed/completed availability, resume scoring and short-answer key redaction.

Important scope: repository TypeScript configuration includes .ts files; production compilation and the rendered DOM tests exercise the changed TSX student flow. The DOM tests use mocked services and do not certify device/browser behavior under real network load.

Production migration applied through the connected project `sozodkxwhubespiedgxm`; local migration filename mirrors the applied migration-history version `20261007153922`.

Read-only production check: revalidated designated student identity, student role, verified email and unbanned status; used its authenticated database role/claim without modifying attempts. Its one active 30-question assignment yielded:

| Check | Result |
| --- | --- |
| Legacy list payload | 65,915 bytes |
| Compact list payload | 486 bytes |
| Selected detail vs corresponding legacy payload | Equal |
| Warm single summary call | 1.691 ms, 82 buffer hits |
| Cold single summary calls | 209.715–532.341 ms in these observations |

These are bounded single-user database smoke checks, not browser pilot acceptance or load benchmarks. Cold planning/initialization and current database conditions affect timings. Do not extrapolate to 1,000 or 5,000 users.

## Capacity acceptance still required

No isolated staging project, staging credentials/fresh user fixtures or k6 binary were available in this environment. No production load test was attempted. Thus there is no measured thousands-user capacity certification for this release.

The staging-only `load-tests/classroom.js` now verifies authenticated identities/bootstrap, compact lists and selected detail, three simultaneous identical answer saves, exact saved-answer counts, idempotent finalization and concurrent teacher reporting. It blocks the production project and custom-domain aliases, requires distinct student IDs as well as distinct tokens, and uses scenario iteration indexes so teacher VU allocation cannot corrupt student fixture selection. JavaScript syntax was checked; actual k6 execution remains pending.

Run separate fresh-fixture rounds at 30, 100, 500, 1,000 and 5,000 users. Measure auth/bootstrap, answer/finalization p95/p99, error rates, saved-answer/result correctness, PostgREST pool wait, database connections/CPU/memory/locks and load-generator saturation. Set the supported production concurrency below the highest sustained passing run with capacity headroom. Also test simultaneous sign-ins/token refresh, sustained classroom sessions, mobile/browser/network interruptions and mixed dashboard/classroom traffic; the direct-RPC harness alone does not cover every browser background request or frontend asset failure.

The script thresholds are targets, not observed results: no classroom correctness errors, HTTP failure rate below 0.1%, answer p95 below 500 ms/p99 below 1.5 s, catalog/detail/report p95 below 1.5 s.

## Release and rollback

Apply the additive database migration before shipping this frontend. Require CI and preview build success, then verify the production deployment commit and READY state. A previous frontend can be redeployed without reverting the additive read RPCs or touching student answers/results. Monitor database timeout/auth/pool errors and save/finalization failures after rollout. No universal zero-failure guarantee is possible.
