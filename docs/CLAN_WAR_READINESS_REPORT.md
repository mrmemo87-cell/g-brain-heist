# Rivalry Protocol (Clan Wars V1) — Full Game Design + Technical Spec

> Status: Implementation-ready design document for Brain Heist.  
> Principle: Minimal breakage, maximum reuse of stable systems, strict separation from existing solo PvP.

---

## 1) FEATURE IDENTITY

### Final feature name
**Rivalry Protocol** (Clan Wars V1).

### Player-facing description
"Rivalry Protocol is a scheduled clan-vs-clan operation where two clans lock rosters, pick doctrines, attack strategic systems, and race for War Points in a timed operation."

### Design pillars
1. **Parallel, safe subsystem**: no regression risk to solo PvP.
2. **Strategic teamwork**: roles, doctrines, structures > raw click volume.
3. **Social drama**: declaration, acceptance, prep, hidden-score finale.
4. **Fairness-first**: anti-abuse rails, roster lock, pair cooldowns.
5. **Implementable V1**: constrained scope with clear lifecycle and RPC boundaries.

### Fantasy/theme fit (Brain Heist)
- Keeps hacker-ops fantasy: clans execute coordinated digital operations.
- Structures map to cyber infrastructure (Relay, Vault, Firewall).
- Actions (Strike/Sabotage/Repair) feel like tactical net-war operations.

### Retention/social impact
- Adds recurring social objective loop (declare → prep → execute → settle).
- Reinforces clan identity and leadership roles.
- Creates meaningful asynchronous and realtime interaction without replacing core solo PvP.

---

## 2) PLAYER EXPERIENCE LOOP

1. **Clan enters War Board** and sees eligible targets + own readiness.
2. **Leader/Officer/Moderator declares war** against another clan (cross-school allowed).
3. Defender receives **challenge notification** with expiry timer.
4. Defender **Accepts or Declines**.
   - Decline applies challenger-target pair cooldown.
   - Accept creates war in `prep`.
5. **Prep Phase** starts:
   - Both clans set doctrine.
   - Both clans submit roster up to lock size.
   - Leadership locks roster (or auto-lock at prep end).
6. At prep end, war transitions to **live phase**.
7. During live phase, rostered members spend **War Energy** on:
   - `strike`
   - `sabotage`
   - `repair`
8. Actions update structures, contribution stats, and visible/hidden score channels.
9. Last segment enters **Final Blackout** (hidden-score phase):
   - Live detailed score hidden from both sides.
   - Milestones still shown.
10. War ends → **settlement function** computes winner, tie-breakers, rewards.
11. Participants claim or auto-receive rewards.
12. War appears in **war history/prestige** and milestone summaries are mirrored to global `activities`.

---

## 3) V1 RULESET (LOCKED RECOMMENDATION)

- **Minimum clan size to declare:** 5 members.
- **Roster eligibility:** at least 5 eligible members; roster lock size = 7 (max), min locked = 5.
- **Concurrent wars:** 1 active war max per clan.
- **Challenge expiration:** 12 hours.
- **Prep phase duration:** 6 hours.
- **Live war duration:** 24 hours.
- **Final hidden-score duration:** last 2 hours of live war.
- **Roster size:** up to 7 locked agents.
- **Role selection behavior:** each rostered player chooses a role preference (`striker|saboteur|engineer`) during prep; editable until lock.
- **Doctrine selection:** one doctrine per clan chosen in prep; locked at live start.
- **Visibility model:**
  - Public: war started/ended, winner, major milestones.
  - Participant clans: detailed war board + action logs.
  - Outsiders: no detailed action stream.
- **Same pair cooldown:** 72 hours between same clan pair (A↔B) regardless of attacker.
- **War frequency limits:**
  - Clan declare cap: max 2 declarations per rolling 24h.
  - Clan active cap: 1 active war.
  - Member participation cap: one war roster at a time.

---

## 4) WAR RESOURCES

