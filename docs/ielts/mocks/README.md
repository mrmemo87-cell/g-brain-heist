# IELTS full mock tests (IELTS-M1..M3)

Three original, paper-based Academic IELTS mock tests, built as private teacher packs. Each one has all four skills:
Listening (40 questions, one continuous recording of about 21 minutes), Reading (3 passages, 40 questions), Writing
(Task 1 and Task 2) and Speaking (Parts 1-3).

- **Status:** owner approved and released to all schools as v1.0.0 on 2026-10-18 (see
  `docs/ielts/releases/MOCKS_AND_EXTENSIONS_ALL_SCHOOLS_2026_10_18.md`).
- **Scoring in the paper packs:** raw scores out of 40 for Listening and Reading, plus criterion feedback for Writing
  and Speaking. The packs print no band conversion.
- **From Diagnostic Bible 2.0.0:**
  - When a mock is delivered in the platform, or captured item by item from paper (section 12A), its results feed each
    student's learning record.
  - Eligible full sittings give an **indicative band range** under policy bh-indicative-v1 (section 9.5). It is always a
    range, always low confidence, and not an official result.
  - It is calibrated over time against real IELTS results (section 18A).
  - These platform features are not built yet.
- **Recordings:** produced with Runway (eleven_v4) and assembled with exact silences: 30 s reading time per half-part,
  45 s before Part 4, and 30 s checking time after each part. Production records are in each `AUDIO_PRODUCTION_v1.json`.
  The recordings were approved with the packs; device and classroom playback acceptance is pending (LB-08).

## Coverage of task types

| Mock | Listening | Reading | Writing |
|---|---|---|---|
| M1 | form; MCQ; matching; choose TWO; notes | TFNG; notes; headings; matching researchers; summary with box; YNNG; sentence endings; MCQ | Task 1 process; Task 2 opinion |
| M2 | form and notes; map labelling; MCQ; matching; notes | TFNG; table; matching information; choose TWO; short answers; YNNG; summary; MCQ | Task 1 maps; Task 2 problem-solution |
| M3 | notes; MCQ; matching; choose TWO; flow chart; sentence completion | diagram labelling; TFNG; headings; matching features; sentence completion; MCQ; YNNG; sentence endings | Task 1 pies and table; Task 2 two-part |

## Building

```
node scripts/ielts/mock-source-contract.mjs                      # all mocks
python3 scripts/ielts/build-mock-pack.py --source docs/ielts/mocks/mock-1/mock.json \
  --output out/m1 --school "School name" [--logo logo.png] [--template] \
  --audio IELTS-M1_Listening_v1.mp3 --audio-record docs/ielts/mocks/mock-1/AUDIO_PRODUCTION_v1.json
```

The pack contains the student papers and answer sheet; a teacher-private answer key with transcripts, Speaking
examiner script, feedback forms, administration guide and results record; the recording; and `Mock_Test_Control.html`,
which plays the recording with part markers and runs the transfer, Reading and Writing timers. Recordings are not
committed to the repository (MP3, 96 kbps mono, kept under the 20 MB pack limit); their SHA-256 values are in the
production records.

## Computer delivery (from 2026-11-16)

IELTS-M2 v1.1.0 is also delivered on screen at `/ielts/mocks` (Diagnostic Bible 2.1A, 5.1, 9.5, 12A), modelled on the
computer-delivered IELTS layout:

- **Listening:** the approved recording, played once (no pause or replay), then 2 minutes to check.
- **Reading:** split passage and questions, with highlighting.
- **Writing:** task and typing box, with a live word count.

The server owns timing, keys and marking:

- **Timing:** Listening `listen_end` + 120 s; Reading and Writing 3600 s each; 20 s network grace.
- **Marking:** one mark per question. Completion answers must be an accepted answer within the word limit, ignoring case, spacing and a final full stop. Choose TWO gives one mark per correct letter.

What the learner sees:

- **Indicative ranges** follow bh-indicative-v1 on a first, unseen attempt. A repeat is practice.
- **Writing** gets a range once a superadmin has marked all eight criteria at `/ielts/mocks/marking`.
- **Learning record:** item outcomes join it through the approved mock construct maps.

Build:

```
python3 scripts/ielts/build-mock-cbt.py --source docs/ielts/mocks/mock-2/mock.json \
  --audio-record docs/ielts/mocks/mock-2/AUDIO_PRODUCTION_v1.json --audio-url <governed public URL> \
  --listen-end 1231.6 --sample-end 4.7 --migration supabase/migrations/<timestamp>_ielts_mock_cbt_m2_content.sql
```

- **Recording:** stored at `ielts-audio/governed/mock-2/audio-v1/<sha256>.mp3`. It was copied from the v1.1.0 pack and its SHA-256 matched the production record.
- **Playback:** stops at 1231.6 s, before the paper-only closing line about the ten-minute transfer.
- **Release:** named-user pilot first (`release_scope = 'pilot'`). Opening it to everyone with course access (`full_access`) is an owner decision.
