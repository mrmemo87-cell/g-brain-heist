-- Commander Unit Training v1 (Levels 11-20).
--
-- Design goals:
--   * Commander XP unlocks how far units may train.
--   * The shared Brain Heist Coin wallet pays for each upgrade.
--   * Every owned unit progresses independently.
--   * Combat remains server-authoritative: trained stats are baked into the trusted
--     owned-loadout RPC and therefore flow into both practice and PvP snapshots.
--   * PvP rewards remain unchanged/reward-neutral.
begin;

update public.commander_campaigns
set rules = rules || '{
  "unitTrainingBase":50,
  "unitTrainingGrowth":1.20,
  "unitTrainingMaxRank":10,
  "unitGuardHpPerRank":2,
  "unitGuardShieldEvery":3,
  "unitGuardAttackEvery":3,
  "unitArcherHpPerRank":1,
  "unitArcherAttackEvery":2,
  "unitVeteranUnlockLevel":20
}'::jsonb
where active;

create or replace function commander_private.unit_rank_cap(p_level integer, p_rules jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when greatest(1, coalesce(p_level, 1)) < coalesce((p_rules->>'unitTrainingUnlockLevel')::integer, 11)
      then 1
    else least(
      coalesce((p_rules->>'unitTrainingMaxRank')::integer, 10),
      2 + greatest(1, coalesce(p_level, 1)) - coalesce((p_rules->>'unitTrainingUnlockLevel')::integer, 11)
    )
  end;
$$;

create or replace function commander_private.unit_training_cost(p_current_rank integer, p_rules jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select round(
    coalesce((p_rules->>'unitTrainingBase')::numeric, 50)
    * power(
      coalesce((p_rules->>'unitTrainingGrowth')::numeric, 1.20),
      greatest(0, coalesce(p_current_rank, 1) - 1)
    )
  )::integer;
$$;

-- Apply per-unit rank bonuses only inside the trusted server loadout. The bonuses
-- are deliberately modest so Commander training and roster identity remain relevant.
create or replace function commander_private.loadout(p_user uuid, p_campaign text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.commander_profiles;
  rules jsonb;
  w jsonb;
  s jsonb;
  g public.commander_catalog;
  a public.commander_catalog;
  g_rank integer := 1;
  a_rank integer := 1;
  g_steps integer;
  a_steps integer;
begin
  select * into strict p
  from public.commander_profiles
  where user_id = p_user and campaign_id = p_campaign;

  select c.rules into strict rules
  from public.commander_campaigns c
  where c.id = p_campaign;

  select stats into strict w from public.commander_catalog where id = p.weapon;
  select stats into strict s from public.commander_catalog where id = p.shield;
  select * into strict g from public.commander_catalog where id = p.guard;
  select * into strict a from public.commander_catalog where id = p.archer;

  select coalesce(up.unit_rank, 1) into g_rank
  from (select 1) seed
  left join public.commander_unit_progress up
    on up.user_id = p_user
   and up.campaign_id = p_campaign
   and up.item_id = g.id;

  select coalesce(up.unit_rank, 1) into a_rank
  from (select 1) seed
  left join public.commander_unit_progress up
    on up.user_id = p_user
   and up.campaign_id = p_campaign
   and up.item_id = a.id;

  g_steps := greatest(0, g_rank - 1);
  a_steps := greatest(0, a_rank - 1);

  return jsonb_build_object(
    'version', 1,
    'profileVersion', p.version,
    'hp', 100 + 6 * (p.stamina_rank - 1)
      + coalesce((w->>'hp')::integer, 0)
      + coalesce((s->>'hp')::integer, 0),
    'shield', (s->>'shield')::integer + 2 * (p.defense_rank - 1),
    'bolt', 26 + 2 * (p.force_rank - 1) + coalesce((w->>'bolt')::integer, 0),
    'focus', 7 + (p.force_rank - 1) + coalesce((w->>'focus')::integer, 0),
    'guard', 18 + 2 * (p.defense_rank - 1) + coalesce((s->>'guard')::integer, 0),
    'shieldCap', 30 + 2 * (p.defense_rank - 1) + greatest(0, (s->>'shield')::integer - 12),
    'weaponName', (select name from public.commander_catalog where id = p.weapon),
    'shieldName', (select name from public.commander_catalog where id = p.shield),
    'units', jsonb_build_array(
      jsonb_build_object(
        'id', 'player_guard',
        'catalogId', g.id,
        'school', g.school,
        'name', g.name,
        'unitRank', g_rank,
        'hp', (g.stats->>'hp')::integer
          + g_steps * coalesce((rules->>'unitGuardHpPerRank')::integer, 2),
        'shield', (g.stats->>'shield')::integer
          + floor(g_steps::numeric / greatest(1, coalesce((rules->>'unitGuardShieldEvery')::integer, 3)))::integer,
        'attack', (g.stats->>'attack')::integer
          + (p.dexterity_rank - 1)
          + floor(g_steps::numeric / greatest(1, coalesce((rules->>'unitGuardAttackEvery')::integer, 3)))::integer
      ),
      jsonb_build_object(
        'id', 'player_archer',
        'catalogId', a.id,
        'school', a.school,
        'name', a.name,
        'unitRank', a_rank,
        'hp', (a.stats->>'hp')::integer
          + a_steps * coalesce((rules->>'unitArcherHpPerRank')::integer, 1),
        'shield', (a.stats->>'shield')::integer,
        'attack', (a.stats->>'attack')::integer
          + (p.dexterity_rank - 1)
          + floor(a_steps::numeric / greatest(1, coalesce((rules->>'unitArcherAttackEvery')::integer, 2)))::integer
      )
    )
  );
end $$;

create or replace function commander_private.snapshot(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.commander_campaigns;
  p public.commander_profiles;
  commander_level integer;
  unit_cap integer := 1;
begin
  select * into c from public.commander_campaigns where active;
  if not found then raise exception 'commander_unavailable'; end if;

  select * into p
  from public.commander_profiles
  where user_id = p_user and campaign_id = c.id;

  if p.user_id is not null then
    commander_level := commander_private.level(p.xp);
    unit_cap := commander_private.unit_rank_cap(commander_level, c.rules);
  end if;

  return jsonb_build_object(
    'wallet', jsonb_build_object(
      'coins', (select coalesce(coins, 0) from public.users where id = p_user),
      'currency', 'brains_heist_coins'
    ),
    'campaign', jsonb_build_object('id', c.id, 'title', c.title, 'rules', c.rules),
    'profile', case when p.user_id is null then null else
      to_jsonb(p) || jsonb_build_object(
        'coins', (select coalesce(coins, 0) from public.users where id = p_user),
        'level', commander_level,
        'rankCap', least((c.rules->>'maxRank')::integer, 5 + commander_level / 2),
        'unitRankCap', unit_cap
      )
    end,
    'catalog', (
      select coalesce(jsonb_agg(to_jsonb(i) order by i.price, i.id), '[]'::jsonb)
      from public.commander_catalog i
      where i.active
    ),
    'owned', (
      select coalesce(jsonb_agg(item_id order by item_id), '[]'::jsonb)
      from public.commander_owned_items
      where user_id = p_user and campaign_id = c.id
    ),
    'unitProgress', case when p.user_id is null then '[]'::jsonb else (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'itemId', up.item_id,
            'unitRank', up.unit_rank,
            'evolutionTier', up.evolution_tier,
            'trainingPoints', up.training_points,
            'version', up.version,
            'rankCap', unit_cap,
            'maxRank', coalesce((c.rules->>'unitTrainingMaxRank')::integer, 10),
            'nextCost', case
              when up.unit_rank >= coalesce((c.rules->>'unitTrainingMaxRank')::integer, 10) then null
              else commander_private.unit_training_cost(up.unit_rank, c.rules)
            end,
            'veteran', commander_level >= coalesce((c.rules->>'unitVeteranUnlockLevel')::integer, 20)
              and up.unit_rank >= coalesce((c.rules->>'unitTrainingMaxRank')::integer, 10)
          )
          order by up.item_id
        ),
        '[]'::jsonb
      )
      from public.commander_unit_progress up
      join public.commander_owned_items oi
        on oi.user_id = up.user_id
       and oi.campaign_id = up.campaign_id
       and oi.item_id = up.item_id
      join public.commander_catalog i
        on i.id = up.item_id
       and i.kind = 'unit'
      where up.user_id = p_user
        and up.campaign_id = c.id
    ) end,
    'loadout', case when p.user_id is null then null else commander_private.loadout(p_user, c.id) end,
    'history', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
      from (
        select operation, payload, coins_delta, xp_delta, created_at
        from public.commander_transactions
        where user_id = p_user and campaign_id = c.id
        order by created_at desc
        limit 16
      ) t
    )
  );
