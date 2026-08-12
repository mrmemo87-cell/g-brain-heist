-- Separate explicit teaching-staff registration from administrative access.

comment on column public.school_members.can_teach is
  'Explicit teaching-staff registration. Administrative access alone must not enable this flag.';

-- School applications used to copy the applicant role into the owner membership.
-- Clear only automatically provisioned, unassigned owners; audited dual-role
-- decisions and owners with live teaching work remain untouched.
update public.school_members sm
set can_teach = false,
    updated_at = now()
where sm.is_owner
  and sm.role_in_school = 'school_admin'
  and sm.can_teach
  and not exists (
    select 1
    from public.class_teacher_assignments cta
    where cta.school_id = sm.school_id
      and cta.teacher_user_id = sm.user_id
      and cta.active is distinct from false
  )
  and not exists (
    select 1
    from public.school_member_role_audit audit
    where audit.school_id = sm.school_id
      and audit.member_user_id = sm.user_id
      and audit.new_can_teach
      and audit.previous_can_teach is distinct from audit.new_can_teach
  );

-- A newly inserted owner starts as an administrator only. Teaching staff status
-- can be added later through the reviewed RPC below.
create or replace function public.normalize_new_school_owner_teaching_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_owner then
    new.can_teach := false;
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_new_school_owner_teaching_status on public.school_members;
create trigger normalize_new_school_owner_teaching_status
before insert on public.school_members
for each row execute function public.normalize_new_school_owner_teaching_status();

revoke all on function public.normalize_new_school_owner_teaching_status() from public, anon, authenticated, service_role;

