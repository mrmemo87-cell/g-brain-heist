import { RivalryActionType, RivalryDoctrine, RivalryStructureCode } from '../../services/rivalryService';

const BASE = '/rivalry_assets';

export const rivalryAssets = {
  backgrounds: {
    prep: `${BASE}/backgrounds/prep-phase.png`,
    live: `${BASE}/backgrounds/live-war.png`,
    blackout: `${BASE}/backgrounds/blackout-scene.png`,
    results: `${BASE}/backgrounds/results.png`,
    victory: `${BASE}/backgrounds/results-victory.png`,
    defeat: `${BASE}/backgrounds/results-defeated.png`,
  },
  banners: {
    neutral: `${BASE}/banners/neutral-clan.png`,
    rival: `${BASE}/banners/rival-clan.png`,
    victory: `${BASE}/banners/victory-clan.png`,
  },
  onboarding: [
    `${BASE}/onboarding/01-what-is-rivalry.png`,
    `${BASE}/onboarding/02-build-squad.png`,
    `${BASE}/onboarding/03-pick-strategy.png`,
    `${BASE}/onboarding/04-fight-war.png`,
    `${BASE}/onboarding/05-blackout-rewards.png`,
  ],
  rewards: {
    card: `${BASE}/rewards/reward-card.png`,
    chest: `${BASE}/rewards/reward-chest.png`,
    panel: `${BASE}/rewards/reward-panel.png`,
  },
  mvp: {
    breaker: `${BASE}/mvp/breaker-mvp.png`,
    operator: `${BASE}/mvp/operator-mvp.png`,
    guardian: `${BASE}/mvp/guardian-mvp.png`,
  },
} as const;

export const doctrineAssetMap: Record<RivalryDoctrine, string> = {
  breach: `${BASE}/doctrines/breach.png`,
  fortress: `${BASE}/doctrines/fortress.png`,
  disruption: `${BASE}/doctrines/disruption.png`,
};

export const structureAssetMap: Record<RivalryStructureCode, string> = {
  relay_core: `${BASE}/structures/relay-core.png`,
  cipher_vault: `${BASE}/structures/cipher-vault.png`,
  sentinel_grid: `${BASE}/structures/sentinel-grid.png`,
};

export const actionBadgeAssetMap: Record<RivalryActionType, string> = {
  strike: `${BASE}/ui/strike-badge.png`,
  sabotage: `${BASE}/ui/sabotage-badge.png`,
  repair: `${BASE}/ui/repair-badge.png`,
};

export const actionFxAssetMap: Record<RivalryActionType, string> = {
  strike: `${BASE}/fx/strike.png`,
  sabotage: `${BASE}/fx/sabodage.png`,
  repair: `${BASE}/fx/repair.png`,
};

const webpSupportCache = new Map<string, Promise<boolean>>();

const webpCandidate = (src: string): string => src.replace(/\.png$/i, '.webp');

const checkWebpExists = (src: string): Promise<boolean> => {
  if (typeof window === 'undefined') return Promise.resolve(false);
  const next = webpCandidate(src);
  const cached = webpSupportCache.get(next);
  if (cached) return cached;

  const probe = new Promise<boolean>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = next;
  });

  webpSupportCache.set(next, probe);
  return probe;
};

export const resolveRivalryAssetSrc = async (src: string): Promise<string> => {
  if (!/\.png$/i.test(src)) return src;
  const hasWebp = await checkWebpExists(src);
  return hasWebp ? webpCandidate(src) : src;
};

export const scheduleRivalryAssetProbe = (src: string): void => {
  if (typeof window === 'undefined' || !/\.png$/i.test(src)) return;

  const run = () => {
    void checkWebpExists(src);
  };

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 1200 });
    return;
  }
  setTimeout(run, 100);
};
