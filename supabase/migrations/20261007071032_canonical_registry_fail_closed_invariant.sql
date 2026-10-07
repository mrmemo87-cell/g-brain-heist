-- Keep registry-native taxonomy synchronized with legacy governance writers and
-- make the verified+analytics state fail closed when a current registry mapping is absent.

create or replace function private.mirror_verified_diagnostic_taxonomy_to_registry()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_question public.questions%rowtype;
  v_registry_id uuid;
  v_registry_code text;
  v_allowed_strands text[];
  v_skill_id uuid;
  v_subskill_id uuid;
  v_focus_id uuid;
  v_strand_code text;
  v_process text;
begin
  select q.* into v_question
  from public.questions q
  where q.id=new.question_id;

  if not found
     or not v_question.is_active
     or v_question.verification_status<>'verified'
     or not v_question.analytics_eligible
     or v_question.current_content_hash<>v_question.verified_content_hash
     or new.question_content_hash<>v_question.current_content_hash then
    return new;
  end if;

  select alias.registry_version_id,rv.code,alias.allowed_strand_codes
  into v_registry_id,v_registry_code,v_allowed_strands
  from public.academic_skill_registry_subject_aliases alias
  join public.academic_skill_registry_versions rv
    on rv.id=alias.registry_version_id and rv.status='published'
  where alias.status='active'
    and alias.alias_normalized in (
      lower(trim(v_question.subject)),
      public.academic_normalize_subject_key(v_question.subject)
    )
  order by (alias.alias_normalized=lower(trim(v_question.subject))) desc
  limit 1;

  if v_registry_id is null then
    raise exception using errcode='23514',message='diagnostic_registry_subject_alias_not_found';
  end if;

  select skill.id,subskill.id,focus.id,strand.code
  into v_skill_id,v_subskill_id,v_focus_id,v_strand_code
  from public.academic_skill_registry_nodes skill
  join public.academic_skill_registry_nodes strand
    on strand.id=skill.parent_id
    and strand.registry_version_id=v_registry_id
    and strand.node_type='strand' and strand.status='active'
  join public.academic_skill_registry_nodes subskill
    on subskill.registry_version_id=v_registry_id
    and subskill.parent_id=skill.id
    and subskill.node_type='subskill' and subskill.status='active'
    and subskill.code=new.atomic_subskill_code
  join public.academic_skill_evidence_focuses focus
    on focus.registry_version_id=v_registry_id
    and focus.atomic_subskill_node_id=subskill.id
    and focus.status='active'
    and focus.code=new.evidence_focus_code
  where skill.registry_version_id=v_registry_id
    and skill.node_type='skill' and skill.status='active'
    and skill.code=new.primary_skill_code;

  if v_skill_id is null or v_subskill_id is null or v_focus_id is null then
    raise exception using errcode='23514',message='diagnostic_registry_codes_do_not_resolve';
  end if;

  if v_allowed_strands is not null and not (v_strand_code=any(v_allowed_strands)) then
    raise exception using errcode='23514',message='diagnostic_registry_strand_not_allowed_for_subject_alias';
  end if;

  v_process:=case new.assessment_process_code
    when 'AO1' then 'BH-AO1' when 'AO2' then 'BH-AO2'
    when 'AO3' then 'BH-AO3' when 'AO4' then 'BH-AO4'
    when 'BH-AO1' then 'BH-AO1' when 'BH-AO2' then 'BH-AO2'
    when 'BH-AO3' then 'BH-AO3' when 'BH-AO4' then 'BH-AO4'
    else null
  end;

  if v_process is null then
    raise exception using errcode='23514',message='diagnostic_registry_assessment_process_invalid';
  end if;

  if new.review_status='retired' or new.human_review_required then
    update public.verified_question_registry_taxonomy tx
    set review_status='retired',
        reviewed_at=now(),
        reviewed_by_authority=coalesce(
          nullif(trim(new.reviewed_by_authority),''),
          'Brains Heist Academic Governance'
        )
    where tx.question_id=new.question_id
      and tx.question_content_hash=new.question_content_hash
      and tx.registry_version_id=v_registry_id
      and tx.primary_skill_node_id=v_skill_id
      and tx.atomic_subskill_node_id=v_subskill_id
      and tx.evidence_focus_id=v_focus_id
      and tx.assessment_process_code=v_process
      and tx.review_status='approved'
      and tx.source_method in ('governed_legacy_taxonomy_backfill','diagnostic_taxonomy_bridge');
    return new;
  end if;

  if new.review_status<>'approved' then
    return new;
  end if;

  if new.supersedes_taxonomy_id is not null then
    update public.verified_question_registry_taxonomy tx
    set review_status='retired',
        reviewed_at=now(),
        reviewed_by_authority=coalesce(
          nullif(trim(new.reviewed_by_authority),''),
          'Brains Heist Academic Governance'
        )
    where tx.question_id=new.question_id
      and tx.question_content_hash=new.question_content_hash
      and tx.review_status='approved'
      and tx.source_method in ('governed_legacy_taxonomy_backfill','diagnostic_taxonomy_bridge');
  end if;

  insert into public.verified_question_registry_taxonomy(
    question_id,question_content_hash,registry_version_id,
    primary_skill_node_id,atomic_subskill_node_id,evidence_focus_id,
    taxonomy_version,assessment_process_code,cognitive_process,evidence_statement,
    confidence_score,review_status,human_review_required,source_method,
    reviewed_by_authority,reviewed_at,taxonomy_hash
  ) values (
    new.question_id,new.question_content_hash,v_registry_id,
    v_skill_id,v_subskill_id,v_focus_id,
    v_registry_code||'-registry-native-bridge-v1',
    v_process,new.cognitive_process,new.evidence_statement,
    new.confidence_score,'approved',false,'diagnostic_taxonomy_bridge',
    coalesce(
      nullif(trim(new.reviewed_by_authority),''),
      'Brains Heist Academic Governance'
    ),
    coalesce(new.reviewed_at,new.created_at,now()),''
  )
  on conflict (
    question_id,question_content_hash,registry_version_id,
    atomic_subskill_node_id,evidence_focus_id,assessment_process_code
  )
  where review_status='approved'
  do nothing;

  return new;
