# Question-bank audit repair, 12 October 2026

This release corrects ambiguous or defective questions discovered in the whole-bank audit and Jess's Grade 7 ESL deep diagnostic. It creates 233 immutable replacements, retires 48 originals without replacements, and corrects language metadata for 780 English records. Replacement originals are retired separately. Five diagrams use new checksum-addressed paths; old assets stay intact.

The retirement list includes missing reading passages, ungrounded source claims, meaningless test entries and 17 redundant copies. Sources were not invented. Existing assignments continue using their immutable snapshots and original answer keys. No assignment, student answer, attempt, marking total or saved score is updated by this release.

## Content review

- Grammar tasks explicitly state the tense, aspect or transformation when multiple constructions are grammatical.
- Accepted variants are removed as competing distractors or the requested register/form is made explicit.
- Keys and malformed completions are repaired, including the present-simple passive, German word order and the 90-degree teacher item.
- Missing explanations, trailing option whitespace and legacy topic labels are repaired.
- Visual repairs separate the contour marker from its contour, draw a kite with one symmetry axis, mark the straight-angle distractor, complete the food chain and correct return-arrow direction in the changes-of-state diagram.
- Current approved registry mappings and grade scopes are preserved. Legacy diagnostic taxonomy is copied only where it satisfies today's evidence-focus and atomic-skill publication guards. The current diagnostic candidate pool uses the approved native registry mapping first.
- Global, school and private-teacher ownership boundaries are preserved. Private teacher replacements remain unverified and excluded from official analytics.

## Release order and verification

1. Run `python3 content/question-bank-repairs/2026-10-12/validate.py`.
2. Deploy all five assets in `repairs.json`. Confirm HTTP success, SVG content type and exact SHA-256 bytes before the database commit.
3. Rehearse `apply.sql` with its final `commit` changed to `rollback`. The transaction checks source hashes, replacement counts, current native-registry eligibility, and assignment-snapshot count/digest. It forces all deferred constraints before the end of the transaction.
4. Apply `apply.sql` as the connected production database owner after successful rehearsal and asset verification. No authorization, RLS, trigger or validation gate is disabled.
5. Verify 233 replacement receipts, 48 inactive retirement rows, matching content hashes, accepted keys and native registry mappings. Existing assignments and saved student work are preserved.

The SQL is intentionally a one-time content repair, not a schema migration. Source content hashes prevent stale edits. Immutable originals and the replacement receipt table preserve a traceable rollback path without mutating history.
