-- Professional school billing activation and capacity governance.
--
-- This closes the commercial gap between an accepted Billing Studio quote,
-- verified payment, the active agreement, and every contractual capacity.
-- Existing IELTS Prime records and legacy school subscriptions are preserved.

-- ---------------------------------------------------------------------------
-- Quote, subscription, payment-attempt and scheduled-amendment state.
-- ---------------------------------------------------------------------------

alter table public.school_billing_quotes
  add column if not exists payment_status text not null default 'not_started',
  add column if not exists selected_payment_method text,
  add column if not exists agreement_kind text,
  add column if not exists effective_at timestamptz,
  add column if not exists quote_hash text,
  add column if not exists superseded_by_quote_id uuid references public.school_billing_quotes(id) on delete set null,
  add column if not exists scheduled_at timestamptz;

alter table public.school_billing_quotes
  drop constraint if exists school_billing_quotes_status_check;
alter table public.school_billing_quotes
  add constraint school_billing_quotes_status_check check (status in (
    'draft','submitted','revision_requested','approved','accepted','payment_pending',
    'payment_failed','scheduled','active','superseded','rejected','expired','cancelled'
  ));
alter table public.school_billing_quotes
  drop constraint if exists school_billing_quotes_payment_status_check;
alter table public.school_billing_quotes
  add constraint school_billing_quotes_payment_status_check check (payment_status in (
    'not_started','not_required_yet','pending','checkout_created','invoice_issued',
    'paid','failed','expired','cancelled','waived'
  ));
alter table public.school_billing_quotes
  drop constraint if exists school_billing_quotes_payment_method_check;
alter table public.school_billing_quotes
  add constraint school_billing_quotes_payment_method_check check (
    selected_payment_method is null or selected_payment_method in (
      'paddle_checkout','paddle_invoice','bank_transfer','cash','complimentary'
    )
  );
alter table public.school_billing_quotes
  drop constraint if exists school_billing_quotes_agreement_kind_check;
alter table public.school_billing_quotes
  add constraint school_billing_quotes_agreement_kind_check check (
    agreement_kind is null or agreement_kind in ('new_agreement','upgrade','renewal_change')
  );

alter table public.school_billing_quote_events
  drop constraint if exists school_billing_quote_events_event_type_check;
alter table public.school_billing_quote_events
  add constraint school_billing_quote_events_event_type_check check (event_type in (
    'created','saved','submitted','revision_requested','approved','accepted',
    'payment_selected','payment_pending','payment_failed','payment_received',
    'scheduled','activated','superseded','rejected','expired','cancelled'
  ));

-- Resolve historical overlap before enforcing one commercial decision per school.
with ranked as (
  select id,school_id,row_number() over(partition by school_id order by accepted_at desc nulls last,updated_at desc,id desc) position
  from public.school_billing_quotes
  where status in ('accepted','payment_pending','payment_failed','scheduled') and activated_at is null
)
update public.school_billing_quotes q
set status='superseded',payment_status='cancelled',updated_at=now()
from ranked r where q.id=r.id and r.position>1;

create unique index if not exists school_billing_quotes_one_live_decision_idx
  on public.school_billing_quotes(school_id)
  where status in ('accepted','payment_pending','payment_failed','scheduled') and activated_at is null;
create index if not exists school_billing_quotes_effective_idx
  on public.school_billing_quotes(status,effective_at)
  where status in ('scheduled','payment_pending');

alter table public.billing_subscriptions
  add column if not exists source_quote_id uuid references public.school_billing_quotes(id) on delete set null,
  add column if not exists contract_term text,
  add column if not exists capacity jsonb not null default '{}'::jsonb,
  add column if not exists provider_transaction_id text,
  add column if not exists invoice_status text;
alter table public.billing_subscriptions
  drop constraint if exists billing_subscriptions_contract_term_check;
alter table public.billing_subscriptions
  add constraint billing_subscriptions_contract_term_check check (
    contract_term is null or contract_term in ('monthly','annual','two_year','three_year')
  );
alter table public.billing_subscriptions
  drop constraint if exists billing_subscriptions_invoice_status_check;
alter table public.billing_subscriptions
  add constraint billing_subscriptions_invoice_status_check check (
    invoice_status is null or invoice_status in ('draft','issued','due','paid','overdue','void')
  );
create unique index if not exists billing_subscriptions_provider_transaction_uidx
  on public.billing_subscriptions(provider,provider_transaction_id)
  where provider_transaction_id is not null;
create index if not exists billing_subscriptions_source_quote_idx
  on public.billing_subscriptions(source_quote_id)
  where source_quote_id is not null;

create table if not exists public.school_billing_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.school_billing_quotes(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  method text not null check (method in ('paddle_checkout','paddle_invoice','bank_transfer','cash','complimentary')),
  status text not null default 'pending' check (status in (
    'pending','checkout_created','invoice_issued','paid','failed','expired','cancelled','waived'
  )),
  provider text not null default 'manual' check (provider in ('manual','paddle')),
  provider_transaction_id text,
  provider_subscription_id text,
  provider_customer_id text,
  amount_minor bigint,
  currency text,
  reference text,
  invoice_url text,
  requested_by uuid references public.users(id) on delete set null,
  verified_by uuid references public.users(id) on delete set null,
  verified_at timestamptz,
  paid_at timestamptz,
  failure_code text,
  failure_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists school_billing_payment_provider_transaction_uidx
  on public.school_billing_payment_attempts(provider,provider_transaction_id)
  where provider_transaction_id is not null;
create unique index if not exists school_billing_payment_one_open_idx
  on public.school_billing_payment_attempts(quote_id)
  where status in ('pending','checkout_created','invoice_issued');
create index if not exists school_billing_payment_school_status_idx
  on public.school_billing_payment_attempts(school_id,status,created_at desc);
alter table public.school_billing_payment_attempts enable row level security;
revoke all on public.school_billing_payment_attempts from public,anon,authenticated;
grant select on public.school_billing_payment_attempts to authenticated;
grant all on public.school_billing_payment_attempts to service_role;
drop policy if exists school_heads_read_billing_payment_attempts on public.school_billing_payment_attempts;
create policy school_heads_read_billing_payment_attempts
  on public.school_billing_payment_attempts for select to authenticated
  using (public.is_school_owner(school_id) or public.is_superadmin((select auth.uid())));

create table if not exists public.school_capacity_amendments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  quote_id uuid not null unique references public.school_billing_quotes(id) on delete cascade,
  payment_attempt_id uuid references public.school_billing_payment_attempts(id) on delete set null,
  target_capacity jsonb not null,
  effective_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','applying','applied','blocked','cancelled')),
  attempts integer not null default 0 check (attempts>=0),
  last_error text,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists school_capacity_amendments_due_idx
  on public.school_capacity_amendments(status,effective_at)
  where status in ('scheduled','blocked');
alter table public.school_capacity_amendments enable row level security;
revoke all on public.school_capacity_amendments from public,anon,authenticated;
grant select on public.school_capacity_amendments to authenticated;
grant all on public.school_capacity_amendments to service_role;
drop policy if exists school_heads_read_capacity_amendments on public.school_capacity_amendments;
create policy school_heads_read_capacity_amendments
  on public.school_capacity_amendments for select to authenticated
  using (public.is_school_owner(school_id) or public.is_superadmin((select auth.uid())));

-- Every contractual product now has a real capacity field.
alter table public.school_module_entitlements
  drop constraint if exists school_module_entitlements_seat_limit_check;
alter table public.school_module_entitlements
  add constraint school_module_entitlements_seat_limit_check check (seat_limit is null or seat_limit>0);

-- Paddle catalogue bindings are versioned with the authoritative price catalogue.
-- Keys are contract terms and values are Paddle price IDs. Term discounts should
-- be represented by the bound Paddle prices; any composite discount is selected
-- from billing_pricing_versions.paddle_discount_ids.
alter table public.billing_price_items
  add column if not exists paddle_price_ids jsonb not null default '{}'::jsonb;
alter table public.billing_pricing_versions
  add column if not exists paddle_discount_ids jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- Platform and Admission Hub capacity enforcement.
-- ---------------------------------------------------------------------------

create table if not exists public.school_admission_seat_consumptions (
  id bigint generated always as identity primary key,
  school_id uuid not null references public.schools(id) on delete cascade,
  candidate_id uuid not null,
  entitlement_id uuid references public.school_module_entitlements(id) on delete set null,
  period_start timestamptz not null,
  period_end timestamptz,
  consumed_at timestamptz not null default now(),
  source text not null default 'candidate_registration',
  unique(school_id,candidate_id,period_start)
);
create index if not exists school_admission_consumption_period_idx
  on public.school_admission_seat_consumptions(school_id,period_start,consumed_at);
alter table public.school_admission_seat_consumptions enable row level security;
revoke all on public.school_admission_seat_consumptions from public,anon,authenticated;
grant select on public.school_admission_seat_consumptions to authenticated;
grant all on public.school_admission_seat_consumptions to service_role;
grant usage,select on sequence public.school_admission_seat_consumptions_id_seq to service_role;
drop policy if exists school_heads_read_admission_capacity_usage on public.school_admission_seat_consumptions;
create policy school_heads_read_admission_capacity_usage
  on public.school_admission_seat_consumptions for select to authenticated
  using (public.is_school_owner(school_id) or public.is_superadmin((select auth.uid())));

create or replace function private.enforce_school_student_capacity()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_limit integer; v_used integer;
begin
  if new.role_in_school<>'student' or new.status<>'active' then return new; end if;
  if tg_op='UPDATE' and old.school_id=new.school_id and old.role_in_school='student' and old.status='active' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.school_id::text||':platform-capacity',0));
  select case when coalesce(s.settings->>'max_students','')~'^[0-9]+$' then (s.settings->>'max_students')::integer else null end
    into v_limit from public.schools s where s.id=new.school_id;
  if v_limit is null then return new; end if;
  select count(*)::integer into v_used from public.school_members sm
  where sm.school_id=new.school_id and sm.status='active' and sm.role_in_school='student'
    and sm.id is distinct from new.id;
  if v_used>=v_limit then
    raise exception using errcode='P0001',message='platform_student_capacity_reached',
      detail=format('%s of %s platform student seats are already in use.',v_used,v_limit);
  end if;
  return new;
