-- Phase 3 security prerequisite: school_members and superadmins are the only
-- authority sources. public.users.role/is_admin/school_id remain compatibility
-- mirrors and may no longer be manufactured by browser writes or signup data.

create schema if not exists private;

create or replace function private.phase3_expected_school_id(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case when count(*) = 1 then (array_agg(sm.school_id order by sm.school_id))[1] end
  from public.school_members sm
  where sm.user_id = p_user_id and sm.status = 'active';
$$;

create or replace function private.phase3_expected_legacy_role(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.superadmins sa where sa.user_id = p_user_id) then 'admin'
    when count(sm.id) <> 1 then null
    when bool_or(sm.role_in_school = 'school_admin') then 'school_admin'
    when bool_or(sm.role_in_school = 'teacher' or coalesce(sm.can_teach, false)) then 'teacher'
    else 'student'
  end
  from public.school_members sm
  where sm.user_id = p_user_id and sm.status = 'active';
$$;

revoke all on function private.phase3_expected_school_id(uuid) from public, anon, authenticated, service_role;
revoke all on function private.phase3_expected_legacy_role(uuid) from public, anon, authenticated, service_role;

-- The live preflight performed for this release found exactly one historic
-- platform administrator and that account is already present in superadmins.
-- Removing the cached-users fallback therefore preserves the legitimate admin
-- while closing self-promotion through public.users.
create or replace function public.is_superadmin(p_user_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.superadmins sa
    where sa.user_id = coalesce(p_user_id, auth.uid())
  );
$$;

revoke all on function public.is_superadmin(uuid) from public, anon, authenticated, service_role;
grant execute on function public.is_superadmin(uuid) to authenticated;

create or replace function private.phase3_guard_user_authority()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school_id uuid;
  v_role text;
  v_memberships integer;
begin
  -- Migrations and server-side service operations remain available. A browser
  -- JWT cannot obtain this bypass merely by changing a custom setting.
  if current_setting('request.jwt.claim.role', true) = 'service_role'
     or (session_user::text in ('postgres', 'supabase_admin')
         and coalesce(current_setting('request.jwt.claim.role', true), '') = '') then
    return new;
  end if;

  select count(*) into v_memberships
  from public.school_members sm
  where sm.user_id = new.id and sm.status = 'active';
  v_school_id := private.phase3_expected_school_id(new.id);
  v_role := private.phase3_expected_legacy_role(new.id);

  if tg_op = 'INSERT' then
    if new.school_id is not null
       or coalesce(new.is_admin, false)
       or coalesce(new.role, 'student') not in ('student', 'teacher') then
      raise exception using errcode = '42501', message = 'user_authority_fields_are_server_controlled';
    end if;
    return new;
  end if;

  if not coalesce(old.needs_setup, true) and coalesce(new.needs_setup, false) then
    raise exception using errcode = '42501', message = 'user_setup_state_is_server_controlled';
  end if;

  if new.school_id is not distinct from old.school_id
     and new.role is not distinct from old.role
     and new.is_admin is not distinct from old.is_admin then
    return new;
  end if;

  if v_memberships > 1 then
    raise exception using errcode = '23514', message = 'multiple_active_school_memberships_require_review';
  end if;

  if v_role = 'admin' then
    if new.role is distinct from 'admin' or not coalesce(new.is_admin, false) then
      raise exception using errcode = '42501', message = 'user_authority_fields_are_server_controlled';
    end if;
  elsif v_memberships = 1 then
    if new.school_id is distinct from v_school_id
       or new.role is distinct from v_role
       or coalesce(new.is_admin, false) then
      raise exception using errcode = '42501', message = 'user_authority_fields_are_server_controlled';
    end if;
  elsif new.school_id is not null or coalesce(new.is_admin, false) then
    raise exception using errcode = '42501', message = 'user_authority_fields_are_server_controlled';
  elsif new.role = old.role and new.role in ('student', 'teacher') then
    null;
  elsif old.role = 'student' and new.role = 'teacher'
        and coalesce(old.needs_setup, true) and not coalesce(new.needs_setup, false) then
    null;
  else
    raise exception using errcode = '42501', message = 'user_authority_fields_are_server_controlled';
  end if;

  return new;
end;
$$;

revoke all on function private.phase3_guard_user_authority() from public, anon, authenticated, service_role;

drop trigger if exists trg_block_direct_school_id on public.users;
drop trigger if exists trg_000_phase3_guard_user_authority_insert on public.users;
create trigger trg_000_phase3_guard_user_authority_insert
before insert on public.users
for each row execute function private.phase3_guard_user_authority();

drop trigger if exists trg_000_phase3_guard_user_authority_update on public.users;
create trigger trg_000_phase3_guard_user_authority_update
before update of school_id, role, is_admin, needs_setup on public.users
for each row execute function private.phase3_guard_user_authority();

revoke insert, update, delete, truncate on public.school_members from public, anon, authenticated;
grant select on public.school_members to authenticated;
grant select, insert, update, delete on public.school_members to service_role;

-- Auth metadata is user controlled. It may choose only an individual student
-- or teacher workspace; school and administrator authority is never accepted.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(new.email, '')));
  v_username text;
  v_role text := lower(coalesce(nullif(trim(new.raw_user_meta_data->>'role'), ''), 'student'));
