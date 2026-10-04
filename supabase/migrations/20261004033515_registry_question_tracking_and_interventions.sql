create or replace function private.verified_question_has_registry_mapping(p_question_id uuid)
returns boolean language sql stable security definer set search_path to '' as $function$
 select exists (
 select 1 from public.questions q
 join public.verified_question_registry_taxonomy tx on tx.question_id=q.id
   and tx.question_content_hash=q.verified_content_hash
   and tx.review_status='approved' and not tx.human_review_required
 join public.academic_skill_registry_versions rv on rv.id=tx.registry_version_id
   and rv.status='published' and rv.subject_key=public.academic_normalize_subject_key(q.subject)
 join public.academic_skill_registry_nodes skill on skill.id=tx.primary_skill_node_id
   and skill.registry_version_id=rv.id and skill.node_type='skill' and skill.status='active'
 join public.academic_skill_registry_nodes subskill on subskill.id=tx.atomic_subskill_node_id
   and subskill.registry_version_id=rv.id and subskill.parent_id=skill.id
   and subskill.node_type='subskill' and subskill.status='active'
 join public.academic_skill_evidence_focuses focus on focus.id=tx.evidence_focus_id
   and focus.registry_version_id=rv.id and focus.atomic_subskill_node_id=subskill.id and focus.status='active'
 where q.id=p_question_id and q.is_active and q.analytics_eligible
   and q.verification_status='verified' and q.current_content_hash=q.verified_content_hash
 );
$function$;
revoke all on function private.verified_question_has_registry_mapping(uuid) from public,anon,authenticated;
grant execute on function private.verified_question_has_registry_mapping(uuid) to service_role;

