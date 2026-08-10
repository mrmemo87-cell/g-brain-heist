create unique index if not exists school_ops_group_one_active_student on public.school_ops_group_students(group_id, student_id) where valid_to is null;
create unique index if not exists school_ops_group_one_active_staff_role on public.school_ops_group_staff(group_id, staff_id, role) where valid_to is null;
create unique index if not exists school_ops_one_group_per_class on public.school_ops_teaching_groups(school_id, class_id) where class_id is not null;

create or replace function public.school_ops_sync_class_groups(p_school_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_groups integer := 0;
  v_students integer := 0;
  v_staff integer := 0;
begin
  if not public.is_school_admin_of(p_school_id) then
    raise exception 'not authorized';
  end if;

  insert into public.school_ops_teaching_groups(school_id,class_id,code,name,group_type,grade_label,active)
  select c.school_id,c.id,c.class_code,coalesce(nullif(c.class_name,''),c.class_code),'class',c.grade_level::text,true
  from public.classes c
  where c.school_id=p_school_id and c.is_active=true
  on conflict (school_id,class_id) where class_id is not null
  do update set code=excluded.code,name=excluded.name,grade_label=excluded.grade_label,active=true;
  get diagnostics v_groups = row_count;

  update public.school_ops_group_students gs
  set valid_to = greatest(gs.valid_from,current_date - 1)
  from public.school_ops_teaching_groups g
  where g.id=gs.group_id and g.school_id=p_school_id and g.class_id is not null and gs.valid_to is null
    and not exists(select 1 from public.class_students cs where cs.class_id=g.class_id and cs.student_id=gs.student_id);

  insert into public.school_ops_group_students(group_id,student_id,valid_from)
  select g.id,cs.student_id,current_date
  from public.school_ops_teaching_groups g
  join public.class_students cs on cs.class_id=g.class_id
  where g.school_id=p_school_id and g.class_id is not null and g.active=true
  on conflict (group_id,student_id) where valid_to is null do nothing;
  get diagnostics v_students = row_count;

  update public.school_ops_group_staff gs
  set valid_to = greatest(gs.valid_from,current_date - 1)
  from public.school_ops_teaching_groups g
  where g.id=gs.group_id and g.school_id=p_school_id and g.class_id is not null and gs.valid_to is null and gs.role='teacher'
    and not exists(select 1 from public.class_teacher_assignments a where a.school_id=p_school_id and a.class_id=g.class_id and a.teacher_user_id=gs.staff_id and a.active=true);

  insert into public.school_ops_group_staff(group_id,staff_id,role,valid_from)
  select distinct g.id,a.teacher_user_id,'teacher',current_date
  from public.school_ops_teaching_groups g
  join public.class_teacher_assignments a on a.class_id=g.class_id and a.school_id=p_school_id and a.active=true
  where g.school_id=p_school_id and g.class_id is not null and g.active=true
  on conflict (group_id,staff_id,role) where valid_to is null do nothing;
  get diagnostics v_staff = row_count;

  return jsonb_build_object('success',true,'groups_touched',v_groups,'students_added',v_students,'staff_added',v_staff);
end;
$$;

revoke all on function public.school_ops_sync_class_groups(uuid) from public,anon;
grant execute on function public.school_ops_sync_class_groups(uuid) to authenticated;
