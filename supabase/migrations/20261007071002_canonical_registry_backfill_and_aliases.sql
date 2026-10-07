-- Converge existing verified question diagnostics onto the registry-native taxonomy.
-- This migration is intentionally code-driven: it resolves stable registry codes, never display labels,
-- and fails if every current verified analytics question cannot be mapped unambiguously.

create or replace function private.academic_registry_subject_matches(
  p_registry_version_id uuid,
  p_subject text
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.academic_skill_registry_versions rv
    where rv.id=p_registry_version_id
      and rv.status='published'
      and (
        rv.subject_key=public.academic_normalize_subject_key(p_subject)
        or exists (
          select 1
          from public.academic_skill_registry_subject_aliases a
          where a.registry_version_id=rv.id
            and a.status='active'
            and a.alias_normalized in (
              lower(trim(coalesce(p_subject,''))),
              public.academic_normalize_subject_key(p_subject)
            )
        )
      )
  );
$function$;

revoke all on function private.academic_registry_subject_matches(uuid,text)
from public,anon,authenticated,service_role;

-- Patch registry readers that previously required q.subject to equal the registry's subject_key.
-- Shared-registry aliases (Biology -> Science, Maths -> Mathematics, ICT -> Digital Technology,
-- supported Modern Languages, etc.) must resolve through the governed alias table.
do $patch_registry_subject_matching$
declare
  r record;
  v_def text;
  v_new text;
begin
  for r in
    select p.oid,n.nspname,p.proname
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where p.prokind='f'
      and n.nspname in ('public','private')
      and not (n.nspname='private' and p.proname='academic_registry_subject_matches')
      and pg_get_functiondef(p.oid) ilike '%rv.subject_key=public.academic_normalize_subject_key%'
  loop
    v_def:=pg_get_functiondef(r.oid);
    v_new:=v_def;
    v_new:=replace(v_new,
      'rv.subject_key=public.academic_normalize_subject_key(q.subject)',
      'private.academic_registry_subject_matches(rv.id,q.subject)');
    v_new:=replace(v_new,
      'rv.subject_key=public.academic_normalize_subject_key(p_question.subject)',
      'private.academic_registry_subject_matches(rv.id,p_question.subject)');
    v_new:=replace(v_new,
      'rv.subject_key=public.academic_normalize_subject_key(p_subject)',
      'private.academic_registry_subject_matches(rv.id,p_subject)');
    v_new:=replace(v_new,
      'rv.subject_key=public.academic_normalize_subject_key(scope.canonical_subject_name)',
      'private.academic_registry_subject_matches(rv.id,scope.canonical_subject_name)');
    if v_new=v_def then
      raise exception 'registry_subject_match_patch_not_applied:%I.%I',r.nspname,r.proname;
    end if;
    execute v_new;
  end loop;
end;
$patch_registry_subject_matching$;

-- The registry-native package importer must accept a governed subject alias rather than only
-- a registry's root subject key.
do $patch_registry_importer$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='rpc_import_registry_verified_mcq_package'
    and p.prokind='f'
  limit 1;

  if v_oid is null then
    raise exception 'rpc_import_registry_verified_mcq_package_not_found';
  end if;

  v_def:=pg_get_functiondef(v_oid);
  v_new:=replace(
    v_def,
    'if public.academic_normalize_subject_key(v_subject.name)<>v_registry.subject_key then',
    'if not private.academic_registry_subject_matches(v_registry.id,v_subject.name) then'
  );
  v_new:=replace(
    v_new,
    'and a.alias_normalized=public.academic_normalize_subject_key(v_subject.name)',
    'and a.alias_normalized in (lower(trim(v_subject.name)),public.academic_normalize_subject_key(v_subject.name))'
  );

  if v_new=v_def then
    raise exception 'registry_importer_subject_alias_patch_not_applied';
  end if;
  execute v_new;
end;
$patch_registry_importer$;

