-- Match the battle picker's subject aliases without changing authorization.
create or replace function private.question_browse_subject_key(p_value text)
returns text language sql immutable security invoker as $function$
  select case normalized when 'mathematics' then 'maths' when 'math' then 'maths'
    when 'english language' then 'english' else normalized end
  from (select pg_catalog.regexp_replace(pg_catalog.regexp_replace(pg_catalog.regexp_replace(
    pg_catalog.lower(pg_catalog.btrim(p_value)), '[–—-]', ' ', 'g'), '\s+', ' ', 'g'),
    '^(cambridge |cie )?(international )?(as( level)?|a level|gcse|igcse) +', '') normalized) n
$function$;
revoke all on function private.question_browse_subject_key(text) from public,anon,authenticated;
-- Preserve the bank's curriculum/evidence search without fetching every body.
create or replace function private.question_browse_matches_search(p_question public.questions,p_search text)
returns boolean language sql stable security invoker as $function$
  select nullif(pg_catalog.btrim(p_search),'') is null
    or pg_catalog.strpos(pg_catalog.lower(pg_catalog.concat_ws(' ',p_question.question_text,
      p_question.correct_answer,p_question.subject,p_question.topic,p_question.topic_name,p_question.difficulty,
      pg_catalog.array_to_string(p_question.tags,' '),p_question.curriculum_strand,p_question.curriculum_skill,
      p_question.curriculum_subskill,p_question.curriculum_objective)),pg_catalog.lower(pg_catalog.btrim(p_search)))>0
    or exists (
      select 1 from public.verified_question_registry_taxonomy tx
      join public.academic_skill_registry_versions rv on rv.id=tx.registry_version_id and rv.status='published'
        and rv.subject_key=public.academic_normalize_subject_key(p_question.subject)
      join public.academic_skill_registry_nodes skill on skill.id=tx.primary_skill_node_id and skill.status='active' and skill.registry_version_id=rv.id and skill.node_type='skill'
      join public.academic_skill_registry_nodes subskill on subskill.id=tx.atomic_subskill_node_id and subskill.status='active' and subskill.registry_version_id=rv.id
        and subskill.parent_id=skill.id and subskill.node_type='subskill'
      left join public.academic_skill_registry_nodes strand on strand.id=skill.parent_id
      join public.academic_skill_evidence_focuses focus on focus.id=tx.evidence_focus_id and focus.status='active' and focus.registry_version_id=rv.id and focus.atomic_subskill_node_id=subskill.id
      where tx.question_id=p_question.id and tx.question_content_hash=p_question.current_content_hash
        and tx.review_status='approved' and not tx.human_review_required
        and p_question.is_active and p_question.analytics_eligible and p_question.verification_status='verified'
        and p_question.current_content_hash=p_question.verified_content_hash
        and pg_catalog.strpos(pg_catalog.lower(pg_catalog.concat_ws(' ',strand.name,skill.name,subskill.name,
          focus.name,tx.evidence_statement)),pg_catalog.lower(pg_catalog.btrim(p_search)))>0
    )
$function$;
revoke all on function private.question_browse_matches_search(public.questions,text) from public,anon,authenticated;
-- Look up one governed item without scanning every source record for every question.
set lock_timeout='5s';
create index if not exists curriculum_question_item_lookup_idx on public.curriculum_assessment_items(source_record_id,content_hash)
  where source_type='question_bank' and is_active;
