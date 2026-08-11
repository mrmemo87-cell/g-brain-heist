-- Assignment results contribute to the academic profile only through the exact
-- approved objective mapping for the assignment's school/year/grade/subject scope.
-- Free-text topic tags remain display metadata; they are no longer the analytical key.

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

  select
    a.school_id, a.class_id, a.teacher_id, a.title, a.difficulty,
    a.academic_year_id, a.academic_term_id, a.academic_subject_id,
    a.grade_level_snapshot, a.class_code_snapshot,
    coalesce(nullif(trim(a.subject_name), ''), nullif(trim(a.subject), ''),
      nullif(trim(a.subject_id), ''), 'General') as subject_name,
    sa.status, r.correct, r.incorrect,
    count(aq.question_id)::integer as expected_count
  into v_assignment
  from public.assignments a
  join public.student_assignments sa
    on sa.assignment_id = a.id and sa.student_id = p_student_id
  join public.student_assignment_results r
    on r.assignment_id = a.id and r.student_id = p_student_id
  left join public.assignment_questions aq on aq.assignment_id = a.id
  where a.id = p_assignment_id
  group by a.school_id, a.class_id, a.teacher_id, a.title, a.difficulty,
    a.academic_year_id, a.academic_term_id, a.academic_subject_id,
    a.grade_level_snapshot, a.class_code_snapshot,
    a.subject_name, a.subject, a.subject_id,
    sa.status, r.correct, r.incorrect;
  if not found then return; end if;

  v_expected_count := coalesce(v_assignment.expected_count, 0);
  select count(*)::integer into v_answered_count
  from public.student_assignment_answers saa
  where saa.assignment_id = p_assignment_id and saa.student_id = p_student_id;

  if v_assignment.status <> 'completed'
     or v_expected_count <= 0
     or v_answered_count <> v_expected_count
     or (coalesce(v_assignment.correct, 0) + coalesce(v_assignment.incorrect, 0)) <> v_expected_count
     or v_assignment.academic_year_id is null
     or v_assignment.academic_subject_id is null
     or nullif(trim(v_assignment.grade_level_snapshot), '') is null then
    return;
  end if;

  select coalesce(v_assignment.school_id, u.school_id) into v_school_id
  from public.users u where u.id = p_student_id;
  if v_school_id is null then return; end if;

  for v_group in
    select
      im.curriculum_objective_id,
      im.curriculum_scope_id,
      o.code as objective_code,
      o.statement as objective_statement,
      topic_node.name as topic_name,
      skill_node.name as skill_name,
      subskill_node.name as subskill_name,
      count(*)::integer as question_count,
      count(*) filter (where saa.is_correct is true)::integer as correct_count,
      array_agg(distinct saa.question_id order by saa.question_id) as question_ids
    from public.student_assignment_answers saa
    join public.curriculum_assessment_items i
      on i.source_type = 'question_bank'
      and i.source_record_id = saa.question_id::text
      and i.source_item_key = 'question'
      and i.is_active
    join public.school_curriculum_scope_mappings scm
      on scm.school_id = v_school_id
      and scm.academic_year_id = v_assignment.academic_year_id
      and scm.grade_level = v_assignment.grade_level_snapshot
      and scm.academic_subject_id = v_assignment.academic_subject_id
      and scm.status = 'active'
    join public.curriculum_item_objective_mappings im
      on im.assessment_item_id = i.id
      and im.curriculum_scope_id = scm.curriculum_scope_id
      and im.academic_subject_id = v_assignment.academic_subject_id
      and im.status = 'approved' and im.mapping_role = 'primary'
      and im.item_content_hash = i.content_hash
    join public.curriculum_framework_versions fv
      on fv.id = im.framework_version_id and fv.status in ('published', 'retired')
      and fv.content_hash = im.curriculum_version_content_hash
    join public.curriculum_objectives o on o.id = im.curriculum_objective_id
    join public.curriculum_nodes subskill_node
      on subskill_node.id = o.curriculum_node_id and subskill_node.node_type = 'subskill'
    join public.curriculum_nodes skill_node
      on skill_node.id = subskill_node.parent_node_id and skill_node.node_type = 'skill'
    join public.curriculum_nodes topic_node
      on topic_node.id = skill_node.parent_node_id and topic_node.node_type = 'topic'
    where saa.assignment_id = p_assignment_id and saa.student_id = p_student_id
    group by im.curriculum_objective_id, im.curriculum_scope_id,
      o.code, o.statement, topic_node.name, skill_node.name, subskill_node.name
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
      v_school_id, p_student_id, v_assignment.subject_name,
      v_group.topic_name, v_group.skill_name, v_group.subskill_name, v_skill_key,
      v_kind, 'assignment_result', p_assignment_id, v_source_key, p_completed_at,
      v_percentage, v_group.question_count, v_quality, v_contributes,
      jsonb_build_object(
        'source_label', 'School assignment',
        'assignment_id', p_assignment_id,
        'assignment_title', v_assignment.title,
        'class_id', v_assignment.class_id,
        'class_code', v_assignment.class_code_snapshot,
        'teacher_id', v_assignment.teacher_id,
        'academic_year_id', v_assignment.academic_year_id,
        'academic_term_id', v_assignment.academic_term_id,
        'academic_subject_id', v_assignment.academic_subject_id,
        'grade_level', v_assignment.grade_level_snapshot,
        'curriculum_scope_id', v_group.curriculum_scope_id,
        'curriculum_objective_id', v_group.curriculum_objective_id,
        'objective_code', v_group.objective_code,
        'objective', v_group.objective_statement,
        'strand_topic', v_group.topic_name,
        'skill', v_group.skill_name,
        'subskill', v_group.subskill_name,
        'question_ids', to_jsonb(v_group.question_ids),
        'correct', v_group.correct_count,
        'incorrect', v_group.question_count - v_group.correct_count,
        'question_count', v_group.question_count,
        'expected_question_count', v_expected_count,
        'answered_question_count', v_answered_count,
        'overall_accuracy', p_accuracy,
        'overall_score', p_score,
        'classification_thresholds', jsonb_build_object('focus_below', 60, 'strength_from', 80),
        'evidence_quality', v_quality,
        'contributes_to_focus_state', v_contributes,
        'evidence_provenance', 'approved_question_objective_mapping'
      ),
      true
    )
    on conflict (student_id, source_key) do update set
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

revoke all on function public.student_learning_ingest_assignment_result(uuid, uuid, timestamptz, integer, integer)
  from public, anon, authenticated;
grant execute on function public.student_learning_ingest_assignment_result(uuid, uuid, timestamptz, integer, integer)
  to service_role;

comment on function public.student_learning_ingest_assignment_result(uuid, uuid, timestamptz, integer, integer) is
  'Creates objective-level academic evidence only from complete school assignments whose questions have current approved mappings in the student grade scope. Standalone game practice never enters the longitudinal academic profile.';

notify pgrst, 'reload schema';
