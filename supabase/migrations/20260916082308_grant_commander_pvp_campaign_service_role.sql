-- Commander PvP Edge Function reads the active Commander campaign with the service-role client.
-- Browser roles remain unchanged; grant only the read operation required by the server-authoritative PvP function.
grant select
on table public.commander_campaigns
to service_role;