CREATE OR REPLACE FUNCTION private.verified_questions_for_learning_focus(p_student_id uuid, p_subject text, p_skill_key text, p_topic text, p_skill text, p_subskill text, p_evidence_focus_code text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with student_context as (
    select student.id, student.school_id,
      nullif(regexp_replace(coalesce(student.grade::text, ''), '\D', '', 'g'), '') as grade_level,
      case when student.school_id is null then null::uuid
        else public.academic_resolve_operational_year_id(student.school_id, now()) end as academic_year_id
    from public.users student
    where student.id = p_student_id
  ),
  candidates as (
    select q.id as question_id,
      case
        when p_skill_key like 'registry:%' and exists (select 1 from public.verified_question_registry_taxonomy tx
          join public.academic_skill_registry_versions rv on rv.id=tx.registry_version_id and rv.status='published'
          join public.academic_skill_registry_nodes n on n.id=tx.atomic_subskill_node_id and n.status='active'
          join public.academic_skill_evidence_focuses focus on focus.id=tx.evidence_focus_id and focus.status='active'
          join public.academic_skill_registry_nodes target on target.registry_version_id=rv.id
            and target.code=split_part(p_skill_key,':',3) and target.node_type='subskill' and target.status='active'
          where tx.question_id=q.id and tx.question_content_hash=q.verified_content_hash
            and tx.review_status='approved' and not tx.human_review_required
            and rv.code=split_part(p_skill_key,':',2)
            and rv.subject_key=public.academic_normalize_subject_key(p_subject)
            and n.id=target.id and (nullif(trim(p_evidence_focus_code),'') is null or focus.code=p_evidence_focus_code)) then 1
        when p_skill_key like 'registry:%' and exists (select 1 from public.verified_question_registry_taxonomy tx
          join public.academic_skill_registry_versions rv on rv.id=tx.registry_version_id and rv.status='published'
          join public.academic_skill_registry_nodes n on n.id=tx.atomic_subskill_node_id and n.status='active'
          join public.academic_skill_evidence_focuses focus on focus.id=tx.evidence_focus_id and focus.status='active'
          join public.academic_skill_registry_nodes target on target.registry_version_id=rv.id
            and target.code=split_part(p_skill_key,':',3) and target.node_type='subskill' and target.status='active'
          where tx.question_id=q.id and tx.question_content_hash=q.verified_content_hash
            and tx.review_status='approved' and not tx.human_review_required
            and rv.code=split_part(p_skill_key,':',2)
            and rv.subject_key=public.academic_normalize_subject_key(p_subject)
            and n.id=target.id) then 2
        when p_skill_key like 'registry:%' and exists (select 1 from public.verified_question_registry_taxonomy tx
          join public.academic_skill_registry_versions rv on rv.id=tx.registry_version_id and rv.status='published'
          join public.academic_skill_registry_nodes n on n.id=tx.atomic_subskill_node_id and n.status='active'
          join public.academic_skill_evidence_focuses focus on focus.id=tx.evidence_focus_id and focus.status='active'
          join public.academic_skill_registry_nodes target on target.registry_version_id=rv.id
            and target.code=split_part(p_skill_key,':',3) and target.node_type='subskill' and target.status='active'
          where tx.question_id=q.id and tx.question_content_hash=q.verified_content_hash
            and tx.review_status='approved' and not tx.human_review_required
            and rv.code=split_part(p_skill_key,':',2)
            and rv.subject_key=public.academic_normalize_subject_key(p_subject)
            and n.parent_id=target.parent_id) then 3
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
            and (
              nullif(trim(coalesce(p_evidence_focus_code, '')), '') is null
              or taxonomy.evidence_focus_code = p_evidence_focus_code
            )
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
            and taxonomy.atomic_subskill_code = split_part(p_skill_key, ':', 4)
            and (
              nullif(trim(coalesce(p_evidence_focus_code, '')), '') is null
              or taxonomy.evidence_focus_code is distinct from p_evidence_focus_code
            )
            and not exists (
              select 1
              from public.verified_question_diagnostic_taxonomy successor
              where successor.supersedes_taxonomy_id = taxonomy.id
                and successor.review_status = 'approved'
                and not successor.human_review_required
            )
        ) then 2
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
        ) then 3
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
          and p_skill_key not like 'registry:%'
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
      and (private.verified_question_has_registry_mapping(q.id)
        or private.verified_question_has_curriculum_mapping(
        q.id, context.school_id, context.academic_year_id,
        context.grade_level, q.academic_subject_id
      ))
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
    'available_exact_question_count', (select count(*) from (select question_id from matched where match_tier = 1 order by question_id limit 100) bounded),
    'available_related_question_count', (select count(*) from (select question_id from matched where match_tier > 1 order by question_id limit 100) bounded),
    'available_same_subskill_question_count', (select count(*) from (select question_id from matched where match_tier = 2 order by question_id limit 100) bounded),
    'available_broader_skill_question_count', (select count(*) from (select question_id from matched where match_tier = 3 order by question_id limit 100) bounded),
    'evidence_focus_code', nullif(trim(coalesce(p_evidence_focus_code, '')), ''),
    'exact_question_ids', coalesce((
      select jsonb_agg(question_id order by question_id)
      from (select question_id from matched where match_tier = 1 order by question_id limit 100) bounded
    ), '[]'::jsonb),
    'related_question_ids', coalesce((
      select jsonb_agg(question_id order by question_id)
      from (select question_id from matched where match_tier > 1 order by question_id limit 100) bounded
    ), '[]'::jsonb),
    'same_subskill_question_ids', coalesce((
      select jsonb_agg(question_id order by question_id)
      from (select question_id from matched where match_tier = 2 order by question_id limit 100) bounded
    ), '[]'::jsonb),
    'broader_skill_question_ids', coalesce((
      select jsonb_agg(question_id order by question_id)
      from (select question_id from matched where match_tier = 3 order by question_id limit 100) bounded
    ), '[]'::jsonb),
    'recommended_question_ids', coalesce((
      select jsonb_agg(question_id order by question_id)
      from recommended
    ), '[]'::jsonb)
  );
