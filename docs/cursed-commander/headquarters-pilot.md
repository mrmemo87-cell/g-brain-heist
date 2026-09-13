# Commander headquarters: connected pilot

## Shipped in this change

The existing `commander` App view now opens a persistent headquarters. It includes a responsive overview, army collection/deployment, armory purchases/equipment, four training paths, one pinned purchase goal, and an economic activity record. Goal copy shows the item price, balance, and missing Coins only.

Students explicitly claim their starter squad once. The pilot grants 150 **Commander Coins**, four starter owned items (two units, weapon, shield), and rank-1 training. Commander Coins and XP belong to the `pilot-v1` expedition; shared `users.coins`, Gemstones, account XP, purchases, inventory, roles, academic records, and existing rewards are not changed. This pilot has no automatic reset or ranked winner.

A purchase adds ownership without auto-equipping. Deploy/equip replaces the matching slot. There is one frontline and one ranged slot, plus one Commander weapon and shield. The two recruitable alternatives are variants of the existing Neon and Shade artwork, clearly described as such, with explicit statistical tradeoffs. This phase does not claim new AI abilities for the variants.

Training uses versioned campaign configuration: `round(25 × 1.15^(rank − 1))`, limited to `min(10, 5 + floor(level / 2))` for this pilot. The four pilot effects are deliberately supported by the current combat engine: Force adds spell damage, Defense adds starting shield/Guard/shield capacity, Dexterity adds unit attack, and Stamina adds Commander HP. Full accuracy/initiative/dodge and ranked balance rules remain later work.

## Live integration audit

Read-only inspection identified the existing `g-brain-heist` project (`sozodkxwhubespiedgxm`). `public.users` has student role, ban state, shared currencies, and profile fields. `reward_event_receipts` stores identity/event keys and timestamps, but no award amounts. It has unique owner/event and idempotency keys and an owner/date index. Existing shop code makes multiple separate writes, so the new Commander economy does not call that client purchase path.

The additive migration uses separate Commander tables and private helpers. Clients have no direct table grants. Public HQ/command RPCs verify `auth.uid()`, student role, and bans; the army-snapshot RPC is executable by `service_role` only and verifies the requested student's eligibility. RLS is enabled on every new public table. No production schema or Edge deployment is performed by preparing this PR.

## Reward connection

The pilot synchronizes only confirmed `task_reward_claim` receipts matching `task:task_d1:YYYY-MM-DD`, created after enrollment. That is the existing daily quest-task claim. The campaign config awards 150 Commander XP and 200 Commander Coins per eligible receipt. Existing account rewards continue independently, exactly as before. There is no arbitrary client award amount and no conversion from shared Coins.

The HQ RPC pulls these events when opened/refreshed. Because the shared receipt table permits owner inserts, an invoker trigger marks only new receipts inserted under the postgres/service_role database identity; client-supplied markers are stripped and existing receipts remain unverified. The existing task reward RPC is owned by postgres, validates task completion, and forces canonical identity-bound event keys. Only marked receipts qualify. This trigger records provenance; it does not issue rewards or change existing reward calculations. A locked profile plus unique source receipt prevents duplicate grants; the source event time defines UTC daily and Monday-based weekly cap buckets. Caps are campaign configuration (3,000/15,000 XP; 4,500/22,500 Coins) and do not receive premium boosts. Historical receipts, PvP task receipts, and other event kinds are excluded. At most 100 unseen eligible receipts are processed per refresh. Other learning reward sources need explicit audited mappings in a subsequent phase; this is not a claim of a platform-wide reward migration.

## Transaction and battle contracts

