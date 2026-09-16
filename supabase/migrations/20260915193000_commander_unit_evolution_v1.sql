-- Commander Unit Evolution v1 (Levels 21-30).
--
-- Design goals:
--   * Build directly on Unit Training without adding a second currency or PvP grind loop.
--   * Require Unit Rank 10 before Evolution.
--   * Gate Evolution tiers at Commander Levels 21, 25, and 30.
--   * Spend the existing shared Brains Heist Coin wallet atomically/idempotently.
--   * Apply Evolution bonuses only inside the trusted server loadout used by Practice + PvP.
--   * Preserve the existing unit_train command contract: once a unit is Rank 10, the same
--     server-authoritative development command advances its eligible Evolution tier.
begin;

update public.commander_campaigns
set rules = rules || '{
  "unitEvolutionMaxTier":3,
  "unitEvolutionBase":250,
  "unitEvolutionGrowth":1.60,
  "unitEvolutionTier2Level":25,
  "unitEvolutionTier3Level":30,
  "unitEvolutionGuardHpPerTier":8,
  "unitEvolutionGuardShieldPerTier":2,
  "unitEvolutionGuardAttackPerTier":1,
  "unitEvolutionArcherHpPerTier":4,
  "unitEvolutionArcherAttackPerTier":2
}'::jsonb
where active;

create or replace function commander_private.unit_evolution_tier_cap(p_level integer, p_rules jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when greatest(1, coalesce(p_level, 1)) < coalesce((p_rules->>'unitEvolutionUnlockLevel')::integer, 21) then 0
    when greatest(1, coalesce(p_level, 1)) < coalesce((p_rules->>'unitEvolutionTier2Level')::integer, 25) then 1
    when greatest(1, coalesce(p_level, 1)) < coalesce((p_rules->>'unitEvolutionTier3Level')::integer, 30) then 2
    else coalesce((p_rules->>'unitEvolutionMaxTier')::integer, 3)
  end;
$$;

create or replace function commander_private.unit_evolution_cost(p_current_tier integer, p_rules jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select round(
    coalesce((p_rules->>'unitEvolutionBase')::numeric, 250)
    * power(
      coalesce((p_rules->>'unitEvolutionGrowth')::numeric, 1.60),
      greatest(0, coalesce(p_current_tier, 0))
    )
  )::integer;
$$;

-- Evolution is an additive permanent doctrine. The trusted loadout bakes the
-- bonuses into bounded unit stats so Practice and PvP receive exactly the same army.
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
  g_evo integer := 0;
  a_evo integer := 0;
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

  select coalesce(up.unit_rank, 1), coalesce(up.evolution_tier, 0)
  into g_rank, g_evo
  from (select 1) seed
  left join public.commander_unit_progress up
    on up.user_id = p_user
   and up.campaign_id = p_campaign
   and up.item_id = g.id;

  select coalesce(up.unit_rank, 1), coalesce(up.evolution_tier, 0)
  into a_rank, a_evo
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
        'evolutionTier', g_evo,
        'evolutionPassive', 'bulwark_matrix',
        'hp', (g.stats->>'hp')::integer
          + g_steps * coalesce((rules->>'unitGuardHpPerRank')::integer, 2)
          + g_evo * coalesce((rules->>'unitEvolutionGuardHpPerTier')::integer, 8),
        'shield', (g.stats->>'shield')::integer
          + floor(g_steps::numeric / greatest(1, coalesce((rules->>'unitGuardShieldEvery')::integer, 3)))::integer
          + g_evo * coalesce((rules->>'unitEvolutionGuardShieldPerTier')::integer, 2),
        'attack', (g.stats->>'attack')::integer
          + (p.dexterity_rank - 1)
          + floor(g_steps::numeric / greatest(1, coalesce((rules->>'unitGuardAttackEvery')::integer, 3)))::integer
          + g_evo * coalesce((rules->>'unitEvolutionGuardAttackPerTier')::integer, 1)
      ),
      jsonb_build_object(
        'id', 'player_archer',
        'catalogId', a.id,
        'school', a.school,
        'name', a.name,
        'unitRank', a_rank,
        'evolutionTier', a_evo,
        'evolutionPassive', 'predator_matrix',
        'hp', (a.stats->>'hp')::integer
          + a_steps * coalesce((rules->>'unitArcherHpPerRank')::integer, 1)
          + a_evo * coalesce((rules->>'unitEvolutionArcherHpPerTier')::integer, 4),
        'shield', (a.stats->>'shield')::integer,
        'attack', (a.stats->>'attack')::integer
          + (p.dexterity_rank - 1)
          + floor(a_steps::numeric / greatest(1, coalesce((rules->>'unitArcherAttackEvery')::integer, 2)))::integer
          + a_evo * coalesce((rules->>'unitEvolutionArcherAttackPerTier')::integer, 2)
      )
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
  max_unit_rank integer;
  max_evolution_tier integer;
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

      insert into public.commander_unit_progress(user_id, campaign_id, item_id)
      values (u, c.id, i.id)
      on conflict do nothing;

      select * into strict up
      from public.commander_unit_progress
      where user_id = u and campaign_id = c.id and item_id = i.id
      for update;

      max_unit_rank := coalesce((c.rules->>'unitTrainingMaxRank')::integer, 10);

      if up.unit_rank < max_unit_rank then
        cap := commander_private.unit_rank_cap(commander_level, c.rules);
        if up.unit_rank >= cap then raise exception 'commander_unit_rank_cap'; end if;

        cost := commander_private.unit_training_cost(up.unit_rank, c.rules);
        if wallet < cost then raise exception 'commander_insufficient_coins'; end if;

        update public.commander_unit_progress
        set unit_rank = unit_rank + 1,
            training_points = training_points + 1,
            version = version + 1,
            updated_at = now()
        where user_id = u and campaign_id = c.id and item_id = i.id;
      else
        if commander_level < coalesce((c.rules->>'unitEvolutionUnlockLevel')::integer, 21) then
          raise exception 'commander_unit_evolution_locked';
        end if;
        if up.unit_rank < max_unit_rank then raise exception 'commander_unit_evolution_rank'; end if;

        max_evolution_tier := coalesce((c.rules->>'unitEvolutionMaxTier')::integer, 3);
        cap := commander_private.unit_evolution_tier_cap(commander_level, c.rules);
        if up.evolution_tier >= max_evolution_tier or up.evolution_tier >= cap then
          raise exception 'commander_unit_evolution_cap';
        end if;

        cost := commander_private.unit_evolution_cost(up.evolution_tier, c.rules);
        if wallet < cost then raise exception 'commander_insufficient_coins'; end if;

        update public.commander_unit_progress
        set evolution_tier = evolution_tier + 1,
            version = version + 1,
            updated_at = now()
        where user_id = u and campaign_id = c.id and item_id = i.id;
      end if;
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

revoke all on function commander_private.unit_evolution_tier_cap(integer, jsonb) from public, anon, authenticated;
revoke all on function commander_private.unit_evolution_cost(integer, jsonb) from public, anon, authenticated;
revoke all on function commander_private.loadout(uuid, text) from public, anon, authenticated;
revoke all on function public.rpc_commander_command(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.rpc_commander_command(uuid, text, text, integer) to authenticated;

comment on function commander_private.unit_evolution_tier_cap(integer, jsonb) is
  'Trusted Commander-level gate for permanent Unit Evolution tiers: Levels 21, 25, and 30.';
comment on function commander_private.unit_evolution_cost(integer, jsonb) is
  'Shared-wallet Coin cost for evolving one Rank-10 owned Commander unit from its current Evolution tier.';

notify pgrst, 'reload schema';
commit;