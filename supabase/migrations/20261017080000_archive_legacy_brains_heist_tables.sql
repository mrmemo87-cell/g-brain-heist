-- Archive the unused legacy Brains Heist tables and remove self-looping access rules.
--
-- Problem: bh_role() and is_bh_member() read brains_heist_memberships as the
-- caller. That table's bhm_read_admin rule calls is_bh_admin() -> bh_role(),
-- which reads the table again, forever. Every rule built on these helpers
-- (the legacy brains_heist_* tables, task_progress, and two leftover "write"
-- rules on clan_buffs / clan_buff_templates) burned seconds of database time
-- and then failed for any normal user. FOR ALL rules also apply to reads, so
-- the live Clan buff shop was paying this cost on every read.
--
-- Fix (no data deleted, nothing renamed):
-- 1. Drop every rule that calls the looping helpers (49 rules, listed in the
--    rollback file).
-- 2. Archive the legacy tables: revoke app-user (anon/authenticated) access.
--    service_role, SECURITY DEFINER functions and admin_delete_user keep working.
-- Live Clan rules ("Members view clan buffs", "Anyone can view buff templates",
-- bh_read_*, feature_entitlement_guard) are untouched; buff purchases go
-- through rpc_purchase_clan_buff (SECURITY DEFINER).
-- Rollback: supabase/rollbacks/20261017080000_archive_legacy_brains_heist_tables.rollback.sql

begin;
set local lock_timeout = '3s';

do $$
declare
  r record;
  dropped int := 0;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and (tablename like 'brains\_heist\_%' or tablename in ('task_progress', 'clan_buffs', 'clan_buff_templates'))
      and (coalesce(qual, '') || coalesce(with_check, '')) ~ '\m(is_bh_member|is_bh_teacher|is_bh_admin|bh_role)\('
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    dropped := dropped + 1;
  end loop;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') || coalesce(with_check, '')) ~ '\m(is_bh_member|is_bh_teacher|is_bh_admin|bh_role)\('
  ) then
    raise exception 'Looping legacy helper rules remain outside the archived set';
  end if;

  raise notice 'Dropped % looping legacy rules', dropped;
end $$;

do $$
declare
  t text;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and (c.relname like 'brains\_heist\_%' or c.relname = 'task_progress')
  loop
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format($c$comment on table public.%I is 'ARCHIVED 2026-10-17: legacy Brains Heist table, not used by the app. App-user access revoked; data kept. See migration 20261017080000.'$c$, t);
  end loop;
end $$;

commit;
