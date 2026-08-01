-- Canonical school membership capabilities, ownership and audited role transitions.
-- school_members is the source of truth; users.role remains a derived legacy hint.

alter table public.school_members
  add column if not exists is_owner boolean not null default false,
  add column if not exists can_teach boolean not null default false;

update public.school_members sm
set can_teach = true
where sm.role_in_school = 'teacher'
   or exists (
     select 1 from public.class_teacher_assignments cta
     where cta.school_id = sm.school_id
       and cta.teacher_user_id = sm.user_id
       and coalesce(cta.active, true)
   );

with ranked_admins as (
  select sm.id,
         row_number() over (
           partition by sm.school_id
           order by sm.joined_at nulls last, sm.updated_at nulls last, sm.id
         ) as owner_rank
  from public.school_members sm
  where sm.status = 'active' and sm.role_in_school = 'school_admin'
)
update public.school_members sm
set is_owner = true
from ranked_admins ra
where sm.id = ra.id and ra.owner_rank = 1
  and not exists (
    select 1 from public.school_members existing
    where existing.school_id = sm.school_id and existing.is_owner
  );

create unique index if not exists school_members_one_owner_per_school_idx
  on public.school_members (school_id) where is_owner;

alter table public.school_members drop constraint if exists school_members_owner_is_admin_check;
alter table public.school_members add constraint school_members_owner_is_admin_check
  check (not is_owner or (role_in_school = 'school_admin' and status = 'active'));

