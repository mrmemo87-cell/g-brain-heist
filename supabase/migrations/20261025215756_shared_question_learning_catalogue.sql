-- Shared derived learning catalogue. It is not a permission grant or source of content.
-- Teachers, school membership, current year, allocations, pools, grades, hashes,
-- filtering, pagination and assignment validation keep their existing live checks.
-- A dirty catalogue immediately falls back to the original authoritative query.
create table private.question_learning_catalogue_state (
 singleton boolean primary key default true check(singleton),
 revision bigint not null default 1,
 built_revision bigint not null default 0,
 built_at timestamptz,
 question_count integer not null default 0
);
insert into private.question_learning_catalogue_state(singleton) values(true);
create table private.question_learning_catalogue (
 question_id uuid primary key references public.questions(id) on delete cascade,
 question_content_hash text not null,
 registry_ready boolean not null,
 curriculum_scope_ids uuid[] not null default '{}'
);
alter table private.question_learning_catalogue_state enable row level security;
alter table private.question_learning_catalogue enable row level security;
revoke all on table private.question_learning_catalogue_state,private.question_learning_catalogue from public,anon,authenticated,service_role;

create or replace function private.invalidate_question_learning_catalogue()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
 update private.question_learning_catalogue_state set revision=revision+1 where singleton;
 return null;
end;
$function$;
revoke all on function private.invalidate_question_learning_catalogue() from public,anon,authenticated,service_role;

create or replace function private.refresh_question_learning_catalogue()
returns integer language plpgsql security definer set search_path='' as $function$
declare v_revision bigint; v_count integer;
begin
 if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('question-learning-catalogue',0)) then return 0; end if;
 select revision into v_revision from private.question_learning_catalogue_state
 where singleton and revision<>built_revision;
 if not found then return 0; end if;
 delete from private.question_learning_catalogue;
 insert into private.question_learning_catalogue(question_id,question_content_hash,registry_ready,curriculum_scope_ids)
 select q.id,q.verified_content_hash,
   exists(select 1 from public.verified_question_registry_taxonomy tx
     join public.academic_skill_registry_versions rv on rv.id=tx.registry_version_id and rv.status='published'
     join public.academic_skill_registry_nodes skill on skill.id=tx.primary_skill_node_id and skill.registry_version_id=rv.id and skill.node_type='skill' and skill.status='active'
     join public.academic_skill_registry_nodes subskill on subskill.id=tx.atomic_subskill_node_id and subskill.registry_version_id=rv.id and subskill.parent_id=skill.id and subskill.node_type='subskill' and subskill.status='active'
     join public.academic_skill_evidence_focuses focus on focus.id=tx.evidence_focus_id and focus.registry_version_id=rv.id and focus.atomic_subskill_node_id=subskill.id and focus.status='active'
     where tx.question_id=q.id and tx.question_content_hash=q.verified_content_hash
       and tx.review_status='approved' and not tx.human_review_required
       and private.academic_registry_subject_matches(rv.id,academic.name)),
   array(select distinct im.curriculum_scope_id
     from public.curriculum_assessment_items item
     join public.curriculum_item_objective_mappings im on im.assessment_item_id=item.id
     join public.curriculum_framework_versions fv on fv.id=im.framework_version_id
     where item.source_type='question_bank' and item.source_record_id=q.id::text
       and item.source_item_key='question' and item.is_active and item.content_hash=q.verified_content_hash
       and ((q.pool_scope='global' and item.school_id is null) or (q.pool_scope='school' and item.school_id=q.owner_school_id))
       and im.academic_subject_id=q.academic_subject_id and im.status='approved' and im.mapping_role='primary'
       and im.superseded_at is null and im.item_content_hash=item.content_hash
       and fv.status in ('published','retired') and fv.content_hash=im.curriculum_version_content_hash)
 from public.questions q join public.academic_subjects academic on academic.id=q.academic_subject_id
 where q.is_active and q.verification_status='verified' and q.analytics_eligible
   and q.current_content_hash=q.verified_content_hash and q.pool_scope in ('global','school');
 get diagnostics v_count=row_count;
 -- If a dependency committed while this build ran, revision is newer than
 -- v_revision. Leave it dirty: readers fall back until the next successful build.
 update private.question_learning_catalogue_state
 set built_revision=v_revision,built_at=clock_timestamp(),question_count=v_count where singleton;
 return v_count;
