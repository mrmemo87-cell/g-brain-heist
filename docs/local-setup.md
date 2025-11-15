# Local Setup Guide

Follow these steps to run Brains Heist locally for development, QA, or content authoring.

## 1. Prerequisites
- **Node.js ≥ 18** (matches Vite + React 19 requirements)
- **npm** (bundled with Node)
- Supabase project (free tier works) with SQL access to run schema files

## 2. Clone & Install
```bash
git clone https://github.com/mrmemo87-cell/g-brain-heist.git
cd g-brain-heist
npm install
```

## 3. Environment Variables
Create a `.env.local` (Vite auto-loads `VITE_*`). At minimum:

| Variable | Description |
| --- | --- |
| `VITE_SUPABASE_URL` | Project URL from Supabase settings (e.g., `https://xyzcompany.supabase.co`). |
| `VITE_SUPABASE_ANON_KEY` | Anon/public API key from Supabase. |
| `VITE_SUPABASE_AUTH_REDIRECT_URL` | Absolute URL that Supabase should redirect to after auth (e.g., `http://localhost:5173/auth/callback`). |
| `VITE_SUPABASE_AUTH_CALLBACK_PATH` | Optional path appended to site URL when deriving redirect (defaults to `auth/callback`). |
| `VITE_SITE_URL` / `VITE_PUBLIC_SITE_URL` | Optional explicit site origin used for emails and deep links. |

`services/env.ts` normalizes these values and throws descriptive errors when missing, so failures happen early in dev builds.

## 4. Database Setup
1. **Provision tables**: Run [`supabase-schema.sql`](../supabase-schema.sql) in the Supabase SQL Editor. This creates `users`, `mcq_questions`, PvP, clan, task, shop, and cap tables along with triggers.
2. **Optional modules**: Apply SQL in `supabase-functions/` as needed:
   - `teacher_question_system.sql` → teacher roles, question banks, classes, quests.
   - `rpc_hack_attempt.sql`, `rpc_grant_levelup_rewards.sql`, `function_calculate_ap.sql`, `rpc_check_achievements.sql` → gameplay RPCs and helpers.
   - `achievements_schema.sql`, `tournaments_schema.sql`, etc. → feature-specific tables.
3. **Seed data**: Use the commented sample inserts in `supabase-schema.sql` or craft your own via Supabase Table Editor for quick demos.

## 5. Migrations & Versioning
- Store SQL migrations alongside `supabase-functions/` and document run order in `MIGRATION-STEPS.md`.
- For multi-env teams, use Supabase CLI (`supabase db dump`) or another migration runner to apply scripts consistently.

## 6. Run the Dev Server
```bash
npm run dev
```
- Vite serves the app at `http://localhost:5173` by default.
- Auth callbacks must point to this origin when testing email links.

## 7. Testing & Tooling
| Command | Purpose |
| --- | --- |
| `npm run lint` | Type-only lint (invokes `tsc --noEmit`). |
| `npm run test` | Builds test bundle and runs Node test runner with mocked Supabase RPC gateway. |
| `npm run build` | Production build (outputs to `dist/`). |
| `npm run preview` | Serves built assets locally to mimic production. |
| `npm run load:*` | K6 load tests for leaderboard, shop, or PvP behavior. |

## 8. Supabase Service Role Actions
- Create storage buckets (e.g., avatars) via Supabase dashboard.
- Configure pg_cron (optional) if you want scheduled AP regeneration from `function_calculate_ap.sql`.
- Ensure RLS policies defined in the SQL files are enabled before inviting real users.

You now have a working dev stack. Keep `.env.local` out of source control and rotate Supabase keys per environment.
