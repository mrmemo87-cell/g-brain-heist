-- Commander Unit Evolution v1 (Levels 21-30).
--
-- Design goals:
--   * Rank 10 is the prerequisite: evolution deepens an invested unit instead of replacing it.
--   * Commander Level controls access to Ascended / Exalted / Mythic tiers.
--   * The shared Brain Heist Coin wallet pays for evolution; no new currency is introduced.
--   * Evolution bonuses are derived server-side inside the trusted loadout and therefore apply
--     consistently to Practice and PvP without trusting browser-supplied combat stats.
--   * PvP remains reward-neutral and evolution never mints Commander XP.
begin;

update public.commander_campaigns
set rules = rules || '{
  "unitEvolutionUnlockLevel":21,
  "unitEvolutionTier2Level":25,
  "unitEvolutionTier3Level":30,
  "unitEvolutionMaxTier":3,
  "unitEvolutionTier1Cost":200,
  "unitEvolutionTier2Cost":350,
  "unitEvolutionTier3Cost":550,
  "unitEvolutionRareMultiplier":1.15,
  "unitEvolutionEpicMultiplier":1.30,
  "unitEvolutionLegendaryMultiplier":1.50
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

create or replace function commander_private.unit_evolution_required_level(p_target_tier integer, p_rules jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case greatest(1, least(coalesce((p_rules->>'unitEvolutionMaxTier')::integer, 3), coalesce(p_target_tier, 1)))
    when 1 then coalesce((p_rules->>'unitEvolutionUnlockLevel')::integer, 21)
    when 2 then coalesce((p_rules->>'unitEvolutionTier2Level')::integer, 25)
    else coalesce((p_rules->>'unitEvolutionTier3Level')::integer, 30)
  end;
$$;

create or replace function commander_private.unit_evolution_cost(
  p_rarity text,
  p_target_tier integer,
  p_rules jsonb
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select round(
    (case greatest(1, least(3, coalesce(p_target_tier, 1)))
      when 1 then coalesce((p_rules->>'unitEvolutionTier1Cost')::numeric, 200)
      when 2 then coalesce((p_rules->>'unitEvolutionTier2Cost')::numeric, 350)
      else coalesce((p_rules->>'unitEvolutionTier3Cost')::numeric, 550)
    end)
    * (case coalesce(lower(p_rarity), 'common')
      when 'rare' then coalesce((p_rules->>'unitEvolutionRareMultiplier')::numeric, 1.15)
      when 'epic' then coalesce((p_rules->>'unitEvolutionEpicMultiplier')::numeric, 1.30)
      when 'legendary' then coalesce((p_rules->>'unitEvolutionLegendaryMultiplier')::numeric, 1.50)
      else 1::numeric
    end)
  )::integer;
$$;

-- Evolution is intentionally controlled rather than exponential. Units keep their identity:
-- frontline evolutions lean toward endurance, ranged evolutions lean toward pressure, while
-- school alignment adds a small, deterministic specialization.
create or replace function commander_private.unit_evolution_bonus(
  p_slot text,
  p_school text,
  p_tier integer
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  t integer := greatest(0, least(3, coalesce(p_tier, 0)));
  hp_bonus integer := 0;
  shield_bonus integer := 0;
  attack_bonus integer := 0;
begin
  if p_slot = 'guard' then
    hp_bonus := 4 * t;
    shield_bonus := t;
    attack_bonus := floor(t::numeric / 2)::integer;
  elsif p_slot = 'archer' then
    hp_bonus := 2 * t;
    attack_bonus := t;
  end if;

  case coalesce(lower(p_school), 'neutral')
    when 'storm' then
      if p_slot = 'guard' then
        shield_bonus := shield_bonus + ceil(t::numeric / 2)::integer;
      elsif p_slot = 'archer' then
        attack_bonus := attack_bonus + floor(t::numeric / 2)::integer;
      end if;
    when 'grave' then
      hp_bonus := hp_bonus + case when p_slot = 'guard' then 2 * t else t end;
    when 'void' then
      attack_bonus := attack_bonus + ceil(t::numeric / 2)::integer;
    when 'rot' then
      hp_bonus := hp_bonus + t;
    else null;
  end case;

  return jsonb_build_object('hp', hp_bonus, 'shield', shield_bonus, 'attack', attack_bonus);
end $$;

create or replace function commander_private.unit_evolution_passive(
  p_slot text,
  p_school text,
  p_tier integer
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  t integer := greatest(0, least(3, coalesce(p_tier, 0)));
  passive_id text;
  passive_label text;
  passive_description text;
begin
  if t = 0 then return null; end if;

  if p_slot = 'guard' and p_school = 'storm' then
    passive_id := 'overcharge_plating'; passive_label := 'Overcharge Plating';
    passive_description := 'Storm evolution reinforces shield reserve with every evolution tier.';
  elsif p_slot = 'archer' and p_school = 'storm' then
    passive_id := 'arc_sight'; passive_label := 'Arc Sight';
    passive_description := 'Storm evolution sharpens ranged pressure at higher evolution tiers.';
  elsif p_slot = 'guard' and p_school = 'void' then
    passive_id := 'phase_guard'; passive_label := 'Phase Guard';
    passive_description := 'Void evolution adds a sharper counter-strike profile to the frontline.';
  elsif p_slot = 'archer' and p_school = 'void' then
    passive_id := 'execution_mark'; passive_label := 'Execution Mark';
    passive_description := 'Void evolution intensifies precision attack gains.';
  elsif p_slot = 'guard' and p_school = 'grave' then
    passive_id := 'gravewall'; passive_label := 'Gravewall';
    passive_description := 'Grave evolution adds extra maximum health to the frontline.';
  elsif p_slot = 'archer' and p_school = 'grave' then
    passive_id := 'gravesight'; passive_label := 'Gravesight';
    passive_description := 'Grave evolution adds survivability without giving up ranged pressure.';
  elsif p_slot = 'guard' and p_school = 'rot' then
    passive_id := 'blight_ward'; passive_label := 'Blight Ward';
    passive_description := 'Rot evolution hardens the frontline with additional health.';
  elsif p_slot = 'archer' and p_school = 'rot' then
    passive_id := 'virulent_focus'; passive_label := 'Virulent Focus';
    passive_description := 'Rot evolution adds resilient pressure to the ranged line.';
  else
    passive_id := 'adaptive_doctrine'; passive_label := 'Adaptive Doctrine';
    passive_description := 'Evolution reinforces this unit while preserving its battlefield role.';
  end if;

  return jsonb_build_object(
    'id', passive_id,
    'label', passive_label,
    'description', passive_description,
    'tier', t
  );
end $$;

-- Rebuild the trusted loadout with evolution applied after the existing Rank 1-10 bonuses.
-- Extra evolution metadata is additive; the battle engine continues to validate only bounded
-- trusted combat stats and ignores unknown metadata.
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
  g_evolution_tier integer := 0;
  a_evolution_tier integer := 0;
  g_steps integer;
  a_steps integer;
  g_evolution jsonb;
  a_evolution jsonb;
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
  into g_rank, g_evolution_tier
  from (select 1) seed
  left join public.commander_unit_progress up
    on up.user_id = p_user
   and up.campaign_id = p_campaign
   and up.item_id = g.id;

  select coalesce(up.unit_rank, 1), coalesce(up.evolution_tier, 0)
  into a_rank, a_evolution_tier
  from (select 1) seed
  left join public.commander_unit_progress up
    on up.user_id = p_user
   and up.campaign_id = p_campaign
   and up.item_id = a.id;

  g_steps := greatest(0, g_rank - 1);
  a_steps := greatest(0, a_rank - 1);
  g_evolution := commander_private.unit_evolution_bonus(g.slot, g.school, g_evolution_tier);
  a_evolution := commander_private.unit_evolution_bonus(a.slot, a.school, a_evolution_tier);

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
        'evolutionTier', g_evolution_tier,
        'evolutionPassive', commander_private.unit_evolution_passive(g.slot, g.school, g_evolution_tier),
        'hp', (g.stats->>'hp')::integer
          + g_steps * coalesce((rules->>'unitGuardHpPerRank')::integer, 2)
          + coalesce((g_evolution->>'hp')::integer, 0),
        'shield', (g.stats->>'shield')::integer
          + floor(g_steps::numeric / greatest(1, coalesce((rules->>'unitGuardShieldEvery')::integer, 3)))::integer
          + coalesce((g_evolution->>'shield')::integer, 0),
        'attack', (g.stats->>'attack')::integer
          + (p.dexterity_rank - 1)
          + floor(g_steps::numeric / greatest(1, coalesce((rules->>'unitGuardAttackEvery')::integer, 3)))::integer
          + coalesce((g_evolution->>'attack')::integer, 0)
      ),
      jsonb_build_object(
        'id', 'player_archer',
        'catalogId', a.id,
        'school', a.school,
        'name', a.name,
        'unitRank', a_rank,
        'evolutionTier', a_evolution_tier,
        'evolutionPassive', commander_private.unit_evolution_passive(a.slot, a.school, a_evolution_tier),
        'hp', (a.stats->>'hp')::integer
          + a_steps * coalesce((rules->>'unitArcherHpPerRank')::integer, 1)
          + coalesce((a_evolution->>'hp')::integer, 0),
        'shield', (a.stats->>'shield')::integer
          + coalesce((a_evolution->>'shield')::integer, 0),
        'attack', (a.stats->>'attack')::integer
          + (p.dexterity_rank - 1)
          + floor(a_steps::numeric / greatest(1, coalesce((rules->>'unitArcherAttackEvery')::integer, 2)))::integer
          + coalesce((a_evolution->>'attack')::integer, 0)
      )
    )
  );
end $$;

-- Evolution has its own narrow mutation RPC so the established Commander command RPC does not
-- need to be rewritten. It uses the same advisory lock, request-id ledger, shared wallet,
-- expected profile version and trusted snapshot used by the rest of Headquarters.
create or replace function public.rpc_commander_evolve_unit(
  p_request_id uuid,
  p_target text,
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
  up public.commander_unit_progress;
  old public.commander_transactions;
  wallet bigint;
  commander_level integer;
  tier_cap integer;
  target_tier integer;
  required_level integer;
  cost integer;
  max_rank integer;
  max_tier integer;
  body jsonb := jsonb_build_object('target', p_target);
begin
  perform commander_private.student(u);
  if p_request_id is null or p_target is null then
    raise exception 'commander_invalid_unit';
  end if;

  select * into c from public.commander_campaigns where active;
  if not found then raise exception 'commander_unavailable'; end if;

  perform pg_advisory_xact_lock(hashtextextended(u::text || ':' || c.id, 0));

  select * into old
  from public.commander_transactions
  where user_id = u and campaign_id = c.id and request_id = p_request_id;

  if found then
    if old.operation <> 'evolve_unit' or old.payload <> body then
      raise exception 'commander_request_conflict';
    end if;
    return commander_private.snapshot(u);
  end if;

  select * into p
  from public.commander_profiles
  where user_id = u and campaign_id = c.id
  for update;
  if not found then raise exception 'commander_enroll_first'; end if;
  if p_expected_version is null or p_expected_version <> p.version then
    raise exception 'commander_stale_profile';
  end if;

  select * into i
  from public.commander_catalog
  where id = p_target and active and kind = 'unit' and slot in ('guard', 'archer');
  if not found then raise exception 'commander_invalid_unit'; end if;

  if not exists(
    select 1 from public.commander_owned_items
    where user_id = u and campaign_id = c.id and item_id = i.id
  ) then raise exception 'commander_unit_not_owned'; end if;

  insert into public.commander_unit_progress(user_id, campaign_id, item_id)
  values (u, c.id, i.id)
  on conflict do nothing;

  select * into strict up
  from public.commander_unit_progress
  where user_id = u and campaign_id = c.id and item_id = i.id
  for update;

  max_rank := coalesce((c.rules->>'unitTrainingMaxRank')::integer, 10);
  max_tier := coalesce((c.rules->>'unitEvolutionMaxTier')::integer, 3);
  commander_level := commander_private.level(p.xp);

  if commander_level < coalesce((c.rules->>'unitEvolutionUnlockLevel')::integer, 21) then
    raise exception 'commander_unit_evolution_locked';
  end if;
  if up.unit_rank < max_rank then
    raise exception 'commander_unit_evolution_rank_required';
  end if;
  if up.evolution_tier >= max_tier then
    raise exception 'commander_unit_evolution_max';
  end if;

  target_tier := up.evolution_tier + 1;
  required_level := commander_private.unit_evolution_required_level(target_tier, c.rules);
  tier_cap := commander_private.unit_evolution_tier_cap(commander_level, c.rules);
  if target_tier > tier_cap or commander_level < required_level then
    raise exception 'commander_unit_evolution_level_required';
  end if;

  cost := commander_private.unit_evolution_cost(i.rarity, target_tier, c.rules);

  select coalesce(coins, 0) into strict wallet
  from public.users
  where id = u
  for update;
  if wallet < cost then raise exception 'commander_insufficient_coins'; end if;

  update public.users
  set coins = coins - cost
  where id = u and coins >= cost;
  if not found then raise exception 'commander_insufficient_coins'; end if;

  update public.commander_unit_progress
  set evolution_tier = target_tier,
      version = version + 1,
      updated_at = now()
  where user_id = u and campaign_id = c.id and item_id = i.id;

  update public.commander_profiles
  set version = version + 1,
      updated_at = now()
  where user_id = u and campaign_id = c.id;

  insert into public.commander_transactions(
    user_id, campaign_id, request_id, operation, payload, coins_delta
  ) values (
    u, c.id, p_request_id, 'evolve_unit', body, -cost
  );

  return commander_private.snapshot(u);
end $$;

revoke all on function commander_private.unit_evolution_tier_cap(integer, jsonb) from public, anon, authenticated;
revoke all on function commander_private.unit_evolution_required_level(integer, jsonb) from public, anon, authenticated;
revoke all on function commander_private.unit_evolution_cost(text, integer, jsonb) from public, anon, authenticated;
revoke all on function commander_private.unit_evolution_bonus(text, text, integer) from public, anon, authenticated;
revoke all on function commander_private.unit_evolution_passive(text, text, integer) from public, anon, authenticated;
revoke all on function commander_private.loadout(uuid, text) from public, anon, authenticated;
revoke all on function public.rpc_commander_evolve_unit(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.rpc_commander_evolve_unit(uuid, text, integer) to authenticated;

comment on function commander_private.unit_evolution_tier_cap(integer, jsonb) is
  'Trusted Commander-level gate for unit evolution tiers: Ascended at 21, Exalted at 25, Mythic at 30.';
comment on function commander_private.unit_evolution_bonus(text, text, integer) is
  'Deterministic trusted combat bonuses for one unit evolution tier and school/role identity.';
comment on function public.rpc_commander_evolve_unit(uuid, text, integer) is
  'Atomic Rank-10 unit evolution using the shared Brain Heist Coin wallet and idempotent Commander transaction ledger.';

notify pgrst, 'reload schema';
commit;
