-- School Subjects v2 follow-up: make school_subject_id the operational identity everywhere.
-- This migration repairs ambiguous legacy alias links without hardcoding any school
-- or subject name, keeps both legitimate school subjects when a previous backfill
-- collapsed them, and aligns teacher/profile/assignment access with the exact
-- school-owned subject.

-- ---------------------------------------------------------------------------
-- 1. Repair ambiguous compatibility links.
--
-- Generic pattern: a legacy row's text label differs from the linked school
-- subject, while both local subjects share the same canonical academic map.
-- Preserve both meanings:
--   * clone the currently-linked local subject allocation
--   * restore the legacy row to the exact local subject matching its old label
-- This keeps valid administrator intent without merging school subjects.
-- ---------------------------------------------------------------------------

with candidates as (
  select
    cta.id as allocation_id,
    cta.school_id,
    cta.class_id,
    cta.teacher_user_id,
    cta.subject as legacy_subject,
    cta.can_create,
    cta.can_grade,
    cta.active,
    cta.created_at,
    cta.created_by,
    linked.id as linked_subject_id,
    linked.name as linked_subject_name,
    linked.created_at as linked_subject_created_at,
    linked.created_by as linked_subject_created_by,
    exact.id as exact_subject_id,
    exact.name as exact_subject_name,
    count(*) over (partition by cta.id) as exact_match_count,
    row_number() over (partition by cta.id order by exact.created_at, exact.id) as exact_rank
  from public.class_teacher_assignments cta
  join public.school_subjects linked
    on linked.id=cta.school_subject_id
   and linked.school_id=cta.school_id
   and linked.is_active
   and linked.academic_subject_id is not null
  join public.school_subjects exact
    on exact.school_id=cta.school_id
   and exact.is_active
   and exact.id<>linked.id
   and exact.academic_subject_id=linked.academic_subject_id
   and (
     lower(trim(exact.name))=lower(trim(cta.subject))
     or (exact.code is not null and lower(trim(exact.code))=lower(trim(cta.subject)))
   )
  where cta.active
    and cta.school_subject_id is not null
    and lower(trim(linked.name))<>lower(trim(cta.subject))
),
repairable as (
  select *
  from candidates
  where exact_match_count=1 and exact_rank=1
)
insert into public.class_teacher_assignments(
  school_id,class_id,teacher_user_id,subject,school_subject_id,
  can_create,can_grade,active,created_at,created_by
)
select
  r.school_id,r.class_id,r.teacher_user_id,r.linked_subject_name,r.linked_subject_id,
  r.can_create,r.can_grade,r.active,
  coalesce(r.linked_subject_created_at,r.created_at,now()),
  coalesce(r.linked_subject_created_by,r.created_by)
from repairable r
where not exists (
  select 1
  from public.class_teacher_assignments existing
  where existing.id<>r.allocation_id
    and existing.school_id=r.school_id
    and existing.class_id=r.class_id
    and existing.teacher_user_id=r.teacher_user_id
    and existing.school_subject_id=r.linked_subject_id
)
on conflict do nothing;

with candidates as (
  select
    cta.id as allocation_id,
    exact.id as exact_subject_id,
    exact.name as exact_subject_name,
    count(*) over (partition by cta.id) as exact_match_count,
    row_number() over (partition by cta.id order by exact.created_at, exact.id) as exact_rank
  from public.class_teacher_assignments cta
  join public.school_subjects linked
    on linked.id=cta.school_subject_id
   and linked.school_id=cta.school_id
   and linked.is_active
   and linked.academic_subject_id is not null
  join public.school_subjects exact
    on exact.school_id=cta.school_id
   and exact.is_active
   and exact.id<>linked.id
   and exact.academic_subject_id=linked.academic_subject_id
   and (
     lower(trim(exact.name))=lower(trim(cta.subject))
     or (exact.code is not null and lower(trim(exact.code))=lower(trim(cta.subject)))
   )
  where cta.active
    and cta.school_subject_id is not null
    and lower(trim(linked.name))<>lower(trim(cta.subject))
),
repairable as (
  select *
  from candidates
  where exact_match_count=1 and exact_rank=1
)
update public.class_teacher_assignments cta
set school_subject_id=r.exact_subject_id,
    subject=r.exact_subject_name
