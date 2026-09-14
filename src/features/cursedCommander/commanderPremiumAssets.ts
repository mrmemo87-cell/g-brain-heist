import graveSigil from '../../assets/commander-factions/grave-sigil.png';
import rotSigil from '../../assets/commander-factions/rot-sigil.png';
import voidSigil from '../../assets/commander-factions/void-sigil.png';
import stormSigil from '../../assets/commander-factions/storm-sigil.png';
import summonPortal from '../../assets/commander-vfx/commander-summon-portal.png';
import legendaryBurst from '../../assets/commander-vfx/commander-legendary-burst.png';

export type CommanderPremiumSchool = 'void' | 'storm' | 'rot' | 'grave';

/** Required production assets: direct imports make a missing PNG fail at build time. */
export const COMMANDER_FACTION_SIGILS: Record<CommanderPremiumSchool, string> = {
  grave: graveSigil,
  rot: rotSigil,
  void: voidSigil,
  storm: stormSigil,
};

export const COMMANDER_PREMIUM_VFX = {
  summonPortal,
  legendaryBurst,
} as const;

export const commanderFactionSigilUrl = (school: string | null | undefined) =>
  school === 'grave' || school === 'rot' || school === 'void' || school === 'storm'
    ? COMMANDER_FACTION_SIGILS[school]
    : null;
