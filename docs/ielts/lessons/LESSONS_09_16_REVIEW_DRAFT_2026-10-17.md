# Lessons 09–16: private teacher-review drafts

Version 0.1.0 · 2026-10-17. Diagnostic Bible 1.10.0; Lessons Bible 1.1.0 (LB-02, LB-03, LB-04, LB-05, LB-06, LB-08, LB-09, LB-10, LB-11); Visual & UX Bible 1.1.0. Built with the [lesson factory](LESSON_FACTORY.md).

**State: draft, unreleased.** AI-authored. No human editorial, key, mapping, difficulty, originality or rights approval of lesson content has been recorded. Nothing is installed in the lesson library, registered as a catalogue task, assigned or visible to students.

## Lessons

| Code | Title | Source SHA-256 | Content |
|---|---|---|---|
| IELTS-09 | Reading headings, paragraph purpose and the writer's argument | `458717362a992e13e9f06fa5c1205dc5bf6258da126bf145d047795eb71f5fa9` | Matching headings for a six-paragraph argument (repair cafés), writer-purpose MCQs, distractor headings; fresh check: four-paragraph passage (night-time noise). |
| IELTS-10 | Listening Part 4: lecture notes and summaries | `dcd6b5f58f714cd2332d5a679d174e96ac688f7d0ca950b269a7c59520f3fbc9` | Part 4 lecture (design of queues), eight ONE WORD notes, signposts and word-type prediction, summary from notes; fresh check: lecture on bird navigation. Audio v1 produced. |
| IELTS-11 | Academic Writing Task 1: overviews and accurate comparisons | `5a0bf9777ef518b3670e8b2115a0876afd21b238eb1cbd7d52c381bc7dba0519` | Academic Task 1 with a rendered line graph (fictional data): significant features, three overviews compared, accurate/inaccurate statements, overview + body paragraph, timed 20-minute homework; fresh check: bar chart. |
| IELTS-12 | Speaking Part 2: planning and sustaining a long turn | `39cef252df2afad7e1ed44dd60ac9d984d28a478191108b1b1bf49cc2fb38778` | Speaking Part 2: three openings compared, preparation and recovery strategies, two cue cards with timed long turns and rounding-off questions; fresh check: new cue card. |
| IELTS-13 | Advanced TRUE/FALSE/NOT GIVEN and YES/NO/NOT GIVEN | `fa4fb41cb9720239d32693e4aac1e0754f1f9780c540cc0471cd30f3cd8dcfca` | YES/NO/NOT GIVEN on an opinion piece (handwriting), fact/concession/recommendation classification; fresh check: short opinion passage. |
| IELTS-14 | Listening Part 3: longer discussions, delayed answers and matching | `6984c6d37fc96d71bffe106339f3ae574b185139f4a74588521a956bf0e11da3` | Part 3 three-speaker tutorial with choose-TWO, matching decisions and late answers; fresh check: field-trip discussion. Audio v1 produced. |
| IELTS-15 | Writing Task 2: planning and writing a complete response under time | `20ca1097ae000cd2995b59a2ae2bd378edceda024199fce86837195b93778d47` | Task 2 complete response: plans compared, four problem types diagnosed, timed plan + introduction + body paragraph, feedback clinic on Lesson 7 essays, 40-minute homework; fresh check: full essay in a separate 40-minute block. |
| IELTS-16 | Speaking Part 3: abstract discussion and second progress review | `01b7066c0edc74da1f847fe77498afe7e8863b7a058dba65f826697d31b2c27a` | Speaking Part 3 (work and careers), qualification/evaluation/speculation language, second progress review conferences; fresh check: tourism questions. |

Every pack has A–D differentiation, a timed 60-minute plan with computed slide numbers, student workbook and homework without keys or scripts, private keys/scripts/models, a withheld fresh check, a planning and human-review record bound to the source hash, a motion-free editable PPTX with notes on every slide, offline HTML slides and a hash manifest. Lesson 16 includes the second progress review sheet (no bands or readiness labels).

