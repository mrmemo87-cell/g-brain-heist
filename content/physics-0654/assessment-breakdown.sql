-- Aggregate only; exact teaching-group authorization is checked before any data read.
create or replace function public.rpc_teacher_physics_assessment_breakdown(p_school_id uuid,p_group_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_result jsonb; v_phase text;
begin
  if auth.uid() is null or not exists(select 1 from public.school_members sm
    where sm.school_id=p_school_id and sm.user_id=auth.uid() and sm.status='active') or not exists (
    select 1 from public.school_subject_group_teachers t
    join public.school_subject_groups g on g.id=t.group_id and g.school_id=t.school_id and g.status='active'
    join public.school_subject_offerings o on o.id=g.school_subject_offering_id and o.school_id=g.school_id and o.status='active'
    join public.school_subjects ss on ss.id=o.school_subject_id and ss.school_id=o.school_id and ss.is_active
    join public.academic_subjects s on s.id=ss.academic_subject_id and s.code='physics' and s.is_active
    where t.school_id=p_school_id and t.group_id=p_group_id and t.teacher_user_id=auth.uid() and t.active
  ) then raise exception using errcode='42501',message='physics_teaching_group_access_required'; end if;

  select m.registry_phase into v_phase from public.physics_programme_offering_mappings m
  join public.school_subject_groups g on g.school_subject_offering_id=m.offering_id
  where g.id=p_group_id and g.school_id=p_school_id and m.status='active'
    and m.programme_code='0654' and m.source_version='2025-2027';

  with items as materialized (
    select e.*,coalesce(e.is_independent_assessment,false)
      and private.registry_question_answer_is_fresh(e.student_id,e.assignment_id,e.question_id,e.answered_at) independent_fresh
    from public.student_learning_registry_item_evidence e
    join public.assignments a on a.id=e.assignment_id and a.school_id=e.school_id and a.subject_group_id=p_group_id
    join public.academic_subjects s on s.id=e.academic_subject_id and s.code='physics'
    where e.school_id=p_school_id and exists (
      select 1 from public.school_subject_group_students gs where gs.school_id=e.school_id and gs.group_id=p_group_id
        and gs.student_id=e.student_id and gs.status='active'
    )
  ), profiles as (
    select distinct i.answer_id,i.question_id,i.assignment_id,i.student_id,i.is_correct,i.independent_fresh,p.value profile
    from items i cross join lateral jsonb_array_elements(coalesce(i.taxonomy_snapshot->'externalAssessmentProfiles','[]'::jsonb)) p
    where p.value->>'programmeCode'='0654' and p.value->>'sourceVersion'='2025-2027'
  ), component_items as (
    select distinct p.answer_id,p.question_id,p.assignment_id,p.student_id,p.is_correct,p.independent_fresh,
      p.profile->>'primaryAssessmentObjective' ao,c.value component
    from profiles p cross join lateral jsonb_array_elements_text(coalesce(p.profile->'objectiveComponents','[]'::jsonb)) c
  ), breakdown as (
    select ao,component,count(*) item_count,count(*) filter(where is_correct) correct_count,
      count(*) filter(where independent_fresh) independent_fresh_count,
      count(*) filter(where independent_fresh and is_correct) independent_fresh_correct_count,
      count(distinct question_id) filter(where independent_fresh) distinct_questions,
      count(distinct assignment_id) filter(where independent_fresh) distinct_assignments,
      count(distinct student_id) filter(where independent_fresh) students_with_independent_evidence
    from component_items group by ao,component
  ) select jsonb_build_object('success',true,'programmeCode','0654','sourceVersion','2025-2027',
    'registryPhase',v_phase,'programmeConfigured',v_phase is not null,
    'components',coalesce((select jsonb_agg(jsonb_build_object(
      'ao',ao,'component',component,'itemCount',item_count,'correctCount',correct_count,
      'independentFreshCount',independent_fresh_count,'independentFreshCorrectCount',independent_fresh_correct_count,
      'practiceOrRepeatedCount',item_count-independent_fresh_count,'distinctQuestions',distinct_questions,
      'distinctAssignments',distinct_assignments,'studentsWithIndependentEvidence',students_with_independent_evidence
    ) order by ao,component) from breakdown),'[]'::jsonb),
    'disclosure','Descriptive evidence only. No grade, band or mastery estimate. MCQs do not assess AO3 practical performance. Components overlap and must not be summed as separate marks.') into v_result;
  return v_result;
end;
$function$;
revoke all on function public.rpc_teacher_physics_assessment_breakdown(uuid,uuid) from public,anon;
grant execute on function public.rpc_teacher_physics_assessment_breakdown(uuid,uuid) to authenticated;
