-- Generic registry-native verified evidence lane.
-- Existing curriculum-framework evidence remains untouched; this lane runs alongside it.
-- Canonical academic identity comes from the published Brains Heist Academic Skill Registry.

-- ---------------------------------------------------------------------------
-- 1. Economics becomes a first-class academic subject in the academic context
-- ---------------------------------------------------------------------------
insert into public.academic_subjects(code,name,is_active)
values ('economics','Economics',true)
on conflict(code) do update set
  name=excluded.name,
  is_active=true,
  updated_at=now();

with economics as (
  select id from public.academic_subjects where code='economics' and is_active
)
update public.school_subjects ss
set academic_subject_id=economics.id,
    updated_at=now()
from economics
where public.academic_normalize_subject_key(ss.name)='economics'
  and ss.academic_subject_id is distinct from economics.id;

with economics as (
  select id from public.academic_subjects where code='economics' and is_active
)
update public.assignments a
set academic_subject_id=economics.id,
    updated_at=now()
from economics
where a.academic_subject_id is null
  and public.academic_normalize_subject_key(
    coalesce(nullif(a.subject_name,''),nullif(a.subject,''),nullif(a.subject_id,''))
  )='economics';

-- ---------------------------------------------------------------------------
-- 2. Governed registry taxonomy attached to immutable verified question hashes
-- ---------------------------------------------------------------------------
create table if not exists public.verified_question_registry_taxonomy (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete restrict,
  question_content_hash text not null,
  registry_version_id uuid not null references public.academic_skill_registry_versions(id) on delete restrict,
  primary_skill_node_id uuid not null references public.academic_skill_registry_nodes(id) on delete restrict,
  atomic_subskill_node_id uuid not null references public.academic_skill_registry_nodes(id) on delete restrict,
  evidence_focus_id uuid not null references public.academic_skill_evidence_focuses(id) on delete restrict,
  taxonomy_version text not null,
  assessment_process_code text not null,
  cognitive_process text not null,
  evidence_statement text not null,
  confidence_score numeric not null default 1,
  review_status text not null default 'approved',
  human_review_required boolean not null default false,
  source_method text not null default 'platform_governance',
  reviewed_by_authority text not null default 'Brains Heist Academic Governance',
  reviewed_at timestamptz not null default now(),
  taxonomy_hash text not null,
  created_at timestamptz not null default now(),
  constraint verified_question_registry_taxonomy_version_check
    check (length(trim(taxonomy_version)) between 3 and 100),
  constraint verified_question_registry_taxonomy_process_check
    check (assessment_process_code in ('BH-AO1','BH-AO2','BH-AO3','BH-AO4')),
  constraint verified_question_registry_taxonomy_cognitive_check
    check (cognitive_process in ('remember','understand','apply','analyze','evaluate')),
  constraint verified_question_registry_taxonomy_confidence_check
    check (confidence_score between 0 and 1),
  constraint verified_question_registry_taxonomy_review_check
    check (review_status in ('approved','retired')),
  constraint verified_question_registry_taxonomy_statement_check
    check (length(trim(evidence_statement)) between 12 and 2000)
);

create unique index if not exists uq_verified_question_registry_taxonomy_hash
  on public.verified_question_registry_taxonomy(taxonomy_hash);

create unique index if not exists uq_verified_question_registry_taxonomy_active
  on public.verified_question_registry_taxonomy(
    question_id,question_content_hash,registry_version_id,atomic_subskill_node_id,evidence_focus_id,assessment_process_code
  )
  where review_status='approved';

create index if not exists idx_verified_question_registry_taxonomy_question
  on public.verified_question_registry_taxonomy(question_id,question_content_hash)
  where review_status='approved' and not human_review_required;

create index if not exists idx_verified_question_registry_taxonomy_leaf
  on public.verified_question_registry_taxonomy(
    registry_version_id,atomic_subskill_node_id,evidence_focus_id
  )
  where review_status='approved' and not human_review_required;

