# IELTS reliability release and 9 October 2026 test

Contract: IELTS Diagnostic Bible **1.4.0**, sections 13.1–13.3 and 19–21. No contract, form, scoring, taxonomy, entitlement, saved attempt or feedback changes.

## Changes

- Initial entry/refresh still loads the public form and saved drafts once. Routine checks use `rpc_ielts_exam_status`, selecting lifecycle metadata and active-form existence without selecting form/draft payloads.
- Status preserves the existing school agreement, self-service eligibility, latest-assignment, availability and expiry gates. Authenticated self-only access; anonymous execution denied; empty definer search path. A student's eligible active attempt receives a heartbeat at most once per 30 seconds. Teacher presence remains available without unchanged draft writes.
- Additive `(student_id, exam_event_id, created_at DESC, id DESC)` assignment index supports repeated attempts and deterministic latest selection. Existing correctness locks and submission idempotency remain.
- Hydration only queues device answers that differ from server drafts. Normal autosave sends dirty sections only. An acknowledgement cannot clear edits made while a save was pending.
- Saves recur after completion at 8–10 seconds; visible-page compact checks recur after completion at 10–12.5 seconds. Single-flight checks suppress overlaps. Hidden pages skip periodic status reads. Focus/reconnect checks receive 500–625 ms jitter. Automatic failures use exponential delay, bounded at 60–75 seconds. Explicit blur/section/submit saves retain their immediate behavior for changed answers.
- These changes reduce avoidable traffic; they are **not measured capacity evidence**. Inline objective scoring remains bounded by the existing short forms and must be measured during simultaneous submission testing.

## Tomorrow's owner test

Use Gulzada's existing account after verifying her school IELTS seat. Keep her earlier four results and reviews. Start a governed repeat only when fresh test answers are needed; it remains practice, not evidence of improvement.

1. Open IELTS from the normal student dashboard on phone and MacBook. Check saved results and available screeners.
2. Start a repeat. Enter answers, wait for “All answers saved”, refresh and resume. Confirm the answers and remaining time.
3. Type while offline. Keep the page open, reconnect and wait for acknowledgement. Refresh again only after the save succeeds. If offline until time expires, only previously server-saved answers can be scored; device changes cannot extend the deadline.
4. In Listening, pause/background and resume using the existing audio control. Confirm the recorded position. Browsers may require a tap to resume audio.
5. Submit once, then revisit the saved result. Confirm exactly one result. Have the selected IELTS teacher open the programme and check the correct student, review status and feedback.
6. Separately verify a student without a school-granted IELTS seat cannot start, and an eligible student can. Do not change roles or bypass access checks.

Record date, browser/device, attempt ID, screenshot of any error, and exact failing action. Never paste student essays or credentials into public logs. Stop a session if answers disappear, students see someone else's evidence, a submit produces contradictory results, or repeated failures persist. Keep open pages and local drafts; retry normal recovery, then check the same saved attempt. Do not reset/delete results or repeatedly create new attempts as a workaround.

## Staged capacity test — not yet executed

No isolated Brains Heist staging project was available on 8 October. No 30-, 100- or 500-user hosted IELTS load stage has passed. No supported concurrent-student count is inferred from unit tests, current row counts, connection limits or individual database timings.

`load-tests/ielts.js` is a staging-only k6 **API harness**, refusing the production project. Run **30 → 100 → 500**, as separate stages with fresh distinct authenticated students and governed assignments, stopping on any failed stage. It requires at least ten minutes of measured active time per student and a common submission barrier. Repeat the highest passing stage with new fixtures after recovery.

Secure fixture (outside git):

```json
{
  "environment": "staging", "projectRef": "STAGING_PROJECT_REF",
  "teacher": {"studentId": "TEACHER_AUTH_ID", "token": "JWT", "eventId": "AUTHORIZED_EVENT_ID"},
  "students": [{
    "studentId": "STUDENT_AUTH_ID", "token": "JWT",
    "eventId": "GOVERNED_EVENT_ID", "assignmentId": "FRESH_ASSIGNMENT_ID",
    "section": "writing", "idempotencyKey": "UNIQUE_PER_STUDENT_ATTEMPT",
    "edits": [{"essay": "Synthetic draft"}, {"essay": "Synthetic final response"}],
    "finalPayload": {"essay": "Synthetic final response"}
  }]
}
```

