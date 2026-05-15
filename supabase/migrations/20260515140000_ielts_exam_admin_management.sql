-- Teacher/Admin management RPCs for controlled IELTS Exam Mode.
-- These RPCs create exam events/forms and assign existing Brain Heist users.
-- Student-facing RPCs still receive only public form payloads without answer_key.

create or replace function public.can_create_ielts_exam(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_superadmin(auth.uid())
    or exists (
      select 1
      from public.school_members sm
      where sm.school_id = p_school_id
        and sm.user_id = auth.uid()
        and sm.status = 'active'
        and sm.role_in_school in ('school_admin', 'teacher')
    );
$$;

create or replace function public.can_assign_ielts_exam_class(p_exam_event_id uuid, p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_ielts_exam(p_exam_event_id)
    or exists (
      select 1
      from public.ielts_exam_events e
      join public.classes c on c.id = p_class_id and c.school_id = e.school_id
      join public.class_teacher_assignments cta on cta.class_id = c.id
      where e.id = p_exam_event_id
        and cta.teacher_user_id = auth.uid()
        and coalesce(cta.active, true) = true
    );
$$;

create or replace function public.ielts_jsonb_contains_answer_key(p_payload jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  with recursive walk(value) as (
    -- Seed only: the recursive term below is the only branch that references walk.
    select coalesce(p_payload, 'null'::jsonb)

    union all

    select child.value
    from walk
    cross join lateral (
      select object_child.value
      from jsonb_each(
        case when jsonb_typeof(walk.value) = 'object' then walk.value else '{}'::jsonb end
      ) as object_child(key, value)

      union all

      select array_child.value
      from jsonb_array_elements(
        case when jsonb_typeof(walk.value) = 'array' then walk.value else '[]'::jsonb end
      ) as array_child(value)
    ) child
  )
  select exists (
    select 1
    from walk
    cross join lateral jsonb_object_keys(
      case when jsonb_typeof(walk.value) = 'object' then walk.value else '{}'::jsonb end
    ) as object_key(key)
    where lower(object_key.key) = 'answer_key'
  );
$$;

create or replace function public.rpc_ielts_create_exam_event(
  p_title text,
  p_description text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_duration_minutes int,
  p_status text default 'draft',
  p_school_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_school_id uuid;
  v_school_id uuid;
  v_event public.ielts_exam_events%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if nullif(trim(coalesce(p_title, '')), '') is null then raise exception 'title_required'; end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then raise exception 'invalid_exam_window'; end if;
  if p_duration_minutes is null or p_duration_minutes <= 0 then raise exception 'invalid_duration'; end if;
  if coalesce(p_status, 'draft') not in ('draft', 'scheduled', 'live', 'paused', 'closed', 'cancelled') then raise exception 'invalid_status'; end if;

  select u.school_id into v_actor_school_id from public.users u where u.id = auth.uid();
  v_school_id := coalesce(p_school_id, v_actor_school_id);

  if v_school_id is null and not public.is_superadmin(auth.uid()) then
    raise exception 'school_required';
  end if;
  if v_school_id is not null and not public.can_create_ielts_exam(v_school_id) then
    raise exception 'forbidden';
  end if;

  insert into public.ielts_exam_events (school_id, title, description, status, starts_at, ends_at, duration_minutes, created_by)
  values (v_school_id, trim(p_title), p_description, coalesce(p_status, 'draft'), p_starts_at, p_ends_at, p_duration_minutes, auth.uid())
  returning * into v_event;

  insert into public.ielts_exam_audit_log(actor_id, exam_event_id, action, payload)
  values (auth.uid(), v_event.id, 'create_exam_event', jsonb_build_object('title', v_event.title, 'status', v_event.status, 'school_id', v_event.school_id));

  return to_jsonb(v_event);
end;
$$;

create or replace function public.rpc_ielts_create_exam_form(
  p_exam_event_id uuid,
  p_form_code text,
  p_reading_payload jsonb,
  p_listening_payload jsonb,
  p_writing_payload jsonb,
  p_answer_key jsonb,
  p_speaking_payload jsonb default null,
  p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form public.ielts_exam_forms%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.can_manage_ielts_exam(p_exam_event_id) then raise exception 'forbidden'; end if;
  if nullif(trim(coalesce(p_form_code, '')), '') is null then raise exception 'form_code_required'; end if;
  if public.ielts_jsonb_contains_answer_key(p_reading_payload)
     or public.ielts_jsonb_contains_answer_key(p_listening_payload)
     or public.ielts_jsonb_contains_answer_key(p_writing_payload)
     or public.ielts_jsonb_contains_answer_key(p_speaking_payload) then
    raise exception 'public_payload_contains_answer_key';
  end if;

  if coalesce(p_is_active, true) then
    update public.ielts_exam_forms
    set is_active = false
    where exam_event_id = p_exam_event_id;
  end if;

  insert into public.ielts_exam_forms (
    exam_event_id, form_code, reading_payload, listening_payload, writing_payload,
    speaking_payload, answer_key, is_active
  ) values (
    p_exam_event_id, trim(p_form_code), coalesce(p_reading_payload, '{}'::jsonb),
    coalesce(p_listening_payload, '{}'::jsonb), coalesce(p_writing_payload, '{}'::jsonb),
    p_speaking_payload, coalesce(p_answer_key, '{}'::jsonb), coalesce(p_is_active, true)
  )
  on conflict (exam_event_id, form_code) do update
    set reading_payload = excluded.reading_payload,
        listening_payload = excluded.listening_payload,
        writing_payload = excluded.writing_payload,
        speaking_payload = excluded.speaking_payload,
        answer_key = excluded.answer_key,
        is_active = excluded.is_active
  returning * into v_form;

  insert into public.ielts_exam_audit_log(actor_id, exam_event_id, action, payload)
  values (auth.uid(), p_exam_event_id, 'create_exam_form', jsonb_build_object('form_id', v_form.id, 'form_code', v_form.form_code, 'is_active', v_form.is_active));

  return to_jsonb(v_form);
end;
$$;

create or replace function public.ielts_resolve_exam_form(p_exam_event_id uuid, p_form_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form_id uuid;
begin
  if p_form_id is not null then
    select f.id into v_form_id
    from public.ielts_exam_forms f
    where f.id = p_form_id and f.exam_event_id = p_exam_event_id and f.is_active = true;
  else
    select f.id into v_form_id
    from public.ielts_exam_forms f
    where f.exam_event_id = p_exam_event_id and f.is_active = true
    order by f.created_at desc
    limit 1;
  end if;

  if v_form_id is null then raise exception 'active_form_required'; end if;
  return v_form_id;
end;
$$;

create or replace function public.rpc_ielts_assign_exam_to_class(
  p_exam_event_id uuid,
  p_class_id uuid,
  p_form_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.ielts_exam_events%rowtype;
  v_form_id uuid;
  v_inserted int := 0;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_event from public.ielts_exam_events where id = p_exam_event_id;
  if v_event.id is null then raise exception 'exam_not_found'; end if;
  if not public.can_assign_ielts_exam_class(p_exam_event_id, p_class_id) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.classes c where c.id = p_class_id and c.school_id = v_event.school_id and coalesce(c.is_active, true) = true) then
    raise exception 'class_not_found';
  end if;

  v_form_id := public.ielts_resolve_exam_form(p_exam_event_id, p_form_id);

  insert into public.ielts_exam_assignments (exam_event_id, student_id, school_id, class_id, form_id, status)
  select v_event.id, cs.student_id, v_event.school_id, p_class_id, v_form_id, 'assigned'
  from public.class_students cs
  join public.users u on u.id = cs.student_id
  where cs.class_id = p_class_id
    and u.school_id = v_event.school_id
  on conflict (exam_event_id, student_id) do update
    set class_id = excluded.class_id,
        form_id = excluded.form_id,
        status = case when public.ielts_exam_assignments.status in ('submitted', 'auto_submitted') then public.ielts_exam_assignments.status else 'assigned' end;

  get diagnostics v_inserted = row_count;

  insert into public.ielts_exam_audit_log(actor_id, exam_event_id, action, payload)
  values (auth.uid(), p_exam_event_id, 'assign_exam_to_class', jsonb_build_object('class_id', p_class_id, 'form_id', v_form_id, 'affected_rows', v_inserted));

  return jsonb_build_object('exam_event_id', p_exam_event_id, 'class_id', p_class_id, 'form_id', v_form_id, 'assigned_count', v_inserted);
end;
$$;

create or replace function public.rpc_ielts_assign_exam_to_students(
  p_exam_event_id uuid,
  p_student_ids uuid[],
  p_form_id uuid default null,
  p_class_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.ielts_exam_events%rowtype;
  v_form_id uuid;
  v_inserted int := 0;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_student_ids is null or array_length(p_student_ids, 1) is null then raise exception 'students_required'; end if;
  select * into v_event from public.ielts_exam_events where id = p_exam_event_id;
  if v_event.id is null then raise exception 'exam_not_found'; end if;
  if not public.can_manage_ielts_exam(p_exam_event_id) and not (p_class_id is not null and public.can_assign_ielts_exam_class(p_exam_event_id, p_class_id)) then
    raise exception 'forbidden';
  end if;

  if p_class_id is not null and not exists (select 1 from public.classes c where c.id = p_class_id and c.school_id = v_event.school_id) then
    raise exception 'class_not_found';
  end if;

  v_form_id := public.ielts_resolve_exam_form(p_exam_event_id, p_form_id);

  insert into public.ielts_exam_assignments (exam_event_id, student_id, school_id, class_id, form_id, status)
  select v_event.id, u.id, v_event.school_id, p_class_id, v_form_id, 'assigned'
  from public.users u
  where u.id = any(p_student_ids)
    and u.school_id = v_event.school_id
    and (p_class_id is null or exists (
      select 1 from public.class_students cs where cs.class_id = p_class_id and cs.student_id = u.id
    ))
  on conflict (exam_event_id, student_id) do update
    set class_id = coalesce(excluded.class_id, public.ielts_exam_assignments.class_id),
        form_id = excluded.form_id,
        status = case when public.ielts_exam_assignments.status in ('submitted', 'auto_submitted') then public.ielts_exam_assignments.status else 'assigned' end;

  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then raise exception 'no_students_assigned'; end if;

  insert into public.ielts_exam_audit_log(actor_id, exam_event_id, action, payload)
  values (auth.uid(), p_exam_event_id, 'assign_exam_to_students', jsonb_build_object('class_id', p_class_id, 'form_id', v_form_id, 'student_count', cardinality(p_student_ids), 'affected_rows', v_inserted));

  return jsonb_build_object('exam_event_id', p_exam_event_id, 'form_id', v_form_id, 'assigned_count', v_inserted);
end;
$$;

create or replace function public.rpc_ielts_list_manageable_exams()
returns table (
  id uuid,
  school_id uuid,
  title text,
  description text,
  status text,
  starts_at timestamptz,
  ends_at timestamptz,
  duration_minutes int,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  active_form_id uuid,
  form_count bigint,
  assignment_count bigint,
  submitted_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  return query
  select
    e.id, e.school_id, e.title, e.description, e.status, e.starts_at, e.ends_at,
    e.duration_minutes, e.created_by, e.created_at, e.updated_at,
    af.id as active_form_id,
    coalesce(fc.form_count, 0)::bigint as form_count,
    coalesce(ac.assignment_count, 0)::bigint as assignment_count,
    coalesce(sc.submitted_count, 0)::bigint as submitted_count
  from public.ielts_exam_events e
  left join lateral (
    select f.id from public.ielts_exam_forms f where f.exam_event_id = e.id and f.is_active order by f.created_at desc limit 1
  ) af on true
  left join lateral (select count(*) as form_count from public.ielts_exam_forms f where f.exam_event_id = e.id) fc on true
  left join lateral (select count(*) as assignment_count from public.ielts_exam_assignments a where a.exam_event_id = e.id) ac on true
  left join lateral (select count(*) as submitted_count from public.ielts_exam_attempts a where a.exam_event_id = e.id and a.status in ('submitted', 'auto_submitted')) sc on true
  where public.can_manage_ielts_exam(e.id)
     or exists (
       select 1
       from public.ielts_exam_assignments a
       join public.class_teacher_assignments cta on cta.class_id = a.class_id
       where a.exam_event_id = e.id
         and cta.teacher_user_id = auth.uid()
         and coalesce(cta.active, true) = true
     )
  order by e.starts_at desc;
end;
$$;

create or replace function public.rpc_ielts_get_exam_admin_detail(p_exam_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.ielts_exam_events%rowtype;
  v_classes jsonb := '[]'::jsonb;
  v_students jsonb := '[]'::jsonb;
  v_forms jsonb := '[]'::jsonb;
  v_assignments jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_event from public.ielts_exam_events where id = p_exam_event_id;
  if v_event.id is null then raise exception 'exam_not_found'; end if;
  if not public.can_manage_ielts_exam(p_exam_event_id) and not public.can_monitor_ielts_exam(p_exam_event_id) then raise exception 'forbidden'; end if;

  select coalesce(jsonb_agg(to_jsonb(f) order by f.created_at desc), '[]'::jsonb)
  into v_forms
  from public.ielts_exam_forms f
  where f.exam_event_id = p_exam_event_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'school_id', c.school_id,
    'class_code', c.class_code,
    'class_name', c.class_name,
    'grade_level', c.grade_level,
    'is_active', c.is_active
  ) order by c.class_name), '[]'::jsonb)
  into v_classes
  from public.classes c
  where c.school_id = v_event.school_id
    and coalesce(c.is_active, true) = true
    and (
      public.can_manage_ielts_exam(p_exam_event_id)
      or exists (
        select 1 from public.class_teacher_assignments cta
        where cta.class_id = c.id and cta.teacher_user_id = auth.uid() and coalesce(cta.active, true) = true
      )
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'student_id', u.id,
    'username', u.username,
    'email', u.email,
    'class_id', cs.class_id,
    'class_name', c.class_name,
    'grade', u.grade,
    'batch', u.batch
  ) order by c.class_name, u.username), '[]'::jsonb)
  into v_students
  from public.users u
  left join public.class_students cs on cs.student_id = u.id
  left join public.classes c on c.id = cs.class_id
  where u.school_id = v_event.school_id
    and coalesce(u.role, 'student') = 'student'
    and (
      public.can_manage_ielts_exam(p_exam_event_id)
      or exists (
        select 1 from public.class_teacher_assignments cta
        where cta.class_id = cs.class_id and cta.teacher_user_id = auth.uid() and coalesce(cta.active, true) = true
      )
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'student_id', a.student_id,
    'username', u.username,
    'class_id', a.class_id,
    'class_name', c.class_name,
    'form_id', a.form_id,
    'status', a.status,
    'created_at', a.created_at
  ) order by a.created_at desc), '[]'::jsonb)
  into v_assignments
  from public.ielts_exam_assignments a
  join public.users u on u.id = a.student_id
  left join public.classes c on c.id = a.class_id
  where a.exam_event_id = p_exam_event_id;

  return jsonb_build_object(
    'exam', to_jsonb(v_event),
    'forms', v_forms,
    'classes', v_classes,
    'students', v_students,
    'assignments', v_assignments
  );
end;
$$;

comment on function public.rpc_ielts_create_exam_event(text, text, timestamptz, timestamptz, int, text, uuid) is 'Creates a controlled IELTS exam event for an authorized school admin/teacher/superadmin and audits the action.';
comment on function public.rpc_ielts_create_exam_form(uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, boolean) is 'Creates or updates an IELTS exam form. answer_key is available only to managers and never returned by student RPCs.';
comment on function public.rpc_ielts_assign_exam_to_class(uuid, uuid, uuid) is 'Assigns an IELTS exam to existing Brain Heist students in a class using an active exam form.';
comment on function public.rpc_ielts_assign_exam_to_students(uuid, uuid[], uuid, uuid) is 'Assigns an IELTS exam to selected existing Brain Heist students using an active exam form.';
comment on function public.rpc_ielts_list_manageable_exams() is 'Lists IELTS exam events manageable or monitorable by the current teacher/admin.';
comment on function public.rpc_ielts_get_exam_admin_detail(uuid) is 'Returns manager details for forms, school classes, students, and assignments for a controlled IELTS exam.';

grant execute on function public.can_create_ielts_exam(uuid) to authenticated;
grant execute on function public.can_assign_ielts_exam_class(uuid, uuid) to authenticated;
grant execute on function public.ielts_jsonb_contains_answer_key(jsonb) to authenticated;
grant execute on function public.ielts_resolve_exam_form(uuid, uuid) to authenticated;
grant execute on function public.rpc_ielts_create_exam_event(text, text, timestamptz, timestamptz, int, text, uuid) to authenticated;
grant execute on function public.rpc_ielts_create_exam_form(uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, boolean) to authenticated;
grant execute on function public.rpc_ielts_assign_exam_to_class(uuid, uuid, uuid) to authenticated;
grant execute on function public.rpc_ielts_assign_exam_to_students(uuid, uuid[], uuid, uuid) to authenticated;
grant execute on function public.rpc_ielts_list_manageable_exams() to authenticated;
grant execute on function public.rpc_ielts_get_exam_admin_detail(uuid) to authenticated;
