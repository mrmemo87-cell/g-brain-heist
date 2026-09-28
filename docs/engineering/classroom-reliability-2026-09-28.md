# Classroom reliability repair — 28 September 2026

## Verification of the previous report

Audited main `fd1228985dfc7b6739290527072531103d12590c` and the existing production project `sozodkxwhubespiedgxm`.

| Finding | Independent verification |
| --- | --- |
| MCQ assignment persistence failure is swallowed | Confirmed in QuestView; the student could continue without a saved assignment answer. |
| MCQs execute practice writes before assignment writes | Confirmed. `record_question_attempt` updates a shared question row and a student reward row. This can amplify contention during synchronized classroom answers; it is not proof of the entire incident's root cause. |
| Finalization rejects missing answers | Confirmed in the live function (`MISMATCHED_QUESTION_TOTAL`). |
| Finalization cannot safely replay a lost successful response | Confirmed: completed status was rejected before checking an existing result. |
| Pending assignment RPC is slow | Live cumulative statistics: 969 calls, mean 581.27 ms, maximum 7,923.17 ms. |
| Assignment answer RPC is slow | Live cumulative statistics: 298 calls, mean 817.94 ms, maximum 7,455.84 ms. |
| Mission RPC is slow | Live cumulative statistics: 85 calls, mean 1,601.55 ms, maximum 6,495.79 ms. |
| Teacher dashboard fans out over every assignment | Confirmed, in batches of six; its shell also fetched the same summary independently. |
| Global entitlement hook does database-backed work on irrelevant routes | Confirmed in the live private function. |
| Student assignment composite access lacks an index | Confirmed; existing indexes cover only id, student_id and status. No duplicate assignment/student rows found. |
| Exactly 45 timeouts and their incident timestamps | **Not independently confirmed.** The logs API returned a backend error twice, including a minimal query. Historical counts in the previous chat remain unverified. |
| Thousands of students can use the platform concurrently | **Not established.** Cumulative query statistics and local tests cannot demonstrate production capacity. |

React state alone is not an explicit application-level mutual-exclusion guarantee. Normal discrete React events may flush promptly; the previous report overstated the certainty of a race from state alone. Explicit synchronous guards and browser burst tests now enforce the intended behavior regardless.

## Changes

- All assignment question types use one authoritative server-graded answer RPC. MCQs no longer call the generic practice reward/attempt function. Snapshot points remain assignment marks; Commander progression is separate. Result triggers continue to ingest qualified verified evidence, preserving My Pool exclusion and School Verified/Brains Heist Verified provenance.
- Answers and finalization serialize on the current student's assignment rows, not a global classroom lock. An identical answer replay returns the existing grading state. A different answer cannot overwrite the first committed answer. Background short-answer review is preserved on replay.
- Finalization returns an existing committed result before deadline/status rejection. Scoring still comes from stored answers and snapshots, never client totals. Missing answers still fail closed.
- Immediate selection feedback, synchronous answer/Next/finalization locks, question-specific DOM keys and a 500 ms transition guard prevent rapid input from advancing twice or selecting the next answer in the same burst.
- Unacknowledged answers are stored under versioned student/assignment/question keys. They survive refresh, expire after seven days on access and are removed after acknowledgement. Storage failures are handled honestly: the interface says the answer is only on screen. This is a recovery draft, not a guarantee against device storage eviction.
- Transient answer/finalization failures receive at most two retries with exponential backoff and jitter. Permission, deadline and validation failures do not retry automatically. Final failure offers an explicit retry; already-saved conflicts can reload server progress.
- Pending assignment answer statistics are aggregated once per assignment, including pending review counts. Short-answer marking keys remain redacted.
- The existing teacher summary now includes at most eight follow-ups plus a total count, using actual assigned recipients and preserving its existing current-year/class/teaching-group scope. The dashboard's all-history per-assignment fan-out and shell's duplicate summary request are removed. Detailed Reports remain available on demand.
- Mission loading is deferred until the mission picker is needed. Assignment hydration no longer immediately asks the parent to repeat the same request.
- The entitlement hook classifies the request before superadmin/entitlement queries. Gated endpoints retain their decisions. V2 student assignment endpoints retain their existing membership-based access contract; this repair does not introduce a new plan restriction on already-assigned students.
- Added an assignment/student index for the answer/finalization lookup and row lock. No indexes or historical student records are deleted.