Provide exactly one student entry per VU; fresh non-started/empty assignments, correctly scoped teacher identity, sufficient event/attempt time, JWTs valid for the full run. Up to 60 staged response edits fit the ten-minute save cadence; use representative Listening/Reading answer changes and Writing drafts. Synthetic content must follow the same governed review/publication rules in staging. No production identity cloning. Load fixtures deliberately contain no answer keys.

```sh
k6 run -e SUPABASE_URL=https://STAGING_PROJECT_REF.supabase.co \
  -e SUPABASE_ANON_KEY=STAGING_ANON_KEY \
  -e IELTS_FIXTURE=/secure/fresh-fixtures.json -e STUDENTS=30 load-tests/ielts.js
```

Harness covers identity verification, fresh entry/start, changed saves and same-version retries, compact polls, full refresh/draft equality, concurrent scoped teacher monitoring, synchronized submission and idempotent replay, terminal status. It does not itself certify physical audio playback, mobile behavior, session refresh, network recovery, real media upload, AI review, cross-school denial, historical data scale or background queue drain.

Before execution, reproduce production schema/indexes/RLS/triggers, realistic historical data and deployment/provider limits. Record exact code/migration/content versions. Declare shared connection/worker budgets including unrelated cron workloads; inspect active/waiting connections, lock waits, CPU, storage/CDN and Data API/Auth errors throughout. The observed production `max_connections=60` is a database setting, not a browser count or an agreed allocation budget.

API thresholds: save p95 <500 ms and p99 <1500 ms; scoped status/resume/teacher reads p95 <1500 ms; zero evidence/idempotency/identity failures; transport error rate <0.1%. Proposed synchronized-submit budget: p95 <5 s, p99 <10 s. Declare and record browser/media budgets separately before the run: recommended initial targets first playable audio p95 <3 s, recovery to acknowledged save <30 s after connectivity is stable, session renewal success >99.9%, authorized Speaking upload p95 <15 s, background review drain <5 minutes after the burst. Verify these against school devices/network and actual provider configuration; a failed budget blocks progression.

Supplement each stage with real browser cohorts for media/refresh/reconnect/expiry/duplicate submission, separate coordinated Auth bursts/session-renewal tests, normal teacher work, Speaking uploads and background review load. Pause/buffer/incidents must be recorded; transcript-only results cannot prove pronunciation. Assert final objective marks and item responses against fixture expectations in trusted staging SQL and confirm one submission per attempt; inspect no cross-student/school access. Confirm queue/provider budget and drain behavior with real non-production review jobs.

Save each stage's k6 summary, exact elapsed measured time, unique users/attempts, cohort mix, browser/media results, database/provider monitoring, failed/interrupted stages, stop/recovery actions and fresh highest-stage rerun. Do not label k6 VUs “500 tested browsers”. The maximum launch scope remains unverified until the applicable complete stage passes.

## Verification recorded on 8 October

- `npm run verify` passed: protected school-admin guard, content validators, typecheck, migration security, production build, 1,832 passing compiled tests (2 existing skips), 15 DOM tests and 41 database tests. After adding two further recovery cases and renaming the migration to its live history version, the six targeted DOM/database cases and migration security guard passed again.
- Live migration `20261008113107_ielts_compact_delivery_status` applied to the verified existing g-brain-heist project. Authenticated-role checks for Gulzada's completed Listening/Reading/Writing returned metadata equal to full entry, with no form/draft fields. Her normal catalog remained available. Anonymous execution is denied; authenticated execution is granted; definer search path is empty.
- Gulzada remained an unbanned student in her original school; seven existing attempts retained. Before/after aggregate submission and governed evidence hashes matched. No new pilot attempt, score, form, review or exposure was created by verification.
- Database advisors ran before/after. Existing findings remain. The new authenticated definer endpoint appears in the generic [authenticated SECURITY DEFINER advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable); this access is intentional and tested as self-only/fail-closed. The new index is initially reported unused; check representative staging plans and real usage before changing it. No new anonymous-executable or mutable-search-path findings were introduced.
- k6 syntax and production/fixture guards checked locally. Hosted staged load, complete real-browser/media recovery and 500-user capacity remain untested. Existing nested canvas build incompatibility on local Node 24 did not prevent the completed DOM suite; no dependency version or lockfile changed.
