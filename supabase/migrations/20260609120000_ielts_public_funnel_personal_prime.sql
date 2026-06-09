-- IELTS public funnel + personal Prime subscriptions.
-- Keeps school billing untouched while allowing independent learners to preview
-- published task metadata and buy IELTS Prime without school_id.


-- Minimal entitlement metadata for non-reading task tables. Existing code already
-- supports required_tier on reading sets; adding it here lets RLS avoid exposing
-- full prompts/questions for Prime-only items.
alter table if exists public.ielts_listening_sets add column if not exists required_tier text default 'prime_prep_user';
alter table if exists public.ielts_writing_tasks add column if not exists required_tier text default 'free';
alter table if exists public.ielts_speaking_tasks add column if not exists required_tier text default 'free';

with ranked as (
  select id, row_number() over (order by created_at desc, id desc) rn
  from public.ielts_writing_tasks
  where is_active = true
)
update public.ielts_writing_tasks w
set required_tier = case when ranked.rn > 1 then 'prime_prep_user' else coalesce(w.required_tier, 'free') end
from ranked
where ranked.id = w.id;

with ranked as (
  select id, row_number() over (order by created_at desc, id desc) rn
  from public.ielts_speaking_tasks
  where is_active = true
)
update public.ielts_speaking_tasks s
set required_tier = case when ranked.rn > 1 then 'prime_prep_user' else coalesce(s.required_tier, 'free') end
from ranked
where ranked.id = s.id;

update public.ielts_listening_sets
set required_tier = coalesce(required_tier, 'prime_prep_user');

create table if not exists public.ielts_prime_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  paddle_customer_id text,
  paddle_subscription_id text,
  paddle_transaction_id text,
  plan text not null check (plan in ('monthly', 'quarterly', 'yearly')),
  status text not null default 'pending',
  price_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  management_url text,
  update_payment_url text,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ielts_prime_subscriptions_paddle_subscription_uidx
  on public.ielts_prime_subscriptions (paddle_subscription_id)
  where paddle_subscription_id is not null;

create unique index if not exists ielts_prime_subscriptions_paddle_transaction_uidx
  on public.ielts_prime_subscriptions (paddle_transaction_id)
  where paddle_transaction_id is not null;

create index if not exists ielts_prime_subscriptions_user_idx
  on public.ielts_prime_subscriptions (user_id, status, current_period_end);

create or replace function public.ielts_prime_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ielts_prime_subscriptions_updated_at on public.ielts_prime_subscriptions;
create trigger trg_ielts_prime_subscriptions_updated_at
  before update on public.ielts_prime_subscriptions
  for each row execute function public.ielts_prime_subscriptions_updated_at();

alter table public.ielts_prime_subscriptions enable row level security;

drop policy if exists ielts_prime_subscriptions_select_own on public.ielts_prime_subscriptions;
create policy ielts_prime_subscriptions_select_own
  on public.ielts_prime_subscriptions
  for select
  using (user_id = auth.uid());

drop policy if exists ielts_prime_subscriptions_service_role_all on public.ielts_prime_subscriptions;
create policy ielts_prime_subscriptions_service_role_all
  on public.ielts_prime_subscriptions
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create or replace function public.has_active_ielts_prime_subscription(p_user_id uuid default null)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.ielts_prime_subscriptions s
    where s.user_id = coalesce(p_user_id, auth.uid())
      and (
        s.status in ('active', 'trialing')
        or (s.status = 'cancelled' and s.current_period_end is not null and s.current_period_end > now())
      )
  );
$$;

grant execute on function public.has_active_ielts_prime_subscription(uuid) to anon, authenticated, service_role;

create or replace function public.get_ielts_prime_subscription_status()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_sub public.ielts_prime_subscriptions%rowtype;
begin
  select * into v_sub
  from public.ielts_prime_subscriptions
  where user_id = auth.uid()
  order by created_at desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'has_subscription', false,
      'status', null,
      'plan', null,
      'current_period_end', null,
      'cancel_at_period_end', false,
      'management_url', null,
      'update_payment_url', null
    );
  end if;

  return jsonb_build_object(
    'has_subscription', public.has_active_ielts_prime_subscription(auth.uid()),
    'status', v_sub.status,
    'plan', v_sub.plan,
    'current_period_end', v_sub.current_period_end,
    'cancel_at_period_end', v_sub.cancel_at_period_end,
    'management_url', v_sub.management_url,
    'update_payment_url', v_sub.update_payment_url
  );
end;
$$;

grant execute on function public.get_ielts_prime_subscription_status() to authenticated, service_role;

create or replace function public.ielts_user_has_prime_access(p_user_id uuid default null)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := coalesce(p_user_id, auth.uid());
  v_tier text;
  v_school_tier text;
begin
  if v_user_id is null then
    return false;
  end if;

  if public.has_active_ielts_prime_subscription(v_user_id) then
    return true;
  end if;

  select tier into v_tier from public.ielts_users where id = v_user_id;
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