end;
$function$;

revoke all on function private.mirror_verified_diagnostic_taxonomy_to_registry()
from public,anon,authenticated,service_role;

drop trigger if exists trg_mirror_verified_diagnostic_taxonomy_to_registry
on public.verified_question_diagnostic_taxonomy;
create trigger trg_mirror_verified_diagnostic_taxonomy_to_registry
after insert or update of
  review_status,human_review_required,supersedes_taxonomy_id,
  primary_skill_code,atomic_subskill_code,evidence_focus_code,assessment_process_code,
  cognitive_process,evidence_statement,confidence_score
on public.verified_question_diagnostic_taxonomy
for each row execute function private.mirror_verified_diagnostic_taxonomy_to_registry();

-- This deferred constraint allows a governance transaction to update a question and then
-- write its registry taxonomy before commit, but never allows the verified analytics state
-- to persist without a valid current-hash registry mapping.
create or replace function private.enforce_verified_question_registry_invariant()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.is_active
     and new.verification_status='verified'
     and new.analytics_eligible
     and new.current_content_hash=new.verified_content_hash then
    if not exists (
      select 1
      from public.academic_skill_registry_subject_aliases alias
      join public.academic_skill_registry_versions rv
        on rv.id=alias.registry_version_id and rv.status='published'
      where alias.status='active'
        and alias.alias_normalized in (
          lower(trim(new.subject)),
          public.academic_normalize_subject_key(new.subject)
        )
    ) then
      raise exception using errcode='23514',
        message='verified_question_requires_published_registry_subject_alias';
    end if;

    if not private.verified_question_has_registry_mapping(new.id) then
      raise exception using errcode='23514',
        message='verified_question_requires_current_registry_mapping';
    end if;
  end if;

  return null;
end;
$function$;

revoke all on function private.enforce_verified_question_registry_invariant()
from public,anon,authenticated,service_role;

drop trigger if exists trg_verified_question_registry_invariant
on public.questions;
create constraint trigger trg_verified_question_registry_invariant
after insert or update on public.questions
deferrable initially deferred
for each row execute function private.enforce_verified_question_registry_invariant();

-- Release gate: the migration must leave no active verified analytics question outside
-- the governed subject aliases or registry-native mapping, and no active registry row may
-- violate its registry relationships.
do $assert_registry_coverage$
declare
  v_missing_alias integer;
  v_missing_mapping integer;
  v_invalid_mapping integer;
begin
  select count(*) into v_missing_alias
  from public.questions q
  where q.is_active
    and q.verification_status='verified'
    and q.analytics_eligible
    and q.current_content_hash=q.verified_content_hash
    and not exists (
      select 1
      from public.academic_skill_registry_subject_aliases alias
      join public.academic_skill_registry_versions rv
        on rv.id=alias.registry_version_id and rv.status='published'
      where alias.status='active'
        and alias.alias_normalized in (
          lower(trim(q.subject)),
          public.academic_normalize_subject_key(q.subject)
        )
    );

  select count(*) into v_missing_mapping
  from public.questions q
  where q.is_active
    and q.verification_status='verified'
    and q.analytics_eligible
    and q.current_content_hash=q.verified_content_hash
    and not private.verified_question_has_registry_mapping(q.id);

  select count(*) into v_invalid_mapping
  from public.verified_question_registry_taxonomy tx
  join public.questions q on q.id=tx.question_id
  join public.academic_skill_registry_versions rv on rv.id=tx.registry_version_id
  join public.academic_skill_registry_nodes skill on skill.id=tx.primary_skill_node_id
  join public.academic_skill_registry_nodes subskill on subskill.id=tx.atomic_subskill_node_id
  join public.academic_skill_evidence_focuses focus on focus.id=tx.evidence_focus_id
  where tx.review_status='approved'
    and not tx.human_review_required
    and q.is_active
    and q.verification_status='verified'
    and q.analytics_eligible
    and tx.question_content_hash=q.current_content_hash
    and (
      rv.status<>'published'
      or not private.academic_registry_subject_matches(rv.id,q.subject)
      or skill.registry_version_id<>rv.id
      or skill.node_type<>'skill'
      or skill.status<>'active'
      or subskill.registry_version_id<>rv.id
      or subskill.parent_id<>skill.id
      or subskill.node_type<>'subskill'
      or subskill.status<>'active'
      or focus.registry_version_id<>rv.id
      or focus.atomic_subskill_node_id<>subskill.id
      or focus.status<>'active'
    );

  if v_missing_alias<>0 or v_missing_mapping<>0 or v_invalid_mapping<>0 then
    raise exception
      'registry_coverage_assertion_failed: missing_alias %, missing_mapping %, invalid_mapping %',
      v_missing_alias,v_missing_mapping,v_invalid_mapping;
  end if;
end;
$assert_registry_coverage$;
