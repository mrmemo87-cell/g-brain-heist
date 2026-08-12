-- Named programme seats with controlled transfers.
-- Partial programme coverage is enforced per student, not only at school level.

alter table public.school_module_entitlements
  add column if not exists seat_limit integer,
  add column if not exists source_quote_id uuid references public.school_billing_quotes(id) on delete set null,
  add column if not exists subscription_id uuid references public.billing_subscriptions(id) on delete set null;

alter table public.school_module_entitlements
  drop constraint if exists school_module_entitlements_seat_limit_check;
alter table public.school_module_entitlements
  add constraint school_module_entitlements_seat_limit_check
  check (seat_limit is null or (module_key in ('cambridge','ielts','writing') and seat_limit > 0));

create table if not exists public.school_programme_seat_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  module_key text not null check (module_key in ('cambridge','ielts','writing')),
  student_user_id uuid not null references public.users(id) on delete restrict,
  assigned_by uuid not null references public.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  activated_at timestamptz,
  released_at timestamptz,
  released_by uuid references public.users(id) on delete set null,
  release_reason text check (release_reason is null or release_reason in
    ('wrong_student','left_school','programme_change','academic_decision','other','platform_admin')),
  release_note text,
  cooldown_until timestamptz,
  correction boolean not null default false,
  billing_period_start date not null default date_trunc('month',now())::date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (released_at is null or released_at >= assigned_at),
  check (cooldown_until is null or released_at is not null)
);

create unique index if not exists school_programme_one_active_student_seat_idx
  on public.school_programme_seat_assignments(school_id,module_key,student_user_id)
  where released_at is null;
create index if not exists school_programme_active_seat_pool_idx
  on public.school_programme_seat_assignments(school_id,module_key,assigned_at)
  where released_at is null;
create index if not exists school_programme_cooldown_idx
  on public.school_programme_seat_assignments(school_id,module_key,cooldown_until)
  where cooldown_until is not null;

