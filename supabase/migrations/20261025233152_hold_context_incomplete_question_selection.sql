-- Reversible, content-bound editorial gate. Existing published work is grandfathered.
set lock_timeout='2s';
set statement_timeout='15s';
create table private.question_selection_holds (
 question_id uuid not null references public.questions(id) on delete cascade,
 question_content_hash text not null check (length(question_content_hash)=64),
 reason text not null,
 source_reference text not null,
 created_by_authority text not null,
 created_at timestamptz not null default now(),
 published_assignment_ids uuid[] not null default '{}',
 released_at timestamptz,
 primary key(question_id,question_content_hash)
);
alter table private.question_selection_holds enable row level security;
revoke all on private.question_selection_holds from public,anon,authenticated;
comment on table private.question_selection_holds is 'Private editorial selection holds. No question, attempt, score or published snapshot is changed. Release explicitly after review; changed content hashes require fresh review.';

create function private.guard_held_assignment_question() returns trigger
language plpgsql security definer set search_path='' as $fn$
begin
 if exists(select 1 from private.question_selection_holds h
   join public.questions q on q.id=h.question_id and q.current_content_hash=h.question_content_hash
   where h.question_id=new.question_id and h.released_at is null
     and not(new.assignment_id=any(h.published_assignment_ids))) then
   raise exception using errcode='23514',message='QUESTION_UNDER_EDITORIAL_REVIEW: choose another question; the reading passage is incomplete.';
 end if;
 return new;
end;$fn$;
revoke all on function private.guard_held_assignment_question() from public,anon,authenticated;
create trigger guard_held_assignment_question before insert or update of question_id,assignment_id on public.assignment_questions
 for each row execute function private.guard_held_assignment_question();

create function private.guard_held_assignment_publication() returns trigger
language plpgsql security definer set search_path='' as $fn$
begin
 if new.publish_status in ('scheduled','published') and new.publish_status is distinct from old.publish_status
 and exists(select 1 from public.assignment_questions aq
   join public.questions q on q.id=aq.question_id
   join private.question_selection_holds h on h.question_id=q.id and h.question_content_hash=q.current_content_hash
   where aq.assignment_id=new.id and h.released_at is null
     and not(new.id=any(h.published_assignment_ids))) then
   raise exception using errcode='23514',message='QUESTION_UNDER_EDITORIAL_REVIEW: replace the question with an incomplete reading passage before publishing.';
 end if;
 return new;
end;$fn$;
revoke all on function private.guard_held_assignment_publication() from public,anon,authenticated;
create trigger guard_held_assignment_publication before update of publish_status on public.assignments
 for each row execute function private.guard_held_assignment_publication();

-- Serialize the one-time published assignment capture with concurrent authoring.
lock table public.assignments,public.assignment_questions in share row exclusive mode;
do $seed$
declare n integer;
begin
 with source_hashes(content_hash) as (values
  ('01f32e8b0bfd44b4821a7dc371f9f08125bc63bf52832105db89477ed7ae4d6c'),
  ('2a6aae9b470db4cb3924594d23837c5908fc53ec18d25a037b5aabda1e0ea658'),
  ('de8b35250e064845fccab2e6965a26548bc3930ac854cd238346af3c8185f219'),
  ('a56e30c68c05fe5b889d852b73dd71e18833c615cd9b2930f4ea0a87e3a6d258'),
  ('47af22c6d191e471369c9733a254ef5831954fec3e2f2e11247679923f488ca6'),
  ('6826bae7146f873c444db72f068402b2aed843b3236fbfe2a733319c0430db24'),
  ('a80c2bf986030029bca9799f033a04d3ae9b11ea527b228a8f254170817cb54e'),
  ('93602571e2a1093662af376baa6aa09f7cf4556fb44405694610a47b13055e44'),
  ('d8f8ac25de3f096fc5d2d96463ca68e621ee0ae4e7c121575472cd29082cecce'),
  ('af172f3fd4e99efed964cf83ab3baccfa303b8af2b17dacec65dfff94d5b206e'),
  ('825b62a5672eae5457b4a43b126c081044d54d7c5af65a96f0090fe1e4bfa183'),
  ('bb9fcb6e20bc2cb5fc83b95ca3e9e4d4d42db117a067a6b2f109fff5087a1a06')
 ), matched as (
 select q.id,q.current_content_hash from public.questions q join source_hashes s on s.content_hash=q.current_content_hash
 where q.subject='English' and q.current_content_hash=q.verified_content_hash
 )
 insert into private.question_selection_holds(question_id,question_content_hash,reason,source_reference,created_by_authority,published_assignment_ids)
 select q.id,q.current_content_hash,'missing_reading_context',
 'content/english-curriculum-repair/held-repairs/reading-replacements.json',
 'Codex editorial audit: missing source passage',
 coalesce((select array_agg(a.id order by a.id) from public.assignments a
   where a.publish_status='published' and exists(select 1 from public.assignment_questions aq where aq.assignment_id=a.id and aq.question_id=q.id)),'{}'::uuid[])
 from matched q;
 get diagnostics n=row_count;
 if n<>12 then raise exception 'reading_hold_source_drift: expected 12 exact verified source hashes, found %',n; end if;