end;
$function$;
revoke all on function private.refresh_question_learning_catalogue() from public,anon,authenticated,service_role;

create trigger invalidate_learning_catalogue after insert or update or delete or truncate on public.verified_question_registry_taxonomy
for each statement execute function private.invalidate_question_learning_catalogue();
create trigger invalidate_learning_catalogue after insert or update or delete or truncate on public.academic_skill_registry_versions
for each statement execute function private.invalidate_question_learning_catalogue();
create trigger invalidate_learning_catalogue after insert or update or delete or truncate on public.academic_skill_registry_nodes
for each statement execute function private.invalidate_question_learning_catalogue();
create trigger invalidate_learning_catalogue after insert or update or delete or truncate on public.academic_skill_evidence_focuses
for each statement execute function private.invalidate_question_learning_catalogue();
create trigger invalidate_learning_catalogue after insert or update or delete or truncate on public.academic_skill_registry_subject_aliases
for each statement execute function private.invalidate_question_learning_catalogue();
create trigger invalidate_learning_catalogue after insert or update or delete or truncate on public.academic_subjects
for each statement execute function private.invalidate_question_learning_catalogue();
create trigger invalidate_learning_catalogue after insert or update or delete or truncate on public.curriculum_assessment_items
for each statement execute function private.invalidate_question_learning_catalogue();
create trigger invalidate_learning_catalogue after insert or update or delete or truncate on public.curriculum_item_objective_mappings
for each statement execute function private.invalidate_question_learning_catalogue();
create trigger invalidate_learning_catalogue after insert or update or delete or truncate on public.curriculum_framework_versions
for each statement execute function private.invalidate_question_learning_catalogue();
create trigger invalidate_learning_catalogue_questions_insert_delete after insert or delete or truncate on public.questions
for each statement execute function private.invalidate_question_learning_catalogue();
create trigger invalidate_learning_catalogue_questions_update after update of academic_subject_id,verified_content_hash,current_content_hash,is_active,verification_status,analytics_eligible,pool_scope,owner_school_id on public.questions
for each statement execute function private.invalidate_question_learning_catalogue();

