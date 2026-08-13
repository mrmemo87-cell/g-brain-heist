-- Professional named-seat workflow.
-- Adds clear commercial activation, anti-abuse controls, bulk/switch operations,
-- exception governance, and a richer School Head read model.

alter table public.school_module_entitlements
  add column if not exists transfer_override integer not null default 0,
  add column if not exists transfer_override_period_start date;

alter table public.school_module_entitlements
  drop constraint if exists school_module_entitlements_transfer_override_check;
alter table public.school_module_entitlements
  add constraint school_module_entitlements_transfer_override_check check (transfer_override >= 0);

alter table public.school_billing_quotes
  add column if not exists activated_at timestamptz,
  add column if not exists activated_subscription_id uuid references public.billing_subscriptions(id) on delete set null;

alter table public.school_billing_quote_events
  drop constraint if exists school_billing_quote_events_event_type_check;
alter table public.school_billing_quote_events
  add constraint school_billing_quote_events_event_type_check check (event_type in
    ('created','saved','submitted','revision_requested','approved','accepted','activated','rejected','expired','cancelled'));

create table if not exists public.school_programme_seat_exception_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  module_key text not null check (module_key in ('cambridge','ielts','writing')),
  requested_transfers integer not null check (requested_transfers between 1 and 1000),
  reason text not null check (char_length(trim(reason)) between 20 and 1000),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  requested_by uuid not null references public.users(id) on delete restrict,
  reviewed_by uuid references public.users(id) on delete set null,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists school_programme_one_pending_exception_idx
  on public.school_programme_seat_exception_requests(school_id,module_key) where status='pending';
create index if not exists school_programme_exception_review_idx
  on public.school_programme_seat_exception_requests(status,created_at);

alter table public.school_programme_seat_exception_requests enable row level security;
revoke all on public.school_programme_seat_exception_requests from public,anon,authenticated;
grant select on public.school_programme_seat_exception_requests to authenticated;
grant all on public.school_programme_seat_exception_requests to service_role;
create policy school_heads_read_their_programme_exceptions
  on public.school_programme_seat_exception_requests for select to authenticated
  using (public.is_school_owner(school_id) or public.is_superadmin((select auth.uid())));

create or replace function private.programme_transfer_limit(p_school_id uuid,p_module_key text)
returns integer language sql stable security definer set search_path='' as $$
  select greatest(2,ceil(coalesce(sme.seat_limit,0)*0.10)::integer)
    + case when sme.transfer_override_period_start=private.school_programme_period_start(p_school_id,p_module_key)
      then sme.transfer_override else 0 end
  from public.school_module_entitlements sme
  where sme.school_id=p_school_id and sme.module_key=p_module_key;
$$;
revoke all on function private.programme_transfer_limit(uuid,text) from public,anon,authenticated,service_role;

