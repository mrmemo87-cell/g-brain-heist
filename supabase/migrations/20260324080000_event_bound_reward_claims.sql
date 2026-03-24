-- Canonical event-bound, idempotent task reward claims using reward_event_receipts.

set check_function_bodies = off;

create or replace function public.rpc_claim_task_reward(
  p_task_id text,
  p_event_id text,
  p_xp_delta int default 0,
  p_coins_delta int default 0,
  p_gemstones_delta int default 0,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_receipt_id uuid;
  v_idempotency_key text;
  v_profile record;
  v_xp_status jsonb;
  v_next_xp int;
  v_next_coins int;
  v_next_gemstones int;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'rpc_claim_task_reward is disabled for client roles; use server-side reward claims';
  end if;

  if v_user_id is null then
    raise exception 'rpc_claim_task_reward requires authenticated user context';
  end if;

  if nullif(trim(coalesce(p_task_id, '')), '') is null then
    raise exception 'Task id is required';
  end if;

  if nullif(trim(coalesce(p_event_id, '')), '') is null then
    raise exception 'Event id is required';
  end if;

  if coalesce(p_xp_delta, 0) < 0
     or coalesce(p_coins_delta, 0) < 0
     or coalesce(p_gemstones_delta, 0) < 0 then
    raise exception 'Negative reward deltas are not allowed';
  end if;

  if coalesce(p_xp_delta, 0) > 100000
     or coalesce(p_coins_delta, 0) > 100000
     or coalesce(p_gemstones_delta, 0) > 1000 then
    raise exception 'Reward delta exceeds safety cap';
  end if;

  v_idempotency_key := coalesce(nullif(trim(coalesce(p_idempotency_key, '')), ''), 'task:' || p_task_id || ':' || p_event_id);

  insert into public.reward_event_receipts (
    user_id,
    event_type,
    event_id,
    idempotency_key
  )
  values (
    v_user_id,
    'task_reward_claim',
    p_event_id,
    v_idempotency_key
  )
  on conflict do nothing
  returning id into v_receipt_id;

  if v_receipt_id is null then
    select xp, coins, level, gemstones
    into v_profile
    from public.users
    where id = v_user_id;

    if not found then
      raise exception 'User profile not found';
    end if;

    select to_jsonb(xp_status(p_xp => coalesce(v_profile.xp, 0))) into v_xp_status;

    return jsonb_build_object(
      'idempotent', true,
      'event_type', 'task_reward_claim',
      'event_id', p_event_id,
      'task_id', p_task_id,
      'profile', jsonb_build_object(
        'xp', v_profile.xp,
        'coins', v_profile.coins,
        'level', v_profile.level,
        'gemstones', v_profile.gemstones
      ),
      'xp_status', v_xp_status
    );
  end if;

  perform set_config('app.allow_xp_level_write', '1', true);

  select xp, coins, gemstones
  into v_profile
  from public.users
  where id = v_user_id
  for update;

  if not found then
    raise exception 'User profile not found';
  end if;

  v_next_xp := greatest(0, coalesce(v_profile.xp, 0) + coalesce(p_xp_delta, 0));
  v_next_coins := greatest(0, coalesce(v_profile.coins, 0) + coalesce(p_coins_delta, 0));
  v_next_gemstones := greatest(0, coalesce(v_profile.gemstones, 0) + coalesce(p_gemstones_delta, 0));

  update public.users
  set xp = v_next_xp,
      coins = v_next_coins,
      gemstones = v_next_gemstones
  where id = v_user_id
  returning xp, coins, level, gemstones
  into v_profile;

  select to_jsonb(xp_status(p_xp => coalesce(v_profile.xp, 0))) into v_xp_status;

  return jsonb_build_object(
    'idempotent', false,
    'receipt_id', v_receipt_id,
    'event_type', 'task_reward_claim',
    'event_id', p_event_id,
    'task_id', p_task_id,
    'profile', jsonb_build_object(
      'xp', v_profile.xp,
      'coins', v_profile.coins,
      'level', v_profile.level,
      'gemstones', v_profile.gemstones
    ),
    'xp_status', v_xp_status
  );
end;
$$;

revoke execute on function public.rpc_claim_task_reward(text, text, int, int, int, text) from public;
revoke execute on function public.rpc_claim_task_reward(text, text, int, int, int, text) from anon;
revoke execute on function public.rpc_claim_task_reward(text, text, int, int, int, text) from authenticated;
grant execute on function public.rpc_claim_task_reward(text, text, int, int, int, text) to service_role;
