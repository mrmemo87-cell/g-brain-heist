-- Additive Commander pilot. No shared-wallet mutation, ranked loot, or season reset.
begin;
create schema if not exists commander_private;
revoke all on schema commander_private from public, anon, authenticated;

-- Existing owner-insert receipts are not proof of a server award. The invoker
-- trigger sees the real writing role (including a SECURITY DEFINER caller), not
-- a client-supplied flag. Historical/client receipts remain unverified.
alter table public.reward_event_receipts add column commander_server_verified boolean not null default false;
create function commander_private.mark_reward_origin() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 if TG_OP='INSERT' then
  NEW.commander_server_verified := current_user in ('postgres','service_role');
 else
  NEW.commander_server_verified := OLD.commander_server_verified;
 end if;
 return NEW;
end $$;
revoke all on function commander_private.mark_reward_origin() from public,anon,authenticated;
create trigger commander_reward_origin before insert or update on public.reward_event_receipts
 for each row execute function commander_private.mark_reward_origin();

create table public.commander_campaigns (
 id text primary key, title text not null, active boolean not null default false,
 rules jsonb not null, created_at timestamptz not null default now()
);
create unique index commander_one_active_campaign on public.commander_campaigns ((active)) where active;
create table public.commander_catalog (
 id text primary key, name text not null unique, kind text not null check(kind in ('unit','weapon','shield')),
 slot text not null check(slot in ('guard','archer','weapon','shield')),
 price integer not null check(price >= 0), stats jsonb not null default '{}',
 description text not null, active boolean not null default true,
 check ((kind='unit' and slot in ('guard','archer')) or (kind=slot and slot in ('weapon','shield')))
);
create table public.commander_profiles (
 user_id uuid not null references public.users(id) on delete cascade,
 campaign_id text not null references public.commander_campaigns(id),
 coins integer not null default 150 check(coins>=0), xp integer not null default 0 check(xp>=0),
 force_rank integer not null default 1 check(force_rank between 1 and 30),
 defense_rank integer not null default 1 check(defense_rank between 1 and 30),
 dexterity_rank integer not null default 1 check(dexterity_rank between 1 and 30),
 stamina_rank integer not null default 1 check(stamina_rank between 1 and 30),
 weapon text not null default 'void_saber' references public.commander_catalog(id),
 shield text not null default 'aegis_shield' references public.commander_catalog(id),
 guard text not null default 'neon_guard' references public.commander_catalog(id),
 archer text not null default 'shade_archer' references public.commander_catalog(id),
 goal text references public.commander_catalog(id), version integer not null default 1,
 enrolled_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(user_id,campaign_id)
);
create table public.commander_owned_items (
 user_id uuid not null, campaign_id text not null, item_id text not null references public.commander_catalog(id),
 acquired_at timestamptz not null default now(), primary key(user_id,campaign_id,item_id),
 foreign key(user_id,campaign_id) references public.commander_profiles on delete cascade
);
create table public.commander_transactions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null, campaign_id text not null,
 request_id uuid, source_receipt uuid references public.reward_event_receipts(id) on delete set null,
 operation text not null, payload jsonb not null default '{}', coins_delta integer not null default 0,
 xp_delta integer not null default 0, created_at timestamptz not null default now(),
 foreign key(user_id,campaign_id) references public.commander_profiles on delete cascade,
 unique(user_id,campaign_id,request_id), unique(user_id,campaign_id,source_receipt)
);
create index commander_transactions_owner_time on public.commander_transactions(user_id,campaign_id,created_at desc);

insert into public.commander_campaigns values ('pilot-v1','Founders’ Expedition',true,
 '{"starterCoins":150,"trainingBase":25,"trainingGrowth":1.15,"maxRank":10,"questXp":150,"questCoins":200,"dailyXpCap":3000,"weeklyXpCap":15000,"dailyCoinCap":4500,"weeklyCoinCap":22500}',now());
insert into public.commander_catalog(id,name,kind,slot,price,stats,description) values
 ('void_saber','Void Saber','weapon','weapon',0,'{"bolt":0,"focus":0,"hp":0}','Balanced spellcasting. Your original field weapon.'),
 ('aegis_shield','Aegis Shield','shield','shield',0,'{"shield":12,"guard":0,"hp":0}','A dependable starting barrier.'),
 ('neon_guard','Neon Guard','unit','guard',0,'{"hp":66,"shield":6,"attack":8}','Balanced frontline armor and sustained damage.'),
 ('shade_archer','Shade Archer','unit','archer',0,'{"hp":54,"shield":0,"attack":10}','Reliable ranged damage with a steady health reserve.'),
 ('rift_blade','Rift Blade','weapon','weapon',100,'{"bolt":6,"focus":2,"hp":-8}','Heavier spells at the cost of 8 Commander HP.'),
 ('bastion_plate','Bastion Plate','shield','shield',125,'{"shield":20,"guard":4,"hp":0}','Start with 8 more shield. Guard restores 4 more.'),
 ('neon_bulwark','Neon Bulwark','unit','guard',120,'{"hp":82,"shield":10,"attack":5}','Neon armor variant. Greater endurance, lower damage.'),
 ('shade_deadeye','Shade Deadeye','unit','archer',120,'{"hp":40,"shield":0,"attack":14}','Shade specialist variant. High damage, fragile defenses.');

