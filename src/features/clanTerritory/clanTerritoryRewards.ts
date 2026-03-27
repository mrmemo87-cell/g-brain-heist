import {
  ClanId,
  ClanTerritoryGameState,
  ClanTerritoryResults,
  CONFIG,
  PlayerReward,
  ZONES,
  ZoneId,
} from "./clanTerritoryTypes";

export function calculateClanTerritoryResults(state: ClanTerritoryGameState): ClanTerritoryResults {
  const zoneControl: Record<ZoneId, ClanId | null> = {};
  const allClanIds = new Set<ClanId>();
  const totalInfluenceByClan: Record<ClanId, number> = {};

  Object.values(state.players).forEach((player) => allClanIds.add(player.clanId));
  Object.keys(state.clans).forEach((clanId) => allClanIds.add(clanId as ClanId));
  Object.values(state.zones).forEach((zone) => {
    Object.keys(zone.influence).forEach((clanId) => allClanIds.add(clanId as ClanId));
  });

  const clanScores: Record<ClanId, number> = {};
  allClanIds.forEach((clanId) => {
    clanScores[clanId] = 0;
    totalInfluenceByClan[clanId] = 0;
  });

  for (const zone of ZONES) {
    const zoneState = state.zones[zone.id];
    if (!zoneState) {
      zoneControl[zone.id] = null;
      continue;
    }

    const orderedInfluence = Object.entries(zoneState.influence)
      .filter(([, influence]) => influence > 0)
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0]);
      });

    orderedInfluence.forEach(([clanId, influence]) => {
      totalInfluenceByClan[clanId as ClanId] =
        (totalInfluenceByClan[clanId as ClanId] || 0) + influence;
    });

    const leader = orderedInfluence[0];
    if (leader) {
      const leaderClan = leader[0] as ClanId;
      zoneControl[zone.id] = leaderClan;
      clanScores[leaderClan] = (clanScores[leaderClan] || 0) + zone.baseValue;
    } else {
      zoneControl[zone.id] = null;
    }
  }

  const ranking = Array.from(allClanIds).map((clanId) => ({
    clanId,
    score: clanScores[clanId] || 0,
    influence: totalInfluenceByClan[clanId] || 0,
  }));

  ranking.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.influence !== a.influence) return b.influence - a.influence;
    return a.clanId.localeCompare(b.clanId);
  });

  const winningEntry = ranking[0];
  let winningClanId: ClanId | null = winningEntry ? winningEntry.clanId : null;
  if (ranking.length > 1 && winningEntry) {
    const runnerUp = ranking[1];
    if (
      runnerUp &&
      runnerUp.score === winningEntry.score &&
      runnerUp.influence === winningEntry.influence
    ) {
      winningClanId = null;
    }
  }

  // 3. Calculate Player Rewards
  const playerRewards: PlayerReward[] = [];
  const officialRewardsEnabled = state.arenaMode === "official";

  if (winningClanId && officialRewardsEnabled) {
    const winningPlayers = Object.values(state.players).filter(
      (p) => p.clanId === winningClanId && p.battleScore >= CONFIG.MIN_CONTRIBUTION_SCORE
    );

    const clanTotalScore = winningPlayers.reduce((sum, p) => sum + p.battleScore, 0);

    for (const player of Object.values(state.players)) {
      const accuracy =
        player.questionsAnswered > 0
          ? player.questionsCorrect / player.questionsAnswered
          : 0;

      if (
        player.clanId === winningClanId &&
        clanTotalScore > 0 &&
        player.battleScore >= CONFIG.MIN_CONTRIBUTION_SCORE
      ) {
        const share = player.battleScore / clanTotalScore;
        const rawCoins = Math.floor(CONFIG.TOTAL_COIN_LOOT * share);
        const rawXp = Math.floor(CONFIG.TOTAL_XP_LOOT * share);
        const rawGems =
          player.questionsAnswered >= CONFIG.GEM_ELIGIBILITY_MIN_QUESTIONS &&
          accuracy >= CONFIG.GEM_ELIGIBILITY_MIN_ACCURACY
            ? Math.floor(CONFIG.TOTAL_GEM_LOOT * share)
            : 0;

        const coins = Math.min(rawCoins, CONFIG.MAX_COINS_PER_PLAYER);
        const xp = Math.min(rawXp, CONFIG.MAX_XP_PER_PLAYER);
        const gems = Math.min(rawGems, CONFIG.MAX_GEMS_PER_PLAYER);

        playerRewards.push({
          playerId: player.id,
          clanId: player.clanId,
          clanName: player.clanName,
          coins,
          xp,
          gems,
          battleScore: player.battleScore,
          questionsAnswered: player.questionsAnswered,
          questionsCorrect: player.questionsCorrect,
          accuracy,
        });
      } else {
        playerRewards.push({
          playerId: player.id,
          clanId: player.clanId,
          clanName: player.clanName,
          coins: 0,
          xp: 0,
          gems: 0,
          battleScore: player.battleScore,
          questionsAnswered: player.questionsAnswered,
          questionsCorrect: player.questionsCorrect,
          accuracy,
        });
      }
    }
  } else {
    // No official rewards in open arenas, and no rewards when no winner exists.
    for (const player of Object.values(state.players)) {
      playerRewards.push({
        playerId: player.id,
        clanId: player.clanId,
        clanName: player.clanName,
        coins: 0,
        xp: 0,
        gems: 0,
        battleScore: player.battleScore,
        questionsAnswered: player.questionsAnswered,
        questionsCorrect: player.questionsCorrect,
        accuracy: player.questionsAnswered > 0
          ? player.questionsCorrect / player.questionsAnswered
          : 0,
      });
    }
  }

  return {
    winningClanId,
    zoneControl,
    clanScores,
    playerRewards,
  };
}
