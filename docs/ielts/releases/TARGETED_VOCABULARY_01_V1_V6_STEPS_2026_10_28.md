# Targeted Vocabulary 01: V1–V6 step by step (R-080 to R-115)

Released 2026-10-28 after owner approval ("Approved", 13:25 Asia/Bishkek). The owner reviewed every step, question and answer key in `IELTS_Vocabulary_V1_V6_steps_review.pdf` (PR #1739).

- **What:** 36 tasks. Each vocabulary lesson V1–V6 has five guided steps and one mixed check (step 6). Every step opens with LEARN FIRST and a worked example, and every answer has an explanation.
- **Filing:** the tasks are auto-marked, so they are filed as reading tasks with codes `bh-ielts-targeted-reading-r58-v1` to `r93-v1`. Every question is mapped to a vocabulary subskill.
- **Source:** `docs/ielts/practice/TARGETED_VOCABULARY_01.json` 0.1.0.

| Lesson | Codes | Material |
|---|---|---|
| V1 Paraphrase | R-080–R-085 | Repair cafés passage |
| V2 Trends | R-086–R-091 | Lesson charts written as data tables; the mixed check uses new museum data |
| V3 Task 2 words | R-092–R-097 | University fees passage |
| V4 Speaking | R-098–R-103 | Part 3 tourism transcript, as text |
| V5 Word forms and spelling | R-104–R-109 | Sports centre passage |
| V6 Collocations | R-110–R-115 | Fifteen-minute city passage |

## Install and verification

- **Install:** one insert-only migration per lesson, `20261028072745` to `20261028073731`.
- **Live check:** the md5 of every live row matches a local replay of the repo migrations (36/36).
- **Release:** migration `20261028073905` stores the fingerprints and records each task as fresh. Only sibling steps of the same lesson may match; any other match aborts the migration. No variant links are created. It then releases each exact version.
- **After release:** 36/36 are released, labelled "Originality reviewed" and allowed for practice.

This is targeted practice only: no bands and no calibrated equivalence.
