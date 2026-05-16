-- Phase 2 IELTS Academy: school-scoped practice assignment foundation.
--
-- This migration intentionally does not modify legacy IELTS Practice Mode content
-- tables. Assignment items reference existing IELTS practice content by opaque
-- content_type/content_id values and never select or return protected answer data.

create extension if not exists pgcrypto;

create table if not exists public.ielts_practice_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  assigned_by uuid not null references public.users(id) on delete restrict,
  title text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'assigned', 'closed', 'archived')),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(title)) > 0)
);

create table if not exists public.ielts_practice_assignment_items (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.ielts_practice_assignments(id) on delete cascade,
  skill text not null check (skill in ('reading', 'listening', 'writing', 'speaking')),
  content_type text not null check (content_type in ('ielts_reading_set', 'ielts_listening_set', 'ielts_writing_task', 'ielts_speaking_task')),
  content_id text not null,
  title text,
  required boolean not null default true,
  order_index int not null default 0,
  created_at timestamptz not null default now(),
  check (length(trim(content_id)) > 0)
);

create table if not exists public.ielts_practice_assignment_students (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.ielts_practice_assignments(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'assigned' check (status in ('assigned', 'in_progress', 'completed', 'overdue', 'excused')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, student_id)
);

create index if not exists idx_ielts_practice_assignments_school on public.ielts_practice_assignments(school_id, created_at desc);
create index if not exists idx_ielts_practice_assignments_class on public.ielts_practice_assignments(class_id, created_at desc);
create index if not exists idx_ielts_practice_assignment_items_assignment on public.ielts_practice_assignment_items(assignment_id, order_index);
create index if not exists idx_ielts_practice_assignment_students_assignment on public.ielts_practice_assignment_students(assignment_id);
create index if not exists idx_ielts_practice_assignment_students_student on public.ielts_practice_assignment_students(student_id, created_at desc);

create or replace function public.ielts_practice_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ielts_practice_assignments_updated_at on public.ielts_practice_assignments;
create trigger trg_ielts_practice_assignments_updated_at
  before update on public.ielts_practice_assignments
  for each row execute function public.ielts_practice_touch_updated_at();

drop trigger if exists trg_ielts_practice_assignment_students_updated_at on public.ielts_practice_assignment_students;
create trigger trg_ielts_practice_assignment_students_updated_at
  before update on public.ielts_practice_assignment_students
  for each row execute function public.ielts_practice_touch_updated_at();

create or replace function public.can_manage_ielts_practice_school(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_superadmin(auth.uid())
    or exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and (
          coalesce(u.is_admin, false) = true
          or coalesce(u.role, '') in ('admin', 'superadmin')
          or (coalesce(u.role, '') = 'school_admin' and u.school_id = p_school_id)
        )
    )
    or exists (
      select 1
      from public.school_members sm
      where sm.school_id = p_school_id
        and sm.user_id = auth.uid()
        and sm.status = 'active'
        and sm.role_in_school in ('school_admin', 'admin', 'superadmin')
    );
$$;

create or replace function public.can_manage_ielts_practice_class(p_school_id uuid, p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_ielts_practice_school(p_school_id)
    or (
      p_class_id is not null
      and exists (
        select 1
        from public.classes c
        join public.class_teacher_assignments cta on cta.class_id = c.id
        where c.id = p_class_id
          and c.school_id = p_school_id
          and coalesce(c.is_active, true) = true
          and cta.teacher_user_id = auth.uid()
          and coalesce(cta.active, true) = true
      )
    );
$$;

create or replace function public.can_manage_ielts_practice_assignment(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.ielts_practice_assignments a
    where a.id = p_assignment_id
      and public.can_manage_ielts_practice_class(a.school_id, a.class_id)
  );
$$;

create or replace function public.can_view_ielts_practice_assignment(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_ielts_practice_assignment(p_assignment_id)
    or exists (
      select 1
      from public.ielts_practice_assignment_students s
      where s.assignment_id = p_assignment_id
        and s.student_id = auth.uid()
    );
$$;

alter table public.ielts_practice_assignments enable row level security;
alter table public.ielts_practice_assignment_items enable row level security;
alter table public.ielts_practice_assignment_students enable row level security;

drop policy if exists ielts_practice_assignments_select_scoped on public.ielts_practice_assignments;
create policy ielts_practice_assignments_select_scoped
  on public.ielts_practice_assignments for select to authenticated
  using (
    public.can_manage_ielts_practice_class(school_id, class_id)
    or exists (
      select 1 from public.ielts_practice_assignment_students s
      where s.assignment_id = ielts_practice_assignments.id and s.student_id = auth.uid()
    )
  );

drop policy if exists ielts_practice_assignments_manage_scoped on public.ielts_practice_assignments;
create policy ielts_practice_assignments_manage_scoped
  on public.ielts_practice_assignments for all to authenticated
  using (public.can_manage_ielts_practice_class(school_id, class_id))
  with check (public.can_manage_ielts_practice_class(school_id, class_id));

drop policy if exists ielts_practice_items_select_scoped on public.ielts_practice_assignment_items;
create policy ielts_practice_items_select_scoped
  on public.ielts_practice_assignment_items for select to authenticated
  using (public.can_view_ielts_practice_assignment(assignment_id));

drop policy if exists ielts_practice_items_manage_scoped on public.ielts_practice_assignment_items;
create policy ielts_practice_items_manage_scoped
  on public.ielts_practice_assignment_items for all to authenticated
  using (public.can_manage_ielts_practice_assignment(assignment_id))
  with check (public.can_manage_ielts_practice_assignment(assignment_id));

drop policy if exists ielts_practice_students_select_scoped on public.ielts_practice_assignment_students;
create policy ielts_practice_students_select_scoped
  on public.ielts_practice_assignment_students for select to authenticated
  using (
    student_id = auth.uid()
    or public.can_manage_ielts_practice_assignment(assignment_id)
  );

drop policy if exists ielts_practice_students_manage_scoped on public.ielts_practice_assignment_students;
create policy ielts_practice_students_manage_scoped
  on public.ielts_practice_assignment_students for all to authenticated
  using (public.can_manage_ielts_practice_assignment(assignment_id))
  with check (public.can_manage_ielts_practice_assignment(assignment_id));

-- Student progress updates are intentionally handled through RPCs below so
-- callers cannot mutate assignment ownership columns directly.

create or replace function public.ielts_practice_assignment_payload(p_assignment_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', a.id,
    'school_id', a.school_id,
    'class_id', a.class_id,
    'class_name', c.class_name,
    'assigned_by', a.assigned_by,
    'title', a.title,
    'description', a.description,
    'status', a.status,
    'due_at', a.due_at,
    'created_at', a.created_at,
    'updated_at', a.updated_at,
    'total_students', coalesce(count(s.id), 0),
    'assigned_count', coalesce(count(s.id) filter (where s.status = 'assigned'), 0),
    'in_progress_count', coalesce(count(s.id) filter (where s.status = 'in_progress'), 0),
    'completed_count', coalesce(count(s.id) filter (where s.status = 'completed'), 0),
    'overdue_count', coalesce(count(s.id) filter (where s.status = 'overdue' or (a.due_at is not null and a.due_at < now() and s.status not in ('completed', 'excused'))), 0),
    'excused_count', coalesce(count(s.id) filter (where s.status = 'excused'), 0),
    'completion_percent', case
      when count(s.id) = 0 then 0
      else round((count(s.id) filter (where s.status = 'completed'))::numeric * 100 / count(s.id), 1)
    end,
    'item_count', coalesce((select count(*) from public.ielts_practice_assignment_items i where i.assignment_id = a.id), 0),
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
        'created_at', i.created_at
      ) order by i.order_index, i.created_at)
      from public.ielts_practice_assignment_items i
      where i.assignment_id = a.id
    ), '[]'::jsonb)
  )
  from public.ielts_practice_assignments a
  left join public.classes c on c.id = a.class_id
  left join public.ielts_practice_assignment_students s on s.assignment_id = a.id
  where a.id = p_assignment_id
  group by a.id, c.class_name;
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
      and (p_class_id is null or a.class_id = p_class_id)
      and public.can_manage_ielts_practice_class(a.school_id, a.class_id)
  ), '[]'::jsonb);
