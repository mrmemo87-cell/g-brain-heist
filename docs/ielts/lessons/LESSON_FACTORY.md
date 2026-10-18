# IELTS lesson factory (source schema 2)

Version 0.3.0 · 2026-10-18. Diagnostic Bible 1.10.0; Lessons Bible 1.1.0; Visual & UX Bible 1.1.0.

A reusable route from one reviewed `lesson.json` to a complete private teacher-review pack, replacing the one-off Lesson 2 builder for Lessons 05 onward. Lessons 01–04 keep their existing, separately approved builders and assets; nothing here changes them.

This factory prepares drafts. It does not install, register, assign or publish content, and it cannot record human approval (Lessons Bible LB-11).

## Files

| File | Purpose |
|---|---|
| `docs/ielts/lessons/lesson-NN/lesson.json` | The single source for a lesson: objectives, A–D differentiation, typed blocks (items, contrast, writing, speaking), timed stages, homework, exit ticket, withheld fresh check, delayed follow-up, mapping notes and release blockers. |
| `scripts/ielts/lesson-source-contract.mjs` | Source contract and automated key checks. Run `npm run ielts:lessons:check`. |
| `scripts/ielts/build-lesson-pack.py` | Builds the pack. Refuses to run if the source contract fails. |
| `scripts/ielts/validate-lesson-pack.py` | Checks a built pack. |
| `tests/ieltsLessonSourceContract.test.mjs` | Runs in `test:ielts:programme`; includes mutation tests proving each guard rejects a planted defect. |

## What the source contract enforces

- 60-minute plan with contiguous, complete stages; every block is taught; every question slide precedes its reveal (LB-02, LB-03).
- Academic route only; status stays a draft until a human approval record exists; Bible versions match the current Bible files.
- Four differentiation pathways (foundation, core, extension, high-band challenge) — teaching pathways, not bands.
- Answer keys: listening and reading evidence must be a verbatim quotation from the transcript or passage; paragraph-matching evidence must sit in the keyed paragraph; reading completion answers must be copied from the passage; word limits respected; MCQ and matching answers must be valid options.
- Writing: models labelled illustrative; Task 1 and Task 2 minimums (150/250) checked against models.
- Speaking: pronunciation judgments restricted to live hearing or audio.
- Visuals: line and bar charts, tables and plans are data in the source. For charts and tables the contract checks every quoted data point and every number in a model answer against the figure (series names such as years count as figure data; genuine calculations go in `model_derived_numbers`), and requires a "fictional data" note. Task 1 blocks must have a figure.
- Plans and maps (Listening labelling): areas, lettered unknown places, corridors and a compass are drawn from the source. Every answer must be a lettered place, each prompt must name the place hidden at its letter, letters must be unique, and every hidden place must be mentioned in the script.
- Recordings: ordered production segments (copyright notice first, 30-second reading silence, passage, 15-second response silence) and a voice for every speaker. A section can be played in two parts: a second `passage` segment with `from_line` follows a 30-second mid-recording reading silence. An audio blocker clears only when the status begins "Owner approved".
- Audio honesty: every transcript has a recording entry; any unapproved recording must appear in `release_blockers`.
- Withheld fresh check: present, labelled withheld, no repeated prompts, low content overlap with the lesson.
- No hardcoded school names, band claims or "official examiner" language; no workbook page numbers (layout decides pages).

Automated checks support but never replace editorial, key, mapping, difficulty, originality and rights review.

## Optional pack features

| Source field | Effect |
|---|---|
| `answer_grid: N` | Adds an N-row answer transfer grid to the workbook (timed Listening and Reading). |
| `feedback_form: true` | Adds a peer feedback form (round, criterion, quote, next step) for paired Speaking practice. Peer comments are practice notes, not scores. |
| `personal_plan: true` or a title | Adds a two-priority plan page (evidence, action, check). |
| `progress_review` | Adds the self-review page and the teacher's review sheet. |
| `in_class: true` on a Task 2 block | Keeps an observed, timed essay in the workbook instead of the homework sheet. |
| `homework: true` on a writing block | Moves the task to the homework sheet. |
| `in_workbook: false` on a block | Projected only; kept out of the workbook. |

## Build

Requires Python 3 with ReportLab, pypdf and python-pptx, DejaVu Sans (`fc-match`), and Node 22.

```
python3 scripts/ielts/build-lesson-pack.py --source docs/ielts/lessons/lesson-05/lesson.json \
  --output /absolute/private/IELTS-05 --school "Authorized school name" [--logo /path/logo.png] [--review-date "date and timezone"]
python3 scripts/ielts/validate-lesson-pack.py /absolute/private/IELTS-05
```

Output: `01-START-HERE.html`; `Students/` (workbook, homework — no keys, scripts or models); `Teacher-private/` (guide with computed slide numbers, keys/scripts/models, withheld fresh check, planning and human-review record with the exact source SHA-256, the classroom presentation `Lesson_NN_Slides.html`, an animated editable PPTX, a motion-free PPTX, `slides.json`, and `Audio/` when `--audio-dir` supplies produced recordings); `manifest.json` with per-file SHA-256; and a ZIP beside the output folder. Slide text is split rather than shrunk and never truncated.

## Classroom presentation (owner feedback, 2026-10-18)

The HTML presentation is designed to be the only thing on the classroom screen:

- Slides follow the workbook: every block slide carries a "Workbook · heading" label matching the workbook heading and numbering; stage slides list the workbook sections used and the stage time.
- Click by click: questions, examples and answers appear one at a time on the teacher's click (Space, arrow keys, clicker or mouse). Answers stay on separate reveal slides. 250 ms fades, reduced-motion respected, and a manual Motion switch.
- Recordings play from the listening slide with a large teacher-controlled player (play/pause, seek bar, time). One audio element per recording keeps playing across that recording's question slides and pauses when the teacher leaves them. Nothing plays or advances automatically.
- Stage timers count down only when the teacher presses Start.
- Option lists (headings, speakers, decisions, shared answer choices) stay beside the questions; reading passages show beside their questions; charts, tables and plans show beside the task.
- School name and logo on every slide and on the cover. Teacher notes (N), full screen (F), play/pause (P); controls appear at the bottom on hover.
- PowerPoint: an animated deck (click-triggered fades and transitions; the recording embedded once as audio with "play across slides" for its question slides) and a motion-free deck. PowerPoint playback itself has not been tested in Microsoft PowerPoint.

The pack validator checks: manifest and source hashes; no transcript lines, listening evidence, key explanations, models or teaching comments in student PDFs; fresh-check text only in the withheld file; PPTX/HTML/`slides.json` slide parity; speaker notes on every slide; no automatic advance, animation timing or autoplay; question slides before reveals; start guide links every file.

## Known gaps (record, do not hide)

- Animated and motion-free PPTX files are generated; the animated one has only been checked structurally and through LibreOffice rendering. Acceptance in Microsoft PowerPoint (builds, audio controls, play-across-slides) is still required (LB-04, LB-08).
- Rendering was inspected through LibreOffice. Microsoft PowerPoint playback, physical printing, phones/tablets and classroom audio remain separate acceptance checks (LB-08).
- School branding uses the explicit `--school`/`--logo` arguments. Server-authorized branding for released packs remains the existing all-school template route; this factory does not replace it.
- Recordings are never generated here; `--audio-dir` only copies produced files, and the manifest records each file's hash. Listening lessons stay blocked until the approved audio workflow produces reviewed files with recorded hashes (Diagnostic Bible 6.1, 6.1.1; LB-05).
