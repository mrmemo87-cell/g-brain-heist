# Stabilization Plan for Brains Heist

## Goals
- Enforce strict TypeScript semantics across the Vite/React application.
- Eliminate existing build/lint warnings and prevent regressions with automated checks.
- Introduce unit coverage for Supabase RPC integrations to ensure contract safety.
- Provide reproducible load-testing scenarios for leaderboard, shop, and PvP flows.

## Current Assessment
- TypeScript `tsconfig.json` does not enable `strict` mode or granular safety flags.
- No linting tooling is configured; build step currently surfaces Vite chunking warnings.
- Supabase RPC calls are implemented inside `services/gameService.ts` and `services/authService.ts` without dedicated tests.
- There is no automated load/performance test suite.

## Execution Strategy
1. **TypeScript Hardening**
   - Enable `strict` and complementary compiler flags (e.g., `noImplicitAny`, `strictNullChecks`).
   - Resolve typing gaps introduced by stricter checks, prioritizing shared domain models in `types.ts` and service modules.

2. **Lint & Build Hygiene**
   - Adopt ESLint with TypeScript + React presets; align scripts (`npm run lint`).
   - Address lint violations and silence Vite warnings by consolidating imports or configuring manual chunks where appropriate.
   - Update CI guidance to run `lint`, `build`, and upcoming test targets.

3. **RPC Contract Unit Tests**
   - Add Vitest + testing-library utilities; create mocks for Supabase client.
   - Cover critical RPC helpers (`rpc_grant_levelup_rewards`, `rpc_hack_attempt`, `rpc_check_achievements`, `create_teacher_profile`, `regenerate_user_ap`) ensuring correct parameters/flows on success & error branches.

4. **Load Testing Suite**
   - Introduce k6-based scenarios targeting leaderboard fetch, shop purchases, and PvP attack endpoints (via Supabase functions or REST proxies).
   - Document execution in README/CHANGELOG and expose npm scripts (`npm run load:leaderboard`, etc.).

5. **Documentation & Change Management**
   - Add CHANGELOG entry summarizing stabilization milestones and new scripts.
   - Ensure PR(s) include passing `lint`, `build`, `test`, and demonstrate load-test commands.

