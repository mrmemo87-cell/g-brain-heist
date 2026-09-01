-- Preserve the teacher-selected assignment category when an intervention plan
-- creates targeted practice. Keep the previous overload in place for rolling-
-- deployment compatibility; new clients select this overload by sending the
-- named p_assignment_category argument.

create or replace function public.rpc_create_intervention_practice_assignment(
  p_teacher_id uuid,
  p_subject_id text,
  p_subject_name text,
  p_topic_name text,
  p_question_ids uuid[],
  p_assigned_at timestamptz,
  p_due_at timestamptz,
  p_title text,
  p_instructions text,
  p_difficulty text,
  p_student_id uuid,
  p_skill_key text,
  p_diagnostic_targets jsonb,
  p_assignment_category text,
  p_client_timezone text default 'UTC',
  p_description text default null,
  p_publish_status text default 'published',
  p_close_submissions_after_due boolean default false,
  p_notify_students_by_email boolean default false
)
returns public.assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment public.assignments;
begin
  if p_student_id is null or nullif(trim(p_skill_key), '') is null then
    raise exception using errcode = '22023',
      message = 'Student and governed focus skill are required';
  end if;
  if coalesce(array_length(p_question_ids, 1), 0) = 0 then
    raise exception using errcode = '22023',
      message = 'Choose at least one practice question';
  end if;

  -- Delegate category normalization, category validation, local-time schedule
  -- validation and assignment creation to the canonical category-aware RPC.
  select * into v_assignment
  from public.rpc_create_assignment(
    p_teacher_id,
    p_subject_id,
    p_subject_name,
    p_topic_name,
    null::text,
    p_question_ids,
    p_assigned_at,
    p_due_at,
    p_title,
    p_instructions,
    p_difficulty,
    p_assignment_category,
    coalesce(nullif(trim(p_client_timezone), ''), 'UTC'),
    'custom'::text,
    array[p_student_id]::uuid[],
    p_description,
    p_publish_status,
    p_close_submissions_after_due,
    p_notify_students_by_email
  );

  perform public.rpc_teacher_register_intervention_practice(
    v_assignment.id,
    p_student_id,
    p_skill_key,
    coalesce(p_diagnostic_targets, '[]'::jsonb),
    null::uuid
  );

  return v_assignment;
end;
$$;

revoke all on function public.rpc_create_intervention_practice_assignment(
  uuid, text, text, text, uuid[], timestamptz, timestamptz, text, text, text,
  uuid, text, jsonb, text, text, text, text, boolean, boolean
) from public, anon;

grant execute on function public.rpc_create_intervention_practice_assignment(
  uuid, text, text, text, uuid[], timestamptz, timestamptz, text, text, text,
  uuid, text, jsonb, text, text, text, text, boolean, boolean
) to authenticated, service_role;

comment on function public.rpc_create_intervention_practice_assignment(
  uuid, text, text, text, uuid[], timestamptz, timestamptz, text, text, text,
  uuid, text, jsonb, text, text, text, text, boolean, boolean
) is
  'Atomically creates one-student intervention practice with the teacher-selected assignment category and registers non-independent practice provenance.';