from repairable r
where cta.id=r.allocation_id;

-- The denormalized text column is compatibility/display data only. Once a row
-- has a first-class identity, keep its text synchronized with that local subject.
update public.class_teacher_assignments cta
set subject=ss.name
from public.school_subjects ss
where cta.school_subject_id=ss.id
  and cta.school_id=ss.school_id
  and cta.active
  and cta.subject is distinct from ss.name;

-- Exact school subject is now the uniqueness boundary. Multiple local subjects
-- may share one academic map in the same class; duplicate local allocations may not.
create unique index if not exists cta_unique_class_teacher_school_subject
  on public.class_teacher_assignments(class_id,teacher_user_id,school_subject_id)
  where school_subject_id is not null;

-- Legacy class allocations pre-date per-student subject access. If a repaired
-- local subject has no first-class offering for that grade, preserve the old
-- whole-class teaching semantics by materializing an all-grade offering. An
-- already-configured selective/all-grade offering is never overwritten.
with legacy_offerings as (
  select distinct
    cta.school_id,
    cta.school_subject_id,
    public.academic_resolve_operational_year_id(cta.school_id,now()) as academic_year_id,
    c.grade_level::text as grade_level,
    cta.created_by
  from public.class_teacher_assignments cta
  join public.classes c
    on c.id=cta.class_id and c.school_id=cta.school_id
  join public.school_subjects ss
    on ss.id=cta.school_subject_id and ss.school_id=cta.school_id and ss.is_active
  where cta.active
    and cta.school_subject_id is not null
    and coalesce(c.is_active,true)
)
insert into public.school_subject_offerings(
  school_id,school_subject_id,academic_year_id,grade_level,
  curriculum_scope_id,access_mode,status,created_by
)
select
  legacy.school_id,
  legacy.school_subject_id,
  legacy.academic_year_id,
  legacy.grade_level,
  (
    select mapping.curriculum_scope_id
    from public.school_curriculum_scope_mappings mapping
    join public.school_subjects subject
      on subject.id=legacy.school_subject_id
     and subject.school_id=legacy.school_id
    where mapping.school_id=legacy.school_id
      and mapping.academic_year_id=legacy.academic_year_id
      and mapping.grade_level=legacy.grade_level
      and mapping.academic_subject_id=subject.academic_subject_id
      and mapping.status='active'
    order by mapping.updated_at desc,mapping.id
    limit 1
  ),
  'all_grade',
  'active',
  legacy.created_by
from legacy_offerings legacy
where legacy.academic_year_id is not null
on conflict (school_subject_id,academic_year_id,grade_level) do nothing;

-- ---------------------------------------------------------------------------
-- 2. One current-allocation read model for School Admin.
-- ---------------------------------------------------------------------------

create or replace function public.school_admin_list_teacher_allocations(
  p_school_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null or not coalesce(public.can_administer_school(p_school_id),false) then
    raise exception using errcode='42501',message='school_administrator_access_required';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',cta.id,
      'school_id',cta.school_id,
      'class_id',cta.class_id,
      'teacher_user_id',cta.teacher_user_id,
      'school_subject_id',cta.school_subject_id,
      'subject',coalesce(ss.name,cta.subject),
      'academic_subject_id',ss.academic_subject_id,
      'academic_subject_name',academic.name,
      'active',cta.active,
      'allocated_at',cta.created_at,
      'teacher_name',coalesce(nullif(u.full_name,''),nullif(u.username,''),u.email,'Unknown teacher'),
      'teacher_username',u.username,
      'teacher_email',u.email,
      'teacher_membership_status',sm.status,
      'teacher_can_teach',coalesce(sm.can_teach,false),
      'class_code',c.class_code,
      'class_name',c.class_name,
      'grade_level',c.grade_level
    ) order by c.grade_level,c.class_code,coalesce(ss.name,cta.subject),coalesce(u.full_name,u.username,u.email))
    from public.class_teacher_assignments cta
    left join public.school_subjects ss
      on ss.id=cta.school_subject_id and ss.school_id=cta.school_id
    left join public.academic_subjects academic on academic.id=ss.academic_subject_id
    left join public.classes c on c.id=cta.class_id and c.school_id=cta.school_id
    left join public.users u on u.id=cta.teacher_user_id
    left join public.school_members sm
      on sm.school_id=cta.school_id and sm.user_id=cta.teacher_user_id
    where cta.school_id=p_school_id
      and cta.active
  ),'[]'::jsonb);
