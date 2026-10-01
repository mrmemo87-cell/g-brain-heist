-- Unified governed question catalogue.
-- Fixes registry-native visibility and makes bank loading scale with page size,
-- not total question-bank size.

-- ============================================================================
-- Registry-native membership index
-- ============================================================================

create table if not exists private.registry_question_catalog_membership (
  question_id uuid not null references public.questions(id) on delete cascade,
  question_content_hash text not null,
  registry_version_id uuid not null references public.academic_skill_registry_versions(id) on delete cascade,
  academic_subject_id uuid not null references public.academic_subjects(id) on delete restrict,
  grade_level smallint not null,
  school_id uuid references public.schools(id) on delete cascade,
  pool_scope text not null,
  difficulty text not null,
  catalog_created_at timestamptz not null,
  primary key(question_id,registry_version_id,grade_level),
  constraint registry_question_catalog_grade_check check(grade_level between 1 and 12),
  constraint registry_question_catalog_pool_check check(pool_scope in ('global','school'))
);

create index if not exists registry_question_catalog_global_page_idx
  on private.registry_question_catalog_membership(
    academic_subject_id,grade_level,difficulty,catalog_created_at desc,question_id desc
  )
  where school_id is null;

create index if not exists registry_question_catalog_school_page_idx
  on private.registry_question_catalog_membership(
    school_id,academic_subject_id,grade_level,difficulty,catalog_created_at desc,question_id desc
  )
  where school_id is not null;

create index if not exists registry_question_catalog_question_idx
  on private.registry_question_catalog_membership(question_id,question_content_hash);

create table if not exists private.registry_question_catalog_counts (
  academic_subject_id uuid not null references public.academic_subjects(id) on delete cascade,
  grade_level smallint not null,
  scope_key text not null,
  school_id uuid references public.schools(id) on delete cascade,
  pool_scope text not null,
  difficulty text not null,
  question_count bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key(academic_subject_id,grade_level,scope_key,pool_scope,difficulty),
  constraint registry_question_catalog_count_nonnegative check(question_count>=0)
);

create or replace function private.registry_question_catalog_count_delta()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_row private.registry_question_catalog_membership%rowtype;
  v_delta integer;
  v_scope_key text;
begin
  if tg_op='INSERT' then
    v_row:=new;
    v_delta:=1;
  else
    v_row:=old;
    v_delta:=-1;
  end if;

  v_scope_key:=coalesce(v_row.school_id::text,'global');

  insert into private.registry_question_catalog_counts(
    academic_subject_id,grade_level,scope_key,school_id,pool_scope,difficulty,
    question_count,updated_at
  ) values (
    v_row.academic_subject_id,v_row.grade_level,v_scope_key,v_row.school_id,
    v_row.pool_scope,v_row.difficulty,greatest(v_delta,0),now()
  )
  on conflict(academic_subject_id,grade_level,scope_key,pool_scope,difficulty)
  do update set
    question_count=greatest(
      private.registry_question_catalog_counts.question_count+v_delta,
      0
    ),
    updated_at=now();

  delete from private.registry_question_catalog_counts
  where academic_subject_id=v_row.academic_subject_id
    and grade_level=v_row.grade_level
    and scope_key=v_scope_key
    and pool_scope=v_row.pool_scope
    and difficulty=v_row.difficulty
    and question_count=0;

  return null;
end;
$function$;

drop trigger if exists trg_registry_question_catalog_count_delta
  on private.registry_question_catalog_membership;
create trigger trg_registry_question_catalog_count_delta
after insert or delete on private.registry_question_catalog_membership
for each row execute function private.registry_question_catalog_count_delta();

