-- Enforce school isolation and student-only gameplay at the database boundary.

CREATE OR REPLACE FUNCTION public.set_assignment_tenant_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_teacher_user_id uuid; v_school_id uuid;
BEGIN
  SELECT t.user_id,u.school_id INTO v_teacher_user_id,v_school_id
  FROM public.teachers t JOIN public.users u ON u.id=t.user_id
  WHERE t.id=NEW.teacher_id;
  IF v_teacher_user_id IS NULL THEN RAISE EXCEPTION 'teacher_not_found'; END IF;
  NEW.school_id := v_school_id;
  IF NEW.assignment_mode <> 'custom' AND NEW.batch IS NOT NULL THEN
    SELECT c.id INTO NEW.class_id
    FROM public.class_teacher_assignments cta
    JOIN public.classes c ON c.id=cta.class_id
    WHERE cta.teacher_user_id=v_teacher_user_id AND cta.active
      AND c.class_code=NEW.batch AND c.school_id IS NOT DISTINCT FROM v_school_id
    ORDER BY c.created_at LIMIT 1;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_set_assignment_tenant_scope ON public.assignments;
CREATE TRIGGER trg_set_assignment_tenant_scope BEFORE INSERT OR UPDATE OF teacher_id,batch,assignment_mode
ON public.assignments FOR EACH ROW EXECUTE FUNCTION public.set_assignment_tenant_scope();

UPDATE public.assignments a SET
  school_id=u.school_id,
  class_id=COALESCE(a.class_id,(
    SELECT c.id FROM public.class_teacher_assignments cta
    JOIN public.classes c ON c.id=cta.class_id
    WHERE cta.teacher_user_id=t.user_id AND cta.active
      AND c.class_code=a.batch AND c.school_id IS NOT DISTINCT FROM u.school_id
    ORDER BY c.created_at LIMIT 1
  ))
FROM public.teachers t JOIN public.users u ON u.id=t.user_id
WHERE t.id=a.teacher_id AND (a.school_id IS DISTINCT FROM u.school_id OR a.class_id IS NULL);


