-- Phase 2 of the Academic Intelligence roadmap: versioned curriculum model.
--
-- This migration intentionally contains no third-party curriculum content. It creates
-- the governed structure needed to import, review, publish, map, and later reference
-- licensed or original curriculum objectives without changing historical evidence.
-- Published versions and their content are immutable; corrections require a new version.

create or replace function public.curriculum_normalize_code(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', '-', 'g'));
$$;
revoke all on function public.curriculum_normalize_code(text) from public, anon, authenticated;
grant execute on function public.curriculum_normalize_code(text) to service_role;

create table if not exists public.curriculum_frameworks (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  code text not null,
  name text not null,
  provider_name text not null,
  programme_name text,
  jurisdiction text,
  authority_type text not null
    check (authority_type in ('external_reference', 'public_standard', 'brain_heist_original', 'school_original')),
  visibility text not null default 'global'
    check (visibility in ('global', 'school')),
  canonical_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, school_id),
  check (code = public.curriculum_normalize_code(code)),
  check (length(code) >= 2),
  check (length(trim(name)) >= 3),
  check (length(trim(provider_name)) >= 2),
  check ((visibility = 'global' and school_id is null) or (visibility = 'school' and school_id is not null))
);

create unique index if not exists curriculum_frameworks_global_code_uidx
  on public.curriculum_frameworks(code)
  where school_id is null;
create unique index if not exists curriculum_frameworks_school_code_uidx
  on public.curriculum_frameworks(school_id, code)
  where school_id is not null;
create index if not exists curriculum_frameworks_school_active_idx
  on public.curriculum_frameworks(school_id, is_active, name);

create table if not exists public.curriculum_framework_versions (
  id uuid primary key default gen_random_uuid(),
  framework_id uuid not null references public.curriculum_frameworks(id) on delete restrict,
  version_code text not null,
  display_name text not null,
  source_version text,
  source_uri text,
  source_license text not null,
  status text not null default 'draft'
    check (status in ('draft', 'in_review', 'approved', 'published', 'retired')),
  effective_from date,
  effective_to date,
  content_hash text,
  release_notes text,
  created_by uuid references public.users(id) on delete set null,
  reviewed_by uuid references public.users(id) on delete set null,
  approved_by uuid references public.users(id) on delete set null,
  published_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (framework_id, version_code),
  unique (id, framework_id),
  check (version_code = public.curriculum_normalize_code(version_code)),
  check (length(version_code) >= 1),
  check (length(trim(display_name)) >= 3),
  check (length(trim(source_license)) >= 3),
  check (effective_to is null or effective_from is null or effective_to >= effective_from),
  check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  check (status not in ('approved', 'published', 'retired') or (reviewed_by is not null and approved_by is not null)),
  check (status not in ('published', 'retired') or (published_at is not null and content_hash is not null)),
  check (status <> 'retired' or retired_at is not null)
);

create index if not exists curriculum_framework_versions_framework_status_idx
  on public.curriculum_framework_versions(framework_id, status, effective_from desc);
create index if not exists curriculum_framework_versions_created_by_idx
  on public.curriculum_framework_versions(created_by) where created_by is not null;
create index if not exists curriculum_framework_versions_reviewed_by_idx
  on public.curriculum_framework_versions(reviewed_by) where reviewed_by is not null;
create index if not exists curriculum_framework_versions_approved_by_idx
  on public.curriculum_framework_versions(approved_by) where approved_by is not null;
create unique index if not exists curriculum_framework_versions_one_published_code_uidx
  on public.curriculum_framework_versions(framework_id, version_code)
  where status = 'published';

create table if not exists public.curriculum_framework_subjects (
  id uuid primary key default gen_random_uuid(),
  framework_version_id uuid not null references public.curriculum_framework_versions(id) on delete cascade,
  academic_subject_id uuid not null references public.academic_subjects(id) on delete restrict,
  code text not null,
  name text not null,
  sequence_number smallint not null default 1 check (sequence_number > 0),
  source_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (framework_version_id, code),
  unique (framework_version_id, academic_subject_id),
  unique (id, framework_version_id),
  check (code = public.curriculum_normalize_code(code)),
  check (length(code) >= 2),
  check (length(trim(name)) >= 2)
);

create index if not exists curriculum_framework_subjects_academic_subject_idx
  on public.curriculum_framework_subjects(academic_subject_id, framework_version_id);

