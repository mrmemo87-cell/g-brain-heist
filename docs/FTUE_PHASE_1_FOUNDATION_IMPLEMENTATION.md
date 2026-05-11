# Phase 1 FTUE Foundation Implementation Notes

## What was implemented

This phase adds the infrastructure needed for future Brains Heist FTUE flows without building the full onboarding UI yet.

Implemented foundations:

- Minimal onboarding resolver.
- Lightweight onboarding state service.
- Feature flag helpers.
- Segment-aware feature gating helpers.
- Analytics event emission hooks.
- Observe-only route gate.
- SQL migration for `user_onboarding` and optional `onboarding_events`.

The Phase 1A learner shell now takes ownership by default for brand-new learner accounts: `ftue_enabled` defaults to `true`, and the enforced route gate renders the learner FTUE shell for incomplete `school_student` and `solo_learner` resolutions. Rollback remains safe with `VITE_FTUE_ENABLED=false` or `localStorage.setItem('brains_heist_ftue_enabled', 'false')`.

## Resolver strategy

The resolver lives in `src/features/onboarding/onboardingResolver.ts` and converts current user/profile/state inputs into one small decision object:

- active segment/persona
- active context
- eligibility
- completion status
- next onboarding step
- feature reveal level
- gated feature keys
- fallback route

It is not a workflow engine. Phase 1 deliberately uses a small set of enum-like string unions so future screens can rely on stable, testable decisions without committing to a complex graph/state-machine abstraction too early.

## Onboarding states

The recommended production persistence layer is `public.user_onboarding`, defined in `CREATE_USER_ONBOARDING.sql`.

Important state fields:

- `segment`
- `context_type`
- `context_id`
- `current_step`
- `completed_steps`
- `core_completed_at`
- `first_value_started_at`
- `first_value_completed_at`
- `metadata`

Existing setup fields such as `needs_setup` and `tutorial_completed` remain compatibility inputs only. The new table is the future FTUE source of truth once full flows are enabled.

## Feature gating strategy

Feature gates live in `src/features/onboarding/featureGates.ts` and are client-side progressive reveal helpers only.

They must not be treated as authorization. Server-side role, school, entitlement, and RLS checks remain the source of truth for sensitive operations.

The Phase 1 gating helpers answer two basic questions:

- Is an onboarding milestone complete?
- Should a feature be visible for this onboarding resolution?

## Analytics strategy

Analytics hooks live in `src/features/onboarding/onboardingAnalytics.ts`.

They emit:

1. A browser `CustomEvent` named `brains-heist:onboarding-event`.
2. A best-effort insert into `public.onboarding_events` when that optional table exists.

Analytics failures never block onboarding.

## Feature flags

Feature flags live in `src/features/onboarding/featureFlags.ts`.

Supported flags:

- `ftue_enabled`
- `progressive_reveal_enabled`
- `byte_ftue_enabled`
- `teacher_ftue_enabled`
- `admin_ftue_enabled`

Environment variables:

- `VITE_FTUE_ENABLED` (set to `false` to roll back Phase 1A learner FTUE; defaults to enabled)
- `VITE_PROGRESSIVE_REVEAL_ENABLED`
- `VITE_BYTE_FTUE_ENABLED`
- `VITE_TEACHER_FTUE_ENABLED`
- `VITE_ADMIN_FTUE_ENABLED`

Local QA overrides use the `brains_heist_` prefix, for example `brains_heist_ftue_enabled=false` to force legacy rollback or `brains_heist_ftue_enabled=true` to force-enable the shell.

## Route protection / rollout behavior

`components/onboarding/OnboardingRouteGate.tsx` is wired around the main app in enforcement mode (`observeOnly={false}`) for Brains Heist routes. Incomplete learner resolutions render `LearnerOnboardingShell`; disabled flags, bypass, resolver errors, complete users, and non-learner segments fall through to the existing app.

Observe-only remains available as a prop for diagnostics and safe future rollouts when a route should evaluate the resolver without taking render ownership.

## Future expansion points

When implementing full FTUE flows later, build on top of this foundation by adding:

1. Real screen components for each resolver `nextStep`.
2. Segment-specific mission/teacher/admin starter actions.
3. Progressive dashboard reveal UI that consumes `featureGates.ts`.
4. Byte FTUE component that consumes `byte_ftue_enabled`.
5. Tests for resolver permutations and persistence idempotency.

## Phase 1A learner shell

The first visible FTUE implementation is limited to learner segments:

- `school_student`
- `solo_learner`

`components/onboarding/LearnerOnboardingShell.tsx` provides a short mobile-first flow with:

1. Welcome / intro.
2. Context confirmation.
3. Solo learner goal selection.
4. Lightweight codename selection.
5. Byte-guided mission brief.
6. Reward/dashboard confirmation.

The shell intentionally does not implement teacher/admin onboarding, advanced mission engines, clans, raids, shops, or dashboard redesign. It uses the existing onboarding state helpers, emits learner activation events, and can be skipped or reset safely.