alter table public.commander_campaigns enable row level security;
alter table public.commander_catalog enable row level security;
alter table public.commander_profiles enable row level security;
alter table public.commander_owned_items enable row level security;
alter table public.commander_transactions enable row level security;
revoke all on public.commander_campaigns,public.commander_catalog,public.commander_profiles,public.commander_owned_items,public.commander_transactions from public,anon,authenticated;
-- All client access goes through the checked RPCs below. No direct table write grants.

create function commander_private.student(p_user uuid) returns void language plpgsql stable security definer set search_path = '' as $$
begin
 if p_user is null or not exists(select 1 from public.users where id=p_user and role='student' and not coalesce(is_banned,false) and (banned_until is null or banned_until<=now())) then
  raise exception 'commander_students_only' using errcode='42501';
 end if;
end $$;

create function commander_private.level(p_xp integer) returns integer language sql immutable set search_path = '' as $$
 select greatest(1,least(100,floor((sqrt(8100.0+40.0*greatest(0,p_xp))-70.0)/20.0)::integer));
$$;

create function commander_private.loadout(p_user uuid,p_campaign text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare p public.commander_profiles; w jsonb; s jsonb; g public.commander_catalog; a public.commander_catalog;
begin
 select * into strict p from public.commander_profiles where user_id=p_user and campaign_id=p_campaign;
 select stats into strict w from public.commander_catalog where id=p.weapon;
 select stats into strict s from public.commander_catalog where id=p.shield;
 select * into strict g from public.commander_catalog where id=p.guard;
 select * into strict a from public.commander_catalog where id=p.archer;
 return jsonb_build_object('version',1,'profileVersion',p.version,
  'hp',100+6*(p.stamina_rank-1)+coalesce((w->>'hp')::integer,0)+coalesce((s->>'hp')::integer,0),
  'shield',(s->>'shield')::integer+2*(p.defense_rank-1),
  'bolt',26+2*(p.force_rank-1)+coalesce((w->>'bolt')::integer,0),
  'focus',7+(p.force_rank-1)+coalesce((w->>'focus')::integer,0),
  'guard',18+2*(p.defense_rank-1)+coalesce((s->>'guard')::integer,0),
  'shieldCap',30+2*(p.defense_rank-1)+greatest(0,(s->>'shield')::integer-12),
  'weaponName',(select name from public.commander_catalog where id=p.weapon),
  'shieldName',(select name from public.commander_catalog where id=p.shield),
  'units',jsonb_build_array(
   jsonb_build_object('id','player_guard','name',g.name,'hp',(g.stats->>'hp')::integer,'shield',(g.stats->>'shield')::integer,'attack',(g.stats->>'attack')::integer+(p.dexterity_rank-1)),
   jsonb_build_object('id','player_archer','name',a.name,'hp',(a.stats->>'hp')::integer,'shield',(a.stats->>'shield')::integer,'attack',(a.stats->>'attack')::integer+(p.dexterity_rank-1))));
end $$;

-- Pull confirmed eligible receipts after enrollment. No trigger on the shared reward path.
-- Only task_d1 (daily quest completion) is connected in the pilot; no PvP, premium, or historical grants.
create function commander_private.sync_rewards(p_user uuid,p_campaign text) returns void language plpgsql security definer set search_path = '' as $$
declare p public.commander_profiles; r record; rules jsonb; xc int; cc int; dx bigint; wx bigint; dc bigint; wc bigint;
begin
 select * into strict p from public.commander_profiles where user_id=p_user and campaign_id=p_campaign for update;
 select c.rules into rules from public.commander_campaigns c where id=p_campaign;
 for r in select rr.* from public.reward_event_receipts rr
  where rr.user_id=p_user and rr.commander_server_verified and rr.event_type='task_reward_claim' and rr.event_id ~ '^task:task_d1:[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  and rr.created_at>=p.enrolled_at and not exists(select 1 from public.commander_transactions t where t.user_id=p_user and t.campaign_id=p_campaign and t.source_receipt=rr.id)
  order by rr.created_at,rr.id limit 100
 loop
  select coalesce(sum(xp_delta) filter(where (created_at at time zone 'UTC')::date=(r.created_at at time zone 'UTC')::date),0),
   coalesce(sum(xp_delta) filter(where date_trunc('week',created_at at time zone 'UTC')=date_trunc('week',r.created_at at time zone 'UTC')),0),
   coalesce(sum(coins_delta) filter(where (created_at at time zone 'UTC')::date=(r.created_at at time zone 'UTC')::date),0),
   coalesce(sum(coins_delta) filter(where date_trunc('week',created_at at time zone 'UTC')=date_trunc('week',r.created_at at time zone 'UTC')),0)
  into dx,wx,dc,wc from public.commander_transactions where user_id=p_user and campaign_id=p_campaign and operation='reward';
  xc:=greatest(0,least((rules->>'questXp')::int,(rules->>'dailyXpCap')::int-dx,(rules->>'weeklyXpCap')::int-wx));
  cc:=greatest(0,least((rules->>'questCoins')::int,(rules->>'dailyCoinCap')::int-dc,(rules->>'weeklyCoinCap')::int-wc));
  insert into public.commander_transactions(user_id,campaign_id,source_receipt,operation,coins_delta,xp_delta,created_at) values(p_user,p_campaign,r.id,'reward',cc,xc,r.created_at);
  update public.commander_profiles set coins=coins+cc,xp=xp+xc,version=version+1,updated_at=now() where user_id=p_user and campaign_id=p_campaign;
 end loop;
end $$;

create function commander_private.snapshot(p_user uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c public.commander_campaigns; p public.commander_profiles;
begin
 select * into c from public.commander_campaigns where active;
 if not found then raise exception 'commander_unavailable'; end if;
 select * into p from public.commander_profiles where user_id=p_user and campaign_id=c.id;
 return jsonb_build_object('campaign',jsonb_build_object('id',c.id,'title',c.title,'rules',c.rules),
  'profile',case when p.user_id is null then null else to_jsonb(p)||jsonb_build_object('level',commander_private.level(p.xp),'rankCap',least((c.rules->>'maxRank')::int,5+commander_private.level(p.xp)/2)) end,
  'catalog',(select coalesce(jsonb_agg(to_jsonb(i) order by i.price,i.id),'[]') from public.commander_catalog i where i.active),
  'owned',(select coalesce(jsonb_agg(item_id order by item_id),'[]') from public.commander_owned_items where user_id=p_user and campaign_id=c.id),
  'loadout',case when p.user_id is null then null else commander_private.loadout(p_user,c.id) end,
  'history',(select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]') from (select operation,payload,coins_delta,xp_delta,created_at from public.commander_transactions where user_id=p_user and campaign_id=c.id order by created_at desc limit 12)t));
end $$;

create function public.rpc_commander_headquarters() returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=auth.uid(); c text;
begin
 perform commander_private.student(u);
 select id into c from public.commander_campaigns where active;
 if exists(select 1 from public.commander_profiles where user_id=u and campaign_id=c) then perform commander_private.sync_rewards(u,c); end if;
 return commander_private.snapshot(u);
end $$;

create function public.rpc_commander_command(p_request_id uuid,p_operation text,p_target text default null,p_expected_version integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=auth.uid(); c public.commander_campaigns; p public.commander_profiles; i public.commander_catalog; old public.commander_transactions; cost int:=0; starter_grant int; rank_now int; cap int; body jsonb:=jsonb_build_object('target',p_target);
begin
 perform commander_private.student(u);
 if p_request_id is null or p_operation not in ('enroll','buy','equip','train','goal') or p_operation is null then raise exception 'commander_invalid_command'; end if;
 select * into c from public.commander_campaigns where active;
 if not found then raise exception 'commander_unavailable'; end if;
 -- Also serializes first enrollment, before a profile row exists.
 perform pg_advisory_xact_lock(hashtextextended(u::text||':'||c.id,0));
 select * into old from public.commander_transactions where user_id=u and campaign_id=c.id and request_id=p_request_id;
 if found then
  if old.operation<>p_operation or old.payload<>body then raise exception 'commander_request_conflict'; end if;
  return commander_private.snapshot(u);
 end if;
 if p_operation='enroll' then
  insert into public.commander_profiles(user_id,campaign_id,coins) values(u,c.id,(c.rules->>'starterCoins')::int) on conflict do nothing returning coins into starter_grant;
  if starter_grant is null then return commander_private.snapshot(u); end if;
  insert into public.commander_owned_items(user_id,campaign_id,item_id) select u,c.id,id from public.commander_catalog where id in ('void_saber','aegis_shield','neon_guard','shade_archer') on conflict do nothing;
 else
  select * into p from public.commander_profiles where user_id=u and campaign_id=c.id for update;
  if not found then raise exception 'commander_enroll_first'; end if;
  if p_expected_version is null or p_expected_version<>p.version then raise exception 'commander_stale_profile'; end if;
  if p_operation in ('buy','equip','goal') then
   if p_target is not null then select * into i from public.commander_catalog where id=p_target and active; if not found then raise exception 'commander_invalid_item'; end if; end if;
   if p_operation='buy' then
    if i.id is null or i.price=0 then raise exception 'commander_invalid_item'; end if;
    if exists(select 1 from public.commander_owned_items where user_id=u and campaign_id=c.id and item_id=i.id) then raise exception 'commander_already_owned'; end if;
    cost:=i.price;
    if p.coins<cost then raise exception 'commander_insufficient_coins'; end if;
    insert into public.commander_owned_items(user_id,campaign_id,item_id) values(u,c.id,i.id);
    update public.commander_profiles set goal=case when goal=i.id then null else goal end where user_id=u and campaign_id=c.id;
   elsif p_operation='equip' then
    if i.id is null or not exists(select 1 from public.commander_owned_items where user_id=u and campaign_id=c.id and item_id=i.id) then raise exception 'commander_not_owned'; end if;
    update public.commander_profiles set weapon=case when i.slot='weapon' then i.id else weapon end,shield=case when i.slot='shield' then i.id else shield end,guard=case when i.slot='guard' then i.id else guard end,archer=case when i.slot='archer' then i.id else archer end where user_id=u and campaign_id=c.id;
   else
    if p_target is not null and exists(select 1 from public.commander_owned_items where user_id=u and campaign_id=c.id and item_id=p_target) then raise exception 'commander_already_owned'; end if;
    update public.commander_profiles set goal=p_target where user_id=u and campaign_id=c.id;
   end if;
  elsif p_operation='train' then
   rank_now:=case p_target when 'force' then p.force_rank when 'defense' then p.defense_rank when 'dexterity' then p.dexterity_rank when 'stamina' then p.stamina_rank else null end;
   if rank_now is null then raise exception 'commander_invalid_stat'; end if;
   cap:=least((c.rules->>'maxRank')::int,5+commander_private.level(p.xp)/2);
   if rank_now>=cap then raise exception 'commander_rank_cap'; end if;
   cost:=round((c.rules->>'trainingBase')::numeric*power((c.rules->>'trainingGrowth')::numeric,rank_now-1));
   if p.coins<cost then raise exception 'commander_insufficient_coins'; end if;
   update public.commander_profiles set force_rank=force_rank+case when p_target='force' then 1 else 0 end,defense_rank=defense_rank+case when p_target='defense' then 1 else 0 end,dexterity_rank=dexterity_rank+case when p_target='dexterity' then 1 else 0 end,stamina_rank=stamina_rank+case when p_target='stamina' then 1 else 0 end where user_id=u and campaign_id=c.id;
  end if;
  update public.commander_profiles set coins=coins-cost,version=version+1,updated_at=now() where user_id=u and campaign_id=c.id;
 end if;
 insert into public.commander_transactions(user_id,campaign_id,request_id,operation,payload,coins_delta) values(u,c.id,p_request_id,p_operation,body,case when p_operation='enroll' then starter_grant else -cost end);
 return commander_private.snapshot(u);
end $$;

-- Called only by the authenticated Edge Function after it verifies the student JWT.
create function public.rpc_commander_owned_loadout(p_user_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare c text;
begin
 if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' and coalesce((nullif(current_setting('request.jwt.claims',true),'')::jsonb)->>'role','')<>'service_role' then raise exception 'commander_service_only' using errcode='42501'; end if;
 perform commander_private.student(p_user_id);
 select id into c from public.commander_campaigns where active;
 if not exists(select 1 from public.commander_profiles where user_id=p_user_id and campaign_id=c) then raise exception 'commander_enroll_first'; end if;
 return commander_private.loadout(p_user_id,c);
end $$;

revoke all on function commander_private.student(uuid),commander_private.level(integer),commander_private.loadout(uuid,text),commander_private.sync_rewards(uuid,text),commander_private.snapshot(uuid) from public,anon,authenticated;
revoke all on function public.rpc_commander_headquarters() from public,anon,authenticated;
revoke all on function public.rpc_commander_command(uuid,text,text,integer) from public,anon,authenticated;
revoke all on function public.rpc_commander_owned_loadout(uuid) from public,anon,authenticated;
grant execute on function public.rpc_commander_headquarters(),public.rpc_commander_command(uuid,text,text,integer) to authenticated;
grant execute on function public.rpc_commander_owned_loadout(uuid) to service_role;
commit;
