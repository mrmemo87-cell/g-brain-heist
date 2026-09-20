import { getCommanderFormationPoint } from './commanderFormationLayout.js';
/** Screen projection only. The combat engine and canonical formations are untouched. */
export const getCommanderPresentationPoint = (unit, compact) => {
    const point = getCommanderFormationPoint(unit);
    if (!compact)
        return point;
    // Mirror the battlefield's rear/mid/front wedge instead of stacking a squad
    // at one x-coordinate. Extra depth keeps each unit's vitals readable on phones.
    const x = point.lane === 'rear' ? 14 : point.lane === 'mid' ? 25 : 35;
    return { ...point, x: unit.side === 'player' ? x : 100 - x, y: point.lane === 'rear' ? 30 : point.lane === 'mid' ? 60 : 90, scale: 1 };
};
/** SVG coordinates must be converted to rendered pixels before rotating artwork. */
export const commanderProjectileAngle = (dx, dy, width, height, authoredAngle) => Math.atan2(dy * height, dx * width) * 180 / Math.PI - authoredAngle;
