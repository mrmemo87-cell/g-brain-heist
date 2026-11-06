-- IELTS Prime: local payments (MBank / O!Dengi / Elsom transfer, approved by the owner), follow-up emails for
-- learners who tried the free unit, and an internal growth snapshot for the owner's daily report.
--
-- Owner direction 2026-11-06 (Asia/Bishkek): many learners in Kyrgyzstan pay by local wallet or bank transfer rather
-- than an international card. A learner chooses a plan, transfers the som amount to the owner's account, and submits
-- the payment. The owner approves it and Prime runs for exactly the paid period (a 'manual' subscription row with a
-- fixed end date; it expires on its own). Nothing here touches ielts_users.tier, which never expires by itself.

-- 1. Prime subscriptions gain a third provider -------------------------------------------------------------------
alter table public.ielts_prime_subscriptions drop constraint if exists ielts_prime_subscriptions_provider_check;
alter table public.ielts_prime_subscriptions
  add constraint ielts_prime_subscriptions_provider_check check (provider = any (array['paddle', 'google_play', 'manual']));

create or replace function public.has_active_ielts_prime_subscription(p_user_id uuid default null::uuid)
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
        (
          s.provider = 'google_play'
          and s.status in ('active', 'cancelled', 'grace')
          and s.current_period_end is not null
          and s.current_period_end > now()
        )
        or (
          s.provider = 'paddle'
          and (
            s.status in ('active', 'trialing')
            or (s.status = 'cancelled' and s.current_period_end is not null and s.current_period_end > now())
          )
        )
        or (
          s.provider = 'manual'
          and s.status = 'active'
          and s.current_period_end is not null
          and s.current_period_end > now()
        )
      )
  );
end;
$$;

revoke all on function public.has_active_ielts_prime_subscription(uuid) from public, anon;
grant execute on function public.has_active_ielts_prime_subscription(uuid) to authenticated, service_role;

-- 2. Settings the owner controls (one row) ---------------------------------------------------------------------
create table if not exists public.ielts_manual_payment_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  bank_label text not null default 'MBank',
  recipient_name text,
  recipient_phone text,
  instructions text,
  price_monthly_som integer not null default 1250 check (price_monthly_som between 100 and 100000),
  price_quarterly_som integer not null default 2990 check (price_quarterly_som between 100 and 300000),
  price_yearly_som integer not null default 8590 check (price_yearly_som between 100 and 1000000),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.ielts_manual_payment_settings (singleton) values (true) on conflict do nothing;
alter table public.ielts_manual_payment_settings enable row level security;
revoke all on table public.ielts_manual_payment_settings from public, anon, authenticated;

-- 3. Submitted payments --------------------------------------------------------------------------------------
create table if not exists public.ielts_manual_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('monthly', 'quarterly', 'yearly')),
  amount_som integer not null check (amount_som > 0),
  method text not null check (method in ('mbank', 'odengi', 'elsom', 'optima', 'other')),
  payer_name text not null check (char_length(payer_name) between 2 and 120),
  payer_phone text check (payer_phone is null or char_length(payer_phone) <= 40),
  reference text check (reference is null or char_length(reference) <= 120),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  review_note text check (review_note is null or char_length(review_note) <= 500),
  reviewed_by uuid,
  reviewed_at timestamptz,
  subscription_id uuid references public.ielts_prime_subscriptions(id) on delete set null,
  attribution jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ielts_manual_payments_status_idx on public.ielts_manual_payments (status, created_at desc);
create index if not exists ielts_manual_payments_user_idx on public.ielts_manual_payments (user_id, created_at desc);
alter table public.ielts_manual_payments enable row level security;
revoke all on table public.ielts_manual_payments from public, anon, authenticated;

