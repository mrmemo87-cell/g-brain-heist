-- Keep teaching groups synchronized with active subject offerings and registration classes.
-- Production migration version: 20260923145910.
-- This is idempotent, preserves valid existing groups/allocations, and leaves
-- custom groups school-managed.

create or replace function private.sync_subject_offering_groups(p_offering_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_offering record;
  v_actor uuid := auth.uid();
begin
  select
    o.id,
    o.school_id,
    o.grade_level,
    o.delivery_mode,
    o.status,
    o.created_by,
    ss.name as subject_name
  into v_offering
  from public.school_subject_offerings o
  join public.school_subjects ss
    on ss.id = o.school_subject_id
   and ss.school_id = o.school_id
  where o.id = p_offering_id
  for share of o;

  if not found then
    return;
  end if;

  if v_offering.status <> 'active' then
    update public.school_subject_groups g
       set status = 'archived'
     where g.school_subject_offering_id = v_offering.id
       and g.status = 'active';
    return;
  end if;

  if v_offering.delivery_mode = 'by_class' then
    update public.school_subject_groups g
       set status = 'archived'
     where g.school_subject_offering_id = v_offering.id
       and g.status = 'active'
       and (
         g.group_type <> 'class'
         or not exists (
           select 1
           from public.classes c
           where c.id = g.registration_class_id
             and c.school_id = v_offering.school_id
             and c.grade_level = v_offering.grade_level
             and coalesce(c.is_active, true)
         )
       );

    insert into public.school_subject_groups (
      school_id,
      school_subject_offering_id,
      name,
      group_type,
      registration_class_id,
      status,
      sort_order,
      created_by
    )
    select
      v_offering.school_id,
      v_offering.id,
      left(
        format(
          '%s · %s',
          coalesce(nullif(trim(c.class_code), ''), nullif(trim(c.class_name), ''), 'Class'),
          v_offering.subject_name
        ),
        160
      ),
      'class',
      c.id,
      'active',
      0,
      coalesce(v_actor, v_offering.created_by)
    from public.classes c
    where c.school_id = v_offering.school_id
      and c.grade_level = v_offering.grade_level
      and coalesce(c.is_active, true)
      and not exists (
        select 1
        from public.school_subject_groups g
        where g.school_subject_offering_id = v_offering.id
          and g.registration_class_id = c.id
          and g.group_type = 'class'
          and g.status = 'active'
      )
    on conflict (school_subject_offering_id, registration_class_id)
      where status = 'active' and group_type = 'class'
    do nothing;

  elsif v_offering.delivery_mode = 'whole_grade' then
    update public.school_subject_groups g
       set status = 'archived'
     where g.school_subject_offering_id = v_offering.id
       and g.status = 'active'
       and g.group_type <> 'whole_grade';

    insert into public.school_subject_groups (
      school_id,
      school_subject_offering_id,
      name,
      group_type,
      registration_class_id,
      status,
      sort_order,
      created_by
    )
    select
      v_offering.school_id,
      v_offering.id,
      left(format('Grade %s · %s', v_offering.grade_level, v_offering.subject_name), 160),
      'whole_grade',
      null,
      'active',
      0,
      coalesce(v_actor, v_offering.created_by)
    where not exists (
      select 1
      from public.school_subject_groups g
      where g.school_subject_offering_id = v_offering.id
        and g.group_type = 'whole_grade'
        and g.status = 'active'
    )
    on conflict (school_subject_offering_id)
      where status = 'active' and group_type = 'whole_grade'
    do nothing;

  elsif v_offering.delivery_mode = 'custom_groups' then
    update public.school_subject_groups g
       set status = 'archived'
     where g.school_subject_offering_id = v_offering.id
       and g.status = 'active'
       and g.group_type <> 'custom';
  end if;
end;
$function$;

revoke all on function private.sync_subject_offering_groups(uuid)
from public, anon, authenticated;

create or replace function private.sync_subject_offering_groups_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.sync_subject_offering_groups(new.id);
  return new;
end;
$function$;

revoke all on function private.sync_subject_offering_groups_after_write()
from public, anon, authenticated;

drop trigger if exists sync_subject_offering_groups_after_write
on public.school_subject_offerings;

create trigger sync_subject_offering_groups_after_write
after insert or update of school_id, school_subject_id, academic_year_id, grade_level, delivery_mode, status
on public.school_subject_offerings
for each row
execute function private.sync_subject_offering_groups_after_write();

create or replace function private.sync_subject_groups_after_class_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_offering_id uuid;
begin
  if tg_op = 'UPDATE' then
    for v_offering_id in
      select o.id
      from public.school_subject_offerings o
      where o.status = 'active'
        and o.delivery_mode = 'by_class'
        and o.school_id = old.school_id
        and o.grade_level = old.grade_level
    loop
      perform private.sync_subject_offering_groups(v_offering_id);
    end loop;
  end if;

  for v_offering_id in
    select o.id
    from public.school_subject_offerings o
    where o.status = 'active'
      and o.delivery_mode = 'by_class'
      and o.school_id = new.school_id
      and o.grade_level = new.grade_level
  loop
    perform private.sync_subject_offering_groups(v_offering_id);
  end loop;

  return new;
end;
$function$;

revoke all on function private.sync_subject_groups_after_class_write()
from public, anon, authenticated;

drop trigger if exists sync_subject_groups_after_class_write
on public.classes;

create trigger sync_subject_groups_after_class_write
after insert or update of school_id, grade_level, is_active, class_code, class_name
on public.classes
for each row
execute function private.sync_subject_groups_after_class_write();

do $block$
declare
  v_offering_id uuid;
begin
  for v_offering_id in
    select id
    from public.school_subject_offerings
    where status = 'active'
  loop
    perform private.sync_subject_offering_groups(v_offering_id);
  end loop;
end;
$block$;