## Verification

- TypeScript and production build passed. Existing oversized chunk warnings remain, especially TeacherPortalShell; this repair does not resolve bundle size.
- Main suite: 1,653 passed, 2 skipped. Added behavior tests for synchronous guards, bounded retry, draft recovery, account separation and unavailable storage.
- Three SQL integration tests pass on isolated PGlite PostgreSQL using production column types and synthetic data. They execute the actual migration and RPCs: authoritative scoring, missing-answer rejection, immutable replay, replay after deadline/completion, short-answer review preservation, outsider/anonymous rejection, teacher scoping and entitlement fast-path/denial.
- SQL fixtures stub auth/entitlement helpers and omit production triggers/RLS. They verify function contracts, not full production authorization or multi-connection load.
- Real QuestView browser test at 390 px: 30-tap bursts create one write, failure blocks Next, refresh restores the draft, retry preserves selection, transition bursts do not answer the next question, and finalization runs once. Backend calls were simulated; no real student answers were submitted. The agent-browser daemon could not start here; equivalent Playwright checks ran with a locally available Chromium binary.
- Full verification includes school-admin integrity, question packages/taxonomy, migration security, typecheck, build, main tests, SQL tests and whitespace checks. One pre-existing report test expected two parallel payloads despite the current handler loading three; its contract was updated to include diagnostic intelligence.

## Release order and rollback

1. Apply `20260928053301_classroom_reliability.sql` to the existing project before releasing the frontend. API signatures remain compatible with older clients. Lock acquisition is bounded at three seconds during migration.
2. Recheck function definitions, EXECUTE grants, index validity and advisors; inspect a read-only query plan using the existing school data.
3. Release the frontend after CI; verify the hosting deployment is ready before claiming it is live.
4. Monitor answer/finalization errors, statement timeouts, p95/p99, database CPU/IO/locks and teacher-summary latency during a small supervised class.
5. If application rollback is needed, roll back the frontend first. Keep the idempotency fixes: reverting database behavior before the retrying frontend is removed would make retries unsafe. Database rollback requires restoring reviewed prior function definitions; do not delete saved answers/results. The additive index can remain.

No historical missing answers are fabricated or reconstructed from practice attempts. A practice attempt may not uniquely identify an assignment or the student's intended answer. A separate recovery pass should invite affected students to resume from server-saved progress.

## Capacity acceptance (not yet run)

`load-tests/classroom.js` is a **staging-only** k6 burst test and rejects this production project. Provide distinct test student tokens, fresh assignments and a teacher token through a private fixture outside git. Run 30, 100, 500 and 1,000 student stages separately with new fixtures. It exercises catalog loading, concurrent duplicate answer requests, resume counts, finalization replay and teacher summaries.

Targets are release gates, not measured results:

- Zero missing/overwritten answers, duplicate results, authorization regressions or `MISMATCHED_QUESTION_TOTAL` errors.
- Answer acknowledgement p95 < 500 ms, p99 < 1,500 ms in the measured region; catalog and teacher summary p95 < 1,500 ms.
- UI selection feedback < 100 ms, measured separately on school phones.
- Measure from Bishkek/classroom networks as well as the database region. The production project is in Singapore, so physical network latency remains relevant.
- Follow burst testing with sustained soak tests, expiry/re-auth, multi-tab, real offline/reconnect and existing full RLS/verified-evidence trigger tests.

No staging project or test-user cohort was available in this task. The load harness was syntax-checked, not executed. Do not run it against production or create paid infrastructure without authorization. Passing a 30-student class does not prove 1,000-student capacity.

Remaining performance work: profile `rpc_student_learning_catalog`, `rpc_quest_get_missions`, teacher roster and full result evidence-trigger plans under representative data; split the large teacher bundle; establish production latency/error alerts and size database compute/pooling using measured load. No compute-plan changes were made. “Always instant” is not a technically defensible guarantee; immediate UI response, durable saves and explicit measured service targets are the practical standard.
