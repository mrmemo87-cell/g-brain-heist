# Writing Hub Data Audit (2026-04-07)

## Scope and method
- Audited Brains Heist Writing Hub persistence migration files, Writing Hub frontend pages, writing integration/repository services, and related Supabase edge functions.
- Focused on objects named `bh_writing_*` and writing workflow functions.
- Did **not** find a writing-specific SQL RPC/view/trigger set beyond RLS helper function and policies.

## A) High-level summary
### What writing-task data exists per student
Per student, the Writing Hub stores profile metadata, state/history, raw writing text submissions, assessment outputs, evaluation outputs, monthly report outputs, repeated-error memory snapshots, and admin calibration flags/signals.

### Definitely stored in DB
- Structured rows: `bh_writing_student_profiles`, `bh_writing_student_states`, `bh_writing_calibration_followups`.
- JSON payload rows: attempts, weekly plans, daily tasks, daily submissions, daily evaluations, monthly reports, memory snapshots, prompt bank, review signals.

### Computed at runtime (then often persisted)
- Scoring subscales, total scores, weakness tags, trend flags, readiness flags, top weaknesses, monthly comparison summaries, report text blocks.
- Prompt rotation and usage metadata are computed and then written back.

### Exposed to teachers/admins
Teacher/admin monitoring/calibration/export UIs expose student identifiers, grades, scores/subscores, trend flags, weakness tags, weekly targets, prompt text, and full submission text in calibration/export paths.

### Exposed to students
Student Writing Hub exposes their own prompt, own submissions, task progress, score summaries, AI feedback/coaching summaries, and monthly report text.

### Suspicious overexposure
- Teacher/admin access is role-based but not school/class-scoped inside `bh_writing_*` RLS policies (global teacher/admin helper).
- Calibration/export paths include full student submission text and prompt text.
- Prompt bank and review signals appear globally readable/writable to any teacher/admin under current helper.

