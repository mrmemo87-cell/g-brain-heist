-- Phase 3 of the Academic Intelligence roadmap: reviewed question-to-curriculum mapping.
--
-- Source questions remain authoritative and are never copied or rewritten here. This
-- migration registers only stable source locators, non-content metadata, and SHA-256
-- content hashes. Approved mappings are usable only while both the item and published
-- curriculum version still match the hashes captured during review.

alter table public.curriculum_objectives
  add constraint curriculum_objectives_mapping_identity_unique
  unique (id, framework_version_id, curriculum_scope_id);

create table public.curriculum_assessment_items (
  id uuid primary key default gen_random_uuid(),
  source_type text not null
    check (source_type in ('question_bank', 'admission_bank', 'cambridge_test', 'writing_prompt', 'external')),
  school_id uuid references public.schools(id) on delete cascade,
  source_scope_key text generated always as (coalesce(school_id::text, 'global')) stored,
  source_record_id text not null,
  source_item_key text not null,
  source_version text,
  academic_subject_id uuid not null references public.academic_subjects(id) on delete restrict,
  grade_level text,
  content_hash text not null,
  source_metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  registered_by uuid references public.users(id) on delete set null,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_scope_key, source_record_id, source_item_key),
  unique (id, academic_subject_id),
  check (length(trim(source_record_id)) between 1 and 500),
  check (length(trim(source_item_key)) between 1 and 500),
  check (source_version is null or length(trim(source_version)) between 1 and 200),
  check (grade_level is null or length(trim(grade_level)) between 1 and 80),
  check (content_hash ~ '^[0-9a-f]{64}$'),
  check (jsonb_typeof(source_metadata) = 'object'),
  check ((is_active and retired_at is null) or (not is_active and retired_at is not null))
);

create index curriculum_assessment_items_school_subject_grade_idx
  on public.curriculum_assessment_items(school_id, academic_subject_id, grade_level, is_active);
create index curriculum_assessment_items_global_subject_grade_idx
  on public.curriculum_assessment_items(academic_subject_id, grade_level, source_type)
  where school_id is null and is_active;
create index curriculum_assessment_items_registered_by_idx
  on public.curriculum_assessment_items(registered_by) where registered_by is not null;

create table public.curriculum_mapping_batches (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  name text not null,
  source_type text not null
    check (source_type in ('question_bank', 'admission_bank', 'cambridge_test', 'writing_prompt', 'external', 'mixed')),
  mapping_method text not null
    check (mapping_method in ('manual', 'imported', 'rule_based', 'ai_assisted')),
  source_version text,
  source_hash text,
  model_provider text,
  model_name text,
  model_version text,
  prompt_version text,
  ruleset_version text,
  status text not null default 'draft'
    check (status in ('draft', 'in_review', 'completed', 'cancelled')),
  notes text,
  created_by uuid references public.users(id) on delete set null,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(name)) between 3 and 200),
  check (source_hash is null or source_hash ~ '^[0-9a-f]{64}$'),
  check (mapping_method <> 'ai_assisted' or
    (model_provider is not null and model_name is not null and model_version is not null and prompt_version is not null)),
  check (status not in ('in_review', 'completed') or (reviewed_by is not null and reviewed_at is not null)),
  check (status <> 'completed' or completed_at is not null)
);

create index curriculum_mapping_batches_school_status_idx
  on public.curriculum_mapping_batches(school_id, status, created_at desc);
create index curriculum_mapping_batches_created_by_idx
  on public.curriculum_mapping_batches(created_by) where created_by is not null;
create index curriculum_mapping_batches_reviewed_by_idx
  on public.curriculum_mapping_batches(reviewed_by) where reviewed_by is not null;

