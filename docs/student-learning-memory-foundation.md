# Student Learning Memory foundation

## Goal

Give students, teachers, School Heads/school administrators, and later verified guardians one longitudinal academic record that explains strengths, weaknesses, improvement, and persistent support needs over time.

## Core rule

Historical evidence is append-only. A later success never deletes an earlier weakness. Current focus state is a rebuildable projection over the evidence timeline.

## Assignment evidence

Phase 2 ingests a result only after the server-authoritative assignment lifecycle says it is completed and all expected questions are represented. Topic evidence is classified below 60% as `focus`, 60–79% as `developing`, and 80%+ as `strength`.

Evidence quality prevents tiny samples from becoming durable labels: 1–2 questions are `provisional` and excluded from current focus state; 3–5 are `standard`; 6+ are `strong`. Future `skill:` and `subskill:` question tags can refine topic evidence without changing the model.

## Writing Hub evidence

Phase 3 uses the saved Writing Hub attempt payload as longitudinal academic evidence. Related raw tags collapse into stable skills such as Sentence control, Grammar accuracy, Content coverage, Organisation, Audience & register, and Vocabulary precision. Multiple related tags in one essay become one observation with occurrence evidence, so one submission cannot masquerade as repeated history.

Logical attempt identity collapses duplicate database rows and synchronizes later payload updates. Rubric dimensions create independent focus/developing/strength observations. Very short submissions remain provisional using actual word count versus task target.

A weakness is not considered improved just because a later attempt omits its tag. Recovery evidence requires a strong-quality later submission, absence of that canonical weakness, and a supporting rubric score of 4 or 5 in the related dimension.

The production read-only audit found 118 Writing Hub rows representing 113 canonical logical attempts across 55 students. Five duplicate rows are collapsed. Of the 113 canonical attempts, 96 are strong-quality, 3 standard, and 14 provisional. The current data yields 439 canonical weakness observations and 366 rubric observations: 86 focus, 236 developing, and 44 strength.

## Data model

`student_learning_observations` is immutable historical evidence containing school/student identity, subject/topic/skill, source identity, timestamp, evidence percentage/count/quality, contribution status, and source evidence JSON. Stable source keys make automatic ingestion idempotent.

`student_learning_focus_states` is the rebuildable current projection per student and normalized skill. Statuses include `new_focus`, `recurring`, `persistent`, `improving`, `resolved`, `emerging_strength`, and `consistent_strength`. Provisional evidence stays visible in history but does not influence the current projection.

## Access model

Direct client access to both learning-memory tables is denied. Students can access only themselves through scoped RPCs; teachers are limited by active class/subject assignment; school administrators/School Heads are school-scoped. Guardian access remains intentionally disabled until verified guardian/student relationships exist. Internal teacher notes remain separate from future parent-visible summaries.

## Completed phases

- **Phase 1:** append-only memory foundation, rebuildable focus projection, secure profile RPC, adapter entry points.
- **Phase 2:** authoritative assignment integration, topic evidence, quality thresholds, deterministic backfill, future automatic capture.
- **Phase 3:** canonical Writing Hub weaknesses, logical-attempt dedupe/sync, word-count quality, rubric history, conservative recovery evidence, deterministic backfill.

## Next implementation target

Build the shared client service/types and Teacher Portal **Student Academic Profile**. It should consume the secure learning-profile RPC and combine marks, assignments, Writing Hub evidence, strengths, persistent focus areas, improvement/resolution timelines, and teacher-approved report generation without recalculating longitudinal state in the browser.

Then add Student `My Progress`, School Head aggregate intelligence, verified guardian/parent access, richer question skill metadata, and intervention/targeted-practice workflows.
