-- IELTS Prime bought through Google Play Billing (Android app).
-- Rows are written only by the play_billing edge function (service role)
-- after the purchase token has been verified with the Google Play Developer API.

alter table public.ielts_prime_subscriptions
  add column if not exists provider text not null default 'paddle',
  add column if not exists google_purchase_token text,
  add column if not exists google_product_id text,
  add column if not exists google_base_plan_id text,
  add column if not exists google_order_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ielts_prime_subscriptions_provider_check'
      and conrelid = 'public.ielts_prime_subscriptions'::regclass
  ) then
    alter table public.ielts_prime_subscriptions
      add constraint ielts_prime_subscriptions_provider_check
      check (provider in ('paddle', 'google_play'));
  end if;
end $$;

-- One purchase token can only ever unlock one account.
create unique index if not exists ielts_prime_subscriptions_google_token_key
  on public.ielts_prime_subscriptions (google_purchase_token)
  where google_purchase_token is not null;

-- Google Play rows only count while their paid period has not ended,
-- so a lapsed renewal can never leave Prime switched on.
create or replace function public.has_active_ielts_prime_subscription(p_user_id uuid default null::uuid)
returns boolean
language plpgsql
stable security definer
set search_path to ''
as $function$
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
      )
  );
end;
$function$;

create or replace function public.get_ielts_prime_subscription_status()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_sub public.ielts_prime_subscriptions%rowtype;
begin
  select * into v_sub
  from public.ielts_prime_subscriptions
  where user_id = auth.uid()
  order by updated_at desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'has_subscription', false,
      'status', null,
      'plan', null,
      'provider', null,
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
    'provider', v_sub.provider,
    'current_period_end', v_sub.current_period_end,
    'cancel_at_period_end', v_sub.cancel_at_period_end,
    'management_url', v_sub.management_url,
    'update_payment_url', v_sub.update_payment_url
  );
end;
$function$;

revoke all on function public.has_active_ielts_prime_subscription(uuid) from public, anon;
grant execute on function public.has_active_ielts_prime_subscription(uuid) to authenticated, service_role;
revoke all on function public.get_ielts_prime_subscription_status() from public, anon;
grant execute on function public.get_ielts_prime_subscription_status() to authenticated, service_role;