create or replace function private.refresh_registry_question_catalog_membership(
  p_question_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
begin
  delete from private.registry_question_catalog_membership
  where question_id=p_question_id;

  insert into private.registry_question_catalog_membership(
    question_id,question_content_hash,registry_version_id,academic_subject_id,
    grade_level,school_id,pool_scope,difficulty,catalog_created_at
  )
  select distinct
    q.id,
    q.verified_content_hash,
    registry.id,
    q.academic_subject_id,
    grade.grade_level,
    case when q.pool_scope='school' then q.owner_school_id else null end,
    q.pool_scope,
    q.difficulty,
    coalesce(q.created_at,q.updated_at,now())
  from public.questions q
  join public.academic_subjects subject
    on subject.id=q.academic_subject_id
   and subject.is_active
  join public.verified_question_registry_taxonomy taxonomy
    on taxonomy.question_id=q.id
   and taxonomy.question_content_hash=q.verified_content_hash
   and taxonomy.review_status='approved'
   and not taxonomy.human_review_required
  join public.academic_skill_registry_versions registry
    on registry.id=taxonomy.registry_version_id
   and registry.status='published'
   and registry.subject_key=subject.code
  join public.academic_skill_registry_nodes skill
    on skill.id=taxonomy.primary_skill_node_id
   and skill.registry_version_id=registry.id
   and skill.node_type='skill'
   and skill.status='active'
  join public.academic_skill_registry_nodes subskill
    on subskill.id=taxonomy.atomic_subskill_node_id
   and subskill.registry_version_id=registry.id
   and subskill.parent_id=skill.id
   and subskill.node_type='subskill'
   and subskill.status='active'
  join public.academic_skill_evidence_focuses focus
    on focus.id=taxonomy.evidence_focus_id
   and focus.registry_version_id=registry.id
   and focus.atomic_subskill_node_id=subskill.id
   and focus.status='active'
  cross join lateral (
    select value::smallint as grade_level
    from unnest(q.eligible_grade_levels) value
    where value between 1 and 12
  ) grade
  where q.id=p_question_id
    and q.is_active
    and q.verification_status='verified'
    and q.analytics_eligible
    and q.current_content_hash=q.verified_content_hash
    and (
      (q.pool_scope='global'
        and q.content_origin='brain_heist'
        and q.owner_school_id is null
        and q.is_public)
      or
      (q.pool_scope='school'
        and q.content_origin='teacher'
        and q.owner_school_id is not null
        and not q.is_public)
    )
    and (
      case
        when grade.grade_level between 1 and 6 then 'primary'
        when grade.grade_level between 7 and 9 then 'lower_secondary'
        when grade.grade_level between 10 and 12 then 'upper_secondary'
        else null
      end
    )=any(subskill.applicable_phases);
end;
$function$;

create or replace function private.refresh_registry_question_catalog_for_registry(
  p_registry_version_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_question_id uuid;
begin
  for v_question_id in
    select distinct taxonomy.question_id
    from public.verified_question_registry_taxonomy taxonomy
    where taxonomy.registry_version_id=p_registry_version_id
  loop
    perform private.refresh_registry_question_catalog_membership(v_question_id);
  end loop;
end;
$function$;

create or replace function private.trg_refresh_registry_question_catalog_from_question()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.refresh_registry_question_catalog_membership(new.id);
  return new;
end;
$function$;

drop trigger if exists trg_refresh_registry_question_catalog_from_question
  on public.questions;
create trigger trg_refresh_registry_question_catalog_from_question
after insert or update of
  academic_subject_id,eligible_grade_levels,verification_status,analytics_eligible,
  is_active,current_content_hash,verified_content_hash,pool_scope,content_origin,
  owner_school_id,is_public,difficulty,created_at
on public.questions
for each row execute function private.trg_refresh_registry_question_catalog_from_question();

create or replace function private.trg_refresh_registry_question_catalog_from_taxonomy()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if tg_op='DELETE' then
    perform private.refresh_registry_question_catalog_membership(old.question_id);
    return old;
  end if;

  perform private.refresh_registry_question_catalog_membership(new.question_id);
  if tg_op='UPDATE' and old.question_id<>new.question_id then
    perform private.refresh_registry_question_catalog_membership(old.question_id);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_refresh_registry_question_catalog_from_taxonomy
  on public.verified_question_registry_taxonomy;
create trigger trg_refresh_registry_question_catalog_from_taxonomy
after insert or update or delete on public.verified_question_registry_taxonomy
for each row execute function private.trg_refresh_registry_question_catalog_from_taxonomy();

create or replace function private.trg_refresh_registry_question_catalog_from_registry()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if old.status is distinct from new.status
     or old.subject_key is distinct from new.subject_key then
    perform private.refresh_registry_question_catalog_for_registry(new.id);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_refresh_registry_question_catalog_from_registry
  on public.academic_skill_registry_versions;
create trigger trg_refresh_registry_question_catalog_from_registry
after update of status,subject_key on public.academic_skill_registry_versions
for each row execute function private.trg_refresh_registry_question_catalog_from_registry();

create or replace function private.trg_refresh_registry_question_catalog_from_node()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if old.status is distinct from new.status then
    perform private.refresh_registry_question_catalog_for_registry(new.registry_version_id);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_refresh_registry_question_catalog_from_node
  on public.academic_skill_registry_nodes;
create trigger trg_refresh_registry_question_catalog_from_node
after update of status on public.academic_skill_registry_nodes
for each row execute function private.trg_refresh_registry_question_catalog_from_node();

create or replace function private.trg_refresh_registry_question_catalog_from_focus()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if old.status is distinct from new.status then
    perform private.refresh_registry_question_catalog_for_registry(new.registry_version_id);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_refresh_registry_question_catalog_from_focus
  on public.academic_skill_evidence_focuses;
create trigger trg_refresh_registry_question_catalog_from_focus
after update of status on public.academic_skill_evidence_focuses
for each row execute function private.trg_refresh_registry_question_catalog_from_focus();

-- Initial registry-native backfill.
do $backfill$
declare
  v_question_id uuid;
begin
  for v_question_id in
    select distinct taxonomy.question_id
    from public.verified_question_registry_taxonomy taxonomy
  loop
    perform private.refresh_registry_question_catalog_membership(v_question_id);
  end loop;
end;
$backfill$;

-- Search stays server-side. The index is independent of total browser payload.
create index if not exists questions_catalog_search_idx
on public.questions using gin (
  to_tsvector(
    'simple'::regconfig,
    coalesce(question_text,'')||' '||
    coalesce(topic_name,'')||' '||
    coalesce(topic,'')||' '||
    coalesce(curriculum_strand,'')||' '||
    coalesce(curriculum_skill,'')||' '||
    coalesce(curriculum_subskill,'')
  )
);

create index if not exists questions_verified_catalog_page_idx
on public.questions(academic_subject_id,difficulty,created_at desc,id desc)
where is_active
  and verification_status='verified'
  and analytics_eligible;

-- ============================================================================
-- Shared count authority
-- ============================================================================

create or replace function private.governed_question_count_for_context(
  p_school_id uuid,
  p_academic_year_id uuid,
  p_grade_level text,
  p_academic_subject_id uuid,
  p_curriculum_scope_id uuid default null,
  p_difficulty text default null
)
returns bigint
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_grade smallint;
  v_registry_count bigint:=0;
  v_legacy_count bigint:=0;
begin
  if p_academic_subject_id is null or p_grade_level !~ '^[0-9]+$' then
    return 0;
  end if;
  v_grade:=p_grade_level::smallint;

  select coalesce(sum(c.question_count),0)
  into v_registry_count
  from private.registry_question_catalog_counts c
  where c.academic_subject_id=p_academic_subject_id
    and c.grade_level=v_grade
    and (p_difficulty is null or c.difficulty=p_difficulty)
    and (
      c.school_id is null
      or c.school_id=p_school_id
    );

  if p_curriculum_scope_id is not null then
    select count(distinct q.id)
    into v_legacy_count
    from public.curriculum_item_objective_mappings im
    join public.curriculum_assessment_items ai
      on ai.id=im.assessment_item_id
     and ai.is_active
     and ai.source_type='question_bank'
    join public.questions q
      on q.id::text=ai.source_record_id
     and q.academic_subject_id=p_academic_subject_id
     and q.is_active
     and q.verification_status='verified'
     and q.analytics_eligible
     and q.current_content_hash=q.verified_content_hash
     and ai.content_hash=q.verified_content_hash
     and v_grade=any(q.eligible_grade_levels)
     and (p_difficulty is null or q.difficulty=p_difficulty)
     and (
       (q.pool_scope='global'
         and q.content_origin='brain_heist'
         and q.owner_school_id is null
         and q.is_public
         and ai.school_id is null)
       or
       (q.pool_scope='school'
         and q.content_origin='teacher'
         and q.owner_school_id=p_school_id
         and not q.is_public
         and ai.school_id=p_school_id)
     )
    join public.curriculum_framework_versions fv
      on fv.id=im.framework_version_id
     and fv.status in ('published','retired')
     and fv.content_hash=im.curriculum_version_content_hash
    where im.curriculum_scope_id=p_curriculum_scope_id
      and im.academic_subject_id=p_academic_subject_id
      and im.status='approved'
      and im.mapping_role='primary'
      and im.superseded_at is null
      and im.item_content_hash=ai.content_hash
      and not exists(
        select 1
        from private.registry_question_catalog_membership membership
        where membership.question_id=q.id
          and membership.question_content_hash=q.verified_content_hash
          and membership.academic_subject_id=p_academic_subject_id
          and membership.grade_level=v_grade
          and (membership.school_id is null or membership.school_id=p_school_id)
      );
  end if;

  return coalesce(v_registry_count,0)+coalesce(v_legacy_count,0);
end;
$function$;

revoke all on function private.governed_question_count_for_context(
  uuid,uuid,text,uuid,uuid,text
) from public,anon,authenticated,service_role;

-- ============================================================================
-- Teacher keyset-paged catalogue
-- ============================================================================

create or replace function public.rpc_teacher_question_catalog_page(
  p_subject text default null,
  p_difficulty text default null,
  p_teacher_id uuid default null,
  p_page_size integer default 40,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_search text default null,
  p_topic text default null,
  p_pool text default 'all'
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_actor uuid:=auth.uid();
  v_teacher uuid;
  v_school uuid;
  v_year uuid;
  v_limit integer:=greatest(1,least(coalesce(p_page_size,40),100));
  v_pool text:=lower(trim(coalesce(p_pool,'all')));
  v_items jsonb:='[]'::jsonb;
  v_has_more boolean:=false;
  v_next_created_at timestamptz;
  v_next_id uuid;
begin
  if v_actor is null then
    raise exception using errcode='42501',message='authentication_required';
  end if;

  select t.id into v_teacher
  from public.teachers t
  where t.user_id=v_actor;

  if v_teacher is null then
    raise exception using errcode='42501',message='teacher_required';
  end if;

  if p_teacher_id is not null and p_teacher_id<>v_teacher then
    raise exception using errcode='42501',message='cannot_browse_another_teacher_pool';
  end if;

  if v_pool not in ('all','brains_heist','school','mine') then
    raise exception using errcode='22023',message='invalid_question_catalog_pool';
  end if;

  select sm.school_id into v_school
  from public.school_members sm
  where sm.user_id=v_actor and sm.status='active'
  order by sm.joined_at desc nulls last,sm.id
  limit 1;
  if v_school is null then
    select u.school_id into v_school from public.users u where u.id=v_actor;
  end if;
  if v_school is not null then
    v_year:=public.academic_resolve_operational_year_id(v_school,now());
  end if;

  with allocations as materialized (
    select distinct
      g.school_id,
      g.school_subject_id,
      g.school_subject_name,
      g.academic_subject_id,
      g.academic_subject_name,
      g.academic_subject_code,
      g.academic_year_id,
      g.grade_level,
      offering.curriculum_scope_id
    from private.teacher_current_teaching_groups(v_actor,v_school) g
    join public.school_subject_offerings offering
      on offering.school_id=g.school_id
     and offering.school_subject_id=g.school_subject_id
     and offering.academic_year_id=g.academic_year_id
     and offering.grade_level=g.grade_level
     and offering.status='active'
    where g.academic_subject_id is not null
      and g.grade_level~'^[0-9]+$'
      and (
        p_subject is null
        or private.teacher_assignment_subject_key(g.school_subject_name)
          =private.teacher_assignment_subject_key(p_subject)
        or private.teacher_assignment_subject_key(g.academic_subject_name)
          =private.teacher_assignment_subject_key(p_subject)
        or lower(coalesce(g.academic_subject_code,''))=
          lower(public.academic_normalize_subject_key(p_subject))
      )

    union

    select distinct
      cta.school_id,
      ss.id,
      ss.name,
      ss.academic_subject_id,
      academic.name,
      academic.code,
      offering.academic_year_id,
      class.grade_level,
      offering.curriculum_scope_id
    from public.class_teacher_assignments cta
    join public.classes class
      on class.id=cta.class_id
     and class.school_id=cta.school_id
     and coalesce(class.is_active,true)
     and class.grade_level~'^[0-9]+$'
    join public.school_subjects ss
      on ss.id=cta.school_subject_id
     and ss.school_id=cta.school_id
     and ss.is_active
     and ss.academic_subject_id is not null
    join public.academic_subjects academic
      on academic.id=ss.academic_subject_id
     and academic.is_active
    join public.school_subject_offerings offering
      on offering.school_id=cta.school_id
     and offering.school_subject_id=ss.id
     and offering.grade_level=class.grade_level
     and offering.status='active'
     and (v_year is null or offering.academic_year_id=v_year)
    where cta.teacher_user_id=v_actor
      and cta.school_id=v_school
      and cta.active
      and (
        p_subject is null
        or private.teacher_assignment_subject_key(ss.name)
          =private.teacher_assignment_subject_key(p_subject)
        or private.teacher_assignment_subject_key(academic.name)
          =private.teacher_assignment_subject_key(p_subject)
        or lower(academic.code)=lower(public.academic_normalize_subject_key(p_subject))
      )
  ),
  registry_candidates as materialized (
    select
      q.id,
      coalesce(q.created_at,q.updated_at,'1970-01-01'::timestamptz) sort_created_at,
      1 authority_priority
    from allocations allocation
    join private.registry_question_catalog_membership membership
      on membership.academic_subject_id=allocation.academic_subject_id
     and membership.grade_level=allocation.grade_level::smallint
     and (membership.school_id is null or membership.school_id=allocation.school_id)
    join public.questions q
      on q.id=membership.question_id
     and q.verified_content_hash=membership.question_content_hash
    where v_pool in ('all','brains_heist','school')
      and (
        v_pool='all'
        or (v_pool='brains_heist' and membership.pool_scope='global')
        or (v_pool='school' and membership.pool_scope='school')
      )
      and (p_difficulty is null or q.difficulty=p_difficulty)
      and (p_topic is null or lower(trim(coalesce(q.topic_name,q.topic,'')))=lower(trim(p_topic)))
      and (
        p_search is null or trim(p_search)=''
        or to_tsvector(
          'simple'::regconfig,
          coalesce(q.question_text,'')||' '||
          coalesce(q.topic_name,'')||' '||
          coalesce(q.topic,'')||' '||
          coalesce(q.curriculum_strand,'')||' '||
          coalesce(q.curriculum_skill,'')||' '||
          coalesce(q.curriculum_subskill,'')
        ) @@ websearch_to_tsquery('simple'::regconfig,p_search)
      )
      and (
        p_cursor_created_at is null
        or coalesce(q.created_at,q.updated_at,'1970-01-01'::timestamptz)<p_cursor_created_at
        or (
          coalesce(q.created_at,q.updated_at,'1970-01-01'::timestamptz)=p_cursor_created_at
          and p_cursor_id is not null
          and q.id<p_cursor_id
        )
      )
    group by q.id,q.created_at,q.updated_at
    order by sort_created_at desc,q.id desc
    limit v_limit+1
  ),
  legacy_candidates as materialized (
    select
      q.id,
      coalesce(q.created_at,q.updated_at,'1970-01-01'::timestamptz) sort_created_at,
      2 authority_priority
    from allocations allocation
    join public.curriculum_item_objective_mappings mapping
      on mapping.curriculum_scope_id=allocation.curriculum_scope_id
     and mapping.academic_subject_id=allocation.academic_subject_id
     and mapping.status='approved'
     and mapping.mapping_role='primary'
     and mapping.superseded_at is null
    join public.curriculum_assessment_items item
      on item.id=mapping.assessment_item_id
     and item.is_active
     and item.source_type='question_bank'
     and mapping.item_content_hash=item.content_hash
    join public.questions q
      on q.id::text=item.source_record_id
     and q.academic_subject_id=allocation.academic_subject_id
     and q.is_active
     and q.verification_status='verified'
     and q.analytics_eligible
     and q.current_content_hash=q.verified_content_hash
     and item.content_hash=q.verified_content_hash
     and allocation.grade_level::smallint=any(q.eligible_grade_levels)
    join public.curriculum_framework_versions framework
      on framework.id=mapping.framework_version_id
     and framework.status in ('published','retired')
     and framework.content_hash=mapping.curriculum_version_content_hash
    where allocation.curriculum_scope_id is not null
      and v_pool in ('all','brains_heist','school')
      and (
        (q.pool_scope='global'
          and q.content_origin='brain_heist'
          and q.owner_school_id is null
          and q.is_public
          and item.school_id is null
          and v_pool in ('all','brains_heist'))
        or
        (q.pool_scope='school'
          and q.content_origin='teacher'
          and q.owner_school_id=allocation.school_id
          and not q.is_public
          and item.school_id=allocation.school_id
          and v_pool in ('all','school'))
      )
      and not exists(
        select 1
        from private.registry_question_catalog_membership membership
        where membership.question_id=q.id
          and membership.question_content_hash=q.verified_content_hash
          and membership.academic_subject_id=allocation.academic_subject_id
          and membership.grade_level=allocation.grade_level::smallint
          and (membership.school_id is null or membership.school_id=allocation.school_id)
      )
      and (p_difficulty is null or q.difficulty=p_difficulty)
      and (p_topic is null or lower(trim(coalesce(q.topic_name,q.topic,'')))=lower(trim(p_topic)))
      and (
        p_search is null or trim(p_search)=''
        or to_tsvector(
          'simple'::regconfig,
          coalesce(q.question_text,'')||' '||
          coalesce(q.topic_name,'')||' '||
          coalesce(q.topic,'')||' '||
          coalesce(q.curriculum_strand,'')||' '||
          coalesce(q.curriculum_skill,'')||' '||
          coalesce(q.curriculum_subskill,'')
        ) @@ websearch_to_tsquery('simple'::regconfig,p_search)
      )
      and (
        p_cursor_created_at is null
        or coalesce(q.created_at,q.updated_at,'1970-01-01'::timestamptz)<p_cursor_created_at
        or (
          coalesce(q.created_at,q.updated_at,'1970-01-01'::timestamptz)=p_cursor_created_at
          and p_cursor_id is not null
          and q.id<p_cursor_id
        )
      )
    group by q.id,q.created_at,q.updated_at
    order by sort_created_at desc,q.id desc
    limit v_limit+1
  ),
  mine_candidates as materialized (
    select
      q.id,
      coalesce(q.created_at,q.updated_at,'1970-01-01'::timestamptz) sort_created_at,
      3 authority_priority
    from public.questions q
    where v_pool in ('all','mine')
      and q.is_active
      and q.pool_scope='teacher'
      and q.content_origin='teacher'
      and q.teacher_id=v_teacher
      and (
        p_subject is null
        or private.teacher_assignment_subject_key(q.subject)
          =private.teacher_assignment_subject_key(p_subject)
      )
      and (p_difficulty is null or q.difficulty=p_difficulty)
      and (p_topic is null or lower(trim(coalesce(q.topic_name,q.topic,'')))=lower(trim(p_topic)))
      and (
        p_search is null or trim(p_search)=''
        or to_tsvector(
          'simple'::regconfig,
          coalesce(q.question_text,'')||' '||
          coalesce(q.topic_name,'')||' '||
          coalesce(q.topic,'')||' '||
          coalesce(q.curriculum_strand,'')||' '||
          coalesce(q.curriculum_skill,'')||' '||
          coalesce(q.curriculum_subskill,'')
        ) @@ websearch_to_tsquery('simple'::regconfig,p_search)
      )
      and (
        p_cursor_created_at is null
        or coalesce(q.created_at,q.updated_at,'1970-01-01'::timestamptz)<p_cursor_created_at
        or (
          coalesce(q.created_at,q.updated_at,'1970-01-01'::timestamptz)=p_cursor_created_at
          and p_cursor_id is not null
          and q.id<p_cursor_id
        )
      )
    order by sort_created_at desc,q.id desc
    limit v_limit+1
  ),
  combined as (
    select * from registry_candidates
    union all
    select * from legacy_candidates
    union all
    select * from mine_candidates
  ),
  dedup as (
    select id,max(sort_created_at) sort_created_at,min(authority_priority) authority_priority
    from combined
    group by id
  ),
  page_plus_one as materialized (
    select *
    from dedup
    order by sort_created_at desc,id desc
    limit v_limit+1
  ),
  page as materialized (
    select *
    from page_plus_one
    order by sort_created_at desc,id desc
    limit v_limit
  ),
  payload as (
    select
      page.sort_created_at,
      q.id,
      jsonb_build_object(
        'id',q.id,
        'teacher_id',q.teacher_id,
        'subject',q.subject,
        'subject_id',q.subject_id,
        'topic',q.topic,
        'topic_name',q.topic_name,
        'difficulty',q.difficulty,
        'question_text',q.question_text,
        'image_url',q.image_url,
        'image_alt_text',q.image_alt_text,
        'question_type',q.question_type,
        'options',q.options,
        'correct_answer',q.correct_answer,
        'explanation',q.explanation,
        'hints',to_jsonb(q.hints),
        'time_limit',q.time_limit,
        'points',q.points,
        'tags',to_jsonb(q.tags),
        'grade_level',q.grade_level,
        'is_public',q.is_public,
        'is_active',q.is_active,
        'times_answered',q.times_answered,
        'times_correct',q.times_correct,
        'created_at',q.created_at,
        'updated_at',q.updated_at,
        'creator_name',case
          when q.pool_scope='global' then 'Brains Heist'
          else coalesce(user_row.username,'Teacher')
        end,
        'creator_school_id',case
          when q.pool_scope='global' then null
          when q.pool_scope='school' then q.owner_school_id
          else user_row.school_id
        end,
        'is_mine',q.pool_scope='teacher' and q.teacher_id=v_teacher,
        'content_origin',q.content_origin,
        'verification_status',q.verification_status,
        'analytics_eligible',q.analytics_eligible,
        'verified_at',q.verified_at,
        'verified_by',q.verified_by,
        'verified_by_authority',q.verified_by_authority,
        'verified_content_hash',q.verified_content_hash,
        'current_content_hash',q.current_content_hash,
        'content_version',q.content_version,
        'content_revision',q.content_revision,
        'eligible_grade_levels',to_jsonb(q.eligible_grade_levels),
        'pool_scope',q.pool_scope,
        'owner_school_id',q.owner_school_id,
        'academic_subject_id',q.academic_subject_id,
        'curriculum_strand',q.curriculum_strand,
        'curriculum_skill',q.curriculum_skill,
        'curriculum_subskill',q.curriculum_subskill,
        'curriculum_objective',q.curriculum_objective,
        'curriculum_review_status',q.curriculum_review_status,
        'catalog_authority',case page.authority_priority
          when 1 then 'registry'
          when 2 then 'curriculum'
          else 'teacher'
        end
      ) item
    from page
    join public.questions q on q.id=page.id
    left join public.teachers teacher on teacher.id=q.teacher_id
    left join public.users user_row on user_row.id=teacher.user_id
    order by page.sort_created_at desc,page.id desc
  )
  select
    coalesce(jsonb_agg(payload.item order by payload.sort_created_at desc,payload.id desc),'[]'::jsonb),
    exists(select 1 from page_plus_one offset v_limit limit 1),
    (select sort_created_at from page order by sort_created_at asc,id asc limit 1),
    (select id from page order by sort_created_at asc,id asc limit 1)
  into v_items,v_has_more,v_next_created_at,v_next_id
  from payload;

  return jsonb_build_object(
    'success',true,
    'items',v_items,
    'pageSize',v_limit,
    'hasMore',v_has_more,
    'nextCursor',case
      when v_has_more and v_next_id is not null then
        jsonb_build_object('createdAt',v_next_created_at,'id',v_next_id)
      else null
    end
  );
end;
$function$;

revoke all on function public.rpc_teacher_question_catalog_page(
  text,text,uuid,integer,timestamptz,uuid,text,text,text
) from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_question_catalog_page(
  text,text,uuid,integer,timestamptz,uuid,text,text,text
) to authenticated,service_role;

-- Exact-ID retrieval preserves selections when pages change and avoids loading the bank.
create or replace function public.rpc_teacher_question_catalog_by_ids(
  p_question_ids uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_actor uuid:=auth.uid();
  v_teacher uuid;
  v_school uuid;
  v_year uuid;
begin
  if v_actor is null then
    raise exception using errcode='42501',message='authentication_required';
  end if;

  select t.id into v_teacher from public.teachers t where t.user_id=v_actor;
  if v_teacher is null then
    raise exception using errcode='42501',message='teacher_required';
  end if;

  if coalesce(cardinality(p_question_ids),0)=0 then
    return jsonb_build_object('success',true,'items','[]'::jsonb);
  end if;
  if cardinality(p_question_ids)>200 then
    raise exception using errcode='22023',message='question_id_lookup_limit_exceeded';
  end if;

  select sm.school_id into v_school
  from public.school_members sm
  where sm.user_id=v_actor and sm.status='active'
  order by sm.joined_at desc nulls last,sm.id
  limit 1;
  if v_school is null then
    select u.school_id into v_school from public.users u where u.id=v_actor;
  end if;
  if v_school is not null then
    v_year:=public.academic_resolve_operational_year_id(v_school,now());
  end if;

  return jsonb_build_object(
    'success',true,
    'items',coalesce((
      with allocations as materialized (
        select distinct
          g.school_id,g.academic_subject_id,g.academic_year_id,g.grade_level,
          offering.curriculum_scope_id
        from private.teacher_current_teaching_groups(v_actor,v_school) g
        join public.school_subject_offerings offering
          on offering.school_id=g.school_id
         and offering.school_subject_id=g.school_subject_id
         and offering.academic_year_id=g.academic_year_id
         and offering.grade_level=g.grade_level
         and offering.status='active'
        where g.academic_subject_id is not null and g.grade_level~'^[0-9]+$'
      ),
      authorized as (
        select distinct q.id
        from public.questions q
        join allocations allocation
          on allocation.academic_subject_id=q.academic_subject_id
         and allocation.grade_level::smallint=any(q.eligible_grade_levels)
        where q.id=any(p_question_ids)
          and q.is_active
          and (
            exists(
              select 1
              from private.registry_question_catalog_membership membership
              where membership.question_id=q.id
                and membership.question_content_hash=q.verified_content_hash
                and membership.academic_subject_id=allocation.academic_subject_id
                and membership.grade_level=allocation.grade_level::smallint
                and (membership.school_id is null or membership.school_id=allocation.school_id)
            )
            or private.verified_question_has_curriculum_mapping(
              q.id,allocation.school_id,allocation.academic_year_id,
              allocation.grade_level,allocation.academic_subject_id
            )
          )

        union

        select q.id
        from public.questions q
        where q.id=any(p_question_ids)
          and q.is_active
          and q.pool_scope='teacher'
          and q.content_origin='teacher'
          and q.teacher_id=v_teacher
      )
      select jsonb_agg(
        jsonb_build_object(
          'id',q.id,'teacher_id',q.teacher_id,'subject',q.subject,'subject_id',q.subject_id,
          'topic',q.topic,'topic_name',q.topic_name,'difficulty',q.difficulty,
          'question_text',q.question_text,'image_url',q.image_url,'image_alt_text',q.image_alt_text,
          'question_type',q.question_type,'options',q.options,'correct_answer',q.correct_answer,
          'explanation',q.explanation,'hints',to_jsonb(q.hints),'time_limit',q.time_limit,
          'points',q.points,'tags',to_jsonb(q.tags),'grade_level',q.grade_level,
          'is_public',q.is_public,'is_active',q.is_active,'times_answered',q.times_answered,
          'times_correct',q.times_correct,'created_at',q.created_at,'updated_at',q.updated_at,
          'content_origin',q.content_origin,'verification_status',q.verification_status,
          'analytics_eligible',q.analytics_eligible,'verified_at',q.verified_at,
          'verified_by',q.verified_by,'verified_by_authority',q.verified_by_authority,
          'verified_content_hash',q.verified_content_hash,'current_content_hash',q.current_content_hash,
          'content_version',q.content_version,'content_revision',q.content_revision,
          'eligible_grade_levels',to_jsonb(q.eligible_grade_levels),'pool_scope',q.pool_scope,
          'owner_school_id',q.owner_school_id,'academic_subject_id',q.academic_subject_id,
          'curriculum_strand',q.curriculum_strand,'curriculum_skill',q.curriculum_skill,
          'curriculum_subskill',q.curriculum_subskill,'curriculum_objective',q.curriculum_objective,
          'curriculum_review_status',q.curriculum_review_status,
          'is_mine',q.pool_scope='teacher' and q.teacher_id=v_teacher
        )
        order by array_position(p_question_ids,q.id)
      )
      from authorized a
      join public.questions q on q.id=a.id
    ),'[]'::jsonb)
  );
end;
$function$;

revoke all on function public.rpc_teacher_question_catalog_by_ids(uuid[])
from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_question_catalog_by_ids(uuid[])
to authenticated,service_role;

-- ============================================================================
-- Student keyset-paged catalogue
-- ============================================================================

create or replace function public.rpc_student_question_catalog_page(
  p_subject_code text,
  p_difficulty text default null,
  p_page_size integer default 40,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_search text default null,
  p_topic text default null,
  p_pool text default 'all'
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_student uuid:=auth.uid();
  v_school uuid;
  v_year uuid;
  v_grade text;
  v_subject uuid;
  v_scope uuid;
  v_limit integer:=greatest(1,least(coalesce(p_page_size,40),100));
  v_pool text:=lower(trim(coalesce(p_pool,'all')));
  v_items jsonb:='[]'::jsonb;
  v_has_more boolean:=false;
  v_next_created_at timestamptz;
  v_next_id uuid;
begin
  if v_student is null then
    raise exception using errcode='42501',message='authentication_required';
  end if;
  if v_pool not in ('all','brains_heist','school') then
    raise exception using errcode='22023',message='invalid_student_question_catalog_pool';
  end if;

  select u.school_id into v_school from public.users u where u.id=v_student;
  if v_school is null then
    return jsonb_build_object('success',true,'ready',false,'code','school_required','items','[]'::jsonb);
  end if;

  select enrolment.academic_year_id,enrolment.grade_level
  into v_year,v_grade
  from public.student_academic_enrolments enrolment
  join public.school_academic_years academic_year
    on academic_year.id=enrolment.academic_year_id
   and academic_year.status='current'
  where enrolment.student_id=v_student
    and enrolment.school_id=v_school
    and current_date between enrolment.starts_on and coalesce(enrolment.ends_on,current_date)
  order by enrolment.starts_on desc,enrolment.created_at desc
  limit 1;

  if v_year is null or v_grade is null or v_grade !~ '^[0-9]+$' then
    return jsonb_build_object('success',true,'ready',false,'code','current_grade_enrolment_required','items','[]'::jsonb);
  end if;

  select
    subject.id,
    offering.curriculum_scope_id
  into v_subject,v_scope
  from public.school_subject_offerings offering
  join public.school_subjects school_subject
    on school_subject.id=offering.school_subject_id
   and school_subject.school_id=v_school
   and school_subject.is_active
  join public.academic_subjects subject
    on subject.id=school_subject.academic_subject_id
   and subject.is_active
  where offering.school_id=v_school
    and offering.academic_year_id=v_year
    and offering.grade_level=v_grade
    and offering.status='active'
    and (
      subject.code=public.academic_normalize_subject_key(p_subject_code)
      or subject.id::text=p_subject_code
      or private.teacher_assignment_subject_key(school_subject.name)
        =private.teacher_assignment_subject_key(p_subject_code)
    )
    and (
      offering.access_mode='all_grade'
      or exists(
        select 1
        from public.school_subject_enrolments subject_enrolment
        where subject_enrolment.student_id=v_student
          and subject_enrolment.school_subject_id=school_subject.id
          and subject_enrolment.academic_year_id=v_year
          and subject_enrolment.status='active'
          and current_date>=subject_enrolment.starts_on
          and (subject_enrolment.ends_on is null or current_date<=subject_enrolment.ends_on)
      )
    )
  order by offering.updated_at desc
  limit 1;

  if v_subject is null then
    return jsonb_build_object('success',true,'ready',true,'code','subject_not_enrolled','items','[]'::jsonb);
  end if;

  with registry_candidates as materialized (
    select
      q.id,
      coalesce(q.created_at,q.updated_at,'1970-01-01'::timestamptz) sort_created_at,
      1 authority_priority
    from private.registry_question_catalog_membership membership
    join public.questions q
      on q.id=membership.question_id
     and q.verified_content_hash=membership.question_content_hash
    where membership.academic_subject_id=v_subject
      and membership.grade_level=v_grade::smallint
      and (membership.school_id is null or membership.school_id=v_school)
      and (
        v_pool='all'
        or (v_pool='brains_heist' and membership.pool_scope='global')
        or (v_pool='school' and membership.pool_scope='school')
      )
      and (p_difficulty is null or q.difficulty=p_difficulty)
      and (p_topic is null or lower(trim(coalesce(q.topic_name,q.topic,'')))=lower(trim(p_topic)))
      and (
        p_search is null or trim(p_search)=''
        or to_tsvector(
          'simple'::regconfig,
          coalesce(q.question_text,'')||' '||
          coalesce(q.topic_name,'')||' '||
          coalesce(q.topic,'')||' '||
          coalesce(q.curriculum_strand,'')||' '||
          coalesce(q.curriculum_skill,'')||' '||
          coalesce(q.curriculum_subskill,'')
        ) @@ websearch_to_tsquery('simple'::regconfig,p_search)
      )
      and (
        p_cursor_created_at is null
        or coalesce(q.created_at,q.updated_at,'1970-01-01'::timestamptz)<p_cursor_created_at
        or (
          coalesce(q.created_at,q.updated_at,'1970-01-01'::timestamptz)=p_cursor_created_at
          and p_cursor_id is not null
          and q.id<p_cursor_id
        )
      )
    order by sort_created_at desc,q.id desc
    limit v_limit+1
  ),
  legacy_candidates as materialized (
    select
      q.id,
      coalesce(q.created_at,q.updated_at,'1970-01-01'::timestamptz) sort_created_at,
      2 authority_priority
    from public.curriculum_item_objective_mappings mapping
    join public.curriculum_assessment_items item
      on item.id=mapping.assessment_item_id
     and item.is_active
     and item.source_type='question_bank'
     and mapping.item_content_hash=item.content_hash
    join public.questions q
      on q.id::text=item.source_record_id
     and q.academic_subject_id=v_subject
     and q.is_active
     and q.verification_status='verified'
     and q.analytics_eligible
     and q.current_content_hash=q.verified_content_hash
     and item.content_hash=q.verified_content_hash
     and v_grade::smallint=any(q.eligible_grade_levels)
    join public.curriculum_framework_versions framework
      on framework.id=mapping.framework_version_id
     and framework.status in ('published','retired')
     and framework.content_hash=mapping.curriculum_version_content_hash
    where v_scope is not null
      and mapping.curriculum_scope_id=v_scope
      and mapping.academic_subject_id=v_subject
      and mapping.status='approved'
      and mapping.mapping_role='primary'
      and mapping.superseded_at is null
      and (
        (q.pool_scope='global'
          and q.content_origin='brain_heist'
          and q.owner_school_id is null
          and q.is_public
          and item.school_id is null
          and v_pool in ('all','brains_heist'))
        or
        (q.pool_scope='school'
          and q.content_origin='teacher'
          and q.owner_school_id=v_school
          and not q.is_public
          and item.school_id=v_school
          and v_pool in ('all','school'))
      )
      and not exists(
        select 1
        from private.registry_question_catalog_membership membership
        where membership.question_id=q.id
          and membership.question_content_hash=q.verified_content_hash
          and membership.academic_subject_id=v_subject
          and membership.grade_level=v_grade::smallint
          and (membership.school_id is null or membership.school_id=v_school)
      )
      and (p_difficulty is null or q.difficulty=p_difficulty)
      and (p_topic is null or lower(trim(coalesce(q.topic_name,q.topic,'')))=lower(trim(p_topic)))
      and (
        p_search is null or trim(p_search)=''
        or to_tsvector(
          'simple'::regconfig,
          coalesce(q.question_text,'')||' '||
          coalesce(q.topic_name,'')||' '||
          coalesce(q.topic,'')||' '||
          coalesce(q.curriculum_strand,'')||' '||
          coalesce(q.curriculum_skill,'')||' '||
          coalesce(q.curriculum_subskill,'')
        ) @@ websearch_to_tsquery('simple'::regconfig,p_search)
      )
      and (
        p_cursor_created_at is null
        or coalesce(q.created_at,q.updated_at,'1970-01-01'::timestamptz)<p_cursor_created_at
        or (
          coalesce(q.created_at,q.updated_at,'1970-01-01'::timestamptz)=p_cursor_created_at
          and p_cursor_id is not null
          and q.id<p_cursor_id
        )
      )
    group by q.id,q.created_at,q.updated_at
    order by sort_created_at desc,q.id desc
    limit v_limit+1
  ),
  combined as (
    select * from registry_candidates
    union all
    select * from legacy_candidates
  ),
  dedup as (
    select id,max(sort_created_at) sort_created_at,min(authority_priority) authority_priority
    from combined
    group by id
  ),
  page_plus_one as materialized (
    select *
    from dedup
    order by sort_created_at desc,id desc
    limit v_limit+1
  ),
  page as materialized (
    select *
    from page_plus_one
    order by sort_created_at desc,id desc
    limit v_limit
  ),
  payload as (
    select
      page.sort_created_at,
      q.id,
      jsonb_build_object(
        'id',q.id,'teacher_id',q.teacher_id,'subject',subject.name,'subject_id',subject.code,
        'topic',q.topic,'topic_name',q.topic_name,'difficulty',q.difficulty,
        'question_text',q.question_text,'image_url',q.image_url,'image_alt_text',q.image_alt_text,
        'question_type',q.question_type,'options',q.options,'correct_answer',q.correct_answer,
        'explanation',q.explanation,'hints',to_jsonb(q.hints),'time_limit',q.time_limit,
        'points',q.points,'tags',to_jsonb(q.tags),'grade_level',v_grade,
        'eligible_grade_levels',to_jsonb(q.eligible_grade_levels),'is_public',q.is_public,
        'is_active',q.is_active,'times_answered',q.times_answered,'times_correct',q.times_correct,
        'created_at',q.created_at,'updated_at',q.updated_at,'content_origin',q.content_origin,
        'pool_scope',q.pool_scope,'owner_school_id',q.owner_school_id,
        'verification_status',q.verification_status,'analytics_eligible',q.analytics_eligible,
        'curriculum_strand',q.curriculum_strand,'curriculum_skill',q.curriculum_skill,
        'curriculum_subskill',q.curriculum_subskill,'curriculum_objective',q.curriculum_objective,
        'curriculum_review_status',q.curriculum_review_status,
        'catalog_authority',case page.authority_priority when 1 then 'registry' else 'curriculum' end
      ) item
    from page
    join public.questions q on q.id=page.id
    join public.academic_subjects subject on subject.id=q.academic_subject_id
    order by page.sort_created_at desc,page.id desc
  )
  select
    coalesce(jsonb_agg(payload.item order by payload.sort_created_at desc,payload.id desc),'[]'::jsonb),
    exists(select 1 from page_plus_one offset v_limit limit 1),
    (select sort_created_at from page order by sort_created_at asc,id asc limit 1),
    (select id from page order by sort_created_at asc,id asc limit 1)
  into v_items,v_has_more,v_next_created_at,v_next_id
  from payload;

  return jsonb_build_object(
    'success',true,
    'ready',true,
    'academicYearId',v_year,
    'gradeLevel',v_grade,
    'academicSubjectId',v_subject,
    'scopeId',v_scope,
    'items',v_items,
    'pageSize',v_limit,
    'hasMore',v_has_more,
    'nextCursor',case
      when v_has_more and v_next_id is not null then
        jsonb_build_object('createdAt',v_next_created_at,'id',v_next_id)
      else null
    end
  );
end;
$function$;

revoke all on function public.rpc_student_question_catalog_page(
  text,text,integer,timestamptz,uuid,text,text,text
) from public,anon,authenticated,service_role;
grant execute on function public.rpc_student_question_catalog_page(
  text,text,integer,timestamptz,uuid,text,text,text
) to authenticated,service_role;

-- ============================================================================
-- Compatibility: make the established teacher RPC registry-aware now.
-- New browser code uses keyset pagination above; this wrapper remains for older
-- internal consumers while they migrate.
-- ============================================================================

create or replace function public.get_all_active_questions(
  p_subject text default null,
  p_difficulty text default null,
  p_teacher_id uuid default null,
  p_limit integer default 500,
  p_offset integer default 0
)
returns table(
  id uuid,teacher_id uuid,subject text,subject_id text,topic text,topic_name text,
  difficulty text,question_text text,image_url text,image_alt_text text,question_type text,
  options jsonb,correct_answer text,explanation text,hints text[],time_limit integer,
  points integer,tags text[],grade_level text,is_public boolean,is_active boolean,
  times_answered integer,times_correct integer,created_at timestamptz,updated_at timestamptz,
  creator_name text,creator_school_id uuid,is_mine boolean,content_origin text,
  verification_status text,analytics_eligible boolean,verified_at timestamptz,verified_by uuid,
  verified_by_authority text,verified_content_hash text,current_content_hash text,
  content_version text,content_revision integer,eligible_grade_levels smallint[],
  pool_scope text,owner_school_id uuid
)
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_requested integer:=greatest(1,least(coalesce(p_limit,500),1000));
  v_skip integer:=greatest(coalesce(p_offset,0),0);
  v_cursor_created_at timestamptz:=null;
  v_cursor_id uuid:=null;
  v_page jsonb;
  v_item jsonb;
  v_items jsonb:='[]'::jsonb;
  v_taken integer:=0;
begin
  -- Compatibility only. Browser surfaces use rpc_teacher_question_catalog_page
  -- directly, so total bank size never dictates initial payload.
  loop
    exit when v_taken>=v_requested;

    v_page:=public.rpc_teacher_question_catalog_page(
      p_subject,p_difficulty,p_teacher_id,100,
      v_cursor_created_at,v_cursor_id,null,null,'all'
    );

    for v_item in
      select value from jsonb_array_elements(coalesce(v_page->'items','[]'::jsonb))
    loop
      if v_skip>0 then
        v_skip:=v_skip-1;
      elsif v_taken<v_requested then
        v_items:=v_items||jsonb_build_array(v_item);
        v_taken:=v_taken+1;
      end if;
    end loop;

    exit when coalesce((v_page->>'hasMore')::boolean,false) is false;
    exit when v_page->'nextCursor' is null;

    v_cursor_created_at:=(v_page->'nextCursor'->>'createdAt')::timestamptz;
    v_cursor_id:=(v_page->'nextCursor'->>'id')::uuid;
  end loop;

  return query
  select
    (item->>'id')::uuid,
    nullif(item->>'teacher_id','')::uuid,
    item->>'subject',
    item->>'subject_id',
    item->>'topic',
    item->>'topic_name',
    item->>'difficulty',
    item->>'question_text',
    item->>'image_url',
    item->>'image_alt_text',
    item->>'question_type',
    item->'options',
    item->>'correct_answer',
    item->>'explanation',
    case when jsonb_typeof(item->'hints')='array'
      then array(select jsonb_array_elements_text(item->'hints')) else null end,
    nullif(item->>'time_limit','')::integer,
    nullif(item->>'points','')::integer,
    case when jsonb_typeof(item->'tags')='array'
      then array(select jsonb_array_elements_text(item->'tags')) else null end,
    item->>'grade_level',
    coalesce((item->>'is_public')::boolean,false),
    coalesce((item->>'is_active')::boolean,false),
    nullif(item->>'times_answered','')::integer,
    nullif(item->>'times_correct','')::integer,
    nullif(item->>'created_at','')::timestamptz,
    nullif(item->>'updated_at','')::timestamptz,
    item->>'creator_name',
    nullif(item->>'creator_school_id','')::uuid,
    coalesce((item->>'is_mine')::boolean,false),
    item->>'content_origin',
    item->>'verification_status',
    coalesce((item->>'analytics_eligible')::boolean,false),
    nullif(item->>'verified_at','')::timestamptz,
    nullif(item->>'verified_by','')::uuid,
    item->>'verified_by_authority',
    item->>'verified_content_hash',
    item->>'current_content_hash',
    item->>'content_version',
    nullif(item->>'content_revision','')::integer,
    case when jsonb_typeof(item->'eligible_grade_levels')='array'
      then array(select value::smallint from jsonb_array_elements_text(item->'eligible_grade_levels') value)
      else '{}'::smallint[] end,
    item->>'pool_scope',
    nullif(item->>'owner_school_id','')::uuid
  from jsonb_array_elements(v_items) item;
end;
$function$;

revoke all on function public.get_all_active_questions(text,text,uuid,integer,integer)
from public,anon,authenticated,service_role;
grant execute on function public.get_all_active_questions(text,text,uuid,integer,integer)
to authenticated,service_role;

comment on function public.rpc_teacher_question_catalog_page(
  text,text,uuid,integer,timestamptz,uuid,text,text,text
) is
  'Keyset-paged governed teacher question catalogue. Uses teacher allocation + grade and accepts either legacy curriculum authority or registry-native verified taxonomy authority.';

comment on function public.rpc_student_question_catalog_page(
  text,text,integer,timestamptz,uuid,text,text,text
) is
  'Keyset-paged student question catalogue. Uses current school subject/grade access and either legacy curriculum authority or registry-native verified taxonomy authority.';

-- ============================================================================
-- Invariants
-- ============================================================================

do $migration$
declare
  v_economics uuid;
  v_economics_registry_rows integer;
begin
  select id into v_economics from public.academic_subjects
  where code='economics' and is_active;

  if v_economics is not null then
    select count(*) into v_economics_registry_rows
    from private.registry_question_catalog_membership
    where academic_subject_id=v_economics and grade_level=10;

    if v_economics_registry_rows<40 then
      raise exception 'registry_question_catalog_economics_backfill_incomplete rows=%',
        v_economics_registry_rows;
    end if;
  end if;

  if has_function_privilege(
       'anon',
       'public.rpc_teacher_question_catalog_page(text,text,uuid,integer,timestamp with time zone,uuid,text,text,text)',
       'EXECUTE'
     ) then
    raise exception 'teacher_question_catalog_page_anon_execute_exposed';
  end if;

  if not has_function_privilege(
       'authenticated',
       'public.rpc_teacher_question_catalog_page(text,text,uuid,integer,timestamp with time zone,uuid,text,text,text)',
       'EXECUTE'
     ) then
    raise exception 'teacher_question_catalog_page_authenticated_execute_missing';
  end if;
end;
$migration$;


-- ============================================================================
-- Student progress summary: counts only, never hydrates the bank
-- ============================================================================

create or replace function public.rpc_student_question_progress_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_student uuid:=auth.uid();
  v_school uuid;
  v_year uuid;
  v_grade text;
begin
  if v_student is null then
    raise exception using errcode='42501',message='authentication_required';
  end if;

  select u.school_id into v_school from public.users u where u.id=v_student;
  if v_school is null then
    return jsonb_build_object('success',true,'ready',false,'subjects','[]'::jsonb);
  end if;

  select enrolment.academic_year_id,enrolment.grade_level
  into v_year,v_grade
  from public.student_academic_enrolments enrolment
  join public.school_academic_years academic_year
    on academic_year.id=enrolment.academic_year_id
   and academic_year.status='current'
  where enrolment.student_id=v_student
    and enrolment.school_id=v_school
    and current_date between enrolment.starts_on and coalesce(enrolment.ends_on,current_date)
  order by enrolment.starts_on desc,enrolment.created_at desc
  limit 1;

  if v_year is null or v_grade is null or v_grade !~ '^[0-9]+$' then
    return jsonb_build_object('success',true,'ready',false,'subjects','[]'::jsonb);
  end if;

  return jsonb_build_object(
    'success',true,
    'ready',true,
    'academicYearId',v_year,
    'gradeLevel',v_grade,
    'subjects',coalesce((
      with enrolled_subjects as materialized (
        select
          subject.id academic_subject_id,
          subject.code,
          school_subject.name,
          offering.curriculum_scope_id
        from public.school_subject_offerings offering
        join public.school_subjects school_subject
          on school_subject.id=offering.school_subject_id
         and school_subject.school_id=v_school
         and school_subject.is_active
        join public.academic_subjects subject
          on subject.id=school_subject.academic_subject_id
         and subject.is_active
        where offering.school_id=v_school
          and offering.academic_year_id=v_year
          and offering.grade_level=v_grade
          and offering.status='active'
          and (
            offering.access_mode='all_grade'
            or exists(
              select 1
              from public.school_subject_enrolments subject_enrolment
              where subject_enrolment.student_id=v_student
                and subject_enrolment.school_subject_id=school_subject.id
                and subject_enrolment.academic_year_id=v_year
                and subject_enrolment.status='active'
                and current_date>=subject_enrolment.starts_on
                and (subject_enrolment.ends_on is null or current_date<=subject_enrolment.ends_on)
            )
          )
      ),
      attempted as materialized (
        select distinct attempt.question_id
        from public.question_attempts attempt
        where attempt.student_id=v_student
      ),
      completed as (
        select
          enrolled.academic_subject_id,
          case when q.difficulty='med' then 'medium' else q.difficulty end difficulty,
          count(distinct q.id)::integer completed_count
        from enrolled_subjects enrolled
        join attempted attempt on true
        join public.questions q
          on q.id=attempt.question_id
         and q.academic_subject_id=enrolled.academic_subject_id
         and q.is_active
         and q.verification_status='verified'
         and q.analytics_eligible
         and q.current_content_hash=q.verified_content_hash
         and v_grade::smallint=any(q.eligible_grade_levels)
        where
          exists(
            select 1
            from private.registry_question_catalog_membership membership
            where membership.question_id=q.id
              and membership.question_content_hash=q.verified_content_hash
              and membership.academic_subject_id=enrolled.academic_subject_id
              and membership.grade_level=v_grade::smallint
              and (membership.school_id is null or membership.school_id=v_school)
          )
          or (
            enrolled.curriculum_scope_id is not null
            and exists(
              select 1
              from public.curriculum_assessment_items item
              join public.curriculum_item_objective_mappings mapping
                on mapping.assessment_item_id=item.id
               and mapping.curriculum_scope_id=enrolled.curriculum_scope_id
               and mapping.academic_subject_id=enrolled.academic_subject_id
               and mapping.status='approved'
               and mapping.mapping_role='primary'
               and mapping.superseded_at is null
               and mapping.item_content_hash=item.content_hash
              join public.curriculum_framework_versions framework
                on framework.id=mapping.framework_version_id
               and framework.status in ('published','retired')
               and framework.content_hash=mapping.curriculum_version_content_hash
              where item.source_type='question_bank'
                and item.source_record_id=q.id::text
                and item.source_item_key='question'
                and item.is_active
                and item.content_hash=q.verified_content_hash
            )
          )
        group by enrolled.academic_subject_id,
          case when q.difficulty='med' then 'medium' else q.difficulty end
      ),
      completed_pivot as (
        select
          academic_subject_id,
          coalesce(sum(completed_count),0)::integer answered_count,
          coalesce(sum(completed_count) filter(where difficulty='easy'),0)::integer easy_completed,
          coalesce(sum(completed_count) filter(where difficulty='medium'),0)::integer medium_completed,
          coalesce(sum(completed_count) filter(where difficulty='hard'),0)::integer hard_completed
        from completed
        group by academic_subject_id
      ),
      subject_summary as (
        select
          enrolled.academic_subject_id,
          enrolled.code,
          enrolled.name,
          enrolled.curriculum_scope_id,
          coalesce(completed_pivot.answered_count,0)::integer answered_count,
          coalesce(completed_pivot.easy_completed,0)::integer easy_completed,
          coalesce(completed_pivot.medium_completed,0)::integer medium_completed,
          coalesce(completed_pivot.hard_completed,0)::integer hard_completed,
          private.governed_question_count_for_context(
            v_school,v_year,v_grade,enrolled.academic_subject_id,
            enrolled.curriculum_scope_id,null
          ) total_available,
          private.governed_question_count_for_context(
            v_school,v_year,v_grade,enrolled.academic_subject_id,
            enrolled.curriculum_scope_id,'easy'
          ) easy_total,
          private.governed_question_count_for_context(
            v_school,v_year,v_grade,enrolled.academic_subject_id,
            enrolled.curriculum_scope_id,'medium'
          )
          + private.governed_question_count_for_context(
            v_school,v_year,v_grade,enrolled.academic_subject_id,
            enrolled.curriculum_scope_id,'med'
          ) medium_total,
          private.governed_question_count_for_context(
            v_school,v_year,v_grade,enrolled.academic_subject_id,
            enrolled.curriculum_scope_id,'hard'
          ) hard_total
        from enrolled_subjects enrolled
        left join completed_pivot
          on completed_pivot.academic_subject_id=enrolled.academic_subject_id
      )
      select jsonb_agg(
        jsonb_build_object(
          'id','subj_'||replace(summary.code,'-','_'),
          'code',summary.code,
          'name',summary.name,
          'answeredCount',summary.answered_count,
          'totalAvailable',summary.total_available,
          'difficulties',jsonb_build_object(
            'easy',jsonb_build_object(
              'total',summary.easy_total,
              'completed',summary.easy_completed
            ),
            'medium',jsonb_build_object(
              'total',summary.medium_total,
              'completed',summary.medium_completed
            ),
            'hard',jsonb_build_object(
              'total',summary.hard_total,
              'completed',summary.hard_completed
            )
          )
        )
        order by summary.name
      )
      from subject_summary summary
    ),'[]'::jsonb)
  );
end;
$function$;

revoke all on function public.rpc_student_question_progress_summary()
from public,anon,authenticated,service_role;
grant execute on function public.rpc_student_question_progress_summary()
to authenticated,service_role;

comment on function public.rpc_student_question_progress_summary() is
  'Current-student governed question progress summary. Counts catalogue membership and the student own attempted IDs without loading question-bank payloads.';


-- ============================================================================
-- Subject catalog counts use the same governed authority as question loading
-- ============================================================================

create or replace function public.rpc_student_academic_subjects(
  p_student_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_caller uuid:=auth.uid();
  v_student uuid:=coalesce(p_student_id,auth.uid());
  v_school uuid;
  v_year uuid;
  v_grade text;
  v_teacher uuid;
begin
  if v_caller is null then
    raise exception using errcode='42501',message='authentication_required';
  end if;

  -- Teacher self-view: expose allocated school subjects. A legacy curriculum
  -- scope is optional because registry-native governed banks do not require one.
  if v_student=v_caller then
    select t.id into v_teacher from public.teachers t where t.user_id=v_caller;
    if v_teacher is not null then
      select sm.school_id into v_school
      from public.school_members sm
      where sm.user_id=v_caller and sm.status='active'
      order by sm.joined_at desc nulls last,sm.id
      limit 1;
      if v_school is null then
        select u.school_id into v_school from public.users u where u.id=v_caller;
      end if;

      if v_school is not null and (
        exists(select 1 from private.teacher_current_teaching_groups(v_caller,v_school))
        or exists(
          select 1 from public.class_teacher_assignments cta
          where cta.teacher_user_id=v_caller
            and cta.school_id=v_school
            and cta.active
        )
      ) then
        v_year:=public.academic_resolve_operational_year_id(v_school,now());

        return jsonb_build_object(
          'success',true,
          'ready',true,
          'academicYearId',v_year,
          'gradeLevel',null,
          'subjects',coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id',ss.id,
                'schoolSubjectId',ss.id,
                'code',coalesce(nullif(ss.code,''),public.academic_normalize_subject_key(ss.name)),
                'name',ss.name,
                'canonicalName',academic.name,
                'academicSubjectId',ss.academic_subject_id,
                'mappingStatus',case when ss.academic_subject_id is null then 'unmapped' else 'mapped' end,
                'requirement','teacher_allocation',
                'scopeId',offering.curriculum_scope_id,
                'approvedQuestionCount',case
                  when ss.academic_subject_id is null or offering.grade_level is null then 0
                  else private.governed_question_count_for_context(
                    v_school,
                    v_year,
                    offering.grade_level,
                    ss.academic_subject_id,
                    offering.curriculum_scope_id,
                    null
                  )
                end
              )
              order by ss.name
            )
            from (
              select distinct g.school_subject_id
              from private.teacher_current_teaching_groups(v_caller,v_school) g

              union

              select distinct cta.school_subject_id
              from public.class_teacher_assignments cta
              where cta.teacher_user_id=v_caller
                and cta.school_id=v_school
                and cta.active
                and cta.school_subject_id is not null
                and not exists(
                  select 1 from private.teacher_current_teaching_groups(v_caller,v_school)
                )
            ) allocated
            join public.school_subjects ss
              on ss.id=allocated.school_subject_id
             and ss.is_active
            left join public.academic_subjects academic
              on academic.id=ss.academic_subject_id
             and academic.is_active
            left join lateral (
              select so.curriculum_scope_id,so.grade_level
              from public.school_subject_offerings so
              where so.school_subject_id=ss.id
                and so.status='active'
                and (v_year is null or so.academic_year_id=v_year)
              order by so.updated_at desc,so.id
              limit 1
            ) offering on true
          ),'[]'::jsonb)
        );
      end if;
    end if;
  end if;

  select u.school_id into v_school from public.users u where u.id=v_student;
  if v_school is null then
    return jsonb_build_object(
      'success',true,'ready',false,'code','school_required','subjects','[]'::jsonb
    );
  end if;

  if v_caller<>v_student and not(
    public.can_administer_school(v_school)
    or public.is_school_owner(v_school)
    or exists(
      select 1
      from private.teacher_current_teaching_roster(v_caller,v_school) r
      where r.student_id=v_student
    )
    or (
      not exists(select 1 from private.teacher_current_teaching_groups(v_caller,v_school))
      and exists(
        select 1
        from public.class_students cs
        join public.class_teacher_assignments cta
          on cta.class_id=cs.class_id
         and cta.active
        where cs.student_id=v_student
          and cta.teacher_user_id=v_caller
          and cta.school_id=v_school
      )
    )
  ) then
    raise exception using errcode='42501',message='student_academic_subject_access_denied';
  end if;

  select ae.academic_year_id,ae.grade_level
  into v_year,v_grade
  from public.student_academic_enrolments ae
  join public.school_academic_years y
    on y.id=ae.academic_year_id
   and y.status='current'
  where ae.student_id=v_student
    and ae.school_id=v_school
    and current_date between ae.starts_on and coalesce(ae.ends_on,current_date)
  order by ae.starts_on desc,ae.created_at desc
  limit 1;

  if v_year is null or v_grade is null then
    return jsonb_build_object(
      'success',true,'ready',false,'code','current_grade_enrolment_required','subjects','[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'success',true,
    'ready',true,
    'academicYearId',v_year,
    'gradeLevel',v_grade,
    'subjects',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',ss.id,
          'schoolSubjectId',ss.id,
          'code',coalesce(nullif(ss.code,''),public.academic_normalize_subject_key(ss.name)),
          'name',ss.name,
          'canonicalName',academic.name,
          'academicSubjectId',ss.academic_subject_id,
          'mappingStatus',case when ss.academic_subject_id is null then 'unmapped' else 'mapped' end,
          'requirement',offering.access_mode,
          'scopeId',offering.curriculum_scope_id,
          'approvedQuestionCount',case
            when ss.academic_subject_id is null then 0
            else private.governed_question_count_for_context(
              v_school,
              v_year,
              v_grade,
              ss.academic_subject_id,
              offering.curriculum_scope_id,
              null
            )
          end
        )
        order by ss.name
      )
      from public.school_subject_offerings offering
      join public.school_subjects ss
        on ss.id=offering.school_subject_id
       and ss.school_id=v_school
       and ss.is_active
      left join public.academic_subjects academic
        on academic.id=ss.academic_subject_id
       and academic.is_active
      where offering.school_id=v_school
        and offering.academic_year_id=v_year
        and offering.grade_level=v_grade
        and offering.status='active'
        and (
          offering.access_mode='all_grade'
          or exists(
            select 1
            from public.school_subject_enrolments e
            where e.student_id=v_student
              and e.school_subject_id=ss.id
              and e.academic_year_id=v_year
              and e.status='active'
              and current_date>=e.starts_on
              and (e.ends_on is null or current_date<=e.ends_on)
          )
        )
    ),'[]'::jsonb)
  );