## Factory changes in this batch

- Task 1 charts: figures are rendered from data in the lesson source into the workbook, keys and slides. The source contract checks that every data point quoted in an answer key matches the chart, and that every number in a model answer comes from the chart (or a declared calculation). Chart descriptions that state trends stay out of student files.
- Heading and purpose items name their paragraph; the contract checks the evidence comes from that paragraph.
- Standard IELTS rubric sentences are ignored when checking fresh-check overlap; short structural prompts ("Paragraph A") may repeat.
- Projected matching items keep their option list visible; long lists are split across slides rather than shrunk.

## Audio v1 for Lessons 10 and 14

Produced in the owner's Runway workspace with the same pipeline as Lesson 05 (examiner instruction voice, natural multi-speaker dialogue or a single lecturer voice, mixed accents, no effects). Production records: [lesson-10/AUDIO_PRODUCTION_v1.json](lesson-10/AUDIO_PRODUCTION_v1.json), [lesson-14/AUDIO_PRODUCTION_v1.json](lesson-14/AUDIO_PRODUCTION_v1.json).

| Recording | Length | Words/min (speech) | Measured pauses (s) | LUFS | True peak (dBFS) | SHA-256 |
|---|---|---|---|---|---|---|
| IELTS-10-L1 | 293 s | 143 | 30.14, 15.089 | -18.9 | -1.4 | `5438650ee5ca04816dd6c2a5da0d664d129e82f887819bda3d65421ead0aee10` |
| IELTS-10-C1 | 171 s | 141 | 30.147, 15.089 | -18.3 | -1.7 | `07957cc6da4fe2a22c3f5be4540545e3745edef16ef907e0e5b70dd238ac2737` |
| IELTS-14-L1 | 222 s | 165 | 30.14, 15.089 | -18.6 | -1.2 | `e043f4cad931ac60449388b06ec252247f8dc6a30bc7fba398423f262666b59e` |
| IELTS-14-C1 | 141 s | 167 | 30.141, 15.089 | -18.5 | -1.6 | `5b73b884545864b293eb07b22f1b025d6851a9e3c51dabb65fee0de9b25a1b2b` |

Owner listening review is pending for these four files. Binaries are not committed.

## Checks actually run (2026-10-17)

- Source contract: all twelve schema-2 sources pass (`npm run ielts:lessons:check`).
- `tests/ieltsLessonSourceContract.test.mjs`: all tests pass (one per source plus mutation tests).
- Pack validator: all twelve built packs (05–16) report zero errors.
- Visual inspection: every slide of Lessons 09, 10, 12, 13, 14, 15 and 16 rendered through LibreOffice and inspected; Lesson 11 chart slides and workbook pages inspected. Defects fixed during inspection: model text duplicated in a projected example, trend descriptions visible to students, matching option lists missing from projected slides, awkward "?: answers" titles, a hardcoded self-review title.

Not checked: Microsoft PowerPoint playback, physical printing, phone/tablet rendering, classroom delivery, projector legibility of charts.

## Open gates before release

1. Human review of each lesson's content, keys, models, mappings, difficulty, originality and (for Lessons 09, 10 and 13) factual accuracy of passages and lectures.
2. Owner listening approval of the four Lesson 10 and 14 recordings.
3. Teacher calibration on the public Writing and Speaking descriptors before using the Lesson 11, 12, 15 and 16 checklists.
4. Device, print, projector and PowerPoint acceptance (LB-08).
5. Installation through the existing scoped teacher-pack route; student tasks only through §15D/15E registration.

## Academic limits

Classroom tasks and fresh checks are observations, not bands. Items from one passage or recording are not independent longitudinal observations. Fresh checks are not automatically comparable with lesson work. The Lesson 16 review records evidence and missing evidence only and does not replace the governed monthly report.
