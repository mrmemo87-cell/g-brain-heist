create or replace function private.backfill_verified_question_scope_mappings(p_scope_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer := 0;
begin
  with scope_context as (
    select
      cs.id as curriculum_scope_id,
      cs.academic_subject_id,
      st.sequence_number::text as grade_level,
      cs.framework_version_id,
      fv.content_hash as version_content_hash
    from public.curriculum_scopes cs
    join public.curriculum_stages st on st.id = cs.stage_id
    join public.curriculum_framework_versions fv on fv.id = cs.framework_version_id
    where cs.id = p_scope_id
      and fv.status = 'published'
  ), candidates as (
    select
      sc.curriculum_scope_id,
      sc.academic_subject_id,
      sc.framework_version_id,
      sc.version_content_hash,
      q.id as question_id,
      i.id as item_id,
      i.content_hash as item_content_hash,
      o.id as objective_id,
      count(*) over (partition by i.id, sc.curriculum_scope_id) as candidate_count
    from scope_context sc
    join public.questions q
      on q.academic_subject_id = sc.academic_subject_id
     and q.content_origin = 'brain_heist'
     and q.verification_status = 'verified'
     and q.analytics_eligible
     and q.is_public
     and q.is_active
     and q.current_content_hash = q.verified_content_hash
     and sc.grade_level ~ '^[0-9]+$'
     and sc.grade_level::smallint = any(q.eligible_grade_levels)
    join public.curriculum_assessment_items i
      on i.source_type = 'question_bank'
     and i.source_record_id = q.id::text
     and i.source_item_key = 'question'
     and i.is_active
     and i.content_hash = q.verified_content_hash
    join public.curriculum_objectives o
      on o.curriculum_scope_id = sc.curriculum_scope_id
     and o.is_assessable
    where lower(regexp_replace(trim(o.statement), '\s+', ' ', 'g'))
        = lower(regexp_replace(trim(q.curriculum_objective), '\s+', ' ', 'g'))
  )
  insert into public.curriculum_item_objective_mappings (
    assessment_item_id,
    curriculum_objective_id,
    framework_version_id,
    curriculum_scope_id,
    academic_subject_id,
    mapping_role,
    mapping_method,
    status,
    confidence_score,
    rationale,
    provenance,
    item_content_hash,
    curriculum_version_content_hash,
    reviewed_by_authority,
    approved_by_authority,
    reviewed_at,
    approved_at
  )
  select
    c.item_id,
    c.objective_id,
    c.framework_version_id,
    c.curriculum_scope_id,
    c.academic_subject_id,
    'primary',
    'rule_based',
    'approved',
    1.0000,
    'Exact governed objective statement match created when a school activated this curriculum scope.',
    jsonb_build_object(
      'source', 'verified-question-scope-activation',
      'matchMethod', 'exact_objective_statement',
      'repairVersion', '2026-08-20'
    ),
    c.item_content_hash,
    c.version_content_hash,
    'Brains Heist Content Quality',
    'Brains Heist Academic Governance',
    now(),
    now()
  from candidates c
  where c.candidate_count = 1
    and not exists (
      select 1
      from public.curriculum_item_objective_mappings existing
      where existing.assessment_item_id = c.item_id
        and existing.curriculum_scope_id = c.curriculum_scope_id
        and existing.status = 'approved'
        and existing.mapping_role = 'primary'
    )
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function private.backfill_verified_question_scope_mappings(uuid) from public, anon, authenticated;

create or replace function public.rpc_school_admin_apply_subject_offerings(
  p_school_id uuid,
  p_academic_year_id uuid,
  p_offerings jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_actor uuid := auth.uid();
  v_item jsonb;
  v_grade text;
  v_subject uuid;
  v_scope uuid;
  v_requirement text;
  v_saved integer := 0;
  v_plan_grade text;
begin
  if v_actor is null or not (public.can_administer_school(p_school_id) or public.is_school_owner(p_school_id)) then
    raise exception using errcode = '42501', message = 'school_administrator_access_required';
  end if;
  if jsonb_typeof(coalesce(p_offerings, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_offerings, '[]'::jsonb)) = 0 then
    return jsonb_build_object('success', false, 'code', 'choose_at_least_one_subject');
  end if;
  if not exists (select 1 from public.school_academic_years y where y.id = p_academic_year_id and y.school_id = p_school_id) then
    return jsonb_build_object('success', false, 'code', 'academic_year_not_found');
  end if;
  v_plan_grade := nullif(trim(p_offerings->0->>'gradeLevel'), '');
  if v_plan_grade is null or v_plan_grade !~ '^(?:[1-9]|1[0-2])$' then
    raise exception using errcode = '22023', message = 'invalid_grade_level';
  end if;

  update public.school_curriculum_scope_mappings m
  set status = 'archived', updated_at = now()
  where m.school_id = p_school_id and m.academic_year_id = p_academic_year_id
    and m.grade_level = v_plan_grade and m.status in ('planned', 'active')
    and not exists (
      select 1 from jsonb_array_elements(p_offerings) item
      where nullif(item->>'academicSubjectId', '')::uuid = m.academic_subject_id
    );

  for v_item in select value from jsonb_array_elements(p_offerings)
  loop
    v_grade := nullif(trim(v_item->>'gradeLevel'), '');
    v_subject := nullif(v_item->>'academicSubjectId', '')::uuid;
    v_scope := nullif(v_item->>'scopeId', '')::uuid;
    v_requirement := coalesce(nullif(v_item->>'subjectRequirement', ''), 'required');
    if v_grade is distinct from v_plan_grade or v_subject is null or v_scope is null or v_requirement not in ('required', 'elective') then
      raise exception using errcode = '22023', message = 'invalid_subject_offering';
    end if;
    if not exists (
      select 1 from public.curriculum_scopes sc
      join public.curriculum_stages st on st.id = sc.stage_id
      join public.curriculum_framework_versions v on v.id = sc.framework_version_id
      where sc.id = v_scope and sc.academic_subject_id = v_subject
        and st.sequence_number::text = v_grade and v.status = 'published'
    ) then raise exception using errcode = '23514', message = 'offering_scope_does_not_match_grade_subject'; end if;

    insert into public.school_curriculum_scope_mappings(
      school_id, academic_year_id, grade_level, academic_subject_id, curriculum_scope_id,
      status, mapping_quality, subject_requirement, created_by, confirmed_by, confirmed_at
    ) values (
      p_school_id, p_academic_year_id, v_grade, v_subject, v_scope,
      'active', 'confirmed', v_requirement, v_actor, v_actor, now()
    )
    on conflict (school_id, academic_year_id, grade_level, academic_subject_id) where status in ('planned', 'active')
    do update set curriculum_scope_id = excluded.curriculum_scope_id, status = 'active', mapping_quality = 'confirmed',
      subject_requirement = excluded.subject_requirement, confirmed_by = v_actor, confirmed_at = now(), updated_at = now();

    perform private.backfill_verified_question_scope_mappings(v_scope);
    v_saved := v_saved + 1;
  end loop;
  return jsonb_build_object('success', true, 'saved', v_saved);
end;
$$;

revoke all on function public.rpc_school_admin_apply_subject_offerings(uuid, uuid, jsonb) from public, anon;
grant execute on function public.rpc_school_admin_apply_subject_offerings(uuid, uuid, jsonb) to authenticated, service_role;

do $$
declare
  r record;
begin
  for r in
    select distinct scm.curriculum_scope_id
    from public.school_curriculum_scope_mappings scm
    join public.curriculum_scopes cs on cs.id = scm.curriculum_scope_id
    join public.curriculum_framework_versions fv on fv.id = cs.framework_version_id
    where scm.status = 'active'
      and fv.status = 'published'
  loop
    perform private.backfill_verified_question_scope_mappings(r.curriculum_scope_id);
  end loop;
end;
$$;
