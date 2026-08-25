-- Superadmin governance for promoting a frozen teacher submission into exactly
-- one school's verified pool. Decisions are append-only; source content and
-- approved diagnostic taxonomy are hash-bound.

create table if not exists public.question_pool_governance_decisions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete restrict,
  action text not null check (
    action in ('approve_school', 'return_teacher', 'retire_school')
  ),
  from_pool_scope text not null check (
    from_pool_scope in ('global', 'school', 'teacher', 'archive')
  ),
  to_pool_scope text not null check (
    to_pool_scope in ('global', 'school', 'teacher', 'archive')
  ),
  school_id uuid references public.schools(id) on delete restrict,
  school_curriculum_mapping_id uuid
    references public.school_curriculum_scope_mappings(id) on delete restrict,
  curriculum_mapping_id uuid
    references public.curriculum_item_objective_mappings(id) on delete restrict,
  diagnostic_taxonomy_id uuid
    references public.verified_question_diagnostic_taxonomy(id) on delete restrict,
  question_content_hash text not null
    check (question_content_hash ~ '^[0-9a-f]{64}$'),
  rationale text not null check (length(trim(rationale)) between 20 and 2000),
  decided_by uuid not null references public.users(id) on delete restrict,
  decided_by_authority text not null,
  decision_snapshot jsonb not null check (jsonb_typeof(decision_snapshot) = 'object'),
  created_at timestamptz not null default now(),
  check (
    action <> 'approve_school'
    or (
      from_pool_scope = 'teacher'
      and to_pool_scope = 'school'
      and school_id is not null
      and school_curriculum_mapping_id is not null
      and curriculum_mapping_id is not null
      and diagnostic_taxonomy_id is not null
    )
  ),
  check (
    action <> 'retire_school'
    or (from_pool_scope = 'school' and to_pool_scope = 'archive')
  )
);

alter table public.question_pool_governance_decisions enable row level security;
revoke all on table public.question_pool_governance_decisions
  from public, anon, authenticated, service_role;
grant select on table public.question_pool_governance_decisions to service_role;

create index if not exists question_pool_governance_question_time_idx
  on public.question_pool_governance_decisions(question_id, created_at desc);
create index if not exists question_pool_governance_school_time_idx
  on public.question_pool_governance_decisions(school_id, created_at desc)
  where school_id is not null;
create index if not exists question_pool_governance_school_mapping_idx
  on public.question_pool_governance_decisions(school_curriculum_mapping_id)
  where school_curriculum_mapping_id is not null;
create index if not exists question_pool_governance_curriculum_mapping_idx
  on public.question_pool_governance_decisions(curriculum_mapping_id)
  where curriculum_mapping_id is not null;
create index if not exists question_pool_governance_taxonomy_idx
  on public.question_pool_governance_decisions(diagnostic_taxonomy_id)
  where diagnostic_taxonomy_id is not null;
create index if not exists question_pool_governance_decided_by_idx
  on public.question_pool_governance_decisions(decided_by);

create or replace function private.reject_question_pool_governance_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '55000',
    message = 'question_pool_governance_decisions_are_append_only';
end;
$$;
revoke all on function private.reject_question_pool_governance_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_question_pool_governance_immutable
  on public.question_pool_governance_decisions;
create trigger trg_question_pool_governance_immutable
before update or delete on public.question_pool_governance_decisions
for each row execute function private.reject_question_pool_governance_mutation();

