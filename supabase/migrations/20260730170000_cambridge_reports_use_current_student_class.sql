-- Cambridge attempts retain the class label captured at submission time for
-- audit purposes. Reports, however, must show a student's current roster class.
drop function if exists public.get_school_cambridge_scores(integer);

create function public.get_school_cambridge_scores(p_limit integer default 100)
returns table(
  id uuid, student_id uuid, student_name text, student_class text,
  quiz_name text, test_id text, quiz_version text, attempt_number integer,
  attempt_status text, score integer, total_questions integer,
  percentage integer, answers jsonb, time_taken_seconds integer,
  submitted_at timestamptz, scores_released boolean, released_at timestamptz,
  school_id uuid, test_subject text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_school_id uuid;
  v_role text;
begin
  select u.school_id, u.role into v_school_id, v_role
  from public.users u where u.id = v_actor;

  if v_actor is null or v_school_id is null
     or v_role not in ('teacher', 'admin', 'school_admin') then
    raise exception 'Access denied';
  end if;

  return query
  select
    qs.id, qs.student_id, qs.student_name,
    coalesce(current_class.class_code, qs.student_class),
    qs.quiz_name, qs.test_id, qs.quiz_version, qs.attempt_number,
    qs.attempt_status, qs.score, qs.total_questions, qs.percentage,
    qs.answers, qs.time_taken_seconds, qs.submitted_at,
    coalesce(qs.scores_released, false), qs.released_at, qs.school_id,
    coalesce(ct.curriculum_subject, ct.subject)
  from public.quiz_scores qs
  left join public.cambridge_tests ct
    on ct.id = qs.test_id or lower(trim(ct.name)) = lower(trim(qs.quiz_name))
  left join lateral (
    select c.class_code
    from public.class_students cs
    join public.classes c
      on c.id = cs.class_id
     and c.school_id = qs.school_id
    where cs.student_id = qs.student_id
      and (
        v_role in ('admin', 'school_admin')
        or exists (
          select 1
          from public.class_teacher_assignments current_cta
          where current_cta.class_id = c.id
            and current_cta.teacher_user_id = v_actor
            and current_cta.school_id = qs.school_id
            and current_cta.active = true
            and current_cta.can_grade = true
            and public.cambridge_assignment_matches_test(
              current_cta.subject,
              qs.test_id,
              qs.quiz_name
            )
        )
      )
    order by c.class_code
    limit 1
  ) current_class on true
  where qs.school_id = v_school_id
    and qs.attempt_status in ('submitted', 'released')
    and (
      v_role in ('admin', 'school_admin')
      or exists (
        select 1
        from public.class_teacher_assignments cta
        join public.classes c on c.id = cta.class_id and c.school_id = qs.school_id
        where cta.teacher_user_id = v_actor
          and cta.school_id = qs.school_id
          and cta.active = true
          and cta.can_grade = true
          and (
            exists (
              select 1
              from public.class_students cs
              where cs.class_id = cta.class_id
                and cs.student_id = qs.student_id
            )
            or (
              qs.student_id is null
              and (c.class_code = qs.student_class or c.class_name = qs.student_class)
            )
          )
          and public.cambridge_assignment_matches_test(cta.subject, qs.test_id, qs.quiz_name)
      )
    )
  order by qs.submitted_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 1000));
end;
$$;

revoke all on function public.get_school_cambridge_scores(integer) from public, anon;
grant execute on function public.get_school_cambridge_scores(integer) to authenticated;
