-- Govern verified school-identity changes and make registration rules fail closed.

create table if not exists public.school_identity_change_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','completed')),
  school_name_at_request text not null,
  school_logo_at_request text,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text,
  reviewed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_identity_change_request_reason_check check (char_length(trim(reason)) between 10 and 1000)
);

create unique index if not exists school_identity_change_requests_one_pending_idx
  on public.school_identity_change_requests(school_id)
  where status = 'pending';
create index if not exists school_identity_change_requests_queue_idx
  on public.school_identity_change_requests(status, created_at desc);
create index if not exists school_identity_change_requests_requested_by_idx
  on public.school_identity_change_requests(requested_by, created_at desc);
create index if not exists school_identity_change_requests_reviewed_by_idx
  on public.school_identity_change_requests(reviewed_by)
  where reviewed_by is not null;

alter table public.school_identity_change_requests enable row level security;
revoke all on table public.school_identity_change_requests from public, anon, authenticated;
grant select, insert, update, delete on table public.school_identity_change_requests to service_role;

create or replace function public.rpc_school_request_identity_change(
  p_school_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_school public.schools%rowtype;
  v_request public.school_identity_change_requests%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if not (public.can_administer_school(p_school_id) or public.is_school_owner(p_school_id)) then
    raise exception using errcode = '42501', message = 'school_administrator_access_required';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 10 and 1000 then
    return jsonb_build_object('success', false, 'code', 'reason_required', 'error', 'Explain the identity change needed in at least 10 characters.');
  end if;

  select * into v_school from public.schools where id = p_school_id and status = 'active';
  if v_school.id is null then
    return jsonb_build_object('success', false, 'code', 'school_not_found', 'error', 'School not found.');
  end if;

  select * into v_request
  from public.school_identity_change_requests r
  where r.school_id = p_school_id and r.status = 'pending'
  order by r.created_at desc
  limit 1;
  if v_request.id is not null then
    return jsonb_build_object('success', true, 'requestId', v_request.id, 'status', v_request.status, 'message', 'Your identity change request is already awaiting superadmin review.');
  end if;

  insert into public.school_identity_change_requests(
    school_id, requested_by, reason, school_name_at_request, school_logo_at_request
  ) values (
    p_school_id, v_actor, trim(p_reason), v_school.name, v_school.logo_url
  ) returning * into v_request;

  insert into public.school_governance_audit_log(
    school_id, actor_user_id, event_type, category, severity, summary, reason, metadata
  ) values (
    p_school_id, v_actor, 'school_identity_change_requested', 'school', 'notice',
    'School identity unlock requested', trim(p_reason), jsonb_build_object('request_id', v_request.id)
  );

  return jsonb_build_object(
    'success', true, 'requestId', v_request.id, 'status', v_request.status,
    'message', 'Request sent to the superadmin for review.'
  );
end;
$$;

create or replace function public.rpc_school_identity_change_request_status(p_school_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_request public.school_identity_change_requests%rowtype;
begin
  if auth.uid() is null or not (public.can_administer_school(p_school_id) or public.is_school_owner(p_school_id)) then
    raise exception using errcode = '42501', message = 'school_administrator_access_required';
  end if;
  select * into v_request
  from public.school_identity_change_requests r
  where r.school_id = p_school_id
  order by r.created_at desc
  limit 1;
  if v_request.id is null then return jsonb_build_object('success', true, 'request', null); end if;
  return jsonb_build_object('success', true, 'request', jsonb_build_object(
    'id', v_request.id,
    'status', v_request.status,
    'reason', v_request.reason,
    'reviewNote', v_request.review_note,
    'createdAt', v_request.created_at,
    'reviewedAt', v_request.reviewed_at,
    'completedAt', v_request.completed_at
  ));
end;
$$;

create or replace function public.rpc_superadmin_list_school_identity_change_requests(
  p_status text default 'pending',
  p_limit integer default 200
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.is_superadmin(auth.uid()) then
    raise exception using errcode = '42501', message = 'platform_superadmin_access_required';
  end if;
  if p_status is not null and p_status not in ('pending','approved','rejected','completed','all') then
    raise exception using errcode = '22023', message = 'invalid_request_status';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id,
    'schoolId', q.school_id,
    'schoolName', s.name,
    'schoolLogoUrl', s.logo_url,
    'requestedBy', q.requested_by,
    'requesterName', coalesce(nullif(trim(u.full_name),''), nullif(trim(u.username),''), u.email, 'School administrator'),
    'requesterEmail', u.email,
    'reason', q.reason,
    'status', q.status,
    'schoolNameAtRequest', q.school_name_at_request,
    'schoolLogoAtRequest', q.school_logo_at_request,
    'reviewNote', q.review_note,
    'reviewedAt', q.reviewed_at,
    'completedAt', q.completed_at,
    'createdAt', q.created_at
  ) order by q.created_at desc), '[]'::jsonb)
  into v_result
  from (
    select r.*
    from public.school_identity_change_requests r
    where p_status is null or p_status = 'all' or r.status = p_status
    order by r.created_at desc
    limit greatest(1, least(coalesce(p_limit, 200), 500))
  ) q
  join public.schools s on s.id = q.school_id
  left join public.users u on u.id = q.requested_by;
  return v_result;
