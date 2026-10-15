# Durable recovery and responsive shared actions

## Scope

This release preserves authoritative answer saves, grading, evidence eligibility, reward rules and school boundaries. It changes background-job transaction boundaries, repeated shared reads, presence traffic and the live classroom transport used by Lockdown/Clan Territory. It does not claim every game is capacity-certified.

The earlier inspected `src/lib/lockdownSupabaseTransport.ts` is a separate legacy/sandbox protocol. The current Lockdown manager delegates to `ClanTerritoryManager`; the active shared transport is `clanTerritorySupabaseTransport.ts`.

## Changes

- Evidence claims increment attempts and record a unique lease before a top-level worker procedure commits. Processing takes place in the next transaction without holding the job row lock. Backend death leaves a recoverable lease; timeout exceptions explicitly roll back both evidence lanes and record retry state. Eight unsuccessful claims exhaust the revision. Re-enqueue creates a new revision and revokes the old lease; an old worker cannot acknowledge newer work.
- A session advisory lock keeps processing serial across transaction boundaries. Up to twenty fast jobs drain per invocation, stopping between jobs at a five-second elapsed budget. A single job can exceed that cooperative budget; the cron database role's statement timeout remains the hard outer bound. The three-minute lease assumes an outer timeout no longer than two minutes. Verify that bound when changing cron roles/settings. No parallel worker increase or faster cadence is introduced.
- School analytics commit one school at a time. Explicit cancellation handling records a retry and earlier committed schools survive a later interrupted refresh. The loop starts at most three schools and checks a five-second elapsed budget between schools.
- Tier, entitlements and school-plan requests share in-flight work per access token. Existing successful tier/entitlement TTLs remain five minutes; school-plan reads have a short fifteen-second TTL. Failed authoritative access reads do not cache stale privileges. Account/token changes and explicit invalidation isolate pending responses. Server authorization remains authoritative.
- Presence requests coalesce and cool down in the browser for forty-five seconds, including failures, before reaching the existing database guard. The normal sixty-second heartbeat remains.
- Live game snapshots send at most one in flight, merging intermediate state into a trailing latest-state snapshot at a maximum eight snapshot sends/second, leaving room for room discovery on the shared ten-message/second client. Host reducer/UI updates remain immediate. Gameplay actions are not discarded or optimistically scored. Reconnect/state requests share this bound. Cleanup cancels trailing sends.

## Verification and acceptance

`tests/workerLeaseRecovery.test.mjs` executes PostgreSQL procedures in PGlite: top-level CALL/COMMIT, multiple-job draining, SQLSTATE 57014, atomic evidence rollback, retry exhaustion, abandoned committed claims, re-enqueue supersession and app-role denial. The abrupt-worker case models the persisted state after a lost processing transaction; it is not a hosted backend-kill test.

`tests/dashboardReadCoalescing.test.mjs` runs the actual service implementations with a mocked session/RPC client. Thirty overlapping calls share one request per resource. It also verifies account transitions and failed entitlement refresh recovery. This is a request-count test, not hosted latency evidence.

Compiled tests exercise cache invalidation, failed reads and live-game burst coalescing/cleanup. Run `npm run verify` for full repository gates.

IELTS Diagnostic Bible used: **v1.10.0**. Shared access-read behavior changes; no IELTS form, answer, scorer, band, taxonomy, review or release rule changes. Any affected capacity acceptance must be rerun under Bible section 13.

## Deploy

The CLI generated the migration before the repository's previously future-dated 22:30 migration. It was ordered immediately after that dependency as `20261015223001_durable_worker_leases_and_bounded_drain.sql`. Apply exactly once and reconcile remote migration history before bulk CLI pushes.

Validate the full migration in a rollback-only live-schema transaction. Check the current queue and active workers before applying. Execute migration as its own transaction. Then inspect the scheduled commands: each must contain only one top-level `CALL`, with no wrapping BEGIN, SELECT wrapper or SET-prefixed multi-statement command. Transaction-controlling procedures are SECURITY INVOKER with no SET clause, and execute privileges are revoked from PUBLIC, anon, authenticated and service_role. The postgres cron role is the intended caller.

Verify cron results, private grants, hard timeout, empty-queue CALL and school scheduling after deployment. Do not submit or regrade real student work to manufacture passing evidence.

## Rollback

Stop new cron invocations, allow active procedure sessions to finish or follow the incident runbook for termination, then recover expired leases. Repoint cron to the previous functions and restore their definitions from the parent revision; convert any abandoned processing claims to pending under operator control before using the old pending-only worker. Keep the additive lease/revision columns and all work/results/history. Do not replay old creation migrations or delete student evidence to roll back performance work. Restore the previous frontend commit if required.

## Outstanding capacity gates

No isolated staging environment is connected. Do not load-test production. Run 30 then 100 distinct authenticated users with actual login bursts, realistic background traffic, simultaneous completion, teacher reporting, game actions, interruptions and queue reconciliation. Include hard worker cancellation, per-school recovery and re-enqueue during real concurrent processing. Measure database CPU/I/O, pool wait, active connections, action p95/p99, evidence queue drain, Realtime fan-out and correctness. Add higher stages only after passing. New queue architecture is not proof of 100/500-user capacity.
