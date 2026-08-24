-- Strengthen verified learning intelligence without rewriting historical work.
--
-- Coverage objectives remain governed by curriculum_item_objective_mappings.
-- This migration adds an immutable diagnostic leaf/AO layer, snapshots that
-- layer on new assignments, materializes answer-level verified evidence, and
-- closes two official-profile authority gaps:
--   * teacher-authored assignment items cannot affect official attainment;
--   * automated Writing Hub analysis cannot qualify without a final review.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Immutable, governed per-item diagnostic taxonomy
-- ---------------------------------------------------------------------------

create table if not exists public.verified_question_diagnostic_taxonomy (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete restrict,
  assessment_item_id uuid not null
    references public.curriculum_assessment_items(id) on delete restrict,
  curriculum_mapping_id uuid not null
    references public.curriculum_item_objective_mappings(id) on delete restrict,
  question_content_hash text not null,
  scope_code text not null,
  objective_code text not null,
  package_version text not null,
  taxonomy_version text not null,
  primary_skill_code text not null,
  primary_skill_name text not null,
  atomic_subskill_code text not null,
  atomic_subskill_name text not null,
  assessment_process_code text not null
    check (assessment_process_code in ('AO1', 'AO2', 'AO3', 'AO4')),
  cognitive_process text not null
    check (cognitive_process in ('remember', 'understand', 'apply', 'analyze', 'evaluate')),
  evidence_statement text not null,
  secondary_skill_codes text[] not null default '{}',
  confidence_score numeric(4,3) not null check (confidence_score between 0 and 1),
  review_status text not null
    check (review_status in ('in_review', 'approved', 'retired')),
  human_review_required boolean not null default false,
  review_reason text,
  supersedes_taxonomy_id uuid
    references public.verified_question_diagnostic_taxonomy(id) on delete restrict,
  reviewed_by_authority text not null,
  reviewed_at timestamptz not null default now(),
  taxonomy_hash text not null,
  created_at timestamptz not null default now(),
  unique (question_id, taxonomy_version),
  unique (taxonomy_hash),
  unique (supersedes_taxonomy_id),
  check (question_content_hash ~ '^[0-9a-f]{64}$'),
  check (taxonomy_hash ~ '^[0-9a-f]{64}$'),
  check (scope_code = public.curriculum_normalize_code(scope_code)),
  check (objective_code = public.curriculum_normalize_code(objective_code)),
  check (
    primary_skill_code
      ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*([.][a-z0-9]+(-[a-z0-9]+)*)+$'
  ),
  check (
    atomic_subskill_code
      ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*([.][a-z0-9]+(-[a-z0-9]+)*)+$'
  ),
  check (taxonomy_version = public.curriculum_normalize_code(taxonomy_version)),
  check (length(trim(primary_skill_name)) between 3 and 160),
  check (length(trim(atomic_subskill_name)) between 3 and 200),
  check (length(trim(evidence_statement)) between 30 and 500),
  check (primary_skill_code <> atomic_subskill_code),
  check (lower(trim(primary_skill_name)) <> lower(trim(atomic_subskill_name))),
  check (
    (assessment_process_code = 'AO1' and cognitive_process in ('remember', 'understand'))
    or (assessment_process_code = 'AO2' and cognitive_process = 'apply')
    or (assessment_process_code = 'AO3' and cognitive_process = 'analyze')
    or (assessment_process_code = 'AO4' and cognitive_process = 'evaluate')
  ),
  check (
    review_status <> 'approved'
    or (not human_review_required and confidence_score >= 0.900)
  )
);

alter table public.verified_question_diagnostic_taxonomy enable row level security;
revoke all on table public.verified_question_diagnostic_taxonomy
  from public, anon, authenticated, service_role;
grant select on table public.verified_question_diagnostic_taxonomy to service_role;

create index if not exists verified_question_diagnostic_taxonomy_question_idx
  on public.verified_question_diagnostic_taxonomy(question_id, created_at desc);
create index if not exists verified_question_diagnostic_taxonomy_mapping_idx
  on public.verified_question_diagnostic_taxonomy(curriculum_mapping_id);
create index if not exists verified_question_diagnostic_taxonomy_leaf_idx
  on public.verified_question_diagnostic_taxonomy(
    scope_code, primary_skill_code, atomic_subskill_code
  ) where review_status = 'approved';

create or replace function private.validate_verified_question_diagnostic_taxonomy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source record;
  v_superseded public.verified_question_diagnostic_taxonomy%rowtype;
  v_expected_hash text;
