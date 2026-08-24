-- Human-governed review workflow for proposed question diagnostic taxonomy.
--
-- Design guarantees:
--   * imported proposals and human decisions are immutable audit records;
--   * browser clients never receive raw table grants;
--   * every read and decision crosses a fail-closed superadmin RPC boundary;
--   * approval, retirement and correction append taxonomy successors rather
--     than updating or deleting verified_question_diagnostic_taxonomy rows;
--   * service imports are atomic, checksum-bound and idempotent.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Immutable import provenance and proposal queue
-- ---------------------------------------------------------------------------

create table if not exists public.question_taxonomy_review_batches (
  id uuid primary key default gen_random_uuid(),
  batch_key text not null unique,
  schema_version integer not null check (schema_version = 1),
  taxonomy_version text not null,
  source_artifact text not null,
  source_file_sha256 text not null,
  batch_checksum text not null unique,
  expected_total integer not null check (expected_total > 0),
  expected_verified integer not null check (expected_verified >= 0),
  expected_retired integer not null check (expected_retired >= 0),
  expected_in_review integer not null check (expected_in_review > 0),
  imported_count integer not null check (imported_count > 0),
  imported_by_authority text not null,
  imported_at timestamptz not null default now(),
  check (batch_key ~ '^[a-z0-9][a-z0-9._:-]{2,199}$'),
  check (taxonomy_version = public.curriculum_normalize_code(taxonomy_version)),
  check (length(trim(source_artifact)) between 3 and 500),
  check (source_file_sha256 ~ '^[0-9a-f]{64}$'),
  check (batch_checksum ~ '^[0-9a-f]{64}$'),
  check (expected_total = expected_verified + expected_retired),
  check (expected_in_review = expected_total),
  check (imported_count = expected_total)
);

