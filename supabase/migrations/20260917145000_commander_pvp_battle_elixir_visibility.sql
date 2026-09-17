create or replace function public.rpc_commander_pvp_battle_elixirs(p_battle_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'attacker', case when b.attacker_id = auth.uid() then b.attacker_snapshot -> 'elixir' else null end,
    'defender', case when b.attacker_id = auth.uid() then b.defender_snapshot -> 'elixir' else null end
  )
  from public.commander_pvp_battles b
  where b.id = p_battle_id
    and b.attacker_id = auth.uid()
  limit 1;
$$;

revoke all on function public.rpc_commander_pvp_battle_elixirs(uuid) from public, anon;
grant execute on function public.rpc_commander_pvp_battle_elixirs(uuid) to authenticated;
