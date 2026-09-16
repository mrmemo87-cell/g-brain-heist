-- Commander economy v2: shared-wallet prices + Commander-level progression gates.
--
-- Locked rules:
--   * Commander Level controls access; shared Brains Heist Coins pay for upgrades.
--   * Existing owned items and over-trained legacy stats are grandfathered.
--   * Paid roster/equipment is materially more expensive than the original pilot economy.
--   * Basic Commander stat ranks unlock every two Commander levels.
--   * The transaction trigger protects both the current RPC and later Commander RPC versions.
begin;

alter table public.commander_catalog
  add column if not exists unlock_level integer not null default 1;

comment on column public.commander_catalog.unlock_level is
  'Minimum Commander level required for a new purchase. Existing owners are grandfathered and may continue equipping owned items.';

update public.commander_catalog
set price = case id
    when 'rift_blade' then 1000
    when 'bastion_plate' then 1250
    when 'neon_bulwark' then 1500
    when 'shade_deadeye' then 1500
    when 'grave_bastion' then 2500
    when 'plague_scribe' then 2750
    when 'rift_reaver' then 3000
    when 'volt_seer' then 3500
    else price
  end,
  unlock_level = case id
    when 'rift_blade' then 3
    when 'bastion_plate' then 3
    when 'neon_bulwark' then 5
    when 'shade_deadeye' then 5
    when 'grave_bastion' then 7
    when 'plague_scribe' then 7
    when 'rift_reaver' then 9
    when 'volt_seer' then 11
    else 1
  end,
  description = case id
    when 'rift_blade' then 'Heavier spells at the cost of 8 Commander HP. New purchases unlock at Commander Level 3.'
    when 'bastion_plate' then 'Start with 8 more shield. Guard restores 4 more. New purchases unlock at Commander Level 3.'
    when 'neon_bulwark' then 'Neon armor variant. Greater endurance, lower damage. New recruits unlock at Commander Level 5.'
    when 'shade_deadeye' then 'Shade specialist variant. High damage, fragile defenses. New recruits unlock at Commander Level 5.'
    when 'grave_bastion' then 'GRAVE // Fortress unit. Massive health and barrier pressure; trades damage for staying power. New recruits unlock at Commander Level 7.'
    when 'plague_scribe' then 'ROT // Tactical ranged specialist. Stable damage profile built for future decay and control powers. New recruits unlock at Commander Level 7.'
    when 'rift_reaver' then 'VOID // Frontline bruiser. Sacrifices protection for the hardest guard-slot attacks in the pilot roster. New recruits unlock at Commander Level 9.'
    when 'volt_seer' then 'STORM // Glass-cannon ranged unit. Highest raw unit attack, but punishingly fragile when focused. New recruits unlock at Commander Level 11.'
    else description
  end
where id in (
  'rift_blade','bastion_plate','neon_bulwark','shade_deadeye',
  'grave_bastion','plague_scribe','rift_reaver','volt_seer'
);

update public.commander_campaigns
set rules = rules || jsonb_build_object(
  'trainingBase', 250,
  'trainingGrowth', 1.40,
  'statTrainingLevelStep', 2,
  'economyVersion', 2
)
where id = 'pilot-v1';