create table if not exists public.school_member_role_audit (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  member_user_id uuid not null references public.users(id) on delete cascade,
  actor_user_id uuid not null references public.users(id),
  previous_role text not null,
  new_role text not null,
  previous_can_teach boolean not null,
  new_can_teach boolean not null,
  assignment_count integer not null default 0,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists school_member_role_audit_school_created_idx
  on public.school_member_role_audit (school_id, created_at desc);
alter table public.school_member_role_audit enable row level security;
revoke all on public.school_member_role_audit from public, anon;
grant select on public.school_member_role_audit to authenticated;

create or replace function public.can_administer_school(p_school_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null and (
    exists (select 1 from public.school_members sm
      where sm.school_id = p_school_id and sm.user_id = auth.uid()
        and sm.status = 'active' and sm.role_in_school = 'school_admin')
    or public.is_superadmin(auth.uid())
  );
$$;

create or replace function public.can_teach_in_school(p_school_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.school_members sm
    where sm.school_id = p_school_id and sm.user_id = auth.uid()
      and sm.status = 'active' and sm.can_teach
  );
$$;

create or replace function public.is_school_owner(p_school_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null and (
    exists (select 1 from public.school_members sm
      where sm.school_id = p_school_id and sm.user_id = auth.uid()
        and sm.status = 'active' and sm.is_owner)
    or public.is_superadmin(auth.uid())
  );
$$;

revoke execute on function public.can_administer_school(uuid) from public, anon;
revoke execute on function public.can_teach_in_school(uuid) from public, anon;
revoke execute on function public.is_school_owner(uuid) from public, anon;
grant execute on function public.can_administer_school(uuid) to authenticated;
grant execute on function public.can_teach_in_school(uuid) to authenticated;
grant execute on function public.is_school_owner(uuid) to authenticated;

drop policy if exists school_admins_read_role_audit on public.school_member_role_audit;
create policy school_admins_read_role_audit on public.school_member_role_audit
  for select to authenticated using (public.can_administer_school(school_id));

create or replace function public.is_school_admin_of(p_school_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.can_administer_school(p_school_id); $$;

create or replace function public.is_school_admin_of(p_user_id uuid, p_school_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.school_members sm
    where sm.user_id = p_user_id and sm.school_id = p_school_id
      and sm.status = 'active' and sm.role_in_school = 'school_admin'
  ) or public.is_superadmin(p_user_id);
$$;

create or replace function public.school_admin_get_my_capabilities(p_school_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_school_id uuid; v_member public.school_members%rowtype;
begin
  if auth.uid() is null then return jsonb_build_object('success', false, 'error', 'Not authenticated'); end if;
  select sm.* into v_member from public.school_members sm
  where sm.user_id = auth.uid() and sm.status = 'active'
    and (p_school_id is null or sm.school_id = p_school_id)
  order by sm.joined_at limit 1;
  if v_member.id is null then return jsonb_build_object('success', false, 'error', 'No active school membership'); end if;
  v_school_id := v_member.school_id;
  return jsonb_build_object(
    'success', true, 'school_id', v_school_id, 'role', v_member.role_in_school,
    'is_owner', v_member.is_owner, 'can_administer', v_member.role_in_school = 'school_admin',
    'can_teach', v_member.can_teach
  );
end;
$$;
revoke execute on function public.school_admin_get_my_capabilities(uuid) from public, anon;
grant execute on function public.school_admin_get_my_capabilities(uuid) to authenticated;

create or replace function public.school_admin_list_member_capabilities(p_school_id uuid)
returns jsonb language sql stable security definer set search_path = public
as $$
  select case when public.can_administer_school(p_school_id) then coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', sm.user_id, 'role', sm.role_in_school,
      'is_owner', sm.is_owner, 'can_teach', sm.can_teach
    )) from public.school_members sm
    where sm.school_id = p_school_id and sm.status = 'active'
  ), '[]'::jsonb) else '[]'::jsonb end;
$$;
revoke execute on function public.school_admin_list_member_capabilities(uuid) from public, anon;
grant execute on function public.school_admin_list_member_capabilities(uuid) to authenticated;

create or replace function public.school_admin_transition_member_role(
  p_school_id uuid, p_member_user_id uuid, p_new_role text,
  p_keep_teaching boolean default false, p_reason text default null
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_actor uuid := auth.uid(); v_target public.school_members%rowtype;
  v_actor_owner boolean; v_assignments integer; v_new_can_teach boolean;
  v_legacy_role text;
begin
  if v_actor is null then return jsonb_build_object('success', false, 'error', 'Not authenticated'); end if;
  if p_new_role not in ('student','teacher','school_admin') then
    return jsonb_build_object('success', false, 'error', 'Choose student, teacher, or school administrator.');
  end if;
  if not public.can_administer_school(p_school_id) then
    return jsonb_build_object('success', false, 'error', 'You do not have permission to manage roles for this school.');
  end if;
  select * into v_target from public.school_members
  where school_id = p_school_id and user_id = p_member_user_id and status = 'active' for update;
  if v_target.id is null then return jsonb_build_object('success', false, 'error', 'This person is not an active member of the school.'); end if;
  select public.is_school_owner(p_school_id) into v_actor_owner;
  if v_target.is_owner and (p_new_role <> 'school_admin' or p_member_user_id <> v_actor) then
    return jsonb_build_object('success', false, 'error', 'The school owner is protected. Transfer ownership before changing this account.');
  end if;
  if v_target.is_owner and p_new_role = 'school_admin' then
    return jsonb_build_object('success', true, 'message', 'The school owner already has administrator access.');
  end if;
  if (v_target.role_in_school = 'school_admin' or p_new_role = 'school_admin') and not v_actor_owner then
    return jsonb_build_object('success', false, 'error', 'Only the school owner can promote or demote delegated administrators.');
  end if;
  select count(*) into v_assignments from public.class_teacher_assignments cta
  where cta.school_id = p_school_id and cta.teacher_user_id = p_member_user_id and coalesce(cta.active, true);
  v_new_can_teach := case when p_new_role = 'teacher' then true when p_new_role = 'school_admin' then p_keep_teaching else false end;
  if v_assignments > 0 and not v_new_can_teach then
    return jsonb_build_object('success', false, 'error', format('This person has %s active teaching assignment(s). Reassign or remove them before disabling teaching access.', v_assignments), 'code', 'ACTIVE_ASSIGNMENTS_REQUIRE_RESOLUTION', 'assignment_count', v_assignments);
  end if;
  update public.school_members set role_in_school = p_new_role, can_teach = v_new_can_teach, updated_at = now()
  where id = v_target.id;
  insert into public.school_member_role_audit(school_id,member_user_id,actor_user_id,previous_role,new_role,previous_can_teach,new_can_teach,assignment_count,reason)
  values(p_school_id,p_member_user_id,v_actor,v_target.role_in_school,p_new_role,v_target.can_teach,v_new_can_teach,v_assignments,nullif(trim(p_reason),''));
  select case
    when exists(select 1 from public.school_members where user_id=p_member_user_id and status='active' and role_in_school='school_admin') then 'school_admin'
    when exists(select 1 from public.school_members where user_id=p_member_user_id and status='active' and can_teach) then 'teacher'
    else 'student' end into v_legacy_role;
  update public.users set role=v_legacy_role, updated_at=now() where id=p_member_user_id and role <> 'admin';
  return jsonb_build_object('success', true, 'message', 'Role and portal access updated.', 'role', p_new_role, 'can_teach', v_new_can_teach, 'assignment_count', v_assignments);
end;
$$;
revoke execute on function public.school_admin_transition_member_role(uuid,uuid,text,boolean,text) from public, anon;
grant execute on function public.school_admin_transition_member_role(uuid,uuid,text,boolean,text) to authenticated;

-- Keep both historical API names as thin compatibility wrappers around the canonical transition.
create or replace function public.update_member_role(p_member_user_id uuid, p_new_role text, p_school_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_school_id uuid; v_keep boolean;
begin
  v_school_id := coalesce(p_school_id, public.my_school_id());
  select role_in_school='teacher' or can_teach into v_keep from public.school_members
  where school_id=v_school_id and user_id=p_member_user_id;
  return public.school_admin_transition_member_role(v_school_id,p_member_user_id,p_new_role,coalesce(v_keep,false),'Role changed from school administration');
end;
$$;

create or replace function public.school_admin_set_member_role(p_member_user_id uuid, p_new_role text)
returns jsonb language sql security definer set search_path = public
as $$ select public.update_member_role(p_member_user_id,p_new_role,public.my_school_id()); $$;

revoke execute on function public.update_member_role(uuid,text,uuid) from public, anon;
revoke execute on function public.school_admin_set_member_role(uuid,text) from public, anon;
grant execute on function public.update_member_role(uuid,text,uuid) to authenticated;
grant execute on function public.school_admin_set_member_role(uuid,text) to authenticated;

create or replace function public.school_admin_list_teachers(p_school_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.can_administer_school(p_school_id) then raise exception 'Forbidden: not a school administrator of this school'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'user_id',sm.user_id,'username',u.username,'email',u.email,
    'role_in_school',sm.role_in_school,'is_owner',sm.is_owner,'can_teach',sm.can_teach,
    'subject_specializations',coalesce(to_jsonb(t.subject_specializations),'[]'::jsonb),
    'verified',coalesce(t.verified,false)
  ) order by u.username)
  from public.school_members sm join public.users u on u.id=sm.user_id
  left join public.teachers t on t.user_id=sm.user_id
  where sm.school_id=p_school_id and sm.status='active' and sm.can_teach),'[]'::jsonb);
