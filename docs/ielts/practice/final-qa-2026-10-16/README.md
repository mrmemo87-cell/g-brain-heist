# IELTS final QA preparation — revision 2026-10-16.1

**HELD. No student publication or new assignment eligibility.**

Contracts: Diagnostic Bible **1.10.0** (including §6.1 audio), Lessons Bible **1.0.0**, Visual & UX Bible **1.1.0**. No scoring, diagnostic calibration or band-estimation change. Screeners remain excluded.

The owner-supplied conditional editorial review applies to 2026-10-15.1. It is retained as review context, not recorded as independent human approval. This new immutable revision requires its own exact-version approval. All 25 original records and historical student work are preserved. The seven retirement/consolidation decisions are unchanged; ten previously released targeted tasks are unchanged.

## Targeted changes

- R-003: fictional-case notice outside the passage; Q5 now tests an inference supported by paragraph D.
- R-005 Q4: asks about drawing completion times without a conspicuous universal quantifier; Not Given remains supported.
- R-006 Q4: asks about pond water retention during the drainage trial; no duration is supplied, so Not Given.
- R-007 Q3–4: library-specific statements; Q3 remains Not Given.
- W-007: conclusion links concentrated home work with office collaboration and mentoring.
- All Writing models: teacher commentary organized around the four assessment criteria; no band guarantee or exclusive model answer. W-008 remains General Training Task 1.
- Writing charts: exact accessible descriptions and data tables; percentage axis 0–100; keyboard-accessible horizontal scrolling on phones.
- Speaking: actual-recording review, no pronunciation judgement from transcript alone, no whole-test band from a short task; Part 2 follow-ups explicitly follow the uninterrupted long turn.

## Verified technical evidence

- Six model counts rechecked: W-004 **288**, W-005 **295**, W-006 **173**, W-007 **272**, W-008 **179**, W-009 **174**. All exceed the relevant minimum. Counting method is recorded in each candidate.
- Three new review recordings produced from the unchanged approved scripts: L-005 **107.568 s**, L-006 **111.432 s**, L-010 **114.072 s**. Exact measured duration and SHA-256 are authoritative in each audio production record.
- Instruction voice differs from both dialogue voices. Copyright introduction precedes instructions. Actual 30-second and 15-second silence segments are inserted; encoded silence detection verifies both (speech tails can lengthen detected silence slightly).
- Encoded true peaks remain below 0 dBTP. Human audibility, pronunciation, naturalness, every spoken answer and recording rights remain unapproved.
- Actual review component rendered with repository IELTS styles at widths 320, 375, 768 and 1440. Both charts retain readable values through horizontal scrolling and show exact tables without document overflow. Browser automation does not establish physical-device acceptance or screen-reader acceptance.
- Private inventory shows latest versions once per legacy code; earlier immutable revisions remain retrievable for comparison. Existing unauthorized-access and source-freeze tests remain enforced.
- Typecheck, production build, full regression suite and migration security checks passed. Focused tests cover append-only revision history, held catalogue status, authorization, accessible chart markup and superseded-response handling.

## Listening answer formats

The existing practice matcher trims and ignores capitalization, compares numeric input as text and accepts arrays of alternatives. These candidates retain explicit time alternatives (6:15 / 6.15; 10:20 / 10.20; 9:45 / 9.45). No fuzzy matching or shared scoring-policy change is introduced. Integration of any future additional variants requires exact-version review before release.

## Outstanding checks — release remains blocked

1. Independent human editorial approval of each exact candidate/hash.
2. Originality, factual-source and reuse-rights verification, including audio-production rights.
3. Human listening against every script line and answer key; pace, pronunciation, intelligibility and speaker distinction.
4. Protected durable installation of approved recordings; no temporary generation URL or legacy audio substitution.
5. Actual device playback, interruption and resume acceptance, plus desktop/mobile and accessibility acceptance.
6. New governed **student-material** identities/display codes for rewritten replacements, with legacy lineage. Current `candidate_id` UUIDs identify private review versions only; legacy `material_id` and code remain source references.
7. Scoped pilot and exact-version publication controls. No general approval, publication or assignment action is included here.

The downloadable teacher-only review package contains an offline review page, exact candidate JSON, three MP3s, audio cue/provenance records and this checklist. Extract the ZIP and open `START-HERE.html`. It contains keys and original snapshots and must not be distributed as a student assignment.

## Installation verification

Applied migration `20261016045110_ielts_final_editorial_qa.sql` to the verified canonical project. Role-scoped inventory returns 25 codes (18 latest candidates and seven unchanged retirements), with zero legacy items ready to assign. Before/after checksums match for all original material tables, all 20 exam attempts and all ten released targeted tasks. No student scores or previous attempts were changed. The full main suite reported 1,875 tests with zero failures and two pre-existing skips; all programme, database, DOM and retention suites passed.

Offline desktop browser verification passed for all three packaged players: metadata load, playback progress, pause, seek and resume; autoplay is disabled. This does not approve human audio quality, protected in-app installation or physical devices. Rebuild the teacher-only offline page with `node scripts/build-ielts-final-review.mjs <directory-containing-the-three-exact-MP3s>`; the builder rejects mismatched audio hashes.
