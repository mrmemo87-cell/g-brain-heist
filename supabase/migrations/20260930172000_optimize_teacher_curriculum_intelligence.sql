-- Collapse Curriculum Intelligence class evidence loading from N+1 student RPCs
-- to one teaching-group-scoped aggregate RPC.
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
    select r.student_id
    from private.subject_group_roster(p_group_id) r
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
  aggregated as (
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
  )
  select coalesce(
    jsonb_agg(
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
    ),
    '[]'::jsonb
  )
  into v_evidence
  from aggregated;

  return jsonb_build_object(
    'success',true,
    'schoolId',p_school_id,
    'groupId',p_group_id,
    'academicYearId',v_academic_year_id,
    'academicSubjectId',v_academic_subject_id,
    'studentCount',v_student_count,
    'evidence',v_evidence,
    'disclosure',jsonb_build_object(
      'confidenceIsEvidenceQualityNotAttainment',true,
      'unassessedIsNotWeakness',true
    )
  );
end;
$function$;

revoke all on function public.rpc_teacher_curriculum_group_evidence(uuid,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_curriculum_group_evidence(uuid,uuid)
to authenticated,service_role;
