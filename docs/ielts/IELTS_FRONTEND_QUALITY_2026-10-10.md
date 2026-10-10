# IELTS frontend quality acceptance record — 10 October 2026

Status: implementation ready for review; browser acceptance pending. Base: `a37c312a92e9e85d258dc49a1d0af79ff7196e9c`. This record implements the supplied frontend audit and does not certify the whole IELTS product for production.

## Audit disposition

| Finding | Implemented behavior | Acceptance status |
| --- | --- | --- |
| F01 | Public skill descriptions use passive articles, without dead actions. | Source repaired; rendered QA pending. |
| F02 | Home and Prime share exact unfinished-task navigation; completed tracks open Journey. | DOM coverage; role/browser QA pending. |
| F03 | School assignments opens an overview; creation has class/instructions, materials and review steps. | DOM coverage; teacher usability QA pending. |
| F04 | Assignment-list class filtering is separate from creation recipients. | DOM coverage. |
| F05 | Detail selection survives list filters, including archived records; history preserves the assignment in the URL and Back/Forward. Older reads cannot overwrite newer detail. | DOM coverage. |
| F06 | Rapid duplicate clicks are blocked. Allocation failures retain the saved assignment and allow allocation retry using the original identity; saved drafts remain recoverable from the overview. | DOM coverage; hosted fault injection pending. |
| F07–F09 | Native semantic components replace legacy styling on school assignments, Results, Settings and Content; shared skill cards replace duplicate markup. | Partial migration; computed contrast and remaining screens pending. |
| F10 | School admin IELTS destinations wrap into a tablet/phone grid. | Portal guard passed; device QA pending. |
| F11 | Touched top-level IELTS components and styles use supported 400/500/600/700 weights. Infinite decorative hero motion removed. | Source repaired; nested/remaining surfaces require review. |
| F12 | Shared skill cards reduce duplication in Home and Prime. | Partial; conditional Home architecture needs role QA. |
| F13–F15 | Existing governed student navigation and distinct review/report responsibilities preserved. | No broad rename/consolidation; role-specific journey review pending. |
| F16 | Approved materials, historical assignments and honest empty/placeholder behavior preserved. | Existing programme/database regression coverage; live walkthrough pending. |
| F17 | Canonical design policy and token-reference metadata updated; deployment readiness lives in this record. | Documentation repaired. |

## Safeguards and limitations

No scoring, grading, publication, entitlement, RPC, RLS, migration or stored student evidence changes. No live assignment or student mutation was performed. Material provenance and intentional-repeat checks remain part of assignment review. Closing, archiving and restoring assignments require an accessible confirmation, preserve history, and report failed mutations inside the dialog. Restoring does not reopen submissions.

Creation and allocation remain separate backend calls. Allocation retry recovers a known saved identity; it is not a claim of server-side atomic creation or request idempotency. If the create response itself is lost, the UI tells the teacher to refresh and inspect the saved title before creating again. Multi-tab concurrent creation and production load capacity are not certified by this patch.

Compatibility theme overrides remain on unmigrated screens. Do not remove them without rendered role/state comparisons. No physical-device, microphone, Safari, payment, browser-zoom or computed contrast sign-off is inferred from jsdom.

## Validation

- SchoolAdminPortal integrity guard: 9 protected contracts passed; its component diff adds only one scoped navigation class.
- Typecheck passed; Vite production build passed. Existing bundle-size warning remains.
- Migration security scan passed: 382 files.
- Core TypeScript suite: 1,834 passed, 2 skipped, zero failed. This is the core phase, not a claim that the complete npm test command finished.
- Classroom database suite: 95 passed, zero failed.
- Focused DOM checks cover task links, locked/unavailable/completed cards, dialog keyboard/inert/focus behavior, assignment recovery, recipient/list filtering, archived selection, history navigation and material provenance.
- Programme DOM suite: 62 passed, zero failed/cancelled. Test harnesses explicitly unmount their React roots; the unrelated Quest fixture stubs decorative Lottie because jsdom has no canvas. Its assignment-loading and cancellation assertions are unchanged. An isolated browser Back/Forward check also passed.

## Required release evidence

Keep this change in draft until the Visual & UX Bible acceptance matrix is completed against this branch. Required widths: 320, 375, 390, 768, 1024 and 1440px, with 200% zoom and larger text. Record screenshots and observations for signed-out Home, entitled student Home/Prime/Journey, teacher Practice Desk/history/assignment creation/recovery, school admin navigation/Results/Settings and platform Content authoring. Exercise keyboard-only navigation, focus, errors, empty/loading states, lifecycle confirmation and mobile keyboard obstruction. Verify every intended action at the correct role and school scope.

Also complete regression walkthroughs for timed Reading/Listening, offline answer recovery, Writing save/feedback, Speaking microphone/recording recovery, review publication, entitlement and school isolation. Revalidate the governed pilot identity before any authorized live pilot. No live pilot was attempted for this change.

Acceptance authority: `IELTS_DIAGNOSTIC_BIBLE.md` and `IELTS_VISUAL_UX_BIBLE.md`. Builds and source review cannot substitute for their required browser/device evidence.


## Follow-up: screener presentation and A4 overview

The supplied desktop screenshots show a flat saved-result page, a teacher being sent to the student Journey, and an A4 overview with its confirmation footer on a second page. The result now groups the authoritative raw score, response coverage, next action and interpretation limits. Profile-based navigation sends students to Journey, allocated teachers to Programme student progress (with the authorized school preserved), other teachers to their teacher workspace, and school administrators to the governed admin progress destination. Missing or failed profile reads retain a safe IELTS landing link. Navigation does not grant access or alter the existing result RPC. Failed result reads can retry the same attempt, and integrity-review flags remain visible.

Overview-only print rules reduce empty spacing, keep readable 9.5pt body text, and align the confirmation and platform footer on the same row. Existing A4 sizing and 12mm margins remain. No report content is hidden, truncated or scaled into a fixed-height container; detailed records and unusually long overviews may still paginate to preserve every word. The requested standard overview targets one A4 page.

Diagnostic Bible used: 1.9.0. No scoring, band estimation, evidence, confidence, review or authorization changes. Programme DOM tests: 67 passed, zero failed. Local typecheck and production build hit a 60-second environment timeout without emitting code errors; full verification remains pending in GitHub CI. Screenshot inspection is not a rendered acceptance certificate: browser print pagination, 320/375/768/1440px layout, keyboard focus and authenticated teacher/student return paths still require exact-branch browser QA. This narrow follow-up is saved for review before production release.
