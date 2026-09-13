import React, { useEffect } from 'react';
import type { CommanderPracticeCombatant, CommanderPracticeSchool } from '../../../services/commanderPracticeService';
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

const SCHOOL_ACCENT: Record<CommanderPracticeSchool, string> = {
  neutral: '#22d3ee',
  void: '#d946ef',
  storm: '#22d3ee',
  rot: '#a3e635',
  grave: '#bef264',
};

const schoolAccentFor = (combatant: CommanderPracticeCombatant) => {
  if (combatant.side === 'enemy') return '#fb7185';
  return SCHOOL_ACCENT[combatant.school ?? 'neutral'];
};

const spriteFilterFor = (
  combatant: CommanderPracticeCombatant,
  pose: CommanderSpritePose,
  active: boolean,
) => {
  const accent = schoolAccentFor(combatant);
  if (pose === 'defeated') return 'grayscale(.45) brightness(.72) saturate(.72)';
  return active
    ? `drop-shadow(0 0 25px ${accent}) drop-shadow(0 12px 18px rgba(2,6,23,.5))`
    : `drop-shadow(0 0 12px ${accent}88) drop-shadow(0 10px 14px rgba(2,6,23,.45))`;
};

/**
 * Production battlefield sprite renderer.
 *
 * Formation/movement remains on the outer tactical actor. This renderer only
 * swaps authored PNG poses inside one foot-anchored canvas. School aura is
 * presentation-only and never changes combat math.
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
  const accent = schoolAccentFor(combatant);
  const school = combatant.school ?? 'neutral';

  useEffect(() => { warmCommanderCombatSprites(); }, []);
  const visibleSrc = requestedSrc;
  const visiblePose = resolvedPose;
  const visibleCalibration = getCommanderSpriteCalibration(combatant.id, visiblePose);

  if (!definition || !visibleSrc || !visibleCalibration || failedCommanderSprites.has(visibleSrc)) {
    return (
      <div
        aria-hidden
        data-commander-sprite="fallback"
        data-commander-school={school}
        className={`relative flex h-full w-full items-end justify-center ${className}`}
      >
        {combatant.side === 'player' && school !== 'neutral' && (
          <span className="pointer-events-none absolute inset-[8%] rounded-full blur-xl" style={{ background: `radial-gradient(circle, ${accent}42 0%, ${accent}16 44%, transparent 72%)` }} />
        )}
        <span className="relative mb-2 text-5xl opacity-80">{combatant.role === 'commander' ? '♛' : '◆'}</span>
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
      data-commander-school={school}
      data-commander-pose={visiblePose}
      className={`relative h-full w-full overflow-visible ${className}`}
    >
      {combatant.side === 'player' && school !== 'neutral' && resolvedPose !== 'defeated' && (
        <>
          <span
            className="pointer-events-none absolute inset-[7%] rounded-full blur-xl"
            style={{ background: `radial-gradient(circle, ${accent}38 0%, ${accent}16 42%, transparent 72%)` }}
          />
          <span
            className="pointer-events-none absolute bottom-[8%] left-1/2 h-[16%] w-[70%] -translate-x-1/2 rounded-[50%] border opacity-75 blur-[1px]"
            style={{ borderColor: `${accent}88`, boxShadow: `0 0 20px ${accent}66, inset 0 0 14px ${accent}22` }}
          />
        </>
      )}
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