end; $$;
revoke all on function private.enforce_school_student_capacity() from public,anon,authenticated,service_role;
drop trigger if exists enforce_school_student_capacity on public.school_members;
create trigger enforce_school_student_capacity
before insert or update of school_id,role_in_school,status on public.school_members
for each row execute function private.enforce_school_student_capacity();

create or replace function private.consume_admission_candidate_capacity()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_entitlement public.school_module_entitlements%rowtype; v_used integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.school_id::text||':admissions-capacity',0));
  select * into v_entitlement from public.school_module_entitlements e
  where e.school_id=new.school_id and e.module_key='admissions' and e.enabled
    and e.seat_limit is not null and e.starts_at<=now() and (e.ends_at is null or e.ends_at>now())
  for update;
  if v_entitlement.id is null then return new; end if;
  select count(*)::integer into v_used from public.school_admission_seat_consumptions c
  where c.school_id=new.school_id and c.period_start=v_entitlement.starts_at
    and (c.period_end is null or c.period_end>now());
  if v_used>=v_entitlement.seat_limit then
    raise exception using errcode='P0001',message='admission_candidate_capacity_reached',
      detail=format('%s of %s Admission Hub candidate seats are already used for this agreement period.',v_used,v_entitlement.seat_limit);
  end if;
  insert into public.school_admission_seat_consumptions(
    school_id,candidate_id,entitlement_id,period_start,period_end
  ) values(new.school_id,new.id,v_entitlement.id,v_entitlement.starts_at,v_entitlement.ends_at)
  on conflict do nothing;
  return new;
end; $$;
revoke all on function private.consume_admission_candidate_capacity() from public,anon,authenticated,service_role;
drop trigger if exists consume_admission_candidate_capacity on public.adm_candidates;
create trigger consume_admission_candidate_capacity
before insert on public.adm_candidates for each row execute function private.consume_admission_candidate_capacity();

-- ---------------------------------------------------------------------------
-- Capacity helpers and quote acceptance/payment selection.
-- ---------------------------------------------------------------------------

create or replace function private.school_quote_capacity(p_quote public.school_billing_quotes)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object(
    'platform',p_quote.platform_seats,'core',p_quote.platform_seats,
    'cambridge',p_quote.cambridge_seats,'ielts',p_quote.ielts_seats,
    'writing',p_quote.writing_seats,'admissions',p_quote.admissions_candidates
  );
$$;
revoke all on function private.school_quote_capacity(public.school_billing_quotes) from public,anon,authenticated,service_role;