### War Energy (Operation Energy)
- Resource name: **Operation Energy (OE)**.
- Scope: per-user per-war (not global AP).
- **OE max:** 10.
- **OE start at live-phase begin:** 6.
- **Regen:** +1 every 45 minutes, passive, capped at max.
- **No AP coupling** in V1.

### Structure interactions with OE
- If `relay_core` destroyed: defender OE regen interval worsens from 45m to 60m until repaired above 30% integrity.

### Buff/item interaction policy (V1)
- Existing clan buffs do **not** modify OE directly in V1.
- Existing solo inventory items (shield/cracker/booster) do **not** consume from global inventory in war.
- War uses separate action modifiers only.

### Anti-abuse caps
- Per-player daily OE spend cap in wars: 40 OE/day (across wars).
- Per-war per-player max counted actions: 80 (actions above still allowed but score contribution reduced by 80%).

### Why safe vs current AP economy
- Fully decoupled resource ledger avoids disrupting AP pacing, AP notifications, and solo PvP AP tuning.

---

## 5) WAR BOARD / STRUCTURES

Exactly 3 structures per clan side:

1. **relay_core**
   - Max integrity: 1000.
   - Function: controls OE regen efficiency.
   - At 0 integrity: OE regen penalty active (60m tick).

2. **cipher_vault**
   - Max integrity: 1200.
   - Function: primary scoring objective; damage awards highest War Points.
   - At 0 integrity: grants major milestone bonus once.

3. **sentinel_grid**
   - Max integrity: 900.
   - Function: defensive mitigation against incoming strike/sabotage.
   - At 0 integrity: incoming damage multiplier +10% until restored above 25%.

### Damage/repair model
- Damage decreases `current_integrity` and cannot go below 0.
- Repair increases `current_integrity` and cannot exceed max.

### Gating
- No hard gate chain in V1 (all structures targetable at start) to reduce complexity.

### Disable/destruction states
- `healthy`: >60%
- `strained`: 31–60%
- `critical`: 1–30%
- `down`: 0%

### Logging visibility
- Public milestone: first `down` of any structure, war winner, MVP.
- Private war logs: all action events and per-hit deltas.

---

## 6) WAR ACTIONS

### A) Strike
- **Who:** rostered members only.
- **Targets:** enemy `relay_core`, `cipher_vault`, `sentinel_grid`.
- **OE cost:** 2.
- **Personal cooldown:** 60s.
- **Formula inputs:** attacker war_power, role modifier, doctrine modifier, target mitigation.
- **DB changes:** insert action log, reduce target integrity, add contribution, add visible/hidden score.
- **Score impact:** medium-high.
- **Failure outcome:** glancing hit (25% base damage) still applies; no zero-impact spam.
- **Anti-spam:** cooldown + OE + diminishing returns on repeated same-target spam.

### B) Sabotage
- **Who:** rostered members only.
- **Targets:** enemy structure subsystem status (`jammed`, `breached`, `overheated`) abstracted as timed debuff rows.
- **OE cost:** 3.
- **Personal cooldown:** 180s.
- **Formula inputs:** attacker sabotage_rating, defender sentinel state, doctrine matchup.
- **DB changes:** insert action log, add/update debuff effect with expiry.
- **Score impact:** medium (plus strategic tempo gain).
- **Failure outcome:** partial effect 30% duration.
- **Anti-spam:** unique debuff stack cap (max 2 active debuffs of same type per target structure per clan).

### C) Repair
- **Who:** rostered members only.
- **Targets:** own structures.
- **OE cost:** 2.
- **Personal cooldown:** 90s.
- **Formula inputs:** engineer preference bonus, doctrine, current integrity band.
- **DB changes:** insert action log, increase integrity, contribution update.
- **Score impact:** low-direct + defensive sustain bonus (supports teamwork).
- **Failure outcome:** minimum fixed repair (no total fail).
- **Anti-spam:** soft diminishing repair efficiency if same user repairs same structure repeatedly >5 times in 15 min.

### Shield/cracker policy in V1 war
- Do **not** consume existing inventory shield/cracker.
- Introduce internal war modifiers:
  - `sabotage` can apply temporary "shielded window" denial effect.
  - Keep solo PvP item economy untouched.

