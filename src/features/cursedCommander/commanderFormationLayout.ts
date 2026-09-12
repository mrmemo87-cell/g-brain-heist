import type { CommanderPracticeCombatant } from '../../../services/commanderPracticeService';

export type CommanderFormationPoint = {
  x: number;
  y: number;
  scale: number;
  z: number;
  lane: 'front' | 'mid' | 'rear';
};

const FORMATION: Record<string, CommanderFormationPoint> = {
  player_guard: { x: 38, y: 70, scale: 1.08, z: 30, lane: 'front' },
  player_commander: { x: 25, y: 60, scale: 1, z: 24, lane: 'mid' },
  player_archer: { x: 13, y: 44, scale: 0.9, z: 18, lane: 'rear' },
  enemy_guard: { x: 62, y: 70, scale: 1.08, z: 30, lane: 'front' },
  enemy_commander: { x: 75, y: 60, scale: 1, z: 24, lane: 'mid' },
  enemy_archer: { x: 87, y: 44, scale: 0.9, z: 18, lane: 'rear' },
};

const fallbackPoint = (combatant: CommanderPracticeCombatant): CommanderFormationPoint => {
  const player = combatant.side === 'player';
  if (combatant.role === 'commander') {
    return { x: player ? 25 : 75, y: 60, scale: 1, z: 24, lane: 'mid' };
  }
  return { x: player ? 36 : 64, y: 68, scale: 1, z: 28, lane: 'front' };
};

export const getCommanderFormationPoint = (combatant: CommanderPracticeCombatant) =>
  FORMATION[combatant.id] ?? fallbackPoint(combatant);

export const getCommanderFormationPointByName = (
  combatants: CommanderPracticeCombatant[],
  name: string | undefined,
) => {
  const combatant = combatants.find((candidate) => candidate.name === name);
  return combatant ? getCommanderFormationPoint(combatant) : null;
};
