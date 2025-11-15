import {
  SoloMissionSummary,
  SoloQuestionPerformance,
  TopicSummary,
  BranchProgressSummary,
} from '../types';
import { loadFromStorage, saveToStorage, STORAGE_KEYS } from './storageService';
import { classifyTopicStatus } from '../src/lib/brains_heist/topic';
import {
  canUnlockNextTopic,
  buildBranchSummary,
  MissionRecord,
} from '../src/lib/brains_heist/progression';

interface StoredTopicStats {
  topicId: string;
  branchId: string;
  totalAnswers: number;
  correctAnswers: number;
  totalAnswerTime: number;
  totalTimeLimit: number;
  missionsCompleted: number;
  totalRetries: number;
  missionHistory: MissionRecord[];
  updatedAt: string;
}

type TopicStatsMap = Record<string, StoredTopicStats>;

type BranchHistoryMap = Record<string, MissionRecord[]>;

const MAX_HISTORY = 25;

const loadTopicStats = (): TopicStatsMap =>
  loadFromStorage<TopicStatsMap>(STORAGE_KEYS.TOPIC_STATS) ?? {};

const persistTopicStats = (stats: TopicStatsMap) => {
  saveToStorage(STORAGE_KEYS.TOPIC_STATS, stats);
};

const loadBranchHistory = (): BranchHistoryMap =>
  loadFromStorage<BranchHistoryMap>(STORAGE_KEYS.BRANCH_HISTORY) ?? {};

const persistBranchHistory = (history: BranchHistoryMap) => {
  saveToStorage(STORAGE_KEYS.BRANCH_HISTORY, history);
};

const touchTopicStats = (
  topicId: string,
  branchId: string,
  map: TopicStatsMap
): StoredTopicStats => {
  if (!map[topicId]) {
    map[topicId] = {
      topicId,
      branchId,
      totalAnswers: 0,
      correctAnswers: 0,
      totalAnswerTime: 0,
      totalTimeLimit: 0,
      missionsCompleted: 0,
      totalRetries: 0,
      missionHistory: [],
      updatedAt: new Date().toISOString(),
    };
  }

  return map[topicId];
};

export const recordSoloQuestion = (performance: SoloQuestionPerformance): void => {
  const topicStats = loadTopicStats();
  const stats = touchTopicStats(performance.topicId, performance.branchId, topicStats);

  stats.totalAnswers += 1;
  stats.totalAnswerTime += performance.answerTimeSeconds;
  stats.totalTimeLimit += performance.timeLimitSeconds;
  stats.updatedAt = performance.timestamp;

  if (performance.wasCorrect) {
    stats.correctAnswers += 1;
  }

  persistTopicStats(topicStats);
};

const toTopicSummary = (stats: StoredTopicStats): TopicSummary => {
  const accuracy = stats.totalAnswers > 0 ? stats.correctAnswers / stats.totalAnswers : 0;
  const avgTimeRatio = stats.totalTimeLimit > 0 ? stats.totalAnswerTime / stats.totalTimeLimit : 0;
  const retryCount = stats.missionsCompleted > 0 ? stats.totalRetries / stats.missionsCompleted : 0;
  const status = classifyTopicStatus({ accuracy, avgTimeRatio, retryCount });
  const canUnlockNext = canUnlockNextTopic({
    missionsCompleted: stats.missionsCompleted,
    accuracy,
    avgTimeRatio,
  });

  return {
    topicId: stats.topicId,
    branchId: stats.branchId,
    missionsCompleted: stats.missionsCompleted,
    accuracy,
    avgTimeRatio,
    retryCount,
    status,
    canUnlockNextTopic: canUnlockNext,
    updatedAt: stats.updatedAt,
  };
};

const updateBranchHistory = (summary: SoloMissionSummary): void => {
  const history = loadBranchHistory();
  const missionRecord: MissionRecord = {
    difficulty: summary.difficulty,
    accuracy: summary.accuracy,
    completedAt: summary.recordedAt,
  };

  const branchList = history[summary.branchId] ?? [];
  branchList.push(missionRecord);
  while (branchList.length > MAX_HISTORY) {
    branchList.shift();
  }
  history[summary.branchId] = branchList;
  persistBranchHistory(history);
};

export const recordMissionSummary = (
  summary: SoloMissionSummary & { retryAttempts?: number }
): TopicSummary => {
  const topicStats = loadTopicStats();
  const stats = touchTopicStats(summary.topicId, summary.branchId, topicStats);

  stats.missionsCompleted += 1;
  stats.totalRetries += summary.retryAttempts ?? 0;
  stats.updatedAt = summary.recordedAt;
  stats.missionHistory.push({
    difficulty: summary.difficulty,
    accuracy: summary.accuracy,
    completedAt: summary.recordedAt,
  });

  while (stats.missionHistory.length > MAX_HISTORY) {
    stats.missionHistory.shift();
  }

  persistTopicStats(topicStats);
  updateBranchHistory(summary);

  return toTopicSummary(stats);
};

export const getTopicSummary = (topicId: string): TopicSummary | null => {
  const topicStats = loadTopicStats();
  const stats = topicStats[topicId];
  if (!stats) return null;
  return toTopicSummary(stats);
};

export const getTopicSummaries = (): TopicSummary[] => {
  const topicStats = loadTopicStats();
  return Object.values(topicStats).map(toTopicSummary);
};

export const getProgressMap = (): BranchProgressSummary[] => {
  const topicStats = loadTopicStats();
  const branchHistory = loadBranchHistory();
  const grouped = new Map<string, TopicSummary[]>();

  Object.values(topicStats).forEach((stats) => {
    const summary = toTopicSummary(stats);
    if (!grouped.has(stats.branchId)) {
      grouped.set(stats.branchId, []);
    }
    grouped.get(stats.branchId)!.push(summary);
  });

  return Array.from(grouped.entries()).map(([branchId, topics]) => {
    const history = branchHistory[branchId] ?? [];
    return buildBranchSummary(branchId, topics, history);
  });
};

export const resetAdaptiveData = (): void => {
  saveToStorage(STORAGE_KEYS.TOPIC_STATS, {});
  saveToStorage(STORAGE_KEYS.BRANCH_HISTORY, {});
};
