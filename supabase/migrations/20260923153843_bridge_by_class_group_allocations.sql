
-- Teaching-group convergence: keep by-class allocations mirrored into the
-- legacy class_teacher_assignments compatibility table, while preserving
-- custom/whole-grade groups as true group-only concepts.

create or replace function private.sync_group_teacher_to_legacy_class_allocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_group public.school_subject_groups;
  v_offering public.school_subject_offerings;
  v_subject public.school_subjects;
  v_teacher_user_id uuid;
  v_active boolean;
  v_can_create boolean;
  v_can_grade boolean;
  v_created_by uuid;
  v_existing_id uuid;
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    v_teacher_user_id := old.teacher_user_id;
    v_active := false;
    v_can_create := old.can_create;
    v_can_grade := old.can_grade;
    v_created_by := old.created_by;
    select * into v_group
    from public.school_subject_groups
    where id = old.group_id and school_id = old.school_id;
  else
    v_teacher_user_id := new.teacher_user_id;
    v_active := new.active;
    v_can_create := new.can_create;
    v_can_grade := new.can_grade;
    v_created_by := new.created_by;
    select * into v_group
    from public.school_subject_groups
    where id = new.group_id and school_id = new.school_id;
  end if;

  if not found
     or v_group.group_type <> 'class'
     or v_group.registration_class_id is null then
    return coalesce(new, old);
  end if;

  select * into v_offering
  from public.school_subject_offerings
  where id = v_group.school_subject_offering_id
    and school_id = v_group.school_id;

  if not found or v_offering.delivery_mode <> 'by_class' then
    return coalesce(new, old);
  end if;

  select * into v_subject
  from public.school_subjects
  where id = v_offering.school_subject_id
    and school_id = v_group.school_id;

  if not found then
    return coalesce(new, old);
  end if;

  select cta.id into v_existing_id
  from public.class_teacher_assignments cta
  where cta.school_id = v_group.school_id
    and cta.class_id = v_group.registration_class_id
    and cta.teacher_user_id = v_teacher_user_id
    and cta.school_subject_id = v_subject.id
  order by cta.created_at desc, cta.id
  limit 1;

  if v_active
     and v_group.status = 'active'
     and v_offering.status = 'active'
     and v_subject.is_active then
    if v_existing_id is not null then
      update public.class_teacher_assignments
      set subject = v_subject.name,
          school_subject_id = v_subject.id,
          active = true,
          can_create = v_can_create,
          can_grade = v_can_grade
      where id = v_existing_id;
    else
      insert into public.class_teacher_assignments(
        school_id,
        class_id,
        teacher_user_id,
        subject,
        school_subject_id,
        can_create,
        can_grade,
        active,
        created_by
      )
      values (
        v_group.school_id,
        v_group.registration_class_id,
        v_teacher_user_id,
        v_subject.name,
        v_subject.id,
        v_can_create,
        v_can_grade,
        true,
        v_created_by
      )
      on conflict (class_id, teacher_user_id, subject)
      do update set
        school_id = excluded.school_id,
        school_subject_id = excluded.school_subject_id,
        can_create = excluded.can_create,
        can_grade = excluded.can_grade,
        active = true;
    end if;
  else
    update public.class_teacher_assignments
    set active = false,
        can_create = v_can_create,
        can_grade = v_can_grade
    where school_id = v_group.school_id
      and class_id = v_group.registration_class_id
      and teacher_user_id = v_teacher_user_id
      and school_subject_id = v_subject.id
      and active;
  end if;

  return coalesce(new, old);
end;
$function$;

revoke all on function private.sync_group_teacher_to_legacy_class_allocation()
from public, anon, authenticated, service_role;

drop trigger if exists sync_group_teacher_to_legacy_class_allocation
on public.school_subject_group_teachers;

create trigger sync_group_teacher_to_legacy_class_allocation
after insert or update of active, can_create, can_grade or delete
on public.school_subject_group_teachers
for each row
execute function private.sync_group_teacher_to_legacy_class_allocation();


create or replace function private.sync_legacy_class_allocation_to_group_teacher()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_school_id uuid;
  v_class_id uuid;
  v_teacher_user_id uuid;
  v_school_subject_id uuid;
  v_active boolean;
  v_can_create boolean;
  v_can_grade boolean;
  v_created_by uuid;
  v_grade text;
  v_year_id uuid;
  v_offering_id uuid;
  v_group_id uuid;
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    v_school_id := old.school_id;
    v_class_id := old.class_id;
    v_teacher_user_id := old.teacher_user_id;
    v_school_subject_id := old.school_subject_id;
    v_active := false;
    v_can_create := old.can_create;
    v_can_grade := old.can_grade;
    v_created_by := old.created_by;
  else
    v_school_id := new.school_id;
    v_class_id := new.class_id;
    v_teacher_user_id := new.teacher_user_id;
    v_school_subject_id := new.school_subject_id;
    v_active := new.active;
    v_can_create := new.can_create;
    v_can_grade := new.can_grade;
    v_created_by := new.created_by;
  end if;

  if v_school_subject_id is null then
    return coalesce(new, old);
  end if;

  select c.grade_level::text
  into v_grade
  from public.classes c
  where c.id = v_class_id
    and c.school_id = v_school_id;

  if v_grade is null then
    return coalesce(new, old);
  end if;

  v_year_id := public.academic_resolve_operational_year_id(v_school_id, now());

  select o.id into v_offering_id
  from public.school_subject_offerings o
  where o.school_id = v_school_id
    and o.school_subject_id = v_school_subject_id
    and o.academic_year_id = v_year_id
    and o.grade_level = v_grade
    and o.status = 'active'
    and o.delivery_mode = 'by_class'
  limit 1;

  if v_offering_id is null then
    return coalesce(new, old);
  end if;

  perform private.sync_subject_offering_groups(v_offering_id);

  select g.id into v_group_id
  from public.school_subject_groups g
  where g.school_id = v_school_id
    and g.school_subject_offering_id = v_offering_id
    and g.group_type = 'class'
    and g.registration_class_id = v_class_id
    and g.status = 'active'
  limit 1;

  if v_group_id is null then
    return coalesce(new, old);
  end if;

  if v_active then
    insert into public.school_subject_group_teachers(
      school_id,
      group_id,
      teacher_user_id,
      can_create,
      can_grade,
      active,
      created_by
    )
    values (
      v_school_id,
      v_group_id,
      v_teacher_user_id,
      v_can_create,
      v_can_grade,
      true,
      v_created_by
    )
    on conflict (group_id, teacher_user_id)
    do update set
      active = true,
      can_create = excluded.can_create,
      can_grade = excluded.can_grade,
      updated_at = now();
  else
    update public.school_subject_group_teachers
    set active = false,
        can_create = v_can_create,
        can_grade = v_can_grade,
        updated_at = now()
    where group_id = v_group_id
      and teacher_user_id = v_teacher_user_id
      and active;
  end if;

  return coalesce(new, old);
