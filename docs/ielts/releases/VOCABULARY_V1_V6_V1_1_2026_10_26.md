# Vocabulary lessons V1-V6 v1.1.0: rebuilt to Band 6.5-7.5 level

**Release date:** 2026-10-26 (Asia/Bishkek). Supersedes v1.0.0 released the same day.

## Why

An external review of V6 v1.0.0 rated it 3.5/10 for challenging IELTS preparation: distractors were not real English
("lazy-ly", "sitting"), reading answers were near-copies of the passage, Part 3 was a series of two-minute speeches
with a phrase quota, there was no writing, and some pages held a single question. The same weaknesses were present in
V1-V5. The owner approved a full rebuild at 15:42: "yes, but this time be very accurate".

## What changed in every lesson

| Area | v1.0.0 | v1.1.0 |
|---|---|---|
| Multiple choice | 3 options, some non-words | 4 options, all real English, each wrong for a stated reason (meaning, grammar or collocation) |
| Reading (V1, V3, V5, V6) | 135-280 words, answers copied | 460-505 words; TRUE/FALSE/NOT GIVEN or YES/NO/NOT GIVEN, summary and purpose questions that paraphrase |
| Speaking (V4, V6) | timed monologues with "use at least N collocations" | interactive Part 3 with examiner follow-ups (Why? Would that be true for everyone? ...); V4 adds a listening model of a strong Part 3 exchange |
| Writing | V2-V3 only | every lesson has a written or interactive production task with an illustrative model (120-170 words) |
| Homework | gap-fill only | gap-fill plus open transfer tasks (paraphrase, rewrite, hedge, correct) with sample answers |
| Fresh checks | 3-option items | 4-option items and new unseen texts |
| Layout | single-question pages; cramped 4-column word bank | 3-column word bank; one-line options for short answers; workbook flows without stray pages |

## New permanent checks

- Lesson contract (`VOCABULARY_LEVEL`): four options per multiple choice; reading passages at least 450 words;
  question/evidence content-word overlap at most 0.6 per item and 0.35 on average; speaking blocks need at least three
  examiner follow-ups and may not set a phrase quota; extended production required; at least two open transfer tasks.
- `tests/ieltsVocabularyQuality.test.mjs`: every lower-case word students read must be in a 275,000-word English list
  (British and American spellings), except tasks explicitly marked `deliberate_errors` (spelling traps, error check);
  answer keys spread across A-D (no letter above 40%); v1.0.0 non-words cannot return.

## Accuracy review

Every item was reviewed by hand against its passage, script or chart. Corrections made during review included: a
distractor that is also idiomatic ("hit the right balance"), two options that could be argued correct ("extinct
species", "abolishing fees"), an inaccurate real-world fact (snow leopard status), an ambiguous NOT GIVEN (grants vs
donations), and explanations that misdescribed the passage. All chart-description options were checked against the
figure values; every number in a Task 1 model appears in its figure.

## Release

| Code | Bytes | Template SHA-256 |
|---|---:|---|
| IELTS-V1 | 1339190 | `b748725cbd343c4f8a08e84adc6b22be1bb190766f185629be5c3023d1516a7f` |
| IELTS-V2 | 2498636 | `9fffdd2f2374d794d7f20b65bcfc77b465d38c1e431b68de2466671c36756ccc` |
| IELTS-V3 | 1323205 | `c2811a13dbe8c7be5d3572166a42354034e42976f7c4604f6d28d8a04bb94a75` |
| IELTS-V4 | 1320612 | `b245b9ab5276a7bcaf28b10c22993a3614a3748ed22490d9336c96eadac5303d` |
| IELTS-V5 | 1345699 | `ecadce61cfdb9ddd7d3f1a3ff3e97e23c6a635adec3f20da60ddac8f20e1bd91` |
| IELTS-V6 | 1344706 | `918c63e9bb99bc4ead14620d16419ee4133bf0eb583a11008c08d4632440e785` |

Built with `--template`; `validate-lesson-pack.py` zero errors; branded with the production code for two schools with no
leftover placeholders. Uploaded through a one-time endpoint that verified each SHA-256, re-downloaded and verified,
then retired (HTTP 410, JWT required); capability destroyed. Access (live roles, rolled back): Silk Road IELTS lead
(Jess) and Testopia admin each see 41 packs with V1-V6 at 1.1.0; a student reads 0 objects.

## Not verified

Classroom trial; printing, projector and PowerPoint playback (LB-08). Teacher-read scripts (V4 listening model, V5
dictation) are read aloud; no recordings were produced.
