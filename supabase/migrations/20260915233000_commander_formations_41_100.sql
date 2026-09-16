-- Commander Formation Command v1 (Levels 41-100).
--
-- Design goals:
--   * Make Formation Command the long-range Commander progression track from Level 41 through 100.
--   * Keep the existing three-combatant contract (Commander + frontline + ranged); no fourth-slot rewrite.
--   * Store formation doctrine and active selection only on the server.
--   * Spend the shared Brains Heist Coin wallet atomically and idempotently for doctrine advancement.
--   * Bake bounded formation trade-offs into commander_private.loadout(), so Practice and PvP receive
--     the same trusted stats and existing PvP snapshots freeze the chosen formation automatically.
--   * Preserve all existing Commander command/RPC contracts by using a dedicated formation RPC.
begin;

update public.commander_campaigns
set rules = rules || '{
  "formationUnlockLevel":41,
  "formationBastionUnlockLevel":45,
  "formationSpearheadUnlockLevel":50,
  "formationArcUnlockLevel":55,
  "formationMaxRank":7,
  "formationRank2Level":50,
  "formationRank3Level":60,
  "formationRank4Level":70,
  "formationRank5Level":80,
  "formationRank6Level":90,
  "formationRank7Level":100,
  "formationTrainingBase":600,
  "formationTrainingGrowth":1.35
}'::jsonb
where active;

create table public.commander_formation_progress (
  user_id uuid not null,
  campaign_id text not null,
  formation_id text not null check (formation_id in ('command_line', 'bastion_wedge', 'spearhead', 'arc_lattice')),
  doctrine_rank smallint not null default 0 check (doctrine_rank between 0 and 7),
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, campaign_id, formation_id),
  foreign key (user_id, campaign_id)
    references public.commander_profiles(user_id, campaign_id)
    on delete cascade
);

create table public.commander_formation_state (
  user_id uuid not null,
  campaign_id text not null,
  active_formation text not null default 'command_line'
    check (active_formation in ('command_line', 'bastion_wedge', 'spearhead', 'arc_lattice')),
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, campaign_id),
  foreign key (user_id, campaign_id)
    references public.commander_profiles(user_id, campaign_id)
    on delete cascade
);

alter table public.commander_formation_progress enable row level security;
alter table public.commander_formation_state enable row level security;
revoke all on public.commander_formation_progress, public.commander_formation_state
  from public, anon, authenticated;

insert into public.commander_formation_state(user_id, campaign_id)
select p.user_id, p.campaign_id
from public.commander_profiles p
on conflict do nothing;

create function commander_private.seed_formation_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.commander_formation_state(user_id, campaign_id)
  values (new.user_id, new.campaign_id)
  on conflict do nothing;
  return new;
end $$;

revoke all on function commander_private.seed_formation_state() from public, anon, authenticated;

drop trigger if exists commander_profile_seed_formation_state on public.commander_profiles;
create trigger commander_profile_seed_formation_state
after insert on public.commander_profiles
for each row execute function commander_private.seed_formation_state();