end;
$$;

create or replace function public.admin_assign_teacher_to_class_subject(p_school_id uuid,p_class_id uuid,p_teacher_user_id uuid,p_subject text,p_active boolean default true)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_assignment_id uuid;
begin
  if not public.can_administer_school(p_school_id) then return jsonb_build_object('success',false,'error','You do not have permission to manage teaching assignments.'); end if;
  if not exists(select 1 from public.classes where id=p_class_id and school_id=p_school_id and is_active is distinct from false) then return jsonb_build_object('success',false,'error','Choose an active class from this school.'); end if;
  if not exists(select 1 from public.school_members where school_id=p_school_id and user_id=p_teacher_user_id and status='active' and can_teach) then return jsonb_build_object('success',false,'error','Choose a member with active teaching access.'); end if;
  select id into v_assignment_id from public.class_teacher_assignments where school_id=p_school_id and class_id=p_class_id and teacher_user_id=p_teacher_user_id and lower(trim(subject))=lower(trim(p_subject));
  if v_assignment_id is null then
    insert into public.class_teacher_assignments(school_id,class_id,teacher_user_id,subject,active,created_by)
    values(p_school_id,p_class_id,p_teacher_user_id,trim(p_subject),p_active,auth.uid()) returning id into v_assignment_id;
  else update public.class_teacher_assignments set active=p_active where id=v_assignment_id; end if;
  return jsonb_build_object('success',true,'assignment_id',v_assignment_id);
