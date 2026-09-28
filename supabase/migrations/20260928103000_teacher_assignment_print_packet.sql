-- Teacher-owned printable assignment packet.
-- Returns only student-facing question content from the immutable assignment snapshots.
-- Correct answers, explanations, accepted answers and grading metadata are intentionally excluded.

create or replace function public.rpc_teacher_assignment_print_packet(
  p_assignment_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_assignment record;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select
    a.id,
    a.title,
    a.subject_name,
    a.topic_name,
    a.description,
    a.instructions,
    a.assigned_at,
    a.due_at,
    coalesce(a.subject_group_name_snapshot, a.class_code_snapshot, a.batch) as class_name,
    ay.name as academic_year,
    term.name as term_name
  into v_assignment
  from public.assignments a
  join public.teachers t
    on t.id = a.teacher_id
   and t.user_id = v_actor
  left join public.school_academic_years ay
    on ay.id = a.academic_year_id
  left join public.school_academic_terms term
    on term.id = a.academic_term_id
  where a.id = p_assignment_id;

  if not found then
    raise exception using errcode = '42501', message = 'NOT_AUTHORIZED';
  end if;

  return jsonb_build_object(
    'assignment', jsonb_build_object(
      'id', v_assignment.id,
      'title', coalesce(nullif(trim(v_assignment.title), ''), v_assignment.topic_name),
      'subjectName', v_assignment.subject_name,
      'topicName', v_assignment.topic_name,
      'description', v_assignment.description,
      'instructions', v_assignment.instructions,
      'assignedAt', v_assignment.assigned_at,
      'dueAt', v_assignment.due_at,
      'className', v_assignment.class_name,
      'academicYear', v_assignment.academic_year,
      'term', v_assignment.term_name
    ),
    'questions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'questionId', aq.question_id,
          'orderIndex', aq.order_index,
          'questionText', aq.question_snapshot->>'question_text',
          'questionType', coalesce(aq.question_snapshot->>'question_type', 'multiple_choice'),
          'options', coalesce((
            select jsonb_agg(
              case
                when jsonb_typeof(option_value) = 'string'
                  then jsonb_build_object('text', trim(both '"' from option_value::text), 'imageUrl', null)
                when jsonb_typeof(option_value) = 'object'
                  then jsonb_build_object(
                    'text', coalesce(option_value->>'text', ''),
                    'imageUrl', option_value->>'image_url'
                  )
                else jsonb_build_object('text', option_value::text, 'imageUrl', null)
              end
            )
            from jsonb_array_elements(
              case
                when jsonb_typeof(aq.question_snapshot->'options') = 'array'
                  then aq.question_snapshot->'options'
                else '[]'::jsonb
              end
            ) option_value
          ), '[]'::jsonb),
          'imageUrl', aq.question_snapshot->>'image_url',
          'imageAltText', aq.question_snapshot->>'image_alt_text',
          'timeLimit', case
            when coalesce(aq.question_snapshot->>'time_limit', '') ~ '^[0-9]+$'
              then (aq.question_snapshot->>'time_limit')::integer
            else null
          end,
          'points', case
            when coalesce(aq.question_snapshot->>'points', '') ~ '^[0-9]+$'
              then (aq.question_snapshot->>'points')::integer
            else null
          end
        )
        order by aq.order_index
      )
      from public.assignment_questions aq
      where aq.assignment_id = v_assignment.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.rpc_teacher_assignment_print_packet(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.rpc_teacher_assignment_print_packet(uuid)
to authenticated;

comment on function public.rpc_teacher_assignment_print_packet(uuid) is
  'Returns student-facing printable content from immutable assignment snapshots to the authenticated teacher who owns the assignment. Answer keys and grading metadata are excluded.';
