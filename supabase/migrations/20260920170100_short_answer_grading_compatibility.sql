-- Compatibility and creation-path hardening for short-answer grading.
--
-- PDF-created short answers can persist an AI-proposed accepted-answer set,
-- while student assignment readers never receive those protected marking rules.

create or replace function public.rpc_teacher_submit_question_batch_v3(
  p_extraction_id uuid,
  p_questions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
  v_batch_id uuid;
begin
  -- V2 remains the source/provenance authority and performs the atomic create.
  v_result := public.rpc_teacher_submit_question_batch_v2(p_extraction_id, p_questions);
  v_batch_id := nullif(v_result ->> 'batchId', '')::uuid;

  if v_batch_id is null then
    raise exception using errcode = '23514', message = 'teacher_question_batch_id_missing';
  end if;

  update public.questions q
  set accepted_answers = case
        when q.question_type = 'short_answer' then coalesce((
          select array_agg(value order by ordinality)
          from (
            select distinct on (lower(trim(answer.value)))
              trim(answer.value) as value,
              answer.ordinality
            from jsonb_array_elements_text(
              case
                when jsonb_typeof(submitted.item -> 'accepted_answers') = 'array'
                  then submitted.item -> 'accepted_answers'
                else jsonb_build_array(q.correct_answer)
              end
            ) with ordinality answer(value, ordinality)
            where nullif(trim(answer.value), '') is not null
            order by lower(trim(answer.value)), answer.ordinality
          ) deduped
        ), array[q.correct_answer])
        else array[q.correct_answer]
      end,
      grading_mode = case
        when q.question_type = 'short_answer'
          and submitted.item ->> 'grading_mode' = 'semantic_review'
          then 'semantic_review'
        when q.question_type = 'short_answer' then 'accepted_answers'
        else 'exact'
      end,
      grading_config = case
        when jsonb_typeof(submitted.item -> 'grading_config') = 'object'
          then submitted.item -> 'grading_config'
        else '{}'::jsonb
      end
  from public.teacher_question_batch_items batch_item
  join lateral (
    select item
    from jsonb_array_elements(p_questions) candidate(item)
    where coalesce(candidate.item ->> 'source_index', '') = batch_item.source_index::text
    limit 1
  ) submitted on true
  where batch_item.batch_id = v_batch_id
    and batch_item.question_id = q.id;

  return v_result;
end;
$function$;

revoke all on function public.rpc_teacher_submit_question_batch_v3(uuid,jsonb)
  from public, anon;
grant execute on function public.rpc_teacher_submit_question_batch_v3(uuid,jsonb)
  to authenticated, service_role;

-- Keep marking rules server-side while an assignment is active. MCQ/true-false
-- payloads remain backward compatible; short-answer keys and semantic metadata
-- are removed from the browser payload.
create or replace function public.rpc_get_student_pending_assignments_v2()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
            select count(*) filter (where saa.is_correct is true)::integer
            from public.student_assignment_answers saa
            where saa.assignment_id = a.id
              and saa.student_id = v_student_id
          ),
          'resume_pending_review_count', (
            select count(*) filter (where saa.grading_status in ('under_review', 'reviewing'))::integer
            from public.student_assignment_answers saa
            where saa.assignment_id = a.id
              and saa.student_id = v_student_id
          ),
          'resume_score', (
            select coalesce(sum(
              case when saa.is_correct is true then
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
              jsonb_agg(
                case
                  when aq.question_snapshot ->> 'question_type' = 'short_answer'
                    then aq.question_snapshot
                      - 'correct_answer'
                      - 'accepted_answers'
                      - 'grading_config'
                      - 'explanation'
                  else aq.question_snapshot
                end
                order by aq.order_index
              ),
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
$function$;

revoke all on function public.rpc_get_student_pending_assignments_v2()
  from public, anon;
grant execute on function public.rpc_get_student_pending_assignments_v2()
  to authenticated, service_role;

create or replace function public.rpc_get_student_active_assignment_v2()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_pending jsonb;
begin
  v_pending := public.rpc_get_student_pending_assignments_v2();
  if jsonb_typeof(v_pending) <> 'array' or jsonb_array_length(v_pending) = 0 then
    return null;
  end if;
  return v_pending -> 0;
end;
$function$;

revoke all on function public.rpc_get_student_active_assignment_v2()
  from public, anon;
grant execute on function public.rpc_get_student_active_assignment_v2()
  to authenticated, service_role;

-- Legacy completed-answer readers are also prevented from revealing a pending
-- answer key. V2 additionally exposes the grading state for modern clients.
create or replace function public.rpc_get_my_assignment_answers(p_assignment_id uuid)
returns table(
  question_id uuid,
  question_text text,
  correct_answer text,
  student_answer text,
  is_correct boolean,
  time_taken_ms integer,
  answered_at timestamptz,
  explanation text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_student_id uuid := auth.uid();
begin
  if v_student_id is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (
    select 1 from public.student_assignments sa
    where sa.assignment_id = p_assignment_id
      and sa.student_id = v_student_id
      and sa.status = 'completed'
  ) then
    raise exception 'Assignment not completed or not assigned to you';
  end if;

  return query
  select
    saa.question_id,
    saa.question_text,
    case when saa.grading_status = 'graded' then saa.correct_answer else '' end,
    saa.student_answer,
    saa.is_correct,
    saa.time_taken_ms,
    saa.answered_at,
    case when saa.grading_status = 'graded' then q.explanation else null end
  from public.student_assignment_answers saa
  left join public.questions q on q.id = saa.question_id
  where saa.assignment_id = p_assignment_id
    and saa.student_id = v_student_id
  order by saa.answered_at;
end;
$function$;

revoke all on function public.rpc_get_my_assignment_answers(uuid)
  from public, anon;
grant execute on function public.rpc_get_my_assignment_answers(uuid)
  to authenticated, service_role;
