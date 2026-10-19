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
| practice-bank-01 | Reading R-013–R-018 (6 sets, 42 questions); Writing Task 2 W-010–W-015; Speaking S-010–S-018 (Parts 1–3) | Approved 2026-10-19 on the owner's instruction (see migration 20261019120000) |
| practice-bank-02 | Listening L-014–L-019 (6 sets, 36 questions, Parts 1–4) with recordings | Installed 2026-10-19; pending review — every recording must be played in full by the approver |

**Listening sets** (Diagnostic Bible 6.1, 15E.2) also carry a `recording` (public `ielts-audio` URL, SHA-256, duration)
and speaker `lines`, which become the private transcript. The contract requires every evidence quote to appear in the
transcript and at least one distractor-resistance item per set. Recordings are produced from the same lines (Runway
eleven_v4: dialogue mode for conversations, one voice for monologues; instructions by Tom) and assembled as copyright
notice → intro → 30 s reading time → listen cue → recording → end cue → 15 s checking time at −18 LUFS.
The approver must play each recording to the end in the review screen (skipping does not count); the database refuses
to approve a Listening set the deciding administrator has not heard, and AI cannot record that check.

**practice-bank-02 coverage** (primary constructs, 36 items): explicit detail 9, paraphrase recognition 6, sequencing 5,
distractor resistance 5, numerical information 4, speaker attitude 3, dates and times 2, speaker purpose 2. Most items
also carry a supporting construct (distractor resistance is a supporting construct on 9 more items).