grant execute on function public.ielts_user_has_prime_access(uuid) to anon, authenticated, service_role;

create or replace function public.rpc_public_ielts_task_previews()
returns table(
  id integer,
  skill text,
  slug text,
  title text,
  description text,
  level text,
  est_band_min numeric,
  est_band_max numeric,
  duration_minutes integer,
  required_tier text,
  is_prime boolean,
  sort_order timestamptz
)
language sql
security definer
set search_path = public
as $$
  with previews as (
    select
      r.id,
      'reading'::text as skill,
      r.slug,
      r.title,
      r.description,
      r.level,
      r.est_band_min,
      r.est_band_max,
      r.duration_minutes,
      coalesce(r.required_tier, case when row_number() over (order by r.created_at desc, r.id desc) > 1 then 'prime_prep_user' else 'free' end)::text as required_tier,
      (coalesce(r.required_tier, case when row_number() over (order by r.created_at desc, r.id desc) > 1 then 'prime_prep_user' else 'free' end) <> 'free') as is_prime,
      r.created_at as sort_order
    from public.ielts_reading_sets r
    where r.is_active = true

    union all

    select
      l.id,
      'listening'::text as skill,
      l.slug,
      l.title,
      l.description,
      l.level,
      l.est_band_min,
      l.est_band_max,
      l.duration_minutes,
      coalesce(l.required_tier, 'prime_prep_user')::text as required_tier,
      (coalesce(l.required_tier, 'prime_prep_user') <> 'free') as is_prime,
      l.created_at as sort_order
    from public.ielts_listening_sets l
    where l.is_active = true

    union all

    select
      w.id,
      'writing'::text as skill,
      w.slug,
      w.title,
      case when w.task_type is not null then concat('Writing ', upper(w.task_type), ' practice') else 'Writing practice task' end as description,
      w.task_type as level,
      null::numeric as est_band_min,
      null::numeric as est_band_max,
      case when w.task_type = 'task1' then 20 else 40 end as duration_minutes,
      coalesce(w.required_tier, 'free')::text as required_tier,
      (coalesce(w.required_tier, 'free') <> 'free') as is_prime,
      w.created_at as sort_order
    from public.ielts_writing_tasks w
    where w.is_active = true

    union all

    select
      s.id,
      'speaking'::text as skill,
      s.slug,
      concat('Speaking Part ', s.part) as title,
      concat('Speaking practice part ', s.part) as description,
      concat('Part ', s.part) as level,
      null::numeric as est_band_min,
      null::numeric as est_band_max,
      15 as duration_minutes,
      coalesce(s.required_tier, 'free')::text as required_tier,
      (coalesce(s.required_tier, 'free') <> 'free') as is_prime,
      s.created_at as sort_order
    from public.ielts_speaking_tasks s
    where s.is_active = true
  )
  select
    previews.id,
    previews.skill,
    previews.slug,
    previews.title,
    previews.description,
    previews.level,
    previews.est_band_min,
    previews.est_band_max,
    previews.duration_minutes,
    previews.required_tier,
    previews.is_prime,
    previews.sort_order
  from previews
  order by previews.skill, previews.sort_order desc;
$$;

grant execute on function public.rpc_public_ielts_task_previews() to anon, authenticated, service_role;