alter table public.verified_question_registry_taxonomy enable row level security;
revoke all on table public.verified_question_registry_taxonomy
from public,anon,authenticated;
grant select,insert,update on table public.verified_question_registry_taxonomy
to service_role;

create or replace function private.validate_verified_question_registry_taxonomy()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_question public.questions%rowtype;
  v_registry public.academic_skill_registry_versions%rowtype;
  v_skill public.academic_skill_registry_nodes%rowtype;
  v_subskill public.academic_skill_registry_nodes%rowtype;
  v_focus public.academic_skill_evidence_focuses%rowtype;
  v_expected_cognitive text[];
  v_expected_hash text;
begin
  select q.* into v_question
  from public.questions q
  where q.id=new.question_id
    and q.is_active
    and q.content_origin in ('brain_heist','teacher')
    and q.pool_scope in ('global','school')
    and q.verification_status='verified'
    and q.analytics_eligible
    and q.current_content_hash=q.verified_content_hash;

  if not found then
    raise exception using errcode='23514',
      message='registry_taxonomy_requires_current_verified_question';
  end if;

  if new.question_content_hash <> v_question.current_content_hash then
    raise exception using errcode='23514',
      message='registry_taxonomy_question_hash_mismatch';
  end if;

  select * into v_registry
  from public.academic_skill_registry_versions v
  where v.id=new.registry_version_id and v.status='published';
  if not found then
    raise exception using errcode='23514',
      message='registry_taxonomy_requires_published_registry';
  end if;

  if public.academic_normalize_subject_key(v_question.subject) <> v_registry.subject_key then
    raise exception using errcode='23514',
      message='registry_taxonomy_subject_mismatch';
  end if;

  select * into v_skill
  from public.academic_skill_registry_nodes n
  where n.id=new.primary_skill_node_id
    and n.registry_version_id=v_registry.id
    and n.node_type='skill'
    and n.status='active';
  if not found then
    raise exception using errcode='23514',
      message='registry_taxonomy_primary_skill_invalid';
  end if;

  select * into v_subskill
  from public.academic_skill_registry_nodes n
  where n.id=new.atomic_subskill_node_id
    and n.registry_version_id=v_registry.id
    and n.node_type='subskill'
    and n.status='active'
    and n.parent_id=v_skill.id;
  if not found then
    raise exception using errcode='23514',
      message='registry_taxonomy_atomic_subskill_invalid';
  end if;

  select * into v_focus
  from public.academic_skill_evidence_focuses f
  where f.id=new.evidence_focus_id
    and f.registry_version_id=v_registry.id
    and f.atomic_subskill_node_id=v_subskill.id
    and f.status='active';
  if not found then
    raise exception using errcode='23514',
      message='registry_taxonomy_evidence_focus_invalid';
  end if;

  v_expected_cognitive := case new.assessment_process_code
    when 'BH-AO1' then array['remember','understand']::text[]
    when 'BH-AO2' then array['apply']::text[]
    when 'BH-AO3' then array['analyze']::text[]
    when 'BH-AO4' then array['evaluate']::text[]
    else array[]::text[]
  end;

  if not new.cognitive_process=any(v_expected_cognitive) then
    raise exception using errcode='23514',
      message='registry_taxonomy_process_cognitive_mismatch';
  end if;

  if new.review_status='approved' and new.human_review_required then
    raise exception using errcode='23514',
      message='approved_registry_taxonomy_cannot_require_human_review';
  end if;

  v_expected_hash := encode(extensions.digest(
    jsonb_build_object(
      'questionId',new.question_id,
      'questionContentHash',new.question_content_hash,
      'registryVersionId',new.registry_version_id,
      'primarySkillNodeId',new.primary_skill_node_id,
      'atomicSubskillNodeId',new.atomic_subskill_node_id,
      'evidenceFocusId',new.evidence_focus_id,
      'taxonomyVersion',trim(new.taxonomy_version),
      'assessmentProcessCode',new.assessment_process_code,
      'cognitiveProcess',new.cognitive_process,
      'evidenceStatement',trim(new.evidence_statement),
      'confidenceScore',new.confidence_score,
      'reviewStatus',new.review_status,
      'humanReviewRequired',new.human_review_required,
      'sourceMethod',new.source_method
    )::text,'sha256'
  ),'hex');

  new.taxonomy_hash := v_expected_hash;
  return new;