begin
  if v_role not in ('student', 'teacher') then v_role := 'student'; end if;
  v_username := coalesce(nullif(trim(new.raw_user_meta_data->>'username'), ''), split_part(v_email, '@', 1), 'user');
  if exists (select 1 from public.users u where u.username = v_username and u.id <> new.id) then
    v_username := left(v_username, 32) || '_' || substr(new.id::text, 1, 8);
  end if;

  insert into public.users (
    id, email, username, role, school_id, grade, batch, avatar_url,
    needs_setup, created_at, updated_at
  ) values (
    new.id, v_email, v_username, v_role, null,
    case when v_role = 'student' then 6 else null end,
    case when v_role = 'student' then 'N/A' else null end,
    'https://picsum.photos/seed/' || v_username || '/100/100', true, now(), now()
  ) on conflict (id) do update set
    email = excluded.email,
    username = coalesce(nullif(public.users.username, ''), excluded.username),
    updated_at = now();
  return new;
exception when others then
  -- Authentication remains available; profile_bootstrap reports conflicts
  -- without turning untrusted metadata into authority.
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated, service_role;
grant execute on function public.handle_new_user() to supabase_auth_admin;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.profile_bootstrap(
  p_school_id uuid default null,
  p_role text default 'student',
  p_grade smallint default null,
  p_batch text default null,
  p_username text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_confirmed boolean;
  v_role text := lower(trim(coalesce(p_role, 'student')));
  v_username text;
  v_profile public.users%rowtype;
  v_member public.school_members%rowtype;
  v_school public.schools%rowtype;
  v_active_count integer;
begin
  if v_uid is null then return jsonb_build_object('success', false, 'code', 'not_authenticated', 'error', 'Not authenticated'); end if;
  if v_role not in ('student', 'teacher') then return jsonb_build_object('success', false, 'code', 'invalid_role', 'error', 'Choose student or teacher.'); end if;

  select lower(trim(au.email)), au.email_confirmed_at is not null into v_email, v_confirmed
  from auth.users au where au.id = v_uid;
  if coalesce(v_email, '') = '' then return jsonb_build_object('success', false, 'code', 'missing_email', 'error', 'Your account is missing an email address.'); end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));
  select u.* into v_profile from public.users u where u.id = v_uid for update;
  if v_profile.id is null then
    if exists (select 1 from public.users u where lower(u.email) = v_email) then
      return jsonb_build_object('success', false, 'code', 'account_profile_conflict', 'error', 'This email has a protected existing profile. Contact support to link it safely.');
    end if;
    v_username := coalesce(nullif(trim(p_username), ''), split_part(v_email, '@', 1), 'user');
    if exists (select 1 from public.users u where u.username = v_username) then v_username := left(v_username, 32) || '_' || substr(v_uid::text, 1, 8); end if;
    insert into public.users (id,email,username,role,school_id,grade,batch,needs_setup,created_at,updated_at)
    values (v_uid,v_email,v_username,'student',null,null,null,true,now(),now()) returning * into v_profile;
  end if;
  if coalesce(v_profile.is_banned, false) then return jsonb_build_object('success', false, 'code', 'account_suspended', 'error', 'This account is suspended.'); end if;

  perform 1 from public.school_members sm where sm.user_id = v_uid order by sm.school_id, sm.id for update;
  if exists (select 1 from public.school_members sm where sm.user_id=v_uid and sm.status <> 'active') then
    return jsonb_build_object('success', false, 'code', 'membership_review_required', 'error', 'A previous membership needs administrator review.');
  end if;
  select count(*) into v_active_count from public.school_members sm where sm.user_id=v_uid and sm.status='active';
  if v_active_count > 1 then return jsonb_build_object('success', false, 'code', 'membership_conflict', 'error', 'Conflicting school memberships require support review.'); end if;
  select sm.* into v_member from public.school_members sm where sm.user_id=v_uid and sm.status='active' limit 1;

  if p_school_id is not null and not coalesce(v_confirmed,false) then
    return jsonb_build_object('success', false, 'code', 'email_not_verified', 'error', 'Verify your email before joining a school.');
  end if;
  if v_member.id is not null and p_school_id is not null and v_member.school_id <> p_school_id then
    return jsonb_build_object('success', false, 'code', 'active_school_conflict', 'error', 'You are already an active member of another school.');
  end if;

  if p_school_id is not null and v_member.id is null then
    select s.* into v_school from public.schools s where s.id=p_school_id and s.status='active' for share;
    if v_school.id is null then return jsonb_build_object('success', false, 'code', 'school_unavailable', 'error', 'School not found or inactive.'); end if;
    if v_role='student' and coalesce((v_school.settings->>'allow_student_signup')::boolean,true) is not true then
      return jsonb_build_object('success', false, 'code', 'student_signup_closed', 'error', 'This school is not accepting student signups.');
    end if;
    if v_role='teacher' and coalesce((v_school.settings->>'allow_teacher_signup')::boolean,true) is not true then
      return jsonb_build_object('success', false, 'code', 'teacher_signup_closed', 'error', 'This school is not accepting teacher signups.');
    end if;
    if coalesce(cardinality(v_school.allowed_email_domains),0)>0 and not exists (
      select 1 from unnest(v_school.allowed_email_domains) d(value)
      where lower(split_part(v_email,'@',2))=lower(trim(both '@' from d.value))
    ) then return jsonb_build_object('success', false, 'code', 'email_domain_not_allowed', 'error', 'Your email domain is not allowed for this school.'); end if;
    insert into public.school_members (school_id,user_id,role_in_school,status,is_owner,can_teach)
    values (p_school_id,v_uid,v_role,'active',false,v_role='teacher') returning * into v_member;
  end if;

  if v_member.id is not null then v_role := private.phase3_expected_legacy_role(v_uid); end if;
  v_username := coalesce(nullif(trim(p_username),''),nullif(v_profile.username,''),split_part(v_email,'@',1));
  update public.users u set
    email=v_email, username=v_username,
    school_id=private.phase3_expected_school_id(v_uid),
    role=coalesce(v_role,'student'),
    grade=case when coalesce(v_role,'student')='student' then p_grade else null end,
    batch=case when coalesce(v_role,'student')='student' then nullif(upper(trim(coalesce(p_batch,''))),'') else null end,
    needs_setup=false, updated_at=now()
  where u.id=v_uid returning * into v_profile;

  return jsonb_build_object('success',true,'user_id',v_profile.id,'school_id',v_profile.school_id,'role',v_profile.role,'username',v_profile.username);
exception when unique_violation then
  return jsonb_build_object('success',false,'code','profile_conflict','error','Profile setup could not be completed safely.');
end;
$$;

revoke all on function public.profile_bootstrap(uuid,text,smallint,text,text) from public, anon, authenticated, service_role;
grant execute on function public.profile_bootstrap(uuid,text,smallint,text,text) to authenticated;

notify pgrst, 'reload schema';
