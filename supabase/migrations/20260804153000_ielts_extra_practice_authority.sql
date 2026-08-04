-- One server-authoritative IELTS Extra Practice access boundary.
--
-- The school setting, canonical membership, assigned-practice exception and
-- personal Prime entitlement are resolved in the database.  Client-provided
-- school IDs are deliberately not accepted by either settings RPC.

create schema if not exists private;

-- Some environments originally added these columns from manual setup SQL.
-- Make the canonical migration chain self-contained and repair legacy defaults.
alter table if exists public.ielts_reading_sets
  add column if not exists required_tier text default 'free';
alter table if exists public.ielts_listening_sets
  add column if not exists required_tier text default 'prime_prep_user';
alter table if exists public.ielts_writing_tasks
  add column if not exists required_tier text default 'free';
alter table if exists public.ielts_speaking_tasks
  add column if not exists required_tier text default 'free';

alter table if exists public.ielts_reading_sets
  alter column required_tier set default 'free';
alter table if exists public.ielts_listening_sets
  alter column required_tier set default 'prime_prep_user';
alter table if exists public.ielts_writing_tasks
  alter column required_tier set default 'free';
alter table if exists public.ielts_speaking_tasks
  alter column required_tier set default 'free';

create index if not exists idx_ielts_practice_assignment_items_content_assignment
  on public.ielts_practice_assignment_items (content_type, content_id, assignment_id);
create index if not exists idx_ielts_practice_assignment_students_user_live
  on public.ielts_practice_assignment_students (student_id, assignment_id)
  where status <> 'excused';
create index if not exists idx_school_members_user_active_joined
  on public.school_members (user_id, joined_at, school_id, id)
  where status = 'active';

