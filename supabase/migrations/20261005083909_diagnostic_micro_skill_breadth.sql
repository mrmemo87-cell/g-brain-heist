-- Diagnostic breadth follows approved atomic skills, never generic process labels.
-- Replaces private helpers only; public RPC authorization and immutable snapshots
-- remain intact. No historical questions, assignments or evidence are rewritten.
set lock_timeout='5s';

create or replace function private.teacher_diagnostic_candidate_pool(
  p_actor uuid,
  p_school_id uuid,
  p_group_id uuid
)
returns table(
  question_id uuid,
  difficulty text,
  skill_key text,
  recently_used boolean
)
language sql
stable
security definer
set search_path=''
as $$
  with group_context as (
    select *
    from private.teacher_current_teaching_groups(p_actor,p_school_id) group_row
    where group_row.group_id=p_group_id
      and group_row.can_create
    limit 1
  )
  select
    q.id,
    q.difficulty,
    coalesce(registry_subskill.code,diagnostic_subskill.code) as skill_key,
    exists(
      select 1
      from public.assignments previous_assignment
      join public.assignment_questions previous_question
        on previous_question.assignment_id=previous_assignment.id
       and previous_question.question_id=q.id
      where previous_assignment.subject_group_id=gc.group_id
        and previous_assignment.publish_status='published'
        and previous_assignment.created_at >= now()-interval '90 days'
    ) as recently_used
  from group_context gc
  join public.questions q
    on q.academic_subject_id=gc.academic_subject_id
  -- Resolve one current approved atomic mapping per item. Broad labels such as
  -- "Applied understanding" are cognitive processes, not skills.
  left join lateral (
    select subskill.code
    from public.verified_question_registry_taxonomy taxonomy
    join public.academic_skill_registry_versions registry
      on registry.id=taxonomy.registry_version_id
      and registry.status='published'
      and registry.subject_key=gc.academic_subject_code
    join public.academic_skill_registry_nodes skill
      on skill.id=taxonomy.primary_skill_node_id
      and skill.registry_version_id=registry.id
      and skill.node_type='skill' and skill.status='active'
    join public.academic_skill_registry_nodes subskill
      on subskill.id=taxonomy.atomic_subskill_node_id
      and subskill.registry_version_id=registry.id
      and subskill.parent_id=skill.id
      and subskill.node_type='subskill' and subskill.status='active'
    join public.academic_skill_evidence_focuses focus
      on focus.id=taxonomy.evidence_focus_id
      and focus.registry_version_id=registry.id
      and focus.atomic_subskill_node_id=subskill.id
      and focus.status='active'
    where taxonomy.question_id=q.id
      and taxonomy.question_content_hash=q.current_content_hash
      and taxonomy.review_status='approved'
      and not taxonomy.human_review_required
    order by registry.effective_from desc nulls last,
      taxonomy.created_at desc,taxonomy.id desc
    limit 1
  ) registry_subskill on true
  left join lateral (
    select taxonomy.atomic_subskill_code as code
    from private.active_verified_question_diagnostic_taxonomy taxonomy
    where taxonomy.question_id=q.id
      and taxonomy.question_content_hash=q.current_content_hash
      and nullif(trim(taxonomy.atomic_subskill_code),'') is not null
    order by taxonomy.created_at desc,taxonomy.id desc
    limit 1
  ) diagnostic_subskill on true
  where gc.grade_level~'^[0-9]+$'
    and gc.academic_year_id is not null
    and q.question_type='multiple_choice'
    and case when jsonb_typeof(q.options)='array'
      then jsonb_array_length(q.options)=4 else false end
    and coalesce(registry_subskill.code,diagnostic_subskill.code) is not null
    and q.is_active
    and q.pool_scope='global'
    and q.content_origin='brain_heist'
    and q.verification_status='verified'
    and q.analytics_eligible
    and q.is_public
    and q.owner_school_id is null
    and q.current_content_hash=q.verified_content_hash
    and gc.grade_level::smallint=any(q.eligible_grade_levels)
    and coalesce(q.explanation,'') !~* '\m(option|answer)\s+[A-D]\M'
    and (
      select count(*)
      from jsonb_array_elements_text(
        case when jsonb_typeof(q.options)='array' then q.options else '[]'::jsonb end
      ) option_value(value)
      where lower(trim(option_value.value))=lower(trim(q.correct_answer))
    )=1
    and private.verified_question_has_curriculum_mapping(
      q.id,
      p_school_id,
      gc.academic_year_id,
      gc.grade_level,
      gc.academic_subject_id
    );
$$;

revoke all on function private.teacher_diagnostic_candidate_pool(uuid,uuid,uuid)
from public,anon,authenticated,service_role;

create or replace function private.select_teacher_diagnostic_questions(
  p_actor uuid,
  p_school_id uuid,
  p_group_id uuid,
  p_question_count integer,
  p_seed text
)
returns uuid[]
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_selected uuid[];
  v_selected_count integer;
begin
  if p_question_count not in (10,20,30,40) then
    raise exception using errcode='22023',message='unsupported_diagnostic_question_count';
  end if;

  with candidates as (
    select *
    from private.teacher_diagnostic_candidate_pool(p_actor,p_school_id,p_group_id)
  ),
  skill_rounds as (
    select
      candidate.*,
      row_number() over(
        partition by candidate.skill_key
        order by candidate.recently_used,
          md5(p_seed||':skill:'||candidate.question_id::text)
      ) as skill_round
    from candidates candidate
  ),
  difficulty_ranked as (
    select
      skill_rounds.*,
      row_number() over(
        partition by skill_rounds.difficulty
        order by skill_rounds.recently_used,
          skill_rounds.skill_round,
          md5(p_seed||':difficulty:'||skill_rounds.question_id::text)
      ) as difficulty_rank,
      case skill_rounds.difficulty
        when 'medium' then 0.60
        when 'easy' then 0.20
        when 'hard' then 0.20
        else 0.10
      end as difficulty_weight
    from skill_rounds
  ),
  chosen as (
    select ranked.question_id
    from difficulty_ranked ranked
    order by
      -- Cover distinct atomic skills before taking a second item from any skill.
      ranked.skill_round,
      ranked.recently_used,
      ranked.difficulty_rank / greatest(ranked.difficulty_weight,0.01),
      md5(p_seed||':pick:'||ranked.question_id::text)
    limit p_question_count
  )
  select
    coalesce(array_agg(question_id order by md5(p_seed||':order:'||question_id::text)),'{}'::uuid[]),
    count(*)::integer
  into v_selected,v_selected_count
  from chosen;

  if v_selected_count<>p_question_count then
    raise exception using errcode='23514',
      message='diagnostic_pool_insufficient',
      detail='requested='||p_question_count::text||'; available='||v_selected_count::text;
  end if;

  return v_selected;
end;
$$;

revoke all on function private.select_teacher_diagnostic_questions(
  uuid,uuid,uuid,integer,text
) from public,anon,authenticated,service_role;


comment on function private.teacher_diagnostic_candidate_pool(uuid,uuid,uuid) is
  'Current governed MCQs keyed by approved atomic subskill. Drafts do not count as student exposure.';
comment on function private.select_teacher_diagnostic_questions(uuid,uuid,uuid,integer,text) is
  'Prioritize atomic skill breadth, then freshness within each skill, with difficulty diversity and seeded form ordering.';
reset lock_timeout;
