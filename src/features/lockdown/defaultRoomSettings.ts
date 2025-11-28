import { EntryRoute, RoomSettings } from "./lockdownTypes";

const cloneEntryRouteModifiers = (overrides?: Partial<RoomSettings["entryRouteModifiers"]>) => ({
  [EntryRoute.SAFE]: {
    coinMultiplier: 1,
    heatMultiplier: 0.85,
    hackStealMultiplier: 0.85,
    alarmOnHackMultiplier: 1.1,
    ...(overrides?.[EntryRoute.SAFE] ?? {}),
  },
  [EntryRoute.STEALTH]: {
    coinMultiplier: 0.95,
    heatMultiplier: 0.7,
    hackStealMultiplier: 0.9,
    alarmOnHackMultiplier: 1.2,
    ...(overrides?.[EntryRoute.STEALTH] ?? {}),
  },
  [EntryRoute.FORCE]: {
    coinMultiplier: 1.15,
    heatMultiplier: 1.3,
    hackStealMultiplier: 1.15,
    alarmOnHackMultiplier: 0.9,
    ...(overrides?.[EntryRoute.FORCE] ?? {}),
  },
});

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  coinGoal: 600,
  durationMs: 12 * 60 * 1000,
  panicAlarmThreshold: 80,
  panicTimeThresholdMs: 75 * 1000,
  alarmMax: 100,
  mostWantedHeat: 90,
  baseCorrectCoins: 12,
  baseWrongPenalty: 6,
  baseAlarmOnWrong: 8,
  safeAlarmModifier: 0.5,
  riskyAlarmModifier: 1,
  allInAlarmModifier: 1.35,
  safeHeatGain: 2,
  riskyHeatGain: 5,
  allInHeatGain: 9,
  hackStealBase: 18,
  hackHeatGain: 8,
  hackAlarmGain: 12,
  scrubHeatReduction: 20,
  greedCoinBonus: 25,
  greedHeatGain: 6,
  mapId: 'default',
  entryRouteModifiers: cloneEntryRouteModifiers(),
};

export const buildRoomSettings = (overrides?: Partial<RoomSettings>): RoomSettings => ({
  ...DEFAULT_ROOM_SETTINGS,
  ...overrides,
  entryRouteModifiers: cloneEntryRouteModifiers(overrides?.entryRouteModifiers),
});
