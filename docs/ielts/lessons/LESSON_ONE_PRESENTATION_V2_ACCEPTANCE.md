# Lesson 1 presentation 2.0.0: Bible acceptance

Date: 2026-10-13. Base: `e877c27d7ecf864e0865b3d8611875cc4dc7b2d8`.
Contracts: Lessons Bible **1.0.0**, Diagnostic Bible **1.9.0**, Visual & UX Bible **1.1.0**.

## Result

The presentation upgrade is implemented and ready for review. It is **not released** while the required browser/device and native PowerPoint playback checks remain incomplete. Lesson 1's existing production library remains available with its prior presentation.

The shared sequence has 34 editable slides: opening, two approved guided rounds, six question/answer pairs per round, reflection, goals, the governed Reading Screener, exit and follow-up. The animated PPTX has click-only 250 ms fades. A motion-free PPTX keeps every slide. Offline HTML has the same content, teacher notes, keyboard/slide controls, live position status, finite fades and reduced-motion support. Each format contains authorized guided-practice answers and is teacher-only before practice. Student documents retain their separation.

## Contract checks

| Contract                    | Evidence                                                                                                                                                | Status / limit                                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LB-01 school/access/privacy | Teacher RPC and database tests, denied/stale-school DOM checks, HTML/XML escaping and placeholder-only public template tests                            | Automated checks pass. Live authorized teacher RPC returned only L-003/L-004. No new access policy or schema change.                                     |
| LB-02 lesson completeness   | Existing 60-minute plan, preparation, workbook, keys and exit/follow-up retained                                                                        | Source inspection complete. Teacher must check actual screener duration before class. Future lessons remain unpublished.                                 |
| LB-03 teaching/reveals      | Every question precedes its authorized answer. Teacher commitment/source prompts and notes                                                              | Automated order/content checks pass. No invented item explanations or script excerpts.                                                                   |
| LB-04 consistency/motion    | XML ZIP integrity, 34-slide import, exact per-slide headline/body/stage parity, static export strips all transitions, DOM controls/reduced-motion tests | Automated checks pass. Native PowerPoint animation playback is **pending**.                                                                              |
| LB-04/08 visual fit         | All 34 populated native slide renders inspected with current authorized school and approved source content                                              | Current content fits. Broader long-school stress, mobile browser/zoom, projector and physical device acceptance are **pending**. No pixel-perfect claim. |
| LB-05 audio                 | Existing approved asset references/hashes retained. Complete-pack tests exercise matching bytes and fail-closed tampering                               | Hash/pack checks pass with synthetic bytes. No new live playback/download or classroom audio acceptance claimed. Recordings and scripts unchanged.       |
| LB-06 printing/downloads    | Workbook excludes keys/scripts, separate teacher exports, A4 print CSS, complete ZIP with animated/static decks and start instructions                  | Automated ZIP/privacy checks pass. Physical printing and printed-page visual acceptance **pending**. No automated duplex/copy or response-capture claim. |
| LB-07 evidence              | Actual Reading Screener and existing progress/assignment paths retained                                                                                 | No scoring, saved attempts, readiness estimates or source/exposure gates changed. No new student attempt created.                                        |
| LB-08 release               | Typecheck/build and guards, focused lesson and IELTS tests, database suite                                                                              | Review draft. Governing device release gates remain open.                                                                                                |
| LB-09 versioning            | Shared sequence builder, generic public PPTX, school/source/presentation/Bible versions in ZIP manifest                                                 | Reproducible builder committed. Source versions remain separate from visual presentation version.                                                        |

## Test evidence

- Focused lesson tests: **14 passed**. Expanded IELTS suite: **81 passed**. The IELTS suite was run serially after its parallel run did not complete in this environment.
- Classroom/database suite: **116 passed**.
- Typecheck and production build passed. Existing large-bundle warnings remain.
- SchoolAdminPortal integrity guard: **9 contracts passed**. Migration security guard: **386 migrations passed**. No protected portal or database migration changed.
- Full `npm test`: **1,849 passed, 1 failed, 2 skipped** at the initial unit stage. The scan recognition test could not load `canvas/build/Release/canvas.node`. Attempts to rebuild Canvas could not obtain usable headers/binaries. This is an unresolved environment check, not a green full-suite result. Later test groups were therefore run separately where relevant.
- Browser installation attempts returned truncated/corrupt archives. Required 375/768/1440 px browser screenshots and 320 px overflow/zoom acceptance remain open. DOM assertions and static slide renderings do not replace them.
- The production Supabase project identity and current teacher role/non-banned status were verified. The scoped teacher RPC was exercised in a read-only transaction and returned the approved two six-question materials. No live data mutation, student pilot submission, material publication or new audio asset occurred.

## Native transition reference

The builder uses PresentationML `p:transition`, `advClick`, `p:fade`, and the Office 2010+ `p14:dur` extension with markup compatibility declaration. Technical references: [Microsoft Transition](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.transition?view=openxml-3.0.1), [Microsoft transition duration](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.transition.duration?view=openxml-3.0.1). Structural tests do not establish playback in PowerPoint, Google Slides or another importer.
