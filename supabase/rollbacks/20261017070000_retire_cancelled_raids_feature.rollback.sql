-- ROLLBACK for 20261017070000_retire_cancelled_raids_feature.sql
-- Restores tables, functions and grants exactly as captured on 2026-10-17.
begin;
set local lock_timeout = '3s';

alter table archive_raids.raids             set schema public;
alter table archive_raids.raid_waves        set schema public;
alter table archive_raids.raid_participants set schema public;
alter table archive_raids.raid_events       set schema public;
-- Captured grants: anon/authenticated/service_role had ALL table privileges.
grant all on public.raids, public.raid_waves, public.raid_participants, public.raid_events
  to anon, authenticated, service_role;

alter function archive_raids.create_raid(text, jsonb)                      set schema public;
alter function archive_raids.join_raid(uuid)                               set schema public;
alter function archive_raids.submit_raid_answer(uuid, text, text, numeric) set schema public;
alter function archive_raids.finalize_raid(uuid)                           set schema public;
alter function archive_raids.get_raid_status(uuid)                         set schema public;
-- Captured EXECUTE grants.
grant execute on function public.create_raid(text, jsonb)                      to authenticated, service_role;
grant execute on function public.join_raid(uuid)                               to authenticated, service_role;
grant execute on function public.submit_raid_answer(uuid, text, text, numeric) to authenticated, service_role;
grant execute on function public.finalize_raid(uuid)                           to authenticated, service_role;
grant execute on function public.get_raid_status(uuid)                         to public, authenticated, service_role;

do $restore$
declare v_def text := pg_catalog.pg_get_functiondef('public.rpc_superadmin_user_intelligence(uuid)'::regprocedure);
begin
  execute replace(v_def, 'archive_raids.raid_participants', 'public.raid_participants');
end;
$restore$;

drop schema archive_raids;  -- empty again at this point
commit;
