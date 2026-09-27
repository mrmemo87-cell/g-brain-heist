-- Live-history follow-up: manual submissions require a governed Evidence Focus.
CREATE OR REPLACE FUNCTION public.rpc_teacher_submit_manual_question_for_governance(p_question_id uuid, p_primary_skill_code text, p_atomic_subskill_code text, p_evidence_focus_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_teacher public.teachers%rowtype;
  v_question public.questions%rowtype;
  v_school_id uuid;
  v_school_name text;
  v_school_status text;
  v_grade integer;
  v_registry_version text;
  v_primary_skill_name text;
  v_atomic_subskill_name text;
  v_evidence_focus_name text;
  v_evidence_focus_description text;
  v_submission_id uuid;
  v_taxonomy jsonb;
begin
  if v_actor is null then
    raise exception using errcode='42501',message='authentication_required';
  end if;

  select * into v_teacher
  from public.teachers
  where user_id=v_actor
  order by id
  limit 1;
  if not found then
    raise exception using errcode='42501',message='teacher_profile_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_question_id::text,0));

  select * into v_question
  from public.questions
  where id=p_question_id
    and teacher_id=v_teacher.id
    and content_origin='teacher'
    and pool_scope='teacher'
    and verification_status='unverified'
    and is_active
  for update;

  if not found then
    raise exception using errcode='23514',
      message='manual_question_must_be_owned_active_unverified_teacher_question';
  end if;

  if cardinality(v_question.eligible_grade_levels) <> 1 then
    raise exception using errcode='23514',
      message='manual_question_verification_requires_exactly_one_grade';
  end if;
  v_grade:=v_question.eligible_grade_levels[1];
  if v_grade not between 1 and 12 then
    raise exception using errcode='23514',message='manual_question_grade_not_supported';
  end if;

  if not exists(
    select 1
    from public.academic_skill_registry_subject_aliases a
    join public.academic_skill_registry_versions v on v.id=a.registry_version_id
    where a.alias_normalized=lower(trim(v_question.subject))
      and a.status='active' and v.status='published'
  ) then
    raise exception using errcode='23514',
      message='manual_question_registry_not_available_for_subject';
  end if;

  select r.registry_version_code,r.skill_name,r.subskill_name
  into v_registry_version,v_primary_skill_name,v_atomic_subskill_name
  from private.resolve_canonical_skill_pair(
    v_question.subject,v_grade,p_primary_skill_code,p_atomic_subskill_code
  ) r
  limit 1;

  if not found then
    raise exception using errcode='23514',
      message='manual_question_canonical_registry_match_required';
  end if;

  select r.evidence_focus_name,r.evidence_focus_description
  into v_evidence_focus_name,v_evidence_focus_description
  from private.resolve_canonical_evidence_focus(
    v_question.subject,v_grade,p_atomic_subskill_code,p_evidence_focus_code
  ) r
  limit 1;

  if not found then
    raise exception using errcode='23514',
      message='manual_question_evidence_focus_registry_match_required';
  end if;

  select coalesce(u.school_id,membership.school_id),school.name,school.status
  into v_school_id,v_school_name,v_school_status
  from public.users u
  left join lateral (
    select sm.school_id
    from public.school_members sm
    where sm.user_id=v_actor and sm.status='active'
    order by case sm.role_in_school when 'teacher' then 0 when 'school_admin' then 1 else 2 end,
      sm.joined_at desc nulls last,sm.id
    limit 1
  ) membership on true
  left join public.schools school on school.id=coalesce(u.school_id,membership.school_id)
  where u.id=v_actor;

  if v_school_id is null or v_school_status is distinct from 'active' then
    raise exception using errcode='23514',
      message='manual_question_verification_requires_active_school';
  end if;

  v_taxonomy:=jsonb_build_object(
    'registry_version',v_registry_version,
    'registry_match',true,
    'primary_skill_code',trim(p_primary_skill_code),
    'primary_skill_name',v_primary_skill_name,
    'atomic_subskill_code',trim(p_atomic_subskill_code),
    'atomic_subskill_name',v_atomic_subskill_name,
    'evidence_focus_code',trim(p_evidence_focus_code),
    'evidence_focus_name',v_evidence_focus_name,
    'evidence_focus_description',v_evidence_focus_description,
    'assessment_process_code','AO1',
    'assessment_process_name','Requires superadmin confirmation',
    'assessment_process_definition','Manual teacher submission; superadmin must confirm the cognitive process before approval.',
    'cognitive_process','understand',
    'evidence_statement','Provisional manual submission: superadmin must confirm the exact evidence statement before approval.',
    'secondary_skill_names','[]'::jsonb,
    'confidence_score',0.9,
    'review_reason','Teacher selected a canonical Brain Heist skill and subskill. Curriculum objective, assessment process and evidence statement require human governance.'
  );

  insert into public.teacher_question_manual_submissions(
    question_id,teacher_id,teacher_user_id,school_id,submitted_content_hash,
    question_snapshot,taxonomy_proposal
  ) values (
    v_question.id,v_teacher.id,v_actor,v_school_id,v_question.current_content_hash,
    jsonb_build_object(
      'questionId',v_question.id,
      'subject',v_question.subject,
      'topic',coalesce(nullif(v_question.topic_name,''),v_question.topic),
      'difficulty',v_question.difficulty,
      'questionText',v_question.question_text,
      'questionType',v_question.question_type,
      'options',v_question.options,
      'correctAnswer',v_question.correct_answer,
      'explanation',v_question.explanation,
      'gradeLevel',v_question.grade_level,
      'eligibleGradeLevels',to_jsonb(v_question.eligible_grade_levels),
      'contentHash',v_question.current_content_hash
    ),
    v_taxonomy
  ) returning id into v_submission_id;

  update public.questions
  set verification_status='in_review',
      curriculum_review_status='in_review',
      analytics_eligible=false,
      is_public=false,
      updated_at=now()
  where id=v_question.id;

  return jsonb_build_object(
    'success',true,
    'submissionId',v_submission_id,
    'questionId',v_question.id,
    'verificationStatus','in_review',
    'school',jsonb_build_object('id',v_school_id,'name',v_school_name),
    'registryVersion',v_registry_version,
    'primarySkillCode',trim(p_primary_skill_code),
    'primarySkillName',v_primary_skill_name,
    'atomicSubskillCode',trim(p_atomic_subskill_code),
    'atomicSubskillName',v_atomic_subskill_name,
    'evidenceFocusCode',trim(p_evidence_focus_code),
    'evidenceFocusName',v_evidence_focus_name
  );
end;
$function$
;

revoke all on function public.rpc_teacher_submit_manual_question_for_governance(uuid,text,text,text)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_submit_manual_question_for_governance(uuid,text,text,text)
to authenticated,service_role;