create or replace function private.ielts_manual_price(p_plan text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case p_plan
    when 'monthly' then s.price_monthly_som
    when 'quarterly' then s.price_quarterly_som
    when 'yearly' then s.price_yearly_som
  end
  from public.ielts_manual_payment_settings s where s.singleton;
$$;
revoke all on function private.ielts_manual_price(text) from public, anon, authenticated;

-- What the Prime page shows: whether local payment is on, where to send money, prices, and my latest payment.
create or replace function public.rpc_ielts_manual_payment_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  s public.ielts_manual_payment_settings%rowtype;
  v_latest jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  select * into s from public.ielts_manual_payment_settings where singleton;

  select jsonb_build_object('id', p.id, 'plan', p.plan, 'amount_som', p.amount_som, 'status', p.status,
                            'created_at', p.created_at, 'reviewed_at', p.reviewed_at, 'review_note', p.review_note)
    into v_latest
  from public.ielts_manual_payments p
  where p.user_id = v_actor and p.status <> 'cancelled'
  order by p.created_at desc limit 1;

  return jsonb_build_object(
    'enabled', coalesce(s.enabled, false) and nullif(trim(s.recipient_phone), '') is not null,
    'bank_label', s.bank_label,
    'recipient_name', case when s.enabled then s.recipient_name end,
    'recipient_phone', case when s.enabled then s.recipient_phone end,
    'instructions', case when s.enabled then s.instructions end,
    'prices', jsonb_build_object('monthly', s.price_monthly_som, 'quarterly', s.price_quarterly_som, 'yearly', s.price_yearly_som),
    'latest', v_latest
  );
end;
$$;
revoke all on function public.rpc_ielts_manual_payment_options() from public, anon;
grant execute on function public.rpc_ielts_manual_payment_options() to authenticated;

create or replace function public.rpc_ielts_manual_payment_submit(
  p_plan text,
  p_method text,
  p_payer_name text,
  p_payer_phone text default null,
  p_reference text default null,
  p_attribution jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_enabled boolean;
  v_amount integer;
  v_id uuid;
  v_name text := left(trim(coalesce(p_payer_name, '')), 120);
  v_attr jsonb := case when jsonb_typeof(p_attribution) = 'object' then p_attribution else '{}'::jsonb end;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  select s.enabled and nullif(trim(s.recipient_phone), '') is not null into v_enabled
  from public.ielts_manual_payment_settings s where s.singleton;
  if not coalesce(v_enabled, false) then
    raise exception using errcode = 'P0001', message = 'manual_payment_disabled';
  end if;
  if p_plan not in ('monthly', 'quarterly', 'yearly') then
    raise exception using errcode = '22023', message = 'invalid_plan';
  end if;
  if p_method not in ('mbank', 'odengi', 'elsom', 'optima', 'other') then
    raise exception using errcode = '22023', message = 'invalid_method';
  end if;
  if char_length(v_name) < 2 then
    raise exception using errcode = '22023', message = 'payer_name_required';
  end if;
  if exists (select 1 from public.ielts_manual_payments p where p.user_id = v_actor and p.status = 'pending') then
    raise exception using errcode = 'P0001', message = 'payment_already_pending';
  end if;
  if (select count(*) from public.ielts_manual_payments p
      where p.user_id = v_actor and p.created_at > now() - interval '1 day') >= 5 then
    raise exception using errcode = 'P0001', message = 'too_many_requests';
  end if;

  v_amount := private.ielts_manual_price(p_plan);
  -- Keep only small, known attribution keys.
  select coalesce(jsonb_object_agg(k, left(v_attr->>k, 200)), '{}'::jsonb) into v_attr
  from unnest(array['source', 'medium', 'campaign', 'content', 'term']) k
  where v_attr ? k and jsonb_typeof(v_attr->k) = 'string';

  insert into public.ielts_manual_payments (user_id, plan, amount_som, method, payer_name, payer_phone, reference, attribution)
  values (v_actor, p_plan, v_amount, p_method, v_name,
          nullif(left(trim(coalesce(p_payer_phone, '')), 40), ''),
          nullif(left(trim(coalesce(p_reference, '')), 120), ''), v_attr)
  returning id into v_id;

  insert into public.transactional_email_outbox (event_type, category, audience, template_key, payload, idempotency_key)
  values ('ielts_manual_payment_submitted', 'platform_operations', 'platform_owner', 'owner_ielts_manual_payment',
          jsonb_build_object('payment_id', v_id, 'plan', p_plan, 'amount_som', v_amount, 'method', p_method),
          'owner-ielts-manual-payment-' || v_id)
  on conflict (idempotency_key) do nothing;

  return jsonb_build_object('id', v_id, 'status', 'pending', 'amount_som', v_amount);
end;
$$;
revoke all on function public.rpc_ielts_manual_payment_submit(text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.rpc_ielts_manual_payment_submit(text, text, text, text, text, jsonb) to authenticated;

create or replace function public.rpc_ielts_manual_payment_cancel(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  update public.ielts_manual_payments
     set status = 'cancelled', updated_at = now()
   where id = p_id and user_id = (select auth.uid()) and status = 'pending';
end;
$$;
revoke all on function public.rpc_ielts_manual_payment_cancel(uuid) from public, anon;
grant execute on function public.rpc_ielts_manual_payment_cancel(uuid) to authenticated;

-- Owner: list payments, approve or reject, edit settings.
create or replace function public.rpc_ielts_manual_payments_admin(p_status text default 'pending')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
  v_settings jsonb;
begin
  if not public.is_superadmin((select auth.uid())) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'user_id', p.user_id, 'email', u.email,
           'name', coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
           'plan', p.plan, 'amount_som', p.amount_som, 'method', p.method, 'payer_name', p.payer_name,
           'payer_phone', p.payer_phone, 'reference', p.reference, 'status', p.status, 'review_note', p.review_note,
           'created_at', p.created_at, 'reviewed_at', p.reviewed_at,
           'campaign', coalesce(p.attribution->>'campaign', p.attribution->>'source'))
         order by p.created_at desc), '[]'::jsonb)
    into v_rows
  from (
    select * from public.ielts_manual_payments x
    where p_status is null or p_status = 'all' or x.status = p_status
    order by x.created_at desc limit 200
  ) p
  left join auth.users u on u.id = p.user_id;

  select to_jsonb(s) - 'singleton' - 'updated_by' into v_settings from public.ielts_manual_payment_settings s where s.singleton;
  return jsonb_build_object('payments', v_rows, 'settings', v_settings);
end;
$$;
revoke all on function public.rpc_ielts_manual_payments_admin(text) from public, anon;
grant execute on function public.rpc_ielts_manual_payments_admin(text) to authenticated;

create or replace function public.rpc_ielts_manual_payment_review(p_id uuid, p_approve boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  p public.ielts_manual_payments%rowtype;
  v_start timestamptz;
  v_end timestamptz;
  v_sub uuid;
begin
  if not public.is_superadmin(v_actor) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  select * into p from public.ielts_manual_payments where id = p_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'payment_not_found';
  end if;
  if p.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'payment_not_pending';
  end if;

  if not p_approve then
    update public.ielts_manual_payments
       set status = 'rejected', review_note = nullif(left(trim(coalesce(p_note, '')), 500), ''),
           reviewed_by = v_actor, reviewed_at = now(), updated_at = now()
     where id = p_id;
    insert into public.transactional_email_outbox (event_type, category, audience, recipient_user_id, template_key, payload, idempotency_key)
    values ('ielts_manual_payment_rejected', 'billing', 'student', p.user_id, 'ielts_manual_payment_rejected',
            jsonb_build_object('payment_id', p.id, 'plan', p.plan, 'amount_som', p.amount_som,
                               'note', nullif(left(trim(coalesce(p_note, '')), 500), '')),
            'ielts-manual-payment-rejected-' || p.id)
    on conflict (idempotency_key) do nothing;
    return jsonb_build_object('status', 'rejected');
  end if;

  -- A renewal starts when the current manual period ends, so paying early never loses days.
  select greatest(now(), coalesce(max(s.current_period_end), now())) into v_start
  from public.ielts_prime_subscriptions s
  where s.user_id = p.user_id and s.provider = 'manual' and s.status = 'active';
  v_end := v_start + case p.plan when 'monthly' then interval '1 month'
                                 when 'quarterly' then interval '3 months'
                                 else interval '1 year' end;

  insert into public.ielts_prime_subscriptions (user_id, provider, plan, status, current_period_start, current_period_end, last_event_at)
  values (p.user_id, 'manual', p.plan, 'active', v_start, v_end, now())
  returning id into v_sub;

  update public.ielts_manual_payments
     set status = 'approved', review_note = nullif(left(trim(coalesce(p_note, '')), 500), ''),
         reviewed_by = v_actor, reviewed_at = now(), subscription_id = v_sub, updated_at = now()
   where id = p_id;

  insert into public.transactional_email_outbox (event_type, category, audience, recipient_user_id, template_key, payload, idempotency_key)
  values ('ielts_manual_payment_approved', 'billing', 'student', p.user_id, 'ielts_manual_payment_approved',
          jsonb_build_object('payment_id', p.id, 'plan', p.plan, 'amount_som', p.amount_som, 'ends_at', v_end),
          'ielts-manual-payment-approved-' || p.id)
  on conflict (idempotency_key) do nothing;

  return jsonb_build_object('status', 'approved', 'ends_at', v_end);
end;
$$;
revoke all on function public.rpc_ielts_manual_payment_review(uuid, boolean, text) from public, anon;
grant execute on function public.rpc_ielts_manual_payment_review(uuid, boolean, text) to authenticated;

create or replace function public.rpc_ielts_manual_payment_settings_save(p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if not public.is_superadmin(v_actor) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if jsonb_typeof(p_settings) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_settings';
  end if;
  update public.ielts_manual_payment_settings s set
    enabled = coalesce((p_settings->>'enabled')::boolean, s.enabled),
    bank_label = coalesce(nullif(left(trim(p_settings->>'bank_label'), 60), ''), s.bank_label),
    recipient_name = case when p_settings ? 'recipient_name' then nullif(left(trim(p_settings->>'recipient_name'), 120), '') else s.recipient_name end,
    recipient_phone = case when p_settings ? 'recipient_phone' then nullif(left(trim(p_settings->>'recipient_phone'), 40), '') else s.recipient_phone end,
    instructions = case when p_settings ? 'instructions' then nullif(left(trim(p_settings->>'instructions'), 600), '') else s.instructions end,
    price_monthly_som = coalesce((p_settings->>'price_monthly_som')::integer, s.price_monthly_som),
    price_quarterly_som = coalesce((p_settings->>'price_quarterly_som')::integer, s.price_quarterly_som),
    price_yearly_som = coalesce((p_settings->>'price_yearly_som')::integer, s.price_yearly_som),
    updated_at = now(), updated_by = v_actor
  where s.singleton;
  return (select to_jsonb(s) - 'singleton' - 'updated_by' from public.ielts_manual_payment_settings s where s.singleton);
end;
$$;
revoke all on function public.rpc_ielts_manual_payment_settings_save(jsonb) from public, anon;
grant execute on function public.rpc_ielts_manual_payment_settings_save(jsonb) to authenticated;

-- Internal check used by scheduled jobs (no signed-in user): same rules as has_active_ielts_prime_subscription.
create or replace function private.ielts_user_has_active_prime(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.ielts_prime_subscriptions s
    where s.user_id = p_user_id
      and ((s.provider = 'google_play' and s.status in ('active', 'cancelled', 'grace') and s.current_period_end > now())
        or (s.provider = 'paddle' and (s.status in ('active', 'trialing') or (s.status = 'cancelled' and s.current_period_end > now())))
        or (s.provider = 'manual' and s.status = 'active' and s.current_period_end > now()))
  );
$$;
revoke all on function private.ielts_user_has_active_prime(uuid) from public, anon, authenticated;

-- 4. Follow-up emails after the free unit ----------------------------------------------------------------------
-- Learners without a school and without Prime get three short Russian emails: about a day, three days and a week
-- after they start. Each goes once (idempotency key), only to a verified address, and the dispatcher skips anyone
-- who turned these emails off (category 'reminders') or is on the suppression list. Runs at 10:00 and 16:00 Bishkek.
create or replace function private.enqueue_ielts_learner_nudges()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_rows integer;
  v_step record;
begin
  for v_step in
    select * from (values ('d1', interval '20 hours', interval '72 hours'),
                          ('d3', interval '3 days', interval '6 days'),
                          ('d7', interval '7 days', interval '10 days')) as t(step, min_age, max_age)
  loop
    insert into public.transactional_email_outbox (event_type, category, audience, recipient_user_id, template_key, payload, idempotency_key)
    select 'ielts_learner_nudge', 'reminders', 'student', h.user_id, 'ielts_learner_nudge',
           jsonb_build_object(
             'step', v_step.step,
             'cleared_unit1', exists (select 1 from public.ielts_course_progress pr
                                      join public.ielts_course_units cu on cu.id = pr.unit_id and cu.position = 1
                                      where pr.user_id = h.user_id and pr.completed_at is not null),
             'started', exists (select 1 from public.ielts_course_progress pr
                                where pr.user_id = h.user_id and pr.lesson_viewed_at is not null),
             'name', coalesce(u.raw_user_meta_data->>'given_name', split_part(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''), ' ', 1)),
             'local_payment', (select st.enabled and nullif(trim(st.recipient_phone), '') is not null from public.ielts_manual_payment_settings st where st.singleton),
             'local_bank', (select st.bank_label from public.ielts_manual_payment_settings st where st.singleton),
             'price_monthly_som', (select st.price_monthly_som from public.ielts_manual_payment_settings st where st.singleton)),
           'ielts-nudge-' || v_step.step || '-' || h.user_id
    from private.ielts_course_habits h
    join auth.users u on u.id = h.user_id and (u.email_confirmed_at is not null)
    where h.created_at <= now() - v_step.min_age
      and h.created_at > now() - v_step.max_age
      and not exists (select 1 from public.school_members sm where sm.user_id = h.user_id and sm.status = 'active')
      and not private.ielts_user_has_active_prime(h.user_id)
      and not exists (select 1 from public.ielts_users iu where iu.id = h.user_id and iu.tier in ('prime_prep_user', 'admin', 'pro'))
      and not exists (select 1 from public.ielts_manual_payments mp where mp.user_id = h.user_id and mp.status = 'pending')
      and not public.is_superadmin(h.user_id)
    on conflict (idempotency_key) do nothing;
    get diagnostics v_rows = row_count;
    v_count := v_count + v_rows;
  end loop;
  return v_count;
end;
$$;
revoke all on function private.enqueue_ielts_learner_nudges() from public, anon, authenticated;

-- 5. Owner growth snapshot (also used by the owner's daily report) ---------------------------------------------
create or replace function private.ielts_growth_report_internal(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
  v_campaigns jsonb;
  v_daily jsonb;
  v_totals jsonb;
begin
  with visits as (
    select coalesce(nullif(v.utm->>'utm_campaign', ''), nullif(v.utm->>'utm_source', ''), '(direct or unknown)') as campaign,
           nullif(v.utm->>'utm_source', '') as source,
           v.visitor_id
    from site_analytics.visits v
    where v.created_at >= v_since and v.path = '/ielts-prep'
  ), learners as (
    select h.user_id,
           coalesce(nullif(h.acquisition->>'utm_campaign', ''), nullif(h.acquisition->>'utm_source', ''), '(direct or unknown)') as campaign,
           nullif(h.acquisition->>'utm_source', '') as source,
           exists (select 1 from public.ielts_course_progress p where p.user_id = h.user_id and p.lesson_viewed_at is not null) as started,
           exists (select 1 from public.ielts_course_progress p
                   join public.ielts_course_units u on u.id = p.unit_id and u.position = 1
                   where p.user_id = h.user_id and p.completed_at is not null) as cleared,
           exists (select 1 from public.ielts_prime_subscriptions s where s.user_id = h.user_id and s.created_at >= v_since) as paid
    from private.ielts_course_habits h
    where h.created_at >= v_since
      and not exists (select 1 from public.school_members sm where sm.user_id = h.user_id and sm.status = 'active')
  ), names as (
    select campaign from visits union select campaign from learners
  )
  select coalesce(jsonb_agg(row order by (row->>'visitors')::int desc, (row->>'signups')::int desc), '[]'::jsonb) into v_campaigns
  from (
    select jsonb_build_object(
      'campaign', n.campaign,
      'source', coalesce((select min(v.source) from visits v where v.campaign = n.campaign), (select min(l.source) from learners l where l.campaign = n.campaign)),
      'visitors', (select count(distinct v.visitor_id) from visits v where v.campaign = n.campaign),
      'signups', (select count(*) from learners l where l.campaign = n.campaign),
      'started', (select count(*) from learners l where l.campaign = n.campaign and l.started),
      'cleared', (select count(*) from learners l where l.campaign = n.campaign and l.cleared),
      'paid', (select count(*) from learners l where l.campaign = n.campaign and l.paid)) as row
    from names n
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'visitors', d.visitors, 'signups', d.signups) order by d.day), '[]'::jsonb) into v_daily
  from (
    select g.day::date as day,
      (select count(distinct v.visitor_id) from site_analytics.visits v
        where v.path = '/ielts-prep' and (v.created_at at time zone 'Asia/Bishkek')::date = g.day::date) as visitors,
      (select count(*) from private.ielts_course_habits h
        where (h.created_at at time zone 'Asia/Bishkek')::date = g.day::date
          and not exists (select 1 from public.school_members sm where sm.user_id = h.user_id and sm.status = 'active')) as signups
    from generate_series((v_since at time zone 'Asia/Bishkek')::date, (now() at time zone 'Asia/Bishkek')::date, interval '1 day') g(day)
  ) d;

  select jsonb_build_object(
    'visitors', coalesce(sum((c->>'visitors')::int), 0),
    'signups', coalesce(sum((c->>'signups')::int), 0),
    'started', coalesce(sum((c->>'started')::int), 0),
    'cleared', coalesce(sum((c->>'cleared')::int), 0),
    'paid', coalesce(sum((c->>'paid')::int), 0),
    'active_prime', (select count(distinct s.user_id) from public.ielts_prime_subscriptions s
                     where (s.provider = 'manual' and s.status = 'active' and s.current_period_end > now())
                        or (s.provider <> 'manual' and (s.status in ('active', 'trialing')
                            or (s.status in ('cancelled', 'grace') and s.current_period_end > now())))),
    'pending_local_payments', (select count(*) from public.ielts_manual_payments mp where mp.status = 'pending'))
  into v_totals
  from jsonb_array_elements(v_campaigns) c;

  return jsonb_build_object('days', greatest(1, least(coalesce(p_days, 30), 365)), 'totals', v_totals, 'campaigns', v_campaigns, 'daily', v_daily);
end;
$$;
revoke all on function private.ielts_growth_report_internal(integer) from public, anon, authenticated;

create or replace function public.rpc_ielts_growth_report(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_superadmin((select auth.uid())) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  return private.ielts_growth_report_internal(p_days);
end;
$$;
revoke all on function public.rpc_ielts_growth_report(integer) from public, anon;
grant execute on function public.rpc_ielts_growth_report(integer) to authenticated;

-- 6. Schedule the follow-up emails (10:00 and 16:00 Bishkek = 04:00 and 10:00 UTC) ----------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'ielts-learner-nudges';
    perform cron.schedule('ielts-learner-nudges', '0 4,10 * * *', 'select private.enqueue_ielts_learner_nudges();');
  end if;
end;
$$;

-- 7. IELTS learner emails get their own sender (ielts_learner_email_dispatcher) ------------------------------------
-- The school dispatcher keeps every other template; these four go only to the learner sender, so a problem in one
-- can never block the other.
create or replace function public.rpc_claim_transactional_email_outbox(p_limit integer default 50)
returns setof public.transactional_email_outbox
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    select q.id
    from public.transactional_email_outbox q
    where q.status in ('pending','delayed')
      and q.available_at <= now()
      and coalesce(q.next_attempt_at, q.available_at) <= now()
      and q.template_key not in ('ielts_learner_nudge', 'ielts_manual_payment_approved', 'ielts_manual_payment_rejected', 'owner_ielts_manual_payment')
    order by q.available_at, q.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit,50),100))
  )
  update public.transactional_email_outbox q
  set status='processing', attempts=q.attempts+1, updated_at=now()
  from claimed c where q.id=c.id
  returning q.*;
