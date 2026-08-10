# Academic Intelligence governed rollout runbook

This runbook is the operational handoff for Phase 9. Academic Intelligence remains a
student-centred academic system: it supports evidence over time, teacher judgement, measured
interventions, and reproducible reporting. It is not a timetable, attendance, or general
school-operations replacement.

## Accountable owners

| Responsibility | Accountable role | System boundary |
| --- | --- | --- |
| Set thresholds, retention, and correction terms | School Head | Creates a new immutable policy version |
| Evaluate readiness and reconcile blockers | School Head or School Admin | Cannot enable release |
| Enable, pause, or disable a capability | School Head | Requires the latest ready policy snapshot |
| Review correction evidence | School Head or School Admin | Cannot edit the original Final report |
| Approve retention decisions | School Head | Does not execute deletion in the browser |
| Preserve audit evidence | School Head | Exports the year-scoped manifest |

## Release sequence

1. Select the academic year in **Academic Progress & Support → Govern rollout**.
2. Agree thresholds before inspecting the resulting readiness answer. Record the full School
   Head attestation and approve the policy.
3. Evaluate readiness. Reconcile every blocker; do not lower a threshold only to make the
   screen green. If the school changes a threshold for a legitimate reason, approve a new
   policy version and re-evaluate.
4. Export the audit manifest and sample its report/source counts against Part 8 snapshots.
5. Enable only the capability the school is ready to use. Student and family reports are
   intentionally separate. School-wide reporting and intervention-effectiveness claims need
   their own explicit decisions.
6. Record the release date, policy hash, readiness hash, capability, rationale, accountable
   School Head, and review cadence in the school's governance record.

## Re-evaluation triggers

Re-evaluate after a confidence-policy change, curriculum-map version change, source-adapter
change, material enrolment import, report-builder change, unresolved high-risk shadow result,
or an agreed periodic review. Pause the affected capability while a material blocker is open.

## Correction rule

The original report is evidence and stays immutable. A valid correction creates a later report
version from corrected source evidence, finalizes it through the current release gate, and
records a `superseded` correction event linking the replacement. Never use free-text rationale
as a substitute for correcting the source record.

## Retention rule

The configured retention duration is a school-approved operating term, not automatic legal
advice and not a deletion job. Export, restriction, and deletion requests require an explicit
decision and execution evidence. The Phase 9 browser RPC records the process but deletes no
academic data.

## Incident response

Pause the relevant capability when the school cannot reproduce a report, discovers a privacy
scope issue, loses curriculum mapping coverage, has an unresolved high-risk validation case,
or finds that the approved policy no longer represents its practice. Pausing preserves staff
access to the evidence chain while immediately closing later student access.
