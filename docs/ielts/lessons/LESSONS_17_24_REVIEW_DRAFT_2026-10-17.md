# Lessons 17–24: private teacher-review drafts

Version 0.1.0 · 2026-10-17. Diagnostic Bible 1.10.0; Lessons Bible 1.1.0 (LB-02, LB-03, LB-04, LB-05, LB-06, LB-08, LB-09, LB-10, LB-11); Visual & UX Bible 1.1.0. Built with the [lesson factory](LESSON_FACTORY.md).

**State: draft, unreleased.** AI-authored. No human editorial, key, mapping, difficulty, originality or rights approval of lesson content has been recorded. Nothing is installed in the lesson library, registered as a catalogue task, assigned or visible to students.

## Lessons

| Code | Title | Source SHA-256 | Content |
|---|---|---|---|
| IELTS-17 | Timed Listening: a full Part 2 section, map labelling and error analysis | `2293707f9dfee0970c1917eede44a6ac061c4fe9242616249393f1b82a576b6a` | Direction-language warm-up; Part 2 talk (sports centre) played in two parts with plan labelling A–G and changes questions; answer grid; error analysis by trap type; fresh check: library introduction. Audio v1 produced. |
| IELTS-18 | Timed Academic Reading: one passage in twenty minutes | `503d3963970b869aabbbba51ed38791226322d7b6e132df11c99eb818c380e06` | Time-strategy contrast; seven-paragraph passage (canals) with paragraph information, TRUE/FALSE/NOT GIVEN and summary completion, 13 questions in 20 minutes with an answer grid; fresh check: lighthouse keepers. |
| IELTS-19 | Writing revision clinic: Task 1 tables and accuracy | `e4f24472da4c497e9c51a7195a04ae518019bedf4ceb7e940035e6073f9be006` | Revision versus rewording; error-family diagnosis; table-based overview paragraph (water use, fictional data) and timed Task 1 homework; fresh check: internet access table. |
| IELTS-20 | Speaking: a complete three-part interview and targeted repair | `fc90dac04c6a92fb5bf14c9cb626d996dc62dc094d17e96f1818eb5f9acd0eb7` | Feedback quality contrast; immediate reformulation; two full peer interviews (scripts A and B) with a peer feedback form (criterion, quote, next step); repair clinic; fresh check: individual interview, script C. |
| IELTS-21 | Fresh receptive-skill check: one Listening section and one Reading passage | `99608c054d55996cc1cf55315f87c6510b006370ef4145a58bd5e424ed891243` | Listening Part 1 (room booking, form completion, played in two parts) and Reading Passage 1 (teenage sleep: paragraph information, TFNG, MCQ), 23 answers on a grid under test-like conditions; delayed check: short passage on office plants. Audio v1 produced. |
| IELTS-22 | Fresh productive-skill evidence: a timed essay and a new long turn | `0d3435b4e9b535fa3a60c7ac1dcd2510b39222dd8a575242e58b4d797972204a` | What counts as fresh evidence; Task 2 question-type identification; observed 40-minute in-class essay (rural migration, two-part question); delayed check of Lesson 20 repairs through a new Part 2 card; fresh check: Task 1 bar chart (payment methods, fictional data). |
| IELTS-23 | Individual priorities from check evidence: targeted stations | `d5ae2ad2e7a66b99480a1c87d121eed2c1799e52d618f84544de8482065adc79` | Evidence-based priorities; four stations (Reading TFNG accuracy, essay sentence accuracy with paragraph rewrite, developed Part 3 answers, Listening repair with an already-answered approved recording); personal plan page; fresh check: YES/NO/NOT GIVEN (slow tourism). |
| IELTS-24 | Final course review and next learning plan | `6e78d812e1903f9d717512396f602740cac3278c4a65e36e0c42fa297c013724` | Honest progress statements; mixed strategy review across all four skills; long turn on a strategy learned; final self-review (Lessons 1–24) and next learning plan; four-week follow-up speaking check. |

Every pack has A–D differentiation, a timed 60-minute plan with computed slide numbers, student workbook and homework without keys or scripts, private keys/scripts/models, a withheld fresh or delayed check, a planning and human-review record bound to the source hash, a motion-free editable PPTX with notes on every slide, offline HTML slides and a hash manifest.

Continuation beyond Lesson 24 toward high Academic bands is planned in [ADVANCED_CONTINUATION.md](ADVANCED_CONTINUATION.md). That document is a plan; no advanced lessons exist yet.

## Factory changes in this batch

