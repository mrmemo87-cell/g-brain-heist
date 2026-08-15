-- Restore the student assignment lifecycle expected by the verified answer RPCs.
--
-- rpc_submit_assignment_answer transitions a started assignment from pending to
-- in_progress after persisting each answer. The legacy constraint only allowed
-- pending/completed, which rolled back the answer insert and later caused
-- rpc_submit_assignment_result to raise MISMATCHED_QUESTION_TOTAL.
--
-- This migration intentionally changes only the lifecycle constraint. Academic
-- learning-evidence ingestion remains server-authoritative and unchanged.

alter table public.student_assignments
  drop constraint if exists student_assignments_status_check;

alter table public.student_assignments
  add constraint student_assignments_status_check
  check (status in ('pending', 'in_progress', 'completed'));
