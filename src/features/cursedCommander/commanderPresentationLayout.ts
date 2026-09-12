import type { CommanderPracticeCombatant } from '../../../services/commanderPracticeService';
import { getCommanderFormationPoint } from './commanderFormationLayout';

/** Screen projection only. The combat engine and canonical formations are untouched. */
export const getCommanderPresentationPoint = (unit: CommanderPracticeCombatant, compact: boolean) => {
  const point = getCommanderFormationPoint(unit);
  if (!compact) return point;
  return { ...point, x: unit.side === 'player' ? 25 : 75, y: point.lane === 'rear' ? 30 : point.lane === 'mid' ? 60 : 90, scale: 1 };
};

/** SVG coordinates must be converted to rendered pixels before rotating artwork. */
export const commanderProjectileAngle = (dx: number, dy: number, width: number, height: number, authoredAngle: number) =>
  Math.atan2(dy * height, dx * width) * 180 / Math.PI - authoredAngle;