create or replace function public.school_head_get_programme_seats(p_school_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_programmes jsonb; v_students jsonb; v_events jsonb; v_requests jsonb;
begin
  if v_actor is null or not (public.is_school_owner(p_school_id) or public.is_superadmin(v_actor)) then
    raise exception using errcode='42501',message='school_head_or_platform_administrator_required';
  end if;

  select coalesce(jsonb_agg(row_data order by module_key),'[]'::jsonb) into v_programmes from (
    select sme.module_key,sme.seat_limit,
      count(a.id) filter(where a.released_at is null)::integer assigned,
      count(a.id) filter(where a.released_at is not null and a.cooldown_until>now())::integer cooling_down,
      greatest(0,coalesce(sme.seat_limit,0)
        - count(a.id) filter(where a.released_at is null or a.cooldown_until>now()))::integer available,
      private.programme_transfer_limit(p_school_id,sme.module_key) transfer_limit,
      count(a.id) filter(where a.released_at>=private.school_programme_period_start(p_school_id,sme.module_key)
        and not a.correction and coalesce(a.release_reason,'')<>'left_school')::integer transfers_used,
      count(distinct a.student_user_id) filter(where a.billing_period_start=private.school_programme_period_start(p_school_id,sme.module_key))::integer unique_students_served,
      min(a.cooldown_until) filter(where a.cooldown_until>now()) next_available_at
    from public.school_module_entitlements sme
    left join public.school_programme_seat_assignments a on a.school_id=sme.school_id and a.module_key=sme.module_key
    where sme.school_id=p_school_id and sme.enabled and sme.module_key in ('cambridge','ielts','writing')
      and sme.starts_at<=now() and (sme.ends_at is null or sme.ends_at>now())
    group by sme.module_key,sme.seat_limit
  ) row_data;

  select coalesce(jsonb_agg(row_data order by (member_status='active') desc,student_name),'[]'::jsonb) into v_students from (
    select u.id user_id,coalesce(nullif(trim(u.full_name),''),nullif(trim(u.username),''),'Student') student_name,
      coalesce(u.batch,'Unassigned') class_name,coalesce(sm.status,'inactive') member_status,
      coalesce((select jsonb_agg(jsonb_build_object(
        'assignment_id',a.id,'module_key',a.module_key,'assigned_at',a.assigned_at,'activated_at',a.activated_at,
        'has_usage',private.student_has_programme_usage(a.school_id,a.module_key,a.student_user_id,a.assigned_at),
        'correction_until',a.assigned_at+interval '24 hours') order by a.module_key)
        from public.school_programme_seat_assignments a
        where a.school_id=p_school_id and a.student_user_id=u.id and a.released_at is null),'[]'::jsonb) assignments
    from public.users u
    left join lateral (
      select membership.status
      from public.school_members membership
      where membership.school_id=p_school_id and membership.user_id=u.id and membership.role_in_school='student'
      order by (membership.status='active') desc,membership.updated_at desc nulls last
      limit 1
    ) sm on true
    where sm.status is not null or exists(
      select 1 from public.school_programme_seat_assignments active
      where active.school_id=p_school_id and active.student_user_id=u.id and active.released_at is null)
  ) row_data;

  select coalesce(jsonb_agg(row_data order by created_at desc),'[]'::jsonb) into v_events from (
    select e.id,e.module_key,e.event_type,e.reason,e.metadata,e.created_at,e.student_user_id,
      coalesce(nullif(trim(u.full_name),''),nullif(trim(u.username),''),'Student') student_name
    from public.school_programme_seat_events e join public.users u on u.id=e.student_user_id
    where e.school_id=p_school_id order by e.created_at desc limit 40
  ) row_data;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),'[]'::jsonb) into v_requests
  from (select id,module_key,requested_transfers,reason,status,review_note,created_at,reviewed_at
    from public.school_programme_seat_exception_requests where school_id=p_school_id order by created_at desc limit 20) r;

  return jsonb_build_object('success',true,'programmes',v_programmes,'students',v_students,'events',v_events,
    'exception_requests',v_requests,'policy',jsonb_build_object('correction_hours',24,'cooldown_days',7,'base_transfer_percent',10),
    'generated_at',now());
end;
$$;
revoke all on function public.school_head_get_programme_seats(uuid) from public,anon,authenticated,service_role;
grant execute on function public.school_head_get_programme_seats(uuid) to authenticated;

