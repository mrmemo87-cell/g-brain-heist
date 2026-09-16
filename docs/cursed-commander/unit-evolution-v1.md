# Commander Unit Evolution v1 — Levels 21–30

## Purpose

Unit Evolution is the second long-term Commander progression band after Unit Training. It deliberately extends the same owned-unit records and shared Brains Heist Coin wallet rather than introducing another currency or a separate grind loop.

## Player rules

- Unit Training remains Levels 11–20.
- A unit must reach **Unit Rank 10** before it can evolve.
- Evolution Tier I unlocks at Commander Level **21**.
- Evolution Tier II unlocks at Commander Level **25**.
- Evolution Tier III unlocks at Commander Level **30**.
- Evolution spends the existing Brains Heist Coin balance.
- Practice and Player Battles do not award special Evolution currency.
- Each owned unit evolves independently.

## Economy

Default costs are campaign-rule driven:

- Tier 0 → I: 250 Coins
- Tier I → II: 400 Coins
- Tier II → III: 640 Coins

The server calculates all costs. The browser only previews them.

## Combat identity

Evolution is designed as a role-preserving permanent doctrine rather than a replacement unit.

### Frontline — Bulwark Matrix

Each Evolution tier adds:

- +8 HP
- +2 Shield
- +1 Attack

At Tier III the permanent Evolution contribution is +24 HP, +6 Shield, +3 Attack.

### Ranged — Predator Matrix

Each Evolution tier adds:

- +4 HP
- +2 Attack

At Tier III the permanent Evolution contribution is +12 HP, +6 Attack.

These bonuses are baked into `commander_private.loadout()`. Practice and PvP therefore receive the same trusted numbers, and browser-supplied stats remain non-authoritative.

## Server contract

The existing `unit_train` Commander command remains the single unit-development mutation contract in v1:

1. If the owned unit is below Rank 10, the command performs normal Unit Training.
2. Once Rank 10 is reached, the same command performs the next eligible Evolution tier.
3. Commander level gates, Coin balance, ownership, expected profile version, request idempotency, and wallet mutation are all validated under the existing per-user transaction lock.

This preserves compatibility with the current Headquarters confirmation/retry pipeline while keeping the server authoritative.

## Visual treatment

The Army → Unit Development cards now show:

- Unit Rank and training contribution.
- Evolution Tier 0–3 milestone indicators.
- Evolution doctrine name and description.
- Current permanent Evolution bonuses.
- Next-tier stat preview and Coin cost.
- Locked-state copy for Rank 10 and Commander Level requirements.
- An evolved badge plus subtle animated aura, with reduced-motion support.

Existing unit sprites are intentionally reused. Dedicated evolved character pose packs are deferred until a later art pass, which avoids multiplying standing/attack/hit/defeat asset requirements for every recruit.

## Balance boundary

Evolution does **not** add PvP rewards, Commander XP, a new currency, extra combat slots, or a new battle-state version. This release changes persistent owned-unit development only. The next progression system after Level 30 remains School Mastery.