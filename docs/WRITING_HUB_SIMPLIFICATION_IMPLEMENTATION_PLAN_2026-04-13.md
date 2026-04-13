# Writing Hub simplification implementation plan (2026-04-13)

## 1) Repo-aware current-state summary

- Current student Writing Hub is a **weekly-cycle experience** with first-submit assessment, generated weekly plan, generated daily tasks, weekly review framing, and monthly report context shown in the same surface.
- In UI logic, dashboard snapshots pull `getCurrentWeeklyPlan`, `getTodayWritingTask`, and `getMonthlyWritingReport`, then render weekly plan summary + today task + monthly growth summary together.
- First submission uses `handleStart` and calls `submitInitialWritingAssessment`, which creates:
  - assessment result
  - weekly plan
  - daily tasks
  - state/memory snapshots
- Later submissions use `handleSubmitPractice` and call `submitDailyWritingPractice`, which stores daily submission, daily evaluation, updates assessment-like attempt, and memory snapshot.
- Persistence already captures rich history via attempts/plans/tasks/submissions/evaluations/monthly reports/memory snapshots.
- SQL layer stores these writing entities in dedicated tables with JSON payloads and RLS.
- Teacher/admin analytics/reporting/calibration pipelines already consume attempts, repeated error tags, completion trends, and roster-scoped dashboards.

## 2) Why students are likely getting confused

- The student UI currently combines many concepts simultaneously: week stage tracking, today mission/task, genre lane switching, AI review modal, task context modal, progress details modal, weekly goals, mission recommendations, monthly summary, and optional quest mission jumps.
- Student entry copy and CTA behavior emphasize “build weekly plan / today task / week complete,” which introduces pacing-model decisions before the student has a simple action loop.
- “First submit” and “daily submit” are separate conceptual flows with different controls and language, making the next action less obvious.
- The product currently blends skill-building guidance and analytics framing directly into the student runtime experience instead of reducing to one obvious next action.

## 3) Recommended simplified student flow

### New canonical loop
1. Show one writing prompt.
2. Student writes and submits.
3. AI returns score + strengths + mistakes + full feedback + mistake tags.
4. Student sees only two primary CTAs:
   - **Retry same prompt**
   - **Try new prompt**
5. Repeat.

### Screen behavior
- **Landing screen:** one active prompt card + one editor + one submit button.
- **After submit:** feedback result panel anchored above next-action buttons.
- **Retry same prompt:** keep same `prompt_id/prompt_text`, clear editor, increment attempt number for same cycle.
- **Try new prompt:** fetch fresh prompt, create new cycle root, reset attempt count in that new cycle.

### Student-facing principle
- Keep secondary information collapsed or removed from student primary flow.
- Never present more than one “what now?” decision after feedback.

## 4) What should stay in student UI

- Prompt text + target word count.
- Single writing textarea and submit action.
- Feedback essentials:
  - score
  - strengths
  - mistakes
  - full feedback
  - mistake tags
- Exactly two post-feedback actions:
  - Retry same prompt
  - Try new prompt
