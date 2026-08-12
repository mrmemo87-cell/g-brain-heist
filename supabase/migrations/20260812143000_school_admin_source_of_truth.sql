-- Align school administration and executive reporting with explicit school records.

create or replace function public.school_admin_get_my_capabilities(p_school_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_member public.school_members%rowtype;
begin
  if auth.uid() is null then return jsonb_build_object('success', false, 'error', 'Not authenticated'); end if;
  select sm.* into v_member from public.school_members sm
  where sm.user_id = auth.uid() and sm.status = 'active' and (p_school_id is null or sm.school_id = p_school_id)
  order by sm.is_owner desc, sm.joined_at, sm.id limit 1;
  if v_member.id is null then return jsonb_build_object('success', false, 'error', 'No active school membership'); end if;
  return jsonb_build_object(
    'success', true, 'user_id', v_member.user_id, 'school_id', v_member.school_id,
    'role', v_member.role_in_school,
    'account_type', case when v_member.is_owner then 'school_head' else v_member.role_in_school end,
    'is_owner', v_member.is_owner, 'can_administer', v_member.role_in_school = 'school_admin',
    'can_teach', v_member.can_teach, 'can_manage_billing', v_member.is_owner,
    'can_manage_admins', v_member.is_owner, 'can_transfer_ownership', v_member.is_owner,
    'can_view_governance', v_member.is_owner
  );
end;
$$;

revoke all on function public.school_admin_get_my_capabilities(uuid) from public, anon, authenticated, service_role;
grant execute on function public.school_admin_get_my_capabilities(uuid) to authenticated;

create or replace function public.rpc_school_admin_academic_system(
  p_school_id uuid,
  p_system_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_code text;
begin
  if v_actor is null or not (public.can_administer_school(p_school_id) or public.is_school_owner(p_school_id)) then
    raise exception using errcode = '42501', message = 'school_administrator_access_required';
  end if;
  select nullif(s.settings->>'academic_system', '') into v_code
  from public.schools s where s.id = p_school_id;
  if not found then raise exception using errcode = 'P0002', message = 'school_not_found'; end if;
  if p_system_code is not null then
    if p_system_code not in ('cambridge', 'american') then
      raise exception using errcode = '22023', message = 'unsupported_school_system';
    end if;
    update public.schools
    set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('academic_system', p_system_code),
        updated_at = now()
    where id = p_school_id;
    v_code := p_system_code;
    insert into public.school_governance_audit_log(
      school_id, actor_user_id, event_type, category, severity, summary, metadata
    ) values (
      p_school_id, v_actor, 'school_academic_system_saved', 'academic', 'info',
      'School academic system saved', jsonb_build_object('academic_system', v_code)
    );
  end if;
  return jsonb_build_object('success', true, 'systemCode', v_code);
end;
$$;

revoke all on function public.rpc_school_admin_academic_system(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.rpc_school_admin_academic_system(uuid, text) to authenticated, service_role;

create or replace function public.rpc_school_admin_identity_status(p_school_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not (public.can_administer_school(p_school_id) or public.is_school_owner(p_school_id))
      then jsonb_build_object('success', false, 'error', 'Access denied')
    else jsonb_build_object(
      'success', true,
      'confirmed', h.identity_confirmed_at is not null,
      'confirmedAt', h.identity_confirmed_at,
      'confirmedBy', h.identity_confirmed_by
    )
  end
  from (select 1) seed
  left join public.school_head_onboarding h on h.school_id = p_school_id;
$$;

revoke all on function public.rpc_school_admin_identity_status(uuid) from public, anon, authenticated, service_role;
grant execute on function public.rpc_school_admin_identity_status(uuid) to authenticated, service_role;

create or replace function public.rpc_school_admin_confirm_identity(
  p_school_id uuid,
  p_name text,
  p_logo_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_confirmed_at timestamptz;
begin
  if v_actor is null or not (public.can_administer_school(p_school_id) or public.is_school_owner(p_school_id)) then
    return jsonb_build_object('success', false, 'error', 'Access denied');
  end if;
  if nullif(trim(p_name), '') is null then
    return jsonb_build_object('success', false, 'error', 'School name is required.');
  end if;
  insert into public.school_head_onboarding(school_id) values (p_school_id)
  on conflict (school_id) do nothing;
  select identity_confirmed_at into v_confirmed_at
  from public.school_head_onboarding where school_id = p_school_id for update;
  if v_confirmed_at is not null then
    return jsonb_build_object('success', false, 'error', 'School identity is already confirmed.', 'code', 'school_identity_locked');
  end if;
  update public.schools
  set name = trim(p_name), logo_url = coalesce(p_logo_url, logo_url), updated_at = now()
  where id = p_school_id;
  if not found then return jsonb_build_object('success', false, 'error', 'School not found.'); end if;
  update public.school_head_onboarding
  set identity_confirmed_at = now(), identity_confirmed_by = v_actor, updated_at = now()
  where school_id = p_school_id;
  insert into public.school_governance_audit_log(
    school_id, actor_user_id, event_type, category, severity, summary, metadata
  ) values (
    p_school_id, v_actor, 'school_identity_confirmed', 'school', 'notice',
    'School name and logo confirmed', jsonb_build_object('name', trim(p_name), 'has_logo', p_logo_url is not null)
  );
  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.rpc_school_admin_confirm_identity(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.rpc_school_admin_confirm_identity(uuid, text, text) to authenticated, service_role;

-- Saving a grade plan is a replacement operation for that grade, so unchecked
-- subjects must stop being offered rather than remaining active invisibly.
create or replace function public.rpc_school_admin_apply_subject_offerings(
  p_school_id uuid,
  p_academic_year_id uuid,
  p_offerings jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
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
    v_saved := v_saved + 1;
  end loop;
  return jsonb_build_object('success', true, 'saved', v_saved);
end;
$$;

revoke all on function public.rpc_school_admin_apply_subject_offerings(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.rpc_school_admin_apply_subject_offerings(uuid, uuid, jsonb) to authenticated, service_role;

-- Preserve the established snapshot implementation and correct the metrics that
-- must come from explicit staffing and curriculum records.
alter function public.school_head_get_executive_snapshot(uuid, integer)
  rename to school_head_get_executive_snapshot_legacy_20260812;
revoke all on function public.school_head_get_executive_snapshot_legacy_20260812(uuid, integer) from public, anon, authenticated, service_role;

create function public.school_head_get_executive_snapshot(p_school_id uuid, p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_snapshot jsonb;
  v_teachers integer := 0;
  v_assigned integer := 0;
  v_active_7d integer := 0;
  v_subjects integer := 0;
  v_decisions jsonb;
  v_unassigned integer;
begin
  v_snapshot := public.school_head_get_executive_snapshot_legacy_20260812(p_school_id, p_days);
  select count(distinct sm.user_id) into v_teachers
  from public.school_members sm
  where sm.school_id = p_school_id and sm.status = 'active' and (
    sm.role_in_school = 'teacher' or exists (
      select 1 from public.class_teacher_assignments cta
      where cta.school_id = sm.school_id and cta.teacher_user_id = sm.user_id and cta.active is distinct from false
    )
  );
  select count(distinct cta.teacher_user_id) into v_assigned
  from public.class_teacher_assignments cta
  join public.school_members sm on sm.school_id = cta.school_id and sm.user_id = cta.teacher_user_id and sm.status = 'active'
  where cta.school_id = p_school_id and cta.active is distinct from false;
  select count(distinct sm.user_id) into v_active_7d
  from public.school_members sm join public.users u on u.id = sm.user_id
  where sm.school_id = p_school_id and sm.status = 'active' and u.last_seen >= now() - interval '7 days'
    and (sm.role_in_school = 'teacher' or exists (
      select 1 from public.class_teacher_assignments cta
      where cta.school_id = sm.school_id and cta.teacher_user_id = sm.user_id and cta.active is distinct from false
    ));
  select count(distinct m.academic_subject_id) into v_subjects
  from public.school_curriculum_scope_mappings m
  join public.school_academic_years y on y.id = m.academic_year_id and y.school_id = m.school_id
  where m.school_id = p_school_id and m.status = 'active' and y.status = 'current';

  select coalesce(jsonb_agg(item), '[]'::jsonb) into v_decisions
  from jsonb_array_elements(coalesce(v_snapshot->'decisions', '[]'::jsonb)) item
  where item->>'id' <> 'unassigned_teachers';
  v_unassigned := greatest(v_teachers - v_assigned, 0);
  if v_unassigned > 0 then
    v_decisions := v_decisions || jsonb_build_array(jsonb_build_object(
      'id', 'unassigned_teachers', 'severity', 'warning', 'count', v_unassigned,
      'title', 'Teaching staff need assignments',
      'description', format('%s teaching staff member(s) have no active class-subject assignment.', v_unassigned),
      'action', 'Review teacher assignments', 'destination', 'people'
    ));
  end if;
  return jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(v_snapshot, '{totals,teachers}', to_jsonb(v_teachers), true),
        '{totals,subjects}', to_jsonb(v_subjects), true
      ),
      '{engagement,active_teachers_7d}', to_jsonb(v_active_7d), true
    ),
    '{structure,assigned_teachers}', to_jsonb(v_assigned), true
  ) || jsonb_build_object('decisions', v_decisions);
end;
$$;

revoke all on function public.school_head_get_executive_snapshot(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.school_head_get_executive_snapshot(uuid, integer) to authenticated;

comment on function public.school_head_get_executive_snapshot(uuid, integer) is
  'School Head snapshot using explicit teaching assignments and current grade-subject offerings as source-of-truth records.';

notify pgrst, 'reload schema';
