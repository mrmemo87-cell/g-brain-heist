-- IELTS Practice assignment edit/archive controls.
-- Adds manager-only metadata edits and safe lifecycle transitions without
-- deleting assignment rows, student rows, item progress, or item history.

create or replace function public.rpc_ielts_practice_update_assignment(
  p_assignment_id uuid,
  p_title text,
  p_description text default null,
  p_due_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment public.ielts_practice_assignments%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if nullif(trim(coalesce(p_title, '')), '') is null then raise exception 'title_required'; end if;

  select * into v_assignment
  from public.ielts_practice_assignments
  where id = p_assignment_id
  for update;

  if v_assignment.id is null then raise exception 'assignment_not_found'; end if;
  if not public.can_manage_ielts_practice_assignment(p_assignment_id) then raise exception 'forbidden'; end if;
  if v_assignment.status = 'archived' then raise exception 'assignment_archived'; end if;

  update public.ielts_practice_assignments
  set title = trim(p_title),
      description = nullif(trim(coalesce(p_description, '')), ''),
      due_at = p_due_at
  where id = p_assignment_id;

  return public.ielts_practice_assignment_payload(p_assignment_id);
end;
$$;

create or replace function public.rpc_ielts_practice_close_assignment(p_assignment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment public.ielts_practice_assignments%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  select * into v_assignment
  from public.ielts_practice_assignments
  where id = p_assignment_id
  for update;

  if v_assignment.id is null then raise exception 'assignment_not_found'; end if;
  if not public.can_manage_ielts_practice_assignment(p_assignment_id) then raise exception 'forbidden'; end if;
  if v_assignment.status = 'archived' then raise exception 'assignment_archived'; end if;

  update public.ielts_practice_assignments
  set status = 'closed'
  where id = p_assignment_id;

  return public.ielts_practice_assignment_payload(p_assignment_id);
end;
$$;

create or replace function public.rpc_ielts_practice_archive_assignment(p_assignment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment public.ielts_practice_assignments%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  select * into v_assignment
  from public.ielts_practice_assignments
  where id = p_assignment_id
  for update;

  if v_assignment.id is null then raise exception 'assignment_not_found'; end if;
  if not public.can_manage_ielts_practice_assignment(p_assignment_id) then raise exception 'forbidden'; end if;

  update public.ielts_practice_assignments
  set status = 'archived'
  where id = p_assignment_id;

  return public.ielts_practice_assignment_payload(p_assignment_id);
end;
$$;

create or replace function public.rpc_ielts_practice_list_assignments(p_school_id uuid default null, p_class_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select coalesce(p_school_id, u.school_id) into v_school_id from public.users u where u.id = auth.uid();
  if v_school_id is null then raise exception 'school_required'; end if;

  return coalesce((
    select jsonb_agg(public.ielts_practice_assignment_payload(a.id) order by a.created_at desc)
    from public.ielts_practice_assignments a
    where a.school_id = v_school_id
      and a.status <> 'archived'
      and (p_class_id is null or a.class_id = p_class_id)
      and public.can_manage_ielts_practice_class(a.school_id, a.class_id)
  ), '[]'::jsonb);
end;
$$;

create or replace function public.rpc_ielts_practice_student_assignments()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  return coalesce((
    select jsonb_agg(
      public.ielts_practice_assignment_payload(a.id)
      || jsonb_build_object(
        'student_assignment_id', s.id,
        'student_status', s.status,
        'completed_at', s.completed_at,
        'student_updated_at', s.updated_at
      ) order by s.created_at desc
    )
    from public.ielts_practice_assignment_students s
    join public.ielts_practice_assignments a on a.id = s.assignment_id
    where s.student_id = auth.uid()
      and a.status <> 'archived'
      and (a.status in ('assigned', 'closed') or s.status = 'completed')
  ), '[]'::jsonb);
end;
$$;

create or replace function public.rpc_ielts_practice_mark_started(p_assignment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment public.ielts_practice_assignments%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  select * into v_assignment
  from public.ielts_practice_assignments
  where id = p_assignment_id;
  if v_assignment.id is null then raise exception 'assignment_not_found'; end if;
  if v_assignment.status in ('closed', 'archived') then raise exception 'assignment_closed'; end if;

  update public.ielts_practice_assignment_students
  set status = case when status = 'completed' then status else 'in_progress' end
  where assignment_id = p_assignment_id
    and student_id = auth.uid();

  if not found then raise exception 'assignment_not_found'; end if;

  return (
    select public.ielts_practice_assignment_payload(a.id)
      || jsonb_build_object('student_assignment_id', s.id, 'student_status', s.status, 'completed_at', s.completed_at, 'student_updated_at', s.updated_at)
    from public.ielts_practice_assignment_students s
    join public.ielts_practice_assignments a on a.id = s.assignment_id
    where s.assignment_id = p_assignment_id and s.student_id = auth.uid()
  );
end;
$$;

create or replace function public.rpc_ielts_practice_mark_completed(p_assignment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment public.ielts_practice_assignments%rowtype;
  v_student_row public.ielts_practice_assignment_students%rowtype;
  v_required_count int := 0;
  v_incomplete_required_count int := 0;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  select * into v_assignment
  from public.ielts_practice_assignments
  where id = p_assignment_id;
  if v_assignment.id is null then raise exception 'assignment_not_found'; end if;
  if v_assignment.status in ('closed', 'archived') then raise exception 'assignment_closed'; end if;

  select * into v_student_row
  from public.ielts_practice_assignment_students
  where assignment_id = p_assignment_id
    and student_id = auth.uid();
  if v_student_row.id is null then raise exception 'assignment_not_found'; end if;

  select
    count(*) filter (where i.required = true),
    count(*) filter (where i.required = true and coalesce(item_s.status, 'assigned') <> 'completed')
  into v_required_count, v_incomplete_required_count
  from public.ielts_practice_assignment_items i
  left join public.ielts_practice_assignment_item_students item_s
    on item_s.assignment_item_id = i.id
    and item_s.student_id = auth.uid()
  where i.assignment_id = p_assignment_id;

  if coalesce(v_incomplete_required_count, 0) > 0 then
    raise exception 'required_items_incomplete';
  end if;

  update public.ielts_practice_assignment_students
  set status = 'completed',
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where assignment_id = p_assignment_id
    and student_id = auth.uid();

  return (
    select public.ielts_practice_assignment_payload(a.id)
      || jsonb_build_object('student_assignment_id', s.id, 'student_status', s.status, 'completed_at', s.completed_at, 'student_updated_at', s.updated_at)
    from public.ielts_practice_assignment_students s
    join public.ielts_practice_assignments a on a.id = s.assignment_id
    where s.assignment_id = p_assignment_id and s.student_id = auth.uid()
  );
end;
$$;

create or replace function public.rpc_ielts_practice_mark_item_started(
  p_assignment_id uuid,
  p_assignment_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment public.ielts_practice_assignments%rowtype;
begin
  select * into v_assignment from public.ielts_practice_assignments where id = p_assignment_id;
  if v_assignment.id is null then raise exception 'assignment_not_found'; end if;
  if v_assignment.status in ('closed', 'archived') then raise exception 'assignment_closed'; end if;

  perform public.ielts_practice_assert_item_progress_scope(p_assignment_id, p_assignment_item_id, auth.uid());

  insert into public.ielts_practice_assignment_item_students (
    assignment_id,
    assignment_item_id,
    student_id,
    status,
    started_at
  ) values (
    p_assignment_id,
    p_assignment_item_id,
    auth.uid(),
    'in_progress',
    now()
  )
  on conflict (assignment_item_id, student_id)
  do update set
    status = case
      when public.ielts_practice_assignment_item_students.status = 'completed' then 'completed'
      else 'in_progress'
    end,
    started_at = coalesce(public.ielts_practice_assignment_item_students.started_at, now());

  update public.ielts_practice_assignment_students
  set status = case when status = 'completed' then status else 'in_progress' end
  where assignment_id = p_assignment_id
    and student_id = auth.uid();

  return public.ielts_practice_assignment_progress_payload(p_assignment_id, auth.uid());
end;
$$;

create or replace function public.rpc_ielts_practice_mark_item_completed(
  p_assignment_id uuid,
  p_assignment_item_id uuid,
  p_practice_attempt_type text default null,
  p_practice_attempt_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment public.ielts_practice_assignments%rowtype;
begin
  select * into v_assignment from public.ielts_practice_assignments where id = p_assignment_id;
  if v_assignment.id is null then raise exception 'assignment_not_found'; end if;
  if v_assignment.status in ('closed', 'archived') then raise exception 'assignment_closed'; end if;

  perform public.ielts_practice_assert_item_progress_scope(p_assignment_id, p_assignment_item_id, auth.uid());

  insert into public.ielts_practice_assignment_item_students (
    assignment_id,
    assignment_item_id,
    student_id,
    status,
    practice_attempt_type,
    practice_attempt_id,
    started_at,
    completed_at
  ) values (
    p_assignment_id,
    p_assignment_item_id,
    auth.uid(),
    'completed',
    nullif(trim(p_practice_attempt_type), ''),
    p_practice_attempt_id,
    now(),
    now()
  )
  on conflict (assignment_item_id, student_id)
  do update set
    status = 'completed',
    practice_attempt_type = coalesce(nullif(trim(p_practice_attempt_type), ''), public.ielts_practice_assignment_item_students.practice_attempt_type),
    practice_attempt_id = coalesce(p_practice_attempt_id, public.ielts_practice_assignment_item_students.practice_attempt_id),
    started_at = coalesce(public.ielts_practice_assignment_item_students.started_at, now()),
    completed_at = coalesce(public.ielts_practice_assignment_item_students.completed_at, now());

  perform public.ielts_practice_sync_parent_completion(p_assignment_id, auth.uid());

  return public.ielts_practice_assignment_progress_payload(p_assignment_id, auth.uid());
end;
$$;

grant execute on function public.rpc_ielts_practice_update_assignment(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.rpc_ielts_practice_close_assignment(uuid) to authenticated;
grant execute on function public.rpc_ielts_practice_archive_assignment(uuid) to authenticated;
grant execute on function public.rpc_ielts_practice_list_assignments(uuid, uuid) to authenticated;
grant execute on function public.rpc_ielts_practice_student_assignments() to authenticated;
grant execute on function public.rpc_ielts_practice_mark_started(uuid) to authenticated;
grant execute on function public.rpc_ielts_practice_mark_completed(uuid) to authenticated;
grant execute on function public.rpc_ielts_practice_mark_item_started(uuid, uuid) to authenticated;
grant execute on function public.rpc_ielts_practice_mark_item_completed(uuid, uuid, text, uuid) to authenticated;
