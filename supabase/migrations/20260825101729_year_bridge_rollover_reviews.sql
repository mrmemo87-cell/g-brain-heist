-- Year Bridge review actions: approve class routes, review individual exceptions and cancel drafts.

create or replace function public.rpc_school_admin_set_year_rollover_class_route(
p_plan_id uuid,
p_source_class_id uuid,
p_outcome text,
p_target_class_id uuid,
p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
v_actor uuid := auth.uid();
v_plan public.school_year_rollover_plans%rowtype;
v_source public.classes%rowtype;
v_target public.classes%rowtype;
v_source_grade integer;
v_target_grade integer;
v_target_class_id uuid := p_target_class_id;
v_reason text := nullif(trim(p_reason), '');
begin
select * into v_plan from public.school_year_rollover_plans p
where p.id = p_plan_id for update;
if not found then return jsonb_build_object('success', false, 'code', 'rollover_plan_not_found'); end if;
if v_actor is null or not (
public.can_administer_school(v_plan.school_id)
or public.is_school_owner(v_plan.school_id)
) then raise exception using errcode = '42501', message = 'school_administrator_access_required'; end if;
if v_plan.status <> 'draft' then return jsonb_build_object('success', false, 'code', 'rollover_plan_not_editable'); end if;
if p_outcome not in ('promote', 'repeat', 'graduate', 'manual') then
return jsonb_build_object('success', false, 'code', 'rollover_route_outcome_invalid');
end if;
if v_reason is null or length(v_reason) < 3 then
return jsonb_build_object('success', false, 'code', 'rollover_review_reason_required');
end if;
select * into v_source from public.classes c
where c.id = p_source_class_id and c.school_id = v_plan.school_id;
if not found then return jsonb_build_object('success', false, 'code', 'source_class_not_found'); end if;
if p_outcome in ('promote', 'repeat') then
select * into v_target from public.classes c
where c.id = v_target_class_id and c.school_id = v_plan.school_id and coalesce(c.is_active, false);
if not found then return jsonb_build_object('success', false, 'code', 'target_class_not_found'); end if;
v_source_grade := private.year_rollover_grade_number(v_source.grade_level);
v_target_grade := private.year_rollover_grade_number(v_target.grade_level);
if p_outcome = 'promote' and (
v_source_grade is null or v_target_grade is distinct from v_source_grade + 1
) then return jsonb_build_object('success', false, 'code', 'promotion_target_grade_mismatch'); end if;
if p_outcome = 'repeat' and v_target_grade is distinct from v_source_grade then
return jsonb_build_object('success', false, 'code', 'repeat_target_grade_mismatch');
end if;
else
v_target_class_id := null;
end if;
update public.school_year_rollover_class_routes r
set target_class_id = v_target_class_id,
outcome = p_outcome,
target_grade = v_target.grade_level,
confidence = 'high',
rationale = v_reason,
is_overridden = true,
updated_by = v_actor,
updated_at = now()
where r.plan_id = v_plan.id and r.source_class_id = v_source.id;
update public.school_year_rollover_student_decisions d
set target_class_id = case
when p_outcome in ('promote', 'repeat') then v_target_class_id
else null
end,
target_grade = case
when p_outcome in ('promote', 'repeat') then v_target.grade_level
else null
end,
outcome = case
when p_outcome = 'promote' and d.current_class_id = v_target_class_id
then 'already_promoted'
else p_outcome
end,
review_state = case when p_outcome = 'manual' then 'needs_review' else 'reviewed' end,
rationale = v_reason,
override_reason = v_reason,
updated_by = v_actor,
updated_at = now()
where d.plan_id = v_plan.id
and d.source_class_id = v_source.id
and not d.is_overridden;
update public.school_year_rollover_plans set preview_hash = null where id = v_plan.id;
insert into public.school_year_rollover_events(plan_id, school_id, actor_user_id, event_type, event_data)
values (v_plan.id, v_plan.school_id, v_actor, 'route_updated', jsonb_build_object(
'sourceClassId', v_source.id, 'targetClassId', v_target_class_id,
'outcome', p_outcome, 'reason', v_reason
));
return public.rpc_school_admin_year_rollover_preview(v_plan.id);
end;
$$;
revoke all on function public.rpc_school_admin_set_year_rollover_class_route(uuid, uuid, text, uuid, text)
from public, anon, authenticated, service_role;
grant execute on function public.rpc_school_admin_set_year_rollover_class_route(uuid, uuid, text, uuid, text)
to authenticated, service_role;
create or replace function public.rpc_school_admin_set_year_rollover_student_decision(
p_plan_id uuid,
p_student_id uuid,
p_outcome text,
p_target_class_id uuid,
p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
v_actor uuid := auth.uid();
v_plan public.school_year_rollover_plans%rowtype;
v_decision public.school_year_rollover_student_decisions%rowtype;
v_target public.classes%rowtype;
v_live_class_id uuid;
v_source_grade integer;
v_target_grade integer;
v_target_class_id uuid := p_target_class_id;
v_reason text := nullif(trim(p_reason), '');
begin
select * into v_plan from public.school_year_rollover_plans p
where p.id = p_plan_id for update;
if not found then return jsonb_build_object('success', false, 'code', 'rollover_plan_not_found'); end if;
if v_actor is null or not (
public.can_administer_school(v_plan.school_id)
or public.is_school_owner(v_plan.school_id)
) then raise exception using errcode = '42501', message = 'school_administrator_access_required'; end if;
if v_plan.status <> 'draft' then return jsonb_build_object('success', false, 'code', 'rollover_plan_not_editable'); end if;
if p_outcome not in ('promote', 'repeat', 'already_promoted', 'graduate', 'leave', 'manual') then
return jsonb_build_object('success', false, 'code', 'rollover_student_outcome_invalid');
end if;
if v_reason is null or length(v_reason) < 3 then
return jsonb_build_object('success', false, 'code', 'rollover_review_reason_required');
end if;
select * into v_decision
from public.school_year_rollover_student_decisions d
where d.plan_id = v_plan.id and d.student_id = p_student_id
for update;
if not found then return jsonb_build_object('success', false, 'code', 'rollover_student_not_found'); end if;
select cs.class_id into v_live_class_id
from public.class_students cs where cs.student_id = p_student_id;
if p_outcome in ('promote', 'repeat', 'already_promoted') then
select * into v_target from public.classes c
where c.id = v_target_class_id and c.school_id = v_plan.school_id and coalesce(c.is_active, false);
if not found then return jsonb_build_object('success', false, 'code', 'target_class_not_found'); end if;
v_source_grade := private.year_rollover_grade_number(v_decision.source_grade);
v_target_grade := private.year_rollover_grade_number(v_target.grade_level);
if p_outcome = 'promote' and (
v_source_grade is null or v_target_grade is distinct from v_source_grade + 1
) then return jsonb_build_object('success', false, 'code', 'promotion_target_grade_mismatch'); end if;
if p_outcome = 'repeat' and v_target_grade is distinct from v_source_grade then
return jsonb_build_object('success', false, 'code', 'repeat_target_grade_mismatch');
end if;
if p_outcome = 'already_promoted' and v_live_class_id is distinct from v_target.id then
return jsonb_build_object('success', false, 'code', 'already_promoted_class_mismatch');
end if;
else
v_target_class_id := null;
end if;
update public.school_year_rollover_student_decisions d
set current_class_id = v_live_class_id,
current_grade = (select c.grade_level from public.classes c where c.id = v_live_class_id),
target_class_id = v_target_class_id,
target_grade = v_target.grade_level,
outcome = p_outcome,
review_state = case when p_outcome = 'manual' then 'needs_review' else 'reviewed' end,
rationale = v_reason,
is_overridden = true,
override_reason = v_reason,
updated_by = v_actor,
snapshot_hash = encode(extensions.digest(pg_catalog.convert_to(concat_ws('|',
d.student_id::text,
coalesce(d.source_class_id::text, '-'),
coalesce(v_live_class_id::text, '-'),
d.source_authority,
coalesce(d.source_grade, '-'),
coalesce((select c.grade_level from public.classes c where c.id = v_live_class_id), '-')
), 'UTF8'), 'sha256'), 'hex'),
updated_at = now()
where d.id = v_decision.id;
update public.school_year_rollover_plans set preview_hash = null where id = v_plan.id;
insert into public.school_year_rollover_events(plan_id, school_id, actor_user_id, event_type, event_data)
values (v_plan.id, v_plan.school_id, v_actor, 'student_decision_updated', jsonb_build_object(
'studentId', p_student_id, 'targetClassId', v_target_class_id,
'outcome', p_outcome, 'reason', v_reason
));
return public.rpc_school_admin_year_rollover_preview(v_plan.id);
end;
$$;
revoke all on function public.rpc_school_admin_set_year_rollover_student_decision(uuid, uuid, text, uuid, text)
from public, anon, authenticated, service_role;
grant execute on function public.rpc_school_admin_set_year_rollover_student_decision(uuid, uuid, text, uuid, text)
to authenticated, service_role;
create or replace function public.rpc_school_admin_cancel_year_rollover(
p_plan_id uuid,
p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
v_actor uuid := auth.uid();
v_plan public.school_year_rollover_plans%rowtype;
v_reason text := nullif(trim(p_reason), '');
begin
select * into v_plan from public.school_year_rollover_plans p
where p.id = p_plan_id for update;
if not found then return jsonb_build_object('success', false, 'code', 'rollover_plan_not_found'); end if;
if v_actor is null or not (
public.can_administer_school(v_plan.school_id)
or public.is_school_owner(v_plan.school_id)
) then raise exception using errcode = '42501', message = 'school_administrator_access_required'; end if;
if v_plan.status = 'completed' then return jsonb_build_object('success', false, 'code', 'completed_rollover_cannot_be_cancelled'); end if;
if v_reason is null or length(v_reason) < 3 then return jsonb_build_object('success', false, 'code', 'rollover_review_reason_required'); end if;
update public.school_year_rollover_plans
set status = 'cancelled', preview_hash = null, updated_at = now()
where id = v_plan.id;
insert into public.school_year_rollover_events(plan_id, school_id, actor_user_id, event_type, event_data)
values (v_plan.id, v_plan.school_id, v_actor, 'cancelled', jsonb_build_object('reason', v_reason));
return jsonb_build_object('success', true, 'planId', v_plan.id, 'status', 'cancelled');
end;
$$;
revoke all on function public.rpc_school_admin_cancel_year_rollover(uuid, text)
from public, anon, authenticated, service_role;
grant execute on function public.rpc_school_admin_cancel_year_rollover(uuid, text)
to authenticated, service_role;