end $$;

create or replace function public.rpc_commander_command(
  p_request_id uuid,
  p_operation text,
  p_target text default null,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  u uuid := auth.uid();
  c public.commander_campaigns;
  p public.commander_profiles;
  i public.commander_catalog;
  old public.commander_transactions;
  up public.commander_unit_progress;
  cost integer := 0;
  starter_grant integer;
  wallet bigint;
  rank_now integer;
  cap integer;
  commander_level integer;
  body jsonb := jsonb_build_object('target', p_target);
begin
  perform commander_private.student(u);

  if p_request_id is null
     or p_operation is null
     or p_operation not in ('enroll', 'buy', 'equip', 'train', 'unit_train', 'goal') then
    raise exception 'commander_invalid_command';
  end if;

  select * into c from public.commander_campaigns where active;
  if not found then raise exception 'commander_unavailable'; end if;

  -- Serializes all Commander wallet/progression mutations for this campaign/user,
  -- including the first enrollment before a profile row exists.
  perform pg_advisory_xact_lock(hashtextextended(u::text || ':' || c.id, 0));

  select coalesce(coins, 0) into strict wallet
  from public.users
  where id = u
  for update;

  select * into old
  from public.commander_transactions
  where user_id = u and campaign_id = c.id and request_id = p_request_id;

  if found then
    if old.operation <> p_operation or old.payload <> body then
      raise exception 'commander_request_conflict';
    end if;
    return commander_private.snapshot(u);
  end if;

  if p_operation = 'enroll' then
    insert into public.commander_profiles(user_id, campaign_id, coins)
    values (u, c.id, 0)
    on conflict do nothing
    returning coins into starter_grant;

    if starter_grant is null then return commander_private.snapshot(u); end if;

    insert into public.commander_owned_items(user_id, campaign_id, item_id)
    select u, c.id, id
    from public.commander_catalog
    where id in ('void_saber', 'aegis_shield', 'neon_guard', 'shade_archer')
    on conflict do nothing;
  else
    select * into p
    from public.commander_profiles
    where user_id = u and campaign_id = c.id
    for update;

    if not found then raise exception 'commander_enroll_first'; end if;
    if p_expected_version is null or p_expected_version <> p.version then
      raise exception 'commander_stale_profile';
    end if;

    if p_operation in ('buy', 'equip', 'goal') then
      if p_target is not null then
        select * into i from public.commander_catalog where id = p_target and active;
        if not found then raise exception 'commander_invalid_item'; end if;
      end if;

      if p_operation = 'buy' then
        if i.id is null or i.price = 0 then raise exception 'commander_invalid_item'; end if;
        if exists(
          select 1 from public.commander_owned_items
          where user_id = u and campaign_id = c.id and item_id = i.id
        ) then raise exception 'commander_already_owned'; end if;

        cost := i.price;
        if wallet < cost then raise exception 'commander_insufficient_coins'; end if;

        insert into public.commander_owned_items(user_id, campaign_id, item_id)
        values (u, c.id, i.id);

        update public.commander_profiles
        set goal = case when goal = i.id then null else goal end
        where user_id = u and campaign_id = c.id;
      elsif p_operation = 'equip' then
        if i.id is null or not exists(
          select 1 from public.commander_owned_items
          where user_id = u and campaign_id = c.id and item_id = i.id
        ) then raise exception 'commander_not_owned'; end if;

        update public.commander_profiles
        set weapon = case when i.slot = 'weapon' then i.id else weapon end,
            shield = case when i.slot = 'shield' then i.id else shield end,
            guard = case when i.slot = 'guard' then i.id else guard end,
            archer = case when i.slot = 'archer' then i.id else archer end
        where user_id = u and campaign_id = c.id;
      else
        if p_target is not null and exists(
          select 1 from public.commander_owned_items
          where user_id = u and campaign_id = c.id and item_id = p_target
        ) then raise exception 'commander_already_owned'; end if;

        update public.commander_profiles
        set goal = p_target
        where user_id = u and campaign_id = c.id;
      end if;
    elsif p_operation = 'train' then
      rank_now := case p_target
        when 'force' then p.force_rank
        when 'defense' then p.defense_rank
        when 'dexterity' then p.dexterity_rank
        when 'stamina' then p.stamina_rank
        else null
      end;
      if rank_now is null then raise exception 'commander_invalid_stat'; end if;

      cap := least((c.rules->>'maxRank')::integer, 5 + commander_private.level(p.xp) / 2);
      if rank_now >= cap then raise exception 'commander_rank_cap'; end if;

      cost := round(
        (c.rules->>'trainingBase')::numeric
        * power((c.rules->>'trainingGrowth')::numeric, rank_now - 1)
      );
      if wallet < cost then raise exception 'commander_insufficient_coins'; end if;

      update public.commander_profiles
      set force_rank = force_rank + case when p_target = 'force' then 1 else 0 end,
          defense_rank = defense_rank + case when p_target = 'defense' then 1 else 0 end,
          dexterity_rank = dexterity_rank + case when p_target = 'dexterity' then 1 else 0 end,
          stamina_rank = stamina_rank + case when p_target = 'stamina' then 1 else 0 end
      where user_id = u and campaign_id = c.id;
    elsif p_operation = 'unit_train' then
      if p_target is null then raise exception 'commander_invalid_unit'; end if;

      select * into i
      from public.commander_catalog
      where id = p_target and active and kind = 'unit';
      if not found then raise exception 'commander_invalid_unit'; end if;

      if not exists(
        select 1 from public.commander_owned_items
        where user_id = u and campaign_id = c.id and item_id = i.id
      ) then raise exception 'commander_unit_not_owned'; end if;

      commander_level := commander_private.level(p.xp);
      if commander_level < coalesce((c.rules->>'unitTrainingUnlockLevel')::integer, 11) then
        raise exception 'commander_unit_training_locked';
      end if;

      -- Self-heal any legacy owned-unit row that predates the progress trigger.
      insert into public.commander_unit_progress(user_id, campaign_id, item_id)
      values (u, c.id, i.id)
      on conflict do nothing;

      select * into strict up
      from public.commander_unit_progress
      where user_id = u and campaign_id = c.id and item_id = i.id
      for update;

      cap := commander_private.unit_rank_cap(commander_level, c.rules);
      if up.unit_rank >= cap
         or up.unit_rank >= coalesce((c.rules->>'unitTrainingMaxRank')::integer, 10) then
        raise exception 'commander_unit_rank_cap';
      end if;

      cost := commander_private.unit_training_cost(up.unit_rank, c.rules);
      if wallet < cost then raise exception 'commander_insufficient_coins'; end if;

      update public.commander_unit_progress
      set unit_rank = unit_rank + 1,
          training_points = training_points + 1,
          version = version + 1,
          updated_at = now()
      where user_id = u and campaign_id = c.id and item_id = i.id;
    end if;

    if cost > 0 then
      update public.users
      set coins = coins - cost
      where id = u and coins >= cost;
      if not found then raise exception 'commander_insufficient_coins'; end if;
    end if;

    update public.commander_profiles
    set version = version + 1,
        updated_at = now()
    where user_id = u and campaign_id = c.id;
  end if;

  insert into public.commander_transactions(
    user_id, campaign_id, request_id, operation, payload, coins_delta
  ) values (
    u, c.id, p_request_id, p_operation, body,
    case when p_operation = 'enroll' then starter_grant else -cost end
  );

  return commander_private.snapshot(u);
end $$;

revoke all on function commander_private.unit_rank_cap(integer, jsonb) from public, anon, authenticated;
revoke all on function commander_private.unit_training_cost(integer, jsonb) from public, anon, authenticated;
revoke all on function commander_private.loadout(uuid, text) from public, anon, authenticated;
revoke all on function commander_private.snapshot(uuid) from public, anon, authenticated;
revoke all on function public.rpc_commander_command(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.rpc_commander_command(uuid, text, text, integer) to authenticated;

comment on function commander_private.unit_rank_cap(integer, jsonb) is
  'Trusted Commander-level gate for per-unit ranks. Level 11 unlocks Rank 2 and the cap rises to Rank 10.';
comment on function commander_private.unit_training_cost(integer, jsonb) is
  'Shared-wallet Coin cost for upgrading one owned Commander unit from its current rank.';

notify pgrst, 'reload schema';
commit;
