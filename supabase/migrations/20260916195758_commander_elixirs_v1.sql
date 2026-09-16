begin;

create table public.commander_elixir_catalog (
  id text primary key,
  name text not null,
  stat_key text not null check (stat_key in ('force','defense','dexterity','stamina','omni')),
  boost_ranks integer not null check (boost_ranks between 1 and 2),
  duration_minutes integer not null check (duration_minutes in (30,60)),
  gemstone_price integer not null check (gemstone_price > 0),
  rarity text not null default 'common' check (rarity in ('common','rare','epic')),
  description text not null,
  active boolean not null default true,
  sort_order integer not null default 0
);

create table public.commander_elixir_inventory (
  user_id uuid not null references public.users(id) on delete cascade,
  elixir_id text not null references public.commander_elixir_catalog(id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, elixir_id)
);

create table public.commander_active_elixirs (
  user_id uuid primary key references public.users(id) on delete cascade,
  elixir_id text not null references public.commander_elixir_catalog(id),
  activated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at > activated_at)
);

create index commander_active_elixirs_expires_idx
  on public.commander_active_elixirs(expires_at);

create table public.commander_elixir_transactions (
  user_id uuid not null references public.users(id) on delete cascade,
  request_id uuid not null,
  operation text not null check (operation in ('purchase','activate')),
  elixir_id text not null references public.commander_elixir_catalog(id),
  quantity integer not null default 1 check (quantity > 0),
  gemstones_delta integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

alter table public.commander_elixir_catalog enable row level security;
alter table public.commander_elixir_inventory enable row level security;
alter table public.commander_active_elixirs enable row level security;
alter table public.commander_elixir_transactions enable row level security;

revoke all on table public.commander_elixir_catalog from public, anon, authenticated;
revoke all on table public.commander_elixir_inventory from public, anon, authenticated;
revoke all on table public.commander_active_elixirs from public, anon, authenticated;
revoke all on table public.commander_elixir_transactions from public, anon, authenticated;

insert into public.commander_elixir_catalog
  (id,name,stat_key,boost_ranks,duration_minutes,gemstone_price,rarity,description,sort_order)
values
  ('force_30','Force Elixir','force',1,30,2,'common','Temporarily adds 1 effective Force rank in combat.',10),
  ('force_60','Greater Force Elixir','force',2,60,5,'rare','Temporarily adds 2 effective Force ranks in combat.',11),
  ('defense_30','Bastion Elixir','defense',1,30,2,'common','Temporarily adds 1 effective Defense rank in combat.',20),
  ('defense_60','Greater Bastion Elixir','defense',2,60,5,'rare','Temporarily adds 2 effective Defense ranks in combat.',21),
  ('dexterity_30','Reflex Elixir','dexterity',1,30,2,'common','Temporarily adds 1 effective Dexterity rank in combat.',30),
  ('dexterity_60','Greater Reflex Elixir','dexterity',2,60,5,'rare','Temporarily adds 2 effective Dexterity ranks in combat.',31),
  ('stamina_30','Vitality Elixir','stamina',1,30,2,'common','Temporarily adds 1 effective Stamina rank in combat.',40),
  ('stamina_60','Greater Vitality Elixir','stamina',2,60,5,'rare','Temporarily adds 2 effective Stamina ranks in combat.',41),
  ('omni_30','Commander Elixir','omni',1,30,8,'epic','Temporarily adds 1 effective rank to Force, Defense, Dexterity, and Stamina in combat.',50);

create or replace function commander_private.elixir_snapshot(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'wallet', jsonb_build_object(
      'gemstones', coalesce((select u.gemstones from public.users u where u.id = p_user), 0)
    ),
    'catalog', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'statKey', c.stat_key,
          'boostRanks', c.boost_ranks,
          'durationMinutes', c.duration_minutes,
          'gemstonePrice', c.gemstone_price,
          'rarity', c.rarity,
          'description', c.description
        ) order by c.sort_order, c.id
      )
      from public.commander_elixir_catalog c
      where c.active
    ), '[]'::jsonb),
    'inventory', coalesce((
      select jsonb_object_agg(i.elixir_id, i.quantity)
      from public.commander_elixir_inventory i
      where i.user_id = p_user and i.quantity > 0
    ), '{}'::jsonb),
    'active', (
      select jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'statKey', c.stat_key,
        'boostRanks', c.boost_ranks,
        'durationMinutes', c.duration_minutes,
        'activatedAt', a.activated_at,
        'expiresAt', a.expires_at
      )
      from public.commander_active_elixirs a
      join public.commander_elixir_catalog c on c.id = a.elixir_id
      where a.user_id = p_user and a.expires_at > now() and c.active
    ),
    'serverTime', now()
  );
$$;

revoke all on function commander_private.elixir_snapshot(uuid) from public, anon, authenticated;

