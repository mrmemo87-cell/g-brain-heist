# Investor traction evidence — read-only reporting

Snapshot prepared 2026-10-18 UTC. **This work is documentation and reproducible SQL only; it does not modify production behavior or access policies.**

## Purpose
Produce defensible metrics for accelerator conversations without confusing registered accounts, assignment-driven classroom usage, and voluntary retention.

## Initial results (28 rolling days ending 2026-10-18)
- 32 distinct students completed 60 **online** assignments.
- 14 of these students completed online assignments in at least two distinct ISO weeks, 4 in at least three.
- One teacher created 13 assignments; one school generated the last 28 days of online completions.
- For the 2026-09-28 first-online-completion cohort, 11/16 returned in the next complete week (W1 = 68.8%). W4 is not yet mature.
- 27 paper-imported completion records were deliberately excluded from the online-use count.
- 8 completed quests were associated with 4 students. They are **not established as voluntary**.

## Reproduce
Open `traction_queries.sql` in the Supabase SQL Editor on the Brains Heist project and run each SELECT as a trusted internal operator. It must not be offered as a public RPC, view, or front-end endpoint. No credentials belong in this folder. The report intentionally emits **aggregate counts only**, not names, emails, or student learning records.

## Cleaning methodology
1. Remove student/teacher accounts with strongly test-like username prefixes: `test`, `demo`, `qa`, `sample`, `seed`, `fake`, `sandbox` with a numeric/word separator or end of string. This is a **provisional** screen, not a validated complete test-account exclusion.
2. Exclude school records whose names contain `test`, `demo`, `sample` or `sandbox` from school-based usage analytics.
3. Match assignment authors through `assignments.teacher_id → teachers.id → teachers.user_id`; joining `teacher_id` directly to `users.id` is incorrect.
4. Use `completion_source = 'online'` for student engagement; report `paper` separately.
5. W0 = student's first observed **online assignment completion ISO week**. W1 and W4 mean activity in exactly the +1 and +4 weeks, respectively. Only report mature target weeks; the current week is partial.
6. Track repeat activity and first-use cohort retention separately. Neither proves independently chosen practice.

## Evidence gaps and guardrails
- Recent teacher adoption is concentrated in one teacher and one school. Do not present this as broad school demand.
- Teacher views/reports accessed are not yet instrumented as audited meaningful events.
- The database has one **manually marked paid** payment attempt; do not claim paying customers or revenue without receipt reconciliation.
- Qualitative interviews and testimonial consent remain to be collected. See `teacher_feedback.md` for the instrument.
- Do not disclose pupil names, private marks, or student identifiers. Avoid storing raw user activity exports in Git.

## Next actions
1. Confirm a trusted pilot-school and test-account allow/deny list with the operator.
2. Instrument teacher meaningful actions (report viewed, diagnostic launched, intervention approved, assignment published) and self-initiated versus assigned student practice.
3. Run this report weekly and save dated aggregated snapshots to a private diligence folder.
4. Obtain at least five teacher responses and permission for any external quotation.
5. Reconcile manual payment status and W4 cohort maturity before pitching those claims.
