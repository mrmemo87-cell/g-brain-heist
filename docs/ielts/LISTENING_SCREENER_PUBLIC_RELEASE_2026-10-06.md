# Listening Screener A public release evidence — 2026-10-06

Contract: IELTS Diagnostic Bible v1.2.0. Owner authorized publication for all eligible IELTS users after reporting satisfactory phone and MacBook testing in this conversation.

## Human delivery evidence

Owner reported authenticated testing with Gulzada: refreshing resumed the remaining time at 9:23 and preserved MCQ/writing responses; the initial audio restart issue was fixed in PR #1530. Subsequent interruption testing by cutting the internet resumed at the same audio position, preserved answers, and completed submission with 8/12, all 12 items answered and all 8 sampled skills represented. Owner then confirmed satisfaction on phone and MacBook and requested publication. Browser/version details were not supplied. This evidence is owner-reported, not an independently observed browser session.

Audio loading, delivery intervals, pause/resume, replay and completed persistence are supported by that completed Listening run and owner device acceptance. Backgrounding deliberately pauses audio; returning requires Play from the displayed saved position. Autoplay is never introduced.

## Automated and live verification

PR #1530 audio checkpoint tests cover refresh, delayed seek, storage failure and attempt/audio isolation. The governed database suite exercises entitlement, same-attempt start/resume without timer reset, versioned autosave restoration, release validation gates, submission replay, server scoring, protected content, own/class result boundaries and expiry. The public-eligibility regression checks denied discovery/start and continued access to an existing own result.

Production rollback verification replayed Gulzada’s latest submission with its existing idempotency key and confirmed the same submission ID and row count. The stored production result is server verified: 8/12 and 12 response records. No answers, content, grading or existing history were changed for release.

UX changes distinguish local device persistence from server confirmation, retain edits made during an in-flight save, retry pending sections on reconnect and periodic autosave, and remove duplicate generic interruption notices while retaining incident audit records and meaningful audio warnings.

Public eligibility delegates to the canonical IELTS programme access helper: school membership, school IELTS agreement and named student seats continue to apply; independent users follow the existing individual policy. Banned and anonymous users are excluded. Published content/audio hashes and release evidence gates remain enforced.

## Limits and next stage

This is a short uncalibrated Listening screener, not an IELTS band or full baseline. Repeating the same questions is practice and does not establish improvement. Phone/MacBook confirmation is owner-reported; session-expiry and simultaneous class-scale delivery are not claimed as human tested. Full multi-skill baseline and later school-scale launch require their own evidence and gates.
