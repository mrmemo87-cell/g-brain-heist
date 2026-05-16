-- Phase 2.8 repair: require item-level progress before student parent completion.
-- Parent completion now follows completed required assignment items; manual manager
-- completion is available only through an explicit school-scoped override RPC.

create table if not exists public.ielts_practice_assignment_completion_overrides (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.ielts_practice_assignments(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  overridden_by uuid not null references public.users(id) on delete restrict,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.ielts_practice_assignment_completion_overrides enable row level security;

drop policy if exists ielts_practice_completion_overrides_select_managers on public.ielts_practice_assignment_completion_overrides;
create policy ielts_practice_completion_overrides_select_managers
  on public.ielts_practice_assignment_completion_overrides for select to authenticated
  using (public.can_manage_ielts_practice_assignment(assignment_id));

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

create or replace function public.rpc_ielts_practice_force_complete_assignment(
  p_assignment_id uuid,
  p_student_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment public.ielts_practice_assignments%rowtype;
  v_student_row public.ielts_practice_assignment_students%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_student_id is null then raise exception 'student_required'; end if;

  select * into v_assignment
  from public.ielts_practice_assignments
  where id = p_assignment_id;
  if v_assignment.id is null then raise exception 'assignment_not_found'; end if;

  if not public.can_manage_ielts_practice_school(v_assignment.school_id) then
    raise exception 'forbidden';
  end if;

  select s.* into v_student_row
  from public.ielts_practice_assignment_students s
  join public.users u on u.id = s.student_id and u.school_id = v_assignment.school_id
  where s.assignment_id = p_assignment_id
    and s.student_id = p_student_id;
  if v_student_row.id is null then raise exception 'assignment_student_not_found'; end if;

  update public.ielts_practice_assignment_students
  set status = 'completed',
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where assignment_id = p_assignment_id
    and student_id = p_student_id;

  insert into public.ielts_practice_assignment_completion_overrides (
    assignment_id,
    student_id,
    overridden_by,
    reason
  ) values (
    p_assignment_id,
    p_student_id,
    auth.uid(),
    nullif(trim(p_reason), '')
  );

  return (
    select public.ielts_practice_assignment_payload(a.id)
      || jsonb_build_object('student_assignment_id', s.id, 'student_status', s.status, 'completed_at', s.completed_at, 'student_updated_at', s.updated_at)
    from public.ielts_practice_assignment_students s
    join public.ielts_practice_assignments a on a.id = s.assignment_id
    where s.assignment_id = p_assignment_id and s.student_id = p_student_id
  );
end;
$$;

grant execute on function public.rpc_ielts_practice_mark_completed(uuid) to authenticated;
grant execute on function public.rpc_ielts_practice_force_complete_assignment(uuid, uuid, text) to authenticated;
