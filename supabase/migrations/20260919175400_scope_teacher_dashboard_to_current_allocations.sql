-- Keep dashboard assignment metrics aligned with the same active class/subject
-- entitlement rules as the teacher's active assignment workspace. Historical
-- assignments and results remain preserved, but no longer inflate current
-- dashboard counts after allocation or rollover changes.

create or replace function public.rpc_teacher_assignment_success_summary()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with current_teacher as (
    select t.id as teacher_id, t.user_id as teacher_user_id
    from public.teachers t
    where t.user_id = (select auth.uid())
    limit 1
  ),
  current_scope_assignments as (
    select a.id
    from public.assignments a
    join current_teacher t on t.teacher_id = a.teacher_id
    join public.school_academic_years y
      on y.id = a.academic_year_id
     and y.school_id = a.school_id
     and y.status = 'current'
    where
      (
        coalesce(a.assignment_mode, 'batch') = 'batch'
        and a.class_id is not null
        and exists (
          select 1
          from public.class_teacher_assignments cta
          join public.classes c
            on c.id = cta.class_id
           and c.school_id = cta.school_id
           and coalesce(c.is_active, true)
          where cta.teacher_user_id = t.teacher_user_id
            and cta.school_id = a.school_id
            and cta.class_id = a.class_id
            and cta.active = true
            and private.teacher_assignment_subject_key(cta.subject)
                = private.teacher_assignment_subject_key(a.subject_name)
        )
      )
      or
      (
        (
          coalesce(a.assignment_mode, 'batch') = 'custom'
          or a.class_id is null
          or upper(trim(coalesce(a.batch, ''))) = 'ALL'
        )
        and exists (
          select 1
          from public.student_assignments sa
          join public.class_students cs on cs.student_id = sa.student_id
          join public.class_teacher_assignments cta
            on cta.class_id = cs.class_id
           and cta.teacher_user_id = t.teacher_user_id
           and cta.school_id = a.school_id
           and cta.active = true
          join public.classes c
            on c.id = cta.class_id
           and c.school_id = cta.school_id
           and coalesce(c.is_active, true)
          where sa.assignment_id = a.id
            and private.teacher_assignment_subject_key(cta.subject)
                = private.teacher_assignment_subject_key(a.subject_name)
        )
      )
  ),
  assignment_progress as (
    select
      csa.id,
      count(sa.student_id)::int as student_count,
      count(sa.student_id) filter (where sa.status = 'completed')::int as completed_count
    from current_scope_assignments csa
    left join public.student_assignments sa on sa.assignment_id = csa.id
    group by csa.id
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
    join current_scope_assignments csa on csa.id = r.assignment_id
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

revoke all on function public.rpc_teacher_assignment_success_summary() from public, anon;
grant execute on function public.rpc_teacher_assignment_success_summary() to authenticated;
