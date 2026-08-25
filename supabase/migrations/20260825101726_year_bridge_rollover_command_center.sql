-- Year Bridge foundation: governed plans, routes, student decisions, audit events and private helpers.

create extension if not exists pgcrypto with schema extensions;
create table if not exists public.school_year_rollover_plans (
id uuid primary key default gen_random_uuid(),
school_id uuid not null references public.schools(id) on delete cascade,
source_academic_year_id uuid not null,
target_academic_year_id uuid not null,
status text not null default 'draft'
check (status in ('draft', 'running', 'completed', 'cancelled')),
effective_date date not null,
source_roster_hash text,
preview_hash text,
completion_summary jsonb not null default '{}'::jsonb,
created_by uuid references public.users(id) on delete set null,
completed_by uuid references public.users(id) on delete set null,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now(),
completed_at timestamptz,
unique (school_id, source_academic_year_id, target_academic_year_id),
foreign key (source_academic_year_id, school_id)
references public.school_academic_years(id, school_id) on delete restrict,
foreign key (target_academic_year_id, school_id)
references public.school_academic_years(id, school_id) on delete restrict,
check (source_academic_year_id <> target_academic_year_id),
check (source_roster_hash is null or source_roster_hash ~ '^[0-9a-f]{64}$'),
check (preview_hash is null or preview_hash ~ '^[0-9a-f]{64}$')
);
create table if not exists public.school_year_rollover_class_routes (
id uuid primary key default gen_random_uuid(),
plan_id uuid not null references public.school_year_rollover_plans(id) on delete cascade,
school_id uuid not null references public.schools(id) on delete cascade,
source_class_id uuid not null references public.classes(id) on delete restrict,
target_class_id uuid references public.classes(id) on delete restrict,
outcome text not null
check (outcome in ('promote', 'repeat', 'graduate', 'manual')),
source_grade text,
target_grade text,
confidence text not null default 'low'
check (confidence in ('high', 'medium', 'low')),
rationale text not null,
is_overridden boolean not null default false,
updated_by uuid references public.users(id) on delete set null,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now(),
unique (plan_id, source_class_id)
);
create table if not exists public.school_year_rollover_student_decisions (
id uuid primary key default gen_random_uuid(),
plan_id uuid not null references public.school_year_rollover_plans(id) on delete cascade,
school_id uuid not null references public.schools(id) on delete cascade,
student_id uuid not null references public.users(id) on delete cascade,
source_class_id uuid references public.classes(id) on delete restrict,
current_class_id uuid references public.classes(id) on delete restrict,
target_class_id uuid references public.classes(id) on delete restrict,
source_grade text,
current_grade text,
target_grade text,
source_authority text not null
check (source_authority in (
'academic_enrolment', 'historical_assignment', 'current_placement',
'profile_fallback', 'unresolved'
)),
outcome text not null
check (outcome in (
'promote', 'repeat', 'already_promoted', 'graduate', 'leave', 'manual'
)),
review_state text not null default 'needs_review'
check (review_state in ('auto_ready', 'needs_review', 'reviewed', 'applied')),
rationale text not null,
is_overridden boolean not null default false,
snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
override_reason text,
updated_by uuid references public.users(id) on delete set null,
applied_at timestamptz,
apply_result jsonb not null default '{}'::jsonb,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now(),
unique (plan_id, student_id)
);
create table if not exists public.school_year_rollover_events (
id uuid primary key default gen_random_uuid(),
plan_id uuid not null references public.school_year_rollover_plans(id) on delete cascade,
school_id uuid not null references public.schools(id) on delete cascade,
actor_user_id uuid references public.users(id) on delete set null,
event_type text not null
check (event_type in (
'prepared', 'route_updated', 'student_decision_updated',
'cancelled', 'committed'
)),
event_data jsonb not null default '{}'::jsonb,
created_at timestamptz not null default now()
);
create index if not exists school_year_rollover_plans_school_status_idx
on public.school_year_rollover_plans(school_id, status, updated_at desc);
create index if not exists school_year_rollover_routes_plan_idx
on public.school_year_rollover_class_routes(plan_id, source_grade, source_class_id);
create index if not exists school_year_rollover_decisions_plan_review_idx
on public.school_year_rollover_student_decisions(plan_id, review_state, outcome);
create index if not exists school_year_rollover_decisions_student_idx
on public.school_year_rollover_student_decisions(student_id, created_at desc);
create index if not exists school_year_rollover_events_plan_idx
on public.school_year_rollover_events(plan_id, created_at desc);
alter table public.school_year_rollover_plans enable row level security;
alter table public.school_year_rollover_class_routes enable row level security;
alter table public.school_year_rollover_student_decisions enable row level security;
alter table public.school_year_rollover_events enable row level security;
revoke all on table public.school_year_rollover_plans
from public, anon, authenticated, service_role;
revoke all on table public.school_year_rollover_class_routes
from public, anon, authenticated, service_role;
revoke all on table public.school_year_rollover_student_decisions
from public, anon, authenticated, service_role;
revoke all on table public.school_year_rollover_events
from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.school_year_rollover_plans
to service_role;
grant select, insert, update, delete on table public.school_year_rollover_class_routes
to service_role;
grant select, insert, update, delete on table public.school_year_rollover_student_decisions
to service_role;
grant select, insert on table public.school_year_rollover_events
to service_role;
create or replace function private.year_rollover_touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
new.updated_at := now();
return new;
end;
$$;
revoke all on function private.year_rollover_touch_updated_at()
from public, anon, authenticated, service_role;
drop trigger if exists trg_year_rollover_plan_touch
on public.school_year_rollover_plans;
create trigger trg_year_rollover_plan_touch
before update on public.school_year_rollover_plans
for each row execute function private.year_rollover_touch_updated_at();
drop trigger if exists trg_year_rollover_route_touch
on public.school_year_rollover_class_routes;
create trigger trg_year_rollover_route_touch
before update on public.school_year_rollover_class_routes
for each row execute function private.year_rollover_touch_updated_at();
drop trigger if exists trg_year_rollover_decision_touch
on public.school_year_rollover_student_decisions;
create trigger trg_year_rollover_decision_touch
before update on public.school_year_rollover_student_decisions
for each row execute function private.year_rollover_touch_updated_at();
create or replace function private.year_rollover_reject_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
raise exception using errcode = '55000',
message = 'school_year_rollover_events_are_append_only';
end;
$$;
revoke all on function private.year_rollover_reject_event_mutation()
from public, anon, authenticated, service_role;
drop trigger if exists trg_year_rollover_events_immutable
on public.school_year_rollover_events;
create trigger trg_year_rollover_events_immutable
before update or delete on public.school_year_rollover_events
for each row execute function private.year_rollover_reject_event_mutation();
create or replace function private.year_rollover_grade_number(p_grade text)
returns integer
language sql
immutable
set search_path = ''
as $$
select case
when nullif(regexp_replace(coalesce(p_grade, ''), '[^0-9]', '', 'g'), '') is null
then null
else regexp_replace(coalesce(p_grade, ''), '[^0-9]', '', 'g')::integer
end;
$$;
revoke all on function private.year_rollover_grade_number(text)
from public, anon, authenticated, service_role;
create or replace function private.year_rollover_section_key(
p_class_code text,
p_grade text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
v_code text := upper(regexp_replace(coalesce(p_class_code, ''), '[^a-zA-Z0-9]', '', 'g'));
v_grade text := regexp_replace(coalesce(p_grade, ''), '[^0-9]', '', 'g');
begin
if v_grade <> '' then
v_code := regexp_replace(v_code, '^G?' || v_grade, '');
end if;
return nullif(v_code, '');
end;
$$;
revoke all on function private.year_rollover_section_key(text, text)
from public, anon, authenticated, service_role;
create or replace function private.year_rollover_source_roster(
p_school_id uuid,
p_source_year_id uuid
)
returns table (
student_id uuid,
student_name text,
source_class_id uuid,
source_class_code text,
source_grade text,
source_authority text,
current_class_id uuid,
current_class_code text,
current_grade text
)
language sql
stable
security definer
set search_path = ''
as $$
with year_row as (
select y.*
from public.school_academic_years y
where y.id = p_source_year_id and y.school_id = p_school_id
),
active_students as (
select sm.user_id as student_id,
coalesce(nullif(trim(u.full_name), ''), nullif(trim(u.username), ''),
nullif(trim(u.email), ''), 'Student') as student_name,
u.batch
from public.school_members sm
join public.users u on u.id = sm.user_id
where sm.school_id = p_school_id
and sm.status = 'active'
and sm.role_in_school = 'student'
),
year_enrolment as (
select distinct on (e.student_id)
e.student_id,
coalesce(e.class_id, resolved.id) as class_id
from public.student_academic_enrolments e
left join lateral (
select c.id
from public.classes c
where c.school_id = p_school_id
and upper(regexp_replace(trim(c.class_code), '\s+', '', 'g'))
= upper(regexp_replace(trim(coalesce(e.class_code, '')), '\s+', '', 'g'))
order by coalesce(c.is_active, false) desc, c.created_at desc, c.id
limit 1
) resolved on true
where e.school_id = p_school_id
and e.academic_year_id = p_source_year_id
order by e.student_id,
(e.context_quality = 'confirmed') desc,
e.starts_on desc,
e.created_at desc,
e.id desc
),
assignment_history as (
select distinct on (sa.student_id)
sa.student_id,
resolved.id as class_id
from public.student_assignments sa
join public.assignments a
on a.id = sa.assignment_id
and a.school_id = p_school_id
join year_row y
on a.assigned_at::date between y.starts_on and y.ends_on
left join lateral (
select c.id
from public.classes c
where c.school_id = p_school_id
and (
c.id = a.class_id
or upper(regexp_replace(trim(c.class_code), '\s+', '', 'g'))
= upper(regexp_replace(trim(coalesce(
a.class_code_snapshot, sa.batch, a.batch, ''
)), '\s+', '', 'g'))
)
order by (c.id = a.class_id) desc,
coalesce(c.is_active, false) desc,
c.created_at desc,
c.id
limit 1
) resolved on true
order by sa.student_id, a.assigned_at desc, a.id desc
),
current_placement as (
select cs.student_id, c.id as class_id
from public.class_students cs
join public.classes c
on c.id = cs.class_id
and c.school_id = p_school_id
),
profile_placement as (
select s.student_id, resolved.id as class_id
from active_students s
left join lateral (
select c.id
from public.classes c
where c.school_id = p_school_id
and upper(regexp_replace(trim(c.class_code), '\s+', '', 'g'))
= upper(regexp_replace(trim(coalesce(s.batch, '')), '\s+', '', 'g'))
order by coalesce(c.is_active, false) desc, c.created_at desc, c.id
limit 1
) resolved on true
),
chosen as (
select s.student_id, s.student_name,
coalesce(ye.class_id, ah.class_id, cp.class_id, pp.class_id) as source_class_id,
case
when ye.class_id is not null then 'academic_enrolment'
when ah.class_id is not null then 'historical_assignment'
when cp.class_id is not null then 'current_placement'
when pp.class_id is not null then 'profile_fallback'
else 'unresolved'
end as source_authority,
cp.class_id as current_class_id
from active_students s
left join year_enrolment ye on ye.student_id = s.student_id
left join assignment_history ah on ah.student_id = s.student_id
left join current_placement cp on cp.student_id = s.student_id
left join profile_placement pp on pp.student_id = s.student_id
)
select c.student_id, c.student_name,
c.source_class_id, sc.class_code, sc.grade_level,
c.source_authority,
c.current_class_id, cc.class_code, cc.grade_level
from chosen c
left join public.classes sc on sc.id = c.source_class_id and sc.school_id = p_school_id
left join public.classes cc on cc.id = c.current_class_id and cc.school_id = p_school_id
order by c.student_name, c.student_id;
$$;
revoke all on function private.year_rollover_source_roster(uuid, uuid)
from public, anon, authenticated, service_role;
create or replace function private.year_rollover_best_target_class(
p_school_id uuid,
p_source_class_id uuid
)
returns table (
target_class_id uuid,
confidence text,
rationale text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
v_source public.classes%rowtype;
v_source_grade integer;
v_section text;
v_target uuid;
v_count integer := 0;
begin
select * into v_source
from public.classes c
where c.id = p_source_class_id and c.school_id = p_school_id;
if not found then
return query select null::uuid, 'low'::text,
'The previous class could not be resolved.'::text;
return;
end if;
v_source_grade := private.year_rollover_grade_number(v_source.grade_level);
if v_source_grade is null then
return query select null::uuid, 'low'::text,
'The source class has no numeric grade level.'::text;
return;
end if;
if v_source_grade >= 12 then
return query select null::uuid, 'high'::text,
'The class is at the final grade and requires a graduation review.'::text;
return;
end if;
v_section := private.year_rollover_section_key(v_source.class_code, v_source.grade_level);
if v_section is not null then
select c.id into v_target
from public.classes c
where c.school_id = p_school_id
and coalesce(c.is_active, false)
and private.year_rollover_grade_number(c.grade_level) = v_source_grade + 1
and private.year_rollover_section_key(c.class_code, c.grade_level) = v_section
order by c.created_at, c.id
limit 1;
if v_target is not null then
return query select v_target, 'high'::text,
'Matched the next grade using the same class section.'::text;
return;
end if;
end if;
select count(*)::integer
into v_count
from public.classes c
where c.school_id = p_school_id
and coalesce(c.is_active, false)
and private.year_rollover_grade_number(c.grade_level) = v_source_grade + 1;
if v_count = 1 then
select c.id into v_target
from public.classes c
where c.school_id = p_school_id
and coalesce(c.is_active, false)
and private.year_rollover_grade_number(c.grade_level) = v_source_grade + 1
order by c.created_at, c.id
limit 1;
return query select v_target, 'medium'::text,
'Only one active class exists in the next grade; review the proposed merge.'::text;
elsif v_count = 0 then
return query select null::uuid, 'low'::text,
'No active class exists in the next grade.'::text;
else
return query select null::uuid, 'low'::text,
'Several next-grade classes are available and need a reviewed route.'::text;
end if;
end;
$$;
revoke all on function private.year_rollover_best_target_class(uuid, uuid)
from public, anon, authenticated, service_role;
create or replace function private.year_rollover_plan_hash(p_plan_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
select encode(extensions.digest(pg_catalog.convert_to(
jsonb_build_object(
'plan', jsonb_build_object(
'id', p.id,
'schoolId', p.school_id,
'sourceYearId', p.source_academic_year_id,
'targetYearId', p.target_academic_year_id,
'effectiveDate', p.effective_date,
'status', p.status
),
'routes', coalesce((
select jsonb_agg(jsonb_build_object(
'sourceClassId', r.source_class_id,
'targetClassId', r.target_class_id,
'outcome', r.outcome,
'confidence', r.confidence,
'overridden', r.is_overridden
) order by r.source_class_id)
from public.school_year_rollover_class_routes r
where r.plan_id = p.id
), '[]'::jsonb),
'students', coalesce((
select jsonb_agg(jsonb_build_object(
'studentId', d.student_id,
'sourceClassId', d.source_class_id,
'capturedCurrentClassId', d.current_class_id,
'liveCurrentClassId', live.class_id,
'targetClassId', d.target_class_id,
'outcome', d.outcome,
'reviewState', d.review_state,
'overridden', d.is_overridden,
'snapshotHash', d.snapshot_hash
) order by d.student_id)
from public.school_year_rollover_student_decisions d
left join public.class_students live on live.student_id = d.student_id
where d.plan_id = p.id
), '[]'::jsonb)
)::text,
'UTF8'
), 'sha256'), 'hex')
from public.school_year_rollover_plans p
where p.id = p_plan_id;
$$;
revoke all on function private.year_rollover_plan_hash(uuid)
from public, anon, authenticated, service_role;
create or replace function private.year_rollover_set_target_enrolment(
p_plan_id uuid,
p_student_id uuid,
p_class_id uuid,
p_actor uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
v_plan public.school_year_rollover_plans%rowtype;
v_source public.school_academic_years%rowtype;
v_target public.school_academic_years%rowtype;
v_class public.classes%rowtype;
v_existing public.student_academic_enrolments%rowtype;
v_count integer := 0;
v_id uuid;
begin
select * into v_plan
from public.school_year_rollover_plans p
where p.id = p_plan_id;
select * into v_source from public.school_academic_years y
where y.id = v_plan.source_academic_year_id and y.school_id = v_plan.school_id;
select * into v_target from public.school_academic_years y
where y.id = v_plan.target_academic_year_id and y.school_id = v_plan.school_id;
select * into v_class from public.classes c
where c.id = p_class_id and c.school_id = v_plan.school_id and coalesce(c.is_active, false);
if v_plan.id is null or v_target.id is null or v_class.id is null then
raise exception using errcode = '23503', message = 'rollover_target_context_missing';
end if;
select count(*)::integer into v_count
from public.student_academic_enrolments e
where e.student_id = p_student_id
and e.academic_year_id = v_target.id;
if v_count > 1 then
raise exception using errcode = '23514',
message = 'rollover_target_enrolment_requires_individual_review';
end if;
select * into v_existing
from public.student_academic_enrolments e
where e.student_id = p_student_id
and e.academic_year_id = v_target.id
order by e.created_at desc, e.id desc
limit 1
for update;
if found then
update public.student_academic_enrolments e
set class_id = v_class.id,
grade_level = v_class.grade_level,
class_code = v_class.class_code,
starts_on = v_target.starts_on,
ends_on = v_target.ends_on,
context_quality = 'confirmed',
source = 'school_admin',
created_by = coalesce(e.created_by, p_actor),
updated_at = now()
where e.id = v_existing.id
returning e.id into v_id;
else
insert into public.student_academic_enrolments(
school_id, student_id, academic_year_id, class_id,
grade_level, class_code, starts_on, ends_on,
context_quality, source, created_by
) values (
v_plan.school_id, p_student_id, v_target.id, v_class.id,
v_class.grade_level, v_class.class_code, v_target.starts_on, v_target.ends_on,
'confirmed', 'school_admin', p_actor
) returning id into v_id;
end if;
update public.student_academic_enrolments e
set ends_on = least(coalesce(e.ends_on, v_source.ends_on), v_source.ends_on),
updated_at = now()
where e.student_id = p_student_id
and e.academic_year_id = v_source.id;
return v_id;
end;
$$;
revoke all on function private.year_rollover_set_target_enrolment(uuid, uuid, uuid, uuid)
from public, anon, authenticated, service_role;
