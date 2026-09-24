-- Generalize canonical-registry governance from English-only to every published subject registry.

CREATE OR REPLACE FUNCTION private.resolve_canonical_skill_pair(p_subject_key text, p_grade_level integer, p_primary_skill_code text, p_atomic_subskill_code text)
 RETURNS TABLE(registry_version_code text, strand_code text, skill_code text, skill_name text, subskill_code text, subskill_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with phase as (
    select case
      when p_grade_level between 1 and 6 then 'primary'
      when p_grade_level between 7 and 9 then 'lower_secondary'
      when p_grade_level between 10 and 12 then 'upper_secondary'
      else null
    end phase
  ),
  alias as (
    select a.*
    from public.academic_skill_registry_subject_aliases a
    where a.alias_normalized=lower(trim(coalesce(p_subject_key,'')))
      and a.status='active'
    limit 1
  )
  select
    version.code,
    strand.code,
    skill.code,
    skill.name,
    leaf.code,
    leaf.name
  from alias a
  join public.academic_skill_registry_versions version
    on version.id=a.registry_version_id and version.status='published'
  join public.academic_skill_registry_nodes skill
    on skill.registry_version_id=version.id
   and skill.code=trim(coalesce(p_primary_skill_code,''))
   and skill.node_type='skill'
   and skill.status='active'
  join public.academic_skill_registry_nodes strand
    on strand.id=skill.parent_id
   and strand.node_type='strand'
   and strand.status='active'
  join public.academic_skill_registry_nodes leaf
    on leaf.registry_version_id=version.id
   and leaf.parent_id=skill.id
   and leaf.code=trim(coalesce(p_atomic_subskill_code,''))
   and leaf.node_type='subskill'
   and leaf.status='active'
  cross join phase p
  where p.phase is not null
    and p.phase=any(skill.applicable_phases)
    and p.phase=any(leaf.applicable_phases)
    and (a.allowed_strand_codes is null or strand.code=any(a.allowed_strand_codes))
  limit 1;
$function$
;

revoke all on function private.resolve_canonical_skill_pair(text,integer,text,text)
from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.rpc_teacher_submit_manual_question_for_governance(p_question_id uuid, p_primary_skill_code text, p_atomic_subskill_code text)
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
    'atomicSubskillName',v_atomic_subskill_name
  );
end;
$function$
;

revoke all on function public.rpc_teacher_submit_manual_question_for_governance(uuid,text,text)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_submit_manual_question_for_governance(uuid,text,text)
to authenticated,service_role;

CREATE OR REPLACE FUNCTION private.enforce_school_canonical_taxonomy_registry()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_question record;
  v_grade integer;
  v_resolved record;
begin
  select q.pool_scope,q.content_origin,q.grade_level,q.eligible_grade_levels,q.subject,
         s.code as subject_code,s.name as subject_name
  into v_question
  from public.questions q
  left join public.academic_subjects s on s.id=q.academic_subject_id
  where q.id=new.question_id;

  if not found then return new; end if;
  if v_question.pool_scope <> 'school' or v_question.content_origin <> 'teacher' then
    return new;
  end if;

  select max(g) into v_grade
  from unnest(coalesce(v_question.eligible_grade_levels,'{}'::smallint[])) g;
  if v_grade is null then
    v_grade:=nullif(substring(coalesce(v_question.grade_level,'') from '[0-9]+'),'')::integer;
  end if;

  if not exists(
    select 1
    from public.academic_skill_registry_subject_aliases a
    join public.academic_skill_registry_versions v on v.id=a.registry_version_id
    where a.alias_normalized in (
      lower(trim(coalesce(v_question.subject,''))),
      lower(trim(coalesce(v_question.subject_name,''))),
      lower(trim(coalesce(v_question.subject_code,'')))
    )
      and a.status='active' and v.status='published'
  ) then
    return new;
  end if;

  select * into v_resolved
  from private.resolve_canonical_skill_pair(
    coalesce(nullif(v_question.subject,''),v_question.subject_name,v_question.subject_code),
    v_grade,new.primary_skill_code,new.atomic_subskill_code
  ) limit 1;

  if not found then
    select * into v_resolved
    from private.resolve_canonical_skill_pair(
      coalesce(nullif(v_question.subject_name,''),v_question.subject_code),
      v_grade,new.primary_skill_code,new.atomic_subskill_code
    ) limit 1;
  end if;

  if not found then
    raise exception using errcode='23514',
      message='school_question_canonical_registry_match_required';
  end if;

  if lower(trim(new.primary_skill_name)) <> lower(trim(v_resolved.skill_name))
     or lower(trim(new.atomic_subskill_name)) <> lower(trim(v_resolved.subskill_name)) then
    raise exception using errcode='23514',
      message='school_question_canonical_registry_name_code_mismatch';
  end if;

  return new;