$function$
;
revoke all on function private.verified_questions_for_learning_focus(uuid,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function private.verified_questions_for_learning_focus(uuid,text,text,text,text,text,text) to service_role;
create or replace function private.verified_questions_for_learning_focus(p_student_id uuid,p_subject text,p_skill_key text,p_topic text,p_skill text,p_subskill text)
returns jsonb language sql stable security definer set search_path to '' as $function$
 select private.verified_questions_for_learning_focus(p_student_id,p_subject,p_skill_key,p_topic,p_skill,p_subskill,null);
$function$;
revoke all on function private.verified_questions_for_learning_focus(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function private.verified_questions_for_learning_focus(uuid,text,text,text,text,text) to service_role;
CREATE OR REPLACE FUNCTION public.rpc_question_curriculum_metadata(p_question_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  if not (
    exists (select 1 from public.teachers t where t.user_id = v_actor)
    or exists (select 1 from public.school_members sm where sm.user_id = v_actor and sm.status = 'active' and sm.role_in_school in ('school_admin','school_head'))
    or public.is_superadmin(v_actor)
  ) then raise exception using errcode = '42501', message = 'academic_question_metadata_access_denied'; end if;

  if coalesce(cardinality(p_question_ids),0)>1000 then raise exception 'too_many_question_ids'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'questionId', q.id, 'strand', q.curriculum_strand,
      'skill', q.curriculum_skill, 'subskill', q.curriculum_subskill,
      'objective', q.curriculum_objective,
      'eligibleGradeLevels', to_jsonb(q.eligible_grade_levels),
      'reviewStatus', q.curriculum_review_status,
      'registryMappings', coalesce((
        select jsonb_agg(jsonb_build_object(
          'registryCode',rv.code,'skill',skill.name,'subskill',subskill.name,
          'strand',strand.name,'evidenceFocus',focus.name,
          'evidenceStatement',tx.evidence_statement,'assessmentProcess',tx.assessment_process_code
        ) order by skill.name,subskill.name,focus.name)
        from public.verified_question_registry_taxonomy tx
        join public.academic_skill_registry_versions rv on rv.id=tx.registry_version_id and rv.status='published'
        join public.academic_skill_registry_nodes skill on skill.id=tx.primary_skill_node_id and skill.status='active'
        join public.academic_skill_registry_nodes subskill on subskill.id=tx.atomic_subskill_node_id and subskill.status='active'
        left join public.academic_skill_registry_nodes strand on strand.id=skill.parent_id
        join public.academic_skill_evidence_focuses focus on focus.id=tx.evidence_focus_id and focus.status='active'
        where tx.question_id=q.id and tx.question_content_hash=q.current_content_hash
          and tx.review_status='approved' and not tx.human_review_required
          and private.verified_question_has_registry_mapping(q.id)
      ),'[]'::jsonb),
      'approvedMappings', coalesce((
        select jsonb_agg(jsonb_build_object(
          'scopeId', m.curriculum_scope_id, 'objectiveId', m.curriculum_objective_id,
          'gradeLevel', st.sequence_number, 'framework', f.name,
          'frameworkVersion', v.version_code, 'confidence', m.confidence_score
        ) order by st.sequence_number)
        from public.curriculum_assessment_items i
        join public.curriculum_item_objective_mappings m on m.assessment_item_id = i.id and m.status = 'approved'
        join public.curriculum_scopes sc on sc.id = m.curriculum_scope_id
        join public.curriculum_stages st on st.id = sc.stage_id
        join public.curriculum_framework_versions v on v.id = m.framework_version_id
        join public.curriculum_frameworks f on f.id = v.framework_id
        where i.source_type = 'question_bank' and i.source_record_id = q.id::text
      ), '[]'::jsonb)
    ) order by q.id)
    from public.questions q where q.id = any(coalesce(p_question_ids, '{}'::uuid[]))
  ), '[]'::jsonb);
