-- Economy & clan lockdown (step B of 2, audit 2026-10-29).
--
-- APPLY ONLY AFTER the app version that uses the step-A server actions is deployed.
-- Requires 20261029170000_economy_and_clan_server_actions.
--
--   1. users: coins, gemstones, ap_now, last_ap_update join the server-only columns
--      (extends the 20261029160000 guard). Shop, clan creation and AP refill now run on the server.
--   2. inventory: students can no longer create items, and may only switch their own item
--      to 'consumed' (used by "turn off cosmetic"). Previously anyone could insert free shields,
--      Crackers or items with any attack bonus.
--   3. shop_purchases: written only by rpc_shop_buy.
--   4. clans / clan_members: no direct self-join (any clan, any role), no force-adding other
--      students, no direct clan creation (skipped the fee) and no direct edits of vault_coins,
--      member_limit, leader_id. Joining goes through request → approval; creation through
--      rpc_create_clan; notice edits through rpc_update_clan_notice. Leaders can still delete
--      their clan and remove members; anyone can still leave. Admin policy unchanged.
--   5. clan_chat: posting only through rpc_clan_chat_post (server-set name, filter, rate limit).
--   6. rpc_join_clan (direct join, no approval, no school check) is no longer callable.
--   7. Hygiene: anon loses all privileges on clan and rivalry tables (it never had rows via RLS).
--
-- Rollback: supabase/rollbacks/20261029180000_economy_and_clan_lockdown.rollback.sql

-- ───────────── 1. users: economy columns become server-only ─────────────
create or replace function private.guard_user_privileged_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Only direct API writes are checked; definer RPCs (owner postgres) and service_role pass.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.role, 'student') <> 'student'
       or coalesce(new.is_admin, false)
       or coalesce(new.is_banned, false)
       or new.banned_until is not null
       or coalesce(new.account_tier, 'free') <> 'free'
       or coalesce(new.coins, 0) <> 0
       or coalesce(new.gemstones, 0) <> 0
       or coalesce(new.attack_power, 10) <> 10
       or coalesce(new.defense_power, 10) <> 10
       or coalesce(new.ap_max, 20) <> 20
       or coalesce(new.ap_now, 18) > 20
       or coalesce(new.pvp_score, 0) <> 0
       or coalesce(new.pvp_wins, 0) <> 0
       or coalesce(new.streak, 0) <> 0
       or coalesce(new.achievement_points, 0) <> 0
       or new.brains_master_until is not null
       or coalesce(new.profile_locked, false)
    then
      raise exception 'New profiles must start as a standard student account.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if exists (select 1 from public.superadmins s where s.user_id = (select auth.uid())) then
    return new;
  end if;

  if new.id                         is distinct from old.id
     or new.email                   is distinct from old.email
     or new.created_at              is distinct from old.created_at
     or new.role                    is distinct from old.role
     or new.is_admin                is distinct from old.is_admin
     or new.is_banned               is distinct from old.is_banned
     or new.banned_until            is distinct from old.banned_until
     or new.account_tier            is distinct from old.account_tier
     or new.admin_visible           is distinct from old.admin_visible
     or new.brains_master_until     is distinct from old.brains_master_until
     or new.profile_locked          is distinct from old.profile_locked
     or new.full_name_status        is distinct from old.full_name_status
     or new.full_name_verified_at   is distinct from old.full_name_verified_at
     or new.full_name_verified_by   is distinct from old.full_name_verified_by
     or new.coins                   is distinct from old.coins
     or new.gemstones               is distinct from old.gemstones
     or new.ap_now                  is distinct from old.ap_now
     or new.last_ap_update          is distinct from old.last_ap_update
     or new.attack_power            is distinct from old.attack_power
     or new.defense_power           is distinct from old.defense_power
     or new.ap_max                  is distinct from old.ap_max
     or new.pvp_score               is distinct from old.pvp_score
     or new.pvp_wins                is distinct from old.pvp_wins
     or new.last_attacked_at        is distinct from old.last_attacked_at
     or new.streak                  is distinct from old.streak
     or new.achievement_points      is distinct from old.achievement_points
     or new.total_questions_answered is distinct from old.total_questions_answered
     or new.coins_from_achievements is distinct from old.coins_from_achievements
     or new.coins_from_assignments  is distinct from old.coins_from_assignments
     or new.coins_from_pvp          is distinct from old.coins_from_pvp
     or new.coins_from_quests       is distinct from old.coins_from_quests
     or new.xp_from_achievements    is distinct from old.xp_from_achievements
     or new.xp_from_assignments     is distinct from old.xp_from_assignments
     or new.xp_from_pvp             is distinct from old.xp_from_pvp
     or new.xp_from_quests          is distinct from old.xp_from_quests
  then
    raise exception 'This account field can only be changed by the server.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
revoke all on function private.guard_user_privileged_columns() from public, anon, authenticated;

-- ───────────── 2. inventory ─────────────
drop policy if exists active_players_insert_inventory on public.inventory;

create or replace function private.guard_inventory_client_writes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if exists (select 1 from public.superadmins s where s.user_id = (select auth.uid())) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    raise exception 'Items can only be added by the server.' using errcode = '42501';
  end if;
  -- UPDATE: a student may only switch their own item off (state -> consumed).
  if new.state is distinct from 'consumed'
     or new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.item_id is distinct from old.item_id
     or new.name is distinct from old.name
     or new.kind is distinct from old.kind
     or new.description is distinct from old.description
     or new.effect_summary is distinct from old.effect_summary
     or new.attack_bonus is distinct from old.attack_bonus
     or new.defense_bonus is distinct from old.defense_bonus
     or new.activated_at is distinct from old.activated_at
     or new.created_at is distinct from old.created_at
  then
    raise exception 'Items can only be changed by the server.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_inventory_client_writes() from public, anon, authenticated;

drop trigger if exists trg_00_guard_inventory_client_writes on public.inventory;
create trigger trg_00_guard_inventory_client_writes
  before insert or update on public.inventory
  for each row execute function private.guard_inventory_client_writes();

-- ───────────── 3. shop_purchases ─────────────
drop policy if exists active_players_insert_shop_purchases on public.shop_purchases;
revoke insert, update, delete, truncate on table public.shop_purchases from anon, authenticated;

-- ───────────── 4. clans / clan_members ─────────────
drop policy if exists "Users can join clans" on public.clan_members;
drop policy if exists "Leaders can add members to clan" on public.clan_members;
revoke insert, update, truncate on table public.clan_members from anon, authenticated;

drop policy if exists "Users can create clans" on public.clans;
drop policy if exists "Leaders can update own clan" on public.clans;
revoke insert, truncate on table public.clans from anon, authenticated;

-- ───────────── 5. clan_chat ─────────────
drop policy if exists "Clan members can post messages" on public.clan_chat;
revoke insert, update, delete, truncate on table public.clan_chat from anon, authenticated;

-- ───────────── 6. direct join RPC ─────────────
revoke all on function public.rpc_join_clan(uuid) from public, anon, authenticated;

-- ───────────── 7. anon hygiene ─────────────
do $$
declare v_table text;
begin
  for v_table in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and (c.relname like 'clan%' or c.relname like 'rivalry%')
  loop
    execute format('revoke all on table public.%I from anon', v_table);
  end loop;
end $$;
