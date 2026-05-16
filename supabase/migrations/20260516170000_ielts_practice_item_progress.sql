-- Phase 2.8 IELTS Practice: item-level progress tracking for school assignments.
-- This migration tracks per-student progress for individual assignment items and
-- deliberately avoids reading legacy IELTS answer data.

create table if not exists public.ielts_practice_assignment_item_students (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.ielts_practice_assignments(id) on delete cascade,
  assignment_item_id uuid not null references public.ielts_practice_assignment_items(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'assigned' check (status in ('assigned', 'in_progress', 'completed', 'skipped')),
  practice_attempt_type text,
  practice_attempt_id uuid,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (assignment_item_id, student_id)
);

create index if not exists idx_ielts_practice_item_students_assignment_student
  on public.ielts_practice_assignment_item_students(assignment_id, student_id);
create index if not exists idx_ielts_practice_item_students_item
  on public.ielts_practice_assignment_item_students(assignment_item_id);
create index if not exists idx_ielts_practice_item_students_student_updated
  on public.ielts_practice_assignment_item_students(student_id, updated_at desc);
create index if not exists idx_ielts_practice_item_students_status
  on public.ielts_practice_assignment_item_students(assignment_id, status);

alter table public.ielts_practice_assignment_item_students enable row level security;

drop policy if exists ielts_practice_item_students_select_scoped on public.ielts_practice_assignment_item_students;
create policy ielts_practice_item_students_select_scoped
  on public.ielts_practice_assignment_item_students for select to authenticated
  using (
    student_id = auth.uid()
    or public.can_manage_ielts_practice_assignment(assignment_id)
  );

-- Student item progress writes are intentionally handled through the SECURITY DEFINER
-- RPCs below so callers cannot mutate assignment ownership, completion timestamps,
-- or practice attempt linkage directly.

drop trigger if exists trg_ielts_practice_assignment_item_students_updated_at on public.ielts_practice_assignment_item_students;
create trigger trg_ielts_practice_assignment_item_students_updated_at
  before update on public.ielts_practice_assignment_item_students
  for each row execute function public.ielts_practice_touch_updated_at();

-- Seed item rows for assignments that already existed before this migration.
insert into public.ielts_practice_assignment_item_students (
  assignment_id,
  assignment_item_id,
  student_id,
  status,
  started_at,
  completed_at
)
select
  s.assignment_id,
  i.id,
  s.student_id,
  case when s.status = 'completed' then 'completed' else 'assigned' end,
  case when s.status in ('in_progress', 'completed') then s.updated_at else null end,
  case when s.status = 'completed' then s.completed_at else null end
from public.ielts_practice_assignment_students s
join public.ielts_practice_assignment_items i on i.assignment_id = s.assignment_id
on conflict (assignment_item_id, student_id) do nothing;

create or replace function public.ielts_practice_assert_item_progress_scope(
  p_assignment_id uuid,
  p_assignment_item_id uuid,
  p_student_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_student_id <> auth.uid() then raise exception 'forbidden'; end if;

  if not exists (
    select 1
    from public.ielts_practice_assignment_items i
    where i.id = p_assignment_item_id
      and i.assignment_id = p_assignment_id
  ) then
    raise exception 'assignment_item_not_found';
  end if;

  if not exists (
    select 1
    from public.ielts_practice_assignment_students s
    join public.ielts_practice_assignments a on a.id = s.assignment_id
    where s.assignment_id = p_assignment_id
      and s.student_id = p_student_id
      and a.status in ('assigned', 'closed')
  ) then
    raise exception 'assignment_not_found';
  end if;
end;
$$;

create or replace function public.ielts_practice_sync_parent_completion(
  p_assignment_id uuid,
  p_student_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.ielts_practice_assignment_items i
    where i.assignment_id = p_assignment_id
      and i.required = true
  )
  and not exists (
    select 1
    from public.ielts_practice_assignment_items i
    left join public.ielts_practice_assignment_item_students item_s
      on item_s.assignment_item_id = i.id
      and item_s.student_id = p_student_id
    where i.assignment_id = p_assignment_id
      and i.required = true
      and coalesce(item_s.status, 'assigned') <> 'completed'
  ) then
    update public.ielts_practice_assignment_students
    set status = 'completed', completed_at = coalesce(completed_at, now())
    where assignment_id = p_assignment_id
      and student_id = p_student_id;
  else
    update public.ielts_practice_assignment_students
    set status = case when status = 'completed' then status else 'in_progress' end
    where assignment_id = p_assignment_id
      and student_id = p_student_id;
  end if;
end;
$$;

create or replace function public.ielts_practice_assignment_progress_payload(
  p_assignment_id uuid,
  p_student_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_manager boolean;
  v_target_student uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  v_is_manager := public.can_manage_ielts_practice_assignment(p_assignment_id);
  v_target_student := coalesce(p_student_id, auth.uid());

  if not v_is_manager and v_target_student <> auth.uid() then
    raise exception 'forbidden';
  end if;

  if not v_is_manager and not exists (
    select 1 from public.ielts_practice_assignment_students s
    where s.assignment_id = p_assignment_id and s.student_id = auth.uid()
  ) then
    raise exception 'assignment_not_found';
  end if;

  if v_is_manager and p_student_id is null then
    return jsonb_build_object(
      'assignment_id', p_assignment_id,
      'required_count', coalesce((select count(*) from public.ielts_practice_assignment_items i where i.assignment_id = p_assignment_id and i.required = true), 0),
      'item_count', coalesce((select count(*) from public.ielts_practice_assignment_items i where i.assignment_id = p_assignment_id), 0),
      'students', coalesce((
        select jsonb_agg(jsonb_build_object(
          'student_id', s.student_id,
          'student_status', s.status,
          'completed_at', s.completed_at,
          'required_count', coalesce(required_counts.required_count, 0),
          'completed_required_count', coalesce(required_counts.completed_required_count, 0),
          'item_count', coalesce(required_counts.item_count, 0),
          'completed_item_count', coalesce(required_counts.completed_item_count, 0),
          'all_required_completed', coalesce(required_counts.required_count, 0) > 0 and coalesce(required_counts.required_count, 0) = coalesce(required_counts.completed_required_count, 0)
        ) order by s.updated_at desc)
        from public.ielts_practice_assignment_students s
        left join lateral (
          select
            count(*) filter (where i.required = true) as required_count,
            count(*) filter (where i.required = true and item_s.status = 'completed') as completed_required_count,
            count(*) as item_count,
            count(*) filter (where item_s.status = 'completed') as completed_item_count
          from public.ielts_practice_assignment_items i
          left join public.ielts_practice_assignment_item_students item_s
            on item_s.assignment_item_id = i.id
            and item_s.student_id = s.student_id
          where i.assignment_id = p_assignment_id
        ) required_counts on true
        where s.assignment_id = p_assignment_id
      ), '[]'::jsonb)
    );
  end if;

  return jsonb_build_object(
    'assignment_id', p_assignment_id,
    'student_id', v_target_student,
    'student_status', (select s.status from public.ielts_practice_assignment_students s where s.assignment_id = p_assignment_id and s.student_id = v_target_student),
    'assignment_completed_at', (select s.completed_at from public.ielts_practice_assignment_students s where s.assignment_id = p_assignment_id and s.student_id = v_target_student),
    'required_count', coalesce((select count(*) from public.ielts_practice_assignment_items i where i.assignment_id = p_assignment_id and i.required = true), 0),
    'completed_required_count', coalesce((
      select count(*)
      from public.ielts_practice_assignment_items i
      join public.ielts_practice_assignment_item_students item_s on item_s.assignment_item_id = i.id
      where i.assignment_id = p_assignment_id
        and i.required = true
        and item_s.student_id = v_target_student
        and item_s.status = 'completed'
    ), 0),
    'item_count', coalesce((select count(*) from public.ielts_practice_assignment_items i where i.assignment_id = p_assignment_id), 0),
    'completed_item_count', coalesce((
      select count(*)
      from public.ielts_practice_assignment_items i
      join public.ielts_practice_assignment_item_students item_s on item_s.assignment_item_id = i.id
      where i.assignment_id = p_assignment_id
        and item_s.student_id = v_target_student
        and item_s.status = 'completed'
    ), 0),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'assignment_item_id', i.id,
        'skill', i.skill,
        'content_type', i.content_type,
        'content_id', i.content_id,
        'title', i.title,
        'required', i.required,
        'order_index', i.order_index,
        'status', coalesce(item_s.status, 'assigned'),
        'practice_attempt_type', item_s.practice_attempt_type,
        'practice_attempt_id', item_s.practice_attempt_id,
        'started_at', item_s.started_at,
        'completed_at', item_s.completed_at,
        'updated_at', item_s.updated_at
      ) order by i.order_index, i.created_at)
      from public.ielts_practice_assignment_items i
      left join public.ielts_practice_assignment_item_students item_s
        on item_s.assignment_item_id = i.id
        and item_s.student_id = v_target_student
      where i.assignment_id = p_assignment_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.rpc_ielts_practice_assignment_progress(
  p_assignment_id uuid,
  p_student_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.ielts_practice_assignment_progress_payload(p_assignment_id, p_student_id);
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
begin
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
begin
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

-- Add safe manager item-progress summaries to assignment detail without exposing legacy answers.
create or replace function public.rpc_ielts_practice_assignment_detail(p_assignment_id uuid)
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
  if not found then raise exception 'assignment_not_found'; end if;
  if not public.can_manage_ielts_practice_assignment(p_assignment_id) then raise exception 'forbidden'; end if;

  return jsonb_build_object(
    'assignment', public.ielts_practice_assignment_payload(p_assignment_id),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'assignment_id', i.assignment_id,
        'skill', i.skill,
        'content_type', i.content_type,
        'content_id', i.content_id,
        'title', i.title,
        'required', i.required,
        'order_index', i.order_index,
        'created_at', i.created_at,
        'assigned_count', coalesce(item_counts.assigned_count, 0),
        'in_progress_count', coalesce(item_counts.in_progress_count, 0),
        'completed_count', coalesce(item_counts.completed_count, 0),
        'skipped_count', coalesce(item_counts.skipped_count, 0)
      ) order by i.order_index, i.created_at)
      from public.ielts_practice_assignment_items i
      left join lateral (
        select
          count(*) filter (where coalesce(item_s.status, 'assigned') = 'assigned') as assigned_count,
          count(*) filter (where item_s.status = 'in_progress') as in_progress_count,
          count(*) filter (where item_s.status = 'completed') as completed_count,
          count(*) filter (where item_s.status = 'skipped') as skipped_count
        from public.ielts_practice_assignment_students s
        left join public.ielts_practice_assignment_item_students item_s
          on item_s.assignment_item_id = i.id
          and item_s.student_id = s.student_id
        where s.assignment_id = p_assignment_id
      ) item_counts on true
      where i.assignment_id = p_assignment_id
    ), '[]'::jsonb),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'student_id', s.student_id,
        'username', u.username,
        'email', u.email,
        'class_id', u.class_id,
        'class_name', c.name,
        'status', s.status,
        'completed_at', s.completed_at,
        'updated_at', s.updated_at,
        'required_count', coalesce(progress_counts.required_count, 0),
        'completed_required_count', coalesce(progress_counts.completed_required_count, 0),
        'item_count', coalesce(progress_counts.item_count, 0),
        'completed_item_count', coalesce(progress_counts.completed_item_count, 0)
      ) order by s.updated_at desc)
      from public.ielts_practice_assignment_students s
      left join public.users u on u.id = s.student_id
      left join public.classes c on c.id = u.class_id
      left join lateral (
        select
          count(*) filter (where i.required = true) as required_count,
          count(*) filter (where i.required = true and item_s.status = 'completed') as completed_required_count,
          count(*) as item_count,
          count(*) filter (where item_s.status = 'completed') as completed_item_count
        from public.ielts_practice_assignment_items i
        left join public.ielts_practice_assignment_item_students item_s
          on item_s.assignment_item_id = i.id
          and item_s.student_id = s.student_id
        where i.assignment_id = p_assignment_id
      ) progress_counts on true
      where s.assignment_id = p_assignment_id
    ), '[]'::jsonb),
    'item_progress', public.ielts_practice_assignment_progress_payload(p_assignment_id, null)
  );
end;
$$;

revoke execute on function public.ielts_practice_assert_item_progress_scope(uuid, uuid, uuid) from public;
revoke execute on function public.ielts_practice_assert_item_progress_scope(uuid, uuid, uuid) from authenticated;
revoke execute on function public.ielts_practice_sync_parent_completion(uuid, uuid) from public;
revoke execute on function public.ielts_practice_sync_parent_completion(uuid, uuid) from authenticated;
revoke execute on function public.ielts_practice_assignment_progress_payload(uuid, uuid) from public;
revoke execute on function public.ielts_practice_assignment_progress_payload(uuid, uuid) from authenticated;

grant execute on function public.rpc_ielts_practice_assignment_progress(uuid, uuid) to authenticated;
grant execute on function public.rpc_ielts_practice_mark_item_started(uuid, uuid) to authenticated;
grant execute on function public.rpc_ielts_practice_mark_item_completed(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.rpc_ielts_practice_assignment_detail(uuid) to authenticated;
