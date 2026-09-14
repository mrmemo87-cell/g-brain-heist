import { COMMANDER_VFX } from './commanderVfxAssets';
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

/**
 * Premium recruit art is optional at build time so a missing binary never blocks
 * a release. Once the PNG pack exists in src/assets, Vite includes it and each
 * catalog id automatically switches from the starter fallback to its authored set.
 */
const eliteSpriteAssets = import.meta.glob([
  '../../assets/Neon Bulwark/*.png',
  '../../assets/Shade Deadeye/*.png',
  '../../assets/Grave Bastion/*.png',
  '../../assets/Rift Reaver/*.png',
  '../../assets/Plague Scribe/*.png',
  '../../assets/Volt Seer/*.png',
], { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const eliteAsset = (path: string, fallback: string) => eliteSpriteAssets[path] ?? fallback;

const bulwarkStanding = eliteAsset('../../assets/Neon Bulwark/Neon Bulwark standing.png', neonStanding);
const bulwarkAttacking = eliteAsset('../../assets/Neon Bulwark/Neon Bulwark attacking.png', neonAttacking);
const bulwarkAttacked = eliteAsset('../../assets/Neon Bulwark/Neon Bulwark attacked.png', neonAttacked);
const bulwarkDefeated = eliteAsset('../../assets/Neon Bulwark/Neon Bulwark defeated.png', neonDefeated);

const deadeyeStanding = eliteAsset('../../assets/Shade Deadeye/Shade Deadeye standing.png', shadeStanding);
const deadeyeAttacking = eliteAsset('../../assets/Shade Deadeye/Shade Deadeye attacking.png', shadeAttacking);
const deadeyeJustShot = eliteAsset('../../assets/Shade Deadeye/Shade Deadeye just shot.png', shadeJustShot);
const deadeyeAttacked = eliteAsset('../../assets/Shade Deadeye/Shade Deadeye attacked.png', shadeAttacked);
const deadeyeDefeated = eliteAsset('../../assets/Shade Deadeye/Shade Deadeye defeated.png', shadeDefeated);

const graveStanding = eliteAsset('../../assets/Grave Bastion/Grave Bastion standing.png', neonStanding);
const graveAttacking = eliteAsset('../../assets/Grave Bastion/Grave Bastion attacking.png', neonAttacking);
const graveAttacked = eliteAsset('../../assets/Grave Bastion/Grave Bastion attacked.png', neonAttacked);
const graveDefeated = eliteAsset('../../assets/Grave Bastion/Grave Bastion defeated.png', neonDefeated);

const reaverStanding = eliteAsset('../../assets/Rift Reaver/Rift Reaver standing.png', neonStanding);
const reaverAttacking = eliteAsset('../../assets/Rift Reaver/Rift Reaver attacking.png', neonAttacking);
const reaverAttacked = eliteAsset('../../assets/Rift Reaver/Rift Reaver attacked.png', neonAttacked);
const reaverDefeated = eliteAsset('../../assets/Rift Reaver/Rift Reaver defeated.png', neonDefeated);

const scribeStanding = eliteAsset('../../assets/Plague Scribe/Plague Scribe standing.png', shadeStanding);
const scribeAttacking = eliteAsset('../../assets/Plague Scribe/Plague Scribe attacking.png', shadeAttacking);
const scribeJustShot = eliteAsset('../../assets/Plague Scribe/Plague Scribe just shot.png', shadeJustShot);
const scribeAttacked = eliteAsset('../../assets/Plague Scribe/Plague Scribe attacked.png', shadeAttacked);
const scribeDefeated = eliteAsset('../../assets/Plague Scribe/Plague Scribe defeated.png', shadeDefeated);
const scribeProjectile = eliteAsset('../../assets/Plague Scribe/Plague Scribe projectile.png', shadeArrow);

const voltStanding = eliteAsset('../../assets/Volt Seer/Volt Seer standing.png', shadeStanding);
const voltAttacking = eliteAsset('../../assets/Volt Seer/Volt Seer attacking.png', shadeAttacking);
const voltJustShot = eliteAsset('../../assets/Volt Seer/Volt Seer just shot.png', shadeJustShot);
const voltAttacked = eliteAsset('../../assets/Volt Seer/Volt Seer attacked.png', shadeAttacked);
const voltDefeated = eliteAsset('../../assets/Volt Seer/Volt Seer defeated.png', shadeDefeated);
const voltProjectile = eliteAsset('../../assets/Volt Seer/Volt Seer projectile.png', shadeArrow);

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
  player_neon_bulwark: {
    poses: { standing: bulwarkStanding, attacking: bulwarkAttacking, attacked: bulwarkAttacked, defeated: bulwarkDefeated },
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
  player_shade_deadeye: {
    poses: { standing: deadeyeStanding, attacking: deadeyeAttacking, justShot: deadeyeJustShot, attacked: deadeyeAttacked, defeated: deadeyeDefeated },
    projectile: shadeArrow,
    projectileAngle: 46,
    ranged: true,
    visualScale: 1,
    offsetX: 0,
    offsetY: 0,
  },
  player_grave_bastion: {
    poses: { standing: graveStanding, attacking: graveAttacking, attacked: graveAttacked, defeated: graveDefeated },
    ranged: false,
    visualScale: 1.08,
    offsetX: 0,
    offsetY: 1,
    poseCalibration: { attacking: { visualScale: 1.1 }, attacked: { visualScale: 1.07 }, defeated: { visualScale: 1.04, offsetY: 3 } },
  },
  player_rift_reaver: {
    poses: { standing: reaverStanding, attacking: reaverAttacking, attacked: reaverAttacked, defeated: reaverDefeated },
    ranged: false,
    visualScale: 1.06,
    offsetX: 0,
    offsetY: 1,
    poseCalibration: { attacking: { visualScale: 1.12, offsetX: 1 }, attacked: { visualScale: 1.06 }, defeated: { visualScale: 1.02, offsetY: 3 } },
  },
  player_plague_scribe: {
    poses: { standing: scribeStanding, attacking: scribeAttacking, justShot: scribeJustShot, attacked: scribeAttacked, defeated: scribeDefeated },
    projectile: scribeProjectile,
    projectileAngle: 8,
    ranged: true,
    visualScale: 1.03,
    offsetX: 0,
    offsetY: 1,
    poseCalibration: { attacking: { visualScale: 1.07 }, justShot: { visualScale: 1.05 }, defeated: { visualScale: 1, offsetY: 3 } },
  },
  player_volt_seer: {
    poses: { standing: voltStanding, attacking: voltAttacking, justShot: voltJustShot, attacked: voltAttacked, defeated: voltDefeated },
    projectile: voltProjectile,
    projectileAngle: 0,
    ranged: true,
    visualScale: 1.05,
    offsetX: 0,
    offsetY: 0,
    poseCalibration: { attacking: { visualScale: 1.1 }, justShot: { visualScale: 1.07 }, defeated: { visualScale: 1.01, offsetY: 3 } },
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

/** Stable combatant ids remain deterministic; catalog identity only picks presentation. */
export const COMMANDER_CATALOG_SPRITE_KEYS: Record<string, string> = {
  neon_guard: 'player_guard',
  neon_bulwark: 'player_neon_bulwark',
  grave_bastion: 'player_grave_bastion',
  rift_reaver: 'player_rift_reaver',
  shade_archer: 'player_archer',
  shade_deadeye: 'player_shade_deadeye',
  plague_scribe: 'player_plague_scribe',
  volt_seer: 'player_volt_seer',
};

export const resolveCommanderSpriteKey = (combatantId: string, catalogId?: string | null) =>
  (catalogId && COMMANDER_CATALOG_SPRITE_KEYS[catalogId]) || combatantId;

const definitionFor = (combatantId: string, catalogId?: string | null) =>
  COMMANDER_SPRITES[resolveCommanderSpriteKey(combatantId, catalogId)];

export const getCommanderSpriteDefinition = (combatantId: string, catalogId?: string | null) =>
  definitionFor(combatantId, catalogId);

export const getCommanderSpriteUrl = (
  combatantId: string,
  pose: CommanderSpritePose,
  catalogId?: string | null,
) => {
  const definition = definitionFor(combatantId, catalogId);
  if (!definition) return null;
  if (pose === 'justShot') return definition.poses.justShot ?? definition.poses.attacking;
  return definition.poses[pose];
};

export const getCommanderSpriteCalibration = (
  combatantId: string,
  pose: CommanderSpritePose,
  catalogId?: string | null,
) => {
  const definition = definitionFor(combatantId, catalogId);
  if (!definition) return null;
  const poseCalibration = definition.poseCalibration?.[pose];
  return {
    visualScale: poseCalibration?.visualScale ?? definition.visualScale,
    offsetX: poseCalibration?.offsetX ?? definition.offsetX,
    offsetY: poseCalibration?.offsetY ?? definition.offsetY,
  };
};

export const getCommanderProjectileUrl = (combatantId: string, catalogId?: string | null) =>
  definitionFor(combatantId, catalogId)?.projectile ?? null;

export const getCommanderProjectileAngle = (combatantId: string, catalogId?: string | null) =>
  definitionFor(combatantId, catalogId)?.projectileAngle ?? 0;

export const isCommanderRangedSprite = (combatantId: string, catalogId?: string | null) =>
  definitionFor(combatantId, catalogId)?.ranged ?? false;

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

/** Decode every authored Commander pose/projectile and premium VFX once per page session. */
export const preloadCommanderSpriteAssets = () => {
  if (typeof window === 'undefined') return Promise.resolve();
  if (!preloadPromise) preloadPromise = Promise.all([...allSpriteUrls, ...Object.values(COMMANDER_VFX)].map(loadImage)).then(() => undefined);
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
