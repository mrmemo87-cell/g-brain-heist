-- Evidence Focus v1
-- Controlled remediation targets beneath stable canonical subskills.
-- Existing verified taxonomy is migrated append-only; historical rows remain auditable.

create table if not exists public.academic_skill_evidence_focuses (
  id uuid primary key default gen_random_uuid(),
  registry_version_id uuid not null references public.academic_skill_registry_versions(id) on delete restrict,
  atomic_subskill_node_id uuid not null references public.academic_skill_registry_nodes(id) on delete restrict,
  code text not null unique,
  name text not null check (length(trim(name)) between 3 and 220),
  description text not null check (length(trim(description)) between 10 and 700),
  applicable_phases text[] not null default '{}'::text[],
  source_method text not null default 'human_governed'
    check (source_method in ('verified_bank_backfill','human_governed','platform_seed')),
  source_fingerprint text not null,
  status text not null default 'active' check (status in ('active','retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (atomic_subskill_node_id, source_fingerprint)
);

create index if not exists academic_skill_evidence_focuses_subskill_idx
  on public.academic_skill_evidence_focuses(atomic_subskill_node_id,status);
create index if not exists academic_skill_evidence_focuses_registry_idx
  on public.academic_skill_evidence_focuses(registry_version_id,status);

alter table public.academic_skill_evidence_focuses enable row level security;
revoke all on public.academic_skill_evidence_focuses from public,anon,authenticated,service_role;
grant select on public.academic_skill_evidence_focuses to authenticated,service_role;
drop policy if exists "Authenticated can read active academic evidence focuses"
  on public.academic_skill_evidence_focuses;
create policy "Authenticated can read active academic evidence focuses"
  on public.academic_skill_evidence_focuses
  for select to authenticated
  using (
    status='active'
    and exists (
      select 1 from public.academic_skill_registry_versions v
      where v.id=registry_version_id and v.status='published'
    )
  );

alter table public.verified_question_diagnostic_taxonomy
  add column if not exists evidence_focus_code text,
  add column if not exists evidence_focus_name text;

-- Seed controlled focus catalogue from the active verified bank before superseding.
with active as (
  select t.*,leaf.id atomic_subskill_node_id,leaf.registry_version_id,
         leaf.applicable_phases,
         trim(regexp_replace(
           regexp_replace(t.evidence_statement,
             '^A correct response (shows|demonstrates|is evidence that)( that)?( the learner)?( can)?[[:space:]]+',
             '', 'i'),
           '[.]$','','g'
         )) focus_name
  from private.active_verified_question_diagnostic_taxonomy t
  join public.academic_skill_registry_nodes leaf
    on leaf.code=t.atomic_subskill_code
   and leaf.node_type='subskill'
   and leaf.status='active'
  where t.evidence_focus_code is null
),
seed as (
  select distinct
    registry_version_id,atomic_subskill_node_id,atomic_subskill_code,applicable_phases,
    lower(encode(extensions.digest(trim(evidence_statement),'sha256'),'hex')) source_fingerprint,
    case when length(focus_name)>=3 then upper(substr(focus_name,1,1))||substr(focus_name,2)
         else atomic_subskill_name end focus_name,
    evidence_statement
  from active
)
insert into public.academic_skill_evidence_focuses(
  registry_version_id,atomic_subskill_node_id,code,name,description,
  applicable_phases,source_method,source_fingerprint,status
)
select
  registry_version_id,atomic_subskill_node_id,
  atomic_subskill_code||'.focus.'||
    left(trim(both '-' from regexp_replace(lower(focus_name),'[^a-z0-9]+','-','g')),64)||
    '-'||substr(source_fingerprint,1,10),
  focus_name,evidence_statement,applicable_phases,
  'verified_bank_backfill',source_fingerprint,'active'
from seed
on conflict (atomic_subskill_node_id,source_fingerprint) do nothing;

-- Append focus-bearing successors; never rewrite old taxonomy.
with active as (
  select t.*,
         lower(encode(extensions.digest(trim(t.evidence_statement),'sha256'),'hex')) source_fingerprint
  from private.active_verified_question_diagnostic_taxonomy t
  where t.evidence_focus_code is null
),
resolved as (
  select a.*,f.code focus_code,f.name focus_name
  from active a
  join public.academic_skill_registry_nodes leaf
    on leaf.code=a.atomic_subskill_code and leaf.node_type='subskill'
  join public.academic_skill_evidence_focuses f
    on f.atomic_subskill_node_id=leaf.id
   and f.source_fingerprint=a.source_fingerprint
   and f.status='active'
)
insert into public.verified_question_diagnostic_taxonomy(
  question_id,assessment_item_id,curriculum_mapping_id,question_content_hash,
  scope_code,objective_code,package_version,taxonomy_version,
  primary_skill_code,primary_skill_name,atomic_subskill_code,atomic_subskill_name,
  assessment_process_code,cognitive_process,evidence_statement,secondary_skill_codes,
  confidence_score,review_status,human_review_required,review_reason,
  supersedes_taxonomy_id,reviewed_by_authority,taxonomy_hash,
  evidence_focus_code,evidence_focus_name
)
select
  question_id,assessment_item_id,curriculum_mapping_id,question_content_hash,
  scope_code,objective_code,package_version,taxonomy_version||'-ef1',
  primary_skill_code,primary_skill_name,atomic_subskill_code,atomic_subskill_name,
  assessment_process_code,cognitive_process,evidence_statement,secondary_skill_codes,
  confidence_score,'approved',false,
  concat_ws(' · ',nullif(review_reason,''),'Evidence Focus v1 backfill'),
  id,'Brains Heist Platform Superadmin · Evidence Focus Backfill 2026-09-24','',
  focus_code,focus_name
from resolved
where not exists (
  select 1 from public.verified_question_diagnostic_taxonomy s
  where s.supersedes_taxonomy_id=resolved.id
    and s.review_status='approved' and not s.human_review_required
);

create or replace view private.active_verified_question_diagnostic_taxonomy as
select
  id,question_id,assessment_item_id,curriculum_mapping_id,question_content_hash,
  scope_code,objective_code,package_version,taxonomy_version,
  primary_skill_code,primary_skill_name,atomic_subskill_code,atomic_subskill_name,
  assessment_process_code,cognitive_process,evidence_statement,secondary_skill_codes,
  confidence_score,review_status,human_review_required,review_reason,
  supersedes_taxonomy_id,reviewed_by_authority,reviewed_at,taxonomy_hash,created_at,
  evidence_focus_code,evidence_focus_name
from public.verified_question_diagnostic_taxonomy t
where review_status='approved'
  and not human_review_required
  and not exists (
    select 1 from public.verified_question_diagnostic_taxonomy successor
    where successor.supersedes_taxonomy_id=t.id
      and successor.review_status in ('approved','retired')
  );
revoke all on private.active_verified_question_diagnostic_taxonomy
from public,anon,authenticated,service_role;

-- Every published subskill must have at least one selectable focus.
insert into public.academic_skill_evidence_focuses(
  registry_version_id,atomic_subskill_node_id,code,name,description,
  applicable_phases,source_method,source_fingerprint,status
)
select
  leaf.registry_version_id,leaf.id,
  leaf.code||'.focus.core-demonstration',
  'Core demonstration: '||leaf.name,
  coalesce(nullif(trim(leaf.description),''),
    'Demonstrate the core competency represented by '||leaf.name||'.'),
  leaf.applicable_phases,'platform_seed',
  encode(extensions.digest('platform-seed:core:'||leaf.code,'sha256'),'hex'),'active'
from public.academic_skill_registry_nodes leaf
join public.academic_skill_registry_versions v
  on v.id=leaf.registry_version_id and v.status='published'
where leaf.node_type='subskill' and leaf.status='active'
  and not exists(
    select 1 from public.academic_skill_evidence_focuses f
    where f.atomic_subskill_node_id=leaf.id and f.status='active'
  )
on conflict(code) do update set
  status='active',name=excluded.name,description=excluded.description,
  applicable_phases=excluded.applicable_phases,updated_at=now();

-- Curated example: keep present-continuous formation distinct from past-continuous practice.
with leaf as (
  select id,registry_version_id,applicable_phases
  from public.academic_skill_registry_nodes
  where code='eng.use-of-english.verb-aspect.simple-progressive'
    and node_type='subskill' and status='active'
)
insert into public.academic_skill_evidence_focuses(
  registry_version_id,atomic_subskill_node_id,code,name,description,
  applicable_phases,source_method,source_fingerprint,status
)
select registry_version_id,id,
  'eng.use-of-english.verb-aspect.simple-progressive.focus.forming-present-continuous-verbs',
  'Forming present continuous verbs',
  'Form present continuous verb phrases using am/is/are with the appropriate -ing form of the lexical verb.',
  applicable_phases,'platform_seed',
  encode(extensions.digest('platform-seed:forming-present-continuous-verbs','sha256'),'hex'),'active'
from leaf
on conflict(code) do update set
  name=excluded.name,description=excluded.description,
  applicable_phases=excluded.applicable_phases,status='active',updated_at=now();

CREATE OR REPLACE FUNCTION private.resolve_canonical_evidence_focus(p_subject_key text, p_grade_level integer, p_atomic_subskill_code text, p_evidence_focus_code text)
 RETURNS TABLE(evidence_focus_code text, evidence_focus_name text, evidence_focus_description text)
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
  select f.code,f.name,f.description
  from alias a
  join public.academic_skill_registry_versions v
    on v.id=a.registry_version_id and v.status='published'
  join public.academic_skill_registry_nodes leaf
    on leaf.registry_version_id=v.id
   and leaf.code=trim(coalesce(p_atomic_subskill_code,''))
   and leaf.node_type='subskill'
   and leaf.status='active'
  join public.academic_skill_registry_nodes skill
    on skill.id=leaf.parent_id and skill.node_type='skill' and skill.status='active'
  join public.academic_skill_registry_nodes strand
    on strand.id=skill.parent_id and strand.node_type='strand' and strand.status='active'
  join public.academic_skill_evidence_focuses f
    on f.registry_version_id=v.id
   and f.atomic_subskill_node_id=leaf.id
   and f.code=trim(coalesce(p_evidence_focus_code,''))
   and f.status='active'
  cross join phase p
  where p.phase is not null
    and p.phase=any(leaf.applicable_phases)
    and p.phase=any(skill.applicable_phases)
    and (cardinality(f.applicable_phases)=0 or p.phase=any(f.applicable_phases))
    and (a.allowed_strand_codes is null or strand.code=any(a.allowed_strand_codes))
  limit 1;
$function$
;
CREATE OR REPLACE FUNCTION public.rpc_academic_evidence_focuses_for_subskill(p_subject_key text, p_grade_level integer, p_atomic_subskill_code text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
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
  ),
  target as (
    select v.id registry_version_id,leaf.id leaf_id
    from alias a
    join public.academic_skill_registry_versions v
      on v.id=a.registry_version_id and v.status='published'
    join public.academic_skill_registry_nodes leaf
      on leaf.registry_version_id=v.id
     and leaf.code=trim(coalesce(p_atomic_subskill_code,''))
     and leaf.node_type='subskill' and leaf.status='active'
    join public.academic_skill_registry_nodes skill
      on skill.id=leaf.parent_id and skill.status='active'
    join public.academic_skill_registry_nodes strand
      on strand.id=skill.parent_id and strand.status='active'
    cross join phase p
    where p.phase is not null
      and p.phase=any(leaf.applicable_phases)
      and p.phase=any(skill.applicable_phases)
      and (a.allowed_strand_codes is null or strand.code=any(a.allowed_strand_codes))
  )
  select jsonb_build_object(
    'success',true,
    'focuses',coalesce((
      select jsonb_agg(jsonb_build_object(
        'code',f.code,
        'name',f.name,
        'description',f.description,
        'sourceMethod',f.source_method
      ) order by f.name)
      from target t
      join public.academic_skill_evidence_focuses f
        on f.registry_version_id=t.registry_version_id
       and f.atomic_subskill_node_id=t.leaf_id
       and f.status='active'
      cross join phase p
      where cardinality(f.applicable_phases)=0 or p.phase=any(f.applicable_phases)
    ),'[]'::jsonb)
  );
$function$
;
CREATE OR REPLACE FUNCTION private.resolve_or_create_evidence_focus_for_superadmin(p_subject_key text, p_grade_level integer, p_atomic_subskill_code text, p_evidence_statement text, p_requested_focus_code text DEFAULT NULL::text)
 RETURNS TABLE(evidence_focus_code text, evidence_focus_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_alias public.academic_skill_registry_subject_aliases%rowtype;
  v_leaf public.academic_skill_registry_nodes%rowtype;
  v_phase text;
  v_fingerprint text;
  v_name text;
  v_code text;
begin
  if auth.uid() is null or not public.is_superadmin(auth.uid()) then
    raise exception using errcode='42501',message='platform_superadmin_access_required';
  end if;

  v_phase:=case
    when p_grade_level between 1 and 6 then 'primary'
    when p_grade_level between 7 and 9 then 'lower_secondary'
    when p_grade_level between 10 and 12 then 'upper_secondary'
    else null
  end;
  if v_phase is null then
    raise exception using errcode='23514',message='taxonomy_review_evidence_focus_grade_required';
  end if;

  select a.* into v_alias
  from public.academic_skill_registry_subject_aliases a
  join public.academic_skill_registry_versions v
    on v.id=a.registry_version_id and v.status='published'
  where a.alias_normalized=lower(trim(coalesce(p_subject_key,'')))
    and a.status='active'
  limit 1;
  if not found then
    raise exception using errcode='23514',message='taxonomy_review_evidence_focus_registry_required';
  end if;

  select leaf.* into v_leaf
  from public.academic_skill_registry_nodes leaf
  join public.academic_skill_registry_nodes skill
    on skill.id=leaf.parent_id and skill.node_type='skill' and skill.status='active'
  join public.academic_skill_registry_nodes strand
    on strand.id=skill.parent_id and strand.node_type='strand' and strand.status='active'
  where leaf.registry_version_id=v_alias.registry_version_id
    and leaf.code=trim(coalesce(p_atomic_subskill_code,''))
    and leaf.node_type='subskill'
    and leaf.status='active'
    and v_phase=any(leaf.applicable_phases)
    and v_phase=any(skill.applicable_phases)
    and (v_alias.allowed_strand_codes is null or strand.code=any(v_alias.allowed_strand_codes))
  limit 1;
  if not found then
    raise exception using errcode='23514',message='taxonomy_review_evidence_focus_registry_required';
  end if;

  if nullif(trim(coalesce(p_requested_focus_code,'')),'') is not null then
    select f.code,f.name into v_code,v_name
    from public.academic_skill_evidence_focuses f
    where f.registry_version_id=v_leaf.registry_version_id
      and f.atomic_subskill_node_id=v_leaf.id
      and f.code=trim(p_requested_focus_code)
      and f.status='active'
      and (cardinality(f.applicable_phases)=0 or v_phase=any(f.applicable_phases))
    limit 1;
    if not found then
      raise exception using errcode='23514',message='taxonomy_review_evidence_focus_match_required';
    end if;
    return query select v_code,v_name;
    return;
  end if;

  if length(trim(coalesce(p_evidence_statement,'')))<10 then
    raise exception using errcode='23514',message='taxonomy_review_evidence_statement_required';
  end if;

  v_fingerprint:=lower(encode(extensions.digest(trim(p_evidence_statement),'sha256'),'hex'));
  select f.code,f.name into v_code,v_name
  from public.academic_skill_evidence_focuses f
  where f.registry_version_id=v_leaf.registry_version_id
    and f.atomic_subskill_node_id=v_leaf.id
    and f.source_fingerprint=v_fingerprint
    and f.status='active'
  limit 1;

  if not found then
    v_name:=trim(regexp_replace(
      regexp_replace(
        p_evidence_statement,
        '^A correct response (shows|demonstrates|is evidence that)( that)?( the learner)?( can)?[[:space:]]+',
        '',
        'i'
      ),
      '[.]$',
      '',
      'g'
    ));
    if length(v_name)<3 then
      select name into v_name
      from public.academic_skill_registry_nodes
      where id=v_leaf.id;
    end if;
    v_name:=upper(substr(v_name,1,1))||substr(v_name,2);
    v_code:=v_leaf.code||'.focus.'||
      left(trim(both '-' from regexp_replace(lower(v_name),'[^a-z0-9]+','-','g')),64)||
      '-'||substr(v_fingerprint,1,10);

    insert into public.academic_skill_evidence_focuses(
      registry_version_id,atomic_subskill_node_id,code,name,description,
      applicable_phases,source_method,source_fingerprint,status
    ) values(
      v_leaf.registry_version_id,v_leaf.id,v_code,v_name,trim(p_evidence_statement),
      v_leaf.applicable_phases,'human_governed',v_fingerprint,'active'
    )
    on conflict (atomic_subskill_node_id,source_fingerprint) do update
      set status='active',updated_at=now()
    returning code,name into v_code,v_name;
  end if;

  return query select v_code,v_name;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.validate_verified_question_diagnostic_taxonomy()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_source record;
  v_superseded public.verified_question_diagnostic_taxonomy%rowtype;
  v_expected_hash text;
  v_focus record;
begin
  select q.verified_external_id, q.topic, q.curriculum_strand,
    q.verified_content_hash, q.pool_scope, q.owner_school_id,
    i.id as assessment_item_id, s.code as scope_code, o.code as objective_code
  into v_source
  from public.questions q
  join public.curriculum_assessment_items i
    on i.id = new.assessment_item_id
   and i.source_type = 'question_bank'
   and i.source_record_id = q.id::text
   and i.source_item_key = 'question'
   and i.is_active
   and i.content_hash = q.verified_content_hash
   and (
     (q.pool_scope = 'global' and i.school_id is null)
     or (q.pool_scope = 'school' and i.school_id = q.owner_school_id)
   )
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
  join public.curriculum_scopes s on s.id = m.curriculum_scope_id
  join public.curriculum_objectives o
    on o.id = m.curriculum_objective_id and o.is_assessable
  where q.id = new.question_id
    and q.verification_status = 'verified'
    and q.analytics_eligible
    and q.is_active
    and q.current_content_hash = q.verified_content_hash
    and (
      (q.pool_scope = 'global'
        and q.content_origin = 'brain_heist'
        and q.owner_school_id is null
        and q.is_public)
      or (q.pool_scope = 'school'
        and q.content_origin = 'teacher'
        and q.owner_school_id is not null
        and not q.is_public)
    );

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
      'evidenceFocusCode', new.evidence_focus_code,
      'evidenceFocusName', new.evidence_focus_name,
      'secondarySkillCodes', to_jsonb(new.secondary_skill_codes),
      'reviewStatus', new.review_status,
      'humanReviewRequired', new.human_review_required,
      'confidenceScore', new.confidence_score
    )::text,
    'sha256'
  ), 'hex');

  if new.review_status = 'approved' and not new.human_review_required then
    if nullif(trim(new.evidence_focus_code), '') is null
       or nullif(trim(new.evidence_focus_name), '') is null then
      raise exception using errcode='23514',
        message='verified_question_evidence_focus_required';
    end if;

    select f.code,f.name into v_focus
    from public.academic_skill_registry_nodes leaf
    join public.academic_skill_evidence_focuses f
      on f.atomic_subskill_node_id=leaf.id
     and f.registry_version_id=leaf.registry_version_id
     and f.code=new.evidence_focus_code
     and f.status='active'
    where leaf.code=new.atomic_subskill_code
      and leaf.node_type='subskill'
      and leaf.status='active'
    limit 1;

    if not found then
      raise exception using errcode='23514',
        message='verified_question_evidence_focus_registry_match_required';
    end if;
    if lower(trim(new.evidence_focus_name)) <> lower(trim(v_focus.name)) then
      raise exception using errcode='23514',
        message='verified_question_evidence_focus_name_code_mismatch';
    end if;
  end if;

  if nullif(new.taxonomy_hash, '') is not null
     and new.taxonomy_hash <> v_expected_hash then
    raise exception using errcode = '23514',
      message = 'diagnostic_taxonomy_hash_mismatch';
  end if;
  new.taxonomy_hash := v_expected_hash;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.rpc_teacher_submit_manual_question_for_governance(p_question_id uuid, p_primary_skill_code text, p_atomic_subskill_code text, p_evidence_focus_code text)
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
  v_evidence_focus_name text;
  v_evidence_focus_description text;
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

  select r.evidence_focus_name,r.evidence_focus_description
  into v_evidence_focus_name,v_evidence_focus_description
  from private.resolve_canonical_evidence_focus(
    v_question.subject,v_grade,p_atomic_subskill_code,p_evidence_focus_code
  ) r
  limit 1;

  if not found then
    raise exception using errcode='23514',
      message='manual_question_evidence_focus_registry_match_required';
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
    'evidence_focus_code',trim(p_evidence_focus_code),
    'evidence_focus_name',v_evidence_focus_name,
    'evidence_focus_description',v_evidence_focus_description,
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
    'atomicSubskillName',v_atomic_subskill_name,
    'evidenceFocusCode',trim(p_evidence_focus_code),
    'evidenceFocusName',v_evidence_focus_name
  );
