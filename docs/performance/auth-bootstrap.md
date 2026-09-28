# Role-aware login bootstrap

## Decision

Use one fresh `rpc_auth_bootstrap_v1()` response after authentication. Do not introduce a login cache table or use persisted/JWT workspace claims as authority. Main owns the account snapshot; App consumes it without another profile, verification, setup, guardian-list or superadmin request. Portals still enforce their own server-side permissions and load their datasets.

## Before and after

| Concern | Before | After |
| --- | --- | --- |
| Core account boot | Ban lookup; verification and setup; another App profile/school/streak read; guardian list; capability/admin checks | One server RPC with explicit profile fields, verification, setup, school and fresh capabilities |
| Recognition screen | Four-second minimum | No minimum wait |
| Daily streak | Awaited before profile was returned | After first interactive render; existing authoritative reward RPC retained |
| Guardian discovery | Full child list for every account | EXISTS with the same active relationship/student school joins; children load inside Parent Portal |
| Auth events | Password completion and auth listener could repeat work | Password session handed directly to bootstrap; initial event deduplicated; concurrent calls share one request |
| Notifications | Auth lookup at module import | Account-bound subscription after render; cleaned up on unmount |
| Google entry | Forced consent and offline access | Default Google flow; redirect and IELTS flow preserved |
| Waiting UI | Text animation and skeleton | Optional local tile warm-up; no requests/rewards, no fake completion percentage |

One bootstrap request is **not** a claim that all dashboard datasets arrive in one request. Network/provider latency, lazy chunks and portal datasets still take time. No production end-to-end latency percentile or classroom load-capacity claim is made here.

## Security and lifecycle

- `public.rpc_auth_bootstrap_v1()` is SECURITY INVOKER. Its private SECURITY DEFINER implementation binds to `auth.uid()`, has no user-id argument, pins an empty search path, and exposes no anonymous execute permission.
- Email verification is read from `auth.users`, not editable user metadata. Missing auth users fail; missing public profiles enter setup. Banned profiles cannot enter App.
- Existing school capability functions remain authoritative. Owner, administrator, teaching allocation, parent and superadmin distinctions are preserved. URL/storage preferences only select among available workspaces.
- No settled auth response is cached. Sign-out/account switches invalidate in-flight results. Main keys App by account ID.
- Routine resume checks preserve the active workspace when authority is unchanged; changed capabilities cause fresh routing.
- The parent EXISTS query includes the student's current school and the school row, matching `rpc_guardian_my_children()` semantics.
- The warm-up uses native buttons, keyboard focus, 52px minimum targets, reduced-motion support and offline/slow-connection messaging. It vanishes immediately when the parent flow finishes.

## Files and rollout

- Migration: `supabase/migrations/20260928163701_auth_bootstrap_v1.sql` (matches live migration history).
- Contract and concurrency: `src/lib/authBootstrap.ts`, `services/authBootstrapService.ts`.
- Routing: `src/lib/accountWorkspace.ts`, App's existing role branches.
- Entry and snapshot handoff: `index.tsx`, `services/authService.ts`.
- Loading experience: `components/LoginLaunchpad.tsx` and CSS.

Deploy the additive database function before the frontend. The old frontend remains compatible with the new database. For rollback, redeploy the previous frontend; leave the unused additive function in place. Do not drop it while clients can still use the new bundle.

## Verification

- Live read-only comparison on 2026-09-28: **214 accounts**, zero mismatches (188 students, 12 teachers, 13 school admins, one admin). Compared setup/ban/verification, school capabilities, guardian detection and superadmin status with existing functions. Transaction rolled back; no profile writes.
- SQL privilege checks: anon denied on both functions; authenticated execute granted. Security advisor returned no findings for the new functions. Existing unrelated advisor findings were not changed.
- Unit tests cover authorized workspace preferences, revoked allocations, shared concurrent requests, fresh later reads, sign-out/account switching and unchanged-authority resume.
- PGlite runs the migration against account/relationship fixtures and verifies caller isolation, setup, bans, verification and revocations.
- Browser contract test uses the real React/Supabase client with mocked responses, including slow password login, restored account roles, local taps, mobile overflow, reduced motion, fail-closed retries and verification gates.
- Google tests validate generated authorize URLs and preserved callback targets in both auth services. A real Google consent/account-picker interaction is **not** exercised by those mocks.

Run `npm run verify`. With Playwright/Chromium installed, run `node e2e/auth-bootstrap-smoke.mjs`. Managed runtimes may set `PLAYWRIGHT_MODULE_PATH` and `CHROMIUM_EXECUTABLE_PATH`; no production credentials are needed.
