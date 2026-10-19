# Retention Evidence Dashboard v2 — Release and Measurement Contract

As of 2026-10-18: [PR #1656](https://github.com/mrmemo87-cell/g-brain-heist/pull/1656) is proposed code, not proof of an already deployed frontend feature.

## Where it lives

Platform Superadmin → System → Retention trial → **Investor retention evidence v2** → **Load evidence**.

The original retention trial stays unchanged. At the audited snapshot it is enabled for **two named pilot accounts** only. The evidence RPC reads historical action records across eligible users; it does not require trial enrollment and does not expand trial access.

## Source-of-truth definitions

The report intentionally does **not** count sign-ins, navigation, screen views, student paper captures or email sends as meaningful student activity.

**Teacher meaningful actions:** new assignment authored, confirmed paper submission recorded by an eligible teacher, and learning intervention authored by an eligible teacher.

**Student meaningful actions:** online assignment completion (excluding quarantined student-assignment pairs), completed quest, and successfully saved trial practice. Quests and pilot practice are not validated as voluntary or unsupervised. Trial completion may include QA activity.

**Weekly active:** unique eligible actor IDs who performed at least one meaningful action in a Monday–Sunday UTC calendar week. The current week is marked partial.

**W1 retention:** unique actors whose **first-ever recorded** meaningful action is in cohort week W0 and who performed at least one meaningful action during W0+1 week. **W4** follows the same rule for W0+4. Percentages should be presented only after the entire target week closes. These are first-meaningful-use cohorts, **not registration or product-activation cohorts**.

**28-day repeat:** unique student users with meaningful actions in at least two distinct UTC calendar weeks in the rolling last 28 days. Distinct from online-assignments-only repeat.

**School footprint:** unique non-null non-test-labeled school IDs associated with meaningful events in the past 28 days. Not a count of schools under contract.

## Safeguards

- Superadmin-only authenticated SECURITY DEFINER RPC; the function checks `auth.uid()` and `rpc_is_superadmin()` before querying. No public/anonymous execution. Result is aggregate JSON with no child identifier, marks, email or answer content.
- Provenance explicitly flags names matching anchored test/demo/qa/sample/seed/fake/sandbox user aliases and schools containing test/demo/sample/sandbox; this rule is **incomplete** and needs operator-approved test-account annotation.
- A student paper completion is shown separately and **never** presented as an online engagement event.
- Existing retention trial control, question evaluation, learner histories, rewards, school RLS and permissions are unchanged.
- Backend cohort logic is checked with SQL read-only evaluation against production, then guarded by a new PGlite test. Run `npm run test:retention`, `npm run typecheck`, `npm run build`, `npm run security:migrations` before merge.

## Initial 2026-10-18 live read-only preflight

- 28 days: 32 meaningful student users, 1 meaningful teacher user, 60 online assignment completions, 13 teacher-authored assignments, 8 quests, 3 saved pilot-practice completions, 27 paper completions (reported separately).
- 15 students active in two or more calendar weeks **across combined meaningful sources**. The stricter online-completion-only metric is 14.
- Meaningful actions in one school in the past 28 days; no teacher interventions yet.
- For the first-meaningful-use student cohort beginning September 28, 2026: **10/15** returned in W1 (66.7%). This differs from the older online-only cohort's 11/16 because quest history can shift the first meaningful-use week. W4 remains immature.

These are historical observations, not proof that the new retention pilot increased behavior or improved learning.

## Pilot evaluation

1. Keep the pilot small until user-facing QA and permission checks pass.
2. Confirm identity/test-account flags and whether teacher activity reflects independent adoption or founder-led teaching.
3. Review the dashboard weekly; avoid comparing an incomplete week with full weeks.
4. Collect teacher interviews using `docs/investor-traction/teacher_feedback.md` with separate consent for public quotes.
5. Add a validated source flag for **voluntary/self-initiated** practice and an independent teacher engagement measure in a future release.
6. Verify the bank payment receipt and customer relationship separately before describing Brains Heist as revenue-generating.

## Rollback

UI lives on one feature branch; leave unmerged or revert the PR to hide the dashboard. The new reporting RPC is read-only and does not alter existing trial behavior. Do not disable or delete preexisting trial tables/functions as part of rollback.
