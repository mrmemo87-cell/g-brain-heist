# Brains Heist Raids

This document describes how the cooperative raid/boss encounters work inside Brains Heist. The implementation follows the "Brains Heist Systems Design" specification (Raids/Bosses section) with three escalating waves, spike questions, damage calculations, penalties, and MVP rewards.

## Core Rules

- **Three Waves**: Easy → Medium → Hard. Each wave carries its own score threshold and boss HP budget.
- **Spike Questions**: Every wave injects two spike questions that are always Hard difficulty, even if the wave is easier overall.
- **Damage Formula**: `teamDamage = (individualScore / waveScoreThreshold) * bossHPPerWave`. Damage applies only on correct answers.
- **Penalty**: Wrong answers increase the team timer by **+5 seconds**, tracked inside the `submit_raid_answer` RPC payload and surfaced in the UI as feedback.
- **Rewards**: The total pool (500 XP / 800 coins + badge) is split proportionally to each player’s damage. 30% of the pool is reserved for the MVP bonus.

## Unlocking the Boss Node

Players must earn access before the “Raids” navigation becomes useful:

1. Complete **three consecutive missions** on Medium or Hard difficulty with **≥ 80% accuracy** per mission window (measured as batches of five attempts).
2. Maintain at least one “Crushed” topic in the same branch (≥ 85% accuracy, ≥10 attempts, recency score ≥ 0.4).

`RaidService.getBossUnlockState()` queries the `attempts` + `mcq_questions` tables, builds five-question mission windows, and enforces the requirements above before enabling the “Join Raid” button.

## Front-End Modules

| File | Responsibility |
| --- | --- |
| `src/features/raids/raidTypes.ts` | Shared TypeScript interfaces for waves, participants, answer payloads, rewards, and boss unlock state. |
| `src/features/raids/raidService.ts` | Core logic for starting/joining raids, calculating damage, tracking wave progress, MVP computation, Supabase RPC calls, and boss unlock evaluation. |
| `src/features/raids/RaidView.tsx` | Student-facing UI with light-mode cards for wave progress, spike questions, answer submission, and team roster. |
| `src/features/raids/RaidAdminView.tsx` | Teacher console for scheduling raids, refreshing telemetry, and finalizing runs to distribute rewards. |

These modules are exposed through `services/gameService.ts` helpers so the rest of the app can stay agnostic.

## Supabase Schema & RPCs

`CREATE_RAID_SYSTEM.sql` provisions the following tables:

- `raids`: top-level raid metadata (`boss_id`, status, wave config, reward pool).
- `raid_waves`: per-wave tracking (difficulty, score threshold, HP, spike count, cumulative damage).
- `raid_participants`: student roster with damage dealt, submissions, and MVP flag.
- `raid_events`: chronological log of answers and lifecycle events.

RPCs:

| Function | Description |
| --- | --- |
| `create_raid(boss_id, wave_info)` | Inserts a raid + default waves. |
| `join_raid(raid_id)` | Registers the authenticated user as a participant. |
| `submit_raid_answer(raid_id, question_id, answer, time)` | Logs answer events, applies damage to the active wave, and increments penalties. |
| `finalize_raid(raid_id)` | Marks the raid as completed and emits a `raid_finalized` event. |
| `get_raid_status(raid_id)` | Returns the current raid metadata block for polling dashboards. |

## UI Entry Points

- **Main Dashboard**: A new “Raids” tile lives beside Quest/Battle/Shop. Teachers additionally see “Raid Admin.”
- **Student View**: `RaidView` enforces unlocks, displays waves/participants, and offers simple placeholder spike questions that still feed the real raid logic.
- **Teacher View**: `RaidAdminView` lets educators choose a boss ID, create raids, monitor participation, and finalize runs. Finalization shows MVP + reward breakdown derived from the core service.

## Usage Flow

1. Teacher schedules a raid from the Raid Admin view (or RPC) → Supabase stores `raids` + `raid_waves` entries.
2. Students that satisfy unlock requirements tap “Raids,” join the active raid, and answer spike questions.
3. `submit_raid_answer` RPC + `raidService` compute team damage, enforce penalties, and progress waves.
4. Once three waves are cleared, the teacher finalizes the raid to distribute the reward pool and MVP bonus.

Keep UI changes light (no animations) and reuse the service helpers whenever new experiences need raid data.
