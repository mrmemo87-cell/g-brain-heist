-- Manual teacher questions can be submitted into the same governed School Verified
-- path as PDF/batch questions without fabricating PDF provenance.

create table if not exists public.teacher_question_manual_submissions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete restrict,
  teacher_id uuid not null references public.teachers(id) on delete restrict,
  teacher_user_id uuid not null references auth.users(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  submitted_content_hash text not null check (submitted_content_hash ~ '^[0-9a-f]{64}$'),
  question_snapshot jsonb not null check (jsonb_typeof(question_snapshot)='object'),
  taxonomy_proposal jsonb not null check (jsonb_typeof(taxonomy_proposal)='object'),
  submitted_at timestamptz not null default now()
);

create index if not exists teacher_question_manual_submissions_question_idx
  on public.teacher_question_manual_submissions(question_id,submitted_at desc);
create index if not exists teacher_question_manual_submissions_teacher_idx
  on public.teacher_question_manual_submissions(teacher_id,submitted_at desc);

alter table public.teacher_question_manual_submissions enable row level security;
revoke all on public.teacher_question_manual_submissions from public,anon,authenticated,service_role;
grant select on public.teacher_question_manual_submissions to service_role;

CREATE OR REPLACE FUNCTION private.reject_teacher_question_manual_submission_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  raise exception using errcode='55000',
    message='teacher_question_manual_submissions_are_append_only';
end;
$function$
;

drop trigger if exists trg_teacher_question_manual_submissions_immutable
on public.teacher_question_manual_submissions;
create trigger trg_teacher_question_manual_submissions_immutable
before update or delete on public.teacher_question_manual_submissions
for each row execute function private.reject_teacher_question_manual_submission_mutation();

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
  v_phase text;
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
  v_phase:=case
    when v_grade between 1 and 6 then 'primary'
    when v_grade between 7 and 9 then 'lower_secondary'
    when v_grade between 10 and 12 then 'upper_secondary'
    else null
  end;
  if v_phase is null then
    raise exception using errcode='23514',message='manual_question_grade_not_supported';
  end if;

  if private.teacher_assignment_subject_key(v_question.subject)
     not in ('english','esl','english as a second language') then
    raise exception using errcode='23514',
      message='manual_question_registry_not_available_for_subject';
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

  select registry.code,skill.name,leaf.name
  into v_registry_version,v_primary_skill_name,v_atomic_subskill_name
  from public.academic_skill_registry_versions registry
  join public.academic_skill_registry_nodes skill
    on skill.registry_version_id=registry.id
   and skill.code=trim(p_primary_skill_code)
   and skill.node_type='skill'
   and skill.status='active'
  join public.academic_skill_registry_nodes leaf
    on leaf.registry_version_id=registry.id
   and leaf.parent_id=skill.id
   and leaf.code=trim(p_atomic_subskill_code)
   and leaf.node_type='subskill'
   and leaf.status='active'
  where registry.code='bh-english-core-v1'
    and registry.status='published'
    and v_phase=any(skill.applicable_phases)
    and v_phase=any(leaf.applicable_phases)
  limit 1;

  if not found then
    raise exception using errcode='23514',
      message='manual_question_canonical_registry_match_required';
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
    'review_reason','Teacher selected a canonical Brains Heist skill and subskill. Curriculum objective, assessment process and evidence statement require human governance.'
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

