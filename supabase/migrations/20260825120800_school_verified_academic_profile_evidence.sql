-- Admit School Verified questions into official learning evidence while keeping
-- teacher-private questions excluded. Every admitted row remains hash-bound,
-- school-bound and exact-curriculum-bound.

alter table public.student_learning_item_evidence
  drop constraint if exists student_learning_item_evidence_evidence_authority_check;
alter table public.student_learning_item_evidence
  add constraint student_learning_item_evidence_evidence_authority_check check (
    evidence_authority in (
      'brains_heist_verified_question',
      'school_verified_question'
    )
  );

create or replace function private.materialize_verified_assignment_item_evidence(
  p_assignment_id uuid,
  p_student_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment record;
  v_school_id uuid;
  v_effective_grade text;
  v_expected_count integer := 0;
  v_answered_count integer := 0;
  v_inserted integer := 0;
begin
  if p_assignment_id is null or p_student_id is null then return 0; end if;

  select a.school_id, a.class_id, a.academic_year_id, a.academic_term_id,
    a.academic_subject_id, a.grade_level_snapshot, sa.batch as student_batch,
    sa.status, result.completed_at,
    count(aq.question_id)::integer as expected_count
  into v_assignment
  from public.assignments a
  join public.student_assignments sa
    on sa.assignment_id = a.id and sa.student_id = p_student_id
  join public.student_assignment_results result
    on result.assignment_id = a.id and result.student_id = p_student_id
  left join public.assignment_questions aq on aq.assignment_id = a.id
  where a.id = p_assignment_id
  group by a.school_id, a.class_id, a.academic_year_id, a.academic_term_id,
    a.academic_subject_id, a.grade_level_snapshot, sa.batch, sa.status,
    result.completed_at;

  if not found then return 0; end if;
  v_expected_count := coalesce(v_assignment.expected_count, 0);

  select count(*)::integer into v_answered_count
  from public.student_assignment_answers saa
  where saa.assignment_id = p_assignment_id
    and saa.student_id = p_student_id;

  if v_assignment.status <> 'completed'
     or v_assignment.completed_at is null
     or v_expected_count <= 0
     or v_answered_count <> v_expected_count
     or v_assignment.academic_year_id is null
     or v_assignment.academic_subject_id is null then
    return 0;
  end if;

  select coalesce(v_assignment.school_id, u.school_id)
  into v_school_id
  from public.users u where u.id = p_student_id;
  if v_school_id is null then return 0; end if;

  v_effective_grade := nullif(trim(v_assignment.grade_level_snapshot), '');
  if v_effective_grade is null then
    select c.grade_level into v_effective_grade
    from public.classes c
    where c.school_id = v_school_id
      and (
        c.id = v_assignment.class_id
        or upper(regexp_replace(trim(c.class_code), '\s+', '', 'g')) =
          upper(regexp_replace(trim(coalesce(v_assignment.student_batch, '')), '\s+', '', 'g'))
      )
      and coalesce(c.is_active, true)
    order by (c.id = v_assignment.class_id) desc, c.id
    limit 1;
  end if;
  if v_effective_grade is null or v_effective_grade !~ '^[0-9]+$' then return 0; end if;

  with eligible as (
    select saa.id as answer_id, saa.question_id, saa.is_correct,
      coalesce(saa.answered_at, v_assignment.completed_at) as answered_at,
      q.verified_content_hash as question_content_hash,
      case when q.pool_scope = 'global'
        then 'brains_heist_verified_question'
        else 'school_verified_question'
      end as evidence_authority,
      im.id as curriculum_mapping_id,
      im.curriculum_scope_id,
      im.curriculum_objective_id,
      im.framework_version_id,
      o.code as objective_code,
      o.statement as objective_statement,
      node.code as coverage_node_code,
      node.name as coverage_node_name,
      dt.id as diagnostic_taxonomy_id,
      exists (
        select 1
        from public.student_learning_intervention_practice_assignments practice
        where practice.assignment_id = p_assignment_id
          and practice.student_id = p_student_id
      ) as is_targeted_practice,
      jsonb_strip_nulls(jsonb_build_object(
        'questionPool', q.pool_scope,
        'questionOwnerSchoolId', q.owner_school_id,
        'evidenceAuthority', case when q.pool_scope = 'global'
          then 'brains_heist_verified_question'
          else 'school_verified_question' end,
        'frameworkVersionId', im.framework_version_id,
        'curriculumScopeId', im.curriculum_scope_id,
        'curriculumObjectiveId', im.curriculum_objective_id,
        'curriculumMappingId', im.id,
        'objectiveCode', o.code,
        'objective', o.statement,
        'coverageNodeCode', node.code,
        'coverageNodeName', node.name,
        'mappingMethod', im.mapping_method,
        'mappingConfidence', im.confidence_score,
        'questionContentHash', q.verified_content_hash,
        'diagnosticTaxonomyId', dt.id,
        'diagnosticTaxonomyHash', dt.taxonomy_hash,
        'taxonomyVersion', dt.taxonomy_version,
        'primarySkillCode', dt.primary_skill_code,
        'primarySkillName', dt.primary_skill_name,
        'atomicSubskillCode', dt.atomic_subskill_code,
        'atomicSubskillName', dt.atomic_subskill_name,
        'assessmentProcessCode', dt.assessment_process_code,
        'cognitiveProcess', dt.cognitive_process,
        'evidenceStatement', dt.evidence_statement,
        'isTargetedPractice', exists (
          select 1
          from public.student_learning_intervention_practice_assignments practice
          where practice.assignment_id = p_assignment_id
            and practice.student_id = p_student_id
        )
      )) as taxonomy_snapshot
    from public.student_assignment_answers saa
    join public.assignment_questions aq
      on aq.assignment_id = saa.assignment_id
     and aq.question_id = saa.question_id
     and aq.analytics_eligible_snapshot
     and aq.pool_scope_snapshot in ('global', 'school')
     and aq.verification_status_snapshot = 'verified'
    join public.questions q
      on q.id = saa.question_id
     and q.pool_scope = aq.pool_scope_snapshot
     and q.owner_school_id is not distinct from aq.owner_school_id_snapshot
     and q.verification_status = 'verified'
     and q.analytics_eligible
     and q.is_active
     and q.current_content_hash = q.verified_content_hash
     and aq.question_content_hash = q.verified_content_hash
     and v_effective_grade::smallint = any(q.eligible_grade_levels)
     and (
       (q.pool_scope = 'global'
         and q.content_origin = 'brain_heist'
         and q.owner_school_id is null
         and q.is_public)
       or (q.pool_scope = 'school'
         and q.content_origin = 'teacher'
         and q.owner_school_id = v_school_id
         and not q.is_public)
     )
    join public.curriculum_assessment_items item
      on item.source_type = 'question_bank'
     and item.source_record_id = q.id::text
     and item.source_item_key = 'question'
     and item.is_active
     and item.content_hash = q.verified_content_hash
     and (
       (q.pool_scope = 'global' and item.school_id is null)
       or (q.pool_scope = 'school' and item.school_id = v_school_id)
     )
    join public.school_curriculum_scope_mappings scm
      on scm.school_id = v_school_id
     and scm.academic_year_id = v_assignment.academic_year_id
     and scm.grade_level = v_effective_grade
     and scm.academic_subject_id = v_assignment.academic_subject_id
     and scm.status = 'active'
    join public.curriculum_item_objective_mappings im
      on im.assessment_item_id = item.id
     and im.curriculum_scope_id = scm.curriculum_scope_id
     and im.academic_subject_id = v_assignment.academic_subject_id
     and im.status = 'approved'
     and im.mapping_role = 'primary'
     and im.superseded_at is null
     and im.item_content_hash = item.content_hash
    join public.curriculum_framework_versions fv
      on fv.id = im.framework_version_id
     and fv.status in ('published', 'retired')
     and fv.content_hash = im.curriculum_version_content_hash
    join public.curriculum_objectives o
      on o.id = im.curriculum_objective_id and o.is_assessable
    join public.curriculum_nodes node on node.id = o.curriculum_node_id
    left join public.verified_question_diagnostic_taxonomy dt
      on dt.id = aq.diagnostic_taxonomy_id
     and dt.question_id = q.id
     and dt.question_content_hash = aq.question_content_hash
     and dt.taxonomy_hash = aq.diagnostic_taxonomy_hash
     and dt.curriculum_mapping_id = im.id
     and dt.review_status = 'approved'
     and not dt.human_review_required
    where saa.assignment_id = p_assignment_id
      and saa.student_id = p_student_id
  )
  insert into public.student_learning_item_evidence(
    school_id, student_id, assignment_id, answer_id, question_id,
    academic_year_id, academic_term_id, academic_subject_id,
    curriculum_scope_id, curriculum_objective_id, curriculum_mapping_id,
    diagnostic_taxonomy_id, grade_level, question_content_hash, is_correct,
    is_independent_assessment, answered_at, evidence_authority,
    taxonomy_snapshot, taxonomy_snapshot_hash
  )
  select v_school_id, p_student_id, p_assignment_id, evidence.answer_id,
    evidence.question_id, v_assignment.academic_year_id,
    v_assignment.academic_term_id, v_assignment.academic_subject_id,
    evidence.curriculum_scope_id, evidence.curriculum_objective_id,
    evidence.curriculum_mapping_id, evidence.diagnostic_taxonomy_id,
    v_effective_grade, evidence.question_content_hash, evidence.is_correct,
    not evidence.is_targeted_practice, evidence.answered_at,
    evidence.evidence_authority, evidence.taxonomy_snapshot,
    encode(extensions.digest(evidence.taxonomy_snapshot::text, 'sha256'), 'hex')
  from eligible evidence
  on conflict (answer_id, curriculum_mapping_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;
revoke all on function private.materialize_verified_assignment_item_evidence(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace view private.student_verified_assignment_summaries
with (security_invoker = true)
as
select result.assignment_id, result.student_id,
  count(distinct answer.id)::integer as verified_question_count,
  count(distinct answer.id) filter (where answer.is_correct)::integer as correct,
  count(distinct answer.id) filter (where not answer.is_correct)::integer as incorrect,
  round(
    100 * count(distinct answer.id) filter (where answer.is_correct)::numeric
      / nullif(count(distinct answer.id), 0)::numeric,
    2
  ) as accuracy,
  round(
    100 * count(distinct answer.id) filter (where answer.is_correct)::numeric
      / nullif(count(distinct answer.id), 0)::numeric,
    2
  ) as score,
  result.time_taken_seconds,
  result.completed_at
from public.student_assignment_results result
join public.assignments assignment on assignment.id = result.assignment_id
join public.users student on student.id = result.student_id
left join public.classes assignment_class on assignment_class.id = assignment.class_id
join public.student_assignment_answers answer
  on answer.assignment_id = result.assignment_id
 and answer.student_id = result.student_id
join public.assignment_questions aq
  on aq.assignment_id = answer.assignment_id
 and aq.question_id = answer.question_id
 and aq.pool_scope_snapshot in ('global', 'school')
 and aq.verification_status_snapshot = 'verified'
 and aq.analytics_eligible_snapshot
join public.questions q
  on q.id = answer.question_id
 and q.pool_scope = aq.pool_scope_snapshot
 and q.owner_school_id is not distinct from aq.owner_school_id_snapshot
 and q.verification_status = 'verified'
 and q.analytics_eligible
 and q.is_active
 and q.current_content_hash = q.verified_content_hash
 and aq.question_content_hash = q.verified_content_hash
 and (
   (q.pool_scope = 'global'
     and q.content_origin = 'brain_heist'
     and q.owner_school_id is null
     and q.is_public)
   or (q.pool_scope = 'school'
     and q.content_origin = 'teacher'
     and q.owner_school_id = assignment.school_id
     and not q.is_public)
 )
cross join lateral (
  select nullif(regexp_replace(
    coalesce(
      nullif(trim(assignment.grade_level_snapshot), ''),
      nullif(trim(assignment_class.grade_level), ''),
      nullif(trim(student.grade::text), ''),
      ''
    ),
    '\D', '', 'g'
  ), '') as grade_level
) effective
where result.completed_at is not null
  and effective.grade_level is not null
  and effective.grade_level::smallint = any(q.eligible_grade_levels)
  and private.verified_question_has_curriculum_mapping(
    q.id, assignment.school_id, assignment.academic_year_id,
    effective.grade_level, assignment.academic_subject_id
  )
  and not exists (
    select 1
    from public.student_learning_intervention_practice_assignments practice
    where practice.assignment_id = result.assignment_id
      and practice.student_id = result.student_id
  )
group by result.assignment_id, result.student_id,
  result.time_taken_seconds, result.completed_at
having count(distinct answer.id) > 0;

revoke all on private.student_verified_assignment_summaries
  from public, anon, authenticated, service_role;

comment on view private.student_verified_assignment_summaries is
  'Fail-closed official totals from current, hash-bound Global Verified or same-school Verified items with exact school curriculum authority; targeted practice is excluded.';

create or replace function private.verified_questions_for_learning_focus(
  p_student_id uuid,
  p_subject text,
  p_skill_key text,
  p_topic text,
  p_skill text,
  p_subskill text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with student_context as (
    select student.id, student.school_id,
      nullif(regexp_replace(coalesce(student.grade::text, ''), '\D', '', 'g'), '') as grade_level,
      case when student.school_id is null then null::uuid
        else public.academic_resolve_year_id(student.school_id, now()) end as academic_year_id
    from public.users student
    where student.id = p_student_id
  ),
  candidates as (
    select q.id as question_id,
      case
        when p_skill_key like 'diagnostic:%' and exists (
          select 1
          from public.verified_question_diagnostic_taxonomy taxonomy
          where taxonomy.question_id = q.id
            and taxonomy.question_content_hash = q.verified_content_hash
            and taxonomy.review_status = 'approved'
            and not taxonomy.human_review_required
            and taxonomy.scope_code = split_part(p_skill_key, ':', 2)
            and taxonomy.primary_skill_code = split_part(p_skill_key, ':', 3)
            and taxonomy.atomic_subskill_code = split_part(p_skill_key, ':', 4)
            and not exists (
              select 1
              from public.verified_question_diagnostic_taxonomy successor
              where successor.supersedes_taxonomy_id = taxonomy.id
                and successor.review_status = 'approved'
                and not successor.human_review_required
            )
        ) then 1
        when p_skill_key like 'diagnostic:%' and exists (
          select 1
          from public.verified_question_diagnostic_taxonomy taxonomy
          where taxonomy.question_id = q.id
            and taxonomy.question_content_hash = q.verified_content_hash
            and taxonomy.review_status = 'approved'
            and not taxonomy.human_review_required
            and taxonomy.scope_code = split_part(p_skill_key, ':', 2)
            and taxonomy.primary_skill_code = split_part(p_skill_key, ':', 3)
            and not exists (
              select 1
              from public.verified_question_diagnostic_taxonomy successor
              where successor.supersedes_taxonomy_id = taxonomy.id
                and successor.review_status = 'approved'
                and not successor.human_review_required
            )
        ) then 2
        when p_skill_key like 'objective:%' and exists (
          select 1
          from public.curriculum_assessment_items item
          join public.curriculum_item_objective_mappings mapping
            on mapping.assessment_item_id = item.id
           and mapping.status = 'approved'
           and mapping.mapping_role = 'primary'
           and mapping.superseded_at is null
           and mapping.item_content_hash = item.content_hash
          join public.curriculum_scopes scope on scope.id = mapping.curriculum_scope_id
          join public.curriculum_objectives objective
            on objective.id = mapping.curriculum_objective_id
           and objective.is_assessable
          join public.curriculum_framework_versions version
            on version.id = mapping.framework_version_id
           and version.status in ('published', 'retired')
           and version.content_hash = mapping.curriculum_version_content_hash
          where item.source_type = 'question_bank'
            and item.source_record_id = q.id::text
            and item.source_item_key = 'question'
            and item.is_active
            and item.content_hash = q.verified_content_hash
            and (
              concat_ws(':', 'objective', mapping.curriculum_objective_id::text) = p_skill_key
              or concat_ws(':', 'objective', scope.code, objective.code) = p_skill_key
            )
        ) then 1
        when p_skill_key not like 'diagnostic:%'
          and p_skill_key not like 'objective:%'
          and lower(trim(coalesce(q.subject, q.subject_id, ''))) =
            lower(trim(coalesce(p_subject, '')))
          and (
            lower(trim(coalesce(q.topic_name, q.topic, ''))) =
              lower(trim(coalesce(p_topic, p_skill, '')))
            or lower(trim(coalesce(q.topic_name, q.topic, ''))) =
              lower(trim(coalesce(p_skill, '')))
            or exists (
              select 1 from unnest(coalesce(q.tags, array[]::text[])) tag
              where lower(tag) = lower('skill:' || coalesce(p_skill, ''))
                 or lower(tag) = lower('subskill:' || coalesce(p_subskill, ''))
            )
          ) then 1
        else null
      end as match_tier
    from public.questions q
    join student_context context on true
    where q.pool_scope in ('global', 'school')
      and q.verification_status = 'verified'
      and q.analytics_eligible
      and q.is_active
      and q.current_content_hash = q.verified_content_hash
      and context.school_id is not null
      and context.grade_level is not null
      and q.academic_subject_id is not null
      and context.grade_level::smallint = any(q.eligible_grade_levels)
      and (
        (q.pool_scope = 'global'
          and q.content_origin = 'brain_heist'
          and q.owner_school_id is null
          and q.is_public)
        or (q.pool_scope = 'school'
          and q.content_origin = 'teacher'
          and q.owner_school_id = context.school_id
          and not q.is_public)
      )
      and private.verified_question_has_curriculum_mapping(
        q.id, context.school_id, context.academic_year_id,
        context.grade_level, q.academic_subject_id
      )
  ),
  matched as (
    select question_id, match_tier from candidates where match_tier is not null
  ),
  recommended as (
    select question_id, match_tier
    from matched order by match_tier, question_id limit 6
  )
  select jsonb_build_object(
    'available_question_count', (select count(*) from matched),
    'available_exact_question_count', (
      select count(*) from matched where match_tier = 1
    ),
    'available_related_question_count', (
      select count(*) from matched where match_tier = 2
    ),
    'exact_question_ids', coalesce((
      select jsonb_agg(question_id order by question_id)
      from matched where match_tier = 1
    ), '[]'::jsonb),
    'related_question_ids', coalesce((
      select jsonb_agg(question_id order by question_id)
      from matched where match_tier = 2
    ), '[]'::jsonb),
    'recommended_question_ids', coalesce((
      select jsonb_agg(question_id order by match_tier, question_id)
      from recommended
    ), '[]'::jsonb)
  );
$$;
revoke all on function private.verified_questions_for_learning_focus(
  uuid, text, text, text, text, text
) from public, anon, authenticated, service_role;

comment on function private.materialize_verified_assignment_item_evidence(uuid, uuid) is
  'Materializes immutable Global Verified or same-school Verified answer evidence only after exact school curriculum validation.';
comment on function public.rpc_student_academic_profile(uuid, text, timestamptz, timestamptz) is
  'Official profile fed by exact-curriculum Global Verified and same-school Verified assignment evidence; private teacher items, automated Writing Hub analysis, and targeted practice are excluded.';
