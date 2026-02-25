-- Apply reward deltas to the current user (XP/coins/gemstones) with XP status output.

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
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Allow XP/level writes so block_direct_xp_level_updates trigger passes
  PERFORM set_config('app.allow_xp_level_write', '1', true);

  select xp, coins, gemstones, level
  into v_profile
  from public.users
  where id = v_user_id
  for update;

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

grant execute on function public.rpc_apply_reward_delta(int, int, int, boolean) to authenticated;