create function commander_private.formation_unlock_level(p_formation text, p_rules jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_formation
    when 'command_line' then coalesce((p_rules->>'formationUnlockLevel')::integer, 41)
    when 'bastion_wedge' then coalesce((p_rules->>'formationBastionUnlockLevel')::integer, 45)
    when 'spearhead' then coalesce((p_rules->>'formationSpearheadUnlockLevel')::integer, 50)
    when 'arc_lattice' then coalesce((p_rules->>'formationArcUnlockLevel')::integer, 55)
    else null
  end;
$$;

create function commander_private.formation_rank_cap(p_level integer, p_rules jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when greatest(1, coalesce(p_level, 1)) < coalesce((p_rules->>'formationUnlockLevel')::integer, 41) then 0
    when greatest(1, coalesce(p_level, 1)) < coalesce((p_rules->>'formationRank2Level')::integer, 50) then 1
    when greatest(1, coalesce(p_level, 1)) < coalesce((p_rules->>'formationRank3Level')::integer, 60) then 2
    when greatest(1, coalesce(p_level, 1)) < coalesce((p_rules->>'formationRank4Level')::integer, 70) then 3
    when greatest(1, coalesce(p_level, 1)) < coalesce((p_rules->>'formationRank5Level')::integer, 80) then 4
    when greatest(1, coalesce(p_level, 1)) < coalesce((p_rules->>'formationRank6Level')::integer, 90) then 5
    when greatest(1, coalesce(p_level, 1)) < coalesce((p_rules->>'formationRank7Level')::integer, 100) then 6
    else coalesce((p_rules->>'formationMaxRank')::integer, 7)
  end;
$$;

create function commander_private.formation_training_cost(p_current_rank integer, p_rules jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select round(
    coalesce((p_rules->>'formationTrainingBase')::numeric, 600)
    * power(
      coalesce((p_rules->>'formationTrainingGrowth')::numeric, 1.35),
      greatest(0, coalesce(p_current_rank, 0))
    )
  )::integer;
$$;

-- Fixed, bounded doctrine math. Every specialization includes a trade-off; the balanced
-- Command Line receives smaller all-round gains. These values are server-owned and are not
-- accepted from the browser.
create function commander_private.formation_modifiers(p_formation text, p_rank integer)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  r integer := greatest(0, least(7, coalesce(p_rank, 0)));
begin
  if p_formation = 'bastion_wedge' then
    return jsonb_build_object(
      'commanderHp', 2 * r,
      'commanderShield', 3 * r,
      'bolt', -r,
      'focus', 0,
      'guard', 2 * r,
      'shieldCap', 3 * r,
      'guardHp', 3 * r,
      'guardShield', 2 * r,
      'guardAttack', 0,
      'archerHp', r,
      'archerShield', 0,
      'archerAttack', -(r / 2)
    );
  elsif p_formation = 'spearhead' then
    return jsonb_build_object(
      'commanderHp', -2 * r,
      'commanderShield', -r,
      'bolt', 2 * r,
      'focus', r,
      'guard', -r,
      'shieldCap', -r,
      'guardHp', 0,
      'guardShield', 0,
      'guardAttack', (r + 1) / 2,
      'archerHp', 0,
      'archerShield', 0,
      'archerAttack', (r + 1) / 2
    );
  elsif p_formation = 'arc_lattice' then
    return jsonb_build_object(
      'commanderHp', 0,
      'commanderShield', -(r / 2),
      'bolt', r,
      'focus', 2 * r,
      'guard', r,
      'shieldCap', 0,
      'guardHp', -r,
      'guardShield', 0,
      'guardAttack', 0,
      'archerHp', -r,
      'archerShield', 0,
      'archerAttack', 0
    );
  end if;

  -- command_line is also the safe fallback for legacy/missing formation state.
  return jsonb_build_object(
    'commanderHp', r,
    'commanderShield', r,
    'bolt', r / 2,
    'focus', r / 2,
    'guard', r,
    'shieldCap', r,
    'guardHp', r,
    'guardShield', 0,
    'guardAttack', r / 3,
    'archerHp', r,
    'archerShield', 0,
    'archerAttack', r / 3
  );
end $$;

-- Replace only the trusted loadout composer. Existing Headquarters, Practice and PvP RPCs
-- already consume this contract, so formation effects automatically flow into both battle modes.
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
  formation_id text := 'command_line';
  formation_rank integer := 0;
  formation_ranks jsonb;
  fm jsonb;
  commander_hp integer;
  commander_shield integer;
  commander_bolt integer;
  commander_focus integer;
  commander_guard integer;
  commander_shield_cap integer;
  guard_hp integer;
  guard_shield integer;
  guard_attack integer;
  archer_hp integer;
  archer_shield integer;
  archer_attack integer;
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

  select coalesce(fs.active_formation, 'command_line')
  into formation_id
  from (select 1) seed
  left join public.commander_formation_state fs
    on fs.user_id = p_user and fs.campaign_id = p_campaign;

  select coalesce(fp.doctrine_rank, 0)
  into formation_rank
  from (select 1) seed
  left join public.commander_formation_progress fp
    on fp.user_id = p_user
   and fp.campaign_id = p_campaign
   and fp.formation_id = formation_id;

  formation_ranks := jsonb_build_object(
    'command_line', coalesce((select doctrine_rank from public.commander_formation_progress where user_id = p_user and campaign_id = p_campaign and formation_id = 'command_line'), 0),
    'bastion_wedge', coalesce((select doctrine_rank from public.commander_formation_progress where user_id = p_user and campaign_id = p_campaign and formation_id = 'bastion_wedge'), 0),
    'spearhead', coalesce((select doctrine_rank from public.commander_formation_progress where user_id = p_user and campaign_id = p_campaign and formation_id = 'spearhead'), 0),
    'arc_lattice', coalesce((select doctrine_rank from public.commander_formation_progress where user_id = p_user and campaign_id = p_campaign and formation_id = 'arc_lattice'), 0)
  );
  fm := commander_private.formation_modifiers(formation_id, formation_rank);

  g_steps := greatest(0, g_rank - 1);
  a_steps := greatest(0, a_rank - 1);

  commander_hp := greatest(1,
    100 + 6 * (p.stamina_rank - 1)
    + coalesce((w->>'hp')::integer, 0)
    + coalesce((s->>'hp')::integer, 0)
    + (fm->>'commanderHp')::integer
  );
  commander_shield := greatest(0,
    (s->>'shield')::integer + 2 * (p.defense_rank - 1)
    + (fm->>'commanderShield')::integer
  );
  commander_bolt := greatest(1,
    26 + 2 * (p.force_rank - 1) + coalesce((w->>'bolt')::integer, 0)
    + (fm->>'bolt')::integer
  );
  commander_focus := greatest(1,
    7 + (p.force_rank - 1) + coalesce((w->>'focus')::integer, 0)
    + (fm->>'focus')::integer
  );
  commander_guard := greatest(1,
    18 + 2 * (p.defense_rank - 1) + coalesce((s->>'guard')::integer, 0)
    + (fm->>'guard')::integer
  );
  commander_shield_cap := greatest(
    commander_shield,
    30 + 2 * (p.defense_rank - 1) + greatest(0, (s->>'shield')::integer - 12)
      + (fm->>'shieldCap')::integer
  );

  guard_hp := greatest(1,
    (g.stats->>'hp')::integer
    + g_steps * coalesce((rules->>'unitGuardHpPerRank')::integer, 2)
    + g_evo * coalesce((rules->>'unitEvolutionGuardHpPerTier')::integer, 8)
    + (fm->>'guardHp')::integer
  );
  guard_shield := greatest(0,
    (g.stats->>'shield')::integer
    + floor(g_steps::numeric / greatest(1, coalesce((rules->>'unitGuardShieldEvery')::integer, 3)))::integer
    + g_evo * coalesce((rules->>'unitEvolutionGuardShieldPerTier')::integer, 2)
    + (fm->>'guardShield')::integer
  );
  guard_attack := greatest(1,
    (g.stats->>'attack')::integer
    + (p.dexterity_rank - 1)
    + floor(g_steps::numeric / greatest(1, coalesce((rules->>'unitGuardAttackEvery')::integer, 3)))::integer
    + g_evo * coalesce((rules->>'unitEvolutionGuardAttackPerTier')::integer, 1)
    + (fm->>'guardAttack')::integer
  );

  archer_hp := greatest(1,
    (a.stats->>'hp')::integer
    + a_steps * coalesce((rules->>'unitArcherHpPerRank')::integer, 1)
    + a_evo * coalesce((rules->>'unitEvolutionArcherHpPerTier')::integer, 4)
    + (fm->>'archerHp')::integer
  );
  archer_shield := greatest(0,
    (a.stats->>'shield')::integer + (fm->>'archerShield')::integer
  );
  archer_attack := greatest(1,
    (a.stats->>'attack')::integer
    + (p.dexterity_rank - 1)
    + floor(a_steps::numeric / greatest(1, coalesce((rules->>'unitArcherAttackEvery')::integer, 2)))::integer
    + a_evo * coalesce((rules->>'unitEvolutionArcherAttackPerTier')::integer, 2)
    + (fm->>'archerAttack')::integer
  );

  return jsonb_build_object(
    'version', 1,
    'profileVersion', p.version,
    'hp', commander_hp,
    'shield', commander_shield,
    'bolt', commander_bolt,
    'focus', commander_focus,
    'guard', commander_guard,
    'shieldCap', commander_shield_cap,
    'weaponName', (select name from public.commander_catalog where id = p.weapon),
    'shieldName', (select name from public.commander_catalog where id = p.shield),
    'schoolMastery', jsonb_build_object(
      'void', coalesce((select sm.mastery_rank from public.commander_school_mastery sm where sm.user_id = p_user and sm.campaign_id = p_campaign and sm.school = 'void'), 0),
      'storm', coalesce((select sm.mastery_rank from public.commander_school_mastery sm where sm.user_id = p_user and sm.campaign_id = p_campaign and sm.school = 'storm'), 0),
      'rot', coalesce((select sm.mastery_rank from public.commander_school_mastery sm where sm.user_id = p_user and sm.campaign_id = p_campaign and sm.school = 'rot'), 0),
      'grave', coalesce((select sm.mastery_rank from public.commander_school_mastery sm where sm.user_id = p_user and sm.campaign_id = p_campaign and sm.school = 'grave'), 0)
    ),
    'formation', jsonb_build_object(
      'activeId', formation_id,
      'rank', formation_rank,
      'ranks', formation_ranks,
      'modifiers', fm
    ),
    'units', jsonb_build_array(
      jsonb_build_object(
        'id', 'player_guard',
        'catalogId', g.id,
        'school', g.school,
        'name', g.name,
        'unitRank', g_rank,
        'evolutionTier', g_evo,
        'evolutionPassive', 'bulwark_matrix',
        'hp', guard_hp,
        'shield', guard_shield,
        'attack', guard_attack
      ),
      jsonb_build_object(
        'id', 'player_archer',
        'catalogId', a.id,
        'school', a.school,
        'name', a.name,
        'unitRank', a_rank,
        'evolutionTier', a_evo,
        'evolutionPassive', 'predator_matrix',
        'hp', archer_hp,
        'shield', archer_shield,
        'attack', archer_attack
      )
    )
  );
end $$;

create function public.rpc_commander_formation_command(
  p_request_id uuid,
  p_action text,
  p_formation text,
  p_expected_version integer
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
  fp public.commander_formation_progress;
  fs public.commander_formation_state;
  old public.commander_transactions;
  operation_name text;
  body jsonb := jsonb_build_object('target', p_formation);
  commander_level integer;
  unlock_level integer;
  cap integer;
  max_rank integer;
  cost integer := 0;
  wallet bigint;
begin
  perform commander_private.student(u);

  if p_request_id is null or p_action not in ('train', 'set') or p_formation is null then
    raise exception 'commander_invalid_command';
  end if;

  select * into c from public.commander_campaigns where active;
  if not found then raise exception 'commander_unavailable'; end if;

  unlock_level := commander_private.formation_unlock_level(p_formation, c.rules);
  if unlock_level is null then raise exception 'commander_invalid_formation'; end if;
  operation_name := case when p_action = 'train' then 'formation_train' else 'formation_set' end;

  perform pg_advisory_xact_lock(hashtextextended(u::text || ':' || c.id, 0));

  select * into old
  from public.commander_transactions
  where user_id = u and campaign_id = c.id and request_id = p_request_id;

  if found then
    if old.operation <> operation_name or old.payload <> body then
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

  commander_level := commander_private.level(p.xp);
  if commander_level < unlock_level then raise exception 'commander_formation_locked'; end if;

  insert into public.commander_formation_state(user_id, campaign_id)
  values (u, c.id)
  on conflict do nothing;
  insert into public.commander_formation_progress(user_id, campaign_id, formation_id)
  values (u, c.id, p_formation)
  on conflict do nothing;

  select * into strict fs
  from public.commander_formation_state
  where user_id = u and campaign_id = c.id
  for update;

  select * into strict fp
  from public.commander_formation_progress
  where user_id = u and campaign_id = c.id and formation_id = p_formation
  for update;

  if p_action = 'train' then
    cap := commander_private.formation_rank_cap(commander_level, c.rules);
    max_rank := coalesce((c.rules->>'formationMaxRank')::integer, 7);
    if fp.doctrine_rank >= max_rank then raise exception 'commander_formation_maxed'; end if;
    if fp.doctrine_rank >= cap then raise exception 'commander_formation_rank_cap'; end if;

    cost := commander_private.formation_training_cost(fp.doctrine_rank, c.rules);
    select coalesce(coins, 0) into strict wallet
    from public.users
    where id = u
    for update;
    if wallet < cost then raise exception 'commander_insufficient_coins'; end if;

    update public.users
    set coins = coins - cost
    where id = u and coins >= cost;
    if not found then raise exception 'commander_insufficient_coins'; end if;

    update public.commander_formation_progress
    set doctrine_rank = doctrine_rank + 1,
        version = version + 1,
        updated_at = now()
    where user_id = u and campaign_id = c.id and formation_id = p_formation;
  else
    if fp.doctrine_rank <= 0 then raise exception 'commander_formation_not_unlocked'; end if;
    if fs.active_formation = p_formation then raise exception 'commander_formation_already_active'; end if;

    update public.commander_formation_state
    set active_formation = p_formation,
        version = version + 1,
        updated_at = now()
    where user_id = u and campaign_id = c.id;
  end if;

  update public.commander_profiles
  set version = version + 1,
      updated_at = now()
  where user_id = u and campaign_id = c.id;

  insert into public.commander_transactions(
    user_id, campaign_id, request_id, operation, payload, coins_delta
  ) values (
    u, c.id, p_request_id, operation_name, body, -cost
  );

  return commander_private.snapshot(u);
end $$;

revoke all on function commander_private.formation_unlock_level(text, jsonb) from public, anon, authenticated;
revoke all on function commander_private.formation_rank_cap(integer, jsonb) from public, anon, authenticated;
revoke all on function commander_private.formation_training_cost(integer, jsonb) from public, anon, authenticated;
revoke all on function commander_private.formation_modifiers(text, integer) from public, anon, authenticated;
revoke all on function commander_private.loadout(uuid, text) from public, anon, authenticated;
revoke all on function public.rpc_commander_formation_command(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.rpc_commander_formation_command(uuid, text, text, integer) to authenticated;

comment on table public.commander_formation_progress is
  'Private per-Commander Formation doctrine ranks for the Level 41-100 progression track.';
comment on table public.commander_formation_state is
  'Private active Formation selection. Battle clients receive only the trusted composed loadout.';
comment on function commander_private.formation_rank_cap(integer, jsonb) is
  'Formation doctrine rank cap at Commander Levels 41, 50, 60, 70, 80, 90, and 100.';
comment on function public.rpc_commander_formation_command(uuid, text, text, integer) is
  'Authenticated atomic Formation unlock/advance/activation command using shared Coins and optimistic profile versioning.';

notify pgrst, 'reload schema';
commit;
