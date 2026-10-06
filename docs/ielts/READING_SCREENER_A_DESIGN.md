# Reading Screener A — review draft and implementation boundary

Contract: IELTS Diagnostic Bible **v1.2.0**. Audited main: `ac9fbdfb83d852a6605e3d7dcd4707a39fb5abb3`. Date: 2026-10-06. This is an original AI-assisted **unpublished** content/review draft, not approved assessment content or a launch.

## Proposed scope

- Academic-oriented Reading only, form proposal `BH-RS-A-1`, definition proposal `bh-reading-screener-a`, draft `0.1.0`.
- Two original educational case-study passages: 325 and 424 body words; scenarios are invented, not assertions about real projects.
- Twelve one-mark items: nine four-option MCQs plus three genuine TRUE/FALSE/NOT GIVEN items. MCQ keys are balanced 3/2/2/2; TFNG choices stay in their standard order.
- Proposed 20-minute delivery window, subject to human review and pilot completion-time evidence. It is not official IELTS timing.
- Eight sampled constructs: explicit detail (2), paraphrase recognition (2), main idea (1), agreement/contradiction/missing information (3), paragraph purpose (1), vocabulary in context (1), reference tracking (1), supported inference (1).
- Raw performance and low-confidence item observations only. No band conversion, overall readiness, mastery, persistent weakness, reading-speed or same-form improvement claim.

The reviewer packet contains the passages, student instructions, all items, keys, exact supporting quotations, each distractor rationale, candidate taxonomy mappings, limitations and a scoped signoff checklist. **Private keys and source content must remain outside public repositories, client bundles and public storage.** This document intentionally contains no actual keys or passages.

## Taxonomy audit

The eight proposed atomic mappings exist as active subskills in published `bh-english-core-v1`: `eng.reading.explicit-information.locate-detail`, `eng.reading.main-ideas.summary`, `eng.reading.main-ideas.gist`, `eng.reading.argument-evaluation.claims-evidence`, `eng.reading.purpose-viewpoint.purpose-audience`, `eng.reading.vocabulary-context.context-clues`, `eng.reading.connections.reference`, `eng.reading.inference.unstated-meaning`.

Production catalogue presence was checked read-only. This does not approve the mappings for these items. TFNG is proposed as claims/evidence rather than inventing a published IELTS atom. Item-level human mapping review remains required; any reviewed mapping change invalidates its old approval hash. Correct detail answers do not establish scanning speed or strategy use.

## Required implementation before controlled delivery

Reuse the existing IELTS Exam Mode, forms, assignments, attempts, draft versions, trusted objective scorer, expiry finalisation and idempotent submission. Do not introduce a parallel assessment runner.

1. **Immutable passage content.** The current publication allowlist accepts only `title`, `instructions`, `questions`, `audio_url`, `assessment_mode`; its question rows accept only `id`, `prompt`, `type`, `options`. Extend it explicitly for bounded passage objects and item-to-passage linkage. Freeze passages in the governed snapshot/hash. Reject hidden keys, rationales, extra fields, missing references, duplicate IDs and mismatched delivery/private item linkage. Do not smuggle passages into instructions or question prompts.
2. **Reading layout.** The legacy nested-task parser prefixes passage text to every question. Display each passage once in a calm, readable panel. Desktop can place passage and questions beside each other; phone must expose clear labelled navigation and preserve reading position. Keep paragraph labels, keyboard/focus access, zoom and contrast; avoid nested scroll traps and answer-irrelevant illustrations. Existing Listening rendering remains intact.
3. **TFNG contract.** Existing governed publication requires exactly four choices for every MCQ. Add an explicit reviewed Reading question format with exactly the three unique values TRUE/FALSE/NOT GIVEN. Retain four distinct options for ordinary MCQs. A dummy fourth option is invalid. Keep answer values and marking server-authoritative. Verify unanswered separately from incorrect and freeze option order after approval.
4. **Reading release evidence.** `guard_ielts_screener_release`, `publish_ielts_screener`, `activate_ielts_screener_release` and `ielts_screener_release_eligible` bind Listening-only skill and/or audio hashes. Audit the entire release path before adding Reading. Require exact reviewed/published content hash and Reading-specific evidence. Preserve Listening audio hash/loading/pacing/replay gates. Reading-only audio gates must be explicitly not applicable, never forged as passed.
5. **Discovery and results.** Inspect the Listening-specific discovery service/page and dashboard routes before adding the Reading entry. Published eligible forms may be shown; draft Reading must not be advertised as available. Keep canonical school agreements, named seats, independent access policy, self-only/class-scoped results and historical result access.
6. **Evidence meaning.** Keep skill results distinct. Do not aggregate Listening + Reading into an overall band. Repeating exposed items is practice. No new academic-memory conclusion or four-skill readiness source is authorised by this draft.

## Validation completed for the draft

- All 12 stable item IDs are unique; each of two passages has six linked items; all eight constructs are represented.
- Each proposed key identifies exactly one actual option; TFNG has three choices, MCQs four; every incorrect option has a written rationale.
- Each evidence quotation matches the exact named paragraph. NOT GIVEN has an explicit full-passage absence rationale.
- MCQ key distribution verified; source JSON hashed; PDF text bounds and all 12 reviewer entries verified; cover and passage rendered and visually inspected.
- Official Reading format/TFNG semantics checked against [IELTS Academic Reading format](https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-reading) on 2026-10-06. Used for reference only; no official sample passages/questions copied.

Draft JSON SHA-256: `7d8eacb33ea97b95b82cdebb23d59008e59a5e0e3d89c0f53d243354188726fc`. This portable draft digest is **not** the production publication hash. The production hash must be calculated from the exact governed database snapshot.

## Outstanding gates and impact

Human editorial, answer-key, mapping, difficulty, timing, rights and delivery approvals are **pending**. This document marks none passed. After the Reading contracts/UI are implemented, test authenticated phone/MacBook delivery, passage navigation, refresh, network loss/reconnect, backgrounding, session expiry, sign-in transitions, repeated click/duplicate submit, unanswered items, server scoring, completed persistence, protected content and cross-school denial. School class-scale claims additionally require simultaneous-load evidence. Listening device checks do not automatically validate Reading.

Assessment/scoring impact today: **none in production**. Migration/data impact: **none**. Backward compatibility: Listening content, audio, published release and existing history unchanged. This content-preparation slice does not require an application build; structural draft and document verification do not replace future executable database/security tests or human acceptance.
