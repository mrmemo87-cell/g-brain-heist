-- Commander spends the existing Brains Heist wallet. No balance conversion or duplicate grants.
begin;
alter table public.commander_profiles alter column coins set default 0;
comment on column public.commander_profiles.coins is 'Legacy pilot balance; inactive. All Commander spending uses public.users.coins.';
update public.commander_campaigns set rules=rules||'{"starterCoins":0,"questCoins":0}'::jsonb;
create or replace function commander_private.snapshot(p_user uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c public.commander_campaigns; p public.commander_profiles;
begin
 select * into c from public.commander_campaigns where active;
 if not found then raise exception 'commander_unavailable'; end if;
 select * into p from public.commander_profiles where user_id=p_user and campaign_id=c.id;
 return jsonb_build_object('wallet',jsonb_build_object('coins',(select coalesce(coins,0) from public.users where id=p_user),'currency','brains_heist_coins'),
  'campaign',jsonb_build_object('id',c.id,'title',c.title,'rules',c.rules),
  'profile',case when p.user_id is null then null else to_jsonb(p)||jsonb_build_object('coins',(select coalesce(coins,0) from public.users where id=p_user),'level',commander_private.level(p.xp),'rankCap',least((c.rules->>'maxRank')::int,5+commander_private.level(p.xp)/2)) end,
  'catalog',(select coalesce(jsonb_agg(to_jsonb(i) order by i.price,i.id),'[]') from public.commander_catalog i where i.active),
  'owned',(select coalesce(jsonb_agg(item_id order by item_id),'[]') from public.commander_owned_items where user_id=p_user and campaign_id=c.id),
  'loadout',case when p.user_id is null then null else commander_private.loadout(p_user,c.id) end,
  'history',(select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]') from (select operation,payload,coins_delta,xp_delta,created_at from public.commander_transactions where user_id=p_user and campaign_id=c.id order by created_at desc limit 12)t));
end $$;
create or replace function commander_private.sync_rewards(p_user uuid,p_campaign text) returns void language plpgsql security definer set search_path = '' as $$
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
  cc:=0; -- Shared task RPC already awards account Coins; Commander only awards XP.
  insert into public.commander_transactions(user_id,campaign_id,source_receipt,operation,coins_delta,xp_delta,created_at) values(p_user,p_campaign,r.id,'reward',cc,xc,r.created_at);
  update public.commander_profiles set xp=xp+xc,version=version+1,updated_at=now() where user_id=p_user and campaign_id=p_campaign;
 end loop;
end $$;
create or replace function public.rpc_commander_command(p_request_id uuid,p_operation text,p_target text default null,p_expected_version integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=auth.uid(); c public.commander_campaigns; p public.commander_profiles; i public.commander_catalog; old public.commander_transactions; cost int:=0; starter_grant int; wallet bigint; rank_now int; cap int; body jsonb:=jsonb_build_object('target',p_target);
begin
 perform commander_private.student(u);
 if p_request_id is null or p_operation not in ('enroll','buy','equip','train','goal') or p_operation is null then raise exception 'commander_invalid_command'; end if;
 select * into c from public.commander_campaigns where active;
 if not found then raise exception 'commander_unavailable'; end if;
 -- Also serializes first enrollment, before a profile row exists.
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
    if wallet<cost then raise exception 'commander_insufficient_coins'; end if;
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
   if wallet<cost then raise exception 'commander_insufficient_coins'; end if;
   update public.commander_profiles set force_rank=force_rank+case when p_target='force' then 1 else 0 end,defense_rank=defense_rank+case when p_target='defense' then 1 else 0 end,dexterity_rank=dexterity_rank+case when p_target='dexterity' then 1 else 0 end,stamina_rank=stamina_rank+case when p_target='stamina' then 1 else 0 end where user_id=u and campaign_id=c.id;
  end if;
  if cost>0 then
   update public.users set coins=coins-cost where id=u and coins>=cost;
   if not found then raise exception 'commander_insufficient_coins'; end if;
  end if;
  update public.commander_profiles set version=version+1,updated_at=now() where user_id=u and campaign_id=c.id;
 end if;
 insert into public.commander_transactions(user_id,campaign_id,request_id,operation,payload,coins_delta) values(u,c.id,p_request_id,p_operation,body,case when p_operation='enroll' then starter_grant else -cost end);
 return commander_private.snapshot(u);
end $$;
revoke all on function commander_private.snapshot(uuid),commander_private.sync_rewards(uuid,text) from public,anon,authenticated;
revoke all on function public.rpc_commander_command(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.rpc_commander_command(uuid,text,text,integer) to authenticated;
notify pgrst,'reload schema';
commit;
