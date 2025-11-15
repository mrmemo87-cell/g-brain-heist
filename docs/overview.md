# Project Overview

## Platform Pillars
Brains Heist immerses middle-school learners in a cyber-heist fantasy where they become agents completing **solo missions**, **adaptive learning paths**, and **PvP battles**, while teachers oversee **dashboards, analytics, and mission assignments**. The platform runs entirely on a Supabase backend plus a Next.js/TypeScript/Tailwind SPA frontend that talks to Supabase Auth, Postgres, Storage, and Realtime channels.

## Architecture at a Glance
```
 ┌──────────────┐      HTTPS / Supabase Client SDK      ┌──────────────────────────┐
 │ Next.js App  │  ───────────────────────────────────▶ │ Supabase (Postgres + RPC)│
 │ (Vite dev)   │ ◀───────────────────────────────────  │  • Auth (email magic)    │
 │ React + TS   │      Realtime subscriptions           │  • Storage (avatars)     │
 └──────────────┘                                       │  • Edge Functions (RPC)  │
                                                        └──────────────────────────┘
```

- **Front-end**: React 19 + TypeScript + Tailwind, bundled with Vite for development and Next.js deployment conventions. Shared context under `src/contexts/` handles mission state, and service utilities in `services/` wrap Supabase clients and env helpers.
- **Supabase Auth**: Students/teachers authenticate via Supabase email magic links or pre-provisioned accounts, exposed through `supabase.auth.getUser()` helpers (`services/supabaseClient.ts`).
- **Database**: Postgres tables defined in [`supabase-schema.sql`](../supabase-schema.sql) cover users, MCQ questions, PvP activities, clans, tasks, shop purchases, and caps. Additional schema modules under `supabase-functions/` enable achievements, tournaments, and teacher-owned question banks.
- **RPC Layer**: Game actions use `supabase.rpc(...)` calls to named SQL functions (PvP hacks, AP regeneration, level-up rewards, achievements) so complex logic executes within Postgres while enforcing row-level security (RLS).
- **Realtime + Local State**: PvP feeds, clan chat, and activity streams subscribe to Supabase channels; progress also persists to browser `localStorage` for offline continuity.

## Key Concepts
| Concept | Description | Primary Tables / RPCs |
| --- | --- | --- |
| Agent Profile | Student or teacher identity with XP, coins, AP, streak, grade, batch. | `users`, `profiles` view |
| Missions / Quests | MCQ-based learning flows with XP/coin rewards, difficulty tiers. | `mcq_questions`, `attempts`, `quest_templates`, `question_attempts` |
| PvP Hacks | Real-time player-vs-player challenges that spend AP, steal coins, and log activities. | `rpc_hack_attempt`, `activities`, `inventory`, `caps` |
| Tasks & Rewards | Daily/weekly tasks and level-up gifts driving progression. | `tasks`, `caps`, `rpc_grant_levelup_rewards`, `sessions` (XP boosters) |
| Inventory | Consumables (shields, crackers, boosters) affecting PvP outcomes. | `inventory`, `shop_purchases` |
| Clans & Chat | Collaborative play with vaults, chat, and member roles. | `clans`, `clan_members`, `clan_chat` |
| Teacher Toolkit | Teacher role, question authoring, classes, quest templates, analytics. | `teachers`, `questions`, `quest_templates`, `classes`, `question_attempts` |

## Data & Gameplay Flow
1. **Auth + Profile**: User logs in through Supabase Auth. Frontend fetches profile via the `profiles` view and merges persistent boosters/AP from `sessions` and `caps`.
2. **Solo Missions**: The quest UI pulls curated `mcq_questions` or teacher-authored `questions`. `attempts` and `question_attempts` capture correctness, XP, coins, and time-to-answer for analytics.
3. **Adaptive Feedback**: Activity records (e.g., `quest_complete`, `pvp_win`, `shop_purchase`) are inserted into `activities`, enabling dashboards and achievements to react to behavior.
4. **PvP Battles**: `rpc_hack_attempt` enforces AP cost, shield/cracker logic, coin transfers, cooldowns, and logs `pvp_win`/`pvp_blocked` events while decrementing inventory state.
5. **Teacher Dashboards**: Teachers manage `quest_templates`, assign them to `classes`, and view aggregated stats from `question_attempts` and `activities` to identify weak topics.
6. **Analytics & Caps**: The `caps` table enforces daily/weekly XP & coin ceilings; triggers refresh `last_seen`, `member_count`, and other derived metrics.

## Deployment Targets
- **Local**: `npm run dev` launches Vite on `http://localhost:5173` with `.env`-driven Supabase credentials for dev/test projects.
- **Cloud**: Build artifacts via `npm run build` deploy to Vercel, Netlify, or static hosting. Supabase project configuration travels via environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_AUTH_REDIRECT_URL`).

Keep this overview handy when onboarding engineers or stakeholders—they can trace how UX concepts map to backend primitives without diving straight into schema files.
