-- Professional settlement hardening.
-- The accepted package remains the contractual capacity, while the immutable
-- settlement amount records what is actually due now (including proration).

alter table public.school_billing_quotes
  add column if not exists settlement_amount_minor bigint,
  add column if not exists settlement_currency text,
  add column if not exists settlement_calculation jsonb not null default '{}'::jsonb;

update public.school_billing_quotes
set settlement_amount_minor=coalesce(settlement_amount_minor,(calculation#>>'{totals,contract_total_minor}')::bigint),
    settlement_currency=coalesce(settlement_currency,upper(calculation#>>'{pricing_version,currency}')),
    settlement_calculation=case when settlement_calculation='{}'::jsonb then
      jsonb_build_object('kind','full_contract','contract_total_minor',(calculation#>>'{totals,contract_total_minor}')::bigint)
      else settlement_calculation end
where calculation#>>'{totals,contract_total_minor}' is not null;

alter table public.school_billing_quotes
  drop constraint if exists school_billing_quotes_settlement_amount_check;
alter table public.school_billing_quotes
  add constraint school_billing_quotes_settlement_amount_check
  check (settlement_amount_minor is null or settlement_amount_minor>=0);

create index if not exists school_billing_quotes_superseded_by_idx
  on public.school_billing_quotes(superseded_by_quote_id) where superseded_by_quote_id is not null;
create index if not exists school_billing_payment_requested_by_idx
  on public.school_billing_payment_attempts(requested_by) where requested_by is not null;
create index if not exists school_billing_payment_verified_by_idx
  on public.school_billing_payment_attempts(verified_by) where verified_by is not null;
create index if not exists school_capacity_amendments_school_idx
  on public.school_capacity_amendments(school_id);
create index if not exists school_capacity_amendments_payment_idx
  on public.school_capacity_amendments(payment_attempt_id) where payment_attempt_id is not null;
create index if not exists school_admission_consumption_entitlement_idx
  on public.school_admission_seat_consumptions(entitlement_id) where entitlement_id is not null;
create index if not exists school_admission_consumption_candidate_idx
  on public.school_admission_seat_consumptions(candidate_id);

create or replace function private.school_quote_integrity_hash(p_quote public.school_billing_quotes)
returns text language sql stable security definer set search_path='' as $$
  select encode(extensions.digest(convert_to(concat_ws('|',
    p_quote.id::text,p_quote.school_id::text,p_quote.pricing_version_code,p_quote.contract_term,
    p_quote.platform_seats::text,p_quote.cambridge_seats::text,p_quote.ielts_seats::text,
    p_quote.writing_seats::text,p_quote.admissions_candidates::text,
    coalesce(p_quote.calculation#>>'{totals,contract_total_minor}',''),
    coalesce(p_quote.calculation#>>'{pricing_version,currency}',''),
    coalesce(p_quote.settlement_amount_minor::text,''),coalesce(p_quote.settlement_currency,'')
  ),'UTF8'),'sha256'),'hex');
$$;
revoke all on function private.school_quote_integrity_hash(public.school_billing_quotes) from public,anon,authenticated,service_role;

update public.school_billing_quotes q
set quote_hash=private.school_quote_integrity_hash(q),updated_at=now()
where q.quote_hash is not null and q.settlement_amount_minor is not null;

create or replace function public.school_head_accept_billing_quote(p_quote_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=(select auth.uid()); v_quote public.school_billing_quotes%rowtype;
  v_current jsonb; v_target jsonb; v_active public.billing_subscriptions%rowtype;
  v_active_quote public.school_billing_quotes%rowtype;
  v_kind text; v_effective timestamptz; v_hash text; v_other record;
  v_contract_total bigint; v_currency text; v_old_total bigint; v_new_total bigint;
  v_period_seconds numeric; v_remaining_seconds numeric; v_settlement bigint; v_proration jsonb;
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
  if v_active.source_quote_id is not null then
    select * into v_active_quote from public.school_billing_quotes where id=v_active.source_quote_id;
  end if;
  v_current:=coalesce(private.school_current_capacity(v_quote.school_id),'{}'::jsonb);
  v_target:=private.school_quote_capacity(v_quote);
  v_contract_total:=(v_quote.calculation#>>'{totals,contract_total_minor}')::bigint;
  v_currency:=upper(v_quote.calculation#>>'{pricing_version,currency}');
  v_settlement:=v_contract_total;
  v_proration:=jsonb_build_object('kind','full_contract','contract_total_minor',v_contract_total);

  if v_active.id is null then
    v_kind:='new_agreement'; v_effective:=now();
  elsif coalesce(v_active.contract_term,'')<>v_quote.contract_term
     or (v_target->>'platform')::integer<=(v_current->>'platform')::integer
     and (v_target->>'cambridge')::integer<=(v_current->>'cambridge')::integer
     and (v_target->>'ielts')::integer<=(v_current->>'ielts')::integer
     and (v_target->>'writing')::integer<=(v_current->>'writing')::integer
     and (v_target->>'admissions')::integer<=(v_current->>'admissions')::integer
     or (v_target->>'platform')::integer<(v_current->>'platform')::integer
     or (v_target->>'cambridge')::integer<(v_current->>'cambridge')::integer
     or (v_target->>'ielts')::integer<(v_current->>'ielts')::integer
     or (v_target->>'writing')::integer<(v_current->>'writing')::integer
     or (v_target->>'admissions')::integer<(v_current->>'admissions')::integer then
    v_kind:='renewal_change';
    v_effective:=coalesce(v_active.current_period_end,now()+interval '30 days');
  else
    if v_active_quote.id is null or v_active.current_period_start is null or v_active.current_period_end is null then
      return jsonb_build_object('success',false,'error','The active agreement must be reconciled before an exact prorated upgrade can be accepted. No charge or capacity change was made.');
    end if;
    if upper(v_active_quote.calculation#>>'{pricing_version,currency}')<>v_currency then
      return jsonb_build_object('success',false,'error','A mid-term upgrade must use the active agreement currency.');
    end if;
    v_old_total:=(v_active_quote.calculation#>>'{totals,renewal_total_minor}')::bigint;
    v_new_total:=(v_quote.calculation#>>'{totals,renewal_total_minor}')::bigint;
    if v_new_total<=v_old_total then
      v_kind:='renewal_change';
      v_effective:=v_active.current_period_end;
    else
      v_kind:='upgrade'; v_effective:=now();
      v_period_seconds:=extract(epoch from (v_active.current_period_end-v_active.current_period_start));
      v_remaining_seconds:=greatest(0,extract(epoch from (v_active.current_period_end-now())));
      if v_period_seconds<=0 or v_remaining_seconds<=0 then
        return jsonb_build_object('success',false,'error','The current billing period has ended. Refresh the agreement before accepting this change.');
      end if;
      v_settlement:=ceil((v_new_total-v_old_total)::numeric*least(1,v_remaining_seconds/v_period_seconds))::bigint;
      v_proration:=jsonb_build_object(
        'kind','prorated_upgrade','old_contract_minor',v_old_total,'new_contract_minor',v_new_total,
        'period_start',v_active.current_period_start,'period_end',v_active.current_period_end,
        'remaining_fraction',round(least(1,v_remaining_seconds/v_period_seconds),8),'amount_due_minor',v_settlement
      );
    end if;
  end if;

  if v_kind='renewal_change' then
    v_settlement:=v_contract_total;
    v_proration:=jsonb_build_object('kind','renewal','contract_total_minor',v_contract_total,'effective_at',v_effective);
  end if;
  v_quote.settlement_amount_minor:=v_settlement;
  v_quote.settlement_currency:=v_currency;
  v_hash:=private.school_quote_integrity_hash(v_quote);

  for v_other in
    select * from public.school_billing_quotes q
    where q.school_id=v_quote.school_id and q.id<>v_quote.id and q.activated_at is null
      and q.status in ('submitted','approved','accepted','payment_pending','payment_failed','scheduled') for update
  loop
    update public.school_billing_quotes set status='superseded',payment_status='cancelled',
      superseded_by_quote_id=v_quote.id,updated_at=now() where id=v_other.id;
    update public.school_billing_payment_attempts set status='cancelled',updated_at=now()
      where quote_id=v_other.id and status in ('pending','checkout_created','invoice_issued');
    insert into public.school_billing_quote_events(quote_id,school_id,actor_user_id,event_type,from_status,to_status,note,snapshot)
    values(v_other.id,v_other.school_id,v_actor,'superseded',v_other.status,'superseded',
      'Superseded when the School Head accepted another approved proposal.',jsonb_build_object('superseded_by_quote_id',v_quote.id));
  end loop;

  update public.school_billing_quotes set
    status=case when v_kind='renewal_change' then 'scheduled' else 'accepted' end,
    payment_status=case when v_kind='renewal_change' then 'not_required_yet' else 'not_started' end,
    accepted_at=now(),scheduled_at=case when v_kind='renewal_change' then now() else null end,
    agreement_kind=v_kind,effective_at=v_effective,settlement_amount_minor=v_settlement,
    settlement_currency=v_currency,settlement_calculation=v_proration,quote_hash=v_hash,updated_at=now()
  where id=v_quote.id returning * into v_quote;
  insert into public.school_billing_quote_events(quote_id,school_id,actor_user_id,event_type,from_status,to_status,note,snapshot)
  values(v_quote.id,v_quote.school_id,v_actor,'accepted','approved',v_quote.status,
    case when v_kind='renewal_change' then 'Accepted for renewal. Current capacities remain unchanged until the effective date.'
      when v_kind='upgrade' then 'Accepted as an immediate seat increase with an immutable prorated settlement.'
      else 'Accepted by School Head. Verified payment is required before activation.' end,
    jsonb_build_object('agreement_kind',v_kind,'effective_at',v_effective,'capacity',v_target,'quote_hash',v_hash,
      'settlement_amount_minor',v_settlement,'settlement_currency',v_currency,'settlement_calculation',v_proration));
  return jsonb_build_object('success',true,'quote',to_jsonb(v_quote),'agreement_kind',v_kind,'effective_at',v_effective,
    'settlement_amount_minor',v_settlement,'settlement_currency',v_currency);
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
  if v_quote.agreement_kind='upgrade' and p_method in ('paddle_checkout','paddle_invoice') then
    return jsonb_build_object('success',false,'error','Mid-term upgrades use the exact prorated bank or cash settlement shown here. Paddle checkout resumes at renewal; no full-term Paddle charge was created.');
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
  insert into public.school_billing_payment_attempts(quote_id,school_id,method,status,provider,amount_minor,currency,requested_by)
  values(v_quote.id,v_quote.school_id,p_method,'pending',case when p_method like 'paddle_%' then 'paddle' else 'manual' end,
    v_quote.settlement_amount_minor,upper(v_quote.settlement_currency),v_actor) returning * into v_attempt;
  update public.school_billing_quotes set status='payment_pending',payment_status='pending',selected_payment_method=p_method,updated_at=now()
    where id=v_quote.id returning * into v_quote;
  insert into public.school_billing_quote_events(quote_id,school_id,actor_user_id,event_type,from_status,to_status,note,snapshot)
  values(v_quote.id,v_quote.school_id,v_actor,'payment_selected','accepted','payment_pending','School Head selected a payment route.',
    jsonb_build_object('method',p_method,'attempt_id',v_attempt.id,'amount_minor',v_attempt.amount_minor,'currency',v_attempt.currency));
  return jsonb_build_object('success',true,'quote',to_jsonb(v_quote),'payment_attempt_id',v_attempt.id,'payment_attempt',to_jsonb(v_attempt));
end; $$;
revoke all on function public.school_head_choose_quote_payment(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.school_head_choose_quote_payment(uuid,text) to authenticated;

-- Both activation surfaces use the immutable settlement, never a caller-entered
-- interpretation of what is due. This includes exact prorated upgrade amounts.
create or replace function public.admin_activate_school_quote_manual(
  p_quote_id uuid,p_payment_method text,p_amount_minor bigint,p_currency text,p_reference text,p_notes text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=(select auth.uid()); v_quote public.school_billing_quotes%rowtype;
  v_attempt public.school_billing_payment_attempts%rowtype; v_expected bigint; v_currency text; v_existing_end timestamptz;
begin
  if v_actor is null or not public.is_superadmin(v_actor) then raise exception using errcode='42501',message='platform_administrator_access_required'; end if;
  if p_payment_method='invoice' then return jsonb_build_object('success',false,'error','Issuing an invoice does not prove payment. Use “paid invoice” only after settlement.'); end if;
  if p_payment_method not in ('cash','bank_transfer','invoice_paid','complimentary') then
    return jsonb_build_object('success',false,'error','Choose cash, cleared bank transfer, paid invoice, or complimentary authority.');
  end if;
  select * into v_quote from public.school_billing_quotes where id=p_quote_id for update;
  if v_quote.id is null or v_quote.status not in ('accepted','payment_pending','payment_failed','scheduled') or v_quote.activated_at is not null then
    return jsonb_build_object('success',false,'error','Choose a current quote awaiting verified activation.');
  end if;
  v_expected:=v_quote.settlement_amount_minor; v_currency:=upper(v_quote.settlement_currency);
  if v_expected is null or v_currency is null then return jsonb_build_object('success',false,'error','The immutable settlement amount is missing.'); end if;
  if upper(trim(coalesce(p_currency,'')))<>v_currency then return jsonb_build_object('success',false,'error','Payment currency must match the accepted settlement.'); end if;
  if p_payment_method='complimentary' then
    if coalesce(p_amount_minor,0)<>0 or char_length(trim(coalesce(p_reference,'')))<4 or char_length(trim(coalesce(p_notes,'')))<20 then
      return jsonb_build_object('success',false,'error','Complimentary access requires a zero amount, authority reference, and a reason of at least 20 characters.'); end if;
  elsif p_amount_minor<>v_expected or char_length(trim(coalesce(p_reference,'')))<4 then
    return jsonb_build_object('success',false,'error','Verified amount must exactly match the immutable accepted settlement and include a reference.');
  end if;
  select * into v_attempt from public.school_billing_payment_attempts a where a.quote_id=v_quote.id
    and a.status in ('pending','checkout_created','invoice_issued') order by a.created_at desc limit 1 for update;
  if v_attempt.id is null then
    insert into public.school_billing_payment_attempts(quote_id,school_id,method,status,provider,amount_minor,currency,reference,requested_by)
    values(v_quote.id,v_quote.school_id,case when p_payment_method='invoice_paid' then 'paddle_invoice' else p_payment_method end,
      'pending','manual',p_amount_minor,v_currency,p_reference,v_actor) returning * into v_attempt;
  end if;
  select b.current_period_end into v_existing_end from public.billing_subscriptions b where b.school_id=v_quote.school_id
    and b.status in ('active','trialing','past_due') order by b.updated_at desc,b.created_at desc limit 1;
  return private.activate_school_quote_now(v_quote.id,v_attempt.id,'manual',p_payment_method,p_amount_minor,v_currency,
    p_reference,now(),case when v_quote.agreement_kind='upgrade' then v_existing_end else null end,null,null,null,v_actor,p_notes);
end; $$;
revoke all on function public.admin_activate_school_quote_manual(uuid,text,bigint,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.admin_activate_school_quote_manual(uuid,text,bigint,text,text,text) to authenticated;

create or replace function public.activate_school_quote_from_paddle(
  p_quote_id uuid,p_payment_attempt_id uuid,p_quote_hash text,p_amount_minor bigint,p_currency text,
  p_transaction_id text,p_subscription_id text,p_customer_id text,p_period_start timestamptz,p_period_end timestamptz
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_quote public.school_billing_quotes%rowtype; v_attempt public.school_billing_payment_attempts%rowtype; v_expected bigint; v_currency text;
begin
  select * into v_quote from public.school_billing_quotes where id=p_quote_id for update;
  select * into v_attempt from public.school_billing_payment_attempts where id=p_payment_attempt_id and quote_id=p_quote_id for update;
  if v_quote.id is null or v_attempt.id is null or v_attempt.provider<>'paddle' then return jsonb_build_object('success',false,'error','Paddle quote payment attempt not found.'); end if;
  if v_quote.quote_hash is null or v_quote.quote_hash<>p_quote_hash or v_quote.quote_hash<>private.school_quote_integrity_hash(v_quote) then
    raise exception using errcode='P0001',message='paddle_quote_integrity_check_failed'; end if;
  v_expected:=v_quote.settlement_amount_minor; v_currency:=upper(v_quote.settlement_currency);
  if upper(trim(coalesce(p_currency,'')))<>v_currency or p_amount_minor<>v_expected then
    raise exception using errcode='P0001',message='paddle_payment_does_not_equal_accepted_settlement'; end if;
  return private.activate_school_quote_now(v_quote.id,v_attempt.id,'paddle','paddle',p_amount_minor,v_currency,
    p_transaction_id,p_period_start,p_period_end,p_customer_id,p_subscription_id,p_transaction_id,null,
    'Verified automatically from a signed Paddle webhook.');
end; $$;
revoke all on function public.activate_school_quote_from_paddle(uuid,uuid,text,bigint,text,text,text,text,timestamptz,timestamptz)
  from public,anon,authenticated,service_role;
grant execute on function public.activate_school_quote_from_paddle(uuid,uuid,text,bigint,text,text,text,text,timestamptz,timestamptz)
  to service_role;

comment on column public.school_billing_quotes.settlement_amount_minor is
  'Immutable amount due for this accepted decision. Full contract for new/renewal agreements; exact time proration for an immediate upgrade.';
