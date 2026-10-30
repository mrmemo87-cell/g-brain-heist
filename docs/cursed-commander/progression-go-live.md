# Cursed Commander — progression go-live

## Why

Before this change, production Commander progression was stalled:

- The only source of Commander XP was verified `task_d1` daily-task claims. Production has recorded none, so every player stayed at Level 1.
- Production applied `20260916123703_commander_economy_level_gates_v2` before the Unit Training, Unit Evolution, School Mastery and Formations migrations, so those features never reached the database. The HQ already shows them.
- `20260915233000_commander_formations_41_100` declared a PL/pgSQL variable named `formation_id`. That name clashed with the column, so `commander_private.loadout()` raised `42702` and enrolment failed. The variable is now `v_formation_id`; the file had never been applied anywhere.

## Commander XP sources

All three sources are server-only, idempotent and inside the campaign `dailyXpCap` / `weeklyXpCap`. Amounts live in `commander_campaigns.rules`.

| Source | Amount (rule key) | Limit | Entry point |
| --- | --- | --- | --- |
| Daily login | 100 XP + 25 per streak day, max at day 7 = 250 (`dailyLoginXp`, `dailyLoginStreakBonusXp`, `dailyLoginStreakMaxDays`) | Once per UTC day; a missed day resets the streak | `rpc_commander_daily_checkin()` (student), called on HQ open |
| PvP victory | 60 XP (`pvpVictoryXp`) | One rewarded win per opponent per UTC day, 5 per day (`pvpVictoryDailyLimit`) | `commander_pvp` Edge Function, via `rpc_commander_award_battle_xp` (service role); checked against the stored `victory` row |
| Practice victory | 40 XP (`practiceVictoryXp`) | First win per UTC day only, because Practice transcripts can be replayed | `commander_practice` Edge Function, via `rpc_commander_award_battle_xp` (service role) |

An active player earns roughly 250–590 XP a day. That means:

- Level 11 (Unit Training) in about 4–8 days.
- Level 41 (Formations) in about 1–3 months.
- Level 100 in about 6–12 months.

Cancelling or abandoning a PvP battle never pays.

## Deploy order (production)

1. `20260915140000_commander_unit_training_v1.sql`
2. `20260915193000_commander_unit_evolution_v1.sql`
3. `20260915213000_commander_school_mastery_v1.sql`
4. `20260915233000_commander_formations_41_100.sql`
5. `20260915233500_commander_formations_replace_future_track.sql`
6. `20261030090000_commander_progression_go_live.sql`
7. Redeploy the `commander_pvp` and `commander_practice` Edge Functions.

`tests/commanderProgressionGoLiveDatabase.test.mjs` replays production's migration order, then this deploy. It plays the game as students. The production order and a fresh filename-order replay end with identical function definitions, rules, triggers, tables and grants.