create or replace function public.rpc_commander_elixirs()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  perform commander_private.student(v_user);
  if not exists (
    select 1
    from public.commander_profiles p
    join public.commander_campaigns c on c.id = p.campaign_id and c.active
    where p.user_id = v_user
  ) then
    raise exception 'commander_enroll_first' using errcode = 'P0001';
  end if;
  return commander_private.elixir_snapshot(v_user);
end;
$$;

revoke all on function public.rpc_commander_elixirs() from public, anon;
grant execute on function public.rpc_commander_elixirs() to authenticated;

create or replace function public.rpc_commander_elixir_purchase(
  p_request_id uuid,
  p_elixir_id text,
  p_quantity integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_item public.commander_elixir_catalog%rowtype;
  v_existing public.commander_elixir_transactions%rowtype;
  v_gems integer;
  v_cost integer;
begin
  perform commander_private.student(v_user);
  if p_request_id is null or p_elixir_id is null or p_quantity is null or p_quantity < 1 or p_quantity > 10 then
    raise exception 'commander_elixir_invalid_request' using errcode = 'P0001';
  end if;
  if not exists (
    select 1
    from public.commander_profiles p
    join public.commander_campaigns c on c.id = p.campaign_id and c.active
    where p.user_id = v_user
  ) then
    raise exception 'commander_enroll_first' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 0));

  select * into v_existing
  from public.commander_elixir_transactions
  where user_id = v_user and request_id = p_request_id;
  if found then
    if v_existing.operation <> 'purchase' or v_existing.elixir_id <> p_elixir_id or v_existing.quantity <> p_quantity then
      raise exception 'commander_elixir_request_conflict' using errcode = 'P0001';
    end if;
    return commander_private.elixir_snapshot(v_user);
  end if;

  select * into v_item
  from public.commander_elixir_catalog
  where id = p_elixir_id and active;
  if not found then
    raise exception 'commander_elixir_not_found' using errcode = 'P0001';
  end if;

  select gemstones into v_gems
  from public.users
  where id = v_user
  for update;

  v_cost := v_item.gemstone_price * p_quantity;
  if coalesce(v_gems, 0) < v_cost then
    raise exception 'commander_elixir_not_enough_gemstones' using errcode = 'P0001';
  end if;

  update public.users
  set gemstones = gemstones - v_cost
  where id = v_user;

  insert into public.commander_elixir_inventory(user_id, elixir_id, quantity, updated_at)
  values (v_user, p_elixir_id, p_quantity, now())
  on conflict (user_id, elixir_id) do update
    set quantity = public.commander_elixir_inventory.quantity + excluded.quantity,
        updated_at = now();

  insert into public.commander_elixir_transactions
    (user_id, request_id, operation, elixir_id, quantity, gemstones_delta)
  values
    (v_user, p_request_id, 'purchase', p_elixir_id, p_quantity, -v_cost);

  return commander_private.elixir_snapshot(v_user);
end;
$$;

revoke all on function public.rpc_commander_elixir_purchase(uuid,text,integer) from public, anon;
grant execute on function public.rpc_commander_elixir_purchase(uuid,text,integer) to authenticated;

create or replace function public.rpc_commander_elixir_activate(
  p_request_id uuid,
  p_elixir_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_item public.commander_elixir_catalog%rowtype;
  v_existing public.commander_elixir_transactions%rowtype;
  v_active public.commander_active_elixirs%rowtype;
  v_quantity integer;
  v_start timestamptz;
  v_expiry timestamptz;
begin
  perform commander_private.student(v_user);
  if p_request_id is null or p_elixir_id is null then
    raise exception 'commander_elixir_invalid_request' using errcode = 'P0001';
  end if;
  if not exists (
    select 1
    from public.commander_profiles p
    join public.commander_campaigns c on c.id = p.campaign_id and c.active
    where p.user_id = v_user
  ) then
    raise exception 'commander_enroll_first' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 0));

  select * into v_existing
  from public.commander_elixir_transactions
  where user_id = v_user and request_id = p_request_id;
  if found then
    if v_existing.operation <> 'activate' or v_existing.elixir_id <> p_elixir_id then
      raise exception 'commander_elixir_request_conflict' using errcode = 'P0001';
    end if;
    return commander_private.elixir_snapshot(v_user);
  end if;

  select * into v_item
  from public.commander_elixir_catalog
  where id = p_elixir_id and active;
  if not found then
    raise exception 'commander_elixir_not_found' using errcode = 'P0001';
  end if;

  delete from public.commander_active_elixirs
  where user_id = v_user and expires_at <= now();

  select * into v_active
  from public.commander_active_elixirs
  where user_id = v_user
  for update;

  if found and v_active.elixir_id <> p_elixir_id then
    raise exception 'commander_elixir_other_active' using errcode = 'P0001';
  end if;

  select quantity into v_quantity
  from public.commander_elixir_inventory
  where user_id = v_user and elixir_id = p_elixir_id
  for update;

  if coalesce(v_quantity, 0) < 1 then
    raise exception 'commander_elixir_none_owned' using errcode = 'P0001';
  end if;

  update public.commander_elixir_inventory
  set quantity = quantity - 1, updated_at = now()
  where user_id = v_user and elixir_id = p_elixir_id;

  delete from public.commander_elixir_inventory
  where user_id = v_user and elixir_id = p_elixir_id and quantity = 0;

  if v_active.user_id is not null then
    v_start := greatest(v_active.expires_at, now());
    v_expiry := v_start + make_interval(mins => v_item.duration_minutes);
    update public.commander_active_elixirs
    set expires_at = v_expiry
    where user_id = v_user;
  else
    v_start := now();
    v_expiry := v_start + make_interval(mins => v_item.duration_minutes);
    insert into public.commander_active_elixirs(user_id, elixir_id, activated_at, expires_at)
    values (v_user, p_elixir_id, v_start, v_expiry);
  end if;

  insert into public.commander_elixir_transactions
    (user_id, request_id, operation, elixir_id, quantity, gemstones_delta)
  values
    (v_user, p_request_id, 'activate', p_elixir_id, 1, 0);

  return commander_private.elixir_snapshot(v_user);