end;$seed$;

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
    where q0.is_active and not exists(select 1 from private.question_selection_holds hold where hold.question_id=q0.id and hold.question_content_hash=q0.current_content_hash and hold.released_at is null) and ((q0.pool_scope='teacher' and q0.content_origin='teacher' and q0.teacher_id=v_teacher
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
      and q0.is_active and not exists(select 1 from private.question_selection_holds hold where hold.question_id=q0.id and hold.question_content_hash=q0.current_content_hash and hold.released_at is null)
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
$function$;

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
    from public.questions q0 where q0.is_active and not exists(select 1 from private.question_selection_holds hold where hold.question_id=q0.id and hold.question_content_hash=q0.current_content_hash and hold.released_at is null) and ((q0.pool_scope='teacher' and q0.content_origin='teacher' and q0.teacher_id=v_teacher
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
      and q0.is_active and not exists(select 1 from private.question_selection_holds hold where hold.question_id=q0.id and hold.question_content_hash=q0.current_content_hash and hold.released_at is null)
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
    where q0.is_active and not exists(select 1 from private.question_selection_holds hold where hold.question_id=q0.id and hold.question_content_hash=q0.current_content_hash and hold.released_at is null) and ((q0.pool_scope='teacher' and q0.content_origin='teacher' and q0.teacher_id=v_teacher
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
          and private.academic_registry_subject_matches(rv.id,scope.canonical_subject_name)
      ))
      and q0.is_active and not exists(select 1 from private.question_selection_holds hold where hold.question_id=q0.id and hold.question_content_hash=q0.current_content_hash and hold.released_at is null)
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

CREATE OR REPLACE FUNCTION public.rpc_teacher_questions_by_ids(p_question_ids uuid[], p_subject text DEFAULT NULL::text, p_difficulty text DEFAULT NULL::text, p_teacher_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 500, p_offset integer DEFAULT 0)
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
  if coalesce(cardinality(p_question_ids),0)>100 then raise exception 'too_many_question_ids'; end if;
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
  authorized_verified as materialized (
    select distinct q0.id
    from public.questions q0
    join authorized_scopes scope
      on scope.academic_subject_id=q0.academic_subject_id
      and scope.grade_level::smallint=any(q0.eligible_grade_levels)
    where q0.id=any(p_question_ids) and (exists (
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
      ))
      and q0.is_active and not exists(select 1 from private.question_selection_holds hold where hold.question_id=q0.id and hold.question_content_hash=q0.current_content_hash and hold.released_at is null)
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
      and (p_difficulty is null or q0.difficulty=p_difficulty)
  ),
  candidate_ids as materialized (
    select av.id from authorized_verified av
    union
    select q0.id
    from public.questions q0
    where q0.id=any(p_question_ids) and q0.is_active and not exists(select 1 from private.question_selection_holds hold where hold.question_id=q0.id and hold.question_content_hash=q0.current_content_hash and hold.released_at is null) and q0.pool_scope='teacher'
      and q0.content_origin='teacher' and q0.teacher_id=v_teacher
      and (p_subject is null or lower(trim(q0.subject))=lower(trim(p_subject)))
      and (p_difficulty is null or q0.difficulty=p_difficulty)
  ),
  paged as materialized (
    select q0.id,q0.created_at
    from candidate_ids ids
    join public.questions q0 on q0.id=ids.id
    order by q0.created_at desc
    limit greatest(1,least(coalesce(p_limit,100),100))
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
  order by page.created_at desc;
end;
$function$;

reset lock_timeout;
reset statement_timeout;

-- CREATE OR REPLACE retains ACLs; repeat the closed public boundary explicitly.
revoke all on function public.rpc_teacher_question_browser(jsonb) from public,anon;
revoke all on function public.rpc_teacher_question_facets(text,smallint[]) from public,anon;
revoke all on function public.get_all_active_questions(text,text,uuid,integer,integer) from public,anon;
revoke all on function public.rpc_teacher_questions_by_ids(uuid[],text,text,uuid,integer,integer) from public,anon;
