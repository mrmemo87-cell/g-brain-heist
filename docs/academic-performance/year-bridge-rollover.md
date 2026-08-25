# Year Bridge — Academic-Year Rollover

Year Bridge is the school-admin command center for concluding one academic year and opening the next without losing historical context or mixing old attainment into the new year.

## Product promise

> Move every learner forward without losing a single chapter.

Year Bridge separates two responsibilities that should never be confused:

- **Historical memory:** the finished year remains readable, auditable, and unchanged.
- **Current operations:** the incoming year receives the approved class placement and confirmed academic enrolment for each active student.

Assignments, submissions, writing feedback, scores, reports, learning observations, and closed-year enrolment records are never rewritten by a rollover.

## Four-stage workflow

### 1. Bridge

The administrator selects the finished academic year and the incoming academic year. Year Bridge builds a rehearsal only; no live placement changes occur.

The source roster uses the strongest available evidence in this order:

1. confirmed academic-year enrolment;
2. previous-year assignment history;
3. current class placement;
4. student-profile fallback;
5. unresolved.

Live fallbacks are always surfaced for human review rather than silently treated as historical fact.

### 2. Class routes

Year Bridge proposes routes such as `8A → 9A` when the next grade and section match. A single available class in the next grade is offered as a reviewed merge, not an automatic truth.

Each route shows:

- students affected;
- current and projected class size;
- teacher-allocation readiness;
- incoming-year subject-plan readiness;
- confidence and rationale.

Approving a class route can clear all non-overridden student decisions in that route, keeping individual work focused on real exceptions.

### 3. Student exceptions

The administrator reviews students who are repeating, already promoted, graduating, leaving, unplaced, or whose live placement conflicts with the historical source.

Each decision records a destination, outcome, reason, reviewer, and immutable rehearsal snapshot. A student can never be promoted more than one grade through the bulk workflow.

### 4. Final rehearsal

Before launch, Year Bridge checks the live roster again and shows blockers separately from follow-up warnings.

**Blockers** stop the launch, including unresolved students, missing destination classes, changed live placements, duplicate target-year enrolments, and exit decisions where target-year learning evidence already exists.

**Warnings** remain visible but do not necessarily stop launch, including missing subject plans, staffing gaps, projected class-size pressure, and school-access reviews for graduates or leavers.

The administrator must type the incoming academic-year name exactly. The rehearsal fingerprint must still match the live roster.

## Launch behavior

Launch is one database transaction. It either completes for every reviewed student or rolls back completely.

For promoted, repeating, or already-placed students, Year Bridge:

1. uses the reviewed placement-transfer authority;
2. updates the live class placement;
3. confirms the target-year enrolment and class snapshot;
4. preserves the finished-year enrolment and all historical evidence.

For graduating or leaving students, Year Bridge removes current class placement only after safety checks and creates a follow-up requirement for school-access review. It does not silently suspend or delete the account.

The live class roster changes immediately when the administrator launches. The placement history and academic enrolment retain the incoming year’s official start date as the effective date.

## Governance and safety

- School-admin or school-owner authority is required for every RPC.
- Rollover tables have RLS enabled and no direct browser mutation grants.
- Audit events are append-only.
- Rehearsals are drift protected with a SHA-256 fingerprint.
- Class and student overrides require a reason.
- Completed rollovers are idempotent and cannot be cancelled.
- Historical assignments and writing records are never updated or deleted.
