# Lesson pack layout rebuild — all 38 lessons (2026-10-29)

**Owner request (13:56 Asia/Bishkek):** slides showed questions one by one on separate slides; layout unclear; distracting
extra text; workbook page order (Lesson 7); the teacher dashboard should categorise lessons and steps for assignment.
**Owner approval:** 14:44 ("approved") after the before/after review; switch-over instruction 15:03 ("go").

## What changed
- **Slides (HTML and both PowerPoint decks):** each question set shows in full on one slide, in two columns where
  there is room; it is split only when text would fall below 18 pt. No per-question click builds. Answer keys appear
  with one click (number, answer, proof); explanations moved to the speaker notes. Option lists only beside the
  questions that use them; figures beside every question slide. Recording status line removed from slides.
- **Workbook:** shaded task headings, bold instructions, answer boxes; heading, instructions and first question kept
  together; admin lines removed; support hints moved to the teacher key.
- **Validator:** new check that no task heading is separated from its task on student pages.
- **Teacher dashboard (targeted practice):** choose skill → lesson or series → step in teaching order; question-type
  pairs grouped; full list still available.

## Release
- Same lesson content and versions: each template rebuilt from the lesson.json whose SHA-256 matches the released
  template's manifest, with the exact recordings taken from the released template (SHA-256 checked; file sets identical).
- All 38 validated (zero errors), no slide overflow (HTML and PowerPoint), branded with the production code.
- Uploaded via a one-time endpoint limited to exact paths, sizes and SHA-256 (now retired, HTTP 410); swap migration
  `20261029090624_ielts_lesson_templates_layout_rebuild.sql` changed each row only from its exact previous template.
- Mock tests M1–M3 unchanged (separate builder).