end;
$$;

create or replace function public.rpc_ielts_practice_create_assignment(
  p_school_id uuid,
  p_class_id uuid,
  p_title text,
  p_description text default null,
  p_due_at timestamptz default null,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment public.ielts_practice_assignments%rowtype;
  v_item jsonb;
  v_order int := 0;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_school_id is null then raise exception 'school_required'; end if;
  if nullif(trim(coalesce(p_title, '')), '') is null then raise exception 'title_required'; end if;
  if p_class_id is not null and not exists (select 1 from public.classes c where c.id = p_class_id and c.school_id = p_school_id and coalesce(c.is_active, true)) then
    raise exception 'class_not_found';
  end if;
  if not public.can_manage_ielts_practice_class(p_school_id, p_class_id) then raise exception 'forbidden'; end if;

  insert into public.ielts_practice_assignments (school_id, class_id, assigned_by, title, description, due_at, status)
  values (p_school_id, p_class_id, auth.uid(), trim(p_title), p_description, p_due_at, 'draft')
  returning * into v_assignment;

  for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    insert into public.ielts_practice_assignment_items (
      assignment_id, skill, content_type, content_id, title, required, order_index
    ) values (
      v_assignment.id,
      v_item->>'skill',
      v_item->>'content_type',
      v_item->>'content_id',
      nullif(v_item->>'title', ''),
      coalesce((v_item->>'required')::boolean, true),
      coalesce((v_item->>'order_index')::int, v_order)
    );
    v_order := v_order + 1;
  end loop;

  return public.ielts_practice_assignment_payload(v_assignment.id);
end;
$$;

create or replace function public.rpc_ielts_practice_assign_to_class(p_assignment_id uuid, p_class_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment public.ielts_practice_assignments%rowtype;
  v_class_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_assignment from public.ielts_practice_assignments where id = p_assignment_id for update;
  if v_assignment.id is null then raise exception 'assignment_not_found'; end if;
  v_class_id := coalesce(p_class_id, v_assignment.class_id);
  if v_class_id is null then raise exception 'class_required'; end if;
  if not public.can_manage_ielts_practice_class(v_assignment.school_id, v_class_id) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.classes c where c.id = v_class_id and c.school_id = v_assignment.school_id and coalesce(c.is_active, true)) then raise exception 'class_not_found'; end if;

  update public.ielts_practice_assignments
  set class_id = v_class_id, status = 'assigned'
  where id = p_assignment_id;

  insert into public.ielts_practice_assignment_students (assignment_id, student_id, status)
  select p_assignment_id, cs.student_id, 'assigned'
  from public.class_students cs
  join public.users u on u.id = cs.student_id
  where cs.class_id = v_class_id
    and u.school_id = v_assignment.school_id
    and coalesce(u.role, 'student') = 'student'
  on conflict (assignment_id, student_id) do nothing;

  return public.ielts_practice_assignment_payload(p_assignment_id);
end;
$$;

create or replace function public.rpc_ielts_practice_assign_to_students(p_assignment_id uuid, p_student_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment public.ielts_practice_assignments%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_assignment from public.ielts_practice_assignments where id = p_assignment_id for update;
  if v_assignment.id is null then raise exception 'assignment_not_found'; end if;
  if not public.can_manage_ielts_practice_assignment(p_assignment_id) then raise exception 'forbidden'; end if;

  insert into public.ielts_practice_assignment_students (assignment_id, student_id, status)
  select p_assignment_id, u.id, 'assigned'
  from public.users u
  where u.id = any(coalesce(p_student_ids, array[]::uuid[]))
    and u.school_id = v_assignment.school_id
    and coalesce(u.role, 'student') = 'student'
    and (
      v_assignment.class_id is null
      or exists (select 1 from public.class_students cs where cs.class_id = v_assignment.class_id and cs.student_id = u.id)
    )
  on conflict (assignment_id, student_id) do nothing;

  update public.ielts_practice_assignments set status = 'assigned' where id = p_assignment_id;
  return public.ielts_practice_assignment_payload(p_assignment_id);
end;
$$;


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

  if v_assignment.id is null then raise exception 'assignment_not_found'; end if;
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
        'created_at', i.created_at
      ) order by i.order_index, i.created_at)
      from public.ielts_practice_assignment_items i
      where i.assignment_id = p_assignment_id
    ), '[]'::jsonb),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'student_id', s.student_id,
        'username', u.username,
        'email', u.email,
        'class_id', v_assignment.class_id,
        'class_name', c.class_name,
        'status', case
          when s.status not in ('completed', 'excused') and v_assignment.due_at is not null and v_assignment.due_at < now() then 'overdue'
          else s.status
        end,
        'completed_at', s.completed_at,
        'updated_at', s.updated_at
      ) order by c.class_name nulls last, u.username nulls last, u.email nulls last)
      from public.ielts_practice_assignment_students s
      join public.users u on u.id = s.student_id and u.school_id = v_assignment.school_id
      left join public.classes c on c.id = v_assignment.class_id and c.school_id = v_assignment.school_id
      where s.assignment_id = p_assignment_id
    ), '[]'::jsonb)
  );
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
        'completed_at', s.completed_at
      ) order by s.created_at desc
    )
    from public.ielts_practice_assignment_students s
    join public.ielts_practice_assignments a on a.id = s.assignment_id
    where s.student_id = auth.uid()
      and a.status in ('assigned', 'closed')
  ), '[]'::jsonb);