end;
$$;

revoke all on function public.rpc_commander_elixir_activate(uuid,text) from public, anon;
grant execute on function public.rpc_commander_elixir_activate(uuid,text) to authenticated;

create or replace function commander_private.combat_loadout(p_user uuid, p_campaign text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_base jsonb;
  v_stat text;
  v_boost integer;
  v_elixir_id text;
  v_elixir_name text;
  v_duration integer;
  v_expires timestamptz;
  v_units jsonb;
begin
  v_base := commander_private.loadout(p_user, p_campaign);
  if v_base is null then return null; end if;

  select c.stat_key, c.boost_ranks, c.id, c.name, c.duration_minutes, a.expires_at
    into v_stat, v_boost, v_elixir_id, v_elixir_name, v_duration, v_expires
  from public.commander_active_elixirs a
  join public.commander_elixir_catalog c on c.id = a.elixir_id and c.active
  where a.user_id = p_user and a.expires_at > now();

  if v_elixir_id is null then return v_base; end if;

  if v_stat in ('force','omni') then
    v_base := jsonb_set(v_base, '{bolt}', to_jsonb(coalesce((v_base->>'bolt')::integer, 0) + 2 * v_boost), true);
    v_base := jsonb_set(v_base, '{focus}', to_jsonb(coalesce((v_base->>'focus')::integer, 0) + v_boost), true);
  end if;

  if v_stat in ('defense','omni') then
    v_base := jsonb_set(v_base, '{shield}', to_jsonb(coalesce((v_base->>'shield')::integer, 0) + 2 * v_boost), true);
    v_base := jsonb_set(v_base, '{guard}', to_jsonb(coalesce((v_base->>'guard')::integer, 0) + 2 * v_boost), true);
    v_base := jsonb_set(v_base, '{shieldCap}', to_jsonb(coalesce((v_base->>'shieldCap')::integer, 0) + 2 * v_boost), true);
  end if;

  if v_stat in ('stamina','omni') then
    v_base := jsonb_set(v_base, '{hp}', to_jsonb(coalesce((v_base->>'hp')::integer, 0) + 6 * v_boost), true);
  end if;

  if v_stat in ('dexterity','omni') and jsonb_typeof(v_base->'units') = 'array' then
    select coalesce(jsonb_agg(
      case
        when jsonb_typeof(e.value) = 'object' then
          jsonb_set(e.value, '{attack}', to_jsonb(coalesce((e.value->>'attack')::integer, 0) + v_boost), true)
        else e.value
      end order by e.ordinality
    ), '[]'::jsonb)
    into v_units
    from jsonb_array_elements(v_base->'units') with ordinality as e(value, ordinality);
    v_base := jsonb_set(v_base, '{units}', v_units, true);
  end if;

  return v_base || jsonb_build_object(
    'elixir', jsonb_build_object(
      'id', v_elixir_id,
      'name', v_elixir_name,
      'statKey', v_stat,
      'boostRanks', v_boost,
      'durationMinutes', v_duration,
      'expiresAt', v_expires
    )
  );
end;
$$;

revoke all on function commander_private.combat_loadout(uuid,text) from public, anon, authenticated;

create or replace function public.rpc_commander_owned_loadout(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare c text;
begin
 if current_setting('request.jwt.claim.role',true) is distinct from 'service_role'
    and coalesce((nullif(current_setting('request.jwt.claims',true),'')::jsonb)->>'role','') <> 'service_role' then
   raise exception 'commander_service_only' using errcode='42501';
 end if;
 perform commander_private.student(p_user_id);
 select id into c from public.commander_campaigns where active;
 if not exists(select 1 from public.commander_profiles where user_id=p_user_id and campaign_id=c) then
   raise exception 'commander_enroll_first';
 end if;
 return commander_private.combat_loadout(p_user_id,c);
end;
$$;

revoke all on function public.rpc_commander_owned_loadout(uuid) from public, anon, authenticated;
grant execute on function public.rpc_commander_owned_loadout(uuid) to service_role;

commit;