---

## 7) COMBAT / RESOLUTION MODEL

Use separate formula layer (`rpc_war_submit_action`) with deterministic + bounded randomness.

### Derived attacker power
`war_attack = users.attack_power * role_attack_mod * doctrine_attack_mod * fatigue_mod`

### Derived defender mitigation
`war_defense = users.defense_power * doctrine_defense_mod * structure_state_mod * active_debuff_mod`

### Strike base damage
`base = 40 + 0.45 * war_attack - 0.30 * war_defense`

### Randomness
`rng = random(0.92, 1.08)`

### Final strike damage
`final_damage = clamp(round(base * rng), min=12, max=95)`

### Repair value
`repair_base = 34 + 0.35 * war_defense`
`final_repair = clamp(round(repair_base * random(0.9,1.1)), min=10, max=80)`

### Sabotage success score
`success_score = sabotage_power - defense_resist + random(-12,+12)`
- If `success_score >= 0`: full debuff duration.
- Else: partial 30% duration.

### Readability
- UI shows: `Strong Hit / Solid Hit / Glancing Hit` buckets by damage ranges.
- Avoid raw formula exposure in client.

### Anti-meta abuse
- Repeat-target diminishing bonus: after 6 consecutive same-target strikes by same user in 10 min, damage *0.85.

---

## 8) SCORING MODEL

### War Points (WP)
- Strike to `cipher_vault`: `+1.2 * damage`
- Strike to `relay_core`: `+1.0 * damage`
- Strike to `sentinel_grid`: `+0.9 * damage`
- Successful sabotage application: +60 WP (partial: +20)
- Repair: `+0.5 * repaired_amount` (defensive value)
- First structure down milestone: +250 WP
- All three enemy structures down at least once: +500 WP bonus

### End-state bonus
- Winner: +700 WP settlement bonus.
- Loser: +250 WP settlement bonus (participation baseline).

### Tie-breakers (ordered)
1. Higher `cipher_vault` damage dealt.
2. Fewer structure-down events suffered.
3. Higher unique participant count (active action contributors).
4. Earlier first milestone timestamp.

### Hidden-score finale
- Last 2 hours: clan sees only **score band** (`Narrow / Even / Pressing`) not exact WP.
- Server keeps exact WP and settles final.

---

## 9) DOCTRINES + ROLES

### Doctrines (choose 1 in prep)
1. **Breach Doctrine**
   - +8% strike damage
   - -6% repair output
2. **Fortress Doctrine**
   - +12% repair output
   - +6% structure mitigation
   - -5% sabotage success
3. **Disruption Doctrine**
   - +15% sabotage duration
   - +5% sabotage success score
   - -4% raw strike damage

Doctrine locked at live start; no mid-war changes in V1.

### Role preferences
- `striker`: +7% strike, -4% repair
- `saboteur`: +8 sabotage power, -3% strike
- `engineer`: +10% repair, -3 sabotage power

Role impacts formulas + contribution labels + UI tags.

---

## 10) REWARDS + PROGRESSION

### Reward channels
- Player: XP, coins, war_credits (new currency), cosmetic token chance.
- Clan: rivalry_rating delta + season war points.

### Settlement defaults
- Winner rostered participant:
  - 220 XP, 350 coins, 90 war_credits
- Loser rostered participant:
  - 140 XP, 220 coins, 55 war_credits
- Participation threshold to qualify: at least 6 valid actions OR 180 contribution points.

### MVP categories (3)
- **Breaker MVP** (highest structure damage)
- **Operator MVP** (highest sabotage value)
- **Guardian MVP** (highest effective repair)

### Inflation controls
- Weekly war reward soft cap per user: full rewards first 5 wars, then 60% XP/coins thereafter.
- No direct vault_coins transfer.
- War credits redeem in separate future shop (not required for V1 launch).

### Separate ranking
- Add clan `rivalry_rating` (ELO-lite) + optional seasonal leaderboard.

---

## 11) ANTI-ABUSE / FAIRNESS MODEL

