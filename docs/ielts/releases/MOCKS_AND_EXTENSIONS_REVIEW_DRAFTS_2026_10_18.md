# Mock tests M1-M3 and extension lessons X1-X8: Silk Road review drafts (2026-10-18)

**Owner request (2026-10-18, after the course evaluation):** "Great, do that". The owner chose:

- three full mock tests as paper teacher packs;
- 8-10 optional extension lessons on task types the 24-lesson course does not cover directly. The approved 24-lesson
  course stays unchanged.

New AI-assisted content goes to the Silk Road review library first. It goes to all schools only after the owner approves
each exact version.

**Bibles:** Diagnostic 1.10.0, Lessons 1.1.0, Visual & UX 1.1.0.

## What was installed

These are school-scoped review drafts for Silk Road International School (`8eeecf5d-…`). Teachers download them only.
There is no student release, no assignment, and no change to scoring or evidence. Each object was re-downloaded after
upload and its SHA-256 checked.

| Code | Title | Version | Bytes | SHA-256 | Recordings |
|---|---|---|---|---|---|
| IELTS-M1 | Mock Test 1: full Academic IELTS test (paper-based) | 0.1.0 | 13,101,179 | `d4586b15b15dadeb…` | 1 |
| IELTS-M2 | Mock Test 2: full Academic IELTS test (paper-based) | 0.1.0 | 12,126,504 | `de11ca06764beacb…` | 1 |
| IELTS-M3 | Mock Test 3: full Academic IELTS test (paper-based) | 0.1.0 | 13,020,540 | `e54dc6c53b4a645c…` | 1 |
| IELTS-X1 | Reading: summary completion and sentence endings | 0.1.0 | 3,688,074 | `181ac793722f92e3…` | 0 |
| IELTS-X2 | Reading: matching features and short-answer questions | 0.1.0 | 3,434,282 | `2570f2211f5693af…` | 0 |
| IELTS-X3 | Reading: diagram labelling and flow-chart completion | 0.1.0 | 3,356,095 | `331c9d8c4c3b0cfb…` | 0 |
| IELTS-X4 | Listening: flow charts and 'choose TWO' questions | 0.1.0 | 8,678,209 | `c6881d492f1a9c8f…` | 2 |
| IELTS-X5 | Academic Writing Task 1: describing a process | 0.1.0 | 4,183,635 | `3d6f8c1e3465b9f0…` | 0 |
| IELTS-X6 | Academic Writing Task 1: comparing maps | 0.1.0 | 3,609,945 | `612ab88fd5173b55…` | 0 |
| IELTS-X7 | Academic Writing Task 1: pie charts and mixed visuals | 0.1.0 | 4,495,700 | `d12bbf9e9ab2d128…` | 0 |
| IELTS-X8 | Writing Task 2: problem-solution and two-part questions | 0.1.0 | 3,348,943 | `59575719be036697…` | 0 |

Access was checked as live database roles (in a transaction that was rolled back). The Silk Road programme lead sees exactly these 11 published drafts and can read the objects. Another school's administrator can read 0 Silk Road draft objects, and the default pilot student account (Gulzada) can read 0 draft objects. The upload went through a temporary endpoint that accepted only these exact SHA-256 values with a one-time capability. That endpoint now returns HTTP 410, and the capability has been destroyed; it was never committed.

**Branding:** school name and logo, as for the Lesson 05-24 review drafts.
**Recordings:** v1. The owner has not yet reviewed them by listening; each pack lists their status.

## Scoring and assessment impact

- The mocks report raw scores out of 40 for Listening and Reading, and criterion feedback for Writing and Speaking.
- No band is awarded or converted. Diagnostic Bible 2.2-2.3 and 16.6 apply, and the mock contract rejects
  band-conversion claims.
- Nothing feeds Journey, readiness, screeners or school reporting.

## Validation

- Source contracts:
  - 3 mocks pass (`mock-source-contract.mjs`);
  - 32 lesson sources pass, including X1-X8 (`lesson-source-contract.mjs`).
- Built-pack validator: all eight extension packs pass with no errors.
- `tests/ieltsMockSourceContract.test.mjs`: 10 pass.
- Related service and DOM tests: 77 pass.
- Typecheck and the SchoolAdminPortal guard pass.
- Visual checks of the papers, figures, flow charts, answer keys and a sample of slides were done on rendered pages.

## Not yet done (release gates)

1. Owner review of each pack: content, keys, models, figures and recordings. Record it with the Approve / Request
   changes controls in the review library.
2. Device, print and projector acceptance (LB-08).
3. For each approved version, the all-school release:
   - build a school-neutral template (`--template`);
   - register it in `private.ielts_teacher_pack_templates`.

   The lesson-code checks already accept X1-X8 and M1-M3.
4. The audio content is not checked automatically (no speech-to-text). Known differences between recording and
   transcript:
   - M2 Part 4 says "the two thousands" where the transcript reads "2000s".
