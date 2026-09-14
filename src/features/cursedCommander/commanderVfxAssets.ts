import arena from '../../assets/commander-vfx/storm-arena.webp';
import headquarters from '../../assets/commander-vfx/headquarters-command-center.svg';
import lance from '../../assets/commander-vfx/death-lance.png';
import slash from '../../assets/commander-vfx/impact-slash.png';
import { COMMANDER_PREMIUM_VFX } from './commanderPremiumAssets';
import './commanderTraining.css';

/** Shared by the existing sprite preload gate and presentation components. */
export const COMMANDER_VFX = {
  arena,
  headquarters,
  lance,
  slash,
  summonPortal: COMMANDER_PREMIUM_VFX.summonPortal,
  legendaryBurst: COMMANDER_PREMIUM_VFX.legendaryBurst,
} as const;