create or replace function private.ielts_extra_practice_access_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_has_game_profile boolean := false;
  v_has_ielts_profile boolean := false;
  v_profile_role text := 'student';
  v_profile_school_id uuid;
  v_profile_is_admin boolean := false;
  v_profile_is_banned boolean := false;
  v_is_platform_admin boolean := false;
  v_membership_school_id uuid;
  v_membership_role text;
  v_membership_can_teach boolean := false;
  v_active_membership_count integer := 0;
  v_has_any_membership boolean := false;
  v_school_status text;
  v_school_settings jsonb;
  v_enabled boolean := false;
  v_is_staff boolean := false;
  v_is_admin boolean := false;
  v_can_manage boolean := false;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'resolved', false,
      'role', 'student',
      'is_admin', false,
      'is_staff', false,
      'can_manage', false,
      'school_id', null,
      'enabled', false,
      'reason', 'not_authenticated'
    );
  end if;

  select
    true,
    lower(trim(coalesce(u.role, 'student'))),
    u.school_id,
    coalesce(u.is_admin, false),
    coalesce(u.is_banned, false)
  into
    v_has_game_profile,
    v_profile_role,
    v_profile_school_id,
    v_profile_is_admin,
    v_profile_is_banned
  from public.users u
  where u.id = v_user_id;

  v_has_game_profile := coalesce(v_has_game_profile, false);
  v_profile_role := coalesce(v_profile_role, 'student');
  v_profile_is_admin := coalesce(v_profile_is_admin, false);
  v_profile_is_banned := coalesce(v_profile_is_banned, false);

  select exists (
    select 1
    from public.ielts_users iu
    where iu.id = v_user_id
  ) into v_has_ielts_profile;

  if not coalesce(v_has_game_profile, false) and not v_has_ielts_profile then
    return jsonb_build_object(
      'resolved', false,
      'role', 'student',
      'is_admin', false,
      'is_staff', false,
      'can_manage', false,
      'school_id', null,
      'enabled', false,
      'reason', 'profile_missing'
    );
  end if;

  if v_profile_is_banned then
    return jsonb_build_object(
      'resolved', false,
      'role', v_profile_role,
      'is_admin', false,
      'is_staff', false,
      'can_manage', false,
      'school_id', v_profile_school_id,
      'enabled', false,
      'reason', 'account_disabled'
    );
  end if;

  v_is_platform_admin := v_profile_is_admin or exists (
    select 1
    from public.superadmins sa
    where sa.user_id = v_user_id
  );

  select exists (
    select 1
    from public.school_members sm
    where sm.user_id = v_user_id
  ) into v_has_any_membership;

  if v_profile_school_id is not null then
    select sm.school_id, sm.role_in_school, coalesce(sm.can_teach, false)
    into v_membership_school_id, v_membership_role, v_membership_can_teach
    from public.school_members sm
    where sm.user_id = v_user_id
      and sm.school_id = v_profile_school_id
      and sm.status = 'active'
    order by sm.joined_at nulls last, sm.id
    limit 1;

    if v_membership_school_id is null and not v_is_platform_admin then
      return jsonb_build_object(
        'resolved', false,
        'role', v_profile_role,
        'is_admin', false,
        'is_staff', false,
        'can_manage', false,
        'school_id', v_profile_school_id,
        'enabled', false,
        'reason', 'inactive_school_membership'
      );
    end if;
  else
    select count(distinct sm.school_id)
    into v_active_membership_count
    from public.school_members sm
    where sm.user_id = v_user_id
      and sm.status = 'active';

    if v_active_membership_count > 1 and not v_is_platform_admin then
      return jsonb_build_object(
        'resolved', false,
        'role', v_profile_role,
        'is_admin', false,
        'is_staff', false,
        'can_manage', false,
        'school_id', null,
        'enabled', false,
        'reason', 'ambiguous_school_membership'
      );
    elsif v_active_membership_count = 1 then
      select sm.school_id, sm.role_in_school, coalesce(sm.can_teach, false)
      into v_membership_school_id, v_membership_role, v_membership_can_teach
      from public.school_members sm
      where sm.user_id = v_user_id
        and sm.status = 'active'
      order by sm.joined_at nulls last, sm.id
      limit 1;
    elsif v_has_any_membership and not v_is_platform_admin then
      return jsonb_build_object(
        'resolved', false,
        'role', v_profile_role,
        'is_admin', false,
        'is_staff', false,
        'can_manage', false,
        'school_id', null,
        'enabled', false,
        'reason', 'inactive_school_membership'
      );
    end if;
  end if;

  v_membership_school_id := coalesce(v_profile_school_id, v_membership_school_id);

  if v_membership_school_id is null then
    return jsonb_build_object(
      'resolved', true,
      'role', case when v_is_platform_admin then 'superadmin' else v_profile_role end,
      'is_admin', v_is_platform_admin,
      'is_staff', v_is_platform_admin,
      'can_manage', false,
      'school_id', null,
      'enabled', true,
      'reason', case when v_is_platform_admin then 'platform_admin' else 'independent_user' end
    );
  end if;

  select s.status, coalesce(s.settings, '{}'::jsonb)
  into v_school_status, v_school_settings
  from public.schools s
  where s.id = v_membership_school_id;

  if v_school_status is distinct from 'active' then
    return jsonb_build_object(
      'resolved', false,
      'role', coalesce(v_membership_role, v_profile_role),
      'is_admin', v_is_platform_admin,
      'is_staff', v_is_platform_admin,
      'can_manage', false,
      'school_id', v_membership_school_id,
      'enabled', false,
      'reason', 'school_unavailable'
    );
  end if;

  v_enabled := v_school_settings @> '{"ielts_extra_practice_enabled": true}'::jsonb;
  v_is_admin := v_is_platform_admin or v_membership_role = 'school_admin';
  v_is_staff := v_is_platform_admin
    or v_membership_role = 'school_admin'
    or v_membership_can_teach;
  v_can_manage := v_is_platform_admin or v_membership_role = 'school_admin';

  return jsonb_build_object(
    'resolved', true,
    'role', case when v_is_platform_admin then 'superadmin' else coalesce(v_membership_role, v_profile_role) end,
    'is_admin', v_is_admin,
    'is_staff', v_is_staff,
    'can_manage', v_can_manage,
    'school_id', v_membership_school_id,
    'enabled', v_enabled,
    'reason', case when v_enabled then 'school_setting_enabled' else 'school_setting_disabled' end
  );
end;
$$;

create or replace function private.ielts_content_is_assigned_to_current_user(
  p_content_type text,
  p_content_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.ielts_practice_assignment_items i
    join public.ielts_practice_assignments a
      on a.id = i.assignment_id
    join public.ielts_practice_assignment_students ast
      on ast.assignment_id = a.id
     and ast.student_id = (select auth.uid())
    join public.school_members sm
      on sm.school_id = a.school_id
     and sm.user_id = ast.student_id
     and sm.status = 'active'
    where a.status = 'assigned'
      and ast.status in ('assigned', 'in_progress', 'completed', 'overdue')
      and i.content_type = p_content_type
      and i.content_id = p_content_id
  );
$$;

