-- Enforce daily/weekly XP and coin caps in task reward claims.
-- Also returns requested vs granted rewards so the client can explain capped rewards.

set check_function_bodies = off;

create or replace function public.rpc_claim_task_reward(
  p_task_id text,
  p_event_id text default null,
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
  v_role text := coalesce(auth.role(), '');
  v_task_kind text;
  v_target int;
  v_task_xp int;
  v_task_coins int;
  v_task_gemstones int;
  v_now timestamptz := now();
  v_today_start timestamptz := date_trunc('day', now());
  v_today_end timestamptz := date_trunc('day', now()) + interval '1 day';
  v_week_start timestamptz := date_trunc('week', now());
  v_claim_window_start timestamptz;
  v_period_key text;
  v_event_id text;
  v_idempotency_key text;
  v_progress int := 0;
  v_receipt_id uuid;
  v_profile record;
  v_xp_status jsonb;

  -- Cap enforcement state
  v_level int := 1;
  v_bm_active boolean := false;
  v_boost numeric := 1.0;
  v_daily_xp_cap int := 1000;
  v_daily_coin_cap int := 2000;
  v_weekly_xp_cap int := 6500;
  v_weekly_coin_cap int := 10000;
  v_cap_row record;
  v_today_date date := (now() at time zone 'UTC')::date;
  v_week_date date := (date_trunc('week', now() at time zone 'UTC'))::date;

  v_granted_xp int := 0;
  v_granted_coins int := 0;
  v_granted_gemstones int := 0;
  v_blocked_xp int := 0;
  v_blocked_coins int := 0;
  v_cap_reasons text[] := array[]::text[];
  v_capped boolean := false;
begin
  if v_role not in ('authenticated', 'service_role') then
    raise exception 'rpc_claim_task_reward requires authenticated user context';
  end if;

  if v_user_id is null then
    raise exception 'rpc_claim_task_reward requires authenticated user context';
  end if;

  p_task_id := nullif(trim(coalesce(p_task_id, '')), '');
  if p_task_id is null then
    raise exception 'Task id is required';
  end if;

  if p_task_id = 'task_d1' then
    v_task_kind := 'daily';
    v_target := 3;
    v_task_xp := 175;
    v_task_coins := 350;
    v_task_gemstones := 1;
  elsif p_task_id = 'task_d2' then
    v_task_kind := 'daily';
    v_target := 1;
    v_task_xp := 100;
    v_task_coins := 50;
    v_task_gemstones := 1;
  elsif p_task_id = 'task_w1' then
    v_task_kind := 'weekly';
    v_target := 15;
    v_task_xp := 500;
    v_task_coins := 400;
    v_task_gemstones := 5;
  else
    raise exception 'Task not found';
  end if;

  if v_task_kind = 'daily' then
    v_claim_window_start := v_today_start;
    v_period_key := to_char(v_today_start at time zone 'UTC', 'YYYY-MM-DD');
  else
    v_claim_window_start := v_week_start;
    v_period_key := to_char(v_week_start at time zone 'UTC', 'YYYY-MM-DD');
  end if;

  if p_task_id = 'task_d1' then
    select count(*)::int into v_progress
    from public.activities a
    where a.actor_id = v_user_id
      and a.kind = 'quest_complete'
      and a.created_at >= v_today_start
      and a.created_at < v_today_end;

    if v_progress = 0 then
      select count(distinct qa.quest_session_id)::int into v_progress
      from public.question_attempts qa
      where qa.student_id = v_user_id
        and qa.created_at >= v_today_start
        and qa.created_at < v_today_end
        and qa.quest_session_id is not null;
    end if;
  elsif p_task_id = 'task_d2' then
    select count(*)::int into v_progress
    from public.activities a
    where a.actor_id = v_user_id
      and a.kind in ('pvp_win', 'attack_success')
      and a.created_at >= v_today_start
      and a.created_at < v_today_end;
  else
    select count(*)::int into v_progress
    from public.activities a
    where a.actor_id = v_user_id
      and a.kind = 'task_claimed'
      and a.created_at >= v_week_start;
  end if;

  if v_progress < v_target then
    raise exception 'Task not completed yet';
  end if;

  -- Force canonical identity-bound event keys; do not trust caller-supplied event/idempotency values.
  v_event_id := 'task:' || p_task_id || ':' || v_period_key;
  v_idempotency_key := 'task-claim:' || v_user_id::text || ':' || v_event_id;

  insert into public.reward_event_receipts (
    user_id,
    event_type,
    event_id,
    idempotency_key
  )
  values (
    v_user_id,
    'task_reward_claim',
    v_event_id,
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
      'event_id', v_event_id,
      'task_id', p_task_id,
      'profile', jsonb_build_object(
        'xp', v_profile.xp,
        'coins', v_profile.coins,
        'level', v_profile.level,
        'gemstones', v_profile.gemstones
      ),
      'requested_reward', jsonb_build_object(
        'xp', v_task_xp,
        'coins', v_task_coins,
        'gemstones', v_task_gemstones
      ),
      'reward', jsonb_build_object(
        'xp', v_task_xp,
        'coins', v_task_coins,
        'gemstones', v_task_gemstones
      ),
      'cap_impact', jsonb_build_object(
        'capped', false,
        'blocked_xp', 0,
        'blocked_coins', 0,
        'reasons', jsonb_build_array()
      ),
      'xp_status', v_xp_status,
      'claimed_at', v_now
    );
  end if;

  perform set_config('app.allow_xp_level_write', '1', true);

  select xp, coins, gemstones, level, brains_master_until
    into v_profile
  from public.users
  where id = v_user_id
  for update;

  if not found then
    raise exception 'User profile not found';
  end if;

  v_level := coalesce(v_profile.level, 1);
  v_bm_active := coalesce(v_profile.brains_master_until > now(), false);
  if v_bm_active then
    v_boost := 1.5;
  end if;

  v_daily_xp_cap := floor(1000 * v_boost);
  v_daily_coin_cap := floor((2000 + greatest(v_level - 1, 0) * 200) * v_boost);
  v_weekly_xp_cap := floor(6500 * v_boost);
  v_weekly_coin_cap := floor((10000 + greatest(v_level - 1, 0) * 500) * v_boost);

  insert into public.caps (user_id, daily_reset_at, weekly_reset_at)
  values (v_user_id, v_today_date, v_week_date)
  on conflict (user_id) do nothing;

  select xp_daily_earned, coins_daily_earned, xp_weekly_earned, coins_weekly_earned, daily_reset_at, weekly_reset_at
    into v_cap_row
  from public.caps
  where user_id = v_user_id
  for update;

  if v_cap_row.daily_reset_at is distinct from v_today_date then
    update public.caps
      set xp_daily_earned = 0,
          coins_daily_earned = 0,
          daily_reset_at = v_today_date
    where user_id = v_user_id;

    v_cap_row.xp_daily_earned := 0;
    v_cap_row.coins_daily_earned := 0;
  end if;

  if v_cap_row.weekly_reset_at is distinct from v_week_date then
    update public.caps
      set xp_weekly_earned = 0,
          coins_weekly_earned = 0,
          weekly_reset_at = v_week_date
    where user_id = v_user_id;

    v_cap_row.xp_weekly_earned := 0;
    v_cap_row.coins_weekly_earned := 0;
  end if;

  v_granted_xp := greatest(
    0,
    least(
      v_task_xp,
      v_daily_xp_cap - coalesce(v_cap_row.xp_daily_earned, 0),
      v_weekly_xp_cap - coalesce(v_cap_row.xp_weekly_earned, 0)
    )
  );

  v_granted_coins := greatest(
    0,
    least(
      v_task_coins,
      v_daily_coin_cap - coalesce(v_cap_row.coins_daily_earned, 0),
      v_weekly_coin_cap - coalesce(v_cap_row.coins_weekly_earned, 0)
    )
  );

  v_granted_gemstones := v_task_gemstones;

  v_blocked_xp := greatest(v_task_xp - v_granted_xp, 0);
  v_blocked_coins := greatest(v_task_coins - v_granted_coins, 0);

  if v_blocked_xp > 0 then
    v_capped := true;
    if coalesce(v_cap_row.xp_daily_earned, 0) >= v_daily_xp_cap then
      v_cap_reasons := array_append(v_cap_reasons, 'daily_xp_cap_reached');
    end if;
    if coalesce(v_cap_row.xp_weekly_earned, 0) >= v_weekly_xp_cap then
      v_cap_reasons := array_append(v_cap_reasons, 'weekly_xp_cap_reached');
    end if;
  end if;

  if v_blocked_coins > 0 then
    v_capped := true;
    if coalesce(v_cap_row.coins_daily_earned, 0) >= v_daily_coin_cap then
      v_cap_reasons := array_append(v_cap_reasons, 'daily_coin_cap_reached');
    end if;
    if coalesce(v_cap_row.coins_weekly_earned, 0) >= v_weekly_coin_cap then
      v_cap_reasons := array_append(v_cap_reasons, 'weekly_coin_cap_reached');
    end if;
  end if;

  update public.users
  set xp = greatest(0, coalesce(v_profile.xp, 0) + v_granted_xp),
      coins = greatest(0, coalesce(v_profile.coins, 0) + v_granted_coins),
      gemstones = greatest(0, coalesce(v_profile.gemstones, 0) + v_granted_gemstones)
  where id = v_user_id
  returning xp, coins, level, gemstones into v_profile;

  update public.caps
  set xp_daily_earned = coalesce(xp_daily_earned, 0) + v_granted_xp,
      coins_daily_earned = coalesce(coins_daily_earned, 0) + v_granted_coins,
      xp_weekly_earned = coalesce(xp_weekly_earned, 0) + v_granted_xp,
      coins_weekly_earned = coalesce(coins_weekly_earned, 0) + v_granted_coins
  where user_id = v_user_id;

  insert into public.activities (
    actor_id,
    kind,
    data,
    created_at
  )
  values (
    v_user_id,
    'task_claimed',
    jsonb_build_object(
      'task_id', p_task_id,
      'task_kind', v_task_kind,
      'event_id', v_event_id,
      'xp', v_granted_xp,
      'coins', v_granted_coins,
      'gemstones', v_granted_gemstones,
      'requested_xp', v_task_xp,
      'requested_coins', v_task_coins,
      'requested_gemstones', v_task_gemstones,
      'capped', v_capped,
      'blocked_xp', v_blocked_xp,
      'blocked_coins', v_blocked_coins,
      'cap_reasons', to_jsonb(v_cap_reasons)
    ),
    v_now
  );

  select to_jsonb(xp_status(p_xp => coalesce(v_profile.xp, 0))) into v_xp_status;

  return jsonb_build_object(
    'idempotent', false,
    'receipt_id', v_receipt_id,
    'event_type', 'task_reward_claim',
    'event_id', v_event_id,
    'task_id', p_task_id,
    'profile', jsonb_build_object(
      'xp', v_profile.xp,
      'coins', v_profile.coins,
      'level', v_profile.level,
      'gemstones', v_profile.gemstones
    ),
    'requested_reward', jsonb_build_object(
      'xp', v_task_xp,
      'coins', v_task_coins,
      'gemstones', v_task_gemstones
    ),
    'reward', jsonb_build_object(
      'xp', v_granted_xp,
      'coins', v_granted_coins,
      'gemstones', v_granted_gemstones
    ),
    'cap_impact', jsonb_build_object(
      'capped', v_capped,
      'blocked_xp', v_blocked_xp,
      'blocked_coins', v_blocked_coins,
      'reasons', to_jsonb(v_cap_reasons)
    ),
    'xp_status', v_xp_status,
    'claimed_at', v_now
  );
end;
$$;

grant execute on function public.rpc_claim_task_reward(text, text, int, int, int, text) to authenticated;
grant execute on function public.rpc_claim_task_reward(text, text, int, int, int, text) to service_role;
