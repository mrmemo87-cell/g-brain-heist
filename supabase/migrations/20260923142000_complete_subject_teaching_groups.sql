-- Complete school-subject teaching-group rollout.
-- School subjects stay school-owned; teaching groups define who studies together;
-- academic mappings only unlock governed academic resources.

-- Transition existing registration-class allocations into first-class class
-- teaching groups. This never merges by canonical academic subject: it uses the
-- exact local school_subject_id, or an unambiguous exact local name/code match
-- only for legacy rows that have not yet been linked.
with exact_local as (
  select
    cta.id as allocation_id,
    (array_agg(ss.id order by ss.id))[1] as school_subject_id
  from public.class_teacher_assignments cta
  join public.school_subjects ss
    on ss.school_id=cta.school_id
   and ss.is_active
   and (
     lower(trim(ss.name))=lower(trim(cta.subject))
     or lower(trim(coalesce(ss.code,'')))=lower(trim(cta.subject))
   )
  where cta.active and cta.school_subject_id is null
  group by cta.id
  having count(*)=1
)
update public.class_teacher_assignments cta
set school_subject_id=match.school_subject_id
from exact_local match
where cta.id=match.allocation_id
  and cta.school_subject_id is null;

with allocation_offerings as (
  select distinct
    cta.school_id,
    cta.school_subject_id,
    public.academic_resolve_operational_year_id(cta.school_id,now()) as academic_year_id,
    c.grade_level::text as grade_level,
    cta.created_by
  from public.class_teacher_assignments cta
  join public.classes c
    on c.id=cta.class_id and c.school_id=cta.school_id and coalesce(c.is_active,true)
  join public.school_subjects ss
    on ss.id=cta.school_subject_id and ss.school_id=cta.school_id and ss.is_active
  where cta.active and cta.school_subject_id is not null
)
insert into public.school_subject_offerings(
  school_id,school_subject_id,academic_year_id,grade_level,curriculum_scope_id,
  access_mode,delivery_mode,status,created_by
)
select
  source.school_id,
  source.school_subject_id,
  source.academic_year_id,
  source.grade_level,
  (
    select mapping.curriculum_scope_id
    from public.school_curriculum_scope_mappings mapping
    join public.school_subjects ss on ss.id=source.school_subject_id
    where mapping.school_id=source.school_id
      and mapping.academic_year_id=source.academic_year_id
      and mapping.grade_level=source.grade_level
      and mapping.academic_subject_id=ss.academic_subject_id
      and mapping.status='active'
    order by mapping.updated_at desc,mapping.id
    limit 1
  ),
  'all_grade',
  'by_class',
  'active',
  source.created_by
from allocation_offerings source
where source.academic_year_id is not null
on conflict (school_subject_id,academic_year_id,grade_level) do nothing;

insert into public.school_subject_groups(
  school_id,school_subject_offering_id,name,group_type,registration_class_id,status,created_by
)
select
  cta.school_id,
  o.id,
  concat(c.class_code,' · ',ss.name),
  'class',
  c.id,
  'active',
  cta.created_by
from public.class_teacher_assignments cta
join public.classes c
  on c.id=cta.class_id and c.school_id=cta.school_id and coalesce(c.is_active,true)
join public.school_subjects ss
  on ss.id=cta.school_subject_id and ss.school_id=cta.school_id and ss.is_active
join public.school_subject_offerings o
  on o.school_id=cta.school_id
 and o.school_subject_id=cta.school_subject_id
 and o.academic_year_id=public.academic_resolve_operational_year_id(cta.school_id,now())
 and o.grade_level=c.grade_level::text
 and o.status='active'
where cta.active
  and cta.school_subject_id is not null
  and o.delivery_mode='by_class'
on conflict do nothing;

insert into public.school_subject_group_teachers(
  school_id,group_id,teacher_user_id,can_create,can_grade,active,created_by
)
select
  cta.school_id,
  g.id,
  cta.teacher_user_id,
  cta.can_create,
  cta.can_grade,
  true,
  cta.created_by