create index if not exists questions_active_browse_idx on public.questions(created_at desc,id desc) where is_active;
create index if not exists questions_active_subject_browse_idx on public.questions(lower(trim(subject)),created_at desc,id desc) where is_active;
reset lock_timeout;
CREATE OR REPLACE FUNCTION public.get_all_active_questions(p_subject text DEFAULT NULL::text, p_difficulty text DEFAULT NULL::text, p_teacher_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 500, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, teacher_id uuid, subject text, subject_id text, topic text, topic_name text, difficulty text, question_text text, image_url text, image_alt_text text, question_type text, options jsonb, correct_answer text, explanation text, hints text[], time_limit integer, points integer, tags text[], grade_level text, is_public boolean, is_active boolean, times_answered integer, times_correct integer, created_at timestamp with time zone, updated_at timestamp with time zone, creator_name text, creator_school_id uuid, is_mine boolean, content_origin text, verification_status text, analytics_eligible boolean, verified_at timestamp with time zone, verified_by uuid, verified_by_authority text, verified_content_hash text, current_content_hash text, content_version text, content_revision integer, eligible_grade_levels smallint[], pool_scope text, owner_school_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_teacher uuid;
  v_school uuid;
  v_year uuid;
begin
  if v_actor is null then raise exception using errcode='42501',message='authentication_required'; end if;
  select t.id into v_teacher from public.teachers t where t.user_id=v_actor;
  if v_teacher is null then raise exception using errcode='42501',message='teacher_required'; end if;
  if p_teacher_id is not null and p_teacher_id<>v_teacher then
    raise exception using errcode='42501',message='cannot_browse_another_teacher_pool';
  end if;

  select sm.school_id into v_school
  from public.school_members sm
  where sm.user_id=v_actor and sm.status='active'
  order by sm.joined_at desc nulls last,sm.id limit 1;
  if v_school is null then select u.school_id into v_school from public.users u where u.id=v_actor; end if;
  if v_school is not null then v_year:=public.academic_resolve_operational_year_id(v_school,now()); end if;

  return query
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
  paged as materialized (
    select q0.id,q0.created_at from public.questions q0
    where q0.is_active and ((q0.pool_scope='teacher' and q0.content_origin='teacher' and q0.teacher_id=v_teacher
      and (p_subject is null or lower(trim(q0.subject))=lower(trim(p_subject)))
      and (p_difficulty is null or q0.difficulty=p_difficulty)) or (q0.verification_status='verified' and q0.analytics_eligible
      and exists (select 1 from authorized_scopes scope
        where scope.academic_subject_id=q0.academic_subject_id
          and scope.grade_level::smallint=any(q0.eligible_grade_levels)
          and (exists (
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
          and rv.subject_key=public.academic_normalize_subject_key(scope.canonical_subject_name)
      ))
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
    order by q0.created_at desc,q0.id desc
    limit greatest(1,least(coalesce(p_limit,500),1000))
    offset greatest(coalesce(p_offset,0),0)
  )
  select
    q.id,q.teacher_id,q.subject,q.subject_id,q.topic,q.topic_name,q.difficulty,
    q.question_text,q.image_url,q.image_alt_text,q.question_type,q.options,
    q.correct_answer,q.explanation,q.hints,q.time_limit,q.points,q.tags,q.grade_level,
    q.is_public,q.is_active,q.times_answered,q.times_correct,q.created_at,q.updated_at,
    case when q.pool_scope='global' then 'Brains Heist' else coalesce(u.username,'Teacher') end,
    case when q.pool_scope='global' then null
      when q.pool_scope='school' then q.owner_school_id else u.school_id end,
    q.pool_scope='teacher' and q.teacher_id=v_teacher,
    q.content_origin,q.verification_status,q.analytics_eligible,q.verified_at,q.verified_by,
    q.verified_by_authority,q.verified_content_hash,q.current_content_hash,
    q.content_version,q.content_revision,q.eligible_grade_levels,q.pool_scope,q.owner_school_id
  from paged page
  join public.questions q on q.id=page.id
  left join public.teachers t on t.id=q.teacher_id
  left join public.users u on u.id=t.user_id
  order by page.created_at desc,page.id desc;
end;
$function$;
revoke all on function public.get_all_active_questions(text,text,uuid,integer,integer) from public,anon;
grant execute on function public.get_all_active_questions(text,text,uuid,integer,integer) to authenticated,service_role;
create or replace function public.rpc_teacher_question_browser(p_filters jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path to '' set plan_cache_mode to 'force_custom_plan' as $function$
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
          and (exists (
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
          and rv.subject_key=public.academic_normalize_subject_key(scope.canonical_subject_name)
      ))
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
$function$;
revoke all on function public.rpc_teacher_question_browser(jsonb) from public,anon;
grant execute on function public.rpc_teacher_question_browser(jsonb) to authenticated,service_role;
create or replace function public.rpc_teacher_question_facets(p_search text default null,p_grades smallint[] default null)
returns jsonb language plpgsql stable security definer set search_path to '' as $function$
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
          and (exists (
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
          and rv.subject_key=public.academic_normalize_subject_key(scope.canonical_subject_name)
      ))
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
$function$;
revoke all on function public.rpc_teacher_question_facets(text,smallint[]) from public,anon;
grant execute on function public.rpc_teacher_question_facets(text,smallint[]) to authenticated,service_role;
-- A calendar read does not grant curriculum administration or enrolment access.
create or replace function public.rpc_school_report_calendar(p_school_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $function$
begin
  if auth.uid() is null or not (
    public.can_administer_school(p_school_id) or public.is_school_owner(p_school_id)
    or exists(select 1 from public.school_members sm join public.teachers t on t.user_id=sm.user_id
      where sm.user_id=auth.uid() and sm.school_id=p_school_id and sm.status='active' and (sm.role_in_school='teacher' or sm.can_teach))
  ) then raise exception using errcode='42501',message='school_report_access_required'; end if;
  return jsonb_build_object('success',true,'schoolId',p_school_id,
    'years',coalesce((select jsonb_agg(jsonb_build_object('id',y.id,'name',y.name,'startsOn',y.starts_on,
      'endsOn',y.ends_on,'status',y.status) order by y.starts_on desc) from public.school_academic_years y where y.school_id=p_school_id),'[]'::jsonb),
    'terms',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'academicYearId',t.academic_year_id,
      'name',t.name,'sequence',t.sequence_number,'startsOn',t.starts_on,'endsOn',t.ends_on)
      order by t.academic_year_id,t.sequence_number) from public.school_academic_terms t where t.school_id=p_school_id),'[]'::jsonb));
end;
$function$;
revoke all on function public.rpc_school_report_calendar(uuid) from public,anon;
grant execute on function public.rpc_school_report_calendar(uuid) to authenticated,service_role;

-- Private, invoker SQL helper remains inlineable. All objects are qualified;
-- no caller-supplied student, school or year can select another user's scope.
create or replace function private.student_browseable_questions()
returns table(question_id uuid,subject_name text,subject_code text)
language sql stable security invoker as $function$
  with enrolment as materialized (
    select e.* from public.users u join public.student_academic_enrolments e on e.student_id=u.id and e.school_id=u.school_id
    join public.school_academic_years y on y.id=e.academic_year_id and y.status='current'
    where u.id=(select auth.uid()) and current_date between e.starts_on and coalesce(e.ends_on,current_date)
    order by e.starts_on desc,e.created_at desc limit 1
  ), scopes as materialized (
    select m.curriculum_scope_id,m.academic_subject_id,e.grade_level,e.school_id,a.name,a.code
    from public.users u
    join enrolment e on e.student_id=u.id and e.school_id=u.school_id
    join public.school_academic_years y on y.id=e.academic_year_id and y.status='current'
    join public.school_curriculum_scope_mappings m on m.school_id=e.school_id
      and m.academic_year_id=e.academic_year_id and m.grade_level=e.grade_level and m.status='active'
    join public.academic_subjects a on a.id=m.academic_subject_id
    where u.id=(select auth.uid()) and current_date between e.starts_on and coalesce(e.ends_on,current_date)
      and (m.subject_requirement='required' or exists(
        select 1 from public.student_subject_enrolments se where se.student_id=u.id
          and se.academic_year_id=e.academic_year_id and se.academic_subject_id=m.academic_subject_id
          and se.status='active' and current_date>=se.starts_on and (se.ends_on is null or current_date<=se.ends_on)))
  )
  select q.id,a.name,a.code from public.questions q
  join public.academic_subjects a on a.id=q.academic_subject_id
  where q.is_active and q.verification_status='verified' and q.analytics_eligible
    and q.current_content_hash=q.verified_content_hash
    and exists(select 1 from scopes sc where sc.academic_subject_id=q.academic_subject_id
      and sc.grade_level~'^[0-9]+$' and sc.grade_level::smallint=any(q.eligible_grade_levels)
      and ((q.pool_scope='global' and q.content_origin='brain_heist' and q.owner_school_id is null and q.is_public)
        or (q.pool_scope='school' and q.content_origin='teacher' and q.owner_school_id=sc.school_id and not q.is_public))
      and exists(select 1 from public.curriculum_assessment_items i
        join public.curriculum_item_objective_mappings im on im.assessment_item_id=i.id
        join public.curriculum_framework_versions fv on fv.id=im.framework_version_id
        join public.curriculum_objectives o on o.id=im.curriculum_objective_id and o.is_assessable
        where i.is_active and i.source_type='question_bank' and i.source_record_id=q.id::text
          and i.content_hash=q.verified_content_hash
          and ((q.pool_scope='global' and i.school_id is null) or (q.pool_scope='school' and i.school_id=sc.school_id))
          and im.curriculum_scope_id=sc.curriculum_scope_id and im.academic_subject_id=sc.academic_subject_id
          and im.status='approved' and im.mapping_role='primary' and im.superseded_at is null
          and im.item_content_hash=i.content_hash and fv.status in ('published','retired')
          and fv.content_hash=im.curriculum_version_content_hash))
$function$;
revoke all on function private.student_browseable_questions() from public,anon,authenticated;

create or replace function public.rpc_student_question_browser(p_filters jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path to '' set plan_cache_mode to 'force_custom_plan' as $function$
declare
  v_questions jsonb; v_more boolean;
  v_limit integer:=greatest(1,least(coalesce((p_filters->>'limit')::integer,60),100));
  v_after_time timestamptz:=(p_filters->'cursor'->>'createdAt')::timestamptz;
  v_after_id uuid:=(p_filters->'cursor'->>'id')::uuid;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='authentication_required'; end if;
  if exists(select 1 from public.teachers where user_id=auth.uid()) then return public.rpc_teacher_question_browser(p_filters); end if;
  if (v_after_time is null)<>(v_after_id is null) then raise exception 'invalid_question_cursor'; end if;
  with page as materialized (
    select q.id,q.created_at,a.subject_name,a.subject_code from private.student_browseable_questions() a
    join public.questions q on q.id=a.question_id
    where (nullif(p_filters->>'subject','') is null or (a.subject_code=public.academic_normalize_subject_key(p_filters->>'subject')
        or lower(trim(a.subject_name))=lower(trim(p_filters->>'subject'))))
      and (nullif(p_filters->>'difficulty','') is null or q.difficulty=p_filters->>'difficulty')
      and (nullif(p_filters->>'pool','') is null or q.pool_scope=case p_filters->>'pool' when 'brains-heist' then 'global' else p_filters->>'pool' end)
      and (nullif(p_filters->>'topic','') is null or coalesce(nullif(q.topic_name,''),nullif(q.topic,''),'General')=p_filters->>'topic')
      and (nullif(trim(p_filters->>'search'),'') is null or private.question_browse_matches_search(q,p_filters->>'search'))
      and (v_after_time is null or (q.created_at,q.id)<(v_after_time,v_after_id))
    order by q.created_at desc,q.id desc limit v_limit+1
  ), rows as (
    select q.id,q.teacher_id,page.subject_name subject,page.subject_code subject_id,q.topic,q.topic_name,q.difficulty,
      q.question_text,q.image_url,q.image_alt_text,q.question_type,q.options,q.correct_answer,q.explanation,q.hints,
      q.time_limit,q.points,q.tags,q.grade_level,q.eligible_grade_levels,q.is_public,q.is_active,q.created_at,q.updated_at,
      q.content_origin,q.pool_scope,q.owner_school_id,q.verification_status,q.analytics_eligible,
      q.curriculum_strand,q.curriculum_skill,q.curriculum_subskill,q.curriculum_objective
    from page join public.questions q on q.id=page.id order by q.created_at desc,q.id desc limit v_limit
  ) select coalesce(jsonb_agg(to_jsonb(rows) order by created_at desc,id desc),'[]'::jsonb),
      (select count(*)>v_limit from page) into v_questions,v_more from rows;
  return jsonb_build_object('questions',v_questions,'hasMore',v_more,'nextCursor',case when v_more then
    jsonb_build_object('id',v_questions->-1->>'id','createdAt',v_questions->-1->>'created_at') else null end);
end;
$function$;
revoke all on function public.rpc_student_question_browser(jsonb) from public,anon;
grant execute on function public.rpc_student_question_browser(jsonb) to authenticated,service_role;

-- Exact topic and progress counts; no question bodies or per-attempt downloads.
create or replace function public.rpc_student_question_summary(p_search text default null)
returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='authentication_required'; end if;
  if exists(select 1 from public.teachers where user_id=auth.uid()) then return public.rpc_teacher_question_facets(p_search); end if;
  with groups as (
    select a.subject_name subject,a.subject_code code,
      coalesce(nullif(q.topic_name,''),nullif(q.topic,''),'General') topic,
      case q.pool_scope when 'global' then 'brains-heist' else q.pool_scope end pool,q.difficulty,
      count(*) count,count(*) filter(where exists(select 1 from public.question_attempts qa
        where qa.student_id=auth.uid() and qa.question_id=q.id)) answered,0 review_count
    from private.student_browseable_questions() a join public.questions q on q.id=a.question_id
    where (nullif(trim(p_search),'') is null or private.question_browse_matches_search(q,p_search))
    group by 1,2,3,4,5
  ) select coalesce(jsonb_agg(to_jsonb(groups) order by subject,topic,pool,difficulty),'[]'::jsonb) into v_result from groups;
  return v_result;
end;
$function$;
revoke all on function public.rpc_student_question_summary(text) from public,anon;
grant execute on function public.rpc_student_question_summary(text) to authenticated,service_role;

create or replace function public.rpc_superadmin_question_counts()
returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.is_superadmin(auth.uid()) then raise exception using errcode='42501',message='superadmin_required'; end if;
  with counts as (select q.grade,q.difficulty,count(*) total,count(*) filter(where q.is_active) active
    from public.questions q group by q.grade,q.difficulty), grades as (
    select grade,sum(total) total,sum(active) active,jsonb_object_agg(coalesce(difficulty,'unknown'),total) difficulty from counts group by grade
  ) select coalesce(jsonb_agg(to_jsonb(grades) order by grade),'[]'::jsonb) into v_result from grades;
  return v_result;
end;
$function$;
revoke all on function public.rpc_superadmin_question_counts() from public,anon;
grant execute on function public.rpc_superadmin_question_counts() to authenticated,service_role;