create or replace function public.rpc_school_admin_set_teaching_staff_status(
  p_school_id uuid,
  p_member_user_id uuid,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_target public.school_members%rowtype;
  v_assignments integer := 0;
begin
  if v_actor is null or not public.can_administer_school(p_school_id) then
    return jsonb_build_object('success', false, 'error', 'School administrator access required.');
  end if;

  select * into v_target
  from public.school_members sm
  where sm.school_id = p_school_id
    and sm.user_id = p_member_user_id
    and sm.status = 'active'
  for update;

  if v_target.id is null then
    return jsonb_build_object('success', false, 'error', 'This person is not an active school member.');
  end if;
  if v_target.role_in_school = 'teacher' and not p_enabled then
    return jsonb_build_object('success', false, 'error', 'Change the teacher role before removing teaching staff status.');
  end if;
  if v_target.role_in_school <> 'school_admin' then
    return jsonb_build_object('success', false, 'error', 'This control is only for administrators who also teach.');
  end if;
  if not public.is_school_owner(p_school_id) then
    return jsonb_build_object('success', false, 'error', 'Only the School Head can change an administrator''s teaching staff status.');
  end if;

  select count(*) into v_assignments
  from public.class_teacher_assignments cta
  where cta.school_id = p_school_id
    and cta.teacher_user_id = p_member_user_id
    and cta.active is distinct from false;

  if not p_enabled and v_assignments > 0 then
    return jsonb_build_object(
      'success', false,
      'error', format('This person has %s active teaching assignment(s). Reassign or remove them first.', v_assignments),
      'code', 'ACTIVE_ASSIGNMENTS_REQUIRE_RESOLUTION',
      'assignment_count', v_assignments
    );
  end if;
  if v_target.can_teach = p_enabled then
    return jsonb_build_object('success', true, 'can_teach', p_enabled, 'assignment_count', v_assignments);
  end if;

  update public.school_members
  set can_teach = p_enabled,
      updated_at = now()
  where id = v_target.id;

  insert into public.school_member_role_audit(
    school_id, member_user_id, actor_user_id,
    previous_role, new_role, previous_can_teach, new_can_teach,
    assignment_count, reason
  ) values (
    p_school_id, p_member_user_id, v_actor,
    v_target.role_in_school, v_target.role_in_school, v_target.can_teach, p_enabled,
    v_assignments,
    case when p_enabled then 'Registered as teaching staff by the School Head'
         else 'Removed from teaching staff by the School Head' end
  );

  return jsonb_build_object('success', true, 'can_teach', p_enabled, 'assignment_count', v_assignments);
end;
$$;

revoke all on function public.rpc_school_admin_set_teaching_staff_status(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_school_admin_set_teaching_staff_status(uuid, uuid, boolean)
  to authenticated;

create or replace function public.school_admin_get_my_capabilities(p_school_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member public.school_members%rowtype;
  v_has_active_assignment boolean := false;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;
  select sm.* into v_member
  from public.school_members sm
  where sm.user_id = auth.uid()
    and sm.status = 'active'
    and (p_school_id is null or sm.school_id = p_school_id)
  order by sm.is_owner desc, sm.joined_at, sm.id
  limit 1;
  if v_member.id is null then
    return jsonb_build_object('success', false, 'error', 'No active school membership');
  end if;

  select exists (
    select 1
    from public.class_teacher_assignments cta
    join public.classes c on c.id = cta.class_id
      and c.school_id = cta.school_id
      and c.is_active is distinct from false
    where cta.school_id = v_member.school_id
      and cta.teacher_user_id = v_member.user_id
      and cta.active is distinct from false
  ) into v_has_active_assignment;

  return jsonb_build_object(
    'success', true,
    'user_id', v_member.user_id,
    'school_id', v_member.school_id,
    'role', v_member.role_in_school,
    'account_type', case when v_member.is_owner then 'school_head' else v_member.role_in_school end,
    'is_owner', v_member.is_owner,
    'can_administer', v_member.role_in_school = 'school_admin',
    'can_teach', v_member.can_teach,
    'has_active_teaching_assignment', v_has_active_assignment,
    'can_manage_billing', v_member.is_owner,
    'can_manage_admins', v_member.is_owner,
    'can_transfer_ownership', v_member.is_owner,
    'can_view_governance', v_member.is_owner
  );
end;
$$;

revoke all on function public.school_admin_get_my_capabilities(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.school_admin_get_my_capabilities(uuid) to authenticated;

create or replace function public.school_admin_list_teachers(p_school_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_administer_school(p_school_id) then
    raise exception using errcode = '42501', message = 'school_administrator_access_required';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', sm.user_id,
      'username', u.username,
      'email', u.email,
      'role_in_school', sm.role_in_school,
      'is_owner', sm.is_owner,
      'can_teach', sm.can_teach,
      'has_active_assignment', exists (
        select 1 from public.class_teacher_assignments cta
        join public.classes c on c.id = cta.class_id
          and c.school_id = cta.school_id
          and c.is_active is distinct from false
        where cta.school_id = sm.school_id
          and cta.teacher_user_id = sm.user_id
          and cta.active is distinct from false
      ),
      'subject_specializations', coalesce(to_jsonb(t.subject_specializations), '[]'::jsonb),
      'verified', coalesce(t.verified, false)
    ) order by u.username)
    from public.school_members sm
    join public.users u on u.id = sm.user_id
    left join public.teachers t on t.user_id = sm.user_id
    where sm.school_id = p_school_id
      and sm.status = 'active'
      and sm.can_teach
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.school_admin_list_teachers(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.school_admin_list_teachers(uuid) to authenticated;

create or replace function public.school_head_get_executive_snapshot(p_school_id uuid, p_days integer default 30)
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
  where sm.school_id = p_school_id
    and sm.status = 'active'
    and (sm.role_in_school = 'teacher' or sm.can_teach or exists (
      select 1 from public.class_teacher_assignments cta
      where cta.school_id = sm.school_id
        and cta.teacher_user_id = sm.user_id
        and cta.active is distinct from false
    ));

  select count(distinct cta.teacher_user_id) into v_assigned
  from public.class_teacher_assignments cta
  join public.school_members sm on sm.school_id = cta.school_id
    and sm.user_id = cta.teacher_user_id
    and sm.status = 'active'
  join public.classes c on c.id = cta.class_id
    and c.school_id = cta.school_id
    and c.is_active is distinct from false
  where cta.school_id = p_school_id
    and cta.active is distinct from false;

  select count(distinct sm.user_id) into v_active_7d
  from public.school_members sm
  join public.users u on u.id = sm.user_id
  where sm.school_id = p_school_id
    and sm.status = 'active'
    and u.last_seen >= now() - interval '7 days'
    and (sm.role_in_school = 'teacher' or sm.can_teach or exists (
      select 1 from public.class_teacher_assignments cta
      where cta.school_id = sm.school_id
        and cta.teacher_user_id = sm.user_id
        and cta.active is distinct from false
    ));

  select count(distinct m.academic_subject_id) into v_subjects
  from public.school_curriculum_scope_mappings m
  join public.school_academic_years y on y.id = m.academic_year_id
    and y.school_id = m.school_id
  where m.school_id = p_school_id
    and m.status = 'active'
    and y.status = 'current';

  select coalesce(jsonb_agg(item), '[]'::jsonb) into v_decisions
  from jsonb_array_elements(coalesce(v_snapshot->'decisions', '[]'::jsonb)) item
  where item->>'id' <> 'unassigned_teachers'
    and not (v_teachers = 0 and item->>'id' = 'uncovered_classes');

  v_unassigned := greatest(v_teachers - v_assigned, 0);
  if v_unassigned > 0 then
    v_decisions := v_decisions || jsonb_build_array(jsonb_build_object(
      'id', 'unassigned_teachers',
      'severity', 'warning',
      'count', v_unassigned,
      'title', 'Teaching staff need assignments',
      'description', format('%s teaching staff member(s) have no active class-subject assignment.', v_unassigned),
      'action', 'Review teacher assignments',
      'destination', 'people'
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

revoke all on function public.school_head_get_executive_snapshot(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.school_head_get_executive_snapshot(uuid, integer) to authenticated;

notify pgrst, 'reload schema';
