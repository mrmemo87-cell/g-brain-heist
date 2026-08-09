# Student Learning Memory foundation

## Goal

Give students, teachers, School Heads/school administrators, and later verified guardians one longitudinal academic record that explains strengths, weaknesses, improvement, and persistent support needs over time.

## Core rule

Historical evidence is append-only. A later success never deletes an earlier weakness. Current focus state is a rebuildable projection over the evidence timeline.

## Existing evidence sources

### School assignments

`student_assignment_results` stores the authoritative completed result and timestamp. `student_assignment_answers` plus `assignment_question_details` provide question-level correctness and topic metadata.

Assignment evidence is only accepted after the existing server-side submission invariants have produced a real completed result. Phase 2 additionally verifies that the student assignment is `completed`, the answered-question count matches the assignment question count, and the stored correct + incorrect totals match that count.

Each accepted result is grouped by topic and classified as:

- below 60%: `focus`
- 60–79%: `developing`
- 80% and above: `strength`

These are evidence classifications, not permanent labels. Persistence is determined from repeated observations over time.

Evidence quality is also recorded:

- 1–2 questions: `provisional` — retained in the timeline, but does not drive the current focus state;
- 3–5 questions: `standard` — contributes to progress/weakness state;
- 6+ questions: `strong` — contributes to progress/weakness state with a stronger evidence base.

Current question-bank data is topic-rich but does not yet use `tags` for skills. The assignment adapter is future-ready: `skill:<name>` and `subskill:<name>` question tags will automatically create more precise learning-memory keys when the authoring workflow begins storing them. Until then, topic is used as the skill fallback.

Assignment evidence preserves the source assignment, title, class, teacher, difficulty, correct/incorrect counts, topic question count, total assignment question count, overall accuracy, overall score, and classification thresholds.

### English Writing Hub

`bh_writing_attempts.payload` already carries assessment weakness tags, weakness occurrence counts, rubric subscores, genre, score, and attempt time. The Writing adapter records:

- each saved weakness tag as a focus observation, preserving occurrence count;
- each numeric rubric subscore as focus/developing/strength evidence;
- the writing genre as context, not as a separate student identity.

## Data model

### `student_learning_observations`

Immutable historical evidence. Important fields include school, student, subject, topic, skill, subskill/context, normalized skill key, observation type, source type/id/key, observed time, evidence percentage/count, evidence quality, whether the evidence contributes to current state, and source evidence JSON.

`source_key` makes automatic ingestion idempotent.

### `student_learning_focus_states`

Derived current state per student + normalized skill. It stores first/last observation, occurrence counts, recent evidence, current status, trend, priority, and latest percentage.

Only observations with `contributes_to_focus_state = true` drive the projection. Provisional evidence remains visible historically without prematurely labelling a student.

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

## Phase 2 — assignment integration

1. Treat `student_assignment_results` as the authoritative assignment-completion event.
2. Reject incomplete or internally inconsistent historical rows from learning-memory ingestion rather than guessing or repairing them.
3. Group evidence by topic and preserve question-level evidence counts.
4. Retain tiny samples as provisional history while preventing them from creating persistent weakness/strength labels.
5. Use stable source keys so historical reprocessing is deterministic.
6. Rebuild all assignment-derived observations with the stricter rules, then rebuild current focus state from qualified evidence.
7. Support future `skill:` / `subskill:` question tags without requiring a later learning-memory redesign.

Live-data audit before the Phase 2 migration found 648 historical assignment results. 647 satisfy the stricter completion/integrity gate. One legacy result claims two correct answers for an assignment containing one question; it is deliberately excluded from the learning-memory backfill. The eligible data produces 653 topic observations: 11 provisional, 9 standard, and 633 strong.

## Next phases

- Add client service/types and Teacher Portal student academic profile.
- Add Student `My Progress` view.
- Add School Head aggregate academic intelligence.
- Add verified guardian relationships and parent dashboard.
- Extend question authoring to save explicit skill/subskill metadata rather than relying on topic fallback.
- Add intervention planning and targeted-practice recommendations after the longitudinal data is trusted.
