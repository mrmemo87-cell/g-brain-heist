import React, { useEffect } from 'react';
import type { CommanderPracticeCombatant } from '../../../services/commanderPracticeService';
import {
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

/**
 * Battlefield artwork renderer.
 * Formation/movement lives on the outer battlefield actor. This component only
 * swaps authored PNG poses inside a fixed-size canvas, so pose changes cannot
 * move a unit out of its tactical slot.
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
  const src = getCommanderSpriteUrl(combatant.id, resolvedPose);
  const accent = combatant.side === 'player' ? '#22d3ee' : '#fb7185';

  useEffect(() => {
    warmCommanderCombatSprites();
  }, []);

  if (!definition || !src) {
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
  const imageTransform = `translate(${definition.offsetX}%, ${definition.offsetY}%) scale(${definition.visualScale * mirror}, ${definition.visualScale})`;
  const filter = resolvedPose === 'defeated'
    ? 'grayscale(.45) brightness(.72) saturate(.72)'
    : active
      ? `drop-shadow(0 0 22px ${accent}) drop-shadow(0 12px 18px rgba(2,6,23,.5))`
      : `drop-shadow(0 0 10px ${accent}66) drop-shadow(0 10px 14px rgba(2,6,23,.45))`;

  return (
    <div
      aria-hidden
      data-commander-sprite={combatant.id}
      data-commander-pose={resolvedPose}
      className={`relative h-full w-full overflow-visible ${className}`}
    >
      <img
        key={`${combatant.id}-${resolvedPose}`}
        src={src}
        alt=""
        draggable={false}
        loading="eager"
        decoding="async"
        className="cc-authored-sprite absolute inset-0 h-full w-full select-none object-contain object-bottom"
        style={{
          transform: imageTransform,
          transformOrigin: '50% 100%',
          filter,
        }}
      />
    </div>
  );
};

export default CommanderBattleSprite;
