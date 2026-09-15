-- Commander PvP + long-term progression foundation.
-- PvP is global across enrolled student Commanders. Battles are server-authoritative,
-- persist their snapshots/state, and intentionally do not transfer account Coins or XP.
begin;

update public.commander_campaigns
set rules = rules || '{
  "progressionVersion":2,
  "unitTrainingUnlockLevel":11,
  "unitEvolutionUnlockLevel":21,
  "schoolMasteryUnlockLevel":31,
  "formationUnlockLevel":41,
  "skillTreeUnlockLevel":51,
  "synergyUnlockLevel":61,
  "eliteUnlockLevel":71,
  "advancedPowerUnlockLevel":81,
  "legendaryUnlockLevel":91,
  "pvpCooldownSeconds":300,
  "pvpBattleTtlMinutes":30
}'::jsonb
where active;

create table public.commander_unit_progress (
  user_id uuid not null,
  campaign_id text not null,
  item_id text not null references public.commander_catalog(id) on delete cascade,
  unit_rank smallint not null default 1 check (unit_rank between 1 and 10),
  evolution_tier smallint not null default 0 check (evolution_tier between 0 and 3),
  training_points integer not null default 0 check (training_points >= 0),
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, campaign_id, item_id),
  foreign key (user_id, campaign_id)
    references public.commander_profiles(user_id, campaign_id)
    on delete cascade
);

alter table public.commander_unit_progress enable row level security;
revoke all on public.commander_unit_progress from public, anon, authenticated;

insert into public.commander_unit_progress(user_id, campaign_id, item_id)
select oi.user_id, oi.campaign_id, oi.item_id
from public.commander_owned_items oi
join public.commander_catalog c on c.id = oi.item_id and c.kind = 'unit'
on conflict do nothing;

create function commander_private.seed_unit_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.commander_catalog c
    where c.id = new.item_id
      and c.kind = 'unit'
  ) then
    insert into public.commander_unit_progress(user_id, campaign_id, item_id)
    values (new.user_id, new.campaign_id, new.item_id)
    on conflict do nothing;
  end if;
  return new;
end $$;

revoke all on function commander_private.seed_unit_progress() from public, anon, authenticated;

drop trigger if exists commander_owned_item_seed_unit_progress on public.commander_owned_items;
create trigger commander_owned_item_seed_unit_progress
after insert on public.commander_owned_items
for each row execute function commander_private.seed_unit_progress();

