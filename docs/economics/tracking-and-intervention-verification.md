# Economics question tracking and teacher presentation

Question tags are bank categories, not the authority for Academic Profile evidence.
Teacher previews present current governed registry mappings as strand, skill,
atomic subskill, Evidence Focus and evidence statement. Search includes both
primary content and additional reasoning mappings.

The targeted-practice selector understands registry keys and distinguishes:

1. Exact subskill and Evidence Focus — eligible for automatic preselection.
2. Same subskill, different Evidence Focus — related practice.
3. Same parent skill, different subskill — broader practice.

It preserves legacy diagnostic/objective selection and limits returned ID lists
to 100 per category. The targeted workspace fetches these IDs through an
allocation-scoped RPC in batches of at most 100, instead of loading the first
500 questions from the full catalogue. The RPC preserves operational year,
school, active allocation, subject, grade, verified hash and pool boundaries.

Verified assignment answers create registry item evidence and observations.
One answer remains provisional/low-data. Decision-ready confidence and teacher
review are still required before a measured intervention plan can start.
Targeted practice does not establish independent mastery. Linking completed
practice retracts observation contributions without rewriting append-only item
history; ingestion also checks current practice provenance.

## Regression verification

`tests/economicsTrackingDatabase.sql` is a transaction-only integration test.
Run through the connected database after the migrations. It finds an allocated
Economics teacher and authorized student, creates draft fixtures without email,
submits answers through the public RPCs, asserts profile and intervention
behavior, and rolls back every change.

It checks exact versus incorrect Evidence Focus, cross-subject exclusion,
current teacher metadata, bounded candidate lookup, retry idempotency,
Academic Profile subskills, intervention recommendation visibility, late-linked
practice exclusion, fresh practice exclusion and immutable item counts.

The original 40-question bank is a diagnostic starting point. Most content
subskills have only one exact item, so repeated assessment needs additional
independently governed questions. The software must retain low-data states
instead of presenting sparse evidence as confirmed mastery.
