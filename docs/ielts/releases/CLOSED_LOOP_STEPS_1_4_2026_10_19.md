# Closed learning loop: steps 1–4 implementation record

**Date:** 2026-10-19 (Asia/Bishkek).

**Bibles:**
- Diagnostic Bible 2.0.0
- Lessons Bible 1.2.0
- Visual & UX Bible 1.2.0
- Course roadmap 1.1.0

**Authority:** the owner's instructions of 2026-10-19:
- "Update the Bibles now accordingly"
- "When you finish with the bibles, start working on all of it immediately"

## Live in the platform

| Step | Feature | Where teachers or students see it | Bible |
|---|---|---|---|
| 1 | **Construct mapping of practice.**<br>• IELTS supplement constructs `bh-ielts-core-v1`<br>• batch sample review (20% sample, minimum 3; named reviewer; exact batch SHA-256) | Content manager → **Construct mappings** | 7.5, 15E.2A |
| 2 | **`bh-learning-policy-v1` projection and weekly loop**<br>• shared targets<br>• needs a next step<br>• improving<br>• stuck after practice<br>• bank gaps<br>• "Prepare" pre-fills a targeted assignment | Batch → Assign practice → **This week** | 8A.4A, 15B.5 |
| 3 | **Mock results**<br>• paper or computer sittings<br>• marks per item; Writing and Speaking ratings<br>• **indicative band ranges** (`bh-indicative-v1`)<br>• mock evidence in the learning record<br>• **real IELTS results** with consent and verification | Batch → Assign practice → **Mock results** | 9.5, 12A, 18A |
| 4 | **AI first-pass Writing feedback** on practice<br>• per-criterion comments, exact quotes, one action, a one-band practice indication<br>• teacher confirmation | Student: after submitting Writing practice<br>Teacher: in the Writing review page | 10.5 |

**Database changes**, in `supabase/migrations/`:
- `20261019060000`
- `20261019061000`
- `20261019070000`
- `20261019070100`
- `20261019080000`
- `20261019090000`
- `20261019100000`

All were applied live.

**Edge function:** `ielts_practice_writing_feedback` (`verify_jwt`) was deployed. The deployed bundle imports the shared validator from a sibling file. The repository imports it from `../_shared/`.

## Waiting for the owner or a content administrator

Nothing below was approved on anyone's behalf.

1. **Approve the two construct-mapping batches**, under Content manager → Construct mappings:
   - 113 mappings for the 18 released catalogue materials;
   - 437 mappings for the 240 mock items.

   Until they are approved, matched practice uses only the mapped targeted tasks, and mock items do not feed the learning record. The ranges and raw scores still work.
2. **Release the targeted tasks** (L1–L4, R1–R2, W1–W2, S1–S2) through their existing originality and release review, so "Prepare" has more tasks to offer.
3. **Run M1 with one batch** and enter the marks. This is the first real loop.

## Verified

- **PGlite tests** against the real migrations:
  - 17 policy acceptance cases;
  - mock capture, ranges, exposure, history and outcomes;
  - practice feedback access and limits.
- **DOM tests:**
  - construct mapping;
  - this week;
  - mock capture;
  - official results;
  - practice feedback.
- **Live checks:**
  - non-admins are refused the mapping queue and decisions;
  - a stale batch SHA and a missing sample are refused;
  - the October batch shows real states for 4 students and "initial assessment needed" for 5;
  - the mock forms, ranges and outcomes RPCs answer as the programme lead.

## Not yet verified

- **A live call to the OpenAI model through the new function.** It needs a real student submission, and the pilot account was not used for it.
- **Browser and device screenshots of the new tabs.**
- **Calibration of `bh-indicative-v1`.** This needs verified official results (§18A).

## Next

- Grow the practice bank to at least 3 mapped tasks per targeted construct, with AI drafts going through batch review. Listening practice needs recordings; confirm the Runway budget first.
- Computer delivery of M1–M3 in Exam Mode, with keys on the server.
- Productive-skill observations (Writing and Speaking) in the learning record, from teacher-confirmed feedback.
- AI Speaking feedback from audio.
- Learner-language tags (§7.6), after review by a local teacher.
