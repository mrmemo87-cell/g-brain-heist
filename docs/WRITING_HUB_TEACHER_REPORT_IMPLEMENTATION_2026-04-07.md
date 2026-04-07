# Writing Hub Teacher Report Security + Implementation (2026-04-07)

## A. Access audit findings
1. Existing `bh_writing_*` table policies originally relied on `is_bh_admin_or_teacher()` and allowed broad teacher/admin access not tied to class roster.
2. Teacher-facing monitoring/analytics/calibration/export screens consume report aggregates built from in-memory store; without scoped DB reads, teachers can view cross-roster data.
3. Prior report exports included student IDs and calibration included full submission text.
4. No writing-specific class/school-scoped report RPC existed before this change.

## B. Target security design
- Source of truth for teacher ownership is class roster relation:
  - `teachers.user_id`
  - `class_teacher_assignments.teacher_user_id` + `class_id` + `active`
  - `class_students.class_id` + `student_id`
  - `users.school_id` for tenant boundary
- Access rule implemented: teacher can access student iff same school + active teaching assignment + student in assigned class.
- `school_admin` can access only students in same school.
- `admin` remains global.

## C. Report spec
### Teacher report fields
- Student identity: `student_name`, `grade`, `class_name`
- Period + genre
- Overall summary: latest score, trend delta, completion rate/counts
- Strengths
- Priority weak areas
- Repeated error patterns
- Latest evaluation summary
- Monthly summary
- Teacher action recommendations
- Optional evidence snippet (`include_snippet=true`), no full submission by default

### Student-friendly summary block
- strengths
- top improvement targets
- progress summary
- next steps

### Hidden-by-default
- full submission text (not returned by default report)

## D. Implementation plan executed
1. Added secure helper `can_access_bh_writing_student(uuid)` using school + roster joins.
2. Tightened `bh_writing_*` read policies to use per-student scoped access helper.
3. Added secure `rpc_bh_writing_teacher_report(...)` (SECURITY DEFINER) with authorization guard and curated report payload.
4. Added frontend service `getTeacherWritingReport(...)` to call the RPC.
5. Refactored teacher export flow to render structured report content (not raw full submission text by default).

## E. Code changes produced
- SQL migration: `supabase/migrations/20260407120000_secure_writing_teacher_reports.sql`
- SQL migration: `supabase/migrations/20260407170000_bh_writing_teacher_scoped_dashboards.sql`
- Frontend service changes: `src/lib/brains_heist/writingIntegrationService.ts`
- Teacher UI updates: `src/pages/writing/WritingExportCenter.tsx`, `src/pages/writing/WritingMonitoringView.tsx`, `src/pages/writing/WritingAnalyticsDashboard.tsx`, `src/pages/writing/WritingCalibrationReview.tsx`

## F. Final verdict
1. Teachers can generate professional, decision-friendly reports: **Yes**, via secure RPC + structured UI.
2. Teachers can be restricted to only their students: **Yes**, with school+class roster checks in authorization helper and policies.
3. Required safety changes were implemented with minimal/surgical impact: scoped helper, policy tightening, secure report RPC, and safer teacher report rendering.