begin
  select
    q.verified_external_id,
    q.topic,
    q.curriculum_strand,
    q.verified_content_hash,
    i.id as assessment_item_id,
    s.code as scope_code,
    o.code as objective_code
  into v_source
  from public.questions q
  join public.curriculum_assessment_items i
    on i.id = new.assessment_item_id
   and i.source_type = 'question_bank'
   and i.source_record_id = q.id::text
   and i.source_item_key = 'question'
   and i.is_active
   and i.content_hash = q.verified_content_hash
  join public.curriculum_item_objective_mappings m
    on m.id = new.curriculum_mapping_id
   and m.assessment_item_id = i.id
   and m.status = 'approved'
   and m.mapping_role = 'primary'
   and m.superseded_at is null
   and m.item_content_hash = i.content_hash
  join public.curriculum_framework_versions fv
    on fv.id = m.framework_version_id
   and fv.status in ('published', 'retired')
   and fv.content_hash = m.curriculum_version_content_hash
  join public.curriculum_scopes s
    on s.id = m.curriculum_scope_id
  join public.curriculum_objectives o
    on o.id = m.curriculum_objective_id
   and o.is_assessable
  where q.id = new.question_id
    and q.content_origin = 'brain_heist'
    and q.verification_status = 'verified'
    and q.analytics_eligible
    and q.is_public
    and q.is_active
    and q.current_content_hash = q.verified_content_hash;

  if not found then
    raise exception using errcode = '23514',
      message = 'diagnostic_taxonomy_requires_current_verified_mapped_question';
  end if;
  if new.question_content_hash <> v_source.verified_content_hash then
    raise exception using errcode = '23514',
      message = 'diagnostic_taxonomy_question_hash_mismatch';
  end if;
  if new.scope_code <> v_source.scope_code
     or new.objective_code <> v_source.objective_code then
    raise exception using errcode = '23514',
      message = 'diagnostic_taxonomy_objective_mapping_mismatch';
  end if;
  if lower(trim(new.atomic_subskill_name)) in (
      lower(trim(coalesce(v_source.topic, ''))),
      lower(trim(coalesce(v_source.curriculum_strand, '')))
    ) then
    raise exception using errcode = '23514',
      message = 'diagnostic_taxonomy_subskill_must_be_atomic';
  end if;
  if lower(new.primary_skill_code) =
       'apply-' || public.curriculum_normalize_code(coalesce(v_source.topic, '')) then
    raise exception using errcode = '23514',
      message = 'diagnostic_taxonomy_skill_must_not_be_generic_apply_topic';
  end if;

  if new.supersedes_taxonomy_id is not null then
    select * into v_superseded
    from public.verified_question_diagnostic_taxonomy t
    where t.id = new.supersedes_taxonomy_id;
    if not found or v_superseded.question_id <> new.question_id
       or v_superseded.created_at >= new.created_at then
      raise exception using errcode = '23514',
        message = 'diagnostic_taxonomy_invalid_supersession';
    end if;
  end if;

  v_expected_hash := encode(extensions.digest(
    jsonb_build_object(
      'questionId', new.question_id,
      'questionContentHash', new.question_content_hash,
      'curriculumMappingId', new.curriculum_mapping_id,
      'scopeCode', new.scope_code,
      'objectiveCode', new.objective_code,
      'packageVersion', new.package_version,
      'taxonomyVersion', new.taxonomy_version,
      'primarySkillCode', new.primary_skill_code,
      'primarySkillName', new.primary_skill_name,
      'atomicSubskillCode', new.atomic_subskill_code,
      'atomicSubskillName', new.atomic_subskill_name,
      'assessmentProcessCode', new.assessment_process_code,
      'cognitiveProcess', new.cognitive_process,
      'evidenceStatement', new.evidence_statement,
      'secondarySkillCodes', to_jsonb(new.secondary_skill_codes),
      'reviewStatus', new.review_status,
      'humanReviewRequired', new.human_review_required,
      'confidenceScore', new.confidence_score
    )::text,
    'sha256'
  ), 'hex');

  if nullif(new.taxonomy_hash, '') is not null
     and new.taxonomy_hash <> v_expected_hash then
    raise exception using errcode = '23514',
      message = 'diagnostic_taxonomy_hash_mismatch';
  end if;
  new.taxonomy_hash := v_expected_hash;
  return new;
end;
$$;
revoke all on function private.validate_verified_question_diagnostic_taxonomy()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_validate_verified_question_diagnostic_taxonomy
  on public.verified_question_diagnostic_taxonomy;
create trigger trg_validate_verified_question_diagnostic_taxonomy
before insert on public.verified_question_diagnostic_taxonomy
for each row execute function private.validate_verified_question_diagnostic_taxonomy();

create or replace function private.reject_verified_question_taxonomy_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '55000',
    message = 'verified_question_diagnostic_taxonomy_is_append_only';
