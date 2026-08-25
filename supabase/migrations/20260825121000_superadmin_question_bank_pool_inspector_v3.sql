-- One superadmin inventory for all four governance states, with curriculum
-- names rather than opaque IDs.

create or replace function public.rpc_superadmin_question_bank_inspector_v3(
  p_pool text default 'verified',
  p_search text default null,
  p_subject text default null,
  p_school_id uuid default null,
  p_status text default 'all',
  p_limit integer default 24,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
      select item.id as submission_item_id,
        batch.id as submission_batch_id,
        batch.status as submission_status,
        batch.submitted_at,
        item.source_page,
        item.taxonomy_proposal,
        item.extraction_confidence,
        item.needs_human_attention,
        item.submitted_content_hash,
        extraction.source_file_name,
        extraction.extraction_model,
        extraction.processing_mode,
        extraction.detected_document_type,
        extraction.extraction_payload -> 'document_type_confidence'
          as document_type_confidence,
        extraction.source_rights_attested,
        extraction.processing_request,
        coalesce(candidate.payload ->> 'candidate_origin', 'source_question')
          as candidate_origin,
        candidate.payload ->> 'source_grounding_note' as source_grounding_note,
        coalesce(candidate.payload ->> 'source_evidence_kind', 'text')
          as source_evidence_kind,
        candidate.payload ->> 'source_visual_description'
          as source_visual_description,
        candidate.payload -> 'grounding_confidence' as grounding_confidence,
        candidate.payload ->> 'learning_objective' as learning_objective
      from public.teacher_question_batch_items item
      join public.teacher_question_batches batch on batch.id = item.batch_id
      join public.teacher_question_pdf_extractions extraction
        on extraction.id = batch.extraction_id
      left join lateral (
        select secured.payload
        from jsonb_array_elements(
          coalesce(extraction.extraction_payload -> 'questions', '[]'::jsonb)
        ) secured(payload)
        where secured.payload ->> 'source_index' = item.source_index::text
        limit 1
      ) candidate on true
      where item.question_id = q.id
      order by batch.submitted_at desc, item.created_at desc, item.id desc
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
$$;

revoke all on function public.rpc_superadmin_question_bank_inspector_v3(
  text, text, text, uuid, text, integer, integer
) from public, anon, authenticated, service_role;
grant execute on function public.rpc_superadmin_question_bank_inspector_v3(
  text, text, text, uuid, text, integer, integer
) to authenticated, service_role;

comment on function public.rpc_superadmin_question_bank_inspector_v3(
  text, text, text, uuid, text, integer, integer
) is
  'Four-pool superadmin question inventory with school ownership, named curriculum version/objective authority, source provenance and latest append-only governance decision.';