from public.class_teacher_assignments cta
join public.classes c
  on c.id=cta.class_id and c.school_id=cta.school_id and coalesce(c.is_active,true)
join public.school_subject_offerings o
  on o.school_id=cta.school_id
 and o.school_subject_id=cta.school_subject_id
 and o.academic_year_id=public.academic_resolve_operational_year_id(cta.school_id,now())
 and o.grade_level=c.grade_level::text
 and o.status='active'
join public.school_subject_groups g
  on g.school_id=cta.school_id
 and g.school_subject_offering_id=o.id
 and g.group_type='class'
 and g.registration_class_id=c.id
 and g.status='active'
join public.school_members sm
  on sm.school_id=cta.school_id
 and sm.user_id=cta.teacher_user_id
 and sm.status='active'
 and (sm.can_teach or sm.role_in_school='teacher')
where cta.active and cta.school_subject_id is not null
on conflict (group_id,teacher_user_id) do update
set active=true,
    can_create=excluded.can_create,
    can_grade=excluded.can_grade,
    updated_at=now();

-- Admin roster read for custom-group editing.
create or replace function public.rpc_school_admin_subject_group_roster(
  p_school_id uuid,
  p_group_id uuid
)
returns table(student_id uuid,student_name text,class_id uuid,class_code text)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null or not coalesce(public.can_administer_school(p_school_id),false) then
    raise exception using errcode='42501',message='school_administrator_access_required';
  end if;
  if not exists(
    select 1 from public.school_subject_groups g
    where g.id=p_group_id and g.school_id=p_school_id and g.status='active'
  ) then
    raise exception 'active_subject_group_required';
  end if;

  return query
  select
    r.student_id,
    coalesce(nullif(u.full_name,''),u.username,u.email,'Student')::text,
    r.class_id,
    r.class_code::text
  from private.subject_group_roster(p_group_id) r
  join public.users u on u.id=r.student_id
  order by coalesce(nullif(u.full_name,''),u.username,u.email),r.student_id;
