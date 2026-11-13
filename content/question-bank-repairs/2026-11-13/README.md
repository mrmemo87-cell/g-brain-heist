# Question-bank stem-length repair, 13 November 2026

Teachers reported that many English grammar questions read like mini-lessons: a full rule sentence came before the sentence the student actually had to complete. Most of these long stems were introduced by the 12 October audit repair to stop a second option from also being correct (for example, a mixed conditional or the past simple).

This release keeps that protection but replaces each rule sentence with a short label of two to four words, such as "Third conditional:", "Choose a or an:", "Choose the time word:", "Past continuous:" or "Report it (with backshift):". It creates 139 immutable replacements of active, verified, global English questions. The average stem drops from about 22 to about 10 words.

Only `question_text` changes, plus `image_url` and `image_alt_text` for three beginner preposition items. Those items now show a picture (keys on a desk, pencils in a box, a chair next to a window) instead of a long description. The "Where ___ the bus stop?" item becomes "Where ___ the car stop?" so that "is" no longer fits. Options, keys, explanations, grade scope, curriculum mappings and registry taxonomy are unchanged and are carried over to each replacement.

Twelve flagged items were left unchanged because they are already short or the context is the question itself (possessives, meaning questions and the two causative items).

## Applied 13 November 2026

- `apply.sql` (99 questions, batch `main`) was applied to production. In the same transaction it checked that the questions' curriculum visibility was unchanged in 1,012 (school, year, grade, subject) combinations.
- Legacy *generic* curriculum objective mappings cannot be recreated, because the database now rejects them (`mapping_requires_specific_objective_use_new_curriculum_edition`). The release therefore carries the approved native registry taxonomy (the current authority) and any specific mappings. Visibility for each school, grade and subject was proven unchanged before commit.
- `apply-grade6.sql` (40 questions, batch `grade6-review`) is **not applied**. These Grade 6–7 items are visible to Grade 6 only through a legacy generic mapping. Their registry skills are classed as secondary (Grades 7+), so a replacement would drop out of Grade 6 classes. They need an owner decision: accept losing Grade 6 visibility, or map them to the new curriculum edition first.

## Release order and verification

1. Run `python3 content/question-bank-repairs/2026-11-13/validate.py`.
2. Deploy the three SVGs in `public/question-assets/2026-11-13/`. Confirm that each one returns HTTP 200 on www.brainsheist.com before the database step.
3. Apply `apply.sql` as the connected production database owner. The single transaction does the following:
   - checks the payload digest and each source question's exact text and key;
   - inserts replacements with recomputed verified hashes;
   - copies the approved curriculum items, objective mappings, registry taxonomy and diagnostic taxonomy;
   - writes `verified_question_content_repairs` receipts and retires the originals;
   - asserts that all 139 replacements are active, verified, analytics-eligible and registry-mapped, and that every assignment snapshot is byte-identical.

   Any failure rolls back everything.
4. Existing assignments keep their immutable snapshots. No answer, attempt, mark or saved score is touched. Rollback means reactivating the originals listed in the receipts and retiring the replacements.
