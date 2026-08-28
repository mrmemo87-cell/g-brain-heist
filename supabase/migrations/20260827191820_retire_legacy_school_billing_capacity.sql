-- Make accepted quotes the single authority for paid school agreements.
--
-- This migration closes the retired direct-manual activation bypass, safely
-- reconciles any already-verified paid agreement only when one accepted quote
-- matches its amount/currency/modules/effective date, and then installs
-- fail-closed invariants so capacity-less paid agreements cannot be created
-- again.

-- ---------------------------------------------------------------------------
-- Reconcile verified legacy agreements to their authoritative accepted quote.
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
  v_quote public.school_billing_quotes%rowtype;
  v_match_count integer;
  v_capacity jsonb;
  v_module text;
  v_limit integer;
  v_source text;
  v_method text;
  v_attempt uuid;
begin
  for r in
    select b.*
    from public.billing_subscriptions b
    where b.status in ('active','trialing','past_due')
      and b.plan in ('core','standard','pro','enterprise')
      and (b.capacity is null or b.capacity = '{}'::jsonb)
    for update
  loop
    select count(*)::integer into v_match_count
    from public.school_billing_quotes q
    where q.school_id = r.school_id
      and q.accepted_at is not null
      and q.platform_seats > 0
      and coalesce((q.calculation #>> '{totals,contract_total_minor}')::bigint, -1) = coalesce(r.amount_minor, -2)
      and upper(coalesce(q.calculation #>> '{pricing_version,currency}', '')) = upper(coalesce(r.currency, ''))
      and coalesce(q.effective_at, q.accepted_at, q.created_at) <= coalesce(r.current_period_start, r.created_at) + interval '1 day'
      and ('cambridge' = any(coalesce(r.module_keys, '{}'::text[]))) = (q.cambridge_seats > 0)
      and ('ielts' = any(coalesce(r.module_keys, '{}'::text[]))) = (q.ielts_seats > 0)
      and ('writing' = any(coalesce(r.module_keys, '{}'::text[]))) = (q.writing_seats > 0)
      and ('admissions' = any(coalesce(r.module_keys, '{}'::text[]))) = (q.admissions_candidates > 0);

    if v_match_count <> 1 then
      raise exception using
        errcode = 'P0001',
        message = 'legacy_school_agreement_reconciliation_ambiguous',
        detail = format('Subscription %s matched %s accepted quotes.', r.id, v_match_count);
    end if;

    select * into v_quote
    from public.school_billing_quotes q
    where q.school_id = r.school_id
      and q.accepted_at is not null
      and q.platform_seats > 0
      and coalesce((q.calculation #>> '{totals,contract_total_minor}')::bigint, -1) = coalesce(r.amount_minor, -2)
      and upper(coalesce(q.calculation #>> '{pricing_version,currency}', '')) = upper(coalesce(r.currency, ''))
      and coalesce(q.effective_at, q.accepted_at, q.created_at) <= coalesce(r.current_period_start, r.created_at) + interval '1 day'
      and ('cambridge' = any(coalesce(r.module_keys, '{}'::text[]))) = (q.cambridge_seats > 0)
      and ('ielts' = any(coalesce(r.module_keys, '{}'::text[]))) = (q.ielts_seats > 0)
      and ('writing' = any(coalesce(r.module_keys, '{}'::text[]))) = (q.writing_seats > 0)
      and ('admissions' = any(coalesce(r.module_keys, '{}'::text[]))) = (q.admissions_candidates > 0)
    order by coalesce(q.effective_at, q.accepted_at, q.created_at) desc, q.created_at desc
    limit 1
    for update;

    v_capacity := private.school_quote_capacity(v_quote);
    v_source := case
      when r.provider = 'paddle' then 'paddle'
      when r.is_comp then 'complimentary'
      else 'manual_payment'
    end;
    v_method := case
      when r.is_comp then 'complimentary'
      when r.provider = 'paddle' then 'paddle_checkout'
      when r.payment_method = 'invoice' then 'paddle_invoice'
      when r.payment_method in ('cash','bank_transfer') then r.payment_method
      else 'bank_transfer'
    end;

    update public.billing_subscriptions
    set source_quote_id = v_quote.id,
        contract_term = coalesce(contract_term, v_quote.contract_term),
        capacity = v_capacity,
        plan = 'enterprise',
        updated_at = now()
    where id = r.id;

    update public.schools
    set school_plan = 'enterprise',
        trial_ends_at = null,
        settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{max_students}', to_jsonb(v_quote.platform_seats), true),
        updated_at = now()
    where id = r.school_id;

    foreach v_module in array array['core','cambridge','ielts','writing','admissions']::text[] loop
      v_limit := case v_module
        when 'core' then v_quote.platform_seats
        when 'cambridge' then v_quote.cambridge_seats
        when 'ielts' then v_quote.ielts_seats
        when 'writing' then v_quote.writing_seats
        else v_quote.admissions_candidates
      end;

      insert into public.school_module_entitlements(
        school_id, module_key, enabled, source, starts_at, ends_at,
        configured_by, notes, seat_limit, source_quote_id, subscription_id
      ) values(
        r.school_id,
        v_module,
        v_module = 'core' or v_limit > 0,
        v_source,
        coalesce(r.current_period_start, v_quote.effective_at, v_quote.accepted_at),
        r.current_period_end,
        r.verified_by,
        concat('Reconciled from verified paid quote ', v_quote.id),
        nullif(v_limit, 0),
        v_quote.id,
        r.id
      )
      on conflict (school_id, module_key) do update set
        enabled = excluded.enabled,
        source = excluded.source,
        starts_at = excluded.starts_at,
        ends_at = excluded.ends_at,
        configured_by = excluded.configured_by,
        notes = excluded.notes,
        seat_limit = excluded.seat_limit,
        source_quote_id = excluded.source_quote_id,
        subscription_id = excluded.subscription_id,
        updated_at = now();
    end loop;

    update public.school_billing_quotes
    set status = 'active',
        payment_status = case when r.is_comp then 'waived' else 'paid' end,
        selected_payment_method = v_method,
        agreement_kind = coalesce(agreement_kind, 'new_agreement'),
        effective_at = coalesce(effective_at, r.current_period_start, accepted_at),
        quote_hash = private.school_quote_integrity_hash(
          (select q from public.school_billing_quotes q where q.id = v_quote.id)
        ),
        activated_at = coalesce(activated_at, r.current_period_start, r.verified_at, r.paid_at, now()),
        activated_subscription_id = r.id,
        superseded_by_quote_id = null,
        updated_at = now()
    where id = v_quote.id;

    select a.id into v_attempt
    from public.school_billing_payment_attempts a
    where a.quote_id = v_quote.id
    order by a.created_at desc
    limit 1;

    if v_attempt is null then
      insert into public.school_billing_payment_attempts(
        quote_id, school_id, method, status, provider, amount_minor, currency,
        reference, requested_by, verified_by, verified_at, paid_at, metadata
      ) values(
        v_quote.id,
        r.school_id,
        v_method,
        case when r.is_comp then 'waived' else 'paid' end,
        case when r.provider = 'paddle' then 'paddle' else 'manual' end,
        coalesce(r.amount_minor, 0),
        upper(coalesce(r.currency, 'USD')),
        r.payment_reference,
        v_quote.created_by,
        r.verified_by,
        r.verified_at,
        r.paid_at,
        jsonb_build_object(
          'reconciled_from_legacy_subscription_id', r.id,
          'capacity', v_capacity
        )
      );
    end if;

    if not exists(
      select 1
      from public.school_billing_quote_events e
      where e.quote_id = v_quote.id and e.event_type = 'activated'
    ) then
      insert into public.school_billing_quote_events(
        quote_id, school_id, actor_user_id, event_type,
        from_status, to_status, note, snapshot
      ) values(
        v_quote.id,
        r.school_id,
        r.verified_by,
        'activated',
        v_quote.status,
        'active',
        'Reconciled verified legacy payment into the authoritative quoted-capacity agreement.',
        jsonb_build_object(
          'subscription_id', r.id,
          'capacity', v_capacity,
          'reconciliation', true
        )
      );
    end if;
  end loop;

  if exists(
    select 1
    from public.billing_subscriptions b
    where b.status in ('active','trialing','past_due')
      and b.plan in ('core','standard','pro','enterprise')
      and (b.capacity is null or b.capacity = '{}'::jsonb or b.source_quote_id is null)
  ) then
    raise exception using errcode = 'P0001', message = 'unreconciled_active_school_agreement_remains';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Permanently retire the direct manual-subscription bypass.
-- ---------------------------------------------------------------------------

revoke all on function public.admin_record_manual_school_subscription(
  uuid, text, text, text, bigint, text, text, timestamptz, text[], text
) from public, anon, authenticated, service_role;

drop function if exists public.admin_record_manual_school_subscription(
  uuid, text, text, text, bigint, text, text, timestamptz, text[], text
);

-- ---------------------------------------------------------------------------
-- Fail-closed invariants for every future active paid agreement.
-- ---------------------------------------------------------------------------

create or replace function private.enforce_authoritative_school_subscription_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_modules text[] := coalesce(new.module_keys, '{}'::text[]);
  v_platform integer;
  v_cambridge integer;
  v_ielts integer;
  v_writing integer;
  v_admissions integer;
begin
  if new.status not in ('active','trialing','past_due')
     or new.plan not in ('core','standard','pro','enterprise') then
    return new;
  end if;

  if new.source_quote_id is null then
    raise exception using errcode = 'P0001', message = 'active_school_agreement_requires_accepted_quote';
  end if;

  if new.capacity is null
     or jsonb_typeof(new.capacity) <> 'object'
     or new.capacity = '{}'::jsonb then
    raise exception using errcode = 'P0001', message = 'active_school_agreement_requires_exact_capacity';
  end if;

  v_platform := coalesce(nullif(new.capacity ->> 'platform', '')::integer, 0);
  v_cambridge := coalesce(nullif(new.capacity ->> 'cambridge', '')::integer, 0);
  v_ielts := coalesce(nullif(new.capacity ->> 'ielts', '')::integer, 0);
  v_writing := coalesce(nullif(new.capacity ->> 'writing', '')::integer, 0);
  v_admissions := coalesce(nullif(new.capacity ->> 'admissions', '')::integer, 0);

  if v_platform <= 0 then
    raise exception using errcode = 'P0001', message = 'active_school_agreement_requires_platform_capacity';
  end if;

  if ('cambridge' = any(v_modules)) <> (v_cambridge > 0)
     or ('ielts' = any(v_modules)) <> (v_ielts > 0)
     or ('writing' = any(v_modules)) <> (v_writing > 0)
     or ('admissions' = any(v_modules)) <> (v_admissions > 0) then
    raise exception using errcode = 'P0001', message = 'school_agreement_modules_and_capacity_must_match';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_authoritative_school_subscription_capacity()
  from public, anon, authenticated, service_role;

drop trigger if exists enforce_authoritative_school_subscription_capacity
  on public.billing_subscriptions;
create trigger enforce_authoritative_school_subscription_capacity
before insert or update on public.billing_subscriptions
for each row execute function private.enforce_authoritative_school_subscription_capacity();

create or replace function private.enforce_contract_module_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.enabled
     and new.source in ('manual_payment','paddle','complimentary')
     and new.module_key in ('core','cambridge','ielts','writing','admissions')
     and (
       new.seat_limit is null
       or new.seat_limit <= 0
       or new.source_quote_id is null
       or new.subscription_id is null
     ) then
    raise exception using errcode = 'P0001', message = 'contract_module_requires_exact_quote_backed_capacity';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_contract_module_capacity()
  from public, anon, authenticated, service_role;

drop trigger if exists enforce_contract_module_capacity
  on public.school_module_entitlements;
create trigger enforce_contract_module_capacity
before insert or update on public.school_module_entitlements
for each row execute function private.enforce_contract_module_capacity();

-- ---------------------------------------------------------------------------
-- Show the exact live contract capacities in the school plan card.
-- ---------------------------------------------------------------------------

create or replace function public.get_school_plan_details(p_school_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_school_id uuid;
  v_plan text;
  v_effective_plan text;
  v_trial_end timestamptz;
  v_active boolean;
  v_limits jsonb;
  v_members integer;
  v_pilot_state text;
  v_capacity jsonb;
begin
  if v_actor is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;

  v_school_id := coalesce(
    p_school_id,
    (select u.school_id from public.users u where u.id = v_actor)
  );
  if v_school_id is null then
    return jsonb_build_object('success', true, 'plan', 'none', 'is_active', false, 'pilot_state', 'not_started');
  end if;

  if not (
    public.is_superadmin(v_actor)
    or exists(
      select 1
      from public.school_members sm
      where sm.school_id = v_school_id
        and sm.user_id = v_actor
        and sm.status = 'active'
    )
  ) then
    return jsonb_build_object('success', false, 'error', 'Not a member of this school');
  end if;

  perform private.sync_school_pilot_lifecycle(v_school_id);

  select s.school_plan, s.trial_ends_at
  into v_plan, v_trial_end
  from public.schools s
  where s.id = v_school_id;

  v_effective_plan := private.professional_onboarding_active_plan(v_school_id);
  v_active := v_effective_plan in ('pilot','core','standard','pro','enterprise');

  select b.capacity into v_capacity
  from public.billing_subscriptions b
  where b.school_id = v_school_id
    and b.status in ('active','trialing','past_due')
    and (b.current_period_end is null or b.current_period_end > now())
    and b.capacity is not null
    and b.capacity <> '{}'::jsonb
  order by b.updated_at desc, b.created_at desc
  limit 1;

  if v_capacity is not null then
    v_limits := jsonb_build_object(
      'game', coalesce((v_capacity ->> 'platform')::integer, 0),
      'cambridge', coalesce((v_capacity ->> 'cambridge')::integer, 0),
      'ielts', coalesce((v_capacity ->> 'ielts')::integer, 0),
      'writing', coalesce((v_capacity ->> 'writing')::integer, 0),
      'admissions', coalesce((v_capacity ->> 'admissions')::integer, 0)
    );
  else
    v_limits := public.get_plan_seat_limits(
      case when v_effective_plan = 'free' then coalesce(v_plan, 'none') else v_effective_plan end
    );
  end if;

  select count(*)::integer into v_members
  from public.school_members sm
  where sm.school_id = v_school_id and sm.status = 'active';

  select spl.state into v_pilot_state
  from public.school_pilot_lifecycle spl
  where spl.school_id = v_school_id;

  return jsonb_build_object(
    'success', true,
    'school_id', v_school_id,
    'plan', case when v_effective_plan = 'free' then coalesce(v_plan, 'none') else v_effective_plan end,
    'effective_plan', v_effective_plan,
    'is_active', v_active,
    'trial_ends_at', v_trial_end,
    'pilot_state', coalesce(v_pilot_state, 'not_started'),
    'seats', v_limits,
    'current_members', v_members,
    'trial_expired', coalesce(v_plan = 'pilot' and (v_trial_end is null or v_trial_end <= now()), false)
  );
end;
$$;

revoke all on function public.get_school_plan_details(uuid) from public, anon;
grant execute on function public.get_school_plan_details(uuid) to authenticated;

comment on function private.enforce_authoritative_school_subscription_capacity() is
  'Fail-closed invariant: active paid school agreements must be accepted-quote-backed with exact platform/programme capacities.';
comment on function private.enforce_contract_module_capacity() is
  'Fail-closed invariant: enabled contract module entitlements require a positive seat limit plus quote/subscription provenance.';

notify pgrst, 'reload schema';
