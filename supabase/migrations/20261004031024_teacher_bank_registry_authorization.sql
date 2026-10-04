-- Admit hash-bound approved registry taxonomy alongside legacy curriculum mappings.
-- Preserve active teacher allocation, operational year, grade and pool boundaries.
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
  authorized_verified as materialized (
    select distinct q0.id
    from public.questions q0
    join authorized_scopes scope
      on scope.academic_subject_id=q0.academic_subject_id
      and scope.grade_level::smallint=any(q0.eligible_grade_levels)
    where (exists (
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
      and (p_difficulty is null or q0.difficulty=p_difficulty)
  ),
  candidate_ids as materialized (
    select av.id from authorized_verified av
    union
    select q0.id
    from public.questions q0
    where q0.is_active and q0.pool_scope='teacher'
      and q0.content_origin='teacher' and q0.teacher_id=v_teacher
      and (p_subject is null or lower(trim(q0.subject))=lower(trim(p_subject)))
      and (p_difficulty is null or q0.difficulty=p_difficulty)
  ),
  paged as materialized (
    select q0.id,q0.created_at
    from candidate_ids ids
    join public.questions q0 on q0.id=ids.id
    order by q0.created_at desc
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
  order by page.created_at desc;
end;
$function$
;

revoke all on function public.get_all_active_questions(text,text,uuid,integer,integer) from public,anon;
grant execute on function public.get_all_active_questions(text,text,uuid,integer,integer) to authenticated,service_role;
