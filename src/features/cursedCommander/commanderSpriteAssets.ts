import cipherStanding from '../../assets/Cipher-Commander/Cipher Commander standing.png';
import cipherAttacking from '../../assets/Cipher-Commander/Cipher Commander attacking.png';
import cipherAttacked from '../../assets/Cipher-Commander/Cipher Commander attacked.png';
import cipherDefeated from '../../assets/Cipher-Commander/Cipher Commander defeated.png';

import neonStanding from '../../assets/Neon Guard/Neon Guard standing.png';
import neonAttacking from '../../assets/Neon Guard/Neon Guard attacking.png';
import neonAttacked from '../../assets/Neon Guard/Neon Guard attacked.png';
import neonDefeated from '../../assets/Neon Guard/Neon Guard defeated.png';

import shadeStanding from '../../assets/Shade Archer/Shade Archer standing.png';
import shadeAttacking from '../../assets/Shade Archer/Shade Archer attacking.png';
import shadeJustShot from '../../assets/Shade Archer/Shade Archer just shot.png';
import shadeAttacked from '../../assets/Shade Archer/Shade Archer attacked.png';
import shadeDefeated from '../../assets/Shade Archer/Shade Archer defeated.png';
import shadeArrow from '../../assets/Shade Archer/Shade Archer arrow.png';

import wardenStanding from '../../assets/Warden Null/Warden Null standing.png';
import wardenAttacking from '../../assets/Warden Null/Warden Null attacking.png';
import wardenAttacked from '../../assets/Warden Null/Warden Null attacked.png';
import wardenDefeated from '../../assets/Warden Null/Warden Null defeated.png';

import ironStanding from '../../assets/Iron Revenant/Iron Revenant standing.png';
import ironAttacking from '../../assets/Iron Revenant/Iron Revenant attacking.png';
import ironAttacked from '../../assets/Iron Revenant/Iron Revenant attacked.png';
import ironDefeated from '../../assets/Iron Revenant/Iron Revenant defeated.png';

import hollowStanding from '../../assets/Hollow Ranger/Hollow Ranger standing.png';
import hollowAttacking from '../../assets/Hollow Ranger/Hollow Ranger attacking.png';
import hollowJustShot from '../../assets/Hollow Ranger/Hollow Ranger just shot.png';
import hollowAttacked from '../../assets/Hollow Ranger/Hollow Ranger attacked.png';
import hollowDefeated from '../../assets/Hollow Ranger/Hollow Ranger defeated.png';
import hollowArrow from '../../assets/Hollow Ranger/Hollow Ranger arrow.png';

export type CommanderSpritePose = 'standing' | 'attacking' | 'justShot' | 'attacked' | 'defeated';

export type CommanderSpritePoseCalibration = {
  visualScale?: number;
  offsetX?: number;
  offsetY?: number;
};

type CommanderSpritePoses = {
  standing: string;
  attacking: string;
  attacked: string;
  defeated: string;
  justShot?: string;
};

export type CommanderSpriteDefinition = {
  poses: CommanderSpritePoses;
  projectile?: string;
  projectileAngle?: number;
  ranged: boolean;
  /** Fine-tuning only. Formation coordinates remain authoritative. */
  visualScale: number;
  offsetX: number;
  offsetY: number;
  mirrorX?: boolean;
  /** Optional pose-specific art calibration. Never changes battlefield slot coordinates. */
  poseCalibration?: Partial<Record<CommanderSpritePose, CommanderSpritePoseCalibration>>;
};

export const COMMANDER_SPRITES: Record<string, CommanderSpriteDefinition> = {
  player_commander: {
    poses: { standing: cipherStanding, attacking: cipherAttacking, attacked: cipherAttacked, defeated: cipherDefeated },
    ranged: false,
    visualScale: 1,
    offsetX: 0,
    offsetY: 0,
  },
  player_guard: {
    poses: { standing: neonStanding, attacking: neonAttacking, attacked: neonAttacked, defeated: neonDefeated },
    ranged: false,
    visualScale: 1.04,
    offsetX: 0,
    offsetY: 0,
  },
  player_archer: {
    poses: { standing: shadeStanding, attacking: shadeAttacking, justShot: shadeJustShot, attacked: shadeAttacked, defeated: shadeDefeated },
    projectile: shadeArrow,
    projectileAngle: 46,
    ranged: true,
    visualScale: 1,
    offsetX: 0,
    offsetY: 0,
  },
  enemy_commander: {
    poses: { standing: wardenStanding, attacking: wardenAttacking, attacked: wardenAttacked, defeated: wardenDefeated },
    ranged: false,
    visualScale: 1,
    offsetX: 0,
    offsetY: 0,
  },
  enemy_guard: {
    poses: { standing: ironStanding, attacking: ironAttacking, attacked: ironAttacked, defeated: ironDefeated },
    ranged: false,
    visualScale: 1.04,
    offsetX: 0,
    offsetY: 0,
  },
  enemy_archer: {
    poses: { standing: hollowStanding, attacking: hollowAttacking, justShot: hollowJustShot, attacked: hollowAttacked, defeated: hollowDefeated },
    projectile: hollowArrow,
    projectileAngle: -36.5,
    ranged: true,
    visualScale: 1,
    offsetX: 0,
    offsetY: 0,
  },
};

