# Student Journey and saved checks — 2026-10-08

Contract: IELTS Diagnostic Bible **1.4.0**, especially sections 8A, 9–13 and 15A–15B. This release changes the presentation of existing evidence; it introduces no new assessment content, band conversion, learning-pattern threshold or student response mutation.

## Audit and resulting behaviour

The former student Journey read only legacy practice/review sources. Gulzada's three governed screeners and reviewed Speaking interview were therefore absent, despite being preserved in their canonical stores. The screener hub treated Speaking as a generic invitation, rather than a saved interview.

The hub now uses the same four skill cards on IELTS Home and the student Journey. Objective results show saved raw marks; productive tasks distinguish awaiting review from shared feedback. Each primary button opens the existing attempt or interview. Active work takes priority; further repeats are secondary and explicitly describe rehearsal rather than independent improvement. A pending objective score is unavailable evidence, never zero.

The Journey shows completed-check coverage separately from teacher-review coverage, one next action, named and dated teacher feedback, current practice, and a dated trail linking original work and reviews. Teacher input uses a star label, reviewer attribution and a rose panel. Exact published teacher wording is retained; the UI does not silently rewrite it with AI. Criteria remain task observations, not permanent student traits. Older completed practice, reviewed tasks and exam submissions remain accessible through expandable sections. A target band remains a goal rather than current attainment.

## Band eligibility and the next assessment step

The published Listening and Academic Reading forms contain 12 questions each and have no documented short-form band calibration. The Writing form contains one Task 2 essay, and the Speaking review stores teacher observations rather than a validated numeric readiness rating. Completing and reviewing all four therefore does not establish four eligible component band estimates or an overall band.

The student sees why an estimate is unavailable and what is needed next: fuller reviewed objective forms with validated score-to-band policies, appropriate Writing Task 1 and Task 2 evidence, and qualified audio-based Speaking ratings. Any future estimate must retain scope, provenance and confidence. No percentage ladder or invented provisional average is introduced.

Official reference checked: https://ielts.org/take-a-test/your-results/ielts-scoring-in-detail (2026-10-08). Official Listening and Reading use 40 questions and version-dependent conversions; Writing uses both tasks with greater weight for Task 2; overall scoring averages four component bands. This official format does not validate a conversion of these short screeners.

## Data, access and concurrency impact

`rpc_ielts_starting_point_summary()` is a read-only, stable self projection without a student-ID argument. It checks current student eligibility, invokes existing release/entitlement predicates and scopes every selected original source to the authenticated user. Explicit grants deny anonymous execution. Private source tables remain inaccessible to browser roles; a fixed empty search path and fully qualified relations protect the privileged projection.

Only bounded summary fields reach the browser: catalog entries, latest trusted marks, work dates, original IDs and confirmed reviewer comments/next steps. Essays, prompts, answer keys, audio paths, AI drafts and evidence excerpts are not transferred on ordinary Journey navigation. The selected original result/review pages retain their own authorization. Response hashes bind Writing review summaries to the submitted essay; Speaking feedback requires a submitted session and teacher confirmation. An active Speaking session takes priority over historical sessions.

Home makes one summary request. Journey loads the existing practice Journey and the summary in parallel and passes the summary into the hub, avoiding duplicate hub requests. Per-attempt scoring/review reads use existing primary/unique indexes; Speaking selection/review uses existing student/date and session/date indexes. No polling, scoring, AI calls, answer-save changes or persistent browser cache were added.

This does not certify the Bible's 500-concurrent-student target. Staged hosted workload and device tests remain required before a larger capacity claim. Longitudinal recurrence, sustained improvement and persistent difficulty remain unavailable until approved policies and fresh comparable evidence exist.

## Verification and pilot evidence

Gulzada's existing identity, student role, non-banned status and programme eligibility were revalidated. A read under her authenticated database role returned all four canonical records and the two existing shared productive reviews. Existing Writing submission, Speaking session and four original audio clips were preserved; no retake, review rewrite, role promotion or answer reset was performed.

Automated coverage includes raw-score validation, false-band rejection, existing-attempt navigation, active-work priority, pending review, connection failure/retry, no duplicate summary requests, teacher attribution, matching original response hashes, confirmed-only reviews, anonymous/banned/non-student/revoked-access denial and self-only cross-school isolation. Database tests use synthetic records. UI integration tests render the actual React Journey through the real router with synthetic API responses; they are not human device acceptance or a signed-in browser test.

The cloud browser reached the production Journey sign-in screen. It had no Gulzada session; new phone/Macbook acceptance is not claimed. Local preview could not be reached from that remote browser. Authentication checks, DOM flow checks and source/build checks are recorded separately from that visual limitation.

Migration filename is the exact timestamp generated by connected migration history (`20261008034727`), rather than an invented local timestamp. The connected migration path avoided the prior CLI analytics approval rejection. Security advisors were checked before and after: no new anonymous grant, mutable search path, view or table-policy finding; the expected authenticated-definer inventory count increases by one for this explicitly self-scoped endpoint. Existing unrelated advisory findings are unchanged.

Validation: `npm run verify` passed after the native canvas test dependency was installed locally: 1,829 unit tests passed (two existing skips), seven DOM tests passed, and 31 database tests passed. Typecheck, production build, content-package/taxonomy checks, migration-security checks, protected-portal guard and diff whitespace checks passed. Exact-head CI and the production deployment are checked separately before publication is reported.