-- The registry-taxonomy validator must use the same alias-aware subject contract.
do $patch_registry_validator$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private'
    and p.proname='validate_verified_question_registry_taxonomy'
    and p.prokind='f'
  limit 1;

  if v_oid is null then
    raise exception 'validate_verified_question_registry_taxonomy_not_found';
  end if;

  v_def:=pg_get_functiondef(v_oid);
  v_new:=replace(
    v_def,
    'if public.academic_normalize_subject_key(v_question.subject) <> v_registry.subject_key then',
    'if not private.academic_registry_subject_matches(v_registry.id,v_question.subject) then'
  );

  if v_new=v_def then
    raise exception 'registry_validator_subject_alias_patch_not_applied';
  end if;
  execute v_new;
end;
$patch_registry_validator$;

-- Subject aliases can narrow a shared registry to specific strands. Preserve that boundary
-- in the registry-native table itself.
create or replace function private.validate_verified_question_registry_alias_strand()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_subject text;
  v_alias public.academic_skill_registry_subject_aliases%rowtype;
  v_skill public.academic_skill_registry_nodes%rowtype;
  v_strand public.academic_skill_registry_nodes%rowtype;
begin
  select q.subject into v_subject
  from public.questions q
  where q.id=new.question_id;

  if not found then
    raise exception using errcode='23514',message='registry_taxonomy_question_not_found';
  end if;

  select a.* into v_alias
  from public.academic_skill_registry_subject_aliases a
  where a.registry_version_id=new.registry_version_id
    and a.status='active'
    and a.alias_normalized in (
      lower(trim(coalesce(v_subject,''))),
      public.academic_normalize_subject_key(v_subject)
    )
  order by (a.alias_normalized=lower(trim(coalesce(v_subject,'')))) desc
  limit 1;

  if not found then
    if not private.academic_registry_subject_matches(new.registry_version_id,v_subject) then
      raise exception using errcode='23514',message='registry_taxonomy_subject_alias_mismatch';
    end if;
    return new;
  end if;

  if v_alias.allowed_strand_codes is null then
    return new;
  end if;

  select skill.* into v_skill
  from public.academic_skill_registry_nodes skill
  where skill.id=new.primary_skill_node_id
    and skill.registry_version_id=new.registry_version_id
    and skill.node_type='skill'
    and skill.status='active';

  if not found then
    raise exception using errcode='23514',message='registry_taxonomy_primary_skill_invalid_for_alias';
  end if;

  select strand.* into v_strand
  from public.academic_skill_registry_nodes strand
  where strand.id=v_skill.parent_id
    and strand.registry_version_id=new.registry_version_id
    and strand.node_type='strand'
    and strand.status='active';

  if not found or not (v_strand.code=any(v_alias.allowed_strand_codes)) then
    raise exception using errcode='23514',message='registry_taxonomy_strand_not_allowed_for_subject_alias';
  end if;

  return new;
end;
$function$;

revoke all on function private.validate_verified_question_registry_alias_strand()
from public,anon,authenticated,service_role;

drop trigger if exists trg_validate_verified_question_registry_alias_strand
on public.verified_question_registry_taxonomy;
create trigger trg_validate_verified_question_registry_alias_strand
before insert or update on public.verified_question_registry_taxonomy
for each row execute function private.validate_verified_question_registry_alias_strand();

-- Every active legacy row has already passed governed canonical code/name and Evidence Focus checks.
-- Collapse historical duplicate active rows only when their semantic mapping is identical, then resolve
-- those stable codes into the registry-native foreign keys. If any row cannot resolve, inserted count
-- differs from expected and the migration aborts.
do $backfill_registry_native$
declare
  v_expected integer;
  v_inserted integer;