end;
$$;
revoke all on function public.rpc_school_admin_subject_group_roster(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.rpc_school_admin_subject_group_roster(uuid,uuid)
  to authenticated,service_role;

-- School Subjects catalogue: expose delivery model and teaching-group staffing,
-- while retaining legacy fields for older callers.
create or replace function public.rpc_school_admin_subject_catalog(
  p_school_id uuid,
  p_include_archived boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_year_id uuid;
  v_year_name text;
begin
  if v_actor is null or not (public.can_administer_school(p_school_id) or public.is_school_owner(p_school_id)) then
    raise exception using errcode='42501',message='school_administrator_access_required';
  end if;

  select y.id,y.name into v_year_id,v_year_name
  from public.school_academic_years y
  where y.school_id=p_school_id
  order by case y.status when 'current' then 0 when 'planned' then 1 else 2 end,y.starts_on desc
  limit 1;

  return jsonb_build_object(
    'success',true,
    'schoolId',p_school_id,
    'academicYearId',v_year_id,
    'academicYearName',v_year_name,
    'subjects',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,
        'name',s.name,
        'code',s.code,
        'isActive',s.is_active,
        'academicSubjectId',s.academic_subject_id,
        'academicSubjectName',a.name,
        'mappingStatus',case when s.academic_subject_id is null then 'unmapped' else 'mapped' end,
        'mappingRequestStatus',mr.status,
        'createdAt',s.created_at,
        'updatedAt',s.updated_at,
        'offerings',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',o.id,
            'academicYearId',o.academic_year_id,
            'gradeLevel',o.grade_level,
            'curriculumScopeId',o.curriculum_scope_id,
            'accessMode',o.access_mode,
            'deliveryMode',o.delivery_mode,
            'status',o.status,
            'selectedStudentIds',coalesce((
              select jsonb_agg(e.student_id order by e.student_id)
              from public.school_subject_enrolments e
              where e.school_subject_id=s.id
                and e.academic_year_id=o.academic_year_id
                and e.status='active'
                and current_date>=e.starts_on
                and (e.ends_on is null or current_date<=e.ends_on)
            ),'[]'::jsonb),
            'teacherUserIds',coalesce((
              select jsonb_agg(distinct gt.teacher_user_id)
              from public.school_subject_groups g
              join public.school_subject_group_teachers gt
                on gt.group_id=g.id and gt.school_id=g.school_id and gt.active
              where g.school_id=p_school_id
                and g.school_subject_offering_id=o.id
                and g.status='active'
            ),'[]'::jsonb),
            'classIds',coalesce((
              select jsonb_agg(distinct g.registration_class_id)
              from public.school_subject_groups g
              where g.school_id=p_school_id
                and g.school_subject_offering_id=o.id
                and g.status='active'
                and g.group_type='class'
                and g.registration_class_id is not null
            ),'[]'::jsonb),
            'groupCount',(
              select count(*)::integer from public.school_subject_groups g
              where g.school_id=p_school_id and g.school_subject_offering_id=o.id and g.status='active'
            )
          ) order by o.grade_level::integer)
          from public.school_subject_offerings o
          where o.school_subject_id=s.id
            and (v_year_id is null or o.academic_year_id=v_year_id)
            and o.status='active'
        ),'[]'::jsonb)
      ) order by s.is_active desc,lower(s.name))
      from public.school_subjects s
      left join public.academic_subjects a on a.id=s.academic_subject_id
      left join public.school_subject_mapping_requests mr on mr.school_subject_id=s.id
      where s.school_id=p_school_id and (p_include_archived or s.is_active)
    ),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.rpc_school_admin_subject_catalog(uuid,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.rpc_school_admin_subject_catalog(uuid,boolean)
  to authenticated,service_role;

-- Assignment audience authorization now recognizes teaching groups first.
-- Legacy class allocations remain as a compatibility branch during transition.
create or replace function private.teacher_assignment_authorized_students(
  p_teacher_user_id uuid,
  p_school_id uuid,
  p_subject text,
  p_class_id uuid default null,
  p_student_ids uuid[] default null
)
returns table(student_id uuid,class_code text)
language sql
stable
security definer
set search_path=''
as $$
  with group_students as (
    select distinct r.student_id,r.class_code
    from public.school_subject_group_teachers gt
    join public.school_subject_groups g
      on g.id=gt.group_id and g.school_id=gt.school_id and g.status='active'
    join public.school_subject_offerings o
      on o.id=g.school_subject_offering_id and o.school_id=g.school_id and o.status='active'
    join public.school_subjects ss
      on ss.id=o.school_subject_id and ss.school_id=o.school_id and ss.is_active
    cross join lateral private.subject_group_roster(g.id) r
    where gt.teacher_user_id=p_teacher_user_id
      and gt.school_id=p_school_id
      and gt.active and gt.can_create
      and o.academic_year_id=public.academic_resolve_operational_year_id(p_school_id,now())
      and (
        lower(trim(ss.name))=lower(trim(p_subject))
        or (ss.code is not null and lower(trim(ss.code))=lower(trim(p_subject)))
      )
      and (p_class_id is null or r.class_id=p_class_id)
      and (p_student_ids is null or r.student_id=any(p_student_ids))
  ),
  legacy_students as (
    select distinct authorized.student_id,authorized.class_code
    from (
      select
        u.id as student_id,
        c.class_code::text as class_code
      from public.class_teacher_assignments cta
      join public.classes c
        on c.id=cta.class_id and c.school_id=cta.school_id and coalesce(c.is_active,true)
      join public.class_students cs on cs.class_id=c.id
      join public.users u
        on u.id=cs.student_id and u.school_id=cta.school_id and coalesce(u.role,'student')='student'
      where cta.teacher_user_id=p_teacher_user_id
        and cta.school_id=p_school_id
        and cta.active
        and private.teacher_assignment_subject_key(cta.subject)=private.teacher_assignment_subject_key(p_subject)
        and (p_class_id is null or c.id=p_class_id)
        and (p_student_ids is null or u.id=any(p_student_ids))
        and not coalesce(u.is_banned,false)
        and not (u.banned_until is not null and u.banned_until>now())

      union all

      select
        u.id as student_id,
        c.class_code::text as class_code
      from public.class_teacher_assignments cta
      join public.classes c
        on c.id=cta.class_id and c.school_id=cta.school_id and coalesce(c.is_active,true)
      join public.users u
        on u.school_id=cta.school_id
       and upper(regexp_replace(trim(coalesce(u.batch,'')),'\\s+','','g'))
           =upper(regexp_replace(trim(c.class_code),'\\s+','','g'))
       and coalesce(u.role,'student')='student'
      where cta.teacher_user_id=p_teacher_user_id
        and cta.school_id=p_school_id
        and cta.active
        and private.teacher_assignment_subject_key(cta.subject)=private.teacher_assignment_subject_key(p_subject)
        and (p_class_id is null or c.id=p_class_id)
        and (p_student_ids is null or u.id=any(p_student_ids))
        and not exists(select 1 from public.class_students cs where cs.student_id=u.id)
        and not coalesce(u.is_banned,false)
        and not (u.banned_until is not null and u.banned_until>now())
    ) authorized
  )
  select student_id,class_code from group_students
  union
  select student_id,class_code from legacy_students;
$$;
revoke all on function private.teacher_assignment_authorized_students(uuid,uuid,text,uuid,uuid[])
  from public,anon,authenticated,service_role;
grant execute on function private.teacher_assignment_authorized_students(uuid,uuid,text,uuid,uuid[])
  to service_role;

-- Allow the canonical post-create attachment RPC to stamp group identity only
-- after audience and teacher authorization have been checked.
create or replace function private.validate_assignment_subject_group()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  g public.school_subject_groups;
  o public.school_subject_offerings;
begin
  if tg_op='UPDATE' and old.subject_group_id is not null
     and (
       new.subject_group_id is distinct from old.subject_group_id
       or new.school_subject_id is distinct from old.school_subject_id
       or new.school_id is distinct from old.school_id
       or new.academic_year_id is distinct from old.academic_year_id
     ) then
    raise exception 'published_group_assignment_identity_is_immutable';
  end if;

  if new.subject_group_id is null then return new; end if;

  if tg_op='INSERT' then
    raise exception 'teaching_group_assignment_requires_canonical_rpc';
  end if;

  if old.subject_group_id is null
     and current_setting('app.subject_group_attach',true) is distinct from '1' then
    raise exception 'teaching_group_assignment_requires_canonical_rpc';
  end if;

  select * into g from public.school_subject_groups where id=new.subject_group_id;
  if not found then raise exception 'subject_group_not_found'; end if;
  select * into o from public.school_subject_offerings where id=g.school_subject_offering_id;
  if not found then raise exception 'subject_offering_not_found'; end if;

  if g.school_id is distinct from new.school_id
     or o.school_subject_id is distinct from new.school_subject_id
     or o.academic_year_id is distinct from new.academic_year_id then
    raise exception 'assignment_group_context_mismatch';
  end if;

  if g.status<>'active' or o.status<>'active' then
    raise exception 'assignment_group_is_archived';
  end if;

  new.subject_group_name_snapshot:=coalesce(old.subject_group_name_snapshot,g.name);
  return new;
end;
$$;
revoke all on function private.validate_assignment_subject_group()
  from public,anon,authenticated,service_role;

create or replace function public.rpc_teacher_attach_assignment_group(
  p_assignment_id uuid,
  p_school_id uuid,
  p_group_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_assignment public.assignments;
  v_teacher_user_id uuid;
  v_group public.school_subject_groups;
  v_offering public.school_subject_offerings;
  v_roster_count integer;
  v_assignment_count integer;
begin
  if v_actor is null then
    raise exception using errcode='42501',message='authentication_required';
  end if;

  select * into v_assignment
  from public.assignments
  where id=p_assignment_id and school_id=p_school_id
  for update;
  if not found then raise exception 'assignment_not_found'; end if;

  select t.user_id into v_teacher_user_id
  from public.teachers t where t.id=v_assignment.teacher_id;
  if v_teacher_user_id is distinct from v_actor then
    raise exception using errcode='42501',message='assignment_teacher_required';
  end if;

  select * into v_group
  from public.school_subject_groups
  where id=p_group_id and school_id=p_school_id and status='active';
  if not found then raise exception 'active_subject_group_required'; end if;

  select * into v_offering
  from public.school_subject_offerings
  where id=v_group.school_subject_offering_id and school_id=p_school_id and status='active';
  if not found then raise exception 'active_subject_offering_required'; end if;

  if not exists(
    select 1
    from public.school_subject_group_teachers gt
    where gt.group_id=v_group.id and gt.school_id=p_school_id
      and gt.teacher_user_id=v_actor and gt.active and gt.can_create
  ) then
    raise exception using errcode='42501',message='teaching_group_allocation_required';
  end if;

  if v_assignment.school_subject_id is distinct from v_offering.school_subject_id then
    raise exception 'assignment_school_subject_mismatch';
  end if;

  if v_assignment.academic_year_id is distinct from v_offering.academic_year_id then
    raise exception 'assignment_academic_year_mismatch';
  end if;

  if exists(
    select 1
    from public.assignment_students ast
    where ast.assignment_id=v_assignment.id
      and not exists(
        select 1 from private.subject_group_roster(v_group.id) r where r.student_id=ast.student_id
      )
  ) then
    raise exception 'assignment_student_outside_teaching_group';
  end if;

  select count(*)::integer into v_assignment_count
  from public.assignment_students ast where ast.assignment_id=v_assignment.id;
  select count(*)::integer into v_roster_count
  from private.subject_group_roster(v_group.id);

  if v_assignment.publish_status<>'draft' and v_assignment_count=0 then
    raise exception 'teaching_group_has_no_assignable_students';
  end if;
  if v_roster_count=0 and v_assignment.publish_status<>'draft' then
    raise exception 'teaching_group_has_no_assignable_students';
  end if;

  perform set_config('app.subject_group_attach','1',true);
  update public.assignments
  set subject_group_id=v_group.id,
      subject_group_name_snapshot=v_group.name,
      class_id=case when v_group.group_type='class' then v_group.registration_class_id else null end,
      class_code_snapshot=case when v_group.group_type='class'
        then (select c.class_code from public.classes c where c.id=v_group.registration_class_id)
        else v_group.name end,
      updated_at=now()
  where id=v_assignment.id;
end;
$$;
revoke all on function public.rpc_teacher_attach_assignment_group(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_attach_assignment_group(uuid,uuid,uuid)
  to authenticated,service_role;

-- Teacher assignment reads must recognize group allocations even when no
-- registration-class allocation exists.
create or replace function public.rpc_get_assignments_for_teacher(p_teacher_id uuid)
returns table(
  id uuid,teacher_id uuid,subject_id text,subject_name text,topic_name text,batch text,
  difficulty text,title text,instructions text,assigned_at timestamptz,due_at timestamptz,
  created_at timestamptz,updated_at timestamptz,question_count integer,completed_count integer,
  student_count integer,assignment_mode text,description text,publish_status text,
  close_submissions_after_due boolean,notify_students_by_email boolean,published_at timestamptz,
  question_ids uuid[],student_ids uuid[]
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_teacher_user_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select t.user_id into v_teacher_user_id
  from public.teachers t
  where t.id=p_teacher_id and t.user_id=auth.uid();
  if v_teacher_user_id is null then raise exception 'Not authorized'; end if;

  return query
  select
    a.id,a.teacher_id,a.subject_id,a.subject_name,a.topic_name,a.batch,a.difficulty,a.title,a.instructions,
    a.assigned_at,a.due_at,a.created_at,a.updated_at,
    (select count(*)::int from public.assignment_questions aq where aq.assignment_id=a.id),
    (select count(*)::int from public.student_assignments sa where sa.assignment_id=a.id and sa.status='completed'),
    (select count(*)::int from public.student_assignments sa where sa.assignment_id=a.id),
    coalesce(a.assignment_mode,'batch'),a.description,a.publish_status,a.close_submissions_after_due,
    a.notify_students_by_email,a.published_at,
    (select coalesce(array_agg(aq.question_id order by aq.order_index),'{}'::uuid[]) from public.assignment_questions aq where aq.assignment_id=a.id),
    (select coalesce(array_agg(sa.student_id),'{}'::uuid[]) from public.student_assignments sa where sa.assignment_id=a.id)
  from public.assignments a
  join public.school_academic_years y
    on y.id=a.academic_year_id and y.school_id=a.school_id and y.status='current'
  where a.teacher_id=p_teacher_id
    and (
      (
        a.subject_group_id is not null
        and exists(
          select 1
          from public.school_subject_group_teachers gt
          join public.school_subject_groups g on g.id=gt.group_id and g.school_id=gt.school_id
          where gt.group_id=a.subject_group_id
            and gt.teacher_user_id=v_teacher_user_id
            and gt.school_id=a.school_id
            and gt.active
            and g.status='active'
        )
      )
      or
      (
        a.subject_group_id is null
        and (
          (
            coalesce(a.assignment_mode,'batch')='batch'
            and a.class_id is not null
            and exists(
              select 1
              from public.class_teacher_assignments cta
              join public.classes c on c.id=cta.class_id and c.school_id=cta.school_id and coalesce(c.is_active,true)
              where cta.teacher_user_id=v_teacher_user_id
                and cta.school_id=a.school_id
                and cta.class_id=a.class_id
                and cta.active
                and private.teacher_assignment_subject_key(cta.subject)=private.teacher_assignment_subject_key(a.subject_name)
            )
          )
          or
          (
            (
              coalesce(a.assignment_mode,'batch')='custom'
              or a.class_id is null
              or upper(trim(coalesce(a.batch,'')))='ALL'
            )
            and exists(
              select 1
              from public.student_assignments sa
              join public.class_students cs on cs.student_id=sa.student_id
              join public.class_teacher_assignments cta
                on cta.class_id=cs.class_id
               and cta.teacher_user_id=v_teacher_user_id
               and cta.school_id=a.school_id
               and cta.active
              join public.classes c
                on c.id=cta.class_id and c.school_id=cta.school_id and coalesce(c.is_active,true)
              where sa.assignment_id=a.id
                and private.teacher_assignment_subject_key(cta.subject)=private.teacher_assignment_subject_key(a.subject_name)
            )
          )
        )
      )
    )
  order by a.assigned_at desc;
end;
$$;
revoke all on function public.rpc_get_assignments_for_teacher(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.rpc_get_assignments_for_teacher(uuid)
  to authenticated,service_role;

create or replace function public.rpc_teacher_assignment_group_context(p_teacher_id uuid)
returns table(
  assignment_id uuid,
  school_id uuid,
  school_subject_id uuid,
  subject_group_id uuid,
  subject_group_name text
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
begin
  if v_actor is null or not exists(
    select 1 from public.teachers t where t.id=p_teacher_id and t.user_id=v_actor
  ) then
    raise exception using errcode='42501',message='teacher_assignment_access_denied';
  end if;

  return query
  select a.id,a.school_id,a.school_subject_id,a.subject_group_id,
         coalesce(a.subject_group_name_snapshot,g.name)::text
  from public.assignments a
  left join public.school_subject_groups g on g.id=a.subject_group_id
  where a.teacher_id=p_teacher_id;
end;
$$;
revoke all on function public.rpc_teacher_assignment_group_context(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_assignment_group_context(uuid)
  to authenticated,service_role;

-- Question-bank authorization is allocation-driven and fail-closed.
-- A teacher with no active group/class allocation receives no school governed pool.
create or replace function public.get_all_active_questions(
  p_subject text default null,
  p_difficulty text default null,
  p_teacher_id uuid default null,
  p_limit integer default 500,
  p_offset integer default 0
)
returns table(
  id uuid,teacher_id uuid,subject text,subject_id text,topic text,topic_name text,
  difficulty text,question_text text,image_url text,image_alt_text text,question_type text,
  options jsonb,correct_answer text,explanation text,hints text[],time_limit integer,points integer,
  tags text[],grade_level text,is_public boolean,is_active boolean,times_answered integer,
  times_correct integer,created_at timestamptz,updated_at timestamptz,creator_name text,
  creator_school_id uuid,is_mine boolean,content_origin text,verification_status text,
  analytics_eligible boolean,verified_at timestamptz,verified_by uuid,verified_by_authority text,
  verified_content_hash text,current_content_hash text,content_version text,content_revision integer,
  eligible_grade_levels smallint[],pool_scope text,owner_school_id uuid
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_teacher uuid;
  v_school uuid;
  v_year uuid;
begin
  if v_actor is null then raise exception using errcode='42501',message='authentication_required'; end if;
  select t.id into v_teacher from public.teachers t where t.user_id=v_actor;
  if v_teacher is null then raise exception using errcode='42501',message='teacher_required'; end if;
  if p_teacher_id is not null and p_teacher_id<>v_teacher then
    raise exception using errcode='42501',message='cannot_browse_another_teacher_pool';
  end if;

  select sm.school_id into v_school
  from public.school_members sm
  where sm.user_id=v_actor and sm.status='active'
  order by sm.joined_at desc nulls last,sm.id limit 1;
  if v_school is null then select u.school_id into v_school from public.users u where u.id=v_actor; end if;
  if v_school is not null then v_year:=public.academic_resolve_operational_year_id(v_school,now()); end if;

  return query
  with authorized_scopes as materialized (
    select distinct
      ss.id as school_subject_id,
      ss.name as school_subject_name,
      academic.name as canonical_subject_name,
      o.grade_level,
      ss.academic_subject_id,
      o.curriculum_scope_id
    from public.school_subject_group_teachers gt
    join public.school_subject_groups g
      on g.id=gt.group_id and g.school_id=gt.school_id and g.status='active'
    join public.school_subject_offerings o
      on o.id=g.school_subject_offering_id and o.school_id=g.school_id and o.status='active'
    join public.school_subjects ss
      on ss.id=o.school_subject_id and ss.school_id=o.school_id
      and ss.is_active and ss.academic_subject_id is not null
    join public.academic_subjects academic
      on academic.id=ss.academic_subject_id and academic.is_active
    where gt.teacher_user_id=v_actor
      and gt.school_id=v_school
      and gt.active
      and o.curriculum_scope_id is not null
      and (v_year is null or o.academic_year_id=v_year)

    union

    select distinct
      ss.id,
      ss.name,
      academic.name,
      c.grade_level,
      ss.academic_subject_id,
      o.curriculum_scope_id
    from public.class_teacher_assignments cta
    join public.classes c
      on c.id=cta.class_id and c.school_id=cta.school_id
      and coalesce(c.is_active,true) and c.grade_level~'^[0-9]+$'
    join public.school_subjects ss
      on ss.id=cta.school_subject_id and ss.school_id=cta.school_id
      and ss.is_active and ss.academic_subject_id is not null
    join public.academic_subjects academic
      on academic.id=ss.academic_subject_id and academic.is_active
    join public.school_subject_offerings o
      on o.school_subject_id=ss.id and o.school_id=cta.school_id
      and o.grade_level=c.grade_level and o.status='active'
      and o.curriculum_scope_id is not null
      and (v_year is null or o.academic_year_id=v_year)
    where cta.teacher_user_id=v_actor and cta.school_id=v_school and cta.active
  ),
  authorized_verified as materialized (
    select distinct q0.id
    from public.questions q0
    join authorized_scopes scope
      on scope.academic_subject_id=q0.academic_subject_id
      and scope.grade_level::smallint=any(q0.eligible_grade_levels)
    join public.curriculum_assessment_items item
      on item.source_type='question_bank' and item.source_record_id=q0.id::text
      and item.source_item_key='question' and item.is_active
      and item.content_hash=q0.verified_content_hash
      and (
        (q0.pool_scope='global' and item.school_id is null)
        or (q0.pool_scope='school' and item.school_id=v_school)
      )
    join public.curriculum_item_objective_mappings im
      on im.assessment_item_id=item.id
      and im.curriculum_scope_id=scope.curriculum_scope_id
      and im.academic_subject_id=q0.academic_subject_id
      and im.status='approved' and im.mapping_role='primary'
      and im.superseded_at is null
      and im.item_content_hash=item.content_hash
    join public.curriculum_framework_versions fv
      on fv.id=im.framework_version_id and fv.status in ('published','retired')
      and fv.content_hash=im.curriculum_version_content_hash
    where q0.is_active
      and q0.verification_status='verified' and q0.analytics_eligible
      and q0.current_content_hash=q0.verified_content_hash
      and (
        (q0.pool_scope='global' and q0.content_origin='brain_heist'
          and q0.owner_school_id is null and q0.is_public)
        or (q0.pool_scope='school' and q0.content_origin='teacher'
          and q0.owner_school_id=v_school and not q0.is_public)
      )
      and (
        p_subject is null
        or lower(trim(scope.school_subject_name))=lower(trim(p_subject))
        or lower(trim(scope.canonical_subject_name))=lower(trim(p_subject))
        or lower(trim(q0.subject))=lower(trim(p_subject))
      )
      and (p_difficulty is null or q0.difficulty=p_difficulty)
  ),
  candidate_ids as materialized (
    select av.id from authorized_verified av
    union
    select q0.id
    from public.questions q0
    where q0.is_active and q0.pool_scope='teacher'
      and q0.content_origin='teacher' and q0.teacher_id=v_teacher
      and (p_subject is null or lower(trim(q0.subject))=lower(trim(p_subject)))
      and (p_difficulty is null or q0.difficulty=p_difficulty)
  ),
  paged as materialized (
    select q0.id,q0.created_at
    from candidate_ids ids
    join public.questions q0 on q0.id=ids.id
    order by q0.created_at desc
    limit greatest(1,least(coalesce(p_limit,500),1000))
    offset greatest(coalesce(p_offset,0),0)
  )
  select
    q.id,q.teacher_id,q.subject,q.subject_id,q.topic,q.topic_name,q.difficulty,
    q.question_text,q.image_url,q.image_alt_text,q.question_type,q.options,
    q.correct_answer,q.explanation,q.hints,q.time_limit,q.points,q.tags,q.grade_level,
    q.is_public,q.is_active,q.times_answered,q.times_correct,q.created_at,q.updated_at,
    case when q.pool_scope='global' then 'Brains Heist' else coalesce(u.username,'Teacher') end,
    case when q.pool_scope='global' then null
      when q.pool_scope='school' then q.owner_school_id else u.school_id end,
    q.pool_scope='teacher' and q.teacher_id=v_teacher,
    q.content_origin,q.verification_status,q.analytics_eligible,q.verified_at,q.verified_by,
    q.verified_by_authority,q.verified_content_hash,q.current_content_hash,
    q.content_version,q.content_revision,q.eligible_grade_levels,q.pool_scope,q.owner_school_id
  from paged page
  join public.questions q on q.id=page.id
  left join public.teachers t on t.id=q.teacher_id
  left join public.users u on u.id=t.user_id
  order by page.created_at desc;
end;
$$;
revoke all on function public.get_all_active_questions(text,text,uuid,integer,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.get_all_active_questions(text,text,uuid,integer,integer)
  to authenticated,service_role;

notify pgrst,'reload schema';
