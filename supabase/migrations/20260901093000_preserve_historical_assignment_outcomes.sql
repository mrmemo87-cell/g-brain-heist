-- Preserve already-qualified historical assignment outcomes when curriculum mappings
-- are superseded after submission. Current verification remains fail-closed; the
-- fallback is only an append-only item-evidence snapshot derived from previously
-- qualified Brains Heist Verified assignment evidence.

with historical_candidates as (
  select distinct on (answer.id)
    coalesce(assignment.school_id, student.school_id) as school_id,
    result.student_id,
    result.assignment_id,
    answer.id as answer_id,
    answer.question_id,
    assignment.academic_year_id,
    assignment.academic_term_id,
    assignment.academic_subject_id,
    mapping.curriculum_scope_id,
    mapping.curriculum_objective_id,
    mapping.id as curriculum_mapping_id,
    null::uuid as diagnostic_taxonomy_id,
    obs.evidence->>'grade_level' as grade_level,
    aq.question_content_hash,
    answer.is_correct,
    coalesce(answer.answered_at, result.completed_at) as answered_at,
    'brains_heist_verified_question'::text as evidence_authority,
    jsonb_strip_nulls(jsonb_build_object(
      'evidenceAuthority', 'brains_heist_verified_question',
      'historicalAssignmentEvidence', true,
      'historicalObservationId', obs.id,
      'historicalObservedAt', obs.observed_at,
      'questionPool', aq.pool_scope_snapshot,
      'questionOwnerSchoolId', aq.owner_school_id_snapshot,
      'questionContentHash', aq.question_content_hash,
      'curriculumScopeId', mapping.curriculum_scope_id,
      'curriculumObjectiveId', mapping.curriculum_objective_id,
      'curriculumMappingId', mapping.id,
      'mappingStatusAtBackfill', mapping.status,
      'objectiveCode', obs.evidence->>'objective_code',
      'objective', obs.evidence->>'objective',
      'sourceLabel', obs.evidence->>'source_label'
    )) as taxonomy_snapshot
  from public.student_learning_observations obs
  join public.student_assignment_results result
    on result.assignment_id = obs.source_id
   and result.student_id = obs.student_id
   and result.completed_at is not null
  join public.assignments assignment
    on assignment.id = result.assignment_id
  join public.users student
    on student.id = result.student_id
  cross join lateral jsonb_array_elements_text(obs.evidence->'question_ids')
    as qid(question_id_text)
  join public.student_assignment_answers answer
    on answer.assignment_id = result.assignment_id
   and answer.student_id = result.student_id
   and answer.question_id::text = qid.question_id_text
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
  join public.curriculum_assessment_items item
    on item.source_type = 'question_bank'
   and item.source_record_id = q.id::text
   and item.source_item_key = 'question'
   and item.is_active
   and item.content_hash = q.verified_content_hash
   and (
     (q.pool_scope = 'global' and item.school_id is null)
     or (q.pool_scope = 'school' and item.school_id = assignment.school_id)
   )
  join public.curriculum_item_objective_mappings mapping
    on mapping.assessment_item_id = item.id
   and mapping.curriculum_scope_id::text = obs.evidence->>'curriculum_scope_id'
   and mapping.curriculum_objective_id::text = obs.evidence->>'curriculum_objective_id'
   and mapping.academic_subject_id = assignment.academic_subject_id
   and mapping.item_content_hash = item.content_hash
   and mapping.mapping_role = 'primary'
   and mapping.status in ('approved', 'superseded')
  where obs.source_type = 'assignment_result'
    and public.student_learning_observation_is_qualified(
      obs.source_type,
      obs.contributes_to_focus_state,
      obs.evidence
    )
    and jsonb_typeof(obs.evidence->'question_ids') = 'array'
    and obs.evidence->>'assignment_id' = result.assignment_id::text
    and obs.evidence->>'academic_year_id' = assignment.academic_year_id::text
    and obs.evidence->>'academic_subject_id' = assignment.academic_subject_id::text
    and obs.evidence->>'grade_level' ~ '^[0-9]+$'
    and (obs.evidence->>'grade_level')::smallint = any(q.eligible_grade_levels)
    and coalesce(assignment.school_id, student.school_id) is not null
    and not exists (
      select 1
      from public.student_learning_intervention_practice_assignments practice
      where practice.assignment_id = result.assignment_id
        and practice.student_id = result.student_id
    )
    and not exists (
      select 1
      from public.student_learning_item_evidence existing
      where existing.answer_id = answer.id
        and existing.curriculum_mapping_id = mapping.id
    )
  order by
    answer.id,
    (mapping.status = 'approved') desc,
    mapping.superseded_at desc nulls last,
    mapping.id
)
insert into public.student_learning_item_evidence(
  school_id,
  student_id,
  assignment_id,
  answer_id,
  question_id,
  academic_year_id,
  academic_term_id,
  academic_subject_id,
  curriculum_scope_id,
  curriculum_objective_id,
  curriculum_mapping_id,
  diagnostic_taxonomy_id,
  grade_level,
  question_content_hash,
  is_correct,
  is_independent_assessment,
  answered_at,
  evidence_authority,
  taxonomy_snapshot,
  taxonomy_snapshot_hash
)
select
  candidate.school_id,
  candidate.student_id,
  candidate.assignment_id,
  candidate.answer_id,
  candidate.question_id,
  candidate.academic_year_id,
  candidate.academic_term_id,
  candidate.academic_subject_id,
  candidate.curriculum_scope_id,
  candidate.curriculum_objective_id,
  candidate.curriculum_mapping_id,
  candidate.diagnostic_taxonomy_id,
  candidate.grade_level,
  candidate.question_content_hash,
  candidate.is_correct,
  true,
  candidate.answered_at,
  candidate.evidence_authority,
  candidate.taxonomy_snapshot,
  encode(extensions.digest(candidate.taxonomy_snapshot::text, 'sha256'), 'hex')
