import {
  GameEvent,
  GameState,
  PlayerRecord,
  StealEvent,
} from './lockdownTypes';

export interface PlayerSummary {
  playerId: string;
  name: string;
  coins: number;
  correctAnswers: number;
  incorrectAnswers: number;
  answered: number;
  accuracy: number;
  hacksUsed: number;
  alarmContribution: number;
  totalStealValue: number;
  biggestSteal: number;
  assists: number;
  roundsPlayed: number;
  lateRoundImpact: number;
}

export enum AwardId {
  TOP_AGENT = 'TOP_AGENT',
  ACCURACY_SNIPER = 'ACCURACY_SNIPER',
  CHAOS_GREMLIN = 'CHAOS_GREMLIN',
  CLUTCH_HACKER = 'CLUTCH_HACKER',
  SILENT_GHOST = 'SILENT_GHOST',
}

export interface Award {
  id: AwardId;
  title: string;
  description: string;
  playerId: string;
}

const MIN_ACCURACY_ANSWERS = 5;
const MIN_SILENT_GHOST_ANSWERS = 3;

function collectEvents(state: GameState): GameEvent[] {
  const inlineEvents = state.events ?? [];
  const roundEvents = (state.rounds ?? []).flatMap((round) =>
    round.events.map((event) => ({ ...event, round: event.round ?? round.round }))
  );
  const events = [...inlineEvents, ...roundEvents];
  return events.sort((a, b) => (a.round ?? 0) - (b.round ?? 0));
}

function totalRounds(state: GameState, events: GameEvent[]): number {
  if (typeof state.totalRounds === 'number') {
    return state.totalRounds;
  }

  const roundFromEvents = events.reduce<number>((max, event) => {
    const roundIndex = event.round ?? 0;
    return roundIndex > max ? roundIndex : max;
  }, 0);

  const roundFromSummary = (state.rounds ?? []).reduce<number>((max, round) =>
    round.round > max ? round.round : max,
    0
  );

  return Math.max(roundFromEvents, roundFromSummary);
}

function fallbackNumber(value: number | undefined, alternative: number): number {
  return typeof value === 'number' ? value : alternative;
}

function summarizePlayer(
  player: PlayerRecord,
  events: GameEvent[],
  finalRound: number
): PlayerSummary {
  const playerEvents = events.filter((event) => event.playerId === player.id);

  const correctFromEvents = playerEvents.filter(
    (event): event is Extract<GameEvent, { type: 'QUESTION' }> =>
      event.type === 'QUESTION' && event.correct
  ).length;
  const incorrectFromEvents = playerEvents.filter(
    (event): event is Extract<GameEvent, { type: 'QUESTION' }> =>
      event.type === 'QUESTION' && !event.correct
  ).length;

  const correctAnswers = fallbackNumber(player.correctAnswers, correctFromEvents);
  const incorrectAnswers = fallbackNumber(
    player.incorrectAnswers,
    incorrectFromEvents
  );
  const answered = correctAnswers + incorrectAnswers;
  const accuracy = answered > 0 ? correctAnswers / answered : 0;

  const hacksUsed = fallbackNumber(
    player.hacksUsed,
    playerEvents.filter((event) => event.type === 'HACK').length
  );

  const alarmContribution = fallbackNumber(
    player.alarmContribution,
    playerEvents.reduce((sum, event) => {
      if (event.type === 'ALARM') {
        return sum + event.amount;
      }
      if (event.type === 'HACK') {
        return sum + (event.alarmImpact ?? 0);
      }
      return sum;
    }, 0)
  );

  const stealEvents: StealEvent[] = [
    ...(player.steals ?? []),
    ...playerEvents.filter(
      (event): event is StealEvent => event.type === 'STEAL' && event.successful
    ),
  ];

  const totalStealValue = stealEvents.reduce(
    (sum, steal) => (steal.successful ? sum + Math.max(steal.amount, 0) : sum),
    0
  );
  const biggestSteal = stealEvents.reduce(
    (max, steal) => (steal.successful && steal.amount > max ? steal.amount : max),
    0
  );

  const assists = fallbackNumber(
    player.assists,
    playerEvents.filter((event) => event.type === 'ASSIST').length
  );

  const roundsPlayed = fallbackNumber(
    player.roundsPlayed,
    new Set(playerEvents.map((event) => event.round ?? 0)).size
  );

  const lateRoundFloor = Math.max(finalRound - 1, 1);
  const lateRoundImpact = stealEvents
    .filter((steal) => (steal.round ?? 0) >= lateRoundFloor)
    .reduce((max, steal) => (steal.amount > max ? steal.amount : max), 0);

  return {
    playerId: player.id,
    name: player.name,
    coins: player.coins,
    correctAnswers,
    incorrectAnswers,
    answered,
    accuracy,
    hacksUsed,
    alarmContribution,
    totalStealValue,
    biggestSteal,
    assists,
    roundsPlayed,
    lateRoundImpact,
  };
}