create table if not exists public.question_taxonomy_review_queue (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null
    references public.question_taxonomy_review_batches(id) on delete restrict,
  proposal_key text not null unique,
  proposal_hash text not null unique,
  question_id uuid not null references public.questions(id) on delete restrict,
  external_id text,
  source_lifecycle_status text not null
    check (source_lifecycle_status in ('verified', 'retired')),
  assessment_item_id uuid not null
    references public.curriculum_assessment_items(id) on delete restrict,
  curriculum_mapping_id uuid not null
    references public.curriculum_item_objective_mappings(id) on delete restrict,
  mapping_drift boolean not null default false,
  question_content_hash text not null,
  framework_code text not null,
  framework_version_code text not null,
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
  assessment_process_name text not null,
  assessment_process_definition text not null,
  cognitive_process text not null
    check (cognitive_process in ('remember', 'understand', 'apply', 'analyze', 'evaluate')),
  evidence_statement text not null,
  secondary_skill_codes text[] not null default '{}',
  confidence_score numeric(4,3) not null check (confidence_score between 0 and 1),
  review_reason text not null,
  proposed_by_authority text not null,
  source_payload jsonb not null,
  supersedes_taxonomy_id uuid
    references public.verified_question_diagnostic_taxonomy(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (question_id, taxonomy_version),
  check (
    length(proposal_key) between 3 and 300
    and proposal_key ~ '^[a-z0-9][a-z0-9._:-]*$'
  ),
  check (proposal_hash ~ '^[0-9a-f]{64}$'),
  check (question_content_hash ~ '^[0-9a-f]{64}$'),
  check (framework_code = public.curriculum_normalize_code(framework_code)),
  check (framework_version_code = public.curriculum_normalize_code(framework_version_code)),
  check (scope_code = public.curriculum_normalize_code(scope_code)),
  check (objective_code = public.curriculum_normalize_code(objective_code)),
  check (taxonomy_version = public.curriculum_normalize_code(taxonomy_version)),
  check (
    primary_skill_code
      ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*([.][a-z0-9]+(-[a-z0-9]+)*)+$'
  ),
  check (
    atomic_subskill_code
      ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*([.][a-z0-9]+(-[a-z0-9]+)*)+$'
  ),
  check (length(trim(primary_skill_name)) between 3 and 160),
  check (length(trim(atomic_subskill_name)) between 3 and 200),
  check (length(trim(assessment_process_name)) between 3 and 160),
  check (length(trim(assessment_process_definition)) between 20 and 500),
  check (length(trim(evidence_statement)) between 30 and 500),
  check (length(trim(review_reason)) between 10 and 2000),
  check (primary_skill_code <> atomic_subskill_code),
  check (lower(trim(primary_skill_name)) <> lower(trim(atomic_subskill_name))),
  check (
    (assessment_process_code = 'AO1' and cognitive_process in ('remember', 'understand'))
    or (assessment_process_code = 'AO2' and cognitive_process = 'apply')
    or (assessment_process_code = 'AO3' and cognitive_process = 'analyze')
    or (assessment_process_code = 'AO4' and cognitive_process = 'evaluate')
  ),
  check (jsonb_typeof(source_payload) = 'object')
);

create table if not exists public.question_taxonomy_review_decisions (
  id uuid primary key default gen_random_uuid(),
  review_item_id uuid not null
    references public.question_taxonomy_review_queue(id) on delete restrict,
  previous_decision_id uuid unique
    references public.question_taxonomy_review_decisions(id) on delete restrict,
  decision text not null
    check (decision in ('approve', 'return', 'retire', 'supersede')),
  rationale text not null,
  decided_by uuid not null,
  decided_by_authority text not null,
  resulting_taxonomy_id uuid
    references public.verified_question_diagnostic_taxonomy(id) on delete restrict,
  decision_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  check (length(trim(rationale)) between 20 and 2000),
  check (length(trim(decided_by_authority)) between 3 and 200),
  check (jsonb_typeof(decision_snapshot) = 'object'),
  check (previous_decision_id is null or previous_decision_id <> id),
  check (
    (decision in ('approve', 'supersede') and resulting_taxonomy_id is not null)
    or decision in ('return', 'retire')
  )
);

alter table public.question_taxonomy_review_batches enable row level security;
alter table public.question_taxonomy_review_queue enable row level security;
alter table public.question_taxonomy_review_decisions enable row level security;

revoke all on table public.question_taxonomy_review_batches
  from public, anon, authenticated, service_role;
revoke all on table public.question_taxonomy_review_queue
  from public, anon, authenticated, service_role;
revoke all on table public.question_taxonomy_review_decisions
  from public, anon, authenticated, service_role;

grant select on table public.question_taxonomy_review_batches to service_role;
grant select on table public.question_taxonomy_review_queue to service_role;
grant select on table public.question_taxonomy_review_decisions to service_role;

create index if not exists question_taxonomy_review_queue_created_idx
  on public.question_taxonomy_review_queue(created_at, id);
create index if not exists question_taxonomy_review_queue_batch_idx
  on public.question_taxonomy_review_queue(batch_id);
create index if not exists question_taxonomy_review_queue_question_idx
  on public.question_taxonomy_review_queue(question_id, created_at desc);
create index if not exists question_taxonomy_review_queue_assessment_item_idx
  on public.question_taxonomy_review_queue(assessment_item_id);
create index if not exists question_taxonomy_review_queue_mapping_idx
  on public.question_taxonomy_review_queue(curriculum_mapping_id);
create index if not exists question_taxonomy_review_queue_supersedes_idx
  on public.question_taxonomy_review_queue(supersedes_taxonomy_id)
  where supersedes_taxonomy_id is not null;
create index if not exists question_taxonomy_review_queue_ao_confidence_idx
  on public.question_taxonomy_review_queue(assessment_process_code, confidence_score, created_at);
create index if not exists question_taxonomy_review_decisions_actor_idx
  on public.question_taxonomy_review_decisions(decided_by, created_at desc);
create index if not exists question_taxonomy_review_decisions_item_idx
  on public.question_taxonomy_review_decisions(review_item_id, created_at desc, id desc);
create index if not exists question_taxonomy_review_decisions_status_idx
  on public.question_taxonomy_review_decisions(decision, created_at desc);
create index if not exists question_taxonomy_review_decisions_result_idx
  on public.question_taxonomy_review_decisions(resulting_taxonomy_id)
  where resulting_taxonomy_id is not null;

create or replace function private.reject_question_taxonomy_review_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception using
    errcode = '55000',
    message = 'question_taxonomy_review_records_are_append_only';
end;
$function$;

revoke all on function private.reject_question_taxonomy_review_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_question_taxonomy_review_batches_immutable
  on public.question_taxonomy_review_batches;
create trigger trg_question_taxonomy_review_batches_immutable
before update or delete on public.question_taxonomy_review_batches
for each row execute function private.reject_question_taxonomy_review_mutation();

drop trigger if exists trg_question_taxonomy_review_queue_immutable
  on public.question_taxonomy_review_queue;
create trigger trg_question_taxonomy_review_queue_immutable
before update or delete on public.question_taxonomy_review_queue
for each row execute function private.reject_question_taxonomy_review_mutation();

drop trigger if exists trg_question_taxonomy_review_decisions_immutable
  on public.question_taxonomy_review_decisions;
create trigger trg_question_taxonomy_review_decisions_immutable
before update or delete on public.question_taxonomy_review_decisions
for each row execute function private.reject_question_taxonomy_review_mutation();

-- ---------------------------------------------------------------------------
-- 2. Atomic service-only import boundary
-- ---------------------------------------------------------------------------

create or replace function public.rpc_import_verified_question_taxonomy_review_batch(
  p_batch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_batch_key text;
  v_schema_version integer;
  v_taxonomy_version text;
  v_source_artifact text;
  v_source_file_sha256 text;
  v_batch_checksum text;
  v_expected_total integer;
  v_expected_verified integer;
  v_expected_retired integer;
  v_expected_in_review integer;
  v_proposals jsonb;
  v_batch_id uuid;
  v_existing public.question_taxonomy_review_batches%rowtype;
  v_entry jsonb;
  v_payload jsonb;
  v_question record;
  v_assessment_item_id uuid;
  v_mapping record;
  v_imported integer := 0;
  v_verified integer := 0;
  v_retired integer := 0;
  v_external_id text;
  v_source_status text;
  v_question_id uuid;
  v_existing_queue_count integer;
  v_mapping_drift boolean;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'service_role_taxonomy_import_required';
  end if;

  if p_batch is null or jsonb_typeof(p_batch) <> 'object' then
    raise exception using errcode = '22023', message = 'taxonomy_import_batch_object_required';
  end if;

  v_batch_key := lower(trim(coalesce(p_batch ->> 'batchId', '')));
  v_schema_version := coalesce((p_batch ->> 'schemaVersion')::integer, 0);
  v_taxonomy_version := public.curriculum_normalize_code(p_batch ->> 'taxonomyVersion');
  v_source_artifact := trim(coalesce(p_batch ->> 'sourceArtifact', ''));
  v_source_file_sha256 := lower(trim(coalesce(p_batch ->> 'sourceFileSha256', '')));
  v_batch_checksum := lower(trim(coalesce(p_batch ->> 'batchChecksum', '')));
  v_expected_total := coalesce((p_batch #>> '{expectedCounts,total}')::integer, -1);
  v_expected_verified := coalesce((p_batch #>> '{expectedCounts,verified}')::integer, -1);
  v_expected_retired := coalesce((p_batch #>> '{expectedCounts,retired}')::integer, -1);
  v_expected_in_review := coalesce((p_batch #>> '{expectedCounts,inReview}')::integer, -1);
  v_proposals := p_batch -> 'proposals';

  if v_batch_key !~ '^[a-z0-9][a-z0-9._:-]{2,199}$'
     or v_schema_version <> 1
     or v_taxonomy_version is null
     or length(v_source_artifact) not between 3 and 500
     or v_source_file_sha256 !~ '^[0-9a-f]{64}$'
     or v_batch_checksum !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(v_proposals) <> 'array'
     or v_expected_total <= 0
     or v_expected_verified < 0
     or v_expected_retired < 0
     or v_expected_in_review <> v_expected_total
     or v_expected_total <> v_expected_verified + v_expected_retired
     or jsonb_array_length(v_proposals) <> v_expected_total then
    raise exception using errcode = '22023', message = 'invalid_taxonomy_import_manifest';
  end if;

  select * into v_existing
  from public.question_taxonomy_review_batches b
  where b.batch_key = v_batch_key;

  if found then
    select count(*) into v_existing_queue_count
    from public.question_taxonomy_review_queue r
    where r.batch_id = v_existing.id;

    if v_existing.schema_version <> v_schema_version
       or v_existing.taxonomy_version <> v_taxonomy_version
       or v_existing.source_artifact <> v_source_artifact
       or v_existing.batch_checksum <> v_batch_checksum
       or v_existing.source_file_sha256 <> v_source_file_sha256
       or v_existing.expected_total <> v_expected_total
       or v_existing.expected_verified <> v_expected_verified
       or v_existing.expected_retired <> v_expected_retired
       or v_existing.expected_in_review <> v_expected_in_review
       or v_existing.imported_count <> v_existing_queue_count then
      raise exception using errcode = '23505', message = 'taxonomy_import_batch_identity_conflict';
    end if;
    return jsonb_build_object(
      'success', true,
      'alreadyImported', true,
      'batchId', v_existing.id,
      'batchChecksum', v_existing.batch_checksum,
      'total', v_existing.expected_total,
      'verified', v_existing.expected_verified,
      'retired', v_existing.expected_retired,
      'inReview', v_existing.expected_in_review,
      'inserted', 0,
      'existing', v_existing.imported_count
    );
  end if;

  insert into public.question_taxonomy_review_batches (
    batch_key, schema_version, taxonomy_version, source_artifact,
    source_file_sha256, batch_checksum, expected_total, expected_verified,
    expected_retired, expected_in_review, imported_count, imported_by_authority
  ) values (
    v_batch_key, v_schema_version, v_taxonomy_version, v_source_artifact,
    v_source_file_sha256, v_batch_checksum, v_expected_total, v_expected_verified,
    v_expected_retired, v_expected_in_review, v_expected_total,
    'service-role-verified-taxonomy-import'
  ) returning id into v_batch_id;

  for v_entry in select value from jsonb_array_elements(v_proposals)
  loop
    if jsonb_typeof(v_entry) <> 'object' or jsonb_typeof(v_entry -> 'payload') <> 'object' then
      raise exception using errcode = '22023', message = 'invalid_taxonomy_import_proposal';
    end if;

    v_payload := v_entry -> 'payload';
    v_question_id := (v_entry ->> 'sourceQuestionId')::uuid;
    v_external_id := nullif(trim(v_payload ->> 'externalId'), '');
    v_source_status := lower(trim(coalesce(v_entry ->> 'sourceLifecycleStatus', '')));

    if lower(trim(coalesce(v_entry ->> 'proposalKey', '')))
         <> v_taxonomy_version || ':' || lower(v_question_id::text)
       or lower(trim(coalesce(v_entry ->> 'proposalHash', ''))) !~ '^[0-9a-f]{64}$'
       or lower(trim(coalesce(v_entry ->> 'questionContentHash', ''))) !~ '^[0-9a-f]{64}$'
       or v_source_status not in ('verified', 'retired')
       or public.curriculum_normalize_code(v_payload ->> 'taxonomyVersion') <> v_taxonomy_version
       or nullif(public.curriculum_normalize_code(v_payload ->> 'frameworkCode'), '') is null
       or nullif(public.curriculum_normalize_code(v_payload ->> 'frameworkVersionCode'), '') is null
       or lower(coalesce(v_payload ->> 'reviewStatus', '')) <> 'in_review'
       or coalesce((v_payload ->> 'humanReview')::boolean, false) is not true
       or nullif(trim(v_payload ->> 'reviewReason'), '') is null
       or jsonb_typeof(v_payload -> 'governedMappings') <> 'array'
       or jsonb_array_length(v_payload -> 'governedMappings') = 0 then
      raise exception using errcode = '22023', message = 'invalid_taxonomy_import_proposal_metadata';
    end if;
    if jsonb_typeof(v_payload -> 'secondarySkillCodes') is distinct from 'array' then
      raise exception using errcode = '22023', message = 'invalid_taxonomy_secondary_skill_codes';
    end if;
    if exists (
      select 1
      from jsonb_array_elements_text(v_payload -> 'secondarySkillCodes') secondary(code)
      where lower(trim(secondary.code))
        !~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*([.][a-z0-9]+(-[a-z0-9]+)*)+$'
        or lower(trim(secondary.code)) = lower(trim(v_payload ->> 'primarySkillCode'))
        or lower(trim(secondary.code)) = lower(trim(v_payload ->> 'atomicSubskillCode'))
    ) or jsonb_array_length(v_payload -> 'secondarySkillCodes') <> (
      select count(distinct lower(trim(secondary.code)))
      from jsonb_array_elements_text(v_payload -> 'secondarySkillCodes') secondary(code)
    ) then
      raise exception using errcode = '22023', message = 'invalid_taxonomy_secondary_skill_codes';
    end if;

    select
      q.id,
      q.verified_external_id,
      q.verification_status,
      q.current_content_hash,
      q.verified_content_hash
    into v_question
    from public.questions q
    where q.id = v_question_id
      and (v_external_id is null or q.verified_external_id = v_external_id);

    if not found
       or v_question.verification_status <> v_source_status
       or v_question.current_content_hash
            <> lower(trim(v_entry ->> 'questionContentHash'))
       or v_question.current_content_hash <> v_question.verified_content_hash then
      raise exception using errcode = '23514', message = 'taxonomy_import_source_question_drift';
    end if;

    select i.id into v_assessment_item_id
    from public.curriculum_assessment_items i
    where i.source_type = 'question_bank'
      and i.source_record_id = v_question_id::text
      and i.source_item_key = 'question'
      and i.content_hash = v_question.current_content_hash
    order by i.is_active desc, i.created_at desc
    limit 1;

    if v_assessment_item_id is null then
      raise exception using errcode = '23514', message = 'taxonomy_import_assessment_item_missing';
    end if;

    select
      m.id,
      f.code as framework_code,
      fv.version_code as framework_version_code,
      s.code as scope_code,
      o.code as objective_code
    into v_mapping
    from public.curriculum_item_objective_mappings m
    join public.curriculum_scopes s on s.id = m.curriculum_scope_id
    join public.curriculum_objectives o
      on o.id = m.curriculum_objective_id and o.is_assessable
    join public.curriculum_framework_versions fv
      on fv.id = m.framework_version_id
     and fv.status in ('published', 'retired')
     and fv.content_hash = m.curriculum_version_content_hash
    join public.curriculum_frameworks f
      on f.id = fv.framework_id
    where m.assessment_item_id = v_assessment_item_id
      and m.item_content_hash = v_question.current_content_hash
      and f.code = public.curriculum_normalize_code(v_payload ->> 'frameworkCode')
      and fv.version_code = public.curriculum_normalize_code(v_payload ->> 'frameworkVersionCode')
      and s.code = public.curriculum_normalize_code(v_payload ->> 'scopeCode')
      and o.code = public.curriculum_normalize_code(v_payload ->> 'objectiveCode')
      and m.status in ('approved', 'superseded')
    order by case
      when m.status = 'approved' and m.mapping_role = 'primary'
        and m.superseded_at is null then 0
      when m.status = 'approved' then 1
      else 2
    end, m.created_at desc
    limit 1;

    if v_mapping.id is null then
      raise exception using errcode = '23514', message = 'taxonomy_import_objective_mapping_missing';
    end if;

    select exists (
      select 1
      from jsonb_array_elements(v_payload -> 'governedMappings') governed
      where not exists (
        select 1
        from public.curriculum_item_objective_mappings current_mapping
        join public.curriculum_scopes current_scope
          on current_scope.id = current_mapping.curriculum_scope_id
        join public.curriculum_objectives current_objective
          on current_objective.id = current_mapping.curriculum_objective_id
         and current_objective.is_assessable
        join public.curriculum_framework_versions current_version
          on current_version.id = current_mapping.framework_version_id
         and current_version.status in ('published', 'retired')
         and current_version.content_hash = current_mapping.curriculum_version_content_hash
        join public.curriculum_frameworks current_framework
          on current_framework.id = current_version.framework_id
        where current_mapping.assessment_item_id = v_assessment_item_id
          and current_mapping.status = 'approved'
          and current_mapping.mapping_role = 'primary'
          and current_mapping.superseded_at is null
          and current_mapping.item_content_hash = v_question.current_content_hash
          and current_framework.code = public.curriculum_normalize_code(
            v_payload ->> 'frameworkCode'
          )
          and current_version.version_code = governed ->> 'frameworkVersionCode'
          and current_scope.code = public.curriculum_normalize_code(governed ->> 'scopeCode')
          and current_objective.code = public.curriculum_normalize_code(governed ->> 'objectiveCode')
      )
    ) into v_mapping_drift;

    insert into public.question_taxonomy_review_queue (
      batch_id, proposal_key, proposal_hash, question_id, external_id,
      source_lifecycle_status, assessment_item_id, curriculum_mapping_id,
      mapping_drift, question_content_hash, framework_code, framework_version_code,
      scope_code, objective_code, package_version,
      taxonomy_version, primary_skill_code, primary_skill_name,
      atomic_subskill_code, atomic_subskill_name, assessment_process_code,
      assessment_process_name, assessment_process_definition, cognitive_process,
      evidence_statement, secondary_skill_codes, confidence_score, review_reason,
      proposed_by_authority, source_payload, supersedes_taxonomy_id
    ) values (
      v_batch_id,
      lower(trim(v_entry ->> 'proposalKey')),
      lower(trim(v_entry ->> 'proposalHash')),
      v_question_id,
      v_external_id,
      v_source_status,
      v_assessment_item_id,
      v_mapping.id,
      v_mapping_drift,
      lower(trim(v_entry ->> 'questionContentHash')),
      v_mapping.framework_code,
      v_mapping.framework_version_code,
      v_mapping.scope_code,
      v_mapping.objective_code,
      trim(v_payload ->> 'packageVersion'),
      v_taxonomy_version,
      lower(trim(v_payload ->> 'primarySkillCode')),
      trim(v_payload ->> 'primarySkillName'),
      lower(trim(v_payload ->> 'atomicSubskillCode')),
      trim(v_payload ->> 'atomicSubskillName'),
      upper(trim(v_payload ->> 'assessmentProcessCode')),
      trim(v_payload ->> 'assessmentProcessName'),
      trim(v_payload ->> 'assessmentProcessDefinition'),
      lower(trim(v_payload ->> 'cognitiveProcess')),
      trim(v_payload ->> 'evidenceStatement'),
      coalesce(array(
        select distinct lower(trim(value))
        from jsonb_array_elements_text(coalesce(v_payload -> 'secondarySkillCodes', '[]'::jsonb)) value
        order by lower(trim(value))
      ), '{}'::text[]),
      (v_payload ->> 'confidence')::numeric,
      trim(v_payload ->> 'reviewReason'),
      'service-role-verified-taxonomy-import',
      v_payload,
      null
    );

    v_imported := v_imported + 1;
    if v_source_status = 'verified' then
      v_verified := v_verified + 1;
    else
      v_retired := v_retired + 1;
    end if;
  end loop;

  if v_imported <> v_expected_total
     or v_verified <> v_expected_verified
     or v_retired <> v_expected_retired then
    raise exception using errcode = '23514', message = 'taxonomy_import_count_mismatch';
  end if;

  return jsonb_build_object(
    'success', true,
    'batchId', v_batch_id,
    'batchChecksum', v_batch_checksum,
    'total', v_imported,
    'verified', v_verified,
    'retired', v_retired,
    'inReview', v_imported,
    'inserted', v_imported,
    'existing', 0
  );
end;
$function$;

revoke all on function public.rpc_import_verified_question_taxonomy_review_batch(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_import_verified_question_taxonomy_review_batch(jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. Hidden chunk staging for gateways with smaller request-body limits
-- ---------------------------------------------------------------------------

create table if not exists private.question_taxonomy_review_staging_manifests (
  batch_key text primary key,
  schema_version integer not null check (schema_version = 1),
  taxonomy_version text not null,
  source_artifact text not null,
  source_file_sha256 text not null,
  batch_checksum text not null,
  expected_total integer not null check (expected_total > 0),
  expected_verified integer not null check (expected_verified >= 0),
  expected_retired integer not null check (expected_retired >= 0),
  expected_in_review integer not null check (expected_in_review > 0),
  total_chunks integer not null check (total_chunks between 1 and 1000),
  manifest_snapshot jsonb not null,
  staged_at timestamptz not null default now(),
  check (batch_key ~ '^[a-z0-9][a-z0-9._:-]{2,199}$'),
  check (taxonomy_version = public.curriculum_normalize_code(taxonomy_version)),
  check (source_file_sha256 ~ '^[0-9a-f]{64}$'),
  check (batch_checksum ~ '^[0-9a-f]{64}$'),
  check (expected_total = expected_verified + expected_retired),
  check (expected_in_review = expected_total),
  check (jsonb_typeof(manifest_snapshot) = 'object')
);

create table if not exists private.question_taxonomy_review_staging_chunks (
  batch_key text not null
    references private.question_taxonomy_review_staging_manifests(batch_key) on delete restrict,
  chunk_index integer not null check (chunk_index >= 0),
  chunk_checksum text not null check (chunk_checksum ~ '^[0-9a-f]{64}$'),
  proposal_count integer not null check (proposal_count between 1 and 100),
  proposals jsonb not null,
  staged_at timestamptz not null default now(),
  primary key (batch_key, chunk_index),
  check (jsonb_typeof(proposals) = 'array'),
  check (jsonb_array_length(proposals) = proposal_count)
);

alter table private.question_taxonomy_review_staging_manifests enable row level security;
alter table private.question_taxonomy_review_staging_chunks enable row level security;
revoke all on table private.question_taxonomy_review_staging_manifests
  from public, anon, authenticated, service_role;
revoke all on table private.question_taxonomy_review_staging_chunks
  from public, anon, authenticated, service_role;

drop trigger if exists trg_question_taxonomy_review_staging_manifests_immutable
  on private.question_taxonomy_review_staging_manifests;
create trigger trg_question_taxonomy_review_staging_manifests_immutable
before update or delete on private.question_taxonomy_review_staging_manifests
for each row execute function private.reject_question_taxonomy_review_mutation();

drop trigger if exists trg_question_taxonomy_review_staging_chunks_immutable
  on private.question_taxonomy_review_staging_chunks;
create trigger trg_question_taxonomy_review_staging_chunks_immutable
before update or delete on private.question_taxonomy_review_staging_chunks
for each row execute function private.reject_question_taxonomy_review_mutation();

create or replace function public.rpc_stage_verified_question_taxonomy_review_manifest(
  p_manifest jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_batch_key text;
  v_schema_version integer;
  v_taxonomy_version text;
  v_source_artifact text;
  v_source_file_sha256 text;
  v_batch_checksum text;
  v_expected_total integer;
  v_expected_verified integer;
  v_expected_retired integer;
  v_expected_in_review integer;
  v_total_chunks integer;
  v_existing private.question_taxonomy_review_staging_manifests%rowtype;
  v_inserted boolean;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_taxonomy_import_required';
  end if;
  if p_manifest is null or jsonb_typeof(p_manifest) <> 'object' then
    raise exception using errcode = '22023', message = 'taxonomy_staging_manifest_object_required';
  end if;

  v_batch_key := lower(trim(coalesce(p_manifest ->> 'batchId', '')));
  v_schema_version := coalesce((p_manifest ->> 'schemaVersion')::integer, 0);
  v_taxonomy_version := public.curriculum_normalize_code(p_manifest ->> 'taxonomyVersion');
  v_source_artifact := trim(coalesce(p_manifest ->> 'sourceArtifact', ''));
  v_source_file_sha256 := lower(trim(coalesce(p_manifest ->> 'sourceFileSha256', '')));
  v_batch_checksum := lower(trim(coalesce(p_manifest ->> 'batchChecksum', '')));
  v_expected_total := coalesce((p_manifest #>> '{expectedCounts,total}')::integer, -1);
  v_expected_verified := coalesce((p_manifest #>> '{expectedCounts,verified}')::integer, -1);
  v_expected_retired := coalesce((p_manifest #>> '{expectedCounts,retired}')::integer, -1);
  v_expected_in_review := coalesce((p_manifest #>> '{expectedCounts,inReview}')::integer, -1);
  v_total_chunks := coalesce((p_manifest ->> 'totalChunks')::integer, -1);

  if v_batch_key !~ '^[a-z0-9][a-z0-9._:-]{2,199}$'
     or v_schema_version <> 1
     or v_taxonomy_version is null
     or length(v_source_artifact) not between 3 and 500
     or v_source_file_sha256 !~ '^[0-9a-f]{64}$'
     or v_batch_checksum !~ '^[0-9a-f]{64}$'
     or v_expected_total <= 0
     or v_expected_verified < 0
     or v_expected_retired < 0
     or v_expected_total <> v_expected_verified + v_expected_retired
     or v_expected_in_review <> v_expected_total
     or v_total_chunks not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'invalid_taxonomy_staging_manifest';
  end if;

  insert into private.question_taxonomy_review_staging_manifests (
    batch_key, schema_version, taxonomy_version, source_artifact,
    source_file_sha256, batch_checksum, expected_total, expected_verified,
    expected_retired, expected_in_review, total_chunks, manifest_snapshot
  ) values (
    v_batch_key, v_schema_version, v_taxonomy_version, v_source_artifact,
    v_source_file_sha256, v_batch_checksum, v_expected_total, v_expected_verified,
    v_expected_retired, v_expected_in_review, v_total_chunks, p_manifest
  ) on conflict (batch_key) do nothing
  returning true into v_inserted;

  select * into v_existing
  from private.question_taxonomy_review_staging_manifests manifest
  where manifest.batch_key = v_batch_key;

  if not found
     or v_existing.manifest_snapshot <> p_manifest
     or v_existing.batch_checksum <> v_batch_checksum
     or v_existing.source_file_sha256 <> v_source_file_sha256
     or v_existing.total_chunks <> v_total_chunks then
    raise exception using errcode = '23505', message = 'taxonomy_staging_manifest_identity_conflict';
  end if;

  return jsonb_build_object(
    'success', true,
    'batchId', v_batch_key,
    'batchChecksum', v_batch_checksum,
    'totalChunks', v_total_chunks,
    'inserted', coalesce(v_inserted, false)
  );
end;
$function$;

revoke all on function public.rpc_stage_verified_question_taxonomy_review_manifest(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_stage_verified_question_taxonomy_review_manifest(jsonb)
  to service_role;

create or replace function public.rpc_stage_verified_question_taxonomy_review_chunk(
  p_batch_id text,
  p_chunk_index integer,
  p_chunk_checksum text,
  p_proposals jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_batch_key text := lower(trim(coalesce(p_batch_id, '')));
  v_checksum text := lower(trim(coalesce(p_chunk_checksum, '')));
  v_manifest private.question_taxonomy_review_staging_manifests%rowtype;
  v_computed_checksum text;
  v_existing private.question_taxonomy_review_staging_chunks%rowtype;
  v_proposal_count integer;
  v_unique_keys integer;
  v_unique_hashes integer;
  v_inserted boolean;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_taxonomy_import_required';
  end if;
  select * into v_manifest
  from private.question_taxonomy_review_staging_manifests manifest
  where manifest.batch_key = v_batch_key;
  if not found then
    raise exception using errcode = 'P0002', message = 'taxonomy_staging_manifest_not_found';
  end if;
  if p_chunk_index is null or p_chunk_index < 0 or p_chunk_index >= v_manifest.total_chunks
     or v_checksum !~ '^[0-9a-f]{64}$'
     or p_proposals is null or jsonb_typeof(p_proposals) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_taxonomy_staging_chunk';
  end if;

  v_proposal_count := jsonb_array_length(p_proposals);
  if v_proposal_count not between 1 and 100 then
    raise exception using errcode = '22023', message = 'taxonomy_staging_chunk_size_exceeded';
  end if;
  if octet_length(p_proposals::text) > 512000 then
    raise exception using errcode = '22023', message = 'taxonomy_staging_chunk_payload_too_large';
  end if;

  select
    count(distinct proposal ->> 'proposalKey'),
    count(distinct proposal ->> 'proposalHash'),
    encode(extensions.digest(
      string_agg(
        (proposal ->> 'proposalKey') || ':' || (proposal ->> 'proposalHash') || ':'
          || (proposal ->> 'sourceLifecycleStatus'),
        E'\n' order by proposal ->> 'proposalKey'
      ),
      'sha256'
    ), 'hex')
  into v_unique_keys, v_unique_hashes, v_computed_checksum
  from jsonb_array_elements(p_proposals) proposal;

  if v_unique_keys <> v_proposal_count
     or v_unique_hashes <> v_proposal_count
     or v_computed_checksum <> v_checksum then
    raise exception using errcode = '23514', message = 'taxonomy_staging_chunk_checksum_mismatch';
  end if;

  insert into private.question_taxonomy_review_staging_chunks (
    batch_key, chunk_index, chunk_checksum, proposal_count, proposals
  ) values (
    v_batch_key, p_chunk_index, v_checksum, v_proposal_count, p_proposals
  ) on conflict (batch_key, chunk_index) do nothing
  returning true into v_inserted;

  select * into v_existing
  from private.question_taxonomy_review_staging_chunks chunk
  where chunk.batch_key = v_batch_key and chunk.chunk_index = p_chunk_index;

  if not found
     or v_existing.chunk_checksum <> v_checksum
     or v_existing.proposals <> p_proposals then
    raise exception using errcode = '23505', message = 'taxonomy_staging_chunk_identity_conflict';
  end if;

  return jsonb_build_object(
    'success', true,
    'batchId', v_batch_key,
    'chunkIndex', p_chunk_index,
    'chunkChecksum', v_checksum,
    'proposalCount', v_proposal_count,
    'inserted', coalesce(v_inserted, false)
  );
end;
$function$;

revoke all on function public.rpc_stage_verified_question_taxonomy_review_chunk(
  text,integer,text,jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.rpc_stage_verified_question_taxonomy_review_chunk(
  text,integer,text,jsonb
) to service_role;

create or replace function public.rpc_finalize_verified_question_taxonomy_review_batch(
  p_batch_id text,
  p_batch_checksum text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_batch_key text := lower(trim(coalesce(p_batch_id, '')));
  v_checksum text := lower(trim(coalesce(p_batch_checksum, '')));
  v_manifest private.question_taxonomy_review_staging_manifests%rowtype;
  v_chunk_count integer;
  v_min_chunk integer;
  v_max_chunk integer;
  v_total integer;
  v_verified integer;
  v_retired integer;
  v_unique_keys integer;
  v_unique_hashes integer;
  v_computed_checksum text;
  v_proposals jsonb;
  v_batch jsonb;
  v_result jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_taxonomy_import_required';
  end if;
  if v_checksum !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_taxonomy_finalize_checksum';
  end if;

  select * into v_manifest
  from private.question_taxonomy_review_staging_manifests manifest
  where manifest.batch_key = v_batch_key
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'taxonomy_staging_manifest_not_found';
  end if;
  if v_manifest.batch_checksum <> v_checksum then
    raise exception using errcode = '23514', message = 'taxonomy_finalize_manifest_checksum_mismatch';
  end if;

  select count(*), min(chunk_index), max(chunk_index)
  into v_chunk_count, v_min_chunk, v_max_chunk
  from private.question_taxonomy_review_staging_chunks chunk
  where chunk.batch_key = v_batch_key;
  if v_chunk_count <> v_manifest.total_chunks
     or v_min_chunk <> 0
     or v_max_chunk <> v_manifest.total_chunks - 1 then
    raise exception using errcode = '23514', message = 'taxonomy_staging_chunks_incomplete';
  end if;

  select jsonb_agg(entry.proposal order by entry.chunk_index, entry.ordinality)
  into v_proposals
  from (
    select chunk.chunk_index, proposal.proposal, proposal.ordinality
    from private.question_taxonomy_review_staging_chunks chunk
    cross join lateral jsonb_array_elements(chunk.proposals)
      with ordinality as proposal(proposal, ordinality)
    where chunk.batch_key = v_batch_key
  ) entry;

  select
    count(*),
    count(*) filter (where proposal ->> 'sourceLifecycleStatus' = 'verified'),
    count(*) filter (where proposal ->> 'sourceLifecycleStatus' = 'retired'),
    count(distinct proposal ->> 'proposalKey'),
    count(distinct proposal ->> 'proposalHash'),
    encode(extensions.digest(
      string_agg(
        (proposal ->> 'proposalKey') || ':' || (proposal ->> 'proposalHash') || ':'
          || (proposal ->> 'sourceLifecycleStatus'),
        E'\n' order by proposal ->> 'proposalKey'
      ),
      'sha256'
    ), 'hex')
  into v_total, v_verified, v_retired, v_unique_keys, v_unique_hashes, v_computed_checksum
  from jsonb_array_elements(v_proposals) proposal;

  if v_total <> v_manifest.expected_total
     or v_verified <> v_manifest.expected_verified
     or v_retired <> v_manifest.expected_retired
     or v_total <> v_manifest.expected_in_review
     or v_unique_keys <> v_total
     or v_unique_hashes <> v_total
     or v_computed_checksum <> v_manifest.batch_checksum then
    raise exception using errcode = '23514', message = 'taxonomy_staging_finalize_preflight_failed';
  end if;

  v_batch := jsonb_build_object(
    'schemaVersion', v_manifest.schema_version,
    'batchId', v_manifest.batch_key,
    'taxonomyVersion', v_manifest.taxonomy_version,
    'sourceArtifact', v_manifest.source_artifact,
    'sourceFileSha256', v_manifest.source_file_sha256,
    'batchChecksum', v_manifest.batch_checksum,
    'expectedCounts', jsonb_build_object(
      'total', v_manifest.expected_total,
      'verified', v_manifest.expected_verified,
      'retired', v_manifest.expected_retired,
      'inReview', v_manifest.expected_in_review
    ),
    'proposals', v_proposals
  );

  v_result := public.rpc_import_verified_question_taxonomy_review_batch(v_batch);
  return v_result || jsonb_build_object('transport', 'staged-chunks');
end;
$function$;

revoke all on function public.rpc_finalize_verified_question_taxonomy_review_batch(text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_finalize_verified_question_taxonomy_review_batch(text,text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. Fail-closed superadmin review catalog
-- ---------------------------------------------------------------------------

create or replace function public.rpc_superadmin_question_taxonomy_review_queue(
  p_status text default 'in_review',
  p_search text default null,
  p_subject text default null,
  p_assessment_process_code text default null,
  p_confidence_band text default 'all',
  p_limit integer default 20,
  p_after_created_at timestamptz default null,
  p_after_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_status text := lower(coalesce(nullif(trim(p_status), ''), 'in_review'));
  v_search text := nullif(trim(p_search), '');
  v_subject text := nullif(trim(p_subject), '');
  v_ao text := upper(nullif(trim(p_assessment_process_code), ''));
  v_confidence text := lower(coalesce(nullif(trim(p_confidence_band), ''), 'all'));
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_superadmin(auth.uid()) then
    raise exception using
      errcode = '42501',
      message = 'platform_superadmin_access_required';
  end if;

  if v_status not in ('all', 'in_review', 'approved', 'returned', 'retired', 'superseded') then
    raise exception using errcode = '22023', message = 'invalid_taxonomy_review_status_filter';
  end if;
  if v_ao is not null and v_ao not in ('AO1', 'AO2', 'AO3', 'AO4') then
    raise exception using errcode = '22023', message = 'invalid_assessment_process_filter';
  end if;
  if v_confidence not in ('all', 'low', 'medium', 'high') then
    raise exception using errcode = '22023', message = 'invalid_taxonomy_confidence_filter';
  end if;
  if (p_after_created_at is null) <> (p_after_id is null) then
    raise exception using errcode = '22023', message = 'complete_taxonomy_review_cursor_required';
  end if;

  with base as (
    select
      r.*,
      q.subject,
      q.topic,
      q.difficulty,
      q.question_text,
      q.question_type,
      q.options,
      q.correct_answer,
      q.explanation,
      q.image_url,
      q.image_alt_text,
      q.grade_level,
      q.eligible_grade_levels,
      q.verification_status,
      q.is_active,
      q.is_public,
      q.analytics_eligible,
      q.current_content_hash,
      o.statement as objective_statement,
      batch.source_artifact,
      d.id as decision_id,
      d.decision,
      d.rationale as decision_rationale,
      d.decided_by,
      d.decided_by_authority,
      d.resulting_taxonomy_id,
      d.created_at as decided_at,
      exists (
        select 1
        from public.verified_question_diagnostic_taxonomy active_taxonomy
        where active_taxonomy.question_id = r.question_id
          and active_taxonomy.review_status = 'approved'
          and not active_taxonomy.human_review_required
          and not exists (
            select 1
            from public.verified_question_diagnostic_taxonomy active_successor
            where active_successor.supersedes_taxonomy_id = active_taxonomy.id
              and active_successor.review_status in ('approved', 'retired')
          )
      ) as has_active_taxonomy,
      exists (
        select 1
        from public.curriculum_item_objective_mappings proposed_current_mapping
        join public.curriculum_scopes proposed_current_scope
          on proposed_current_scope.id = proposed_current_mapping.curriculum_scope_id
        join public.curriculum_objectives proposed_current_objective
          on proposed_current_objective.id = proposed_current_mapping.curriculum_objective_id
        join public.curriculum_framework_versions proposed_current_version
          on proposed_current_version.id = proposed_current_mapping.framework_version_id
         and proposed_current_version.status in ('published', 'retired')
         and proposed_current_version.content_hash
               = proposed_current_mapping.curriculum_version_content_hash
        join public.curriculum_frameworks proposed_current_framework
          on proposed_current_framework.id = proposed_current_version.framework_id
        where proposed_current_mapping.assessment_item_id = r.assessment_item_id
          and proposed_current_mapping.status = 'approved'
          and proposed_current_mapping.mapping_role = 'primary'
          and proposed_current_mapping.superseded_at is null
          and proposed_current_mapping.item_content_hash = r.question_content_hash
          and proposed_current_framework.code = r.framework_code
          and proposed_current_version.version_code = r.framework_version_code
          and proposed_current_scope.code = r.scope_code
          and proposed_current_objective.code = r.objective_code
      ) as proposal_primary_current,
      (
        r.mapping_drift
        or not exists (
          select 1
          from public.curriculum_item_objective_mappings current_mapping
          join public.curriculum_scopes current_scope
            on current_scope.id = current_mapping.curriculum_scope_id
          join public.curriculum_objectives current_objective
            on current_objective.id = current_mapping.curriculum_objective_id
          join public.curriculum_framework_versions current_version
            on current_version.id = current_mapping.framework_version_id
           and current_version.status in ('published', 'retired')
           and current_version.content_hash = current_mapping.curriculum_version_content_hash
          join public.curriculum_frameworks current_framework
            on current_framework.id = current_version.framework_id
          where current_mapping.assessment_item_id = r.assessment_item_id
            and current_mapping.status = 'approved'
            and current_mapping.mapping_role = 'primary'
            and current_mapping.superseded_at is null
            and current_mapping.item_content_hash = r.question_content_hash
            and current_framework.code = r.framework_code
            and current_version.version_code = r.framework_version_code
            and current_scope.code = r.scope_code
            and current_objective.code = r.objective_code
        )
      ) as current_mapping_drift,
      case d.decision
        when 'approve' then 'approved'
        when 'return' then 'returned'
        when 'retire' then 'retired'
        when 'supersede' then 'superseded'
        else 'in_review'
      end as review_status,
      (
        q.content_origin = 'brain_heist'
        and q.verification_status = 'verified'
        and q.analytics_eligible
        and q.is_public
        and q.is_active
        and q.current_content_hash = q.verified_content_hash
        and q.current_content_hash = r.question_content_hash
        and ai.is_active
        and ai.source_type = 'question_bank'
        and ai.source_record_id = q.id::text
        and ai.source_item_key = 'question'
        and ai.content_hash = r.question_content_hash
      ) as source_eligible
    from public.question_taxonomy_review_queue r
    join public.questions q on q.id = r.question_id
    join public.question_taxonomy_review_batches batch on batch.id = r.batch_id
    join public.curriculum_assessment_items ai on ai.id = r.assessment_item_id
    join public.curriculum_item_objective_mappings m on m.id = r.curriculum_mapping_id
    join public.curriculum_objectives o on o.id = m.curriculum_objective_id
    left join lateral (
      select decision.*
      from public.question_taxonomy_review_decisions decision
      where decision.review_item_id = r.id
      order by decision.created_at desc, decision.id desc
      limit 1
    ) d on true
  ),
  filtered as (
    select *
    from base b
    where (v_status = 'all' or b.review_status = v_status)
      and (v_subject is null or lower(b.subject) = lower(v_subject))
      and (v_ao is null or b.assessment_process_code = v_ao)
      and (
        v_confidence = 'all'
        or (v_confidence = 'low' and b.confidence_score < 0.900)
        or (v_confidence = 'medium' and b.confidence_score >= 0.900 and b.confidence_score < 0.950)
        or (v_confidence = 'high' and b.confidence_score >= 0.950)
      )
      and (
        v_search is null
        or concat_ws(' ', b.external_id, b.subject, b.topic, b.question_text,
          b.correct_answer, b.explanation, b.scope_code, b.objective_code,
          b.framework_code, b.framework_version_code, b.objective_statement,
          b.primary_skill_code, b.primary_skill_name,
          b.atomic_subskill_code, b.atomic_subskill_name,
          b.assessment_process_code, b.cognitive_process, b.evidence_statement,
          b.review_reason, b.decision_rationale
        ) ilike '%' || v_search || '%'
      )
  ),
  cursor_page as (
    select *
    from filtered b
    where p_after_created_at is null
      or (b.created_at, b.id) > (p_after_created_at, p_after_id)
    order by b.created_at, b.id
    limit v_limit + 1
  ),
  visible_page as (
    select * from cursor_page order by created_at, id limit v_limit
  )
  select jsonb_build_object(
    'success', true,
    'summary', (
      select jsonb_build_object(
        'total', count(*),
        'inReview', count(*) filter (where review_status = 'in_review'),
        'approved', count(*) filter (where review_status = 'approved'),
        'returned', count(*) filter (where review_status = 'returned'),
        'retired', count(*) filter (where review_status = 'retired'),
        'superseded', count(*) filter (where review_status = 'superseded'),
        'sourceBlocked', count(*) filter (where not source_eligible),
        'mappingDrift', count(*) filter (where current_mapping_drift)
      )
      from base
    ),
    'filters', jsonb_build_object(
      'subjects', coalesce((
        select jsonb_agg(jsonb_build_object('name', subject, 'count', item_count) order by subject)
        from (
          select subject, count(*) as item_count from base group by subject
        ) subject_counts
      ), '[]'::jsonb),
      'assessmentProcesses', coalesce((
        select jsonb_agg(jsonb_build_object('code', assessment_process_code, 'count', item_count)
          order by assessment_process_code)
        from (
          select assessment_process_code, count(*) as item_count
          from base group by assessment_process_code
        ) ao_counts
      ), '[]'::jsonb)
    ),
    'total', (select count(*) from filtered),
    'limit', v_limit,
    'hasMore', (select count(*) > v_limit from cursor_page),
    'nextCursor', case when (select count(*) > v_limit from cursor_page) then (
      select jsonb_build_object('createdAt', p.created_at, 'id', p.id)
      from visible_page p order by p.created_at desc, p.id desc limit 1
    ) else null end,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id,
        'status', b.review_status,
        'sourceEligible', b.source_eligible,
        'mappingDrift', b.current_mapping_drift,
        'hasActiveTaxonomy', b.has_active_taxonomy,
        'proposalPrimaryCurrent', b.proposal_primary_current,
        'exactApprovalEligible', b.source_eligible and b.proposal_primary_current
          and not b.has_active_taxonomy,
        'question', jsonb_strip_nulls(jsonb_build_object(
          'id', b.question_id,
          'externalId', b.external_id,
          'subject', b.subject,
          'topic', b.topic,
          'difficulty', b.difficulty,
          'questionText', b.question_text,
          'questionType', b.question_type,
          'options', b.options,
          'correctAnswer', b.correct_answer,
          'explanation', b.explanation,
          'imageUrl', b.image_url,
          'imageAltText', b.image_alt_text,
          'gradeLevel', b.grade_level,
          'eligibleGradeLevels', to_jsonb(b.eligible_grade_levels),
          'verificationStatus', b.verification_status,
          'isActive', b.is_active
        )),
        'proposal', jsonb_build_object(
          'id', b.id,
          'proposalKey', b.proposal_key,
          'proposalHash', b.proposal_hash,
          'assessmentItemId', b.assessment_item_id,
          'curriculumMappingId', b.curriculum_mapping_id,
          'frameworkCode', b.framework_code,
          'frameworkVersionCode', b.framework_version_code,
          'scopeCode', b.scope_code,
          'objectiveCode', b.objective_code,
          'objectiveStatement', b.objective_statement,
          'packageVersion', b.package_version,
          'taxonomyVersion', b.taxonomy_version,
          'primarySkillCode', b.primary_skill_code,
          'primarySkillName', b.primary_skill_name,
          'atomicSubskillCode', b.atomic_subskill_code,
          'atomicSubskillName', b.atomic_subskill_name,
          'assessmentProcessCode', b.assessment_process_code,
          'assessmentProcessName', b.assessment_process_name,
          'assessmentProcessDefinition', b.assessment_process_definition,
          'cognitiveProcess', b.cognitive_process,
          'evidenceStatement', b.evidence_statement,
          'secondarySkillCodes', to_jsonb(b.secondary_skill_codes),
          'confidenceScore', b.confidence_score,
          'reviewReason', b.review_reason,
          'sourceLifecycleStatus', b.source_lifecycle_status,
          'sourceArtifact', b.source_artifact,
          'createdAt', b.created_at
        ),
        'objectiveOptions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'curriculumMappingId', m2.id,
            'frameworkCode', f2.code,
            'frameworkVersionCode', fv2.version_code,
            'frameworkVersionName', fv2.display_name,
            'scopeCode', s2.code,
            'scopeName', s2.name,
            'objectiveCode', o2.code,
            'objectiveStatement', o2.statement,
            'mappingRole', m2.mapping_role,
            'confidenceScore', m2.confidence_score
          ) order by case when m2.id = b.curriculum_mapping_id then 0 else 1 end,
            s2.sequence_number, o2.sequence_number)
          from public.curriculum_item_objective_mappings m2
          join public.curriculum_scopes s2 on s2.id = m2.curriculum_scope_id
          join public.curriculum_objectives o2
            on o2.id = m2.curriculum_objective_id and o2.is_assessable
          join public.curriculum_framework_versions fv2
            on fv2.id = m2.framework_version_id
           and fv2.status in ('published', 'retired')
           and fv2.content_hash = m2.curriculum_version_content_hash
          join public.curriculum_frameworks f2 on f2.id = fv2.framework_id
          where m2.assessment_item_id = b.assessment_item_id
            and m2.status = 'approved'
            and m2.mapping_role = 'primary'
            and m2.superseded_at is null
            and m2.item_content_hash = b.question_content_hash
        ), '[]'::jsonb),
        'decision', case when b.decision_id is null then null else jsonb_build_object(
          'id', b.decision_id,
          'decision', b.decision,
          'rationale', b.decision_rationale,
          'decidedBy', b.decided_by,
          'decidedByAuthority', b.decided_by_authority,
          'resultingTaxonomyId', b.resulting_taxonomy_id,
          'decidedAt', b.decided_at
        ) end,
        'decisionHistory', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', history.id,
            'previousDecisionId', history.previous_decision_id,
            'decision', history.decision,
            'rationale', history.rationale,
            'decidedBy', history.decided_by,
            'decidedByAuthority', history.decided_by_authority,
            'resultingTaxonomyId', history.resulting_taxonomy_id,
            'decidedAt', history.created_at
          ) order by history.created_at, history.id)
          from public.question_taxonomy_review_decisions history
          where history.review_item_id = b.id
        ), '[]'::jsonb)
      ) order by b.created_at, b.id)
      from visible_page b
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.rpc_superadmin_question_taxonomy_review_queue(
  text,text,text,text,text,integer,timestamptz,uuid
) from public, anon, authenticated, service_role;
grant execute on function public.rpc_superadmin_question_taxonomy_review_queue(
  text,text,text,text,text,integer,timestamptz,uuid
) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Append-only human decisions
-- ---------------------------------------------------------------------------

create or replace function public.rpc_superadmin_decide_question_taxonomy_review(
  p_review_item_id uuid,
  p_decision text,
  p_rationale text,
  p_replacement jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_rationale text := trim(coalesce(p_rationale, ''));
  v_item public.question_taxonomy_review_queue%rowtype;
  v_question record;
  v_active public.verified_question_diagnostic_taxonomy%rowtype;
  v_mapping record;
  v_resulting_id uuid;
  v_resulting_hash text;
  v_mapping_id uuid;
  v_primary_skill_code text;
  v_primary_skill_name text;
  v_atomic_subskill_code text;
  v_atomic_subskill_name text;
  v_ao text;
  v_cognitive text;
  v_evidence text;
  v_secondary text[];
  v_confidence numeric(4,3);
  v_taxonomy_version text;
  v_now timestamptz := clock_timestamp();
  v_snapshot jsonb;
  v_previous_decision_id uuid;
  v_previous_decision text;
begin
  if v_actor is null or not public.is_superadmin(v_actor) then
    raise exception using
      errcode = '42501',
      message = 'platform_superadmin_access_required';
  end if;
  if v_decision not in ('approve', 'return', 'retire', 'supersede') then
    raise exception using errcode = '22023', message = 'invalid_taxonomy_review_decision';
  end if;
  if length(v_rationale) not between 20 and 2000 then
    raise exception using errcode = '22023', message = 'taxonomy_review_rationale_required';
  end if;
  if v_decision <> 'supersede' and p_replacement is not null then
    raise exception using errcode = '22023', message = 'replacement_only_allowed_for_supersede';
  end if;

  select * into v_item
  from public.question_taxonomy_review_queue r
  where r.id = p_review_item_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'taxonomy_review_item_not_found';
  end if;
  select d.id, d.decision
  into v_previous_decision_id, v_previous_decision
  from public.question_taxonomy_review_decisions d
  where d.review_item_id = v_item.id
  order by d.created_at desc, d.id desc
  limit 1;

  if v_previous_decision in ('approve', 'retire', 'supersede') then
    raise exception using errcode = '23505', message = 'taxonomy_review_already_decided';
  end if;
  if v_previous_decision = 'return' and v_decision = 'return' then
    raise exception using errcode = '22023', message = 'taxonomy_review_already_returned';
  end if;

  select
    q.content_origin,
    q.verification_status,
    q.analytics_eligible,
    q.is_public,
    q.is_active,
    q.current_content_hash,
    q.verified_content_hash,
    exists (
      select 1
      from public.curriculum_assessment_items assessment_item
      where assessment_item.id = v_item.assessment_item_id
        and assessment_item.source_type = 'question_bank'
        and assessment_item.source_record_id = q.id::text
        and assessment_item.source_item_key = 'question'
        and assessment_item.is_active
        and assessment_item.content_hash = v_item.question_content_hash
    ) as assessment_item_eligible
  into v_question
  from public.questions q
  where q.id = v_item.question_id
  for update of q;

  if not found then
    raise exception using errcode = '23503', message = 'taxonomy_review_question_missing';
  end if;

  select t.* into v_active
  from public.verified_question_diagnostic_taxonomy t
  where t.question_id = v_item.question_id
    and t.review_status = 'approved'
    and not t.human_review_required
    and not exists (
      select 1
      from public.verified_question_diagnostic_taxonomy successor
      where successor.supersedes_taxonomy_id = t.id
        and successor.review_status in ('approved', 'retired')
    )
  order by t.created_at desc, t.id
  limit 1;

  if v_decision in ('approve', 'supersede') then
    if v_question.content_origin <> 'brain_heist'
       or v_question.verification_status <> 'verified'
       or not v_question.analytics_eligible
       or not v_question.is_public
       or not v_question.is_active
       or not v_question.assessment_item_eligible
       or v_question.current_content_hash <> v_question.verified_content_hash
       or v_question.current_content_hash <> v_item.question_content_hash then
      raise exception using errcode = '23514', message = 'taxonomy_review_source_no_longer_eligible';
    end if;
  end if;

  if v_decision = 'approve' then
    if v_active.id is not null then
      raise exception using errcode = '23514', message = 'taxonomy_review_requires_supersede';
    end if;

    select
      m.id,
      f.code as framework_code,
      fv.version_code as framework_version_code,
      s.code as scope_code,
      o.code as objective_code
    into v_mapping
    from public.curriculum_item_objective_mappings m
    join public.curriculum_scopes s on s.id = m.curriculum_scope_id
    join public.curriculum_objectives o
      on o.id = m.curriculum_objective_id and o.is_assessable
    join public.curriculum_framework_versions fv
      on fv.id = m.framework_version_id
     and fv.status in ('published', 'retired')
     and fv.content_hash = m.curriculum_version_content_hash
    join public.curriculum_frameworks f on f.id = fv.framework_id
    where m.assessment_item_id = v_item.assessment_item_id
      and m.status = 'approved'
      and m.mapping_role = 'primary'
      and m.superseded_at is null
      and m.item_content_hash = v_item.question_content_hash
      and f.code = v_item.framework_code
      and fv.version_code = v_item.framework_version_code
      and s.code = v_item.scope_code
      and o.code = v_item.objective_code
    order by m.created_at desc, m.id
    limit 1;
    if not found then
      raise exception using errcode = '23514', message = 'taxonomy_approval_mapping_no_longer_current';
    end if;

    insert into public.verified_question_diagnostic_taxonomy (
      question_id, assessment_item_id, curriculum_mapping_id,
      question_content_hash, scope_code, objective_code, package_version,
      taxonomy_version, primary_skill_code, primary_skill_name,
      atomic_subskill_code, atomic_subskill_name, assessment_process_code,
      cognitive_process, evidence_statement, secondary_skill_codes,
      confidence_score, review_status, human_review_required, review_reason,
      supersedes_taxonomy_id, reviewed_by_authority, reviewed_at, taxonomy_hash
    ) values (
      v_item.question_id, v_item.assessment_item_id, v_mapping.id,
      v_item.question_content_hash, v_mapping.scope_code, v_mapping.objective_code,
      v_item.package_version, v_item.taxonomy_version, v_item.primary_skill_code,
      v_item.primary_skill_name, v_item.atomic_subskill_code,
      v_item.atomic_subskill_name, v_item.assessment_process_code,
      v_item.cognitive_process, v_item.evidence_statement,
      v_item.secondary_skill_codes, greatest(v_item.confidence_score, 0.900),
      'approved', false,
      v_rationale, null, 'superadmin:' || v_actor::text, v_now, ''
    ) returning id, taxonomy_hash into v_resulting_id, v_resulting_hash;
  elsif v_decision = 'supersede' then
    if p_replacement is null or jsonb_typeof(p_replacement) <> 'object' then
      raise exception using errcode = '22023', message = 'taxonomy_supersede_replacement_required';
    end if;
    if exists (
      select 1 from jsonb_object_keys(p_replacement) key
      where key not in (
        'curriculumMappingId', 'primarySkillCode', 'primarySkillName',
        'atomicSubskillCode', 'atomicSubskillName', 'assessmentProcessCode',
        'cognitiveProcess', 'evidenceStatement', 'secondarySkillCodes',
        'confidenceScore'
      )
    ) then
      raise exception using errcode = '22023', message = 'unsupported_taxonomy_replacement_field';
    end if;

    v_mapping_id := coalesce(
      nullif(trim(p_replacement ->> 'curriculumMappingId'), '')::uuid,
      v_item.curriculum_mapping_id
    );
    select
      m.id,
      f.code as framework_code,
      fv.version_code as framework_version_code,
      s.code as scope_code,
      o.code as objective_code
    into v_mapping
    from public.curriculum_item_objective_mappings m
    join public.curriculum_scopes s on s.id = m.curriculum_scope_id
    join public.curriculum_objectives o
      on o.id = m.curriculum_objective_id and o.is_assessable
    join public.curriculum_framework_versions fv
      on fv.id = m.framework_version_id
     and fv.status in ('published', 'retired')
     and fv.content_hash = m.curriculum_version_content_hash
    join public.curriculum_frameworks f on f.id = fv.framework_id
    where m.id = v_mapping_id
      and m.assessment_item_id = v_item.assessment_item_id
      and m.status = 'approved'
      and m.mapping_role = 'primary'
      and m.superseded_at is null
      and m.item_content_hash = v_item.question_content_hash;
    if not found then
      raise exception using errcode = '23514', message = 'taxonomy_supersede_mapping_not_approved';
    end if;

    v_primary_skill_code := lower(coalesce(
      nullif(trim(p_replacement ->> 'primarySkillCode'), ''), v_item.primary_skill_code
    ));
    v_primary_skill_name := coalesce(
      nullif(trim(p_replacement ->> 'primarySkillName'), ''), v_item.primary_skill_name
    );
    v_atomic_subskill_code := lower(coalesce(
      nullif(trim(p_replacement ->> 'atomicSubskillCode'), ''), v_item.atomic_subskill_code
    ));
    v_atomic_subskill_name := coalesce(
      nullif(trim(p_replacement ->> 'atomicSubskillName'), ''), v_item.atomic_subskill_name
    );
    v_ao := upper(coalesce(
      nullif(trim(p_replacement ->> 'assessmentProcessCode'), ''),
      v_item.assessment_process_code
    ));
    v_cognitive := lower(coalesce(
      nullif(trim(p_replacement ->> 'cognitiveProcess'), ''), v_item.cognitive_process
    ));
    v_evidence := coalesce(
      nullif(trim(p_replacement ->> 'evidenceStatement'), ''), v_item.evidence_statement
    );
    v_confidence := coalesce(
      nullif(trim(p_replacement ->> 'confidenceScore'), '')::numeric,
      v_item.confidence_score
    );
    if p_replacement ? 'secondarySkillCodes' then
      if jsonb_typeof(p_replacement -> 'secondarySkillCodes') <> 'array' then
        raise exception using errcode = '22023', message = 'secondary_skill_codes_array_required';
      end if;
      if exists (
        select 1
        from jsonb_array_elements_text(p_replacement -> 'secondarySkillCodes') secondary(code)
        where lower(trim(secondary.code))
          !~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*([.][a-z0-9]+(-[a-z0-9]+)*)+$'
          or lower(trim(secondary.code)) in (v_primary_skill_code, v_atomic_subskill_code)
      ) or jsonb_array_length(p_replacement -> 'secondarySkillCodes') <> (
        select count(distinct lower(trim(secondary.code)))
        from jsonb_array_elements_text(p_replacement -> 'secondarySkillCodes') secondary(code)
      ) then
        raise exception using errcode = '22023', message = 'invalid_taxonomy_secondary_skill_codes';
      end if;
      v_secondary := array(
        select distinct lower(trim(value))
        from jsonb_array_elements_text(p_replacement -> 'secondarySkillCodes') value
        order by lower(trim(value))
      );
    else
      v_secondary := v_item.secondary_skill_codes;
    end if;
    if v_confidence < 0.900 or v_confidence > 1 then
      raise exception using errcode = '23514', message = 'taxonomy_approval_confidence_below_threshold';
    end if;

    if (
      v_active.id is null
      and row(v_mapping_id, v_primary_skill_code, v_primary_skill_name,
        v_atomic_subskill_code, v_atomic_subskill_name, v_ao, v_cognitive,
        v_evidence, v_secondary)
        is not distinct from
        row(v_item.curriculum_mapping_id, v_item.primary_skill_code,
          v_item.primary_skill_name, v_item.atomic_subskill_code,
          v_item.atomic_subskill_name, v_item.assessment_process_code,
          v_item.cognitive_process, v_item.evidence_statement,
          v_item.secondary_skill_codes)
    ) or (
      v_active.id is not null
      and row(v_mapping_id, v_primary_skill_code, v_primary_skill_name,
        v_atomic_subskill_code, v_atomic_subskill_name, v_ao, v_cognitive,
        v_evidence, v_secondary)
        is not distinct from
        row(v_active.curriculum_mapping_id, v_active.primary_skill_code,
          v_active.primary_skill_name, v_active.atomic_subskill_code,
          v_active.atomic_subskill_name, v_active.assessment_process_code,
          v_active.cognitive_process, v_active.evidence_statement,
          v_active.secondary_skill_codes)
    ) then
      raise exception using errcode = '22023', message = 'taxonomy_supersede_requires_a_correction';
    end if;

    v_taxonomy_version := public.curriculum_normalize_code(
      v_item.taxonomy_version || '-superadmin-'
        || left(replace(extensions.gen_random_uuid()::text, '-', ''), 12)
    );

    insert into public.verified_question_diagnostic_taxonomy (
      question_id, assessment_item_id, curriculum_mapping_id,
      question_content_hash, scope_code, objective_code, package_version,
      taxonomy_version, primary_skill_code, primary_skill_name,
      atomic_subskill_code, atomic_subskill_name, assessment_process_code,
      cognitive_process, evidence_statement, secondary_skill_codes,
      confidence_score, review_status, human_review_required, review_reason,
      supersedes_taxonomy_id, reviewed_by_authority, reviewed_at, taxonomy_hash
    ) values (
      v_item.question_id, v_item.assessment_item_id, v_mapping.id,
      v_item.question_content_hash, v_mapping.scope_code, v_mapping.objective_code,
      v_item.package_version, v_taxonomy_version, v_primary_skill_code,
      v_primary_skill_name, v_atomic_subskill_code, v_atomic_subskill_name,
      v_ao, v_cognitive, v_evidence, v_secondary, v_confidence, 'approved',
      false, v_rationale, v_active.id, 'superadmin:' || v_actor::text, v_now, ''
    ) returning id, taxonomy_hash into v_resulting_id, v_resulting_hash;
  elsif v_decision = 'retire' and v_active.id is not null
    and v_question.content_origin = 'brain_heist'
    and v_question.verification_status = 'verified'
    and v_question.analytics_eligible
    and v_question.is_public
    and v_question.is_active
    and v_question.assessment_item_eligible
    and v_question.current_content_hash = v_question.verified_content_hash then
    v_taxonomy_version := public.curriculum_normalize_code(
      v_active.taxonomy_version || '-retired-'
        || left(replace(extensions.gen_random_uuid()::text, '-', ''), 12)
    );
    insert into public.verified_question_diagnostic_taxonomy (
      question_id, assessment_item_id, curriculum_mapping_id,
      question_content_hash, scope_code, objective_code, package_version,
      taxonomy_version, primary_skill_code, primary_skill_name,
      atomic_subskill_code, atomic_subskill_name, assessment_process_code,
      cognitive_process, evidence_statement, secondary_skill_codes,
      confidence_score, review_status, human_review_required, review_reason,
      supersedes_taxonomy_id, reviewed_by_authority, reviewed_at, taxonomy_hash
    ) values (
      v_active.question_id, v_active.assessment_item_id,
      v_active.curriculum_mapping_id, v_active.question_content_hash,
      v_active.scope_code, v_active.objective_code, v_active.package_version,
      v_taxonomy_version, v_active.primary_skill_code, v_active.primary_skill_name,
      v_active.atomic_subskill_code, v_active.atomic_subskill_name,
      v_active.assessment_process_code, v_active.cognitive_process,
      v_active.evidence_statement, v_active.secondary_skill_codes,
      v_active.confidence_score, 'retired', false, v_rationale, v_active.id,
      'superadmin:' || v_actor::text, v_now, ''
    ) returning id, taxonomy_hash into v_resulting_id, v_resulting_hash;
  end if;

  v_snapshot := jsonb_build_object(
    'reviewItemId', v_item.id,
    'proposalKey', v_item.proposal_key,
    'proposalHash', v_item.proposal_hash,
    'questionId', v_item.question_id,
    'questionContentHash', v_item.question_content_hash,
    'frameworkCode', v_item.framework_code,
    'frameworkVersionCode', v_item.framework_version_code,
    'decision', v_decision,
    'previousDecisionId', v_previous_decision_id,
    'rationale', v_rationale,
    'replacement', p_replacement,
    'resultingTaxonomyId', v_resulting_id,
    'resultingTaxonomyHash', v_resulting_hash,
    'decidedBy', v_actor,
    'decidedAt', v_now
  );

  insert into public.question_taxonomy_review_decisions (
    review_item_id, previous_decision_id, decision, rationale,
    decided_by, decided_by_authority,
    resulting_taxonomy_id, decision_snapshot, created_at
  ) values (
    v_item.id, v_previous_decision_id, v_decision, v_rationale, v_actor,
    'superadmin:' || v_actor::text, v_resulting_id, v_snapshot, v_now
  );

  return jsonb_build_object(
    'success', true,
    'reviewItemId', v_item.id,
    'decision', v_decision,
    'status', case v_decision
      when 'approve' then 'approved'
      when 'return' then 'returned'
      when 'retire' then 'retired'
      else 'superseded'
    end,
    'resultingTaxonomyId', v_resulting_id,
    'decidedAt', v_now
  );
end;
$function$;

revoke all on function public.rpc_superadmin_decide_question_taxonomy_review(
  uuid,text,text,jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.rpc_superadmin_decide_question_taxonomy_review(
  uuid,text,text,jsonb
) to authenticated;

-- A retired successor also closes an approved predecessor. This keeps the
-- service-only active view aligned with append-only human retirement decisions.
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
      and successor.review_status in ('approved', 'retired')
  );

revoke all on private.active_verified_question_diagnostic_taxonomy
  from public, anon, authenticated, service_role;
grant select on private.active_verified_question_diagnostic_taxonomy to service_role;

comment on table public.question_taxonomy_review_batches is
  'Immutable provenance for checksum-bound diagnostic taxonomy proposal imports.';
comment on table public.question_taxonomy_review_queue is
  'Immutable human-review proposals. Status is derived from the append-only decision ledger.';
comment on table public.question_taxonomy_review_decisions is
  'Immutable superadmin decision chain: a return can be followed by one terminal approval, retirement or supersession.';
comment on function public.rpc_superadmin_question_taxonomy_review_queue(
  text,text,text,text,text,integer,timestamptz,uuid
) is 'Fail-closed, paginated diagnostic taxonomy review workspace for platform superadmins.';
comment on function public.rpc_superadmin_decide_question_taxonomy_review(
  uuid,text,text,jsonb
) is 'Appends a human review decision and, when appropriate, an immutable taxonomy revision.';