end;
$$;
revoke all on function private.reject_verified_question_taxonomy_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_verified_question_diagnostic_taxonomy_immutable
  on public.verified_question_diagnostic_taxonomy;
create trigger trg_verified_question_diagnostic_taxonomy_immutable
before update or delete on public.verified_question_diagnostic_taxonomy
for each row execute function private.reject_verified_question_taxonomy_mutation();

create or replace view private.active_verified_question_diagnostic_taxonomy
with (security_invoker = true)
as
select t.*
from public.verified_question_diagnostic_taxonomy t
where t.review_status = 'approved'
  and not t.human_review_required
  and not exists (
    select 1
    from public.verified_question_diagnostic_taxonomy successor
    where successor.supersedes_taxonomy_id = t.id
      and successor.review_status = 'approved'
      and not successor.human_review_required
  );
revoke all on private.active_verified_question_diagnostic_taxonomy
  from public, anon, authenticated, service_role;
grant select on private.active_verified_question_diagnostic_taxonomy to service_role;

comment on table public.verified_question_diagnostic_taxonomy is
  'Append-only, hash-bound diagnostic leaf and Brains Heist assessment-process mapping for a verified question. Existing curriculum objective mappings remain the coverage authority.';

-- Snapshot the approved diagnostic revision separately from immutable question
-- content. Completed historical assignments are intentionally not retrofitted.
alter table public.assignment_questions
  add column if not exists diagnostic_taxonomy_id uuid
    references public.verified_question_diagnostic_taxonomy(id) on delete restrict,
  add column if not exists diagnostic_taxonomy_hash text;

alter table public.assignment_questions
  drop constraint if exists assignment_questions_diagnostic_taxonomy_snapshot_check;
alter table public.assignment_questions
  add constraint assignment_questions_diagnostic_taxonomy_snapshot_check check (
    (diagnostic_taxonomy_id is null and diagnostic_taxonomy_hash is null)
    or (diagnostic_taxonomy_id is not null
      and diagnostic_taxonomy_hash ~ '^[0-9a-f]{64}$')
  );

create or replace function private.capture_assignment_question_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_question public.questions;
  v_assignment_teacher uuid;
  v_taxonomy record;
begin
  -- Ordinary assignment-question edits (for example, order changes) must not
  -- silently retrofit a newer taxonomy revision onto historical snapshots.
  -- The immutable guard runs first and rejects any direct snapshot mutation;
  -- this branch then preserves the accepted snapshot byte-for-byte.
  if tg_op = 'UPDATE' then
    if new.question_id = old.question_id then
      new.question_snapshot := old.question_snapshot;
      new.question_content_hash := old.question_content_hash;
      new.content_origin_snapshot := old.content_origin_snapshot;
      new.verification_status_snapshot := old.verification_status_snapshot;
      new.analytics_eligible_snapshot := old.analytics_eligible_snapshot;
      new.diagnostic_taxonomy_id := old.diagnostic_taxonomy_id;
      new.diagnostic_taxonomy_hash := old.diagnostic_taxonomy_hash;
      new.snapshotted_at := old.snapshotted_at;
      return new;
    end if;
  end if;

  select a.teacher_id into v_assignment_teacher
  from public.assignments a
  where a.id = new.assignment_id;
  if v_assignment_teacher is null then
    raise exception using errcode = '23503', message = 'assignment_not_found';
  end if;

  select q.* into v_question
  from public.questions q
  where q.id = new.question_id
    and q.is_active
    and (
      (q.content_origin = 'brain_heist'
        and q.verification_status = 'verified'
        and q.analytics_eligible
        and q.is_public
        and q.current_content_hash = q.verified_content_hash)
      or (q.content_origin = 'teacher' and q.teacher_id = v_assignment_teacher)
    );
  if v_question.id is null then
    raise exception using errcode = '42501',
      message = 'question_not_authorized_for_assignment';
  end if;

  select t.id, t.taxonomy_hash
  into v_taxonomy
  from private.active_verified_question_diagnostic_taxonomy t
  where t.question_id = v_question.id
    and t.question_content_hash = v_question.current_content_hash
  order by t.created_at desc, t.id desc
  limit 1;

  new.question_snapshot := to_jsonb(v_question);
  new.question_content_hash := v_question.current_content_hash;
  new.content_origin_snapshot := v_question.content_origin;
  new.verification_status_snapshot := v_question.verification_status;
  new.analytics_eligible_snapshot := v_question.content_origin = 'brain_heist'
    and v_question.verification_status = 'verified'
    and v_question.analytics_eligible
    and v_question.is_public
    and v_question.current_content_hash = v_question.verified_content_hash;
  new.diagnostic_taxonomy_id := v_taxonomy.id;
  new.diagnostic_taxonomy_hash := v_taxonomy.taxonomy_hash;
  new.snapshotted_at := now();
  return new;