CREATE OR REPLACE FUNCTION public.rpc_leaderboard_batch(p_batch text,p_limit integer)
RETURNS TABLE(user_id uuid,username text,xp integer,coins integer,streak integer,batch text,grade integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_school_id uuid := public.get_caller_school_id();
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
 RETURN QUERY SELECT u.id,u.username,coalesce(u.xp,0),coalesce(u.coins,0),coalesce(u.streak,0),u.batch,
   CASE WHEN coalesce(u.grade,'') ~ '^\\d+$' THEN u.grade::int ELSE 0 END
 FROM public.users u
 WHERE u.batch=p_batch AND u.role='student' AND NOT coalesce(u.is_admin,false)
   AND NOT coalesce(u.is_banned,false) AND coalesce(u.admin_visible,true)
   AND u.school_id IS NOT DISTINCT FROM v_school_id
 ORDER BY u.xp DESC,u.coins DESC LIMIT least(greatest(p_limit,1),100);
END; $$;

CREATE OR REPLACE FUNCTION public.rpc_leaderboard_grade(p_grade integer,p_limit integer)
RETURNS TABLE(user_id uuid,username text,xp integer,coins integer,streak integer,batch text,grade integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_school_id uuid := public.get_caller_school_id();
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
 IF p_grade<6 OR p_grade>12 THEN RAISE EXCEPTION 'invalid_grade'; END IF;
 RETURN QUERY SELECT u.id,u.username,coalesce(u.xp,0),coalesce(u.coins,0),coalesce(u.streak,0),u.batch,p_grade
 FROM public.users u
 WHERE u.grade::text=p_grade::text AND u.role='student' AND NOT coalesce(u.is_admin,false)
   AND NOT coalesce(u.is_banned,false) AND coalesce(u.admin_visible,true)
   AND u.school_id IS NOT DISTINCT FROM v_school_id
 ORDER BY u.xp DESC,u.coins DESC LIMIT least(greatest(p_limit,1),100);
END; $$;

CREATE OR REPLACE FUNCTION public.get_school_leaderboard(p_sort_by text DEFAULT 'total_score'::text, p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, username text, avatar_url text, batch text, total_score bigint, xp integer, pvp_score integer, level integer, updated_at timestamp with time zone, school_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_school_id UUID;
BEGIN
    v_school_id := get_caller_school_id();
    
    IF v_school_id IS NULL THEN
        -- Individual user: show all other individuals (no school)
        RETURN QUERY
        SELECT 
            u.id,
            u.username,
            u.avatar_url,
            u.batch,
            (COALESCE(u.xp, 0) + (COALESCE(u.pvp_score, 0) * 10))::BIGINT AS total_score,
            COALESCE(u.xp, 0)::INTEGER,
            COALESCE(u.pvp_score, 0)::INTEGER,
            COALESCE(u.level, 1)::INTEGER,
            u.updated_at,
            u.school_id
        FROM users u
        WHERE u.school_id IS NULL
          AND u.is_banned = FALSE
          AND COALESCE(u.is_admin, FALSE) = FALSE
          AND COALESCE(u.role, 'student') = 'student'
        ORDER BY 
            CASE 
                WHEN p_sort_by = 'xp' THEN COALESCE(u.xp, 0)
                WHEN p_sort_by = 'pvp_score' THEN COALESCE(u.pvp_score, 0)
                ELSE (COALESCE(u.xp, 0) + (COALESCE(u.pvp_score, 0) * 10))
            END DESC
        LIMIT LEAST(p_limit, 100);
        RETURN;
    END IF;
    
    -- School user: same behavior as before
    RETURN QUERY
    SELECT 
        u.id,
        u.username,
        u.avatar_url,
        u.batch,
        (COALESCE(u.xp, 0) + (COALESCE(u.pvp_score, 0) * 10))::BIGINT AS total_score,
        COALESCE(u.xp, 0)::INTEGER,
        COALESCE(u.pvp_score, 0)::INTEGER,
        COALESCE(u.level, 1)::INTEGER,
        u.updated_at,
        u.school_id
    FROM users u
    WHERE u.school_id = v_school_id
      AND u.is_banned = FALSE
      AND COALESCE(u.is_admin, FALSE) = FALSE
      AND COALESCE(u.role, 'student') = 'student'
    ORDER BY 
        CASE 
            WHEN p_sort_by = 'xp' THEN COALESCE(u.xp, 0)
            WHEN p_sort_by = 'pvp_score' THEN COALESCE(u.pvp_score, 0)
            ELSE (COALESCE(u.xp, 0) + (COALESCE(u.pvp_score, 0) * 10))
        END DESC
    LIMIT LEAST(p_limit, 100);
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_attack_targets(p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, username text, level integer, coins integer, batch text, avatar_url text, last_seen timestamp with time zone, attack_power integer, defense_power integer, last_attacked_at timestamp with time zone, xp integer, has_shield boolean, clan_id uuid, clan_name text, school_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id UUID;
    v_school_id UUID;
BEGIN
    v_user_id := auth.uid();
    v_school_id := get_caller_school_id();
    
    IF v_user_id IS NULL THEN
        RETURN;
    END IF;
    
    IF v_school_id IS NULL THEN
        -- Individual user: show other individual players (no school)
        RETURN QUERY
        SELECT 
            u.id,
            u.username,
            COALESCE(u.level, 1)::INTEGER,
            COALESCE(u.coins, 0)::INTEGER,
            u.batch,
            u.avatar_url,
            u.last_seen,
            COALESCE(u.attack_power, 10)::INTEGER,
            COALESCE(u.defense_power, 10)::INTEGER,
            u.last_attacked_at,
            COALESCE(u.xp, 0)::INTEGER,
            EXISTS (
                SELECT 1 FROM inventory i 
                WHERE i.user_id = u.id 
                AND i.kind = 'shield' 
                AND i.state = 'unused'
            ) AS has_shield,
            cm.clan_id,
            cl.name AS clan_name,
            u.school_id
        FROM users u
        LEFT JOIN clan_members cm ON cm.user_id = u.id
        LEFT JOIN clans cl ON cl.id = cm.clan_id
        WHERE u.school_id IS NULL
          AND u.id != v_user_id
          AND COALESCE(u.role, 'student') = 'student'
          AND COALESCE(u.is_admin, FALSE) = FALSE
          AND u.is_banned = FALSE
        ORDER BY u.last_seen DESC NULLS LAST
        LIMIT LEAST(p_limit, 100);
        RETURN;
    END IF;
    
    -- School user: same behavior as before
    RETURN QUERY
    SELECT 
        u.id,
        u.username,
        COALESCE(u.level, 1)::INTEGER,
        COALESCE(u.coins, 0)::INTEGER,
        u.batch,
        u.avatar_url,
        u.last_seen,
        COALESCE(u.attack_power, 10)::INTEGER,
        COALESCE(u.defense_power, 10)::INTEGER,
        u.last_attacked_at,
        COALESCE(u.xp, 0)::INTEGER,
        EXISTS (
            SELECT 1 FROM inventory i 
            WHERE i.user_id = u.id 
            AND i.kind = 'shield' 
            AND i.state = 'unused'
        ) AS has_shield,
        cm.clan_id,
        cl.name AS clan_name,
        u.school_id
    FROM users u
    LEFT JOIN clan_members cm ON cm.user_id = u.id
    LEFT JOIN clans cl ON cl.id = cm.clan_id
    WHERE u.school_id = v_school_id
      AND u.id != v_user_id
      AND COALESCE(u.role, 'student') = 'student'
      AND COALESCE(u.is_admin, FALSE) = FALSE
      AND u.is_banned = FALSE
    ORDER BY u.last_seen DESC NULLS LAST
    LIMIT LEAST(p_limit, 100);
END;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_hack_attempt(p_defender_id uuid, p_request_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_attacker_id uuid := auth.uid();
  v_now timestamptz := now();
  v_existing_response jsonb;
  v_response jsonb;
  v_xp_status jsonb;

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
  canonical_activity_kind text;
  attacker_username text;
  defender_username text;
  
begin
  -- Allow trusted RPC-level XP/level writes under trigger hardening.
  perform set_config('app.allow_xp_level_write', '1', true);

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
  -- ===== Validate =====
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
    coalesce(is_banned, false) as is_banned,
    school_id
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

  -- Capture username NOW, before any RETURNING ... INTO overwrites the record
  attacker_username := attacker.username;
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
    coalesce(is_banned, false) as is_banned,
    school_id
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
  if attacker.school_id is distinct from defender.school_id then
    raise exception 'cross_school_attack_not_allowed';
  end if;


  -- Capture username NOW, before any RETURNING ... INTO could overwrite the record
  defender_username := defender.username;

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
      canonical_activity_kind := 'attack_blocked';
    else
      result_kind := 'pvp_win';
      canonical_activity_kind := 'attack_success';
    end if;

    -- Update attacker (including earnings tracking)
    update public.users
    set xp = xp + xp_delta,
        coins = coins + coins_delta,
        pvp_score = coalesce(pvp_score, 0) + case when result_kind = 'pvp_win' then 1 else 0 end,
        xp_from_pvp = COALESCE(xp_from_pvp, 0) + GREATEST(0, xp_delta),
        coins_from_pvp = COALESCE(coins_from_pvp, 0) + GREATEST(0, coins_delta)
    where id = v_attacker_id
    returning xp, coins, level, gemstones
    into attacker;

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
    canonical_activity_kind := 'attack_failed';

    -- Update attacker (lose XP, lose coins to defender, and lose AP)
    update public.users
    set xp = xp + xp_delta,
        coins = greatest(0, coins - coins_lost_to_def)
    where id = v_attacker_id
    returning xp, coins, level, gemstones
    into attacker;
    
    -- Update defender (gains coins from failed attack, and set cooldown)
    update public.users
    set coins = coins + coins_lost_to_def,
        last_attacked_at = v_now
    where id = p_defender_id;
  end if;

  gemstones_delta := attacker.gemstones - pre_gemstones;

  -- ====== Log activity ======
  -- (attacker_username and defender_username already captured before UPDATEs)

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
      'coins_lost', coins_lost_to_def,
      'defender_username', defender_username
    ),
    v_now
  );

  if canonical_activity_kind is not null then
    insert into public.activities (kind, actor_id, actor_username, target_id, target_username, data, created_at)
    values (
      canonical_activity_kind,
      v_attacker_id,
      attacker_username,
      p_defender_id,
      defender_username,
      jsonb_build_object(
        'legacy_kind', result_kind,
        'xp_delta', xp_delta,
        'coins_delta', coins_delta,
        'coins_stolen', coins_stolen_from_def,
        'coins_lost', coins_lost_to_def,
        'defender_username', defender_username
      ),
      v_now
    );
  end if;

  -- ====== Notifications ======
  -- Root cause fix:
  -- "Under attack" notifications were never generated by rpc_hack_attempt,
  -- so defenders had no real-time attack_incoming event to subscribe to.
  -- Keep notification writes non-blocking so battle resolution never fails.
  begin
    perform public.notify_attack_incoming(
      p_defender_id,
      attacker_username,
      attacker_attack
    );
  exception
    when others then
      raise warning 'notify_attack_incoming failed for defender %, attacker %: %',
        p_defender_id, v_attacker_id, sqlerrm;
  end;

  -- ====== Return result ======
  select to_jsonb(xp_status(p_xp => attacker.xp)) into v_xp_status;

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
      'xp', attacker.xp,
      'coins', attacker.coins,
      'level', attacker.level,
      'gemstones', attacker.gemstones,
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
$function$;
CREATE OR REPLACE FUNCTION public.consume_student_reward_caps(
  p_user_id uuid,
  p_requested_xp integer DEFAULT 0,
  p_requested_coins integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user record;
  v_caps record;
  v_today date := (now() at time zone 'UTC')::date;
  v_week date := (date_trunc('week', now() at time zone 'UTC'))::date;
  v_boost numeric := 1.0;
  v_daily_xp_cap integer;
  v_daily_coin_cap integer;
  v_weekly_xp_cap integer;
  v_weekly_coin_cap integer;
  v_granted_xp integer;
  v_granted_coins integer;
BEGIN
  SELECT role, is_admin, is_banned, level, brains_master_until
  INTO v_user
  FROM public.users
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_user.role <> 'student' OR COALESCE(v_user.is_admin, false) OR COALESCE(v_user.is_banned, false) THEN
    RAISE EXCEPTION 'student_gameplay_only';
  END IF;

  IF v_user.brains_master_until IS NOT NULL AND v_user.brains_master_until > now() THEN
    v_boost := 1.5;
  END IF;

  v_daily_xp_cap := floor(1000 * v_boost);
  v_daily_coin_cap := floor((2000 + greatest(coalesce(v_user.level, 1) - 1, 0) * 200) * v_boost);
  v_weekly_xp_cap := floor(6500 * v_boost);
  v_weekly_coin_cap := floor((10000 + greatest(coalesce(v_user.level, 1) - 1, 0) * 500) * v_boost);

  INSERT INTO public.caps(user_id, daily_reset_at, weekly_reset_at)
  VALUES (p_user_id, v_today, v_week)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_caps FROM public.caps WHERE user_id = p_user_id FOR UPDATE;

  IF v_caps.daily_reset_at IS DISTINCT FROM v_today THEN
    UPDATE public.caps SET xp_daily_earned=0, coins_daily_earned=0, daily_reset_at=v_today WHERE user_id=p_user_id;
    v_caps.xp_daily_earned := 0; v_caps.coins_daily_earned := 0;
  END IF;
  IF v_caps.weekly_reset_at IS DISTINCT FROM v_week THEN
    UPDATE public.caps SET xp_weekly_earned=0, coins_weekly_earned=0, weekly_reset_at=v_week WHERE user_id=p_user_id;
    v_caps.xp_weekly_earned := 0; v_caps.coins_weekly_earned := 0;
  END IF;

  v_granted_xp := greatest(0, least(
    greatest(coalesce(p_requested_xp,0),0),
    v_daily_xp_cap - coalesce(v_caps.xp_daily_earned,0),
    v_weekly_xp_cap - coalesce(v_caps.xp_weekly_earned,0)
  ));
  v_granted_coins := greatest(0, least(
    greatest(coalesce(p_requested_coins,0),0),
    v_daily_coin_cap - coalesce(v_caps.coins_daily_earned,0),
    v_weekly_coin_cap - coalesce(v_caps.coins_weekly_earned,0)
  ));

  UPDATE public.caps SET
    xp_daily_earned=coalesce(xp_daily_earned,0)+v_granted_xp,
    coins_daily_earned=coalesce(coins_daily_earned,0)+v_granted_coins,
    xp_weekly_earned=coalesce(xp_weekly_earned,0)+v_granted_xp,
    coins_weekly_earned=coalesce(coins_weekly_earned,0)+v_granted_coins
  WHERE user_id=p_user_id;

  RETURN jsonb_build_object(
    'granted_xp',v_granted_xp,'granted_coins',v_granted_coins,
    'blocked_xp',greatest(coalesce(p_requested_xp,0)-v_granted_xp,0),
    'blocked_coins',greatest(coalesce(p_requested_coins,0)-v_granted_coins,0)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.consume_student_reward_caps(uuid,integer,integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_quest_answer_node(p_run_id uuid, p_node_index integer, p_answer text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_run RECORD;
  v_node JSONB;
  v_question_id UUID;
  v_correct_answer TEXT;
  v_is_correct BOOLEAN;
  v_reward_xp INTEGER;
  v_reward_coins INTEGER;
  v_xp_delta INTEGER := 0;
  v_coins_delta INTEGER := 0;
  v_new_streak INTEGER;
  v_next_node INTEGER;
  v_new_status TEXT := 'active';
  v_route JSONB;
  v_profile RECORD;
  v_duplicate BOOLEAN := false;
  v_node_count INTEGER;
  v_explanation TEXT;
  v_time_taken_ms INTEGER;
  v_cap_result JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Allow guarded XP/coins profile writes inside this server-authoritative RPC.
  PERFORM set_config('app.allow_xp_level_write', '1', true);

  -- Lock the run row to prevent concurrent modifications
  SELECT * INTO v_run
  FROM quest_runs
  WHERE id = p_run_id AND user_id = v_user_id AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quest run not found or already completed';
  END IF;

  IF v_run.current_node <> p_node_index THEN
    RAISE EXCEPTION 'Node index mismatch. Expected %, got %', v_run.current_node, p_node_index;
  END IF;

  v_route := v_run.route;
  v_node := v_route->p_node_index;
  v_node_count := jsonb_array_length(v_route);

  IF v_node->>'type' NOT IN ('question', 'elite_question') THEN
    RAISE EXCEPTION 'Node % is not a question node', p_node_index;
  END IF;

  IF v_node->>'state' <> 'active' THEN
    RAISE EXCEPTION 'Node % is not active', p_node_index;
  END IF;

  v_question_id := (v_node->>'question_id')::uuid;
  v_correct_answer := v_node->>'correct_option';
  v_explanation := v_node->>'explanation';

  -- Validate answer
  v_is_correct := (p_answer = v_correct_answer);

  -- Calculate rewards (mirrors rpc_submit_mcq_answer logic)
  IF v_is_correct THEN
    -- Advisory lock per user+question to prevent double-dipping
    PERFORM pg_advisory_xact_lock(
      hashtext(v_user_id::text),
      hashtext(COALESCE(v_question_id::text, p_run_id::text))
    );

    -- Check for recent duplicate
    SELECT EXISTS (
      SELECT 1
      FROM question_attempts
      WHERE student_id = v_user_id
        AND question_id = v_question_id
        AND is_correct = true
        AND attempted_at > now() - interval '24 hours'
    ) INTO v_duplicate;

    IF NOT v_duplicate THEN
      v_reward_xp := COALESCE((v_node->'points')::int,
        CASE (v_node->>'difficulty')
          WHEN 'easy' THEN 15
          WHEN 'hard' THEN 30
          ELSE 20
        END);
      v_reward_coins := floor(v_reward_xp * 1.5);
      v_xp_delta := v_reward_xp;
      v_coins_delta := v_reward_coins;
    END IF;
  ELSE
    -- Wrong answer: small XP penalty (matches existing behavior)
    v_xp_delta := -5;
    v_coins_delta := 0;
  END IF;

  -- Consume shared reward caps before balances and run totals are updated.
  IF v_xp_delta > 0 OR v_coins_delta > 0 THEN
    v_cap_result := public.consume_student_reward_caps(
      v_user_id,
      GREATEST(v_xp_delta, 0),
      GREATEST(v_coins_delta, 0)
    );
    IF v_xp_delta > 0 THEN
      v_xp_delta := COALESCE((v_cap_result->>'granted_xp')::int, 0);
    END IF;
    IF v_coins_delta > 0 THEN
      v_coins_delta := COALESCE((v_cap_result->>'granted_coins')::int, 0);
    END IF;
  END IF;

  -- Record the attempt in question_attempts (same as MCQ flow)
  IF v_question_id IS NOT NULL THEN
    INSERT INTO question_attempts (student_id, question_id, answer_given, is_correct, points_earned)
    VALUES (v_user_id, v_question_id, p_answer, v_is_correct,
      CASE WHEN v_is_correct AND NOT v_duplicate THEN v_xp_delta ELSE 0 END);

    -- Update question stats
    UPDATE questions
    SET times_answered = COALESCE(times_answered, 0) + 1,
        times_correct  = COALESCE(times_correct, 0) + CASE WHEN v_is_correct THEN 1 ELSE 0 END
    WHERE id = v_question_id;
  END IF;

  -- Update user profile
  IF v_xp_delta <> 0 OR v_coins_delta <> 0 THEN
    UPDATE users
    SET xp = GREATEST(0, xp + v_xp_delta),
        coins = GREATEST(0, coins + v_coins_delta),
        xp_from_quests = COALESCE(xp_from_quests, 0) + GREATEST(0, v_xp_delta),
        coins_from_quests = COALESCE(coins_from_quests, 0) + GREATEST(0, v_coins_delta)
    WHERE id = v_user_id;
  END IF;

  -- Update streak
  v_new_streak := CASE WHEN v_is_correct THEN v_run.streak + 1 ELSE 0 END;

  -- Advance route state
  v_next_node := p_node_index + 1;

  -- Mark current node as cleared, next as active
  v_route := (
    SELECT jsonb_agg(
      CASE
        WHEN (elem->>'index')::int = p_node_index THEN
          elem || '{"state":"cleared"}'::jsonb
        WHEN (elem->>'index')::int = v_next_node THEN
          elem || '{"state":"active"}'::jsonb
        ELSE elem
      END
      ORDER BY (elem->>'index')::int
    )
    FROM jsonb_array_elements(v_route) AS elem
  );

  -- Check if we've reached the end
  IF v_next_node >= v_node_count THEN
    v_new_status := 'completed';
  END IF;

  -- Update the run
  UPDATE quest_runs
  SET current_node = v_next_node,
      streak = v_new_streak,
      rewards_xp = rewards_xp + GREATEST(0, v_xp_delta),
      rewards_coins = rewards_coins + GREATEST(0, v_coins_delta),
      route = v_route,
      status = v_new_status,
      completed_at = CASE WHEN v_new_status = 'completed' THEN now() ELSE NULL END
  WHERE id = p_run_id;

  -- Log node attempt
  INSERT INTO quest_run_nodes (run_id, node_index, node_type, question_id, answer_given, is_correct, xp_delta, coins_delta)
  VALUES (p_run_id, p_node_index, v_node->>'type', v_question_id, p_answer, v_is_correct, v_xp_delta, v_coins_delta);

  -- Get updated profile
  SELECT xp, coins, level, gemstones INTO v_profile
  FROM users WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'is_correct', v_is_correct,
    'duplicate_reward', v_duplicate,
    'deltas', jsonb_build_object('xp', v_xp_delta, 'coins', v_coins_delta),
    'streak', v_new_streak,
    'next_node_index', v_next_node,
    'run_status', v_new_status,
    'explanation', CASE
      WHEN v_is_correct THEN COALESCE(v_explanation, 'Well done, agent!')
      ELSE 'Incorrect. ' || COALESCE(v_explanation, 'The correct answer was: ' || v_correct_answer)
    END,
    'final_profile_values', jsonb_build_object(
      'xp', v_profile.xp,
      'coins', v_profile.coins,
      'level', v_profile.level,
      'gemstones', v_profile.gemstones
    )
  );
END;
$function$;

DROP FUNCTION IF EXISTS public.rpc_get_assignment_question_analysis(uuid,uuid);
CREATE FUNCTION public.rpc_get_assignment_question_analysis(p_assignment_id uuid,p_teacher_id uuid)
RETURNS TABLE(question_id uuid,order_index integer,question_text text,correct_answer text,total_attempts integer,correct_count integer,incorrect_count integer,accuracy_percent integer,avg_time_ms integer,common_wrong_answers jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM ensure_teacher(p_teacher_id);
 IF NOT EXISTS(SELECT 1 FROM assignments WHERE id=p_assignment_id AND teacher_id=p_teacher_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 RETURN QUERY
 SELECT aq.question_id,aq.order_index,max(saa.question_text),max(saa.correct_answer),count(saa.*)::int,
 count(saa.*) filter(where saa.is_correct)::int,count(saa.*) filter(where not saa.is_correct)::int,
 CASE WHEN count(saa.*)>0 THEN (count(saa.*) filter(where saa.is_correct)*100/count(saa.*))::int ELSE 0 END,
 coalesce(avg(saa.time_taken_ms)::int,0),
 (SELECT jsonb_agg(jsonb_build_object('answer',wrong_answer,'count',cnt))
  FROM (SELECT saa2.student_answer wrong_answer,count(*) cnt FROM student_assignment_answers saa2
   WHERE saa2.assignment_id=p_assignment_id AND saa2.question_id=aq.question_id AND NOT saa2.is_correct
   GROUP BY saa2.student_answer ORDER BY count(*) DESC LIMIT 3) wrong)
 FROM assignment_questions aq
 LEFT JOIN student_assignment_answers saa ON saa.assignment_id=aq.assignment_id AND saa.question_id=aq.question_id
 WHERE aq.assignment_id=p_assignment_id
 GROUP BY aq.question_id,aq.order_index
 ORDER BY aq.order_index;
END; $$;
REVOKE ALL ON FUNCTION public.rpc_get_assignment_question_analysis(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_assignment_question_analysis(uuid,uuid) TO authenticated;


INSERT INTO public.caps(user_id,xp_daily_earned,coins_daily_earned,xp_weekly_earned,coins_weekly_earned,daily_reset_at,weekly_reset_at)
SELECT qr.user_id,
 coalesce(sum(greatest(qrn.xp_delta,0)) filter(where qrn.resolved_at >= date_trunc('day',now())),0)::int,
 coalesce(sum(greatest(qrn.coins_delta,0)) filter(where qrn.resolved_at >= date_trunc('day',now())),0)::int,
 coalesce(sum(greatest(qrn.xp_delta,0)) filter(where qrn.resolved_at >= date_trunc('week',now())),0)::int,
 coalesce(sum(greatest(qrn.coins_delta,0)) filter(where qrn.resolved_at >= date_trunc('week',now())),0)::int,
 (now() at time zone 'UTC')::date,(date_trunc('week',now() at time zone 'UTC'))::date
FROM public.quest_runs qr JOIN public.quest_run_nodes qrn ON qrn.run_id=qr.id JOIN public.users u ON u.id=qr.user_id
WHERE u.role='student' GROUP BY qr.user_id
ON CONFLICT(user_id) DO UPDATE SET
 xp_daily_earned=greatest(caps.xp_daily_earned,excluded.xp_daily_earned),
 coins_daily_earned=greatest(caps.coins_daily_earned,excluded.coins_daily_earned),
 xp_weekly_earned=greatest(caps.xp_weekly_earned,excluded.xp_weekly_earned),
 coins_weekly_earned=greatest(caps.coins_weekly_earned,excluded.coins_weekly_earned),
 daily_reset_at=excluded.daily_reset_at,weekly_reset_at=excluded.weekly_reset_at;

