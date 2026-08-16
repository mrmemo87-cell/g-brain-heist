-- Student programme requests give school administrators an auditable, actionable
-- signal without granting a seat or programme entitlement.

create table if not exists public.school_programme_access_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_user_id uuid not null references public.users(id) on delete cascade,
  module_key text not null check (module_key in ('cambridge','ielts','writing')),
  access_reason text not null check (access_reason in ('not_purchased','seat_not_allocated')),
  status text not null default 'pending' check (status in ('pending','fulfilled','cancelled')),
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create unique index if not exists school_programme_access_requests_one_pending_idx
  on public.school_programme_access_requests(school_id,student_user_id,module_key)
  where status='pending';
create index if not exists school_programme_access_requests_admin_queue_idx
  on public.school_programme_access_requests(school_id,status,requested_at desc);
create index if not exists school_programme_access_requests_student_idx
  on public.school_programme_access_requests(student_user_id,status);
create index if not exists school_programme_access_requests_resolved_by_idx
  on public.school_programme_access_requests(resolved_by) where resolved_by is not null;

alter table public.school_programme_access_requests enable row level security;
revoke all on public.school_programme_access_requests from public,anon,authenticated;
grant select on public.school_programme_access_requests to authenticated;
grant all on public.school_programme_access_requests to service_role;

drop policy if exists school_programme_access_requests_read on public.school_programme_access_requests;
create policy school_programme_access_requests_read
  on public.school_programme_access_requests for select to authenticated
  using (
    student_user_id=(select auth.uid())
    or exists (
      select 1 from public.school_members sm
      where sm.school_id=school_programme_access_requests.school_id
        and sm.user_id=(select auth.uid())
        and coalesce(sm.status,'active')='active'
        and (sm.role_in_school='school_admin' or sm.is_owner)
    )
    or public.is_superadmin((select auth.uid()))
  );

create or replace function public.student_list_programme_access_requests()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=(select auth.uid());
begin
  if v_actor is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'request_id',r.id,'module_key',r.module_key,'access_reason',r.access_reason,'requested_at',r.requested_at
    ) order by r.requested_at desc),'[]'::jsonb)
    from public.school_programme_access_requests r
    where r.student_user_id=v_actor and r.status='pending'
  );
end;
$$;
revoke all on function public.student_list_programme_access_requests() from public,anon,authenticated,service_role;
grant execute on function public.student_list_programme_access_requests() to authenticated,service_role;

create or replace function public.student_request_programme_access(p_module_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=(select auth.uid());
  v_school_id uuid;
  v_student_name text;
  v_school_name text;
  v_reason text;
  v_request_id uuid;
  v_admin record;
begin
  if v_actor is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_module_key not in ('cambridge','ielts','writing') then
    return jsonb_build_object('success',false,'error','Choose a valid programme.');
  end if;

  select u.school_id,coalesce(nullif(trim(u.full_name),''),u.username),s.name
    into v_school_id,v_student_name,v_school_name
  from public.users u
  join public.schools s on s.id=u.school_id and coalesce(s.status,'active')='active'
  join public.school_members sm on sm.school_id=u.school_id and sm.user_id=u.id
    and coalesce(sm.status,'active')='active'
  where u.id=v_actor and u.role='student';
  if v_school_id is null then
    return jsonb_build_object('success',false,'error','Only an active school student can request programme access.');
  end if;

  if public.school_has_module_access(v_school_id,p_module_key)
    and private.student_has_programme_seat(v_school_id,p_module_key,v_actor) then
    return jsonb_build_object('success',false,'error','You already have access to this programme.');
  end if;

  v_reason:=case when public.school_has_module_access(v_school_id,p_module_key)
    then 'seat_not_allocated' else 'not_purchased' end;

  insert into public.school_programme_access_requests(school_id,student_user_id,module_key,access_reason)
  values(v_school_id,v_actor,p_module_key,v_reason)
  on conflict (school_id,student_user_id,module_key) where status='pending' do nothing
  returning id into v_request_id;

  if v_request_id is null then
    select id into v_request_id from public.school_programme_access_requests
    where school_id=v_school_id and student_user_id=v_actor and module_key=p_module_key and status='pending';
    return jsonb_build_object('success',true,'status','already_pending','request_id',v_request_id);
  end if;

  insert into public.notifications(user_id,type,title,message,data,priority,read)
  select sm.user_id,'school_head_decision','Student programme request',
    v_student_name||' asked to join '||initcap(p_module_key)||'.',
    jsonb_build_object('request_id',v_request_id,'school_id',v_school_id,'student_id',v_actor,
      'module_key',p_module_key,'access_reason',v_reason,'destination','programme_seats'),
    'medium',false
  from public.school_members sm
  where sm.school_id=v_school_id and coalesce(sm.status,'active')='active'
    and (sm.role_in_school='school_admin' or sm.is_owner);

  for v_admin in
    select distinct sm.user_id
    from public.school_members sm
    where sm.school_id=v_school_id and coalesce(sm.status,'active')='active'
      and (sm.role_in_school='school_admin' or sm.is_owner)
  loop
    perform private.enqueue_transactional_email(
      'student_programme_access_requested','school_operations','school_admin','programme_access_requested',
      'programme-access-request:'||v_request_id::text||':'||v_admin.user_id::text,
      jsonb_build_object('student_name',v_student_name,'module_key',p_module_key,'access_reason',v_reason),
      v_admin.user_id,null,v_school_id,v_school_name,now()
    );
  end loop;

  return jsonb_build_object('success',true,'status','created','request_id',v_request_id);
end;
$$;
revoke all on function public.student_request_programme_access(text) from public,anon,authenticated,service_role;
grant execute on function public.student_request_programme_access(text) to authenticated,service_role;

create or replace function private.fulfil_student_programme_access_request()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.released_at is null then
    update public.school_programme_access_requests
    set status='fulfilled',resolved_at=coalesce(new.activated_at,now()),resolved_by=new.assigned_by,updated_at=now()
    where school_id=new.school_id and student_user_id=new.student_user_id
      and module_key=new.module_key and status='pending';
  end if;
  return new;
end;
$$;
revoke all on function private.fulfil_student_programme_access_request() from public,anon,authenticated;

drop trigger if exists fulfil_student_programme_access_request on public.school_programme_seat_assignments;
create trigger fulfil_student_programme_access_request
after insert or update of released_at,activated_at on public.school_programme_seat_assignments
for each row execute function private.fulfil_student_programme_access_request();

comment on table public.school_programme_access_requests is
  'Student requests for school-admin review. A request never grants programme access or capacity.';
