# Academic IELTS course foundation — implementation and acceptance

Date: 17 October 2026. Diagnostic Bible 1.11.0; Lessons Bible 1.2.0; Visual & UX Bible 1.1.0.

## Delivered scope

This is the first course-system foundation, not a claim that 24 teaching packs or a validated band model now exist.

- Academic-only 24-lesson metadata follows the roadmap. B1 describes the teaching entry point, never a band conversion. Planned materials remain visibly planned.
- Teacher workspace → Course batches → Course & coverage records a particular learner's coverage, missed teaching, catch-up and teacher-entered paper work. Archived batches are read-only.
- Paper Reading/Listening recording requires an existing authorized targeted allocation. The server marks against its immutable task keys and retains blanks, assistance, date, source hash and correction history. It never overwrites or completes an online attempt. Writing/Speaking retain the existing teacher/AI review workflow.
- My IELTS Journey shows coverage and paper task results separately from assessment and practice. Summaries exclude responses; explicit answer detail repeats self/staff/school authorization. The student trail uses a timestamp + ID cursor.
- Student progress → learner drawer → learning plan contains evidence-linked support suggestions and the teacher readiness desk. Suggestions match an answered mapped item to released guided practice. Teacher confirmation and the canonical allocator remain mandatory. They are not diagnoses or automatic assignments.
- Readiness decisions are append-only, source-bound, teacher-entered ranges, with separate explicit overall judgment, rationale, coverage limitations and next action. All four valid screeners and finalized productive reviews are required. Missing, blank, incompatible or changed evidence withholds a current range. No generic percentage conversion or silent average is introduced.
- Optional AI discussion drafts retain provider/model/prompt/source provenance and a decision link. Unsupported Reading/Listening and text-only Speaking ranges remain null; sampled Writing suggestions do not become a full-paper result. Generation cannot publish or approve.
- Lesson 1's title is shared across the plan/library/first slide/print output. Delivered PowerPoint and HTML use the light presentation contract. Normalization targets template title/footer shapes and preserves approved questions and school text.
- Lesson print exports use the existing booklet paginator and sheet planner. They retain school branding, deliberate section boundaries, question/answer blocks, page identity, printer-dialog guidance and offline operation. Logo failures are explicit. Printer hardware settings are not selected automatically.
- Native disclosure initialization is repaired in the shared component, teacher navigation and learner drawer; independent toggling remains tested.

## Validation actually performed

- Full `npm test`: 2,259 passed, two pre-existing skips, zero failures. This includes the legacy assignment/game suites. The final scoped changes were then rechecked with the suites below.
- `npm run test:ielts:course`: 20 passed, including executable Postgres/PGlite migrations, self/cross-school access, append-only correction, idempotent writes, paper marking, source qualification, stale estimates, suggestion SQL, UI actions, AI handler/validation and offline print structure.
- Lesson resources, Lesson 2 resources and PowerPoint suites: 15 passed, including student/key separation, exact source text retention, title parity and motion-free output.
- School portal guard, TypeScript, migration security guard, Vite production build and `git diff --check` passed. The database-heavy legacy suite now runs serially to keep test memory bounded. The lockfile and production dependencies are unchanged.
- Database integration tests run the new SQL against representative dependency fixtures. They do not certify the complete hosted schema, live roles, provider execution or production capacity.

## Deployment state and remaining release gates

The new migrations and `ielts_readiness_teacher_ai` function are prepared in source. They have NOT been applied/deployed to production. Existing student evidence, scores, approved content and recordings are unchanged.

Real-browser visual acceptance is blocked in this environment: both full Chromium and headless-shell archive URLs returned HTML/truncated non-ZIP responses. No browser screenshots, mobile/zoom sign-off, PowerPoint application playback or physical printing acceptance is claimed. DOM tests and XML validation do not replace these gates. Keep the PR draft until the relevant rendered checks are complete.

Before wider release:

1. Apply and inspect the migrations in an isolated hosted staging environment; verify real school/student/teacher permissions, source changes, retries and error recovery.
2. Deploy the AI function to staging and test the actual provider, unavailable/rate-limited states and provenance. No provider call was made using real student work during this implementation.
3. Complete the normal Jess/Gulzada pilot after revalidating identity and entitlement, without resetting work or promoting roles.
4. Inspect populated/empty/error/withheld/shared flows at 320/375/768/1440 px, keyboard, touch, reduced motion and zoom; inspect actual smart-print pages and delivered PowerPoint.
5. Rerun affected IELTS concurrency scenarios under Diagnostic Bible section 13 before claiming 500-user capacity. New projections remain outside answer-save transactions; no capacity claim follows from unit/integration tests.
6. Produce and submit Lessons 3–24, additional micro-skill support and fresh checks for the owner's exact-version editorial review in copyable text. Expand paper capture for lesson-local material only through governed identities; this version intentionally supports already allocated targeted objective tasks.
7. Extend the governed longitudinal record and approved comparability/change policies before enabling persistent difficulty, mastery, sustained improvement or calibrated automatic bands. Monthly report integration of new course records/readiness decisions requires a separately versioned snapshot extension; existing final reports remain intact.
