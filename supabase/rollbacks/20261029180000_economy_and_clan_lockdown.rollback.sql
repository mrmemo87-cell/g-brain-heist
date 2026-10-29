-- Rollback for 20261029180000_economy_and_clan_lockdown.sql
-- WARNING: reopens direct client writes to coins/gems/AP, inventory, clans, clan membership and chat.

-- 1. users guard back to the 20261029160000 version (economy columns writable again)
create or replace function private.guard_user_privileged_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    if coalesce(new.role, 'student') <> 'student' or coalesce(new.is_admin, false) or coalesce(new.is_banned, false)
       or new.banned_until is not null or coalesce(new.account_tier, 'free') <> 'free' or coalesce(new.coins, 0) <> 0
       or coalesce(new.gemstones, 0) <> 0 or coalesce(new.attack_power, 10) <> 10 or coalesce(new.defense_power, 10) <> 10
       or coalesce(new.ap_max, 20) <> 20 or coalesce(new.pvp_score, 0) <> 0 or coalesce(new.pvp_wins, 0) <> 0
       or coalesce(new.streak, 0) <> 0 or coalesce(new.achievement_points, 0) <> 0 or new.brains_master_until is not null
       or coalesce(new.profile_locked, false) then
      raise exception 'New profiles must start as a standard student account.' using errcode = '42501';
    end if;
    return new;
  end if;
  if exists (select 1 from public.superadmins s where s.user_id = (select auth.uid())) then return new; end if;
  if new.id is distinct from old.id or new.email is distinct from old.email or new.created_at is distinct from old.created_at
     or new.role is distinct from old.role or new.is_admin is distinct from old.is_admin or new.is_banned is distinct from old.is_banned
     or new.banned_until is distinct from old.banned_until or new.account_tier is distinct from old.account_tier
     or new.admin_visible is distinct from old.admin_visible or new.brains_master_until is distinct from old.brains_master_until
     or new.profile_locked is distinct from old.profile_locked or new.full_name_status is distinct from old.full_name_status
     or new.full_name_verified_at is distinct from old.full_name_verified_at or new.full_name_verified_by is distinct from old.full_name_verified_by
     or new.attack_power is distinct from old.attack_power or new.defense_power is distinct from old.defense_power
     or new.ap_max is distinct from old.ap_max or new.pvp_score is distinct from old.pvp_score or new.pvp_wins is distinct from old.pvp_wins
     or new.last_attacked_at is distinct from old.last_attacked_at or new.streak is distinct from old.streak
     or new.achievement_points is distinct from old.achievement_points or new.total_questions_answered is distinct from old.total_questions_answered
     or new.coins_from_achievements is distinct from old.coins_from_achievements or new.coins_from_assignments is distinct from old.coins_from_assignments
     or new.coins_from_pvp is distinct from old.coins_from_pvp or new.coins_from_quests is distinct from old.coins_from_quests
     or new.xp_from_achievements is distinct from old.xp_from_achievements or new.xp_from_assignments is distinct from old.xp_from_assignments
     or new.xp_from_pvp is distinct from old.xp_from_pvp or new.xp_from_quests is distinct from old.xp_from_quests then
    raise exception 'This account field can only be changed by the server.' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- 2. inventory
drop trigger if exists trg_00_guard_inventory_client_writes on public.inventory;
drop function if exists private.guard_inventory_client_writes();
create policy active_players_insert_inventory on public.inventory for insert with check (
  ((select auth.uid()) = user_id) and exists (select 1 from users u_guard where u_guard.id = (select auth.uid()) and coalesce(u_guard.is_banned, false) = false));

-- 3. shop_purchases
grant insert, update, delete on table public.shop_purchases to authenticated;
create policy active_players_insert_shop_purchases on public.shop_purchases for insert with check (
  ((select auth.uid()) = user_id) and exists (select 1 from users u_guard where u_guard.id = (select auth.uid()) and coalesce(u_guard.is_banned, false) = false));

-- 4. clans / clan_members
grant insert, update on table public.clan_members to authenticated;
create policy "Users can join clans" on public.clan_members for insert with check ((select auth.uid()) = user_id);
create policy "Leaders can add members to clan" on public.clan_members for insert with check (
  clan_id in (select clan_members_1.clan_id from clan_members clan_members_1
              where clan_members_1.user_id = (select auth.uid()) and clan_members_1.role = any (array['leader', 'moderator'])));
grant insert on table public.clans to authenticated;
create policy "Users can create clans" on public.clans for insert with check ((select auth.uid()) = leader_id);
create policy "Leaders can update own clan" on public.clans for update using ((select auth.uid()) = leader_id);

-- 5. clan_chat
grant insert, update, delete on table public.clan_chat to authenticated;
create policy "Clan members can post messages" on public.clan_chat for insert with check (
  ((select auth.uid()) = user_id) and exists (select 1 from clan_members where clan_members.clan_id = clan_chat.clan_id and clan_members.user_id = (select auth.uid())));

-- 6. direct join RPC
grant execute on function public.rpc_join_clan(uuid) to authenticated;

-- 7. anon privileges are not restored (anon never had rows through RLS).
