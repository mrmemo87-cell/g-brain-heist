-- Canonical reward RPC hardening: service-role-only execution + fail-closed runtime guards.

set check_function_bodies = off;

create or replace function public.rpc_apply_reward_delta(
  p_xp_delta int default 0,
  p_coins_delta int default 0,
  p_gemstones_delta int default 0,
  p_apply_level_milestone boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile record;
  v_previous_level int := 1;
  v_next_xp int := 0;
  v_next_coins int := 0;
  v_next_gemstones int := 0;
  v_xp_status jsonb;
  v_next_level int := 1;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'rpc_apply_reward_delta is disabled for client roles; use a server-verified reward flow';
  end if;

  if v_user_id is null then
    raise exception 'rpc_apply_reward_delta requires authenticated user context';
  end if;

  if abs(coalesce(p_xp_delta, 0)) > 100000
     or abs(coalesce(p_coins_delta, 0)) > 100000
     or abs(coalesce(p_gemstones_delta, 0)) > 1000 then
    raise exception 'Reward delta exceeds safety cap';
  end if;

  perform set_config('app.allow_xp_level_write', '1', true);

  select xp, coins, gemstones, level
  into v_profile
  from public.users
  where id = v_user_id
  for update;

  if not found then
    raise exception 'User profile not found';
  end if;

  v_previous_level := coalesce(v_profile.level, 1);
  v_next_xp := greatest(0, coalesce(v_profile.xp, 0) + coalesce(p_xp_delta, 0));
  v_next_coins := greatest(0, coalesce(v_profile.coins, 0) + coalesce(p_coins_delta, 0));
  v_next_gemstones := greatest(0, coalesce(v_profile.gemstones, 0) + coalesce(p_gemstones_delta, 0));

  select to_jsonb(xp_status(p_xp => v_next_xp)) into v_xp_status;
  v_next_level := coalesce((v_xp_status->>'level')::int, v_previous_level);

  if p_apply_level_milestone and v_next_level > v_previous_level then
    if v_next_level % 5 = 0 then
      v_next_gemstones := v_next_gemstones + 1;
    end if;
  end if;

  update public.users
  set xp = v_next_xp,
      coins = v_next_coins,
      gemstones = v_next_gemstones
  where id = v_user_id
  returning xp, coins, level, gemstones
  into v_profile;

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'xp', v_profile.xp,
      'coins', v_profile.coins,
      'level', v_profile.level,
      'gemstones', v_profile.gemstones
    ),
    'xp_status', v_xp_status,
    'previous_level', v_previous_level
  );
end;
$$;

create or replace function public.rpc_grant_levelup_rewards(p_new_level int)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'rpc_grant_levelup_rewards is disabled for client roles; use a server-verified level-up flow';
  end if;

  if v_user_id is null then
    raise exception 'rpc_grant_levelup_rewards requires authenticated user context';
  end if;

  if p_new_level is null or p_new_level < 1 then
    raise exception 'Invalid level';
  end if;

  if p_new_level is distinct from (
    select level from public.users where id = v_user_id
  ) then
    raise exception 'Invalid level context for reward grant';
  end if;

  -- Fail-closed by design until event-bound claims are fully wired.
  return json_build_object(
    'coins', 0,
    'ap_refill', false,
    'message', 'Level-up reward minting disabled pending event-bound flow'
  );
end;
$$;

revoke execute on function public.rpc_apply_reward_delta(int, int, int, boolean) from public;
revoke execute on function public.rpc_apply_reward_delta(int, int, int, boolean) from anon;
revoke execute on function public.rpc_apply_reward_delta(int, int, int, boolean) from authenticated;
grant execute on function public.rpc_apply_reward_delta(int, int, int, boolean) to service_role;

revoke execute on function public.rpc_grant_levelup_rewards(int) from public;
revoke execute on function public.rpc_grant_levelup_rewards(int) from anon;
revoke execute on function public.rpc_grant_levelup_rewards(int) from authenticated;
grant execute on function public.rpc_grant_levelup_rewards(int) to service_role;
