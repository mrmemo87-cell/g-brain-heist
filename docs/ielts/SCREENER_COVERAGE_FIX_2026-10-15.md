# Screener response coverage and Reading submission recovery

Date: 2026-10-15. Diagnostic Bible **1.10.0**; Visual & UX Bible **1.1.0**.
Implementation based on main `dc19bbb1252ee9172ac828dc9fdaf4faff0f4031`.

## Problem and behavior

Reading showed one passage's questions at a time while allowing immediate submission. Live saved results include half-finished and empty attempts. Submission status alone was used for objective completion counters; teacher Programme rows showed marks without response coverage.

The patch adds current/total passage orientation, full question counts, a bottom-of-passage continuation button, saved passage selection and keyboard focus on the newly selected passage. Manual submission checks every section, including hidden passages. Unanswered work requires explicit confirmation; cancel/Escape preserves work and the timer continues. A synchronous submission guard prevents rapid double-click duplication; inputs lock during final submission. Existing RPC grading, idempotency and time-expiry behavior remain authoritative.

Objective results/cards and the teacher Programme view distinguish no recorded answers, partial coverage, complete response coverage and unknown coverage. They retain original marks and saved-result links. Empty/partial/unknown objective records do not increment the student's completed starting-point count; conditions flagged for review also withhold that count. This is a conservative response-availability check, not an academic validity certification or a new score threshold. A fully answered zero score remains fully answered. Four completed checks still cannot automatically establish a band. Writing/Speaking review gates remain unchanged.

The next-action helper directs students with partial Reading toward remaining screeners rather than another exposed Reading attempt; once other checks are present it asks for teacher help with a supervised fresh check. Expired-attempt copy says the timer ended rather than promising further answering time. Existing same-form repeat warnings remain visible. No alternate assessment content or teacher approval is invented.

## Data and authorization

The migration only extends three existing read projections: starting-point summary, saved objective result and school Programme workspace. Counts come from the existing trusted scoring run, not client state. It patches the current function definitions with explicit drift checks, preserves their authorization bodies, and restates authenticated-only execution grants. No new endpoint, public table, historical rewrite, score conversion, key distribution, seat allocation, answer write, attempt reset or content-publication change is introduced.

Production inspection confirmed saved scoring runs carry response counts. Gulzada's canonical pilot identity remains an eligible, active student. This is identity/eligibility evidence only; it is **not** an authenticated browser pilot. No production migration or student-recovery mutation has been performed as part of this branch.

## Verification

- `npm test`: **2,184 passed, 2 skipped, 0 failed**, including Programme, student Journey, reading navigation/submission and database isolation suites.
- Latest focused DOM/database rerun: **22 passed, 0 failed** after final submission/result wording changes.
- Typecheck, production build, school-admin integrity guard, migration security guard, verified-package validation, taxonomy-review validation and diff whitespace check passed.
- Added tests cover 0/12, 6/12, 12/12, malformed counts, fully answered zero attainment, conditions needing review, next Listening action, empty/partial result labels with unchanged marks, hidden-passage submission confirmation, Escape/cancel, passage switching with retained answers, rapid double-clicks, self-only reads, denied anonymous/other-student reads and migration drift rejection.
- Existing Writing offline/retry/background/resume and saved-result role navigation regressions pass.
- DOM fixtures exercise widths 375/768/1440. **These are not layout or real-browser passes.** Chromium download was truncated; system-browser installation was unavailable in this runtime. No browser screenshots, physical-device/audio acceptance or live named-student pilot is claimed.

The database fixture uses the real summary/Programme source with a bounded saved-result fixture to verify additive projection and ACL behavior; it does not certify the full hosted production authorization graph. Existing governed-evidence and delivery-status regression suites remain part of `npm test`.

## Rollout and remaining work

1. Review the migration against the current three function definitions; it intentionally aborts on source drift or accidental reapplication. Apply once through the normal migration process before deploying the client. Check deployed grants/advisors and self/other-school access. The extra fields are backward compatible with the old frontend; deploying the new frontend first intentionally shows unknown coverage rather than false completion.
2. Use the named-user Gulzada pilot and normal authorized student flow, preserving every prior attempt. Verify Reading passage navigation, incomplete confirmation, full submission, refresh/resume, timer expiry, saved-result coverage and the next Journey action. Review phone/tablet/desktop rendering and keyboard focus before release.
3. Confirm course enrolment before allocating missing seats. Jess should arrange fresh independent Reading evidence for affected empty/partial attempts. Preserve the original records; a same-form repeat is practice. Resolve expired sessions through existing governed finalization, not direct status edits.
4. Deploy after the applicable pilot gates pass. The branch remains a draft until the browser/pilot gap is resolved. Reverting frontend code is safe with the additive projection fields left in place; do not roll back academic history.

Concurrency impact: no new polling, per-answer requests, shared locks, history scans or scoring work. Coverage uses already-selected scoring rows; client counts are bounded by the loaded form. The submission interaction changed, so affected simultaneous-submission capacity evidence must be rerun before any larger-concurrency release claim. No 30/100/500 load run or 500-user capacity is claimed.

No Bible revision is necessary: this implements existing evidence, accessibility, delivery and review contracts rather than changing them.
