
create table if not exists private.school_year_teaching_group_snapshots (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.school_year_rollover_plans(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year_id uuid not null references public.school_academic_years(id) on delete restrict,
  original_group_id uuid not null,
  group_name text not null,
  group_type text not null,
  registration_class_id uuid null,
  school_subject_id uuid null,
  school_subject_name text not null,
  academic_subject_id uuid null,
  academic_subject_name text null,
  academic_subject_code text null,
  grade_level text not null,
  teacher_user_id uuid not null references public.users(id) on delete restrict,
  can_create boolean not null default true,
  can_grade boolean not null default true,
  captured_at timestamptz not null default now(),
  unique(plan_id, original_group_id, teacher_user_id)
);

create index if not exists idx_year_teaching_group_snapshots_teacher
on private.school_year_teaching_group_snapshots
(school_id,academic_year_id,teacher_user_id);

create table if not exists private.school_year_teaching_group_student_snapshots (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.school_year_rollover_plans(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year_id uuid not null references public.school_academic_years(id) on delete restrict,
  original_group_id uuid not null,
  group_name text not null,
  group_type text not null,
  registration_class_id uuid null,
  school_subject_id uuid null,
  school_subject_name text not null,
  academic_subject_id uuid null,
  academic_subject_name text null,
  academic_subject_code text null,
  grade_level text not null,
  teacher_user_id uuid not null references public.users(id) on delete restrict,
  student_id uuid not null references public.users(id) on delete restrict,
  class_id uuid null,
  class_code text null,
  captured_at timestamptz not null default now(),
  unique(plan_id, original_group_id, teacher_user_id, student_id)
);

create index if not exists idx_year_teaching_group_student_snapshots_teacher
on private.school_year_teaching_group_student_snapshots
(school_id,academic_year_id,teacher_user_id,student_id);

create or replace function private.capture_school_year_teaching_group_snapshots_for_plan(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_plan public.school_year_rollover_plans%rowtype;
begin
  select * into v_plan
  from public.school_year_rollover_plans p
  where p.id=p_plan_id and p.status='completed';

  if not found or v_plan.source_academic_year_id is null then return; end if;

  insert into private.school_year_teaching_group_snapshots(
    plan_id,school_id,academic_year_id,original_group_id,group_name,group_type,
    registration_class_id,school_subject_id,school_subject_name,
    academic_subject_id,academic_subject_name,academic_subject_code,
    grade_level,teacher_user_id,can_create,can_grade,captured_at
  )
  select distinct
    v_plan.id,v_plan.school_id,v_plan.source_academic_year_id,
    g.id,g.name,g.group_type,g.registration_class_id,
    ss.id,ss.name,ss.academic_subject_id,a.name,a.code,
    o.grade_level,gt.teacher_user_id,gt.can_create,gt.can_grade,
    coalesce(v_plan.completed_at,now())
  from public.school_subject_group_teachers gt
  join public.school_subject_groups g
    on g.id=gt.group_id and g.school_id=gt.school_id
  join public.school_subject_offerings o
    on o.id=g.school_subject_offering_id and o.school_id=g.school_id
  join public.school_subjects ss
    on ss.id=o.school_subject_id and ss.school_id=o.school_id
  left join public.academic_subjects a on a.id=ss.academic_subject_id
  where gt.school_id=v_plan.school_id
    and gt.active and g.status='active' and o.status='active'
    and o.academic_year_id=v_plan.source_academic_year_id
  on conflict(plan_id,original_group_id,teacher_user_id) do nothing;

  insert into private.school_year_teaching_group_student_snapshots(
    plan_id,school_id,academic_year_id,original_group_id,group_name,group_type,
    registration_class_id,school_subject_id,school_subject_name,
    academic_subject_id,academic_subject_name,academic_subject_code,
    grade_level,teacher_user_id,student_id,class_id,class_code,captured_at
  )
  select distinct
    snap.plan_id,snap.school_id,snap.academic_year_id,snap.original_group_id,
    snap.group_name,snap.group_type,snap.registration_class_id,
    snap.school_subject_id,snap.school_subject_name,
    snap.academic_subject_id,snap.academic_subject_name,snap.academic_subject_code,
    snap.grade_level,snap.teacher_user_id,
    roster.student_id,roster.class_id,roster.class_code,
    snap.captured_at
  from private.school_year_teaching_group_snapshots snap
  cross join lateral private.subject_group_roster(snap.original_group_id) roster
  where snap.plan_id=v_plan.id
  on conflict(plan_id,original_group_id,teacher_user_id,student_id) do nothing;
end;
$function$;

revoke all on function private.capture_school_year_teaching_group_snapshots_for_plan(uuid)
from public,anon,authenticated,service_role;

create or replace function private.capture_school_year_rollover_snapshots_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_audit jsonb;
begin
  if new.status='completed' and (tg_op='INSERT' or old.status is distinct from new.status) then
    perform private.capture_school_year_rollover_snapshots_for_plan(new.id);
    perform private.capture_school_year_teaching_group_snapshots_for_plan(new.id);
    perform private.apply_school_year_rollover_post_commit_policies(new.id);
    perform private.refresh_school_roster_identity_states(new.school_id);
    v_audit:=private.school_year_rollover_integrity_audit_internal(new.id);
    if coalesce((v_audit->>'healthy')::boolean,false) is not true then
      raise exception using errcode='23514',message='rollover_integrity_blocked',detail=left(v_audit::text,4000);
    end if;
    update public.school_year_rollover_plans p
    set completion_summary=coalesce(p.completion_summary,'{}'::jsonb)
      || jsonb_build_object('integrityAudit',v_audit,'integrityGatePassed',true),
      updated_at=now()
    where p.id=new.id;
  end if;
  return new;
end;
$function$;

create or replace function private.teacher_historical_teaching_roster(
  p_teacher_user_id uuid,
  p_school_id uuid,
  p_academic_year_id uuid
)
returns table(
  school_id uuid,
  academic_year_id uuid,
  group_id uuid,
  group_name text,
  group_type text,
  registration_class_id uuid,
  school_subject_id uuid,
  school_subject_name text,
  academic_subject_id uuid,
  academic_subject_name text,
  academic_subject_code text,
  grade_level text,
  student_id uuid,
  class_id uuid,
  class_code text
)
language sql
stable
security definer
set search_path=''
as $function$
  select distinct
    s.school_id,s.academic_year_id,s.original_group_id,s.group_name,s.group_type,
    s.registration_class_id,s.school_subject_id,s.school_subject_name,
    s.academic_subject_id,s.academic_subject_name,s.academic_subject_code,
    s.grade_level,s.student_id,s.class_id,s.class_code
  from private.school_year_teaching_group_student_snapshots s
  where s.teacher_user_id=p_teacher_user_id
    and s.school_id=p_school_id
    and s.academic_year_id=p_academic_year_id;
$function$;

revoke all on function private.teacher_historical_teaching_roster(uuid,uuid,uuid)
from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.teacher_academic_profile_students_for_year_legacy_group_transition(p_academic_year_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_caller uuid := auth.uid();
  v_school_id uuid;
  v_is_admin boolean := false;
  v_is_teacher boolean := false;
  v_operational_year_id uuid;
  v_result jsonb;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  select y.school_id into v_school_id
  from public.school_academic_years y
  where y.id = p_academic_year_id;

  if v_school_id is null then
    raise exception 'Academic year not found';
  end if;

  v_is_admin := public.can_administer_school(v_school_id)
    or public.is_school_owner(v_school_id);
  v_is_teacher := exists (
    select 1 from public.teachers t where t.user_id = v_caller
  );

  if not v_is_admin and not v_is_teacher then
    raise exception 'Not authorized';
  end if;

  v_operational_year_id := public.academic_resolve_operational_year_id(v_school_id, now());

  with roster_candidates as (
    -- For the operational/current year, the live School Admin class placement is authoritative.
    -- This prevents rollover/history rows from resurrecting removed students or moving a live
    -- student to a future/prepared class before the school actually changes their placement.
    select
      sm.user_id as student_id,
      v_school_id as school_id,
      p_academic_year_id as academic_year_id,
      school_class.id as class_id,
      school_class.grade_level,
      school_class.class_code,
      null::date as starts_on,
      0 as source_rank
    from public.school_members sm
    join public.class_students cs
      on cs.student_id = sm.user_id
    join public.classes school_class
      on school_class.id = cs.class_id
     and school_class.school_id = v_school_id
     and coalesce(school_class.is_active, true)
    where sm.school_id = v_school_id
      and sm.status in ('active', 'suspended')
      and sm.role_in_school = 'student'
      and p_academic_year_id = v_operational_year_id

    union all

    -- Historical/non-operational years remain year-specific and come from academic enrolment history.
    select
      e.student_id,
      e.school_id,
      e.academic_year_id,
      e.class_id,
      e.grade_level,
      e.class_code,
      e.starts_on,
      1 as source_rank
    from public.student_academic_enrolments e
    join public.school_members sm
      on sm.school_id = e.school_id
     and sm.user_id = e.student_id
     and sm.status in ('active', 'suspended')
     and sm.role_in_school = 'student'
    where e.school_id = v_school_id
      and e.academic_year_id = p_academic_year_id
      and p_academic_year_id is distinct from v_operational_year_id
  ),
  roster as (
    select distinct on (candidate.student_id)
      candidate.student_id,
      candidate.school_id,
      candidate.academic_year_id,
      candidate.class_id,
      candidate.grade_level,
      candidate.class_code
    from roster_candidates candidate
    order by candidate.student_id,
             candidate.source_rank,
             candidate.starts_on desc nulls last,
             candidate.class_id
  )
  select coalesce(
    jsonb_agg(
      row_data
      order by row_data->>'grade',
               row_data->>'class_name',
               row_data->>'student_name'
    ),
    '[]'::jsonb
  )
  into v_result
  from (
    select jsonb_build_object(
      'student_id', u.id,
      'student_name', coalesce(nullif(trim(u.full_name), ''), u.username),
      'username', u.username,
      'class_name', coalesce(
        nullif(trim(school_class.class_code), ''),
        nullif(trim(school_class.class_name), ''),
        nullif(trim(roster_row.class_code), ''),
        '—'
      ),
      'grade', roster_row.grade_level,
      'school_id', roster_row.school_id,
      'subjects', coalesce((
        select to_jsonb(array_agg(distinct subject_name order by subject_name))
        from (
          select subject.name as subject_name
          from public.school_curriculum_scope_mappings mapping
          join public.academic_subjects subject
            on subject.id = mapping.academic_subject_id
           and subject.is_active
          where mapping.school_id = roster_row.school_id
            and mapping.academic_year_id = roster_row.academic_year_id
            and mapping.grade_level = roster_row.grade_level
            and mapping.status = 'active'
            and (
              mapping.subject_requirement = 'required'
              or exists (
                select 1
                from public.student_subject_enrolments subject_enrolment
                where subject_enrolment.student_id = roster_row.student_id
                  and subject_enrolment.school_id = roster_row.school_id
                  and subject_enrolment.academic_year_id = roster_row.academic_year_id
                  and subject_enrolment.academic_subject_id = subject.id
                  and subject_enrolment.status = 'active'
              )
            )
            and (
              v_is_admin
              or exists (
                select 1
                from public.class_teacher_assignments cta
                where cta.school_id = roster_row.school_id
                  and cta.class_id = roster_row.class_id
                  and cta.teacher_user_id = v_caller
                  and cta.active
                  and private.teacher_assignment_subject_key(cta.subject) =
                      private.teacher_assignment_subject_key(subject.name)
              )
              or exists (
                select 1
                from private.school_year_teacher_allocation_snapshots snap
                where snap.school_id = roster_row.school_id
                  and snap.academic_year_id = roster_row.academic_year_id
                  and snap.class_id = roster_row.class_id
                  and snap.teacher_user_id = v_caller
                  and private.teacher_assignment_subject_key(snap.subject) =
                      private.teacher_assignment_subject_key(subject.name)
              )
            )

          union

          select trim(cta.subject) as subject_name
          from public.class_teacher_assignments cta
          where cta.school_id = roster_row.school_id
            and cta.class_id = roster_row.class_id
            and cta.active
            and (v_is_admin or cta.teacher_user_id = v_caller)
            and nullif(trim(cta.subject), '') is not null

          union

          select trim(snap.subject) as subject_name
          from private.school_year_teacher_allocation_snapshots snap
          where snap.school_id = roster_row.school_id
            and snap.academic_year_id = roster_row.academic_year_id
            and snap.class_id = roster_row.class_id
            and (v_is_admin or snap.teacher_user_id = v_caller)
            and nullif(trim(snap.subject), '') is not null
        ) subjects_for_student
      ), '[]'::jsonb)
    ) as row_data
    from roster roster_row
    join public.users u
      on u.id = roster_row.student_id
     and u.school_id = roster_row.school_id
    left join public.classes school_class
      on school_class.id = roster_row.class_id
     and school_class.school_id = roster_row.school_id
    where v_is_admin
      or exists (
        select 1
        from public.class_teacher_assignments cta
        where cta.school_id = roster_row.school_id
          and cta.class_id = roster_row.class_id
          and cta.teacher_user_id = v_caller
          and cta.active
      )
      or exists (
        select 1
        from private.school_year_teacher_allocation_snapshots snap
        where snap.school_id = roster_row.school_id
          and snap.academic_year_id = roster_row.academic_year_id
          and snap.class_id = roster_row.class_id
          and snap.teacher_user_id = v_caller
      )
  ) rows;

  return v_result;
end;
$function$
;
revoke all on function private.teacher_academic_profile_students_for_year_legacy_group_transition(uuid)
from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.student_academic_subjects_for_year_legacy_group_transition(p_student_id uuid, p_academic_year_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_caller uuid := auth.uid();
  v_student uuid := coalesce(p_student_id, auth.uid());
  v_school uuid;
  v_year uuid;
  v_operational_year uuid;
  v_grade text;
  v_class uuid;
  v_is_admin boolean := false;
  v_is_self boolean := false;
  v_is_teacher boolean := false;
begin
  if v_caller is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select u.school_id into v_school
  from public.users u
  where u.id = v_student;

  if v_school is null then
    return jsonb_build_object(
      'success', true, 'ready', false, 'code', 'school_required',
      'subjects', '[]'::jsonb
    );
  end if;

  select y.id into v_year
  from public.school_academic_years y
  where y.id = p_academic_year_id
    and y.school_id = v_school;

  if v_year is null then
    raise exception using errcode = '42501',
      message = 'academic_year_not_available_for_student';
  end if;

  v_is_self := v_caller = v_student;
  v_is_admin := public.can_administer_school(v_school)
    or public.is_school_owner(v_school);
  v_is_teacher := exists (
    select 1
    from public.teachers t
    where t.user_id = v_caller
  );
  v_operational_year := public.academic_resolve_operational_year_id(v_school, now());

  if v_year = v_operational_year then
    -- Current/operational year: live class placement is authoritative.
    select c.grade_level, c.id
    into v_grade, v_class
    from public.class_students cs
    join public.classes c
      on c.id = cs.class_id
     and c.school_id = v_school
     and coalesce(c.is_active, true)
    join public.school_members sm
      on sm.school_id = v_school
     and sm.user_id = cs.student_id
     and sm.status in ('active', 'suspended')
     and sm.role_in_school = 'student'
    where cs.student_id = v_student
    order by cs.joined_at desc nulls last, c.created_at desc, c.id
    limit 1;
  else
    -- Historical years remain reproducible from year-specific enrolment history.
    select e.grade_level, e.class_id
    into v_grade, v_class
    from public.student_academic_enrolments e
    where e.student_id = v_student
      and e.school_id = v_school
      and e.academic_year_id = v_year
    order by case e.context_quality when 'confirmed' then 0 else 1 end,
             e.updated_at desc,
             e.id
    limit 1;
  end if;

  if v_grade is null or v_class is null then
    return jsonb_build_object(
      'success', true, 'ready', false,
      'code', 'academic_year_enrolment_required',
      'academicYearId', v_year,
      'subjects', '[]'::jsonb
    );
  end if;

  if not (v_is_self or v_is_admin) then
    if not v_is_teacher or not (
      exists (
        select 1
        from public.class_teacher_assignments cta
        where cta.school_id = v_school
          and cta.class_id = v_class
          and cta.teacher_user_id = v_caller
          and cta.active
      )
      or exists (
        select 1
        from private.school_year_teacher_allocation_snapshots snap
        where snap.school_id = v_school
          and snap.academic_year_id = v_year
          and snap.class_id = v_class
          and snap.teacher_user_id = v_caller
      )
    ) then
      raise exception using errcode = '42501',
        message = 'student_academic_subject_access_denied';
    end if;
  end if;

  return jsonb_build_object(
    'success', true,
    'ready', true,
    'academicYearId', v_year,
    'gradeLevel', v_grade,
    'subjects', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', catalog.id,
          'code', catalog.code,
          'name', catalog.name,
          'requirement', catalog.requirement,
          'scopeId', catalog.scope_id,
          'approvedQuestionCount', 0
        )
        order by catalog.name
      )
      from (
        select distinct on (candidate.subject_key)
          candidate.id,
          candidate.code,
          candidate.name,
          candidate.requirement,
          candidate.scope_id,
          candidate.subject_key
        from (
          select
            subject.id,
            subject.code,
            subject.name,
            mapping.subject_requirement as requirement,
            mapping.curriculum_scope_id as scope_id,
            private.teacher_assignment_subject_key(subject.name) as subject_key,
            0 as priority
          from public.school_curriculum_scope_mappings mapping
          join public.academic_subjects subject
            on subject.id = mapping.academic_subject_id
           and subject.is_active
          where mapping.school_id = v_school
            and mapping.academic_year_id = v_year
            and mapping.grade_level = v_grade
            and mapping.status = 'active'
            and (
              mapping.subject_requirement = 'required'
              or exists (
                select 1
                from public.student_subject_enrolments subject_enrolment
                where subject_enrolment.student_id = v_student
                  and subject_enrolment.school_id = v_school
                  and subject_enrolment.academic_year_id = v_year
                  and subject_enrolment.academic_subject_id = subject.id
                  and subject_enrolment.status = 'active'
              )
            )
            and (
              v_is_self
              or v_is_admin
              or exists (
                select 1
                from public.class_teacher_assignments cta
                where cta.school_id = v_school
                  and cta.class_id = v_class
                  and cta.teacher_user_id = v_caller
                  and cta.active
                  and private.teacher_assignment_subject_key(cta.subject) =
                      private.teacher_assignment_subject_key(subject.name)
              )
              or exists (
                select 1
                from private.school_year_teacher_allocation_snapshots snap
                where snap.school_id = v_school
                  and snap.academic_year_id = v_year
                  and snap.class_id = v_class
                  and snap.teacher_user_id = v_caller
                  and private.teacher_assignment_subject_key(snap.subject) =
                      private.teacher_assignment_subject_key(subject.name)
              )
            )

          union all

          select
            subject.id,
            subject.code,
            subject.name,
            'required'::text as requirement,
            null::uuid as scope_id,
            private.teacher_assignment_subject_key(subject.name) as subject_key,
            1 as priority
          from public.class_teacher_assignments cta
          join public.academic_subjects subject
            on subject.is_active
           and private.teacher_assignment_subject_key(subject.name) =
               private.teacher_assignment_subject_key(cta.subject)
          where cta.school_id = v_school
            and cta.class_id = v_class
            and cta.active
            and (v_is_self or v_is_admin or cta.teacher_user_id = v_caller)

          union all

          select
            subject.id,
            subject.code,
            subject.name,
            'required'::text as requirement,
            null::uuid as scope_id,
            private.teacher_assignment_subject_key(subject.name) as subject_key,
            2 as priority
          from private.school_year_teacher_allocation_snapshots snap
          join public.academic_subjects subject
            on subject.is_active
           and private.teacher_assignment_subject_key(subject.name) =
               private.teacher_assignment_subject_key(snap.subject)
          where snap.school_id = v_school
            and snap.academic_year_id = v_year
            and snap.class_id = v_class
            and (v_is_self or v_is_admin or snap.teacher_user_id = v_caller)
        ) candidate
        order by candidate.subject_key, candidate.priority, candidate.name
      ) catalog
    ), '[]'::jsonb)
  );
end;
$function$
;
revoke all on function private.student_academic_subjects_for_year_legacy_group_transition(uuid,uuid)
from public,anon,authenticated,service_role;

create or replace function public.rpc_teacher_academic_profile_students_for_year(p_academic_year_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_caller uuid:=auth.uid();
  v_school_id uuid;
  v_operational_year_id uuid;
  v_is_admin boolean:=false;
  v_has_current_groups boolean:=false;
  v_has_history boolean:=false;
  v_result jsonb;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;

  select y.school_id into v_school_id
  from public.school_academic_years y
  where y.id=p_academic_year_id;

  if v_school_id is null then raise exception 'Academic year not found'; end if;

  v_is_admin:=public.can_administer_school(v_school_id) or public.is_school_owner(v_school_id);
  if v_is_admin then
    return private.teacher_academic_profile_students_for_year_legacy_group_transition(p_academic_year_id);
  end if;

  if not exists(select 1 from public.teachers t where t.user_id=v_caller) then
    raise exception 'Not authorized';
  end if;

  v_operational_year_id:=public.academic_resolve_operational_year_id(v_school_id,now());
  v_has_current_groups:=p_academic_year_id=v_operational_year_id
    and exists(select 1 from private.teacher_current_teaching_groups(v_caller,v_school_id));
  v_has_history:=p_academic_year_id is distinct from v_operational_year_id
    and exists(
      select 1 from private.teacher_historical_teaching_roster(v_caller,v_school_id,p_academic_year_id)
    );

  if v_has_current_groups then
    select coalesce(jsonb_agg(row_data order by row_data->>'grade',row_data->>'class_name',row_data->>'student_name'),'[]'::jsonb)
    into v_result
    from (
      select jsonb_build_object(
        'student_id',u.id,
        'student_name',coalesce(nullif(trim(u.full_name),''),u.username),
        'username',u.username,
        'class_name',coalesce(nullif(trim(r.class_code),''),nullif(trim(u.batch),''),'—'),
        'grade',r.grade_level,
        'school_id',r.school_id,
        'subjects',to_jsonb(array_agg(distinct r.school_subject_name order by r.school_subject_name))
      ) row_data
      from private.teacher_current_teaching_roster(v_caller,v_school_id) r
      join public.users u on u.id=r.student_id
      group by u.id,u.full_name,u.username,u.batch,r.grade_level,r.school_id,r.class_code
    ) x;
    return coalesce(v_result,'[]'::jsonb);
  end if;

  if v_has_history then
    select coalesce(jsonb_agg(row_data order by row_data->>'grade',row_data->>'class_name',row_data->>'student_name'),'[]'::jsonb)
    into v_result
    from (
      select jsonb_build_object(
        'student_id',u.id,
        'student_name',coalesce(nullif(trim(u.full_name),''),u.username),
        'username',u.username,
        'class_name',coalesce(nullif(trim(r.class_code),''),'—'),
        'grade',r.grade_level,
        'school_id',r.school_id,
        'subjects',to_jsonb(array_agg(distinct r.school_subject_name order by r.school_subject_name))
      ) row_data
      from private.teacher_historical_teaching_roster(v_caller,v_school_id,p_academic_year_id) r
      join public.users u on u.id=r.student_id
      group by u.id,u.full_name,u.username,r.grade_level,r.school_id,r.class_code
    ) x;
    return coalesce(v_result,'[]'::jsonb);
  end if;

  return private.teacher_academic_profile_students_for_year_legacy_group_transition(p_academic_year_id);
end;
$function$;

revoke all on function public.rpc_teacher_academic_profile_students_for_year(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_academic_profile_students_for_year(uuid)
to authenticated,service_role;

create or replace function public.rpc_student_academic_subjects_for_year(
  p_student_id uuid,
  p_academic_year_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_caller uuid:=auth.uid();
  v_student uuid:=coalesce(p_student_id,auth.uid());
  v_school uuid;
  v_operational_year uuid;
  v_is_admin boolean:=false;
  v_is_current_teacher boolean:=false;
  v_is_historical_teacher boolean:=false;
  v_grade text;
begin
  if v_caller is null then
    raise exception using errcode='42501',message='authentication_required';
  end if;

  select u.school_id into v_school from public.users u where u.id=v_student;
  if v_school is null then
    return jsonb_build_object('success',true,'ready',false,'code','school_required','subjects','[]'::jsonb);
  end if;

  v_is_admin:=public.can_administer_school(v_school) or public.is_school_owner(v_school);
  if v_caller=v_student or v_is_admin then
    return private.student_academic_subjects_for_year_legacy_group_transition(v_student,p_academic_year_id);
  end if;

  v_operational_year:=public.academic_resolve_operational_year_id(v_school,now());
  v_is_current_teacher:=p_academic_year_id=v_operational_year and exists(
    select 1 from private.teacher_current_teaching_roster(v_caller,v_school) r
    where r.student_id=v_student
  );
  v_is_historical_teacher:=p_academic_year_id is distinct from v_operational_year and exists(
    select 1 from private.teacher_historical_teaching_roster(v_caller,v_school,p_academic_year_id) r
    where r.student_id=v_student
  );

  if v_is_current_teacher then
    select max(r.grade_level) into v_grade
    from private.teacher_current_teaching_roster(v_caller,v_school) r
    where r.student_id=v_student;

    return jsonb_build_object(
      'success',true,'ready',true,'academicYearId',p_academic_year_id,'gradeLevel',v_grade,
      'subjects',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',r.school_subject_id,
          'schoolSubjectId',r.school_subject_id,
          'code',coalesce(r.academic_subject_code,public.academic_normalize_subject_key(r.school_subject_name)),
          'name',r.school_subject_name,
          'canonicalName',r.academic_subject_name,
          'academicSubjectId',r.academic_subject_id,
          'mappingStatus',case when r.academic_subject_id is null then 'unmapped' else 'mapped' end,
          'requirement','teacher_allocation',
          'scopeId',null,
          'approvedQuestionCount',0
        ) order by r.school_subject_name)
        from (
          select distinct school_subject_id,school_subject_name,academic_subject_id,academic_subject_name,academic_subject_code
          from private.teacher_current_teaching_roster(v_caller,v_school)
          where student_id=v_student
        ) r
      ),'[]'::jsonb)
    );
  end if;

  if v_is_historical_teacher then
    select max(r.grade_level) into v_grade
    from private.teacher_historical_teaching_roster(v_caller,v_school,p_academic_year_id) r
    where r.student_id=v_student;

    return jsonb_build_object(
      'success',true,'ready',true,'academicYearId',p_academic_year_id,'gradeLevel',v_grade,
      'subjects',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',r.school_subject_id,
          'schoolSubjectId',r.school_subject_id,
          'code',coalesce(r.academic_subject_code,public.academic_normalize_subject_key(r.school_subject_name)),
          'name',r.school_subject_name,
          'canonicalName',r.academic_subject_name,
          'academicSubjectId',r.academic_subject_id,
          'mappingStatus',case when r.academic_subject_id is null then 'unmapped' else 'mapped' end,
          'requirement','historical_teacher_allocation',
          'scopeId',null,
          'approvedQuestionCount',0
        ) order by r.school_subject_name)
        from (
          select distinct school_subject_id,school_subject_name,academic_subject_id,academic_subject_name,academic_subject_code
          from private.teacher_historical_teaching_roster(v_caller,v_school,p_academic_year_id)
          where student_id=v_student
        ) r
      ),'[]'::jsonb)
    );
  end if;

  return private.student_academic_subjects_for_year_legacy_group_transition(v_student,p_academic_year_id);
end;
$function$;

revoke all on function public.rpc_student_academic_subjects_for_year(uuid,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_student_academic_subjects_for_year(uuid,uuid)
to authenticated,service_role;