end;
$function$
;
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
  v_evidence_focus_code text;
  v_evidence_focus_name text;
  v_evidence_focus_description text;
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
  v_evidence_focus_code := coalesce(
    nullif(trim(v_payload ->> 'evidenceFocusCode'), ''),
    nullif(trim(v_submission.taxonomy_proposal ->> 'evidence_focus_code'), '')
  );
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

    select r.evidence_focus_name,r.evidence_focus_description
    into v_evidence_focus_name,v_evidence_focus_description
    from private.resolve_canonical_evidence_focus(
      coalesce(nullif(v_authority.academic_subject_name,''),v_question.subject),
      v_authority.grade_level::integer,
      v_atomic_subskill_code,
      v_evidence_focus_code
    ) r
    limit 1;

    if not found then
      select r.evidence_focus_name,r.evidence_focus_description
      into v_evidence_focus_name,v_evidence_focus_description
      from private.resolve_canonical_evidence_focus(
        v_question.subject,
        v_authority.grade_level::integer,
        v_atomic_subskill_code,
        v_evidence_focus_code
      ) r
      limit 1;
    end if;

    if not found then
      raise exception using errcode='23514',
        message='school_question_evidence_focus_registry_match_required';
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
    reviewed_by_authority, taxonomy_hash, evidence_focus_code, evidence_focus_name
  ) values (
    p_question_id, v_item_id, v_mapping_id, v_question.current_content_hash,
    v_authority.scope_code, v_authority.objective_code,
    'school-governance-2026.1',
    v_school_content_version,
    v_primary_skill_code, v_primary_skill_name,
    v_atomic_subskill_code, v_atomic_subskill_name,
    v_assessment_process, v_cognitive_process, v_evidence_statement,
    '{}'::text[], v_confidence, 'approved', false, v_rationale,
    'Brains Heist Platform Superadmin', '', v_evidence_focus_code, v_evidence_focus_name
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
        'evidenceFocusCode', v_evidence_focus_code,
        'evidenceFocusName', v_evidence_focus_name,
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
CREATE OR REPLACE FUNCTION private.materialize_verified_assignment_item_evidence(p_assignment_id uuid, p_student_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        'evidenceFocusCode', dt.evidence_focus_code,
        'evidenceFocusName', dt.evidence_focus_name,
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
$function$
;
CREATE OR REPLACE FUNCTION private.ingest_verified_assignment_diagnostic_evidence(p_assignment_id uuid, p_student_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      t.evidence_focus_code,
      min(t.evidence_focus_name) as evidence_focus_name,
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
    join lateral (
      select tx.*
      from public.verified_question_diagnostic_taxonomy tx
      where tx.review_status = 'approved'
        and not tx.human_review_required
        and (
          (
            e.diagnostic_taxonomy_id is not null
            and tx.id = e.diagnostic_taxonomy_id
          )
          or (
            e.diagnostic_taxonomy_id is null
            and tx.question_id = e.question_id
            and tx.question_content_hash = e.question_content_hash
            and tx.curriculum_mapping_id = e.curriculum_mapping_id
            and not exists (
              select 1
              from public.verified_question_diagnostic_taxonomy successor
              where successor.supersedes_taxonomy_id = tx.id
                and successor.review_status in ('approved', 'retired')
            )
          )
        )
      order by
        case when e.diagnostic_taxonomy_id is not null and tx.id = e.diagnostic_taxonomy_id then 0 else 1 end,
        tx.created_at desc,
        tx.id desc
      limit 1
    ) t on true
    join public.curriculum_item_objective_mappings m
      on m.id = e.curriculum_mapping_id
    join public.curriculum_objectives o
      on o.id = e.curriculum_objective_id
    where e.assignment_id = p_assignment_id
      and e.student_id = p_student_id
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
      t.evidence_focus_code,
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
      'diagnostic', md5(v_skill_key), md5(coalesce(v_group.evidence_focus_code, '')),
      v_group.curriculum_objective_id::text, v_group.assessment_process_code
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
        'evidence_granularity', 'diagnostic_evidence_focus',
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
        'evidence_focus_code', v_group.evidence_focus_code,
        'evidence_focus_name', v_group.evidence_focus_name,
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
$function$
;
CREATE OR REPLACE FUNCTION private.verified_questions_for_learning_focus(p_student_id uuid, p_subject text, p_skill_key text, p_topic text, p_skill text, p_subskill text, p_evidence_focus_code text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
            and (
              nullif(trim(coalesce(p_evidence_focus_code, '')), '') is null
              or taxonomy.evidence_focus_code = p_evidence_focus_code
            )
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
        ) then 3
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
        ) and (
          nullif(trim(coalesce(p_skill, '')), '') is null
          or lower(trim(coalesce(q.curriculum_skill, ''))) = lower(trim(p_skill))
          or lower(trim(coalesce(q.curriculum_subskill, ''))) = lower(trim(p_skill))
          or lower(trim(coalesce(q.curriculum_objective, ''))) = lower(trim(p_skill))
          or lower(trim(coalesce(q.topic_name, q.topic, ''))) = lower(trim(p_skill))
          or exists (
            select 1
            from public.verified_question_diagnostic_taxonomy taxonomy
            where taxonomy.question_id = q.id
              and taxonomy.question_content_hash = q.verified_content_hash
              and taxonomy.review_status = 'approved'
              and not taxonomy.human_review_required
              and (
                lower(trim(coalesce(taxonomy.primary_skill_name, ''))) = lower(trim(p_skill))
                or lower(trim(coalesce(taxonomy.atomic_subskill_name, ''))) = lower(trim(p_skill))
              )
              and not exists (
                select 1
                from public.verified_question_diagnostic_taxonomy successor
                where successor.supersedes_taxonomy_id = taxonomy.id
                  and successor.review_status = 'approved'
                  and not successor.human_review_required
              )
          )
        ) then 1
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
        ) then 2
        when p_skill_key not like 'diagnostic:%'
          and p_skill_key not like 'objective:%'
          and lower(trim(coalesce(q.subject, q.subject_id, ''))) = lower(trim(coalesce(p_subject, '')))
          and (
            lower(trim(coalesce(q.topic_name, q.topic, ''))) = lower(trim(coalesce(p_topic, p_skill, '')))
            or lower(trim(coalesce(q.topic_name, q.topic, ''))) = lower(trim(coalesce(p_skill, '')))
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
    from matched
    where match_tier = 1
    order by question_id
    limit 6
  )
  select jsonb_build_object(
    'available_question_count', (select count(*) from matched),
    'available_exact_question_count', (select count(*) from matched where match_tier = 1),
    'available_related_question_count', (select count(*) from matched where match_tier > 1),
    'available_same_subskill_question_count', (select count(*) from matched where match_tier = 2),
    'available_broader_skill_question_count', (select count(*) from matched where match_tier = 3),
    'evidence_focus_code', nullif(trim(coalesce(p_evidence_focus_code, '')), ''),
    'exact_question_ids', coalesce((
      select jsonb_agg(question_id order by question_id)
      from matched where match_tier = 1
    ), '[]'::jsonb),
    'related_question_ids', coalesce((
      select jsonb_agg(question_id order by question_id)
      from matched where match_tier > 1
    ), '[]'::jsonb),
    'same_subskill_question_ids', coalesce((
      select jsonb_agg(question_id order by question_id)
      from matched where match_tier = 2
    ), '[]'::jsonb),
    'broader_skill_question_ids', coalesce((
      select jsonb_agg(question_id order by question_id)
      from matched where match_tier = 3
    ), '[]'::jsonb),
    'recommended_question_ids', coalesce((
      select jsonb_agg(question_id order by question_id)
      from recommended
    ), '[]'::jsonb)
  );
$function$
;
CREATE OR REPLACE FUNCTION public.rpc_teacher_student_intervention_intelligence(p_student_id uuid, p_subject text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_caller uuid := auth.uid();
  v_school_id uuid;
  v_year_id uuid;
  v_context record;
  v_result jsonb;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;

  select u.school_id into v_school_id
  from public.users u
  where u.id = p_student_id;
  if v_school_id is null then
    raise exception 'Student is not attached to a school';
  end if;

  v_year_id := public.academic_resolve_operational_year_id(v_school_id, now());
  select * into v_context
  from private.student_current_academic_context(p_student_id, v_year_id);

  if p_subject is not null then
    if not public.student_learning_can_manage_intervention(p_student_id, p_subject) then
      raise exception 'Not authorised for this student and subject';
    end if;
  elsif not exists (
    select 1
    from public.school_members sm
    where sm.school_id = v_school_id
      and sm.user_id = v_caller
      and sm.status = 'active'
      and sm.role_in_school = 'school_admin'
  ) and not exists (
    select 1
    from private.teacher_current_teaching_roster(v_caller, v_school_id) r
    where r.student_id = p_student_id
  ) and not (
    not exists (
      select 1 from private.teacher_current_teaching_groups(v_caller, v_school_id)
    )
    and exists (
      select 1
      from public.class_students cs
      join public.class_teacher_assignments cta
        on cta.class_id = cs.class_id
       and cta.school_id = v_school_id
       and cta.teacher_user_id = v_caller
       and cta.active is true
      where cs.student_id = p_student_id
    )
  ) then
    raise exception 'Not authorised for this student';
  end if;

  with allowed_subjects as (
    select distinct lower(trim(r.school_subject_name)) as subject
    from private.teacher_current_teaching_roster(v_caller, v_school_id) r
    where r.student_id = p_student_id

    union

    select distinct lower(trim(r.academic_subject_name)) as subject
    from private.teacher_current_teaching_roster(v_caller, v_school_id) r
    where r.student_id = p_student_id
      and nullif(trim(r.academic_subject_name), '') is not null

    union

    select distinct lower(trim(cta.subject)) as subject
    from public.class_students cs
    join public.class_teacher_assignments cta
      on cta.class_id = cs.class_id
     and cta.school_id = v_school_id
     and cta.teacher_user_id = v_caller
     and cta.active is true
    where cs.student_id = p_student_id
      and not exists (
        select 1 from private.teacher_current_teaching_groups(v_caller, v_school_id)
      )
  ),
  current_focus_candidates as (
    select f.*
    from public.student_learning_focus_states f
    where f.school_id = v_school_id
      and f.student_id = p_student_id
      and f.academic_year_id = v_year_id
      and f.current_status in ('new_focus', 'recurring', 'persistent', 'improving')
      and (p_subject is null or lower(trim(f.subject)) = lower(trim(p_subject)))
      and (
        exists (
          select 1
          from public.school_members sm
          where sm.school_id = v_school_id
            and sm.user_id = v_caller
            and sm.status = 'active'
            and sm.role_in_school = 'school_admin'
        )
        or lower(trim(f.subject)) in (select subject from allowed_subjects)
      )
      and exists (
        select 1
        from public.student_learning_observations qualified
        where qualified.student_id = f.student_id
          and qualified.skill_key = f.skill_key
          and qualified.academic_year_id = v_year_id
          and qualified.observed_at >= coalesce(v_context.context_start_at, '-infinity'::timestamptz)
          and public.student_learning_observation_is_qualified(
            qualified.source_type,
            qualified.contributes_to_focus_state,
            qualified.evidence
          )
          and (
            qualified.grade_level_at_time is null
            or v_context.grade_level is null
            or nullif(regexp_replace(qualified.grade_level_at_time, '\D', '', 'g'), '')
               = nullif(regexp_replace(v_context.grade_level, '\D', '', 'g'), '')
          )
          and (
            qualified.class_code_at_time is null
            or v_context.class_code is null
            or upper(regexp_replace(qualified.class_code_at_time, '\s', '', 'g'))
               = upper(regexp_replace(v_context.class_code, '\s', '', 'g'))
          )
      )
  ),
  focus as (
    select
      f.*,
      greatest(0, current_date - f.last_observed_at::date)::integer as days_since_evidence,
      coalesce((question_set.payload->>'available_question_count')::integer, 0) as available_questions,
      coalesce((question_set.payload->>'available_exact_question_count')::integer, 0) as available_exact_questions,
      coalesce((question_set.payload->>'available_related_question_count')::integer, 0) as available_related_questions,
      coalesce((question_set.payload->>'available_same_subskill_question_count')::integer, 0) as available_same_subskill_questions,
      coalesce((question_set.payload->>'available_broader_skill_question_count')::integer, 0) as available_broader_skill_questions,
      focus_detail.evidence_focus_code,
      focus_detail.evidence_focus_name,
      coalesce(question_set.payload->'recommended_question_ids', '[]'::jsonb) as recommended_question_ids,
      coalesce(question_set.payload->'exact_question_ids', '[]'::jsonb) as exact_question_ids,
      coalesce(question_set.payload->'related_question_ids', '[]'::jsonb) as related_question_ids,
      coalesce(question_set.payload->'same_subskill_question_ids', '[]'::jsonb) as same_subskill_question_ids,
      coalesce(question_set.payload->'broader_skill_question_ids', '[]'::jsonb) as broader_skill_question_ids
    from current_focus_candidates f
    left join lateral (
      select
        nullif(trim(o.evidence->>'evidence_focus_code'),'') as evidence_focus_code,
        nullif(trim(o.evidence->>'evidence_focus_name'),'') as evidence_focus_name
      from public.student_learning_observations o
      where o.student_id=f.student_id
        and o.skill_key=f.skill_key
        and o.academic_year_id=v_year_id
        and o.observation_type='focus'
        and nullif(trim(o.evidence->>'evidence_focus_code'),'') is not null
        and o.observed_at >= coalesce(v_context.context_start_at,'-infinity'::timestamptz)
        and public.student_learning_observation_is_qualified(
          o.source_type,o.contributes_to_focus_state,o.evidence
        )
      order by o.observed_at desc,o.created_at desc,o.id desc
      limit 1
    ) focus_detail on true
    cross join lateral (
      select private.verified_questions_for_learning_focus(
        p_student_id, f.subject, f.skill_key, f.topic, f.skill, f.subskill,
        focus_detail.evidence_focus_code
      ) as payload
    ) question_set
  ),
  recommendations as (
    select
      f.*,
      case
        when f.days_since_evidence >= 60 then 'reassessment'
        when lower(f.subject) = 'english' and lower(coalesce(f.topic, '')) like 'writing%' then 'writing_practice'
        when f.skill_key like 'diagnostic:%' and f.available_exact_questions >= 1 then 'targeted_question_practice'
        when f.available_questions >= 5 then 'targeted_question_practice'
        else 'teacher_support'
      end as recommended_type,
      case
        when f.days_since_evidence >= 60 then format('%s was previously identified as %s, but the latest qualifying evidence is %s days old. Reassess before assuming the difficulty is still current.', coalesce(f.evidence_focus_name, f.subskill, coalesce(f.evidence_focus_name, f.subskill, f.skill)), replace(f.current_status, '_', ' '), f.days_since_evidence)
        when f.current_status = 'persistent' then format('%s remains a persistent focus area across %s qualifying evidence items. The latest evidence was recorded on %s.', coalesce(f.evidence_focus_name, f.subskill, coalesce(f.evidence_focus_name, f.subskill, f.skill)), f.evidence_items, to_char(f.last_observed_at, 'DD Mon YYYY'))
        when f.current_status = 'recurring' then format('%s has recurred across %s qualifying evidence items and should be reinforced before it becomes persistent.', coalesce(f.evidence_focus_name, f.subskill, coalesce(f.evidence_focus_name, f.subskill, f.skill)), f.evidence_items)
        when f.current_status = 'improving' then format('%s is improving. Reinforce the successful approach and continue monitoring before closing the focus area.', coalesce(f.evidence_focus_name, f.subskill, f.skill))
        else format('%s is a newly detected focus area. Use targeted practice and gather more evidence before labelling it persistent.', coalesce(f.evidence_focus_name, f.subskill, f.skill))
      end as rationale,
      case
        when f.days_since_evidence >= 60 then format('Collect fresh evidence for %s and confirm whether targeted support is still required.', coalesce(f.evidence_focus_name, f.subskill, f.skill))
        when f.current_status = 'persistent' then format('Move %s from persistent to improving through repeated successful evidence.', coalesce(f.evidence_focus_name, f.subskill, f.skill))
        when f.current_status = 'recurring' then format('Achieve consistent successful evidence in %s across the next assessed tasks.', coalesce(f.evidence_focus_name, f.subskill, f.skill))
        else format('Strengthen %s while monitoring the next assessed tasks.', coalesce(f.evidence_focus_name, f.subskill, f.skill))
      end as suggested_goal
    from focus f
  )
  select jsonb_build_object(
    'student', jsonb_build_object(
      'id', u.id,
      'name', coalesce(nullif(trim(u.full_name), ''), u.username),
      'grade', coalesce(v_context.grade_level, u.grade::text),
      'class_name', coalesce(v_context.class_code, u.batch),
      'school_id', u.school_id
    ),
    'question_authority', 'brains_heist_verified_only',
    'recommendations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'subject', r.subject, 'topic', r.topic, 'skill', r.skill, 'skill_key', r.skill_key,
        'status', r.current_status, 'trend', r.trend, 'priority', r.priority,
        'evidence_items', r.evidence_items, 'focus_occurrences', r.focus_occurrences,
        'last_observed_at', r.last_observed_at, 'days_since_evidence', r.days_since_evidence,
        'available_questions', r.available_questions,
        'available_exact_questions', r.available_exact_questions,
        'available_related_questions', r.available_related_questions,
        'available_same_subskill_questions', r.available_same_subskill_questions,
        'available_broader_skill_questions', r.available_broader_skill_questions,
        'evidence_focus_code', r.evidence_focus_code,
        'evidence_focus_name', r.evidence_focus_name,
        'recommended_question_ids', r.recommended_question_ids,
        'exact_question_ids', r.exact_question_ids,
        'related_question_ids', r.related_question_ids,
        'same_subskill_question_ids', r.same_subskill_question_ids,
        'broader_skill_question_ids', r.broader_skill_question_ids,
        'recommended_type', r.recommended_type,
        'rationale', r.rationale, 'suggested_goal', r.suggested_goal,
        'has_open_intervention', exists (
          select 1 from public.student_learning_interventions i
          where i.student_id = p_student_id and i.skill_key = r.skill_key
            and i.academic_year_id = v_year_id and i.status in ('planned', 'active')
            and public.student_learning_can_manage_intervention(i.student_id, i.subject)
        )
      ) order by case r.priority when 'high' then 1 when 'medium' then 2 else 3 end, r.days_since_evidence desc, r.skill)
      from recommendations r
    ), '[]'::jsonb),
    'interventions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'subject', i.subject, 'skill', i.skill, 'skill_key', i.skill_key,
        'topic', i.topic, 'intervention_type', i.intervention_type, 'status', i.status,
        'rationale', i.rationale, 'goal', i.goal, 'baseline_status', i.baseline_status,
        'baseline_evidence_items', i.baseline_evidence_items,
        'baseline_last_observed_at', i.baseline_last_observed_at,
        'target_date', i.target_date, 'created_at', i.created_at,
        'started_at', i.started_at, 'completed_at', i.completed_at,
        'outcome_status', i.outcome_status, 'outcome_note', i.outcome_note
      ) order by case i.status when 'active' then 1 when 'planned' then 2 else 3 end, i.created_at desc)
      from public.student_learning_interventions i
      where i.school_id = v_school_id and i.student_id = p_student_id
        and i.academic_year_id = v_year_id
        and (p_subject is null or lower(i.subject) = lower(p_subject))
        and public.student_learning_can_manage_intervention(i.student_id, i.subject)
    ), '[]'::jsonb),
    'academicYearId', v_year_id,
    'historicalInterventionsExcluded', true,
    'currentPlacementContextStartAt', v_context.context_start_at,
    'historicalPlacementSignalsExcluded', true
  ) into v_result
  from public.users u where u.id = p_student_id;

  return coalesce(v_result, '{}'::jsonb);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.rpc_superadmin_decide_question_taxonomy_review(p_review_item_id uuid, p_decision text, p_rationale text, p_replacement jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_evidence_focus_code text;
  v_evidence_focus_name text;
  v_grade integer;
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
    q.subject,
    q.grade_level,
    q.eligible_grade_levels,
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

    v_grade:=coalesce(
      (select max(g)::integer from unnest(coalesce(v_question.eligible_grade_levels,'{}'::smallint[])) g),
      nullif(regexp_replace(coalesce(v_question.grade_level,''),'\D','','g'),'')::integer
    );
    select f.evidence_focus_code,f.evidence_focus_name
    into v_evidence_focus_code,v_evidence_focus_name
    from private.resolve_or_create_evidence_focus_for_superadmin(
      v_question.subject,v_grade,v_item.atomic_subskill_code,v_item.evidence_statement,null
    ) f;

    insert into public.verified_question_diagnostic_taxonomy (
      question_id, assessment_item_id, curriculum_mapping_id,
      question_content_hash, scope_code, objective_code, package_version,
      taxonomy_version, primary_skill_code, primary_skill_name,
      atomic_subskill_code, atomic_subskill_name, assessment_process_code,
      cognitive_process, evidence_statement, secondary_skill_codes,
      confidence_score, review_status, human_review_required, review_reason,
      supersedes_taxonomy_id, reviewed_by_authority, reviewed_at, taxonomy_hash,
      evidence_focus_code, evidence_focus_name
    ) values (
      v_item.question_id, v_item.assessment_item_id, v_mapping.id,
      v_item.question_content_hash, v_mapping.scope_code, v_mapping.objective_code,
      v_item.package_version, v_item.taxonomy_version, v_item.primary_skill_code,
      v_item.primary_skill_name, v_item.atomic_subskill_code,
      v_item.atomic_subskill_name, v_item.assessment_process_code,
      v_item.cognitive_process, v_item.evidence_statement,
      v_item.secondary_skill_codes, greatest(v_item.confidence_score, 0.900),
      'approved', false,
      v_rationale, null, 'superadmin:' || v_actor::text, v_now, '',
      v_evidence_focus_code, v_evidence_focus_name
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
        'cognitiveProcess', 'evidenceStatement', 'evidenceFocusCode',
        'secondarySkillCodes', 'confidenceScore'
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
    v_evidence_focus_code := nullif(trim(p_replacement ->> 'evidenceFocusCode'), '');
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

    v_grade:=coalesce(
      (select max(g)::integer from unnest(coalesce(v_question.eligible_grade_levels,'{}'::smallint[])) g),
      nullif(regexp_replace(coalesce(v_question.grade_level,''),'\D','','g'),'')::integer
    );
    select f.evidence_focus_code,f.evidence_focus_name
    into v_evidence_focus_code,v_evidence_focus_name
    from private.resolve_or_create_evidence_focus_for_superadmin(
      v_question.subject,v_grade,v_atomic_subskill_code,v_evidence,v_evidence_focus_code
    ) f;

    if (
      v_active.id is null
      and row(v_mapping_id, v_primary_skill_code, v_primary_skill_name,
        v_atomic_subskill_code, v_atomic_subskill_name, v_ao, v_cognitive,
        v_evidence, v_secondary, v_evidence_focus_code)
        is not distinct from
        row(v_item.curriculum_mapping_id, v_item.primary_skill_code,
          v_item.primary_skill_name, v_item.atomic_subskill_code,
          v_item.atomic_subskill_name, v_item.assessment_process_code,
          v_item.cognitive_process, v_item.evidence_statement,
          v_item.secondary_skill_codes, null::text)
    ) or (
      v_active.id is not null
      and row(v_mapping_id, v_primary_skill_code, v_primary_skill_name,
        v_atomic_subskill_code, v_atomic_subskill_name, v_ao, v_cognitive,
        v_evidence, v_secondary, v_evidence_focus_code)
        is not distinct from
        row(v_active.curriculum_mapping_id, v_active.primary_skill_code,
          v_active.primary_skill_name, v_active.atomic_subskill_code,
          v_active.atomic_subskill_name, v_active.assessment_process_code,
          v_active.cognitive_process, v_active.evidence_statement,
          v_active.secondary_skill_codes, v_active.evidence_focus_code)
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
      supersedes_taxonomy_id, reviewed_by_authority, reviewed_at, taxonomy_hash,
      evidence_focus_code, evidence_focus_name
    ) values (
      v_item.question_id, v_item.assessment_item_id, v_mapping.id,
      v_item.question_content_hash, v_mapping.scope_code, v_mapping.objective_code,
      v_item.package_version, v_taxonomy_version, v_primary_skill_code,
      v_primary_skill_name, v_atomic_subskill_code, v_atomic_subskill_name,
      v_ao, v_cognitive, v_evidence, v_secondary, v_confidence, 'approved',
      false, v_rationale, v_active.id, 'superadmin:' || v_actor::text, v_now, '',
      v_evidence_focus_code, v_evidence_focus_name
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
      supersedes_taxonomy_id, reviewed_by_authority, reviewed_at, taxonomy_hash,
      evidence_focus_code, evidence_focus_name
    ) values (
      v_active.question_id, v_active.assessment_item_id,
      v_active.curriculum_mapping_id, v_active.question_content_hash,
      v_active.scope_code, v_active.objective_code, v_active.package_version,
      v_taxonomy_version, v_active.primary_skill_code, v_active.primary_skill_name,
      v_active.atomic_subskill_code, v_active.atomic_subskill_name,
      v_active.assessment_process_code, v_active.cognitive_process,
      v_active.evidence_statement, v_active.secondary_skill_codes,
      v_active.confidence_score, 'retired', false, v_rationale, v_active.id,
      'superadmin:' || v_actor::text, v_now, '',
      v_active.evidence_focus_code, v_active.evidence_focus_name
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
$function$
;

revoke all on function private.resolve_canonical_evidence_focus(text,integer,text,text)
from public,anon,authenticated,service_role;
revoke all on function private.resolve_or_create_evidence_focus_for_superadmin(text,integer,text,text,text)
from public,anon,authenticated,service_role;
revoke all on function private.verified_questions_for_learning_focus(uuid,text,text,text,text,text,text)
from public,anon,authenticated,service_role;

revoke all on function public.rpc_academic_evidence_focuses_for_subskill(text,integer,text)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_academic_evidence_focuses_for_subskill(text,integer,text)
to authenticated,service_role;

revoke all on function public.rpc_teacher_submit_manual_question_for_governance(uuid,text,text,text)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_submit_manual_question_for_governance(uuid,text,text,text)
to authenticated,service_role;

revoke all on function public.rpc_superadmin_govern_school_question(uuid,text,jsonb)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_superadmin_govern_school_question(uuid,text,jsonb)
to authenticated,service_role;

do $audit$
declare
  v_missing integer;
  v_subskills_without_focus integer;
begin
  select count(*) into v_missing
  from private.active_verified_question_diagnostic_taxonomy
  where evidence_focus_code is null or evidence_focus_name is null;
  if v_missing<>0 then
    raise exception 'evidence_focus_backfill_incomplete: % active verified taxonomy rows missing focus',v_missing;
  end if;

  select count(*) into v_subskills_without_focus
  from public.academic_skill_registry_nodes leaf
  join public.academic_skill_registry_versions v
    on v.id=leaf.registry_version_id and v.status='published'
  where leaf.node_type='subskill' and leaf.status='active'
    and not exists(
      select 1 from public.academic_skill_evidence_focuses f
      where f.atomic_subskill_node_id=leaf.id and f.status='active'
    );
  if v_subskills_without_focus<>0 then
    raise exception 'evidence_focus_catalog_incomplete: % active subskills missing focus',v_subskills_without_focus;
  end if;
end;
$audit$;
