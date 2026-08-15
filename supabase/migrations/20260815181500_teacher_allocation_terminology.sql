-- Teacher allocation is the school-administration relationship between a
-- teacher, class, and subject. Teacher assignment remains reserved for
-- academic work that a teacher publishes to students.

comment on table public.class_teacher_assignments is
  'Legacy physical storage for teacher allocations. New application code must use allocation-named RPCs and public.class_teacher_allocations.';

create or replace view public.class_teacher_allocations
with (security_invoker = true)
as
select
  id,
  school_id,
  class_id,
  teacher_user_id,
  subject,
  can_create,
  can_grade,
  active,
  created_at as allocated_at,
  created_by as allocated_by
from public.class_teacher_assignments;

comment on view public.class_teacher_allocations is
  'Canonical database vocabulary for teacher-to-class-and-subject allocations. The underlying legacy table name is retained for compatibility.';

revoke all on public.class_teacher_allocations from public, anon, authenticated, service_role;
grant select on public.class_teacher_allocations to service_role;

create or replace function public.school_admin_get_my_allocation_capabilities(p_school_id uuid default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_payload jsonb;
begin
  v_payload := public.school_admin_get_my_capabilities(p_school_id);
  if v_payload ? 'has_active_teaching_assignment' then
    v_payload := (v_payload - 'has_active_teaching_assignment') || jsonb_build_object(
      'has_active_teacher_allocation', v_payload -> 'has_active_teaching_assignment'
    );
  end if;
  return v_payload;
end;
$$;

revoke all on function public.school_admin_get_my_allocation_capabilities(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.school_admin_get_my_allocation_capabilities(uuid)
  to authenticated;

create or replace function public.school_admin_list_allocation_teachers(p_school_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    (item - 'has_active_assignment') || jsonb_build_object(
      'has_active_allocation', item -> 'has_active_assignment'
    )
  ), '[]'::jsonb)
  from jsonb_array_elements(public.school_admin_list_teachers(p_school_id)) item;
$$;

revoke all on function public.school_admin_list_allocation_teachers(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.school_admin_list_allocation_teachers(uuid)
  to authenticated;

create or replace function public.school_admin_list_teacher_allocations(p_school_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or not coalesce(public.can_administer_school(p_school_id), false) then
    raise exception using errcode = '42501', message = 'school_administrator_access_required';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', allocation.id,
      'school_id', allocation.school_id,
      'class_id', allocation.class_id,
      'teacher_user_id', allocation.teacher_user_id,
      'subject', allocation.subject,
      'active', allocation.active,
      'allocated_at', allocation.created_at,
      'teacher_name', coalesce(nullif(u.full_name, ''), nullif(u.username, ''), u.email, 'Unknown teacher'),
      'teacher_username', u.username,
      'teacher_email', u.email,
      'teacher_membership_status', sm.status,
      'teacher_can_teach', coalesce(sm.can_teach, false),
      'class_code', c.class_code,
      'class_name', c.class_name,
      'grade_level', c.grade_level
    ) order by c.grade_level, c.class_code, allocation.subject, coalesce(u.full_name, u.username, u.email))
    from public.class_teacher_assignments allocation
    left join public.classes c
      on c.id = allocation.class_id and c.school_id = allocation.school_id
    left join public.users u on u.id = allocation.teacher_user_id
    left join public.school_members sm
      on sm.school_id = allocation.school_id and sm.user_id = allocation.teacher_user_id
    where allocation.school_id = p_school_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.school_admin_list_teacher_allocations(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.school_admin_list_teacher_allocations(uuid)
  to authenticated;

create or replace function public.admin_allocate_teacher_to_class_subject(
  p_school_id uuid,
  p_class_id uuid,
  p_teacher_user_id uuid,
  p_subject text,
  p_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allocation_id uuid;
begin
  if (select auth.uid()) is null
     or not coalesce(public.can_administer_school(p_school_id), false) then
    return jsonb_build_object('success', false, 'error', 'You do not have permission to manage teacher allocations.');
  end if;

  if not exists (
    select 1 from public.classes
    where id = p_class_id and school_id = p_school_id and is_active is distinct from false
  ) then
    return jsonb_build_object('success', false, 'error', 'Choose an active class from this school.');
  end if;

  if not exists (
    select 1 from public.school_members
    where school_id = p_school_id
      and user_id = p_teacher_user_id
      and status = 'active'
      and can_teach
  ) then
    return jsonb_build_object('success', false, 'error', 'Choose a member with active teaching access.');
  end if;

  select id into v_allocation_id
  from public.class_teacher_assignments
  where school_id = p_school_id
    and class_id = p_class_id
    and teacher_user_id = p_teacher_user_id
    and lower(trim(subject)) = lower(trim(p_subject));

  if v_allocation_id is null then
    insert into public.class_teacher_assignments(
      school_id, class_id, teacher_user_id, subject, active, created_by
    ) values (
      p_school_id, p_class_id, p_teacher_user_id, trim(p_subject), p_active, (select auth.uid())
    ) returning id into v_allocation_id;
  else
    update public.class_teacher_assignments
    set active = p_active
    where id = v_allocation_id;
  end if;

  return jsonb_build_object('success', true, 'allocation_id', v_allocation_id);
end;
$$;

revoke all on function public.admin_allocate_teacher_to_class_subject(uuid, uuid, uuid, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_allocate_teacher_to_class_subject(uuid, uuid, uuid, text, boolean)
  to authenticated;

create or replace function public.school_admin_delete_teacher_allocation(
  p_school_id uuid,
  p_allocation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or not coalesce(public.can_administer_school(p_school_id), false) then
    raise exception using errcode = '42501', message = 'school_administrator_access_required';
  end if;

  delete from public.class_teacher_assignments
  where id = p_allocation_id and school_id = p_school_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Teacher allocation not found in this school.');
  end if;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.school_admin_delete_teacher_allocation(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.school_admin_delete_teacher_allocation(uuid, uuid)
  to authenticated;

create or replace function public.get_teacher_allocated_classes(p_teacher_user_id uuid default null)
returns table(
  class_id uuid,
  class_code text,
  class_name text,
  grade_level text,
  subject text,
  is_active boolean,
  school_id uuid,
  school_name text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from public.get_teacher_assigned_classes(p_teacher_user_id);
$$;

revoke all on function public.get_teacher_allocated_classes(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_teacher_allocated_classes(uuid)
  to authenticated;

create or replace function private.normalize_teacher_allocation_payload(p_payload jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_payload jsonb := p_payload;
  v_error text;
begin
  if v_payload is null then return null; end if;

  if v_payload ? 'assignment_count' then
    v_payload := (v_payload - 'assignment_count') || jsonb_build_object(
      'allocation_count', v_payload -> 'assignment_count'
    );
  end if;

  if v_payload ? 'error' then
    v_error := v_payload ->> 'error';
    v_error := replace(v_error, 'active teaching assignment(s)', 'active teacher allocation(s)');
    v_error := replace(v_error, 'active teaching assignments', 'active teacher allocations');
    v_error := replace(v_error, 'teaching assignments', 'teacher allocations');
    v_error := replace(v_error, 'Reassign', 'Reallocate');
    v_payload := jsonb_set(v_payload, '{error}', to_jsonb(v_error), true);
  end if;

  return v_payload;
end;
$$;

revoke all on function private.normalize_teacher_allocation_payload(jsonb)
  from public, anon, authenticated, service_role;

-- Keep the established RPC signatures stable while normalizing every response
-- that can surface the legacy staffing vocabulary in an administrator portal.
alter function public.rpc_school_admin_set_teaching_staff_status(uuid, uuid, boolean)
  rename to rpc_school_admin_set_teaching_staff_status_legacy_assignment_vocabulary;
revoke all on function public.rpc_school_admin_set_teaching_staff_status_legacy_assignment_vocabulary(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;
create function public.rpc_school_admin_set_teaching_staff_status(
  p_school_id uuid,
  p_member_user_id uuid,
  p_enabled boolean
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.normalize_teacher_allocation_payload(
    public.rpc_school_admin_set_teaching_staff_status_legacy_assignment_vocabulary(
      p_school_id, p_member_user_id, p_enabled
    )
  );
$$;
revoke all on function public.rpc_school_admin_set_teaching_staff_status(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_school_admin_set_teaching_staff_status(uuid, uuid, boolean)
  to authenticated;

alter function public.school_admin_transition_member_role(uuid, uuid, text, boolean, text)
  rename to school_admin_transition_member_role_legacy_assignment_vocabulary;
revoke all on function public.school_admin_transition_member_role_legacy_assignment_vocabulary(uuid, uuid, text, boolean, text)
  from public, anon, authenticated, service_role;
create function public.school_admin_transition_member_role(
  p_school_id uuid,
  p_member_user_id uuid,
  p_new_role text,
  p_keep_teaching boolean default false,
  p_reason text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.normalize_teacher_allocation_payload(
    public.school_admin_transition_member_role_legacy_assignment_vocabulary(
      p_school_id, p_member_user_id, p_new_role, p_keep_teaching, p_reason
    )
  );
$$;
revoke all on function public.school_admin_transition_member_role(uuid, uuid, text, boolean, text)
  from public, anon, authenticated, service_role;
grant execute on function public.school_admin_transition_member_role(uuid, uuid, text, boolean, text)
  to authenticated;

alter function public.school_admin_archive_class(uuid, uuid)
  rename to school_admin_archive_class_legacy_assignment_vocabulary;
revoke all on function public.school_admin_archive_class_legacy_assignment_vocabulary(uuid, uuid)
  from public, anon, authenticated, service_role;
create function public.school_admin_archive_class(p_school_id uuid, p_class_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.normalize_teacher_allocation_payload(
    public.school_admin_archive_class_legacy_assignment_vocabulary(p_school_id, p_class_id)
  );
$$;
revoke all on function public.school_admin_archive_class(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.school_admin_archive_class(uuid, uuid)
  to authenticated;

alter function public.remove_school_member(uuid, uuid)
  rename to remove_school_member_legacy_assignment_vocabulary;
revoke all on function public.remove_school_member_legacy_assignment_vocabulary(uuid, uuid)
  from public, anon, authenticated, service_role;
create function public.remove_school_member(p_member_user_id uuid, p_school_id uuid default null)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.normalize_teacher_allocation_payload(
    public.remove_school_member_legacy_assignment_vocabulary(p_member_user_id, p_school_id)
  );
$$;
revoke all on function public.remove_school_member(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.remove_school_member(uuid, uuid)
  to authenticated;

alter function public.update_member_status(uuid, text, uuid)
  rename to update_member_status_legacy_assignment_vocabulary;
revoke all on function public.update_member_status_legacy_assignment_vocabulary(uuid, text, uuid)
  from public, anon, authenticated, service_role;
create function public.update_member_status(
  p_member_user_id uuid,
  p_action text,
  p_school_id uuid default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.normalize_teacher_allocation_payload(
    public.update_member_status_legacy_assignment_vocabulary(p_member_user_id, p_action, p_school_id)
  );
$$;
revoke all on function public.update_member_status(uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.update_member_status(uuid, text, uuid)
  to authenticated;

comment on function public.school_admin_list_teacher_assignments(uuid) is
  'Legacy compatibility RPC. Use school_admin_list_teacher_allocations for teacher-to-class-and-subject allocation.';
comment on function public.admin_assign_teacher_to_class_subject(uuid, uuid, uuid, text, boolean) is
  'Legacy compatibility RPC. Use admin_allocate_teacher_to_class_subject.';
comment on function public.school_admin_delete_teacher_assignment(uuid, uuid) is
  'Legacy compatibility RPC. Use school_admin_delete_teacher_allocation.';
comment on function public.get_teacher_assigned_classes(uuid) is
  'Legacy compatibility RPC. Use get_teacher_allocated_classes.';

create or replace function private.normalize_teacher_allocation_decision_language()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_affected jsonb;
begin
  new.decision_payload := coalesce(new.decision_payload, '{}'::jsonb);

  if new.decision_key = 'missing_class_subject_teachers' then
    new.title := 'Required subjects have no allocated teacher';
    new.decision_payload := new.decision_payload || jsonb_build_object(
      'title', new.title,
      'action', 'Allocate missing teachers'
    );
  elsif new.decision_key = 'inactive_teacher_assignments' then
    new.title := 'Teaching allocations point to unavailable staff';
    new.decision_payload := new.decision_payload || jsonb_build_object(
      'title', new.title,
      'action', 'Repair teacher allocations',
      'why', 'An unavailable allocated teacher can block delivery, grading, reporting, and secure teacher access.'
    );

    if jsonb_typeof(new.decision_payload -> 'affected') = 'array' then
      select coalesce(jsonb_agg(
        case
          when item ? 'assignment_id'
            then (item - 'assignment_id') || jsonb_build_object('allocation_id', item -> 'assignment_id')
          else item
        end
      ), '[]'::jsonb)
      into v_affected
      from jsonb_array_elements(new.decision_payload -> 'affected') item;
      new.decision_payload := jsonb_set(new.decision_payload, '{affected}', v_affected, true);
    end if;
  elsif new.decision_key = 'unassigned_teachers' then
    new.title := 'Teaching staff need allocations';
    new.decision_payload := new.decision_payload || jsonb_build_object(
      'title', new.title,
      'action', 'Review teacher allocations'
    );
  end if;

  return new;
end;
$$;

revoke all on function private.normalize_teacher_allocation_decision_language()
  from public, anon, authenticated, service_role;

drop trigger if exists normalize_teacher_allocation_decision_language
  on public.school_head_decision_alerts;
create trigger normalize_teacher_allocation_decision_language
before insert or update on public.school_head_decision_alerts
for each row execute function private.normalize_teacher_allocation_decision_language();

-- Normalize already-persisted executive alerts. Stable decision keys are kept
-- for compatibility; all visible database content now uses allocation language.
update public.school_head_decision_alerts
set updated_at = now()
where decision_key in (
  'missing_class_subject_teachers',
  'inactive_teacher_assignments',
  'unassigned_teachers'
);

notify pgrst, 'reload schema';