create table public.curriculum_item_objective_mappings (
  id uuid primary key default gen_random_uuid(),
  assessment_item_id uuid not null,
  curriculum_objective_id uuid not null,
  framework_version_id uuid not null,
  curriculum_scope_id uuid not null,
  academic_subject_id uuid not null,
  batch_id uuid references public.curriculum_mapping_batches(id) on delete set null,
  mapping_role text not null default 'primary'
    check (mapping_role in ('primary', 'secondary', 'prerequisite', 'extension')),
  mapping_method text not null
    check (mapping_method in ('manual', 'imported', 'rule_based', 'ai_assisted')),
  status text not null default 'suggested'
    check (status in ('suggested', 'in_review', 'approved', 'rejected', 'superseded')),
  confidence_score numeric(5,4) not null check (confidence_score between 0 and 1),
  rationale text not null,
  provenance jsonb not null default '{}'::jsonb,
  item_content_hash text not null,
  curriculum_version_content_hash text not null,
  proposed_by uuid references public.users(id) on delete set null,
  reviewed_by uuid references public.users(id) on delete set null,
  approved_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  superseded_at timestamptz,
  supersedes_mapping_id uuid references public.curriculum_item_objective_mappings(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (assessment_item_id, academic_subject_id)
    references public.curriculum_assessment_items(id, academic_subject_id) on delete restrict,
  foreign key (curriculum_scope_id, framework_version_id, academic_subject_id)
    references public.curriculum_scopes(id, framework_version_id, academic_subject_id) on delete restrict,
  foreign key (curriculum_objective_id, framework_version_id, curriculum_scope_id)
    references public.curriculum_objectives(id, framework_version_id, curriculum_scope_id) on delete restrict,
  check (length(trim(rationale)) between 10 and 2000),
  check (jsonb_typeof(provenance) = 'object'),
  check (item_content_hash ~ '^[0-9a-f]{64}$'),
  check (curriculum_version_content_hash ~ '^[0-9a-f]{64}$'),
  check (supersedes_mapping_id is null or supersedes_mapping_id <> id),
  check (status <> 'in_review' or (reviewed_by is not null and reviewed_at is not null)),
  check (status <> 'approved' or (
    reviewed_by is not null and approved_by is not null and reviewed_at is not null and approved_at is not null
    and confidence_score >= 0.7000
  )),
  check (status <> 'rejected' or (reviewed_by is not null and rejected_at is not null)),
  check (status <> 'superseded' or superseded_at is not null),
  check (approved_by is null or proposed_by is null or approved_by <> proposed_by)
);

create unique index curriculum_item_objective_mappings_open_uidx
  on public.curriculum_item_objective_mappings(assessment_item_id, curriculum_objective_id)
  where status in ('suggested', 'in_review');
create unique index curriculum_item_objective_mappings_approved_uidx
  on public.curriculum_item_objective_mappings(assessment_item_id, curriculum_objective_id)
  where status = 'approved';
create unique index curriculum_item_objective_mappings_primary_uidx
  on public.curriculum_item_objective_mappings(assessment_item_id)
  where status = 'approved' and mapping_role = 'primary';
create index curriculum_item_objective_mappings_item_status_idx
  on public.curriculum_item_objective_mappings(assessment_item_id, status, mapping_role);
create index curriculum_item_objective_mappings_objective_status_idx
  on public.curriculum_item_objective_mappings(curriculum_objective_id, status, confidence_score desc);
create index curriculum_item_objective_mappings_scope_status_idx
  on public.curriculum_item_objective_mappings(curriculum_scope_id, status, assessment_item_id);
create index curriculum_item_objective_mappings_version_idx
  on public.curriculum_item_objective_mappings(framework_version_id, curriculum_scope_id);
create index curriculum_item_objective_mappings_subject_idx
  on public.curriculum_item_objective_mappings(academic_subject_id, status);
create index curriculum_item_objective_mappings_batch_idx
  on public.curriculum_item_objective_mappings(batch_id) where batch_id is not null;
create index curriculum_item_objective_mappings_proposed_by_idx
  on public.curriculum_item_objective_mappings(proposed_by) where proposed_by is not null;
create index curriculum_item_objective_mappings_reviewed_by_idx
  on public.curriculum_item_objective_mappings(reviewed_by) where reviewed_by is not null;
create index curriculum_item_objective_mappings_approved_by_idx
  on public.curriculum_item_objective_mappings(approved_by) where approved_by is not null;
create index curriculum_item_objective_mappings_supersedes_idx
  on public.curriculum_item_objective_mappings(supersedes_mapping_id) where supersedes_mapping_id is not null;

create table public.curriculum_mapping_decisions (
  id bigint generated always as identity primary key,
  mapping_id uuid not null references public.curriculum_item_objective_mappings(id) on delete restrict,
  decision text not null
    check (decision in ('submitted', 'review_started', 'approved', 'rejected', 'superseded')),
  actor_id uuid references public.users(id) on delete set null,
  reason text,
  mapping_snapshot jsonb not null,
  occurred_at timestamptz not null default now(),
  check (reason is null or length(trim(reason)) between 3 and 2000),
  check (jsonb_typeof(mapping_snapshot) = 'object')
);

create index curriculum_mapping_decisions_mapping_time_idx
  on public.curriculum_mapping_decisions(mapping_id, occurred_at desc);
create index curriculum_mapping_decisions_actor_idx
  on public.curriculum_mapping_decisions(actor_id, occurred_at desc) where actor_id is not null;

alter table public.curriculum_assessment_items enable row level security;
alter table public.curriculum_mapping_batches enable row level security;
alter table public.curriculum_item_objective_mappings enable row level security;
alter table public.curriculum_mapping_decisions enable row level security;

revoke all on table public.curriculum_assessment_items from public, anon, authenticated, service_role;
revoke all on table public.curriculum_mapping_batches from public, anon, authenticated, service_role;
revoke all on table public.curriculum_item_objective_mappings from public, anon, authenticated, service_role;
revoke all on table public.curriculum_mapping_decisions from public, anon, authenticated, service_role;
revoke all on sequence public.curriculum_mapping_decisions_id_seq from public, anon, authenticated, service_role;

create or replace function private.curriculum_reject_raw_item_content(p_metadata jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_metadata, '{}'::jsonb) ?| array[
    'question_text', 'stem', 'prompt', 'passage', 'options', 'correct_answer', 'answer', 'explanation'
  ];
$$;
revoke all on function private.curriculum_reject_raw_item_content(jsonb) from public, anon, authenticated, service_role;

create or replace function private.curriculum_mapping_snapshot(p_mapping public.curriculum_item_objective_mappings)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'mappingId', p_mapping.id,
    'assessmentItemId', p_mapping.assessment_item_id,
    'objectiveId', p_mapping.curriculum_objective_id,
    'frameworkVersionId', p_mapping.framework_version_id,
    'curriculumScopeId', p_mapping.curriculum_scope_id,
    'academicSubjectId', p_mapping.academic_subject_id,
    'mappingRole', p_mapping.mapping_role,
    'mappingMethod', p_mapping.mapping_method,
    'status', p_mapping.status,
    'confidenceScore', p_mapping.confidence_score,
    'itemContentHash', p_mapping.item_content_hash,
    'curriculumVersionContentHash', p_mapping.curriculum_version_content_hash,
    'supersedesMappingId', p_mapping.supersedes_mapping_id
  );