end;
$$;
revoke all on function public.school_admin_list_teacher_allocations(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.school_admin_list_teacher_allocations(uuid)
  to authenticated,service_role;

-- Teacher workspace/profile reads the same local subject label as School Admin.
-- Keep the existing return shape to avoid breaking callers.
create or replace function public.get_teacher_assigned_classes(
  p_teacher_user_id uuid default null
)
returns table(
  class_id uuid,
  class_code text,
  class_name text,
  grade_level text,
  subject text,
  is_active boolean,
  school_id uuid,
  school_name text
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_teacher_user_id uuid:=coalesce(p_teacher_user_id,auth.uid());
  v_teacher_school_id uuid;
begin
  if v_actor is null then
    raise exception using errcode='42501',message='Authentication required';
  end if;

  select sm.school_id into v_teacher_school_id
  from public.school_members sm
  where sm.user_id=v_teacher_user_id and sm.status='active'
  order by sm.joined_at desc nulls last,sm.id
  limit 1;

  if v_teacher_school_id is null then
    return;
  end if;

  if v_teacher_user_id<>v_actor
    and not public.is_school_admin_of(v_actor,v_teacher_school_id)
  then
    raise exception using errcode='42501',message='Teacher assignment access denied';
  end if;

  return query
  select
    c.id,
    c.class_code::text,
    coalesce(c.class_name,c.class_code)::text,
    c.grade_level::text,
    coalesce(ss.name,cta.subject)::text,
    cta.active,
    c.school_id,
    coalesce(s.name,'Unknown School')::text
  from public.class_teacher_assignments cta
  join public.classes c
    on c.id=cta.class_id and c.school_id=cta.school_id
  left join public.school_subjects ss
    on ss.id=cta.school_subject_id and ss.school_id=cta.school_id
  left join public.schools s on s.id=c.school_id
  where cta.teacher_user_id=v_teacher_user_id
    and cta.school_id=v_teacher_school_id
    and cta.active
  order by s.name nulls last,c.grade_level nulls last,c.class_code,coalesce(ss.name,cta.subject);
end;
$$;
revoke all on function public.get_teacher_assigned_classes(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_teacher_assigned_classes(uuid)
  to authenticated,service_role;

create or replace function public.get_teacher_allocated_classes(
  p_teacher_user_id uuid default null
)
returns table(
  class_id uuid,
  class_code text,
  class_name text,
  grade_level text,
  subject text,
  is_active boolean,
  school_id uuid,
  school_name text
)
language sql
stable
set search_path=''
as $$
  select * from public.get_teacher_assigned_classes(p_teacher_user_id);
$$;
revoke all on function public.get_teacher_allocated_classes(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_teacher_allocated_classes(uuid)
  to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 3. Assignment audiences respect the selected-student access of the exact
-- school subject. A mapped subject may use shared canonical questions, but its
-- assignment cannot spill into students who are not enrolled in that local subject.
-- Legacy allocations without school_subject_id retain the previous fail-safe
-- class-roster behavior during transition.
-- ---------------------------------------------------------------------------

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
  with school_context as (
    select public.academic_resolve_operational_year_id(p_school_id,now()) as academic_year_id
  ),
  allocated_classes as (
    select distinct
      c.id,
      c.class_code,
      c.school_id,
      c.grade_level::text as grade_level,
      cta.school_subject_id,
      offering.academic_year_id,
      offering.access_mode
    from public.class_teacher_assignments cta
    join public.classes c
      on c.id=cta.class_id
     and c.school_id=cta.school_id
    cross join school_context context
    left join public.school_subjects ss
      on ss.id=cta.school_subject_id
     and ss.school_id=cta.school_id
     and ss.is_active
    left join public.school_subject_offerings offering
      on offering.school_id=cta.school_id
     and offering.school_subject_id=cta.school_subject_id
     and offering.grade_level=c.grade_level::text
     and offering.status='active'
     and (
       context.academic_year_id is null
       or offering.academic_year_id=context.academic_year_id
     )
    where cta.teacher_user_id=p_teacher_user_id
      and cta.school_id=p_school_id
      and cta.active
      and coalesce(c.is_active,true)
      and (
        (
          cta.school_subject_id is not null
          and ss.id is not null
          and (
            lower(trim(ss.name))=lower(trim(p_subject))
            or (ss.code is not null and lower(trim(ss.code))=lower(trim(p_subject)))
          )
          and offering.id is not null
        )
        or (
          cta.school_subject_id is null
          and private.teacher_assignment_subject_key(cta.subject)
              =private.teacher_assignment_subject_key(p_subject)
        )
      )
      and (p_class_id is null or c.id=p_class_id)
  ),
  canonical_roster as (
    select
      u.id as student_id,
      ac.class_code,
      ac.school_subject_id,
      ac.academic_year_id,
      ac.access_mode
    from allocated_classes ac
    join public.class_students cs on cs.class_id=ac.id
    join public.users u
      on u.id=cs.student_id
     and u.school_id=ac.school_id
     and coalesce(u.role,'student')='student'
    where not coalesce(u.is_banned,false)
      and not (u.banned_until is not null and u.banned_until>now())
  ),
  legacy_roster as (
    select
      u.id as student_id,
      ac.class_code,
      ac.school_subject_id,
      ac.academic_year_id,
      ac.access_mode
    from allocated_classes ac
    join public.users u
      on u.school_id=ac.school_id
     and upper(regexp_replace(trim(coalesce(u.batch,'')),'\\s+','','g'))
         =upper(regexp_replace(trim(ac.class_code),'\\s+','','g'))
     and coalesce(u.role,'student')='student'
    where not coalesce(u.is_banned,false)
      and not (u.banned_until is not null and u.banned_until>now())
      and not exists(
        select 1 from public.class_students existing where existing.student_id=u.id
      )
  ),
  roster as (
    select * from canonical_roster
    union all
    select * from legacy_roster
  ),
  subject_authorized as (
    select r.student_id,r.class_code
    from roster r
    where
      r.school_subject_id is null
      or r.access_mode='all_grade'
      or (
        r.access_mode='selected'
        and exists(
          select 1
          from public.school_subject_enrolments enrolment
          where enrolment.school_id=p_school_id
            and enrolment.school_subject_id=r.school_subject_id
            and enrolment.academic_year_id=r.academic_year_id
            and enrolment.student_id=r.student_id
            and enrolment.status='active'
            and current_date>=enrolment.starts_on
            and (enrolment.ends_on is null or current_date<=enrolment.ends_on)
        )
      )
  )
  select distinct on (authorized.student_id)
    authorized.student_id,
    authorized.class_code::text
  from subject_authorized authorized
  where p_student_ids is null or authorized.student_id=any(p_student_ids)
  order by authorized.student_id,authorized.class_code;
$$;
revoke all on function private.teacher_assignment_authorized_students(uuid,uuid,text,uuid,uuid[])
  from public,anon,authenticated,service_role;
grant execute on function private.teacher_assignment_authorized_students(uuid,uuid,text,uuid,uuid[])
  to service_role;
