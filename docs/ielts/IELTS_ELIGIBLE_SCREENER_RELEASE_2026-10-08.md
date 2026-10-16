# Eligible-student screener release — 8 October 2026

Contract: IELTS Diagnostic Bible 1.4.0. Owner explicitly authorized publishing all four screeners for students granted IELTS access by school administration, after Gulzada's completed and reviewed four-skill pilot.

Listening and Reading were already enabled for eligible students. Writing changes from named-user pilot to public eligible-student scope through the governed release function. Speaking is already published; its school-student eligibility now additionally requires the canonical assigned IELTS seat. Independent-student eligibility retains its existing policy.

School access requires active membership, an enabled IELTS programme and an unreleased IELTS seat assigned to that student. Membership alone does not grant a seat. School admins allocate student access and the programme teacher separately. Writing requires teacher review and Speaking remains a teacher-led interview.

## Exact Writing version and evidence

- Version: `c06e286b-9cb7-451b-8b95-4974251b9f4f`.
- Published content hash: `bad9dc88ce47562c64b292eefacd7621696c68b8a792854531eed977789deca0`.
- Original content/rubric/taxonomy approval is recorded in the immutable published version; this release does not alter it.
- Gulzada's original Writing attempt `8569a970-d021-4867-bd32-e29dd6943a34` is teacher reviewed. The owner supplied iPhone submission/feedback and MacBook teacher-review screenshots, accepted the feedback, and subsequently authorized wider publication.
- Automated delivery checks mount the actual shared Exam Mode at 390px and 1440px. They inject offline state and a rejected autosave, reconnect, background the page and remount with the saved device draft. The essay survives and reaches the autosave request. These are synthetic RPC fault-injection checks, not a newly performed physical-device session.
- Executable database checks cover start/resume deadlines, autosave versions, submission idempotency, immutable originals, protected payloads, review scope, append-only review history, expiry and repeats. A separate public-release test rejects every missing Writing acceptance flag, then exercises eligible/denied discovery and verifies original submissions/reviews remain identical.

The release acceptance combines the owner's completed pilot/device evidence with these automated recovery/security checks. It does not claim a fresh registration test, calibrated bands, or 500-student load validation. Previous pilot validation is retained in the release record, with a new governed audit entry.

## Validation and assessment impact

School portal guard, content validators, typecheck, migration security and production build passed. Unit suite: 1,829 passed, two existing skips. IELTS-focused DOM checks: 12 passed; database suite: 35 passed. Speaking tests use the actual canonical seat helper and verify no seat, wrong programme, wrong school, released seat, inactive membership, banned user and disabled module; saved interviews remain unchanged.

Live read-only checks confirm Gulzada can access the three saved objective/Writing screeners and Speaking. An active school student without an IELTS seat receives an empty screener catalog and Speaking unavailable. Gulzada is currently the only assigned IELTS-seat student in her school; others become eligible when the school admin assigns seats.

Scoring, reviewed content, taxonomy and assessment limits are unchanged: these short screeners do not produce a calibrated overall IELTS band or establish persistent weaknesses.
