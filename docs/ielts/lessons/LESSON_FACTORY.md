# IELTS lesson factory (source schema 2)

Version 0.2.0 · 2026-10-17. Diagnostic Bible 1.10.0; Lessons Bible 1.1.0; Visual & UX Bible 1.1.0.

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

Output: `01-START-HERE.html`; `Students/` (workbook, homework — no keys, scripts or models); `Teacher-private/` (guide with computed slide numbers, keys/scripts/models, withheld fresh check, planning and human-review record with the exact source SHA-256, motion-free editable PPTX with speaker notes, offline HTML slides, `slides.json`); `manifest.json` with per-file SHA-256; and a ZIP beside the output folder. Slide text is split rather than shrunk below 20 pt and never truncated.

The pack validator checks: manifest and source hashes; no transcript lines, listening evidence, key explanations, models or teaching comments in student PDFs; fresh-check text only in the withheld file; PPTX/HTML/`slides.json` slide parity; speaker notes on every slide; no automatic advance, animation timing or autoplay; question slides before reveals; start guide links every file.

## Known gaps (record, do not hide)

- One PPTX is produced, motion-free. LB-06 also lists an editable version with click-controlled transitions; that is not generated. The HTML keeps an optional finite fade with reduced-motion support.
- Rendering was inspected through LibreOffice. Microsoft PowerPoint playback, physical printing, phones/tablets and classroom audio remain separate acceptance checks (LB-08).
- School branding uses the explicit `--school`/`--logo` arguments. Server-authorized branding for released packs remains the existing all-school template route; this factory does not replace it.
- Recordings are never generated here. Listening lessons stay blocked until the approved audio workflow produces reviewed files with recorded hashes (Diagnostic Bible 6.1, 6.1.1; LB-05).
