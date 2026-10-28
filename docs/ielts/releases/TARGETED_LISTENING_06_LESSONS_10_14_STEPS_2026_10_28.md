# Targeted Listening 06: Lessons 10 and 14 step by step (L-030 to L-041)

The owner approved these on 2026-10-28 at 16:06 (Asia/Bishkek), after reviewing `IELTS_Listening_10_14_steps_review.pdf` and the six audio files (PR #1741).

## What was installed

- **Tasks:** 12, codes `bh-ielts-targeted-listening-l15-v1` to `l26-v1`. Each lesson has five guided steps and a step 6 mixed check. Every step opens with LEARN FIRST and a worked example, and explains every answer. The transcript is shown only after submitting.
- **Source:** `docs/ielts/practice/TARGETED_LISTENING_06.json` 0.1.0.

## Audio

- **Files:** six, cut from the owner-approved lesson recordings `IELTS-10-L1_v2.mp3` and `IELTS-14-L1_v2.mp3`, with no new speech. For each lesson there is part A, part B, and the whole talk without the question cues. They are stored unchanged in the private `ielts-targeted-listening` bucket.
- **Upload:** a one-off function accepted only these six SHA-256 values, verified each file by downloading it again, and was then retired.
- **Per-task copies:** the task table requires a unique audio path for each task, so each task has its own copy (`…/<sha>/l<n>/<file>`), also verified by SHA-256.
- **Bucket limit:** raised from 5 MB to 8 MB (migration `20261028100633`) so the two whole-talk files could be stored without re-encoding.

## Install and verification

- **Install:** migrations `20261028101214`, `…101341`, `…101505`, `…101636`.
- **Live check:** all 12 live rows match a local replay of the repo migrations by md5.

## Originality and release (`20261028101942`)

- **Fresh and variant records:** steps that play the same recording form one family. The first step on each recording is fresh: L-030, L-032, L-033, L-036, L-038, L-039. Later steps on the same recording are variants, meaning repeat practice: L-031, L-034, L-035, L-037, L-040, L-041. Any other match would have aborted the migration.
- **Released:** the ten guided steps.
- **Not released:** the two step 6 mixed checks, **L-035 and L-041**. They replay a recording the student already heard in steps 4 and 5. The platform correctly refuses a variant as an independent check, so a true fresh check needs a recording the student has not heard. They stay installed but unassignable until a fresh-audio version (v2) is approved.

This is targeted practice only: no bands and no calibrated equivalence.
