# Commander School Mastery v1 — Levels 31–40

## Purpose

School Mastery is the third long-term Commander progression band after Unit Training and Unit Evolution. It deepens the four existing faction powers rather than adding another army slot, currency, or independent grind loop.

## Player rules

- School Mastery unlocks at Commander Level **31**.
- A school needs at least one owned unit at **Unit Rank 10 + Evolution Tier III** to qualify.
- Mastery Rank I unlocks at Commander Level **31**.
- Mastery Rank II unlocks at Commander Level **35**.
- Mastery Rank III unlocks at Commander Level **40**.
- Mastery is permanent and shared by every unit of that school.
- A mastered school only affects combat when its matching power is available in the current loadout.
- Void, Storm, Rot, and Grave are the v1 mastery schools; neutral has no Mastery path.

The existing `unit_train` mutation contract remains the single server-authoritative unit-development command. Once a target unit is Rank 10 and Evolution Tier III, the server advances that unit's school instead of adding another unit rank or Evolution tier.

## Economy

School Mastery uses the shared Brain Heist Coin wallet.

Default campaign rules:

- Rank 0 → I: **450 Coins**
- Rank I → II: **698 Coins**
- Rank II → III: **1,081 Coins**

The server calculates the real price. Frontend helpers only preview the same configured curve.

## Power doctrines

### Void — Null Vector

Power: **Death Bolt**

- +3 Death Bolt damage per Mastery rank.
- Rank III contribution: +9 damage.

### Storm — Overcharge Lattice

Power: **Chain Surge**

- +2 direct primary damage per Mastery rank.
- +1 direct arc bonus per Mastery rank; the arc also naturally inherits the stronger primary discharge used by the existing Chain Surge formula.

### Rot — Blight Protocol

Power: **Rot Miasma**

- +1 damage to every Miasma target per Mastery rank.
- Rank III therefore adds +3 to each living enemy hit by the field pulse.

### Grave — Revenant Covenant

Power: **Raise Dead**

- +3 percentage points of max HP to revive strength per Mastery rank.
- +2 HP to emergency mend capacity per Mastery rank.
- Base revive remains 35%; Rank III revives at 44%.

## Security and battle authority

`public.commander_school_mastery` is private progression state:

- RLS enabled.
- direct `public`, `anon`, and `authenticated` table access revoked.
- mutations happen only inside the existing authenticated Commander command RPC.
- shared-wallet spending is protected by the same per-user advisory lock, expected profile version, request idempotency, and transaction record as Unit Training/Evolution.

`commander_private.loadout()` exposes only bounded mastery ranks in a trusted `schoolMastery` object. `buildOwnedPracticeBattle()` validates each rank as an integer from 0–3 before accepting the server loadout. Practice and PvP engines then apply fixed v1 effects. The browser never supplies authoritative mastery stats or power bonuses.

PvP copies both frozen players' Mastery state into the battle snapshot, so attacker and defender use the progression they actually owned when the battle started.

## Visual treatment

Army → Unit Development now covers Levels 11–40 and includes a separate School Mastery command deck with:

- one card per Void / Storm / Rot / Grave school;
- existing faction sigils and school-specific accent/glow treatment;
- Rank 0–3 milestone bars;
- active-vs-stored power state;
- exact power effect text;
- the Tier III evolved unit currently qualifying the school;
- Commander-level gates and Coin requirements;
- responsive and reduced-motion-friendly styling.

Dedicated new character art is intentionally not required for this release. School identity is expressed through existing faction art, sigils, glow language, and power progression.

## Balance boundary

School Mastery does not add Commander XP rewards, PvP Coin rewards, another currency, extra combatants, or a new battle-state version. The next long-term progression band after Level 40 is **Formation Doctrine (Levels 41–50)**.