from historical_candidates candidate
on conflict (answer_id, curriculum_mapping_id) do nothing;

create or replace view private.student_verified_assignment_summaries
with (security_invoker = true)
as
select
  result.assignment_id,
  result.student_id,
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
join public.assignments assignment
  on assignment.id = result.assignment_id
join public.users student
  on student.id = result.student_id
left join public.classes assignment_class
  on assignment_class.id = assignment.class_id
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
  and (
    private.verified_question_has_curriculum_mapping(
      q.id,
      assignment.school_id,
      assignment.academic_year_id,
      effective.grade_level,
      assignment.academic_subject_id
    )
    or exists (
      select 1
      from public.student_learning_item_evidence historical_item
      where historical_item.assignment_id = result.assignment_id
        and historical_item.student_id = result.student_id
        and historical_item.answer_id = answer.id
        and historical_item.question_id = answer.question_id
        and historical_item.question_content_hash = aq.question_content_hash
        and historical_item.grade_level = effective.grade_level
        and historical_item.academic_year_id = assignment.academic_year_id
        and historical_item.academic_subject_id = assignment.academic_subject_id
        and historical_item.is_independent_assessment
        and historical_item.evidence_authority in (
          'brains_heist_verified_question',
          'school_verified_question'
        )
    )
  )
  and not exists (
    select 1
    from public.student_learning_intervention_practice_assignments practice
    where practice.assignment_id = result.assignment_id
      and practice.student_id = result.student_id
  )
group by
  result.assignment_id,
  result.student_id,
  result.time_taken_seconds,
  result.completed_at
having count(distinct answer.id) > 0;

revoke all on private.student_verified_assignment_summaries
  from public, anon, authenticated, service_role;

comment on view private.student_verified_assignment_summaries is
  'Fail-closed official assignment totals from current verified curriculum authority or append-only historical item evidence captured while the assignment evidence was qualified. Mapping supersession alone does not erase a completed academic outcome; retired or changed question content remains excluded, and targeted practice never contributes.';
