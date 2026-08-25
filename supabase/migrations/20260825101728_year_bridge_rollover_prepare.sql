-- Year Bridge preparation: choose years, resolve historical roster authority and build proposed routes.

create or replace function public.rpc_school_admin_latest_year_rollover(
p_school_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
v_actor uuid := auth.uid();
v_plan_id uuid;
begin
if v_actor is null or not (
public.can_administer_school(p_school_id)
or public.is_school_owner(p_school_id)
) then
raise exception using errcode = '42501',
message = 'school_administrator_access_required';
end if;
select p.id into v_plan_id
from public.school_year_rollover_plans p
where p.school_id = p_school_id
order by
case p.status when 'draft' then 1 when 'running' then 2 when 'completed' then 3 else 4 end,
p.updated_at desc, p.id desc
limit 1;
if v_plan_id is null then
return jsonb_build_object('success', true, 'plan', null);
end if;
return public.rpc_school_admin_year_rollover_preview(v_plan_id);
end;
$$;
revoke all on function public.rpc_school_admin_latest_year_rollover(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.rpc_school_admin_latest_year_rollover(uuid)
to authenticated, service_role;
create or replace function public.rpc_school_admin_prepare_year_rollover(
p_school_id uuid,
p_source_academic_year_id uuid,
p_target_academic_year_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
v_actor uuid := auth.uid();
v_source public.school_academic_years%rowtype;
v_target public.school_academic_years%rowtype;
v_plan public.school_year_rollover_plans%rowtype;
v_roster_hash text;
begin
if v_actor is null or not (
public.can_administer_school(p_school_id)
or public.is_school_owner(p_school_id)
) then
raise exception using errcode = '42501',
message = 'school_administrator_access_required';
end if;
select * into v_source from public.school_academic_years y
where y.id = p_source_academic_year_id and y.school_id = p_school_id;
select * into v_target from public.school_academic_years y
where y.id = p_target_academic_year_id and y.school_id = p_school_id;
if v_source.id is null or v_target.id is null then
return jsonb_build_object('success', false, 'code', 'academic_year_not_found');
end if;
if v_source.starts_on >= v_target.starts_on or v_source.ends_on >= v_target.starts_on then
return jsonb_build_object('success', false, 'code', 'academic_year_sequence_invalid');
end if;
if v_source.status = 'planned' or v_target.status not in ('planned', 'current') then
return jsonb_build_object('success', false, 'code', 'academic_year_status_invalid');
end if;
perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
'year-rollover:' || p_school_id::text || ':' || p_source_academic_year_id::text
|| ':' || p_target_academic_year_id::text,
0
));
insert into public.school_year_rollover_plans(
school_id, source_academic_year_id, target_academic_year_id,
effective_date, status, created_by
) values (
p_school_id, v_source.id, v_target.id, v_target.starts_on, 'draft', v_actor
)
on conflict (school_id, source_academic_year_id, target_academic_year_id)
do update set
effective_date = excluded.effective_date,
status = case
when school_year_rollover_plans.status = 'completed' then 'completed'
else 'draft'
end,
preview_hash = null,
updated_at = now()
returning * into v_plan;
if v_plan.status = 'completed' then
return public.rpc_school_admin_year_rollover_preview(v_plan.id);
end if;
with roster as materialized (
select * from private.year_rollover_source_roster(p_school_id, v_source.id)
), source_classes as (
select distinct r.source_class_id
from roster r where r.source_class_id is not null
)
insert into public.school_year_rollover_class_routes(
plan_id, school_id, source_class_id, target_class_id, outcome,
source_grade, target_grade, confidence, rationale, updated_by
)
select
v_plan.id, p_school_id, sc.id,
case when private.year_rollover_grade_number(sc.grade_level) >= 12
then null else suggested.target_class_id end,
case
when private.year_rollover_grade_number(sc.grade_level) is null then 'manual'
when private.year_rollover_grade_number(sc.grade_level) >= 12 then 'graduate'
when suggested.target_class_id is null then 'manual'
else 'promote'
end,
sc.grade_level,
case when suggested.target_class_id is null then null else tc.grade_level end,
suggested.confidence,
suggested.rationale,
v_actor
from source_classes x
join public.classes sc on sc.id = x.source_class_id and sc.school_id = p_school_id
cross join lateral private.year_rollover_best_target_class(p_school_id, sc.id) suggested
left join public.classes tc on tc.id = suggested.target_class_id
on conflict (plan_id, source_class_id) do update set
target_class_id = excluded.target_class_id,
outcome = excluded.outcome,
source_grade = excluded.source_grade,
target_grade = excluded.target_grade,
confidence = excluded.confidence,
rationale = excluded.rationale,
updated_by = excluded.updated_by,
updated_at = now()
where not public.school_year_rollover_class_routes.is_overridden;
with roster as materialized (
select * from private.year_rollover_source_roster(p_school_id, v_source.id)
), proposal as (
select r.*,
route.target_class_id as route_target_class_id,
route.target_grade as route_target_grade,
route.outcome as route_outcome,
route.confidence as route_confidence,
private.year_rollover_grade_number(r.source_grade) as source_grade_number,
private.year_rollover_grade_number(r.current_grade) as current_grade_number
from roster r
left join public.school_year_rollover_class_routes route
on route.plan_id = v_plan.id and route.source_class_id = r.source_class_id
)
insert into public.school_year_rollover_student_decisions(
plan_id, school_id, student_id, source_class_id, current_class_id,
target_class_id, source_grade, current_grade, target_grade,
source_authority, outcome, review_state, rationale,
snapshot_hash, updated_by
)
select
v_plan.id, p_school_id, p.student_id, p.source_class_id, p.current_class_id,
case
when p.source_grade_number is not null
and p.current_grade_number = p.source_grade_number + 1
then p.current_class_id
when p.route_outcome = 'promote' then p.route_target_class_id
else null
end,
p.source_grade, p.current_grade,
case
when p.source_grade_number is not null
and p.current_grade_number = p.source_grade_number + 1
then p.current_grade
when p.route_outcome = 'promote' then p.route_target_grade
else null
end,
p.source_authority,
case
when p.source_class_id is null or p.source_grade_number is null then 'manual'
when p.source_grade_number >= 12 then 'graduate'
when p.current_class_id is not null
and p.current_grade_number = p.source_grade_number + 1 then 'already_promoted'
when p.route_outcome = 'promote' and p.route_target_class_id is not null then 'promote'
else 'manual'
end,
case
when p.source_class_id is null or p.source_grade_number is null then 'needs_review'
when p.source_grade_number >= 12 then 'needs_review'
when p.current_class_id is not null
and p.current_grade_number = p.source_grade_number + 1 then 'auto_ready'
when p.current_class_id is distinct from p.source_class_id then 'needs_review'
when p.route_outcome = 'promote' and p.route_target_class_id is not null
and p.route_confidence = 'high'
and p.source_authority in ('academic_enrolment', 'historical_assignment')
then 'auto_ready'
else 'needs_review'
end,
case
when p.source_class_id is null then 'No reliable previous class could be resolved.'
when p.source_grade_number is null then 'The previous class has no numeric grade level.'
when p.source_grade_number >= 12 then 'Final-grade students require a graduation or repeat decision.'
when p.current_class_id is not null
and p.current_grade_number = p.source_grade_number + 1
then 'The student is already placed in the expected next grade.'
when p.source_authority in ('current_placement', 'profile_fallback')
then 'Current profile placement is the only source and must be reviewed before promotion.'
when p.current_class_id is distinct from p.source_class_id
then 'The live class differs from the historical source and needs review.'
when p.route_outcome = 'promote' and p.route_target_class_id is not null
then 'Prepared from the approved class route.'
else 'A destination class must be selected.'
end,
encode(extensions.digest(pg_catalog.convert_to(concat_ws('|',
p.student_id::text,
coalesce(p.source_class_id::text, '-'),
coalesce(p.current_class_id::text, '-'),
p.source_authority,
coalesce(p.source_grade, '-'),
coalesce(p.current_grade, '-')
), 'UTF8'), 'sha256'), 'hex'),
v_actor
from proposal p
on conflict (plan_id, student_id) do update set
source_class_id = excluded.source_class_id,
current_class_id = excluded.current_class_id,
target_class_id = excluded.target_class_id,
source_grade = excluded.source_grade,
current_grade = excluded.current_grade,
target_grade = excluded.target_grade,
source_authority = excluded.source_authority,
outcome = excluded.outcome,
review_state = excluded.review_state,
rationale = excluded.rationale,
snapshot_hash = excluded.snapshot_hash,
updated_by = excluded.updated_by,
updated_at = now()
where not public.school_year_rollover_student_decisions.is_overridden
and public.school_year_rollover_student_decisions.review_state <> 'applied';
delete from public.school_year_rollover_student_decisions d
where d.plan_id = v_plan.id
and not d.is_overridden
and d.review_state <> 'applied'
and not exists (
select 1 from private.year_rollover_source_roster(p_school_id, v_source.id) r
where r.student_id = d.student_id
);
select encode(extensions.digest(pg_catalog.convert_to(
coalesce(string_agg(concat_ws('|',
r.student_id::text,
coalesce(r.source_class_id::text, '-'),
r.source_authority,
coalesce(r.current_class_id::text, '-')
), ',' order by r.student_id), ''),
'UTF8'
), 'sha256'), 'hex')
into v_roster_hash
from private.year_rollover_source_roster(p_school_id, v_source.id) r;
update public.school_year_rollover_plans
set source_roster_hash = v_roster_hash,
preview_hash = null,
updated_at = now()
where id = v_plan.id;
insert into public.school_year_rollover_events(
plan_id, school_id, actor_user_id, event_type, event_data
) values (
v_plan.id, p_school_id, v_actor, 'prepared',
jsonb_build_object(
'sourceYearId', v_source.id,
'targetYearId', v_target.id,
'sourceRosterHash', v_roster_hash,
'historicalRecordsRewritten', false
)
);
return public.rpc_school_admin_year_rollover_preview(v_plan.id);
end;
$$;
revoke all on function public.rpc_school_admin_prepare_year_rollover(uuid, uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.rpc_school_admin_prepare_year_rollover(uuid, uuid, uuid)
to authenticated, service_role;
