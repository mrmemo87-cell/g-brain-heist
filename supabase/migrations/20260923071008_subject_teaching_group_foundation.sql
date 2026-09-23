-- Additive foundation. Does not infer teacher intent, migrate ambiguous legacy
-- allocations, rewrite assignments, or change any existing RPC contract.
-- Rollout is gated by docs/subject-teaching-groups-rollout.md.

alter table public.school_subject_offerings
  add column delivery_mode text not null default 'by_class'
  check (delivery_mode in ('by_class','whole_grade','custom_groups'));

create unique index school_subject_offerings_id_school_uq
  on public.school_subject_offerings(id,school_id);

create table public.school_subject_groups (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  school_subject_offering_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 160),
  group_type text not null check (group_type in ('class','whole_grade','custom')),
  registration_class_id uuid references public.classes(id) on delete restrict,
  status text not null default 'active' check (status in ('active','archived')),
  sort_order integer not null default 0,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_subject_offering_id,school_id)
    references public.school_subject_offerings(id,school_id) on delete restrict,
  unique(id,school_id),
  check ((group_type='class') = (registration_class_id is not null))
);
create unique index subject_groups_active_name_uq
  on public.school_subject_groups(school_subject_offering_id,lower(trim(name))) where status='active';
create unique index subject_groups_active_class_uq
  on public.school_subject_groups(school_subject_offering_id,registration_class_id)
  where status='active' and group_type='class';
create unique index subject_groups_active_grade_uq
  on public.school_subject_groups(school_subject_offering_id)
  where status='active' and group_type='whole_grade';
create index subject_groups_school_status_idx on public.school_subject_groups(school_id,status);
create index subject_groups_offering_idx on public.school_subject_groups(school_subject_offering_id);
create index subject_groups_class_idx on public.school_subject_groups(registration_class_id);
create index subject_groups_creator_idx on public.school_subject_groups(created_by);

create table public.school_subject_group_students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  group_id uuid not null,
  student_id uuid not null references public.users(id) on delete restrict,
  status text not null default 'active' check (status in ('active','withdrawn')),
  starts_on date not null default current_date,
  ends_on date,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (group_id,school_id) references public.school_subject_groups(id,school_id) on delete restrict,
  check (ends_on is null or ends_on>=starts_on)
);
create unique index subject_group_students_active_uq
  on public.school_subject_group_students(group_id,student_id) where status='active';
create index subject_group_students_group_status_idx on public.school_subject_group_students(group_id,status);
create index subject_group_students_student_idx on public.school_subject_group_students(student_id);
create index subject_group_students_school_idx on public.school_subject_group_students(school_id);
create index subject_group_students_creator_idx on public.school_subject_group_students(created_by);

create table public.school_subject_group_teachers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  group_id uuid not null,
  teacher_user_id uuid not null references public.users(id) on delete restrict,
  can_create boolean not null default true,
  can_grade boolean not null default true,
  active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (group_id,school_id) references public.school_subject_groups(id,school_id) on delete restrict,
  unique(group_id,teacher_user_id)
);
create index subject_group_teachers_teacher_idx on public.school_subject_group_teachers(teacher_user_id,active);
create index subject_group_teachers_school_idx on public.school_subject_group_teachers(school_id);
create index subject_group_teachers_creator_idx on public.school_subject_group_teachers(created_by);

alter table public.school_subject_groups enable row level security;
alter table public.school_subject_group_students enable row level security;
alter table public.school_subject_group_teachers enable row level security;
-- Only checked RPCs expose these tables. No school-wide authenticated read policy.
revoke all on public.school_subject_groups,public.school_subject_group_students,public.school_subject_group_teachers from public,anon,authenticated;
grant select,insert,update,delete on public.school_subject_groups,public.school_subject_group_students,public.school_subject_group_teachers to service_role;

alter table public.assignments
  add column subject_group_id uuid references public.school_subject_groups(id) on delete restrict,
  add column subject_group_name_snapshot text;
create index assignments_subject_group_idx on public.assignments(subject_group_id);
create index assignments_school_group_idx on public.assignments(school_id,subject_group_id,assigned_at desc);