$$;
revoke all on function public.rpc_claim_transactional_email_outbox(integer) from public, anon, authenticated;
grant execute on function public.rpc_claim_transactional_email_outbox(integer) to service_role;

create or replace function public.rpc_claim_ielts_learner_outbox(p_limit integer default 40)
returns setof public.transactional_email_outbox
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    select q.id
    from public.transactional_email_outbox q
    where q.status in ('pending','delayed')
      and q.available_at <= now()
      and coalesce(q.next_attempt_at, q.available_at) <= now()
      and q.template_key in ('ielts_learner_nudge', 'ielts_manual_payment_approved', 'ielts_manual_payment_rejected', 'owner_ielts_manual_payment')
    order by q.available_at, q.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit,40),100))
  )
  update public.transactional_email_outbox q
  set status='processing', attempts=q.attempts+1, updated_at=now()
  from claimed c where q.id=c.id
  returning q.*;
$$;
revoke all on function public.rpc_claim_ielts_learner_outbox(integer) from public, anon, authenticated;
grant execute on function public.rpc_claim_ielts_learner_outbox(integer) to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'ielts-learner-email-dispatcher';
    perform cron.schedule('ielts-learner-email-dispatcher', '* * * * *', $cmd$
      select net.http_post(
        url := (select replace(function_url, 'school_email_dispatcher', 'ielts_learner_email_dispatcher') from public.school_email_dispatch_config where singleton = true),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-school-email-dispatch-key', (select dispatch_key from public.school_email_dispatch_config where singleton = true)),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000)
      where exists (select 1 from public.transactional_email_outbox q
                    where q.status in ('pending', 'delayed')
                      and q.template_key in ('ielts_learner_nudge', 'ielts_manual_payment_approved', 'ielts_manual_payment_rejected', 'owner_ielts_manual_payment'));
    $cmd$);
  end if;
end;
$$;