end;
$$;

create or replace function public.rpc_ielts_practice_mark_started(p_assignment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  update public.ielts_practice_assignment_students
  set status = case when status = 'completed' then status else 'in_progress' end
  where assignment_id = p_assignment_id
    and student_id = auth.uid();

  if not found then raise exception 'assignment_not_found'; end if;

  return (
    select public.ielts_practice_assignment_payload(a.id)
      || jsonb_build_object('student_assignment_id', s.id, 'student_status', s.status, 'completed_at', s.completed_at)
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
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  update public.ielts_practice_assignment_students
  set status = 'completed', completed_at = coalesce(completed_at, now())
  where assignment_id = p_assignment_id
    and student_id = auth.uid();

  if not found then raise exception 'assignment_not_found'; end if;

  return (
    select public.ielts_practice_assignment_payload(a.id)
      || jsonb_build_object('student_assignment_id', s.id, 'student_status', s.status, 'completed_at', s.completed_at)
    from public.ielts_practice_assignment_students s
    join public.ielts_practice_assignments a on a.id = s.assignment_id
    where s.assignment_id = p_assignment_id and s.student_id = auth.uid()
  );
end;
$$;

grant execute on function public.can_manage_ielts_practice_school(uuid) to authenticated;
grant execute on function public.can_manage_ielts_practice_class(uuid, uuid) to authenticated;
grant execute on function public.can_manage_ielts_practice_assignment(uuid) to authenticated;
grant execute on function public.can_view_ielts_practice_assignment(uuid) to authenticated;
grant execute on function public.rpc_ielts_practice_list_assignments(uuid, uuid) to authenticated;
grant execute on function public.rpc_ielts_practice_create_assignment(uuid, uuid, text, text, timestamptz, jsonb) to authenticated;
grant execute on function public.rpc_ielts_practice_assign_to_class(uuid, uuid) to authenticated;
grant execute on function public.rpc_ielts_practice_assign_to_students(uuid, uuid[]) to authenticated;
grant execute on function public.rpc_ielts_practice_assignment_detail(uuid) to authenticated;
grant execute on function public.rpc_ielts_practice_student_assignments() to authenticated;
grant execute on function public.rpc_ielts_practice_mark_started(uuid) to authenticated;
grant execute on function public.rpc_ielts_practice_mark_completed(uuid) to authenticated;
