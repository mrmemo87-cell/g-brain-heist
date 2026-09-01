-- Keep targeted-practice recommendations aligned to the governed weak area.
--
-- Diagnostic weaknesses remain exact at the atomic-subskill level. For broad
-- curriculum objectives, a question is exact only when its verified metadata
-- also aligns with the intervention skill label. Other questions mapped to the
-- same broad objective remain available as related practice but are never
-- silently auto-selected.

create or replace function private.verified_questions_for_learning_focus(
  p_student_id uuid,
  p_subject text,
  p_skill_key text,
  p_topic text,
  p_skill text,
  p_subskill text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
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
        ) then 2
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
    'available_related_question_count', (select count(*) from matched where match_tier = 2),
    'exact_question_ids', coalesce((
      select jsonb_agg(question_id order by question_id)
      from matched where match_tier = 1
    ), '[]'::jsonb),
    'related_question_ids', coalesce((
      select jsonb_agg(question_id order by question_id)
      from matched where match_tier = 2
    ), '[]'::jsonb),
    'recommended_question_ids', coalesce((
      select jsonb_agg(question_id order by question_id)
      from recommended
    ), '[]'::jsonb)
  );
$$;

comment on function private.verified_questions_for_learning_focus(uuid,text,text,text,text,text) is
  'Returns governed intervention-practice question matches. Diagnostic atomic-subskill and objective label-aligned matches are exact; broader governed matches are related only. Automatic recommendations contain exact matches only.';