end;
$function$;

revoke all on function private.sync_legacy_class_allocation_to_group_teacher()
from public, anon, authenticated, service_role;

drop trigger if exists sync_legacy_class_allocation_to_group_teacher
on public.class_teacher_assignments;

create trigger sync_legacy_class_allocation_to_group_teacher
after insert or update of active, can_create, can_grade, school_subject_id, class_id, teacher_user_id or delete
on public.class_teacher_assignments
for each row
execute function private.sync_legacy_class_allocation_to_group_teacher();


-- Canonical current teaching-group scope helper.
create or replace function private.teacher_current_teaching_groups(
  p_teacher_user_id uuid,
  p_school_id uuid default null
)
returns table(
  school_id uuid,
  group_id uuid,
  group_name text,
  group_type text,
  registration_class_id uuid,
  school_subject_id uuid,
  school_subject_name text,
  academic_subject_id uuid,
  academic_subject_name text,
  academic_subject_code text,
  academic_year_id uuid,
  grade_level text,
  can_create boolean,
  can_grade boolean
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    g.school_id,
    g.id,
    g.name,
    g.group_type,
    g.registration_class_id,
    ss.id,
    ss.name,
    ss.academic_subject_id,
    a.name,
    a.code,
    o.academic_year_id,
    o.grade_level,
    gt.can_create,
    gt.can_grade
  from public.school_subject_group_teachers gt
  join public.school_subject_groups g
    on g.id = gt.group_id
   and g.school_id = gt.school_id
   and g.status = 'active'
  join public.school_subject_offerings o
    on o.id = g.school_subject_offering_id
   and o.school_id = g.school_id
   and o.status = 'active'
  join public.school_subjects ss
    on ss.id = o.school_subject_id
   and ss.school_id = o.school_id
   and ss.is_active
  left join public.academic_subjects a
    on a.id = ss.academic_subject_id
  join public.school_members sm
    on sm.school_id = gt.school_id
   and sm.user_id = gt.teacher_user_id
   and sm.status = 'active'
   and (sm.can_teach or sm.role_in_school = 'teacher')
  where gt.teacher_user_id = p_teacher_user_id
    and gt.active
    and (p_school_id is null or gt.school_id = p_school_id)
    and o.academic_year_id =
      public.academic_resolve_operational_year_id(o.school_id, now());
$function$;

revoke all on function private.teacher_current_teaching_groups(uuid,uuid)
from public, anon, authenticated, service_role;


create or replace function private.teacher_current_teaching_students(
  p_teacher_user_id uuid,
  p_school_id uuid default null
)
returns table(
  school_id uuid,
  group_id uuid,
  group_name text,
  group_type text,
  registration_class_id uuid,
  school_subject_id uuid,
  school_subject_name text,
  academic_subject_id uuid,
  academic_subject_name text,
  academic_subject_code text,
  academic_year_id uuid,
  grade_level text,
  can_create boolean,
  can_grade boolean,
  student_id uuid,
  class_id uuid,
  class_code text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    scope.school_id,
    scope.group_id,
    scope.group_name,
    scope.group_type,
    scope.registration_class_id,
    scope.school_subject_id,
    scope.school_subject_name,
    scope.academic_subject_id,
    scope.academic_subject_name,
    scope.academic_subject_code,
    scope.academic_year_id,
    scope.grade_level,
    scope.can_create,
    scope.can_grade,
    roster.student_id,
    roster.class_id,
    roster.class_code
  from private.teacher_current_teaching_groups(p_teacher_user_id,p_school_id) scope
  cross join lateral private.subject_group_roster(scope.group_id) roster;
$function$;

revoke all on function private.teacher_current_teaching_students(uuid,uuid)
from public, anon, authenticated, service_role;


-- Backfill compatibility rows from all active by-class group allocations.
do $block$
declare
  r record;
begin
  for r in
    select gt.*
    from public.school_subject_group_teachers gt
    join public.school_subject_groups g on g.id=gt.group_id
    join public.school_subject_offerings o on o.id=g.school_subject_offering_id
    where gt.active
      and g.status='active'
      and g.group_type='class'
      and g.registration_class_id is not null
      and o.status='active'
      and o.delivery_mode='by_class'
  loop
    -- Reuse the same deterministic sync logic by touching one permission flag
    -- to its current value.
    update public.school_subject_group_teachers
    set can_create = can_create
    where id = r.id;
  end loop;
end;
$block$;