## B) Storage inventory (tables/views/RPC/API/trigger/frontend)
| Name | Type | Purpose | Student-related fields | Writing-task fields | Source-of-truth vs derived | Read | Write |
|---|---|---|---|---|---|---|---|
| `bh_writing_student_profiles` | Table | Student writing profile | `student_id`, `grade`, `genre`, `profile` JSON | `profile` may include writing profile state | Source for profile baseline | student self + admin/teacher | student self + admin/teacher |
| `bh_writing_student_states` | Table | Per-student writing state | `student_id`, `state` JSON | in `state`: active tasks, completed tasks, assessment pointer/history | Source for runtime state snapshot | student self + admin/teacher | student self + admin/teacher |
| `bh_writing_attempts` | Table(JSON payload) | Initial/daily attempt records | payload `student_id`/`user_id` | prompt text, submission text, assessment object, timestamps, attempt type | Source event log | student own + admin/teacher | student own + admin/teacher |
| `bh_writing_weekly_plans` | Table(JSON payload) | Weekly plan persistence | payload `student_id`/`user_id` | weekly targets/plan | Source for weekly plan | student own + admin/teacher | student own + admin/teacher |
| `bh_writing_daily_tasks` | Table(JSON payload) | Daily task persistence | payload `student_id`/`user_id` | task metadata/day/genre/expected count | Source for assigned generated tasks | student own + admin/teacher | student own + admin/teacher |
| `bh_writing_daily_submissions` | Table(JSON payload) | Daily student submission persistence | payload `student_id`/`user_id` | `submission_text`, day number, genre, submitted time | Source for submission text | student own + admin/teacher | student own + admin/teacher |
| `bh_writing_daily_evaluations` | Table(JSON payload) | Evaluation persistence | payload `student_id`/`user_id` | evaluation object (completion status, weakness/improvement tags, scores) | Source for daily evaluation output | student own + admin/teacher | student own + admin/teacher |
| `bh_writing_monthly_reports` | Table(JSON payload + expected typed keys in code) | Monthly report persistence | payload `student_id`/`user_id` (and code expects row `student_id/genre/month`) | comparison/report summaries/recommendations | Source for monthly reports | student own + admin/teacher | student own + admin/teacher |
| `bh_writing_memory_snapshots` | Table(JSON payload) | Repeated error memory snapshots | payload `student_id`/`user_id` | weakness tag counts and attempt memory | Derived snapshot persisted | student own + admin/teacher | student own + admin/teacher |
| `bh_writing_prompt_bank` | Table(JSON payload) | Prompt library | per-prompt recent usage keyed by student id | prompt text, target words, difficulty, safety flags, quality flags, usage count | Source for prompt content; derived usage metrics | admin/teacher | admin/teacher |
| `bh_writing_review_signals` | Table(JSON payload) | Admin moderation/review signals | optional `student_id` in payload | review status/notes/entity links | Derived moderation metadata | admin/teacher | admin/teacher |
| `bh_writing_calibration_followups` | Table | Calibration follow-up flags | `student_id`, payload with `flagged`, `note`, `updated_at` | calibration follow-up status | Source for follow-up flags | student self + admin/teacher | admin/teacher |
| `is_bh_admin_or_teacher()` | SQL function | Access helper for RLS | checks auth user in `users`/`teachers` | none | Access-control helper | invoked by policy | n/a |
| `bh_writing_ai` | Edge function | AI feedback/plan/rewrite | reads auth user + role lookup | receives prompt/submission/weaknesses/grade/genre; returns structured feedback | Runtime compute; no DB persistence in function | authenticated callers | n/a (returns response only) |
| `loadWritingStoreSnapshot` / `persistWritingStoreSnapshot` / `persistMonthlyWritingReport` | Frontend data layer | read/write all writing tables | uses auth user id + joins `users(id,username)` | moves store payloads to/from tables | Integration layer | client runtime | client runtime |
| `submitInitialWritingAssessment` / `submitDailyWritingPractice` / `getMonthlyWritingReport` etc. | Frontend service layer | creates tasks, accepts submissions, computes results | `student_id`, `student_name`, grade/genre | prompt, response, scores, feedback, trends, reports | Computes then persists | client runtime | client runtime |
| `WritingHub` page | Frontend page | student workflow UI | student id/name props | prompt entry, response textarea, AI assist, submit actions | UI + call orchestration | student | student |
| `WritingMonitoringView` / `WritingAnalyticsDashboard` / `WritingCalibrationReview` / `WritingExportCenter` | Frontend pages | teacher/admin reporting & exports | student id/name/grade exposures | scores, weaknesses, submission/prompt in calibration/exports | Derived reporting views over store | teacher/admin UX | mostly read (some signal/filter actions elsewhere) |

### Views / RPCs / triggers
- Writing-specific SQL **views**: not confirmed.
- Writing-specific SQL **RPCs**: not confirmed.
- Writing-specific SQL **triggers**: not confirmed.

## C) Per-student data model
For each student, Writing Hub currently stores:

### Identity
- `student_id` (UUID/string).
- `student_name` (optional, in profile/store).
- Derived display labels from `users.username` fallback.
- Grade and current genre lane.

### Assignments/tasks
- Generated weekly plan and daily tasks (`week_key`, day number, task type/title, expected word count, criteria).
- No explicit class assignment id / teacher assignment id in `bh_writing_*` model (not confirmed for writing-specific assignment object).

### Submissions
- Initial submission text (`student_response`) tied to initial assessment attempt.
- Daily submission text (`submission_text`) tied to day number.
- Prompt text associated with attempts.
- Submission timestamps (`created_at` / `submitted_at` / attempted time).

### Progress/state
- Active and completed task collections.
- Completion counts/rates.
- Adaptation trend (`success_streak`, `failure_streak`, last action).
- Difficulty state (`baseline`/`reduced`/`increased`).
- Monthly history entries and monthly review timestamp.
- Repeated-error memory snapshots and per-tag counts.

### Grading/feedback
- Assessment object: subscores (content/communicative/organisation/language), total score, band justifications, detected/missed content points, weakness tags, priorities.
- Daily evaluation object: completion status, recommended next action, target skill score, detected weakness/improvement tags.
- AI rich feedback object for initial and daily coaching: alignment, fixes, strengths/weaknesses, next steps, monthly summary sentence.

