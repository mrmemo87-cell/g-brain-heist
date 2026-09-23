-- School Subjects v2 / 1 of 3
-- First-class, school-owned subject identity.
--
-- A school subject is operationally independent from its optional canonical
-- academic mapping. Two subjects such as English and ESL may both map to the
-- same academic subject while keeping separate students, staffing and history.

-- Mapping must be explicit. A matching label must never silently create a map.
drop trigger if exists trg_academic_enrich_school_subject on public.school_subjects;

alter table public.school_subjects
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.users(id) on delete set null;

create index if not exists school_subjects_school_active_name_idx
  on public.school_subjects(school_id,is_active,name);
create index if not exists school_subjects_academic_map_idx
  on public.school_subjects(school_id,academic_subject_id)
  where academic_subject_id is not null;

comment on column public.school_subjects.academic_subject_id is
  'Optional academic capability map. It never defines school-subject identity.';

create table if not exists public.school_subject_offerings (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  school_subject_id uuid not null references public.school_subjects(id) on delete cascade,
  academic_year_id uuid not null references public.school_academic_years(id) on delete restrict,
  grade_level text not null check (grade_level ~ '^(?:[1-9]|1[0-2])$'),
  curriculum_scope_id uuid references public.curriculum_scopes(id) on delete set null,
  access_mode text not null default 'all_grade' check (access_mode in ('all_grade','selected')),
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_subject_id,academic_year_id,grade_level)
);

create index if not exists school_subject_offerings_school_year_grade_idx
  on public.school_subject_offerings(school_id,academic_year_id,grade_level,status);
create index if not exists school_subject_offerings_subject_idx
  on public.school_subject_offerings(school_subject_id,academic_year_id,status);

create table if not exists public.school_subject_enrolments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  school_subject_id uuid not null references public.school_subjects(id) on delete cascade,
  academic_year_id uuid not null references public.school_academic_years(id) on delete restrict,
  student_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active','withdrawn')),
  starts_on date not null,
  ends_on date,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id,academic_year_id,school_subject_id),
  check (ends_on is null or ends_on >= starts_on)
);

create index if not exists school_subject_enrolments_subject_year_idx
  on public.school_subject_enrolments(school_subject_id,academic_year_id,status,student_id);
create index if not exists school_subject_enrolments_student_year_idx
  on public.school_subject_enrolments(student_id,academic_year_id,status);

