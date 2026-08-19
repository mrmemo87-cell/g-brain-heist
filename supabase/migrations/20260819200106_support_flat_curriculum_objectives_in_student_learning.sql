-- Allow Student Learning Memory to ingest both legacy hierarchical objectives
-- (topic -> skill -> subskill) and modern governed flat strand/objective curricula.
--
-- This keeps verified-question authority and approved curriculum mapping gates intact,
-- while deriving a meaningful skill label from governed question metadata when the
-- mapped objective sits directly on a strand node.

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
set search_path = ''
as $$
declare
  v_assignment record;
  v_school_id uuid;
  v_expected_count integer := 0;
  v_answered_count integer := 0;
  v_group record;
  v_percentage numeric;
  v_kind text;
  v_skill_key text;
  v_source_key text;
  v_quality text;
  v_contributes boolean;
begin
  if p_assignment_id is null or p_student_id is null or p_completed_at is null then return; end if;

  select a.school_id, a.class_id, a.teacher_id, a.title, a.difficulty,
    a.academic_year_id, a.academic_term_id, a.academic_subject_id,
    a.grade_level_snapshot, a.class_code_snapshot,
    coalesce(nullif(trim(a.subject_name), ''), nullif(trim(a.subject), ''),
      nullif(trim(a.subject_id), ''), 'General') as subject_name,
    sa.status, r.correct, r.incorrect, count(aq.question_id)::integer as expected_count
  into v_assignment
  from public.assignments a
  join public.student_assignments sa on sa.assignment_id = a.id and sa.student_id = p_student_id
  join public.student_assignment_results r on r.assignment_id = a.id and r.student_id = p_student_id
  left join public.assignment_questions aq on aq.assignment_id = a.id
  where a.id = p_assignment_id
  group by a.school_id, a.class_id, a.teacher_id, a.title, a.difficulty,
    a.academic_year_id, a.academic_term_id, a.academic_subject_id,
    a.grade_level_snapshot, a.class_code_snapshot, a.subject_name, a.subject,
    a.subject_id, sa.status, r.correct, r.incorrect;

  if not found then return; end if;

  v_expected_count := coalesce(v_assignment.expected_count, 0);
  select count(*)::integer into v_answered_count
  from public.student_assignment_answers saa
  where saa.assignment_id = p_assignment_id and saa.student_id = p_student_id;

  if v_assignment.status <> 'completed' or v_expected_count <= 0
    or v_answered_count <> v_expected_count
    or (coalesce(v_assignment.correct, 0) + coalesce(v_assignment.incorrect, 0)) <> v_expected_count
    or v_assignment.academic_year_id is null or v_assignment.academic_subject_id is null
    or nullif(trim(v_assignment.grade_level_snapshot), '') is null then return; end if;

  select coalesce(v_assignment.school_id, u.school_id) into v_school_id
  from public.users u where u.id = p_student_id;
  if v_school_id is null then return; end if;

  for v_group in
    select
      im.curriculum_objective_id,
      im.curriculum_scope_id,
      o.code as objective_code,
      o.statement as objective_statement,
      objective_node.node_type as curriculum_node_type,
      case
        when objective_node.node_type = 'subskill' and parent_node.node_type = 'skill'
          then coalesce(grandparent_node.name, parent_node.name)
        when objective_node.node_type = 'skill'
          then coalesce(parent_node.name, objective_node.name)
        else objective_node.name
      end as topic_name,
      case
        when objective_node.node_type = 'subskill' and parent_node.node_type = 'skill'
          then parent_node.name
        when objective_node.node_type = 'skill'
          then objective_node.name
        else coalesce(
          case when count(distinct nullif(trim(q.curriculum_skill), '')) = 1
            then min(nullif(trim(q.curriculum_skill), '')) end,
          objective_node.name,
          o.statement
        )
      end as skill_name,
      case
        when objective_node.node_type = 'subskill' then objective_node.name
        else case when count(distinct nullif(trim(q.curriculum_subskill), '')) = 1
          then min(nullif(trim(q.curriculum_subskill), '')) end
      end as subskill_name,
      count(*)::integer as question_count,
      count(*) filter (where saa.is_correct is true)::integer as correct_count,
      array_agg(distinct saa.question_id order by saa.question_id) as question_ids
    from public.student_assignment_answers saa
    join public.assignment_questions aq on aq.assignment_id = saa.assignment_id
      and aq.question_id = saa.question_id and aq.analytics_eligible_snapshot
      and aq.content_origin_snapshot = 'brain_heist'
      and aq.verification_status_snapshot = 'verified'
    join public.questions q on q.id = saa.question_id
      and q.content_origin = 'brain_heist' and q.verification_status = 'verified'
      and q.analytics_eligible and q.is_public
      and q.current_content_hash = q.verified_content_hash
      and aq.question_content_hash = q.verified_content_hash
    join public.curriculum_assessment_items i on i.source_type = 'question_bank'
      and i.source_record_id = saa.question_id::text and i.source_item_key = 'question'
      and i.is_active and i.content_hash = q.verified_content_hash
    join public.school_curriculum_scope_mappings scm on scm.school_id = v_school_id
      and scm.academic_year_id = v_assignment.academic_year_id
      and scm.grade_level = v_assignment.grade_level_snapshot
      and scm.academic_subject_id = v_assignment.academic_subject_id and scm.status = 'active'
    join public.curriculum_item_objective_mappings im on im.assessment_item_id = i.id
      and im.curriculum_scope_id = scm.curriculum_scope_id
      and im.academic_subject_id = v_assignment.academic_subject_id
      and im.status = 'approved' and im.mapping_role = 'primary'
      and im.item_content_hash = i.content_hash
    join public.curriculum_framework_versions fv on fv.id = im.framework_version_id
      and fv.status in ('published', 'retired')
      and fv.content_hash = im.curriculum_version_content_hash
    join public.curriculum_objectives o on o.id = im.curriculum_objective_id
    join public.curriculum_nodes objective_node on objective_node.id = o.curriculum_node_id
    left join public.curriculum_nodes parent_node on parent_node.id = objective_node.parent_node_id
    left join public.curriculum_nodes grandparent_node on grandparent_node.id = parent_node.parent_node_id
    where saa.assignment_id = p_assignment_id and saa.student_id = p_student_id
    group by im.curriculum_objective_id, im.curriculum_scope_id, o.code, o.statement,
      objective_node.node_type, objective_node.name,
      parent_node.node_type, parent_node.name, grandparent_node.name
  loop
    if v_group.question_count <= 0 then continue; end if;

    v_percentage := round((v_group.correct_count::numeric / v_group.question_count::numeric) * 100, 2);
    v_kind := case when v_percentage < 60 then 'focus'
      when v_percentage >= 80 then 'strength' else 'developing' end;
    v_quality := case when v_group.question_count < 3 then 'provisional'
      when v_group.question_count < 6 then 'standard' else 'strong' end;
    v_contributes := v_group.question_count >= 3;
    v_skill_key := concat_ws(':', 'objective', v_group.curriculum_objective_id::text);
    v_source_key := concat_ws(':', 'assignment', p_assignment_id::text,
      'objective', v_group.curriculum_objective_id::text);

    insert into public.student_learning_observations (
      school_id, student_id, subject, topic, skill, subskill, skill_key,
      observation_type, source_type, source_id, source_key, observed_at,
      evidence_percentage, evidence_count, evidence_quality,
      contributes_to_focus_state, evidence, system_generated
    ) values (
      v_school_id, p_student_id, v_assignment.subject_name, v_group.topic_name,
      v_group.skill_name, v_group.subskill_name, v_skill_key, v_kind,
      'assignment_result', p_assignment_id, v_source_key, p_completed_at,
      v_percentage, v_group.question_count, v_quality, v_contributes,
      jsonb_build_object(
        'source_label', 'Brains Heist Verified assignment evidence',
        'assignment_id', p_assignment_id, 'assignment_title', v_assignment.title,
        'class_id', v_assignment.class_id, 'class_code', v_assignment.class_code_snapshot,
        'teacher_id', v_assignment.teacher_id, 'academic_year_id', v_assignment.academic_year_id,
        'academic_term_id', v_assignment.academic_term_id,
        'academic_subject_id', v_assignment.academic_subject_id,
        'grade_level', v_assignment.grade_level_snapshot,
        'curriculum_scope_id', v_group.curriculum_scope_id,
        'curriculum_objective_id', v_group.curriculum_objective_id,
        'objective_code', v_group.objective_code, 'objective', v_group.objective_statement,
        'curriculum_node_type', v_group.curriculum_node_type,
        'strand_topic', v_group.topic_name, 'skill', v_group.skill_name,
        'subskill', v_group.subskill_name, 'question_ids', to_jsonb(v_group.question_ids),
        'verified_question_count', v_group.question_count,
        'correct', v_group.correct_count,
        'incorrect', v_group.question_count - v_group.correct_count,
        'question_count', v_group.question_count,
        'expected_question_count', v_expected_count,
        'answered_question_count', v_answered_count,
        'overall_accuracy', p_accuracy, 'overall_score', p_score,
        'classification_thresholds', jsonb_build_object('focus_below', 60, 'strength_from', 80),
        'evidence_quality', v_quality, 'contributes_to_focus_state', v_contributes,
        'evidence_provenance', 'brains_heist_verified_question'
      ), true
    ) on conflict (student_id, source_key) do update set
      observed_at = excluded.observed_at,
      observation_type = excluded.observation_type,
      evidence_percentage = excluded.evidence_percentage,
      evidence_count = excluded.evidence_count,
      evidence_quality = excluded.evidence_quality,
      contributes_to_focus_state = excluded.contributes_to_focus_state,
      evidence = excluded.evidence;
  end loop;
end;
$$;

revoke all on function public.student_learning_ingest_assignment_result(uuid,uuid,timestamptz,integer,integer)
  from public, anon, authenticated;
grant execute on function public.student_learning_ingest_assignment_result(uuid,uuid,timestamptz,integer,integer)
  to service_role;

comment on function public.student_learning_ingest_assignment_result(uuid,uuid,timestamptz,integer,integer) is
  'Creates official objective evidence from immutable Brains Heist Verified question snapshots with current approved curriculum mappings. Supports both legacy topic-skill-subskill hierarchies and modern flat governed strand/objective curricula.';
