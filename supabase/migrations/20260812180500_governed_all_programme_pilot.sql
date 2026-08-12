-- One governed 30-day, all-programme pilot per school.
-- Starting a pilot remains an explicit School Head action; this migration does
-- not start, extend, or otherwise change any existing school automatically.

create table if not exists public.school_pilot_lifecycle (
  school_id uuid primary key references public.schools(id) on delete cascade,
  state text not null default 'not_started' check (state in ('not_started','active','expired','converted','cancelled')),
  started_at timestamptz,
  ends_at timestamptz,
  converted_at timestamptz,
  cancelled_at timestamptz,
  started_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (ends_at is null or started_at is null or ends_at > started_at)
);

alter table public.school_pilot_lifecycle enable row level security;
revoke all on public.school_pilot_lifecycle from public, anon, authenticated;
grant select on public.school_pilot_lifecycle to authenticated;
grant all on public.school_pilot_lifecycle to service_role;

drop policy if exists school_heads_read_pilot_lifecycle on public.school_pilot_lifecycle;
create policy school_heads_read_pilot_lifecycle
  on public.school_pilot_lifecycle for select to authenticated
  using (public.is_school_owner(school_id) or public.is_superadmin((select auth.uid())));

insert into public.school_pilot_lifecycle(school_id,state,started_at,ends_at,converted_at)
select s.id,
  case
    when s.trial_ends_at is not null and s.school_plan in ('core','standard','pro','enterprise') then 'converted'
    when s.trial_ends_at > now() and s.school_plan='pilot' then 'active'
    when s.trial_ends_at is not null then 'expired'
    else 'not_started'
  end,
  case when s.trial_ends_at is not null then s.trial_ends_at-interval '30 days' else null end,
  s.trial_ends_at,
  case when s.trial_ends_at is not null and s.school_plan in ('core','standard','pro','enterprise') then now() else null end
from public.schools s
on conflict (school_id) do nothing;

create or replace function public.start_school_pilot()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_school_id uuid;
  v_school public.schools%rowtype;
  v_pilot public.school_pilot_lifecycle%rowtype;
  v_ends_at timestamptz;
  v_students integer;
  v_teachers integer;
  v_module text;
begin
  if v_actor is null then return jsonb_build_object('success',false,'error','Not authenticated'); end if;
  select sm.school_id into v_school_id from public.school_members sm
  where sm.user_id=v_actor and sm.status='active' and sm.is_owner
  order by sm.joined_at asc nulls last,sm.school_id limit 1;
  if v_school_id is null or not public.is_school_owner(v_school_id) then
    return jsonb_build_object('success',false,'error','Only the School Head can start the school pilot.');
  end if;

  select * into v_school from public.schools s where s.id=v_school_id for update;
  insert into public.school_pilot_lifecycle(school_id) values(v_school_id) on conflict (school_id) do nothing;
  select * into v_pilot from public.school_pilot_lifecycle spl where spl.school_id=v_school_id for update;

  if v_pilot.state <> 'not_started' or v_school.trial_ends_at is not null then
    return jsonb_build_object('success',false,'error','This school has already used its one 30-day pilot.');
  end if;
  if v_school.school_plan is distinct from 'none' then
    return jsonb_build_object('success',false,'error','This school already has a plan.');
  end if;
  if exists(select 1 from public.billing_subscriptions bs where bs.school_id=v_school_id and bs.status in ('active','trialing','past_due')) then
    return jsonb_build_object('success',false,'error','This school already has an active billing agreement.');
  end if;

  select count(*)::integer into v_students from public.school_members sm
  where sm.school_id=v_school_id and sm.status='active' and sm.role_in_school='student';
  select count(*)::integer into v_teachers from public.school_members sm
  where sm.school_id=v_school_id and sm.status='active' and sm.role_in_school='teacher';
  if v_students > 50 then return jsonb_build_object('success',false,'error','The pilot supports up to 50 registered students. Request a paid package for this school size.'); end if;
  if v_teachers > 10 then return jsonb_build_object('success',false,'error','The pilot supports up to 10 registered teachers. Request a paid package for this school size.'); end if;

  v_ends_at := now()+interval '30 days';
  update public.schools set school_plan='pilot',trial_ends_at=v_ends_at where id=v_school_id;
  update public.school_pilot_lifecycle set state='active',started_at=now(),ends_at=v_ends_at,started_by=v_actor,updated_at=now() where school_id=v_school_id;

  foreach v_module in array array['core','cambridge','ielts','writing','admissions'] loop
    insert into public.school_module_entitlements(school_id,module_key,enabled,source,starts_at,ends_at,configured_by,notes)
    values(v_school_id,v_module,true,'pilot',now(),v_ends_at,v_actor,'30-day all-programme school pilot')
    on conflict (school_id,module_key) do update set enabled=true,source='pilot',starts_at=excluded.starts_at,
      ends_at=excluded.ends_at,configured_by=excluded.configured_by,notes=excluded.notes,updated_at=now();
  end loop;

  perform public.init_school_pilot_usage(v_school_id);
  return jsonb_build_object(
    'success',true,'plan','pilot','pilot_state','active','trial_ends_at',v_ends_at,
    'limits',jsonb_build_object('students',50,'teachers',10,'admission_candidates',50),
    'programmes',array['core','cambridge','ielts','writing','admissions'],
    'message','30-day all-programme pilot activated. No card required.'
  );
end;
$$;

revoke all on function public.start_school_pilot() from public, anon, authenticated, service_role;
grant execute on function public.start_school_pilot() to authenticated;

comment on table public.school_pilot_lifecycle is 'Explicit one-pilot-per-school lifecycle. Runtime access still checks exact entitlement and expiry timestamps.';
