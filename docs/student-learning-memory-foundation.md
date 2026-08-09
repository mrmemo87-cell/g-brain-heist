# Student Learning Memory foundation

## Goal

Give students, teachers, School Heads/school administrators, and later verified guardians one longitudinal academic record that explains strengths, weaknesses, improvement, and persistent support needs over time.

## Core rule

Historical evidence is append-only. A later success never deletes an earlier weakness. Current focus state is a rebuildable projection over the evidence timeline.

## Existing evidence sources

### School assignments

`student_assignment_results` stores the completed result and timestamp. `student_assignment_answers` plus `assignment_question_details` provide question-level correctness and topic metadata. The first adapter groups each completed assignment by topic and records a topic observation:

- below 60%: `focus`
- 60–79%: `developing`
- 80% and above: `strength`

These are evidence classifications, not permanent labels. Persistence is determined from repeated observations over time.

### English Writing Hub

`bh_writing_attempts.payload` already carries assessment weakness tags, weakness occurrence counts, rubric subscores, genre, score, and attempt time. The Writing adapter records:

- each saved weakness tag as a focus observation, preserving occurrence count;
- each numeric rubric subscore as focus/developing/strength evidence;
- the writing genre as context, not as a separate student identity.

## Data model

### `student_learning_observations`

Immutable historical evidence. Important fields include school, student, subject, topic, skill, subskill/context, normalized skill key, observation type, source type/id/key, observed time, evidence percentage/count, and source evidence JSON.

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

The state can always be rebuilt from observations.

## Access model

Direct access to both learning-memory tables is denied to `anon` and `authenticated`. Client access goes through scoped RPCs.

- Student: own profile only.
- Teacher: students in an actively assigned class; subject-specific requests must match the teacher's active subject assignment.
- School admin / School Head: students in their own school.
- Guardian: intentionally not enabled until the guardian/student relationship model and verification workflow exist.

Internal teacher notes should remain separate from future parent-visible summaries.

## Phase 1 release

1. Add append-only observation storage and derived focus state.
2. Backfill existing school assignment evidence.
3. Backfill existing Writing Hub evidence.
4. Add triggers so future assignment results and writing attempts are captured automatically.
5. Add a secure student-learning profile RPC for student/teacher/school views.
6. Do not redesign current dashboards in this migration.

## Next phases

- Add client service/types and Teacher Portal student academic profile.
- Add Student `My Progress` view.
- Add School Head aggregate academic intelligence.
- Add verified guardian relationships and parent dashboard.
- Add richer skill/subskill metadata to question authoring so future evidence can be more precise than topic level.
- Add intervention planning and targeted-practice recommendations after the longitudinal data is trusted.
