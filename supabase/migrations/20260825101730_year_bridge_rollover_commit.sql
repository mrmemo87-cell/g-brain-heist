-- Year Bridge launch: hash-locked, atomic placement transfer and target-year enrolment confirmation.

create or replace function public.rpc_school_admin_commit_year_rollover(
p_plan_id uuid,
p_preview_hash text,
p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
v_actor uuid := auth.uid();
v_plan public.school_year_rollover_plans%rowtype;
v_source public.school_academic_years%rowtype;
v_target public.school_academic_years%rowtype;
v_preview jsonb;
v_hash text;
v_decision public.school_year_rollover_student_decisions%rowtype;
v_current_class_id uuid;
v_result jsonb;
v_reason text;
v_enrolment_id uuid;
v_summary jsonb;
begin
select * into v_plan from public.school_year_rollover_plans p
where p.id = p_plan_id for update;
if not found then return jsonb_build_object('success', false, 'code', 'rollover_plan_not_found'); end if;
if v_actor is null or not (
public.can_administer_school(v_plan.school_id)
or public.is_school_owner(v_plan.school_id)
) then raise exception using errcode = '42501', message = 'school_administrator_access_required'; end if;
if v_plan.status = 'completed' then
return jsonb_build_object(
'success', true, 'planId', v_plan.id, 'status', 'completed',
'reused', true, 'summary', v_plan.completion_summary
);
end if;
if v_plan.status <> 'draft' then return jsonb_build_object('success', false, 'code', 'rollover_plan_not_committable'); end if;
select * into v_source from public.school_academic_years y
where y.id = v_plan.source_academic_year_id and y.school_id = v_plan.school_id for update;
select * into v_target from public.school_academic_years y
where y.id = v_plan.target_academic_year_id and y.school_id = v_plan.school_id for update;
if lower(trim(coalesce(p_confirmation, ''))) <> lower(trim(v_target.name)) then
return jsonb_build_object('success', false, 'code', 'rollover_confirmation_mismatch');
end if;
perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
'year-rollover-commit:' || v_plan.school_id::text,
0
));
v_preview := public.rpc_school_admin_year_rollover_preview(v_plan.id);
if not coalesce((v_preview->>'canCommit')::boolean, false) then
return jsonb_build_object(
'success', false, 'code', 'rollover_rehearsal_has_blockers',
'blockers', v_preview->'blockers', 'warnings', v_preview->'warnings'
);
end if;
v_hash := private.year_rollover_plan_hash(v_plan.id);
if nullif(trim(coalesce(p_preview_hash, '')), '') is null or p_preview_hash <> v_hash then
return jsonb_build_object(
'success', false, 'code', 'rollover_rehearsal_changed',
'expectedPreviewHash', v_hash
);
end if;
update public.school_year_rollover_plans
set status = 'running', preview_hash = v_hash, updated_at = now()
where id = v_plan.id;
for v_decision in
select d.*
from public.school_year_rollover_student_decisions d
where d.plan_id = v_plan.id
order by d.student_id
for update
loop
v_current_class_id := null;
select cs.class_id into v_current_class_id
from public.class_students cs
where cs.student_id = v_decision.student_id
for update;
v_reason := concat(
'Year Bridge ', v_source.name, ' → ', v_target.name, ': ',
coalesce(nullif(trim(v_decision.override_reason), ''), v_decision.rationale)
);
if v_decision.outcome in ('promote', 'repeat', 'already_promoted') then
v_result := public.rpc_school_admin_transfer_student_placement(
v_plan.school_id,
v_decision.student_id,
v_current_class_id,
v_decision.target_class_id,
v_reason,
v_plan.effective_date,
null
);
if not coalesce((v_result->>'success')::boolean, false) then
raise exception using errcode = 'P0001',
message = coalesce(v_result->>'code', 'rollover_placement_failed'),
detail = concat('student_id=', v_decision.student_id::text, '; ', coalesce(v_result->>'error', ''));
end if;
v_enrolment_id := private.year_rollover_set_target_enrolment(
v_plan.id, v_decision.student_id, v_decision.target_class_id, v_actor
);
v_result := v_result || jsonb_build_object('academicEnrolmentId', v_enrolment_id);
elsif v_decision.outcome in ('graduate', 'leave') then
if exists (
select 1 from public.student_learning_observations o
where o.student_id = v_decision.student_id
and o.academic_year_id = v_target.id
) then
raise exception using errcode = '23514',
message = 'rollover_exit_has_target_year_evidence',
detail = 'student_id=' || v_decision.student_id::text;
end if;
if v_current_class_id is not null then
v_result := public.rpc_school_admin_unassign_student_placement(
v_plan.school_id,
v_decision.student_id,
v_current_class_id,
v_reason,
v_plan.effective_date,
null
);
if not coalesce((v_result->>'success')::boolean, false) then
raise exception using errcode = 'P0001',
message = coalesce(v_result->>'code', 'rollover_exit_failed'),
detail = concat('student_id=', v_decision.student_id::text, '; ', coalesce(v_result->>'error', ''));
end if;
else
v_result := jsonb_build_object('success', true, 'placementChanged', false);
end if;
delete from public.student_academic_enrolments e
where e.student_id = v_decision.student_id
and e.academic_year_id = v_target.id;
v_result := v_result || jsonb_build_object('schoolAccessReviewRequired', true);
else
raise exception using errcode = '23514',
message = 'rollover_contains_unresolved_student',
detail = 'student_id=' || v_decision.student_id::text;
end if;
update public.school_year_rollover_student_decisions d
set review_state = 'applied',
applied_at = now(),
apply_result = v_result,
updated_by = v_actor,
updated_at = now()
where d.id = v_decision.id;
end loop;
if v_source.status <> 'closed' then
update public.school_academic_years
set status = 'closed', updated_at = now()
where id = v_source.id;
end if;
if v_target.status = 'planned' then
update public.school_academic_years
set status = 'current', updated_at = now()
where id = v_target.id;
end if;
perform private.academic_refresh_school_context_for_period(
v_plan.school_id, v_target.starts_on, v_target.ends_on
);
select jsonb_build_object(
'studentsProcessed', count(*),
'promoted', count(*) filter (where d.outcome = 'promote'),
'alreadyPromoted', count(*) filter (where d.outcome = 'already_promoted'),
'repeating', count(*) filter (where d.outcome = 'repeat'),
'graduated', count(*) filter (where d.outcome = 'graduate'),
'leftSchool', count(*) filter (where d.outcome = 'leave'),
'targetYearId', v_target.id,
'targetYearName', v_target.name,
'effectiveDate', v_plan.effective_date,
'historyPreserved', true,
'schoolAccessReviewsRequired', count(*) filter (where d.outcome in ('graduate', 'leave'))
) into v_summary
from public.school_year_rollover_student_decisions d
where d.plan_id = v_plan.id;
update public.school_year_rollover_plans
set status = 'completed',
preview_hash = v_hash,
completion_summary = v_summary,
completed_by = v_actor,
completed_at = now(),
updated_at = now()
where id = v_plan.id;
insert into public.school_year_rollover_events(plan_id, school_id, actor_user_id, event_type, event_data)
values (v_plan.id, v_plan.school_id, v_actor, 'committed', v_summary || jsonb_build_object(
'previewHash', v_hash,
'historicalAssignmentsRewritten', false,
'historicalWritingRewritten', false
));
return jsonb_build_object(
'success', true,
'planId', v_plan.id,
'status', 'completed',
'reused', false,
'summary', v_summary
);
end;
$$;
revoke all on function public.rpc_school_admin_commit_year_rollover(uuid, text, text)
from public, anon, authenticated, service_role;
grant execute on function public.rpc_school_admin_commit_year_rollover(uuid, text, text)
to authenticated, service_role;
comment on table public.school_year_rollover_plans is
'School-admin reviewed academic-year rollover plans. Historical academic records are never rewritten by this workflow.';
comment on table public.school_year_rollover_class_routes is
'Reviewed source-class to destination-class routes used by Year Bridge.';
comment on table public.school_year_rollover_student_decisions is
'Per-student promotion, repeat, graduation, leave, or manual decisions with drift-protected snapshots.';
comment on table public.school_year_rollover_events is
'Append-only audit events for Year Bridge preparation, review, cancellation, and launch.';