end;
$$;
revoke all on function private.capture_assignment_question_snapshot()
  from public, anon, authenticated, service_role;

create or replace function private.guard_assignment_question_snapshot_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.question_id = old.question_id
     and row(
       new.question_snapshot,
       new.question_content_hash,
       new.content_origin_snapshot,
       new.verification_status_snapshot,
       new.analytics_eligible_snapshot,
       new.snapshotted_at,
       new.diagnostic_taxonomy_id,
       new.diagnostic_taxonomy_hash
     ) is distinct from row(
       old.question_snapshot,
       old.question_content_hash,
       old.content_origin_snapshot,
       old.verification_status_snapshot,
       old.analytics_eligible_snapshot,
       old.snapshotted_at,
       old.diagnostic_taxonomy_id,
       old.diagnostic_taxonomy_hash
     ) then
    raise exception using errcode = '55000',
      message = 'assignment_question_snapshot_is_immutable';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_assignment_question_snapshot_immutability()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_assignment_question_snapshot_immutable
  on public.assignment_questions;
drop trigger if exists trg_aaa_assignment_question_snapshot_immutable
  on public.assignment_questions;
drop trigger if exists trg_zzz_assignment_question_snapshot_immutable
  on public.assignment_questions;
create trigger trg_aaa_assignment_question_snapshot_immutable
before update on public.assignment_questions
for each row execute function private.guard_assignment_question_snapshot_immutability();

-- ---------------------------------------------------------------------------
-- 2. Append-only, answer-level verified evidence ledger
-- ---------------------------------------------------------------------------

