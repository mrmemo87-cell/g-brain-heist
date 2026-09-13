export type CommanderPremiumSchool = 'void' | 'storm' | 'rot' | 'grave';

const premiumAssets = import.meta.glob([
  '../../assets/commander-factions/*.png',
  '../../assets/commander-vfx/commander-summon-portal.png',
  '../../assets/commander-vfx/commander-legendary-burst.png',
], { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const premiumAsset = (path: string) => premiumAssets[path] ?? null;

export const COMMANDER_FACTION_SIGILS: Record<CommanderPremiumSchool, string | null> = {
  grave: premiumAsset('../../assets/commander-factions/grave-sigil.png'),
  rot: premiumAsset('../../assets/commander-factions/rot-sigil.png'),
  void: premiumAsset('../../assets/commander-factions/void-sigil.png'),
  storm: premiumAsset('../../assets/commander-factions/storm-sigil.png'),
};

export const COMMANDER_PREMIUM_VFX = {
  summonPortal: premiumAsset('../../assets/commander-vfx/commander-summon-portal.png'),
  legendaryBurst: premiumAsset('../../assets/commander-vfx/commander-legendary-burst.png'),
} as const;

export const commanderFactionSigilUrl = (school: string | null | undefined) =>
  school === 'grave' || school === 'rot' || school === 'void' || school === 'storm'
    ? COMMANDER_FACTION_SIGILS[school]
    : null;