### Analytics/reporting
- Monthly report comparison + student-facing report + next month recommendations.
- Monitoring row fields: latest score/subscales, trends, hotspots, stalled/improving flags, ready-for-monthly-review flag.
- Analytics aggregates: weakness frequencies, average scores by grade/genre, prompt effectiveness, pilot readiness arrays.

### Security/visibility metadata
- Prompt quality/safety flags.
- Review signals (`approved/questionable/needs_calibration_review`) + notes.
- Calibration follow-up flags/notes per student.

## D) Code references map (object -> proof)
- Schema objects and RLS policies are created in `20260401120000_bh_writing_persistence.sql`.
- Student-write RLS expansion is in `20260402101000_fix_bh_writing_student_rls.sql` and `20260402112000_fix_bh_writing_submission_evaluation_rls.sql`.
- Admin/teacher helper is finalized in `20260401140000_fix_bh_writing_admin_helper.sql`.
- Frontend persistence calls to all `bh_writing_*` tables and `users.username` join are in `writingRepository.ts`.
- Writing flow creation/submission/evaluation/reporting and export-generation are in `writingIntegrationService.ts`.
- Student UI calls and textarea submission flow are in `WritingHub.tsx`.
- Teacher/admin data exposure surfaces are in `WritingMonitoringView.tsx`, `WritingAnalyticsDashboard.tsx`, `WritingCalibrationReview.tsx`, and `WritingExportCenter.tsx`.
- AI assistance transport is `requestWritingAiAssist` in `writingIntegrationService.ts` invoking edge function `bh_writing_ai`.
- `bh_writing_ai` validates/authenticates input and returns AI result + usage metadata without DB writes in that function.

## E) Security audit flags
1. **Teacher scope likely too broad across tenants/schools/classes**
   - `is_bh_admin_or_teacher()` only checks global admin flag or teacher existence, not school/class boundaries.
   - Policies on most `bh_writing_*` tables grant admin/teacher broad read/write based on this helper.

2. **Potential overexposure of full submission text**
   - Calibration and admin exports include raw student submission and prompt text.
   - Teacher class summary exports include student ids and score/status lines.

3. **Prompt bank/review signal global teacher access risk**
   - Prompt bank and review signals policies rely on same global helper without ownership/school partition.

4. **Schema/code mismatch risk on monthly reports**
   - Migration defines `bh_writing_monthly_reports` with only `id,payload,created_at`, but repository upsert uses `student_id,genre,month` columns and conflict target.
   - This may indicate migration drift or an untracked migration; if unresolved in DB, writes can fail or behavior depends on out-of-band schema state.

5. **Retention risk**
   - Full writing text is retained in attempts and daily submissions, plus additional copies in calibration/export rendering.

6. **No writing-specific SQL RPC/view/trigger hardening found**
   - Not confirmed that additional DB-level constraints exist beyond RLS for write-shape validation of payload JSON.

## F) Final verdict
### Plain answer
The Writing Hub stores each student’s identity linkage (`student_id`, optional name/username, grade, genre), generated writing tasks/plans, full submission text (initial + daily), scores/subscores and weakness tags, evaluation/feedback artifacts (including AI feedback), progress and trend state, repeated-error memory, monthly report outputs, and calibration/moderation flags.

### Technical answer
Most writing entities are stored as JSON payload tables (`bh_writing_attempts`, `*_weekly_plans`, `*_daily_tasks`, `*_daily_submissions`, `*_daily_evaluations`, `*_monthly_reports`, `*_memory_snapshots`, prompt/review tables) keyed by embedded `student_id`, plus typed profile/state/followup tables. Computed analytics and reporting fields are generated in `writingIntegrationService.ts` and exposed through monitoring/analytics/calibration/export pages. No writing-specific SQL views/RPCs/triggers were confirmed in audited migrations.

### Risk list (concise)
- Teacher/admin access appears globally role-scoped, not class/school-scoped.
- Full submission text exposed in calibration/export paths.
- Potential schema drift for monthly report typed columns.
- Retention of duplicated full text across multiple stores.