end;
$$;

-- Owner records cannot be silently deleted; delegated admins must be demoted first.
create or replace function public.remove_school_member(p_member_user_id uuid,p_school_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_school_id uuid:=coalesce(p_school_id,public.my_school_id()); v_target public.school_members%rowtype;
begin
  if not public.can_administer_school(v_school_id) then return jsonb_build_object('success',false,'error','Access denied'); end if;
  select * into v_target from public.school_members where school_id=v_school_id and user_id=p_member_user_id for update;
  if v_target.id is null then return jsonb_build_object('success',false,'error','Member not found'); end if;
  if v_target.is_owner then return jsonb_build_object('success',false,'error','The school owner cannot be removed. Transfer ownership first.'); end if;
  if v_target.role_in_school='school_admin' then return jsonb_build_object('success',false,'error','Demote this delegated administrator before removing them.'); end if;
  if exists(select 1 from public.class_teacher_assignments where school_id=v_school_id and teacher_user_id=p_member_user_id and coalesce(active,true)) then return jsonb_build_object('success',false,'error','Reassign or remove this person''s active teaching assignments first.'); end if;
  delete from public.school_members where id=v_target.id;
  update public.users set school_id=null where id=p_member_user_id and school_id=v_school_id;
  return jsonb_build_object('success',true,'message','Member removed from school');
end;
$$;

create or replace function public.update_member_status(p_member_user_id uuid,p_action text,p_school_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_actor uuid:=auth.uid(); v_school_id uuid:=coalesce(p_school_id,public.my_school_id()); v_target public.school_members%rowtype;
begin
  if p_action not in ('suspend','activate','ban','unban') then return jsonb_build_object('success',false,'error','Choose a supported account status action.'); end if;
  if not public.can_administer_school(v_school_id) then return jsonb_build_object('success',false,'error','Access denied'); end if;
  select * into v_target from public.school_members where school_id=v_school_id and user_id=p_member_user_id for update;
  if v_target.id is null then return jsonb_build_object('success',false,'error','Member not found'); end if;
  if p_member_user_id=v_actor then return jsonb_build_object('success',false,'error','You cannot modify your own account status.'); end if;
  if v_target.role_in_school='school_admin' then return jsonb_build_object('success',false,'error','Administrator accounts cannot be banned or suspended. Demote a delegated administrator first.'); end if;
  if p_action in ('suspend','ban') and exists(select 1 from public.class_teacher_assignments where school_id=v_school_id and teacher_user_id=p_member_user_id and coalesce(active,true)) then
    return jsonb_build_object('success',false,'error','Reassign or remove this person''s active teaching assignments before restricting their account.');
  end if;
  if p_action='suspend' then update public.school_members set status='suspended',updated_at=now() where id=v_target.id;
  elsif p_action='activate' then update public.school_members set status='active',updated_at=now() where id=v_target.id;
  elsif p_action='ban' then update public.users set is_banned=true,updated_at=now() where id=p_member_user_id; update public.school_members set status='suspended',updated_at=now() where id=v_target.id;
  elsif p_action='unban' then update public.users set is_banned=false,updated_at=now() where id=p_member_user_id; update public.school_members set status='active',updated_at=now() where id=v_target.id;
  end if;
  return jsonb_build_object('success',true,'message','Member status updated');
end;
$$;

comment on column public.school_members.is_owner is 'Protected primary school owner. Exactly one active owner is allowed per school.';
comment on column public.school_members.can_teach is 'Canonical teaching capability independent of administrative access.';
comment on table public.school_member_role_audit is 'Immutable audit trail for school role and teaching-capability transitions.';
