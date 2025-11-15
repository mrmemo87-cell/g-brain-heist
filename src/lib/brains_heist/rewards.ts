export interface RewardBundle {
  xp: number;
  coins: number;
  cosmetics?: string[];
  badge?: string;
  shards?: number;
}

export const MILESTONE_REWARDS = {
  missionCompleted: { xp: 15, coins: 50 } satisfies RewardBundle,
  topicCrushed: { xp: 50, coins: 100, badge: 'cosmetic_rank_upgrade' } satisfies RewardBundle,
  topicUnlocked: { xp: 75, coins: 150 } satisfies RewardBundle,
  bossVictory: { xp: 200, coins: 300, badge: 'rare_boss_badge' } satisfies RewardBundle,
  miniEvent: { xp: 100, coins: 200 } satisfies RewardBundle,
  pvpWin: { xp: 100, coins: 150, shards: 1 } satisfies RewardBundle,
  pvpLoss: { xp: 50, coins: 75 } satisfies RewardBundle,
  pvpTie: { xp: 70, coins: 100 } satisfies RewardBundle,
} as const;

export type MilestoneRewardKey = keyof typeof MILESTONE_REWARDS;

export const getMilestoneReward = (key: MilestoneRewardKey): RewardBundle => {
  return { ...MILESTONE_REWARDS[key] };
};
