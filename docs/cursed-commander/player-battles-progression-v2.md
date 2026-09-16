# Cursed Commander — player battles and progression v2

## Scope

This release adds the secure multiplayer foundation for Commander before deeper Level 11–100 progression is allowed to influence competitive combat.

It intentionally keeps the existing three-character formation (Commander + frontline + ranged), current Commander stat ranks, catalog balance, shared Brains Heist Coin wallet, and practice mode unchanged.

## Player-battle model

Commander PvP is asynchronous and server-authoritative:

1. The attacker chooses another enrolled student Commander from the global Commander network.
2. The Edge Function authenticates the attacker and loads both armies through the private/service-role `rpc_commander_owned_loadout` contract.
3. Both loadouts are frozen into `commander_pvp_battles` for that battle.
4. The attacker submits tactical turns. The server resolves the attacker, automatic units, the defender Commander AI, and defender units deterministically.
5. Every accepted turn replaces the authoritative saved battle state using optimistic `state_version` concurrency.
6. The final victory/defeat/draw is persisted and appears in both players' Commander battle history.

The browser never supplies combat stats, school powers, ownership, defender equipment, Commander ranks, or the result.

### Current competitive policy

- All enrolled, non-banned student Commanders can be targeted globally.
- Self-attacks are rejected.
- One active attacking battle is allowed per student at a time.
- A per-attacker/per-defender cooldown is enforced from campaign rules (initially 300 seconds).
- Active battles expire from campaign rules (initially 30 minutes).
- Equipment changes after a battle starts do not mutate that battle's frozen snapshots.
- Commander PvP currently transfers **no Coins and no account XP**. Reward/rating settlement must be designed separately before it is introduced.
- Practice remains non-persistent and is still available as a safe test arena.

## Persistence

### `public.commander_pvp_battles`

Stores attacker/defender IDs, frozen loadout snapshots, authoritative battle state, result status, state version, expiry, and timestamps.

Direct client table access is revoked and RLS is enabled. Client discovery/history goes through `rpc_commander_pvp_lobby`; battle mutation goes through the authenticated `commander_pvp` Edge Function.

### `public.commander_unit_progress`

Creates the long-term unit-development anchor without changing current combat math. Each owned unit receives one row with:

- `unit_rank` (1–10)
- `evolution_tier` (0–3)
- `training_points`
- optimistic `version`

Existing owned units are backfilled, and future unit purchases are seeded by a private trigger.

No current UI can spend Coins on these fields yet. This is deliberate: unit training/evolution should only be activated after player-battle balance is verified.

## Level 11–100 roadmap keys

The active campaign now owns numeric milestones instead of hardcoding future unlock levels in React:

| Level | Planned system |
| ---: | --- |
| 11 | Unit Training |
| 21 | Unit Evolution |
| 31 | School Mastery |
| 41 | Formations |
| 51 | Commander Skill Tree |
| 61 | Squad Synergies |
| 71 | Elite progression |
| 81 | Advanced powers |
| 91 | Legendary progression |

These keys are progression configuration only in this release. They must not be presented to students as functional unlocks until the corresponding server action and UI ship.

## Frontend flow

Headquarters now separates the two battle meanings clearly:

- **Player Battles** — recorded multiplayer result, persistent server state.
- **Practice** — existing safe, non-persistent battle using the equipped formation.

The Player Battle lobby provides search, level-proximate ordering, current formation preview, cooldown state, active-battle resume, and recent history. The battle itself reuses the established cinematic battlefield, authored unit sprites, sound, VFX, school powers, and command controls.

## Deployment order

1. Apply `20260915123000_commander_pvp_progression_foundation.sql`.
2. Deploy the `commander_pvp` Edge Function with JWT verification enabled.
3. Deploy the web client.
4. Smoke test with at least two enrolled student accounts:
   - both appear in the Commander network;
   - A can start a battle against B;
   - B's equipped recruits/stats/schools match the frozen defender snapshot;
   - refresh/back navigation resumes A's active battle;
   - concurrent duplicate turn submission fails closed;
   - final result appears from the correct perspective for A and B;
   - no Commander PvP Coins/account XP are changed;
   - practice still reports non-persistent behavior.
5. Observe battle lengths and win-rate distributions before activating Unit Training.

## Next progression release

The next safe progression increment is Levels 11–20 Unit Training. It should consume the existing `commander_unit_progress` rows, add server-owned train-unit commands/cost rules, feed trained stats into `commander_private.loadout`, expose rank/next-stat visuals in Army cards, and include explicit PvP balance tests before enabling it in production.