create or replace view private.teacher_question_governance_submissions as
 SELECT item.question_id,
    item.id AS submission_item_id,
    'batch'::text AS submission_kind,
    item.submitted_content_hash,
    item.taxonomy_proposal,
    item.source_index,
    COALESCE(batch.school_id, teacher_user.school_id, membership.school_id) AS school_id,
    school.name AS school_name,
    school.slug AS school_slug,
    school.status AS school_status,
    batch.id AS submission_batch_id,
    batch.status AS submission_status,
    batch.submitted_at,
    item.source_page,
    extraction.source_file_name,
    extraction.extraction_model,
    item.extraction_confidence,
    item.needs_human_attention,
    extraction.processing_mode,
    extraction.detected_document_type,
    extraction.extraction_payload -> 'document_type_confidence'::text AS document_type_confidence,
    extraction.source_rights_attested,
    extraction.processing_request,
    COALESCE(candidate.payload ->> 'candidate_origin'::text, 'source_question'::text) AS candidate_origin,
    candidate.payload ->> 'source_grounding_note'::text AS source_grounding_note,
    COALESCE(candidate.payload ->> 'source_evidence_kind'::text, 'text'::text) AS source_evidence_kind,
    candidate.payload ->> 'source_visual_description'::text AS source_visual_description,
    candidate.payload -> 'grounding_confidence'::text AS grounding_confidence,
    candidate.payload ->> 'learning_objective'::text AS learning_objective
   FROM teacher_question_batch_items item
     JOIN teacher_question_batches batch ON batch.id = item.batch_id
     JOIN teacher_question_pdf_extractions extraction ON extraction.id = batch.extraction_id
     JOIN teachers teacher ON teacher.id = batch.teacher_id
     JOIN users teacher_user ON teacher_user.id = teacher.user_id
     LEFT JOIN LATERAL ( SELECT sm.school_id
           FROM school_members sm
          WHERE sm.user_id = teacher.user_id AND sm.status = 'active'::text
          ORDER BY sm.joined_at DESC NULLS LAST, sm.id
         LIMIT 1) membership ON true
     LEFT JOIN schools school ON school.id = COALESCE(batch.school_id, teacher_user.school_id, membership.school_id)
     LEFT JOIN LATERAL ( SELECT secured.payload
           FROM jsonb_array_elements(COALESCE(extraction.extraction_payload -> 'questions'::text, '[]'::jsonb)) secured(payload)
          WHERE (secured.payload ->> 'source_index'::text) = item.source_index::text
         LIMIT 1) candidate ON true
UNION ALL
 SELECT manual.question_id,
    manual.id AS submission_item_id,
    'manual'::text AS submission_kind,
    manual.submitted_content_hash,
    manual.taxonomy_proposal,
    NULL::integer AS source_index,
    manual.school_id,
    school.name AS school_name,
    school.slug AS school_slug,
    school.status AS school_status,
    NULL::uuid AS submission_batch_id,
    'in_review'::text AS submission_status,
    manual.submitted_at,
    NULL::integer AS source_page,
    NULL::text AS source_file_name,
    NULL::text AS extraction_model,
    1.000 AS extraction_confidence,
    true AS needs_human_attention,
    'manual'::text AS processing_mode,
    'manual_teacher_entry'::text AS detected_document_type,
    to_jsonb(1.0) AS document_type_confidence,
    false AS source_rights_attested,
    jsonb_build_object('manualTeacherEntry', true) AS processing_request,
    'manual_teacher'::text AS candidate_origin,
    NULL::text AS source_grounding_note,
    'manual'::text AS source_evidence_kind,
    NULL::text AS source_visual_description,
    NULL::jsonb AS grounding_confidence,
    NULL::text AS learning_objective
   FROM teacher_question_manual_submissions manual
     JOIN schools school ON school.id = manual.school_id;;

revoke all on private.teacher_question_governance_submissions from public,anon,authenticated,service_role;

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

  if lower(trim(coalesce(v_authority.academic_subject_code, ''))) = 'english'
     or lower(trim(coalesce(v_authority.academic_subject_name, ''))) = 'english' then
    select skill.name, leaf.name
    into v_primary_skill_name, v_atomic_subskill_name
    from public.academic_skill_registry_versions registry
    join public.academic_skill_registry_nodes skill
      on skill.registry_version_id=registry.id
     and skill.code=v_primary_skill_code
     and skill.node_type='skill'
     and skill.status='active'
    join public.academic_skill_registry_nodes leaf
      on leaf.registry_version_id=registry.id
     and leaf.parent_id=skill.id
     and leaf.code=v_atomic_subskill_code
     and leaf.node_type='subskill'
     and leaf.status='active'
    where registry.code='bh-english-core-v1'
      and registry.status='published'
      and (
        case
          when v_authority.grade_level::integer between 1 and 6 then 'primary'
          when v_authority.grade_level::integer between 7 and 9 then 'lower_secondary'
          else 'upper_secondary'
        end
      )=any(skill.applicable_phases)
      and (
        case
          when v_authority.grade_level::integer between 1 and 6 then 'primary'
          when v_authority.grade_level::integer between 7 and 9 then 'lower_secondary'
          else 'upper_secondary'
        end
      )=any(leaf.applicable_phases)
    limit 1;

    if not found then
      raise exception using errcode='23514',
        message='school_question_english_registry_match_required';
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

CREATE OR REPLACE FUNCTION public.rpc_superadmin_school_question_curriculum_options(p_question_id uuid, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 300)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_question public.questions%rowtype;
  v_submission record;
  v_search text := nullif(trim(p_search), '');
  v_limit integer := least(greatest(coalesce(p_limit, 300), 1), 500);
  v_options jsonb;