create table public.commander_pvp_battles (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null references public.commander_campaigns(id) on delete cascade,
  attacker_id uuid not null references public.users(id) on delete cascade,
  defender_id uuid not null references public.users(id) on delete cascade,
  attacker_snapshot jsonb not null,
  defender_snapshot jsonb not null,
  battle_state jsonb not null,
  status text not null default 'active'
    check (status in ('active', 'victory', 'defeat', 'draw', 'expired', 'cancelled')),
  state_version integer not null default 1 check (state_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  finished_at timestamptz,
  check (attacker_id <> defender_id)
);

alter table public.commander_pvp_battles enable row level security;
revoke all on public.commander_pvp_battles from public, anon, authenticated;

create unique index commander_pvp_one_active_battle_per_attacker
  on public.commander_pvp_battles(attacker_id)
  where status = 'active';
create index commander_pvp_attacker_defender_created
  on public.commander_pvp_battles(attacker_id, defender_id, created_at desc);
create index commander_pvp_attacker_history
  on public.commander_pvp_battles(attacker_id, created_at desc);
create index commander_pvp_defender_history
  on public.commander_pvp_battles(defender_id, created_at desc);
create index commander_pvp_expiry
  on public.commander_pvp_battles(expires_at)
  where status = 'active';

create function public.rpc_commander_pvp_lobby(
  p_search text default null,
  p_limit integer default 40
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  u uuid := auth.uid();
  c public.commander_campaigns;
  my_level integer;
  safe_limit integer := greatest(1, least(coalesce(p_limit, 40), 60));
  needle text := nullif(trim(coalesce(p_search, '')), '');
begin
  perform commander_private.student(u);

  select * into c
  from public.commander_campaigns
  where active;
  if not found then
    raise exception 'commander_unavailable';
  end if;

  if not exists (
    select 1 from public.commander_profiles p
    where p.user_id = u and p.campaign_id = c.id
  ) then
    raise exception 'commander_enroll_first';
  end if;

  update public.commander_pvp_battles
  set status = 'expired', finished_at = coalesce(finished_at, now()), updated_at = now()
  where attacker_id = u
    and status = 'active'
    and expires_at <= now();

  select commander_private.level(p.xp)
  into my_level
  from public.commander_profiles p
  where p.user_id = u and p.campaign_id = c.id;

  return jsonb_build_object(
    'rules', jsonb_build_object(
      'cooldownSeconds', coalesce((c.rules->>'pvpCooldownSeconds')::integer, 300),
      'battleTtlMinutes', coalesce((c.rules->>'pvpBattleTtlMinutes')::integer, 30)
    ),
    'targets', (
      select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
      from (
        select
          candidate.id as user_id,
          coalesce(nullif(trim(candidate.username), ''), 'Commander') as username,
          candidate.avatar_url,
          commander_private.level(cp.xp) as level,
          guard_item.name as guard_name,
          archer_item.name as archer_name,
          guard_item.school as guard_school,
          archer_item.school as archer_school,
          (
            select max(b.created_at)
            from public.commander_pvp_battles b
            where b.attacker_id = u
              and b.defender_id = candidate.id
          ) as last_attacked_at
        from public.users candidate
        join public.commander_profiles cp
          on cp.user_id = candidate.id
         and cp.campaign_id = c.id
        join public.commander_catalog guard_item on guard_item.id = cp.guard
        join public.commander_catalog archer_item on archer_item.id = cp.archer
        where candidate.id <> u
          and coalesce(candidate.role, 'student') = 'student'
          and not coalesce(candidate.is_banned, false)
          and (candidate.banned_until is null or candidate.banned_until <= now())
          and (
            needle is null
            or coalesce(candidate.username, '') ilike '%' || needle || '%'
          )
        order by
          abs(commander_private.level(cp.xp) - my_level),
          coalesce(candidate.username, ''),
          candidate.id
        limit safe_limit
      ) t
    ),
    'activeBattle', (
      select to_jsonb(a)
      from (
        select
          b.id as battle_id,
          b.defender_id as opponent_user_id,
          coalesce(nullif(trim(opponent.username), ''), 'Commander') as opponent_username,
          opponent.avatar_url as opponent_avatar_url,
          commander_private.level(op.xp) as opponent_level,
          b.created_at,
          b.expires_at
        from public.commander_pvp_battles b
        join public.users opponent on opponent.id = b.defender_id
        join public.commander_profiles op
          on op.user_id = opponent.id
         and op.campaign_id = b.campaign_id
        where b.attacker_id = u
          and b.campaign_id = c.id
          and b.status = 'active'
          and b.expires_at > now()
        order by b.created_at desc
        limit 1
      ) a
    ),
    'history', (
      select coalesce(jsonb_agg(to_jsonb(h)), '[]'::jsonb)
      from (
        select
          b.id as battle_id,
          case
            when b.attacker_id = u then b.status
            when b.status = 'victory' then 'defeat'
            when b.status = 'defeat' then 'victory'
            else b.status
          end as result,
          (b.attacker_id = u) as was_attacker,
          opponent.id as opponent_user_id,
          coalesce(nullif(trim(opponent.username), ''), 'Commander') as opponent_username,
          opponent.avatar_url as opponent_avatar_url,
          b.created_at,
          b.finished_at
        from public.commander_pvp_battles b
        join public.users opponent
          on opponent.id = case when b.attacker_id = u then b.defender_id else b.attacker_id end
        where b.campaign_id = c.id
          and (b.attacker_id = u or b.defender_id = u)
          and b.status <> 'active'
        order by b.created_at desc
        limit 20
      ) h
    )
  );
end $$;

revoke all on function public.rpc_commander_pvp_lobby(text, integer) from public, anon, authenticated;
grant execute on function public.rpc_commander_pvp_lobby(text, integer) to authenticated;

notify pgrst, 'reload schema';
commit;