$$;
revoke all on function private.curriculum_mapping_snapshot(public.curriculum_item_objective_mappings) from public, anon, authenticated, service_role;

create or replace function private.curriculum_guard_assessment_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.curriculum_reject_raw_item_content(new.source_metadata) then
    raise exception using errcode = '22023', message = 'raw_question_content_not_allowed_in_curriculum_registry';
  end if;
  if tg_op = 'UPDATE' and row(new.source_type, new.school_id, new.source_record_id, new.source_item_key)
    is distinct from row(old.source_type, old.school_id, old.source_record_id, old.source_item_key) then
    raise exception using errcode = '55000', message = 'curriculum_item_source_identity_is_immutable';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.curriculum_guard_assessment_item() from public, anon, authenticated, service_role;

create trigger trg_curriculum_guard_assessment_item
before insert or update on public.curriculum_assessment_items
for each row execute function private.curriculum_guard_assessment_item();

create or replace function private.curriculum_guard_mapping_batch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'curriculum_mapping_batch_history_is_append_only';
  end if;
  if old.status in ('completed', 'cancelled') then
    raise exception using errcode = '55000', message = 'closed_curriculum_mapping_batch_is_immutable';
  end if;
  if new.status <> old.status and not (
    (old.status = 'draft' and new.status in ('in_review', 'cancelled')) or
    (old.status = 'in_review' and new.status in ('draft', 'completed', 'cancelled'))
  ) then
    raise exception using errcode = '23514', message = 'invalid_curriculum_mapping_batch_transition';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.curriculum_guard_mapping_batch() from public, anon, authenticated, service_role;

create trigger trg_curriculum_guard_mapping_batch
before update or delete on public.curriculum_mapping_batches
for each row execute function private.curriculum_guard_mapping_batch();