-- Roster authority is shared by admin preview, teacher reads and assignment auth.
-- This private helper is deliberately not callable by Data API roles.
create or replace function private.subject_offering_eligible_students(p_offering_id uuid)
returns table(student_id uuid,class_id uuid,class_code text)
language sql stable security definer set search_path=''
as $$
  select distinct u.id,c.id,c.class_code
  from public.school_subject_offerings o
  join public.school_subjects s on s.id=o.school_subject_id and s.school_id=o.school_id and s.is_active
  join public.school_academic_years y on y.id=o.academic_year_id and y.school_id=o.school_id
  join public.student_academic_enrolments ae on ae.school_id=o.school_id
    and ae.academic_year_id=o.academic_year_id and ae.grade_level=o.grade_level
    and ae.starts_on<=current_date and (ae.ends_on is null or ae.ends_on>=current_date)
  join public.school_members sm on sm.school_id=o.school_id and sm.user_id=ae.student_id
    and sm.status='active' and sm.role_in_school='student'
  join public.users u on u.id=sm.user_id and not coalesce(u.is_banned,false)
    and (u.banned_until is null or u.banned_until<=now())
  join public.class_students cs on cs.student_id=u.id and cs.class_id=ae.class_id
  join public.classes c on c.id=cs.class_id and c.school_id=o.school_id
    and c.grade_level=o.grade_level and coalesce(c.is_active,true)
  where o.id=p_offering_id and o.status='active'
    and o.academic_year_id=public.academic_resolve_operational_year_id(o.school_id,now())
    and (o.access_mode='all_grade' or exists (
      select 1 from public.school_subject_enrolments e
      where e.school_id=o.school_id and e.school_subject_id=o.school_subject_id
        and e.academic_year_id=o.academic_year_id and e.student_id=u.id and e.status='active'
        and e.starts_on<=current_date and (e.ends_on is null or e.ends_on>=current_date)
    ));
$$;
revoke all on function private.subject_offering_eligible_students(uuid) from public,anon,authenticated,service_role;

create or replace function private.subject_group_roster(p_group_id uuid)
returns table(student_id uuid,class_id uuid,class_code text)
language sql stable security definer set search_path=''
as $$
  select r.student_id,r.class_id,r.class_code
  from public.school_subject_groups g
  cross join lateral private.subject_offering_eligible_students(g.school_subject_offering_id) r
  where g.id=p_group_id and g.status='active' and (
    (g.group_type='class' and r.class_id=g.registration_class_id)
    or g.group_type='whole_grade'
    or (g.group_type='custom' and exists (
      select 1 from public.school_subject_group_students m
      where m.group_id=g.id and m.school_id=g.school_id and m.student_id=r.student_id
        and m.status='active' and m.starts_on<=current_date and (m.ends_on is null or m.ends_on>=current_date)
    ))
  );
$$;
revoke all on function private.subject_group_roster(uuid) from public,anon,authenticated,service_role;

create or replace function private.teacher_group_authorized_students(
  p_teacher_user_id uuid,p_group_id uuid,p_student_ids uuid[] default null
)
returns table(student_id uuid,class_id uuid,class_code text)
language sql stable security definer set search_path=''
as $$
  select r.student_id,r.class_id,r.class_code
  from public.school_subject_groups g
  join public.school_subject_group_teachers t on t.group_id=g.id and t.school_id=g.school_id
    and t.teacher_user_id=p_teacher_user_id and t.active and t.can_create
  join public.school_members sm on sm.school_id=g.school_id and sm.user_id=t.teacher_user_id
    and sm.status='active' and (sm.can_teach or sm.role_in_school='teacher')
  cross join lateral private.subject_group_roster(g.id) r
  where g.id=p_group_id and (p_student_ids is null or r.student_id=any(p_student_ids));
$$;
revoke all on function private.teacher_group_authorized_students(uuid,uuid,uuid[]) from public,anon,authenticated,service_role;

create or replace function private.validate_subject_group()
returns trigger language plpgsql security definer set search_path=''
as $$
declare o public.school_subject_offerings;
begin
  select * into o from public.school_subject_offerings where id=new.school_subject_offering_id and school_id=new.school_id for share;
  if not found then raise exception 'subject_offering_not_in_school'; end if;
  if tg_op='UPDATE' and (new.school_subject_offering_id<>old.school_subject_offering_id
    or new.school_id<>old.school_id or new.group_type<>old.group_type
    or new.registration_class_id is distinct from old.registration_class_id) then
    raise exception 'group_identity_is_immutable_create_replacement';
  end if;
  if new.status='active' then
    if o.status<>'active' or not exists(select 1 from public.school_subjects s where s.id=o.school_subject_id and s.school_id=o.school_id and s.is_active) then
      raise exception 'subject_offering_is_archived';
    end if;
    if new.group_type<>(case o.delivery_mode when 'by_class' then 'class' when 'whole_grade' then 'whole_grade' else 'custom' end) then
      raise exception 'group_type_does_not_match_delivery';
    end if;
    if new.group_type='class' and not exists(select 1 from public.classes c where c.id=new.registration_class_id and c.school_id=new.school_id and c.grade_level=o.grade_level and coalesce(c.is_active,true)) then
      raise exception 'registration_class_not_in_offering_grade';
    end if;
  end if;
  new.name:=trim(new.name); new.updated_at:=now(); return new;
