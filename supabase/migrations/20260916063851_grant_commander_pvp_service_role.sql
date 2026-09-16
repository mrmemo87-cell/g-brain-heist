-- Commander PvP Edge Function persists battles with the service-role client.
-- Keep browser roles locked out; grant only the table operations the function uses.
grant select, insert, update
on table public.commander_pvp_battles
to service_role;