end;
$function$;

revoke all on function public.rpc_student_academic_subjects(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_student_academic_subjects(uuid)
to authenticated,service_role;

create or replace function public.rpc_student_academic_subjects_for_year(
  p_student_id uuid,
  p_academic_year_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_caller uuid:=auth.uid();
  v_student uuid:=coalesce(p_student_id,auth.uid());
  v_school uuid;
  v_operational_year uuid;
  v_is_admin boolean:=false;
  v_is_current_teacher boolean:=false;
  v_is_historical_teacher boolean:=false;
  v_grade text;
begin
  if v_caller is null then
    raise exception using errcode='42501',message='authentication_required';
  end if;

  select u.school_id into v_school from public.users u where u.id=v_student;
  if v_school is null then
    return jsonb_build_object('success',true,'ready',false,'code','school_required','subjects','[]'::jsonb);
  end if;

  v_is_admin:=public.can_administer_school(v_school) or public.is_school_owner(v_school);
  if v_caller=v_student or v_is_admin then
    return private.student_academic_subjects_for_year_legacy_group_transition(
      v_student,p_academic_year_id
    );
  end if;

  v_operational_year:=public.academic_resolve_operational_year_id(v_school,now());
  v_is_current_teacher:=p_academic_year_id=v_operational_year and exists(
    select 1
    from private.teacher_current_teaching_roster(v_caller,v_school) r
    where r.student_id=v_student
  );
  v_is_historical_teacher:=p_academic_year_id is distinct from v_operational_year and exists(
    select 1
    from private.teacher_historical_teaching_roster(
      v_caller,v_school,p_academic_year_id
    ) r
    where r.student_id=v_student
  );

  if v_is_current_teacher then
    select max(r.grade_level)
    into v_grade
    from private.teacher_current_teaching_roster(v_caller,v_school) r
    where r.student_id=v_student;

    return jsonb_build_object(
      'success',true,
      'ready',true,
      'academicYearId',p_academic_year_id,
      'gradeLevel',v_grade,
      'subjects',coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id',r.school_subject_id,
            'schoolSubjectId',r.school_subject_id,
            'code',coalesce(r.academic_subject_code,public.academic_normalize_subject_key(r.school_subject_name)),
            'name',r.school_subject_name,
            'canonicalName',r.academic_subject_name,
            'academicSubjectId',r.academic_subject_id,
            'mappingStatus',case when r.academic_subject_id is null then 'unmapped' else 'mapped' end,
            'requirement','teacher_allocation',
            'scopeId',offering.curriculum_scope_id,
            'approvedQuestionCount',case
              when r.academic_subject_id is null then 0
              else private.governed_question_count_for_context(
                v_school,
                p_academic_year_id,
                v_grade,
                r.academic_subject_id,
                offering.curriculum_scope_id,
                null
              )
            end
          )
          order by r.school_subject_name
        )
        from (
          select distinct
            school_subject_id,school_subject_name,academic_subject_id,
            academic_subject_name,academic_subject_code
          from private.teacher_current_teaching_roster(v_caller,v_school)
          where student_id=v_student
        ) r
        left join lateral (
          select so.curriculum_scope_id
          from public.school_subject_offerings so
          where so.school_id=v_school
            and so.school_subject_id=r.school_subject_id
            and so.academic_year_id=p_academic_year_id
            and so.grade_level=v_grade
            and so.status='active'
          order by so.updated_at desc,so.id
          limit 1
        ) offering on true
      ),'[]'::jsonb)
    );
  end if;

  if v_is_historical_teacher then
    select max(r.grade_level)
    into v_grade
    from private.teacher_historical_teaching_roster(
      v_caller,v_school,p_academic_year_id
    ) r
    where r.student_id=v_student;

    return jsonb_build_object(
      'success',true,
      'ready',true,
      'academicYearId',p_academic_year_id,
      'gradeLevel',v_grade,
      'subjects',coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id',r.school_subject_id,
            'schoolSubjectId',r.school_subject_id,
            'code',coalesce(r.academic_subject_code,public.academic_normalize_subject_key(r.school_subject_name)),
            'name',r.school_subject_name,
            'canonicalName',r.academic_subject_name,
            'academicSubjectId',r.academic_subject_id,
            'mappingStatus',case when r.academic_subject_id is null then 'unmapped' else 'mapped' end,
            'requirement','historical_teacher_allocation',
            'scopeId',null,
            'approvedQuestionCount',0
          )
          order by r.school_subject_name
        )
        from (
          select distinct
            school_subject_id,school_subject_name,academic_subject_id,
            academic_subject_name,academic_subject_code
          from private.teacher_historical_teaching_roster(
            v_caller,v_school,p_academic_year_id
          )
          where student_id=v_student
        ) r
      ),'[]'::jsonb)
    );
  end if;

  return private.student_academic_subjects_for_year_legacy_group_transition(
    v_student,p_academic_year_id
  );
