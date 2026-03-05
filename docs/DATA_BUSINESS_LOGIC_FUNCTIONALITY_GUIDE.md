# Data, Business Logic & Functionality Guide

This guide is a practical handoff for the person owning data quality and platform behavior in **Brains Heist**.

Use it together with:
- [`database.md`](./database.md) for table-level schema details.
- [`api.md`](./api.md) for RPC-level behavior.
- [`overview.md`](./overview.md) for architecture context.

## 1) Product Domains and Ownership Map

| Domain | What it controls | Primary data objects | Primary business rules |
| --- | --- | --- | --- |
| Identity & Access | Who can sign in and what they can do | `users`, `profiles`, `teachers` | Role-based access (student/teacher/admin), ban/admin flags, tenant-safe access policies |
| Learning Content | What questions/tests are available | `mcq_questions`, `questions`, `quest_templates` | Difficulty tagging, publication state (`is_active`/`is_public`), grade compatibility |
| Attempt Tracking | What learners answered and how they performed | `attempts`, `question_attempts` | Attempt logging, score attribution, analytics-ready timestamps |
| Progression Economy | How users level up and earn/spend resources | `users` (xp/coins/level/AP), `tasks`, `caps`, `sessions`, `inventory`, `shop_purchases` | XP/coin caps, AP regeneration, level-up rewards, timed booster effects |
| Social & Competition | Multiplayer and collaboration systems | `activities`, `clans`, `clan_members`, `clan_chat` | Fair PvP outcomes, clan roles, moderation and feed integrity |
| Teacher Operations | Teacher-created content and class assignment | `classes`, `class_students`, teacher-owned questions/templates | Teacher visibility boundaries, class-scoped reporting, assignment lifecycle |
| Reliability & Audit | Observability and diagnostics | `rpc_event_log`, announcements/receipts | Error telemetry, delivery tracking, compliance-friendly change history |

## 2) Core Functionalities and Their Data Paths

### A. Authentication + Profile Boot
1. User authenticates through Supabase Auth.
2. App resolves user-facing profile data from `users`/`profiles`.
3. Session-dependent state (boosters, AP, caps) is hydrated from `sessions` and `caps`.

**Data owner checks:**
- Orphaned users with missing profile-facing fields.
- Invalid grade/batch values.
- Users with contradictory flags (`is_banned = true` and active engagement).

### B. Question Delivery + Submission
1. Learner receives content from built-in (`mcq_questions`) or teacher-authored (`questions`) banks.
2. Submission inserts into `attempts` or `question_attempts`.
3. XP/coin progression updates apply after correctness and cap checks.

**Data owner checks:**
- No inactive content leaking to learners.
- Correct answer keys and option formats are valid.
- Duplicate attempt anomalies (same learner, same question, impossible timestamps).

### C. Progression Loop (XP, Coins, Levels)
1. Correct actions produce XP/coin deltas.
2. `caps` constrain daily/weekly accumulation.
3. Level-up calls reward logic (`rpc_grant_levelup_rewards`).
4. Inventory or boosters in `sessions`/`inventory` modify effective rewards.

**Data owner checks:**
- XP/coin deltas never bypass configured caps.
- Level jumps are monotonic and explainable.
- Booster expirations are honored (no stale active sessions).

### D. PvP Hack Flow
1. Attacker invokes `rpc_hack_attempt`.
2. Function validates AP, cooldown, shield/cracker state, then computes outcome.
3. Coins/XP/inventory mutate atomically, and event logs are recorded in `activities`.

**Data owner checks:**
- No self-attack records.
- AP never drops below zero.
- Coin transfer conservation (attacker gain matches defender loss rules).
- Cooldown timestamps and attack frequency are consistent.

### E. Teacher Assignment & Analytics
1. Teachers compose templates (`quest_templates`) and manage groups (`classes`, `class_students`).
2. Student attempts aggregate into reporting datasets.
3. Dashboards surface weak topics, completion, and comparative performance.

**Data owner checks:**
- Students only appear in authorized classes.
- Template-question relations remain valid after content edits/deletes.
- Reporting windows are timezone-consistent.

## 3) Business Logic Rules (Canonical Set)

These are the minimum rules your data governance should continuously verify:

1. **Role integrity:** privileged teacher/admin operations require eligible role flags.
2. **Visibility integrity:** inactive/private content must not be returned to unauthorized learners.
3. **Progression integrity:** XP/coin gains must respect cap limits and cannot create negative balances.
4. **AP integrity:** AP regeneration follows configured cadence and remains within `[0, ap_max]`.
5. **PvP integrity:** cooldown, anti-self-targeting, and inventory consumption are always enforced.
6. **Clan integrity:** exactly one leader per clan and `member_count` matches actual memberships.
7. **Attempt integrity:** each attempt record is attributable (student, question, timestamp, correctness).
8. **Audit integrity:** RPC failures and high-impact actions are captured in telemetry.

## 4) Suggested Data Stewardship Routines

### Daily
- Monitor growth/failure metrics: new attempts, failed RPC calls, abnormal PvP spikes.
- Validate cap-reset behavior and AP regeneration consistency.
- Check announcements delivery/receipt rates.

### Weekly
- Run quality reports: invalid foreign keys, duplicate attempts, stale boosters, class roster mismatches.
- Review top anomaly cohorts: unusually fast XP gainers, zero-activity classes, suspicious PvP loops.
- Confirm content inventory health (active question counts by grade/subject/difficulty).

### Monthly
- Archive or snapshot heavy activity tables if needed.
- Reconcile business KPIs vs. data events.
- Re-validate RLS/tenant boundaries after migrations.

## 5) KPI Layer (Business + Data Health)

| KPI | Why it matters | Derived from |
| --- | --- | --- |
| Daily Active Learners | Engagement baseline | Distinct users in `attempts`/`question_attempts`/`activities` |
| Attempt Accuracy by Topic | Learning outcome quality | `question_attempts.is_correct` grouped by subject/topic |
| XP Velocity Distribution | Detect progression inflation | Daily XP deltas + `caps` |
| PvP Fairness Ratio | Balance and abuse detection | `rpc_hack_attempt` outcomes, coin deltas, block rates |
| Booster Utilization | Economy effectiveness | Active/expired rows in `sessions` + purchase history |
| Teacher Content Adoption | Product value for schools | Attempts tied to `quest_templates` and teacher-authored `questions` |
| Data Error Rate | Platform reliability | `rpc_event_log` error volume per function |

## 6) Change Management Checklist (Before Any Data/Logic Change)

1. Define affected domain(s): identity, content, progression, PvP, teacher tools, analytics.
2. List all touched tables, RPCs, and UI surfaces.
3. Specify backward compatibility and migration plan.
4. Add/update validation queries and monitoring thresholds.
5. Update docs (`database.md`, `api.md`, and this guide) in the same release.
6. Verify post-deploy metrics for 24h and capture rollback criteria.

---

If your brother owns data and logic operations, this file should be treated as the **operational playbook**, while schema and RPC docs remain the technical source of truth.
