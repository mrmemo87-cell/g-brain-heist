-- When several Evidence Focus observations exist for the same canonical subskill
-- at the latest assessment moment, target the weakest well-supported focus deterministically.

CREATE OR REPLACE FUNCTION public.rpc_teacher_student_intervention_intelligence(p_student_id uuid, p_subject text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_caller uuid := auth.uid();
  v_school_id uuid;
  v_year_id uuid;
  v_context record;
  v_result jsonb;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;

  select u.school_id into v_school_id
  from public.users u
  where u.id = p_student_id;
  if v_school_id is null then
    raise exception 'Student is not attached to a school';
  end if;

  v_year_id := public.academic_resolve_operational_year_id(v_school_id, now());
  select * into v_context
  from private.student_current_academic_context(p_student_id, v_year_id);

  if p_subject is not null then
    if not public.student_learning_can_manage_intervention(p_student_id, p_subject) then
      raise exception 'Not authorised for this student and subject';
    end if;
  elsif not exists (
    select 1
    from public.school_members sm
    where sm.school_id = v_school_id
      and sm.user_id = v_caller
      and sm.status = 'active'
      and sm.role_in_school = 'school_admin'
  ) and not exists (
    select 1
    from private.teacher_current_teaching_roster(v_caller, v_school_id) r
    where r.student_id = p_student_id
  ) and not (
    not exists (
      select 1 from private.teacher_current_teaching_groups(v_caller, v_school_id)
    )
    and exists (
      select 1
      from public.class_students cs
      join public.class_teacher_assignments cta
        on cta.class_id = cs.class_id
       and cta.school_id = v_school_id
       and cta.teacher_user_id = v_caller
       and cta.active is true
      where cs.student_id = p_student_id
    )
  ) then
    raise exception 'Not authorised for this student';
  end if;

  with allowed_subjects as (
    select distinct lower(trim(r.school_subject_name)) as subject
    from private.teacher_current_teaching_roster(v_caller, v_school_id) r
    where r.student_id = p_student_id

    union

    select distinct lower(trim(r.academic_subject_name)) as subject
    from private.teacher_current_teaching_roster(v_caller, v_school_id) r
    where r.student_id = p_student_id
      and nullif(trim(r.academic_subject_name), '') is not null

    union

    select distinct lower(trim(cta.subject)) as subject
    from public.class_students cs
    join public.class_teacher_assignments cta
      on cta.class_id = cs.class_id
     and cta.school_id = v_school_id
     and cta.teacher_user_id = v_caller
     and cta.active is true
    where cs.student_id = p_student_id
      and not exists (
        select 1 from private.teacher_current_teaching_groups(v_caller, v_school_id)
      )
  ),
  current_focus_candidates as (
    select f.*
    from public.student_learning_focus_states f
    where f.school_id = v_school_id
      and f.student_id = p_student_id
      and f.academic_year_id = v_year_id
      and f.current_status in ('new_focus', 'recurring', 'persistent', 'improving')
      and (p_subject is null or lower(trim(f.subject)) = lower(trim(p_subject)))
      and (
        exists (
          select 1
          from public.school_members sm
          where sm.school_id = v_school_id
            and sm.user_id = v_caller
            and sm.status = 'active'
            and sm.role_in_school = 'school_admin'
        )
        or lower(trim(f.subject)) in (select subject from allowed_subjects)
      )
      and exists (
        select 1
        from public.student_learning_observations qualified
        where qualified.student_id = f.student_id
          and qualified.skill_key = f.skill_key
          and qualified.academic_year_id = v_year_id
          and qualified.observed_at >= coalesce(v_context.context_start_at, '-infinity'::timestamptz)
          and public.student_learning_observation_is_qualified(
            qualified.source_type,
            qualified.contributes_to_focus_state,
            qualified.evidence
          )
          and (
            qualified.grade_level_at_time is null
            or v_context.grade_level is null
            or nullif(regexp_replace(qualified.grade_level_at_time, '\D', '', 'g'), '')
               = nullif(regexp_replace(v_context.grade_level, '\D', '', 'g'), '')
          )
          and (
            qualified.class_code_at_time is null
            or v_context.class_code is null
            or upper(regexp_replace(qualified.class_code_at_time, '\s', '', 'g'))
               = upper(regexp_replace(v_context.class_code, '\s', '', 'g'))
          )
      )
  ),
  focus as (
    select
      f.*,
      greatest(0, current_date - f.last_observed_at::date)::integer as days_since_evidence,
      coalesce((question_set.payload->>'available_question_count')::integer, 0) as available_questions,
      coalesce((question_set.payload->>'available_exact_question_count')::integer, 0) as available_exact_questions,
      coalesce((question_set.payload->>'available_related_question_count')::integer, 0) as available_related_questions,
      coalesce((question_set.payload->>'available_same_subskill_question_count')::integer, 0) as available_same_subskill_questions,
      coalesce((question_set.payload->>'available_broader_skill_question_count')::integer, 0) as available_broader_skill_questions,
      focus_detail.evidence_focus_code,
      focus_detail.evidence_focus_name,
      coalesce(question_set.payload->'recommended_question_ids', '[]'::jsonb) as recommended_question_ids,
      coalesce(question_set.payload->'exact_question_ids', '[]'::jsonb) as exact_question_ids,
      coalesce(question_set.payload->'related_question_ids', '[]'::jsonb) as related_question_ids,
      coalesce(question_set.payload->'same_subskill_question_ids', '[]'::jsonb) as same_subskill_question_ids,
      coalesce(question_set.payload->'broader_skill_question_ids', '[]'::jsonb) as broader_skill_question_ids
    from current_focus_candidates f
    left join lateral (
      select
        nullif(trim(o.evidence->>'evidence_focus_code'),'') as evidence_focus_code,
        nullif(trim(o.evidence->>'evidence_focus_name'),'') as evidence_focus_name
      from public.student_learning_observations o
      where o.student_id=f.student_id
        and o.skill_key=f.skill_key
        and o.academic_year_id=v_year_id
        and o.observation_type='focus'
        and nullif(trim(o.evidence->>'evidence_focus_code'),'') is not null
        and o.observed_at >= coalesce(v_context.context_start_at,'-infinity'::timestamptz)
        and public.student_learning_observation_is_qualified(
          o.source_type,o.contributes_to_focus_state,o.evidence
        )
      order by o.observed_at desc,
               o.evidence_percentage asc nulls last,
               o.evidence_count desc,
               o.created_at desc,
               o.id desc
      limit 1
    ) focus_detail on true
    cross join lateral (
      select private.verified_questions_for_learning_focus(
        p_student_id, f.subject, f.skill_key, f.topic, f.skill, f.subskill,
        focus_detail.evidence_focus_code
      ) as payload
    ) question_set
  ),
  recommendations as (
    select
      f.*,
      case
        when f.days_since_evidence >= 60 then 'reassessment'
        when lower(f.subject) = 'english' and lower(coalesce(f.topic, '')) like 'writing%' then 'writing_practice'
        when f.skill_key like 'diagnostic:%' and f.available_exact_questions >= 1 then 'targeted_question_practice'
        when f.available_questions >= 5 then 'targeted_question_practice'
        else 'teacher_support'
      end as recommended_type,
      case
        when f.days_since_evidence >= 60 then format('%s was previously identified as %s, but the latest qualifying evidence is %s days old. Reassess before assuming the difficulty is still current.', coalesce(f.evidence_focus_name, f.subskill, coalesce(f.evidence_focus_name, f.subskill, f.skill)), replace(f.current_status, '_', ' '), f.days_since_evidence)
        when f.current_status = 'persistent' then format('%s remains a persistent focus area across %s qualifying evidence items. The latest evidence was recorded on %s.', coalesce(f.evidence_focus_name, f.subskill, coalesce(f.evidence_focus_name, f.subskill, f.skill)), f.evidence_items, to_char(f.last_observed_at, 'DD Mon YYYY'))
        when f.current_status = 'recurring' then format('%s has recurred across %s qualifying evidence items and should be reinforced before it becomes persistent.', coalesce(f.evidence_focus_name, f.subskill, coalesce(f.evidence_focus_name, f.subskill, f.skill)), f.evidence_items)
        when f.current_status = 'improving' then format('%s is improving. Reinforce the successful approach and continue monitoring before closing the focus area.', coalesce(f.evidence_focus_name, f.subskill, f.skill))
        else format('%s is a newly detected focus area. Use targeted practice and gather more evidence before labelling it persistent.', coalesce(f.evidence_focus_name, f.subskill, f.skill))
      end as rationale,
      case
        when f.days_since_evidence >= 60 then format('Collect fresh evidence for %s and confirm whether targeted support is still required.', coalesce(f.evidence_focus_name, f.subskill, f.skill))
        when f.current_status = 'persistent' then format('Move %s from persistent to improving through repeated successful evidence.', coalesce(f.evidence_focus_name, f.subskill, f.skill))
        when f.current_status = 'recurring' then format('Achieve consistent successful evidence in %s across the next assessed tasks.', coalesce(f.evidence_focus_name, f.subskill, f.skill))
        else format('Strengthen %s while monitoring the next assessed tasks.', coalesce(f.evidence_focus_name, f.subskill, f.skill))
      end as suggested_goal
    from focus f
  )
  select jsonb_build_object(
    'student', jsonb_build_object(
      'id', u.id,
      'name', coalesce(nullif(trim(u.full_name), ''), u.username),
      'grade', coalesce(v_context.grade_level, u.grade::text),
      'class_name', coalesce(v_context.class_code, u.batch),
      'school_id', u.school_id
    ),
    'question_authority', 'brains_heist_verified_only',
    'recommendations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'subject', r.subject, 'topic', r.topic, 'skill', r.skill, 'skill_key', r.skill_key,
        'status', r.current_status, 'trend', r.trend, 'priority', r.priority,
        'evidence_items', r.evidence_items, 'focus_occurrences', r.focus_occurrences,
        'last_observed_at', r.last_observed_at, 'days_since_evidence', r.days_since_evidence,
        'available_questions', r.available_questions,
        'available_exact_questions', r.available_exact_questions,
        'available_related_questions', r.available_related_questions,
        'available_same_subskill_questions', r.available_same_subskill_questions,
        'available_broader_skill_questions', r.available_broader_skill_questions,
        'evidence_focus_code', r.evidence_focus_code,
        'evidence_focus_name', r.evidence_focus_name,
        'recommended_question_ids', r.recommended_question_ids,
        'exact_question_ids', r.exact_question_ids,
        'related_question_ids', r.related_question_ids,
        'same_subskill_question_ids', r.same_subskill_question_ids,
        'broader_skill_question_ids', r.broader_skill_question_ids,
        'recommended_type', r.recommended_type,
        'rationale', r.rationale, 'suggested_goal', r.suggested_goal,
        'has_open_intervention', exists (
          select 1 from public.student_learning_interventions i
          where i.student_id = p_student_id and i.skill_key = r.skill_key
            and i.academic_year_id = v_year_id and i.status in ('planned', 'active')
            and public.student_learning_can_manage_intervention(i.student_id, i.subject)
        )
      ) order by case r.priority when 'high' then 1 when 'medium' then 2 else 3 end, r.days_since_evidence desc, r.skill)
      from recommendations r
    ), '[]'::jsonb),
    'interventions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'subject', i.subject, 'skill', i.skill, 'skill_key', i.skill_key,
        'topic', i.topic, 'intervention_type', i.intervention_type, 'status', i.status,
        'rationale', i.rationale, 'goal', i.goal, 'baseline_status', i.baseline_status,
        'baseline_evidence_items', i.baseline_evidence_items,
        'baseline_last_observed_at', i.baseline_last_observed_at,
        'target_date', i.target_date, 'created_at', i.created_at,
        'started_at', i.started_at, 'completed_at', i.completed_at,
        'outcome_status', i.outcome_status, 'outcome_note', i.outcome_note
      ) order by case i.status when 'active' then 1 when 'planned' then 2 else 3 end, i.created_at desc)
      from public.student_learning_interventions i
      where i.school_id = v_school_id and i.student_id = p_student_id
        and i.academic_year_id = v_year_id
        and (p_subject is null or lower(i.subject) = lower(p_subject))
        and public.student_learning_can_manage_intervention(i.student_id, i.subject)
    ), '[]'::jsonb),
    'academicYearId', v_year_id,
    'historicalInterventionsExcluded', true,
    'currentPlacementContextStartAt', v_context.context_start_at,
    'historicalPlacementSignalsExcluded', true
  ) into v_result
  from public.users u where u.id = p_student_id;

  return coalesce(v_result, '{}'::jsonb);
end;
$function$
;

revoke all on function public.rpc_teacher_student_intervention_intelligence(uuid,text)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_student_intervention_intelligence(uuid,text)
to authenticated,service_role;

