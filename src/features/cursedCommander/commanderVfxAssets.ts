import arena from '../../assets/commander-vfx/storm-arena.webp';
import lance from '../../assets/commander-vfx/death-lance.png';
import slash from '../../assets/commander-vfx/impact-slash.png';
import { COMMANDER_PREMIUM_VFX } from './commanderPremiumAssets';

/** Shared by the existing sprite preload gate and presentation components. */
export const COMMANDER_VFX = {
  arena,
  lance,
  slash,
  summonPortal: COMMANDER_PREMIUM_VFX.summonPortal,
  legendaryBurst: COMMANDER_PREMIUM_VFX.legendaryBurst,
} as const;
