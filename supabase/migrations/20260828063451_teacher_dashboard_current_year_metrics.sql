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
  current_year_assignments as (
    select a.id
    from public.assignments a
    join current_teacher t on t.id = a.teacher_id
    join public.school_academic_years y
      on y.id = a.academic_year_id
     and y.school_id = a.school_id
     and y.status = 'current'
  ),
  assignment_progress as (
    select
      cya.id,
      count(sa.id)::int as student_count,
      count(sa.id) filter (where sa.status = 'completed')::int as completed_count
    from current_year_assignments cya
    left join public.student_assignments sa on sa.assignment_id = cya.id
    group by cya.id
  ),
  assignment_totals as (
    select
      count(*)::int as assignment_count,
      count(*) filter (where completed_count < student_count)::int as active_assignment_count
    from assignment_progress
  ),
  valid_results as (
    select
      coalesce(r.correct, 0) as correct,
      coalesce(r.incorrect, 0) as incorrect
    from public.student_assignment_results r
    join current_year_assignments cya on cya.id = r.assignment_id
    where not exists (
      select 1
      from public.legacy_quarantined_assignment_students q
      where q.assignment_id = r.assignment_id
        and q.student_id = r.student_id
    )
  ),
  result_totals as (
    select
      count(*)::int as submission_count,
      coalesce(sum(correct + incorrect), 0)::int as answered_question_count,
      coalesce(sum(correct), 0)::int as correct_answer_count
    from valid_results
  )
  select jsonb_build_object(
    'assignment_count', a.assignment_count,
    'active_assignment_count', a.active_assignment_count,
    'submission_count', r.submission_count,
    'answered_question_count', r.answered_question_count,
    'correct_answer_count', r.correct_answer_count,
    'success_rate', case
      when r.answered_question_count > 0
        then round(r.correct_answer_count::numeric * 100 / r.answered_question_count)::int
      else 0
    end
  )
  from assignment_totals a
  cross join result_totals r;
$$;

revoke all on function public.rpc_teacher_assignment_success_summary() from public;
revoke all on function public.rpc_teacher_assignment_success_summary() from anon;
grant execute on function public.rpc_teacher_assignment_success_summary() to authenticated;
grant execute on function public.rpc_teacher_assignment_success_summary() to service_role;

comment on function public.rpc_teacher_assignment_success_summary() is
  'Returns the authenticated teacher current-academic-year assignment counts, completed submissions, and answer accuracy totals.';