create or replace function public.school_head_bulk_assign_programme_seats(
  p_school_id uuid,p_module_key text,p_student_user_ids uuid[]
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_limit integer; v_used integer; v_needed integer; v_period date;
begin
  if v_actor is null or not (public.is_school_owner(p_school_id) or public.is_superadmin(v_actor)) then
    raise exception using errcode='42501',message='school_head_or_platform_administrator_required';
  end if;
  if p_module_key not in ('cambridge','ielts','writing') or coalesce(cardinality(p_student_user_ids),0)=0 then
    return jsonb_build_object('success',false,'error','Choose a programme and at least one student.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_school_id::text||':'||p_module_key,0));
  select seat_limit into v_limit from public.school_module_entitlements
  where school_id=p_school_id and module_key=p_module_key and enabled and starts_at<=now() and (ends_at is null or ends_at>now()) for update;
  if v_limit is null then return jsonb_build_object('success',false,'error','A fixed seat limit has not been configured.'); end if;
  if exists(select 1 from unnest(p_student_user_ids) requested(student_id) where not exists(
    select 1 from public.school_members sm where sm.school_id=p_school_id and sm.user_id=requested.student_id
      and sm.status='active' and sm.role_in_school='student')) then
    return jsonb_build_object('success',false,'error','Every selected learner must be an active student in this school.');
  end if;
  select count(*)::integer into v_used from public.school_programme_seat_assignments
  where school_id=p_school_id and module_key=p_module_key and (released_at is null or cooldown_until>now());
  select count(distinct requested.student_id)::integer into v_needed from unnest(p_student_user_ids) requested(student_id)
  where not exists(select 1 from public.school_programme_seat_assignments active
    where active.school_id=p_school_id and active.module_key=p_module_key and active.student_user_id=requested.student_id and active.released_at is null);
  if v_used+v_needed>v_limit then
    return jsonb_build_object('success',false,'error',format('Only %s seats are available; this selection needs %s.',greatest(0,v_limit-v_used),v_needed));
  end if;
  v_period:=private.school_programme_period_start(p_school_id,p_module_key);
  with inserted as (
    insert into public.school_programme_seat_assignments(school_id,module_key,student_user_id,assigned_by,billing_period_start)
    select p_school_id,p_module_key,requested.student_id,v_actor,v_period from (select distinct unnest(p_student_user_ids) student_id) requested
    where not exists(select 1 from public.school_programme_seat_assignments active
      where active.school_id=p_school_id and active.module_key=p_module_key and active.student_user_id=requested.student_id and active.released_at is null)
    returning id,student_user_id
  ) insert into public.school_programme_seat_events(assignment_id,school_id,module_key,student_user_id,actor_user_id,event_type,metadata)
    select id,p_school_id,p_module_key,student_user_id,v_actor,'assigned',jsonb_build_object('source','bulk') from inserted;
  return jsonb_build_object('success',true,'assigned',v_needed,'seat_limit',v_limit,'used_after',v_used+v_needed);
end;
$$;
revoke all on function public.school_head_bulk_assign_programme_seats(uuid,text,uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.school_head_bulk_assign_programme_seats(uuid,text,uuid[]) to authenticated;

create or replace function public.school_head_release_programme_seat(
  p_school_id uuid,p_module_key text,p_student_user_id uuid,p_reason text,p_note text default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_row public.school_programme_seat_assignments%rowtype;
  v_transfer_limit integer; v_transfers integer; v_correction boolean; v_cooldown timestamptz; v_active_member boolean;
begin
  if v_actor is null or not (public.is_school_owner(p_school_id) or public.is_superadmin(v_actor)) then
    raise exception using errcode='42501',message='school_head_or_platform_administrator_required';
  end if;
  if p_reason not in ('wrong_student','left_school','programme_change','academic_decision','other','platform_admin') then
    return jsonb_build_object('success',false,'error','Choose a valid release reason.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_school_id::text||':'||p_module_key,0));
  select * into v_row from public.school_programme_seat_assignments
  where school_id=p_school_id and module_key=p_module_key and student_user_id=p_student_user_id and released_at is null for update;
  if not found then return jsonb_build_object('success',false,'error','No active seat assignment was found.'); end if;
  select exists(select 1 from public.school_members sm where sm.school_id=p_school_id and sm.user_id=p_student_user_id
    and sm.role_in_school='student' and sm.status='active') into v_active_member;
  if p_reason='left_school' and v_active_member and not public.is_superadmin(v_actor) then
    return jsonb_build_object('success',false,'error','Mark the student membership inactive before using “left school”.');
  end if;
  v_transfer_limit:=private.programme_transfer_limit(p_school_id,p_module_key);
  v_correction:=v_row.activated_at is null
    and not private.student_has_programme_usage(p_school_id,p_module_key,p_student_user_id,v_row.assigned_at)
    and v_row.assigned_at>now()-interval '24 hours';
  select count(*)::integer into v_transfers from public.school_programme_seat_assignments
  where school_id=p_school_id and module_key=p_module_key
    and released_at>=private.school_programme_period_start(p_school_id,p_module_key)
    and not correction and coalesce(release_reason,'')<>'left_school';
  if not v_correction and p_reason<>'left_school' and not public.is_superadmin(v_actor) and v_transfers>=v_transfer_limit then
    return jsonb_build_object('success',false,'error','The monthly transfer allowance is used. Submit an exception request or add seats.');
  end if;
  v_cooldown:=case when v_correction or p_reason='left_school' then now() else now()+interval '7 days' end;
  update public.school_programme_seat_assignments set released_at=now(),released_by=v_actor,
    release_reason=p_reason,release_note=nullif(trim(p_note),''),cooldown_until=v_cooldown,correction=v_correction,updated_at=now()
  where id=v_row.id;
  insert into public.school_programme_seat_events(assignment_id,school_id,module_key,student_user_id,actor_user_id,event_type,reason,metadata)
  values(v_row.id,p_school_id,p_module_key,p_student_user_id,v_actor,case when v_correction then 'corrected' else 'released' end,p_reason,
    jsonb_build_object('cooldown_until',v_cooldown,'correction',v_correction));
  return jsonb_build_object('success',true,'correction',v_correction,'cooldown_until',v_cooldown,
    'transfers_remaining',greatest(0,v_transfer_limit-v_transfers-(not v_correction and p_reason<>'left_school')::integer));
end;
$$;
revoke all on function public.school_head_release_programme_seat(uuid,text,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.school_head_release_programme_seat(uuid,text,uuid,text,text) to authenticated;

create or replace function public.school_head_switch_programme_seat(
  p_school_id uuid,p_student_user_id uuid,p_from_module text,p_to_module text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_target_limit integer; v_target_used integer; v_release jsonb; v_assign jsonb;
begin
  if v_actor is null or not (public.is_school_owner(p_school_id) or public.is_superadmin(v_actor)) then
    raise exception using errcode='42501',message='school_head_or_platform_administrator_required';
  end if;
  if p_from_module=p_to_module or p_from_module not in ('cambridge','ielts','writing') or p_to_module not in ('cambridge','ielts','writing') then
    return jsonb_build_object('success',false,'error','Choose two different supported programmes.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_school_id::text||':'||least(p_from_module,p_to_module),0));
  perform pg_advisory_xact_lock(hashtextextended(p_school_id::text||':'||greatest(p_from_module,p_to_module),0));
  if not exists(select 1 from public.school_programme_seat_assignments where school_id=p_school_id and module_key=p_from_module and student_user_id=p_student_user_id and released_at is null) then
    return jsonb_build_object('success',false,'error','The student does not hold the source programme seat.');
  end if;
  select seat_limit into v_target_limit from public.school_module_entitlements where school_id=p_school_id and module_key=p_to_module and enabled;
  select count(*)::integer into v_target_used from public.school_programme_seat_assignments
    where school_id=p_school_id and module_key=p_to_module and (released_at is null or cooldown_until>now());
  if v_target_limit is null or v_target_used>=v_target_limit then return jsonb_build_object('success',false,'error','The target programme has no available seat.'); end if;
  v_release:=public.school_head_release_programme_seat(p_school_id,p_from_module,p_student_user_id,'programme_change',format('Atomic switch to %s',p_to_module));
  if not coalesce((v_release->>'success')::boolean,false) then return v_release; end if;
  v_assign:=public.school_head_assign_programme_seat(p_school_id,p_to_module,p_student_user_id);
  if not coalesce((v_assign->>'success')::boolean,false) then raise exception using message=coalesce(v_assign->>'error','Programme switch failed'); end if;
  return jsonb_build_object('success',true,'from_module',p_from_module,'to_module',p_to_module,'release',v_release,'assignment',v_assign);
end;
$$;
revoke all on function public.school_head_switch_programme_seat(uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.school_head_switch_programme_seat(uuid,uuid,text,text) to authenticated;

create or replace function public.school_head_request_programme_transfer_exception(
  p_school_id uuid,p_module_key text,p_requested_transfers integer,p_reason text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_id uuid;
begin
  if v_actor is null or not public.is_school_owner(p_school_id) then raise exception using errcode='42501',message='school_head_access_required'; end if;
  if p_module_key not in ('cambridge','ielts','writing') or p_requested_transfers not between 1 and 1000
    or char_length(trim(coalesce(p_reason,''))) not between 20 and 1000 then
    return jsonb_build_object('success',false,'error','Choose a programme, requested transfer count, and a reason of at least 20 characters.');
  end if;
  if exists(select 1 from public.school_programme_seat_exception_requests where school_id=p_school_id and module_key=p_module_key and status='pending') then
    return jsonb_build_object('success',false,'error','A request for this programme is already awaiting review.');
  end if;
  insert into public.school_programme_seat_exception_requests(school_id,module_key,requested_transfers,reason,requested_by)
  values(p_school_id,p_module_key,p_requested_transfers,trim(p_reason),v_actor) returning id into v_id;
  return jsonb_build_object('success',true,'request_id',v_id,'status','pending');
end;
$$;
revoke all on function public.school_head_request_programme_transfer_exception(uuid,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.school_head_request_programme_transfer_exception(uuid,text,integer,text) to authenticated;

create or replace function public.admin_list_programme_transfer_exceptions(p_status text default 'pending')
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_superadmin(auth.uid()) then raise exception using errcode='42501',message='platform_administrator_access_required'; end if;
  return jsonb_build_object('success',true,'requests',coalesce((select jsonb_agg(jsonb_build_object(
    'id',r.id,'school_id',r.school_id,'school_name',s.name,'module_key',r.module_key,
    'requested_transfers',r.requested_transfers,'reason',r.reason,'status',r.status,
    'review_note',r.review_note,'created_at',r.created_at,'reviewed_at',r.reviewed_at) order by r.created_at)
    from public.school_programme_seat_exception_requests r join public.schools s on s.id=r.school_id
    where p_status is null or r.status=p_status),'[]'::jsonb));
end;
$$;
revoke all on function public.admin_list_programme_transfer_exceptions(text) from public,anon,authenticated,service_role;
grant execute on function public.admin_list_programme_transfer_exceptions(text) to authenticated;

create or replace function public.admin_review_programme_transfer_exception(p_request_id uuid,p_action text,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_request public.school_programme_seat_exception_requests%rowtype; v_period date;
begin
  if v_actor is null or not public.is_superadmin(v_actor) then raise exception using errcode='42501',message='platform_administrator_access_required'; end if;
  if p_action not in ('approve','reject') or char_length(trim(coalesce(p_note,'')))<5 then
    return jsonb_build_object('success',false,'error','Choose approve or reject and add a clear review note.');
  end if;
  select * into v_request from public.school_programme_seat_exception_requests where id=p_request_id for update;
  if not found or v_request.status<>'pending' then return jsonb_build_object('success',false,'error','Pending request not found.'); end if;
  update public.school_programme_seat_exception_requests set status=case when p_action='approve' then 'approved' else 'rejected' end,
    review_note=trim(p_note),reviewed_by=v_actor,reviewed_at=now(),updated_at=now() where id=p_request_id;
  if p_action='approve' then
    v_period:=private.school_programme_period_start(v_request.school_id,v_request.module_key);
    update public.school_module_entitlements set transfer_override=case when transfer_override_period_start=v_period
      then transfer_override+v_request.requested_transfers else v_request.requested_transfers end,
      transfer_override_period_start=v_period,updated_at=now()
    where school_id=v_request.school_id and module_key=v_request.module_key;
  end if;
  return jsonb_build_object('success',true,'status',case when p_action='approve' then 'approved' else 'rejected' end);
end;
$$;
revoke all on function public.admin_review_programme_transfer_exception(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.admin_review_programme_transfer_exception(uuid,text,text) to authenticated;

create or replace function public.admin_list_school_billing_quotes(p_status text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_superadmin(auth.uid()) then raise exception using errcode='42501',message='platform_administrator_access_required'; end if;
  return jsonb_build_object('success',true,'quotes',coalesce((select jsonb_agg(jsonb_build_object(
    'id',q.id,'school_id',q.school_id,'school_name',s.name,'title',q.title,'status',q.status,
    'contract_term',q.contract_term,'platform_seats',q.platform_seats,'cambridge_seats',q.cambridge_seats,
    'ielts_seats',q.ielts_seats,'writing_seats',q.writing_seats,'admissions_candidates',q.admissions_candidates,
    'launch_discount_requested',q.launch_discount_requested,'calculation',q.calculation,'school_note',q.school_note,
    'submitted_at',q.submitted_at,'reviewed_at',q.reviewed_at,'review_note',q.review_note,'expires_at',q.expires_at,
    'accepted_at',q.accepted_at,'activated_at',q.activated_at,'activated_subscription_id',q.activated_subscription_id,
    'created_at',q.created_at,'updated_at',q.updated_at,
    'school_head',case when u.id is null then null else jsonb_build_object('name',coalesce(u.full_name,u.username,'School Head'),'email',u.email) end
  ) order by case q.status when 'submitted' then 0 when 'accepted' then 1 when 'revision_requested' then 2 when 'approved' then 3 else 4 end,
    q.submitted_at asc nulls last,q.updated_at desc)
    from public.school_billing_quotes q join public.schools s on s.id=q.school_id
    left join public.school_members sm on sm.school_id=q.school_id and sm.is_owner and sm.status='active'
    left join public.users u on u.id=sm.user_id where p_status is null or q.status=p_status),'[]'::jsonb));
end;
$$;
revoke all on function public.admin_list_school_billing_quotes(text) from public,anon,authenticated,service_role;
grant execute on function public.admin_list_school_billing_quotes(text) to authenticated;

create or replace function public.school_head_accept_billing_quote(p_quote_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_quote public.school_billing_quotes%rowtype;
begin
  select * into v_quote from public.school_billing_quotes where id=p_quote_id for update;
  if v_actor is null or v_quote.id is null or not public.is_school_owner(v_quote.school_id) then raise exception using errcode='42501',message='school_head_access_required'; end if;
  if v_quote.status<>'approved' or v_quote.expires_at is null or v_quote.expires_at<=now() then
    return jsonb_build_object('success',false,'error','Only a current approved quote can be accepted.');
  end if;
  update public.school_billing_quotes set status='accepted',accepted_at=now(),updated_at=now() where id=p_quote_id returning * into v_quote;
  insert into public.school_billing_quote_events(quote_id,school_id,actor_user_id,event_type,from_status,to_status,note,snapshot)
  values(v_quote.id,v_quote.school_id,v_actor,'accepted','approved','accepted','Accepted by School Head. Payment verification is still required.',v_quote.calculation);
  return jsonb_build_object('success',true,'quote',to_jsonb(v_quote),'message','Quote accepted. Access begins only after verified activation.');
end;
$$;
revoke all on function public.school_head_accept_billing_quote(uuid) from public,anon,authenticated,service_role;
grant execute on function public.school_head_accept_billing_quote(uuid) to authenticated;

create or replace function public.admin_activate_accepted_school_quote(
  p_quote_id uuid,p_payment_method text,p_amount_minor bigint,p_currency text,p_reference text,p_period_end timestamptz,p_notes text default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_quote public.school_billing_quotes%rowtype; v_subscription uuid; v_modules text[]; v_module text; v_limit integer;
begin
  if v_actor is null or not public.is_superadmin(v_actor) then raise exception using errcode='42501',message='platform_administrator_access_required'; end if;
  if p_payment_method not in ('cash','bank_transfer','invoice','complimentary') or p_period_end is null or p_period_end<=now()
    or (p_payment_method<>'complimentary' and coalesce(p_amount_minor,0)<=0) then
    return jsonb_build_object('success',false,'error','Enter verified payment details and a future access end date.');
  end if;
  select * into v_quote from public.school_billing_quotes where id=p_quote_id for update;
  if not found or v_quote.status<>'accepted' or v_quote.activated_at is not null then
    return jsonb_build_object('success',false,'error','Choose an accepted quote that has not already been activated.');
  end if;
  v_modules:=array['core']::text[];
  if v_quote.cambridge_seats>0 then v_modules:=array_append(v_modules,'cambridge'); end if;
  if v_quote.ielts_seats>0 then v_modules:=array_append(v_modules,'ielts'); end if;
  if v_quote.writing_seats>0 then v_modules:=array_append(v_modules,'writing'); end if;
  if v_quote.admissions_candidates>0 then v_modules:=array_append(v_modules,'admissions'); end if;
  if exists(select 1 from public.billing_subscriptions where school_id=v_quote.school_id and status in ('active','trialing','past_due') and provider<>'manual') then
    return jsonb_build_object('success',false,'error','Resolve the school’s active online subscription before activating this manual agreement.');
  end if;
  update public.billing_subscriptions set status='expired',current_period_end=least(coalesce(current_period_end,now()),now())
  where school_id=v_quote.school_id and status in ('active','trialing','past_due') and provider='manual';
  insert into public.billing_subscriptions(school_id,purchased_by,provider,status,plan,billing_interval,current_period_start,current_period_end,
    is_comp,comp_expires_at,comp_granted_by,payment_method,amount_minor,currency,payment_reference,paid_at,verified_by,verified_at,module_keys,internal_notes)
  values(v_quote.school_id,v_quote.created_by,'manual','active','enterprise','manual',now(),p_period_end,
    p_payment_method='complimentary',case when p_payment_method='complimentary' then p_period_end else null end,
    case when p_payment_method='complimentary' then v_actor else null end,p_payment_method,coalesce(p_amount_minor,0),upper(coalesce(nullif(trim(p_currency),''),'USD')),
    nullif(trim(p_reference),''),case when p_payment_method<>'complimentary' then now() else null end,v_actor,now(),v_modules,
    concat('Accepted quote ',v_quote.id,'. ',coalesce(nullif(trim(p_notes),''),''))) returning id into v_subscription;
  foreach v_module in array array['core','cambridge','ielts','writing','admissions'] loop
    v_limit:=case v_module when 'cambridge' then nullif(v_quote.cambridge_seats,0) when 'ielts' then nullif(v_quote.ielts_seats,0)
      when 'writing' then nullif(v_quote.writing_seats,0) else null end;
    insert into public.school_module_entitlements(school_id,module_key,enabled,source,starts_at,ends_at,configured_by,notes,seat_limit,source_quote_id,subscription_id)
    values(v_quote.school_id,v_module,v_module=any(v_modules),case when p_payment_method='complimentary' then 'complimentary' else 'manual_payment' end,
      now(),p_period_end,v_actor,concat('Activated from accepted quote ',v_quote.id),v_limit,v_quote.id,v_subscription)
    on conflict(school_id,module_key) do update set enabled=excluded.enabled,source=excluded.source,starts_at=excluded.starts_at,
      ends_at=excluded.ends_at,configured_by=excluded.configured_by,notes=excluded.notes,seat_limit=excluded.seat_limit,
      source_quote_id=excluded.source_quote_id,subscription_id=excluded.subscription_id,updated_at=now();
  end loop;
  update public.school_billing_quotes set activated_at=now(),activated_subscription_id=v_subscription,updated_at=now() where id=v_quote.id returning * into v_quote;
  insert into public.school_billing_quote_events(quote_id,school_id,actor_user_id,event_type,from_status,to_status,note,snapshot)
  values(v_quote.id,v_quote.school_id,v_actor,'activated','accepted','accepted','Verified agreement activated with exact quoted programme capacities.',
    jsonb_build_object('subscription_id',v_subscription,'modules',v_modules,'cambridge_seats',v_quote.cambridge_seats,
      'ielts_seats',v_quote.ielts_seats,'writing_seats',v_quote.writing_seats));
  return jsonb_build_object('success',true,'subscription_id',v_subscription,'quote_id',v_quote.id,'modules',v_modules,
    'seat_limits',jsonb_build_object('cambridge',v_quote.cambridge_seats,'ielts',v_quote.ielts_seats,'writing',v_quote.writing_seats));
end;
$$;
revoke all on function public.admin_activate_accepted_school_quote(uuid,text,bigint,text,text,timestamptz,text) from public,anon,authenticated,service_role;
grant execute on function public.admin_activate_accepted_school_quote(uuid,text,bigint,text,text,timestamptz,text) to authenticated;

comment on function public.admin_activate_accepted_school_quote(uuid,text,bigint,text,text,timestamptz,text) is
  'Verified commercial activation. Copies exact accepted quote quantities into authoritative named-seat limits.';