end;
$function$
;

revoke all on function private.enforce_school_canonical_taxonomy_registry()
from public,anon,authenticated,service_role;

drop trigger if exists trg_enforce_school_english_taxonomy_registry
on public.verified_question_diagnostic_taxonomy;
drop trigger if exists trg_enforce_school_canonical_taxonomy_registry
on public.verified_question_diagnostic_taxonomy;
create trigger trg_enforce_school_canonical_taxonomy_registry
before insert or update of
 primary_skill_code,primary_skill_name,atomic_subskill_code,atomic_subskill_name,
 question_id,review_status
on public.verified_question_diagnostic_taxonomy
for each row
when(new.review_status='approved')
execute function private.enforce_school_canonical_taxonomy_registry();

CREATE OR REPLACE FUNCTION public.rpc_superadmin_govern_school_question(p_question_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_action text := lower(trim(coalesce(p_action, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_rationale text := trim(coalesce(p_payload ->> 'rationale', ''));
  v_question public.questions%rowtype;
  v_submission record;
  v_authority record;
  v_item_id uuid;
  v_mapping_id uuid;
  v_existing_mapping_id uuid;
  v_existing_objective_id uuid;
  v_taxonomy_id uuid;
  v_school_mapping_id uuid;
  v_objective_id uuid;
  v_primary_skill_name text;
  v_atomic_subskill_name text;
  v_primary_skill_code text;
  v_atomic_subskill_code text;
  v_subject_code text;
  v_assessment_process text;
  v_cognitive_process text;
  v_evidence_statement text;
  v_confidence numeric;
  v_decision_id uuid;
  v_school_content_version text;
begin
  if v_actor is null or not public.is_superadmin(v_actor) then
    raise exception using errcode = '42501',
      message = 'platform_superadmin_access_required';
  end if;
  if v_action not in ('approve_school', 'return_teacher', 'retire_school') then
    raise exception using errcode = '22023', message = 'invalid_school_question_governance_action';
  end if;
  if length(v_rationale) not between 20 and 2000 then
    raise exception using errcode = '22023',
      message = 'school_question_governance_rationale_required';
  end if;
  if jsonb_typeof(v_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'governance_payload_object_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_question_id::text, 0));
  select * into v_question
  from public.questions q
  where q.id = p_question_id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'question_not_found';
  end if;

  select
    submission_item_id,submitted_content_hash,taxonomy_proposal,source_index,
    school_id,school_name,school_slug,school_status,
    submission_batch_id as batch_id,submitted_at,source_rights_attested,candidate_origin
  into v_submission
  from private.teacher_question_governance_submissions
  where question_id=p_question_id
  order by submitted_at desc,submission_item_id desc
  limit 1;

  if v_action = 'return_teacher' then
    if v_question.pool_scope <> 'teacher'
       or v_question.verification_status <> 'in_review' then
      raise exception using errcode = '23514',
        message = 'only_in_review_teacher_questions_can_be_returned';
    end if;

    update public.questions
    set pool_scope = 'teacher', owner_school_id = null,
      content_origin = 'teacher', verification_status = 'unverified',
      analytics_eligible = false, is_public = false,
      verified_at = null, verified_by = null,
      verified_by_authority = null, verified_content_hash = null,
      curriculum_review_status = 'draft', curriculum_strand = null,
      curriculum_skill = null, curriculum_subskill = null,
      curriculum_objective = null, updated_at = now()
    where id = p_question_id;

    insert into public.question_pool_governance_decisions(
      question_id, action, from_pool_scope, to_pool_scope, school_id,
      question_content_hash, rationale, decided_by, decided_by_authority,
      decision_snapshot
    ) values (
      p_question_id, v_action, 'teacher', 'teacher', v_submission.school_id,
      v_question.current_content_hash, v_rationale, v_actor,
      'Brains Heist Platform Superadmin',
      jsonb_build_object(
        'result', 'returned_to_teacher',
        'submissionItemId', v_submission.submission_item_id,
        'batchId', v_submission.batch_id,
        'teacherCanEdit', true,
        'academicProfileEligible', false
      )
    ) returning id into v_decision_id;

    return jsonb_build_object(
      'success', true, 'decisionId', v_decision_id,
      'questionId', p_question_id, 'action', v_action,
      'poolScope', 'teacher', 'verificationStatus', 'unverified',
      'academicProfileEligible', false
    );
  end if;

  if v_action = 'retire_school' then
    if v_question.pool_scope <> 'school'
       or v_question.verification_status <> 'verified'
       or v_question.owner_school_id is null then
      raise exception using errcode = '23514',
        message = 'only_active_school_verified_questions_can_be_retired';
    end if;

    update public.questions
    set verification_status = 'retired', analytics_eligible = false,
      is_public = false, is_active = false, updated_at = now()
    where id = p_question_id;

    insert into public.question_pool_governance_decisions(
      question_id, action, from_pool_scope, to_pool_scope, school_id,
      question_content_hash, rationale, decided_by, decided_by_authority,
      decision_snapshot
    ) values (
      p_question_id, v_action, 'school', 'archive', v_question.owner_school_id,
      v_question.verified_content_hash, v_rationale, v_actor,
      'Brains Heist Platform Superadmin',
      jsonb_build_object(
        'result', 'retired', 'previousContentVersion', v_question.content_version,
        'academicProfileEligible', false
      )
    ) returning id into v_decision_id;

    return jsonb_build_object(
      'success', true, 'decisionId', v_decision_id,
      'questionId', p_question_id, 'action', v_action,
      'poolScope', 'archive', 'verificationStatus', 'retired',
      'academicProfileEligible', false
    );
  end if;

  -- approve_school
  if v_question.pool_scope <> 'teacher'
     or v_question.verification_status <> 'in_review'
     or not v_question.is_active then
    raise exception using errcode = '23514',
      message = 'school_approval_requires_active_in_review_teacher_question';
  end if;
  if v_submission.submission_item_id is null then
    raise exception using errcode = '23514',
      message = 'school_approval_requires_teacher_submission';
  end if;
  if v_question.current_content_hash is distinct from v_submission.submitted_content_hash then
    raise exception using errcode = '23514',
      message = 'school_approval_source_snapshot_drift';
  end if;
  if v_submission.school_id is null
     or v_submission.school_status is distinct from 'active' then
    raise exception using errcode = '23514',
      message = 'school_approval_requires_active_origin_school';
  end if;
  if v_submission.candidate_origin = 'ai_generated_from_source'
     and not coalesce(v_submission.source_rights_attested, false) then
    raise exception using errcode = '23514',
      message = 'school_approval_source_rights_attestation_required';
  end if;

  begin
    v_school_mapping_id := nullif(v_payload ->> 'schoolCurriculumMappingId', '')::uuid;
    v_objective_id := nullif(v_payload ->> 'objectiveId', '')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode = '22023',
      message = 'valid_school_curriculum_mapping_and_objective_required';
  end;
  if v_school_mapping_id is null or v_objective_id is null then
    raise exception using errcode = '22023',
      message = 'school_curriculum_mapping_and_objective_required';
  end if;

  select school_mapping.id as school_curriculum_mapping_id,
    school_mapping.school_id, school_mapping.academic_year_id,
    school_mapping.grade_level, school.name as school_name,
    school.slug as school_slug, academic_year.name as academic_year_name,
    academic_subject.id as academic_subject_id,
    academic_subject.code as academic_subject_code,
    academic_subject.name as academic_subject_name,
    framework.id as framework_id, framework.code as framework_code,
    framework.name as framework_name, framework.provider_name,
    version.id as framework_version_id, version.version_code,
    version.display_name as framework_version_name,
    version.content_hash as framework_version_content_hash,
    scope.id as curriculum_scope_id, scope.code as scope_code,
    scope.name as scope_name, objective.id as objective_id,
    objective.code as objective_code, objective.statement as objective_statement,
    node.id as objective_node_id, node.name as objective_node_name,
    parent_node.name as parent_node_name,
    grandparent_node.name as grandparent_node_name
  into v_authority
  from public.school_curriculum_scope_mappings school_mapping
  join public.schools school
    on school.id = school_mapping.school_id and school.status = 'active'
  join public.school_academic_years academic_year
    on academic_year.id = school_mapping.academic_year_id
   and academic_year.school_id = school_mapping.school_id
   and academic_year.status in ('current', 'planned')
  join public.academic_subjects academic_subject
    on academic_subject.id = school_mapping.academic_subject_id
  join public.curriculum_scopes scope
    on scope.id = school_mapping.curriculum_scope_id
   and scope.academic_subject_id = school_mapping.academic_subject_id
  join public.curriculum_framework_versions version
    on version.id = scope.framework_version_id
   and version.status = 'published'
   and version.content_hash ~ '^[0-9a-f]{64}$'
  join public.curriculum_frameworks framework
    on framework.id = version.framework_id
   and framework.is_active
   and (framework.school_id is null or framework.school_id = school_mapping.school_id)
  join public.curriculum_objectives objective
    on objective.id = v_objective_id
   and objective.framework_version_id = version.id
   and objective.curriculum_scope_id = scope.id
   and objective.is_assessable
  join public.curriculum_nodes node on node.id = objective.curriculum_node_id
  left join public.curriculum_nodes parent_node on parent_node.id = node.parent_node_id
  left join public.curriculum_nodes grandparent_node
    on grandparent_node.id = parent_node.parent_node_id
  where school_mapping.id = v_school_mapping_id
    and school_mapping.school_id = v_submission.school_id
    and school_mapping.status = 'active'
    and school_mapping.mapping_quality = 'confirmed'
    and school_mapping.grade_level ~ '^[0-9]+$'
    and school_mapping.grade_level::smallint = any(v_question.eligible_grade_levels)
    and (
      private.teacher_assignment_subject_key(academic_subject.name) =
        private.teacher_assignment_subject_key(v_question.subject)
      or private.teacher_assignment_subject_key(academic_subject.code) =
        private.teacher_assignment_subject_key(v_question.subject)
    );
  if not found then
    raise exception using errcode = '23514',
      message = 'school_curriculum_authority_no_longer_current';
  end if;

  v_primary_skill_name := trim(coalesce(
    v_payload ->> 'primarySkillName',
    v_submission.taxonomy_proposal ->> 'primary_skill_name',
    ''
  ));
  v_atomic_subskill_name := trim(coalesce(
    v_payload ->> 'atomicSubskillName',
    v_submission.taxonomy_proposal ->> 'atomic_subskill_name',
    ''
  ));
  v_assessment_process := upper(trim(coalesce(
    v_payload ->> 'assessmentProcessCode',
    v_submission.taxonomy_proposal ->> 'assessment_process_code',
    ''
  )));
  v_cognitive_process := lower(trim(coalesce(
    v_payload ->> 'cognitiveProcess',
    v_submission.taxonomy_proposal ->> 'cognitive_process',
    ''
  )));
  v_evidence_statement := trim(coalesce(
    v_payload ->> 'evidenceStatement',
    v_submission.taxonomy_proposal ->> 'evidence_statement',
    ''
  ));
  v_confidence := coalesce(
    nullif(v_payload ->> 'confidenceScore', '')::numeric,
    nullif(v_submission.taxonomy_proposal ->> 'confidence_score', '')::numeric,
    0
  );

  if length(v_primary_skill_name) not between 3 and 160
     or length(v_atomic_subskill_name) not between 3 and 200
     or lower(v_primary_skill_name) = lower(v_atomic_subskill_name)
     or length(v_evidence_statement) not between 30 and 500
     or v_confidence < 0.900 or v_confidence > 1 then
    raise exception using errcode = '23514',
      message = 'school_question_diagnostic_taxonomy_requires_human_correction';
  end if;
  if not (
    (v_assessment_process = 'AO1' and v_cognitive_process in ('remember', 'understand'))
    or (v_assessment_process = 'AO2' and v_cognitive_process = 'apply')
    or (v_assessment_process = 'AO3' and v_cognitive_process = 'analyze')
    or (v_assessment_process = 'AO4' and v_cognitive_process = 'evaluate')
  ) then
    raise exception using errcode = '23514',
      message = 'school_question_assessment_objective_cognition_mismatch';
  end if;

  v_subject_code := trim(both '-' from regexp_replace(
    lower(v_authority.academic_subject_code), '[^a-z0-9]+', '-', 'g'
  ));
  v_primary_skill_code := coalesce(
    nullif(trim(v_payload ->> 'primarySkillCode'), ''),
    nullif(trim(v_submission.taxonomy_proposal ->> 'primary_skill_code'), '')
  );
  if v_primary_skill_code is null then
    v_primary_skill_code := v_subject_code || '.' || trim(both '-' from regexp_replace(
      lower(v_primary_skill_name), '[^a-z0-9]+', '-', 'g'
    ));
  end if;
  v_atomic_subskill_code := coalesce(
    nullif(trim(v_payload ->> 'atomicSubskillCode'), ''),
    nullif(trim(v_submission.taxonomy_proposal ->> 'atomic_subskill_code'), '')
  );
  if v_atomic_subskill_code is null then
    v_atomic_subskill_code := v_primary_skill_code || '.' || trim(both '-' from regexp_replace(
      lower(v_atomic_subskill_name), '[^a-z0-9]+', '-', 'g'
    ));
  end if;

  if exists(
    select 1
    from public.academic_skill_registry_subject_aliases a
    join public.academic_skill_registry_versions registry on registry.id=a.registry_version_id
    where a.alias_normalized in (
      lower(trim(coalesce(v_authority.academic_subject_name,''))),
      lower(trim(coalesce(v_authority.academic_subject_code,''))),
      lower(trim(coalesce(v_question.subject,'')))
    )
      and a.status='active' and registry.status='published'
  ) then
    select r.skill_name,r.subskill_name
    into v_primary_skill_name,v_atomic_subskill_name
    from private.resolve_canonical_skill_pair(
      coalesce(nullif(v_authority.academic_subject_name,''),v_question.subject),
      v_authority.grade_level::integer,
      v_primary_skill_code,
      v_atomic_subskill_code
    ) r
    limit 1;

    if not found then
      select r.skill_name,r.subskill_name
      into v_primary_skill_name,v_atomic_subskill_name
      from private.resolve_canonical_skill_pair(
        v_question.subject,
        v_authority.grade_level::integer,
        v_primary_skill_code,
        v_atomic_subskill_code
      ) r
      limit 1;
    end if;

    if not found then
      raise exception using errcode='23514',
        message='school_question_canonical_registry_match_required';
    end if;
  end if;
  if v_primary_skill_code !~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*([.][a-z0-9]+(-[a-z0-9]+)*)+$'
     or v_atomic_subskill_code !~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*([.][a-z0-9]+(-[a-z0-9]+)*)+$'
     or v_atomic_subskill_code not like v_primary_skill_code || '.%' then
    raise exception using errcode = '23514',
      message = 'school_question_taxonomy_codes_invalid';
  end if;

  v_school_content_version := 'school-verified-' ||
    substr(v_question.current_content_hash, 1, 12);

  insert into public.curriculum_assessment_items(
    source_type, school_id, source_record_id, source_item_key,
    source_version, academic_subject_id, grade_level, content_hash,
    source_metadata, is_active, registered_by
  ) values (
    'question_bank', v_authority.school_id, p_question_id::text,
    'question', v_school_content_version,
    v_authority.academic_subject_id, v_authority.grade_level,
    v_question.current_content_hash,
    jsonb_build_object(
      'poolScope', 'school', 'schoolId', v_authority.school_id,
      'schoolName', v_authority.school_name,
      'teacherQuestionBatchId', v_submission.batch_id,
      'teacherQuestionBatchItemId', v_submission.submission_item_id,
      'registeredByAuthority', 'Brains Heist Platform Superadmin'
    ),
    true, v_actor
  )
  on conflict (source_type, source_scope_key, source_record_id, source_item_key)
  do update set
    source_version = excluded.source_version,
    academic_subject_id = excluded.academic_subject_id,
    grade_level = excluded.grade_level,
    content_hash = excluded.content_hash,
    source_metadata = excluded.source_metadata,
    is_active = true,
    retired_at = null,
    updated_at = now()
  returning id into v_item_id;

  update public.curriculum_assessment_items
  set is_active = false, retired_at = coalesce(retired_at, now()), updated_at = now()
  where source_type = 'question_bank'
    and source_record_id = p_question_id::text
    and source_item_key = 'question'
    and school_id = v_authority.school_id
    and id <> v_item_id
    and is_active;

  select mapping.id, mapping.curriculum_objective_id
  into v_existing_mapping_id, v_existing_objective_id
  from public.curriculum_item_objective_mappings mapping
  where mapping.assessment_item_id = v_item_id
    and mapping.curriculum_scope_id = v_authority.curriculum_scope_id
    and mapping.mapping_role = 'primary'
    and mapping.status = 'approved'
    and mapping.superseded_at is null
    and mapping.item_content_hash = v_question.current_content_hash
    and mapping.curriculum_version_content_hash =
      v_authority.framework_version_content_hash
  limit 1;

  if v_existing_mapping_id is not null
     and v_existing_objective_id = v_authority.objective_id then
    v_mapping_id := v_existing_mapping_id;
  else
    if v_existing_mapping_id is not null then
      update public.curriculum_item_objective_mappings
      set status = 'superseded', superseded_at = now(), updated_at = now()
      where id = v_existing_mapping_id;
    end if;

    insert into public.curriculum_item_objective_mappings(
      assessment_item_id, curriculum_objective_id, framework_version_id,
      curriculum_scope_id, academic_subject_id, mapping_role, mapping_method,
      status, confidence_score, rationale, provenance, item_content_hash,
      curriculum_version_content_hash, proposed_by, reviewed_by, approved_by,
      reviewed_at, approved_at, supersedes_mapping_id,
      reviewed_by_authority, approved_by_authority
    ) values (
      v_item_id, v_authority.objective_id, v_authority.framework_version_id,
      v_authority.curriculum_scope_id, v_authority.academic_subject_id,
      'primary', 'manual', 'approved', v_confidence, v_rationale,
      jsonb_build_object(
        'schoolCurriculumMappingId', v_authority.school_curriculum_mapping_id,
        'schoolId', v_authority.school_id,
        'academicYearId', v_authority.academic_year_id,
        'teacherSubmissionItemId', v_submission.submission_item_id,
        'humanDecision', true
      ),
      v_question.current_content_hash, v_authority.framework_version_content_hash,
      null, v_actor, v_actor, now(), now(), v_existing_mapping_id,
      'Brains Heist Platform Superadmin', 'Brains Heist Platform Superadmin'
    ) returning id into v_mapping_id;
  end if;

  update public.questions
  set pool_scope = 'school', owner_school_id = v_authority.school_id,
    content_origin = 'teacher', verification_status = 'verified',
    analytics_eligible = true, is_public = false, is_active = true,
    verified_at = now(), verified_by = v_actor,
    verified_by_authority = 'Brains Heist Platform Superadmin · School Verified',
    verified_content_hash = v_question.current_content_hash,
    academic_subject_id = v_authority.academic_subject_id,
    curriculum_strand = coalesce(v_authority.grandparent_node_name,
      v_authority.parent_node_name, v_authority.objective_node_name),
    curriculum_skill = coalesce(v_authority.parent_node_name,
      v_authority.objective_node_name),
    curriculum_subskill = v_authority.objective_node_name,
    curriculum_objective = v_authority.objective_statement,
    eligible_grade_levels = array[v_authority.grade_level::smallint],
    grade_level = v_authority.grade_level,
    curriculum_review_status = 'approved',
    content_version = v_school_content_version,
    updated_at = now()
  where id = p_question_id;

  insert into public.verified_question_diagnostic_taxonomy(
    question_id, assessment_item_id, curriculum_mapping_id,
    question_content_hash, scope_code, objective_code, package_version,
    taxonomy_version, primary_skill_code, primary_skill_name,
    atomic_subskill_code, atomic_subskill_name, assessment_process_code,
    cognitive_process, evidence_statement, secondary_skill_codes,
    confidence_score, review_status, human_review_required, review_reason,
    reviewed_by_authority, taxonomy_hash
  ) values (
    p_question_id, v_item_id, v_mapping_id, v_question.current_content_hash,
    v_authority.scope_code, v_authority.objective_code,
    'school-governance-2026.1',
    v_school_content_version,
    v_primary_skill_code, v_primary_skill_name,
    v_atomic_subskill_code, v_atomic_subskill_name,
    v_assessment_process, v_cognitive_process, v_evidence_statement,
    '{}'::text[], v_confidence, 'approved', false, v_rationale,
    'Brains Heist Platform Superadmin', ''
  ) returning id into v_taxonomy_id;

  insert into public.question_pool_governance_decisions(
    question_id, action, from_pool_scope, to_pool_scope, school_id,
    school_curriculum_mapping_id, curriculum_mapping_id,
    diagnostic_taxonomy_id, question_content_hash, rationale, decided_by,
    decided_by_authority, decision_snapshot
  ) values (
    p_question_id, v_action, 'teacher', 'school', v_authority.school_id,
    v_authority.school_curriculum_mapping_id, v_mapping_id, v_taxonomy_id,
    v_question.current_content_hash, v_rationale, v_actor,
    'Brains Heist Platform Superadmin',
    jsonb_build_object(
      'result', 'school_verified',
      'school', jsonb_build_object('id', v_authority.school_id,
        'name', v_authority.school_name),
      'curriculum', jsonb_build_object(
        'frameworkId', v_authority.framework_id,
        'frameworkCode', v_authority.framework_code,
        'frameworkName', v_authority.framework_name,
        'frameworkVersionId', v_authority.framework_version_id,
        'frameworkVersionCode', v_authority.version_code,
        'frameworkVersionName', v_authority.framework_version_name,
        'academicYearId', v_authority.academic_year_id,
        'academicYearName', v_authority.academic_year_name,
        'gradeLevel', v_authority.grade_level,
        'academicSubjectId', v_authority.academic_subject_id,
        'academicSubjectName', v_authority.academic_subject_name,
        'scopeId', v_authority.curriculum_scope_id,
        'scopeCode', v_authority.scope_code,
        'scopeName', v_authority.scope_name,
        'objectiveId', v_authority.objective_id,
        'objectiveCode', v_authority.objective_code,
        'objectiveStatement', v_authority.objective_statement
      ),
      'diagnosticTaxonomy', jsonb_build_object(
        'primarySkillCode', v_primary_skill_code,
        'primarySkillName', v_primary_skill_name,
        'atomicSubskillCode', v_atomic_subskill_code,
        'atomicSubskillName', v_atomic_subskill_name,
        'assessmentProcessCode', v_assessment_process,
        'cognitiveProcess', v_cognitive_process,
        'evidenceStatement', v_evidence_statement,
        'confidenceScore', v_confidence
      ),
      'teacherQuestionBatchId', v_submission.batch_id,
      'teacherQuestionBatchItemId', v_submission.submission_item_id,
      'academicProfileEligible', true
    )
  ) returning id into v_decision_id;

  return jsonb_build_object(
    'success', true, 'decisionId', v_decision_id,
    'questionId', p_question_id, 'action', v_action,
    'poolScope', 'school', 'verificationStatus', 'verified',
    'ownerSchoolId', v_authority.school_id,
    'ownerSchoolName', v_authority.school_name,
    'curriculumMappingId', v_mapping_id,
    'diagnosticTaxonomyId', v_taxonomy_id,
    'academicProfileEligible', true
  );
end;
$function$
;

revoke all on function public.rpc_superadmin_govern_school_question(uuid,text,jsonb)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_superadmin_govern_school_question(uuid,text,jsonb)
to authenticated,service_role;