### Hard protections
1. **Roster lock**: no swaps after lock.
2. **One active war per clan**.
3. **Pair cooldown 72h** (A↔B).
4. **Declaration cap**: 2 per 24h.
5. **Min clan size 5** and roster min 5.
6. **Min account age for rostered members**: 7 days.
7. **Min player level for rostered members**: level 5.
8. **Idempotency key required** on action submit.
9. **Server timestamp authority** for cooldowns and phase transitions.
10. **Contribution floor for rewards** to block AFK farming.

### Win trading controls
- Decline/accept history tracked; repetitive reciprocal short wars flagged.
- Same-pair weekly reward attenuation: second war same week gives 50% war_credits.

### Timezone fairness
- Prep window 6h allows async setup.
- Hidden finale prevents last-minute exact-score sniping.

### Cross-school abuse handling
- Wars are cross-school allowed only through war subsystem endpoints; existing school-scoped feeds/leaderboards remain unchanged.

---

## 12) VISIBILITY / SOCIAL / DRAMA

### Attacking clan sees
- Full own + enemy structure health bands (exact values for participants only).
- Detailed internal war logs.
- Exact score until blackout.

### Defending clan sees
- Same as attacker.

### Outsiders see
- War card (who vs who, phase, time remaining, major milestones only).
- No detailed logs, no exact structure values.

### Global activities mirroring (major only)
Mirror to `activities` only:
1. war_declared
2. war_accepted
3. first_structure_down
4. war_entered_blackout
5. war_ended + winner
6. MVP highlight (one summary entry)

All per-action logs remain in dedicated war tables.

---

## 13) DATABASE DESIGN

> **Validate in prod before migration**: confirm existing column overlaps (`users.role`, existing `pvp_attack_attempts`, clan buff tables) and naming collisions.

### Required V1 tables

#### 1. `rivalry_wars`
- Purpose: war lifecycle root.
- PK: `id uuid`.
- Key cols:
  - `attacker_clan_id`, `defender_clan_id`
  - `status` (`pending_response|prep|live|blackout|settled|expired|declined|canceled`)
  - `declared_by_user_id`, `responded_by_user_id`
  - `challenge_expires_at`, `prep_ends_at`, `live_starts_at`, `live_ends_at`, `blackout_starts_at`
  - doctrine fields per clan
  - final score fields + winner clan id
- FKs: clans/users.
- Constraints:
  - attacker != defender
  - one active war per clan (partial unique index on statuses `pending_response|prep|live|blackout`)
- Indexes:
  - `(status, live_ends_at)`
  - `(attacker_clan_id, created_at desc)`
  - `(defender_clan_id, created_at desc)`
- Data sensitivity: medium.

#### 2. `rivalry_war_rosters`
- Purpose: locked participant roster per war per clan.
- PK: `id uuid`.
- Key cols: `war_id`, `clan_id`, `user_id`, `role_pref`, `is_locked_in`, `locked_at`, `joined_at`.
- Constraint: unique `(war_id, user_id)` and unique `(war_id, clan_id, user_id)`.
- Constraint: role_pref enum check.
- Indexes: `(war_id, clan_id)`, `(war_id, user_id)`.
- Sensitive: medium.

#### 3. `rivalry_war_structures`
- Purpose: structure integrity state snapshots.
- PK: `id uuid`.
- Key cols: `war_id`, `owner_clan_id`, `structure_code`, `max_integrity`, `current_integrity`, `state_band`, `times_downed`.
- Constraint: unique `(war_id, owner_clan_id, structure_code)`.
- Indexes: `(war_id, owner_clan_id)`.
- Sensitive: medium.

#### 4. `rivalry_war_effects`
- Purpose: active sabotage/debuff effects.
- PK: `id uuid`.
- Key cols: `war_id`, `source_clan_id`, `target_clan_id`, `target_structure_code`, `effect_code`, `potency`, `expires_at`, `source_action_id`.
- Indexes: `(war_id, target_clan_id, expires_at)`.
- Sensitive: participant-only.

