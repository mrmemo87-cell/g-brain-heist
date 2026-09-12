import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CommanderPracticeCombatant } from '../../../services/commanderPracticeService';
import {
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

const POSE_FADE_MS = 170;

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
 * decoded before it is revealed and the previous frame briefly crossfades out,
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

  const [visibleSrc, setVisibleSrc] = useState<string | null>(requestedSrc);
  const [visiblePose, setVisiblePose] = useState<CommanderSpritePose>(resolvedPose);
  const [previousFrame, setPreviousFrame] = useState<{ src: string; pose: CommanderSpritePose } | null>(null);
  const [fadePrevious, setFadePrevious] = useState(false);
  const transitionId = useRef(0);

  useEffect(() => {
    warmCommanderCombatSprites();
  }, []);

  useEffect(() => {
    if (!requestedSrc || requestedSrc === visibleSrc) {
      if (visiblePose !== resolvedPose) setVisiblePose(resolvedPose);
      return;
    }

    const id = ++transitionId.current;
    let cancelled = false;
    let firstFrame = 0;
    let secondFrame = 0;
    const image = new Image();

    const reveal = () => {
      if (cancelled || id !== transitionId.current) return;
      setPreviousFrame(visibleSrc ? { src: visibleSrc, pose: visiblePose } : null);
      setFadePrevious(false);
      setVisibleSrc(requestedSrc);
      setVisiblePose(resolvedPose);
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          if (!cancelled && id === transitionId.current) setFadePrevious(true);
        });
      });
    };

    image.onload = reveal;
    image.onerror = reveal;
    image.decoding = 'async';
    image.src = requestedSrc;

    if (image.complete) {
      void image.decode().catch(() => undefined).finally(reveal);
    }

    return () => {
      cancelled = true;
      if (firstFrame) window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [requestedSrc, resolvedPose, visiblePose, visibleSrc]);

  useEffect(() => {
    if (!previousFrame || !fadePrevious) return;
    const timer = window.setTimeout(() => {
      setPreviousFrame(null);
      setFadePrevious(false);
    }, POSE_FADE_MS + 24);
    return () => window.clearTimeout(timer);
  }, [fadePrevious, previousFrame]);

  const visibleCalibration = useMemo(
    () => getCommanderSpriteCalibration(combatant.id, visiblePose),
    [combatant.id, visiblePose],
  );
  const previousCalibration = useMemo(
    () => previousFrame ? getCommanderSpriteCalibration(combatant.id, previousFrame.pose) : null,
    [combatant.id, previousFrame],
  );

  if (!definition || !visibleSrc || !visibleCalibration) {
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
      {previousFrame && previousCalibration && (
        <img
          src={previousFrame.src}
          alt=""
          draggable={false}
          decoding="async"
          className="cc-authored-sprite cc-authored-sprite-previous pointer-events-none absolute inset-0 h-full w-full select-none object-contain object-bottom"
          style={{
            transform: imageTransform(previousCalibration),
            transformOrigin: '50% 100%',
            filter: spriteFilterFor(combatant, previousFrame.pose, active),
            opacity: fadePrevious ? 0 : 1,
            transition: `opacity ${POSE_FADE_MS}ms ease-out`,
          }}
        />
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
