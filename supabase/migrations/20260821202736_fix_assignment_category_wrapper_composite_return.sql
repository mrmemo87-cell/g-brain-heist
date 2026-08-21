-- Fix composite-return handling in the category-aware assignment RPC wrappers.
-- A composite-returning function selected as a scalar was being assigned into the
-- first field of the assignments row variable (id uuid), producing errors like:
-- invalid input syntax for type uuid: "(uuid,uuid,...)".

create or replace function public.rpc_create_assignment(
  p_teacher_id uuid,
  p_subject_id text,
  p_subject_name text,
  p_topic_name text,
  p_batch text,
  p_question_ids uuid[],
  p_assigned_at timestamptz,
  p_due_at timestamptz,
  p_title text,
  p_instructions text,
  p_difficulty text,
  p_assignment_category text,
  p_client_timezone text default 'UTC',
  p_assignment_mode text default 'batch',
  p_student_ids uuid[] default null,
  p_description text default null,
  p_publish_status text default 'published',
  p_close_submissions_after_due boolean default false,
  p_notify_students_by_email boolean default false
) returns public.assignments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_assignment public.assignments;
  v_school_id uuid;
  v_category text := private.assignment_category_normalize(p_assignment_category);
begin
  if p_publish_status <> 'draft' and v_category is null then
    raise exception using errcode = '22023', message = 'Choose an assignment category before publishing';
  end if;

  select sm.school_id into v_school_id
  from public.teachers t
  join public.school_members sm on sm.user_id = t.user_id and sm.status = 'active'
  where t.id = p_teacher_id
  order by sm.joined_at desc nulls last, sm.id
  limit 1;

  if v_school_id is null then
    raise exception using errcode = '22023', message = 'Teacher has no active school membership';
  end if;

  perform private.assignment_validate_schedule_window(v_school_id, p_publish_status, p_assigned_at, p_client_timezone);

  select * into v_assignment
  from public.rpc_create_assignment(
    p_teacher_id, p_subject_id, p_subject_name, p_topic_name, p_batch,
    p_question_ids, p_assigned_at, p_due_at, p_title, p_instructions,
    p_difficulty, p_assignment_mode, p_student_ids, p_description,
    p_publish_status, p_close_submissions_after_due, p_notify_students_by_email
  );

  update public.assignments
  set assignment_category = v_category,
      updated_at = now()
  where id = v_assignment.id
  returning * into v_assignment;

  return v_assignment;
end;
$$;

create or replace function public.rpc_update_teacher_assignment(
  p_assignment_id uuid,
  p_subject_id text,
  p_subject_name text,
  p_topic_name text,
  p_batch text,
  p_question_ids uuid[],
  p_assigned_at timestamptz,
  p_due_at timestamptz,
  p_title text,
  p_description text,
  p_instructions text,
  p_difficulty text,
  p_assignment_mode text,
  p_student_ids uuid[],
  p_publish_status text,
  p_close_submissions_after_due boolean,
  p_notify_students_by_email boolean,
  p_assignment_category text,
  p_client_timezone text default 'UTC'
) returns public.assignments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_assignment public.assignments;
  v_school_id uuid;
  v_category text := private.assignment_category_normalize(p_assignment_category);
begin
  select a.school_id into v_school_id
  from public.assignments a
  where a.id = p_assignment_id;

  if v_school_id is null then
    raise exception using errcode = '22023', message = 'Assignment school context is unavailable';
  end if;
  if p_publish_status <> 'draft' and v_category is null then
    raise exception using errcode = '22023', message = 'Choose an assignment category before publishing';
  end if;

  perform private.assignment_validate_schedule_window(v_school_id, p_publish_status, p_assigned_at, p_client_timezone);

  select * into v_assignment
  from public.rpc_update_teacher_assignment(
    p_assignment_id, p_subject_id, p_subject_name, p_topic_name, p_batch,
    p_question_ids, p_assigned_at, p_due_at, p_title, p_description,
    p_instructions, p_difficulty, p_assignment_mode, p_student_ids,
    p_publish_status, p_close_submissions_after_due, p_notify_students_by_email
  );

  update public.assignments
  set assignment_category = v_category,
      updated_at = now()
  where id = p_assignment_id
  returning * into v_assignment;

  return v_assignment;
end;
$$;