end;
$$;
revoke all on function private.validate_subject_group() from public,anon,authenticated,service_role;
create trigger validate_subject_group before insert or update on public.school_subject_groups for each row execute function private.validate_subject_group();

create or replace function private.validate_subject_group_member()
returns trigger language plpgsql security definer set search_path=''
as $$
declare g public.school_subject_groups;
begin
  select * into g from public.school_subject_groups where id=new.group_id and school_id=new.school_id for share;
  if not found then raise exception 'subject_group_not_in_school'; end if;
  if tg_op='UPDATE' and (new.group_id<>old.group_id or new.school_id<>old.school_id) then raise exception 'group_membership_identity_is_immutable'; end if;
  if tg_table_name='school_subject_group_students' then
    if tg_op='UPDATE' and new.student_id<>old.student_id then raise exception 'group_student_identity_is_immutable'; end if;
    if new.status='active' then
      if g.status<>'active' or g.group_type<>'custom' then raise exception 'explicit_rosters_require_active_custom_group'; end if;
      if not exists(select 1 from private.subject_offering_eligible_students(g.school_subject_offering_id) r where r.student_id=new.student_id) then
        raise exception 'student_not_eligible_for_subject_group';
      end if;
    end if;
  else
    if tg_op='UPDATE' and new.teacher_user_id<>old.teacher_user_id then raise exception 'group_teacher_identity_is_immutable'; end if;
    if new.active and (g.status<>'active' or not exists(select 1 from public.school_members sm where sm.school_id=g.school_id and sm.user_id=new.teacher_user_id and sm.status='active' and (sm.can_teach or sm.role_in_school='teacher'))) then
      raise exception 'teacher_not_available_for_subject_group';
    end if;
  end if;
  new.updated_at:=now(); return new;
end;
$$;
revoke all on function private.validate_subject_group_member() from public,anon,authenticated,service_role;
create trigger validate_subject_group_student before insert or update on public.school_subject_group_students for each row execute function private.validate_subject_group_member();
create trigger validate_subject_group_teacher before insert or update on public.school_subject_group_teachers for each row execute function private.validate_subject_group_member();

-- Keep historical group identity, but immediately stop active use after archival.
create or replace function private.archive_subject_group_dependents()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.status='archived' and old.status<>'archived' then
    update public.school_subject_group_teachers set active=false where group_id=new.id and active;
    update public.school_subject_group_students set status='withdrawn',ends_on=greatest(starts_on,current_date) where group_id=new.id and status='active';
  end if;
  return new;
end;
$$;
revoke all on function private.archive_subject_group_dependents() from public,anon,authenticated,service_role;
create trigger archive_subject_group_dependents after update of status on public.school_subject_groups for each row execute function private.archive_subject_group_dependents();

create or replace function private.guard_subject_group_offering_change()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if (new.status='archived' and old.status<>'archived') or new.delivery_mode<>old.delivery_mode then
    update public.school_subject_groups set status='archived' where school_subject_offering_id=new.id and status='active';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_subject_group_offering_change() from public,anon,authenticated,service_role;
create trigger guard_subject_group_offering_change before update of status,delivery_mode on public.school_subject_offerings for each row execute function private.guard_subject_group_offering_change();

