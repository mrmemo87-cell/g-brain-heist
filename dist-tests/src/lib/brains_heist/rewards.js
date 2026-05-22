export const MILESTONE_REWARDS = {
    missionCompleted: { xp: 15, coins: 50 },
    topicCrushed: { xp: 50, coins: 100, badge: 'cosmetic_rank_upgrade' },
    topicUnlocked: { xp: 75, coins: 150 },
    bossVictory: { xp: 200, coins: 300, badge: 'rare_boss_badge' },
    miniEvent: { xp: 100, coins: 200 },
    pvpWin: { xp: 100, coins: 150, shards: 1 },
    pvpLoss: { xp: 50, coins: 75 },
    pvpTie: { xp: 70, coins: 100 },
};
export const getMilestoneReward = (key) => {
    return { ...MILESTONE_REWARDS[key] };
};
