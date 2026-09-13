import React, { useEffect } from 'react';
import type { CommanderPracticeCombatant } from '../../../services/commanderPracticeService';
import {
  failedCommanderSprites,
  getCommanderSpriteCalibration,
  getCommanderSpriteDefinition,
  getCommanderSpriteUrl,
  warmCommanderCombatSprites,
  type CommanderSpritePose,
} from './commanderSpriteAssets';

type Props = {
  combatant: CommanderPracticeCombatant;
  pose?: CommanderSpritePose;
  active?: boolean;
  defeated?: boolean;
  className?: string;
};

const spriteFilterFor = (
  combatant: CommanderPracticeCombatant,
  pose: CommanderSpritePose,
  active: boolean,
) => {
  const accent = combatant.side === 'player' ? '#22d3ee' : '#fb7185';
  if (pose === 'defeated') return 'grayscale(.45) brightness(.72) saturate(.72)';
  return active
    ? `drop-shadow(0 0 22px ${accent}) drop-shadow(0 12px 18px rgba(2,6,23,.5))`
    : `drop-shadow(0 0 10px ${accent}66) drop-shadow(0 10px 14px rgba(2,6,23,.45))`;
};

/**
 * Production battlefield sprite renderer.
 *
 * Formation/movement remains on the outer tactical actor. This renderer only
 * swaps authored PNG poses inside one foot-anchored canvas. The next pose is
 * decoded before gameplay; pose changes replace the previous frame immediately,
 * preventing network/decode flashes without ever changing the unit's world slot.
 */
const CommanderBattleSprite: React.FC<Props> = ({
  combatant,
  pose = 'standing',
  active = false,
  defeated = false,
  className = '',
}) => {
  const definition = getCommanderSpriteDefinition(combatant.id);
  const resolvedPose: CommanderSpritePose = defeated || combatant.hp <= 0 ? 'defeated' : pose;
  const requestedSrc = getCommanderSpriteUrl(combatant.id, resolvedPose);

  useEffect(() => { warmCommanderCombatSprites(); }, []);
  // All poses are decoded by the opening gate. Keep exactly one image mounted:
  // swapping src removes the previous pose in the same render (no ghost frame).
  const visibleSrc = requestedSrc;
  const visiblePose = resolvedPose;
  const visibleCalibration = getCommanderSpriteCalibration(combatant.id, visiblePose);

  if (!definition || !visibleSrc || !visibleCalibration || failedCommanderSprites.has(visibleSrc)) {
    return (
      <div
        aria-hidden
        data-commander-sprite="fallback"
        className={`flex h-full w-full items-end justify-center ${className}`}
      >
        <span className="mb-2 text-5xl opacity-80">{combatant.role === 'commander' ? '♛' : '◆'}</span>
      </div>
    );
  }

  const mirror = definition.mirrorX ? -1 : 1;
  const imageTransform = (calibration: NonNullable<ReturnType<typeof getCommanderSpriteCalibration>>) =>
    `translate(${calibration.offsetX}%, ${calibration.offsetY}%) scale(${calibration.visualScale * mirror}, ${calibration.visualScale})`;

  return (
    <div
      aria-hidden
      data-commander-sprite={combatant.id}
      data-commander-pose={visiblePose}
      className={`relative h-full w-full overflow-visible ${className}`}
    >
      <img
        src={visibleSrc}
        alt=""
        draggable={false}
        loading="eager"
        decoding="async"
        className="cc-authored-sprite cc-authored-sprite-current pointer-events-none absolute inset-0 h-full w-full select-none object-contain object-bottom"
        style={{
          transform: imageTransform(visibleCalibration),
          transformOrigin: '50% 100%',
          filter: spriteFilterFor(combatant, visiblePose, active),
        }}
      />
    </div>
  );
};

export default CommanderBattleSprite;