create or replace function private.ielts_can_access_practice_content(
  p_content_type text,
  p_content_id text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_content_id bigint;
  v_is_active boolean := false;
  v_required_tier text;
  v_context jsonb;
begin
  if v_user_id is null or p_content_id is null or p_content_id !~ '^[0-9]+$' then
    return false;
  end if;

  begin
    v_content_id := p_content_id::bigint;
  exception when numeric_value_out_of_range then
    return false;
  end;

  if p_content_type = 'ielts_reading_set' then
    select coalesce(r.is_active, false), coalesce(r.required_tier, 'free')
    into v_is_active, v_required_tier
    from public.ielts_reading_sets r
    where r.id = v_content_id;
  elsif p_content_type = 'ielts_listening_set' then
    select coalesce(l.is_active, false), coalesce(l.required_tier, 'prime_prep_user')
    into v_is_active, v_required_tier
    from public.ielts_listening_sets l
    where l.id = v_content_id;
  elsif p_content_type = 'ielts_writing_task' then
    select coalesce(w.is_active, false), coalesce(w.required_tier, 'free')
    into v_is_active, v_required_tier
    from public.ielts_writing_tasks w
    where w.id = v_content_id;
  elsif p_content_type = 'ielts_speaking_task' then
    select coalesce(s.is_active, false), coalesce(s.required_tier, 'free')
    into v_is_active, v_required_tier
    from public.ielts_speaking_tasks s
    where s.id = v_content_id;
  else
    return false;
  end if;

  if not found then
    return false;
  end if;

  v_context := private.ielts_extra_practice_access_context();

  -- Staff retain content-management access, including inactive drafts.
  if coalesce((v_context->>'is_staff')::boolean, false) then
    return true;
  end if;

  if not v_is_active then
    return false;
  end if;

  -- An explicit live assignment is independent of both the school-wide Extra
  -- Practice toggle and an individual Prime subscription.
  if private.ielts_content_is_assigned_to_current_user(p_content_type, p_content_id) then
    return true;
  end if;

  if not coalesce((v_context->>'resolved')::boolean, false)
     or not coalesce((v_context->>'enabled')::boolean, false) then
    return false;
  end if;

  if coalesce(v_required_tier, 'free') <> 'free'
     and not public.ielts_user_has_prime_access(v_user_id) then
    return false;
  end if;

  return true;
end;
$$;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

revoke all on function private.ielts_extra_practice_access_context() from public, anon, authenticated, service_role;
revoke all on function private.ielts_content_is_assigned_to_current_user(text, text) from public, anon, authenticated, service_role;
revoke all on function private.ielts_can_access_practice_content(text, text) from public, anon, authenticated, service_role;
grant execute on function private.ielts_extra_practice_access_context() to authenticated;
grant execute on function private.ielts_content_is_assigned_to_current_user(text, text) to authenticated;
grant execute on function private.ielts_can_access_practice_content(text, text) to authenticated;

create or replace function public.rpc_ielts_extra_practice_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.ielts_extra_practice_access_context();
$$;

create or replace function public.rpc_ielts_update_extra_practice_access(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_context jsonb := private.ielts_extra_practice_access_context();
  v_school_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '28000', message = 'not_authenticated';
  end if;
  if p_enabled is null then
    raise exception using errcode = '22023', message = 'enabled_value_required';
  end if;
  if not coalesce((v_context->>'resolved')::boolean, false)
     or not coalesce((v_context->>'can_manage')::boolean, false)
     or nullif(v_context->>'school_id', '') is null then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  v_school_id := (v_context->>'school_id')::uuid;

  update public.schools s
  set settings = coalesce(s.settings, '{}'::jsonb)
      || jsonb_build_object('ielts_extra_practice_enabled', p_enabled),
      updated_at = now()
  where s.id = v_school_id
    and s.status = 'active';

  if not found then
    raise exception using errcode = 'P0002', message = 'school_not_found';
  end if;

  return v_context || jsonb_build_object(
    'enabled', p_enabled,
    'reason', case when p_enabled then 'school_setting_enabled' else 'school_setting_disabled' end
  );
end;
$$;

create or replace function public.rpc_ielts_check_practice_access(
  p_skill text,
  p_task_id text
)
returns table(allowed boolean, reason text, required_tier text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_content_id bigint;
  v_content_type text;
  v_required_tier text;
  v_context jsonb;
begin
  if v_user_id is null then
    return query select false, 'not_authenticated'::text, null::text;
    return;
  end if;

  if p_task_id is null or p_task_id !~ '^[0-9]+$' then
    return query select false, 'not_found'::text, null::text;
    return;
  end if;

  begin
    v_content_id := p_task_id::bigint;
  exception when numeric_value_out_of_range then
    return query select false, 'not_found'::text, null::text;
    return;
  end;

  case lower(trim(coalesce(p_skill, '')))
    when 'reading' then
      v_content_type := 'ielts_reading_set';
      select coalesce(r.required_tier, 'free')
      into v_required_tier
      from public.ielts_reading_sets r
      where r.id = v_content_id and r.is_active = true;
    when 'listening' then
      v_content_type := 'ielts_listening_set';
      select coalesce(l.required_tier, 'prime_prep_user')
      into v_required_tier
      from public.ielts_listening_sets l
      where l.id = v_content_id and l.is_active = true;
    when 'writing' then
      v_content_type := 'ielts_writing_task';
      select coalesce(w.required_tier, 'free')
      into v_required_tier
      from public.ielts_writing_tasks w
      where w.id = v_content_id and w.is_active = true;
    when 'speaking' then
      v_content_type := 'ielts_speaking_task';
      select coalesce(s.required_tier, 'free')
      into v_required_tier
      from public.ielts_speaking_tasks s
      where s.id = v_content_id and s.is_active = true;
    else
      return query select false, 'not_found'::text, null::text;
      return;
  end case;

  if not found then
    return query select false, 'not_found'::text, null::text;
    return;
  end if;

  if private.ielts_can_access_practice_content(v_content_type, p_task_id) then
    return query select true, 'allowed'::text, v_required_tier;
    return;
  end if;

  v_context := private.ielts_extra_practice_access_context();
  if coalesce((v_context->>'resolved')::boolean, false)
     and coalesce((v_context->>'enabled')::boolean, false)
     and coalesce(v_required_tier, 'free') <> 'free'
     and not public.ielts_user_has_prime_access(v_user_id) then
    return query select false, 'prime_required'::text, v_required_tier;
    return;
  end if;

  return query select false, 'extra_practice_disabled'::text, v_required_tier;
end;
$$;

-- Preserve the original numeric signature while routing it through the
-- bigint-safe text implementation above.
create or replace function public.rpc_ielts_check_practice_access(
  p_skill text,
  p_task_id integer
)
returns table(allowed boolean, reason text, required_tier text)
language sql
stable
security definer
set search_path = ''
as $$
  select *
  from public.rpc_ielts_check_practice_access(p_skill, p_task_id::text);
$$;

revoke all on function public.rpc_ielts_extra_practice_access() from public, anon, authenticated, service_role;
revoke all on function public.rpc_ielts_update_extra_practice_access(boolean) from public, anon, authenticated, service_role;
revoke all on function public.rpc_ielts_check_practice_access(text, text) from public, anon, authenticated, service_role;
revoke all on function public.rpc_ielts_check_practice_access(text, integer) from public, anon, authenticated, service_role;
grant execute on function public.rpc_ielts_extra_practice_access() to authenticated;
grant execute on function public.rpc_ielts_update_extra_practice_access(boolean) to authenticated;
grant execute on function public.rpc_ielts_check_practice_access(text, text) to authenticated;
grant execute on function public.rpc_ielts_check_practice_access(text, integer) to authenticated;

-- Anonymous users receive preview metadata only through
-- rpc_public_ielts_task_previews(). Full content is authenticated and gated.
alter table public.ielts_reading_sets enable row level security;
alter table public.ielts_reading_questions enable row level security;
alter table public.ielts_listening_sets enable row level security;
alter table public.ielts_listening_questions enable row level security;
alter table public.ielts_writing_tasks enable row level security;
alter table public.ielts_speaking_tasks enable row level security;

revoke all on table
  public.ielts_reading_sets,
  public.ielts_reading_questions,
  public.ielts_listening_sets,
  public.ielts_listening_questions,
  public.ielts_writing_tasks,
  public.ielts_speaking_tasks
from public, anon, authenticated;
grant select on table
  public.ielts_reading_sets,
  public.ielts_reading_questions,
  public.ielts_listening_sets,
  public.ielts_listening_questions,
  public.ielts_writing_tasks,
  public.ielts_speaking_tasks
to authenticated;
grant all on table
  public.ielts_reading_sets,
  public.ielts_reading_questions,
  public.ielts_listening_sets,
  public.ielts_listening_questions,
  public.ielts_writing_tasks,
  public.ielts_speaking_tasks
to service_role;

-- Remove known legacy broad/Prime-only SELECT policies. Unknown permissive
-- policies cannot bypass the restrictive gates installed below.
drop policy if exists ielts_reading_sets_auth_access on public.ielts_reading_sets;
drop policy if exists "Reading sets selectable when active" on public.ielts_reading_sets;
drop policy if exists "Allow read active reading sets" on public.ielts_reading_sets;
drop policy if exists "Reading sets viewable by authenticated users" on public.ielts_reading_sets;
drop policy if exists "Anyone can view active reading sets" on public.ielts_reading_sets;

drop policy if exists ielts_reading_questions_auth_access on public.ielts_reading_questions;
drop policy if exists "Reading questions selectable from active sets" on public.ielts_reading_questions;
drop policy if exists "Allow read reading questions" on public.ielts_reading_questions;

drop policy if exists ielts_listening_sets_auth_prime_access on public.ielts_listening_sets;
drop policy if exists "Listening sets selectable when active" on public.ielts_listening_sets;
drop policy if exists "Allow read active listening sets" on public.ielts_listening_sets;
drop policy if exists "Listening sets viewable by authenticated users" on public.ielts_listening_sets;
drop policy if exists "Anyone can view active listening sets" on public.ielts_listening_sets;

drop policy if exists ielts_listening_questions_auth_prime_access on public.ielts_listening_questions;
drop policy if exists "Listening questions selectable from active sets" on public.ielts_listening_questions;
drop policy if exists "Allow read listening questions" on public.ielts_listening_questions;

drop policy if exists ielts_writing_tasks_auth_access on public.ielts_writing_tasks;
drop policy if exists "Writing tasks selectable when active" on public.ielts_writing_tasks;
drop policy if exists "Allow read active writing tasks" on public.ielts_writing_tasks;
drop policy if exists "Writing tasks viewable by authenticated users" on public.ielts_writing_tasks;
drop policy if exists "Anyone can view active writing tasks" on public.ielts_writing_tasks;

drop policy if exists ielts_speaking_tasks_auth_access on public.ielts_speaking_tasks;
drop policy if exists "Speaking tasks selectable when active" on public.ielts_speaking_tasks;
drop policy if exists "Allow read active speaking tasks" on public.ielts_speaking_tasks;
drop policy if exists "Speaking tasks viewable by authenticated users" on public.ielts_speaking_tasks;
drop policy if exists "Anyone can view active speaking tasks" on public.ielts_speaking_tasks;

drop policy if exists ielts_reading_sets_authenticated_baseline on public.ielts_reading_sets;
create policy ielts_reading_sets_authenticated_baseline
  on public.ielts_reading_sets
  for select to authenticated
  using (true);
drop policy if exists ielts_reading_sets_extra_practice_gate on public.ielts_reading_sets;
create policy ielts_reading_sets_extra_practice_gate
  on public.ielts_reading_sets
  as restrictive
  for select to authenticated
  using (private.ielts_can_access_practice_content('ielts_reading_set', id::text));

drop policy if exists ielts_reading_questions_authenticated_baseline on public.ielts_reading_questions;
create policy ielts_reading_questions_authenticated_baseline
  on public.ielts_reading_questions
  for select to authenticated
  using (true);
drop policy if exists ielts_reading_questions_extra_practice_gate on public.ielts_reading_questions;
create policy ielts_reading_questions_extra_practice_gate
  on public.ielts_reading_questions
  as restrictive
  for select to authenticated
  using (private.ielts_can_access_practice_content('ielts_reading_set', set_id::text));

drop policy if exists ielts_listening_sets_authenticated_baseline on public.ielts_listening_sets;
create policy ielts_listening_sets_authenticated_baseline
  on public.ielts_listening_sets
  for select to authenticated
  using (true);
drop policy if exists ielts_listening_sets_extra_practice_gate on public.ielts_listening_sets;
create policy ielts_listening_sets_extra_practice_gate
  on public.ielts_listening_sets
  as restrictive
  for select to authenticated
  using (private.ielts_can_access_practice_content('ielts_listening_set', id::text));

drop policy if exists ielts_listening_questions_authenticated_baseline on public.ielts_listening_questions;
create policy ielts_listening_questions_authenticated_baseline
  on public.ielts_listening_questions
  for select to authenticated
  using (true);
drop policy if exists ielts_listening_questions_extra_practice_gate on public.ielts_listening_questions;
create policy ielts_listening_questions_extra_practice_gate
  on public.ielts_listening_questions
  as restrictive
  for select to authenticated
  using (private.ielts_can_access_practice_content('ielts_listening_set', set_id::text));

drop policy if exists ielts_writing_tasks_authenticated_baseline on public.ielts_writing_tasks;
create policy ielts_writing_tasks_authenticated_baseline
  on public.ielts_writing_tasks
  for select to authenticated
  using (true);
drop policy if exists ielts_writing_tasks_extra_practice_gate on public.ielts_writing_tasks;
create policy ielts_writing_tasks_extra_practice_gate
  on public.ielts_writing_tasks
  as restrictive
  for select to authenticated
  using (private.ielts_can_access_practice_content('ielts_writing_task', id::text));

drop policy if exists ielts_speaking_tasks_authenticated_baseline on public.ielts_speaking_tasks;
create policy ielts_speaking_tasks_authenticated_baseline
  on public.ielts_speaking_tasks
  for select to authenticated
  using (true);
drop policy if exists ielts_speaking_tasks_extra_practice_gate on public.ielts_speaking_tasks;
create policy ielts_speaking_tasks_extra_practice_gate
  on public.ielts_speaking_tasks
  as restrictive
  for select to authenticated
  using (private.ielts_can_access_practice_content('ielts_speaking_task', id::text));

-- Keep historical attempt SELECT policies unchanged. A caller must have access
-- to content when an attempt starts, while an already-created attempt remains
-- saveable if a school later disables Extra Practice or archives the content.
-- Immutable identity prevents that compatibility rule from being abused to
-- retarget an existing attempt to another user or task.
alter table public.ielts_reading_attempts enable row level security;
alter table public.ielts_listening_attempts enable row level security;
alter table public.ielts_writing_attempts enable row level security;
alter table public.ielts_speaking_attempts enable row level security;

revoke all on table
  public.ielts_reading_attempts,
  public.ielts_listening_attempts,
  public.ielts_writing_attempts,
  public.ielts_speaking_attempts
from public, anon, authenticated;
grant select, insert, update on table
  public.ielts_reading_attempts,
  public.ielts_listening_attempts,
  public.ielts_writing_attempts,
  public.ielts_speaking_attempts
to authenticated;
grant all on table
  public.ielts_reading_attempts,
  public.ielts_listening_attempts,
  public.ielts_writing_attempts,
  public.ielts_speaking_attempts
to service_role;

drop policy if exists ielts_reading_attempts_extra_practice_insert_gate on public.ielts_reading_attempts;
create policy ielts_reading_attempts_extra_practice_insert_gate
  on public.ielts_reading_attempts
  as restrictive
  for insert to authenticated
  with check (private.ielts_can_access_practice_content('ielts_reading_set', set_id::text));
drop policy if exists ielts_reading_attempts_extra_practice_update_gate on public.ielts_reading_attempts;

drop policy if exists ielts_listening_attempts_extra_practice_insert_gate on public.ielts_listening_attempts;
create policy ielts_listening_attempts_extra_practice_insert_gate
  on public.ielts_listening_attempts
  as restrictive
  for insert to authenticated
  with check (private.ielts_can_access_practice_content('ielts_listening_set', set_id::text));
drop policy if exists ielts_listening_attempts_extra_practice_update_gate on public.ielts_listening_attempts;

drop policy if exists ielts_writing_attempts_extra_practice_insert_gate on public.ielts_writing_attempts;
create policy ielts_writing_attempts_extra_practice_insert_gate
  on public.ielts_writing_attempts
  as restrictive
  for insert to authenticated
  with check (private.ielts_can_access_practice_content('ielts_writing_task', task_id::text));
drop policy if exists ielts_writing_attempts_extra_practice_update_gate on public.ielts_writing_attempts;

drop policy if exists ielts_speaking_attempts_extra_practice_insert_gate on public.ielts_speaking_attempts;
create policy ielts_speaking_attempts_extra_practice_insert_gate
  on public.ielts_speaking_attempts
  as restrictive
  for insert to authenticated
  with check (private.ielts_can_access_practice_content('ielts_speaking_task', task_id::text));
drop policy if exists ielts_speaking_attempts_extra_practice_update_gate on public.ielts_speaking_attempts;

create or replace function private.ielts_enforce_attempt_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_content_key text := case
    when tg_table_name in ('ielts_reading_attempts', 'ielts_listening_attempts') then 'set_id'
    else 'task_id'
  end;
begin
  if to_jsonb(new)->'user_id' is distinct from to_jsonb(old)->'user_id'
     or to_jsonb(new)->v_content_key is distinct from to_jsonb(old)->v_content_key then
    raise exception using
      errcode = '22023',
      message = 'attempt_identity_immutable';
  end if;
  return new;
end;
$$;

revoke all on function private.ielts_enforce_attempt_identity()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_ielts_reading_attempt_identity on public.ielts_reading_attempts;
create trigger trg_ielts_reading_attempt_identity
  before update on public.ielts_reading_attempts
  for each row execute function private.ielts_enforce_attempt_identity();

drop trigger if exists trg_ielts_listening_attempt_identity on public.ielts_listening_attempts;
create trigger trg_ielts_listening_attempt_identity
  before update on public.ielts_listening_attempts
  for each row execute function private.ielts_enforce_attempt_identity();

drop trigger if exists trg_ielts_writing_attempt_identity on public.ielts_writing_attempts;
create trigger trg_ielts_writing_attempt_identity
  before update on public.ielts_writing_attempts
  for each row execute function private.ielts_enforce_attempt_identity();

drop trigger if exists trg_ielts_speaking_attempt_identity on public.ielts_speaking_attempts;
create trigger trg_ielts_speaking_attempt_identity
  before update on public.ielts_speaking_attempts
  for each row execute function private.ielts_enforce_attempt_identity();

-- The full settings document is no longer visible through the old
-- "every active school" policy. Members see only their own school row;
-- platform administrators retain their existing all-school fallback.
alter table public.schools enable row level security;
drop policy if exists schools_select on public.schools;
drop policy if exists "Anyone can view active schools" on public.schools;
drop policy if exists "Active schools are viewable by everyone" on public.schools;
drop policy if exists "Schools are viewable by everyone" on public.schools;
drop policy if exists "Allow read active schools" on public.schools;
drop policy if exists "Public can view active schools" on public.schools;
create policy schools_select
  on public.schools
  for select to authenticated
  using (
    public.is_superadmin((select auth.uid()))
    or exists (
      select 1
      from public.school_members sm
      where sm.school_id = schools.id
        and sm.user_id = (select auth.uid())
        and sm.status = 'active'
    )
  );

-- Restrictive semantics prevent any forgotten permissive legacy policy from
-- restoring cross-school row access through PostgreSQL policy OR-combination.
drop policy if exists schools_authenticated_membership_gate on public.schools;
create policy schools_authenticated_membership_gate
  on public.schools
  as restrictive
  for select to authenticated
  using (
    public.is_superadmin((select auth.uid()))
    or exists (
      select 1
      from public.school_members sm
      where sm.school_id = schools.id
        and sm.user_id = (select auth.uid())
        and sm.status = 'active'
    )
  );

revoke all on table public.schools from public, anon, authenticated;
grant select on table public.schools to authenticated;
grant all on table public.schools to service_role;

create or replace function public.get_available_schools()
returns table (
  id uuid,
  name text,
  slug text,
  logo_url text,
  allow_student_signup boolean,
  allow_teacher_signup boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.name,
    s.slug,
    s.logo_url,
    coalesce((s.settings->>'allow_student_signup')::boolean, true),
    coalesce((s.settings->>'allow_teacher_signup')::boolean, true)
  from public.schools s
  where s.status = 'active'
  order by
    case when s.settings->>'is_default' = 'true' then 0 else 1 end,
    s.name;
$$;

revoke all on function public.get_available_schools() from public, anon, authenticated, service_role;
grant execute on function public.get_available_schools() to anon, authenticated;

-- This assignment-picker catalogue previously bypassed every content policy as
-- SECURITY DEFINER. Run it as the caller so the authoritative RLS gate applies.
create or replace function public.rpc_ielts_practice_content_catalog(
  p_skill text default null,
  p_search text default null,
  p_limit int default 50
)
returns table (
  content_type text,
  content_id text,
  title text,
  skill text,
  description text,
  difficulty text,
  band text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with normalized as (
    select
      lower(nullif(trim(p_skill), '')) as requested_skill,
      nullif(trim(p_search), '') as requested_search,
      greatest(1, least(coalesce(p_limit, 50), 100)) as requested_limit
  ), catalog as (
    select
      'ielts_reading_set'::text as content_type,
      r.id::text as content_id,
      coalesce(nullif(r.title, ''), r.slug, 'Reading set ' || r.id::text)::text as title,
      'reading'::text as skill,
      nullif(left(coalesce(r.description, ''), 240), '')::text as description,
      nullif(r.level, '')::text as difficulty,
      case
        when r.est_band_min is not null and r.est_band_max is not null then r.est_band_min::text || '-' || r.est_band_max::text
        when r.est_band_min is not null then r.est_band_min::text || '+'
        when r.est_band_max is not null then 'Up to ' || r.est_band_max::text
        else null
      end::text as band,
      r.created_at
    from public.ielts_reading_sets r
    where coalesce(r.is_active, true) = true

    union all

    select
      'ielts_listening_set'::text,
      l.id::text,
      coalesce(nullif(l.title, ''), l.slug, 'Listening set ' || l.id::text)::text,
      'listening'::text,
      nullif(left(coalesce(l.description, ''), 240), '')::text,
      nullif(l.level, '')::text,
      case
        when l.est_band_min is not null and l.est_band_max is not null then l.est_band_min::text || '-' || l.est_band_max::text
        when l.est_band_min is not null then l.est_band_min::text || '+'
        when l.est_band_max is not null then 'Up to ' || l.est_band_max::text
        else null
      end::text,
      l.created_at
    from public.ielts_listening_sets l
    where coalesce(l.is_active, true) = true
      and nullif(trim(coalesce(l.audio_url, '')), '') is not null
      and exists (
        select 1
        from public.ielts_listening_questions q
        where q.set_id = l.id
      )

    union all

    select
      'ielts_writing_task'::text,
      w.id::text,
      coalesce(nullif(w.title, ''), w.slug, 'Writing ' || coalesce(w.task_type, 'task') || ' ' || w.id::text)::text,
      'writing'::text,
      nullif(left(coalesce(w.prompt, ''), 240), '')::text,
      nullif(w.task_type, '')::text,
      nullif(w.bands_target, '')::text,
      w.created_at
    from public.ielts_writing_tasks w
    where coalesce(w.is_active, true) = true

    union all

    select
      'ielts_speaking_task'::text,
      s.id::text,
      coalesce(s.slug, 'Speaking part ' || s.part::text || ' task ' || s.id::text)::text,
      'speaking'::text,
      nullif(left(coalesce(s.prompt, ''), 240), '')::text,
      ('part ' || s.part::text)::text,
      null::text,
      s.created_at
    from public.ielts_speaking_tasks s
    where coalesce(s.is_active, true) = true
  )
  select
    c.content_type,
    c.content_id,
    c.title,
    c.skill,
    c.description,
    c.difficulty,
    c.band
  from catalog c
  cross join normalized n
  where (n.requested_skill is null or c.skill = n.requested_skill)
    and (n.requested_search is null or c.title ilike '%' || n.requested_search || '%')
  order by c.created_at desc nulls last, c.title asc
  limit (select requested_limit from normalized);
$$;

revoke all on function public.rpc_ielts_practice_content_catalog(text, text, int)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_ielts_practice_content_catalog(text, text, int)
  to authenticated;

-- Entitlement helpers may only answer for the authenticated caller. Service
-- operations retain explicit target access; arbitrary authenticated probing is
-- rejected before any subscription/profile lookup.
create or replace function public.has_active_ielts_prime_subscription(p_user_id uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := (select auth.uid());
  v_target_id uuid := coalesce(p_user_id, v_caller_id);
begin
  if v_target_id is null then
    return false;
  end if;
  if coalesce((select auth.role()), '') <> 'service_role'
     and (v_caller_id is null or v_target_id <> v_caller_id) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  return exists (
    select 1
    from public.ielts_prime_subscriptions s
    where s.user_id = v_target_id
      and (
        s.status in ('active', 'trialing')
        or (s.status = 'cancelled' and s.current_period_end is not null and s.current_period_end > now())
      )
  );
end;
$$;

create or replace function public.ielts_user_has_prime_access(p_user_id uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := (select auth.uid());
  v_user_id uuid := coalesce(p_user_id, v_caller_id);
  v_tier text;
  v_school_tier text;
begin
  if v_user_id is null then
    return false;
  end if;
  if coalesce((select auth.role()), '') <> 'service_role'
     and (v_caller_id is null or v_user_id <> v_caller_id) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  if public.has_active_ielts_prime_subscription(v_user_id) then
    return true;
  end if;

  select iu.tier
  into v_tier
  from public.ielts_users iu
  where iu.id = v_user_id;

  if v_tier in ('prime_prep_user', 'admin', 'pro') then
    return true;
  end if;

  begin
    select public.get_effective_tier(v_user_id) into v_school_tier;
    if v_school_tier is not null and v_school_tier <> 'free' then
      return true;
    end if;
  exception when undefined_function then
    return false;
  end;

  return false;
end;
$$;

revoke all on function public.has_active_ielts_prime_subscription(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.ielts_user_has_prime_access(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.has_active_ielts_prime_subscription(uuid)
  to authenticated, service_role;
grant execute on function public.ielts_user_has_prime_access(uuid)
  to authenticated, service_role;

comment on function public.rpc_ielts_extra_practice_access() is
  'Returns the authenticated caller''s server-resolved IELTS Extra Practice state. No client school ID is accepted.';
comment on function public.rpc_ielts_update_extra_practice_access(boolean) is
  'Updates only the authenticated manager''s server-resolved school setting.';
comment on function public.rpc_ielts_check_practice_access(text, text) is
  'Checks school Extra Practice, assigned-practice and personal Prime access using a bigint-safe content identifier.';
comment on function public.rpc_ielts_practice_content_catalog(text, text, int) is
  'RLS-enforced IELTS assignment-picker metadata catalogue; no answer or solution fields are returned.';