#### 5. `rivalry_war_actions`
- Purpose: immutable action log (strike/sabotage/repair).
- PK: `id uuid`.
- Key cols:
  - `war_id`, `actor_user_id`, `actor_clan_id`
  - `action_type`, `target_clan_id`, `target_structure_code`
  - `idempotency_key`, `oe_spent`, `result_grade`, `damage_amount`, `repair_amount`, `wp_delta_visible`, `wp_delta_hidden`
  - `created_at`
- Constraint: unique `(war_id, actor_user_id, idempotency_key)`.
- Indexes: `(war_id, created_at desc)`, `(war_id, actor_clan_id, created_at desc)`.
- Sensitive: detailed (participants).

#### 6. `rivalry_war_member_state`
- Purpose: per-war per-user runtime counters.
- PK: composite `(war_id, user_id)`.
- Key cols: `current_oe`, `oe_updated_at`, `last_action_at`, `action_count`, `contribution_points`, `cooldown_until`.
- Indexes: `(war_id, clan_id)` via included clan col.
- Sensitive: participant-only.

#### 7. `rivalry_war_scores`
- Purpose: scoreboard and settlement source of truth.
- PK: `war_id` + `clan_id` composite.
- Key cols: `visible_wp`, `hidden_wp`, `milestone_wp`, `tie_break_metrics jsonb`, `final_wp`.
- Indexes: `(war_id, final_wp desc)`.

#### 8. `rivalry_war_rewards`
- Purpose: reward settlement per user.
- PK: `id uuid`.
- Key cols: `war_id`, `user_id`, `clan_id`, `reward_xp`, `reward_coins`, `reward_war_credits`, `eligible`, `claimed_at`, `mvp_tag`.
- Constraint: unique `(war_id, user_id)`.
- Sensitive: user-private.

#### 9. `rivalry_war_pair_cooldowns`
- Purpose: anti-farm same-pair lockouts.
- PK: `id uuid`.
- Key cols: `clan_a_id`, `clan_b_id`, `cooldown_until`, `reason`.
- Constraint: canonical ordering check (`clan_a_id < clan_b_id`) + unique pair.

#### 10. `rivalry_war_stakes` (escrow)
- Purpose: separate stake ledger (not vault).
- PK: `id uuid`.
- Key cols: `war_id`, `clan_id`, `stake_type`, `stake_amount`, `status`.
- Optional in V1 if no stake enabled; keep schema for safe extension.

### Optional later tables
- `rivalry_war_seasons`
- `rivalry_war_matchmaking`
- `rivalry_war_spectator_snapshots`

---

## 14) RPC / BACKEND API DESIGN

> All write RPCs: `SECURITY DEFINER`, strict `search_path`, explicit auth checks, idempotent where relevant.

### Lifecycle RPCs

1. `rpc_rivalry_declare_war(p_target_clan_id uuid, p_idempotency_key uuid)`
- Auth: leader/officer/moderator of attacker clan.
- Validations: clan eligibility, pair cooldown, active-war constraints, declaration cap.
- Side effects: create `rivalry_wars` pending_response, create notifications.

2. `rpc_rivalry_respond_war(p_war_id uuid, p_response text, p_idempotency_key uuid)`
- Auth: defender leadership.
- `p_response`: `accept|decline`.
- Side effects:
  - accept: set prep timers, initialize structures/scores.
  - decline: mark declined + pair cooldown.

3. `rpc_rivalry_set_doctrine(p_war_id uuid, p_doctrine_code text)`
- Auth: clan leadership in prep only.
- Side effects: writes doctrine field.

4. `rpc_rivalry_update_roster_member(p_war_id uuid, p_member_user_id uuid, p_role_pref text, p_include boolean)`
- Auth: clan leadership in prep only.
- Validations: member belongs to clan, age/level eligibility.

5. `rpc_rivalry_lock_roster(p_war_id uuid)`
- Auth: clan leadership.
- Validations: min/max roster size.
- Side effects: marks clan roster locked; war may auto-transition once both locked or prep timeout.

6. `rpc_rivalry_get_war_state(p_war_id uuid)`
- Auth: participants full detail; outsiders redacted summary.
- Returns: phase, timers, structures, score visibility level, doctrine labels.

