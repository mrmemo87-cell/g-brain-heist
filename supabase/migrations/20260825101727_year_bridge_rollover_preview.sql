-- Year Bridge preview: school-scoped rehearsal, blockers, warnings and safety disclosures.

create or replace function public.rpc_school_admin_year_rollover_preview(
p_plan_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
v_actor uuid := auth.uid();
v_plan public.school_year_rollover_plans%rowtype;
v_source public.school_academic_years%rowtype;
v_target public.school_academic_years%rowtype;
v_routes jsonb := '[]'::jsonb;
v_students jsonb := '[]'::jsonb;
v_classes jsonb := '[]'::jsonb;
v_summary jsonb := '{}'::jsonb;
v_blockers jsonb := '[]'::jsonb;
v_warnings jsonb := '[]'::jsonb;
v_hash text;
begin
select * into v_plan
from public.school_year_rollover_plans p
where p.id = p_plan_id;
if not found then
return jsonb_build_object('success', false, 'code', 'rollover_plan_not_found');
end if;
if v_actor is null or not (
public.can_administer_school(v_plan.school_id)
or public.is_school_owner(v_plan.school_id)
) then
raise exception using errcode = '42501',
message = 'school_administrator_access_required';
end if;
select * into v_source from public.school_academic_years y
where y.id = v_plan.source_academic_year_id and y.school_id = v_plan.school_id;
select * into v_target from public.school_academic_years y
where y.id = v_plan.target_academic_year_id and y.school_id = v_plan.school_id;
select coalesce(jsonb_agg(jsonb_build_object(
'id', c.id,
'classCode', c.class_code,
'className', c.class_name,
'gradeLevel', c.grade_level,
'studentCount', (select count(*) from public.class_students cs where cs.class_id = c.id),
'teacherCount', (select count(distinct cta.teacher_user_id)
from public.class_teacher_assignments cta
where cta.class_id = c.id and cta.active),
'subjectOfferingCount', (select count(*)
from public.school_curriculum_scope_mappings m
where m.school_id = v_plan.school_id
and m.academic_year_id = v_target.id
and m.grade_level = c.grade_level
and m.status in ('planned', 'active'))
) order by private.year_rollover_grade_number(c.grade_level), c.class_code), '[]'::jsonb)
into v_classes
from public.classes c
where c.school_id = v_plan.school_id and coalesce(c.is_active, false);
select coalesce(jsonb_agg(jsonb_build_object(
'id', r.id,
'sourceClassId', r.source_class_id,
'sourceClassCode', sc.class_code,
'sourceClassName', sc.class_name,
'sourceGrade', r.source_grade,
'targetClassId', r.target_class_id,
'targetClassCode', tc.class_code,
'targetClassName', tc.class_name,
'targetGrade', r.target_grade,
'outcome', r.outcome,
'confidence', r.confidence,
'rationale', r.rationale,
'isOverridden', r.is_overridden,
'studentCount', (select count(*)
from public.school_year_rollover_student_decisions d
where d.plan_id = v_plan.id and d.source_class_id = r.source_class_id),
'currentTargetCount', (select count(*)
from public.class_students cs where cs.class_id = r.target_class_id),
'projectedTargetCount', (select count(*)
from public.school_year_rollover_student_decisions d
where d.plan_id = v_plan.id and d.target_class_id = r.target_class_id
and d.outcome in ('promote', 'repeat', 'already_promoted')),
'teacherCount', (select count(distinct cta.teacher_user_id)
from public.class_teacher_assignments cta
where cta.class_id = r.target_class_id and cta.active),
'subjectOfferingCount', (select count(*)
from public.school_curriculum_scope_mappings m
where m.school_id = v_plan.school_id
and m.academic_year_id = v_target.id
and m.grade_level = r.target_grade
and m.status in ('planned', 'active'))
) order by private.year_rollover_grade_number(r.source_grade), sc.class_code), '[]'::jsonb)
into v_routes
from public.school_year_rollover_class_routes r
join public.classes sc on sc.id = r.source_class_id
left join public.classes tc on tc.id = r.target_class_id
where r.plan_id = v_plan.id;
select coalesce(jsonb_agg(jsonb_build_object(
'id', d.id,
'studentId', d.student_id,
'studentName', coalesce(nullif(trim(u.full_name), ''), nullif(trim(u.username), ''), 'Student'),
'sourceClassId', d.source_class_id,
'sourceClassCode', sc.class_code,
'sourceGrade', d.source_grade,
'currentClassId', d.current_class_id,
'currentClassCode', cc.class_code,
'currentGrade', d.current_grade,
'liveCurrentClassId', live.class_id,
'liveCurrentClassCode', lc.class_code,
'targetClassId', d.target_class_id,
'targetClassCode', tc.class_code,
'targetGrade', d.target_grade,
'sourceAuthority', d.source_authority,
'outcome', d.outcome,
'reviewState', d.review_state,
'rationale', d.rationale,
'isOverridden', d.is_overridden,
'overrideReason', d.override_reason
) order by
case d.review_state when 'needs_review' then 1 when 'reviewed' then 2 else 3 end,
private.year_rollover_grade_number(d.source_grade),
coalesce(nullif(trim(u.full_name), ''), nullif(trim(u.username), ''), 'Student'),
d.student_id), '[]'::jsonb)
into v_students
from public.school_year_rollover_student_decisions d
join public.users u on u.id = d.student_id
left join public.classes sc on sc.id = d.source_class_id
left join public.classes cc on cc.id = d.current_class_id
left join public.class_students live on live.student_id = d.student_id
left join public.classes lc on lc.id = live.class_id
left join public.classes tc on tc.id = d.target_class_id
where d.plan_id = v_plan.id;
select jsonb_build_object(
'totalStudents', count(*),
'autoReady', count(*) filter (where d.review_state = 'auto_ready'),
'reviewed', count(*) filter (where d.review_state = 'reviewed'),
'needsReview', count(*) filter (where d.review_state = 'needs_review'),
'promote', count(*) filter (where d.outcome = 'promote'),
'alreadyPromoted', count(*) filter (where d.outcome = 'already_promoted'),
'repeat', count(*) filter (where d.outcome = 'repeat'),
'graduate', count(*) filter (where d.outcome = 'graduate'),
'leave', count(*) filter (where d.outcome = 'leave'),
'manual', count(*) filter (where d.outcome = 'manual'),
'sourceAuthority', jsonb_build_object(
'academicEnrolment', count(*) filter (where d.source_authority = 'academic_enrolment'),
'historicalAssignment', count(*) filter (where d.source_authority = 'historical_assignment'),
'currentPlacement', count(*) filter (where d.source_authority = 'current_placement'),
'profileFallback', count(*) filter (where d.source_authority = 'profile_fallback'),
'unresolved', count(*) filter (where d.source_authority = 'unresolved')
)
) into v_summary
from public.school_year_rollover_student_decisions d
where d.plan_id = v_plan.id;
select coalesce(jsonb_agg(x.payload), '[]'::jsonb)
into v_blockers
from (
select jsonb_build_object(
'code', 'rollover_has_no_students',
'message', 'No active students were found for this rollover.'
) as payload
where (v_summary->>'totalStudents')::integer = 0
union all
select jsonb_build_object(
'code', 'source_year_still_open',
'message', format('%s must be closed before the rollover can be launched.', v_source.name)
)
where v_source.status <> 'closed' and current_date < v_source.ends_on
union all
select jsonb_build_object(
'code', 'target_year_not_available',
'message', 'The target academic year must be planned or current.'
)
where v_target.status not in ('planned', 'current')
union all
select jsonb_build_object(
'code', 'another_current_year_exists',
'message', 'Another current academic year must be reviewed before launch.'
)
where exists (
select 1 from public.school_academic_years y
where y.school_id = v_plan.school_id and y.status = 'current'
and y.id not in (v_source.id, v_target.id)
)
union all
select jsonb_build_object(
'code', 'student_review_required',
'message', format('%s needs an individual promotion decision.',
coalesce(nullif(trim(u.full_name), ''), nullif(trim(u.username), ''), 'A student')),
'studentId', d.student_id
)
from public.school_year_rollover_student_decisions d
join public.users u on u.id = d.student_id
where d.plan_id = v_plan.id
and (d.review_state = 'needs_review' or d.outcome = 'manual')
union all
select jsonb_build_object(
'code', 'target_class_required',
'message', format('%s has no approved destination class.',
coalesce(nullif(trim(u.full_name), ''), nullif(trim(u.username), ''), 'A student')),
'studentId', d.student_id
)
from public.school_year_rollover_student_decisions d
join public.users u on u.id = d.student_id
where d.plan_id = v_plan.id
and d.outcome in ('promote', 'repeat', 'already_promoted')
and d.target_class_id is null
union all
select jsonb_build_object(
'code', 'placement_changed_after_rehearsal',
'message', format('%s changed class after the plan was prepared. Refresh the rehearsal.',
coalesce(nullif(trim(u.full_name), ''), nullif(trim(u.username), ''), 'A student')),
'studentId', d.student_id
)
from public.school_year_rollover_student_decisions d
join public.users u on u.id = d.student_id
left join public.class_students cs on cs.student_id = d.student_id
where d.plan_id = v_plan.id
and cs.class_id is distinct from d.current_class_id
union all
select jsonb_build_object(
'code', 'multiple_target_enrolments',
'message', format('%s has more than one target-year enrolment and needs review.',
coalesce(nullif(trim(u.full_name), ''), nullif(trim(u.username), ''), 'A student')),
'studentId', d.student_id
)
from public.school_year_rollover_student_decisions d
join public.users u on u.id = d.student_id
where d.plan_id = v_plan.id
and (select count(*) from public.student_academic_enrolments e
where e.student_id = d.student_id and e.academic_year_id = v_target.id) > 1
union all
select jsonb_build_object(
'code', 'exit_has_target_year_evidence',
'message', format('%s already has target-year evidence and cannot be exited in bulk.',
coalesce(nullif(trim(u.full_name), ''), nullif(trim(u.username), ''), 'A student')),
'studentId', d.student_id
)
from public.school_year_rollover_student_decisions d
join public.users u on u.id = d.student_id
where d.plan_id = v_plan.id
and d.outcome in ('graduate', 'leave')
and exists (
select 1 from public.student_learning_observations o
where o.student_id = d.student_id and o.academic_year_id = v_target.id
)
) x;
select coalesce(jsonb_agg(x.payload), '[]'::jsonb)
into v_warnings
from (
select jsonb_build_object(
'code', 'source_roster_uses_current_placement',
'message', format('%s students use current placement because the closed year has no stronger roster snapshot.', count(*))
) as payload
from public.school_year_rollover_student_decisions d
where d.plan_id = v_plan.id and d.source_authority = 'current_placement'
having count(*) > 0
union all
select jsonb_build_object(
'code', 'source_roster_uses_profile_fallback',
'message', format('%s students use profile class data and should be checked carefully.', count(*))
)
from public.school_year_rollover_student_decisions d
where d.plan_id = v_plan.id and d.source_authority = 'profile_fallback'
having count(*) > 0
union all
select jsonb_build_object(
'code', 'target_grade_has_no_subject_plan',
'message', format('Grade %s has no subject plan in %s yet.', d.target_grade, v_target.name),
'gradeLevel', d.target_grade
)
from public.school_year_rollover_student_decisions d
where d.plan_id = v_plan.id
and d.outcome in ('promote', 'repeat', 'already_promoted')
and d.target_grade is not null
and not exists (
select 1 from public.school_curriculum_scope_mappings m
where m.school_id = v_plan.school_id
and m.academic_year_id = v_target.id
and m.grade_level = d.target_grade
and m.status in ('planned', 'active')
)
group by d.target_grade
union all
select jsonb_build_object(
'code', 'target_class_needs_staffing',
'message', format('%s has no active teacher allocation yet.', c.class_code),
'classId', c.id
)
from public.classes c
where c.id in (
select distinct d.target_class_id
from public.school_year_rollover_student_decisions d
where d.plan_id = v_plan.id and d.target_class_id is not null
)
and not exists (
select 1 from public.class_teacher_assignments cta
where cta.class_id = c.id and cta.active
)
union all
select jsonb_build_object(
'code', 'large_projected_class',
'message', format('%s is projected to receive %s students. Review class balance.', c.class_code, count(*)),
'classId', c.id,
'projectedStudents', count(*)
)
from public.school_year_rollover_student_decisions d
join public.classes c on c.id = d.target_class_id
where d.plan_id = v_plan.id
and d.outcome in ('promote', 'repeat', 'already_promoted')
group by c.id, c.class_code
having count(*) > 40
union all
select jsonb_build_object(
'code', 'exit_access_review_required',
'message', format('%s graduating or leaving students will need a separate school-access review after launch.', count(*))
)
from public.school_year_rollover_student_decisions d
where d.plan_id = v_plan.id and d.outcome in ('graduate', 'leave')
having count(*) > 0
union all
select jsonb_build_object(
'code', 'target_enrolment_will_be_reconciled',
'message', format('%s existing target-year enrolments will be updated to the approved destination class.', count(*))
)
from public.school_year_rollover_student_decisions d
join public.student_academic_enrolments e
on e.student_id = d.student_id and e.academic_year_id = v_target.id
where d.plan_id = v_plan.id
and d.target_class_id is not null
and e.class_id is distinct from d.target_class_id
having count(*) > 0
) x;
v_hash := private.year_rollover_plan_hash(v_plan.id);
return jsonb_build_object(
'success', true,
'plan', jsonb_build_object(
'id', v_plan.id,
'schoolId', v_plan.school_id,
'status', v_plan.status,
'effectiveDate', v_plan.effective_date,
'sourceYear', jsonb_build_object(
'id', v_source.id, 'name', v_source.name, 'startsOn', v_source.starts_on,
'endsOn', v_source.ends_on, 'status', v_source.status
),
'targetYear', jsonb_build_object(
'id', v_target.id, 'name', v_target.name, 'startsOn', v_target.starts_on,
'endsOn', v_target.ends_on, 'status', v_target.status
)
),
'summary', v_summary,
'classRoutes', v_routes,
'students', v_students,
'classOptions', v_classes,
'blockers', v_blockers,
'warnings', v_warnings,
'previewHash', v_hash,
'canCommit', v_plan.status = 'draft' and jsonb_array_length(v_blockers) = 0,
'safety', jsonb_build_object(
'historicalAssignmentsRewritten', false,
'historicalWritingRewritten', false,
'closedYearEnrolmentsPreserved', true,
'currentPlacementChangesRequireConfirmation', true,
'commitIsAtomic', true,
'driftProtectionEnabled', true
),
'completionSummary', v_plan.completion_summary
);
end;
$$;
revoke all on function public.rpc_school_admin_year_rollover_preview(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.rpc_school_admin_year_rollover_preview(uuid)
to authenticated, service_role;