end;
$function$;

revoke all on function private.validate_verified_question_registry_taxonomy()
from public,anon,authenticated,service_role;

drop trigger if exists trg_validate_verified_question_registry_taxonomy
  on public.verified_question_registry_taxonomy;
create trigger trg_validate_verified_question_registry_taxonomy
before insert or update on public.verified_question_registry_taxonomy
for each row execute function private.validate_verified_question_registry_taxonomy();

-- ---------------------------------------------------------------------------
-- 3. Append-only item-level registry evidence
-- ---------------------------------------------------------------------------
create table if not exists public.student_learning_registry_item_evidence (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  answer_id uuid not null references public.student_assignment_answers(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
  academic_year_id uuid not null references public.school_academic_years(id) on delete restrict,
  academic_term_id uuid references public.school_academic_terms(id) on delete restrict,
  academic_subject_id uuid references public.academic_subjects(id) on delete restrict,
  registry_version_id uuid not null references public.academic_skill_registry_versions(id) on delete restrict,
  primary_skill_node_id uuid not null references public.academic_skill_registry_nodes(id) on delete restrict,
  atomic_subskill_node_id uuid not null references public.academic_skill_registry_nodes(id) on delete restrict,
  evidence_focus_id uuid not null references public.academic_skill_evidence_focuses(id) on delete restrict,
  registry_taxonomy_id uuid not null references public.verified_question_registry_taxonomy(id) on delete restrict,
  grade_level text not null,
  question_content_hash text not null,
  is_correct boolean not null,
  is_independent_assessment boolean not null,
  answered_at timestamptz not null,
  evidence_authority text not null,
  taxonomy_snapshot jsonb not null,
  taxonomy_snapshot_hash text not null,
  created_at timestamptz not null default now(),
  constraint student_learning_registry_item_evidence_authority_check
    check (evidence_authority in ('brains_heist_verified_registry_question','school_verified_registry_question'))
);

create unique index if not exists uq_student_learning_registry_item_answer_taxonomy
  on public.student_learning_registry_item_evidence(answer_id,registry_taxonomy_id);

create index if not exists idx_student_learning_registry_item_student_leaf
  on public.student_learning_registry_item_evidence(
    student_id,academic_year_id,registry_version_id,atomic_subskill_node_id,answered_at desc
  );

create index if not exists idx_student_learning_registry_item_assignment
  on public.student_learning_registry_item_evidence(assignment_id,student_id);

alter table public.student_learning_registry_item_evidence enable row level security;
revoke all on table public.student_learning_registry_item_evidence
from public,anon,authenticated;
grant select,insert on table public.student_learning_registry_item_evidence
to service_role;

drop trigger if exists trg_student_learning_registry_item_evidence_immutable
  on public.student_learning_registry_item_evidence;
create trigger trg_student_learning_registry_item_evidence_immutable
before update or delete on public.student_learning_registry_item_evidence
for each row execute function private.reject_student_learning_item_evidence_mutation();

-- ---------------------------------------------------------------------------
-- 4. Registry evidence materialization + longitudinal observation adapter
-- ---------------------------------------------------------------------------
create or replace function private.materialize_verified_assignment_registry_evidence(
  p_assignment_id uuid,
  p_student_id uuid
)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_assignment record;
  v_school_id uuid;
  v_effective_grade text;
  v_inserted integer:=0;
begin
  if p_assignment_id is null or p_student_id is null then return 0; end if;

  select
    a.school_id,a.class_id,a.class_code_snapshot,a.academic_year_id,a.academic_term_id,
    a.academic_subject_id,a.grade_level_snapshot,
    coalesce(nullif(trim(a.subject_name),''),nullif(trim(a.subject),''),nullif(trim(a.subject_id),''),'General') as subject_name,
    sa.batch as student_batch,sa.status,result.completed_at
  into v_assignment
  from public.assignments a
  join public.student_assignments sa
    on sa.assignment_id=a.id and sa.student_id=p_student_id
  join public.student_assignment_results result
    on result.assignment_id=a.id and result.student_id=p_student_id
  where a.id=p_assignment_id;

  if not found
     or v_assignment.status<>'completed'
     or v_assignment.completed_at is null
     or v_assignment.academic_year_id is null then
    return 0;
  end if;

  select coalesce(v_assignment.school_id,u.school_id)
  into v_school_id
  from public.users u
  where u.id=p_student_id;
  if v_school_id is null then return 0; end if;

  v_effective_grade:=nullif(trim(v_assignment.grade_level_snapshot),'');
  if v_effective_grade is null then
    select c.grade_level into v_effective_grade
    from public.classes c
    where c.school_id=v_school_id
      and (
        c.id=v_assignment.class_id
        or upper(regexp_replace(trim(c.class_code),'\s+','','g'))=
           upper(regexp_replace(trim(coalesce(v_assignment.student_batch,'')),'\s+','','g'))
      )
      and coalesce(c.is_active,true)
    order by (c.id=v_assignment.class_id) desc,c.id
    limit 1;
  end if;
  if v_effective_grade is null or v_effective_grade !~ '^[0-9]+$' then return 0; end if;

  with eligible as (
    select
      saa.id as answer_id,
      saa.question_id,
      saa.is_correct,
      coalesce(saa.answered_at,v_assignment.completed_at) as answered_at,
      q.current_content_hash as question_content_hash,
      rt.id as registry_taxonomy_id,
      rt.registry_version_id,
      rt.primary_skill_node_id,
      rt.atomic_subskill_node_id,
      rt.evidence_focus_id,
      rv.code as registry_version_code,
      skill.code as primary_skill_code,
      skill.name as primary_skill_name,
      subskill.code as atomic_subskill_code,
      subskill.name as atomic_subskill_name,
      focus.code as evidence_focus_code,
      focus.name as evidence_focus_name,
      rt.assessment_process_code,
      rt.cognitive_process,
      rt.evidence_statement,
      rt.confidence_score,
      rt.taxonomy_version,
      rt.taxonomy_hash,
      case when q.pool_scope='global'
        then 'brains_heist_verified_registry_question'
        else 'school_verified_registry_question'
      end as evidence_authority,
      exists(
        select 1
        from public.student_learning_intervention_practice_assignments practice
        where practice.assignment_id=p_assignment_id
          and practice.student_id=p_student_id
      ) as is_targeted_practice
    from public.student_assignment_answers saa
    join public.assignment_questions aq
      on aq.assignment_id=saa.assignment_id
     and aq.question_id=saa.question_id
     and aq.analytics_eligible_snapshot
     and aq.pool_scope_snapshot in ('global','school')
     and aq.verification_status_snapshot='verified'
    join public.questions q
      on q.id=saa.question_id
     and q.pool_scope=aq.pool_scope_snapshot
     and q.owner_school_id is not distinct from aq.owner_school_id_snapshot
     and q.verification_status='verified'
     and q.analytics_eligible
     and q.is_active
     and q.current_content_hash=q.verified_content_hash
     and aq.question_content_hash=q.current_content_hash
     and v_effective_grade::smallint=any(q.eligible_grade_levels)
     and (
       (q.pool_scope='global' and q.content_origin='brain_heist' and q.owner_school_id is null and q.is_public)
       or
       (q.pool_scope='school' and q.content_origin='teacher' and q.owner_school_id=v_school_id and not q.is_public)
     )
    join public.verified_question_registry_taxonomy rt
      on rt.question_id=q.id
     and rt.question_content_hash=aq.question_content_hash
     and rt.review_status='approved'
     and not rt.human_review_required
    join public.academic_skill_registry_versions rv
      on rv.id=rt.registry_version_id
     and rv.status='published'
     and rv.subject_key=public.academic_normalize_subject_key(q.subject)
    join public.academic_skill_registry_nodes skill
      on skill.id=rt.primary_skill_node_id
     and skill.registry_version_id=rv.id
     and skill.node_type='skill'
     and skill.status='active'
    join public.academic_skill_registry_nodes subskill
      on subskill.id=rt.atomic_subskill_node_id
     and subskill.registry_version_id=rv.id
     and subskill.parent_id=skill.id
     and subskill.node_type='subskill'
     and subskill.status='active'
    join public.academic_skill_evidence_focuses focus
      on focus.id=rt.evidence_focus_id
     and focus.registry_version_id=rv.id
     and focus.atomic_subskill_node_id=subskill.id
     and focus.status='active'
    where saa.assignment_id=p_assignment_id
      and saa.student_id=p_student_id
      and saa.grading_status='graded'
      and saa.is_correct is not null
  )
  insert into public.student_learning_registry_item_evidence(
    school_id,student_id,assignment_id,answer_id,question_id,
    academic_year_id,academic_term_id,academic_subject_id,
    registry_version_id,primary_skill_node_id,atomic_subskill_node_id,
    evidence_focus_id,registry_taxonomy_id,grade_level,question_content_hash,
    is_correct,is_independent_assessment,answered_at,evidence_authority,
    taxonomy_snapshot,taxonomy_snapshot_hash
  )
  select
    v_school_id,p_student_id,p_assignment_id,e.answer_id,e.question_id,
    v_assignment.academic_year_id,v_assignment.academic_term_id,v_assignment.academic_subject_id,
    e.registry_version_id,e.primary_skill_node_id,e.atomic_subskill_node_id,
    e.evidence_focus_id,e.registry_taxonomy_id,v_effective_grade,e.question_content_hash,
    e.is_correct,not e.is_targeted_practice,e.answered_at,e.evidence_authority,
    jsonb_build_object(
      'registryVersionCode',e.registry_version_code,
      'primarySkillCode',e.primary_skill_code,
      'primarySkillName',e.primary_skill_name,
      'atomicSubskillCode',e.atomic_subskill_code,
      'atomicSubskillName',e.atomic_subskill_name,
      'evidenceFocusCode',e.evidence_focus_code,
      'evidenceFocusName',e.evidence_focus_name,
      'assessmentProcessCode',e.assessment_process_code,
      'cognitiveProcess',e.cognitive_process,
      'evidenceStatement',e.evidence_statement,
      'mappingConfidence',e.confidence_score,
      'taxonomyVersion',e.taxonomy_version,
      'registryTaxonomyHash',e.taxonomy_hash,
      'isTargetedPractice',e.is_targeted_practice
    ),
    encode(extensions.digest(jsonb_build_object(
      'registryVersionCode',e.registry_version_code,
      'primarySkillCode',e.primary_skill_code,
      'atomicSubskillCode',e.atomic_subskill_code,
      'evidenceFocusCode',e.evidence_focus_code,
      'assessmentProcessCode',e.assessment_process_code,
      'cognitiveProcess',e.cognitive_process,
      'evidenceStatement',e.evidence_statement,
      'mappingConfidence',e.confidence_score,
      'taxonomyVersion',e.taxonomy_version,
      'registryTaxonomyHash',e.taxonomy_hash,
      'isTargetedPractice',e.is_targeted_practice
    )::text,'sha256'),'hex')
  from eligible e
  on conflict(answer_id,registry_taxonomy_id) do nothing;

  get diagnostics v_inserted=row_count;
  return v_inserted;
end;
$function$;

revoke all on function private.materialize_verified_assignment_registry_evidence(uuid,uuid)
from public,anon,authenticated,service_role;

create or replace function private.ingest_verified_assignment_registry_evidence(
  p_assignment_id uuid,
  p_student_id uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_assignment record;
  v_group record;
  v_skill_key text;
  v_source_key text;
  v_percentage numeric;
  v_kind text;
  v_quality text;
begin
  perform private.materialize_verified_assignment_registry_evidence(
    p_assignment_id,p_student_id
  );

  select
    a.school_id,a.class_id,a.class_code_snapshot,a.academic_year_id,a.academic_term_id,
    a.academic_subject_id,a.grade_level_snapshot,
    coalesce(nullif(trim(a.subject_name),''),nullif(trim(a.subject),''),nullif(trim(a.subject_id),''),'General') as subject_name
  into v_assignment
  from public.assignments a
  where a.id=p_assignment_id;
  if not found then return; end if;

  for v_group in
    select
      e.school_id,e.academic_year_id,e.academic_term_id,e.academic_subject_id,e.grade_level,
      e.registry_version_id,rv.code as registry_version_code,
      e.primary_skill_node_id,skill.code as primary_skill_code,skill.name as primary_skill_name,
      e.atomic_subskill_node_id,subskill.code as atomic_subskill_code,subskill.name as atomic_subskill_name,
      e.evidence_focus_id,focus.code as evidence_focus_code,focus.name as evidence_focus_name,
      tx.assessment_process_code,tx.cognitive_process,
      min(tx.evidence_statement) as evidence_statement,
      array_agg(distinct tx.evidence_statement order by tx.evidence_statement) as evidence_statements,
      count(*)::integer as question_count,
      count(*) filter(where e.is_correct)::integer as correct_count,
      bool_and(e.is_independent_assessment) as independent_assessment,
      min(tx.confidence_score) as mapping_confidence,
      array_agg(e.id order by e.answered_at,e.id) as item_evidence_ids,
      array_agg(e.answer_id order by e.answered_at,e.id) as answer_ids,
      array_agg(e.question_id order by e.answered_at,e.id) as question_ids,
      max(e.answered_at) as observed_at
    from public.student_learning_registry_item_evidence e
    join public.academic_skill_registry_versions rv
      on rv.id=e.registry_version_id and rv.status='published'
    join public.academic_skill_registry_nodes skill
      on skill.id=e.primary_skill_node_id and skill.status='active'
    join public.academic_skill_registry_nodes subskill
      on subskill.id=e.atomic_subskill_node_id and subskill.status='active'
    join public.academic_skill_evidence_focuses focus
      on focus.id=e.evidence_focus_id and focus.status='active'
    join public.verified_question_registry_taxonomy tx
      on tx.id=e.registry_taxonomy_id
     and tx.review_status='approved'
     and not tx.human_review_required
    where e.assignment_id=p_assignment_id
      and e.student_id=p_student_id
    group by
      e.school_id,e.academic_year_id,e.academic_term_id,e.academic_subject_id,e.grade_level,
      e.registry_version_id,rv.code,
      e.primary_skill_node_id,skill.code,skill.name,
      e.atomic_subskill_node_id,subskill.code,subskill.name,
      e.evidence_focus_id,focus.code,focus.name,
      tx.assessment_process_code,tx.cognitive_process
  loop
    v_percentage:=round(100*v_group.correct_count::numeric/v_group.question_count::numeric,2);
    v_kind:=case when v_percentage<60 then 'focus'
                 when v_percentage>=80 then 'strength'
                 else 'developing' end;
    v_quality:=case when v_group.question_count<3 then 'provisional'
                    when v_group.question_count<6 then 'standard'
                    else 'strong' end;
    v_skill_key:=concat_ws(':','registry',v_group.registry_version_code,v_group.atomic_subskill_code);
    v_source_key:=concat_ws(
      ':','assignment',p_assignment_id::text,'registry',
      md5(v_skill_key),md5(v_group.evidence_focus_code),v_group.assessment_process_code
    );

    insert into public.student_learning_observations(
      school_id,student_id,subject,topic,skill,subskill,skill_key,
      observation_type,source_type,source_id,source_key,observed_at,
      evidence_percentage,evidence_count,evidence_quality,
      contributes_to_focus_state,evidence,system_generated,
      academic_subject_id,academic_year_id,academic_term_id,
      grade_level_at_time,class_id_at_time,class_code_at_time,
      academic_context_quality,academic_context_source
    )
    values(
      v_group.school_id,p_student_id,v_assignment.subject_name,
      v_group.primary_skill_name,v_group.primary_skill_name,v_group.atomic_subskill_name,v_skill_key,
      v_kind,'registry_verified_assignment',p_assignment_id,v_source_key,v_group.observed_at,
      v_percentage,v_group.question_count,v_quality,
      v_group.independent_assessment,
      jsonb_build_object(
        'evidence_provenance','brains_heist_registry_verified_question',
        'registry_evidence',true,
        'registry_version_id',v_group.registry_version_id,
        'registry_version_code',v_group.registry_version_code,
        'primary_skill_node_id',v_group.primary_skill_node_id,
        'primary_skill_code',v_group.primary_skill_code,
        'atomic_subskill_node_id',v_group.atomic_subskill_node_id,
        'atomic_subskill_code',v_group.atomic_subskill_code,
        'evidence_focus_id',v_group.evidence_focus_id,
        'evidence_focus_code',v_group.evidence_focus_code,
        'evidence_focus_name',v_group.evidence_focus_name,
        'assessment_process_code',v_group.assessment_process_code,
        'cognitive_process',v_group.cognitive_process,
        'evidence_statement',v_group.evidence_statement,
        'evidence_statements',to_jsonb(v_group.evidence_statements),
        'registry_mapping_confidence',v_group.mapping_confidence,
        'registry_coverage_score',1,
        'item_evidence_ids',to_jsonb(v_group.item_evidence_ids),
        'answer_ids',to_jsonb(v_group.answer_ids),
        'question_ids',to_jsonb(v_group.question_ids),
        'question_count',v_group.question_count,
        'correct',v_group.correct_count,
        'incorrect',v_group.question_count-v_group.correct_count,
        'intervention_practice',not v_group.independent_assessment,
        'independent_mastery_evidence',v_group.independent_assessment,
        'classification_thresholds',jsonb_build_object('focus_below',60,'strength_from',80)
      ),
      true,
      v_group.academic_subject_id,v_group.academic_year_id,v_group.academic_term_id,
      v_group.grade_level,v_assignment.class_id,v_assignment.class_code_snapshot,
      'confirmed','verified_registry_assignment'
    )
    on conflict(student_id,source_key) do nothing;

    perform public.student_learning_refresh_focus_state(
      p_student_id,v_skill_key
    );
  end loop;
end;
$function$;

revoke all on function private.ingest_verified_assignment_registry_evidence(uuid,uuid)
from public,anon,authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 5. Qualification policy: registry evidence is explicit and conservative
-- ---------------------------------------------------------------------------
create or replace function public.student_learning_observation_is_qualified(
  p_source_type text,
  p_contributes boolean,
  p_evidence jsonb
)
returns boolean
language sql
immutable
set search_path to ''
as $function$
  select case
    when p_source_type='writing_attempt' then false
    when p_source_type='writing_assessment_review' then
      coalesce(p_contributes,false)
      and coalesce(p_evidence->>'writing_signal','') in (
        'teacher_final_review','teacher_validated_weakness'
      )
    when p_source_type='assignment_result' then
      coalesce(p_contributes,false)
      and coalesce(p_evidence->>'evidence_provenance','')='brains_heist_verified_question'
      and lower(coalesce(p_evidence->>'intervention_practice','false'))<>'true'
      and lower(coalesce(p_evidence->>'independent_mastery_evidence','true'))<>'false'
    when p_source_type='registry_verified_assignment' then
      coalesce(p_contributes,false)
      and lower(coalesce(p_evidence->>'registry_evidence','false'))='true'
      and coalesce(p_evidence->>'registry_version_code','')<>''
      and coalesce(p_evidence->>'atomic_subskill_code','')<>''
      and coalesce(p_evidence->>'evidence_focus_code','')<>''
      and lower(coalesce(p_evidence->>'intervention_practice','false'))<>'true'
      and lower(coalesce(p_evidence->>'independent_mastery_evidence','false'))='true'
    when p_source_type='cambridge_attempt' then
      coalesce(p_evidence->>'scoring_authority','') in ('teacher_verified','server_verified')
      and jsonb_typeof(p_evidence->'mapping_snapshots')='array'
      and jsonb_array_length(p_evidence->'mapping_snapshots')>0
    else coalesce(p_contributes,false)
  end;
$function$;

revoke all on function public.student_learning_observation_is_qualified(text,boolean,jsonb)
from public,anon,authenticated;
grant execute on function public.student_learning_observation_is_qualified(text,boolean,jsonb)
to service_role;

alter table public.student_learning_observations
  drop constraint if exists student_learning_observations_source_type_check;
alter table public.student_learning_observations
  add constraint student_learning_observations_source_type_check
  check(source_type=any(array[
    'assignment_result'::text,
    'registry_verified_assignment'::text,
    'writing_attempt'::text,
    'writing_assessment_review'::text,
    'teacher_observation'::text,
    'import'::text,
    'cambridge_attempt'::text
  ])) not valid;

-- ---------------------------------------------------------------------------
-- 6. Plug registry evidence into the established assignment-result hook
-- ---------------------------------------------------------------------------
create or replace function private.capture_verified_assignment_diagnostic_evidence()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform private.ingest_verified_assignment_registry_evidence(
    new.assignment_id,new.student_id
  );
  perform private.ingest_verified_assignment_diagnostic_evidence(
    new.assignment_id,new.student_id
  );
  return new;
end;
$function$;

revoke all on function private.capture_verified_assignment_diagnostic_evidence()
from public,anon,authenticated,service_role;

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
set search_path to ''
as $function$
begin
  perform private.ingest_verified_assignment_registry_evidence(
    p_assignment_id,p_student_id
  );
  perform private.ingest_verified_assignment_diagnostic_evidence(
    p_assignment_id,p_student_id
  );
end;
$function$;

revoke all on function public.student_learning_ingest_assignment_result(
  uuid,uuid,timestamptz,integer,integer
) from public,anon,authenticated;
grant execute on function public.student_learning_ingest_assignment_result(
  uuid,uuid,timestamptz,integer,integer
) to service_role;

comment on table public.verified_question_registry_taxonomy is
  'Hash-bound governed mapping from a current verified question to canonical Brains Heist registry skill/subskill/Evidence Focus and internal BH-AO process.';

comment on table public.student_learning_registry_item_evidence is
  'Append-only registry-native answer evidence ledger. It coexists with the legacy curriculum-framework item ledger and never rewrites historical evidence.';

comment on function private.ingest_verified_assignment_registry_evidence(uuid,uuid) is
  'Creates canonical registry observations from immutable verified assignment snapshots; targeted intervention practice is recorded but never qualifies as independent mastery evidence.';

-- Migration invariants.
do $$
declare
  v_economics_subject_id uuid;
begin
  select id into v_economics_subject_id
  from public.academic_subjects
  where code='economics' and name='Economics' and is_active;

  if v_economics_subject_id is null then
    raise exception 'economics_academic_subject_missing';
  end if;

  if exists(
    select 1
    from public.school_subjects ss
    where public.academic_normalize_subject_key(ss.name)='economics'
      and ss.academic_subject_id is distinct from v_economics_subject_id
  ) then
    raise exception 'economics_school_subject_backfill_incomplete';
  end if;

  if has_function_privilege('public','private.ingest_verified_assignment_registry_evidence(uuid,uuid)','EXECUTE')
     or has_function_privilege('anon','private.ingest_verified_assignment_registry_evidence(uuid,uuid)','EXECUTE')
     or has_function_privilege('authenticated','private.ingest_verified_assignment_registry_evidence(uuid,uuid)','EXECUTE') then
    raise exception 'registry_evidence_private_ingest_exposed';
  end if;
end $$;
