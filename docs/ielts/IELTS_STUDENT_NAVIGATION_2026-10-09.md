# IELTS student navigation and scoped loading

Contract: IELTS Diagnostic Bible 1.6.0. This is a navigation and delivery change; no new questions, audio, scores, band estimates, taxonomy mappings, eligibility or academic-history changes.

## Problem and resulting flow

The new targeted-task allocations and older multi-item practice assignments use different governed systems. The old home linked only to the latter, while the targeted link was below several Journey sections. A student could therefore have assigned tasks while seeing an empty “Assigned Practice” page.

School students now see Screeners, Targeted Practice, My Journey and School Assignments as four consistent navigation destinations. A targeted section near the top of the workspace and Journey shows actual allocated tasks, with direct Start, Continue, saved-work and teacher-feedback actions. Closed work stays labelled closed. The older page is labelled School Assignments and explains the distinction, including a direct link to targeted work in its empty state.

## Loading boundaries

After the existing authenticated identity and school-capability checks, school students enter the lightweight workspace directly. It does not fetch the independent/Prime billing summary, effective tier, all four content catalogues, completed-content histories or extra-practice settings to show the school workspace. The authoritative starting-point summary and bounded targeted workspace load independently. Either section can fail without replacing the other or hiding navigation. No audio download occurs in the list. The existing optional/Prime practice catalogue is retained behind “Explore other practice tools” and loads only when requested, with its original extra-practice and tier restrictions. Existing route and RPC permissions remain authoritative.

The Journey’s optional Prime tier lookup happens after saved evidence has rendered. The staff programme component is lazy loaded. School assignment detail progress loads only when a student expands a set, removing one progress request per row on initial entry. No unbounded polling or new database queries were introduced.

## Validation and limits

DOM regressions exercise slow screeners, real target navigation, completed feedback, closed work, section failure/retry, empty assignment navigation and fail-closed school capability. Existing Journey, task save/recovery, teacher review and scoring tests remain applicable. Build/typecheck and CI provide code validation; this change does not assert a production latency measurement or a 500-student capacity test. Gulzada’s phone/Mac acceptance is still a human delivery check; existing work is preserved.