- Map and plan labelling: plans are drawn from data in the source (areas, lettered unknown places, corridors, compass). The contract checks that every answer is a lettered place, that each prompt names the place hidden at its letter, that letters are unique, and that every hidden place is mentioned in the script.
- Table visuals for Task 1, with the same model-number checks as charts (series names such as years count as figure data).
- Two-part recordings: a passage can be split at a transcript line with a 30-second mid-recording reading pause, as in the real test.
- Answer grids (Lessons 17, 18, 21), a peer feedback form (Lesson 20), a personal plan page (Lessons 23, 24), and in-class timed essays that stay in the workbook instead of the homework sheet (Lesson 22).
- Workbook layout: passage titles are not repeated when they match the block title; criterion checklists stay with their heading; paragraph tasks get fewer writing lines than full tasks; the self-review page comes before the plan page.
- New mutation tests: plan answers, plan prompts, plan letter uniqueness, invented numbers in table models, and band claims in the final review.

## Audio v1 for Lessons 17 and 21

Produced in the owner's Runway workspace with the Lesson 05 pipeline: examiner instruction voice (Tom), natural speaker voices with mixed accents, exact digital pauses, no effects. Lesson 17 part A was regenerated twice for pacing (first take about 195 words per minute) and then time-stretched by 6% to match part B; this is recorded in the production file. Production records: [lesson-17/AUDIO_PRODUCTION_v1.json](lesson-17/AUDIO_PRODUCTION_v1.json), [lesson-21/AUDIO_PRODUCTION_v1.json](lesson-21/AUDIO_PRODUCTION_v1.json).

| Recording | Length | Words/min (speech) | Measured pauses (s) | LUFS | True peak (dBFS) | SHA-256 |
|---|---|---|---|---|---|---|
| IELTS-17-L1 | 250 s | 176 | 30.14, 30.136, 15.089 | -18.3 | -1.6 | `82ea5fb8b064f5e43859784a4000a9284ef9ae05ccab4b483575954ce7aad298` |
| IELTS-17-C1 | 143 s | 166 | 30.142, 15.089 | -18.4 | -1.6 | `34fa4780a8e0afa0d9012e18a13c6aff3c26d7c742dd28ce492863265b622f57` |
| IELTS-21-L1 | 204 s | 171 | 30.138, 30.132, 15.089 | -18.4 | -1.5 | `56bb4b8c59e2b313ca798aec433ee80b02bfbf1ba1fb0d074fcbb4615708f4ed` |

No speech-recognition tool was available, so word accuracy against the script was not checked automatically. The owner listening review must confirm that every keyed answer is spoken exactly as scripted. Binaries are not committed.

## Checks actually run (2026-10-17)

- Source contract: all twenty schema-2 sources (05–24) pass.
- `tests/ieltsLessonSourceContract.test.mjs`: all tests pass (one per source plus mutation tests).
- Pack validator: all twenty built packs report zero errors.
- Visual inspection: student workbooks and homework sheets of Lessons 18–24 rendered and inspected; Lesson 17 plan, workbook and slides inspected during development; Lesson 23 slide sequence reviewed. Defects fixed: duplicated passage headings, a near-empty overflow page in Lesson 19, an orphaned checklist, an in-class essay overflowing its page, self-review and plan pages in the wrong order, predictable answer-letter patterns in Lessons 23 and 24, and a wrong lesson cross-reference in Lesson 24.

Not checked: Microsoft PowerPoint playback, physical printing, phone/tablet rendering, classroom delivery, projector legibility of the Lesson 17 plan and the Lesson 19 and 22 visuals.

## Open gates before release

1. Human review of each lesson's content, keys, models, mappings, difficulty, originality and factual accuracy of passages (Lessons 18, 21, 23).
2. Owner listening approval of the three Lesson 17 and 21 recordings.
3. Teacher calibration on the public Writing and Speaking descriptors before using the Lesson 19, 20, 22, 23 and 24 checklists and observations.
4. Confirmation of which earlier recordings are owner-approved before running the Lesson 23 Listening repair station.
5. Device, print, projector and PowerPoint acceptance (LB-08).
6. Installation through the existing scoped teacher-pack route; student tasks only through §15D/15E registration.

## Academic limits

Classroom tasks and fresh checks are observations, not bands. Lessons 21 and 22 produce fresh evidence under recorded conditions; they are not mock tests and not comparable with earlier work by default. Full mock sections are scheduled outside 60-minute lessons. The Lesson 24 review records evidence and missing evidence only, awards no band, readiness label or certificate of level, and does not replace the governed monthly report.