export function summarizePlayers(state: GameState): PlayerSummary[] {
  const events = collectEvents(state);
  const finalRound = totalRounds(state, events);
  return state.players.map((player) =>
    summarizePlayer(player, events, finalRound)
  );
}

export function getTopAgentsByCoins(
  state: GameState,
  limit: number
): PlayerSummary[] {
  const summaries = summarizePlayers(state);
  return summaries
    .sort((a, b) => {
      if (b.coins !== a.coins) {
        return b.coins - a.coins;
      }
      if (b.accuracy !== a.accuracy) {
        return b.accuracy - a.accuracy;
      }
      return b.answered - a.answered;
    })
    .slice(0, Math.max(limit, 0));
}

export function calculateAwards(state: GameState): Award[] {
  const summaries = summarizePlayers(state);
  if (summaries.length === 0) return [];

  const awards: Award[] = [];

  const topAgents = [...summaries].sort((a, b) => {
    if (b.coins !== a.coins) {
      return b.coins - a.coins;
    }
    return b.accuracy - a.accuracy;
  });
  const topAgent = topAgents[0];
  awards.push({
    id: AwardId.TOP_AGENT,
    title: 'Top Agent',
    description: `${topAgent.name} secured the most coins with disciplined play.`,
    playerId: topAgent.playerId,
  });

  const accuracyCandidates = summaries
    .filter((summary) => summary.answered >= MIN_ACCURACY_ANSWERS)
    .sort((a, b) => {
      if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
      if (b.answered !== a.answered) return b.answered - a.answered;
      return b.coins - a.coins;
    });
  if (accuracyCandidates.length > 0) {
    const sniper = accuracyCandidates[0];
    awards.push({
      id: AwardId.ACCURACY_SNIPER,
      title: 'Accuracy Sniper',
      description: `${sniper.name} posted the best answer accuracy under pressure.`,
      playerId: sniper.playerId,
    });
  }

  const chaosCandidates = summaries
    .filter((summary) => summary.alarmContribution > 0 || summary.hacksUsed > 0)
    .map((summary) => ({
      summary,
      score: summary.alarmContribution + summary.hacksUsed,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.summary.totalStealValue !== a.summary.totalStealValue) {
        return b.summary.totalStealValue - a.summary.totalStealValue;
      }
      return b.summary.hacksUsed - a.summary.hacksUsed;
    });
  if (chaosCandidates.length > 0) {
    const gremlin = chaosCandidates[0].summary;
    awards.push({
      id: AwardId.CHAOS_GREMLIN,
      title: 'Chaos Gremlin',
      description: `${gremlin.name} fueled the alarm meter and leaned into hacks.`,
      playerId: gremlin.playerId,
    });
  }

  const clutchCandidates = summaries
    .filter((summary) => summary.lateRoundImpact > 0 || summary.biggestSteal > 0)
    .sort((a, b) => {
      const aImpact = Math.max(a.lateRoundImpact, a.biggestSteal);
      const bImpact = Math.max(b.lateRoundImpact, b.biggestSteal);
      if (bImpact !== aImpact) return bImpact - aImpact;
      if (b.coins !== a.coins) return b.coins - a.coins;
      return b.accuracy - a.accuracy;
    });
  if (clutchCandidates.length > 0) {
    const clutch = clutchCandidates[0];
    awards.push({
      id: AwardId.CLUTCH_HACKER,
      title: 'Clutch Hacker',
      description: `${clutch.name} delivered the biggest late-round swing.`,
      playerId: clutch.playerId,
    });
  }

  const topCoinIds = new Set(topAgents.slice(0, 3).map((player) => player.playerId));
  const silentCandidates = summaries
    .filter((summary) =>
      !topCoinIds.has(summary.playerId) &&
      summary.answered >= MIN_SILENT_GHOST_ANSWERS &&
      summary.accuracy >= 0.6
    )
    .sort((a, b) => {
      if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
      if (a.hacksUsed !== b.hacksUsed) return a.hacksUsed - b.hacksUsed;
      return b.answered - a.answered;
    });
  if (silentCandidates.length > 0) {
    const ghost = silentCandidates[0];
    awards.push({
      id: AwardId.SILENT_GHOST,
      title: 'Silent Ghost',
      description: `${ghost.name} quietly posted elite accuracy without topping the bank.`,
      playerId: ghost.playerId,
    });
  }

  return awards;
}
