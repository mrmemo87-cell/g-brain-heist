# Classroom performance audit and overhead reduction — 17 October 2026

Scope: why a class froze on 2026-10-15, what still costs database time today,
and the changes made. Every change is performance-only and was proven to return
identical results before being proposed for production.

## 1. The 2026-10-15 incident (08:56–09:06 UTC)

- About 10 devices, 200–700 API requests/minute. Volume was small; requests were expensive.
- 08:56 auth spike (sign-ins/sign-ups), 08:58 first statement timeouts (8 s API cap),
  peak 18 per minute at 09:03, cron "job startup timeout" 08:59–09:04.
- Timed-out statements included trivially cheap ones (presence upsert, primary-key
  lookups, FK checks), i.e. the whole database was starved, not one slow query.
- Root cause (already fixed on 2026-10-15 by `20261015150000…` and follow-ups):
  analytics evidence ingestion (5–9 s per student) ran inside each student's
  final-submit transaction while holding the student's row lock.
- Re-verified today on production data (rolled back): 25 answer saves = 195 ms total,
  finalize = 104 ms, background evidence job = ~0.5–2.7 s, off the request path.
- No real class has run since that fix, so it is not yet proven under classroom load.

## 2. Remaining structural bottlenecks found

| Area | Measured (warm, production data) | Cause |
| --- | --- | --- |
| Teacher roster helper `private.teacher_current_teaching_roster` (20+ callers incl. RLS checks) | ~550 ms per call | Planner joined every school member × every offering (145k rows) before applying the teacher's groups |
| RLS on assignment tables | teacher `select assignments` 633 ms; `assignment_questions` 0.8–1.2 s even for a student | `auth.uid()` and the restrictive guard `can_use_feature('assignments', false)` evaluated once per row (1,626 rows) |
| RLS on Writing Hub tables | `bh_writing_daily_tasks` 2.7–3.2 s per read (incl. a student); `bh_writing_prompt_bank` ~8 s per teacher | per-row `actor_has_programme_access(...)` restrictive guard + per-row roster |
| Idle email dispatcher sweep | ~45% of all API requests on 15–16 Oct | Edge Function called every minute even with nothing queued (4 requests per call) |
| Cold connections | 10–130 ms extra on first call per function per connection | PostgREST recycles idle connections; large plpgsql functions recompile |

Not bottlenecks (measured): sign-up triggers (~4 ms warm), student login RPC set
(~60 ms warm total), Realtime (largest cumulative total, but ~0.5% of one core on
average; `activities` gets ~2–16 rows/day).

## 3. Changes

### Database (migrations; apply in order)
1. `20261017060000_rls_initplan_and_roster_planner_stability.sql`
   - `alter function private.teacher_current_teaching_roster … set join_collapse_limit = 1`
     (planner setting only; keeps the already-written efficient join order).
   - Rewrites 479 policies so allow-listed STABLE scalar helpers run once per
     statement: `E` → `(SELECT E)`. Built-in proofs abort the migration if any
     policy changes beyond the wrapper, any string literal changes, or any
     per-row allowed call remains. Roles/commands/permissive mode untouched.
   - Rollback: `supabase/rollbacks/20261017060000_…rollback.sql` (exact prior text
     of all 479 policies; md5-verified capture).
2. `20261017061000_gate_idle_email_dispatcher_sweep.sql`
   - Same cron schedule and HTTP call, now only when one of the three claim
     functions would claim (or retire) a row. Predicates copied from the claim
     functions. Immediate-send triggers unchanged. Rollback SQL is in the file.

### App (no data/behaviour change for visible users)
- `services/gameService.ts`: 4 retry loops keep the same attempts/backoff plus
  0–400 ms random jitter, so a class does not retry in lockstep.
- `App.tsx`: announcement poll skips hidden tabs and refreshes immediately when a
  tab becomes visible.

## 4. Verification evidence

- Roster helper: 36 teacher/school cases, 266 rows, 0 differences; 4,095 ms → 164 ms.
  Six roster-backed teacher functions: ~530 ms → 8–17 ms.
- RLS rewrite: 138 tables × 15 user personas (superadmin, 3 school admins incl.
  guardian, 6 students across schools/individual/clan/guardian, 3 teachers incl.
  no-school, IELTS user, anonymous) = 2,070 visibility comparisons (row count +
  md5 of visible row ids), 0 differences. Baseline captured with the original
  policies; comparison run against the real migration text inside rolled-back
  transactions.
- Excluded from row comparison (29 tables): `brains_heist_*`, `clan_buffs`,
  `raids`, `raid_*`, `task_progress`. Their policies recurse ("stack depth limit
  exceeded") for every non-superadmin before and after; covered by the textual proofs.
- Email gate: evaluated against live queues (false while nothing is due).
- Repo guards: `check-supabase-migration-security` and
  `check-school-admin-portal-integrity` pass. `npm run verify` (typecheck/build/tests)
  could not run in this environment (npm registry not reachable); run it in CI.

## 5. IELTS Diagnostic Bible check (AGENTS.md gate)

Bible version used: 1.10.0. The RLS rewrite touches `ielts_*` table policies for
performance only. Assessment/scoring impact: none. Data migration impact: none
(policy expressions and one function setting). Backward compatibility: identical
row visibility proven for school, cross-school, independent and anonymous
personas (§5.3 fail-closed isolation preserved; §13.1 authorization preserved).
Capacity evidence (§13.2) does not exist yet and is not claimed.

## 6. Found but not changed (need an owner decision)

- Recursive RLS on `raids`, `raid_*`, `clan_buffs`, `task_progress`, `brains_heist_*`:
  any non-superadmin read burns 3–20 s of CPU then errors. `src/features/raids/raidService.ts`
  reads raid tables directly, so the raids feature cannot work for normal users today.
- `rpc_teacher_teaching_groups` ~110 ms (per-group `subject_group_read_model`),
  `rpc_ielts_programme_access` ~120 ms (IELTS gate applies).
- 1,142 overlapping permissive policies, 316 unused and 8 duplicate indexes,
  235 loose `.sql` files at repo root.
- Still required by the 15 Oct runbook: 30 → 100 student staging load test.

## 7. Raids feature retired (owner decision, 2026-10-17)

The boss-raid "Raids" feature was planned then cancelled. Removed safely:

- App: `src/features/raids/*` (RaidView, RaidAdminView, raidService, raidTypes),
  `raids`/`raid_admin` routes and view types, Raids / Raid Admin dashboard buttons,
  the boss-raid wrappers in `gameService.ts` and RPC callers in `rpcGateway.ts`,
  the Raids entry in the plan feature list and pilot-quota UI mapping, the
  onboarding `raids` gate, the session-only admin toggle, and the IELTS page line
  promising "bonus raids".
- Database (`20261017070000_retire_cancelled_raids_feature.sql`): tables `raids`,
  `raid_waves`, `raid_participants`, `raid_events` (rows kept) and the RPCs
  `create_raid`, `join_raid`, `submit_raid_answer`, `finalize_raid`,
  `get_raid_status` move to schema `archive_raids`, which app roles cannot use.
  `rpc_superadmin_user_intelligence` reads the archived participants table, so its
  output is unchanged. Rollback script in `supabase/rollbacks/`.
- Rehearsed on production (rolled back): superadmin output identical for 5 users,
  rows 1/4/3/3 preserved, anon/authenticated denied, public objects gone.
- Not touched: PvP "raids" (PvP attack flow, `raid_targets`, `raid_attack`),
  billing/plan keys `raids` and `raid_attempts` stored in entitlement and
  pilot-quota data, the unused "Raids" translation entry, legacy `brains_heist_*`.
