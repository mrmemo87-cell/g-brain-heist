-- School Subjects v2: school-owned subject identity with optional academic mapping.
--
-- Principles:
--   * A school decides its own subject catalogue. Nothing in this model hardcodes
--     school-facing subject names.
--   * school_subjects.id is the operational identity for enrolment, staffing and
--     assignment history.
--   * academic_subject_id is optional capability metadata. Multiple independent
--     school subjects may map to the same canonical academic subject/curriculum.
--   * Removing a subject never destroys historical academic evidence.

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. School-owned subject identity
-- ---------------------------------------------------------------------------

-- Subject mapping must be explicit. A school typing "English" must not silently
-- acquire a canonical mapping merely because the label happens to match one.
drop trigger if exists trg_academic_enrich_school_subject on public.school_subjects;

alter table public.school_subjects
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.users(id) on delete set null;

create index if not exists school_subjects_school_active_name_idx
  on public.school_subjects(school_id, is_active, name);
create index if not exists school_subjects_academic_map_idx
  on public.school_subjects(school_id, academic_subject_id)
  where academic_subject_id is not null;

comment on column public.school_subjects.academic_subject_id is
  'Optional canonical academic capability mapping. This never defines the school subject identity.';

-- Operational grade/year offering. This is deliberately keyed by school_subject_id,
-- not academic_subject_id, so English and ESL may independently map to English.
create table if not exists public.school_subject_offerings (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  school_subject_id uuid not null references public.school_subjects(id) on delete cascade,
  academic_year_id uuid not null references public.school_academic_years(id) on delete restrict,
  grade_level text not null,
  curriculum_scope_id uuid references public.curriculum_scopes(id) on delete set null,
  access_mode text not null default 'all_grade'
    check (access_mode in ('all_grade','selected')),
  status text not null default 'active'
    check (status in ('active','archived')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_subject_id, academic_year_id, grade_level),
  check (grade_level ~ '^(?:[1-9]|1[0-2])$')
);

create index if not exists school_subject_offerings_school_year_grade_idx
  on public.school_subject_offerings(school_id, academic_year_id, grade_level, status);
create index if not exists school_subject_offerings_subject_idx
  on public.school_subject_offerings(school_subject_id, academic_year_id, status);

-- Individual membership is also keyed by the school subject, not the canonical map.
create table if not exists public.school_subject_enrolments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  school_subject_id uuid not null references public.school_subjects(id) on delete cascade,
  academic_year_id uuid not null references public.school_academic_years(id) on delete restrict,
  student_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active','withdrawn')),
  starts_on date not null,
  ends_on date,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, academic_year_id, school_subject_id),
  check (ends_on is null or ends_on >= starts_on)
);

create index if not exists school_subject_enrolments_subject_year_idx
  on public.school_subject_enrolments(school_subject_id, academic_year_id, status, student_id);
create index if not exists school_subject_enrolments_student_year_idx
  on public.school_subject_enrolments(student_id, academic_year_id, status);

