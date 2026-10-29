-- Rollback for 20261029190000_clan_views_respect_rls.sql
-- WARNING: reopens cross-school and logged-out reads of clan member data.
alter view public.clan_member_scores reset (security_invoker);
alter view public.clan_scores reset (security_invoker);
alter view public.clan_active_buffs reset (security_invoker);
grant all on table public.clan_member_scores, public.clan_scores, public.clan_active_buffs to anon, authenticated;