create or replace function private.school_quote_integrity_hash(p_quote public.school_billing_quotes)
returns text language sql immutable set search_path='' as $$
  select encode(extensions.digest(convert_to(concat_ws('|',
    p_quote.id::text,p_quote.school_id::text,p_quote.pricing_version_code,p_quote.contract_term,
    p_quote.platform_seats::text,p_quote.cambridge_seats::text,p_quote.ielts_seats::text,
    p_quote.writing_seats::text,p_quote.admissions_candidates::text,
    coalesce(p_quote.calculation#>>'{totals,contract_total_minor}',''),
    coalesce(p_quote.calculation#>>'{pricing_version,currency}','')
  ),'UTF8'),'sha256'),'hex');
$$;
revoke all on function private.school_quote_integrity_hash(public.school_billing_quotes) from public,anon,authenticated,service_role;

create or replace function private.school_current_capacity(p_school_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'platform',case when coalesce(s.settings->>'max_students','')~'^[0-9]+$' then (s.settings->>'max_students')::integer else 0 end,
    'core',case when coalesce(s.settings->>'max_students','')~'^[0-9]+$' then (s.settings->>'max_students')::integer else 0 end,
    'cambridge',coalesce((select e.seat_limit from public.school_module_entitlements e where e.school_id=s.id and e.module_key='cambridge' and e.enabled),0),
    'ielts',coalesce((select e.seat_limit from public.school_module_entitlements e where e.school_id=s.id and e.module_key='ielts' and e.enabled),0),
    'writing',coalesce((select e.seat_limit from public.school_module_entitlements e where e.school_id=s.id and e.module_key='writing' and e.enabled),0),
    'admissions',coalesce((select e.seat_limit from public.school_module_entitlements e where e.school_id=s.id and e.module_key='admissions' and e.enabled),0)
  ) from public.schools s where s.id=p_school_id;
$$;
revoke all on function private.school_current_capacity(uuid) from public,anon,authenticated,service_role;

create or replace function public.school_head_accept_billing_quote(p_quote_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=(select auth.uid()); v_quote public.school_billing_quotes%rowtype;
  v_current jsonb; v_target jsonb; v_active public.billing_subscriptions%rowtype;
  v_kind text; v_effective timestamptz; v_hash text; v_other record;
begin
  select * into v_quote from public.school_billing_quotes where id=p_quote_id for update;
  if v_actor is null or v_quote.id is null or not public.is_school_owner(v_quote.school_id) then
    raise exception using errcode='42501',message='school_head_access_required';
  end if;
  if v_quote.status<>'approved' or v_quote.expires_at is null or v_quote.expires_at<=now() then
    return jsonb_build_object('success',false,'error','Only a current approved quote can be accepted.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_quote.school_id::text||':billing-decision',0));
  select * into v_active from public.billing_subscriptions b
  where b.school_id=v_quote.school_id and b.status in ('active','trialing','past_due')
    and (b.current_period_end is null or b.current_period_end>now())
  order by b.updated_at desc,b.created_at desc limit 1;
  v_current:=coalesce(private.school_current_capacity(v_quote.school_id),'{}'::jsonb);
  v_target:=private.school_quote_capacity(v_quote);
  if v_active.id is null then
    v_kind:='new_agreement'; v_effective:=now();
  elsif (v_target->>'platform')::integer<(v_current->>'platform')::integer
     or (v_target->>'cambridge')::integer<(v_current->>'cambridge')::integer
     or (v_target->>'ielts')::integer<(v_current->>'ielts')::integer
     or (v_target->>'writing')::integer<(v_current->>'writing')::integer
     or (v_target->>'admissions')::integer<(v_current->>'admissions')::integer then
    v_kind:='renewal_change';
    v_effective:=coalesce(v_active.current_period_end,now()+interval '30 days');
  else
    v_kind:='upgrade'; v_effective:=now();
  end if;
  v_hash:=private.school_quote_integrity_hash(v_quote);

  for v_other in
    select * from public.school_billing_quotes q
    where q.school_id=v_quote.school_id and q.id<>v_quote.id and q.activated_at is null
      and q.status in ('submitted','approved','accepted','payment_pending','payment_failed','scheduled')
    for update
  loop
    update public.school_billing_quotes set status='superseded',payment_status='cancelled',
      superseded_by_quote_id=v_quote.id,updated_at=now() where id=v_other.id;
    update public.school_billing_payment_attempts set status='cancelled',updated_at=now()
      where quote_id=v_other.id and status in ('pending','checkout_created','invoice_issued');
    insert into public.school_billing_quote_events(
      quote_id,school_id,actor_user_id,event_type,from_status,to_status,note,snapshot
    ) values(v_other.id,v_other.school_id,v_actor,'superseded',v_other.status,'superseded',
      'Superseded when the School Head accepted another approved proposal.',
      jsonb_build_object('superseded_by_quote_id',v_quote.id));
  end loop;

  update public.school_billing_quotes set
    status=case when v_kind='renewal_change' then 'scheduled' else 'accepted' end,
    payment_status=case when v_kind='renewal_change' then 'not_required_yet' else 'not_started' end,
    accepted_at=now(),scheduled_at=case when v_kind='renewal_change' then now() else null end,
    agreement_kind=v_kind,effective_at=v_effective,quote_hash=v_hash,updated_at=now()
  where id=v_quote.id returning * into v_quote;
  insert into public.school_billing_quote_events(
    quote_id,school_id,actor_user_id,event_type,from_status,to_status,note,snapshot
  ) values(v_quote.id,v_quote.school_id,v_actor,'accepted','approved',v_quote.status,
    case when v_kind='renewal_change' then 'Accepted for renewal. Current capacities remain unchanged until the effective date.'
      else 'Accepted by School Head. Verified payment is required before activation.' end,
    jsonb_build_object('agreement_kind',v_kind,'effective_at',v_effective,'capacity',v_target,'quote_hash',v_hash));
  return jsonb_build_object('success',true,'quote',to_jsonb(v_quote),'agreement_kind',v_kind,'effective_at',v_effective);
end; $$;
revoke all on function public.school_head_accept_billing_quote(uuid) from public,anon,authenticated,service_role;
grant execute on function public.school_head_accept_billing_quote(uuid) to authenticated;

create or replace function public.school_head_choose_quote_payment(p_quote_id uuid,p_method text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=(select auth.uid()); v_quote public.school_billing_quotes%rowtype; v_attempt public.school_billing_payment_attempts%rowtype;
begin
  select * into v_quote from public.school_billing_quotes where id=p_quote_id for update;
  if v_actor is null or v_quote.id is null or not public.is_school_owner(v_quote.school_id) then
    raise exception using errcode='42501',message='school_head_access_required';
  end if;
  if p_method not in ('paddle_checkout','paddle_invoice','bank_transfer','cash') then
    return jsonb_build_object('success',false,'error','Choose online payment, a Paddle invoice, bank transfer, or cash.');
  end if;
  if v_quote.status not in ('accepted','payment_failed','scheduled') or v_quote.activated_at is not null then
    return jsonb_build_object('success',false,'error','This quote is not awaiting a payment decision.');
  end if;
  if v_quote.status='scheduled' and v_quote.effective_at>now()+interval '30 days' then
    return jsonb_build_object('success',false,'error','This renewal change is scheduled. Payment opens 30 days before it takes effect.');
  end if;
  update public.school_billing_payment_attempts set status='cancelled',updated_at=now()
    where quote_id=v_quote.id and status in ('pending','checkout_created','invoice_issued');
  insert into public.school_billing_payment_attempts(
    quote_id,school_id,method,status,provider,amount_minor,currency,requested_by
  ) values(
    v_quote.id,v_quote.school_id,p_method,'pending',
    case when p_method like 'paddle_%' then 'paddle' else 'manual' end,
    (v_quote.calculation#>>'{totals,contract_total_minor}')::bigint,
    upper(v_quote.calculation#>>'{pricing_version,currency}'),v_actor
  ) returning * into v_attempt;
  update public.school_billing_quotes set status='payment_pending',payment_status='pending',
    selected_payment_method=p_method,updated_at=now() where id=v_quote.id returning * into v_quote;
  insert into public.school_billing_quote_events(
    quote_id,school_id,actor_user_id,event_type,from_status,to_status,note,snapshot
  ) values(v_quote.id,v_quote.school_id,v_actor,'payment_selected','accepted','payment_pending',
    'School Head selected a payment route.',jsonb_build_object('method',p_method,'attempt_id',v_attempt.id));
  return jsonb_build_object('success',true,'quote',to_jsonb(v_quote),'payment_attempt_id',v_attempt.id,'payment_attempt',to_jsonb(v_attempt));
end; $$;
revoke all on function public.school_head_choose_quote_payment(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.school_head_choose_quote_payment(uuid,text) to authenticated;

-- ---------------------------------------------------------------------------
-- Atomic activation shared by verified manual payments and Paddle webhooks.
-- ---------------------------------------------------------------------------

create or replace function private.activate_school_quote_now(
  p_quote_id uuid,p_payment_attempt_id uuid,p_provider text,p_payment_method text,
  p_amount_minor bigint,p_currency text,p_reference text,p_period_start timestamptz,
  p_period_end timestamptz,p_provider_customer_id text,p_provider_subscription_id text,
  p_provider_transaction_id text,p_actor uuid,p_notes text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_quote public.school_billing_quotes%rowtype; v_attempt public.school_billing_payment_attempts%rowtype;
  v_subscription uuid; v_existing public.billing_subscriptions%rowtype; v_modules text[]:=array['core']::text[];
  v_module text; v_limit integer; v_used integer; v_start timestamptz:=coalesce(p_period_start,now());
  v_end timestamptz; v_months integer; v_capacity jsonb; v_source text;
begin
  select * into v_quote from public.school_billing_quotes where id=p_quote_id for update;
  if v_quote.id is null or v_quote.activated_at is not null or v_quote.status not in ('accepted','payment_pending','payment_failed','scheduled') then
    return jsonb_build_object('success',false,'error','The quote is not eligible for activation.');
  end if;
  if v_quote.quote_hash is null or v_quote.quote_hash<>private.school_quote_integrity_hash(v_quote) then
    raise exception using errcode='P0001',message='accepted_quote_integrity_check_failed';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_quote.school_id::text||':billing-activation',0));
  v_months:=case v_quote.contract_term when 'monthly' then 1 when 'annual' then 12 when 'two_year' then 24 else 36 end;
  v_end:=coalesce(p_period_end,v_start+make_interval(months=>v_months));
  if v_end<=v_start then raise exception using errcode='P0001',message='invalid_agreement_period'; end if;
  v_capacity:=private.school_quote_capacity(v_quote);
  v_source:=case when p_provider='paddle' then 'paddle' when p_payment_method='complimentary' then 'complimentary' else 'manual_payment' end;

  select count(*)::integer into v_used from public.school_members sm
    where sm.school_id=v_quote.school_id and sm.status='active' and sm.role_in_school='student';
  if v_used>v_quote.platform_seats then
    raise exception using errcode='P0001',message='platform_capacity_below_current_students',
      detail=format('%s active students require at least %s platform seats.',v_used,v_used);
  end if;
  foreach v_module in array array['cambridge','ielts','writing']::text[] loop
    v_limit:=case v_module when 'cambridge' then v_quote.cambridge_seats when 'ielts' then v_quote.ielts_seats else v_quote.writing_seats end;
    select count(*)::integer into v_used from public.school_programme_seat_assignments a
      where a.school_id=v_quote.school_id and a.module_key=v_module
        and (a.released_at is null or a.cooldown_until>now());
    if v_used>v_limit then
      raise exception using errcode='P0001',message='programme_capacity_below_committed_seats',
        detail=format('%s has %s committed seats but the quote contains %s.',initcap(v_module),v_used,v_limit);
    end if;
  end loop;
  select count(*)::integer into v_used from public.adm_candidates c where c.school_id=v_quote.school_id;
  if v_quote.admissions_candidates>0 and v_used>v_quote.admissions_candidates then
    raise exception using errcode='P0001',message='admissions_capacity_below_current_candidates',
      detail=format('%s existing candidates require at least %s Admission Hub seats.',v_used,v_used);
  end if;

  if v_quote.effective_at is not null and v_quote.effective_at>now()+interval '1 minute' then
    insert into public.school_capacity_amendments(
      school_id,quote_id,payment_attempt_id,target_capacity,effective_at,status
    ) values(v_quote.school_id,v_quote.id,p_payment_attempt_id,v_capacity,v_quote.effective_at,'scheduled')
    on conflict(quote_id) do update set payment_attempt_id=excluded.payment_attempt_id,
      target_capacity=excluded.target_capacity,effective_at=excluded.effective_at,status='scheduled',last_error=null,updated_at=now();
    update public.school_billing_quotes set status='scheduled',payment_status=case when p_payment_method='complimentary' then 'waived' else 'paid' end,
      scheduled_at=coalesce(scheduled_at,now()),updated_at=now() where id=v_quote.id;
    if p_payment_attempt_id is not null then
      update public.school_billing_payment_attempts set status=case when p_payment_method='complimentary' then 'waived' else 'paid' end,
        amount_minor=p_amount_minor,currency=upper(p_currency),reference=nullif(trim(p_reference),''),
        provider_customer_id=p_provider_customer_id,provider_subscription_id=p_provider_subscription_id,
        provider_transaction_id=p_provider_transaction_id,verified_by=p_actor,verified_at=now(),
        paid_at=case when p_payment_method='complimentary' then null else now() end,updated_at=now()
      where id=p_payment_attempt_id;
    end if;
    insert into public.school_billing_quote_events(quote_id,school_id,actor_user_id,event_type,from_status,to_status,note,snapshot)
    values(v_quote.id,v_quote.school_id,p_actor,'scheduled',v_quote.status,'scheduled',
      'Payment verified; the lower-capacity agreement remains scheduled for renewal.',
      jsonb_build_object('effective_at',v_quote.effective_at,'capacity',v_capacity));
    return jsonb_build_object('success',true,'scheduled',true,'effective_at',v_quote.effective_at,'quote_id',v_quote.id);
  end if;

  if v_quote.cambridge_seats>0 then v_modules:=array_append(v_modules,'cambridge'); end if;
  if v_quote.ielts_seats>0 then v_modules:=array_append(v_modules,'ielts'); end if;
  if v_quote.writing_seats>0 then v_modules:=array_append(v_modules,'writing'); end if;
  if v_quote.admissions_candidates>0 then v_modules:=array_append(v_modules,'admissions'); end if;

  if p_provider='paddle' and nullif(trim(p_provider_subscription_id),'') is not null then
    insert into public.billing_subscriptions(
      school_id,purchased_by,provider,provider_customer_id,provider_subscription_id,provider_transaction_id,
      status,plan,billing_interval,current_period_start,current_period_end,payment_method,amount_minor,currency,
      payment_reference,paid_at,verified_at,module_keys,internal_notes,source_quote_id,contract_term,capacity,last_event_at
    ) values(
      v_quote.school_id,v_quote.created_by,'paddle',p_provider_customer_id,p_provider_subscription_id,p_provider_transaction_id,
      'active','enterprise',case when v_quote.contract_term='monthly' then 'monthly' else 'yearly' end,
      v_start,v_end,'paddle',p_amount_minor,upper(p_currency),p_reference,now(),now(),v_modules,
      concat('Accepted quote ',v_quote.id,'. ',coalesce(nullif(trim(p_notes),''),'')),v_quote.id,v_quote.contract_term,v_capacity,now()
    ) on conflict(provider,provider_subscription_id) do update set
      school_id=excluded.school_id,purchased_by=excluded.purchased_by,provider_customer_id=excluded.provider_customer_id,
      provider_transaction_id=coalesce(excluded.provider_transaction_id,public.billing_subscriptions.provider_transaction_id),
      status='active',plan='enterprise',billing_interval=excluded.billing_interval,
      current_period_start=coalesce(excluded.current_period_start,public.billing_subscriptions.current_period_start),
      current_period_end=coalesce(excluded.current_period_end,public.billing_subscriptions.current_period_end),
      payment_method='paddle',amount_minor=excluded.amount_minor,currency=excluded.currency,
      payment_reference=excluded.payment_reference,paid_at=now(),verified_at=now(),module_keys=excluded.module_keys,
      internal_notes=excluded.internal_notes,source_quote_id=excluded.source_quote_id,contract_term=excluded.contract_term,
      capacity=excluded.capacity,last_event_at=now(),updated_at=now()
    returning id into v_subscription;
  else
    insert into public.billing_subscriptions(
      school_id,purchased_by,provider,provider_customer_id,provider_subscription_id,provider_transaction_id,
      status,plan,billing_interval,current_period_start,current_period_end,is_comp,comp_expires_at,comp_granted_by,comp_reason,
      payment_method,amount_minor,currency,payment_reference,paid_at,verified_by,verified_at,module_keys,internal_notes,
      source_quote_id,contract_term,capacity,last_event_at,invoice_status
    ) values(
      v_quote.school_id,v_quote.created_by,p_provider,p_provider_customer_id,p_provider_subscription_id,p_provider_transaction_id,
      'active','enterprise','manual',v_start,v_end,p_payment_method='complimentary',
      case when p_payment_method='complimentary' then v_end else null end,
      case when p_payment_method='complimentary' then p_actor else null end,
      case when p_payment_method='complimentary' then p_notes else null end,
      case when p_payment_method='invoice_paid' then 'invoice' else p_payment_method end,p_amount_minor,upper(p_currency),
      p_reference,case when p_payment_method='complimentary' then null else now() end,p_actor,now(),v_modules,
      concat('Accepted quote ',v_quote.id,'. ',coalesce(nullif(trim(p_notes),''),'')),v_quote.id,v_quote.contract_term,v_capacity,now(),
      case when p_payment_method='invoice_paid' then 'paid' else null end
    ) returning id into v_subscription;
  end if;

  update public.billing_subscriptions set status='expired',current_period_end=least(coalesce(current_period_end,now()),now()),updated_at=now()
  where school_id=v_quote.school_id and id<>v_subscription and status in ('active','trialing','past_due');

  foreach v_module in array array['core','cambridge','ielts','writing','admissions']::text[] loop
    v_limit:=case v_module when 'core' then v_quote.platform_seats when 'cambridge' then v_quote.cambridge_seats
      when 'ielts' then v_quote.ielts_seats when 'writing' then v_quote.writing_seats else v_quote.admissions_candidates end;
    insert into public.school_module_entitlements(
      school_id,module_key,enabled,source,starts_at,ends_at,configured_by,notes,seat_limit,source_quote_id,subscription_id
    ) values(
      v_quote.school_id,v_module,v_module=any(v_modules),v_source,v_start,v_end,p_actor,
      concat('Activated from accepted quote ',v_quote.id),nullif(v_limit,0),v_quote.id,v_subscription
    ) on conflict(school_id,module_key) do update set enabled=excluded.enabled,source=excluded.source,
      starts_at=excluded.starts_at,ends_at=excluded.ends_at,configured_by=excluded.configured_by,notes=excluded.notes,
      seat_limit=excluded.seat_limit,source_quote_id=excluded.source_quote_id,subscription_id=excluded.subscription_id,updated_at=now();
  end loop;

  update public.schools set school_plan='enterprise',trial_ends_at=null,
    settings=jsonb_set(coalesce(settings,'{}'::jsonb),'{max_students}',to_jsonb(v_quote.platform_seats),true),updated_at=now()
  where id=v_quote.school_id;

  if v_quote.admissions_candidates>0 then
    insert into public.school_admission_seat_consumptions(
      school_id,candidate_id,entitlement_id,period_start,period_end,source
    ) select c.school_id,c.id,e.id,v_start,v_end,'activation_backfill'
      from public.adm_candidates c join public.school_module_entitlements e
        on e.school_id=c.school_id and e.module_key='admissions'
      where c.school_id=v_quote.school_id
    on conflict do nothing;
  end if;

  update public.school_billing_quotes set status='active',payment_status=case when p_payment_method='complimentary' then 'waived' else 'paid' end,
    activated_at=now(),activated_subscription_id=v_subscription,effective_at=coalesce(effective_at,now()),updated_at=now()
  where id=v_quote.id returning * into v_quote;
  if p_payment_attempt_id is not null then
    update public.school_billing_payment_attempts set status=case when p_payment_method='complimentary' then 'waived' else 'paid' end,
      amount_minor=p_amount_minor,currency=upper(p_currency),reference=nullif(trim(p_reference),''),
      provider_customer_id=p_provider_customer_id,provider_subscription_id=p_provider_subscription_id,
      provider_transaction_id=p_provider_transaction_id,verified_by=p_actor,verified_at=now(),
      paid_at=case when p_payment_method='complimentary' then null else now() end,updated_at=now()
    where id=p_payment_attempt_id;
  end if;
  insert into public.school_billing_quote_events(quote_id,school_id,actor_user_id,event_type,from_status,to_status,note,snapshot)
  values(v_quote.id,v_quote.school_id,p_actor,'activated','payment_pending','active',
    'Verified agreement activated with every quoted capacity.',
    jsonb_build_object('subscription_id',v_subscription,'capacity',v_capacity,'provider',p_provider));
  return jsonb_build_object('success',true,'scheduled',false,'subscription_id',v_subscription,'quote_id',v_quote.id,
    'modules',v_modules,'capacity',v_capacity);
end; $$;
revoke all on function private.activate_school_quote_now(uuid,uuid,text,text,bigint,text,text,timestamptz,timestamptz,text,text,text,uuid,text)
  from public,anon,authenticated,service_role;

create or replace function public.admin_activate_school_quote_manual(
  p_quote_id uuid,p_payment_method text,p_amount_minor bigint,p_currency text,p_reference text,p_notes text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=(select auth.uid()); v_quote public.school_billing_quotes%rowtype;
  v_attempt public.school_billing_payment_attempts%rowtype; v_expected bigint; v_currency text; v_existing_end timestamptz;
begin
  if v_actor is null or not public.is_superadmin(v_actor) then
    raise exception using errcode='42501',message='platform_administrator_access_required';
  end if;
  if p_payment_method='invoice' then
    return jsonb_build_object('success',false,'error','Issuing an invoice does not prove payment. Use “paid invoice” only after settlement.');
  end if;
  if p_payment_method not in ('cash','bank_transfer','invoice_paid','complimentary') then
    return jsonb_build_object('success',false,'error','Choose cash, cleared bank transfer, paid invoice, or complimentary authority.');
  end if;
  select * into v_quote from public.school_billing_quotes where id=p_quote_id for update;
  if v_quote.id is null or v_quote.status not in ('accepted','payment_pending','payment_failed','scheduled') or v_quote.activated_at is not null then
    return jsonb_build_object('success',false,'error','Choose a current quote awaiting verified activation.');
  end if;
  v_expected:=(v_quote.calculation#>>'{totals,contract_total_minor}')::bigint;
  v_currency:=upper(v_quote.calculation#>>'{pricing_version,currency}');
  if upper(trim(coalesce(p_currency,'')))<>v_currency then
    return jsonb_build_object('success',false,'error','Payment currency must match the accepted quote.');
  end if;
  if p_payment_method='complimentary' then
    if coalesce(p_amount_minor,0)<>0 or char_length(trim(coalesce(p_reference,'')))<4 or char_length(trim(coalesce(p_notes,'')))<20 then
      return jsonb_build_object('success',false,'error','Complimentary access requires a zero amount, authority reference, and a reason of at least 20 characters.');
    end if;
  elsif coalesce(p_amount_minor,0)<=0 or char_length(trim(coalesce(p_reference,'')))<4 then
    return jsonb_build_object('success',false,'error','Enter the cleared amount and a receipt, transfer, or paid-invoice reference.');
  elsif v_quote.agreement_kind in ('new_agreement','renewal_change') and p_amount_minor<>v_expected then
    return jsonb_build_object('success',false,'error','Verified amount must exactly match the accepted quote total.');
  end if;
  select * into v_attempt from public.school_billing_payment_attempts a
    where a.quote_id=v_quote.id and a.status in ('pending','checkout_created','invoice_issued')
    order by a.created_at desc limit 1 for update;
  if v_attempt.id is null then
    insert into public.school_billing_payment_attempts(
      quote_id,school_id,method,status,provider,amount_minor,currency,reference,requested_by
    ) values(v_quote.id,v_quote.school_id,
      case when p_payment_method='invoice_paid' then 'paddle_invoice' else p_payment_method end,
      'pending','manual',p_amount_minor,v_currency,p_reference,v_actor) returning * into v_attempt;
  end if;
  select b.current_period_end into v_existing_end from public.billing_subscriptions b
    where b.school_id=v_quote.school_id and b.status in ('active','trialing','past_due')
    order by b.updated_at desc,b.created_at desc limit 1;
  return private.activate_school_quote_now(v_quote.id,v_attempt.id,'manual',p_payment_method,p_amount_minor,v_currency,
    p_reference,now(),case when v_quote.agreement_kind='upgrade' then v_existing_end else null end,
    null,null,null,v_actor,p_notes);
end; $$;
revoke all on function public.admin_activate_school_quote_manual(uuid,text,bigint,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.admin_activate_school_quote_manual(uuid,text,bigint,text,text,text) to authenticated;

-- Retire the permissive v1 manual activation surface.
revoke all on function public.admin_activate_accepted_school_quote(uuid,text,bigint,text,text,timestamptz,text)
  from public,anon,authenticated,service_role;

create or replace function public.activate_school_quote_from_paddle(
  p_quote_id uuid,p_payment_attempt_id uuid,p_quote_hash text,p_amount_minor bigint,p_currency text,
  p_transaction_id text,p_subscription_id text,p_customer_id text,p_period_start timestamptz,p_period_end timestamptz
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_quote public.school_billing_quotes%rowtype; v_attempt public.school_billing_payment_attempts%rowtype; v_expected bigint; v_currency text;
begin
  select * into v_quote from public.school_billing_quotes where id=p_quote_id for update;
  select * into v_attempt from public.school_billing_payment_attempts where id=p_payment_attempt_id and quote_id=p_quote_id for update;
  if v_quote.id is null or v_attempt.id is null or v_attempt.provider<>'paddle' then
    return jsonb_build_object('success',false,'error','Paddle quote payment attempt not found.');
  end if;
  if v_quote.quote_hash is null or v_quote.quote_hash<>p_quote_hash or v_quote.quote_hash<>private.school_quote_integrity_hash(v_quote) then
    raise exception using errcode='P0001',message='paddle_quote_integrity_check_failed';
  end if;
  v_expected:=(v_quote.calculation#>>'{totals,contract_total_minor}')::bigint;
  v_currency:=upper(v_quote.calculation#>>'{pricing_version,currency}');
  if upper(trim(coalesce(p_currency,'')))<>v_currency or coalesce(p_amount_minor,0)<=0 then
    raise exception using errcode='P0001',message='paddle_payment_does_not_match_quote_currency';
  end if;
  if v_quote.agreement_kind in ('new_agreement','renewal_change') and p_amount_minor<>v_expected then
    raise exception using errcode='P0001',message='paddle_payment_does_not_equal_accepted_quote_total';
  end if;
  return private.activate_school_quote_now(v_quote.id,v_attempt.id,'paddle','paddle',p_amount_minor,v_currency,
    p_transaction_id,p_period_start,p_period_end,p_customer_id,p_subscription_id,p_transaction_id,null,
    'Verified automatically from a signed Paddle webhook.');
end; $$;
revoke all on function public.activate_school_quote_from_paddle(uuid,uuid,text,bigint,text,text,text,text,timestamptz,timestamptz)
  from public,anon,authenticated,service_role;
grant execute on function public.activate_school_quote_from_paddle(uuid,uuid,text,bigint,text,text,text,text,timestamptz,timestamptz)
  to service_role;

create or replace function public.rpc_apply_due_school_capacity_amendments(p_limit integer default 25)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r record; v_result jsonb; v_applied integer:=0; v_blocked integer:=0;
begin
  for r in
    select a.*,p.provider,p.method,p.amount_minor,p.currency,p.reference,
      p.provider_customer_id,p.provider_subscription_id,p.provider_transaction_id
    from public.school_capacity_amendments a
    join public.school_billing_payment_attempts p on p.id=a.payment_attempt_id
    where a.status in ('scheduled','blocked') and a.effective_at<=now()
    order by a.effective_at for update of a skip locked
    limit greatest(1,least(coalesce(p_limit,25),100))
  loop
    begin
      update public.school_capacity_amendments set status='applying',attempts=attempts+1,updated_at=now() where id=r.id;
      v_result:=private.activate_school_quote_now(r.quote_id,r.payment_attempt_id,r.provider,
        case when r.method='paddle_invoice' and r.provider='manual' then 'invoice_paid' when r.provider='paddle' then 'paddle' else r.method end,
        r.amount_minor,r.currency,r.reference,r.effective_at,null,r.provider_customer_id,r.provider_subscription_id,
        r.provider_transaction_id,null,'Applied automatically on the accepted renewal effective date.');
      if coalesce((v_result->>'success')::boolean,false) and not coalesce((v_result->>'scheduled')::boolean,false) then
        update public.school_capacity_amendments set status='applied',applied_at=now(),last_error=null,updated_at=now() where id=r.id;
        v_applied:=v_applied+1;
      else
        raise exception using message=coalesce(v_result->>'error','Scheduled capacity change did not activate.');
      end if;
    exception when others then
      update public.school_capacity_amendments set status='blocked',last_error=left(sqlerrm,1000),updated_at=now() where id=r.id;
      v_blocked:=v_blocked+1;
    end;
  end loop;
  return jsonb_build_object('success',true,'applied',v_applied,'blocked',v_blocked);
end; $$;
revoke all on function public.rpc_apply_due_school_capacity_amendments(integer) from public,anon,authenticated;
grant execute on function public.rpc_apply_due_school_capacity_amendments(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Complete capacity read models for School Head and operational billing UI.
-- ---------------------------------------------------------------------------

create or replace function public.school_head_get_programme_seats(p_school_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=(select auth.uid()); v_programmes jsonb; v_capacities jsonb; v_students jsonb; v_events jsonb; v_requests jsonb;
begin
  if v_actor is null or not (public.is_school_owner(p_school_id) or public.is_superadmin(v_actor)) then
    raise exception using errcode='42501',message='school_head_or_platform_administrator_required';
  end if;
  select coalesce(jsonb_agg(row_data order by module_key),'[]'::jsonb) into v_programmes from (
    select e.module_key,e.seat_limit,
      count(a.id) filter(where a.released_at is null)::integer assigned,
      count(a.id) filter(where a.released_at is not null and a.cooldown_until>now())::integer cooling_down,
      greatest(0,coalesce(e.seat_limit,0)-count(a.id) filter(where a.released_at is null or a.cooldown_until>now()))::integer available,
      private.programme_transfer_limit(p_school_id,e.module_key) transfer_limit,
      count(a.id) filter(where a.released_at>=private.school_programme_period_start(p_school_id,e.module_key)
        and not a.correction and coalesce(a.release_reason,'')<>'left_school')::integer transfers_used,
      count(distinct a.student_user_id) filter(where a.billing_period_start=private.school_programme_period_start(p_school_id,e.module_key))::integer unique_students_served,
      min(a.cooldown_until) filter(where a.cooldown_until>now()) next_available_at
    from public.school_module_entitlements e left join public.school_programme_seat_assignments a
      on a.school_id=e.school_id and a.module_key=e.module_key
    where e.school_id=p_school_id and e.enabled and e.module_key in ('cambridge','ielts','writing')
      and e.starts_at<=now() and (e.ends_at is null or e.ends_at>now())
    group by e.module_key,e.seat_limit
  ) row_data;
  select coalesce(jsonb_agg(row_data order by sort_order),'[]'::jsonb) into v_capacities from (
    select 10 sort_order,'platform' module_key,
      case when coalesce(s.settings->>'max_students','')~'^[0-9]+$' then (s.settings->>'max_students')::integer else null end seat_limit,
      (select count(*)::integer from public.school_members sm where sm.school_id=s.id and sm.status='active' and sm.role_in_school='student') used
    from public.schools s where s.id=p_school_id
    union all
    select case e.module_key when 'cambridge' then 20 when 'ielts' then 30 when 'writing' then 40 else 50 end,
      e.module_key,e.seat_limit,
      case when e.module_key='admissions' then (select count(*)::integer from public.school_admission_seat_consumptions c
        where c.school_id=e.school_id and c.period_start=e.starts_at and (c.period_end is null or c.period_end>now()))
      else (select count(*)::integer from public.school_programme_seat_assignments a where a.school_id=e.school_id
        and a.module_key=e.module_key and (a.released_at is null or a.cooldown_until>now())) end
    from public.school_module_entitlements e where e.school_id=p_school_id and e.module_key in ('cambridge','ielts','writing','admissions')
      and e.enabled and e.starts_at<=now() and (e.ends_at is null or e.ends_at>now())
  ) row_data;
  select coalesce(jsonb_agg(row_data order by (member_status='active') desc,student_name),'[]'::jsonb) into v_students from (
    select u.id user_id,coalesce(nullif(trim(u.full_name),''),nullif(trim(u.username),''),'Student') student_name,
      coalesce(u.batch,'Unassigned') class_name,coalesce(sm.status,'inactive') member_status,
      coalesce((select jsonb_agg(jsonb_build_object('assignment_id',a.id,'module_key',a.module_key,'assigned_at',a.assigned_at,
        'activated_at',a.activated_at,'has_usage',private.student_has_programme_usage(a.school_id,a.module_key,a.student_user_id,a.assigned_at),
        'correction_until',a.assigned_at+interval '24 hours') order by a.module_key)
        from public.school_programme_seat_assignments a where a.school_id=p_school_id and a.student_user_id=u.id and a.released_at is null),'[]'::jsonb) assignments
    from public.users u left join lateral(select membership.status from public.school_members membership
      where membership.school_id=p_school_id and membership.user_id=u.id and membership.role_in_school='student'
      order by (membership.status='active') desc,membership.updated_at desc nulls last limit 1) sm on true
    where sm.status is not null or exists(select 1 from public.school_programme_seat_assignments active
      where active.school_id=p_school_id and active.student_user_id=u.id and active.released_at is null)
  ) row_data;
  select coalesce(jsonb_agg(row_data order by created_at desc),'[]'::jsonb) into v_events from (
    select e.id,e.module_key,e.event_type,e.reason,e.metadata,e.created_at,e.student_user_id,
      coalesce(nullif(trim(u.full_name),''),nullif(trim(u.username),''),'Student') student_name
    from public.school_programme_seat_events e join public.users u on u.id=e.student_user_id
    where e.school_id=p_school_id order by e.created_at desc limit 40
  ) row_data;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),'[]'::jsonb) into v_requests
    from(select id,module_key,requested_transfers,reason,status,review_note,created_at,reviewed_at
      from public.school_programme_seat_exception_requests where school_id=p_school_id order by created_at desc limit 20) r;
  return jsonb_build_object('success',true,'programmes',v_programmes,'capacities',v_capacities,'students',v_students,
    'events',v_events,'exception_requests',v_requests,
    'policy',jsonb_build_object('correction_hours',24,'cooldown_days',7,'base_transfer_percent',10),'generated_at',now());
end; $$;
revoke all on function public.school_head_get_programme_seats(uuid) from public,anon,authenticated,service_role;
grant execute on function public.school_head_get_programme_seats(uuid) to authenticated;

-- Preserve the Decision Center v2 wrapper while replacing its legacy subscription
-- record with the active agreement and programme-specific capacity snapshot.
create or replace function public.school_head_get_executive_snapshot(p_school_id uuid,p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_base jsonb; v_operational jsonb; v_kept jsonb; v_enriched jsonb; v_subscription jsonb; v_change jsonb;
begin
  if (select auth.uid()) is null or not coalesce(public.is_school_owner(p_school_id),false) then
    raise exception using errcode='42501',message='school_head_access_required';
  end if;
  v_base:=public.school_head_get_executive_snapshot_legacy_20260815(p_school_id,p_days);
  v_operational:=private.school_head_build_operational_decisions(p_school_id,p_days);
  select coalesce(jsonb_agg(item),'[]'::jsonb) into v_kept from jsonb_array_elements(coalesce(v_base->'decisions','[]'::jsonb)) item
    where item->>'id' not in ('unplaced_students','uncovered_classes','unassigned_teachers','inactive_students','pending_admissions','subscription_cancellation');
  select coalesce(jsonb_agg(item||jsonb_build_object('first_seen_at',a.first_seen_at,'last_seen_at',a.last_seen_at,'alert_status',coalesce(a.status,'open'))),'[]'::jsonb)
    into v_enriched from jsonb_array_elements(v_operational) item left join public.school_head_decision_alerts a
      on a.school_id=p_school_id and a.decision_key=item->>'id';
  select jsonb_build_object(
    'plan',b.plan,'status',b.status,'billing_interval',b.billing_interval,'contract_term',b.contract_term,
    'current_period_end',b.current_period_end,'cancel_at_period_end',b.cancel_at_period_end,
    'is_comp',b.is_comp,'comp_expires_at',b.comp_expires_at,
    'seat_limit',coalesce((b.capacity->>'platform')::integer,
      case when coalesce(s.settings->>'max_students','')~'^[0-9]+$' then (s.settings->>'max_students')::integer else null end),
    'seats_used',(select count(*) from public.school_members sm where sm.school_id=p_school_id and sm.status='active' and sm.role_in_school='student'),
    'capacity',coalesce(b.capacity,private.school_current_capacity(p_school_id)),'payment_method',b.payment_method,
    'provider',b.provider,'source_quote_id',b.source_quote_id
  ) into v_subscription from public.billing_subscriptions b join public.schools s on s.id=b.school_id
    where b.school_id=p_school_id and b.status in ('active','trialing','past_due','cancelled')
      and (b.status<>'cancelled' or b.current_period_end>now())
    order by case b.status when 'active' then 0 when 'trialing' then 1 when 'past_due' then 2 else 3 end,b.updated_at desc limit 1;
  if v_subscription is null then
    v_subscription:=jsonb_build_object('plan','none','status','none','billing_interval',null,'contract_term',null,
      'current_period_end',null,'cancel_at_period_end',false,'is_comp',false,'comp_expires_at',null,
      'seat_limit',null,'seats_used',(select count(*) from public.school_members sm where sm.school_id=p_school_id and sm.status='active' and sm.role_in_school='student'),
      'capacity','{}'::jsonb,'payment_method',null,'provider',null,'source_quote_id',null);
  end if;
  select jsonb_build_object('quote_id',q.id,'title',q.title,'status',q.status,'payment_status',q.payment_status,
    'payment_method',q.selected_payment_method,'agreement_kind',q.agreement_kind,'effective_at',q.effective_at,
    'capacity',private.school_quote_capacity(q),'contract_total_minor',(q.calculation#>>'{totals,contract_total_minor}')::bigint,
    'currency',q.calculation#>>'{pricing_version,currency}') into v_change
  from public.school_billing_quotes q where q.school_id=p_school_id and q.activated_at is null
    and q.status in ('accepted','payment_pending','payment_failed','scheduled') order by q.updated_at desc limit 1;
  return jsonb_set(jsonb_set(v_base,'{decisions}',v_kept||v_enriched,true),'{subscription}',v_subscription,true)
    ||jsonb_build_object('pending_plan_change',v_change,'decision_policy',jsonb_build_object(
      'critical','Immediate in-app and branded email; daily reminder while open',
      'warning','In-app and daily branded email digest while open',
      'notice','Decision Center and weekly branded email digest while open','auto_resolution',true));
end; $$;
revoke all on function public.school_head_get_executive_snapshot(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.school_head_get_executive_snapshot(uuid,integer) to authenticated;

create or replace function public.admin_list_school_billing_quotes(p_status text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if (select auth.uid()) is null or not public.is_superadmin((select auth.uid())) then
    raise exception using errcode='42501',message='platform_administrator_access_required';
  end if;
  return jsonb_build_object('success',true,'quotes',coalesce((select jsonb_agg(jsonb_build_object(
    'id',q.id,'school_id',q.school_id,'school_name',s.name,'title',q.title,'status',q.status,
    'contract_term',q.contract_term,'platform_seats',q.platform_seats,'cambridge_seats',q.cambridge_seats,
    'ielts_seats',q.ielts_seats,'writing_seats',q.writing_seats,'admissions_candidates',q.admissions_candidates,
    'launch_discount_requested',q.launch_discount_requested,'calculation',q.calculation,'school_note',q.school_note,
    'submitted_at',q.submitted_at,'reviewed_at',q.reviewed_at,'review_note',q.review_note,'expires_at',q.expires_at,
    'accepted_at',q.accepted_at,'activated_at',q.activated_at,'activated_subscription_id',q.activated_subscription_id,
    'payment_status',q.payment_status,'selected_payment_method',q.selected_payment_method,'agreement_kind',q.agreement_kind,
    'effective_at',q.effective_at,'quote_hash',q.quote_hash,'scheduled_at',q.scheduled_at,
    'payment_attempt',(select to_jsonb(a) from public.school_billing_payment_attempts a where a.quote_id=q.id order by a.created_at desc limit 1),
    'created_at',q.created_at,'updated_at',q.updated_at,
    'school_head',case when u.id is null then null else jsonb_build_object('name',coalesce(u.full_name,u.username,'School Head'),'email',u.email) end
  ) order by case q.status when 'submitted' then 0 when 'payment_pending' then 1 when 'accepted' then 2 when 'scheduled' then 3 else 4 end,
    q.submitted_at asc nulls last,q.updated_at desc)
    from public.school_billing_quotes q join public.schools s on s.id=q.school_id
    left join public.school_members sm on sm.school_id=q.school_id and sm.is_owner and sm.status='active'
    left join public.users u on u.id=sm.user_id where p_status is null or q.status=p_status),'[]'::jsonb));
end; $$;
revoke all on function public.admin_list_school_billing_quotes(text) from public,anon,authenticated,service_role;
grant execute on function public.admin_list_school_billing_quotes(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Branded billing emails and scheduled operational jobs.
-- ---------------------------------------------------------------------------

create or replace function private.enqueue_school_head(
  p_school_id uuid,p_event_type text,p_template_key text,p_idempotency_prefix text,p_payload jsonb
) returns void language plpgsql security definer set search_path='' as $$
declare v_member record;
begin
  for v_member in select sm.user_id from public.school_members sm
    where sm.school_id=p_school_id and sm.status='active' and sm.is_owner
  loop
    perform private.enqueue_transactional_email(p_event_type,'billing','school_head',p_template_key,
      p_idempotency_prefix||'-'||v_member.user_id::text,p_payload,v_member.user_id,null,p_school_id,null,now());
  end loop;
end; $$;
revoke all on function private.enqueue_school_head(uuid,text,text,text,jsonb) from public,anon,authenticated,service_role;

create or replace function private.trg_email_school_quote()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' or new.status is distinct from old.status or new.payment_status is distinct from old.payment_status then
    perform private.enqueue_school_head(new.school_id,'billing_quote_'||new.status,'billing_quote_status',
      'billing-quote-'||new.id::text||'-'||new.status||'-'||new.payment_status,
      jsonb_build_object('quote_id',new.id,'title',new.title,'status',new.status,'payment_status',new.payment_status,
        'payment_method',new.selected_payment_method,'agreement_kind',new.agreement_kind,'effective_at',new.effective_at,
        'expires_at',new.expires_at,'platform_seats',new.platform_seats,'cambridge_seats',new.cambridge_seats,
        'ielts_seats',new.ielts_seats,'writing_seats',new.writing_seats,'admissions_candidates',new.admissions_candidates,
        'contract_total_minor',(new.calculation#>>'{totals,contract_total_minor}')::bigint,
        'currency',new.calculation#>>'{pricing_version,currency}'));
  end if;
  return new;
end; $$;
revoke all on function private.trg_email_school_quote() from public,anon,authenticated,service_role;
drop trigger if exists professional_email_school_quote on public.school_billing_quotes;
create trigger professional_email_school_quote after insert or update of status,payment_status
on public.school_billing_quotes for each row execute function private.trg_email_school_quote();

create or replace function private.trg_email_school_billing_payment()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' or new.status is distinct from old.status then
    perform private.enqueue_school_head(new.school_id,'billing_payment_'||new.status,'billing_payment_status',
      'billing-payment-'||new.id::text||'-'||new.status,
      jsonb_build_object('payment_attempt_id',new.id,'quote_id',new.quote_id,'status',new.status,'method',new.method,
        'amount_minor',new.amount_minor,'currency',new.currency,'invoice_url',new.invoice_url,'reference',new.reference));
    perform private.enqueue_transactional_email('billing_payment_'||new.status,'platform_operations','platform_owner',
      'owner_billing_payment','owner-billing-payment-'||new.id::text||'-'||new.status,
      jsonb_build_object('payment_attempt_id',new.id,'quote_id',new.quote_id,'school_id',new.school_id,
        'status',new.status,'method',new.method,'amount_minor',new.amount_minor,'currency',new.currency),
      null,null,new.school_id,null,now());
  end if;
  return new;
end; $$;
revoke all on function private.trg_email_school_billing_payment() from public,anon,authenticated,service_role;
drop trigger if exists professional_email_school_billing_payment on public.school_billing_payment_attempts;
create trigger professional_email_school_billing_payment after insert or update of status
on public.school_billing_payment_attempts for each row execute function private.trg_email_school_billing_payment();

create or replace function public.rpc_enqueue_school_billing_reminders()
returns jsonb language plpgsql security definer set search_path='' as $$
declare r record; v_count integer:=0;
begin
  for r in select q.* from public.school_billing_quotes q
    where q.status='scheduled' and q.payment_status='not_required_yet'
      and q.effective_at between now()+interval '29 days 23 hours' and now()+interval '30 days 1 hour'
  loop
    perform private.enqueue_school_head(r.school_id,'billing_renewal_payment_open','billing_quote_status',
      'billing-renewal-payment-open-'||r.id::text,
      jsonb_build_object('quote_id',r.id,'title',r.title,'status','payment required','payment_status','not started',
        'agreement_kind',r.agreement_kind,'effective_at',r.effective_at,'platform_seats',r.platform_seats,
        'cambridge_seats',r.cambridge_seats,'ielts_seats',r.ielts_seats,'writing_seats',r.writing_seats,
        'admissions_candidates',r.admissions_candidates,'contract_total_minor',(r.calculation#>>'{totals,contract_total_minor}')::bigint,
        'currency',r.calculation#>>'{pricing_version,currency}'));
    v_count:=v_count+1;
  end loop;
  return jsonb_build_object('success',true,'renewal_payment_reminders',v_count);
end; $$;
revoke all on function public.rpc_enqueue_school_billing_reminders() from public,anon,authenticated;
grant execute on function public.rpc_enqueue_school_billing_reminders() to service_role;

do $$ begin
  perform cron.unschedule('school-billing-capacity-activation');
exception when others then null; end $$;
select cron.schedule('school-billing-capacity-activation','*/5 * * * *',
  'select public.rpc_apply_due_school_capacity_amendments(25); select public.rpc_enqueue_school_billing_reminders();');

notify pgrst,'reload schema';

comment on table public.school_billing_payment_attempts is
  'Auditable payment lifecycle for an immutable accepted school quote. Invoice issuance is distinct from payment.';
comment on table public.school_capacity_amendments is
  'Accepted lower-capacity changes scheduled for renewal; active access remains unchanged until the effective date.';
comment on function public.activate_school_quote_from_paddle(uuid,uuid,text,bigint,text,text,text,text,timestamptz,timestamptz) is
  'Service-role-only idempotent activation from a signed Paddle payment event.';
