-- Clan views respect row-level security (audit 2026-10-29, found while verifying the lockdown).
--
-- clan_member_scores, clan_scores and clan_active_buffs are owned by postgres without
-- security_invoker, so they bypassed RLS: anyone holding the public anon key (shipped in the
-- app) could read every clan member's username, avatar, bio, level and XP across all schools,
-- and signed-in students could read other schools' clans.
--
-- Fix: run the views with the caller's permissions (security_invoker) so the existing
-- same-school RLS on clans, clan_members and users applies, and remove anon access.
-- Signed-in students keep seeing their own school's clans exactly as before.
--
-- Rollback: supabase/rollbacks/20261029190000_clan_views_respect_rls.rollback.sql

alter view public.clan_member_scores set (security_invoker = true);
alter view public.clan_scores set (security_invoker = true);
alter view public.clan_active_buffs set (security_invoker = true);

revoke all on table public.clan_member_scores, public.clan_scores, public.clan_active_buffs from public, anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.clan_member_scores, public.clan_scores, public.clan_active_buffs from authenticated;
grant select on table public.clan_member_scores, public.clan_scores, public.clan_active_buffs to authenticated;