begin
  with canonical as (
    select distinct on (t.question_id)
      t.*,q.subject
    from private.active_verified_question_diagnostic_taxonomy t
    join public.questions q on q.id=t.question_id
    where q.verification_status='verified'
      and q.analytics_eligible
      and q.is_active
      and q.current_content_hash=q.verified_content_hash
      and t.question_content_hash=q.current_content_hash
    order by t.question_id,t.reviewed_at desc nulls last,t.created_at desc,t.id desc
  )
  select count(*) into v_expected
  from canonical c
  where not exists (
    select 1
    from public.verified_question_registry_taxonomy tx
    where tx.question_id=c.question_id
      and tx.question_content_hash=c.question_content_hash
      and tx.review_status='approved'
      and not tx.human_review_required
  );

  with canonical as (
    select distinct on (t.question_id)
      t.*,q.subject
    from private.active_verified_question_diagnostic_taxonomy t
    join public.questions q on q.id=t.question_id
    where q.verification_status='verified'
      and q.analytics_eligible
      and q.is_active
      and q.current_content_hash=q.verified_content_hash
      and t.question_content_hash=q.current_content_hash
    order by t.question_id,t.reviewed_at desc nulls last,t.created_at desc,t.id desc
  ), resolved as (
    select
      c.*,
      rv.id registry_version_id,
      rv.code registry_code,
      skill.id primary_skill_node_id,
      subskill.id atomic_subskill_node_id,
      focus.id evidence_focus_id,
      strand.code strand_code,
      alias.allowed_strand_codes
    from canonical c
    join lateral (
      select a.*
      from public.academic_skill_registry_subject_aliases a
      where a.status='active'
        and a.alias_normalized in (
          lower(trim(c.subject)),
          public.academic_normalize_subject_key(c.subject)
        )
      order by (a.alias_normalized=lower(trim(c.subject))) desc
      limit 1
    ) alias on true
    join public.academic_skill_registry_versions rv
      on rv.id=alias.registry_version_id and rv.status='published'
    join public.academic_skill_registry_nodes skill
      on skill.registry_version_id=rv.id
      and skill.code=c.primary_skill_code
      and skill.node_type='skill' and skill.status='active'
    join public.academic_skill_registry_nodes strand
      on strand.id=skill.parent_id
      and strand.registry_version_id=rv.id
      and strand.node_type='strand' and strand.status='active'
    join public.academic_skill_registry_nodes subskill
      on subskill.registry_version_id=rv.id
      and subskill.parent_id=skill.id
      and subskill.code=c.atomic_subskill_code
      and subskill.node_type='subskill' and subskill.status='active'
    join public.academic_skill_evidence_focuses focus
      on focus.registry_version_id=rv.id
      and focus.atomic_subskill_node_id=subskill.id
      and focus.code=c.evidence_focus_code
      and focus.status='active'
    where alias.allowed_strand_codes is null
       or strand.code=any(alias.allowed_strand_codes)
  )
  insert into public.verified_question_registry_taxonomy(
    question_id,question_content_hash,registry_version_id,
    primary_skill_node_id,atomic_subskill_node_id,evidence_focus_id,
    taxonomy_version,assessment_process_code,cognitive_process,evidence_statement,
    confidence_score,review_status,human_review_required,source_method,
    reviewed_by_authority,reviewed_at,taxonomy_hash
  )
  select
    r.question_id,r.question_content_hash,r.registry_version_id,
    r.primary_skill_node_id,r.atomic_subskill_node_id,r.evidence_focus_id,
    r.registry_code||'-registry-native-backfill-v1',
    case r.assessment_process_code
      when 'AO1' then 'BH-AO1' when 'AO2' then 'BH-AO2'
      when 'AO3' then 'BH-AO3' when 'AO4' then 'BH-AO4'
      else r.assessment_process_code
    end,
    r.cognitive_process,r.evidence_statement,r.confidence_score,
    'approved',false,'governed_legacy_taxonomy_backfill',
    coalesce(nullif(trim(r.reviewed_by_authority),''),'Brains Heist Academic Governance'),
    coalesce(r.reviewed_at,r.created_at,now()),''
  from resolved r
  where not exists (
    select 1
    from public.verified_question_registry_taxonomy tx
    where tx.question_id=r.question_id
      and tx.question_content_hash=r.question_content_hash
      and tx.review_status='approved'
      and not tx.human_review_required
  );

  get diagnostics v_inserted=row_count;
  if v_inserted<>v_expected then
    raise exception 'registry_native_backfill_incomplete: expected %, inserted %',v_expected,v_inserted;
  end if;
end;
$backfill_registry_native$;

do $assert_backfill$
declare
  v_missing integer;
begin
  select count(*) into v_missing
  from public.questions q
  where q.is_active
    and q.verification_status='verified'
    and q.analytics_eligible
    and q.current_content_hash=q.verified_content_hash
    and not private.verified_question_has_registry_mapping(q.id);

  if v_missing<>0 then
    raise exception 'registry_backfill_missing:%',v_missing;
  end if;
end;
$assert_backfill$;
