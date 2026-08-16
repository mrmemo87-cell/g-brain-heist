-- Permit a School Head to settle an immediate capacity upgrade through an
-- exact Paddle subscription proration. Paddle invoice remains a new/renewal
-- route because changing a live automatic subscription to manual collection
-- mid-period would be surprising and operationally unsafe.

create or replace function public.school_head_choose_quote_payment(p_quote_id uuid,p_method text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=(select auth.uid());
  v_quote public.school_billing_quotes%rowtype;
  v_attempt public.school_billing_payment_attempts%rowtype;
begin
  select * into v_quote from public.school_billing_quotes where id=p_quote_id for update;
  if v_actor is null or v_quote.id is null or not public.is_school_owner(v_quote.school_id) then
    raise exception using errcode='42501',message='school_head_access_required';
  end if;
  if p_method not in ('paddle_checkout','paddle_invoice','bank_transfer','cash') then
    return jsonb_build_object('success',false,'error','Choose online payment, a Paddle invoice, bank transfer, or cash.');
  end if;
  if v_quote.agreement_kind='upgrade' and p_method='paddle_invoice' then
    return jsonb_build_object('success',false,'error','Immediate upgrades charge the saved Paddle payment method after an exact proration preview. Paddle invoices remain available for new agreements and renewals.');
  end if;
  if v_quote.status not in ('accepted','payment_failed','scheduled') or v_quote.activated_at is not null then
    return jsonb_build_object('success',false,'error','This quote is not awaiting a payment decision.');
  end if;
  if v_quote.status='scheduled' and v_quote.effective_at>now()+interval '30 days' then
    return jsonb_build_object('success',false,'error','This renewal change is scheduled. Payment opens 30 days before it takes effect.');
  end if;
  if v_quote.settlement_amount_minor is null or v_quote.settlement_currency is null then
    return jsonb_build_object('success',false,'error','The immutable settlement amount is missing. Ask Brains Heist to review this agreement; no payment was started.');
  end if;

  update public.school_billing_payment_attempts set status='cancelled',updated_at=now()
  where quote_id=v_quote.id and status in ('pending','checkout_created','invoice_issued');
  insert into public.school_billing_payment_attempts(
    quote_id,school_id,method,status,provider,amount_minor,currency,requested_by
  ) values(
    v_quote.id,v_quote.school_id,p_method,'pending',
    case when p_method like 'paddle_%' then 'paddle' else 'manual' end,
    v_quote.settlement_amount_minor,upper(v_quote.settlement_currency),v_actor
  ) returning * into v_attempt;
  update public.school_billing_quotes
  set status='payment_pending',payment_status='pending',selected_payment_method=p_method,updated_at=now()
  where id=v_quote.id returning * into v_quote;
  insert into public.school_billing_quote_events(
    quote_id,school_id,actor_user_id,event_type,from_status,to_status,note,snapshot
  ) values(
    v_quote.id,v_quote.school_id,v_actor,'payment_selected','accepted','payment_pending',
    'School Head selected a payment route.',
    jsonb_build_object('method',p_method,'attempt_id',v_attempt.id,'amount_minor',v_attempt.amount_minor,
      'currency',v_attempt.currency,'agreement_kind',v_quote.agreement_kind)
  );
  return jsonb_build_object('success',true,'quote',to_jsonb(v_quote),
    'payment_attempt_id',v_attempt.id,'payment_attempt',to_jsonb(v_attempt));
end;
$$;

revoke all on function public.school_head_choose_quote_payment(uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.school_head_choose_quote_payment(uuid,text) to authenticated;

comment on function public.school_head_choose_quote_payment(uuid,text) is
  'Creates one auditable payment attempt for an accepted school agreement. Paddle checkout supports new agreements, renewals, and exact-preview immediate upgrades.';
