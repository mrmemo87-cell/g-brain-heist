# Real-test level upgrade and vocabulary lessons: teacher release to every school

**Release date:** 2026-10-26 (Asia/Bishkek).

## Authority

The owner wrote on 2026-10-26 at 11:08 Asia/Bishkek: "I need to make sure all the IELTS materials (including the reading
that I checked was weak in the Mock tests) and the lessons to be at the level of a real IELTS test and checking all the
skills like a real IELTS test. There should also some Vocabulary lessons that really fit the IELTS in a very practical way
... Make the needed adjustments and improvements now; you have all my permissions, don't ask for any."

Each changed source carries an `approval_record` for its exact version; earlier approvals stay in
`previous_approval_record`. No in-platform review decision was entered on the owner's behalf.

## Audit findings

| Area | Finding | Action |
|---|---|---|
| Mock Reading (M1-M3) | Passages 718-832 words, 18-22 words per sentence, 14-21% long words; many questions reused the passage's wording; M1 Passage 2 attributed claims to real scientists | All nine passages and 120 questions rewritten |
| Mock Speaking (M3) | Part 1 repeated M1/M2 topics; Part 2 repeated M1's "skill" card | New Part 1-3 topics |
| Lesson 21 fresh Reading check | 434 words, B1 level, same teen-sleep topic as M1 | New full-length Passage 1 (urban trees) |
| Lesson 18 timed Reading | Summary questions copied the passage | Questions 10-13 paraphrased |
| Mock Listening, Writing | Within real-test specification (40 questions, four parts, 450-950 words per part; Task 1/2 types varied) | Unchanged; recordings unchanged |
| Vocabulary | No dedicated lessons | Six new lessons, IELTS-V1-V6 |

## New automatic level checks (mock contract)

Every mock Reading section must now meet: Passage 1/2/3 at least 750/820/880 words, at least 2,500 words in total, at
least 20 words per sentence, at least 18% words of 8+ letters, and paraphrased questions (no item may repeat more than
60% of its evidence's content words; passage average at most 35%). Rewritten mocks: 2,502-2,569 words; 24-30 words per
sentence; 22-31% long words; mean question/evidence overlap 0.02-0.11.

## Vocabulary lessons (optional, 60 minutes, word bank of 14 items each)

| Code | Title | Skill |
|---|---|---|
| IELTS-V1 | Paraphrase power for Reading and Listening | Reading, Listening |
| IELTS-V2 | Describing trends and comparisons for Writing Task 1 | Writing Task 1 |
| IELTS-V3 | Precise language for Writing Task 2 arguments | Writing Task 2 |
| IELTS-V4 | Natural, flexible language for Speaking | Speaking |
| IELTS-V5 | Word forms and spelling for completion answers | Listening, Reading |
| IELTS-V6 | Topic collocations for common IELTS themes | All skills |

Each has an opening challenge, word bank (workbook page and slides), controlled practice, a test-style task, a
productive task (writing or speaking with an illustrative model), homework and a withheld fresh check. They appear in a
new **Vocabulary lessons** tab in the teacher library. Lesson codes widened by migration `20261026053121`.

## What was released

Templates built with `--template`; all lesson packs passed `validate-lesson-pack.py` with zero errors. Mock and Lesson 21
recordings reused unchanged from the approved templates (SHA-256 verified against the production records). Uploaded
through a one-time endpoint that accepted only these paths and verified each body's SHA-256; storage sizes match the
registered sizes. Endpoint back to HTTP 410 with JWT required; capability destroyed, never committed.

| Code | Version | Bytes | Template SHA-256 |
|---|---|---:|---|
| IELTS-M1 | 1.1.0 | 13089022 | `efd30b266ca260c393b2440fb549dbf822e6e12e7c85353a76a26d5226bf7f82` |
| IELTS-M2 | 1.1.0 | 12114935 | `baae8728e5d1bae779691c4a8632cd271c0fe5d2e0e4cbe01be75a8b9d2a40d0` |
| IELTS-M3 | 1.1.0 | 13007966 | `7e0632c572f91a5a5be363a67bccc24bcbb448dd5384dc811b5763aef3c3311f` |
| IELTS-18 | 0.3.0 | 1206544 | `df62a3ebb15bd3943cf3e258e5587cfb59d770861edfd63fbf4faf937ed1edce` |
| IELTS-21 | 0.3.0 | 7228762 | `411319914bf68a7be58447885da896e1e74b35e0065da0d1bf3864a56ad17754` |
| IELTS-V1 | 1.0.0 | 1268844 | `7dfbd4c33e4624adda4a8a64fb880c02744e2a7af04b9b2f556d2cc45528e919` |
| IELTS-V2 | 1.0.0 | 2437368 | `6f9807154cfb2a530adc52c36fdac4d4aa5d35bddfca3063f69c23b5bd1e02b4` |
| IELTS-V3 | 1.0.0 | 1252942 | `2985ae026e73cf3243abb5c74a40a0236f38a97d142581a57c1a66348ca3a73b` |
| IELTS-V4 | 1.0.0 | 1249241 | `1b07860d51301a52fb5152e75c49f1365d8e65e9bded93a6c414c5931facac1c` |
| IELTS-V5 | 1.0.0 | 1273747 | `8c6bcc29bc4e67a29978b35762109e1b569a1e70febe1fe30be0e16c2e711bf9` |
| IELTS-V6 | 1.0.0 | 1244474 | `db340e6ead9b2e74ac61387cdba4219c5ad906effe516bd674859fb4aaabafba` |

## Verification

- Contracts: all 38 lesson sources and 3 mocks pass; IELTS programme tests 337/337, teacher-pack tests 25/25, typecheck clean.
- Branding: the production branding code branded all 11 templates for a school with a logo and one without, with no
  unbranded placeholders.
- Access (live roles, rolled back): the Silk Road IELTS programme lead and the Testopia school admin each see 41 packs,
  including V1-V6 and the new versions; a student reads 0 objects.

## Not verified

- Human editorial and classroom review of the rewritten passages and new lessons.
- Printing, projector and PowerPoint playback (LB-08).
- The new vocabulary lessons' teacher-read scripts (V5) are read aloud by the teacher; no recordings were produced.
