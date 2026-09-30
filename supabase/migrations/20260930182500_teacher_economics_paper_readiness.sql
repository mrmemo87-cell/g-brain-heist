-- Teaching-group scoped Cambridge 0455 paper/AO evidence.
-- This is reporting readiness, not a predicted examination grade.

create or replace function public.rpc_teacher_curriculum_paper_readiness(
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
  v_student_count integer := 0;
  v_profiled_question_count integer := 0;
  v_evidence jsonb := '[]'::jsonb;
begin
  if v_actor is null then
    raise exception using errcode='42501',message='authentication_required';
  end if;

  select o.academic_year_id
  into v_academic_year_id
  from public.school_subject_groups g
  join public.school_subject_offerings o
    on o.id=g.school_subject_offering_id
   and o.school_id=g.school_id
   and o.status='active'
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

  select count(*) into v_student_count
  from private.subject_group_roster(p_group_id);

  select count(distinct p.question_id)::integer
  into v_profiled_question_count
  from public.verified_question_assessment_profiles p
  join public.questions q
    on q.id=p.question_id
   and q.is_active
   and q.content_origin='brain_heist'
   and q.verification_status='verified'
   and q.analytics_eligible
   and q.current_content_hash=q.verified_content_hash
   and q.current_content_hash=p.question_content_hash
  where p.status='active'
    and p.provider_name='Cambridge International Education'
    and p.programme_code='0455'
    and p.source_version='2027-2029';

  with roster as materialized (
    select r.student_id
    from private.subject_group_roster(p_group_id) r
  ),
  scoped as (
    select
      p.paper_component,
      p.paper_section,
      p.evidence_mode,
      p.primary_assessment_objective,
      p.assessment_objectives,
      saa.student_id,
      saa.assignment_id,
      saa.question_id,
      saa.is_correct,
      saa.answered_at
    from roster r
    join public.student_assignment_answers saa
      on saa.student_id=r.student_id
     and saa.grading_status='graded'
     and saa.is_correct is not null
    join public.assignments a
      on a.id=saa.assignment_id
     and a.school_id=p_school_id
     and a.subject_group_id=p_group_id
     and a.academic_year_id=v_academic_year_id
    join public.assignment_questions aq
      on aq.assignment_id=saa.assignment_id
     and aq.question_id=saa.question_id
     and aq.analytics_eligible_snapshot
     and aq.content_origin_snapshot='brain_heist'
     and aq.verification_status_snapshot='verified'
    join public.verified_question_assessment_profiles p
      on p.question_id=aq.question_id
     and p.question_content_hash=aq.question_content_hash
     and p.status='active'
     and p.provider_name='Cambridge International Education'
     and p.programme_code='0455'
     and p.source_version='2027-2029'
  ),
  aggregated as (
    select
      paper_component,
      paper_section,
      evidence_mode,
      primary_assessment_objective,
      min(assessment_objectives) as assessment_objectives,
      count(*)::integer as graded_responses,
      count(*) filter(where is_correct)::integer as correct_responses,
      count(distinct student_id)::integer as students_with_evidence,
      count(distinct question_id)::integer as distinct_questions,
      count(distinct assignment_id)::integer as distinct_assignments,
      round(100.0*count(*) filter(where is_correct)/nullif(count(*),0),1) as observed_accuracy,
      min(answered_at) as first_evidence_at,
      max(answered_at) as last_evidence_at
    from scoped
    group by paper_component,paper_section,evidence_mode,primary_assessment_objective
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'paperComponent',paper_component,
        'paperSection',paper_section,
        'evidenceMode',evidence_mode,
        'primaryAssessmentObjective',primary_assessment_objective,
        'assessmentObjectives',to_jsonb(assessment_objectives),
        'gradedResponses',graded_responses,
        'correctResponses',correct_responses,
        'studentsWithEvidence',students_with_evidence,
        'distinctQuestions',distinct_questions,
        'distinctAssignments',distinct_assignments,
        'observedAccuracy',observed_accuracy,
        'firstEvidenceAt',first_evidence_at,
        'lastEvidenceAt',last_evidence_at
      )
      order by paper_component,paper_section nulls first,primary_assessment_objective
    ),
    '[]'::jsonb
  )
  into v_evidence
  from aggregated;

  return jsonb_build_object(
    'success',true,
    'programme',jsonb_build_object(
      'providerName','Cambridge International Education',
      'programmeCode','0455',
      'sourceVersion','2027-2029'
    ),
    'groupId',p_group_id,
    'academicYearId',v_academic_year_id,
    'studentCount',v_student_count,
    'profiledQuestionCount',v_profiled_question_count,
    'evidence',v_evidence,
    'reportingPolicy',jsonb_build_object(
      'policyId','economics-paper-readiness-evidence-v1',
      'minimumDistinctQuestions',3,
      'minimumDistinctAssignments',2,
      'minimumStudents',3,
      'minimumRosterShare',0.25,
      'accuracyIsObservedEvidenceNotExamPrediction',true,
      'noGradePrediction',true
    )
  );
end;
$function$;

revoke all on function public.rpc_teacher_curriculum_paper_readiness(uuid,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_curriculum_paper_readiness(uuid,uuid)
to authenticated,service_role;