create table if not exists public.school_programme_seat_events (
  id bigint generated always as identity primary key,
  assignment_id uuid references public.school_programme_seat_assignments(id) on delete set null,
  school_id uuid not null references public.schools(id) on delete cascade,
  module_key text not null check (module_key in ('cambridge','ielts','writing')),
  student_user_id uuid not null references public.users(id) on delete restrict,
  actor_user_id uuid references public.users(id) on delete set null,
  event_type text not null check (event_type in ('assigned','activated','released','corrected','cooldown_completed','override')),
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists school_programme_seat_events_school_idx
  on public.school_programme_seat_events(school_id,module_key,created_at desc);

alter table public.school_programme_seat_assignments enable row level security;
alter table public.school_programme_seat_events enable row level security;
revoke all on public.school_programme_seat_assignments from public,anon,authenticated;
revoke all on public.school_programme_seat_events from public,anon,authenticated;
grant select on public.school_programme_seat_assignments,public.school_programme_seat_events to authenticated;
grant all on public.school_programme_seat_assignments,public.school_programme_seat_events to service_role;
grant usage,select on sequence public.school_programme_seat_events_id_seq to service_role;

create policy school_heads_read_programme_seats
  on public.school_programme_seat_assignments for select to authenticated
  using (public.is_school_owner(school_id) or public.is_superadmin((select auth.uid())) or student_user_id=(select auth.uid()));
create policy school_heads_read_programme_seat_events
  on public.school_programme_seat_events for select to authenticated
  using (public.is_school_owner(school_id) or public.is_superadmin((select auth.uid())) or student_user_id=(select auth.uid()));

create or replace function private.school_programme_period_start(p_school_id uuid,p_module_key text)
returns date language sql stable security definer set search_path='' as $$
  select coalesce(
    (select date_trunc('month',bs.current_period_start)::date
       from public.school_module_entitlements sme
       join public.billing_subscriptions bs on bs.id=sme.subscription_id
      where sme.school_id=p_school_id and sme.module_key=p_module_key
      limit 1),
    date_trunc('month',now())::date
  );
$$;
revoke all on function private.school_programme_period_start(uuid,text) from public,anon,authenticated,service_role;

create or replace function private.student_has_programme_seat(p_school_id uuid,p_module_key text,p_student_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select case
    when not exists(
      select 1 from public.school_module_entitlements sme
      where sme.school_id=p_school_id and sme.module_key=p_module_key and sme.seat_limit is not null
    ) then true
    else exists(
      select 1 from public.school_programme_seat_assignments spsa
      where spsa.school_id=p_school_id and spsa.module_key=p_module_key
        and spsa.student_user_id=p_student_id and spsa.released_at is null
    )
  end;
$$;
revoke all on function private.student_has_programme_seat(uuid,text,uuid) from public,anon,authenticated,service_role;

create or replace function private.student_has_programme_usage(
  p_school_id uuid,p_module_key text,p_student_id uuid,p_since timestamptz
)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
  if p_module_key='cambridge' then
    return exists(select 1 from public.quiz_scores qs where qs.school_id=p_school_id
      and qs.student_id=p_student_id and qs.submitted_at>=p_since);
  elsif p_module_key='ielts' then
    return exists(select 1 from public.ielts_reading_attempts a where a.user_id=p_student_id and a.started_at>=p_since)
      or exists(select 1 from public.ielts_listening_attempts a where a.user_id=p_student_id and a.started_at>=p_since)
      or exists(select 1 from public.ielts_writing_attempts a where a.user_id=p_student_id and a.submitted_at>=p_since)
      or exists(select 1 from public.ielts_speaking_attempts a where a.user_id=p_student_id and a.submitted_at>=p_since);
  elsif p_module_key='writing' then
    return exists(select 1 from public.bh_writing_attempts a
      where a.payload->>'student_id'=p_student_id::text and a.created_at>=p_since)
      or exists(select 1 from public.bh_writing_daily_submissions a
      where a.payload->>'student_id'=p_student_id::text and a.created_at>=p_since);
  end if;
  return false;
end;
$$;
revoke all on function private.student_has_programme_usage(uuid,text,uuid,timestamptz) from public,anon,authenticated,service_role;

create or replace function private.actor_can_access_school_programme(
  p_school_id uuid,p_module_key text,p_allow_anonymous boolean default false
)
returns boolean language sql stable security definer set search_path='' as $$
  select p_school_id is not null
    and public.school_has_module_access(p_school_id,p_module_key)
    and (
      ((select auth.uid()) is null and p_allow_anonymous)
      or public.is_superadmin((select auth.uid()))
      or exists(
        select 1 from public.school_members sm
        where sm.school_id=p_school_id and sm.user_id=(select auth.uid()) and sm.status='active'
          and (
            sm.role_in_school <> 'student'
            or p_module_key not in ('cambridge','ielts','writing')
            or private.student_has_programme_seat(p_school_id,p_module_key,sm.user_id)
          )
      )
    );
$$;
revoke all on function private.actor_can_access_school_programme(uuid,text,boolean) from public,anon,authenticated,service_role;

create or replace function public.school_head_get_programme_seats(p_school_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_programmes jsonb; v_students jsonb;
begin
  if v_actor is null or not (public.is_school_owner(p_school_id) or public.is_superadmin(v_actor)) then
    raise exception using errcode='42501',message='school_head_or_platform_administrator_required';
  end if;

  select coalesce(jsonb_agg(row_data order by module_key),'[]'::jsonb) into v_programmes
  from (
    select sme.module_key,sme.seat_limit,
      count(a.id) filter(where a.released_at is null)::integer assigned,
      count(a.id) filter(where a.released_at is not null and a.cooldown_until>now())::integer cooling_down,
      greatest(2,ceil(coalesce(sme.seat_limit,0)*0.10)::integer) transfer_limit,
      count(a.id) filter(where a.released_at>=private.school_programme_period_start(p_school_id,sme.module_key)
        and not a.correction and coalesce(a.release_reason,'')<>'left_school')::integer transfers_used
    from public.school_module_entitlements sme
    left join public.school_programme_seat_assignments a
      on a.school_id=sme.school_id and a.module_key=sme.module_key
    where sme.school_id=p_school_id and sme.enabled and sme.module_key in ('cambridge','ielts','writing')
      and sme.starts_at<=now() and (sme.ends_at is null or sme.ends_at>now())
    group by sme.module_key,sme.seat_limit
  ) row_data;

  select coalesce(jsonb_agg(row_data order by student_name),'[]'::jsonb) into v_students
  from (
    select sm.user_id,coalesce(nullif(trim(u.full_name),''),nullif(trim(u.username),''),'Student') student_name,
      coalesce(u.batch,'Unassigned') class_name,
      coalesce((select jsonb_agg(spsa.module_key order by spsa.module_key)
        from public.school_programme_seat_assignments spsa
        where spsa.school_id=p_school_id and spsa.student_user_id=sm.user_id and spsa.released_at is null),'[]'::jsonb) modules
    from public.school_members sm join public.users u on u.id=sm.user_id
    where sm.school_id=p_school_id and sm.status='active' and sm.role_in_school='student'
  ) row_data;
  return jsonb_build_object('success',true,'programmes',v_programmes,'students',v_students,'generated_at',now());
end;
$$;
revoke all on function public.school_head_get_programme_seats(uuid) from public,anon,authenticated,service_role;
grant execute on function public.school_head_get_programme_seats(uuid) to authenticated;

create or replace function public.school_head_assign_programme_seat(
  p_school_id uuid,p_module_key text,p_student_user_id uuid
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_limit integer; v_used integer; v_assignment uuid; v_period date;
begin
  if v_actor is null or not (public.is_school_owner(p_school_id) or public.is_superadmin(v_actor)) then
    raise exception using errcode='42501',message='school_head_or_platform_administrator_required';
  end if;
  if p_module_key not in ('cambridge','ielts','writing') then return jsonb_build_object('success',false,'error','Unsupported programme.'); end if;
  if not exists(select 1 from public.school_members sm where sm.school_id=p_school_id and sm.user_id=p_student_user_id and sm.status='active' and sm.role_in_school='student') then
    return jsonb_build_object('success',false,'error','Choose an active student in this school.');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_school_id::text||':'||p_module_key,0));
  select sme.seat_limit into v_limit from public.school_module_entitlements sme
  where sme.school_id=p_school_id and sme.module_key=p_module_key and sme.enabled
    and sme.starts_at<=now() and (sme.ends_at is null or sme.ends_at>now()) for update;
  if v_limit is null then return jsonb_build_object('success',false,'error','A fixed seat limit has not been configured for this programme.'); end if;
  if exists(select 1 from public.school_programme_seat_assignments where school_id=p_school_id and module_key=p_module_key and student_user_id=p_student_user_id and released_at is null) then
    return jsonb_build_object('success',true,'already_assigned',true);
  end if;
  select count(*)::integer into v_used from public.school_programme_seat_assignments
  where school_id=p_school_id and module_key=p_module_key
    and (released_at is null or cooldown_until>now());
  if v_used>=v_limit then return jsonb_build_object('success',false,'error','No programme seats are available.'); end if;
  v_period:=private.school_programme_period_start(p_school_id,p_module_key);
  insert into public.school_programme_seat_assignments(school_id,module_key,student_user_id,assigned_by,billing_period_start)
  values(p_school_id,p_module_key,p_student_user_id,v_actor,v_period) returning id into v_assignment;
  insert into public.school_programme_seat_events(assignment_id,school_id,module_key,student_user_id,actor_user_id,event_type)
  values(v_assignment,p_school_id,p_module_key,p_student_user_id,v_actor,'assigned');
  return jsonb_build_object('success',true,'assignment_id',v_assignment,'assigned',v_used+1,'seat_limit',v_limit);
end;
$$;
revoke all on function public.school_head_assign_programme_seat(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.school_head_assign_programme_seat(uuid,text,uuid) to authenticated;

create or replace function public.mark_my_programme_seat_used(p_module_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_school uuid; v_assignment uuid;
begin
  select sm.school_id into v_school from public.school_members sm
  where sm.user_id=v_actor and sm.status='active' and sm.role_in_school='student' limit 1;
  if v_actor is null or v_school is null or not private.actor_can_access_school_programme(v_school,p_module_key,false) then
    return jsonb_build_object('success',false,'error','programme_access_required');
  end if;
  update public.school_programme_seat_assignments set activated_at=coalesce(activated_at,now()),updated_at=now()
  where school_id=v_school and module_key=p_module_key and student_user_id=v_actor and released_at is null and activated_at is null
  returning id into v_assignment;
  if v_assignment is not null then
    insert into public.school_programme_seat_events(assignment_id,school_id,module_key,student_user_id,actor_user_id,event_type)
    values(v_assignment,v_school,p_module_key,v_actor,v_actor,'activated');
  end if;
  return jsonb_build_object('success',true,'activated',v_assignment is not null);
end;
$$;
revoke all on function public.mark_my_programme_seat_used(text) from public,anon,authenticated,service_role;
grant execute on function public.mark_my_programme_seat_used(text) to authenticated;

create or replace function public.school_head_release_programme_seat(
  p_school_id uuid,p_module_key text,p_student_user_id uuid,p_reason text,p_note text default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_row public.school_programme_seat_assignments%rowtype;
  v_limit integer; v_transfer_limit integer; v_transfers integer; v_correction boolean; v_cooldown timestamptz;
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
  select seat_limit into v_limit from public.school_module_entitlements where school_id=p_school_id and module_key=p_module_key;
  v_transfer_limit:=greatest(2,ceil(coalesce(v_limit,0)*0.10)::integer);
  v_correction:=v_row.activated_at is null
    and not private.student_has_programme_usage(p_school_id,p_module_key,p_student_user_id,v_row.assigned_at)
    and v_row.assigned_at>now()-interval '24 hours';
  select count(*)::integer into v_transfers from public.school_programme_seat_assignments
  where school_id=p_school_id and module_key=p_module_key
    and released_at>=private.school_programme_period_start(p_school_id,p_module_key)
    and not correction and coalesce(release_reason,'')<>'left_school';
  if not v_correction and p_reason<>'left_school' and not public.is_superadmin(v_actor) and v_transfers>=v_transfer_limit then
    return jsonb_build_object('success',false,'error','The monthly transfer allowance has been used. Request an exception or add seats.');
  end if;
  v_cooldown:=case when v_correction or p_reason='left_school' then now() else now()+interval '7 days' end;
  update public.school_programme_seat_assignments set released_at=now(),released_by=v_actor,
    release_reason=p_reason,release_note=nullif(trim(p_note),''),cooldown_until=v_cooldown,
    correction=v_correction,updated_at=now() where id=v_row.id;
  insert into public.school_programme_seat_events(assignment_id,school_id,module_key,student_user_id,actor_user_id,event_type,reason,metadata)
  values(v_row.id,p_school_id,p_module_key,p_student_user_id,v_actor,case when v_correction then 'corrected' else 'released' end,p_reason,
    jsonb_build_object('cooldown_until',v_cooldown,'correction',v_correction));
  return jsonb_build_object('success',true,'correction',v_correction,'cooldown_until',v_cooldown,
    'transfers_remaining',greatest(0,v_transfer_limit-v_transfers-(not v_correction and p_reason<>'left_school')::integer));
end;
$$;
revoke all on function public.school_head_release_programme_seat(uuid,text,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.school_head_release_programme_seat(uuid,text,uuid,text,text) to authenticated;

-- Seat limits are copied only when an accepted quote is explicitly activated by billing/admin workflows.
-- Quote creation and approval still do not change access.
create or replace function public.admin_configure_school_programme_seats(
  p_school_id uuid,p_module_key text,p_seat_limit integer,p_source_quote_id uuid default null,p_subscription_id uuid default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();
begin
  if v_actor is null or not public.is_superadmin(v_actor) then raise exception using errcode='42501',message='platform_administrator_required'; end if;
  if p_module_key not in ('cambridge','ielts','writing') or coalesce(p_seat_limit,0)<1 then
    return jsonb_build_object('success',false,'error','Choose a supported programme and positive seat limit.');
  end if;
  insert into public.school_module_entitlements(school_id,module_key,enabled,source,starts_at,configured_by,seat_limit,source_quote_id,subscription_id)
  values(p_school_id,p_module_key,true,'platform_admin',now(),v_actor,p_seat_limit,p_source_quote_id,p_subscription_id)
  on conflict(school_id,module_key) do update set enabled=true,seat_limit=excluded.seat_limit,
    source_quote_id=excluded.source_quote_id,subscription_id=excluded.subscription_id,configured_by=v_actor,updated_at=now();
  return jsonb_build_object('success',true,'school_id',p_school_id,'module_key',p_module_key,'seat_limit',p_seat_limit);
end;
$$;
revoke all on function public.admin_configure_school_programme_seats(uuid,text,integer,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_configure_school_programme_seats(uuid,text,integer,uuid,uuid) to authenticated;