end;
$$;

create or replace function public.rpc_superadmin_decide_school_identity_change_request(
  p_request_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_request public.school_identity_change_requests%rowtype;
  v_decision text := lower(trim(coalesce(p_decision, '')));
begin
  if v_actor is null or not public.is_superadmin(v_actor) then
    raise exception using errcode = '42501', message = 'platform_superadmin_access_required';
  end if;
  if v_decision not in ('approve','reject') then
    raise exception using errcode = '22023', message = 'invalid_identity_request_decision';
  end if;
  if v_decision = 'reject' and char_length(trim(coalesce(p_note, ''))) < 5 then
    return jsonb_build_object('success', false, 'error', 'Add a short reason before rejecting the request.');
  end if;

  select * into v_request
  from public.school_identity_change_requests
  where id = p_request_id
  for update;
  if v_request.id is null then return jsonb_build_object('success', false, 'error', 'Identity change request not found.'); end if;
  if v_request.status <> 'pending' then
    return jsonb_build_object('success', false, 'error', 'This request has already been reviewed.');
  end if;

  update public.school_identity_change_requests
  set status = case when v_decision = 'approve' then 'approved' else 'rejected' end,
      reviewed_by = v_actor,
      review_note = nullif(trim(coalesce(p_note, '')), ''),
      reviewed_at = now(),
      updated_at = now()
  where id = p_request_id;

  if v_decision = 'approve' then
    insert into public.school_head_onboarding(school_id) values (v_request.school_id)
    on conflict (school_id) do nothing;
    update public.school_head_onboarding
    set identity_confirmed_at = null,
        identity_confirmed_by = null,
        updated_at = now()
    where school_id = v_request.school_id;
  end if;

  insert into public.school_governance_audit_log(
    school_id, actor_user_id, event_type, category, severity, summary, reason, metadata
  ) values (
    v_request.school_id, v_actor,
    case when v_decision = 'approve' then 'school_identity_change_unlocked' else 'school_identity_change_rejected' end,
    'school', case when v_decision = 'approve' then 'warning' else 'notice' end,
    case when v_decision = 'approve' then 'Superadmin unlocked the verified school identity' else 'Superadmin rejected the school identity unlock request' end,
    nullif(trim(coalesce(p_note, '')), ''), jsonb_build_object('request_id', p_request_id)
  );

  return jsonb_build_object(
    'success', true,
    'status', case when v_decision = 'approve' then 'approved' else 'rejected' end,
    'message', case when v_decision = 'approve'
      then 'School identity unlocked. The school can now update and reconfirm it.'
      else 'Identity change request rejected.' end
  );
end;
$$;

-- Finish an approved request when the school reconfirms the new identity.
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
  v_request_id uuid;
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

  select r.id into v_request_id
  from public.school_identity_change_requests r
  where r.school_id = p_school_id and r.status = 'approved'
  order by r.reviewed_at desc nulls last, r.created_at desc
  limit 1
  for update;
  if v_request_id is not null then
    update public.school_identity_change_requests
    set status = 'completed', completed_at = now(), updated_at = now()
    where id = v_request_id;
  end if;

  insert into public.school_governance_audit_log(
    school_id, actor_user_id, event_type, category, severity, summary, metadata
  ) values (
    p_school_id, v_actor, 'school_identity_confirmed', 'school', 'notice',
    'School name and logo confirmed', jsonb_build_object('name', trim(p_name), 'has_logo', p_logo_url is not null, 'request_id', v_request_id)
  );
  return jsonb_build_object('success', true);
end;
$$;

-- The invitation code can identify a school, but membership creation must also
-- respect the two explicit school registration switches. Missing settings are
-- closed, not treated as permission.
create or replace function public.join_school_by_code(
  p_invite_code text,
  p_role text default 'student'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_user public.users%rowtype;
  v_email_confirmed_at timestamptz;
  v_school public.schools%rowtype;
  v_existing public.school_members%rowtype;
  v_reactivated public.school_members%rowtype;
  v_rate_check jsonb;
  v_cleaned_code text;
  v_role text := lower(trim(coalesce(p_role, '')));
  v_auth_email text;
  v_auth_meta jsonb;
  v_fallback_username text;
begin
  if v_user_id is null then return jsonb_build_object('success', false, 'code', 'not_authenticated', 'error', 'Not authenticated'); end if;
  if v_role not in ('student','teacher') then return jsonb_build_object('success', false, 'code', 'invalid_role', 'error', 'Choose student or teacher.'); end if;

  select email_confirmed_at into v_email_confirmed_at from auth.users where id = v_user_id;
  if v_email_confirmed_at is null then return jsonb_build_object('success', false, 'code', 'email_not_verified', 'error', 'Please verify your email before joining a school'); end if;
  select * into v_user from public.users where id = v_user_id;
  if v_user.id is null then
    select email, raw_user_meta_data into v_auth_email, v_auth_meta from auth.users where id = v_user_id;
    if v_auth_email is null then return jsonb_build_object('success', false, 'code', 'not_authenticated', 'error', 'Not authenticated'); end if;
    v_fallback_username := left(coalesce(nullif(trim(v_auth_meta->>'username'), ''), split_part(v_auth_email, '@', 1)), 20)
      || '_' || left(replace(gen_random_uuid()::text, '-', ''), 6);
    insert into public.users(id, email, username, role, needs_setup, created_at, updated_at)
    values (v_user_id, v_auth_email, v_fallback_username, 'student', true, now(), now())
    on conflict (id) do nothing;
    select * into v_user from public.users where id = v_user_id;
  end if;
  if v_user.id is null then return jsonb_build_object('success', false, 'code', 'user_not_found', 'error', 'User not found'); end if;
  if coalesce(v_user.is_banned, false) then return jsonb_build_object('success', false, 'code', 'account_suspended', 'error', 'Account is suspended'); end if;

  select * into v_existing from public.school_members where user_id = v_user_id and status = 'active' order by joined_at, id limit 1 for update;
  if v_existing.id is not null then
    return jsonb_build_object('success', false, 'code', 'active_school_conflict', 'error', 'You are already a member of a school. Leave your current school first.', 'current_school_id', v_existing.school_id);
  end if;

  v_rate_check := public.check_invite_rate_limit(v_user_id);
  if coalesce((v_rate_check->>'allowed')::boolean, false) is not true then return v_rate_check; end if;
  v_cleaned_code := public.normalize_invite_code(p_invite_code);
  if v_cleaned_code is null or length(v_cleaned_code) < 6 then
    insert into public.invite_code_attempts(user_id, attempted_code, success) values (v_user_id, coalesce(left(v_cleaned_code,3),'???') || '***', false);
    return jsonb_build_object('success', false, 'code', 'invalid_invite_code', 'error', 'Invalid invite code format');
  end if;

  select * into v_school from public.schools where invite_code = v_cleaned_code and status = 'active' for share;
  if v_school.id is null then
    insert into public.invite_code_attempts(user_id, attempted_code, success) values (v_user_id, left(v_cleaned_code,3) || '***', false);
    return jsonb_build_object('success', false, 'code', 'invalid_invite_code', 'error', 'Invalid or expired invite code');
  end if;

  if v_role = 'student' and coalesce((v_school.settings->>'allow_student_signup')::boolean, false) is not true then
    return jsonb_build_object('success', false, 'code', 'student_signup_closed', 'error', 'Student registration is closed for this school.');
  end if;
  if v_role = 'teacher' and coalesce((v_school.settings->>'allow_teacher_signup')::boolean, false) is not true then
    return jsonb_build_object('success', false, 'code', 'teacher_signup_closed', 'error', 'Teacher registration is closed for this school.');
  end if;

  update public.school_members
  set status = 'active', role_in_school = v_role, can_teach = v_role = 'teacher', updated_at = now()
  where user_id = v_user_id and school_id = v_school.id and status <> 'active'
  returning * into v_reactivated;

  if v_reactivated.id is null then
    begin
      insert into public.school_members(school_id, user_id, role_in_school, status, is_owner, can_teach)
      values (v_school.id, v_user_id, v_role, 'active', false, v_role = 'teacher')
      on conflict (user_id, school_id) do update
      set status = 'active', role_in_school = excluded.role_in_school, can_teach = excluded.can_teach, updated_at = now();
    exception when unique_violation then
      select * into v_existing from public.school_members where user_id = v_user_id and status = 'active' order by joined_at, id limit 1;
      return jsonb_build_object('success', false, 'code', 'active_school_conflict', 'error', 'You are already a member of a school. Leave your current school first.', 'current_school_id', coalesce(v_existing.school_id, v_school.id));
    end;
  end if;

  if v_role = 'teacher' then
    update public.users set role = 'teacher', updated_at = now() where id = v_user_id and role = 'student';
  end if;
  insert into public.invite_code_attempts(user_id, attempted_code, success) values (v_user_id, left(v_cleaned_code,3) || '***', true);

  return jsonb_build_object(
    'success', true,
    'message', 'Successfully joined ' || v_school.name,
    'school', jsonb_build_object('id', v_school.id, 'name', v_school.name, 'slug', v_school.slug)
  );
exception when unique_violation then
  return jsonb_build_object('success', false, 'code', 'membership_conflict', 'error', 'School membership could not be created safely.');
end;
$$;

revoke all on function public.rpc_school_request_identity_change(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.rpc_school_identity_change_request_status(uuid) from public, anon, authenticated, service_role;
revoke all on function public.rpc_superadmin_list_school_identity_change_requests(text, integer) from public, anon, authenticated, service_role;
revoke all on function public.rpc_superadmin_decide_school_identity_change_request(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.rpc_school_admin_confirm_identity(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.join_school_by_code(text, text) from public, anon, authenticated, service_role;

grant execute on function public.rpc_school_request_identity_change(uuid, text) to authenticated, service_role;
grant execute on function public.rpc_school_identity_change_request_status(uuid) to authenticated, service_role;
grant execute on function public.rpc_superadmin_list_school_identity_change_requests(text, integer) to authenticated, service_role;
grant execute on function public.rpc_superadmin_decide_school_identity_change_request(uuid, text, text) to authenticated, service_role;
grant execute on function public.rpc_school_admin_confirm_identity(uuid, text, text) to authenticated, service_role;
grant execute on function public.join_school_by_code(text, text) to authenticated, service_role;

notify pgrst, 'reload schema';
