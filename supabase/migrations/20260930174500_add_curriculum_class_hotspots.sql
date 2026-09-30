-- Add longitudinal class hotspots to the existing fast Curriculum Intelligence RPC.
-- Keeps one teaching-group-scoped request while preserving governed evidence semantics.

create or replace function public.rpc_teacher_curriculum_group_evidence(
  p_school_id uuid,
  p_group_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_academic_year_id uuid;
  v_academic_subject_id uuid;
  v_school_subject_name text;
  v_academic_subject_name text;
  v_academic_subject_code text;
  v_student_count integer := 0;
  v_evidence jsonb := '[]'::jsonb;
  v_hotspots jsonb := '[]'::jsonb;
begin
  if v_actor is null then
    raise exception using errcode='42501', message='authentication_required';
  end if;

  select
    o.academic_year_id,
    ss.academic_subject_id,
    ss.name,
    a.name,
    a.code
  into
    v_academic_year_id,
    v_academic_subject_id,
    v_school_subject_name,
    v_academic_subject_name,
    v_academic_subject_code
  from public.school_subject_groups g
  join public.school_subject_offerings o
    on o.id=g.school_subject_offering_id
   and o.school_id=g.school_id
   and o.status='active'
  join public.school_subjects ss
    on ss.id=o.school_subject_id
   and ss.school_id=o.school_id
   and ss.is_active
  left join public.academic_subjects a
    on a.id=ss.academic_subject_id
   and a.is_active
  where g.id=p_group_id
    and g.school_id=p_school_id
    and g.status='active'
    and o.academic_year_id=public.academic_resolve_operational_year_id(p_school_id,now());

  if v_academic_year_id is null then
    raise exception using errcode='22023',message='active_teaching_group_required';
  end if;

  if not exists (
    select 1
    from public.school_subject_group_teachers gt
    join public.school_members sm
      on sm.school_id=gt.school_id
     and sm.user_id=gt.teacher_user_id
     and sm.status='active'
     and (sm.can_teach or sm.role_in_school='teacher')
    where gt.school_id=p_school_id
      and gt.group_id=p_group_id
      and gt.teacher_user_id=v_actor
      and gt.active
  ) then
    raise exception using errcode='42501',message='teaching_group_allocation_required';
  end if;

  select count(*)
  into v_student_count
  from private.subject_group_roster(p_group_id);

  with roster as materialized (
    select
      r.student_id,
      coalesce(nullif(u.full_name,''),u.username)::text as student_name
    from private.subject_group_roster(p_group_id) r
    join public.users u on u.id=r.student_id
  ),
  scoped_confidence as (
    select
      regexp_replace(c.skill_key,'^.*:','') as subskill_code,
      c.student_id,
      c.assessment_state,
      c.teacher_review_required,
      c.confidence_score
    from roster r
    join public.student_learning_confidence_states c
      on c.student_id=r.student_id
     and c.academic_year_id=v_academic_year_id
    left join public.academic_subjects s
      on s.id=c.academic_subject_id
    where
      (v_academic_subject_id is not null and c.academic_subject_id=v_academic_subject_id)
      or public.academic_normalize_subject_key(c.subject)
         = public.academic_normalize_subject_key(v_school_subject_name)
      or (
        v_academic_subject_name is not null
        and public.academic_normalize_subject_key(c.subject)
            = public.academic_normalize_subject_key(v_academic_subject_name)
      )
      or (
        v_academic_subject_code is not null
        and (
          c.subject=v_academic_subject_code
          or s.code=v_academic_subject_code
        )
      )
  ),
  confidence_aggregated as (
    select
      subskill_code,
      count(distinct student_id)::integer as students_with_evidence,
      count(distinct student_id) filter(where assessment_state='assessed')::integer as assessed_students,
      count(distinct student_id) filter(where assessment_state in ('not_assessed','low_data'))::integer as low_data_students,
      count(distinct student_id) filter(where assessment_state='stale')::integer as stale_students,
      count(distinct student_id) filter(where assessment_state='contradictory')::integer as contradictory_students,
      count(distinct student_id) filter(where teacher_review_required)::integer as teacher_review_students,
      round(avg(confidence_score)::numeric,1) as average_confidence
    from scoped_confidence
    where nullif(trim(subskill_code),'') is not null
    group by subskill_code
  ),
  scoped_focus as (
    select
      regexp_replace(f.skill_key,'^.*:','') as subskill_code,
      f.student_id,
      r.student_name,
      f.current_status,
      f.trend,
      f.priority,
      f.focus_occurrences,
      f.evidence_items,
      f.first_observed_at,
      f.last_observed_at,
      f.confidence_score,
      f.assessment_state,
      f.teacher_review_required
    from roster r
    join public.student_learning_focus_states f
      on f.student_id=r.student_id
     and f.academic_year_id=v_academic_year_id
    left join public.academic_subjects s
      on s.id=f.academic_subject_id
    where
      (v_academic_subject_id is not null and f.academic_subject_id=v_academic_subject_id)
      or public.academic_normalize_subject_key(f.subject)
         = public.academic_normalize_subject_key(v_school_subject_name)
      or (
        v_academic_subject_name is not null
        and public.academic_normalize_subject_key(f.subject)
            = public.academic_normalize_subject_key(v_academic_subject_name)
      )
      or (
        v_academic_subject_code is not null
        and (
          f.subject=v_academic_subject_code
          or s.code=v_academic_subject_code
        )
      )
  ),
  focus_aggregated as (
    select
      subskill_code,
      count(distinct student_id) filter(where current_status in ('new_focus','recurring','persistent','improving'))::integer as impacted_students,
      count(distinct student_id) filter(where current_status='new_focus')::integer as new_focus_students,
      count(distinct student_id) filter(where current_status='recurring')::integer as recurring_students,
      count(distinct student_id) filter(where current_status='persistent')::integer as persistent_students,
      count(distinct student_id) filter(where current_status='improving')::integer as improving_students,
      count(distinct student_id) filter(where current_status='resolved')::integer as resolved_students,
      sum(focus_occurrences) filter(where current_status in ('new_focus','recurring','persistent','improving'))::integer as focus_occurrences,
      sum(evidence_items) filter(where current_status in ('new_focus','recurring','persistent','improving'))::integer as evidence_items,
      min(first_observed_at) filter(where current_status in ('new_focus','recurring','persistent','improving')) as first_observed_at,
      max(last_observed_at) filter(where current_status in ('new_focus','recurring','persistent','improving')) as last_observed_at,
      count(distinct student_id) filter(where teacher_review_required)::integer as teacher_review_students,
      jsonb_agg(
        jsonb_build_object(
          'studentId',student_id,
          'studentName',student_name,
          'status',current_status,
          'trend',trend,
          'priority',priority,
          'focusOccurrences',focus_occurrences,
          'evidenceItems',evidence_items,
          'firstObservedAt',first_observed_at,
          'lastObservedAt',last_observed_at,
          'confidenceScore',confidence_score,
          'assessmentState',assessment_state,
          'teacherReviewRequired',teacher_review_required
        )
        order by
          case current_status
            when 'persistent' then 1
            when 'recurring' then 2
            when 'new_focus' then 3
            when 'improving' then 4
            when 'resolved' then 5
            else 6
          end,
          student_name
      ) filter(where current_status in ('new_focus','recurring','persistent','improving','resolved')) as students
    from scoped_focus
    where nullif(trim(subskill_code),'') is not null
    group by subskill_code
  )
  select
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'subskillCode',subskill_code,
          'studentsWithEvidence',students_with_evidence,
          'assessedStudents',assessed_students,
          'lowDataStudents',low_data_students,
          'staleStudents',stale_students,
          'contradictoryStudents',contradictory_students,
          'teacherReviewStudents',teacher_review_students,
          'averageConfidence',average_confidence
        )
        order by subskill_code
      )
      from confidence_aggregated
    ),'[]'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'subskillCode',subskill_code,
          'impactedStudents',impacted_students,
          'newFocusStudents',new_focus_students,
          'recurringStudents',recurring_students,
          'persistentStudents',persistent_students,
          'improvingStudents',improving_students,
          'resolvedStudents',resolved_students,
          'focusOccurrences',coalesce(focus_occurrences,0),
          'evidenceItems',coalesce(evidence_items,0),
          'firstObservedAt',first_observed_at,
          'lastObservedAt',last_observed_at,
          'teacherReviewStudents',teacher_review_students,
          'students',coalesce(students,'[]'::jsonb)
        )
        order by
          persistent_students desc,
          recurring_students desc,
          impacted_students desc,
          coalesce(focus_occurrences,0) desc,
          subskill_code
      )
      from focus_aggregated
      where impacted_students > 0 or resolved_students > 0
    ),'[]'::jsonb)
  into v_evidence,v_hotspots;

  return jsonb_build_object(
    'success',true,
    'schoolId',p_school_id,
    'groupId',p_group_id,
    'academicYearId',v_academic_year_id,
    'academicSubjectId',v_academic_subject_id,
    'studentCount',v_student_count,
    'evidence',v_evidence,
    'hotspots',v_hotspots,
    'disclosure',jsonb_build_object(
      'confidenceIsEvidenceQualityNotAttainment',true,
      'unassessedIsNotWeakness',true,
      'hotspotsRequireLongitudinalQualifiedEvidence',true,
      'targetedPracticeDoesNotProveMastery',true
    )
  );
end;
$function$;

revoke all on function public.rpc_teacher_curriculum_group_evidence(uuid,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_curriculum_group_evidence(uuid,uuid)
to authenticated,service_role;
