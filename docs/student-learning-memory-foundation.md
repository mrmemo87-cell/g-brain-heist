# Student Learning Memory foundation

## Goal
Give students, teachers, School Heads/school administrators, and later verified guardians one longitudinal academic record that explains strengths, weaknesses, improvement, and persistent support needs over time.

## Core rule
Historical evidence is append-only. Later success never deletes earlier weakness evidence. Current focus state is a rebuildable projection over the timeline.

## Assignment evidence
Phase 2 ingests only server-authoritative completed assignments. Topic evidence is `<60% focus`, `60–79% developing`, `80%+ strength`. Samples of 1–2 questions are provisional and do not affect current focus state; 3–5 are standard; 6+ are strong. Future `skill:` and `subskill:` question tags can refine this without changing the model.

## Writing Hub evidence
Phase 3 converts Writing Hub submissions into longitudinal evidence. Related raw tags collapse into stable skills such as Sentence control, Grammar accuracy, Content coverage, Organisation, Audience & register, and Vocabulary precision. Related tags within one essay become one observation with occurrence evidence, preventing one submission from looking like repeated history.

Logical attempt identity collapses duplicate rows and synchronizes later payload updates. Rubric dimensions create independent focus/developing/strength observations. Very short submissions remain provisional based on actual word count versus task target.

A weakness is not treated as improved just because a later attempt omits its tag. Recovery requires a strong-quality later submission, absence of that canonical weakness, and a supporting rubric score of 4 or 5 in the related dimension.

The production read-only audit found 118 Writing Hub rows representing 113 canonical logical attempts across 55 students. Five duplicate rows are collapsed. Of the canonical attempts, 96 are strong-quality, 3 standard, and 14 provisional. Current data yields 439 canonical weakness observations and 366 rubric observations: 86 focus, 236 developing, and 44 strength.

## Data model
`student_learning_observations` is immutable history with student/school, subject/topic/skill, source identity, timestamp, evidence percentage/count/quality, contribution status, and source evidence JSON. Stable source keys make ingestion idempotent.

`student_learning_focus_states` is the rebuildable current projection per student and normalized skill, with statuses including `new_focus`, `recurring`, `persistent`, `improving`, `resolved`, `emerging_strength`, and `consistent_strength`. Provisional evidence remains visible but does not influence this projection.

## Access model
Direct client access to the learning-memory tables is denied. Students can access only themselves through scoped RPCs; teachers are limited by active class/subject assignment; School Heads/admins are school-scoped. Guardian access remains disabled until verified guardian/student relationships exist. Internal teacher notes remain separate from future parent-visible summaries.

## Completed phases
- **Phase 1:** append-only memory foundation, rebuildable focus projection, secure profile RPC, adapter entry points.
- **Phase 2:** authoritative assignment integration, topic evidence, quality thresholds, deterministic backfill, automatic future capture.
- **Phase 3:** canonical Writing Hub weaknesses, logical-attempt dedupe/sync, word-count quality, rubric history, conservative recovery evidence, deterministic backfill.

## Next implementation target
Build the shared client service/types and Teacher Portal **Student Academic Profile**. It should consume the secure learning-profile RPC and combine marks, assignments, Writing Hub evidence, strengths, persistent focus areas, improvement/resolution timelines, and teacher-approved report generation without recalculating longitudinal state in the browser.

Then add Student `My Progress`, School Head aggregate intelligence, verified guardian/parent access, richer question skill metadata, and intervention/targeted-practice workflows.
