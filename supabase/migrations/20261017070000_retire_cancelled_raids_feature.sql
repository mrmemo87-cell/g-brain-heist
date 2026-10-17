-- 2026-10-17 Retire the cancelled boss-raid ("Raids") feature.
--
-- Owner decision (2026-10-17): the Raids feature was planned then cancelled.
-- Its tables had recursive RLS ("stack depth limit exceeded" after 3-20 s of CPU
-- for every non-superadmin read), and nothing in the app uses it any more.
--
-- Safe, reversible retirement. Nothing is deleted:
--   * the 4 tables (with their rows: 1 raid, 4 events, 3 participants, 3 waves
--     at capture time) move to a new schema `archive_raids` that app roles
--     cannot use; table grants for app roles are revoked;
--   * the 5 raid RPCs move to the same schema (definitions and grants retained);
--   * rpc_superadmin_user_intelligence keeps returning identical numbers by
--     reading the archived participants table (3 references rewritten, guarded).
-- NOT touched: PvP "raids" (raid_targets / rpc_hack_attempt), billing/plan keys
-- `raids` / `raid_attempts` stored in entitlement and pilot-quota data, and the
-- legacy brains_heist_* tables.
-- Rollback: supabase/rollbacks/20261017070000_retire_cancelled_raids_feature.rollback.sql
set local lock_timeout = '3s';

create schema if not exists archive_raids;
comment on schema archive_raids is
  'Retired Raids feature (cancelled 2026-10-17). Archived data and functions; not exposed to app roles.';
revoke all on schema archive_raids from public, anon, authenticated;
grant usage on schema archive_raids to service_role;

alter table public.raids             set schema archive_raids;
alter table public.raid_waves        set schema archive_raids;
alter table public.raid_participants set schema archive_raids;
alter table public.raid_events       set schema archive_raids;
revoke all on archive_raids.raids, archive_raids.raid_waves,
              archive_raids.raid_participants, archive_raids.raid_events
  from public, anon, authenticated;

alter function public.create_raid(text, jsonb)                          set schema archive_raids;
alter function public.join_raid(uuid)                                   set schema archive_raids;
alter function public.submit_raid_answer(uuid, text, text, numeric)     set schema archive_raids;
alter function public.finalize_raid(uuid)                               set schema archive_raids;
alter function public.get_raid_status(uuid)                             set schema archive_raids;
revoke all on function archive_raids.create_raid(text, jsonb),
                       archive_raids.join_raid(uuid),
                       archive_raids.submit_raid_answer(uuid, text, text, numeric),
                       archive_raids.finalize_raid(uuid),
                       archive_raids.get_raid_status(uuid)
  from public, anon, authenticated;

-- Keep the superadmin user-intelligence output identical.
do $retarget$
declare
  v_def text := pg_catalog.pg_get_functiondef('public.rpc_superadmin_user_intelligence(uuid)'::regprocedure);
  v_new text;
  v_hits integer;
begin
  v_hits := (length(v_def) - length(replace(v_def, 'public.raid_participants', ''))) / length('public.raid_participants');
  if v_hits <> 3 then
    raise exception 'retire_raids_guard: expected 3 raid_participants references, found %', v_hits;
  end if;
  -- Only table usage counts (the JSON output key 'raids' is not a table reference).
  if v_def ~* '\m(from|join|into|update)\s+(public\.)?(raids|raid_events|raid_waves)\M' then
    raise exception 'retire_raids_guard: unexpected reference to other raid tables';
  end if;
  v_new := replace(v_def, 'public.raid_participants', 'archive_raids.raid_participants');
  execute v_new;
end;
$retarget$;