create or replace function public.rpc_superadmin_school_question_curriculum_options(
  p_question_id uuid,
  p_search text default null,
  p_limit integer default 300
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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

  select item.id as submission_item_id, item.submitted_content_hash,
    coalesce(batch.school_id, teacher_user.school_id, membership.school_id) as school_id,
    school.name as school_name, school.status as school_status, batch.submitted_at,
    extraction.source_rights_attested,
    coalesce(candidate.payload ->> 'candidate_origin', 'source_question') as candidate_origin
  into v_submission
  from public.teacher_question_batch_items item
  join public.teacher_question_batches batch on batch.id = item.batch_id
  join public.teacher_question_pdf_extractions extraction
    on extraction.id = batch.extraction_id
  join public.teachers teacher on teacher.id = batch.teacher_id
  join public.users teacher_user on teacher_user.id = teacher.user_id
  left join lateral (
    select sm.school_id
    from public.school_members sm
    where sm.user_id = teacher.user_id and sm.status = 'active'
    order by sm.joined_at desc nulls last, sm.id
    limit 1
  ) membership on true
  left join public.schools school
    on school.id = coalesce(batch.school_id, teacher_user.school_id, membership.school_id)
  left join lateral (
    select secured.payload
    from jsonb_array_elements(
      coalesce(extraction.extraction_payload -> 'questions', '[]'::jsonb)
    ) secured(payload)
    where secured.payload ->> 'source_index' = item.source_index::text
    limit 1
  ) candidate on true
  where item.question_id = p_question_id
  order by batch.submitted_at desc, item.created_at desc, item.id desc
  limit 1;

  if v_submission.submission_item_id is null then
    return jsonb_build_object(
      'success', true,
      'questionId', p_question_id,
      'approvalEligible', false,
      'blockedReason', 'A governed Add Question Batch submission is required before school verification.',
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
$$;
revoke all on function public.rpc_superadmin_school_question_curriculum_options(uuid, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_superadmin_school_question_curriculum_options(uuid, text, integer)
  to authenticated, service_role;

create or replace function public.rpc_superadmin_govern_school_question(
  p_question_id uuid,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

  select item.id as submission_item_id, item.submitted_content_hash,
    item.taxonomy_proposal, item.source_index,
    coalesce(batch.school_id, teacher_user.school_id, membership.school_id) as school_id,
    school.name as school_name, school.slug as school_slug, school.status as school_status,
    batch.id as batch_id, batch.submitted_at,
    extraction.source_rights_attested,
    coalesce(candidate.payload ->> 'candidate_origin', 'source_question') as candidate_origin
  into v_submission
  from public.teacher_question_batch_items item
  join public.teacher_question_batches batch on batch.id = item.batch_id
  join public.teacher_question_pdf_extractions extraction
    on extraction.id = batch.extraction_id
  join public.teachers teacher on teacher.id = batch.teacher_id
  join public.users teacher_user on teacher_user.id = teacher.user_id
  left join lateral (
    select sm.school_id
    from public.school_members sm
    where sm.user_id = teacher.user_id and sm.status = 'active'
    order by sm.joined_at desc nulls last, sm.id
    limit 1
  ) membership on true
  left join public.schools school
    on school.id = coalesce(batch.school_id, teacher_user.school_id, membership.school_id)
  left join lateral (
    select secured.payload
    from jsonb_array_elements(
      coalesce(extraction.extraction_payload -> 'questions', '[]'::jsonb)
    ) secured(payload)
    where secured.payload ->> 'source_index' = item.source_index::text
    limit 1
  ) candidate on true
  where item.question_id = p_question_id
  order by batch.submitted_at desc, item.created_at desc, item.id desc
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
      message = 'school_approval_requires_question_batch_submission';
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
  v_primary_skill_code := nullif(trim(v_payload ->> 'primarySkillCode'), '');
  if v_primary_skill_code is null then
    v_primary_skill_code := v_subject_code || '.' || trim(both '-' from regexp_replace(
      lower(v_primary_skill_name), '[^a-z0-9]+', '-', 'g'
    ));
  end if;
  v_atomic_subskill_code := nullif(trim(v_payload ->> 'atomicSubskillCode'), '');
  if v_atomic_subskill_code is null then
    v_atomic_subskill_code := v_primary_skill_code || '.' || trim(both '-' from regexp_replace(
      lower(v_atomic_subskill_name), '[^a-z0-9]+', '-', 'g'
    ));
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
      'primary', 'ai_assisted', 'approved', v_confidence, v_rationale,
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
$$;
revoke all on function public.rpc_superadmin_govern_school_question(uuid, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_superadmin_govern_school_question(uuid, text, jsonb)
  to authenticated, service_role;

comment on table public.question_pool_governance_decisions is
  'Append-only superadmin decisions that move a frozen teacher submission into or out of a school verified question pool.';
comment on function public.rpc_superadmin_school_question_curriculum_options(uuid, text, integer) is
  'Lists only confirmed, named curriculum objectives belonging to the teacher submission origin school.';
comment on function public.rpc_superadmin_govern_school_question(uuid, text, jsonb) is
  'Atomic school-pool approval, return, or retirement with exact curriculum, diagnostic taxonomy, source provenance and audit evidence.';
