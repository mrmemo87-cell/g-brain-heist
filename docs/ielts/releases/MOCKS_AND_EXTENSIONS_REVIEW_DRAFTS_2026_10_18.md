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

__TABLE__

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