begin
  if v_actor is null or not public.is_superadmin(v_actor) then
    raise exception using errcode = '42501',
      message = 'platform_superadmin_access_required';
  end if;

  select * into v_question
  from public.questions q where q.id = p_question_id;
  if not found then
    raise exception using errcode = '22023', message = 'question_not_found';
  end if;

  select
    submission_item_id,submitted_content_hash,school_id,school_name,school_status,
    submitted_at,source_rights_attested,candidate_origin
  into v_submission
  from private.teacher_question_governance_submissions
  where question_id=p_question_id
  order by submitted_at desc,submission_item_id desc
  limit 1;

  if v_submission.submission_item_id is null then
    return jsonb_build_object(
      'success', true,
      'questionId', p_question_id,
      'approvalEligible', false,
      'blockedReason', 'A governed teacher submission is required before school verification.',
      'options', '[]'::jsonb
    );
  end if;

  if v_question.pool_scope <> 'teacher'
     or v_question.verification_status <> 'in_review'
     or v_question.current_content_hash is distinct from v_submission.submitted_content_hash then
    return jsonb_build_object(
      'success', true,
      'questionId', p_question_id,
      'school', jsonb_build_object('id', v_submission.school_id, 'name', v_submission.school_name),
      'approvalEligible', false,
      'blockedReason', case
        when v_question.pool_scope <> 'teacher' then 'This question is no longer in the Teacher Pool.'
        when v_question.verification_status <> 'in_review' then 'This question is not awaiting governance review.'
        else 'The teacher question no longer matches its frozen submission snapshot.'
      end,
      'options', '[]'::jsonb
    );
  end if;

  if v_submission.school_id is null then
    return jsonb_build_object(
      'success', true,
      'questionId', p_question_id,
      'approvalEligible', false,
      'blockedReason', 'The teacher submission is not linked to a school.',
      'options', '[]'::jsonb
    );
  end if;

  if v_submission.school_status is distinct from 'active' then
    return jsonb_build_object(
      'success', true,
      'questionId', p_question_id,
      'school', jsonb_build_object('id', v_submission.school_id, 'name', v_submission.school_name),
      'approvalEligible', false,
      'blockedReason', 'The teacher submission school is not active.',
      'options', '[]'::jsonb
    );
  end if;

  if v_submission.candidate_origin = 'ai_generated_from_source'
     and not coalesce(v_submission.source_rights_attested, false) then
    return jsonb_build_object(
      'success', true,
      'questionId', p_question_id,
      'school', jsonb_build_object('id', v_submission.school_id, 'name', v_submission.school_name),
      'approvalEligible', false,
      'blockedReason', 'Source-generation rights must be attested before an AI-created question can be verified.',
      'options', '[]'::jsonb
    );
  end if;

  select coalesce(jsonb_agg(option_row.payload order by option_row.sort_current,
    option_row.framework_name, option_row.version_name, option_row.grade_level,
    option_row.scope_name, option_row.objective_code), '[]'::jsonb)
  into v_options
  from (
    select (academic_year.status <> 'current') as sort_current,
      framework.name as framework_name,
      version.display_name as version_name,
      school_mapping.grade_level,
      scope.name as scope_name,
      objective.code as objective_code,
      jsonb_build_object(
        'schoolCurriculumMappingId', school_mapping.id,
        'schoolId', school_mapping.school_id,
        'schoolName', v_submission.school_name,
        'academicYearId', academic_year.id,
        'academicYearName', academic_year.name,
        'academicYearStatus', academic_year.status,
        'gradeLevel', school_mapping.grade_level,
        'academicSubjectId', academic_subject.id,
        'academicSubjectName', academic_subject.name,
        'frameworkId', framework.id,
        'frameworkCode', framework.code,
        'frameworkName', framework.name,
        'frameworkProvider', framework.provider_name,
        'frameworkVersionId', version.id,
        'frameworkVersionCode', version.version_code,
        'frameworkVersionName', version.display_name,
        'scopeId', scope.id,
        'scopeCode', scope.code,
        'scopeName', scope.name,
        'objectiveId', objective.id,
        'objectiveCode', objective.code,
        'objectiveStatement', objective.statement,
        'mappingQuality', school_mapping.mapping_quality,
        'label', concat_ws(' · ', framework.name, version.display_name,
          academic_year.name, 'Grade ' || school_mapping.grade_level,
          academic_subject.name, scope.name, objective.code)
      ) as payload
    from public.school_curriculum_scope_mappings school_mapping
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
      on objective.framework_version_id = version.id
     and objective.curriculum_scope_id = scope.id
     and objective.is_assessable
    where school_mapping.school_id = v_submission.school_id
      and school_mapping.status = 'active'
      and school_mapping.mapping_quality = 'confirmed'
      and school_mapping.grade_level ~ '^[0-9]+$'
      and school_mapping.grade_level::smallint = any(v_question.eligible_grade_levels)
      and (
        private.teacher_assignment_subject_key(academic_subject.name) =
          private.teacher_assignment_subject_key(v_question.subject)
        or private.teacher_assignment_subject_key(academic_subject.code) =
          private.teacher_assignment_subject_key(v_question.subject)
      )
      and (
        v_search is null
        or concat_ws(' ', framework.name, framework.code, version.display_name,
          version.version_code, academic_year.name, school_mapping.grade_level,
          academic_subject.name, scope.name, scope.code, objective.code,
          objective.statement) ilike '%' || v_search || '%'
      )
    order by (academic_year.status <> 'current'), framework.name,
      version.display_name, school_mapping.grade_level, scope.name,
      objective.sequence_number, objective.code
    limit v_limit
  ) option_row;

  return jsonb_build_object(
    'success', true,
    'questionId', p_question_id,
    'school', jsonb_build_object('id', v_submission.school_id, 'name', v_submission.school_name),
    'approvalEligible', jsonb_array_length(v_options) > 0,
    'blockedReason', case when jsonb_array_length(v_options) = 0
      then 'No confirmed school curriculum objective matches this question subject and suggested grade.'
      else null end,
    'sourceSnapshotCurrent', true,
    'options', v_options
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_superadmin_question_bank_inspector_v3(p_pool text DEFAULT 'verified'::text, p_search text DEFAULT NULL::text, p_subject text DEFAULT NULL::text, p_school_id uuid DEFAULT NULL::uuid, p_status text DEFAULT 'all'::text, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_pool text := lower(coalesce(nullif(trim(p_pool), ''), 'verified'));
  v_search text := nullif(trim(p_search), '');
  v_subject text := nullif(trim(p_subject), '');
  v_status text := lower(coalesce(nullif(trim(p_status), ''), 'all'));
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_superadmin(auth.uid()) then
    raise exception using errcode = '42501',
      message = 'platform_superadmin_access_required';
  end if;
  if v_pool not in ('verified', 'school', 'teacher', 'archive') then
    raise exception using errcode = '22023', message = 'invalid_question_pool';
  end if;
  if v_status not in (
    'all', 'active', 'inactive', 'visual', 'needs_attention',
    'high_usage', 'in_review'
  ) then
    raise exception using errcode = '22023',
      message = 'invalid_question_status_filter';
  end if;

  with base_source as materialized (
    select q.*,
      case
        when q.pool_scope = 'global' and q.verification_status = 'verified'
          then 'verified'
        when q.pool_scope = 'school' and q.verification_status = 'verified'
          then 'school'
        when q.pool_scope = 'teacher' then 'teacher'
        else 'archive'
      end as pool_key,
      teacher.user_id as teacher_user_id,
      teacher.verified as teacher_verified,
      coalesce(nullif(teacher_user.full_name, ''),
        nullif(teacher_user.username, ''), 'Unlinked teacher record') as teacher_name,
      teacher_user.avatar_url as teacher_avatar_url,
      coalesce(q.owner_school_id, teacher_user.school_id, membership.school_id)
        as resolved_school_id,
      coalesce(nullif(school.name, ''), nullif(teacher.school_name, ''),
        nullif(teacher_user.school, ''), 'Independent / school unavailable')
        as school_name,
      school.logo_url as school_logo_url,
      school.status as school_status,
      (teacher.id is not null and teacher_user.id is not null) as profile_linked,
      submission.submission_item_id,
      submission.submission_batch_id,
      submission.submission_status,
      submission.submitted_at,
      submission.source_page,
      submission.taxonomy_proposal,
      submission.extraction_confidence,
      submission.needs_human_attention as submission_needs_human_attention,
      submission.submitted_content_hash,
      submission.source_file_name,
      submission.extraction_model,
      submission.processing_mode,
      submission.detected_document_type,
      submission.document_type_confidence,
      submission.source_rights_attested,
      submission.processing_request,
      submission.candidate_origin,
      submission.source_grounding_note,
      submission.source_evidence_kind,
      submission.source_visual_description,
      submission.grounding_confidence,
      submission.learning_objective,
      curriculum.curriculum_mapping_id,
      curriculum.school_curriculum_mapping_id,
      curriculum.framework_id,
      curriculum.framework_code,
      curriculum.framework_name,
      curriculum.framework_provider,
      curriculum.framework_version_id,
      curriculum.framework_version_code,
      curriculum.framework_version_name,
      curriculum.academic_year_id as curriculum_academic_year_id,
      curriculum.academic_year_name as curriculum_academic_year_name,
      curriculum.grade_level as curriculum_grade_level,
      curriculum.academic_subject_id as curriculum_academic_subject_id,
      curriculum.academic_subject_name as curriculum_academic_subject_name,
      curriculum.scope_id,
      curriculum.scope_code,
      curriculum.scope_name,
      curriculum.objective_id,
      curriculum.objective_code,
      curriculum.objective_statement,
      governance.id as governance_decision_id,
      governance.action as governance_action,
      governance.rationale as governance_rationale,
      governance.decided_by_authority as governance_authority,
      governance.created_at as governance_decided_at,
      governance.decision_snapshot as governance_snapshot,
      round(
        case when coalesce(q.times_answered, 0) > 0
          then (100.0 * coalesce(q.times_correct, 0) / q.times_answered)
          else null end,
        1
      ) as accuracy_percent
    from public.questions q
    left join public.teachers teacher on teacher.id = q.teacher_id
    left join public.users teacher_user on teacher_user.id = teacher.user_id
    left join lateral (
      select sm.school_id
      from public.school_members sm
      where sm.user_id = teacher.user_id and sm.status = 'active'
      order by case sm.role_in_school
        when 'teacher' then 0 when 'school_admin' then 1 else 2 end,
        sm.joined_at desc
      limit 1
    ) membership on true
    left join public.schools school
      on school.id = coalesce(q.owner_school_id, teacher_user.school_id,
        membership.school_id)
    left join lateral (
      select
        submission_item_id,
        submission_batch_id,
        submission_status,
        submitted_at,
        source_page,
        taxonomy_proposal,
        extraction_confidence,
        needs_human_attention,
        submitted_content_hash,
        source_file_name,
        extraction_model,
        processing_mode,
        detected_document_type,
        document_type_confidence,
        source_rights_attested,
        processing_request,
        candidate_origin,
        source_grounding_note,
        source_evidence_kind,
        source_visual_description,
        grounding_confidence,
        learning_objective
      from private.teacher_question_governance_submissions
      where question_id=q.id
      order by submitted_at desc,submission_item_id desc
      limit 1
    ) submission on true
    left join lateral (
      select mapping.id as curriculum_mapping_id,
        school_mapping.id as school_curriculum_mapping_id,
        framework.id as framework_id,
        framework.code as framework_code,
        framework.name as framework_name,
        framework.provider_name as framework_provider,
        version.id as framework_version_id,
        version.version_code as framework_version_code,
        version.display_name as framework_version_name,
        academic_year.id as academic_year_id,
        academic_year.name as academic_year_name,
        coalesce(school_mapping.grade_level, assessment_item.grade_level)
          as grade_level,
        academic_subject.id as academic_subject_id,
        academic_subject.name as academic_subject_name,
        scope.id as scope_id,
        scope.code as scope_code,
        scope.name as scope_name,
        objective.id as objective_id,
        objective.code as objective_code,
        objective.statement as objective_statement
      from public.curriculum_assessment_items assessment_item
      join public.curriculum_item_objective_mappings mapping
        on mapping.assessment_item_id = assessment_item.id
       and mapping.status = 'approved'
       and mapping.mapping_role = 'primary'
       and mapping.superseded_at is null
       and mapping.item_content_hash = assessment_item.content_hash
      join public.curriculum_framework_versions version
        on version.id = mapping.framework_version_id
       and version.status in ('published', 'retired')
       and version.content_hash = mapping.curriculum_version_content_hash
      join public.curriculum_frameworks framework
        on framework.id = version.framework_id
      join public.curriculum_scopes scope
        on scope.id = mapping.curriculum_scope_id
      join public.curriculum_objectives objective
        on objective.id = mapping.curriculum_objective_id
      join public.academic_subjects academic_subject
        on academic_subject.id = mapping.academic_subject_id
      left join public.school_curriculum_scope_mappings school_mapping
        on q.pool_scope = 'school'
       and school_mapping.school_id = q.owner_school_id
       and school_mapping.curriculum_scope_id = mapping.curriculum_scope_id
       and school_mapping.academic_subject_id = mapping.academic_subject_id
       and school_mapping.grade_level = assessment_item.grade_level
       and school_mapping.status = 'active'
      left join public.school_academic_years academic_year
        on academic_year.id = school_mapping.academic_year_id
      where assessment_item.source_type = 'question_bank'
        and assessment_item.source_record_id = q.id::text
        and assessment_item.source_item_key = 'question'
        and assessment_item.is_active
        and assessment_item.content_hash = q.verified_content_hash
        and (
          (q.pool_scope = 'global' and assessment_item.school_id is null)
          or (q.pool_scope = 'school'
            and assessment_item.school_id = q.owner_school_id)
        )
      order by (academic_year.status = 'current') desc nulls last,
        mapping.approved_at desc nulls last, mapping.id
      limit 1
    ) curriculum on true
    left join lateral (
      select decision.*
      from public.question_pool_governance_decisions decision
      where decision.question_id = q.id
      order by decision.created_at desc, decision.id desc
      limit 1
    ) governance on true
  ),
  base as materialized (
    select source.*,
      case
        when source.pool_scope = 'global'
          and source.verification_status = 'verified'
          and source.current_content_hash = source.verified_content_hash
          and source.analytics_eligible and source.is_public and source.is_active
          and source.curriculum_mapping_id is not null then 'sealed'
        when source.pool_scope = 'school'
          and source.verification_status = 'verified'
          and source.current_content_hash = source.verified_content_hash
          and source.analytics_eligible and not source.is_public and source.is_active
          and source.owner_school_id is not null
          and source.curriculum_mapping_id is not null then 'school'
        when source.pool_scope in ('global', 'school')
          and source.verification_status = 'verified' then 'drift'
        when source.pool_scope = 'teacher'
          and source.verification_status = 'in_review' then 'review'
        when source.pool_scope = 'teacher' then 'classroom'
        else 'retired'
      end as integrity_state,
      case
        when source.pool_scope = 'global'
          and source.verification_status = 'verified' then
            source.current_content_hash is null
            or source.verified_content_hash is null
            or source.current_content_hash <> source.verified_content_hash
            or not coalesce(source.analytics_eligible, false)
            or not coalesce(source.is_active, false)
            or not coalesce(source.is_public, false)
            or source.curriculum_mapping_id is null
        when source.pool_scope = 'school'
          and source.verification_status = 'verified' then
            source.current_content_hash is null
            or source.verified_content_hash is null
            or source.current_content_hash <> source.verified_content_hash
            or not coalesce(source.analytics_eligible, false)
            or not coalesce(source.is_active, false)
            or coalesce(source.is_public, false)
            or source.owner_school_id is null
            or source.curriculum_mapping_id is null
            or source.school_curriculum_mapping_id is null
        when source.pool_scope = 'teacher' then
            source.verification_status = 'in_review'
            or (source.submission_item_id is not null
              and source.submitted_content_hash is distinct from source.current_content_hash)
            or source.teacher_id is null
            or source.teacher_user_id is null
            or source.resolved_school_id is null
            or not coalesce(source.is_active, false)
            or length(trim(coalesce(source.question_text, ''))) < 10
            or length(trim(coalesce(source.correct_answer, ''))) < 1
        else true
      end as needs_attention
    from base_source source
  ),
  selected as materialized (
    select * from base where pool_key = v_pool
  ),
  filtered as materialized (
    select *
    from selected row_data
    where (v_subject is null or lower(row_data.subject) = lower(v_subject))
      and (p_school_id is null or row_data.resolved_school_id = p_school_id)
      and (
        v_search is null
        or concat_ws(' ', row_data.question_text, row_data.correct_answer,
          row_data.subject, row_data.topic, row_data.topic_name,
          row_data.teacher_name, row_data.school_name,
          row_data.verified_external_id, row_data.content_version,
          row_data.curriculum_skill, row_data.curriculum_objective,
          row_data.framework_name, row_data.framework_version_name,
          row_data.curriculum_academic_year_name, row_data.scope_name,
          row_data.objective_code, row_data.objective_statement,
          row_data.taxonomy_proposal ->> 'primary_skill_name',
          row_data.taxonomy_proposal ->> 'atomic_subskill_name',
          row_data.taxonomy_proposal ->> 'assessment_process_code'
        ) ilike '%' || v_search || '%'
      )
      and (
        v_status = 'all'
        or (v_status = 'active' and row_data.is_active)
        or (v_status = 'inactive' and not row_data.is_active)
        or (v_status = 'visual' and row_data.image_url is not null)
        or (v_status = 'needs_attention' and row_data.needs_attention)
        or (v_status = 'high_usage' and coalesce(row_data.times_answered, 0) >= 20)
        or (v_status = 'in_review' and row_data.verification_status = 'in_review')
      )
  )
  select jsonb_build_object(
    'success', true,
    'summary', (
      select jsonb_build_object(
        'totalQuestions', count(*),
        'verifiedQuestions', count(*) filter (where pool_key = 'verified'),
        'schoolQuestions', count(*) filter (where pool_key = 'school'),
        'teacherQuestions', count(*) filter (where pool_key = 'teacher'),
        'archivedQuestions', count(*) filter (where pool_key = 'archive'),
        'visualQuestions', count(*) filter (where image_url is not null),
        'teacherAuthors', count(distinct teacher_id)
          filter (where pool_key = 'teacher'),
        'teacherSchools', count(distinct resolved_school_id)
          filter (where pool_key = 'teacher'),
        'schoolPoolSchools', count(distinct owner_school_id)
          filter (where pool_key = 'school'),
        'needsAttention', count(*) filter (where needs_attention),
        'inReviewQuestions', count(*)
          filter (where pool_key = 'teacher' and verification_status = 'in_review')
      ) from base
    ),
    'filters', jsonb_build_object(
      'subjects', coalesce((
        select jsonb_agg(jsonb_build_object('name', subject, 'count', question_count)
          order by subject)
        from (
          select subject, count(*) as question_count
          from selected group by subject
        ) subject_counts
      ), '[]'::jsonb),
      'schools', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', resolved_school_id, 'name', school_name, 'count', question_count
        ) order by school_name)
        from (
          select resolved_school_id, school_name, count(*) as question_count
          from selected where resolved_school_id is not null
          group by resolved_school_id, school_name
        ) school_counts
      ), '[]'::jsonb)
    ),
    'pool', v_pool,
    'total', (select count(*) from filtered),
    'limit', v_limit,
    'offset', v_offset,
    'questions', coalesce((
      select jsonb_agg(page.payload
        order by page.needs_attention desc, page.created_at desc, page.id)
      from (
        select row_data.id, row_data.created_at, row_data.needs_attention,
          jsonb_strip_nulls(jsonb_build_object(
            'id', row_data.id,
            'pool', row_data.pool_key,
            'poolScope', row_data.pool_scope,
            'ownerSchoolId', row_data.owner_school_id,
            'subject', row_data.subject,
            'topic', coalesce(nullif(row_data.topic_name, ''),
              nullif(row_data.topic, ''), 'General'),
            'difficulty', row_data.difficulty,
            'questionText', row_data.question_text,
            'questionType', row_data.question_type,
            'options', row_data.options,
            'correctAnswer', row_data.correct_answer,
            'explanation', row_data.explanation,
            'imageUrl', row_data.image_url,
            'imageAltText', row_data.image_alt_text,
            'gradeLevel', row_data.grade_level,
            'eligibleGradeLevels', to_jsonb(row_data.eligible_grade_levels),
            'curriculum', jsonb_strip_nulls(jsonb_build_object(
              'strand', row_data.curriculum_strand,
              'skill', row_data.curriculum_skill,
              'subskill', row_data.curriculum_subskill,
              'objective', row_data.curriculum_objective,
              'reviewStatus', row_data.curriculum_review_status
            )),
            'curriculumAuthority', case when row_data.curriculum_mapping_id is not null
              then jsonb_strip_nulls(jsonb_build_object(
                'curriculumMappingId', row_data.curriculum_mapping_id,
                'schoolCurriculumMappingId', row_data.school_curriculum_mapping_id,
                'frameworkId', row_data.framework_id,
                'frameworkCode', row_data.framework_code,
                'frameworkName', row_data.framework_name,
                'frameworkProvider', row_data.framework_provider,
                'frameworkVersionId', row_data.framework_version_id,
                'frameworkVersionCode', row_data.framework_version_code,
                'frameworkVersionName', row_data.framework_version_name,
                'academicYearId', row_data.curriculum_academic_year_id,
                'academicYearName', row_data.curriculum_academic_year_name,
                'gradeLevel', row_data.curriculum_grade_level,
                'academicSubjectId', row_data.curriculum_academic_subject_id,
                'academicSubjectName', row_data.curriculum_academic_subject_name,
                'scopeId', row_data.scope_id,
                'scopeCode', row_data.scope_code,
                'scopeName', row_data.scope_name,
                'objectiveId', row_data.objective_id,
                'objectiveCode', row_data.objective_code,
                'objectiveStatement', row_data.objective_statement
              )) else null end,
            'verificationStatus', row_data.verification_status,
            'analyticsEligible', row_data.analytics_eligible,
            'integrityState', row_data.integrity_state,
            'needsAttention', row_data.needs_attention,
            'isPublic', row_data.is_public,
            'isActive', row_data.is_active,
            'timesAnswered', coalesce(row_data.times_answered, 0),
            'timesCorrect', coalesce(row_data.times_correct, 0),
            'accuracyPercent', row_data.accuracy_percent,
            'contentVersion', row_data.content_version,
            'contentRevision', row_data.content_revision,
            'externalId', row_data.verified_external_id,
            'verifiedByAuthority', row_data.verified_by_authority,
            'verifiedAt', row_data.verified_at,
            'createdAt', row_data.created_at,
            'updatedAt', row_data.updated_at,
            'teacher', case when row_data.content_origin = 'teacher'
              then jsonb_build_object(
                'teacherId', row_data.teacher_id,
                'userId', row_data.teacher_user_id,
                'name', row_data.teacher_name,
                'avatarUrl', row_data.teacher_avatar_url,
                'verified', coalesce(row_data.teacher_verified, false),
                'profileLinked', row_data.profile_linked,
                'schoolId', row_data.resolved_school_id,
                'schoolName', row_data.school_name,
                'schoolLogoUrl', row_data.school_logo_url,
                'schoolStatus', row_data.school_status
              ) else null end,
            'submission', case when row_data.submission_item_id is not null
              then jsonb_strip_nulls(jsonb_build_object(
                'itemId', row_data.submission_item_id,
                'batchId', row_data.submission_batch_id,
                'status', row_data.submission_status,
                'submittedAt', row_data.submitted_at,
                'sourcePage', row_data.source_page,
                'sourceFileName', row_data.source_file_name,
                'extractionModel', row_data.extraction_model,
                'extractionConfidence', row_data.extraction_confidence,
                'needsHumanAttention', row_data.submission_needs_human_attention,
                'sourceDrift', row_data.submitted_content_hash
                  is distinct from row_data.current_content_hash,
                'taxonomyProposal', row_data.taxonomy_proposal,
                'processingMode', row_data.processing_mode,
                'detectedDocumentType', row_data.detected_document_type,
                'documentTypeConfidence', row_data.document_type_confidence,
                'sourceRightsAttested', row_data.source_rights_attested,
                'processingRequest', row_data.processing_request,
                'candidateOrigin', row_data.candidate_origin,
                'sourceGroundingNote', row_data.source_grounding_note,
                'sourceEvidenceKind', row_data.source_evidence_kind,
                'sourceVisualDescription', row_data.source_visual_description,
                'groundingConfidence', row_data.grounding_confidence,
                'learningObjective', row_data.learning_objective
              )) else null end,
            'governance', case when row_data.governance_decision_id is not null
              then jsonb_build_object(
                'decisionId', row_data.governance_decision_id,
                'action', row_data.governance_action,
                'rationale', row_data.governance_rationale,
                'authority', row_data.governance_authority,
                'decidedAt', row_data.governance_decided_at,
                'snapshot', row_data.governance_snapshot
              ) else null end
          )) as payload
        from filtered row_data
        order by row_data.needs_attention desc, row_data.created_at desc, row_data.id
        limit v_limit offset v_offset
      ) page
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$
;

revoke all on function public.rpc_teacher_submit_manual_question_for_governance(uuid,text,text)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_submit_manual_question_for_governance(uuid,text,text)
to authenticated,service_role;

revoke all on function public.rpc_superadmin_govern_school_question(uuid,text,jsonb)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_superadmin_govern_school_question(uuid,text,jsonb)
to authenticated,service_role;

revoke all on function public.rpc_superadmin_school_question_curriculum_options(uuid,text,integer)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_superadmin_school_question_curriculum_options(uuid,text,integer)
to authenticated,service_role;

revoke all on function public.rpc_superadmin_question_bank_inspector_v3(text,text,text,uuid,text,integer,integer)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_superadmin_question_bank_inspector_v3(text,text,text,uuid,text,integer,integer)
to authenticated,service_role;

comment on table public.teacher_question_manual_submissions is
  'Append-only frozen submissions from the ordinary teacher manual question creator into platform academic governance.';
comment on function public.rpc_teacher_submit_manual_question_for_governance(uuid,text,text) is
  'Teacher-owned manual question submission. Keeps the question non-authoritative until superadmin curriculum and taxonomy governance approves it.';