create or replace function private.curriculum_guard_item_mapping()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.curriculum_assessment_items%rowtype;
  v_version public.curriculum_framework_versions%rowtype;
  v_previous public.curriculum_item_objective_mappings%rowtype;
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'curriculum_mapping_history_is_append_only';
  end if;

  if tg_op = 'UPDATE' then
    if old.status in ('rejected', 'superseded') then
      raise exception using errcode = '55000', message = 'closed_curriculum_mapping_is_immutable';
    end if;
    if old.status = 'approved' then
      if new.status <> 'superseded' or
        row(new.assessment_item_id, new.curriculum_objective_id, new.framework_version_id,
            new.curriculum_scope_id, new.academic_subject_id, new.mapping_role, new.mapping_method,
            new.confidence_score, new.rationale, new.provenance, new.item_content_hash,
            new.curriculum_version_content_hash, new.proposed_by, new.reviewed_by, new.approved_by,
            new.reviewed_at, new.approved_at, new.supersedes_mapping_id)
        is distinct from
        row(old.assessment_item_id, old.curriculum_objective_id, old.framework_version_id,
            old.curriculum_scope_id, old.academic_subject_id, old.mapping_role, old.mapping_method,
            old.confidence_score, old.rationale, old.provenance, old.item_content_hash,
            old.curriculum_version_content_hash, old.proposed_by, old.reviewed_by, old.approved_by,
            old.reviewed_at, old.approved_at, old.supersedes_mapping_id) then
        raise exception using errcode = '55000', message = 'approved_curriculum_mapping_is_immutable';
      end if;
    elsif new.status <> old.status and not (
      (old.status = 'suggested' and new.status in ('in_review', 'rejected')) or
      (old.status = 'in_review' and new.status in ('suggested', 'approved', 'rejected'))
    ) then
      raise exception using errcode = '23514', message = 'invalid_curriculum_mapping_transition';
    end if;
  end if;

  select * into v_item from public.curriculum_assessment_items where id = new.assessment_item_id;
  select * into v_version from public.curriculum_framework_versions where id = new.framework_version_id;
  if not v_item.is_active then
    raise exception using errcode = '23514', message = 'curriculum_mapping_item_is_retired';
  end if;
  if (tg_op <> 'UPDATE' or old.status <> 'approved' or new.status <> 'superseded')
    and (v_version.status <> 'published' or v_version.content_hash is null) then
    raise exception using errcode = '23514', message = 'curriculum_mapping_requires_published_version';
  end if;
  if new.item_content_hash <> v_item.content_hash then
    raise exception using errcode = '23514', message = 'curriculum_mapping_item_hash_is_stale';
  end if;
  if new.curriculum_version_content_hash <> v_version.content_hash then
    raise exception using errcode = '23514', message = 'curriculum_mapping_version_hash_is_stale';
  end if;
  if new.mapping_method = 'ai_assisted' and new.batch_id is null then
    raise exception using errcode = '23514', message = 'ai_curriculum_mapping_batch_required';
  end if;
  if new.supersedes_mapping_id is not null then
    select * into v_previous from public.curriculum_item_objective_mappings where id = new.supersedes_mapping_id;
    if not found or v_previous.status <> 'approved' or v_previous.assessment_item_id <> new.assessment_item_id then
      raise exception using errcode = '23514', message = 'invalid_superseded_curriculum_mapping';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.curriculum_guard_item_mapping() from public, anon, authenticated, service_role;

create trigger trg_curriculum_guard_item_mapping
before insert or update or delete on public.curriculum_item_objective_mappings
for each row execute function private.curriculum_guard_item_mapping();

create or replace function private.curriculum_guard_mapping_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'curriculum_mapping_decisions_are_append_only';
end;
$$;
revoke all on function private.curriculum_guard_mapping_decision() from public, anon, authenticated, service_role;

create trigger trg_curriculum_guard_mapping_decision
before update or delete on public.curriculum_mapping_decisions
for each row execute function private.curriculum_guard_mapping_decision();

