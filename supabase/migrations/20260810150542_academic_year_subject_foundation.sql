-- Phase 1 of the Academic Intelligence roadmap.
--
-- Goals:
--   * stop free-text subject drift without rewriting historical labels;
--   * preserve school year, term, grade, and class context at evidence time;
--   * provide a reviewed school-admin path for calendar setup and baseline enrolment;
--   * enrich every future learning observation through one source-agnostic trigger.
--
-- Existing academic profile RPCs remain compatible because all additions are nullable
-- snapshots. Historical attainment evidence is never deleted or reclassified here.

create or replace function public.academic_normalize_subject_key(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', '-', 'g'));
$$;
revoke all on function public.academic_normalize_subject_key(text) from public, anon, authenticated;
grant execute on function public.academic_normalize_subject_key(text) to service_role;

create table if not exists public.academic_subjects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (code = public.academic_normalize_subject_key(code)),
  check (length(trim(name)) >= 2)
);

create table if not exists public.academic_subject_aliases (
  id uuid primary key default gen_random_uuid(),
  academic_subject_id uuid not null references public.academic_subjects(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  alias text not null,
  alias_key text generated always as (public.academic_normalize_subject_key(alias)) stored,
  created_at timestamptz not null default now(),
  check (length(trim(alias)) >= 2),
  check (length(alias_key) >= 2)
);

create unique index if not exists academic_subject_aliases_global_uidx
  on public.academic_subject_aliases(alias_key)
  where school_id is null;
create unique index if not exists academic_subject_aliases_school_uidx
  on public.academic_subject_aliases(school_id, alias_key)
  where school_id is not null;
create index if not exists academic_subject_aliases_subject_idx
  on public.academic_subject_aliases(academic_subject_id, school_id);

alter table public.academic_subjects enable row level security;
alter table public.academic_subject_aliases enable row level security;
revoke all on table public.academic_subjects from public, anon, authenticated, service_role;
revoke all on table public.academic_subject_aliases from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.academic_subjects to service_role;
grant select, insert, update, delete on table public.academic_subject_aliases to service_role;

insert into public.academic_subjects(code, name)
values
  ('biology', 'Biology'),
  ('chemistry', 'Chemistry'),
  ('english', 'English'),
  ('geography', 'Geography'),
  ('german-language', 'German Language'),
  ('global-perspectives', 'Global Perspectives'),
  ('ict', 'ICT'),
  ('kyrgyz-language', 'Kyrgyz Language'),
  ('mathematics', 'Mathematics'),
  ('physics', 'Physics'),
  ('russian-language', 'Russian Language'),
  ('science', 'Science'),
  ('travel-tourism', 'Travel & Tourism')
on conflict (code) do update
set name = excluded.name,
    is_active = true,
    updated_at = now();

with aliases(code, alias) as (
  values
    ('biology', 'Biology'),
    ('chemistry', 'Chemistry'),
    ('english', 'English'),
    ('english', 'English Language'),
    ('geography', 'Geography'),
    ('german-language', 'German Language'),
    ('global-perspectives', 'Global Perspectives'),
    ('ict', 'ICT'),
    ('kyrgyz-language', 'Kyrgyz Language'),
    ('mathematics', 'Math'),
    ('mathematics', 'Maths'),
    ('mathematics', 'Mathematics'),
    ('physics', 'Physics'),
    ('russian-language', 'Russian Language'),
    ('science', 'Science'),
    ('travel-tourism', 'Travel & Tourism'),
    ('travel-tourism', 'Travel and Tourism')
)
insert into public.academic_subject_aliases(academic_subject_id, school_id, alias)
select s.id, null, a.alias
from aliases a
join public.academic_subjects s on s.code = a.code
on conflict (alias_key) where school_id is null do update
set academic_subject_id = excluded.academic_subject_id,
    alias = excluded.alias;

create or replace function public.academic_resolve_subject_id(
  p_label text,
  p_school_id uuid default null
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.academic_subject_id
  from public.academic_subject_aliases a
  join public.academic_subjects s on s.id = a.academic_subject_id and s.is_active
  where a.alias_key = public.academic_normalize_subject_key(p_label)
    and (a.school_id = p_school_id or a.school_id is null)
  order by (a.school_id = p_school_id) desc, a.school_id nulls last
  limit 1;
$$;
revoke all on function public.academic_resolve_subject_id(text, uuid) from public, anon, authenticated;
grant execute on function public.academic_resolve_subject_id(text, uuid) to service_role;

create table if not exists public.school_academic_years (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'planned'
    check (status in ('planned', 'current', 'closed')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name),
  unique (id, school_id),
  check (length(trim(name)) >= 3),
  check (ends_on >= starts_on)
);

create unique index if not exists school_academic_years_one_current_uidx
  on public.school_academic_years(school_id)
  where status = 'current';
create index if not exists school_academic_years_dates_idx
  on public.school_academic_years(school_id, starts_on, ends_on);

create table if not exists public.school_academic_terms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null,
  name text not null,
  sequence_number smallint not null check (sequence_number > 0),
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academic_year_id, name),
  unique (academic_year_id, sequence_number),
  unique (id, academic_year_id),
  foreign key (academic_year_id, school_id)
    references public.school_academic_years(id, school_id) on delete cascade,
  check (length(trim(name)) >= 2),
  check (ends_on >= starts_on)
);