end;
$function$
;
revoke all on function public.rpc_question_curriculum_metadata(uuid[]) from public,anon;
grant execute on function public.rpc_question_curriculum_metadata(uuid[]) to authenticated,service_role;
CREATE OR REPLACE FUNCTION public.rpc_teacher_register_intervention_practice(p_assignment_id uuid, p_student_id uuid, p_skill_key text, p_diagnostic_targets jsonb DEFAULT '[]'::jsonb, p_intervention_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_assignment public.assignments%rowtype;
  v_focus public.student_learning_focus_states%rowtype;
  v_intervention public.student_learning_interventions%rowtype;
  v_school_id uuid;
  v_id uuid;
  v_existing public.student_learning_intervention_practice_assignments%rowtype;
  v_observation record;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  if p_assignment_id is null or p_student_id is null or nullif(trim(p_skill_key), '') is null then
    raise exception 'Assignment, student and skill are required';
  end if;
  if jsonb_typeof(coalesce(p_diagnostic_targets, '[]'::jsonb)) <> 'array' then
    raise exception 'Diagnostic targets must be a list';
  end if;
  if jsonb_array_length(coalesce(p_diagnostic_targets, '[]'::jsonb)) > 12 then
    raise exception 'Choose no more than 12 diagnostic targets';
  end if;

  select * into v_focus
  from public.student_learning_focus_states f
  where f.student_id = p_student_id and f.skill_key = p_skill_key;
  if not found then raise exception 'Learning focus area not found'; end if;
  if not public.student_learning_can_manage_intervention(p_student_id, v_focus.subject) then
    raise exception 'Not authorised for this student and subject';
  end if;

  select * into v_assignment from public.assignments a where a.id = p_assignment_id;
  if not found then raise exception 'Assignment not found'; end if;
  v_school_id := coalesce(v_assignment.school_id, v_focus.school_id);
  if v_school_id is distinct from v_focus.school_id then
    raise exception 'Assignment and learning focus must belong to the same school';
  end if;
  if not exists (
    select 1 from public.student_assignments sa
    where sa.assignment_id = p_assignment_id and sa.student_id = p_student_id
  ) then raise exception 'Target student is not assigned to this practice'; end if;
  if exists (
    select 1 from public.student_assignments sa
    where sa.assignment_id = p_assignment_id and sa.student_id <> p_student_id
  ) then raise exception 'Intervention practice must target one student only'; end if;

  if p_intervention_id is not null then
    select * into v_intervention
    from public.student_learning_interventions i
    where i.id = p_intervention_id;
    if not found then raise exception 'Intervention not found'; end if;
    if v_intervention.student_id <> p_student_id
       or v_intervention.skill_key <> p_skill_key
       or v_intervention.school_id <> v_school_id then
      raise exception 'Intervention does not match this student, school and focus area';
    end if;
    if not public.student_learning_can_manage_intervention(v_intervention.student_id, v_intervention.subject) then
      raise exception 'Not authorised for this intervention';
    end if;
  end if;

  select * into v_existing
  from public.student_learning_intervention_practice_assignments p
  where p.assignment_id = p_assignment_id and p.student_id = p_student_id
  for update;

  if found then
    if v_existing.school_id <> v_school_id or v_existing.skill_key <> p_skill_key then
      raise exception 'Existing targeted-practice provenance does not match this focus area';
    end if;
    if v_existing.intervention_id is not null
       and p_intervention_id is not null
       and v_existing.intervention_id <> p_intervention_id then
      raise exception 'Targeted practice is already linked to another intervention';
    end if;
    update public.student_learning_intervention_practice_assignments set
      intervention_id = coalesce(intervention_id, p_intervention_id),
      diagnostic_targets = case
        when jsonb_array_length(coalesce(p_diagnostic_targets, '[]'::jsonb)) > 0
          then p_diagnostic_targets
        else diagnostic_targets
      end,
      linked_at = case
        when coalesce(intervention_id, p_intervention_id) is not null then coalesce(linked_at, now())
        else linked_at
      end
    where id = v_existing.id
    returning id into v_id;
  else
    insert into public.student_learning_intervention_practice_assignments(
      school_id, assignment_id, student_id, intervention_id, skill_key,
      diagnostic_targets, created_by, linked_at
    ) values (
      v_school_id, p_assignment_id, p_student_id, p_intervention_id, p_skill_key,
      coalesce(p_diagnostic_targets, '[]'::jsonb), v_actor,
      case when p_intervention_id is null then null else now() end
    ) returning id into v_id;
  end if;

  for v_observation in
    select distinct o.student_id, o.skill_key
    from public.student_learning_observations o
    where o.student_id = p_student_id
      and o.source_type in ('assignment_result','registry_verified_assignment')
      and o.source_id = p_assignment_id
  loop
    update public.student_learning_observations o set
      contributes_to_focus_state = false,
      evidence = coalesce(o.evidence, '{}'::jsonb) || jsonb_build_object(
        'evidence_purpose', 'intervention_practice',
        'intervention_practice', true,
        'independent_mastery_evidence', false,
        'source_label', 'Brains Heist targeted practice'
      )
    where o.student_id = v_observation.student_id
      and o.skill_key = v_observation.skill_key
      and o.source_type in ('assignment_result','registry_verified_assignment')
      and o.source_id = p_assignment_id;
    perform public.student_learning_refresh_focus_state(v_observation.student_id, v_observation.skill_key);
  end loop;

  return jsonb_build_object(
    'success', true,
    'practiceId', v_id,
    'assignmentId', p_assignment_id,
    'studentId', p_student_id,
    'interventionId', p_intervention_id,
    'evidencePurpose', 'intervention_practice',
    'countsAsIndependentMasteryEvidence', false
  );
end;
$function$
;
revoke all on function public.rpc_teacher_register_intervention_practice(uuid,uuid,text,jsonb,uuid) from public,anon;
grant execute on function public.rpc_teacher_register_intervention_practice(uuid,uuid,text,jsonb,uuid) to authenticated,service_role;

CREATE OR REPLACE FUNCTION private.ingest_verified_assignment_registry_evidence(p_assignment_id uuid, p_student_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_assignment record;
  v_group record;
  v_skill_key text;
  v_source_key text;
  v_percentage numeric;
  v_kind text;
  v_quality text;
begin
  perform private.materialize_verified_assignment_registry_evidence(
    p_assignment_id,p_student_id
  );

  select
    a.school_id,a.class_id,a.class_code_snapshot,a.academic_year_id,a.academic_term_id,
    a.academic_subject_id,a.grade_level_snapshot,
    coalesce(nullif(trim(a.subject_name),''),nullif(trim(a.subject),''),nullif(trim(a.subject_id),''),'General') as subject_name
  into v_assignment
  from public.assignments a
  where a.id=p_assignment_id;
  if not found then return; end if;

  for v_group in
    select
      e.school_id,e.academic_year_id,e.academic_term_id,e.academic_subject_id,e.grade_level,
      e.registry_version_id,rv.code as registry_version_code,
      e.primary_skill_node_id,skill.code as primary_skill_code,skill.name as primary_skill_name,
      e.atomic_subskill_node_id,subskill.code as atomic_subskill_code,subskill.name as atomic_subskill_name,
      e.evidence_focus_id,focus.code as evidence_focus_code,focus.name as evidence_focus_name,
      tx.assessment_process_code,tx.cognitive_process,
      min(tx.evidence_statement) as evidence_statement,
      array_agg(distinct tx.evidence_statement order by tx.evidence_statement) as evidence_statements,
      count(*)::integer as question_count,
      count(*) filter(where e.is_correct)::integer as correct_count,
      bool_and(e.is_independent_assessment and not exists (
        select 1 from public.student_learning_intervention_practice_assignments practice
        where practice.assignment_id=e.assignment_id and practice.student_id=e.student_id
      )) as independent_assessment,
      min(tx.confidence_score) as mapping_confidence,
      array_agg(e.id order by e.answered_at,e.id) as item_evidence_ids,
      array_agg(e.answer_id order by e.answered_at,e.id) as answer_ids,
      array_agg(e.question_id order by e.answered_at,e.id) as question_ids,
      max(e.answered_at) as observed_at
    from public.student_learning_registry_item_evidence e
    join public.academic_skill_registry_versions rv
      on rv.id=e.registry_version_id and rv.status='published'
    join public.academic_skill_registry_nodes skill
      on skill.id=e.primary_skill_node_id and skill.status='active'
    join public.academic_skill_registry_nodes subskill
      on subskill.id=e.atomic_subskill_node_id and subskill.status='active'
    join public.academic_skill_evidence_focuses focus
      on focus.id=e.evidence_focus_id and focus.status='active'
    join public.verified_question_registry_taxonomy tx
      on tx.id=e.registry_taxonomy_id
     and tx.review_status='approved'
     and not tx.human_review_required
    where e.assignment_id=p_assignment_id
      and e.student_id=p_student_id
    group by
      e.school_id,e.academic_year_id,e.academic_term_id,e.academic_subject_id,e.grade_level,
      e.registry_version_id,rv.code,
      e.primary_skill_node_id,skill.code,skill.name,
      e.atomic_subskill_node_id,subskill.code,subskill.name,
      e.evidence_focus_id,focus.code,focus.name,
      tx.assessment_process_code,tx.cognitive_process
  loop
    v_percentage:=round(100*v_group.correct_count::numeric/v_group.question_count::numeric,2);
    v_kind:=case when v_percentage<60 then 'focus'
                 when v_percentage>=80 then 'strength'
                 else 'developing' end;
    v_quality:=case when v_group.question_count<3 then 'provisional'
                    when v_group.question_count<6 then 'standard'
                    else 'strong' end;
    v_skill_key:=concat_ws(':','registry',v_group.registry_version_code,v_group.atomic_subskill_code);
    v_source_key:=concat_ws(
      ':','assignment',p_assignment_id::text,'registry',
      md5(v_skill_key),md5(v_group.evidence_focus_code),v_group.assessment_process_code
    );

    insert into public.student_learning_observations(
      school_id,student_id,subject,topic,skill,subskill,skill_key,
      observation_type,source_type,source_id,source_key,observed_at,
      evidence_percentage,evidence_count,evidence_quality,
      contributes_to_focus_state,evidence,system_generated,
      academic_subject_id,academic_year_id,academic_term_id,
      grade_level_at_time,class_id_at_time,class_code_at_time,
      academic_context_quality,academic_context_source
    )
    values(
      v_group.school_id,p_student_id,v_assignment.subject_name,
      v_group.primary_skill_name,v_group.primary_skill_name,v_group.atomic_subskill_name,v_skill_key,
      v_kind,'registry_verified_assignment',p_assignment_id,v_source_key,v_group.observed_at,
      v_percentage,v_group.question_count,v_quality,
      v_group.independent_assessment,
      jsonb_build_object(
        'evidence_provenance','brains_heist_registry_verified_question',
        'registry_evidence',true,
        'registry_version_id',v_group.registry_version_id,
        'registry_version_code',v_group.registry_version_code,
        'primary_skill_node_id',v_group.primary_skill_node_id,
        'primary_skill_code',v_group.primary_skill_code,
        'atomic_subskill_node_id',v_group.atomic_subskill_node_id,
        'atomic_subskill_code',v_group.atomic_subskill_code,
        'evidence_focus_id',v_group.evidence_focus_id,
        'evidence_focus_code',v_group.evidence_focus_code,
        'evidence_focus_name',v_group.evidence_focus_name,
        'assessment_process_code',v_group.assessment_process_code,
        'cognitive_process',v_group.cognitive_process,
        'evidence_statement',v_group.evidence_statement,
        'evidence_statements',to_jsonb(v_group.evidence_statements),
        'registry_mapping_confidence',v_group.mapping_confidence,
        'registry_coverage_score',1,
        'item_evidence_ids',to_jsonb(v_group.item_evidence_ids),
        'answer_ids',to_jsonb(v_group.answer_ids),
        'question_ids',to_jsonb(v_group.question_ids),
        'question_count',v_group.question_count,
        'correct',v_group.correct_count,
        'incorrect',v_group.question_count-v_group.correct_count,
        'intervention_practice',not v_group.independent_assessment,
        'independent_mastery_evidence',v_group.independent_assessment,
        'classification_thresholds',jsonb_build_object('focus_below',60,'strength_from',80)
      ),
      true,
      v_group.academic_subject_id,v_group.academic_year_id,v_group.academic_term_id,
      v_group.grade_level,v_assignment.class_id,v_assignment.class_code_snapshot,
      'confirmed','verified_registry_assignment'
    )
    on conflict(student_id,source_key) do nothing;

    perform public.student_learning_refresh_focus_state(
      p_student_id,v_skill_key
    );
  end loop;
end;
$function$
;
revoke all on function private.ingest_verified_assignment_registry_evidence(uuid,uuid) from public,anon,authenticated;
grant execute on function private.ingest_verified_assignment_registry_evidence(uuid,uuid) to service_role;
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
    where q0.id=any(p_question_ids) and q0.is_active and q0.pool_scope='teacher'
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
$function$
;
revoke all on function public.rpc_teacher_questions_by_ids(uuid[],text,text,uuid,integer,integer) from public,anon;
grant execute on function public.rpc_teacher_questions_by_ids(uuid[],text,text,uuid,integer,integer) to authenticated,service_role;