CREATE OR REPLACE FUNCTION public.rpc_teacher_question_browser(p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
declare
  v_actor uuid:=auth.uid(); v_teacher uuid; v_school uuid; v_year uuid;
  p_subject text:=nullif(p_filters->>'subject','');
  p_difficulty text:=nullif(p_filters->>'difficulty','');
  v_limit integer:=greatest(1,least(coalesce((p_filters->>'limit')::integer,60),100));
  v_after_time timestamptz:=(p_filters->'cursor'->>'createdAt')::timestamptz;
  v_after_id uuid:=(p_filters->'cursor'->>'id')::uuid;
  v_questions jsonb; v_facets jsonb; v_ids uuid[]; v_metadata jsonb; v_more boolean;
begin
  if v_actor is null then raise exception using errcode='42501',message='authentication_required'; end if;
  select t.id into v_teacher from public.teachers t where t.user_id=v_actor;
  if v_teacher is null then raise exception using errcode='42501',message='teacher_required'; end if;


  select sm.school_id into v_school
  from public.school_members sm
  where sm.user_id=v_actor and sm.status='active'
  order by sm.joined_at desc nulls last,sm.id limit 1;
  if v_school is null then select u.school_id into v_school from public.users u where u.id=v_actor; end if;
  if v_school is not null then v_year:=public.academic_resolve_operational_year_id(v_school,now()); end if;


  if (v_after_time is null)<>(v_after_id is null) then raise exception 'invalid_question_cursor'; end if;
  with authorized_scopes as materialized (
    select distinct
      ss.id as school_subject_id,
      ss.name as school_subject_name,
      academic.name as canonical_subject_name,
      o.grade_level,
      ss.academic_subject_id,
      o.curriculum_scope_id
    from public.school_subject_group_teachers gt
    join public.school_subject_groups g
      on g.id=gt.group_id and g.school_id=gt.school_id and g.status='active'
    join public.school_subject_offerings o
      on o.id=g.school_subject_offering_id and o.school_id=g.school_id and o.status='active'
    join public.school_subjects ss
      on ss.id=o.school_subject_id and ss.school_id=o.school_id
      and ss.is_active and ss.academic_subject_id is not null
    join public.academic_subjects academic
      on academic.id=ss.academic_subject_id and academic.is_active
    where gt.teacher_user_id=v_actor
      and gt.school_id=v_school
      and gt.active
      and o.grade_level~'^[0-9]+$'
      and (v_year is null or o.academic_year_id=v_year)

    union

    select distinct
      ss.id,
      ss.name,
      academic.name,
      c.grade_level,
      ss.academic_subject_id,
      o.curriculum_scope_id
    from public.class_teacher_assignments cta
    join public.classes c
      on c.id=cta.class_id and c.school_id=cta.school_id
      and coalesce(c.is_active,true) and c.grade_level~'^[0-9]+$'
    join public.school_subjects ss
      on ss.id=cta.school_subject_id and ss.school_id=cta.school_id
      and ss.is_active and ss.academic_subject_id is not null
    join public.academic_subjects academic
      on academic.id=ss.academic_subject_id and academic.is_active
    join public.school_subject_offerings o
      on o.school_subject_id=ss.id and o.school_id=cta.school_id
      and o.grade_level=c.grade_level and o.status='active'
      and o.grade_level~'^[0-9]+$'
      and (v_year is null or o.academic_year_id=v_year)
    where cta.teacher_user_id=v_actor and cta.school_id=v_school and cta.active
  ),
  page as materialized (
    select q0.id,q0.created_at from public.questions q0
    where q0.is_active and ((q0.pool_scope='teacher' and q0.content_origin='teacher' and q0.teacher_id=v_teacher
      and (p_subject is null or lower(trim(q0.subject))=lower(trim(p_subject)))
      and (p_difficulty is null or q0.difficulty=p_difficulty)) or (q0.verification_status='verified' and q0.analytics_eligible
      and exists (select 1 from authorized_scopes scope
        where scope.academic_subject_id=q0.academic_subject_id
          and scope.grade_level::smallint=any(q0.eligible_grade_levels)
          and (case when (select s.revision=s.built_revision from private.question_learning_catalogue_state s where s.singleton) then
            exists(select 1 from private.question_learning_catalogue c
              where c.question_id=q0.id and c.question_content_hash=q0.verified_content_hash
                and (c.registry_ready or scope.curriculum_scope_id=any(c.curriculum_scope_ids)))
          else (exists (
        select 1 from public.curriculum_assessment_items item
        join public.curriculum_item_objective_mappings im on im.assessment_item_id=item.id
        join public.curriculum_framework_versions fv on fv.id=im.framework_version_id
        where item.source_type='question_bank' and item.source_record_id=q0.id::text
          and item.source_item_key='question' and item.is_active
          and item.content_hash=q0.verified_content_hash
          and ((q0.pool_scope='global' and item.school_id is null)
            or (q0.pool_scope='school' and item.school_id=v_school))
          and im.curriculum_scope_id=scope.curriculum_scope_id
          and im.academic_subject_id=q0.academic_subject_id
          and im.status='approved' and im.mapping_role='primary'
          and im.superseded_at is null and im.item_content_hash=item.content_hash
          and fv.status in ('published','retired')
          and fv.content_hash=im.curriculum_version_content_hash
      ) or exists (
        select 1 from public.verified_question_registry_taxonomy tx
        join public.academic_skill_registry_versions rv
          on rv.id=tx.registry_version_id and rv.status='published'
        join public.academic_skill_registry_nodes skill
          on skill.id=tx.primary_skill_node_id and skill.registry_version_id=rv.id
          and skill.node_type='skill' and skill.status='active'
        join public.academic_skill_registry_nodes subskill
          on subskill.id=tx.atomic_subskill_node_id and subskill.registry_version_id=rv.id
          and subskill.parent_id=skill.id and subskill.node_type='subskill' and subskill.status='active'
        join public.academic_skill_evidence_focuses focus
          on focus.id=tx.evidence_focus_id and focus.status='active'
          and focus.registry_version_id=rv.id and focus.atomic_subskill_node_id=subskill.id
        where tx.question_id=q0.id and tx.question_content_hash=q0.verified_content_hash
          and tx.review_status='approved' and not tx.human_review_required
          and private.academic_registry_subject_matches(rv.id,scope.canonical_subject_name)
      )) end)
      and q0.is_active
      and q0.verification_status='verified' and q0.analytics_eligible
      and q0.current_content_hash=q0.verified_content_hash
      and (
        (q0.pool_scope='global' and q0.content_origin='brain_heist'
          and q0.owner_school_id is null and q0.is_public)
        or (q0.pool_scope='school' and q0.content_origin='teacher'
          and q0.owner_school_id=v_school and not q0.is_public)
      )
      and (
        p_subject is null
        or lower(trim(scope.school_subject_name))=lower(trim(p_subject))
        or lower(trim(scope.canonical_subject_name))=lower(trim(p_subject))
        or lower(trim(q0.subject))=lower(trim(p_subject))
      )
      and (p_difficulty is null or q0.difficulty=p_difficulty))))
      and (nullif(p_filters->>'pool','') is null or (p_filters->>'pool'='verified' and q0.pool_scope in ('global','school')) or
        q0.pool_scope=case p_filters->>'pool' when 'mine' then 'teacher' when 'brains-heist' then 'global' else p_filters->>'pool' end)
      and (nullif(p_filters->>'topic','') is null or coalesce(nullif(q0.topic_name,''),nullif(q0.topic,''),'General')=p_filters->>'topic')
      and (nullif(p_filters->>'type','') is null or q0.question_type=p_filters->>'type')
      and (not (p_filters ? 'subjects') or exists(select 1 from jsonb_array_elements_text(p_filters->'subjects') s(value)
        where private.question_browse_subject_key(q0.subject)=private.question_browse_subject_key(s.value)))
      and (not (p_filters ? 'grades') or q0.pool_scope='teacher' or q0.eligible_grade_levels @>
        array(select value::smallint from jsonb_array_elements_text(p_filters->'grades')))
      and (nullif(p_filters->>'xp','') is null or case p_filters->>'xp'
        when 'low' then q0.points<=10 when 'medium' then q0.points>10 and q0.points<=20 when 'high' then q0.points>20 else true end)
      and (nullif(trim(p_filters->>'search'),'') is null or private.question_browse_matches_search(q0,p_filters->>'search'))
      and (v_after_time is null or (q0.created_at,q0.id)<(v_after_time,v_after_id))
    order by q0.created_at desc,q0.id desc limit v_limit+1 offset greatest(coalesce((p_filters->>'offset')::integer,0),0)
  ), rows as (
    select to_jsonb(q)||jsonb_build_object('is_mine',q.pool_scope='teacher' and q.teacher_id=v_teacher,
      'assessment_profiles',coalesce((select jsonb_agg(jsonb_build_object(
        'programmeCode',ap.programme_code,'sourceVersion',ap.source_version,
        'paperComponent',ap.paper_component,'primaryAssessmentObjective',ap.primary_assessment_objective,
        'assessmentObjectives',ap.assessment_objectives,'syllabusTier',ap.syllabus_tier,
        'syllabusReference',ap.syllabus_reference,'objectiveComponents',ap.objective_components) order by ap.programme_code)
        from public.verified_question_assessment_profiles ap where ap.question_id=q.id
          and ap.question_content_hash=q.current_content_hash and ap.status='active'),'[]'::jsonb),
      'creator_name',case when q.pool_scope='global' then 'Brains Heist' else coalesce(u.username,'Teacher') end,
      'creator_school_id',case when q.pool_scope='global' then null when q.pool_scope='school' then q.owner_school_id else u.school_id end) payload,
      q.id,q.created_at
    from page join public.questions q on q.id=page.id
    left join public.teachers t on t.id=q.teacher_id left join public.users u on u.id=t.user_id
    order by q.created_at desc,q.id desc limit v_limit
  )
  select coalesce(jsonb_agg(payload order by created_at desc,id desc),'[]'::jsonb),array_agg(id order by created_at desc,id desc),
    (select count(*)>v_limit from page)
  into v_questions,v_ids,v_more from rows;
  if coalesce(cardinality(v_ids),0)>0 and coalesce((p_filters->>'metadata')::boolean,true) then
    v_metadata:=public.rpc_question_curriculum_metadata(v_ids);
  end if;
  return jsonb_build_object('questions',v_questions,'metadata',coalesce(v_metadata,'[]'::jsonb),
    'hasMore',v_more,'nextCursor',case when v_more then jsonb_build_object(
      'createdAt',v_questions->-1->>'created_at','id',v_questions->-1->>'id') else null end);
end;
$function$

;
revoke all on function public.rpc_teacher_question_browser(jsonb) from public,anon;
grant execute on function public.rpc_teacher_question_browser(jsonb) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.rpc_teacher_question_facets(p_search text DEFAULT NULL::text, p_grades smallint[] DEFAULT NULL::smallint[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid(); v_teacher uuid; v_school uuid; v_year uuid;
  p_subject text; p_difficulty text; v_result jsonb;
begin
  if v_actor is null then raise exception using errcode='42501',message='authentication_required'; end if;
  select t.id into v_teacher from public.teachers t where t.user_id=v_actor;
  if v_teacher is null then raise exception using errcode='42501',message='teacher_required'; end if;


  select sm.school_id into v_school
  from public.school_members sm
  where sm.user_id=v_actor and sm.status='active'
  order by sm.joined_at desc nulls last,sm.id limit 1;
  if v_school is null then select u.school_id into v_school from public.users u where u.id=v_actor; end if;
  if v_school is not null then v_year:=public.academic_resolve_operational_year_id(v_school,now()); end if;


  with authorized_scopes as materialized (
    select distinct
      ss.id as school_subject_id,
      ss.name as school_subject_name,
      academic.name as canonical_subject_name,
      o.grade_level,
      ss.academic_subject_id,
      o.curriculum_scope_id
    from public.school_subject_group_teachers gt
    join public.school_subject_groups g
      on g.id=gt.group_id and g.school_id=gt.school_id and g.status='active'
    join public.school_subject_offerings o
      on o.id=g.school_subject_offering_id and o.school_id=g.school_id and o.status='active'
    join public.school_subjects ss
      on ss.id=o.school_subject_id and ss.school_id=o.school_id
      and ss.is_active and ss.academic_subject_id is not null
    join public.academic_subjects academic
      on academic.id=ss.academic_subject_id and academic.is_active
    where gt.teacher_user_id=v_actor
      and gt.school_id=v_school
      and gt.active
      and o.grade_level~'^[0-9]+$'
      and (v_year is null or o.academic_year_id=v_year)

    union

    select distinct
      ss.id,
      ss.name,
      academic.name,
      c.grade_level,
      ss.academic_subject_id,
      o.curriculum_scope_id
    from public.class_teacher_assignments cta
    join public.classes c
      on c.id=cta.class_id and c.school_id=cta.school_id
      and coalesce(c.is_active,true) and c.grade_level~'^[0-9]+$'
    join public.school_subjects ss
      on ss.id=cta.school_subject_id and ss.school_id=cta.school_id
      and ss.is_active and ss.academic_subject_id is not null
    join public.academic_subjects academic
      on academic.id=ss.academic_subject_id and academic.is_active
    join public.school_subject_offerings o
      on o.school_subject_id=ss.id and o.school_id=cta.school_id
      and o.grade_level=c.grade_level and o.status='active'
      and o.grade_level~'^[0-9]+$'
      and (v_year is null or o.academic_year_id=v_year)
    where cta.teacher_user_id=v_actor and cta.school_id=v_school and cta.active
  ), groups as (
    select q0.subject,coalesce(nullif(q0.topic_name,''),nullif(q0.topic,''),'General') topic,
      case q0.pool_scope when 'global' then 'brains-heist' when 'teacher' then 'mine' else q0.pool_scope end pool,
      count(*) count,count(*) filter(where q0.verification_status='in_review') review_count
    from public.questions q0 where q0.is_active and ((q0.pool_scope='teacher' and q0.content_origin='teacher' and q0.teacher_id=v_teacher
      and (p_subject is null or lower(trim(q0.subject))=lower(trim(p_subject)))
      and (p_difficulty is null or q0.difficulty=p_difficulty)) or (q0.verification_status='verified' and q0.analytics_eligible
      and exists (select 1 from authorized_scopes scope
        where scope.academic_subject_id=q0.academic_subject_id
          and scope.grade_level::smallint=any(q0.eligible_grade_levels)
          and (case when (select s.revision=s.built_revision from private.question_learning_catalogue_state s where s.singleton) then
            exists(select 1 from private.question_learning_catalogue c
              where c.question_id=q0.id and c.question_content_hash=q0.verified_content_hash
                and (c.registry_ready or scope.curriculum_scope_id=any(c.curriculum_scope_ids)))
          else (exists (
        select 1 from public.curriculum_assessment_items item
        join public.curriculum_item_objective_mappings im on im.assessment_item_id=item.id
        join public.curriculum_framework_versions fv on fv.id=im.framework_version_id
        where item.source_type='question_bank' and item.source_record_id=q0.id::text
          and item.source_item_key='question' and item.is_active
          and item.content_hash=q0.verified_content_hash
          and ((q0.pool_scope='global' and item.school_id is null)
            or (q0.pool_scope='school' and item.school_id=v_school))
          and im.curriculum_scope_id=scope.curriculum_scope_id
          and im.academic_subject_id=q0.academic_subject_id
          and im.status='approved' and im.mapping_role='primary'
          and im.superseded_at is null and im.item_content_hash=item.content_hash
          and fv.status in ('published','retired')
          and fv.content_hash=im.curriculum_version_content_hash
      ) or exists (
        select 1 from public.verified_question_registry_taxonomy tx
        join public.academic_skill_registry_versions rv
          on rv.id=tx.registry_version_id and rv.status='published'
        join public.academic_skill_registry_nodes skill
          on skill.id=tx.primary_skill_node_id and skill.registry_version_id=rv.id
          and skill.node_type='skill' and skill.status='active'
        join public.academic_skill_registry_nodes subskill
          on subskill.id=tx.atomic_subskill_node_id and subskill.registry_version_id=rv.id
          and subskill.parent_id=skill.id and subskill.node_type='subskill' and subskill.status='active'
        join public.academic_skill_evidence_focuses focus
          on focus.id=tx.evidence_focus_id and focus.status='active'
          and focus.registry_version_id=rv.id and focus.atomic_subskill_node_id=subskill.id
        where tx.question_id=q0.id and tx.question_content_hash=q0.verified_content_hash
          and tx.review_status='approved' and not tx.human_review_required
          and private.academic_registry_subject_matches(rv.id,scope.canonical_subject_name)
      )) end)
      and q0.is_active
      and q0.verification_status='verified' and q0.analytics_eligible
      and q0.current_content_hash=q0.verified_content_hash
      and (
        (q0.pool_scope='global' and q0.content_origin='brain_heist'
          and q0.owner_school_id is null and q0.is_public)
        or (q0.pool_scope='school' and q0.content_origin='teacher'
          and q0.owner_school_id=v_school and not q0.is_public)
      )
      and (
        p_subject is null
        or lower(trim(scope.school_subject_name))=lower(trim(p_subject))
        or lower(trim(scope.canonical_subject_name))=lower(trim(p_subject))
        or lower(trim(q0.subject))=lower(trim(p_subject))
      )
      and (p_difficulty is null or q0.difficulty=p_difficulty))))
    and (nullif(trim(p_search),'') is null or private.question_browse_matches_search(q0,p_search))
    and (p_grades is null or q0.pool_scope='teacher' or q0.eligible_grade_levels @> p_grades)
    group by 1,2,3
  ) select coalesce(jsonb_agg(to_jsonb(groups) order by subject,topic,pool),'[]'::jsonb) into v_result from groups;
  return v_result;
end;
$function$

;
revoke all on function public.rpc_teacher_question_facets(text,smallint[]) from public,anon;
grant execute on function public.rpc_teacher_question_facets(text,smallint[]) to authenticated,service_role;

-- Initial build and one shared background worker. A clean tick only reads state.
select private.refresh_question_learning_catalogue();
do $schedule$
begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('brains-heist-question-learning-catalogue','* * * * *','select private.refresh_question_learning_catalogue()');
 end if;
end;
$schedule$;