7. `rpc_rivalry_submit_action(
  p_war_id uuid,
  p_action_type text,
  p_target_structure_code text,
  p_target_clan_id uuid,
  p_idempotency_key uuid
)`
- Auth: rostered participant in live/blackout phase.
- Validations: OE, cooldown, target validity.
- Side effects: updates OE/member state, structures/effects/scores/actions.
- Emits: participant realtime payload; milestone event optionally mirrored.

8. `rpc_rivalry_get_war_logs(p_war_id uuid, p_cursor timestamptz, p_limit int)`
- Auth: participant full logs; outsider milestone-only logs.

9. `rpc_rivalry_settle_war(p_war_id uuid)`
- Auth: internal/cron/admin only.
- Side effects: finalize scores, winner, rewards rows, pair cooldown insertion, feed milestones.

10. `rpc_rivalry_claim_reward(p_war_id uuid)`
- Auth: own reward row only.
- Side effects: applies XP/coins/wcredits; marks claimed.

### Scheduler/lazy transitions
- Prefer **lazy transition on reads/writes** + lightweight cron backstop:
  - any `get_war_state`/`submit_action` can trigger phase promotion when timestamps crossed.
  - cron only ensures stale wars settle.

---

## 15) RLS / SECURITY MODEL

### Read model
- `rivalry_wars`: public summary columns via view; raw table restricted.
- `rivalry_war_actions`: participant-only detailed rows.
- `rivalry_war_structures`: participant exact integrity; outsiders banded via view.
- `rivalry_war_rewards`: owner-only.

### Write model
- Direct table writes denied to authenticated users.
- Writes only via SECURITY DEFINER RPCs.

### Role permissions
- Leadership: declare/respond/doctrine/roster lock.
- Rostered member: submit actions.
- Non-rostered clan member: read participant view only.
- Outsider: public war summary only.

### Cross-school security handling
- Existing school-scoped APIs remain unchanged.
- Rivalry subsystem explicitly allows cross-school via dedicated war tables and RPC checks.
- Never widen existing school-scoped RPC semantics.

### Top Security Pitfalls to Avoid
1. Allowing direct inserts to action/effects tables.
2. Missing idempotency unique constraints on action RPC.
3. Deriving phase/cooldown from client clock.
4. Letting non-rostered members submit actions.
5. Reusing solo PvP inventory items directly.
6. Writing detailed war logs into global `activities`.
7. Forgetting pair canonicalization (A/B vs B/A duplicates).
8. Not locking rows when updating OE + structures + scores atomically.
9. Settling wars multiple times (lack of settlement guard).
10. Accidentally applying school isolation to war reads (would break cross-school requirement).

---

## 16) FRONTEND INTEGRATION PLAN

### Reusable as-is
- Clan management patterns (`ClanView`) for leadership actions and roster UI conventions.
- Toast/notification UX in `App.tsx`.
- Realtime channel subscription patterns.

### Reusable with small changes
- Leaderboard shell for rivalry ranking tab.
- News feed milestone cards for war events.
- Existing modals for declare/accept/lock confirmations.

### Brand-new work
1. `components/RivalryProtocolView.tsx` (main war hub).
2. `components/rivalry/WarBoard.tsx` (live structures/actions).
3. `components/rivalry/WarPrepPanel.tsx`.
4. `components/rivalry/WarHistoryPanel.tsx`.
5. `components/rivalry/WarRewardModal.tsx`.
6. `services/rivalryService.ts` (dedicated API wrapper; do not overload `raid_attack`).

### App.tsx fit
- Add `view: 'rivalry'` into existing single-shell view state.
- Entry from clan page button and notifications.

### Live war screen structure
- Header: phase/timer/status band.
- Mid: three enemy structures + three own structures.
- Action panel: Strike/Sabotage/Repair with OE + cooldown.
- Log panel: participant scoped stream.
- Score panel: exact pre-blackout, banded in blackout.

### Poll vs subscribe
- Realtime for action log + structure updates.
- Poll every 30s for score/timer reconciliation fallback.