- Enrollment is serialized per student/campaign and grants the starter wallet once.
- Buy/equip/train/goal commands use one transaction, an expected profile version, and a request UUID bound to the operation/target. A retry returns the existing result without another debit. Concurrent stale changes fail explicitly. Amounts and prices are always resolved by the server.
- Unknown network outcomes offer **Retry same action**, preserving the request UUID and version. Definitive errors clear the pending operation. Refresh shows confirmed database state.
- `commander_practice` accepts `loadout: "owned"` only as a mode selector. It gets the army through the service-only RPC using the authenticated student's ID, validates the schema/bounds, and signs the resulting battle snapshot. Browser-supplied stats are ignored.
- Existing fixed practice retains its original defaults and needs no HQ tables. Owned-loadout failure never silently substitutes the fixed squad.
- A battle's loadout and training are frozen in the signed transcript; later equipment changes affect the next battle. Owned and fixed practice have separate local checkpoint keys. Both preserve existing recovery and expiration behavior.
- Headquarters/ownership persist across devices. Practice checkpoints remain browser-local within the existing 15-minute session, and the UI names the saved battle's army version. Cross-device battle persistence belongs to the later persistent/ranked battle layer.
- Refresh after confirmed damage cannot rebuild the army at full health. No battle rewards, losses, AP deductions, or injuries are introduced.

## Verification

- 21 focused tests passed: headquarters math, snapshot validation, actual Edge-handler owned-loadout authentication/lookup/freeze behavior, fixed-mode compatibility, session isolation/recovery, intro, and cinematic playback.
- Isolated PostgreSQL (PGlite 0.5.8) applies the actual migration and exercises enrollment, purchases, idempotency/request conflicts, insufficient funds, stale versions, equipment, training, reward synchronization, rejection of forged receipt markers, authenticated calls through a server-owned reward function, account isolation, bans, anonymous access, and denied direct table/private-function access.
- Browser flow uses the real headquarters and practice components, service calls, actual migration/RPCs running in isolated PostgreSQL, and the real combat engine. Supabase HTTP transport/auth are test fixtures; this is not a production-account E2E claim.
- Browser verified enrollment → purchase → equip → pinned goal → training with deliberately lost response → same-request retry → refresh → owned practice → mid-turn refresh recovery. Training debited once and the battle used the equipped weapon and trained stats.
- All five HQ sections fit at 320, 375, 390, 430, 768, 1024, and 1440px without horizontal overflow. Desktop, mobile overview, and armory screenshots were inspected. No page errors.
- Typecheck, production build, migration security guard, and whitespace check passed. The full unrelated repository suite was not rerun; earlier Commander source-text/tester-whitelist tests are known to target older behavior.

To reproduce the isolated database check without adding a production dependency:

```sh
npm install --prefix /tmp/commander-db-test --no-package-lock @electric-sql/pglite@0.5.8
COMMANDER_PGLITE_MODULE=/tmp/commander-db-test/node_modules/@electric-sql/pglite node scripts/test-commander-headquarters-db.cjs
```

## Rollout sequence

1. Review and apply only `20260913073842_commander_headquarters_pilot.sql` to the verified existing project after checking migration history. Do not bulk-apply unrelated pending migrations.
2. Deploy the updated `commander_practice` Edge Function (`index.ts` + `engine.ts`) while preserving its existing signing secret and authentication setup.
3. Release the frontend commit. If HQ RPCs are unavailable, the page shows Retry and access to fixed practice; it does not fabricate an army/balance.
4. Smoke-test two student accounts, a non-student, a banned account, purchase/retry, training, equip, reload, and owned practice against the deployed APIs. Verify shared wallet/Gemstones did not change.
5. If rollback is needed, restore the prior frontend entry and Edge deployment. Preserve new tables/receipts; do not delete ownership or balances to roll back presentation.

## Remaining phases

Ranked matchmaking/defense snapshots, persistent cross-device battles, AP costs, loot/loss protection, injuries/recovery, third-unit slot, additional abilities, permanent premium entitlements, season scheduling/finale/reset, and the administration console are not enabled in this pilot. The new HQ copy is English; existing practice localization remains. The full proposed economy values and combat formulas are not silently applied to the rest of Brains Heist.
