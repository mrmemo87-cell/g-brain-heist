# 0654 Physics reviewed-bank proposal

Status: **62 questions published under explicit owner release authorization.**

See `release-authorization.json` for the exact manifest, database release and
validation evidence. Independent Physics specialist sign-off is not claimed.
The original unsigned review manifest remains an audit artifact; future changed
content must pass the review/release process below. No school exam year was inferred.

The 90-item uploaded bank has been checked against Cambridge IGCSE Co-ordinated
Sciences (Double Award) 0654, **2025–2027, version 1**:
https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf

## Deliverables

- `source.csv`: uploaded question content, with Git-canonical LF line endings.
- `corrected-source.csv`: all 90 questions, with corrections to 26 questions.
- `corrections.json`: exact before/after changes. Answer letters are preserved.
- `review.csv`: one reviewable row per original ID, with syllabus reference,
  tier, proposed canonical skill/subskill/focus, internal process and external AO.
- `candidate-package.json`: 62 proposed aligned items: 42 Core, 20 Supplement.
- `held-questions.json`: 28 foundation/extension questions without an official
  0654 profile. No silent conversion to a different qualification or deletion.
- `registry-proposal.json`: six proposed additive nodes, plus focus proposals.
- `coverage.json`: item counts and gaps, including single-item focuses.
- `review-manifest.json`: exact-version checksums, explicitly unsigned.
- `reviewed-registry-release.sql`: separately gated, additive content release;
  it is not an automatic migration and does not publish questions.
- `readiness.sql`: read-only allocation/release/evidence checks.

Rebuild with `python content/physics-0654/build.py`. Rebuilding resets the unsigned
manifest and invalidates any earlier review signature. Generated files are reproducible.

## Assessment meaning

Keep these namespaces separate:

1. Stable BH skill and atomic subskill: longitudinal competency identity.
2. Evidence Focus: precise reusable diagnostic target.
3. BH-AO1–4: internal cognitive process.
4. Cambridge AO1/AO2: external 0654 assessment objective.
5. `BH-CIE0654-AO...` component IDs: **Brains Heist identifiers** for paraphrases
   of syllabus AO bullets, not official Cambridge sub-AO numbering.

One question has one primary diagnostic mapping. A correct whole-item response
cannot separately prove every intermediate calculation or diagnose the reason
for a wrong answer. Core items also apply to Extended; Supplement items use
Paper 2. These original questions are not Cambridge examination questions or
endorsed resources. No AO3 practical competence is claimed from MCQs.

The bank covers parts of P2, P5 and P6 only. It is not a complete Physics or
double-award diagnostic, is mostly knowledge-based, and has only 15 AO2 items.
There are 58 proposed aligned Evidence Focus targets across 62 items. Most targets
therefore need several additional independent questions before a useful
reassessment pool exists. Difficulty labels are editorial, not calibrated.

## Important deployment finding: school grade is not Cambridge stage

Live inspection on 2026-10-24 found one active Physics offering, in **Grade 9**, on
the generic International Academic Practice framework. Existing Physics verified
questions are eligible for Grades 11 or 12. The owner confirmed that the Grade 9 group studies **0654** during this review.
The exam year remains unconfirmed. The candidate now includes Grades 9–11 and
explicitly declares the upper-secondary programme phase. The importer validates
that override against the supported Physics programme/version and rejects it
for other programmes or grades below 9. It does not alter any global grade rule.

`physics_programme_offering_mappings` stores an explicit, reviewed programme,
source version and registry phase for one exact school subject offering. The
teacher Curriculum Intelligence view and Evidence Focus catalogue use that
context; unrelated offerings keep their existing grade-based behaviour.
`reviewed-offering-release.sql` activates one exact offering after programme and
exam-year confirmation. No offering is activated by the technical migration.

**The 2025–2027 alignment must not be activated for a 2028 examination cohort.**
If that is the intended exam year, review the next official syllabus first.

## Review and release sequence

1. Physics reviewer checks the corrected questions, every reference/tier/AO and
   proposed taxonomy against the exact uploaded content.
2. Confirm grade/programme eligibility and exam years. Resolve the offering activation above before
   claiming usability for the current live Physics offering.
3. Approve the exact manifest SHA-256, recording reviewer and timestamp. New
   nodes/focuses require human review under `docs/academic-skill-registry.md`.
4. Review/merge/deploy the programme-aware technical migration and teacher preview.
   The migration adds no content or official approval. It also adds a teacher-only
   AO breakdown report and immutable external-AO snapshots on future item evidence. Existing hashes and learner
   evidence are preserved.
5. In a transaction set `brains_heist.physics_review_authority` to the actual
   reviewer and `brains_heist.physics_review_manifest_sha256` to the checksum of
   `review-manifest.json`; run `reviewed-registry-release.sql`. Rehearse with
   rollback before applying. Existing nodes are not redefined or renamed. Then set
   `brains_heist.physics_offering_id` to the confirmed offering UUID and run
   `reviewed-offering-release.sql` for that exact offering only.
6. Create an approval JSON with `status: approved`, actual `reviewer`, ISO
   `reviewedAt`, `manifestSha256`, and the boolean confirmations
   `gradeEligibilityConfirmed`,
   `registryProposalApproved`, `contentAndAOReviewApproved` all true. This records
   actual review; automation must not fabricate the reviewer's identity.
7. Run `node scripts/import-physics-0654.mjs --approval=/path/to/signed-review.json`
   using service-role environment; default is the importer's validation-only mode.
   Add `--publish` only after review and the applicable pilot/release gates pass.
8. Use the standing named-user pilot account only after checking current identity,
   subject/programme enrolment and eligibility. Use the normal teacher/student
   flow with fresh test work; preserve prior attempts. Check question discovery,
   preview, assignment, answer saving, completion queue, registry ledger, Academic
   Profile and exact-focus intervention matching. Repetition/practice must not
   become fresh independent mastery evidence. Do not seed fake student outcomes.

## Existing bank taxonomy audit

Inspection found suspicious historical focus placement, including air resistance
under circuit relationships and circuit/sound focuses under optics. These need
a separate item-by-item review and append-only successor mappings. This proposal
does not rewrite past taxonomy/evidence or claim the existing Physics bank is
fully audited. Its own nodes/focuses are explicitly reviewed as a new release.

## Verification limits

`tests/physics0654Database.test.mjs` executes the actual new validator, governor
and atomic importer in PGlite with schema-shaped fixtures. Fixture hash functions
stand in for pgcrypto, and no live student results are written. It verifies
programme boundaries, malformed-field rejection, tier/AO constraints, review
gating, dry-run isolation, atomic failure and idempotent release. The real materializer and aggregate teacher report are also executed against
fixture assignments, covering frozen AO metadata, allocation checks and the
practice/repetition split. This does not substitute for a live browser pilot or
human content review.