create or replace function public.rpc_ielts_check_practice_access(p_skill text, p_task_id integer)
returns table(allowed boolean, reason text, required_tier text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_required_tier text := 'free';
  v_exists boolean := false;
  v_rank int := 1;
  v_is_prime boolean := false;
begin
  if auth.uid() is null then
    return query select false, 'not_authenticated'::text, null::text;
    return;
  end if;

  if p_skill = 'reading' then
    select true, coalesce(required_tier, 'free') into v_exists, v_required_tier
    from public.ielts_reading_sets
    where id = p_task_id and is_active = true;
  elsif p_skill = 'listening' then
    select true, coalesce(required_tier, 'prime_prep_user') into v_exists, v_required_tier
    from public.ielts_listening_sets
    where id = p_task_id and is_active = true;
  elsif p_skill = 'writing' then
    select true, coalesce(required_tier, 'free') into v_exists, v_required_tier
    from public.ielts_writing_tasks
    where id = p_task_id and is_active = true;
  elsif p_skill = 'speaking' then
    select true, coalesce(required_tier, 'free') into v_exists, v_required_tier
    from public.ielts_speaking_tasks
    where id = p_task_id and is_active = true;
  else
    return query select false, 'not_found'::text, null::text;
    return;
  end if;

  if not coalesce(v_exists, false) then
    return query select false, 'not_found'::text, null::text;
    return;
  end if;

  v_is_prime := v_required_tier is not null and v_required_tier <> 'free';
  if v_is_prime and not public.ielts_user_has_prime_access(auth.uid()) then
    return query select false, 'prime_required'::text, v_required_tier;
    return;
  end if;

  return query select true, 'allowed'::text, v_required_tier;
end;
$$;

grant execute on function public.rpc_ielts_check_practice_access(text, integer) to authenticated, service_role;

-- RLS hardening: anonymous users cannot read full task payloads directly; the
-- public preview RPC above exposes only safe metadata. Authenticated users can
-- read full active tasks only when the item is free or their Prime entitlement is valid.
alter table if exists public.ielts_reading_sets enable row level security;
alter table if exists public.ielts_reading_questions enable row level security;
alter table if exists public.ielts_listening_sets enable row level security;
alter table if exists public.ielts_listening_questions enable row level security;
alter table if exists public.ielts_writing_tasks enable row level security;
alter table if exists public.ielts_speaking_tasks enable row level security;

drop policy if exists ielts_reading_sets_auth_access on public.ielts_reading_sets;
create policy ielts_reading_sets_auth_access on public.ielts_reading_sets
  for select to authenticated
  using (is_active = true and (coalesce(required_tier, 'free') = 'free' or public.ielts_user_has_prime_access(auth.uid())));

drop policy if exists ielts_reading_questions_auth_access on public.ielts_reading_questions;
create policy ielts_reading_questions_auth_access on public.ielts_reading_questions
  for select to authenticated
  using (exists (
    select 1 from public.ielts_reading_sets r
    where r.id = set_id
      and r.is_active = true
      and (coalesce(r.required_tier, 'free') = 'free' or public.ielts_user_has_prime_access(auth.uid()))
  ));

drop policy if exists ielts_listening_sets_auth_prime_access on public.ielts_listening_sets;
create policy ielts_listening_sets_auth_prime_access on public.ielts_listening_sets
  for select to authenticated
  using (is_active = true and (coalesce(required_tier, 'prime_prep_user') = 'free' or public.ielts_user_has_prime_access(auth.uid())));

drop policy if exists ielts_listening_questions_auth_prime_access on public.ielts_listening_questions;
create policy ielts_listening_questions_auth_prime_access on public.ielts_listening_questions
  for select to authenticated
  using (exists (
    select 1 from public.ielts_listening_sets l
    where l.id = set_id
      and l.is_active = true
      and (coalesce(l.required_tier, 'prime_prep_user') = 'free' or public.ielts_user_has_prime_access(auth.uid()))
  ));

drop policy if exists ielts_writing_tasks_auth_access on public.ielts_writing_tasks;
create policy ielts_writing_tasks_auth_access on public.ielts_writing_tasks
  for select to authenticated
  using (is_active = true and (coalesce(required_tier, 'free') = 'free' or public.ielts_user_has_prime_access(auth.uid())));

drop policy if exists ielts_speaking_tasks_auth_access on public.ielts_speaking_tasks;
create policy ielts_speaking_tasks_auth_access on public.ielts_speaking_tasks
  for select to authenticated
  using (is_active = true and (coalesce(required_tier, 'free') = 'free' or public.ielts_user_has_prime_access(auth.uid())));


-- Preserve existing teacher/admin content management flows.
drop policy if exists ielts_reading_sets_admin_all on public.ielts_reading_sets;
create policy ielts_reading_sets_admin_all on public.ielts_reading_sets
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and (u.is_admin = true or u.role in ('school_admin','admin','superadmin','teacher'))))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and (u.is_admin = true or u.role in ('school_admin','admin','superadmin','teacher'))));

drop policy if exists ielts_reading_questions_admin_all on public.ielts_reading_questions;
create policy ielts_reading_questions_admin_all on public.ielts_reading_questions
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and (u.is_admin = true or u.role in ('school_admin','admin','superadmin','teacher'))))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and (u.is_admin = true or u.role in ('school_admin','admin','superadmin','teacher'))));

drop policy if exists ielts_listening_sets_admin_all on public.ielts_listening_sets;
create policy ielts_listening_sets_admin_all on public.ielts_listening_sets
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and (u.is_admin = true or u.role in ('school_admin','admin','superadmin','teacher'))))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and (u.is_admin = true or u.role in ('school_admin','admin','superadmin','teacher'))));

drop policy if exists ielts_listening_questions_admin_all on public.ielts_listening_questions;
create policy ielts_listening_questions_admin_all on public.ielts_listening_questions
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and (u.is_admin = true or u.role in ('school_admin','admin','superadmin','teacher'))))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and (u.is_admin = true or u.role in ('school_admin','admin','superadmin','teacher'))));

drop policy if exists ielts_writing_tasks_admin_all on public.ielts_writing_tasks;
create policy ielts_writing_tasks_admin_all on public.ielts_writing_tasks
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and (u.is_admin = true or u.role in ('school_admin','admin','superadmin','teacher'))))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and (u.is_admin = true or u.role in ('school_admin','admin','superadmin','teacher'))));

drop policy if exists ielts_speaking_tasks_admin_all on public.ielts_speaking_tasks;
create policy ielts_speaking_tasks_admin_all on public.ielts_speaking_tasks
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and (u.is_admin = true or u.role in ('school_admin','admin','superadmin','teacher'))))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and (u.is_admin = true or u.role in ('school_admin','admin','superadmin','teacher'))));
