-- Owner request 2026-11-06: the "transfer to confirm" email must say who paid, so the owner can match it in MBank
-- without opening the site. The alert goes only to the owner's own inbox (PLATFORM_ALERT_EMAIL).
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
  v_phone text := nullif(left(trim(coalesce(p_payer_phone, '')), 40), '');
  v_ref text := nullif(left(trim(coalesce(p_reference, '')), 120), '');
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
  select coalesce(jsonb_object_agg(k, left(v_attr->>k, 200)), '{}'::jsonb) into v_attr
  from unnest(array['source', 'medium', 'campaign', 'content', 'term']) k
  where v_attr ? k and jsonb_typeof(v_attr->k) = 'string';

  insert into public.ielts_manual_payments (user_id, plan, amount_som, method, payer_name, payer_phone, reference, attribution)
  values (v_actor, p_plan, v_amount, p_method, v_name, v_phone, v_ref, v_attr)
  returning id into v_id;

  insert into public.transactional_email_outbox (event_type, category, audience, template_key, payload, idempotency_key)
  values ('ielts_manual_payment_submitted', 'platform_operations', 'platform_owner', 'owner_ielts_manual_payment',
          jsonb_build_object('payment_id', v_id, 'plan', p_plan, 'amount_som', v_amount, 'method', p_method,
                             'payer_name', v_name, 'payer_phone', v_phone, 'reference', v_ref, 'submitted_at', now()),
          'owner-ielts-manual-payment-' || v_id)
  on conflict (idempotency_key) do nothing;

  return jsonb_build_object('id', v_id, 'status', 'pending', 'amount_som', v_amount);
end;
$$;
revoke all on function public.rpc_ielts_manual_payment_submit(text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.rpc_ielts_manual_payment_submit(text, text, text, text, text, jsonb) to authenticated;