create table if not exists public.school_subject_mapping_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  school_subject_id uuid not null unique references public.school_subjects(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','resolved','dismissed')),
  requested_by uuid references public.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  resolved_by uuid references public.users(id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  updated_at timestamptz not null default now()
);

create index if not exists school_subject_mapping_requests_status_idx
  on public.school_subject_mapping_requests(status,requested_at desc);
create index if not exists school_subject_mapping_requests_school_idx
  on public.school_subject_mapping_requests(school_id,status,requested_at desc);

alter table public.school_subject_offerings enable row level security;
alter table public.school_subject_enrolments enable row level security;
alter table public.school_subject_mapping_requests enable row level security;
revoke all on public.school_subject_offerings from public,anon,authenticated;
revoke all on public.school_subject_enrolments from public,anon,authenticated;
revoke all on public.school_subject_mapping_requests from public,anon,authenticated;
grant select,insert,update,delete on public.school_subject_offerings to service_role;
grant select,insert,update,delete on public.school_subject_enrolments to service_role;
grant select,insert,update,delete on public.school_subject_mapping_requests to service_role;

alter table public.class_teacher_assignments
  add column if not exists school_subject_id uuid references public.school_subjects(id) on delete set null;
create index if not exists class_teacher_assignments_school_subject_idx
  on public.class_teacher_assignments(school_id,school_subject_id,active,class_id)
  where school_subject_id is not null;

alter table public.assignments
  add column if not exists school_subject_id uuid references public.school_subjects(id) on delete set null;
create index if not exists assignments_school_subject_idx
  on public.assignments(school_id,school_subject_id,assigned_at desc)
  where school_subject_id is not null;

-- ---------------------------------------------------------------------------
-- Compatibility backfill from the first provisioning model.
-- ---------------------------------------------------------------------------

insert into public.school_subjects(
  school_id,name,code,is_active,created_by,academic_subject_id
)
select distinct on (m.school_id,coalesce(nullif(trim(m.display_name),''),a.name))
  m.school_id,
  coalesce(nullif(trim(m.display_name),''),a.name),
  upper(left(regexp_replace(coalesce(nullif(trim(m.display_name),''),a.name),'[^A-Za-z0-9]+','-','g'),24)),
  true,
  m.created_by,
  m.academic_subject_id
from public.school_curriculum_scope_mappings m
join public.academic_subjects a on a.id=m.academic_subject_id
where m.status in ('planned','active')
order by m.school_id,coalesce(nullif(trim(m.display_name),''),a.name),m.updated_at desc nulls last,m.created_at desc
on conflict (school_id,name) do update
set academic_subject_id=coalesce(public.school_subjects.academic_subject_id,excluded.academic_subject_id),
    is_active=true,
    updated_at=now();

-- Archived/retired curriculum mappings are historical evidence. Do not rewrite
-- them during this compatibility link-up because the mapping validator correctly
-- rejects writes against non-published curriculum versions.
update public.school_curriculum_scope_mappings m
set school_subject_id=s.id,
    display_name=coalesce(nullif(trim(m.display_name),''),s.name),
    updated_at=now()
from public.school_subjects s
join public.academic_subjects a on a.id=s.academic_subject_id
where m.school_id=s.school_id
  and m.status in ('planned','active')
  and m.academic_subject_id=a.id
  and m.school_subject_id is null
  and exists(
    select 1
    from public.curriculum_scopes sc
    join public.curriculum_framework_versions fv on fv.id=sc.framework_version_id
    where sc.id=m.curriculum_scope_id and fv.status='published'
  )
  and lower(trim(s.name))=lower(trim(coalesce(nullif(m.display_name,''),a.name)));

insert into public.school_subject_offerings(
  school_id,school_subject_id,academic_year_id,grade_level,curriculum_scope_id,
  access_mode,status,created_by,created_at,updated_at
)
select
  m.school_id,m.school_subject_id,m.academic_year_id,m.grade_level,m.curriculum_scope_id,
  case when m.subject_requirement='elective' then 'selected' else 'all_grade' end,
  case when m.status='active' then 'active' else 'archived' end,
  m.created_by,m.created_at,coalesce(m.updated_at,m.created_at,now())
from public.school_curriculum_scope_mappings m
where m.school_subject_id is not null
on conflict (school_subject_id,academic_year_id,grade_level) do update
set curriculum_scope_id=excluded.curriculum_scope_id,
    access_mode=excluded.access_mode,
    status=excluded.status,
    updated_at=excluded.updated_at;

insert into public.school_subject_enrolments(
  school_id,school_subject_id,academic_year_id,student_id,status,
  starts_on,ends_on,created_by,created_at,updated_at
)
select distinct on (se.student_id,se.academic_year_id,m.school_subject_id)
  se.school_id,m.school_subject_id,se.academic_year_id,se.student_id,se.status,
  se.starts_on,se.ends_on,se.created_by,se.created_at,se.updated_at
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

-- Recover the school-subject identity of allocations created by the first
-- provisioning version. A scalar SET subquery can safely reference the target row.
update public.class_teacher_assignments cta
set school_subject_id=(
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
)
where cta.school_subject_id is null
  and exists(
    select 1
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
  );

-- Existing assignments are linked only on an exact school-facing label match.
-- Ambiguous historical canonical labels are intentionally not guessed.
update public.assignments a
set school_subject_id=s.id
from public.school_subjects s
where a.school_subject_id is null
  and a.school_id=s.school_id
  and lower(trim(coalesce(a.subject_name,'')))=lower(trim(s.name));

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
      where s.id=new.school_subject_id and (new.school_id is null or s.school_id=new.school_id)
    ) then
      raise exception using errcode='23503',message='assignment_school_subject_not_in_school';
    end if;
    return new;
  end if;

  if new.school_id is not null and nullif(trim(coalesce(new.subject_name,'')),'') is not null then
    select s.id into v_subject
    from public.school_subjects s
    where s.school_id=new.school_id and s.is_active
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
