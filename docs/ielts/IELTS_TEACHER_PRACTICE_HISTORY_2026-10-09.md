# Teacher Practice desk — 2026-10-09

Bible used: **1.6.0**, especially 5.3, 8A, 12, 13, 15A and 15B.

## Behaviour

The programme's Practice section opens one history for targeted allocations and school assignment material/student rows. Teachers can search student, class or material and filter skill, assignment type and status. Results are server-paginated at 50 rows with deterministic ordering. Saved targeted work opens its exact allocation; school work opens the existing progress manager with that assignment selected. Separate buttons open targeted allocation and class assignment tools, loaded on demand.

Work status, assignment lifecycle and feedback status remain separate. A targeted submission is not shared feedback. A legacy school assignment completion is not proof that feedback was shared; its row directs the teacher to the existing practice-review workflow rather than inventing a review state. No marks or protected responses are read by this history. Earlier years and archived assignments remain searchable, explicitly as history rather than current work.

Material selection checks **exact type + material identifier**, not title similarity. Targeted tasks retain their immutable version; legacy school content has no verified version in this projection. These identities do not establish equivalence across catalogues or identify outside-platform exposure.

Recipient-scoped usage reads all retained matching records, not the first history page. Class counts concern current members' previous assigned work, including work assigned in earlier classes. The picker and selected-material summary show active, submitted and previously used material. Existing work can be opened. A guided repeat needs explicit acknowledgement; an already exposed independent targeted check remains blocked. A failed/incomplete usage response cannot appear as a zero-history result or enable assignment. Changing recipient/material invalidates the previous check and repeat acknowledgement.

## Authority and release

Read RPCs require the existing school IELTS management capability and a non-banned authenticated actor. Individual rows additionally enforce existing targeted/assignment authority. Private helper execution is revoked from client roles. Class and student recipient scope must belong to the requested school. No new direct table grants, shared feedback writes, scoring, band conversion, learning-pattern inference, task content, audio, entitlement or publication changes.

Targeted recipient identity now comes from the authorized task payload instead of a client-hardcoded account/name. This preserves the current named-student content release gate; it does not publish pilot material or pretend other students are eligible for those versions. The standing Gulzada pilot preference remains unchanged.

## Concurrency and limits

History returns at most 50 lightweight records; usage batches at most 50 material identities. Existing scoped indexes are supplemented for material/student lookup. Usage filters material and recipient inside the private projection. There is no polling, per-student detail fan-out, audio/essay download, AI call or student-save change. The history projection still needs representative hosted load measurement for a large school's accumulated assignment history. This release makes **no 500-student capacity claim** and does not replace Bible 13's staged tests.

Local verification: typecheck, production build, protected portal guard and migration security guard; focused real-SQL PGlite tests for scope, missing progress, submission/feedback separation, exact identity, archived history and exposure beyond page one; React DOM tests for filters/pagination, links, failed reads, active duplicate blocking, exposed fresh-check blocking and guided repeat confirmation. Wider IELTS/classroom suites and GitHub CI are recorded with the release.

Browser screenshot verification could not run locally: Chromium is absent and the browser download returned an invalid archive. DOM interaction tests are not a human device acceptance test. Check the live teacher view on phone and laptop after release.

## Rollback

The migration is additive/read-only except for adding stable metadata to the existing workspace response. Reverting the UI commit restores the earlier interface while preserving every allocation, submission and review. Leave historical data intact. The new read functions/indexes may remain inert; revoke their authenticated execution if operational rollback requires disabling reads.