end;
$function$;

revoke all on function public.rpc_student_academic_subjects_for_year(uuid,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_student_academic_subjects_for_year(uuid,uuid)
to authenticated,service_role;


-- ============================================================================
-- Compatibility student/teacher learning catalogue delegates to paged authority
-- ============================================================================

create or replace function public.rpc_student_learning_catalog(
  p_subject_code text default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_actor uuid:=auth.uid();
  v_teacher uuid;
  v_page jsonb;
  v_limit integer:=greatest(1,least(coalesce(p_limit,20),100));
begin
  if v_actor is null then
    raise exception using errcode='42501',message='authentication_required';
  end if;

  select t.id into v_teacher from public.teachers t where t.user_id=v_actor;

  if v_teacher is not null then
    v_page:=public.rpc_teacher_question_catalog_page(
      p_subject_code,null,v_teacher,v_limit,null,null,null,null,'all'
    );
    return jsonb_build_object(
      'success',coalesce((v_page->>'success')::boolean,true),
      'ready',true,
      'academicYearId',null,
      'gradeLevel',null,
      'scopeId',null,
      'questions',coalesce(v_page->'items','[]'::jsonb)
    );
  end if;

  v_page:=public.rpc_student_question_catalog_page(
    p_subject_code,null,v_limit,null,null,null,null,'all'
  );

  return jsonb_build_object(
    'success',coalesce((v_page->>'success')::boolean,true),
    'ready',coalesce((v_page->>'ready')::boolean,true),
    'code',v_page->>'code',
    'academicYearId',v_page->'academicYearId',
    'gradeLevel',v_page->'gradeLevel',
    'scopeId',v_page->'scopeId',
    'questions',coalesce(v_page->'items','[]'::jsonb)
  );
end;
$function$;

revoke all on function public.rpc_student_learning_catalog(text,integer)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_student_learning_catalog(text,integer)
to authenticated,service_role;

comment on function public.rpc_student_learning_catalog(text,integer) is
  'Compatibility wrapper over the unified paged governed question catalogue. New interactive clients use cursor RPCs directly.';
