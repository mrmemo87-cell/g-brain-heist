import { supabase } from './supabaseClient';

export type CommanderFrozenPvpElixir = {
  id: string;
  name: string;
  statKey: 'force' | 'defense' | 'dexterity' | 'stamina' | 'omni';
  boostRanks: number;
  expiresAt: string;
};

export type CommanderPvpBattleElixirs = {
  attacker: CommanderFrozenPvpElixir | null;
  defender: CommanderFrozenPvpElixir | null;
};

export async function getCommanderPvpBattleElixirs(battleId: string, signal?: AbortSignal): Promise<CommanderPvpBattleElixirs> {
  let request = supabase.rpc('rpc_commander_pvp_battle_elixirs', { p_battle_id: battleId });
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw error;
  if (!data || typeof data !== 'object') return { attacker: null, defender: null };
  const raw = data as { attacker?: CommanderFrozenPvpElixir | null; defender?: CommanderFrozenPvpElixir | null };
  return { attacker: raw.attacker ?? null, defender: raw.defender ?? null };
}
