-- Reconcile activations created by the retired v1 manual activation RPC.
-- Only quotes already linked to a verified active subscription are eligible.

do $$
declare
  r record;
  v_capacity jsonb;
  v_method text;
  v_attempt uuid;
  v_module text;
  v_limit integer;
begin
  for r in
    select q.*,b.id subscription_id,b.provider,b.payment_method,b.amount_minor,b.currency,
      b.payment_reference,b.paid_at,b.verified_at,b.verified_by,b.current_period_start,b.current_period_end,b.is_comp
    from public.school_billing_quotes q
    join public.billing_subscriptions b on b.id=q.activated_subscription_id and b.school_id=q.school_id
    where q.activated_at is not null and b.status in ('active','trialing','past_due')
      and (q.status<>'active' or b.source_quote_id is null or b.capacity='{}'::jsonb)
    for update of q,b
  loop
    v_capacity:=private.school_quote_capacity((select q from public.school_billing_quotes q where q.id=r.id));
    v_method:=case
      when r.is_comp then 'complimentary'
      when r.provider='paddle' then 'paddle_checkout'
      when r.payment_method='invoice' then 'paddle_invoice'
      when r.payment_method in ('cash','bank_transfer') then r.payment_method
      else 'bank_transfer'
    end;

    update public.school_billing_quotes set
      status='active',
      payment_status=case when r.is_comp then 'waived' else 'paid' end,
      selected_payment_method=v_method,
      agreement_kind=coalesce(agreement_kind,'new_agreement'),
      effective_at=coalesce(effective_at,r.activated_at),
      quote_hash=private.school_quote_integrity_hash((select q from public.school_billing_quotes q where q.id=r.id)),
      updated_at=now()
    where id=r.id;

    update public.school_billing_quotes set
      status='superseded',payment_status='cancelled',superseded_by_quote_id=r.id,updated_at=now()
    where school_id=r.school_id and id<>r.id and activated_at is null
      and status in ('submitted','approved','accepted','payment_pending','payment_failed','scheduled');

    update public.billing_subscriptions set
      source_quote_id=r.id,contract_term=r.contract_term,capacity=v_capacity,
      plan='enterprise',updated_at=now()
    where id=r.subscription_id;

    update public.schools set school_plan='enterprise',trial_ends_at=null,
      settings=jsonb_set(coalesce(settings,'{}'::jsonb),'{max_students}',to_jsonb(r.platform_seats),true),updated_at=now()
    where id=r.school_id;

    foreach v_module in array array['core','cambridge','ielts','writing','admissions']::text[] loop
      v_limit:=case v_module when 'core' then r.platform_seats when 'cambridge' then r.cambridge_seats
        when 'ielts' then r.ielts_seats when 'writing' then r.writing_seats else r.admissions_candidates end;
      insert into public.school_module_entitlements(
        school_id,module_key,enabled,source,starts_at,ends_at,configured_by,notes,seat_limit,source_quote_id,subscription_id
      ) values(
        r.school_id,v_module,v_module='core' or v_limit>0,
        case when r.provider='paddle' then 'paddle' when r.is_comp then 'complimentary' else 'manual_payment' end,
        coalesce(r.current_period_start,r.activated_at),r.current_period_end,r.verified_by,
        concat('Reconciled from verified accepted quote ',r.id),nullif(v_limit,0),r.id,r.subscription_id
      ) on conflict(school_id,module_key) do update set
        enabled=excluded.enabled,source=excluded.source,starts_at=excluded.starts_at,ends_at=excluded.ends_at,
        configured_by=excluded.configured_by,notes=excluded.notes,seat_limit=excluded.seat_limit,
        source_quote_id=excluded.source_quote_id,subscription_id=excluded.subscription_id,updated_at=now();
    end loop;

    select id into v_attempt from public.school_billing_payment_attempts where quote_id=r.id order by created_at desc limit 1;
    if v_attempt is null then
      insert into public.school_billing_payment_attempts(
        quote_id,school_id,method,status,provider,amount_minor,currency,reference,requested_by,
        verified_by,verified_at,paid_at,metadata
      ) values(
        r.id,r.school_id,v_method,case when r.is_comp then 'waived' else 'paid' end,
        case when r.provider='paddle' then 'paddle' else 'manual' end,
        coalesce(r.amount_minor,0),upper(coalesce(r.currency,r.calculation#>>'{pricing_version,currency}','USD')),
        r.payment_reference,r.created_by,r.verified_by,r.verified_at,r.paid_at,
        jsonb_build_object('reconciled_from_subscription_id',r.subscription_id,'historical_activation',true)
      );
    end if;

    if r.admissions_candidates>0 then
      insert into public.school_admission_seat_consumptions(
        school_id,candidate_id,entitlement_id,period_start,period_end,source
      ) select c.school_id,c.id,e.id,coalesce(r.current_period_start,r.activated_at),r.current_period_end,'activation_reconciliation'
      from public.adm_candidates c join public.school_module_entitlements e
        on e.school_id=c.school_id and e.module_key='admissions'
      where c.school_id=r.school_id
      on conflict do nothing;
    end if;
  end loop;
end $$;

notify pgrst,'reload schema';
