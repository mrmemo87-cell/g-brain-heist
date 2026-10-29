-- Lock privileged columns on public.users against direct client writes (audit 2026-10-29).
--
-- Problem: the RLS policies "Users can update own data" / "Users can update own profile" let a
-- signed-in user update ANY column of their own row. The only guards were on xp/level and
-- school_id. A student could set role = 'admin' (sync_users_role_is_admin then sets is_admin,
-- and is_superadmin() trusts users.is_admin), lift their own ban, change account_tier, or set
-- attack/defence power, PvP score, streak and earnings counters.
--
-- Fix: a BEFORE INSERT OR UPDATE trigger that rejects changes to privileged columns when the
-- statement runs directly as the API roles (current_user = 'authenticated' or 'anon').
-- SECURITY DEFINER RPCs run as their owner (postgres), and service_role jobs run as
-- service_role, so every server-side flow keeps working unchanged. Rows in public.superadmins
-- (the real platform owner) may still edit directly, e.g. admin_visible from the admin portal.
--
-- Not locked yet (the app still writes them from the client; moving those flows to RPCs is
-- step 2): coins, gemstones, ap_now, last_ap_update. Also left open: profile fields the app
-- edits legitimately (username, avatar_url, bio, cosmetics, tutorial/setup flags, grade, batch,
-- school, full_name, last_seen).
--
-- Rollback: supabase/rollbacks/20261029160000_lock_privileged_user_columns.rollback.sql

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

  -- UPDATE: the platform owner may still edit directly from the admin portal.
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

-- "trg_00_" sorts first, so the check sees exactly what the client sent, before other
-- BEFORE triggers (role/is_admin sync, required_changes auto-clear) adjust the row.
drop trigger if exists trg_00_guard_user_privileged_columns on public.users;
create trigger trg_00_guard_user_privileged_columns
  before insert or update on public.users
  for each row execute function private.guard_user_privileged_columns();
