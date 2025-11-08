# 🏆 Tournament Scaffolding

This document explains the new tournament scaffolding built on top of Supabase and the existing authentication system. It is intended for engineers and operations staff who want to run seasonal bracket play across schools.

## Contents

- [Database schema](#database-schema)
- [API routes](#api-routes)
- [Front-end surfaces](#front-end-surfaces)
- [Admin workflow](#admin-workflow)
- [Coach / teacher workflow](#coach--teacher-workflow)
- [Public bracket page](#public-bracket-page)

---

## Database schema

The SQL script in [`supabase-functions/tournaments_schema.sql`](supabase-functions/tournaments_schema.sql) creates three core tables and a helper view:

| Table | Purpose |
| --- | --- |
| `tournament_seasons` | Season metadata (dates, status, description). |
| `tournament_school_signups` | Sign-ups driven by invite/school codes. Stores contact info, roster stub, and review status. |
| `tournament_matches` | Generated bracket matches with scheduling metadata, streaming links, and winners. |

Extra helpers include the `tournament_public_bracket` view and RPC functions used by the app:

- `approve_tournament_signup(signup_id uuid)` – mark a signup as approved.
- `generate_season_bracket(season_id uuid)` – randomises approved signups and seeds round one.
- `update_match_schedule(match_id uuid, scheduled_at timestamptz, location text, stream_url text, metadata jsonb)` – admin scheduling helper.
- `record_match_winner(match_id uuid, winner uuid)` – store result + advance bracket manually.

> ℹ️ RLS policies are stubbed out at the end of the schema file—tune them before going to production.

---

## API routes

The UI talks to Supabase PostgREST + RPC endpoints. These are safe to consume from clients or to wrap in a backend service.

### REST resources

| Route | Method | Description |
| --- | --- | --- |
| `/rest/v1/tournament_seasons` | `GET` | List seasons (admins can `POST`/`PATCH`). |
| `/rest/v1/tournament_school_signups?season_id=eq.{uuid}` | `GET` | All signups for a season. Teachers submit signups with `POST`. |
| `/rest/v1/tournament_matches?season_id=eq.{uuid}` | `GET` | Full match schedule per season. |
| `/rest/v1/tournament_public_bracket?season_id=eq.{uuid}` | `GET` | Public-friendly bracket view. |

### RPC helpers

| RPC | Method | Payload |
| --- | --- | --- |
| `/rest/v1/rpc/approve_tournament_signup` | `POST` | `{ "signup_id": "…" }` |
| `/rest/v1/rpc/generate_season_bracket` | `POST` | `{ "season_id": "…" }` |
| `/rest/v1/rpc/update_match_schedule` | `POST` | `{ "match_id": "…", "scheduled_at": "…", "location": "…", "stream_url": "…", "metadata": { … } }` |
| `/rest/v1/rpc/record_match_winner` | `POST` | `{ "match_id": "…", "winner": "…", "status": "completed" }` |

All routes inherit Supabase auth—admins should call from privileged sessions.

---

## Front-end surfaces

Two new React surfaces wire the schema into the game shell:

- `TournamentHub` – player/teacher landing zone with season selector, signup form, and public bracket display.

- `TournamentAdminDashboard` – admin-only control room for season creation, approvals, bracket generation, scheduling, and result capture.

The dashboard wiring lives inside `App.tsx` via new `tournament` and `tournament_admin` views.

---

## Admin workflow

1. Visit **Tournament Ops** from the main dashboard (admin only).

2. Create a season and toggle its status.

3. Approve incoming school codes.

4. Generate the opening bracket once enough signups are approved.

5. Set match times, locations, and optional stream links.

6. Record winners as results come in.

The admin view is intentionally verbose to make later automation easier (auto-advancing rounds, seeding logic, etc.).

---

## Coach / teacher workflow

Teachers (and admins) can:

1. Open the **Tournament** tile from the dashboard.

2. Select the active season and submit their school code.

3. Track approval status and see the published bracket.

Students can still browse the bracket, but they do not see the signup form.

---

## Public bracket page

The `TournamentHub` surface is the public bracket for authenticated users. If you need an unauthenticated page, hit the `tournament_public_bracket` REST endpoint directly or embed it in a marketing site.

Future upgrades might include automatic round progression, per-match chat, and Supabase Row Level Security guards tailored to coaches.

