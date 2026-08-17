-- Keep started assignments visible and provide non-sensitive resume metadata.
--
-- rpc_submit_assignment_answer deliberately moves an attempt from pending to
-- in_progress after the first saved answer. The readers must treat both states
-- as active or the assignment disappears between questions.

create or replace function public.rpc_get_student_pending_assignments()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid := auth.uid();
begin
  if v_student_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  return (
    select coalesce(
      jsonb_agg(payload order by status_priority, assigned_at),
      '[]'::jsonb
    )
    from (
      select
        jsonb_build_object(
          'assignment_id', a.id,
          'subject_id', a.subject_id,
          'subject_name', a.subject_name,
          'topic_name', a.topic_name,
          'batch', a.batch,
          'teacher_username', u.username,
          'assigned_at', a.assigned_at,
          'due_at', a.due_at,
          'title', a.title,
          'instructions', a.instructions,
          'publish_status', a.publish_status,
          'close_submissions_after_due', a.close_submissions_after_due,
          'is_late', (a.due_at is not null and a.due_at < now()),
          'is_closed', (
            a.close_submissions_after_due
            and a.due_at is not null
            and a.due_at < now()
          ),
          'student_status', sa.status,
          'answered_question_ids', (
            select coalesce(jsonb_agg(saa.question_id order by aq.order_index), '[]'::jsonb)
            from public.student_assignment_answers saa
            join public.assignment_questions aq
              on aq.assignment_id = saa.assignment_id
             and aq.question_id = saa.question_id
            where saa.assignment_id = a.id
              and saa.student_id = v_student_id
          ),
          'resume_answered_count', (
            select count(*)::integer
            from public.student_assignment_answers saa
            where saa.assignment_id = a.id
              and saa.student_id = v_student_id
          ),
          'resume_correct_count', (
            select count(*) filter (where saa.is_correct)::integer
            from public.student_assignment_answers saa
            where saa.assignment_id = a.id
              and saa.student_id = v_student_id
          ),
          'resume_score', (
            select coalesce(sum(
              case when saa.is_correct then
                coalesce((aq.question_snapshot->>'points')::integer, 0)
              else 0 end
            ), 0)::integer
            from public.student_assignment_answers saa
            join public.assignment_questions aq
              on aq.assignment_id = saa.assignment_id
             and aq.question_id = saa.question_id
            where saa.assignment_id = a.id
              and saa.student_id = v_student_id
          ),
          'resume_time_taken_ms', (
            select coalesce(sum(saa.time_taken_ms), 0)::bigint
            from public.student_assignment_answers saa
            where saa.assignment_id = a.id
              and saa.student_id = v_student_id
          ),
          'questions', (
            select coalesce(
              jsonb_agg(aq.question_snapshot order by aq.order_index),
              '[]'::jsonb
            )
            from public.assignment_questions aq
            where aq.assignment_id = a.id
          )
        ) as payload,
        case when sa.status = 'in_progress' then 0 else 1 end as status_priority,
        sa.assigned_at
      from public.student_assignments sa
      join public.assignments a on a.id = sa.assignment_id
      join public.teachers t on t.id = a.teacher_id
      join public.users u on u.id = t.user_id
      where sa.student_id = v_student_id
        and sa.status in ('pending', 'in_progress')
        and a.publish_status in ('published', 'scheduled')
        and a.assigned_at <= now()
        and exists (
          select 1
          from public.assignment_questions aq
          where aq.assignment_id = a.id
        )
    ) active_assignments
  );
end;
$$;

revoke all on function public.rpc_get_student_pending_assignments()
  from public, anon, authenticated;
grant execute on function public.rpc_get_student_pending_assignments()
  to authenticated, service_role;

create or replace function public.rpc_get_student_active_assignment()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid := auth.uid();
  v_assignment_id uuid;
  v_payload jsonb;
begin
  if v_student_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select sa.assignment_id
  into v_assignment_id
  from public.student_assignments sa
  join public.assignments a on a.id = sa.assignment_id
  where sa.student_id = v_student_id
    and sa.status in ('pending', 'in_progress')
    and a.publish_status in ('published', 'scheduled')
    and a.assigned_at <= now()
    and not (
      a.close_submissions_after_due
      and a.due_at is not null
      and a.due_at < now()
    )
    and exists (
      select 1
      from public.assignment_questions aq
      where aq.assignment_id = a.id
    )
  order by
    case when sa.status = 'in_progress' then 0 else 1 end,
    sa.assigned_at
  limit 1;

  if v_assignment_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'assignment_id', a.id,
    'subject_id', a.subject_id,
    'subject_name', a.subject_name,
    'topic_name', a.topic_name,
    'batch', a.batch,
    'teacher_username', u.username,
    'assigned_at', a.assigned_at,
    'due_at', a.due_at,
    'title', a.title,
    'instructions', a.instructions,
    'publish_status', a.publish_status,
    'close_submissions_after_due', a.close_submissions_after_due,
    'is_late', (a.due_at is not null and a.due_at < now()),
    'is_closed', false,
    'student_status', sa.status,
    'answered_question_ids', (
      select coalesce(jsonb_agg(saa.question_id order by aq.order_index), '[]'::jsonb)
      from public.student_assignment_answers saa
      join public.assignment_questions aq
        on aq.assignment_id = saa.assignment_id
       and aq.question_id = saa.question_id
      where saa.assignment_id = a.id
        and saa.student_id = v_student_id
    ),
    'resume_answered_count', (
      select count(*)::integer
      from public.student_assignment_answers saa
      where saa.assignment_id = a.id
        and saa.student_id = v_student_id
    ),
    'resume_correct_count', (
      select count(*) filter (where saa.is_correct)::integer
      from public.student_assignment_answers saa
      where saa.assignment_id = a.id
        and saa.student_id = v_student_id
    ),
    'resume_score', (
      select coalesce(sum(
        case when saa.is_correct then
          coalesce((aq.question_snapshot->>'points')::integer, 0)
        else 0 end
      ), 0)::integer
      from public.student_assignment_answers saa
      join public.assignment_questions aq
        on aq.assignment_id = saa.assignment_id
       and aq.question_id = saa.question_id
      where saa.assignment_id = a.id
        and saa.student_id = v_student_id
    ),
    'resume_time_taken_ms', (
      select coalesce(sum(saa.time_taken_ms), 0)::bigint
      from public.student_assignment_answers saa
      where saa.assignment_id = a.id
        and saa.student_id = v_student_id
    ),
    'questions', (
      select coalesce(
        jsonb_agg(aq.question_snapshot order by aq.order_index),
        '[]'::jsonb
      )
      from public.assignment_questions aq
      where aq.assignment_id = a.id
    )
  )
  into v_payload
  from public.assignments a
  join public.student_assignments sa
    on sa.assignment_id = a.id
   and sa.student_id = v_student_id
  join public.teachers t on t.id = a.teacher_id
  join public.users u on u.id = t.user_id
  where a.id = v_assignment_id;

  return v_payload;
end;
$$;

revoke all on function public.rpc_get_student_active_assignment()
  from public, anon, authenticated;
grant execute on function public.rpc_get_student_active_assignment()
  to authenticated, service_role;