### Performance
- Paginate logs.
- Batch UI updates (throttle 500ms).
- Separate participant and outsider payload channels.

---

## 17) REALTIME / EVENTING PLAN

### Realtime tables/channels
- Participant channels scoped by `war_id`:
  - `rivalry_war_actions`
  - `rivalry_war_structures`
  - `rivalry_war_scores` (redacted in blackout)
- Public channel:
  - milestone-only from `rivalry_war_milestones` (or filtered `rivalry_war_events` view).

### Polling usage
- `get_war_state` poll every 30s as consistency backstop.
- `war_history` poll on tab open / refresh button.

### Flood control
- Do not broadcast every derived recomputation; broadcast only persisted action and milestone rows.
- Use client-side debounce for log rendering.

---

## 18) IMPLEMENTATION PHASING

### Phase 0 — Validation
- Inspect production schema for collisions/drift.
- Confirm baseline constraints and required columns.

### Phase 1 — Schema + RLS
- Add rivalry tables, enums/checks, indexes, RLS deny-by-default.

### Phase 2 — Read RPCs
- `get_war_state`, `get_war_logs`, `list_eligible_targets`, `list_war_history`.

### Phase 3 — Write RPCs
- declare/respond/doctrine/roster lock/action submit.
- Add idempotency and row-level locking.

### Phase 4 — Settlement + backstop
- settle/claim reward RPCs.
- cron or lazy settlement fallback.

### Phase 5 — Frontend behind feature flag
- Add rivalry view and minimal war board.

### Phase 6 — Realtime + notifications + feed milestones
- Participant realtime channels and global milestones.

### Phase 7 — Balance tuning + abuse telemetry
- Tune OE, cooldowns, and score multipliers using logs.

---

## 19) V1 DEFAULT TUNING TABLE

| Parameter | Recommended V1 Default |
|---|---:|
| Roster max | 7 |
| Roster min lock | 5 |
| OE max | 10 |
| OE start | 6 |
| OE regen | +1 / 45m |
| Strike OE cost | 2 |
| Sabotage OE cost | 3 |
| Repair OE cost | 2 |
| Strike cooldown | 60s |
| Sabotage cooldown | 180s |
| Repair cooldown | 90s |
| relay_core integrity | 1000 |
| cipher_vault integrity | 1200 |
| sentinel_grid integrity | 900 |
| Challenge timeout | 12h |
| Prep duration | 6h |
| Live duration | 24h |
| Hidden-score blackout | last 2h |
| Same-pair cooldown | 72h |
| Declare cap | 2 / 24h |
| Reward qualification | ≥6 actions or ≥180 contribution |
| Winner settlement bonus | +700 WP |
| Loser settlement bonus | +250 WP |

---

## 20) FUTURE EXPANSION NOTES (V2+)

- Territory map integration with Rivalry outcomes.
- Automated ranked war queue.
- Seasonal Rivalry championships.
- Additional structures and sabotage chains.
- Clan alliances and treaty mechanics.
- Spectator mode with richer public timeline.

---

## 21) FINAL RECOMMENDATION

### Recommended final V1 architecture
Build Rivalry Protocol as an isolated Supabase subsystem (`rivalry_*` tables + dedicated RPC layer + dedicated frontend service/view), with controlled milestone mirroring into existing feed and notifications.

### Why this is safest for Brain Heist
1. Preserves solo PvP (`rpc_hack_attempt`) behavior and AP economy.
2. Avoids fragile legacy coupling by introducing clear new domain boundaries.
3. Works with current App single-shell architecture and existing realtime/toast patterns.
4. Supports cross-school wars without weakening existing school-isolated systems.

### Top risks requiring validation before coding
1. Production schema drift and naming collisions.
2. Existing RLS/policy drift interactions with new tables.
3. Realtime volume under peak wars.
4. Balance exploitation in first tuning pass.

### Build this first
**Phase 0 + Phase 1:** production schema validation, then ship rivalry schema + RLS + read-only war state RPC before any action/settlement writes.

