-- Make task reward claiming safe for direct authenticated client RPC invocation.
-- Canonical task rewards, eligibility, and idempotency remain database-owned.

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
      'reward', jsonb_build_object(
        'xp', v_task_xp,
        'coins', v_task_coins,
        'gemstones', v_task_gemstones
      ),
      'xp_status', v_xp_status,
      'claimed_at', v_now
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

  update public.users
  set xp = greatest(0, coalesce(v_profile.xp, 0) + v_task_xp),
      coins = greatest(0, coalesce(v_profile.coins, 0) + v_task_coins),
      gemstones = greatest(0, coalesce(v_profile.gemstones, 0) + v_task_gemstones)
  where id = v_user_id
  returning xp, coins, level, gemstones into v_profile;

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
      'xp', v_task_xp,
      'coins', v_task_coins,
      'gemstones', v_task_gemstones
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
    'reward', jsonb_build_object(
      'xp', v_task_xp,
      'coins', v_task_coins,
      'gemstones', v_task_gemstones
    ),
    'xp_status', v_xp_status,
    'claimed_at', v_now
  );
end;
$$;

revoke execute on function public.rpc_claim_task_reward(text, text, int, int, int, text) from public;
revoke execute on function public.rpc_claim_task_reward(text, text, int, int, int, text) from anon;
grant execute on function public.rpc_claim_task_reward(text, text, int, int, int, text) to authenticated;
grant execute on function public.rpc_claim_task_reward(text, text, int, int, int, text) to service_role;