create or replace function commander_private.stat_rank_cap(p_level integer, p_rules jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select least(
    coalesce((p_rules->>'maxRank')::integer, 10),
    1 + greatest(1, coalesce(p_level, 1))
      / greatest(coalesce((p_rules->>'statTrainingLevelStep')::integer, 2), 1)
  );
$$;

create or replace function commander_private.enforce_economy_progression()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.commander_profiles;
  rules jsonb;
  target_id text := nullif(new.payload->>'target', '');
  required_level integer := 1;
  commander_level integer;
  rank_now integer;
  allowed_rank integer;
begin
  if new.operation not in ('buy','train') then
    return new;
  end if;

  select * into p
  from public.commander_profiles
  where user_id = new.user_id and campaign_id = new.campaign_id;
  if not found then
    raise exception 'commander_enroll_first';
  end if;

  select c.rules into rules
  from public.commander_campaigns c
  where c.id = new.campaign_id;
  if rules is null then
    raise exception 'commander_unavailable';
  end if;

  commander_level := commander_private.level(p.xp);

  if new.operation = 'buy' then
    select greatest(coalesce(i.unlock_level,1),1)
      into required_level
    from public.commander_catalog i
    where i.id = target_id and i.active;

    if required_level is null then
      raise exception 'commander_invalid_item';
    end if;

    if commander_level < required_level then
      raise exception 'commander_item_level_locked';
    end if;
  else
    rank_now := case target_id
      when 'force' then p.force_rank
      when 'defense' then p.defense_rank
      when 'dexterity' then p.dexterity_rank
      when 'stamina' then p.stamina_rank
      else null
    end;

    if rank_now is null then
      raise exception 'commander_invalid_stat';
    end if;

    allowed_rank := commander_private.stat_rank_cap(commander_level, rules);
    if rank_now > allowed_rank then
      raise exception 'commander_rank_cap';
    end if;
  end if;

  return new;
end $$;

revoke all on function commander_private.enforce_economy_progression() from public, anon, authenticated;

drop trigger if exists commander_economy_progression_guard on public.commander_transactions;
create trigger commander_economy_progression_guard
before insert on public.commander_transactions
for each row
when (new.operation in ('buy','train'))
execute function commander_private.enforce_economy_progression();

-- Snapshot is schema-aware: preserve the richer Unit Training payload when that
-- later progression migration exists, while remaining safe on today's production schema.
do $do$
begin
  if to_regprocedure('commander_private.unit_rank_cap(integer,jsonb)') is not null then
    execute $sql$
      create or replace function commander_private.snapshot(p_user uuid)
      returns jsonb
      language plpgsql
      stable
      security definer
      set search_path = ''
      as $fn$
      declare
        c public.commander_campaigns;
        p public.commander_profiles;
        commander_level integer;
        unit_cap integer := 1;
        progression_cap integer := 1;
        visible_cap integer := 1;
      begin
        select * into c from public.commander_campaigns where active;
        if not found then raise exception 'commander_unavailable'; end if;

        select * into p
        from public.commander_profiles
        where user_id = p_user and campaign_id = c.id;

        if p.user_id is not null then
          commander_level := commander_private.level(p.xp);
          unit_cap := commander_private.unit_rank_cap(commander_level, c.rules);
          progression_cap := commander_private.stat_rank_cap(commander_level, c.rules);
          visible_cap := least(
            coalesce((c.rules->>'maxRank')::integer, 10),
            greatest(progression_cap, p.force_rank, p.defense_rank, p.dexterity_rank, p.stamina_rank)
          );
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
              'rankCap', visible_cap,
              'unitRankCap', unit_cap
            )
          end,
          'catalog', (
            select coalesce(jsonb_agg(to_jsonb(i) order by i.unlock_level, i.price, i.id), '[]'::jsonb)
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
      end
      $fn$
    $sql$;
  else
    execute $sql$
      create or replace function commander_private.snapshot(p_user uuid)
      returns jsonb
      language plpgsql
      stable
      security definer
      set search_path = ''
      as $fn$
      declare
        c public.commander_campaigns;
        p public.commander_profiles;
        commander_level integer;
        progression_cap integer := 1;
        visible_cap integer := 1;
      begin
        select * into c from public.commander_campaigns where active;
        if not found then raise exception 'commander_unavailable'; end if;

        select * into p
        from public.commander_profiles
        where user_id=p_user and campaign_id=c.id;

        if p.user_id is not null then
          commander_level := commander_private.level(p.xp);
          progression_cap := commander_private.stat_rank_cap(commander_level, c.rules);
          visible_cap := least(
            coalesce((c.rules->>'maxRank')::integer, 10),
            greatest(progression_cap, p.force_rank, p.defense_rank, p.dexterity_rank, p.stamina_rank)
          );
        end if;

        return jsonb_build_object(
          'wallet',jsonb_build_object(
            'coins',(select coalesce(coins,0) from public.users where id=p_user),
            'currency','brains_heist_coins'
          ),
          'campaign',jsonb_build_object('id',c.id,'title',c.title,'rules',c.rules),
          'profile',case when p.user_id is null then null else
            to_jsonb(p)||jsonb_build_object(
              'coins',(select coalesce(coins,0) from public.users where id=p_user),
              'level',commander_level,
              'rankCap',visible_cap
            )
          end,
          'catalog',(
            select coalesce(jsonb_agg(to_jsonb(i) order by i.unlock_level,i.price,i.id),'[]')
            from public.commander_catalog i where i.active
          ),
          'owned',(
            select coalesce(jsonb_agg(item_id order by item_id),'[]')
            from public.commander_owned_items
            where user_id=p_user and campaign_id=c.id
          ),
          'loadout',case when p.user_id is null then null else commander_private.loadout(p_user,c.id) end,
          'history',(
            select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]')
            from (
              select operation,payload,coins_delta,xp_delta,created_at
              from public.commander_transactions
              where user_id=p_user and campaign_id=c.id
              order by created_at desc
              limit 16
            ) t
          )
        );
      end
      $fn$
    $sql$;

    -- Production currently uses the original command surface. Keep that surface intact;
    -- the trigger above is the authoritative economy gate and will also protect later RPC versions.
    execute $sql$
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
      as $fn$
      declare
        u uuid:=auth.uid();
        c public.commander_campaigns;
        p public.commander_profiles;
        i public.commander_catalog;
        old public.commander_transactions;
        cost int:=0;
        starter_grant int;
        wallet bigint;
        rank_now int;
        cap int;
        body jsonb:=jsonb_build_object('target',p_target);
      begin
        perform commander_private.student(u);
        if p_request_id is null or p_operation not in ('enroll','buy','equip','train','goal') or p_operation is null then
          raise exception 'commander_invalid_command';
        end if;
        select * into c from public.commander_campaigns where active;
        if not found then raise exception 'commander_unavailable'; end if;
        perform pg_advisory_xact_lock(hashtextextended(u::text||':'||c.id,0));
        select coalesce(coins,0) into strict wallet from public.users where id=u for update;
        select * into old from public.commander_transactions where user_id=u and campaign_id=c.id and request_id=p_request_id;
        if found then
          if old.operation<>p_operation or old.payload<>body then raise exception 'commander_request_conflict'; end if;
          return commander_private.snapshot(u);
        end if;
        if p_operation='enroll' then
          insert into public.commander_profiles(user_id,campaign_id,coins) values(u,c.id,0) on conflict do nothing returning coins into starter_grant;
          if starter_grant is null then return commander_private.snapshot(u); end if;
          insert into public.commander_owned_items(user_id,campaign_id,item_id)
          select u,c.id,id from public.commander_catalog where id in ('void_saber','aegis_shield','neon_guard','shade_archer') on conflict do nothing;
        else
          select * into p from public.commander_profiles where user_id=u and campaign_id=c.id for update;
          if not found then raise exception 'commander_enroll_first'; end if;
          if p_expected_version is null or p_expected_version<>p.version then raise exception 'commander_stale_profile'; end if;
          if p_operation in ('buy','equip','goal') then
            if p_target is not null then
              select * into i from public.commander_catalog where id=p_target and active;
              if not found then raise exception 'commander_invalid_item'; end if;
            end if;
            if p_operation='buy' then
              if i.id is null or i.price=0 then raise exception 'commander_invalid_item'; end if;
              if exists(select 1 from public.commander_owned_items where user_id=u and campaign_id=c.id and item_id=i.id) then
                raise exception 'commander_already_owned';
              end if;
              cost:=i.price;
              if wallet<cost then raise exception 'commander_insufficient_coins'; end if;
              insert into public.commander_owned_items(user_id,campaign_id,item_id) values(u,c.id,i.id);
              update public.commander_profiles set goal=case when goal=i.id then null else goal end where user_id=u and campaign_id=c.id;
            elsif p_operation='equip' then
              if i.id is null or not exists(select 1 from public.commander_owned_items where user_id=u and campaign_id=c.id and item_id=i.id) then
                raise exception 'commander_not_owned';
              end if;
              update public.commander_profiles
              set weapon=case when i.slot='weapon' then i.id else weapon end,
                  shield=case when i.slot='shield' then i.id else shield end,
                  guard=case when i.slot='guard' then i.id else guard end,
                  archer=case when i.slot='archer' then i.id else archer end
              where user_id=u and campaign_id=c.id;
            else
              if p_target is not null and exists(select 1 from public.commander_owned_items where user_id=u and campaign_id=c.id and item_id=p_target) then
                raise exception 'commander_already_owned';
              end if;
              update public.commander_profiles set goal=p_target where user_id=u and campaign_id=c.id;
            end if;
          elsif p_operation='train' then
            rank_now:=case p_target
              when 'force' then p.force_rank
              when 'defense' then p.defense_rank
              when 'dexterity' then p.dexterity_rank
              when 'stamina' then p.stamina_rank
              else null
            end;
            if rank_now is null then raise exception 'commander_invalid_stat'; end if;
            cap:=least((c.rules->>'maxRank')::int,5+commander_private.level(p.xp)/2);
            if rank_now>=cap then raise exception 'commander_rank_cap'; end if;
            cost:=round((c.rules->>'trainingBase')::numeric*power((c.rules->>'trainingGrowth')::numeric,rank_now-1));
            if wallet<cost then raise exception 'commander_insufficient_coins'; end if;
            update public.commander_profiles
            set force_rank=force_rank+case when p_target='force' then 1 else 0 end,
                defense_rank=defense_rank+case when p_target='defense' then 1 else 0 end,
                dexterity_rank=dexterity_rank+case when p_target='dexterity' then 1 else 0 end,
                stamina_rank=stamina_rank+case when p_target='stamina' then 1 else 0 end
            where user_id=u and campaign_id=c.id;
          end if;
          if cost>0 then
            update public.users set coins=coins-cost where id=u and coins>=cost;
            if not found then raise exception 'commander_insufficient_coins'; end if;
          end if;
          update public.commander_profiles set version=version+1,updated_at=now() where user_id=u and campaign_id=c.id;
        end if;
        insert into public.commander_transactions(user_id,campaign_id,request_id,operation,payload,coins_delta)
        values(u,c.id,p_request_id,p_operation,body,case when p_operation='enroll' then starter_grant else -cost end);
        return commander_private.snapshot(u);
      end
      $fn$
    $sql$;
  end if;
end
$do$;

revoke all on function commander_private.snapshot(uuid) from public, anon, authenticated;
revoke all on function commander_private.stat_rank_cap(integer,jsonb) from public, anon, authenticated;
revoke all on function public.rpc_commander_command(uuid,text,text,integer) from public, anon, authenticated;
grant execute on function public.rpc_commander_command(uuid,text,text,integer) to authenticated;

notify pgrst, 'reload schema';
commit;