create index if not exists school_academic_terms_dates_idx
  on public.school_academic_terms(school_id, academic_year_id, starts_on, ends_on);

create table if not exists public.student_academic_enrolments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  academic_year_id uuid not null,
  class_id uuid references public.classes(id) on delete set null,
  grade_level text,
  class_code text,
  starts_on date not null,
  ends_on date,
  context_quality text not null default 'confirmed'
    check (context_quality in ('confirmed', 'estimated')),
  source text not null default 'school_admin'
    check (source in ('school_admin', 'current_placement_baseline', 'placement_event', 'import')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (academic_year_id, school_id)
    references public.school_academic_years(id, school_id) on delete restrict,
  check (ends_on is null or ends_on >= starts_on)
);

create unique index if not exists student_academic_enrolments_identity_uidx
  on public.student_academic_enrolments(
    student_id,
    academic_year_id,
    starts_on,
    coalesce(class_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
create index if not exists student_academic_enrolments_lookup_idx
  on public.student_academic_enrolments(student_id, starts_on desc, ends_on, academic_year_id);
create index if not exists student_academic_enrolments_school_grade_idx
  on public.student_academic_enrolments(school_id, academic_year_id, grade_level, class_id);

alter table public.school_academic_years enable row level security;
alter table public.school_academic_terms enable row level security;
alter table public.student_academic_enrolments enable row level security;
revoke all on table public.school_academic_years from public, anon, authenticated, service_role;
revoke all on table public.school_academic_terms from public, anon, authenticated, service_role;
revoke all on table public.student_academic_enrolments from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.school_academic_years to service_role;
grant select, insert, update, delete on table public.school_academic_terms to service_role;
grant select, insert, update, delete on table public.student_academic_enrolments to service_role;

create or replace function private.academic_validate_term()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year public.school_academic_years%rowtype;
begin
  select * into v_year
  from public.school_academic_years y
  where y.id = new.academic_year_id and y.school_id = new.school_id;

  if not found then
    raise exception using errcode = '23503', message = 'academic_year_not_found';
  end if;
  if new.starts_on < v_year.starts_on or new.ends_on > v_year.ends_on then
    raise exception using errcode = '23514', message = 'academic_term_outside_year';
  end if;
  if exists (
    select 1 from public.school_academic_terms t
    where t.academic_year_id = new.academic_year_id
      and t.id is distinct from new.id
      and daterange(t.starts_on, t.ends_on, '[]') && daterange(new.starts_on, new.ends_on, '[]')
  ) then
    raise exception using errcode = '23514', message = 'academic_terms_overlap';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.academic_validate_term() from public, anon, authenticated, service_role;

drop trigger if exists trg_academic_validate_term on public.school_academic_terms;
create trigger trg_academic_validate_term
before insert or update on public.school_academic_terms
for each row execute function private.academic_validate_term();

create or replace function private.academic_validate_enrolment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year public.school_academic_years%rowtype;
  v_class public.classes%rowtype;
begin
  select * into v_year
  from public.school_academic_years y
  where y.id = new.academic_year_id and y.school_id = new.school_id;
  if not found then
    raise exception using errcode = '23503', message = 'academic_year_not_found';
  end if;
  if new.starts_on < v_year.starts_on
     or coalesce(new.ends_on, v_year.ends_on) > v_year.ends_on then
    raise exception using errcode = '23514', message = 'academic_enrolment_outside_year';
  end if;

  if new.class_id is not null then
    select * into v_class from public.classes c
    where c.id = new.class_id and c.school_id = new.school_id;
    if not found then
      raise exception using errcode = '23503', message = 'academic_enrolment_class_school_mismatch';
    end if;
    new.grade_level := coalesce(nullif(trim(new.grade_level), ''), v_class.grade_level);
    new.class_code := coalesce(nullif(trim(new.class_code), ''), v_class.class_code);
  end if;

  if exists (
    select 1 from public.student_academic_enrolments e
    where e.student_id = new.student_id
      and e.academic_year_id = new.academic_year_id
      and e.id is distinct from new.id
      and not (
        e.starts_on = new.starts_on
        and coalesce(e.class_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = coalesce(new.class_id, '00000000-0000-0000-0000-000000000000'::uuid)
      )
      and daterange(e.starts_on, coalesce(e.ends_on, v_year.ends_on), '[]')
          && daterange(new.starts_on, coalesce(new.ends_on, v_year.ends_on), '[]')
  ) then
    raise exception using errcode = '23514', message = 'academic_enrolments_overlap';
  end if;

  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.academic_validate_enrolment() from public, anon, authenticated, service_role;

drop trigger if exists trg_academic_validate_enrolment on public.student_academic_enrolments;
create trigger trg_academic_validate_enrolment
before insert or update on public.student_academic_enrolments
for each row execute function private.academic_validate_enrolment();

create or replace function public.academic_resolve_year_id(p_school_id uuid, p_at timestamptz)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select y.id
  from public.school_academic_years y
  where y.school_id = p_school_id
    and (p_at at time zone 'UTC')::date between y.starts_on and y.ends_on
  order by case y.status when 'current' then 1 when 'closed' then 2 else 3 end,
           y.starts_on desc
  limit 1;
$$;
revoke all on function public.academic_resolve_year_id(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.academic_resolve_year_id(uuid, timestamptz) to service_role;

create or replace function public.academic_resolve_term_id(p_academic_year_id uuid, p_at timestamptz)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id
  from public.school_academic_terms t
  where t.academic_year_id = p_academic_year_id
    and (p_at at time zone 'UTC')::date between t.starts_on and t.ends_on
  order by t.sequence_number
  limit 1;
$$;
revoke all on function public.academic_resolve_term_id(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.academic_resolve_term_id(uuid, timestamptz) to service_role;

alter table public.school_subjects
  add column if not exists academic_subject_id uuid references public.academic_subjects(id) on delete restrict;
alter table public.questions
  add column if not exists academic_subject_id uuid references public.academic_subjects(id) on delete restrict;
alter table public.assignments
  add column if not exists academic_subject_id uuid references public.academic_subjects(id) on delete restrict,
  add column if not exists academic_year_id uuid references public.school_academic_years(id) on delete restrict,
  add column if not exists academic_term_id uuid references public.school_academic_terms(id) on delete restrict,
  add column if not exists grade_level_snapshot text,
  add column if not exists class_code_snapshot text;
alter table public.student_learning_observations
  add column if not exists academic_subject_id uuid references public.academic_subjects(id) on delete restrict,
  add column if not exists academic_year_id uuid references public.school_academic_years(id) on delete restrict,
  add column if not exists academic_term_id uuid references public.school_academic_terms(id) on delete restrict,
  add column if not exists academic_enrolment_id uuid references public.student_academic_enrolments(id) on delete set null,
  add column if not exists grade_level_at_time text,
  add column if not exists class_id_at_time uuid references public.classes(id) on delete set null,
  add column if not exists class_code_at_time text,
  add column if not exists academic_context_quality text not null default 'unknown'
    check (academic_context_quality in ('confirmed', 'estimated', 'unknown')),
  add column if not exists academic_context_source text not null default 'unresolved';
alter table public.student_learning_focus_states
  add column if not exists academic_subject_id uuid references public.academic_subjects(id) on delete restrict;

create index if not exists assignments_academic_context_idx
  on public.assignments(school_id, academic_year_id, academic_term_id, academic_subject_id);
create index if not exists questions_academic_subject_grade_idx
  on public.questions(academic_subject_id, grade_level, grade);
create index if not exists student_learning_observations_academic_context_idx
  on public.student_learning_observations(
    school_id, academic_year_id, academic_term_id, academic_subject_id, grade_level_at_time, observed_at desc
  );
create index if not exists student_learning_focus_states_academic_subject_idx
  on public.student_learning_focus_states(school_id, academic_subject_id, priority, updated_at desc);

alter table public.assignments
  drop constraint if exists assignments_academic_year_school_fk;
alter table public.assignments
  add constraint assignments_academic_year_school_fk
  foreign key (academic_year_id, school_id)
  references public.school_academic_years(id, school_id) on delete restrict
  not valid;
alter table public.assignments
  drop constraint if exists assignments_academic_term_year_fk;
alter table public.assignments
  add constraint assignments_academic_term_year_fk
  foreign key (academic_term_id, academic_year_id)
  references public.school_academic_terms(id, academic_year_id) on delete restrict
  not valid;

alter table public.student_learning_observations
  drop constraint if exists student_learning_observations_academic_year_school_fk;
alter table public.student_learning_observations
  add constraint student_learning_observations_academic_year_school_fk
  foreign key (academic_year_id, school_id)
  references public.school_academic_years(id, school_id) on delete restrict
  not valid;
alter table public.student_learning_observations
  drop constraint if exists student_learning_observations_academic_term_year_fk;
alter table public.student_learning_observations
  add constraint student_learning_observations_academic_term_year_fk
  foreign key (academic_term_id, academic_year_id)
  references public.school_academic_terms(id, academic_year_id) on delete restrict
  not valid;

create or replace function private.academic_enrich_school_subject()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.academic_subject_id := public.academic_resolve_subject_id(new.name, new.school_id);
  return new;
end;
$$;
revoke all on function private.academic_enrich_school_subject() from public, anon, authenticated, service_role;

drop trigger if exists trg_academic_enrich_school_subject on public.school_subjects;
create trigger trg_academic_enrich_school_subject
before insert or update of name, school_id on public.school_subjects
for each row execute function private.academic_enrich_school_subject();

create or replace function private.academic_enrich_question_subject()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.academic_subject_id := public.academic_resolve_subject_id(new.subject, null);
  return new;
end;
$$;
revoke all on function private.academic_enrich_question_subject() from public, anon, authenticated, service_role;

drop trigger if exists trg_academic_enrich_question_subject on public.questions;
create trigger trg_academic_enrich_question_subject
before insert or update of subject on public.questions
for each row execute function private.academic_enrich_question_subject();

create or replace function private.academic_enrich_focus_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.academic_subject_id := public.academic_resolve_subject_id(new.subject, new.school_id);
  return new;
end;
$$;
revoke all on function private.academic_enrich_focus_state() from public, anon, authenticated, service_role;

drop trigger if exists trg_academic_enrich_focus_state on public.student_learning_focus_states;
create trigger trg_academic_enrich_focus_state
before insert or update of subject, school_id on public.student_learning_focus_states
for each row execute function private.academic_enrich_focus_state();

create or replace function private.academic_enrich_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at timestamptz := coalesce(new.assigned_at, new.created_at, now());
  v_class public.classes%rowtype;
begin
  new.academic_subject_id := public.academic_resolve_subject_id(
    coalesce(nullif(trim(new.subject_name), ''), nullif(trim(new.subject), ''), nullif(trim(new.subject_id), '')),
    new.school_id
  );
  new.academic_year_id := public.academic_resolve_year_id(new.school_id, v_at);
  new.academic_term_id := public.academic_resolve_term_id(new.academic_year_id, v_at);

  if new.class_id is not null then
    select * into v_class from public.classes c
    where c.id = new.class_id and (new.school_id is null or c.school_id = new.school_id);
    if found then
      new.grade_level_snapshot := v_class.grade_level;
      new.class_code_snapshot := v_class.class_code;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.academic_enrich_assignment() from public, anon, authenticated, service_role;

drop trigger if exists trg_academic_enrich_assignment on public.assignments;
create trigger trg_academic_enrich_assignment
before insert or update of subject_name, subject, subject_id, school_id, class_id, assigned_at
on public.assignments
for each row execute function private.academic_enrich_assignment();

create or replace function private.student_learning_enrich_academic_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (new.observed_at at time zone 'UTC')::date;
  v_source_class_id uuid;
  v_class public.classes%rowtype;
  v_enrolment public.student_academic_enrolments%rowtype;
begin
  new.academic_subject_id := public.academic_resolve_subject_id(new.subject, new.school_id);
  new.academic_year_id := public.academic_resolve_year_id(new.school_id, new.observed_at);
  new.academic_term_id := public.academic_resolve_term_id(new.academic_year_id, new.observed_at);
  new.academic_enrolment_id := null;
  new.grade_level_at_time := null;
  new.class_id_at_time := null;
  new.class_code_at_time := null;
  new.academic_context_quality := 'unknown';
  new.academic_context_source := 'unresolved';

  if coalesce(new.evidence->>'class_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_source_class_id := (new.evidence->>'class_id')::uuid;
  elsif new.source_type = 'assignment_result' and new.source_id is not null then
    select a.class_id into v_source_class_id
    from public.assignments a where a.id = new.source_id;
  end if;

  if v_source_class_id is not null then
    select * into v_class from public.classes c
    where c.id = v_source_class_id and c.school_id = new.school_id;
    if found then
      new.class_id_at_time := v_class.id;
      new.class_code_at_time := v_class.class_code;
      new.grade_level_at_time := v_class.grade_level;
      new.academic_context_quality := 'estimated';
      new.academic_context_source := 'source_class_snapshot';
    end if;
  end if;

  if new.academic_year_id is not null then
    select * into v_enrolment
    from public.student_academic_enrolments e
    where e.school_id = new.school_id
      and e.student_id = new.student_id
      and e.academic_year_id = new.academic_year_id
      and v_day between e.starts_on and coalesce(e.ends_on, v_day)
    order by case e.context_quality when 'confirmed' then 1 else 2 end,
             e.starts_on desc, e.created_at desc
    limit 1;

    if found and (new.class_id_at_time is null or v_enrolment.context_quality = 'confirmed') then
      new.academic_enrolment_id := v_enrolment.id;
      new.class_id_at_time := v_enrolment.class_id;
      new.class_code_at_time := v_enrolment.class_code;
      new.grade_level_at_time := v_enrolment.grade_level;
      new.academic_context_quality := v_enrolment.context_quality;
      new.academic_context_source := 'academic_enrolment';
    elsif new.class_id_at_time is not null then
      new.academic_context_quality := 'estimated';
    else
      new.academic_context_quality := 'estimated';
      new.academic_context_source := 'calendar_only';
    end if;
  end if;

  return new;
end;
$$;
revoke all on function private.student_learning_enrich_academic_context() from public, anon, authenticated, service_role;

drop trigger if exists trg_student_learning_enrich_academic_context on public.student_learning_observations;
create trigger trg_student_learning_enrich_academic_context
before insert or update of school_id, student_id, subject, source_type, source_id, observed_at, evidence
on public.student_learning_observations
for each row execute function private.student_learning_enrich_academic_context();

-- Initial subject-only backfill is deterministic and does not change historical labels.
update public.school_subjects ss
set academic_subject_id = public.academic_resolve_subject_id(ss.name, ss.school_id)
where ss.academic_subject_id is null;

update public.questions q
set academic_subject_id = public.academic_resolve_subject_id(q.subject, null)
where q.academic_subject_id is null;

update public.assignments a
set academic_subject_id = public.academic_resolve_subject_id(
      coalesce(nullif(trim(a.subject_name), ''), nullif(trim(a.subject), ''), nullif(trim(a.subject_id), '')),
      a.school_id
    ),
    academic_year_id = public.academic_resolve_year_id(a.school_id, a.assigned_at),
    academic_term_id = public.academic_resolve_term_id(
      public.academic_resolve_year_id(a.school_id, a.assigned_at), a.assigned_at
    ),
    grade_level_snapshot = c.grade_level,
    class_code_snapshot = c.class_code
from public.classes c
where a.class_id = c.id;

update public.assignments a
set academic_subject_id = public.academic_resolve_subject_id(
      coalesce(nullif(trim(a.subject_name), ''), nullif(trim(a.subject), ''), nullif(trim(a.subject_id), '')),
      a.school_id
    ),
    academic_year_id = public.academic_resolve_year_id(a.school_id, a.assigned_at),
    academic_term_id = public.academic_resolve_term_id(
      public.academic_resolve_year_id(a.school_id, a.assigned_at), a.assigned_at
    )
where a.class_id is null;

update public.student_learning_observations o
set subject = o.subject;

update public.student_learning_focus_states f
set academic_subject_id = public.academic_resolve_subject_id(f.subject, f.school_id)
where f.academic_subject_id is null;

create or replace function private.academic_refresh_school_context(p_school_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.school_subjects ss
  set academic_subject_id = public.academic_resolve_subject_id(ss.name, ss.school_id)
  where ss.school_id = p_school_id;

  update public.assignments a
  set subject_name = a.subject_name
  where a.school_id = p_school_id;

  update public.student_learning_observations o
  set subject = o.subject
  where o.school_id = p_school_id;

  update public.student_learning_focus_states f
  set academic_subject_id = public.academic_resolve_subject_id(f.subject, f.school_id)
  where f.school_id = p_school_id;
end;
$$;
revoke all on function private.academic_refresh_school_context(uuid) from public, anon, authenticated, service_role;

create or replace function public.rpc_school_admin_upsert_academic_year(
  p_school_id uuid,
  p_year_id uuid,
  p_name text,
  p_starts_on date,
  p_ends_on date,
  p_status text default 'planned'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if v_actor is null or not (
    public.can_administer_school(p_school_id) or public.is_school_owner(p_school_id)
  ) then
    raise exception using errcode = '42501', message = 'school_administrator_access_required';
  end if;
  if length(trim(coalesce(p_name, ''))) < 3
     or p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on
     or p_status not in ('planned', 'current', 'closed') then
    return jsonb_build_object('success', false, 'code', 'invalid_academic_year');
  end if;

  select coalesce(
    p_year_id,
    (select y.id from public.school_academic_years y
      where y.school_id = p_school_id and lower(trim(y.name)) = lower(trim(p_name))
      limit 1),
    gen_random_uuid()
  ) into v_id;
  if exists (
    select 1 from public.school_academic_years y
    where y.id = v_id and y.school_id <> p_school_id
  ) then
    raise exception using errcode = '42501', message = 'academic_year_school_mismatch';
  end if;
  if exists (
    select 1 from public.school_academic_years y
    where y.school_id = p_school_id and y.id <> v_id
      and daterange(y.starts_on, y.ends_on, '[]') && daterange(p_starts_on, p_ends_on, '[]')
  ) then
    return jsonb_build_object('success', false, 'code', 'academic_years_overlap');
  end if;

  if p_status = 'current' then
    update public.school_academic_years
    set status = 'closed', updated_at = now()
    where school_id = p_school_id and status = 'current' and id <> v_id;
  end if;

  insert into public.school_academic_years(
    id, school_id, name, starts_on, ends_on, status, created_by
  ) values (
    v_id, p_school_id, trim(p_name), p_starts_on, p_ends_on, p_status, v_actor
  )
  on conflict (id) do update set
    name = excluded.name,
    starts_on = excluded.starts_on,
    ends_on = excluded.ends_on,
    status = excluded.status,
    updated_at = now()
  where school_academic_years.school_id = p_school_id;

  perform private.academic_refresh_school_context(p_school_id);
  return jsonb_build_object('success', true, 'academicYearId', v_id);
end;
$$;
revoke all on function public.rpc_school_admin_upsert_academic_year(uuid, uuid, text, date, date, text)
  from public, anon, authenticated;
grant execute on function public.rpc_school_admin_upsert_academic_year(uuid, uuid, text, date, date, text)
  to authenticated, service_role;

create or replace function public.rpc_school_admin_upsert_academic_term(
  p_school_id uuid,
  p_academic_year_id uuid,
  p_term_id uuid,
  p_name text,
  p_sequence_number smallint,
  p_starts_on date,
  p_ends_on date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if v_actor is null or not (
    public.can_administer_school(p_school_id) or public.is_school_owner(p_school_id)
  ) then
    raise exception using errcode = '42501', message = 'school_administrator_access_required';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2
     or p_sequence_number is null or p_sequence_number <= 0
     or p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on then
    return jsonb_build_object('success', false, 'code', 'invalid_academic_term');
  end if;

  select coalesce(
    p_term_id,
    (select t.id from public.school_academic_terms t
      where t.school_id = p_school_id
        and t.academic_year_id = p_academic_year_id
        and lower(trim(t.name)) = lower(trim(p_name))
      limit 1),
    gen_random_uuid()
  ) into v_id;
  if exists (
    select 1 from public.school_academic_terms t
    where t.id = v_id
      and (t.school_id <> p_school_id or t.academic_year_id <> p_academic_year_id)
  ) then
    raise exception using errcode = '42501', message = 'academic_term_school_mismatch';
  end if;

  insert into public.school_academic_terms(
    id, school_id, academic_year_id, name, sequence_number, starts_on, ends_on
  ) values (
    v_id, p_school_id, p_academic_year_id, trim(p_name), p_sequence_number, p_starts_on, p_ends_on
  )
  on conflict (id) do update set
    name = excluded.name,
    sequence_number = excluded.sequence_number,
    starts_on = excluded.starts_on,
    ends_on = excluded.ends_on,
    updated_at = now()
  where school_academic_terms.school_id = p_school_id
    and school_academic_terms.academic_year_id = p_academic_year_id;

  perform private.academic_refresh_school_context(p_school_id);
  return jsonb_build_object('success', true, 'academicTermId', v_id);
end;
$$;
revoke all on function public.rpc_school_admin_upsert_academic_term(uuid, uuid, uuid, text, smallint, date, date)
  from public, anon, authenticated;
grant execute on function public.rpc_school_admin_upsert_academic_term(uuid, uuid, uuid, text, smallint, date, date)
  to authenticated, service_role;

create or replace function public.rpc_school_admin_seed_academic_enrolments(
  p_school_id uuid,
  p_academic_year_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_year public.school_academic_years%rowtype;
  v_inserted integer := 0;
begin
  if v_actor is null or not (
    public.can_administer_school(p_school_id) or public.is_school_owner(p_school_id)
  ) then
    raise exception using errcode = '42501', message = 'school_administrator_access_required';
  end if;
  select * into v_year from public.school_academic_years y
  where y.id = p_academic_year_id and y.school_id = p_school_id;
  if not found then
    return jsonb_build_object('success', false, 'code', 'academic_year_not_found');
  end if;

  insert into public.student_academic_enrolments(
    school_id, student_id, academic_year_id, class_id, grade_level, class_code,
    starts_on, ends_on, context_quality, source, created_by
  )
  select
    p_school_id, cs.student_id, v_year.id, c.id, c.grade_level, c.class_code,
    v_year.starts_on, v_year.ends_on, 'estimated', 'current_placement_baseline', v_actor
  from public.class_students cs
  join public.classes c on c.id = cs.class_id and c.school_id = p_school_id
  join public.school_members sm on sm.school_id = p_school_id
    and sm.user_id = cs.student_id and sm.status = 'active' and sm.role_in_school = 'student'
  where coalesce(c.is_active, true)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  perform private.academic_refresh_school_context(p_school_id);
  return jsonb_build_object(
    'success', true,
    'academicYearId', p_academic_year_id,
    'inserted', v_inserted,
    'contextQuality', 'estimated'
  );
end;
$$;
revoke all on function public.rpc_school_admin_seed_academic_enrolments(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.rpc_school_admin_seed_academic_enrolments(uuid, uuid)
  to authenticated, service_role;

create or replace function public.rpc_school_admin_academic_context_readiness(p_school_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not (
    public.can_administer_school(p_school_id) or public.is_school_owner(p_school_id)
  ) then
    raise exception using errcode = '42501', message = 'school_administrator_access_required';
  end if;
  return jsonb_build_object(
    'academicYears', (select count(*) from public.school_academic_years y where y.school_id = p_school_id),
    'academicTerms', (select count(*) from public.school_academic_terms t where t.school_id = p_school_id),
    'studentEnrolments', (select count(*) from public.student_academic_enrolments e where e.school_id = p_school_id),
    'observations', (select count(*) from public.student_learning_observations o where o.school_id = p_school_id),
    'observationsWithYear', (select count(*) from public.student_learning_observations o where o.school_id = p_school_id and o.academic_year_id is not null),
    'observationsWithGrade', (select count(*) from public.student_learning_observations o where o.school_id = p_school_id and nullif(trim(o.grade_level_at_time), '') is not null),
    'confirmedObservations', (select count(*) from public.student_learning_observations o where o.school_id = p_school_id and o.academic_context_quality = 'confirmed'),
    'estimatedObservations', (select count(*) from public.student_learning_observations o where o.school_id = p_school_id and o.academic_context_quality = 'estimated'),
    'unknownObservations', (select count(*) from public.student_learning_observations o where o.school_id = p_school_id and o.academic_context_quality = 'unknown'),
    'unmappedSubjects', (
      select coalesce(jsonb_agg(x.subject order by x.subject), '[]'::jsonb)
      from (
        select distinct o.subject
        from public.student_learning_observations o
        where o.school_id = p_school_id and o.academic_subject_id is null
      ) x
    )
  );
end;
$$;
revoke all on function public.rpc_school_admin_academic_context_readiness(uuid)
  from public, anon, authenticated;
grant execute on function public.rpc_school_admin_academic_context_readiness(uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';
