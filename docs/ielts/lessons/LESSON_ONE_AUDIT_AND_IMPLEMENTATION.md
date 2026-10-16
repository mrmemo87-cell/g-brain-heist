# IELTS Lesson 1: audit and implementation

Audited main: `68f36afce08e503d93605e3ab994a65ce5d46196`.
Contract: Diagnostic Bible **1.9.0**, Visual/UX Bible **1.1.0**, Themely Evidence Blue.
Audio contract: Diagnostic Bible sections **6.1–6.1.1**. No separate Audio Bible file was found in the current repository. These are the authoritative recorded production rules.

## Findings and decisions

| Finding                                                                                     | Implementation decision                                                                                                                                                               |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Programme already authorizes school staff and keeps four main tabs                          | Add Lessons as a Today teaching tool, with `programmeSection=lessons`. Preserve existing top navigation and back/forward.                                                             |
| Original downloaded lesson was specific to Sobhy/SRIS                                       | Fetch the selected authorized school's name/logo. Resources contain Brains Heist branding, with no default teacher/school identity.                                                   |
| Generic paper Reading was different from the real screener                                  | Use `/ielts/reading-screener` and the normal governed attempt/save/submit/result flow. Do not publish or copy its protected passages/keys into public files.                          |
| Existing L-003/L-004 are released guided tasks with approved recordings and teacher scripts | Reuse these two exact live versions. Do not create six new recordings, alter approved assets, expose L-002 independent-check answers or fabricate content approval.                   |
| Storage currently requires a student allocation even for teacher preparation                | Add narrow released-guided-track staff access, preserving assignment-bound student access. Exclude banned accounts and unauthorized schools.                                          |
| Targeted practice requires completed source evidence                                        | Keep assignment/source/exposure/review guards. Direct teachers to existing tools rather than silently assign practice to unassessed students.                                         |
| No current lesson pack export mechanism                                                     | Generate a school-specific ZIP containing editable PPTX, offline HTML presentation, printable workbook, teacher plan, scripts/keys, verified MP3s, audio player and version manifest. |

## Lesson contract: IELTS-01 / teaching version 1.0.0

Stable lesson identity is separate from L/R/W/S material codes, allocations and student attempts. Duration: 60 minutes. Two guided listening rounds, explanation and strategy, learner goals, the actual Reading Screener, and exit/next-step instructions. The original hook remains; the listening rounds now use six short-answer questions per approved task rather than the earlier invented MCQs.

Teacher resources derive from the same authorized payload and immutable approved task versions. The public PowerPoint template contains only instructional copy and placeholders. The browser fills school name and authorized guided-practice questions after teacher authorization. The initial presentation 1.0.0 omitted keys. Presentation 2.0.0 adds accepted answers on separate teacher-controlled reveal slides. Student workbooks and plans exclude accepted answers and scripts. Both presentations remain teacher-only and omit scripts. The dedicated teacher key file retains the approved scripts. Scripts are escaped as text; school logos require HTTPS. Downloaded teacher packs should remain private until keys/scripts are appropriate to share.

PowerPoint is editable and separate from the MP3s. HTML worksheets support browser Print / Save as PDF; direct pre-generated PDF exports are not implemented. School logos appear in printable resources where a safe logo URL exists; the editable PowerPoint carries school name with Brains Heist branding. Audio downloads use the existing private Storage bucket and verify the delivered SHA-256 before playback/export. No autoplay. Switching school/leaving the library clears audio and stale responses.

Students complete the real Reading Screener in their existing accounts. Those results remain in the existing evidence and Journey workflow. Classroom guided listening responses, intake and paper reflections are **not automatically captured** by this increment. They must not be shown as server-saved, independent evidence or improvement. A later governed lesson/session and paper-capture design is needed for that automation. Existing targeted assignment and review remain available once actual source prerequisites pass.

## Security and concurrency

One bounded lesson read returns only the two released guided materials under `can_manage_ielts_practice_school`; no global content directory or history scan. No new answer-save, scorer, publication, attempts, reward or AI path. One additive RPC plus an additive staff branch in the existing private audio policy helper. No student scores, forms, reviews, reports or approved audio objects are changed. Existing student allocation access remains intact.

Preparation expands permitted audio reads for these two reviewed tracks; affected teacher-download/cache and concurrent cold-start workloads need testing before a wider capacity claim. This work establishes no 500-user capacity evidence.

## Historical validation: presentation 1.0.0

- SchoolAdminPortal guard, migration-security guard and TypeScript passed.
- Production build passed.
- Full existing `npm test` passed: 1,856 unit tests, 2 existing skips; 67 IELTS DOM tests, 116 database tests, and remaining language/teacher/student suites passed.
- Seven added tests cover school-scoped teacher reads, banned/student/anonymous denial, released guided audio boundaries, retained student allocation access, school changes, download privacy, HTML escaping, offline navigation, and editable PowerPoint substitutions. They are included in the IELTS suite.
- PowerPoint template package/import/font/layout checks passed (22 slides). Representative template renderings inspected. Full populated-slide fit still requires acceptance with long school/material text.
- The first full test attempt failed because native Canvas was absent after dependency installation with scripts disabled. Rebuilding top-level Canvas restored the scanning test; the full suite then passed. No scanning code was changed.
- Browser installation returned truncated archives. Real 375/768/1440px rendered UI, download/playback on phone/MacBook and named-student end-to-end acceptance remain pending. DOM tests are not browser/device acceptance.
- Initial draft metadata was inspected read-only. Subsequently PR #1598 merged as `e877c27d7ecf864e0865b3d8611875cc4dc7b2d8`, the lesson migration was applied to canonical production, and deployment `dpl_42jsAvDeA5Sc5fy6jYWKJEcN9rNZ` reached READY. Read-only teacher RPC/audio-scope checks passed. No student attempt or score was changed.

The original lesson library is deployed. Browser/device acceptance remains incomplete. Do not claim pixel-perfect UI, automated paper capture or certified capacity.

## Next increments

1. Complete browser/device acceptance of the original lesson library and upgraded presentations.
2. Add governed classroom session participation/response capture without confusing guided rehearsal with independent evidence.
3. Add direct PDF exports and full school-logo embedding in PowerPoint.
4. Prepare and review Lesson 2 before listing it as available, then build the first-month sequence around actual four-skill evidence.
