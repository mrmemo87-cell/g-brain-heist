-- Brains Heist PvP Hack Attempt Function
-- Matches our game schema: users, inventory, activities tables
-- Inputs: p_defender_id uuid, p_request_id uuid (optional idempotency key)
-- Uses: auth.uid() as attacker
-- Returns: JSON with outcome + deltas

create or replace function public.rpc_hack_attempt(
  p_defender_id uuid,
  p_request_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attacker_id uuid := auth.uid();
  v_now timestamptz := now();
  v_existing_response jsonb;
  v_response jsonb;
  v_xp_status jsonb;
  v_reward_result jsonb;

  -- ====== CONFIG ======
  c_ap_cost int := 2;                 -- AP cost per hack attempt
  c_shield_defense_bonus int := 20;  -- Shield adds +20 defense
  c_attack_cooldown_seconds int := 300; -- 5 minutes cooldown after being attacked
  c_xp_win int := 30;
  c_coins_steal_percent numeric := 0.10;  -- Steal 10% of defender's coins (MASSIVE THEFT ENABLED)
  c_xp_loss int := -10;               -- XP penalty for loss or blocked
  c_coins_loss_min int := 100;        -- Minimum coins attacker loses to defender on loss
  c_max_steal_percent_win numeric := 0.30;  -- Can steal up to 30% of defender's total coins
  c_coins_loss_percent numeric := 0.35; -- Attacker loses 35% of their coins on loss

  -- ====== Variables ======
  attacker record;
  defender record;
  
  attacker_attack int;
  defender_defense int;
  
  has_shield boolean := false;
  has_cracker boolean := false;
  shield_blocks boolean := false;
  
  win_chance numeric;
  roll numeric;
  is_win boolean;
  
  xp_delta int := 0;
  coins_delta int := 0;
  gemstones_delta int := 0;
  coins_stolen_from_def int := 0;
  coins_lost_to_def int := 0;  -- Coins attacker loses to defender on loss

  current_ap int;
  pre_gemstones int;
  
  result_kind text;
  attacker_username text;
  defender_username text;
  
begin
  if p_request_id is not null then
    select response
    into v_existing_response
    from public.pvp_attack_attempts
    where request_id = p_request_id
      and attacker_id = v_attacker_id;

    if found then
      return v_existing_response;
    end if;
  end if;
  -- ====== Validate ======
  if v_attacker_id is null then
    raise exception 'Not authenticated';
  end if;
  
  if p_defender_id is null or p_defender_id = v_attacker_id then
    raise exception 'Invalid defender';
  end if;

  -- ====== Fetch attacker profile (with row lock) ======
  select
    id, username, level, xp, coins, gemstones, ap_now, ap_max, last_ap_update,
    coalesce(attack_power, 10) as attack_power,
    coalesce(defense_power, 10) as defense_power,
    coalesce(is_admin, false) as is_admin,
    coalesce(role, 'student') as role,
    coalesce(is_banned, false) as is_banned
  into attacker
  from public.users
  where id = v_attacker_id
  for update;

  if not found then
    raise exception 'Attacker not found';
  end if;

  if attacker.is_admin or attacker.role <> 'student' or attacker.is_banned then
    raise exception 'attacker_not_allowed';
  end if;

  pre_gemstones := attacker.gemstones;

  -- Refresh AP based on regeneration before spending
  current_ap := calculate_current_ap(attacker.ap_now, attacker.ap_max, coalesce(attacker.last_ap_update, v_now));

  if current_ap <> attacker.ap_now then
    update public.users
    set ap_now = current_ap,
        last_ap_update = v_now
    where id = v_attacker_id
    returning ap_now into attacker.ap_now;
  else
    attacker.ap_now := current_ap;
  end if;

  -- ====== Fetch defender profile (with row lock) ======
  select 
    id, username, level, xp, coins,
    coalesce(attack_power, 10) as attack_power,
    coalesce(defense_power, 10) as defense_power,
    last_attacked_at,
    coalesce(is_admin, false) as is_admin,
    coalesce(role, 'student') as role,
    coalesce(is_banned, false) as is_banned
  into defender
  from public.users
  where id = p_defender_id
  for update;

  if not found then
    raise exception 'Defender not found';
  end if;

  if defender.is_admin or defender.role <> 'student' or defender.is_banned then
    raise exception 'defender_not_attackable';
  end if;

  -- ====== Check attack cooldown ======
  if defender.last_attacked_at is not null then
    if extract(epoch from (v_now - defender.last_attacked_at)) < c_attack_cooldown_seconds then
      raise exception 'COOLDOWN: This player was recently attacked. Try again in % seconds.',
        c_attack_cooldown_seconds - extract(epoch from (v_now - defender.last_attacked_at))::int;
    end if;
  end if;

  -- Spend AP only after the defender passes validation and cooldown checks
  update public.users
  set ap_now = ap_now - c_ap_cost,
      last_ap_update = v_now
  where id = v_attacker_id
    and ap_now >= c_ap_cost
  returning ap_now into attacker.ap_now;

  if not found then
    raise exception 'Not enough AP';
  end if;

  -- ====== Check for active shield on defender ======
  -- Shield is active if: state='active' AND (expires_at is null OR expires_at > now)
  select exists(
    select 1
    from public.inventory
    where user_id = p_defender_id
      and kind in ('shield', 'firewall')
      and state = 'active'
  and (expires_at is null or expires_at > v_now)
  ) into has_shield;

  -- ====== Check if attacker has cracker in inventory ======
  select exists(
    select 1
    from public.inventory
    where user_id = v_attacker_id
      and kind = 'cracker'
      and state = 'unused'
  ) into has_cracker;

  -- ====== Calculate combat stats ======
  attacker_attack := attacker.attack_power;
  defender_defense := defender.defense_power;

  -- If defender has shield and attacker doesn't use cracker, shield adds bonus defense
  if has_shield and not has_cracker then
    defender_defense := defender_defense + c_shield_defense_bonus;
    shield_blocks := true; -- Shield will block coin theft even if attacker wins
  end if;

  -- If attacker has cracker, consume it and negate shield
  if has_shield and has_cracker then
    -- Consume one cracker
    update public.inventory
    set state = 'consumed'
    where id = (
      select id
      from public.inventory
      where user_id = v_attacker_id
        and kind = 'cracker'
        and state = 'unused'
      limit 1
    );
    
    -- Break the shield
    update public.inventory
  set state = 'consumed', expires_at = v_now
    where user_id = p_defender_id
      and kind in ('shield', 'firewall')
      and state = 'active'
  and (expires_at is null or expires_at > v_now);
    
    shield_blocks := false;
    has_shield := false; -- Shield broken
  end if;

  -- ====== Calculate win probability ======
  -- Simple formula: P(win) = attacker_attack / (attacker_attack + defender_defense)
  win_chance := attacker_attack::numeric / (attacker_attack + defender_defense)::numeric;

  -- ====== Roll for outcome ======
  roll := random();
  is_win := roll < win_chance;

  -- Capture usernames before updates (RETURNING INTO will overwrite attacker record)
  attacker_username := attacker.username;
  defender_username := defender.username;

  -- ====== Apply results ======
  if is_win then
    -- Attacker wins
    xp_delta := c_xp_win;
    
    -- Calculate coins stolen from defender (10% of their balance, capped at 30% max)
    coins_stolen_from_def := least(
      floor(defender.coins * c_coins_steal_percent),
      floor(defender.coins * c_max_steal_percent_win)
    );
    
    coins_delta := coins_stolen_from_def; -- NO BASE COINS, only what you steal
    
    -- If shield blocked, no coin theft
    if shield_blocks then
      coins_stolen_from_def := 0;
      coins_delta := 0;
      result_kind := 'pvp_blocked';
    else
      result_kind := 'pvp_win';
    end if;

    -- Use rpc_apply_reward_delta to safely update attacker XP/coins
    -- (bypasses the "Direct XP/level updates are not allowed" trigger)
    v_reward_result := rpc_apply_reward_delta(
      p_xp_delta := xp_delta,
      p_coins_delta := coins_delta,
      p_gemstones_delta := 0,
      p_apply_level_milestone := true
    );

    -- Update earnings tracking separately (doesn't touch xp/level)
    update public.users
    set xp_from_pvp = COALESCE(xp_from_pvp, 0) + GREATEST(0, xp_delta),
        coins_from_pvp = COALESCE(coins_from_pvp, 0) + GREATEST(0, coins_delta)
    where id = v_attacker_id;

    -- Update defender (lose coins if not blocked, and set cooldown)
    update public.users
    set coins = greatest(0, coins - coins_stolen_from_def),
        last_attacked_at = v_now
    where id = p_defender_id;

  else
    -- Attacker loses
    xp_delta := c_xp_loss;
    
    -- Calculate coins lost to defender (capped at 20% of attacker balance)
    coins_lost_to_def := greatest(
      c_coins_loss_min,
      floor(attacker.coins * c_coins_loss_percent)
    );

    coins_lost_to_def := least(coins_lost_to_def, attacker.coins);
    
    coins_delta := -coins_lost_to_def;  -- Negative because attacker loses coins
    result_kind := 'pvp_loss';

    -- Use rpc_apply_reward_delta to safely update attacker XP/coins
    -- (bypasses the "Direct XP/level updates are not allowed" trigger)
    v_reward_result := rpc_apply_reward_delta(
      p_xp_delta := xp_delta,
      p_coins_delta := coins_delta,
      p_gemstones_delta := 0,
      p_apply_level_milestone := false
    );
    
    -- Update defender (gains coins from failed attack, and set cooldown)
    update public.users
    set coins = coins + coins_lost_to_def,
        last_attacked_at = v_now
    where id = p_defender_id;
  end if;

  gemstones_delta := coalesce((v_reward_result->'profile'->>'gemstones')::int, 0) - pre_gemstones;

  -- ====== Log activity ======
  insert into public.activities (kind, actor_id, actor_username, target_id, target_username, data, created_at)
  values (
    result_kind,
    v_attacker_id,
    attacker_username,
    p_defender_id,
    defender_username,
    jsonb_build_object(
      'details', case 
        when result_kind = 'pvp_win' then 'Stole ' || coins_stolen_from_def || ' Coins'
        when result_kind = 'pvp_blocked' then 'Attack blocked by Shield'
        else 'Lost ' || coins_lost_to_def || ' Coins'
      end,
      'attacker_attack', attacker_attack,
      'defender_defense', defender_defense,
      'win_chance', win_chance,
      'roll', roll,
      'xp_delta', xp_delta,
      'gemstones_delta', gemstones_delta,
      'coins_stolen', coins_stolen_from_def,
      'coins_lost', coins_lost_to_def
    ),
    v_now
  );

  -- ====== Return result ======
  v_xp_status := v_reward_result->'xp_status';

  v_response := jsonb_build_object(
    'result', case 
      when result_kind = 'pvp_win' then 'win'
      when result_kind = 'pvp_blocked' then 'blocked'
      else 'lose'
    end,
    'attacker_deltas', json_build_object(
      'xp', xp_delta,
      'coins', coins_delta,
      'gemstones', gemstones_delta
    ),
    'defender_deltas', json_build_object(
      'coins_loss', case 
        when result_kind = 'pvp_loss' then -coins_lost_to_def  -- Defender gains, so negative loss
        else coins_stolen_from_def  -- Defender loses
      end
    ),
    'shield_state', case
      when not has_shield then 'none'
      when has_cracker then 'removed'
      else 'remaining'
    end,
    'final_profile_values', jsonb_build_object(
      'xp', (v_reward_result->'profile'->>'xp')::int,
      'coins', (v_reward_result->'profile'->>'coins')::int,
      'level', (v_reward_result->'profile'->>'level')::int,
      'gemstones', (v_reward_result->'profile'->>'gemstones')::int,
      'xp_status', v_xp_status
    ),
    'combat_stats', json_build_object(
      'attacker_attack', attacker_attack,
      'defender_defense', defender_defense,
      'win_chance', round(win_chance * 100, 1),
      'roll', round(roll * 100, 1)
    )
  );

  if p_request_id is not null then
    insert into public.pvp_attack_attempts (request_id, attacker_id, defender_id, response)
    values (p_request_id, v_attacker_id, p_defender_id, v_response);
  end if;

  return v_response;
end;
$$;

-- Grant execute permission to authenticated users
grant execute on function public.rpc_hack_attempt(uuid, uuid) to authenticated;
