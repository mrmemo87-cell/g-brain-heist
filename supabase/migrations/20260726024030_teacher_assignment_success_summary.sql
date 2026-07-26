-- Report teacher dashboard success from submitted assignments, not unloaded
-- question-bank counters.

create or replace function public.rpc_teacher_assignment_success_summary()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with current_teacher as (
    select t.id
    from public.teachers t
    where t.user_id = (select auth.uid())
    limit 1
  ),
  valid_results as (
    select
      coalesce(r.correct, 0) as correct,
      coalesce(r.incorrect, 0) as incorrect
    from public.student_assignment_results r
    join public.assignments a on a.id = r.assignment_id
    join current_teacher t on t.id = a.teacher_id
    where not exists (
      select 1
      from public.legacy_quarantined_assignment_students q
      where q.assignment_id = r.assignment_id
        and q.student_id = r.student_id
    )
  ),
  totals as (
    select
      count(*)::int as submission_count,
      coalesce(sum(correct + incorrect), 0)::int as answered_question_count,
      coalesce(sum(correct), 0)::int as correct_answer_count
    from valid_results
  )
  select jsonb_build_object(
    'submission_count', submission_count,
    'answered_question_count', answered_question_count,
    'correct_answer_count', correct_answer_count,
    'success_rate', case
      when answered_question_count > 0
        then round(correct_answer_count::numeric * 100 / answered_question_count)::int
      else 0
    end
  )
  from totals;
$$;

revoke all on function public.rpc_teacher_assignment_success_summary() from public;
revoke all on function public.rpc_teacher_assignment_success_summary() from anon;
grant execute on function public.rpc_teacher_assignment_success_summary() to authenticated;
grant execute on function public.rpc_teacher_assignment_success_summary() to service_role;

comment on function public.rpc_teacher_assignment_success_summary() is
  'Returns the authenticated teacher weighted correctness rate across valid submitted assignments.';
