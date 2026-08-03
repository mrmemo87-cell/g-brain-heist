-- Make a student's current class placement single-source, auditable, and safe.
--
-- Historical assessment/report rows are deliberately untouched. class_students
-- represents current placement; users.grade/users.batch are synchronized mirrors.

create table if not exists public.school_student_placement_audit (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_user_id uuid not null references public.users(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  from_class_ids uuid[] not null default array[]::uuid[],
  to_class_id uuid references public.classes(id) on delete set null,
  previous_grade text,
  new_grade text,
  previous_batch text,
  new_batch text,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists school_student_placement_audit_lookup_idx
  on public.school_student_placement_audit (school_id, student_user_id, created_at desc);

alter table public.school_student_placement_audit enable row level security;
revoke all on table public.school_student_placement_audit from public, anon, authenticated, service_role;
grant select on table public.school_student_placement_audit to authenticated;
grant all on table public.school_student_placement_audit to service_role;

drop policy if exists school_admins_read_student_placement_audit
  on public.school_student_placement_audit;
create policy school_admins_read_student_placement_audit
  on public.school_student_placement_audit
  for select
  to authenticated
  using (public.can_administer_school(school_id));

comment on table public.school_student_placement_audit is
  'Append-only history of current class placement changes. Direct client writes are denied.';

-- Reconcile existing same-school duplicates before enforcing the invariant. The
-- deterministic order favours the profile's class code, then year, active status,
-- newest membership, and finally a stable UUID tie-breaker.
create temporary table placement_reconciliation on commit drop as
with ranked as (
  select
    u.id as student_user_id,
    u.school_id,
    u.grade as previous_grade,
    u.batch as previous_batch,
    c.id as class_id,
    c.grade_level as new_grade,
    c.class_code as new_batch,
    array(
      select cs2.class_id
      from public.class_students cs2
      join public.classes c2 on c2.id = cs2.class_id and c2.school_id = u.school_id
      where cs2.student_id = u.id
      order by cs2.joined_at desc nulls last, cs2.class_id
    ) as from_class_ids,
    count(*) over (partition by u.id) as class_count,
    row_number() over (
      partition by u.id
      order by
        (upper(regexp_replace(coalesce(u.batch, ''), '\s+', '', 'g')) =
          upper(regexp_replace(coalesce(c.class_code, ''), '\s+', '', 'g'))) desc,
        (trim(coalesce(u.grade, '')) = trim(coalesce(c.grade_level, ''))) desc,
        coalesce(c.is_active, false) desc,
        cs.joined_at desc nulls last,
        c.id
    ) as placement_rank
  from public.users u
  join public.class_students cs on cs.student_id = u.id
  join public.classes c on c.id = cs.class_id and c.school_id = u.school_id
)
select
  student_user_id,
  school_id,
  previous_grade,
  previous_batch,
  class_id as canonical_class_id,
  new_grade,
  new_batch,
  from_class_ids,
  class_count
from ranked
where placement_rank = 1;

insert into public.school_student_placement_audit (
  school_id,
  student_user_id,
  actor_user_id,
  from_class_ids,
  to_class_id,
  previous_grade,
  new_grade,
  previous_batch,
  new_batch,
  reason
)
select
  school_id,
  student_user_id,
  null,
  from_class_ids,
  canonical_class_id,
  previous_grade,
  new_grade,
  previous_batch,
  new_batch,
  'migration_reconciliation'
from placement_reconciliation
where class_count > 1
   or previous_grade is distinct from new_grade
   or previous_batch is distinct from new_batch;

delete from public.class_students cs
using public.classes c, placement_reconciliation r
where cs.class_id = c.id
  and cs.student_id = r.student_user_id
  and c.school_id = r.school_id
  and cs.class_id <> r.canonical_class_id;

update public.users u
set grade = r.new_grade,
    batch = r.new_batch
from placement_reconciliation r
where u.id = r.student_user_id
  and (
    u.grade is distinct from r.new_grade
    or u.batch is distinct from r.new_batch
  );

do $$
begin
  if exists (
    select 1
    from public.class_students
    group by student_id
    having count(*) > 1
  ) then
    raise exception 'Placement reconciliation stopped: ambiguous cross-school class memberships remain';
  end if;
end;
$$;

create unique index if not exists class_students_one_current_class_per_student_idx
  on public.class_students (student_id);

-- This is the canonical placement write path. The destination class supplies
-- grade and batch; callers cannot submit a contradictory year group.
create or replace function public.move_student_between_classes(
  p_student_id uuid,
  p_from_class_id uuid,
  p_to_class_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_to_class public.classes%rowtype;
  v_student_school_id uuid;
  v_student_name text;
  v_previous_grade text;
  v_previous_batch text;
  v_from_school_id uuid;
  v_from_class_ids uuid[] := array[]::uuid[];
  v_audit_id uuid;
begin
  if v_actor_id is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;

  select *
  into v_to_class
  from public.classes
  where id = p_to_class_id
    and coalesce(is_active, false);

  if not found then
    return jsonb_build_object('success', false, 'error', 'Choose an active destination class');
  end if;

  if not public.can_administer_school(v_to_class.school_id) then
    return jsonb_build_object('success', false, 'error', 'Only an active school administrator can change placement');
  end if;

  select u.school_id, u.username, u.grade, u.batch
  into v_student_school_id, v_student_name, v_previous_grade, v_previous_batch
  from public.users u
  where u.id = p_student_id
  for update;

  if not found or v_student_school_id is distinct from v_to_class.school_id then
    return jsonb_build_object('success', false, 'error', 'Student is not in the destination school');
  end if;

  if not exists (
    select 1
    from public.school_members sm
    where sm.school_id = v_to_class.school_id
      and sm.user_id = p_student_id
      and sm.status = 'active'
      and sm.role_in_school = 'student'
  ) then
    return jsonb_build_object('success', false, 'error', 'Student does not have an active student membership');
  end if;

  if p_from_class_id is not null then
    select c.school_id
    into v_from_school_id
    from public.classes c
    where c.id = p_from_class_id;

    if not found or v_from_school_id is distinct from v_to_class.school_id then
      return jsonb_build_object('success', false, 'error', 'Source and destination classes must belong to the same school');
    end if;
  end if;

  select coalesce(array_agg(cs.class_id order by cs.joined_at, cs.class_id), array[]::uuid[])
  into v_from_class_ids
  from public.class_students cs
  where cs.student_id = p_student_id;

  if cardinality(v_from_class_ids) = 1
     and v_from_class_ids[1] = p_to_class_id
     and v_previous_grade is not distinct from v_to_class.grade_level
     and v_previous_batch is not distinct from v_to_class.class_code then
    return jsonb_build_object(
      'success', true,
      'message', 'Student is already in the destination class',
      'grade', v_to_class.grade_level,
      'batch', v_to_class.class_code
    );
  end if;

  delete from public.class_students
  where student_id = p_student_id;

  insert into public.class_students (class_id, student_id)
  values (p_to_class_id, p_student_id);

  update public.users
  set grade = v_to_class.grade_level,
      batch = v_to_class.class_code
  where id = p_student_id;

  insert into public.school_student_placement_audit (
    school_id,
    student_user_id,
    actor_user_id,
    from_class_ids,
    to_class_id,
    previous_grade,
    new_grade,
    previous_batch,
    new_batch,
    reason
  ) values (
    v_to_class.school_id,
    p_student_id,
    v_actor_id,
    v_from_class_ids,
    p_to_class_id,
    v_previous_grade,
    v_to_class.grade_level,
    v_previous_batch,
    v_to_class.class_code,
    case when cardinality(v_from_class_ids) = 0 then 'assigned' else 'moved' end
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'success', true,
    'message', format('Student %s placed in class %s', v_student_name, v_to_class.class_code),
    'placement_audit_id', v_audit_id,
    'grade', v_to_class.grade_level,
    'batch', v_to_class.class_code
  );
end;
$$;

-- Compatibility path for older deployed clients. p_grade is intentionally
-- ignored: the destination class is the only source of placement metadata.
create or replace function public.school_admin_move_student_to_class(
  p_student_id uuid,
  p_class_id uuid,
  p_grade smallint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.move_student_between_classes(p_student_id, null, p_class_id);
end;
$$;

create or replace function public.add_student_to_class(p_class_id uuid, p_student_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.move_student_between_classes(p_student_id, null, p_class_id);
$$;

create or replace function public.remove_student_from_class(p_class_id uuid, p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_school_id uuid;
  v_previous_grade text;
  v_previous_batch text;
  v_audit_id uuid;
begin
  select c.school_id
  into v_school_id
  from public.classes c
  where c.id = p_class_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Class not found');
  end if;

  if v_actor_id is null or not public.can_administer_school(v_school_id) then
    return jsonb_build_object('success', false, 'error', 'Only an active school administrator can remove placement');
  end if;

  select u.grade, u.batch
  into v_previous_grade, v_previous_batch
  from public.users u
  where u.id = p_student_id
    and u.school_id = v_school_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Student is not in this school');
  end if;

  delete from public.class_students
  where class_id = p_class_id
    and student_id = p_student_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Student was not placed in this class');
  end if;

  update public.users
  set batch = null
  where id = p_student_id;

  insert into public.school_student_placement_audit (
    school_id, student_user_id, actor_user_id, from_class_ids, to_class_id,
    previous_grade, new_grade, previous_batch, new_batch, reason
  ) values (
    v_school_id, p_student_id, v_actor_id, array[p_class_id], null,
    v_previous_grade, v_previous_grade, v_previous_batch, null, 'unassigned'
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'success', true,
    'message', 'Student removed from class',
    'placement_audit_id', v_audit_id
  );
end;
$$;

create or replace function public.bulk_add_students_to_class(p_class_id uuid, p_student_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school_id uuid;
  v_student_id uuid;
  v_result jsonb;
  v_added integer := 0;
  v_skipped integer := 0;
begin
  select c.school_id into v_school_id from public.classes c where c.id = p_class_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Class not found');
  end if;
  if not public.can_administer_school(v_school_id) then
    return jsonb_build_object('success', false, 'error', 'Only an active school administrator can change placement');
  end if;

  foreach v_student_id in array coalesce(p_student_ids, array[]::uuid[])
  loop
    v_result := public.move_student_between_classes(v_student_id, null, p_class_id);
    if coalesce((v_result ->> 'success')::boolean, false) then
      v_added := v_added + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'success', true,
    'added', v_added,
    'skipped', v_skipped,
    'message', format('Placed %s students (skipped %s)', v_added, v_skipped)
  );
end;
$$;

create or replace function public.bulk_remove_students_from_class(p_class_id uuid, p_student_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school_id uuid;
  v_student_id uuid;
  v_result jsonb;
  v_removed integer := 0;
  v_skipped integer := 0;
begin
  select c.school_id into v_school_id from public.classes c where c.id = p_class_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Class not found');
  end if;
  if not public.can_administer_school(v_school_id) then
    return jsonb_build_object('success', false, 'error', 'Only an active school administrator can remove placement');
  end if;

  foreach v_student_id in array coalesce(p_student_ids, array[]::uuid[])
  loop
    v_result := public.remove_student_from_class(p_class_id, v_student_id);
    if coalesce((v_result ->> 'success')::boolean, false) then
      v_removed := v_removed + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'success', true,
    'removed', v_removed,
    'skipped', v_skipped,
    'message', format('Removed %s students (skipped %s)', v_removed, v_skipped)
  );
end;
$$;

create or replace function public.auto_enroll_students_by_grade(p_class_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class public.classes%rowtype;
  v_student_id uuid;
  v_result jsonb;
  v_enrolled integer := 0;
begin
  select *
  into v_class
  from public.classes
  where id = p_class_id
    and coalesce(is_active, false);

  if not found then
    return jsonb_build_object('success', false, 'error', 'Choose an active class');
  end if;

  if not public.can_administer_school(v_class.school_id) then
    return jsonb_build_object('success', false, 'error', 'Only an active school administrator can auto-enrol students');
  end if;

  for v_student_id in
    select u.id
    from public.users u
    join public.school_members sm
      on sm.user_id = u.id
     and sm.school_id = v_class.school_id
     and sm.status = 'active'
     and sm.role_in_school = 'student'
    where u.school_id = v_class.school_id
      and trim(coalesce(u.grade, '')) = trim(coalesce(v_class.grade_level, ''))
      and not coalesce(u.is_banned, false)
      and not exists (
        select 1 from public.class_students cs where cs.student_id = u.id
      )
  loop
    v_result := public.move_student_between_classes(v_student_id, null, p_class_id);
    if coalesce((v_result ->> 'success')::boolean, false) then
      v_enrolled := v_enrolled + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'success', true,
    'enrolled', v_enrolled,
    'message', format('Auto-enrolled %s unassigned students matching year %s', v_enrolled, v_class.grade_level)
  );
end;
$$;

revoke all on function public.move_student_between_classes(uuid, uuid, uuid) from public, anon;
revoke all on function public.school_admin_move_student_to_class(uuid, uuid, smallint) from public, anon;
revoke all on function public.add_student_to_class(uuid, uuid) from public, anon;
revoke all on function public.remove_student_from_class(uuid, uuid) from public, anon;
revoke all on function public.bulk_add_students_to_class(uuid, uuid[]) from public, anon;
revoke all on function public.bulk_remove_students_from_class(uuid, uuid[]) from public, anon;
revoke all on function public.auto_enroll_students_by_grade(uuid) from public, anon;

grant execute on function public.move_student_between_classes(uuid, uuid, uuid) to authenticated;
grant execute on function public.school_admin_move_student_to_class(uuid, uuid, smallint) to authenticated;
grant execute on function public.add_student_to_class(uuid, uuid) to authenticated;
grant execute on function public.remove_student_from_class(uuid, uuid) to authenticated;
grant execute on function public.bulk_add_students_to_class(uuid, uuid[]) to authenticated;
grant execute on function public.bulk_remove_students_from_class(uuid, uuid[]) to authenticated;
grant execute on function public.auto_enroll_students_by_grade(uuid) to authenticated;

notify pgrst, 'reload schema';
