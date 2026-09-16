# Commander Formation Command — Levels 41–100

Formation Command is the long-range tactical progression track that begins after School Mastery. It extends Commander progression from Level 41 through Level 100 without adding a fourth combat slot, a new currency, or a PvP farming loop.

## Product contract

The active battle roster remains exactly three combatants:

- Commander
- one frontline unit
- one ranged unit

A formation changes how those three trusted combatants are composed. It does not add an extra unit, duplicate ownership, or allow the client to provide combat modifiers.

Only one formation can be active at a time. Players may develop multiple formations and switch between trained formations for future battles.

## Progression milestones

Formation Command uses seven doctrine ranks across the entire Level 41–100 band:

| Doctrine rank | Commander level | Purpose |
| --- | ---: | --- |
| Rank I | 41 | Formation Command begins |
| Rank II | 50 | First major doctrine refinement |
| Rank III | 60 | Mid-career tactical specialization |
| Rank IV | 70 | Veteran doctrine |
| Rank V | 80 | Elite doctrine |
| Rank VI | 90 | Endgame doctrine |
| Rank VII | 100 | Legendary Formation capstone |

Formation availability is deliberately staggered:

| Formation | Unlock | Identity |
| --- | ---: | --- |
| Command Line | 41 | Balanced |
| Bastion Wedge | 45 | Defense |
| Spearhead | 50 | Assault |
| Arc Lattice | 55 | Commander power / control |

A newly available formation begins at Doctrine Rank 0. The player pays the shared Brains Heist Coin wallet to establish Rank I, after which that formation may be activated. Rank advancement is then limited by the global Commander-level doctrine cap.

Default training cost is `round(600 * 1.35^current_rank)`. These economy values live in the active Commander campaign rules and can be tuned without changing the client.

## Tactical identities

### Command Line

Balanced all-round doctrine. It adds small amounts of Commander durability/control and measured squad endurance/pressure. It has no extreme advantage and therefore no extreme penalty.

### Bastion Wedge

Defensive doctrine. It raises starting shield, Guard strength, shield capacity, Commander HP, frontline HP/shield, and some ranged survivability. Its trade-off is lower Death Bolt pressure and gradually reduced ranged attack.

### Spearhead

Assault doctrine. It increases Death Bolt, Focus, and both unit attack profiles. Its trade-off is lower Commander HP, starting shield, Guard strength, and shield capacity.

### Arc Lattice

Power/control doctrine. It strongly improves Focus and also improves Bolt and Guard. Its trade-off is reduced unit HP and a small reduction to Commander starting shield.

All final values are clamped server-side to safe battle-engine bounds. A trade-off can never produce zero/negative HP, attack, Bolt, Focus, or Guard.

## Security and authority

Formation data is private server state:

- `commander_formation_progress` stores per-formation doctrine rank.
- `commander_formation_state` stores the one active formation.
- Both tables use RLS and revoke direct `public`, `anon`, and `authenticated` table access.
- The browser submits only an authenticated intent: `train` or `set`, plus a known formation ID.
- The server derives unlock level, doctrine cap, Coin cost, current rank, and every combat modifier.
- The shared `public.users.coins` wallet is locked and debited atomically for doctrine training.
- Every command uses the existing Commander per-user advisory lock, optimistic profile version, and request-ID idempotency pattern.
- Activation is free but still versioned/idempotent because it changes the trusted loadout.

The dedicated RPC is `rpc_commander_formation_command`. Keeping Formation Command separate avoids rewriting the established Commander purchase/training command and reduces regression risk.

## Practice and Player Battles

Formation effects are applied inside `commander_private.loadout()`, the same trusted loadout contract already used by owned Practice and Commander PvP.

That means:

- Practice receives the server-composed formation stats.
- A new Player Battle receives the attacker and defender formation-composed stats.
- PvP snapshots freeze those stats at battle start.
- Changing formation while a Player Battle is already active cannot mutate that active battle.
- Existing battle-engine turn logic does not need to trust or parse browser-supplied formation modifiers.
- PvP remains reward-neutral: this feature adds no Commander XP transfer, account XP transfer, or Coin reward loop.

## Visual system

Army → Formation Command includes:

- a Level 41–100 seven-milestone doctrine road,
- four doctrine cards,
- tactical mini-diagrams using the existing Commander/frontline/ranged sprites,
- current doctrine rank and active state,
- exact current bonuses/penalties,
- exact next-rank delta,
- Coin affordability and Commander-level gates,
- explicit doctrine and trade-off copy,
- a Legendary Rank VII capstone at Level 100.

No new character art is required for v1. This keeps the visual investment focused on tactical clarity and avoids creating animation packs that do not affect battle mechanics.

## Deployment

Deploy the migration before exposing the updated client. The migration is additive, seeds active-formation state for existing Commander profiles, installs a trigger for future profiles, and preserves the established `version: 1` trusted loadout envelope.

Because Formation Command replaces the private loadout composer, production verification should cover:

1. an existing pre-Level-41 Commander loading Headquarters normally;
2. Level 41 establishing Command Line Rank I and spending the exact Coin amount once;
3. retrying the same request ID without a second charge;
4. activating a trained alternate formation;
5. owned Practice receiving the changed trusted stats;
6. a new PvP battle freezing both players' formation-composed loadouts;
7. changing formation after PvP start without mutating the active battle snapshot;
8. Level gates, rank caps, insufficient-Coin failure, and stale-profile failure.

## Non-goals

This release intentionally does not add:

- a fourth/fifth combat slot,
- live synchronous PvP,
- Formation XP,
- Formation Tokens,
- PvP Coin or account-XP rewards,
- client-authored combat multipliers,
- cumulative always-on bonuses from every trained formation.

Those exclusions keep the Level 41–100 system strategic, bounded, and compatible with the current Commander battle architecture.
