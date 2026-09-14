import graveStanding from '../../assets/Grave Bastion/Grave Bastion standing.png';
import graveAttacking from '../../assets/Grave Bastion/Grave Bastion attacking.png';
import graveAttacked from '../../assets/Grave Bastion/Grave Bastion attacked.png';
import graveDefeated from '../../assets/Grave Bastion/Grave Bastion defeated.png';
import reaverStanding from '../../assets/Rift Reaver/Rift Reaver standing.png';
import reaverAttacking from '../../assets/Rift Reaver/Rift Reaver attacking.png';
import reaverAttacked from '../../assets/Rift Reaver/Rift Reaver attacked.png';
import reaverDefeated from '../../assets/Rift Reaver/Rift Reaver defeated.png';
import scribeStanding from '../../assets/Plague Scribe/Plague Scribe standing.png';
import scribeAttacking from '../../assets/Plague Scribe/Plague Scribe attacking.png';
import scribeJustShot from '../../assets/Plague Scribe/Plague Scribe just shot.png';
import scribeAttacked from '../../assets/Plague Scribe/Plague Scribe attacked.png';
import scribeDefeated from '../../assets/Plague Scribe/Plague Scribe defeated.png';
import scribeProjectile from '../../assets/Plague Scribe/Plague Scribe projectile.png';
import voltStanding from '../../assets/Volt Seer/Volt Seer standing.png';
import voltAttacking from '../../assets/Volt Seer/Volt Seer attacking.png';
import voltJustShot from '../../assets/Volt Seer/Volt Seer just shot.png';
import voltAttacked from '../../assets/Volt Seer/Volt Seer attacked.png';
import voltDefeated from '../../assets/Volt Seer/Volt Seer defeated.png';
import voltProjectile from '../../assets/Volt Seer/Volt Seer projectile.png';
import graveSigil from '../../assets/commander-factions/grave-sigil.png';
import rotSigil from '../../assets/commander-factions/rot-sigil.png';
import voidSigil from '../../assets/commander-factions/void-sigil.png';
import stormSigil from '../../assets/commander-factions/storm-sigil.png';
import summonPortal from '../../assets/commander-vfx/commander-summon-portal.png';
import legendaryBurst from '../../assets/commander-vfx/commander-legendary-burst.png';

export type CommanderPremiumSchool = 'void' | 'storm' | 'rot' | 'grave';

/**
 * Release contract for the premium Commander PNG pack. Every required binary is
 * directly imported here so a missing or renamed asset fails the production build.
 */
export const COMMANDER_PREMIUM_SPRITES = {
  graveBastion: {
    standing: graveStanding,
    attacking: graveAttacking,
    attacked: graveAttacked,
    defeated: graveDefeated,
  },
  riftReaver: {
    standing: reaverStanding,
    attacking: reaverAttacking,
    attacked: reaverAttacked,
    defeated: reaverDefeated,
  },
  plagueScribe: {
    standing: scribeStanding,
    attacking: scribeAttacking,
    justShot: scribeJustShot,
    attacked: scribeAttacked,
    defeated: scribeDefeated,
    projectile: scribeProjectile,
  },
  voltSeer: {
    standing: voltStanding,
    attacking: voltAttacking,
    justShot: voltJustShot,
    attacked: voltAttacked,
    defeated: voltDefeated,
    projectile: voltProjectile,
  },
} as const;

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
