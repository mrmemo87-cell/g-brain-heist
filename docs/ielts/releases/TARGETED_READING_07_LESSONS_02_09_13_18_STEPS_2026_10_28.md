# Lessons 2, 9, 13 and 18 step by step: release record (2026-10-28)

**Owner approval:** "Approved", 2026-10-28 09:38 (Asia/Bishkek), after reviewing every step, question and answer key in
`IELTS_Lessons_2_9_13_18_steps_review.pdf` (PR #1736).

| Lesson | Codes | Display codes |
|---|---|---|
| 2 · TRUE/FALSE/NOT GIVEN | `bh-ielts-targeted-reading-r34-v1` to `r39-v1` | R-056 to R-061 |
| 9 · Headings and the writer's argument | `r40-v1` to `r45-v1` | R-062 to R-067 |
| 13 · YES/NO/NOT GIVEN | `r46-v1` to `r51-v1` | R-068 to R-073 |
| 18 · One passage under time | `r52-v1` to `r57-v1` | R-074 to R-079 |

Steps 1–5 of each lesson are guided practice; step 6 is an independent check.

## What was applied

1. **Install**, as migrations `20261028034115`, `20261028034345`, `20261028034550` and `20261028034754`. These are insert-only and keep review on.
   - All 24 stored rows match the approved source exactly. This was checked by an md5 of every field, compared with a local replay of the migrations.
2. **Originality and release**, as migration `20261028035023`:
   - Each task's fingerprint is stored.
   - Each task is recorded as *fresh*. The automated comparison matches only that lesson's sibling steps on the same passage; any other match would have aborted the migration.
   - No variant links are created, so each lesson's mixed check can still be assigned after its guided steps.
   - The exact versions are released to all eligible students.
3. **Checks after release**: 24 of 24 are released, labelled "Originality reviewed", and allowed as practice. The batch Targeted practice list now has 75 tasks.

Source: `docs/ielts/practice/TARGETED_READING_07.json`. Contract: `tests/ieltsTargetedReading07Contract.test.mjs`.
Practice only: no bands and no calibrated equivalence. School, entitlement, source-evidence and repeat-exposure checks remain.