-- Guard group-based assignment identity even if a privileged write bypasses RPCs.
create or replace function private.validate_assignment_subject_group()
returns trigger language plpgsql security definer set search_path=''
as $$
declare g public.school_subject_groups; o public.school_subject_offerings; v_teacher_user_id uuid;
begin
  if tg_op='UPDATE' and old.subject_group_id is not null and (new.subject_group_id is distinct from old.subject_group_id or new.school_subject_id is distinct from old.school_subject_id or new.school_id is distinct from old.school_id or new.academic_year_id is distinct from old.academic_year_id) then
    raise exception 'published_group_assignment_identity_is_immutable';
  end if;
  if new.subject_group_id is null then return new; end if;
  -- The integrated assignment RPC and audience guard must replace this gate
  -- before any frontend switches to group publication. Fail closed meanwhile.
  if tg_op='INSERT' then raise exception 'teaching_group_assignment_rollout_not_enabled'; end if;
  if tg_op='UPDATE' and old.subject_group_id is null then raise exception 'legacy_assignment_group_link_requires_audited_migration'; end if;
  select * into g from public.school_subject_groups where id=new.subject_group_id;
  select * into o from public.school_subject_offerings where id=g.school_subject_offering_id;
  if g.school_id is distinct from new.school_id or o.school_subject_id is distinct from new.school_subject_id or o.academic_year_id is distinct from new.academic_year_id then
    raise exception 'assignment_group_context_mismatch';
  end if;
  if tg_op='INSERT' then
    select user_id into v_teacher_user_id from public.teachers where id=new.teacher_id;
    if not exists (select 1 from public.school_subject_group_teachers t join public.school_members sm on sm.school_id=t.school_id and sm.user_id=t.teacher_user_id and sm.status='active' and (sm.can_teach or sm.role_in_school='teacher') where t.group_id=g.id and t.school_id=g.school_id and t.teacher_user_id=v_teacher_user_id and t.active and t.can_create) then raise exception 'group_assignment_teacher_not_authorized'; end if;
    if g.status<>'active' or o.status<>'active' or not exists(select 1 from public.school_subjects s where s.id=o.school_subject_id and s.is_active) then raise exception 'assignment_group_is_archived'; end if;
    new.subject_group_name_snapshot:=g.name;
  else
    new.subject_group_name_snapshot:=old.subject_group_name_snapshot;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_assignment_subject_group() from public,anon,authenticated,service_role;
create trigger zz_validate_assignment_subject_group before insert or update on public.assignments for each row execute function private.validate_assignment_subject_group();

notify pgrst,'reload schema';

