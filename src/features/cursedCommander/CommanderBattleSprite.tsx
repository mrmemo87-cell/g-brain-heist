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
import { getCommanderRecruitIdentity } from './commanderRecruitIdentity';
import './commanderPremiumMotion.css';

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
  if (pose === 'defeated') return 'grayscale(.45) brightness(.72) saturate(.72)';
  if (combatant.side === 'enemy') {
    return active
      ? 'drop-shadow(0 0 25px #fb7185) drop-shadow(0 12px 18px rgba(2,6,23,.5))'
      : 'drop-shadow(0 0 12px #fb718588) drop-shadow(0 10px 14px rgba(2,6,23,.45))';
  }

  const identity = getCommanderRecruitIdentity(combatant.catalogId, combatant.school);
  const energy = active
    ? `drop-shadow(0 0 26px ${identity.accent}) drop-shadow(0 0 16px ${identity.accent2})`
    : `drop-shadow(0 0 13px ${identity.glow})`;
  return `${identity.colorFilter} ${energy} drop-shadow(0 11px 16px rgba(2,6,23,.48))`;
};

const EliteSigil = ({ url, fallback, accent }: { url: string | null; fallback: string; accent: string }) =>
  url ? (
    <img className="cc-elite-sigil-image h-full w-full object-contain" src={url} alt="" draggable={false} />
  ) : (
    <span style={{ color: accent }}>{fallback}</span>
  );

/**
 * Production battlefield sprite renderer.
 * Formation/movement remains on the outer tactical actor. This renderer only
 * swaps authored PNG poses inside one foot-anchored canvas. Catalog identity
 * controls presentation only and never changes deterministic combat math.
 */
const CommanderBattleSprite: React.FC<Props> = ({
  combatant,
  pose = 'standing',
  active = false,
  defeated = false,
  className = '',
}) => {
  const definition = getCommanderSpriteDefinition(combatant.id, combatant.catalogId);
  const resolvedPose: CommanderSpritePose = defeated || combatant.hp <= 0 ? 'defeated' : pose;
  const requestedSrc = getCommanderSpriteUrl(combatant.id, resolvedPose, combatant.catalogId);
  const identity = getCommanderRecruitIdentity(combatant.catalogId, combatant.school);
  const school = identity.school;
  const accent = combatant.side === 'enemy' ? '#fb7185' : identity.accent;
  const accent2 = combatant.side === 'enemy' ? '#f97316' : identity.accent2;

  useEffect(() => { warmCommanderCombatSprites(); }, []);
  const visibleSrc = requestedSrc;
  const visiblePose = resolvedPose;
  const visibleCalibration = getCommanderSpriteCalibration(combatant.id, visiblePose, combatant.catalogId);

  if (!definition || !visibleSrc || !visibleCalibration || failedCommanderSprites.has(visibleSrc)) {
    return (
      <div
        aria-hidden
        data-commander-sprite="fallback"
        data-commander-school={school}
        data-commander-catalog-id={combatant.catalogId ?? undefined}
        data-commander-active={active ? 'true' : 'false'}
        className={`relative flex h-full w-full items-end justify-center ${className}`}
      >
        {combatant.side === 'player' && school !== 'neutral' && (
          <span className="cc-elite-aura pointer-events-none absolute inset-[8%] rounded-full blur-xl" style={{ background: `radial-gradient(circle, ${accent}42 0%, ${accent2}18 44%, transparent 72%)` }} />
        )}
        <span className="relative mb-2 text-5xl opacity-80">{combatant.role === 'commander' ? '♛' : identity.sigil}</span>
      </div>
    );
  }

  const mirror = definition.mirrorX ? -1 : 1;
  const imageTransform = (calibration: NonNullable<ReturnType<typeof getCommanderSpriteCalibration>>) =>
    `translate(${calibration.offsetX}%, ${calibration.offsetY}%) scale(${calibration.visualScale * mirror}, ${calibration.visualScale})`;
  const showIdentity = combatant.side === 'player' && combatant.role === 'unit' && school !== 'neutral' && resolvedPose !== 'defeated';

  return (
    <div
      aria-hidden
      data-commander-sprite={combatant.id}
      data-commander-school={school}
      data-commander-catalog-id={combatant.catalogId ?? undefined}
      data-commander-pose={visiblePose}
      data-commander-active={active ? 'true' : 'false'}
      className={`cc-elite-sprite-shell relative h-full w-full overflow-visible ${className}`}
    >
      {showIdentity && (
        <>
          <span
            className="cc-elite-aura pointer-events-none absolute inset-[4%] rounded-full blur-2xl"
            style={{ background: `radial-gradient(circle, ${accent}38 0%, ${accent2}1f 38%, transparent 72%)` }}
          />
          <span
            className="cc-elite-orbit pointer-events-none absolute inset-[17%] rounded-full opacity-70"
            style={{
              background: `conic-gradient(from 210deg, transparent 0 10%, ${accent}66 18%, transparent 30% 52%, ${accent2}55 62%, transparent 76%)`,
              filter: 'blur(5px)',
            }}
          />
          <span
            className="cc-elite-ground pointer-events-none absolute bottom-[7%] left-1/2 h-[17%] w-[72%] -translate-x-1/2 rounded-[50%] border opacity-90 blur-[.5px]"
            style={{
              borderColor: `${accent}99`,
              background: `radial-gradient(ellipse, ${accent}24, transparent 68%)`,
              boxShadow: `0 0 22px ${accent}66, 0 0 42px ${accent2}24, inset 0 0 16px ${accent}22`,
            }}
          />
          <span
            className="cc-elite-sigil pointer-events-none absolute right-[5%] top-[7%] grid h-9 w-9 place-items-center rounded-full border p-1 text-[12px] font-black shadow-lg backdrop-blur-sm"
            style={{
              color: accent,
              borderColor: `${accent}66`,
              background: `linear-gradient(145deg, rgba(2,6,23,.86), ${accent2}22)`,
              boxShadow: `0 0 18px ${accent}35, inset 0 0 12px ${accent2}22`,
            }}
          >
            <EliteSigil url={identity.sigilUrl} fallback={identity.sigil} accent={accent} />
          </span>
        </>
      )}
      {combatant.side === 'player' && combatant.role === 'commander' && resolvedPose !== 'defeated' && (
        <>
          <span
            className="pointer-events-none absolute inset-[7%] rounded-full blur-xl"
            style={{ background: `radial-gradient(circle, ${accent}38 0%, ${accent2}16 42%, transparent 72%)` }}
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