-- Unmapped subjects are valid school subjects. They create an academic-attention
-- request instead of being rejected.
create table if not exists public.school_subject_mapping_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  school_subject_id uuid not null unique references public.school_subjects(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','resolved','dismissed')),
  requested_by uuid references public.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  resolved_by uuid references public.users(id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  updated_at timestamptz not null default now()
);

create index if not exists school_subject_mapping_requests_status_idx
  on public.school_subject_mapping_requests(status, requested_at desc);
create index if not exists school_subject_mapping_requests_school_idx
  on public.school_subject_mapping_requests(school_id, status, requested_at desc);

alter table public.school_subject_offerings enable row level security;
alter table public.school_subject_enrolments enable row level security;
alter table public.school_subject_mapping_requests enable row level security;

revoke all on public.school_subject_offerings from public, anon, authenticated;
revoke all on public.school_subject_enrolments from public, anon, authenticated;
revoke all on public.school_subject_mapping_requests from public, anon, authenticated;
grant select, insert, update, delete on public.school_subject_offerings to service_role;
grant select, insert, update, delete on public.school_subject_enrolments to service_role;
grant select, insert, update, delete on public.school_subject_mapping_requests to service_role;

-- Staffing and assignments retain the school subject identity independently of
-- the display label and independently of the canonical academic map.
alter table public.class_teacher_assignments
  add column if not exists school_subject_id uuid references public.school_subjects(id) on delete set null;
create index if not exists class_teacher_assignments_school_subject_idx
  on public.class_teacher_assignments(school_id, school_subject_id, active, class_id)
  where school_subject_id is not null;

alter table if exists public.assignments
  add column if not exists school_subject_id uuid references public.school_subjects(id) on delete set null;
create index if not exists assignments_school_subject_idx
  on public.assignments(school_id, school_subject_id, assigned_at desc)
  where school_subject_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Safe compatibility/backfill from the first provisioning model
-- ---------------------------------------------------------------------------

-- Ensure every governed legacy/current mapping has a school subject row.
insert into public.school_subjects(
  school_id, name, code, is_active, created_by, academic_subject_id
)
select distinct on (m.school_id, coalesce(nullif(trim(m.display_name),''), a.name))
  m.school_id,
  coalesce(nullif(trim(m.display_name),''), a.name),
  upper(left(regexp_replace(coalesce(nullif(trim(m.display_name),''), a.name), '[^A-Za-z0-9]+', '-', 'g'), 24)),
  true,
  m.created_by,
  m.academic_subject_id
from public.school_curriculum_scope_mappings m
join public.academic_subjects a on a.id=m.academic_subject_id
where m.status in ('planned','active')
order by m.school_id, coalesce(nullif(trim(m.display_name),''), a.name), m.updated_at desc nulls last, m.created_at desc
on conflict (school_id, name) do update
set academic_subject_id=coalesce(public.school_subjects.academic_subject_id, excluded.academic_subject_id),
    is_active=true,
    updated_at=now();

update public.school_curriculum_scope_mappings m
set school_subject_id=s.id,
    display_name=coalesce(nullif(trim(m.display_name),''), s.name),
    updated_at=now()
from public.school_subjects s
where m.school_id=s.school_id
  and m.school_subject_id is null
  and lower(trim(s.name))=lower(trim(coalesce(nullif(m.display_name,''), (
    select a.name from public.academic_subjects a where a.id=m.academic_subject_id
  ))));

insert into public.school_subject_offerings(
  school_id, school_subject_id, academic_year_id, grade_level,
  curriculum_scope_id, access_mode, status, created_by, created_at, updated_at
)
select
  m.school_id, m.school_subject_id, m.academic_year_id, m.grade_level,
  m.curriculum_scope_id,
  case when m.subject_requirement='elective' then 'selected' else 'all_grade' end,
  case when m.status='active' then 'active' else 'archived' end,
  m.created_by, m.created_at, coalesce(m.updated_at,m.created_at,now())
from public.school_curriculum_scope_mappings m
where m.school_subject_id is not null
on conflict (school_subject_id, academic_year_id, grade_level) do update
set curriculum_scope_id=excluded.curriculum_scope_id,
    access_mode=excluded.access_mode,
    status=excluded.status,
    updated_at=excluded.updated_at;

-- Legacy individual enrolment can be migrated safely because the old model only
-- allowed one active offering per canonical subject/grade.
insert into public.school_subject_enrolments(
  school_id, school_subject_id, academic_year_id, student_id,
  status, starts_on, ends_on, created_by, created_at, updated_at
)
select distinct on (se.student_id,se.academic_year_id,m.school_subject_id)
  se.school_id,
  m.school_subject_id,
  se.academic_year_id,
  se.student_id,
  se.status,
  se.starts_on,
  se.ends_on,
  se.created_by,
  se.created_at,
  se.updated_at
from public.student_subject_enrolments se
join public.student_academic_enrolments ae
  on ae.student_id=se.student_id
 and ae.school_id=se.school_id
 and ae.academic_year_id=se.academic_year_id
join public.school_curriculum_scope_mappings m
  on m.school_id=se.school_id
 and m.academic_year_id=se.academic_year_id
 and m.academic_subject_id=se.academic_subject_id
 and m.grade_level=ae.grade_level
 and m.school_subject_id is not null
 and m.status in ('planned','active')
order by se.student_id,se.academic_year_id,m.school_subject_id,se.updated_at desc nulls last,se.created_at desc
on conflict (student_id,academic_year_id,school_subject_id) do update
set status=excluded.status,
    starts_on=excluded.starts_on,
    ends_on=excluded.ends_on,
    updated_at=greatest(public.school_subject_enrolments.updated_at,excluded.updated_at);

-- The first provisioning version canonicalized teacher-allocation text. Recover
-- the school subject identity from the active grade mapping where it is unambiguous.
update public.class_teacher_assignments cta
set school_subject_id = candidate.school_subject_id
from lateral (
  select m.school_subject_id
  from public.classes c
  join public.school_curriculum_scope_mappings m
    on m.school_id=cta.school_id
   and m.grade_level=c.grade_level::text
   and m.school_subject_id is not null
   and m.status in ('planned','active')
  join public.academic_subjects a on a.id=m.academic_subject_id
  where c.id=cta.class_id
    and c.school_id=cta.school_id
    and private.teacher_assignment_subject_key(cta.subject)=private.teacher_assignment_subject_key(a.name)
  order by m.updated_at desc nulls last,m.created_at desc
  limit 1
) candidate
where cta.school_subject_id is null;

-- Existing assignments are linked only when their stored school-facing label is
-- an exact school-subject match. Ambiguous historical canonical labels are not guessed.
update public.assignments a
set school_subject_id=s.id
from public.school_subjects s
where a.school_subject_id is null
  and a.school_id=s.school_id
  and lower(trim(coalesce(a.subject_name,'')))=lower(trim(s.name));

-- ---------------------------------------------------------------------------
-- 3. Operational helpers
-- ---------------------------------------------------------------------------

create or replace function private.touch_school_subject()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  new.updated_at:=now();
  return new;
end;
$$;
revoke all on function private.touch_school_subject() from public,anon,authenticated,service_role;

drop trigger if exists trg_touch_school_subject on public.school_subjects;
create trigger trg_touch_school_subject
before update on public.school_subjects
for each row execute function private.touch_school_subject();

create or replace function private.resolve_assignment_school_subject()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_subject uuid;
begin
  if new.school_subject_id is not null then
    if not exists(
      select 1 from public.school_subjects s
      where s.id=new.school_subject_id
        and (new.school_id is null or s.school_id=new.school_id)
    ) then
      raise exception using errcode='23503',message='assignment_school_subject_not_in_school';
    end if;
    return new;
  end if;

  if new.school_id is not null and nullif(trim(coalesce(new.subject_name,'')),'') is not null then
    select s.id into v_subject
    from public.school_subjects s
    where s.school_id=new.school_id
      and s.is_active
      and lower(trim(s.name))=lower(trim(new.subject_name))
    limit 1;
    new.school_subject_id:=v_subject;
  end if;
  return new;
end;
$$;
revoke all on function private.resolve_assignment_school_subject() from public,anon,authenticated,service_role;

drop trigger if exists trg_resolve_assignment_school_subject on public.assignments;
create trigger trg_resolve_assignment_school_subject
before insert or update of school_id,subject_name,school_subject_id on public.assignments
for each row execute function private.resolve_assignment_school_subject();

create or replace function public.admin_allocate_teacher_to_school_subject(
  p_school_id uuid,
  p_class_id uuid,
  p_teacher_user_id uuid,
  p_school_subject_id uuid,
  p_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_subject_name text;
  v_allocation_id uuid;
begin
  if v_actor is null or not coalesce(public.can_administer_school(p_school_id),false) then
    return jsonb_build_object('success',false,'error','You do not have permission to manage teacher allocations.');
  end if;

  select s.name into v_subject_name
  from public.school_subjects s
  where s.id=p_school_subject_id and s.school_id=p_school_id and s.is_active;
  if v_subject_name is null then
    return jsonb_build_object('success',false,'error','Choose an active subject from this school.');
  end if;

  if not exists(select 1 from public.classes c where c.id=p_class_id and c.school_id=p_school_id and c.is_active is distinct from false) then
    return jsonb_build_object('success',false,'error','Choose an active class from this school.');
  end if;

  if not exists(
    select 1 from public.school_members sm
    where sm.school_id=p_school_id and sm.user_id=p_teacher_user_id
      and sm.status='active' and sm.can_teach
  ) then
    return jsonb_build_object('success',false,'error','Choose a member with active teaching access.');
  end if;

  select cta.id into v_allocation_id
  from public.class_teacher_assignments cta
  where cta.school_id=p_school_id
    and cta.class_id=p_class_id
    and cta.teacher_user_id=p_teacher_user_id
    and cta.school_subject_id=p_school_subject_id
  order by cta.created_at desc
  limit 1;

  if v_allocation_id is null then
    insert into public.class_teacher_assignments(
      school_id,class_id,teacher_user_id,subject,school_subject_id,active,created_by
    ) values (
      p_school_id,p_class_id,p_teacher_user_id,v_subject_name,p_school_subject_id,p_active,v_actor
    ) returning id into v_allocation_id;
  else
    update public.class_teacher_assignments
    set subject=v_subject_name,school_subject_id=p_school_subject_id,active=p_active
    where id=v_allocation_id;
  end if;

  return jsonb_build_object('success',true,'allocation_id',v_allocation_id,'school_subject_id',p_school_subject_id,'subject',v_subject_name);
end;
$$;
revoke all on function public.admin_allocate_teacher_to_school_subject(uuid,uuid,uuid,uuid,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.admin_allocate_teacher_to_school_subject(uuid,uuid,uuid,uuid,boolean)
  to authenticated,service_role;

-- Keep the old public signature for existing callers, but make the school subject
-- catalogue authoritative instead of canonicalizing the label.
create or replace function public.admin_allocate_teacher_to_class_subject(
  p_school_id uuid,
  p_class_id uuid,
  p_teacher_user_id uuid,
  p_subject text,
  p_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_school_subject_id uuid;
begin
  if auth.uid() is null or not coalesce(public.can_administer_school(p_school_id),false) then
    return jsonb_build_object('success',false,'error','You do not have permission to manage teacher allocations.');
  end if;

  select s.id into v_school_subject_id
  from public.school_subjects s
  where s.school_id=p_school_id and s.is_active
    and (
      lower(trim(s.name))=lower(trim(coalesce(p_subject,'')))
      or (s.code is not null and lower(trim(s.code))=lower(trim(coalesce(p_subject,''))))
    )
  order by case when lower(trim(s.name))=lower(trim(coalesce(p_subject,''))) then 0 else 1 end,s.created_at
  limit 1;

  if v_school_subject_id is null then
    return jsonb_build_object('success',false,'error','Choose a subject from the school subject catalogue.');
  end if;

  return public.admin_allocate_teacher_to_school_subject(
    p_school_id,p_class_id,p_teacher_user_id,v_school_subject_id,p_active
  );
end;
$$;
revoke all on function public.admin_allocate_teacher_to_class_subject(uuid,uuid,uuid,text,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.admin_allocate_teacher_to_class_subject(uuid,uuid,uuid,text,boolean)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Authoritative school-subject catalogue and CRUD
-- ---------------------------------------------------------------------------

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
              select jsonb_agg(distinct cta.teacher_user_id)
              from public.class_teacher_assignments cta
              join public.classes c on c.id=cta.class_id and c.school_id=cta.school_id
              where cta.school_id=p_school_id
                and cta.school_subject_id=s.id
                and cta.active
                and c.grade_level::text=o.grade_level
            ),'[]'::jsonb),
            'classIds',coalesce((
              select jsonb_agg(distinct cta.class_id)
              from public.class_teacher_assignments cta
              join public.classes c on c.id=cta.class_id and c.school_id=cta.school_id
              where cta.school_id=p_school_id
                and cta.school_subject_id=s.id
                and cta.active
                and c.grade_level::text=o.grade_level
            ),'[]'::jsonb)
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
      where s.school_id=p_school_id
        and (p_include_archived or s.is_active)
    ),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.rpc_school_admin_subject_catalog(uuid,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.rpc_school_admin_subject_catalog(uuid,boolean)
  to authenticated,service_role;

create or replace function public.rpc_school_admin_save_school_subject(
  p_school_id uuid,
  p_name text,
  p_school_subject_id uuid default null,
  p_code text default null,
  p_academic_subject_id uuid default null,
  p_academic_year_id uuid default null,
  p_grade_level text default null,
  p_curriculum_scope_id uuid default null,
  p_access_mode text default 'all_grade',
  p_selected_student_ids uuid[] default '{}'::uuid[],
  p_teacher_user_id uuid default null,
  p_class_ids uuid[] default '{}'::uuid[],
  p_replace_teacher_allocations boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_name text:=trim(coalesce(p_name,''));
  v_code text:=nullif(trim(coalesce(p_code,'')),'');
  v_subject_id uuid:=p_school_subject_id;
  v_student uuid;
  v_class uuid;
  v_start date;
  v_request_id uuid;
  v_school_name text;
  v_result jsonb;
  v_offering_id uuid;
begin
  if v_actor is null or not (public.can_administer_school(p_school_id) or public.is_school_owner(p_school_id)) then
    raise exception using errcode='42501',message='school_administrator_access_required';
  end if;
  if length(v_name)<2 then
    return jsonb_build_object('success',false,'code','subject_name_required');
  end if;
  if exists(
    select 1 from public.school_subjects s
    where s.school_id=p_school_id
      and s.id is distinct from v_subject_id
      and lower(trim(s.name))=lower(v_name)
  ) then
    return jsonb_build_object('success',false,'code','subject_name_already_exists');
  end if;
  if v_subject_id is not null and not exists(
    select 1 from public.school_subjects s where s.id=v_subject_id and s.school_id=p_school_id
  ) then
    return jsonb_build_object('success',false,'code','school_subject_not_found');
  end if;
  if p_academic_subject_id is not null and not exists(
    select 1 from public.academic_subjects a where a.id=p_academic_subject_id and a.is_active
  ) then
    return jsonb_build_object('success',false,'code','academic_subject_not_found');
  end if;
  if p_curriculum_scope_id is not null and p_academic_subject_id is null then
    return jsonb_build_object('success',false,'code','academic_mapping_required_for_scope');
  end if;

  if p_grade_level is not null then
    if trim(p_grade_level)!~'^(?:[1-9]|1[0-2])$' then
      return jsonb_build_object('success',false,'code','invalid_grade_level');
    end if;
    if p_academic_year_id is null or not exists(
      select 1 from public.school_academic_years y where y.id=p_academic_year_id and y.school_id=p_school_id
    ) then
      return jsonb_build_object('success',false,'code','academic_year_not_found');
    end if;
    if p_access_mode not in ('all_grade','selected') then
      return jsonb_build_object('success',false,'code','invalid_subject_access_mode');
    end if;
    if p_curriculum_scope_id is not null and not exists(
      select 1
      from public.curriculum_scopes sc
      join public.curriculum_stages st on st.id=sc.stage_id
      join public.curriculum_framework_versions fv on fv.id=sc.framework_version_id
      where sc.id=p_curriculum_scope_id
        and sc.academic_subject_id=p_academic_subject_id
        and st.sequence_number::text=trim(p_grade_level)
        and fv.status='published'
    ) then
      return jsonb_build_object('success',false,'code','offering_scope_does_not_match_grade_subject');
    end if;

    select y.starts_on into v_start from public.school_academic_years y where y.id=p_academic_year_id;

    if p_access_mode='selected' then
      if cardinality(coalesce(p_selected_student_ids,'{}'::uuid[]))=0 then
        return jsonb_build_object('success',false,'code','select_at_least_one_student');
      end if;
      foreach v_student in array coalesce(p_selected_student_ids,'{}'::uuid[])
      loop
        if not exists(
          select 1 from public.student_academic_enrolments ae
          join public.users u on u.id=ae.student_id
          where ae.student_id=v_student
            and ae.school_id=p_school_id
            and ae.academic_year_id=p_academic_year_id
            and ae.grade_level=trim(p_grade_level)
            and u.school_id=p_school_id
        ) then
          return jsonb_build_object('success',false,'code','selected_student_not_in_grade');
        end if;
      end loop;
    end if;

    if p_teacher_user_id is not null then
      if not exists(
        select 1 from public.school_members sm
        where sm.school_id=p_school_id and sm.user_id=p_teacher_user_id
          and sm.status='active' and sm.can_teach
      ) then
        return jsonb_build_object('success',false,'code','teacher_not_available_in_school');
      end if;
      if cardinality(coalesce(p_class_ids,'{}'::uuid[]))=0 then
        return jsonb_build_object('success',false,'code','teacher_class_required');
      end if;
      foreach v_class in array coalesce(p_class_ids,'{}'::uuid[])
      loop
        if not exists(
          select 1 from public.classes c
          where c.id=v_class and c.school_id=p_school_id
            and c.is_active is distinct from false
            and c.grade_level::text=trim(p_grade_level)
        ) then
          return jsonb_build_object('success',false,'code','class_not_in_selected_grade');
        end if;
      end loop;
    end if;
  end if;

  -- All validation above this line: no partial subject configuration is written.
  if v_subject_id is null then
    insert into public.school_subjects(
      school_id,name,code,is_active,created_by,academic_subject_id,archived_at,archived_by
    ) values (
      p_school_id,v_name,v_code,true,v_actor,p_academic_subject_id,null,null
    ) returning id into v_subject_id;
  else
    update public.school_subjects
    set name=v_name,
        code=v_code,
        academic_subject_id=p_academic_subject_id,
        is_active=true,
        archived_at=null,
        archived_by=null
    where id=v_subject_id and school_id=p_school_id;
  end if;

  -- Keep staffing display labels synchronized after a rename. Identity remains UUID-based.
  update public.class_teacher_assignments
  set subject=v_name
  where school_id=p_school_id and school_subject_id=v_subject_id;

  -- Optional academic mapping request. The subject remains valid and usable even
  -- while the platform academic team has not mapped curriculum resources.
  if p_academic_subject_id is null then
    insert into public.school_subject_mapping_requests(
      school_id,school_subject_id,status,requested_by,requested_at,resolved_by,resolved_at,resolution_note,updated_at
    ) values (
      p_school_id,v_subject_id,'pending',v_actor,now(),null,null,null,now()
    )
    on conflict (school_subject_id) do update
    set status='pending',requested_by=v_actor,requested_at=now(),resolved_by=null,resolved_at=null,resolution_note=null,updated_at=now()
    returning id into v_request_id;

    select s.name into v_school_name from public.schools s where s.id=p_school_id;
    insert into public.transactional_email_outbox(
      event_type,category,audience,recipient_user_id,recipient_email,school_id,school_name_override,
      template_key,template_version,payload,idempotency_key,available_at,status
    ) values (
      'school_subject_mapping_requested','platform_operations','platform_owner',null,null,p_school_id,v_school_name,
      'owner_subject_mapping_request','professional-v1',
      jsonb_build_object(
        'school_name',v_school_name,'school_id',p_school_id,'subject',v_name,
        'school_subject_id',v_subject_id,'mapping_request_id',v_request_id
      ),
      'school-subject-mapping-request:'||v_request_id::text,now(),'pending'
    ) on conflict (idempotency_key) do nothing;
  else
    update public.school_subject_mapping_requests
    set status='resolved',resolved_by=v_actor,resolved_at=now(),resolution_note='Mapped by school administrator',updated_at=now()
    where school_subject_id=v_subject_id and status='pending';
  end if;

  if p_grade_level is not null then
    insert into public.school_subject_offerings(
      school_id,school_subject_id,academic_year_id,grade_level,curriculum_scope_id,
      access_mode,status,created_by
    ) values (
      p_school_id,v_subject_id,p_academic_year_id,trim(p_grade_level),p_curriculum_scope_id,
      p_access_mode,'active',v_actor
    )
    on conflict (school_subject_id,academic_year_id,grade_level) do update
    set curriculum_scope_id=excluded.curriculum_scope_id,
        access_mode=excluded.access_mode,
        status='active',updated_at=now()
    returning id into v_offering_id;

    if p_access_mode='selected' then
      foreach v_student in array coalesce(p_selected_student_ids,'{}'::uuid[])
      loop
        insert into public.school_subject_enrolments(
          school_id,school_subject_id,academic_year_id,student_id,status,starts_on,ends_on,created_by
        ) values (
          p_school_id,v_subject_id,p_academic_year_id,v_student,'active',v_start,null,v_actor
        )
        on conflict (student_id,academic_year_id,school_subject_id) do update
        set status='active',ends_on=null,created_by=v_actor,updated_at=now();
      end loop;

      update public.school_subject_enrolments e
      set status='withdrawn',ends_on=current_date,updated_at=now()
      where e.school_id=p_school_id and e.school_subject_id=v_subject_id
        and e.academic_year_id=p_academic_year_id and e.status='active'
        and not(e.student_id=any(coalesce(p_selected_student_ids,'{}'::uuid[])));
    else
      update public.school_subject_enrolments e
      set status='withdrawn',ends_on=current_date,updated_at=now()
      where e.school_id=p_school_id and e.school_subject_id=v_subject_id
        and e.academic_year_id=p_academic_year_id and e.status='active';
    end if;

    if p_replace_teacher_allocations then
      update public.class_teacher_assignments cta
      set active=false
      from public.classes c
      where cta.class_id=c.id and cta.school_id=p_school_id
        and cta.school_subject_id=v_subject_id and cta.active
        and c.grade_level::text=trim(p_grade_level);
    end if;

    if p_teacher_user_id is not null then
      foreach v_class in array coalesce(p_class_ids,'{}'::uuid[])
      loop
        select public.admin_allocate_teacher_to_school_subject(
          p_school_id,v_class,p_teacher_user_id,v_subject_id,true
        ) into v_result;
        if coalesce((v_result->>'success')::boolean,false) is not true then
          raise exception using errcode='P0001',message='teacher_allocation_failed',detail=coalesce(v_result->>'error','Teacher allocation could not be saved.');
        end if;
      end loop;
    end if;
  end if;

  return jsonb_build_object(
    'success',true,
    'schoolSubjectId',v_subject_id,
    'offeringId',v_offering_id,
    'name',v_name,
    'academicSubjectId',p_academic_subject_id,
    'mappingStatus',case when p_academic_subject_id is null then 'unmapped' else 'mapped' end,
    'mappingRequestId',v_request_id
  );
end;
$$;
revoke all on function public.rpc_school_admin_save_school_subject(uuid,text,uuid,text,uuid,uuid,text,uuid,text,uuid[],uuid,uuid[],boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.rpc_school_admin_save_school_subject(uuid,text,uuid,text,uuid,uuid,text,uuid,text,uuid[],uuid,uuid[],boolean)
  to authenticated,service_role;

create or replace function public.rpc_school_admin_delete_school_subject(
  p_school_id uuid,
  p_school_subject_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_name text;
begin
  if v_actor is null or not (public.can_administer_school(p_school_id) or public.is_school_owner(p_school_id)) then
    raise exception using errcode='42501',message='school_administrator_access_required';
  end if;

  select s.name into v_name from public.school_subjects s
  where s.id=p_school_subject_id and s.school_id=p_school_id and s.is_active;
  if v_name is null then
    return jsonb_build_object('success',false,'code','school_subject_not_found');
  end if;

  -- Professional delete semantics: remove the subject from all active school
  -- operations while preserving assignments, results and longitudinal history.
  update public.school_subjects
  set is_active=false,archived_at=now(),archived_by=v_actor
  where id=p_school_subject_id and school_id=p_school_id;

  update public.school_subject_offerings
  set status='archived',updated_at=now()
  where school_subject_id=p_school_subject_id and school_id=p_school_id and status='active';

  update public.school_subject_enrolments
  set status='withdrawn',ends_on=coalesce(ends_on,current_date),updated_at=now()
  where school_subject_id=p_school_subject_id and school_id=p_school_id and status='active';

  update public.class_teacher_assignments
  set active=false
  where school_subject_id=p_school_subject_id and school_id=p_school_id and active;

  update public.school_subject_mapping_requests
  set status='dismissed',resolved_by=v_actor,resolved_at=now(),resolution_note='Subject removed by school',updated_at=now()
  where school_subject_id=p_school_subject_id and status='pending';

  return jsonb_build_object('success',true,'schoolSubjectId',p_school_subject_id,'name',v_name,'historyPreserved',true);
end;
$$;
revoke all on function public.rpc_school_admin_delete_school_subject(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.rpc_school_admin_delete_school_subject(uuid,uuid)
  to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 5. Teacher allocation register uses the school-facing subject as source of truth
-- ---------------------------------------------------------------------------

create or replace function public.school_admin_list_teacher_allocations(p_school_id uuid)
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
      'id',allocation.id,
      'school_id',allocation.school_id,
      'class_id',allocation.class_id,
      'teacher_user_id',allocation.teacher_user_id,
      'school_subject_id',allocation.school_subject_id,
      'subject',coalesce(ss.name,allocation.subject),
      'academic_subject_id',ss.academic_subject_id,
      'academic_subject_name',a.name,
      'active',allocation.active,
      'allocated_at',allocation.created_at,
      'teacher_name',coalesce(nullif(u.full_name,''),nullif(u.username,''),u.email,'Unknown teacher'),
      'teacher_username',u.username,
      'teacher_email',u.email,
      'teacher_membership_status',sm.status,
      'teacher_can_teach',coalesce(sm.can_teach,false),
      'class_code',c.class_code,
      'class_name',c.class_name,
      'grade_level',c.grade_level
    ) order by c.grade_level,c.class_code,coalesce(ss.name,allocation.subject),coalesce(u.full_name,u.username,u.email))
    from public.class_teacher_assignments allocation
    left join public.school_subjects ss on ss.id=allocation.school_subject_id and ss.school_id=allocation.school_id
    left join public.academic_subjects a on a.id=ss.academic_subject_id
    left join public.classes c on c.id=allocation.class_id and c.school_id=allocation.school_id
    left join public.users u on u.id=allocation.teacher_user_id
    left join public.school_members sm on sm.school_id=allocation.school_id and sm.user_id=allocation.teacher_user_id
    where allocation.school_id=p_school_id
  ),'[]'::jsonb);
end;
$$;
revoke all on function public.school_admin_list_teacher_allocations(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.school_admin_list_teacher_allocations(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Student/teacher subject catalogue: school subject identity, academic map metadata
-- ---------------------------------------------------------------------------

create or replace function public.rpc_student_academic_subjects(p_student_id uuid default null::uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_caller uuid:=auth.uid();
  v_student uuid:=coalesce(p_student_id,auth.uid());
  v_school uuid;
  v_year uuid;
  v_grade text;
  v_teacher uuid;
begin
  if v_caller is null then
    raise exception using errcode='42501',message='authentication_required';
  end if;

  -- Teachers receive each allocated school subject as an independent subject.
  if v_student=v_caller then
    select t.id into v_teacher from public.teachers t where t.user_id=v_caller;
    if v_teacher is not null then
      select sm.school_id into v_school
      from public.school_members sm
      where sm.user_id=v_caller and sm.status='active'
      order by sm.joined_at desc nulls last,sm.id limit 1;
      if v_school is null then select u.school_id into v_school from public.users u where u.id=v_caller; end if;
      if v_school is not null and exists(
        select 1 from public.class_teacher_assignments cta
        where cta.teacher_user_id=v_caller and cta.school_id=v_school and cta.active
      ) then
        v_year:=public.academic_resolve_year_id(v_school,now());
        return jsonb_build_object(
          'success',true,'ready',true,'academicYearId',v_year,'gradeLevel',null,
          'subjects',coalesce((
            select jsonb_agg(jsonb_build_object(
              'id',ss.id,
              'schoolSubjectId',ss.id,
              'code',coalesce(nullif(ss.code,''),public.academic_normalize_subject_key(ss.name)),
              'name',ss.name,
              'canonicalName',a.name,
              'academicSubjectId',ss.academic_subject_id,
              'mappingStatus',case when ss.academic_subject_id is null then 'unmapped' else 'mapped' end,
              'requirement','teacher_allocation',
              'scopeId',o.curriculum_scope_id,
              'approvedQuestionCount',case when ss.academic_subject_id is null or o.curriculum_scope_id is null then 0 else (
                select count(distinct im.assessment_item_id)
                from public.curriculum_item_objective_mappings im
                join public.curriculum_assessment_items ai on ai.id=im.assessment_item_id and ai.is_active
                join public.questions q on q.id::text=ai.source_record_id
                where im.curriculum_scope_id=o.curriculum_scope_id
                  and im.academic_subject_id=ss.academic_subject_id
                  and im.status='approved' and im.mapping_role='primary' and im.superseded_at is null
                  and q.academic_subject_id=ss.academic_subject_id
                  and q.is_active and q.verification_status='verified' and q.analytics_eligible
              ) end
            ) order by ss.name)
            from (
              select distinct cta.school_subject_id
              from public.class_teacher_assignments cta
              where cta.teacher_user_id=v_caller and cta.school_id=v_school and cta.active
                and cta.school_subject_id is not null
            ) allocated
            join public.school_subjects ss on ss.id=allocated.school_subject_id and ss.is_active
            left join public.academic_subjects a on a.id=ss.academic_subject_id and a.is_active
            left join lateral (
              select so.curriculum_scope_id
              from public.school_subject_offerings so
              where so.school_subject_id=ss.id and so.status='active'
                and (v_year is null or so.academic_year_id=v_year)
              order by so.updated_at desc limit 1
            ) o on true
          ),'[]'::jsonb)
        );
      end if;
    end if;
  end if;

  select u.school_id into v_school from public.users u where u.id=v_student;
  if v_school is null then
    return jsonb_build_object('success',true,'ready',false,'code','school_required','subjects','[]'::jsonb);
  end if;

  if v_caller<>v_student and not(
    public.can_administer_school(v_school) or public.is_school_owner(v_school)
    or exists(
      select 1 from public.class_students cs
      join public.class_teacher_assignments cta on cta.class_id=cs.class_id and cta.active
      where cs.student_id=v_student and cta.teacher_user_id=v_caller and cta.school_id=v_school
    )
  ) then
    raise exception using errcode='42501',message='student_academic_subject_access_denied';
  end if;

  select ae.academic_year_id,ae.grade_level into v_year,v_grade
  from public.student_academic_enrolments ae
  join public.school_academic_years y on y.id=ae.academic_year_id and y.status='current'
  where ae.student_id=v_student and ae.school_id=v_school
    and current_date between ae.starts_on and coalesce(ae.ends_on,current_date)
  order by ae.starts_on desc,ae.created_at desc limit 1;

  if v_year is null or v_grade is null then
    return jsonb_build_object('success',true,'ready',false,'code','current_grade_enrolment_required','subjects','[]'::jsonb);
  end if;

  return jsonb_build_object(
    'success',true,'ready',true,'academicYearId',v_year,'gradeLevel',v_grade,
    'subjects',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',ss.id,
        'schoolSubjectId',ss.id,
        'code',coalesce(nullif(ss.code,''),public.academic_normalize_subject_key(ss.name)),
        'name',ss.name,
        'canonicalName',a.name,
        'academicSubjectId',ss.academic_subject_id,
        'mappingStatus',case when ss.academic_subject_id is null then 'unmapped' else 'mapped' end,
        'requirement',o.access_mode,
        'scopeId',o.curriculum_scope_id,
        'approvedQuestionCount',case when ss.academic_subject_id is null or o.curriculum_scope_id is null then 0 else (
          select count(distinct im.assessment_item_id)
          from public.curriculum_item_objective_mappings im
          join public.curriculum_assessment_items ai on ai.id=im.assessment_item_id and ai.is_active
          join public.questions q on q.id::text=ai.source_record_id
          where im.curriculum_scope_id=o.curriculum_scope_id
            and im.academic_subject_id=ss.academic_subject_id
            and im.status='approved' and im.mapping_role='primary' and im.superseded_at is null
            and q.academic_subject_id=ss.academic_subject_id
            and q.is_active and q.verification_status='verified' and q.analytics_eligible
        ) end
      ) order by ss.name)
      from public.school_subject_offerings o
      join public.school_subjects ss on ss.id=o.school_subject_id and ss.school_id=v_school and ss.is_active
      left join public.academic_subjects a on a.id=ss.academic_subject_id and a.is_active
      where o.school_id=v_school and o.academic_year_id=v_year and o.grade_level=v_grade and o.status='active'
        and (
          o.access_mode='all_grade'
          or exists(
            select 1 from public.school_subject_enrolments e
            where e.student_id=v_student and e.school_subject_id=ss.id and e.academic_year_id=v_year
              and e.status='active' and current_date>=e.starts_on
              and (e.ends_on is null or current_date<=e.ends_on)
          )
        )
    ),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.rpc_student_academic_subjects(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.rpc_student_academic_subjects(uuid)
  to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 7. Superadmin academic-attention inbox
-- ---------------------------------------------------------------------------

create or replace function public.rpc_superadmin_subject_mapping_requests(
  p_status text default 'pending'
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null or not public.is_current_user_superadmin() then
    raise exception using errcode='42501',message='superadmin_access_required';
  end if;
  if p_status not in ('pending','resolved','dismissed','all') then
    raise exception using errcode='22023',message='invalid_mapping_request_status';
  end if;

  return jsonb_build_object(
    'success',true,
    'requests',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',r.id,'schoolId',r.school_id,'schoolName',school.name,
        'schoolSubjectId',r.school_subject_id,'subjectName',subject.name,'subjectCode',subject.code,
        'status',r.status,'requestedBy',r.requested_by,'requestedAt',r.requested_at,
        'resolvedBy',r.resolved_by,'resolvedAt',r.resolved_at,'resolutionNote',r.resolution_note
      ) order by case r.status when 'pending' then 0 else 1 end,r.requested_at desc)
      from public.school_subject_mapping_requests r
      join public.schools school on school.id=r.school_id
      join public.school_subjects subject on subject.id=r.school_subject_id
      where p_status='all' or r.status=p_status
    ),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.rpc_superadmin_subject_mapping_requests(text)
  from public,anon,authenticated,service_role;
grant execute on function public.rpc_superadmin_subject_mapping_requests(text)
  to authenticated,service_role;
