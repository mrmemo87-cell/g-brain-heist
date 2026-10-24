-- Include governed registry-native bank coverage without changing question access.
-- Keep curriculum objectives separate from registry Evidence Focus targets; deduplicate dual-mapped questions.

create or replace function public.rpc_school_admin_academic_setup(p_school_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_frameworks jsonb := '[]'::jsonb;
begin
  if v_actor is null or not (
    public.can_administer_school(p_school_id) or public.is_school_owner(p_school_id)
  ) then
    raise exception using errcode = '42501', message = 'school_administrator_access_required';
  end if;

  with objective_counts as (
    select o.curriculum_scope_id, count(*)::integer as objective_count
    from public.curriculum_objectives o
    group by o.curriculum_scope_id
  ),
  -- Registry evidence is subject/grade coverage, not a claim of external syllabus mastery.
  registry_questions as materialized (
    select distinct q.id, q.academic_subject_id, q.eligible_grade_levels, tx.evidence_focus_id
    from public.questions q
    join public.academic_subjects a on a.id=q.academic_subject_id and a.is_active
    join public.verified_question_registry_taxonomy tx
      on tx.question_id=q.id and tx.question_content_hash=q.verified_content_hash
      and tx.review_status='approved' and not tx.human_review_required
    join public.academic_skill_registry_versions rv on rv.id=tx.registry_version_id and rv.status='published'
    join public.academic_skill_registry_nodes skill
      on skill.id=tx.primary_skill_node_id and skill.registry_version_id=rv.id
      and skill.node_type='skill' and skill.status='active'
    join public.academic_skill_registry_nodes subskill
      on subskill.id=tx.atomic_subskill_node_id and subskill.registry_version_id=rv.id
      and subskill.parent_id=skill.id and subskill.node_type='subskill' and subskill.status='active'
    join public.academic_skill_evidence_focuses focus
      on focus.id=tx.evidence_focus_id and focus.registry_version_id=rv.id
      and focus.atomic_subskill_node_id=subskill.id and focus.status='active'
    where q.is_active and q.analytics_eligible and q.verification_status='verified'
      and q.current_content_hash=q.verified_content_hash
      and private.academic_registry_subject_matches(rv.id,a.name)
      and ((q.pool_scope='global' and q.content_origin='brain_heist' and q.owner_school_id is null and q.is_public)
        or (q.pool_scope='school' and q.content_origin='teacher' and q.owner_school_id=p_school_id and not q.is_public))
  ),
  approved_question_keys as (
    select m.curriculum_scope_id, m.framework_version_id,
      case when i.source_type='question_bank' and i.source_item_key='question'
        then 'question:'||i.source_record_id else 'item:'||i.id::text end as question_key
    from public.curriculum_item_objective_mappings m
    join public.curriculum_assessment_items i
      on i.id=m.assessment_item_id and i.is_active and m.item_content_hash=i.content_hash
      and (i.school_id is null or i.school_id=p_school_id)
    join public.curriculum_framework_versions fv
      on fv.id=m.framework_version_id and m.curriculum_version_content_hash=fv.content_hash
    where m.status='approved' and m.mapping_role='primary' and m.superseded_at is null
    union
    select sc.id,sc.framework_version_id,'question:'||rq.id::text
    from public.curriculum_scopes sc
    join public.curriculum_stages st on st.id=sc.stage_id
    join registry_questions rq on rq.academic_subject_id=sc.academic_subject_id
      and st.sequence_number=any(rq.eligible_grade_levels)
  ),
  approved_counts as (
    select curriculum_scope_id,framework_version_id,count(distinct question_key)::integer approved_question_count
    from approved_question_keys group by curriculum_scope_id,framework_version_id
  ),
  registry_focus_counts as (
    select sc.id curriculum_scope_id,count(distinct rq.evidence_focus_id)::integer evidence_focus_count
    from public.curriculum_scopes sc
    join public.curriculum_stages st on st.id=sc.stage_id
    join registry_questions rq on rq.academic_subject_id=sc.academic_subject_id
      and st.sequence_number=any(rq.eligible_grade_levels)
    group by sc.id
  ),
  scope_payloads as (
    select
      sc.framework_subject_id,
      sc.framework_version_id,
      jsonb_agg(
        jsonb_build_object(
          'scopeId', sc.id,
          'scopeCode', sc.code,
          'scopeName', sc.name,
          'stageCode', st.code,
          'stageName', st.name,
          'gradeLevel', st.sequence_number,
          'objectiveCount', coalesce(oc.objective_count, 0),
          'approvedQuestionCount', coalesce(ac.approved_question_count, 0),
          'evidenceFocusCount', coalesce(rc.evidence_focus_count, 0)
        )
        order by st.sequence_number
      ) as scopes
    from public.curriculum_scopes sc
    join public.curriculum_stages st on st.id = sc.stage_id
    left join objective_counts oc on oc.curriculum_scope_id = sc.id
    left join registry_focus_counts rc on rc.curriculum_scope_id=sc.id
    left join approved_counts ac
      on ac.curriculum_scope_id = sc.id
     and ac.framework_version_id = sc.framework_version_id
    group by sc.framework_subject_id, sc.framework_version_id
  ),
  subject_payloads as (
    select
      fs.framework_version_id,
      jsonb_agg(
        jsonb_build_object(
          'academicSubjectId', fs.academic_subject_id,
          'code', a.code,
          'name', a.name,
          'category', case
            when a.code in ('english', 'mathematics', 'science') then 'core'
            else 'additional'
          end,
          'scopes', coalesce(sp.scopes, '[]'::jsonb)
        )
        order by fs.sequence_number, a.name
      ) as subjects
    from public.curriculum_framework_subjects fs
    join public.academic_subjects a on a.id = fs.academic_subject_id
    left join scope_payloads sp
      on sp.framework_subject_id = fs.id
     and sp.framework_version_id = fs.framework_version_id
    group by fs.framework_version_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', f.id,
        'code', f.code,
        'name', f.name,
        'providerName', f.provider_name,
        'authorityType', f.authority_type,
        'versionId', v.id,
        'versionCode', v.version_code,
        'versionName', v.display_name,
        'effectiveFrom', v.effective_from,
        'subjects', coalesce(sp.subjects, '[]'::jsonb)
      )
      order by f.name
    ),
    '[]'::jsonb
  )
  into v_frameworks
  from public.curriculum_frameworks f
  join public.curriculum_framework_versions v
    on v.framework_id = f.id
   and v.status = 'published'
  left join subject_payloads sp on sp.framework_version_id = v.id
  where f.is_active
    and (f.school_id is null or f.school_id = p_school_id);

  return jsonb_build_object(
    'success', true,
    'schoolId', p_school_id,
    'years', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', y.id, 'name', y.name, 'startsOn', y.starts_on,
        'endsOn', y.ends_on, 'status', y.status
      ) order by y.starts_on desc)
      from public.school_academic_years y
      where y.school_id = p_school_id
    ), '[]'::jsonb),
    'terms', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'academicYearId', t.academic_year_id, 'name', t.name,
        'sequence', t.sequence_number, 'startsOn', t.starts_on, 'endsOn', t.ends_on
      ) order by t.academic_year_id, t.sequence_number)
      from public.school_academic_terms t
      where t.school_id = p_school_id
    ), '[]'::jsonb),
    'frameworks', v_frameworks,
    'offerings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'mappingId', m.id, 'academicYearId', m.academic_year_id,
        'gradeLevel', m.grade_level, 'academicSubjectId', m.academic_subject_id,
        'subjectName', a.name, 'scopeId', m.curriculum_scope_id,
        'subjectRequirement', m.subject_requirement, 'status', m.status,
        'mappingQuality', m.mapping_quality
      ) order by m.academic_year_id, m.grade_level, a.name)
      from public.school_curriculum_scope_mappings m
      join public.academic_subjects a on a.id = m.academic_subject_id
      where m.school_id = p_school_id
        and m.status in ('planned', 'active')
    ), '[]'::jsonb),
    'electiveEnrolments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', se.id, 'studentId', se.student_id,
        'academicYearId', se.academic_year_id,
        'academicSubjectId', se.academic_subject_id,
        'subjectName', a.name, 'status', se.status
      ) order by a.name, se.student_id)
      from public.student_subject_enrolments se
      join public.academic_subjects a on a.id = se.academic_subject_id
      where se.school_id = p_school_id
        and se.status = 'active'
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.rpc_school_admin_academic_setup(uuid) from public, anon, authenticated;
grant execute on function public.rpc_school_admin_academic_setup(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
