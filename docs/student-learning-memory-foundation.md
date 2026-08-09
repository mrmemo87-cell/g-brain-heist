# Student Learning Memory foundation

## Goal

Give students, teachers, School Heads/school administrators, and later verified guardians one longitudinal academic record that explains strengths, weaknesses, improvement, and persistent support needs over time.

## Core rule

Historical evidence is append-only. A later success never deletes an earlier weakness. Current focus state is a rebuildable projection over the evidence timeline.

## Existing evidence sources

### School assignments

`student_assignment_results` stores the completed result and timestamp. `student_assignment_answers` plus `assignment_question_details` provide question-level correctness and topic metadata.

Phase 2 only ingests a result after the server-authoritative assignment lifecycle says it is completed and all expected questions are represented. Topic evidence is classified as:

- below 60%: `focus`
- 60–79%: `developing`
- 80% and above: `strength`

Evidence quality prevents tiny samples from becoming durable labels:

- 1–2 questions: `provisional`, retained in history but excluded from current focus state
- 3–5 questions: `standard`
- 6+ questions: `strong`

Future question tags can refine topic evidence using `skill:` and `subskill:` metadata without changing the longitudinal model.

### English Writing Hub

`bh_writing_attempts.payload` carries the student's submission, weakness tags/counts, rubric subscores, genre, score, word count, target length, and attempt identity.

Phase 3 treats Writing Hub evidence as a real time-based learning source rather than importing raw tags literally:

- related raw weakness tags are collapsed into stable academic skills such as Sentence control, Grammar accuracy, Content coverage, Organisation, Audience & register, and Vocabulary precision;
- multiple related tags in one essay count as one learning observation with occurrence evidence, preventing one submission from masquerading as repeated history;
- the logical attempt key is used to collapse historical duplicate database rows and to synchronize later payload updates;
- rubric dimensions create independent focus/developing/strength evidence, so progress is visible even when weakness wording changes;
- submission quality is based on actual word count relative to the task target. Very short submissions remain provisional rather than becoming durable weakness or strength evidence;
- a weakness is not considered improved merely because a later attempt omits its tag. Recovery evidence requires a strong-quality later submission, absence of the related weakness, and a supporting rubric score of 4 or 5 in the relevant dimension.

The current canonical weakness families are Sentence control, Punctuation, Grammar accuracy, Spelling, Vocabulary precision, Content coverage, Genre conventions, Audience & register, Task completion, and Organisation.

## Data model

### `student_learning_observations`

Immutable historical evidence. Important fields include school, student, subject, topic, skill, subskill/context, normalized skill key, observation type, source type/id/key, observed time, evidence percentage/count, evidence quality, whether the observation contributes to current focus state, and source evidence JSON.

`source_key` makes automatic ingestion idempotent.

### `student_learning_focus_states`

Derived current state per student + normalized skill. It stores first/last observation, occurrence counts, recent evidence, current status, trend, priority, and latest percentage.

Initial statuses:

- `new_focus`
- `recurring`
- `persistent`
- `improving`
- `resolved`
- `emerging_strength`
- `consistent_strength`

The state can always be rebuilt from observations. Provisional evidence remains visible in the timeline but is excluded from this projection.

## Access model

Direct access to both learning-memory tables is denied to `anon` and `authenticated`. Client access goes through scoped RPCs.

- Student: own profile only.
- Teacher: students in an actively assigned class; subject-specific requests must match the teacher's active subject assignment.
- School admin / School Head: students in their own school.
- Guardian: intentionally not enabled until the guardian/student relationship model and verification workflow exist.

Internal teacher notes should remain separate from future parent-visible summaries.

## Completed implementation phases

### Phase 1 — Learning Memory foundation

1. Append-only observation storage.
2. Rebuildable current focus projection.
3. Secure student-learning profile RPC.
4. Assignment and Writing Hub adapter entry points.

### Phase 2 — Assignment integration

1. Authoritative completion and integrity gate.
2. Topic-level historical evidence and future skill/subskill compatibility.
3. Evidence-quality thresholds.
4. Deterministic historical backfill.
5. Automatic future assignment-result capture.

### Phase 3 — Writing Hub integration hardening

1. Canonical weakness families instead of raw-tag fragmentation.
2. Logical-attempt deduplication and synchronization.
3. Word-count/target-aware evidence quality.
4. Rubric dimension history.
5. Conservative, rubric-supported recovery evidence.
6. Deterministic historical Writing Hub backfill and focus-state rebuild.

## Next phases

- Add shared client service/types and Teacher Portal Student Academic Profile.
- Add Student `My Progress` view.
- Add School Head aggregate academic intelligence.
- Add verified guardian relationships and parent dashboard.
- Add richer skill/subskill metadata to question authoring.
- Add intervention planning and targeted-practice recommendations after the longitudinal data is trusted.
