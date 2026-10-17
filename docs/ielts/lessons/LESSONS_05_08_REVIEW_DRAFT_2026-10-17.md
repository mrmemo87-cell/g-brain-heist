# Lessons 05–08: private teacher-review drafts

Version 0.1.0 · 2026-10-17. Diagnostic Bible 1.10.0; Lessons Bible 1.1.0 (LB-02, LB-03, LB-04, LB-06, LB-08, LB-09, LB-10, LB-11); Visual & UX Bible 1.1.0. Built with the [lesson factory](LESSON_FACTORY.md).

**State: draft, unreleased.** AI-authored. No human editorial, key, mapping, difficulty, originality or rights approval has been recorded. Nothing is installed in the lesson library, registered as a catalogue task, assigned or visible to students. Packs were delivered privately to the owner for review only.

## Lessons

| Code | Title | Source SHA-256 | Content summary |
|---|---|---|---|
| IELTS-05 | Listening distractors and paraphrases | `feaac747738d8bae1e7f809cadf1bacf74abe975a7c738fd99ce07c5e7ca1356` | Live mini-model (corrections, rejected options, contrasting opinions); paraphrase matching; Recording 1 (Part 1-style form + MCQ, 6 items); Recording 2 (Part 3-style three-speaker discussion: Dr Price, Lena, Marco, MCQ + matching opinions, 4 items); error log. Fresh check: new 6-item recording script. |
| IELTS-06 | Reading for specific information | `9eaa52d7944c7812d5ac6a6ba4a2adf4b9c3cfaff9f690e8b23149aedd51d7d2` | Sixty-second scan; original ~560-word academic passage (urban heat and green roofs); matching information (5), sentence completion (4), matching features (3); word-match vs meaning-match analysis. Fresh check: new ~330-word passage (seed banks), 6 items. |
| IELTS-07 | Writing Task 2: positions and developed arguments | `95f286d390381887e6c8723eaf5d22206af0dcc6b98ff385d1186436992c3a66` | Rank four position statements; listed ideas vs developed argument; argument-chain items (4); independent 120–150-word body paragraph; four-criterion checklist; timed 40-minute homework essay with a 290-word illustrative model. Fresh check: new prompt, introduction + body paragraph in 25 minutes. |
| IELTS-08 | Speaking development and first progress review | `cf778059de494cb00504ae0200972cfcf1def59d41da1582ccb600e5c51e35e8` | Three Part 1 answers compared (minimal / memorised / developed); Part 1 pair rounds; development-move items (3); Part 3 group discussion with teacher as examiner; first progress review conferences with a per-learner evidence sheet (no bands). Fresh check: new Part 1 and Part 3 questions, individual and live. |

Each pack contains: start guide, student workbook and homework (no keys, scripts or models), teacher guide with stage-by-stage slide numbers and A–D differentiation, private keys/scripts/models, a withheld fresh check, a planning and human-review record bound to the source hash, a motion-free editable PPTX with speaker notes on every slide, offline HTML slides and a hash manifest.

## Checks actually run (2026-10-17)

- Source contract (`npm run ielts:lessons:check`): all four pass. Includes verbatim evidence for every listening and reading key, paragraph-located matching evidence, word limits, MCQ validity, 60-minute contiguous plans, question-before-reveal order, fresh-check isolation and audio blockers.
- `tests/ieltsLessonSourceContract.test.mjs`: 18 pass, 0 fail, including 12 mutation tests.
- Pack validator on all four built packs: 0 errors (student/teacher separation, withheld check isolation, PPTX/HTML/JSON parity, notes, no auto-advance or autoplay, manifest hashes).
- Visual inspection: every slide of all four decks rendered through LibreOffice and inspected; all workbook pages rendered and inspected for Lessons 05–07; teacher guide and key pages sampled for Lesson 05. Defects found and fixed during inspection: sparse one-block workbook pages, orphaned headings, unindented options, hardcoded workbook page numbers in stage text, dense model slides, a reference to a catch-up sheet not in the pack.

Not checked: Microsoft PowerPoint playback, physical printing, phones/tablets at 320/375/768/1440 px for the HTML slides, school-branded output with a real logo, classroom delivery.

## Open gates before any release

1. **Human review** of each lesson using the review record in its pack: editorial and instructions, every key and accepted answer, proposed mappings (draft focuses use Diagnostic Bible §7 construct names), difficulty for a B1-entry Academic group, originality against retained inventory, factual accuracy of the Lesson 06 passages, rights.
2. **Recordings for Lesson 05** (blocks release): each recording now carries its exact spoken instructions, segment order and a proposed voice plan, checked automatically against the existing production format (copyright notice first, 30-second reading silence, passage, 15-second response silence, a voice for every speaker). The Recording 2 student character was renamed from Tom to Marco so it cannot be confused with the existing instruction voice named Tom. Questions 9–10 depend on telling three speakers apart, so the reviewer must confirm the voices are clearly distinct. Then: IELTS-05-L1, IELTS-05-L2 and the withheld IELTS-05-C1 must be produced through the approved audio workflow with the spoken rights notice, measured 30-second reading and 15-second response intervals, clear natural voices and no added noise; then reviewed for sound, transcript fidelity and keys with exact delivered SHA-256 recorded (Diagnostic Bible 6.1, 6.1.1; LB-05).
3. **Teacher calibration** on the public Writing and Speaking descriptors before using the Lesson 07 and 08 checklists for feedback.
4. **Device, print and PowerPoint acceptance** per LB-08.
5. **Installation** into the teacher library only through the existing scoped template and release path used for Lessons 03–04; student tasks only through the §15D/15E registration and release route.

## Academic limits

Short classroom tasks and fresh checks are classroom observations, not bands. Items from one recording or passage are not independent longitudinal observations. A fresh check is not automatically comparable with lesson work. The Lesson 08 progress review records evidence and missing evidence only; it creates no readiness estimate and does not replace the governed monthly report.