- Optional lightweight “history chip” (attempt #, last score) can stay if non-blocking.

## 5) What should leave or be de-emphasized in student UI

Move out of primary student surface (hide first, do not delete backend):
- Weekly plan framing (`primary/secondary/maintenance` targets) as primary CTA content.
- Daily task framing (“Day N” mission progression) as required student navigation model.
- Week stage tracker and “week complete” orchestration as central UX.
- Rich mission recommendation carousel + quest jump as top-level next step.
- Detailed coaching orchestration modals as default first path.
- Monthly growth block in the core write-submit-feedback surface.

Keep available only as optional “View more” or move to teacher/admin views.

## 6) What data can stay behind the scenes

Preserve existing persistence and analytics contracts:
- attempts (initial + daily/practice style)
- daily submissions + evaluations
- weekly plans/tasks if still produced by orchestration
- repeated error memory snapshots
- monthly reports
- prompt bank usage metadata
- teacher monitoring/calibration/export records

This allows student UX simplification without deleting teacher-value signals.

## 7) What data/storage changes are actually needed

### Existing fields already useful
- `attempt_type` (initial vs daily_practice)
- prompt text + submission text + assessment + rich feedback
- weakness tags in assessment/evaluation
- created timestamps and per-student histories

### Minimal additive fields recommended (in payload only first, typed schema later)
- `prompt_id` (nullable) — for same-prompt retry analytics where prompt bank entry exists.
- `parent_attempt_id` (nullable) — link retries to original attempt.
- `retry_kind` enum-like string: `same_prompt | new_prompt`.
- `attempt_number` (int) within a revision cycle.
- `revision_cycle_id` (uuid/string) to group related attempts.

### What is NOT needed now
- No destructive schema rewrite.
- No removal of weekly/daily tables.
- No migration of all historical rows before launch.

## 8) Teacher/analytics value preserved

With additive metadata + existing tag storage, teacher value remains strong (or improves):
- common mistake tags per student/class over time
- repeated weakness patterns from memory/tag counts
- score and subscale trend over attempts
- improvement delta within same-prompt retries
- comparative performance: same-prompt retry vs new-prompt attempt
- class-wide weak areas from hotspot aggregation

Teacher RPC/dashboard paths already support roster-scoped consumption and weakness hotspot extraction.

## 9) Safest rollout plan

### Phase 0: Audit + instrumentation
- Add event logging for current student decisions in Writing Hub (no UX change yet).
- Baseline metrics: submission frequency, completion, retry behavior, time-to-next-submit.

### Phase 1: UI simplification via feature flag (student only)
- Introduce `writing_hub_simple_loop_v1` flag.
- New student route/surface uses prompt→submit→feedback→retry/new only.
- Keep existing backend service calls for assessment/feedback/tagging/persistence.

### Phase 2: Add minimal retry metadata (additive)
- Persist `revision_cycle_id`, `attempt_number`, `retry_kind`, `parent_attempt_id`, optional `prompt_id`.
- Backfill optional defaults lazily for analytics queries (not required for launch).

### Phase 3: De-emphasize old student constructs
- Keep weekly/daily orchestration running in background if needed for compatibility.
- Hide week stage components from student default UI.
- Retain teacher/admin pages unchanged initially.

### Phase 4: Teacher analytics updates
- Add retry-specific panels: same-prompt improvement, retry depth, recurring tag persistence.
- Keep old weekly metrics until new metrics stabilize.

## 10) Simplified MVP definition

### In MVP (ship first)
- One prompt shown on load.
- One writing input + submit.
- Feedback result card with:
  - score
  - strengths
  - mistakes
  - full feedback
  - mistake tags
- Two clear post-submit buttons:
  - Retry this prompt
  - New prompt
- Save attempts and feedback in existing pipelines.
- Capture minimal retry metadata.

### Out of MVP (explicitly exclude)
- Weekly plan stage UI.
- Daily mission/task progression UI.
- Quest mission recommendations in student flow.
- Monthly summary blocks in student core screen.
- Multi-modal guided repair orchestration as default pathway.
- Any teacher/admin dashboard rewrite.

## 11) Risks and tradeoffs

### Gains
- Much clearer student next step.
- Higher repetition probability (more deliberate practice loops).
- Faster cycle time from feedback to retry.

### Losses
- Less explicit scaffolded weekly intervention in student view.
- Some pedagogical pacing cues become hidden.

### Mitigations
- Keep existing backend orchestration/data untouched initially.
- Expose advanced guidance as optional (not primary).
- Preserve teacher views and existing monitoring contracts during rollout.

### Migration risk
- Students mid-week in old flow may be in mixed states; handle with feature-flag + non-destructive compatibility mapping.
- Analytics may temporarily mix old weekly-cycle attempts and new retry-cycle attempts; separate by rollout flag/session metadata.

## 12) Final verdict

The **lowest-risk, highest-clarity path** is:
- keep current scoring/feedback/tagging/persistence engine,
- introduce a student-only simplified UI loop under flag,
- add only small retry-link metadata,
- defer backend rewrites and teacher-surface changes.

This delivers the intended product direction (WRITE → GET FEEDBACK → RETRY) while preserving teacher analytics value and minimizing blast radius.