create or replace function public.rpc_school_admin_save_subject_group(
  p_school_id uuid,p_offering_id uuid,p_name text,p_group_type text,
  p_registration_class_id uuid default null,p_group_id uuid default null
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  if auth.uid() is null or not coalesce(public.can_administer_school(p_school_id),false) then
    raise exception using errcode='42501',message='school_administrator_access_required';
  end if;
  if not exists(select 1 from public.school_subject_offerings o where o.id=p_offering_id and o.school_id=p_school_id and o.status='active' and o.academic_year_id=public.academic_resolve_operational_year_id(p_school_id,now())) then
    raise exception 'current_subject_offering_required';
  end if;
  if p_group_id is null then
    insert into public.school_subject_groups(school_id,school_subject_offering_id,name,group_type,registration_class_id,created_by)
    values(p_school_id,p_offering_id,p_name,p_group_type,p_registration_class_id,auth.uid()) returning id into v_id;
  else
    update public.school_subject_groups set name=p_name,group_type=p_group_type,registration_class_id=p_registration_class_id
    where id=p_group_id and school_id=p_school_id and school_subject_offering_id=p_offering_id and status='active'
    returning id into v_id;
    if v_id is null then raise exception 'active_subject_group_not_found'; end if;
  end if;
  return v_id;
end;
$$;
revoke all on function public.rpc_school_admin_save_subject_group(uuid,uuid,text,text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_school_admin_save_subject_group(uuid,uuid,text,text,uuid,uuid) to authenticated;

create or replace function public.rpc_school_admin_archive_subject_group(p_school_id uuid,p_group_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null or not coalesce(public.can_administer_school(p_school_id),false) then raise exception using errcode='42501',message='school_administrator_access_required'; end if;
  update public.school_subject_groups set status='archived' where id=p_group_id and school_id=p_school_id;
  if not found then raise exception 'subject_group_not_found'; end if;
end;
$$;
revoke all on function public.rpc_school_admin_archive_subject_group(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_school_admin_archive_subject_group(uuid,uuid) to authenticated;

create or replace function public.rpc_school_admin_set_subject_group_students(p_school_id uuid,p_group_id uuid,p_student_ids uuid[])
returns void language plpgsql security definer set search_path=''
as $$
declare g public.school_subject_groups;
begin
  if auth.uid() is null or not coalesce(public.can_administer_school(p_school_id),false) then raise exception using errcode='42501',message='school_administrator_access_required'; end if;
  if p_student_ids is null or array_position(p_student_ids,null) is not null then raise exception 'student_ids_required'; end if;
  select * into g from public.school_subject_groups where id=p_group_id and school_id=p_school_id and status='active' for update;
  if not found or g.group_type<>'custom' then raise exception 'active_custom_group_required'; end if;
  if exists(select 1 from unnest(p_student_ids) id where not exists(select 1 from private.subject_offering_eligible_students(g.school_subject_offering_id) r where r.student_id=id)) then raise exception 'student_not_eligible_for_subject_group'; end if;
  update public.school_subject_group_students set status='withdrawn',ends_on=greatest(starts_on,current_date)
    where group_id=g.id and status='active' and not(student_id=any(p_student_ids));
  insert into public.school_subject_group_students(school_id,group_id,student_id,created_by)
    select p_school_id,p_group_id,id,auth.uid() from (select distinct unnest(p_student_ids) id) selected
    where not exists(select 1 from public.school_subject_group_students m where m.group_id=g.id and m.student_id=selected.id and m.status='active');
end;
$$;
revoke all on function public.rpc_school_admin_set_subject_group_students(uuid,uuid,uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.rpc_school_admin_set_subject_group_students(uuid,uuid,uuid[]) to authenticated;

create or replace function public.rpc_school_admin_set_subject_group_teacher(
  p_school_id uuid,p_group_id uuid,p_teacher_user_id uuid,p_active boolean default true,
  p_can_create boolean default true,p_can_grade boolean default true
)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null or not coalesce(public.can_administer_school(p_school_id),false) then raise exception using errcode='42501',message='school_administrator_access_required'; end if;
  perform 1 from public.school_subject_groups where id=p_group_id and school_id=p_school_id and status='active' for update;
  if not found then raise exception 'active_subject_group_required'; end if;
  insert into public.school_subject_group_teachers(school_id,group_id,teacher_user_id,active,can_create,can_grade,created_by)
  values(p_school_id,p_group_id,p_teacher_user_id,p_active,p_can_create,p_can_grade,auth.uid())
  on conflict(group_id,teacher_user_id) do update set active=excluded.active,can_create=excluded.can_create,can_grade=excluded.can_grade;
end;
$$;
revoke all on function public.rpc_school_admin_set_subject_group_teacher(uuid,uuid,uuid,boolean,boolean,boolean) from public,anon,authenticated,service_role;
grant execute on function public.rpc_school_admin_set_subject_group_teacher(uuid,uuid,uuid,boolean,boolean,boolean) to authenticated;

create or replace function public.rpc_school_admin_set_subject_delivery(
  p_school_id uuid,p_offering_id uuid,p_delivery_mode text,p_confirm_archive boolean default false
)
returns void language plpgsql security definer set search_path=''
as $$
declare o public.school_subject_offerings;
begin
  if auth.uid() is null or not coalesce(public.can_administer_school(p_school_id),false) then raise exception using errcode='42501',message='school_administrator_access_required'; end if;
  if p_delivery_mode is null or p_delivery_mode not in('by_class','whole_grade','custom_groups') then raise exception 'invalid_delivery_mode'; end if;
  select * into o from public.school_subject_offerings where id=p_offering_id and school_id=p_school_id and status='active' for update;
  if not found or o.academic_year_id<>public.academic_resolve_operational_year_id(p_school_id,now()) then raise exception 'current_subject_offering_required'; end if;
  if o.delivery_mode<>p_delivery_mode and not p_confirm_archive and exists(select 1 from public.school_subject_groups where school_subject_offering_id=o.id and status='active') then
    raise exception 'confirm_archive_existing_groups';
  end if;
  update public.school_subject_offerings set delivery_mode=p_delivery_mode,updated_at=now() where id=o.id;
end;
$$;
revoke all on function public.rpc_school_admin_set_subject_delivery(uuid,uuid,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.rpc_school_admin_set_subject_delivery(uuid,uuid,text,boolean) to authenticated;

create or replace function private.subject_group_read_model(p_group_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$
  select jsonb_build_object(
    'id',g.id,'schoolId',g.school_id,'offeringId',o.id,'schoolSubjectId',s.id,'schoolSubjectName',s.name,
    'academicSubjectId',s.academic_subject_id,'academicSubjectName',a.name,'academicSubjectCode',a.code,
    'academicYearId',o.academic_year_id,'gradeLevel',o.grade_level,'accessMode',o.access_mode,'deliveryMode',o.delivery_mode,
    'name',g.name,'groupType',g.group_type,'registrationClassId',g.registration_class_id,'status',g.status,
    'studentCount',(select count(*) from private.subject_group_roster(g.id)),
    'teachers',coalesce((select jsonb_agg(jsonb_build_object('userId',t.teacher_user_id,'name',coalesce(nullif(u.full_name,''),u.username),'canCreate',t.can_create,'canGrade',t.can_grade) order by u.username)
      from public.school_subject_group_teachers t join public.users u on u.id=t.teacher_user_id
      join public.school_members sm on sm.school_id=t.school_id and sm.user_id=t.teacher_user_id and sm.status='active' and (sm.can_teach or sm.role_in_school='teacher')
      where t.group_id=g.id and t.active),'[]'::jsonb))
  from public.school_subject_groups g
  join public.school_subject_offerings o on o.id=g.school_subject_offering_id and o.school_id=g.school_id
  join public.school_subjects s on s.id=o.school_subject_id and s.school_id=g.school_id
  left join public.academic_subjects a on a.id=s.academic_subject_id where g.id=p_group_id;
$$;
revoke all on function private.subject_group_read_model(uuid) from public,anon,authenticated,service_role;

create or replace function public.rpc_school_admin_subject_groups(p_school_id uuid,p_offering_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
  if auth.uid() is null or not coalesce(public.can_administer_school(p_school_id),false) then raise exception using errcode='42501',message='school_administrator_access_required'; end if;
  return coalesce((select jsonb_agg(private.subject_group_read_model(g.id) order by g.sort_order,g.name)
    from public.school_subject_groups g join public.school_subject_offerings o on o.id=g.school_subject_offering_id
    where g.school_id=p_school_id and (p_offering_id is null or o.id=p_offering_id)
      and o.academic_year_id=public.academic_resolve_operational_year_id(p_school_id,now()) and g.status='active' and o.status='active'),'[]'::jsonb);
end;
$$;
revoke all on function public.rpc_school_admin_subject_groups(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_school_admin_subject_groups(uuid,uuid) to authenticated;

create or replace function public.rpc_teacher_teaching_groups(p_school_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
  if auth.uid() is null or not exists(select 1 from public.school_members sm where sm.school_id=p_school_id and sm.user_id=auth.uid() and sm.status='active' and (sm.can_teach or sm.role_in_school='teacher')) then raise exception using errcode='42501',message='teaching_school_membership_required'; end if;
  return coalesce((select jsonb_agg(private.subject_group_read_model(g.id) order by o.grade_level,g.name)
    from public.school_subject_group_teachers t
    join public.school_subject_groups g on g.id=t.group_id and g.school_id=t.school_id and g.status='active'
    join public.school_subject_offerings o on o.id=g.school_subject_offering_id and o.status='active'
    join public.school_subjects s on s.id=o.school_subject_id and s.is_active
    where t.teacher_user_id=auth.uid() and t.school_id=p_school_id and t.active
      and o.academic_year_id=public.academic_resolve_operational_year_id(p_school_id,now())),'[]'::jsonb);
end;
$$;
revoke all on function public.rpc_teacher_teaching_groups(uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_teaching_groups(uuid) to authenticated;

create or replace function public.rpc_teacher_teaching_group_roster(p_school_id uuid,p_group_id uuid)
returns table(student_id uuid,student_name text,class_id uuid,class_code text)
language plpgsql stable security definer set search_path=''
as $$
begin
  if auth.uid() is null or not exists(
    select 1 from public.school_subject_group_teachers t
    join public.school_members sm on sm.school_id=t.school_id and sm.user_id=t.teacher_user_id and sm.status='active' and (sm.can_teach or sm.role_in_school='teacher')
    where t.school_id=p_school_id and t.group_id=p_group_id and t.teacher_user_id=auth.uid() and t.active
  ) then raise exception using errcode='42501',message='teaching_group_allocation_required'; end if;
  return query select r.student_id,coalesce(nullif(u.full_name,''),u.username)::text,r.class_id,r.class_code
    from private.subject_group_roster(p_group_id) r join public.users u on u.id=r.student_id order by u.username;
end;
$$;
revoke all on function public.rpc_teacher_teaching_group_roster(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_teaching_group_roster(uuid,uuid) to authenticated;