create table if not exists public.student_learning_item_evidence (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  assignment_id uuid not null references public.assignments(id) on delete restrict,
  answer_id uuid not null
    references public.student_assignment_answers(id) on delete restrict,
  question_id uuid not null references public.questions(id) on delete restrict,
  academic_year_id uuid not null
    references public.school_academic_years(id) on delete restrict,
  academic_term_id uuid
    references public.school_academic_terms(id) on delete set null,
  academic_subject_id uuid not null
    references public.academic_subjects(id) on delete restrict,
  curriculum_scope_id uuid not null
    references public.curriculum_scopes(id) on delete restrict,
  curriculum_objective_id uuid not null
    references public.curriculum_objectives(id) on delete restrict,
  curriculum_mapping_id uuid not null
    references public.curriculum_item_objective_mappings(id) on delete restrict,
  diagnostic_taxonomy_id uuid
    references public.verified_question_diagnostic_taxonomy(id) on delete restrict,
  grade_level text not null check (grade_level ~ '^[0-9]+$'),
  question_content_hash text not null check (question_content_hash ~ '^[0-9a-f]{64}$'),
  is_correct boolean not null,
  is_independent_assessment boolean not null default true,
  answered_at timestamptz not null,
  evidence_authority text not null default 'brains_heist_verified_question'
    check (evidence_authority = 'brains_heist_verified_question'),
  taxonomy_snapshot jsonb not null,
  taxonomy_snapshot_hash text not null
    check (taxonomy_snapshot_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (answer_id, curriculum_mapping_id),
  check (jsonb_typeof(taxonomy_snapshot) = 'object')
);

alter table public.student_learning_item_evidence enable row level security;
revoke all on table public.student_learning_item_evidence
  from public, anon, authenticated, service_role;
grant select on table public.student_learning_item_evidence to service_role;

create index if not exists student_learning_item_evidence_student_time_idx
  on public.student_learning_item_evidence(
    student_id, academic_year_id, academic_subject_id, answered_at desc
  );
create index if not exists student_learning_item_evidence_objective_idx
  on public.student_learning_item_evidence(
    student_id, curriculum_objective_id, answered_at desc
  );
create index if not exists student_learning_item_evidence_diagnostic_idx
  on public.student_learning_item_evidence(
    student_id, diagnostic_taxonomy_id, answered_at desc
  ) where diagnostic_taxonomy_id is not null;

create or replace function private.reject_student_learning_item_evidence_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '55000',
    message = 'student_learning_item_evidence_is_append_only';
end;
$$;
revoke all on function private.reject_student_learning_item_evidence_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_student_learning_item_evidence_immutable
  on public.student_learning_item_evidence;
create trigger trg_student_learning_item_evidence_immutable
before update or delete on public.student_learning_item_evidence
for each row execute function private.reject_student_learning_item_evidence_mutation();

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

  select
    a.school_id,
    a.class_id,
    a.academic_year_id,
    a.academic_term_id,
    a.academic_subject_id,
    a.grade_level_snapshot,
    sa.batch as student_batch,
    sa.status,
    r.completed_at,
    count(aq.question_id)::integer as expected_count
  into v_assignment
  from public.assignments a
  join public.student_assignments sa
    on sa.assignment_id = a.id and sa.student_id = p_student_id
  join public.student_assignment_results r
    on r.assignment_id = a.id and r.student_id = p_student_id
  left join public.assignment_questions aq on aq.assignment_id = a.id
  where a.id = p_assignment_id
  group by
    a.school_id, a.class_id, a.academic_year_id, a.academic_term_id,
    a.academic_subject_id, a.grade_level_snapshot, sa.batch, sa.status,
    r.completed_at;

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
  from public.users u
  where u.id = p_student_id;
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
    select
      saa.id as answer_id,
      saa.question_id,
      saa.is_correct,
      coalesce(saa.answered_at, v_assignment.completed_at) as answered_at,
      q.verified_content_hash as question_content_hash,
      im.id as curriculum_mapping_id,
      im.curriculum_scope_id,
      im.curriculum_objective_id,
      im.framework_version_id,
      o.code as objective_code,
      o.statement as objective_statement,
      n.code as coverage_node_code,
      n.name as coverage_node_name,
      dt.id as diagnostic_taxonomy_id,
      exists (
        select 1
        from public.student_learning_intervention_practice_assignments practice
        where practice.assignment_id = p_assignment_id
          and practice.student_id = p_student_id
      ) as is_targeted_practice,
      jsonb_strip_nulls(jsonb_build_object(
        'frameworkVersionId', im.framework_version_id,
        'curriculumScopeId', im.curriculum_scope_id,
        'curriculumObjectiveId', im.curriculum_objective_id,
        'curriculumMappingId', im.id,
        'objectiveCode', o.code,
        'objective', o.statement,
        'coverageNodeCode', n.code,
        'coverageNodeName', n.name,
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
     and aq.content_origin_snapshot = 'brain_heist'
     and aq.verification_status_snapshot = 'verified'
    join public.questions q
      on q.id = saa.question_id
     and q.content_origin = 'brain_heist'
     and q.verification_status = 'verified'
     and q.analytics_eligible
     and q.is_public
     and q.is_active
     and q.current_content_hash = q.verified_content_hash
     and aq.question_content_hash = q.verified_content_hash
     and v_effective_grade::smallint = any(q.eligible_grade_levels)
    join public.curriculum_assessment_items i
      on i.source_type = 'question_bank'
     and i.source_record_id = q.id::text
     and i.source_item_key = 'question'
     and i.is_active
     and i.content_hash = q.verified_content_hash
    join public.school_curriculum_scope_mappings scm
      on scm.school_id = v_school_id
     and scm.academic_year_id = v_assignment.academic_year_id
     and scm.grade_level = v_effective_grade
     and scm.academic_subject_id = v_assignment.academic_subject_id
     and scm.status = 'active'
    join public.curriculum_item_objective_mappings im
      on im.assessment_item_id = i.id
     and im.curriculum_scope_id = scm.curriculum_scope_id
     and im.academic_subject_id = v_assignment.academic_subject_id
     and im.status = 'approved'
     and im.mapping_role = 'primary'
     and im.superseded_at is null
     and im.item_content_hash = i.content_hash
    join public.curriculum_framework_versions fv
      on fv.id = im.framework_version_id
     and fv.status in ('published', 'retired')
     and fv.content_hash = im.curriculum_version_content_hash
    join public.curriculum_objectives o
      on o.id = im.curriculum_objective_id and o.is_assessable
    join public.curriculum_nodes n on n.id = o.curriculum_node_id
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
    is_independent_assessment, answered_at, taxonomy_snapshot,
    taxonomy_snapshot_hash
  )
  select
    v_school_id, p_student_id, p_assignment_id, e.answer_id, e.question_id,
    v_assignment.academic_year_id, v_assignment.academic_term_id,
    v_assignment.academic_subject_id, e.curriculum_scope_id,
    e.curriculum_objective_id, e.curriculum_mapping_id,
    e.diagnostic_taxonomy_id, v_effective_grade, e.question_content_hash,
    e.is_correct, not e.is_targeted_practice, e.answered_at,
    e.taxonomy_snapshot,
    encode(extensions.digest(e.taxonomy_snapshot::text, 'sha256'), 'hex')
  from eligible e
  on conflict (answer_id, curriculum_mapping_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;
revoke all on function private.materialize_verified_assignment_item_evidence(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function private.ingest_verified_assignment_diagnostic_evidence(
  p_assignment_id uuid,
  p_student_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment record;
  v_group record;
  v_skill_key text;
  v_source_key text;
  v_percentage numeric;
  v_kind text;
  v_quality text;
begin
  perform private.materialize_verified_assignment_item_evidence(
    p_assignment_id, p_student_id
  );

  select
    coalesce(nullif(trim(a.subject_name), ''), nullif(trim(a.subject), ''),
      nullif(trim(a.subject_id), ''), s.name, 'General') as subject_name,
    a.title,
    a.teacher_id,
    a.academic_year_id,
    a.academic_term_id,
    a.academic_subject_id
  into v_assignment
  from public.assignments a
  left join public.academic_subjects s on s.id = a.academic_subject_id
  where a.id = p_assignment_id;
  if not found then return; end if;

  for v_group in
    select
      e.academic_year_id,
      e.academic_term_id,
      e.academic_subject_id,
      e.grade_level,
      e.curriculum_scope_id,
      e.curriculum_objective_id,
      e.curriculum_mapping_id,
      m.framework_version_id,
      min(o.code) as objective_code,
      min(o.statement) as objective_statement,
      min(t.scope_code) as scope_code,
      min(t.primary_skill_code) as primary_skill_code,
      min(t.primary_skill_name) as primary_skill_name,
      min(t.atomic_subskill_code) as atomic_subskill_code,
      min(t.atomic_subskill_name) as atomic_subskill_name,
      min(t.taxonomy_version) as taxonomy_version,
      t.assessment_process_code,
      t.cognitive_process,
      min(t.evidence_statement) as evidence_statement,
      array_agg(
        distinct t.evidence_statement order by t.evidence_statement
      ) as evidence_statements,
      count(*)::integer as question_count,
      count(*) filter (where e.is_correct)::integer as correct_count,
      bool_and(e.is_independent_assessment) as independent_assessment,
      array_agg(e.id order by e.answered_at, e.id) as item_evidence_ids,
      array_agg(e.answer_id order by e.answered_at, e.id) as answer_ids,
      array_agg(e.question_id order by e.answered_at, e.id) as question_ids,
      max(e.answered_at) as observed_at
    from public.student_learning_item_evidence e
    join public.verified_question_diagnostic_taxonomy t
      on t.id = e.diagnostic_taxonomy_id
    join public.curriculum_item_objective_mappings m
      on m.id = e.curriculum_mapping_id
    join public.curriculum_objectives o
      on o.id = e.curriculum_objective_id
    where e.assignment_id = p_assignment_id
      and e.student_id = p_student_id
      and e.diagnostic_taxonomy_id is not null
    group by
      e.academic_year_id,
      e.academic_term_id,
      e.academic_subject_id,
      e.grade_level,
      e.curriculum_scope_id,
      e.curriculum_objective_id,
      e.curriculum_mapping_id,
      m.framework_version_id,
      t.primary_skill_code,
      t.atomic_subskill_code,
      t.assessment_process_code,
      t.cognitive_process
  loop
    v_percentage := round(
      100 * v_group.correct_count::numeric / v_group.question_count::numeric,
      2
    );
    v_kind := case
      when v_percentage < 60 then 'focus'
      when v_percentage >= 80 then 'strength'
      else 'developing'
    end;
    v_quality := case
      when v_group.question_count < 3 then 'provisional'
      when v_group.question_count < 6 then 'standard'
      else 'strong'
    end;
    v_skill_key := concat_ws(
      ':', 'diagnostic', v_group.scope_code,
      v_group.primary_skill_code, v_group.atomic_subskill_code
    );
    v_source_key := concat_ws(
      ':', 'assignment', p_assignment_id::text,
      'diagnostic', md5(v_skill_key), v_group.curriculum_objective_id::text,
      v_group.assessment_process_code
    );

    insert into public.student_learning_observations(
      school_id, student_id, subject, topic, skill, subskill, skill_key,
      observation_type, source_type, source_id, source_key, observed_at,
      evidence_percentage, evidence_count, evidence_quality,
      contributes_to_focus_state, evidence, system_generated
    )
    select
      u.school_id, p_student_id, v_assignment.subject_name,
      v_group.primary_skill_name, v_group.primary_skill_name,
      v_group.atomic_subskill_name, v_skill_key, v_kind,
      'assignment_result', p_assignment_id, v_source_key,
      v_group.observed_at, v_percentage, v_group.question_count, v_quality,
      v_group.independent_assessment,
      jsonb_build_object(
        'source_label', 'Brains Heist Verified diagnostic evidence',
        'evidence_provenance', 'brains_heist_verified_question',
        'evidence_granularity', 'diagnostic_leaf',
        'assignment_id', p_assignment_id,
        'assignment_title', v_assignment.title,
        'teacher_id', v_assignment.teacher_id,
        'academic_year_id', v_assignment.academic_year_id,
        'academic_term_id', v_assignment.academic_term_id,
        'academic_subject_id', v_assignment.academic_subject_id,
        'grade_level', v_group.grade_level,
        'framework_version_id', v_group.framework_version_id,
        'curriculum_scope_id', v_group.curriculum_scope_id,
        'curriculum_objective_id', v_group.curriculum_objective_id,
        'curriculum_mapping_id', v_group.curriculum_mapping_id,
        'objective_code', v_group.objective_code,
        'objective', v_group.objective_statement,
        'scope_code', v_group.scope_code,
        'taxonomy_version', v_group.taxonomy_version,
        'primary_skill_code', v_group.primary_skill_code,
        'atomic_subskill_code', v_group.atomic_subskill_code,
        'assessment_process_code', v_group.assessment_process_code,
        'cognitive_process', v_group.cognitive_process,
        'evidence_statement', v_group.evidence_statement,
        'evidence_statements', to_jsonb(v_group.evidence_statements),
        'item_evidence_ids', to_jsonb(v_group.item_evidence_ids),
        'answer_ids', to_jsonb(v_group.answer_ids),
        'question_ids', to_jsonb(v_group.question_ids),
        'question_count', v_group.question_count,
        'correct', v_group.correct_count,
        'incorrect', v_group.question_count - v_group.correct_count,
        'independent_mastery_evidence', v_group.independent_assessment,
        'classification_thresholds', jsonb_build_object(
          'focus_below', 60, 'strength_from', 80
        )
      ),
      true
    from public.users u
    where u.id = p_student_id
    on conflict (student_id, source_key) do nothing;

    perform public.student_learning_refresh_focus_state(
      p_student_id, v_skill_key
    );
  end loop;
end;
$$;
revoke all on function private.ingest_verified_assignment_diagnostic_evidence(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function private.capture_verified_assignment_diagnostic_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ingest_verified_assignment_diagnostic_evidence(
    new.assignment_id, new.student_id
  );
  return new;
end;
$$;
revoke all on function private.capture_verified_assignment_diagnostic_evidence()
  from public, anon, authenticated, service_role;

-- Replace the legacy objective-only adapter. Keeping both result triggers
-- would create two competing focus states for the same work, and the legacy
-- payload did not mark targeted intervention practice as non-independent.
drop trigger if exists trg_student_learning_capture_assignment_result
  on public.student_assignment_results;

-- Preserve the established service/backfill function contract, but route all
-- future calls through the same strict item-ledger and diagnostic authority.
create or replace function public.student_learning_ingest_assignment_result(
  p_assignment_id uuid,
  p_student_id uuid,
  p_completed_at timestamptz,
  p_accuracy integer,
  p_score integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ingest_verified_assignment_diagnostic_evidence(
    p_assignment_id,
    p_student_id
  );
end;
$$;
revoke all on function public.student_learning_ingest_assignment_result(
  uuid, uuid, timestamptz, integer, integer
) from public, anon, authenticated;
grant execute on function public.student_learning_ingest_assignment_result(
  uuid, uuid, timestamptz, integer, integer
) to service_role;

comment on function public.student_learning_ingest_assignment_result(
  uuid, uuid, timestamptz, integer, integer
) is
  'Compatibility adapter routed to strict, grade-eligible, hash-bound Brains Heist Verified diagnostic evidence; caller-supplied aggregate scores are not evidence.';

drop trigger if exists trg_zzz_capture_verified_assignment_diagnostic_evidence
  on public.student_assignment_results;
create trigger trg_zzz_capture_verified_assignment_diagnostic_evidence
after insert or update on public.student_assignment_results
for each row execute function private.capture_verified_assignment_diagnostic_evidence();

comment on table public.student_learning_item_evidence is
  'Append-only answer ledger produced only from immutable Brains Heist Verified assignment snapshots, current verified hashes, grade eligibility, active school scope, and approved objective mappings.';

-- ---------------------------------------------------------------------------
-- 3. Final-review-only Writing Hub authority
-- ---------------------------------------------------------------------------

-- Automated analysis remains in Writing Hub history and the teacher review
-- queue, but may not create or change official Academic Profile states.
drop trigger if exists trg_bh_writing_assessments_immutable
  on public.bh_writing_assessments;
create trigger trg_bh_writing_assessments_immutable
before update or delete on public.bh_writing_assessments
for each row execute function private.reject_writing_assessment_history_mutation();

drop trigger if exists trg_bh_writing_assessment_reviews_immutable
  on public.bh_writing_assessment_reviews;
create trigger trg_bh_writing_assessment_reviews_immutable
before update or delete on public.bh_writing_assessment_reviews
for each row execute function private.reject_writing_assessment_history_mutation();

revoke update, delete on table public.bh_writing_assessments from service_role;
revoke update, delete on table public.bh_writing_assessment_reviews from service_role;

drop trigger if exists trg_student_learning_capture_writing_attempt
  on public.bh_writing_attempts;
drop trigger if exists trg_student_learning_capture_writing_focus_evidence
  on public.bh_writing_attempts;
drop trigger if exists zzz_student_learning_capture_writing_strength_evidence
  on public.bh_writing_attempts;

-- The final-review adapters already emit this source type. Earlier schema
-- versions omitted it from the original check, which meant the first real
-- teacher-final review would fail at insert time.
alter table public.student_learning_observations
  drop constraint if exists student_learning_observations_source_type_check;
alter table public.student_learning_observations
  add constraint student_learning_observations_source_type_check check (
    source_type in (
      'assignment_result',
      'writing_attempt',
      'writing_assessment_review',
      'teacher_observation',
      'import',
      'cambridge_attempt'
    )
  ) not valid;

create or replace function public.student_learning_observation_is_qualified(
  p_source_type text,
  p_contributes boolean,
  p_evidence jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_source_type = 'writing_attempt' then false
    when p_source_type = 'writing_assessment_review' then
      coalesce(p_contributes, false)
      and coalesce(p_evidence->>'writing_signal', '') in (
        'teacher_final_review', 'teacher_validated_weakness'
      )
    when p_source_type = 'assignment_result' then
      coalesce(p_contributes, false)
      and coalesce(p_evidence->>'evidence_provenance', '') =
        'brains_heist_verified_question'
      and lower(coalesce(p_evidence->>'intervention_practice', 'false')) <> 'true'
      and lower(coalesce(
        p_evidence->>'independent_mastery_evidence', 'true'
      )) <> 'false'
    when p_source_type = 'cambridge_attempt' then
      coalesce(p_evidence->>'scoring_authority', '') in (
        'teacher_verified', 'server_verified'
      )
      and jsonb_typeof(p_evidence->'mapping_snapshots') = 'array'
      and jsonb_array_length(p_evidence->'mapping_snapshots') > 0
    else coalesce(p_contributes, false)
  end;
$$;
revoke all on function public.student_learning_observation_is_qualified(
  text, boolean, jsonb
) from public, anon, authenticated;
grant execute on function public.student_learning_observation_is_qualified(
  text, boolean, jsonb
) to service_role;

-- NOT VALID preserves the append-only legacy rows while enforcing the rule on
-- every future insert/update. The qualification function above excludes all
-- legacy automated rows from decisions without rewriting them.
alter table public.student_learning_observations
  drop constraint if exists student_learning_writing_attempt_non_authoritative_chk;
alter table public.student_learning_observations
  add constraint student_learning_writing_attempt_non_authoritative_chk check (
    source_type <> 'writing_attempt' or not contributes_to_focus_state
  ) not valid;

create temporary table tmp_automated_writing_focus_keys on commit drop as
select distinct o.student_id, o.skill_key
from public.student_learning_observations o
where o.source_type = 'writing_attempt';

-- Focus/confidence rows are rebuildable projections, not source history.
-- Remove projections that have no remaining authoritative observation.
delete from public.student_learning_focus_states f
using tmp_automated_writing_focus_keys k
where f.student_id = k.student_id
  and f.skill_key = k.skill_key
  and not exists (
    select 1
    from public.student_learning_observations o
    where o.student_id = k.student_id
      and o.skill_key = k.skill_key
      and public.student_learning_observation_is_qualified(
        o.source_type, o.contributes_to_focus_state, o.evidence
      )
  );

delete from public.student_learning_confidence_states c
using tmp_automated_writing_focus_keys k
where c.student_id = k.student_id
  and c.skill_key = k.skill_key
  and not exists (
    select 1
    from public.student_learning_observations o
    where o.student_id = k.student_id
      and o.skill_key = k.skill_key
      and public.student_learning_observation_is_qualified(
        o.source_type, o.contributes_to_focus_state, o.evidence
      )
  );

do $rebuild_authoritative_writing_overlap$
declare
  v_key record;
begin
  for v_key in
    select k.student_id, k.skill_key
    from tmp_automated_writing_focus_keys k
    where exists (
      select 1
      from public.student_learning_observations o
      where o.student_id = k.student_id
        and o.skill_key = k.skill_key
        and public.student_learning_observation_is_qualified(
          o.source_type, o.contributes_to_focus_state, o.evidence
        )
    )
  loop
    perform public.student_learning_refresh_focus_state(
      v_key.student_id, v_key.skill_key
    );
  end loop;
end;
$rebuild_authoritative_writing_overlap$;
