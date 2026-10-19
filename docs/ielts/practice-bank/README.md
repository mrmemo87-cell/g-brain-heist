# IELTS practice bank

AI-drafted practice materials, released only through a recorded batch sample review (Diagnostic Bible 2.0.0
sections 7.5 and 15E.2A).

**Pipeline**
1. Write a batch file `batch-NN.json` (schema `bh-ielts-practice-bank/1`). Each Reading item, Writing prompt and
   Speaking task names its skill constructs from `constructs.json` (the live registry).
2. `node scripts/ielts/practice-bank-contract.mjs` must pass. It checks structure, answer keys, TFNG options, that
   fill-in answers and quoted evidence appear in the passage, word counts and constructs.
3. `python3 scripts/ielts/build-practice-bank-sql.py docs/ielts/practice-bank/batch-NN.json supabase/migrations/<ts>_ielts_practice_bank_batch_NN.sql`
   produces a migration that calls `private.ielts_install_practice_bank`. The materials are installed **unavailable**,
   with proposed construct mappings, in one pending batch.
4. A named content administrator opens **Content manager → Practice bank review**. They check a random sample (at
   least 20%, minimum 3, always including every originality-flagged item), reject anything wrong, and approve. The
   decision records one originality review per material and releases the rest to students.

**Batches**
| Batch | Contents | State |
|---|---|---|
| practice-bank-01 | Reading R-013–R-018 (6 sets, 42 questions); Writing Task 2 W-010–W-015; Speaking S-010–S-018 (Parts 1–3) | Installed 2026-10-19; pending review |

Listening practice needs recordings and is planned for a later batch (Runway budget to be confirmed with the owner).