create table if not exists public.curriculum_stages (
  id uuid primary key default gen_random_uuid(),
  framework_version_id uuid not null references public.curriculum_framework_versions(id) on delete cascade,
  code text not null,
  name text not null,
  sequence_number smallint not null check (sequence_number > 0),
  typical_age_min smallint,
  typical_age_max smallint,
  source_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (framework_version_id, code),
  unique (framework_version_id, sequence_number),
  unique (id, framework_version_id),
  check (code = public.curriculum_normalize_code(code)),
  check (length(code) >= 1),
  check (length(trim(name)) >= 2),
  check (typical_age_min is null or typical_age_min between 2 and 25),
  check (typical_age_max is null or typical_age_max between 2 and 25),
  check (typical_age_max is null or typical_age_min is null or typical_age_max >= typical_age_min)
);

create table if not exists public.curriculum_scopes (
  id uuid primary key default gen_random_uuid(),
  framework_version_id uuid not null references public.curriculum_framework_versions(id) on delete cascade,
  framework_subject_id uuid not null,
  stage_id uuid not null,
  academic_subject_id uuid not null references public.academic_subjects(id) on delete restrict,
  code text not null,
  name text not null,
  sequence_number smallint not null default 1 check (sequence_number > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (framework_version_id, framework_subject_id, stage_id),
  unique (framework_version_id, code),
  unique (id, framework_version_id),
  unique (id, academic_subject_id),
  unique (id, framework_version_id, academic_subject_id),
  foreign key (framework_subject_id, framework_version_id)
    references public.curriculum_framework_subjects(id, framework_version_id) on delete cascade,
  foreign key (stage_id, framework_version_id)
    references public.curriculum_stages(id, framework_version_id) on delete cascade,
  check (code = public.curriculum_normalize_code(code)),
  check (length(code) >= 2),
  check (length(trim(name)) >= 3)
);

create index if not exists curriculum_scopes_subject_stage_idx
  on public.curriculum_scopes(academic_subject_id, stage_id, framework_version_id);
create index if not exists curriculum_scopes_framework_subject_idx
  on public.curriculum_scopes(framework_subject_id, stage_id);

create table if not exists public.curriculum_nodes (
  id uuid primary key default gen_random_uuid(),
  framework_version_id uuid not null,
  curriculum_scope_id uuid not null,
  parent_node_id uuid,
  node_type text not null
    check (node_type in ('strand', 'topic', 'skill', 'subskill')),
  code text not null,
  name text not null,
  description text,
  depth smallint not null default 0 check (depth between 0 and 8),
  sequence_number integer not null default 1 check (sequence_number > 0),
  source_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (curriculum_scope_id, code),
  unique (id, curriculum_scope_id),
  unique (id, framework_version_id),
  foreign key (curriculum_scope_id, framework_version_id)
    references public.curriculum_scopes(id, framework_version_id) on delete cascade,
  foreign key (parent_node_id, curriculum_scope_id)
    references public.curriculum_nodes(id, curriculum_scope_id) on delete cascade,
  check (code = public.curriculum_normalize_code(code)),
  check (length(code) >= 2),
  check (length(trim(name)) >= 2)
);

create index if not exists curriculum_nodes_parent_sequence_idx
  on public.curriculum_nodes(curriculum_scope_id, parent_node_id, sequence_number);
create index if not exists curriculum_nodes_type_idx
  on public.curriculum_nodes(curriculum_scope_id, node_type, sequence_number);
create index if not exists curriculum_nodes_version_idx
  on public.curriculum_nodes(framework_version_id, curriculum_scope_id);

create table if not exists public.curriculum_objectives (
  id uuid primary key default gen_random_uuid(),
  framework_version_id uuid not null,
  curriculum_scope_id uuid not null,
  curriculum_node_id uuid not null,
  code text not null,
  statement text not null,
  objective_type text not null default 'skill'
    check (objective_type in ('knowledge', 'understanding', 'skill', 'application', 'enquiry')),
  cognitive_level text
    check (cognitive_level is null or cognitive_level in ('remember', 'understand', 'apply', 'analyse', 'evaluate', 'create')),
  is_assessable boolean not null default true,
  command_terms text[] not null default '{}'::text[],
  tags text[] not null default '{}'::text[],
  sequence_number integer not null default 1 check (sequence_number > 0),
  source_reference text,
  source_uri text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (curriculum_scope_id, code),
  unique (id, framework_version_id),
  foreign key (curriculum_scope_id, framework_version_id)
    references public.curriculum_scopes(id, framework_version_id) on delete cascade,
  foreign key (curriculum_node_id, curriculum_scope_id)
    references public.curriculum_nodes(id, curriculum_scope_id) on delete restrict,
  check (code = public.curriculum_normalize_code(code)),
  check (length(code) >= 2),
  check (length(trim(statement)) >= 10)
);

create index if not exists curriculum_objectives_scope_node_idx
  on public.curriculum_objectives(curriculum_scope_id, curriculum_node_id, sequence_number);
create index if not exists curriculum_objectives_version_idx
  on public.curriculum_objectives(framework_version_id, curriculum_scope_id);
create index if not exists curriculum_objectives_assessable_idx
  on public.curriculum_objectives(curriculum_scope_id, sequence_number)
  where is_assessable;

create table if not exists public.curriculum_objective_prerequisites (
  framework_version_id uuid not null,
  objective_id uuid not null,
  prerequisite_objective_id uuid not null,
  relationship_type text not null default 'recommended'
    check (relationship_type in ('required', 'recommended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (objective_id, prerequisite_objective_id),
  foreign key (objective_id, framework_version_id)
    references public.curriculum_objectives(id, framework_version_id) on delete cascade,
  foreign key (prerequisite_objective_id, framework_version_id)
    references public.curriculum_objectives(id, framework_version_id) on delete cascade,
  check (objective_id <> prerequisite_objective_id)
);

create index if not exists curriculum_objective_prerequisites_reverse_idx
  on public.curriculum_objective_prerequisites(prerequisite_objective_id, objective_id);
create index if not exists curriculum_objective_prerequisites_version_idx
  on public.curriculum_objective_prerequisites(framework_version_id);

create table if not exists public.school_curriculum_scope_mappings (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null,
  grade_level text not null,
  academic_subject_id uuid not null references public.academic_subjects(id) on delete restrict,
  curriculum_scope_id uuid not null,
  status text not null default 'active'
    check (status in ('planned', 'active', 'archived')),
  mapping_quality text not null default 'confirmed'
    check (mapping_quality in ('confirmed', 'estimated')),
  notes text,
  created_by uuid references public.users(id) on delete set null,
  confirmed_by uuid references public.users(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (academic_year_id, school_id)
    references public.school_academic_years(id, school_id) on delete cascade,
  foreign key (curriculum_scope_id, academic_subject_id)
    references public.curriculum_scopes(id, academic_subject_id) on delete restrict,
  check (length(trim(grade_level)) >= 1),
  check (mapping_quality <> 'confirmed' or confirmed_at is not null)
);

create unique index if not exists school_curriculum_scope_mappings_current_uidx
  on public.school_curriculum_scope_mappings(school_id, academic_year_id, grade_level, academic_subject_id)
  where status in ('planned', 'active');
create index if not exists school_curriculum_scope_mappings_catalog_idx
  on public.school_curriculum_scope_mappings(school_id, academic_year_id, grade_level, status, academic_subject_id);
create index if not exists school_curriculum_scope_mappings_scope_idx
  on public.school_curriculum_scope_mappings(curriculum_scope_id, status);
create index if not exists school_curriculum_scope_mappings_year_idx
  on public.school_curriculum_scope_mappings(academic_year_id, school_id);
create index if not exists school_curriculum_scope_mappings_subject_idx
  on public.school_curriculum_scope_mappings(academic_subject_id, school_id);
create index if not exists school_curriculum_scope_mappings_created_by_idx
  on public.school_curriculum_scope_mappings(created_by) where created_by is not null;
create index if not exists school_curriculum_scope_mappings_confirmed_by_idx
  on public.school_curriculum_scope_mappings(confirmed_by) where confirmed_by is not null;

alter table public.curriculum_frameworks enable row level security;
alter table public.curriculum_framework_versions enable row level security;
alter table public.curriculum_framework_subjects enable row level security;
alter table public.curriculum_stages enable row level security;
alter table public.curriculum_scopes enable row level security;
alter table public.curriculum_nodes enable row level security;
alter table public.curriculum_objectives enable row level security;
alter table public.curriculum_objective_prerequisites enable row level security;
alter table public.school_curriculum_scope_mappings enable row level security;

revoke all on table public.curriculum_frameworks from public, anon, authenticated, service_role;
revoke all on table public.curriculum_framework_versions from public, anon, authenticated, service_role;
revoke all on table public.curriculum_framework_subjects from public, anon, authenticated, service_role;
revoke all on table public.curriculum_stages from public, anon, authenticated, service_role;
revoke all on table public.curriculum_scopes from public, anon, authenticated, service_role;
revoke all on table public.curriculum_nodes from public, anon, authenticated, service_role;
revoke all on table public.curriculum_objectives from public, anon, authenticated, service_role;
revoke all on table public.curriculum_objective_prerequisites from public, anon, authenticated, service_role;
revoke all on table public.school_curriculum_scope_mappings from public, anon, authenticated, service_role;

grant select, insert, update, delete on table public.curriculum_frameworks to service_role;
grant select, insert, update, delete on table public.curriculum_framework_versions to service_role;
grant select, insert, update, delete on table public.curriculum_framework_subjects to service_role;
grant select, insert, update, delete on table public.curriculum_stages to service_role;
grant select, insert, update, delete on table public.curriculum_scopes to service_role;
grant select, insert, update, delete on table public.curriculum_nodes to service_role;
grant select, insert, update, delete on table public.curriculum_objectives to service_role;
grant select, insert, update, delete on table public.curriculum_objective_prerequisites to service_role;
grant select, insert, update, delete on table public.school_curriculum_scope_mappings to service_role;

create or replace function private.curriculum_version_content_is_locked(p_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select v.status in ('approved', 'published', 'retired')
    from public.curriculum_framework_versions v
    where v.id = p_version_id
  ), true);
$$;
revoke all on function private.curriculum_version_content_is_locked(uuid) from public, anon, authenticated, service_role;

create or replace function private.curriculum_guard_framework_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and exists (
    select 1 from public.curriculum_framework_versions v
    where v.framework_id = old.id and v.status in ('published', 'retired')
  ) then
    raise exception using errcode = '55000', message = 'published_curriculum_framework_is_immutable';
  end if;
  if tg_op = 'UPDATE' and exists (
    select 1 from public.curriculum_framework_versions v
    where v.framework_id = old.id and v.status in ('published', 'retired')
  ) and row(new.school_id, new.code, new.name, new.provider_name, new.programme_name,
            new.jurisdiction, new.authority_type, new.visibility)
        is distinct from
        row(old.school_id, old.code, old.name, old.provider_name, old.programme_name,
            old.jurisdiction, old.authority_type, old.visibility) then
    raise exception using errcode = '55000', message = 'published_curriculum_framework_identity_is_immutable';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    return new;
  end if;
  return old;
end;
$$;
revoke all on function private.curriculum_guard_framework_identity() from public, anon, authenticated, service_role;

drop trigger if exists trg_curriculum_guard_framework_identity on public.curriculum_frameworks;
create trigger trg_curriculum_guard_framework_identity
before update or delete on public.curriculum_frameworks
for each row execute function private.curriculum_guard_framework_identity();

create or replace function private.curriculum_guard_version_content_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version_id uuid := coalesce(new.framework_version_id, old.framework_version_id);
begin
  if private.curriculum_version_content_is_locked(v_version_id) then
    raise exception using errcode = '55000', message = 'curriculum_version_content_locked';
  end if;
  if tg_op <> 'DELETE' then
    new.updated_at := now();
    return new;
  end if;
  return old;
end;
$$;
revoke all on function private.curriculum_guard_version_content_mutation() from public, anon, authenticated, service_role;

create or replace function private.curriculum_validate_version_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception using errcode = '55000', message = 'only_draft_curriculum_versions_can_be_deleted';
    end if;
    return old;
  end if;

  if old.status in ('published', 'retired') then
    if not (old.status = 'published' and new.status = 'retired') then
      raise exception using errcode = '55000', message = 'published_curriculum_version_is_immutable';
    end if;
    if row(new.framework_id, new.version_code, new.display_name, new.source_version, new.source_uri,
           new.source_license, new.effective_from, new.effective_to, new.content_hash)
       is distinct from
       row(old.framework_id, old.version_code, old.display_name, old.source_version, old.source_uri,
           old.source_license, old.effective_from, old.effective_to, old.content_hash) then
      raise exception using errcode = '55000', message = 'published_curriculum_version_metadata_is_immutable';
    end if;
  elsif new.status <> old.status and not (
    (old.status = 'draft' and new.status = 'in_review') or
    (old.status = 'in_review' and new.status in ('draft', 'approved')) or
    (old.status = 'approved' and new.status in ('in_review', 'published'))
  ) then
    raise exception using errcode = '23514', message = 'invalid_curriculum_version_transition';
  end if;

  if new.status in ('in_review', 'approved', 'published', 'retired') and new.reviewed_by is null then
    raise exception using errcode = '23514', message = 'curriculum_reviewer_required';
  end if;
  if new.status in ('approved', 'published', 'retired') and new.approved_by is null then
    raise exception using errcode = '23514', message = 'curriculum_approver_required';
  end if;

  if new.status = 'published' then
    if new.content_hash is null or new.content_hash !~ '^[0-9a-f]{64}$' then
      raise exception using errcode = '23514', message = 'curriculum_content_hash_required';
    end if;
    new.published_at := coalesce(new.published_at, now());
  elsif new.status = 'retired' then
    new.retired_at := coalesce(new.retired_at, now());
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.curriculum_validate_version_transition() from public, anon, authenticated, service_role;

drop trigger if exists trg_curriculum_validate_version_transition on public.curriculum_framework_versions;
create trigger trg_curriculum_validate_version_transition
before update or delete on public.curriculum_framework_versions
for each row execute function private.curriculum_validate_version_transition();

create or replace function private.curriculum_validate_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject_id uuid;
begin
  select s.academic_subject_id into v_subject_id
  from public.curriculum_framework_subjects s
  where s.id = new.framework_subject_id
    and s.framework_version_id = new.framework_version_id;
  if v_subject_id is null or v_subject_id <> new.academic_subject_id then
    raise exception using errcode = '23514', message = 'curriculum_scope_subject_mismatch';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.curriculum_validate_scope() from public, anon, authenticated, service_role;

drop trigger if exists trg_curriculum_validate_scope on public.curriculum_scopes;
create trigger trg_curriculum_validate_scope
before insert or update on public.curriculum_scopes
for each row execute function private.curriculum_validate_scope();

create or replace function private.curriculum_validate_node()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent public.curriculum_nodes%rowtype;
  v_parent_rank smallint;
  v_child_rank smallint;
begin
  v_child_rank := case new.node_type when 'strand' then 1 when 'topic' then 2 when 'skill' then 3 else 4 end;
  if new.parent_node_id is null then
    if new.node_type <> 'strand' then
      raise exception using errcode = '23514', message = 'curriculum_root_node_must_be_strand';
    end if;
    new.depth := 0;
  else
    if new.parent_node_id = new.id then
      raise exception using errcode = '23514', message = 'curriculum_node_cannot_parent_itself';
    end if;
    select * into v_parent from public.curriculum_nodes n
    where n.id = new.parent_node_id and n.curriculum_scope_id = new.curriculum_scope_id;
    if not found then
      raise exception using errcode = '23503', message = 'curriculum_parent_node_not_found';
    end if;
    v_parent_rank := case v_parent.node_type when 'strand' then 1 when 'topic' then 2 when 'skill' then 3 else 4 end;
    if v_child_rank <= v_parent_rank then
      raise exception using errcode = '23514', message = 'curriculum_node_type_order_invalid';
    end if;
    if exists (
      with recursive descendants as (
        select n.id from public.curriculum_nodes n where n.parent_node_id = new.id
        union all
        select n.id from public.curriculum_nodes n join descendants d on n.parent_node_id = d.id
      )
      select 1 from descendants where id = new.parent_node_id
    ) then
      raise exception using errcode = '23514', message = 'curriculum_node_cycle_detected';
    end if;
    new.depth := v_parent.depth + 1;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.curriculum_validate_node() from public, anon, authenticated, service_role;

drop trigger if exists trg_curriculum_validate_node on public.curriculum_nodes;
create trigger trg_curriculum_validate_node
before insert or update on public.curriculum_nodes
for each row execute function private.curriculum_validate_node();

create or replace function private.curriculum_validate_school_mapping()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version_status text;
  v_framework_school_id uuid;
begin
  select v.status, f.school_id into v_version_status, v_framework_school_id
  from public.curriculum_scopes s
  join public.curriculum_framework_versions v on v.id = s.framework_version_id
  join public.curriculum_frameworks f on f.id = v.framework_id
  where s.id = new.curriculum_scope_id;
  if v_version_status <> 'published' then
    raise exception using errcode = '23514', message = 'school_mapping_requires_published_curriculum';
  end if;
  if v_framework_school_id is not null and v_framework_school_id <> new.school_id then
    raise exception using errcode = '42501', message = 'school_curriculum_framework_access_denied';
  end if;
  if new.mapping_quality = 'confirmed' then
    new.confirmed_at := coalesce(new.confirmed_at, now());
  else
    new.confirmed_at := null;
    new.confirmed_by := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.curriculum_validate_school_mapping() from public, anon, authenticated, service_role;

drop trigger if exists trg_curriculum_validate_school_mapping on public.school_curriculum_scope_mappings;
create trigger trg_curriculum_validate_school_mapping
before insert or update on public.school_curriculum_scope_mappings
for each row execute function private.curriculum_validate_school_mapping();

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'curriculum_framework_subjects',
    'curriculum_stages',
    'curriculum_scopes',
    'curriculum_nodes',
    'curriculum_objectives',
    'curriculum_objective_prerequisites'
  ] loop
    execute format('drop trigger if exists trg_%I_content_lock on public.%I', v_table, v_table);
    execute format(
      'create trigger trg_%I_content_lock before insert or update or delete on public.%I for each row execute function private.curriculum_guard_version_content_mutation()',
      v_table,
      v_table
    );
  end loop;
end;
$$;

create or replace function public.rpc_curriculum_version_readiness(p_version_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object(
      'success', true,
      'versionId', v.id,
      'status', v.status,
      'subjects', c.subjects,
      'stages', c.stages,
      'scopes', c.scopes,
      'nodes', c.nodes,
      'objectives', c.objectives,
      'assessableObjectives', c.assessable_objectives,
      'scopesWithoutObjectives', c.scopes_without_objectives,
      'readyToPublish', (
        v.status = 'approved' and nullif(trim(v.source_uri), '') is not null
        and nullif(trim(v.source_license), '') is not null and c.subjects > 0 and c.stages > 0
        and c.scopes > 0 and c.objectives > 0 and c.assessable_objectives > 0
        and c.scopes_without_objectives = 0
      )
    )
    from public.curriculum_framework_versions v
    cross join lateral (
      select
        (select count(*) from public.curriculum_framework_subjects s where s.framework_version_id = p_version_id) as subjects,
        (select count(*) from public.curriculum_stages s where s.framework_version_id = p_version_id) as stages,
        (select count(*) from public.curriculum_scopes s where s.framework_version_id = p_version_id) as scopes,
        (select count(*) from public.curriculum_nodes n where n.framework_version_id = p_version_id) as nodes,
        (select count(*) from public.curriculum_objectives o where o.framework_version_id = p_version_id) as objectives,
        (select count(*) from public.curriculum_objectives o where o.framework_version_id = p_version_id and o.is_assessable) as assessable_objectives,
        (select count(*) from public.curriculum_scopes s
         where s.framework_version_id = p_version_id and not exists (
           select 1 from public.curriculum_objectives o where o.curriculum_scope_id = s.id
         )) as scopes_without_objectives
    ) c
    where v.id = p_version_id
  ), jsonb_build_object('success', false, 'code', 'curriculum_version_not_found'));
$$;
revoke all on function public.rpc_curriculum_version_readiness(uuid) from public, anon, authenticated;
grant execute on function public.rpc_curriculum_version_readiness(uuid) to service_role;

create or replace function public.rpc_curriculum_publish_version(
  p_version_id uuid,
  p_content_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_readiness jsonb;
begin
  if p_content_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('success', false, 'code', 'invalid_content_hash');
  end if;
  v_readiness := public.rpc_curriculum_version_readiness(p_version_id);
  if coalesce((v_readiness->>'readyToPublish')::boolean, false) is not true then
    return jsonb_build_object('success', false, 'code', 'curriculum_version_not_ready', 'readiness', v_readiness);
  end if;
  update public.curriculum_framework_versions
  set content_hash = p_content_hash, status = 'published', published_at = now()
  where id = p_version_id and status = 'approved';
  if not found then
    return jsonb_build_object('success', false, 'code', 'curriculum_version_publish_conflict');
  end if;
  return jsonb_build_object('success', true, 'versionId', p_version_id, 'status', 'published');
end;
$$;
revoke all on function public.rpc_curriculum_publish_version(uuid, text) from public, anon, authenticated;
grant execute on function public.rpc_curriculum_publish_version(uuid, text) to service_role;

create or replace function public.rpc_school_admin_set_curriculum_scope_mapping(
  p_school_id uuid,
  p_academic_year_id uuid,
  p_grade_level text,
  p_academic_subject_id uuid,
  p_curriculum_scope_id uuid,
  p_status text default 'active',
  p_mapping_quality text default 'confirmed',
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_mapping_id uuid;
begin
  if v_actor is null or not (
    public.can_administer_school(p_school_id) or public.is_school_owner(p_school_id)
  ) then
    raise exception using errcode = '42501', message = 'school_administrator_access_required';
  end if;
  if p_status not in ('planned', 'active') then
    return jsonb_build_object('success', false, 'code', 'invalid_curriculum_mapping_status');
  end if;
  if p_mapping_quality not in ('confirmed', 'estimated') then
    return jsonb_build_object('success', false, 'code', 'invalid_curriculum_mapping_quality');
  end if;
  if nullif(trim(p_grade_level), '') is null then
    return jsonb_build_object('success', false, 'code', 'grade_level_required');
  end if;

  insert into public.school_curriculum_scope_mappings(
    school_id, academic_year_id, grade_level, academic_subject_id, curriculum_scope_id,
    status, mapping_quality, notes, created_by, confirmed_by, confirmed_at
  ) values (
    p_school_id, p_academic_year_id, trim(p_grade_level), p_academic_subject_id, p_curriculum_scope_id,
    p_status, p_mapping_quality, nullif(trim(p_notes), ''), v_actor,
    case when p_mapping_quality = 'confirmed' then v_actor else null end,
    case when p_mapping_quality = 'confirmed' then now() else null end
  )
  on conflict (school_id, academic_year_id, grade_level, academic_subject_id)
    where status in ('planned', 'active')
  do update set
    curriculum_scope_id = excluded.curriculum_scope_id,
    status = excluded.status,
    mapping_quality = excluded.mapping_quality,
    notes = excluded.notes,
    confirmed_by = excluded.confirmed_by,
    confirmed_at = excluded.confirmed_at,
    updated_at = now()
  returning id into v_mapping_id;

  return jsonb_build_object('success', true, 'mappingId', v_mapping_id);
end;
$$;
revoke all on function public.rpc_school_admin_set_curriculum_scope_mapping(uuid, uuid, text, uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.rpc_school_admin_set_curriculum_scope_mapping(uuid, uuid, text, uuid, uuid, text, text, text)
  to authenticated, service_role;

create or replace function public.rpc_school_admin_archive_curriculum_scope_mapping(
  p_school_id uuid,
  p_mapping_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (
    public.can_administer_school(p_school_id) or public.is_school_owner(p_school_id)
  ) then
    raise exception using errcode = '42501', message = 'school_administrator_access_required';
  end if;
  update public.school_curriculum_scope_mappings
  set status = 'archived', updated_at = now()
  where id = p_mapping_id and school_id = p_school_id and status <> 'archived';
  return jsonb_build_object('success', found, 'mappingId', p_mapping_id);
end;
$$;
revoke all on function public.rpc_school_admin_archive_curriculum_scope_mapping(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.rpc_school_admin_archive_curriculum_scope_mapping(uuid, uuid)
  to authenticated, service_role;

create or replace function private.curriculum_assert_school_member(p_school_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (
    exists (
      select 1 from public.school_members sm
      where sm.school_id = p_school_id and sm.user_id = auth.uid() and sm.status = 'active'
    ) or public.is_superadmin(auth.uid())
  ) then
    raise exception using errcode = '42501', message = 'active_school_membership_required';
  end if;
end;
$$;
revoke all on function private.curriculum_assert_school_member(uuid) from public, anon, authenticated, service_role;

create or replace function public.rpc_school_curriculum_catalog(
  p_school_id uuid,
  p_academic_year_id uuid default null,
  p_grade_level text default null,
  p_academic_subject_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform private.curriculum_assert_school_member(p_school_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'mappingId', m.id,
    'academicYearId', m.academic_year_id,
    'gradeLevel', m.grade_level,
    'status', m.status,
    'mappingQuality', m.mapping_quality,
    'academicSubjectId', m.academic_subject_id,
    'academicSubject', a.name,
    'scopeId', s.id,
    'scopeCode', s.code,
    'scopeName', s.name,
    'stageId', st.id,
    'stageCode', st.code,
    'stageName', st.name,
    'frameworkId', f.id,
    'frameworkCode', f.code,
    'frameworkName', f.name,
    'frameworkVersionId', v.id,
    'frameworkVersion', v.version_code,
    'contentHash', v.content_hash,
    'objectiveCount', (select count(*) from public.curriculum_objectives o where o.curriculum_scope_id = s.id),
    'assessableObjectiveCount', (select count(*) from public.curriculum_objectives o where o.curriculum_scope_id = s.id and o.is_assessable)
  ) order by m.grade_level, a.name, st.sequence_number), '[]'::jsonb)
  into v_result
  from public.school_curriculum_scope_mappings m
  join public.curriculum_scopes s on s.id = m.curriculum_scope_id
  join public.curriculum_stages st on st.id = s.stage_id
  join public.curriculum_framework_versions v on v.id = s.framework_version_id and v.status = 'published'
  join public.curriculum_frameworks f on f.id = v.framework_id
  join public.academic_subjects a on a.id = m.academic_subject_id
  where m.school_id = p_school_id
    and m.status in ('planned', 'active')
    and (p_academic_year_id is null or m.academic_year_id = p_academic_year_id)
    and (p_grade_level is null or m.grade_level = trim(p_grade_level))
    and (p_academic_subject_id is null or m.academic_subject_id = p_academic_subject_id);
  return jsonb_build_object('success', true, 'mappings', v_result);
end;
$$;
revoke all on function public.rpc_school_curriculum_catalog(uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.rpc_school_curriculum_catalog(uuid, uuid, text, uuid)
  to authenticated, service_role;

create or replace function public.rpc_school_curriculum_scope_detail(
  p_school_id uuid,
  p_mapping_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mapping public.school_curriculum_scope_mappings%rowtype;
begin
  perform private.curriculum_assert_school_member(p_school_id);
  select * into v_mapping from public.school_curriculum_scope_mappings m
  where m.id = p_mapping_id and m.school_id = p_school_id and m.status in ('planned', 'active');
  if not found then
    return jsonb_build_object('success', false, 'code', 'curriculum_mapping_not_found');
  end if;
  return jsonb_build_object(
    'success', true,
    'mappingId', v_mapping.id,
    'scopeId', v_mapping.curriculum_scope_id,
    'nodes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id, 'parentId', n.parent_node_id, 'type', n.node_type,
        'code', n.code, 'name', n.name, 'description', n.description,
        'depth', n.depth, 'sequence', n.sequence_number, 'sourceReference', n.source_reference
      ) order by n.depth, n.sequence_number, n.code)
      from public.curriculum_nodes n where n.curriculum_scope_id = v_mapping.curriculum_scope_id
    ), '[]'::jsonb),
    'objectives', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'nodeId', o.curriculum_node_id, 'code', o.code,
        'statement', o.statement, 'objectiveType', o.objective_type,
        'cognitiveLevel', o.cognitive_level, 'isAssessable', o.is_assessable,
        'commandTerms', to_jsonb(o.command_terms), 'tags', to_jsonb(o.tags),
        'sequence', o.sequence_number, 'sourceReference', o.source_reference,
        'sourceUri', o.source_uri
      ) order by o.sequence_number, o.code)
      from public.curriculum_objectives o where o.curriculum_scope_id = v_mapping.curriculum_scope_id
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.rpc_school_curriculum_scope_detail(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.rpc_school_curriculum_scope_detail(uuid, uuid)
  to authenticated, service_role;

comment on table public.curriculum_framework_versions is
  'Immutable once published. Corrections and curriculum revisions must be represented by a new version.';
comment on table public.curriculum_scopes is
  'A versioned subject-and-stage slice used for school grade mappings and later question-objective links.';
comment on table public.curriculum_nodes is
  'Flexible typed hierarchy for strands, topics, skills, and subskills within one curriculum scope.';
comment on table public.curriculum_objectives is
  'Versioned learning objectives; source wording and references are preserved for auditability.';
comment on table public.school_curriculum_scope_mappings is
  'School-confirmed academic-year, grade, and subject mapping to one published curriculum scope.';

notify pgrst, 'reload schema';
