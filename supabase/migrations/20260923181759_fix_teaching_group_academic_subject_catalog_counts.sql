-- Restore real curriculum scope and verified evidence counts for current teaching-group subjects.
-- Historical teacher subject snapshots remain deliberately conservative.

create or replace function public.rpc_student_academic_subjects_for_year(
  p_student_id uuid,
  p_academic_year_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_caller uuid:=auth.uid();
  v_student uuid:=coalesce(p_student_id,auth.uid());
  v_school uuid;
  v_operational_year uuid;
  v_is_admin boolean:=false;
  v_is_current_teacher boolean:=false;
  v_is_historical_teacher boolean:=false;
  v_grade text;
begin
  if v_caller is null then
    raise exception using errcode='42501',message='authentication_required';
  end if;

  select u.school_id into v_school from public.users u where u.id=v_student;
  if v_school is null then
    return jsonb_build_object('success',true,'ready',false,'code','school_required','subjects','[]'::jsonb);
  end if;

  v_is_admin:=public.can_administer_school(v_school) or public.is_school_owner(v_school);
  if v_caller=v_student or v_is_admin then
    return private.student_academic_subjects_for_year_legacy_group_transition(v_student,p_academic_year_id);
  end if;

  v_operational_year:=public.academic_resolve_operational_year_id(v_school,now());
  v_is_current_teacher:=p_academic_year_id=v_operational_year and exists(
    select 1 from private.teacher_current_teaching_roster(v_caller,v_school) r
    where r.student_id=v_student
  );
  v_is_historical_teacher:=p_academic_year_id is distinct from v_operational_year and exists(
    select 1 from private.teacher_historical_teaching_roster(v_caller,v_school,p_academic_year_id) r
    where r.student_id=v_student
  );

  if v_is_current_teacher then
    select max(r.grade_level) into v_grade
    from private.teacher_current_teaching_roster(v_caller,v_school) r
    where r.student_id=v_student;

    return jsonb_build_object(
      'success',true,'ready',true,'academicYearId',p_academic_year_id,'gradeLevel',v_grade,
      'subjects',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',r.school_subject_id,
          'schoolSubjectId',r.school_subject_id,
          'code',coalesce(r.academic_subject_code,public.academic_normalize_subject_key(r.school_subject_name)),
          'name',r.school_subject_name,
          'canonicalName',r.academic_subject_name,
          'academicSubjectId',r.academic_subject_id,
          'mappingStatus',case when r.academic_subject_id is null then 'unmapped' else 'mapped' end,
          'requirement','teacher_allocation',
          'scopeId',offering.curriculum_scope_id,
          'approvedQuestionCount',case
            when r.academic_subject_id is null or offering.curriculum_scope_id is null then 0
            else (
              select count(distinct im.assessment_item_id)
              from public.curriculum_item_objective_mappings im
              join public.curriculum_assessment_items ai
                on ai.id=im.assessment_item_id
               and ai.is_active
               and ai.source_type='question_bank'
              join public.questions q
                on q.id::text=ai.source_record_id
               and q.academic_subject_id=r.academic_subject_id
               and q.is_active
               and q.verification_status='verified'
               and q.analytics_eligible
               and q.current_content_hash=q.verified_content_hash
               and ai.content_hash=q.verified_content_hash
               and v_grade~'^[0-9]+$'
               and v_grade::smallint=any(q.eligible_grade_levels)
               and (
                 (q.pool_scope='global'
                   and q.content_origin='brain_heist'
                   and q.owner_school_id is null
                   and q.is_public
                   and ai.school_id is null)
                 or
                 (q.pool_scope='school'
                   and q.content_origin='teacher'
                   and q.owner_school_id=v_school
                   and not q.is_public
                   and ai.school_id=v_school)
               )
              where im.curriculum_scope_id=offering.curriculum_scope_id
                and im.academic_subject_id=r.academic_subject_id
                and im.status='approved'
                and im.mapping_role='primary'
                and im.superseded_at is null
                and im.item_content_hash=ai.content_hash
            )
          end
        ) order by r.school_subject_name)
        from (
          select distinct school_subject_id,school_subject_name,academic_subject_id,academic_subject_name,academic_subject_code
          from private.teacher_current_teaching_roster(v_caller,v_school)
          where student_id=v_student
        ) r
        left join lateral (
          select so.curriculum_scope_id
          from public.school_subject_offerings so
          where so.school_id=v_school
            and so.school_subject_id=r.school_subject_id
            and so.academic_year_id=p_academic_year_id
            and so.grade_level=v_grade
            and so.status='active'
          order by so.updated_at desc,so.id
          limit 1
        ) offering on true
      ),'[]'::jsonb)
    );
  end if;

  if v_is_historical_teacher then
    select max(r.grade_level) into v_grade
    from private.teacher_historical_teaching_roster(v_caller,v_school,p_academic_year_id) r
    where r.student_id=v_student;

    return jsonb_build_object(
      'success',true,'ready',true,'academicYearId',p_academic_year_id,'gradeLevel',v_grade,
      'subjects',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',r.school_subject_id,
          'schoolSubjectId',r.school_subject_id,
          'code',coalesce(r.academic_subject_code,public.academic_normalize_subject_key(r.school_subject_name)),
          'name',r.school_subject_name,
          'canonicalName',r.academic_subject_name,
          'academicSubjectId',r.academic_subject_id,
          'mappingStatus',case when r.academic_subject_id is null then 'unmapped' else 'mapped' end,
          'requirement','historical_teacher_allocation',
          'scopeId',null,
          'approvedQuestionCount',0
        ) order by r.school_subject_name)
        from (
          select distinct school_subject_id,school_subject_name,academic_subject_id,academic_subject_name,academic_subject_code
          from private.teacher_historical_teaching_roster(v_caller,v_school,p_academic_year_id)
          where student_id=v_student
        ) r
      ),'[]'::jsonb)
    );
  end if;

  return private.student_academic_subjects_for_year_legacy_group_transition(v_student,p_academic_year_id);
end;
$function$;

revoke all on function public.rpc_student_academic_subjects_for_year(uuid,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_student_academic_subjects_for_year(uuid,uuid)
to authenticated,service_role;

comment on function public.rpc_student_academic_subjects_for_year(uuid,uuid) is
  'Teaching-group-aware academic subject directory. Current teachers receive the real school-subject curriculum scope and verified evidence question count; historical teacher views remain snapshot-safe.';