export const getCommanderSpriteDefinition = (combatantId: string) => COMMANDER_SPRITES[combatantId];

export const getCommanderSpriteUrl = (combatantId: string, pose: CommanderSpritePose) => {
  const definition = COMMANDER_SPRITES[combatantId];
  if (!definition) return null;
  if (pose === 'justShot') return definition.poses.justShot ?? definition.poses.attacking;
  return definition.poses[pose];
};

export const getCommanderSpriteCalibration = (combatantId: string, pose: CommanderSpritePose) => {
  const definition = COMMANDER_SPRITES[combatantId];
  if (!definition) return null;
  const poseCalibration = definition.poseCalibration?.[pose];
  return {
    visualScale: poseCalibration?.visualScale ?? definition.visualScale,
    offsetX: poseCalibration?.offsetX ?? definition.offsetX,
    offsetY: poseCalibration?.offsetY ?? definition.offsetY,
  };
};

export const getCommanderProjectileUrl = (combatantId: string) => COMMANDER_SPRITES[combatantId]?.projectile ?? null;

export const getCommanderProjectileAngle = (combatantId: string) => COMMANDER_SPRITES[combatantId]?.projectileAngle ?? 0;

export const isCommanderRangedSprite = (combatantId: string) => COMMANDER_SPRITES[combatantId]?.ranged ?? false;

const uniqueUrls = (urls: Array<string | null | undefined>) => [...new Set(urls.filter((value): value is string => Boolean(value)))];

const allSpriteUrls = uniqueUrls(Object.values(COMMANDER_SPRITES).flatMap((definition) => [
  definition.poses.standing,
  definition.poses.attacking,
  definition.poses.justShot,
  definition.poses.attacked,
  definition.poses.defeated,
  definition.projectile,
]));

export const failedCommanderSprites = new Set<string>();

const loadImage = (src: string) => new Promise<void>((resolve) => {
  const image = new Image();
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timeout);
    image.onload = null;
    image.onerror = null;
    resolve();
  };
  const fail = () => { failedCommanderSprites.add(src); finish(); };
  const timeout = window.setTimeout(fail, 12000);
  const complete = finish;
  const decoded = () => { window.clearTimeout(timeout); complete(); };
  image.onload = () => { void image.decode().then(decoded, fail); };
  image.onerror = fail;
  image.decoding = 'async';
  image.src = src;
  if (image.complete) {
    void image.decode().then(decoded, fail);
  }
});

let preloadPromise: Promise<void> | null = null;

/**
 * Decode the complete authored Commander sprite set once per page session.
 * Fail-soft by design: a single broken image must never block the practice battle.
 */
export const preloadCommanderSpriteAssets = () => {
  if (typeof window === 'undefined') return Promise.resolve();
  if (!preloadPromise) preloadPromise = Promise.all(allSpriteUrls.map(loadImage)).then(() => undefined);
  return preloadPromise;
};

let combatWarmScheduled = false;

type IdleCapableWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
};

/** Warm the authored poses/projectiles without blocking the initial battle UI. */
export const warmCommanderCombatSprites = () => {
  if (typeof window === 'undefined' || combatWarmScheduled) return;
  combatWarmScheduled = true;
  const idleWindow = window as IdleCapableWindow;
  const warm = () => { void preloadCommanderSpriteAssets(); };
  if (idleWindow.requestIdleCallback) {
    idleWindow.requestIdleCallback(warm, { timeout: 1600 });
    return;
  }
  window.setTimeout(warm, 180);
};
