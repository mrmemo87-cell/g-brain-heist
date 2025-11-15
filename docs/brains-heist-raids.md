# Brains Heist Raids

This document describes how the cooperative raid/boss encounters work inside Brains Heist. The implementation follows the "Brains Heist Systems Design" specification (Raids/Bosses section) with three escalating waves, spike questions, damage calculations, penalties, and MVP rewards.

## Core Rules

- **Three Waves + Sudden-Death Finale**: Easy → Medium → Hard, followed by a 60-second "panic phase" where both teams answer lightning trivia. Each wave carries its own score threshold and boss HP budget.
- **Spike & Joke Questions**: Every wave injects two spike questions (always Hard difficulty) and one “Comedy Curveball” from the prank question bank. Curveballs are intentionally goofy but still tied to the curriculum, rewarding players who can laugh and think at once.
- **Damage Formula**: `teamDamage = (individualScore / waveScoreThreshold) * bossHPPerWave`. Damage applies only on correct answers.
- **Penalty**: Wrong answers increase the team timer by **+5 seconds**, tracked inside the `submit_raid_answer` RPC payload and surfaced in the UI as feedback. Curveball failures also trigger an on-screen "banana peel" icon that taunts the team for the remainder of the wave.
- **Rewards**: The total pool (500 XP / 800 coins + badge) is split proportionally to each player’s damage. 30% of the pool is reserved for the MVP bonus. The losing team forfeits half of the coins they personally brought into the match, amplifying the risk/reward drama.

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

## Multiplayer Raid Formats

| Mode | Team Size | Description |
| --- | --- | --- |
| **Strike Squad** | 3v3 | Fast, 10-minute runs that cycle through all three waves once. Perfect for quick class break battles. |
| **Mega Crew** | 5v5 | Standard format with full wave pacing, comedy curveballs, and the sudden-death finale. |
| **Clan War** | 8–12 per side | Scheduled events where whole clubs battle. Clan captains can substitute players between waves to keep energy high. |

- **Spectators**: Any authenticated student can join a raid lobby in spectator mode. They see a read-only dashboard with live answer streaks, timer penalties, and GIF reactions triggered by curveballs. Spectators can toss "Cheer" emotes that briefly glow around their favorite team but offer no gameplay advantage.
- **Team Switching**: Before wave one starts, players can drag-and-drop between Team A, Team B, or Spectator columns. Once the first answer is submitted, rosters lock until the raid ends.
- **Phase Timer**: Each wave lasts 4 minutes, and the sudden-death finale is hard-capped at 60 seconds. If time expires, whichever team holds the higher combined damage wins.

## Question Flow & Phases

1. **Warm-Up Briefing (30 seconds)**: Teams review boss modifiers and vote on a battle anthem that changes the lobby background gradient.
2. **Wave Rotation**: Questions are pulled from the question bank in bundles of five, mixing base questions, spike items, and comedy curveballs. Difficulty metadata ensures the wave stays aligned with Easy/Medium/Hard targets.
3. **Panic Phase**: The final minute fires five lightning questions at both teams simultaneously. Answers auto-submit on timeout, so hesitation hurts.
4. **Loot Rain**: Winning students watch a confetti burst while coin piles animate into their inventory. Losing teams see their avatars slip on the banana peel, lose coins, and receive a prompt to review missed topics.

## Visuals & Styling

- `RaidView` now renders a **split arena** layout: left/right columns for Team A and Team B with neon outlines, a central boss totem that cracks as damage accumulates, and a ticker for spectator emotes.
- Comedy curveballs spawn illustrated stickers (banana peel, malfunctioning robot, dramatic llama) so the experience stays playful even during high stakes.
- Spectators appear as floating profile bubbles along the top rail; clicking a bubble reveals the cheer/emote history they contributed.
- When a player is eliminated during the panic phase (two consecutive wrong answers), their card desaturates and shows a “Needs Snacks” tooltip to keep the tone lighthearted.

## Usage Flow

1. Teacher schedules a raid from the Raid Admin view (or RPC) → Supabase stores `raids` + `raid_waves` entries.
2. Students that satisfy unlock requirements tap “Raids,” choose Strike Squad/Mega Crew/Clan War, and join the active lobby as a competitor or spectator.
3. `submit_raid_answer` RPC + `raidService` compute team damage, enforce penalties, progress waves, and broadcast lobby state to all connected clients.
4. The panic phase resolves ties, the winning team collects the enhanced reward pool, and the losing side pays its coin penalty while receiving a curated review playlist.

Keep UI changes vibrant but performant—prefer CSS gradients, SVG stickers, and lightweight confetti canvases over heavy video loops.