create or replace function public.rpc_curriculum_register_assessment_item(
  p_source_type text,
  p_source_record_id text,
  p_source_item_key text,
  p_academic_subject_id uuid,
  p_content_hash text,
  p_school_id uuid default null,
  p_grade_level text default null,
  p_source_version text default null,
  p_source_metadata jsonb default '{}'::jsonb,
  p_registered_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item_id uuid;
begin
  if p_source_type not in ('question_bank', 'admission_bank', 'cambridge_test', 'writing_prompt', 'external') then
    return jsonb_build_object('success', false, 'code', 'invalid_assessment_item_source_type');
  end if;
  if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('success', false, 'code', 'invalid_assessment_item_content_hash');
  end if;
  if jsonb_typeof(coalesce(p_source_metadata, '{}'::jsonb)) <> 'object' or
    private.curriculum_reject_raw_item_content(coalesce(p_source_metadata, '{}'::jsonb)) then
    return jsonb_build_object('success', false, 'code', 'assessment_item_metadata_must_exclude_raw_content');
  end if;

  insert into public.curriculum_assessment_items(
    source_type, school_id, source_record_id, source_item_key, source_version,
    academic_subject_id, grade_level, content_hash, source_metadata, registered_by
  ) values (
    p_source_type, p_school_id, trim(p_source_record_id), trim(p_source_item_key), nullif(trim(p_source_version), ''),
    p_academic_subject_id, nullif(trim(p_grade_level), ''), p_content_hash,
    coalesce(p_source_metadata, '{}'::jsonb), p_registered_by
  )
  on conflict (source_type, source_scope_key, source_record_id, source_item_key) do update set
    source_version = excluded.source_version,
    academic_subject_id = excluded.academic_subject_id,
    grade_level = excluded.grade_level,
    content_hash = excluded.content_hash,
    source_metadata = excluded.source_metadata,
    registered_by = coalesce(excluded.registered_by, public.curriculum_assessment_items.registered_by),
    is_active = true,
    retired_at = null
  returning id into v_item_id;

  return jsonb_build_object('success', true, 'assessmentItemId', v_item_id);
end;
$$;
revoke all on function public.rpc_curriculum_register_assessment_item(text, text, text, uuid, text, uuid, text, text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.rpc_curriculum_register_assessment_item(text, text, text, uuid, text, uuid, text, text, jsonb, uuid)
  to service_role;

create or replace function public.rpc_curriculum_create_mapping_batch(
  p_name text,
  p_source_type text,
  p_mapping_method text,
  p_school_id uuid default null,
  p_source_version text default null,
  p_source_hash text default null,
  p_model_provider text default null,
  p_model_name text default null,
  p_model_version text default null,
  p_prompt_version text default null,
  p_ruleset_version text default null,
  p_notes text default null,
  p_created_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch_id uuid;
begin
  insert into public.curriculum_mapping_batches(
    school_id, name, source_type, mapping_method, source_version, source_hash,
    model_provider, model_name, model_version, prompt_version, ruleset_version, notes, created_by
  ) values (
    p_school_id, trim(p_name), p_source_type, p_mapping_method, nullif(trim(p_source_version), ''), p_source_hash,
    nullif(trim(p_model_provider), ''), nullif(trim(p_model_name), ''), nullif(trim(p_model_version), ''),
    nullif(trim(p_prompt_version), ''), nullif(trim(p_ruleset_version), ''), nullif(trim(p_notes), ''), p_created_by
  ) returning id into v_batch_id;
  return jsonb_build_object('success', true, 'batchId', v_batch_id);
exception when check_violation then
  return jsonb_build_object('success', false, 'code', 'invalid_mapping_batch_metadata');
end;
$$;
revoke all on function public.rpc_curriculum_create_mapping_batch(text, text, text, uuid, text, text, text, text, text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.rpc_curriculum_create_mapping_batch(text, text, text, uuid, text, text, text, text, text, text, text, text, uuid)
  to service_role;

create or replace function public.rpc_curriculum_set_mapping_batch_status(
  p_batch_id uuid,
  p_status text,
  p_reviewer_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.curriculum_mapping_batches%rowtype;
begin
  select * into v_batch from public.curriculum_mapping_batches where id = p_batch_id for update;
  if not found then return jsonb_build_object('success', false, 'code', 'mapping_batch_not_found'); end if;
  if p_status in ('completed', 'cancelled') and exists (
    select 1 from public.curriculum_item_objective_mappings m
    where m.batch_id = p_batch_id and m.status in ('suggested', 'in_review')
  ) then return jsonb_build_object('success', false, 'code', 'mapping_batch_has_open_reviews'); end if;

  update public.curriculum_mapping_batches set
    status = p_status,
    reviewed_by = case when p_status in ('in_review', 'completed') then coalesce(p_reviewer_id, reviewed_by) else reviewed_by end,
    reviewed_at = case when p_status in ('in_review', 'completed') then coalesce(reviewed_at, now()) else reviewed_at end,
    completed_at = case when p_status = 'completed' then now() else null end,
    notes = coalesce(nullif(trim(p_notes), ''), notes)
  where id = p_batch_id returning * into v_batch;
  return jsonb_build_object('success', true, 'batchId', v_batch.id, 'status', v_batch.status);
exception when check_violation then
  return jsonb_build_object('success', false, 'code', 'invalid_mapping_batch_transition');
end;
$$;
revoke all on function public.rpc_curriculum_set_mapping_batch_status(uuid, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.rpc_curriculum_set_mapping_batch_status(uuid, text, uuid, text)
  to service_role;

create or replace function public.rpc_curriculum_submit_item_mapping(
  p_assessment_item_id uuid,
  p_curriculum_objective_id uuid,
  p_mapping_role text,
  p_mapping_method text,
  p_confidence_score numeric,
  p_rationale text,
  p_provenance jsonb default '{}'::jsonb,
  p_batch_id uuid default null,
  p_proposed_by uuid default null,
  p_supersedes_mapping_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.curriculum_assessment_items%rowtype;
  v_objective public.curriculum_objectives%rowtype;
  v_version public.curriculum_framework_versions%rowtype;
  v_mapping public.curriculum_item_objective_mappings%rowtype;
begin
  select * into v_item from public.curriculum_assessment_items where id = p_assessment_item_id and is_active;
  if not found then return jsonb_build_object('success', false, 'code', 'assessment_item_not_found'); end if;
  select * into v_objective from public.curriculum_objectives where id = p_curriculum_objective_id and is_assessable;
  if not found then return jsonb_build_object('success', false, 'code', 'assessable_curriculum_objective_not_found'); end if;
  select * into v_version from public.curriculum_framework_versions
    where id = v_objective.framework_version_id and status = 'published';
  if not found then return jsonb_build_object('success', false, 'code', 'published_curriculum_version_required'); end if;
  if exists (
    select 1 from public.curriculum_mapping_batches b
    where b.id = p_batch_id and (b.status in ('completed', 'cancelled') or b.school_id is distinct from v_item.school_id)
  ) then return jsonb_build_object('success', false, 'code', 'mapping_batch_unavailable'); end if;

  insert into public.curriculum_item_objective_mappings(
    assessment_item_id, curriculum_objective_id, framework_version_id, curriculum_scope_id,
    academic_subject_id, batch_id, mapping_role, mapping_method, confidence_score, rationale,
    provenance, item_content_hash, curriculum_version_content_hash, proposed_by, supersedes_mapping_id
  ) values (
    v_item.id, v_objective.id, v_objective.framework_version_id, v_objective.curriculum_scope_id,
    v_item.academic_subject_id, p_batch_id, p_mapping_role, p_mapping_method, p_confidence_score, trim(p_rationale),
    coalesce(p_provenance, '{}'::jsonb), v_item.content_hash, v_version.content_hash, p_proposed_by, p_supersedes_mapping_id
  ) returning * into v_mapping;

  insert into public.curriculum_mapping_decisions(mapping_id, decision, actor_id, reason, mapping_snapshot)
  values (v_mapping.id, 'submitted', p_proposed_by, p_rationale, private.curriculum_mapping_snapshot(v_mapping));
  return jsonb_build_object('success', true, 'mappingId', v_mapping.id, 'status', v_mapping.status);
exception
  when unique_violation then return jsonb_build_object('success', false, 'code', 'open_curriculum_mapping_already_exists');
  when check_violation or foreign_key_violation then return jsonb_build_object('success', false, 'code', 'invalid_curriculum_mapping');
end;
$$;
revoke all on function public.rpc_curriculum_submit_item_mapping(uuid, uuid, text, text, numeric, text, jsonb, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.rpc_curriculum_submit_item_mapping(uuid, uuid, text, text, numeric, text, jsonb, uuid, uuid, uuid)
  to service_role;

create or replace function public.rpc_curriculum_review_item_mapping(
  p_mapping_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_mapping public.curriculum_item_objective_mappings%rowtype;
  v_item public.curriculum_assessment_items%rowtype;
  v_previous public.curriculum_item_objective_mappings%rowtype;
begin
  if v_actor is null then return jsonb_build_object('success', false, 'code', 'authentication_required'); end if;
  select * into v_mapping from public.curriculum_item_objective_mappings where id = p_mapping_id for update;
  if not found then return jsonb_build_object('success', false, 'code', 'curriculum_mapping_not_found'); end if;
  select * into v_item from public.curriculum_assessment_items where id = v_mapping.assessment_item_id;
  if not (public.is_superadmin(v_actor) or (v_item.school_id is not null and public.can_administer_school(v_item.school_id))) then
    return jsonb_build_object('success', false, 'code', 'curriculum_mapping_reviewer_access_required');
  end if;

  if p_action = 'start_review' and v_mapping.status = 'suggested' then
    update public.curriculum_item_objective_mappings set
      status = 'in_review', reviewed_by = v_actor, reviewed_at = now()
    where id = v_mapping.id returning * into v_mapping;
  elsif p_action = 'approve' and v_mapping.status = 'in_review' then
    if v_mapping.proposed_by = v_actor then
      return jsonb_build_object('success', false, 'code', 'mapping_proposer_cannot_approve');
    end if;
    if v_mapping.supersedes_mapping_id is not null then
      update public.curriculum_item_objective_mappings set status = 'superseded', superseded_at = now()
      where id = v_mapping.supersedes_mapping_id and status = 'approved'
      returning * into v_previous;
      if not found then return jsonb_build_object('success', false, 'code', 'superseded_mapping_not_available'); end if;
      insert into public.curriculum_mapping_decisions(mapping_id, decision, actor_id, reason, mapping_snapshot)
      values (v_previous.id, 'superseded', v_actor, p_reason, private.curriculum_mapping_snapshot(v_previous));
    end if;
    update public.curriculum_item_objective_mappings set
      status = 'approved', approved_by = v_actor, approved_at = now()
    where id = v_mapping.id returning * into v_mapping;
  elsif p_action = 'reject' and v_mapping.status in ('suggested', 'in_review') then
    update public.curriculum_item_objective_mappings set
      status = 'rejected', reviewed_by = coalesce(reviewed_by, v_actor),
      reviewed_at = coalesce(reviewed_at, now()), rejected_at = now()
    where id = v_mapping.id returning * into v_mapping;
  else
    return jsonb_build_object('success', false, 'code', 'invalid_curriculum_mapping_review_action');
  end if;

  insert into public.curriculum_mapping_decisions(mapping_id, decision, actor_id, reason, mapping_snapshot)
  values (
    v_mapping.id,
    case p_action when 'start_review' then 'review_started' when 'approve' then 'approved' else 'rejected' end,
    v_actor, nullif(trim(p_reason), ''), private.curriculum_mapping_snapshot(v_mapping)
  );
  return jsonb_build_object('success', true, 'mappingId', v_mapping.id, 'status', v_mapping.status);
exception
  when unique_violation then return jsonb_build_object('success', false, 'code', 'approved_curriculum_mapping_conflict');
  when check_violation then return jsonb_build_object('success', false, 'code', 'curriculum_mapping_review_gate_failed');
end;
$$;
revoke all on function public.rpc_curriculum_review_item_mapping(uuid, text, text) from public, anon;
grant execute on function public.rpc_curriculum_review_item_mapping(uuid, text, text) to authenticated;

create or replace function public.rpc_curriculum_resolve_item_objectives(p_assessment_item_id uuid)
returns table (
  curriculum_objective_id uuid,
  curriculum_scope_id uuid,
  framework_version_id uuid,
  mapping_role text,
  confidence_score numeric,
  item_content_hash text,
  curriculum_version_content_hash text
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.curriculum_objective_id, m.curriculum_scope_id, m.framework_version_id,
    m.mapping_role, m.confidence_score, m.item_content_hash, m.curriculum_version_content_hash
  from public.curriculum_item_objective_mappings m
  join public.curriculum_assessment_items i on i.id = m.assessment_item_id
  join public.curriculum_framework_versions v on v.id = m.framework_version_id
  where m.assessment_item_id = p_assessment_item_id
    and m.status = 'approved' and i.is_active and v.status in ('published', 'retired')
    and m.item_content_hash = i.content_hash
    and m.curriculum_version_content_hash = v.content_hash
  order by case m.mapping_role when 'primary' then 1 when 'secondary' then 2 when 'prerequisite' then 3 else 4 end,
    m.confidence_score desc, m.curriculum_objective_id;
$$;
revoke all on function public.rpc_curriculum_resolve_item_objectives(uuid) from public, anon, authenticated;
grant execute on function public.rpc_curriculum_resolve_item_objectives(uuid) to service_role;

create or replace function public.rpc_school_curriculum_mapping_coverage(
  p_school_id uuid,
  p_academic_year_id uuid,
  p_grade_level text,
  p_academic_subject_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_scope_id uuid;
  v_total integer;
  v_mapped integer;
  v_stale integer;
  v_objectives integer;
  v_covered integer;
  v_suggested integer;
  v_in_review integer;
  v_ungraded integer;
begin
  if auth.uid() is null or not exists (
    select 1 from public.school_memberships sm
    where sm.school_id = p_school_id and sm.user_id = auth.uid() and sm.status = 'active'
  ) then return jsonb_build_object('success', false, 'code', 'active_school_membership_required'); end if;

  select m.curriculum_scope_id into v_scope_id
  from public.school_curriculum_scope_mappings m
  where m.school_id = p_school_id and m.academic_year_id = p_academic_year_id
    and m.grade_level = p_grade_level and m.academic_subject_id = p_academic_subject_id
    and m.status in ('planned', 'active')
  order by case m.status when 'active' then 1 else 2 end limit 1;
  if v_scope_id is null then
    return jsonb_build_object('success', false, 'code', 'curriculum_scope_mapping_not_found');
  end if;

  select count(*) into v_total from public.curriculum_assessment_items i
  where (i.school_id is null or i.school_id = p_school_id) and i.academic_subject_id = p_academic_subject_id
    and i.grade_level = p_grade_level and i.is_active;
  select count(*) into v_ungraded from public.curriculum_assessment_items i
  where (i.school_id is null or i.school_id = p_school_id) and i.academic_subject_id = p_academic_subject_id
    and i.grade_level is null and i.is_active;
  select count(distinct i.id) into v_mapped
  from public.curriculum_assessment_items i
  join public.curriculum_item_objective_mappings m on m.assessment_item_id = i.id
  join public.curriculum_framework_versions v on v.id = m.framework_version_id
  where (i.school_id is null or i.school_id = p_school_id) and i.academic_subject_id = p_academic_subject_id
    and i.grade_level = p_grade_level and i.is_active and m.curriculum_scope_id = v_scope_id
    and m.status = 'approved' and m.item_content_hash = i.content_hash
    and m.curriculum_version_content_hash = v.content_hash;
  select count(distinct i.id) into v_stale
  from public.curriculum_assessment_items i
  join public.curriculum_item_objective_mappings m on m.assessment_item_id = i.id and m.status = 'approved'
  join public.curriculum_framework_versions v on v.id = m.framework_version_id
  where (i.school_id is null or i.school_id = p_school_id) and i.academic_subject_id = p_academic_subject_id
    and i.grade_level = p_grade_level and i.is_active
    and (m.item_content_hash <> i.content_hash or m.curriculum_version_content_hash <> v.content_hash);
  select count(*) into v_objectives from public.curriculum_objectives o
    where o.curriculum_scope_id = v_scope_id and o.is_assessable;
  select count(distinct m.curriculum_objective_id) into v_covered
  from public.curriculum_item_objective_mappings m
  join public.curriculum_assessment_items i on i.id = m.assessment_item_id
  join public.curriculum_framework_versions v on v.id = m.framework_version_id
  where m.curriculum_scope_id = v_scope_id and m.status = 'approved' and i.is_active
    and (i.school_id is null or i.school_id = p_school_id) and i.grade_level = p_grade_level
    and m.item_content_hash = i.content_hash and m.curriculum_version_content_hash = v.content_hash;
  select count(*) filter (where m.status = 'suggested'), count(*) filter (where m.status = 'in_review')
    into v_suggested, v_in_review
  from public.curriculum_item_objective_mappings m
  join public.curriculum_assessment_items i on i.id = m.assessment_item_id
  where m.curriculum_scope_id = v_scope_id and (i.school_id is null or i.school_id = p_school_id)
    and i.grade_level = p_grade_level and i.is_active;

  return jsonb_build_object(
    'success', true,
    'readiness', case when v_total = 0 then 'no_registered_items'
      when v_mapped = v_total and v_stale = 0 then 'ready' else 'partial' end,
    'curriculumScopeId', v_scope_id,
    'totalItems', v_total,
    'mappedItems', v_mapped,
    'unmappedItems', greatest(v_total - v_mapped, 0),
    'staleItems', v_stale,
    'itemsMissingGrade', v_ungraded,
    'mappedPercent', case when v_total = 0 then 0 else round(v_mapped::numeric * 100 / v_total, 1) end,
    'assessableObjectives', v_objectives,
    'coveredObjectives', v_covered,
    'objectiveCoveragePercent', case when v_objectives = 0 then 0 else round(v_covered::numeric * 100 / v_objectives, 1) end,
    'suggestedMappings', coalesce(v_suggested, 0),
    'mappingsInReview', coalesce(v_in_review, 0)
  );
end;
$$;
revoke all on function public.rpc_school_curriculum_mapping_coverage(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.rpc_school_curriculum_mapping_coverage(uuid, uuid, text, uuid) to authenticated;

create or replace function public.rpc_school_curriculum_item_mapping_detail(
  p_school_id uuid,
  p_assessment_item_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_item public.curriculum_assessment_items%rowtype;
  v_mappings jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.school_memberships sm
    where sm.school_id = p_school_id and sm.user_id = auth.uid() and sm.status = 'active'
  ) then return jsonb_build_object('success', false, 'code', 'active_school_membership_required'); end if;
  select * into v_item from public.curriculum_assessment_items i
  where i.id = p_assessment_item_id and (i.school_id is null or i.school_id = p_school_id);
  if not found then return jsonb_build_object('success', false, 'code', 'assessment_item_not_found'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'mappingId', m.id,
    'objectiveId', o.id,
    'objectiveCode', o.code,
    'objectiveStatement', o.statement,
    'mappingRole', m.mapping_role,
    'status', m.status,
    'confidenceScore', m.confidence_score,
    'rationale', m.rationale,
    'isCurrent', m.item_content_hash = v_item.content_hash and m.curriculum_version_content_hash = v.content_hash,
    'reviewedAt', m.reviewed_at,
    'approvedAt', m.approved_at
  ) order by case m.mapping_role when 'primary' then 1 else 2 end, m.confidence_score desc), '[]'::jsonb)
  into v_mappings
  from public.curriculum_item_objective_mappings m
  join public.curriculum_objectives o on o.id = m.curriculum_objective_id
  join public.curriculum_framework_versions v on v.id = m.framework_version_id
  where m.assessment_item_id = v_item.id and m.status in ('suggested', 'in_review', 'approved');
  return jsonb_build_object(
    'success', true,
    'item', jsonb_build_object(
      'assessmentItemId', v_item.id,
      'sourceType', v_item.source_type,
      'sourceRecordId', v_item.source_record_id,
      'sourceItemKey', v_item.source_item_key,
      'sourceVersion', v_item.source_version,
      'academicSubjectId', v_item.academic_subject_id,
      'gradeLevel', v_item.grade_level,
      'isActive', v_item.is_active
    ),
    'mappings', v_mappings
  );
end;
$$;
revoke all on function public.rpc_school_curriculum_item_mapping_detail(uuid, uuid) from public, anon;
grant execute on function public.rpc_school_curriculum_item_mapping_detail(uuid, uuid) to authenticated;

comment on table public.curriculum_assessment_items is
  'Content-free registry of stable question/prompt locators and SHA-256 hashes across Brains Heist assessment sources.';
comment on column public.curriculum_assessment_items.source_metadata is
  'Non-content source descriptors only. Raw questions, prompts, passages, answers, options, and explanations are rejected.';
comment on table public.curriculum_mapping_batches is
  'Auditable provenance for manual, imported, rule-based, or AI-assisted mapping batches.';
comment on table public.curriculum_item_objective_mappings is
  'Reviewed many-to-many links from assessment items to immutable published curriculum objectives.';
comment on table public.curriculum_mapping_decisions is
  'Append-only decision trail for every submitted, reviewed, approved, rejected, and superseded mapping.';
comment on function public.rpc_curriculum_resolve_item_objectives(uuid) is
  'Service-only evidence-adapter boundary returning approved mappings only when item and curriculum hashes are current.';
