import React, { useEffect, useMemo, useState } from 'react';
import { Profile } from '../../../types';
import * as GameService from '../../../services/gameService';
import { tryConsumePilotQuota } from '../../../services/tierService';
import {
  BossUnlockState,
  RaidMode,
  RaidParticipantState,
  RaidQuestion,
  RaidStatus,
  RaidTeam,
  RaidWaveState,
} from './raidTypes';
import { getBranchHistories, getTopicSummaries } from '../../../services/adaptiveService';

interface RaidViewProps {
  profile: Profile;
  onComplete: () => void;
  addToast?: (message: string, type?: 'info' | 'success' | 'error') => void;
}

interface CheerEvent {
  id: string;
  user: string;
  message: string;
  emoji: string;
  team: RaidTeam;
}

const RAID_MODE_DETAILS: Record<
  RaidMode,
  {
    label: string;
    description: string;
    durationLabel: string;
    durationSeconds: number;
    teamSize: number;
    accent: string;
    spectatorLine: string;
  }
> = {
  strike_squad: {
    label: 'Strike Squad 3v3',
    description: 'Speed round with comedy curveballs and a 10-minute pressure cooker.',
    durationLabel: '10 min run',
    durationSeconds: 600,
    teamSize: 3,
    accent: 'from-teal-400 to-indigo-500',
    spectatorLine: 'Spectators drop turbo cheers while teams rotate lightning-fast.',
  },
  mega_crew: {
    label: 'Mega Crew 5v5',
    description: 'Full raid pacing, neon arena, and sudden-death panic finales.',
    durationLabel: '15 min run',
    durationSeconds: 900,
    teamSize: 5,
    accent: 'from-indigo-500 via-purple-500 to-rose-500',
    spectatorLine: 'Perfect for class battles with roaring emote bleachers.',
  },
  clan_war: {
    label: 'Clan War',
    description: 'Clubs clash with subs between waves and massive loot on the line.',
    durationLabel: '20 min run',
    durationSeconds: 1200,
    teamSize: 12,
    accent: 'from-amber-400 to-rose-500',
    spectatorLine: 'Spectators float as holograms dropping cheers and banana peels.',
  },
};

const TEAM_STYLES: Record<
  RaidTeam,
  { label: string; accent: string; border: string; glow: string; emoji: string; cheerColor: string }
> = {
  alpha: {
    label: 'Team Nova',
    accent: 'from-cyan-400 to-indigo-500',
    border: 'border-cyan-300',
    glow: 'shadow-[0_0_25px_rgba(6,182,212,0.35)]',
    emoji: '🚀',
    cheerColor: 'text-cyan-300',
  },
  beta: {
    label: 'Team Chaos',
    accent: 'from-rose-400 to-amber-500',
    border: 'border-rose-300',
    glow: 'shadow-[0_0_25px_rgba(244,114,182,0.35)]',
    emoji: '⚡️',
    cheerColor: 'text-rose-300',
  },
};

const CHEER_MESSAGES = [
  'launches a confetti cannon',
  'drops a banana peel near the boss',
  'chants the battle anthem',
  'deploys a hologram llama cheer',
  'sends neon snacks to the team',
  'cracks a joke that steals 2s from the clock',
];

const randomItem = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

const generateSpikeIndexes = (wave: RaidWaveState): number[] => {
  const indexes = new Set<number>();
  wave.spikeQuestionIds.forEach((_, idx) => {
    const slot = (wave.waveNumber + idx * 2) % 5;
    indexes.add(slot);
  });
  while (indexes.size < wave.spikeQuestions) {
    indexes.add((indexes.size + wave.waveNumber) % 5);
  }
  return Array.from(indexes);
};

const buildFallbackQuestions = (wave: RaidWaveState): RaidQuestion[] => {
  const spikeIndexes = generateSpikeIndexes(wave);
  return Array.from({ length: 5 }, (_, idx) => {
    const isSpike = spikeIndexes.includes(idx);
    const difficulty = isSpike ? 'hard' : wave.difficulty;
    const baseScore = difficulty === 'easy' ? 60 : difficulty === 'medium' ? 80 : 100;
    return {
      id: `fallback_${wave.waveNumber}_${idx}`,
      prompt: isSpike
        ? `Spike protocol ${idx + 1}: Crack the encrypted pattern for wave ${wave.waveNumber}.`
        : `Solve checkpoint ${idx + 1} for wave ${wave.waveNumber}.`,
      answers: ['A', 'B', 'C', 'D'].map((label) => `${label} - option`),
      correctIndex: idx % 4,
      difficulty,
      baseScore: isSpike ? baseScore + 20 : baseScore,
      isSpike,
    };
  });
};

const getTeamByIndex = (index: number): RaidTeam => (index % 2 === 0 ? 'alpha' : 'beta');

const stylizeParticipant = (participant: RaidParticipantState, fallbackTeam: RaidTeam): RaidParticipantState => ({
  ...participant,
  team: participant.team ?? fallbackTeam,
  role: participant.role ?? 'player',
  avatarColor:
    participant.avatarColor ?? (fallbackTeam === 'alpha' ? 'bg-gradient-to-br from-cyan-400 to-indigo-500' : 'bg-gradient-to-br from-rose-400 to-amber-500'),
  cheerCount: participant.cheerCount ?? 0,
});

const getTeamCapacity = (mode: RaidMode): number => RAID_MODE_DETAILS[mode]?.teamSize ?? RAID_MODE_DETAILS.mega_crew.teamSize;

const computeLocalBossUnlock = (): BossUnlockState | null => {
  const branchHistories = getBranchHistories();
  const topicSummaries = getTopicSummaries();

  let unlocked = false;
  let bestStreak = 0;
  const crushedTopicSet = new Set<string>();

  for (const [branchId, missions] of Object.entries(branchHistories)) {
    if (!missions || missions.length === 0) continue;

    const ordered = missions
      .slice()
      .sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime());

    let streak = 0;
    let branchBest = 0;
    ordered.forEach((mission) => {
      const isMediumOrHard = mission.difficulty === 'medium' || mission.difficulty === 'hard';
      const accuracyOk = mission.accuracy >= 0.8;
      if (isMediumOrHard && accuracyOk) {
        streak += 1;
        branchBest = Math.max(branchBest, streak);
      } else {
        streak = 0;
      }
    });

    const crushed = topicSummaries.filter(
      (topic) => topic.branchId === branchId && topic.status === 'CRUSHED'
    );

    // Fallback: if no official crushed topic, infer mastery from mission accuracy
    const aggregateAccuracy = (() => {
      if (missions.length === 0) return 0;
      const correctTotal = missions.reduce((sum, mission) => sum + mission.accuracy, 0);
      return correctTotal / missions.length;
    })();

    const inferredCrushed = crushed.length > 0 || (missions.length >= 3 && aggregateAccuracy >= 0.85);

    if (branchBest >= 3 && inferredCrushed) {
      unlocked = true;
      bestStreak = Math.max(bestStreak, branchBest);
      if (crushed.length > 0) {
        crushed.forEach((topic) => crushedTopicSet.add(topic.topicId));
      } else {
        crushedTopicSet.add(`branch-${branchId}`);
      }
    }
  }

  if (!unlocked) {
    return null;
  }

  return {
    unlocked: true,
    consecutiveMissions: Math.min(bestStreak, 3),
    crushedTopics: Array.from(crushedTopicSet),
    reason: undefined,
  };
};

const RaidView: React.FC<RaidViewProps> = ({ profile, onComplete, addToast }) => {
  const [status, setStatus] = useState<RaidStatus | null>(null);
  const [participant, setParticipant] = useState<RaidParticipantState | null>(null);
  const [bossUnlock, setBossUnlock] = useState<BossUnlockState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answering, setAnswering] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answerFeedback, setAnswerFeedback] = useState<string | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [waveQuestionsMap, setWaveQuestionsMap] = useState<Record<number, RaidQuestion[]>>({});
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionLoadError, setQuestionLoadError] = useState<string | null>(null);
  const [lastRaidId, setLastRaidId] = useState<string | null>(null);
  const [showHowTo, setShowHowTo] = useState(false);
  const [selectedMode, setSelectedMode] = useState<RaidMode>('mega_crew');
  const [teamPreference, setTeamPreference] = useState<RaidTeam>('alpha');
  const [spectatorRoster, setSpectatorRoster] = useState<RaidParticipantState[]>([]);
  const [isSpectating, setIsSpectating] = useState(false);
  const [cheerFeed, setCheerFeed] = useState<CheerEvent[]>([]);

  const getErrorMessage = (err: unknown, fallback: string) => {
    if (err instanceof Error && err.message) {
      return err.message;
    }
    return fallback;
  };

  const activeWave = useMemo(() => status?.waves.find((wave) => !wave.completed) ?? null, [status]);
  const waveQuestions = useMemo(() => {
    if (!activeWave) return [];
    return waveQuestionsMap[activeWave.waveNumber] ?? [];
  }, [activeWave, waveQuestionsMap]);
  const currentQuestion = waveQuestions.length > 0 ? waveQuestions[Math.min(questionIndex, waveQuestions.length - 1)] : null;
  const participantsWithStyle = useMemo(() => {
    if (!status) return [];
    return status.participants.map((p, idx) => stylizeParticipant(p, getTeamByIndex(idx)));
  }, [status]);
  const alphaTeam = participantsWithStyle.filter((p) => p.team === 'alpha');
  const betaTeam = participantsWithStyle.filter((p) => p.team === 'beta');
  const teamCapacity = getTeamCapacity(selectedMode);
  const alphaDamage = alphaTeam.reduce((sum, player) => sum + player.damageDealt, 0);
  const betaDamage = betaTeam.reduce((sum, player) => sum + player.damageDealt, 0);
  const totalDamage = alphaDamage + betaDamage || 1;
  const alphaPercent = Math.round((alphaDamage / totalDamage) * 100);
  const betaPercent = 100 - alphaPercent;
  const winningTeam: RaidTeam | null =
    alphaDamage === betaDamage ? null : alphaDamage > betaDamage ? 'alpha' : 'beta';
  const modeDetails = RAID_MODE_DETAILS[selectedMode];
  const decoratedSpectators = useMemo(() => {
    if (spectatorRoster.length > 0) {
      return spectatorRoster.map((spectator, idx) =>
        stylizeParticipant(
          spectator,
          spectator.team ?? getTeamByIndex(idx + participantsWithStyle.length),
        ),
      );
    }
    if (status?.spectators && status.spectators.length > 0) {
      return status.spectators.map((spectator, idx) =>
        stylizeParticipant(spectator, getTeamByIndex(idx + participantsWithStyle.length)),
      );
    }
    return [];
  }, [spectatorRoster, status?.spectators, participantsWithStyle.length]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [raid, unlock] = await Promise.all([
        GameService.getActiveRaidStatus(),
        GameService.getBossUnlockState(profile.id),
      ]);
      setStatus(raid);
      let mergedUnlock = unlock ?? null;
      if (!mergedUnlock || !mergedUnlock.unlocked) {
        const localUnlock = computeLocalBossUnlock();
        if (localUnlock) {
          mergedUnlock = localUnlock;
        }
      }
      setBossUnlock(
        mergedUnlock || {
          unlocked: false,
          consecutiveMissions: 0,
          crushedTopics: [],
          reason:
            unlock?.reason ||
            'Complete 3 Medium+ missions in a row with ≥80% accuracy and maintain at least one crushed topic.',
        }
      );
      if (raid) {
        const joinedIndex = raid.participants.findIndex((p) => p.userId === profile.id);
        const joinedRaw = joinedIndex >= 0 ? raid.participants[joinedIndex] : null;
        const styledParticipant =
          joinedRaw && joinedIndex >= 0
            ? stylizeParticipant(joinedRaw, joinedRaw.team ?? getTeamByIndex(joinedIndex))
            : null;
        if (styledParticipant?.team) {
          setTeamPreference(styledParticipant.team);
        }
        setParticipant(styledParticipant);
        const remoteSpectators = raid.spectators ?? [];
        setSpectatorRoster(
          remoteSpectators.map((spectator, idx) =>
            stylizeParticipant(
              { ...spectator, role: 'spectator' },
              spectator.team ?? getTeamByIndex(idx + raid.participants.length),
            ),
          ),
        );
        setIsSpectating(remoteSpectators.some((spectator) => spectator.userId === profile.id));
      } else {
        setSpectatorRoster([]);
        setIsSpectating(false);
      }
      setError(null);
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, 'Failed to load raid intel.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!activeWave || waveQuestionsMap[activeWave.waveNumber]) {
      return;
    }
    let cancelled = false;
    setQuestionsLoading(true);
    setQuestionLoadError(null);
    GameService.getRaidWaveQuestions({
      wave: activeWave,
      spikeSlots: generateSpikeIndexes(activeWave),
      grade: profile.grade ?? null,
    })
      .then((questions) => {
        if (cancelled) return;
        const hydrated = questions.length > 0 ? questions : buildFallbackQuestions(activeWave);
        setWaveQuestionsMap((prev) => ({ ...prev, [activeWave.waveNumber]: hydrated }));
        setQuestionIndex(0);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setQuestionLoadError('Failed to load raid questions. Using fallback prompts.');
        addToast?.('Failed to load raid questions. Using fallback prompts.', 'error');
        setWaveQuestionsMap((prev) => ({ ...prev, [activeWave.waveNumber]: buildFallbackQuestions(activeWave) }));
      })
      .finally(() => {
        if (!cancelled) {
          setQuestionsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeWave, waveQuestionsMap, profile.grade, addToast]);

  useEffect(() => {
    if (status?.mode) {
      setSelectedMode(status.mode);
    }
    if (!status) {
      setSpectatorRoster([]);
      setIsSpectating(false);
    }
  }, [status]);

  useEffect(() => {
    const raidId = status?.raidId ?? null;
    if (raidId !== lastRaidId) {
      setWaveQuestionsMap({});
      setQuestionIndex(0);
      setLastRaidId(raidId);
    }
  }, [status?.raidId, lastRaidId]);

  useEffect(() => {
    if (waveQuestions.length > 0 && questionIndex >= waveQuestions.length) {
      setQuestionIndex(0);
    }
  }, [waveQuestions.length, questionIndex]);

  useEffect(() => {
    if (status?.spectators && status.spectators.length > 0) {
      setSpectatorRoster((prev) => {
        const existingIds = new Set(prev.map((spectator) => spectator.userId));
        const additions = status.spectators
          .filter((spectator) => !existingIds.has(spectator.userId))
          .map((spectator, idx) =>
            stylizeParticipant(
              { ...spectator, role: 'spectator' },
              spectator.team ?? getTeamByIndex(idx + participantsWithStyle.length),
            ),
          );
        return additions.length > 0 ? [...prev, ...additions] : prev;
      });
    }
  }, [status?.spectators, participantsWithStyle.length]);

  const handleJoin = async () => {
    if (!status || !status.raidId) {
      addToast?.('Raid is not ready yet.', 'error');
      return;
    }
    const desiredTeam = teamPreference;
    const roster = desiredTeam === 'alpha' ? alphaTeam : betaTeam;
    if (roster.length >= teamCapacity) {
      addToast?.('That roster is full—swap teams or hop in as a spectator.', 'error');
      return;
    }
    try {
      const joined = await GameService.joinRaid(status.raidId, profile.username, profile.id);
      const styled = stylizeParticipant(joined, desiredTeam);
      setParticipant(styled);
      setStatus((prev) => (prev ? { ...prev, participants: [...prev.participants, styled] } : prev));
      addToast?.('Joined the raid strike team!', 'success');
    } catch (err) {
      console.error(err);
      addToast?.(getErrorMessage(err, 'Unable to join raid right now.'), 'error');
    }
  };

  const handleStudentLaunch = async () => {
    if (launching) return;
    if (!bossUnlock?.unlocked) {
      addToast?.('Meet the unlock requirements before launching a raid.', 'error');
      return;
    }

    // Consume pilot quota if applicable
    const quota = await tryConsumePilotQuota('raid_attempts');
    if (!quota.proceed) {
      addToast?.(quota.error || 'Raid quota exhausted. Upgrade your plan to continue.', 'error');
      return;
    }

    setLaunching(true);
    try {
      const scheduled = await GameService.startRaidEncounter('obsidian_sentinel');
      const joined = await GameService.joinRaid(scheduled.raidId, profile.username, profile.id);
      const styled = stylizeParticipant(joined, teamPreference);
      setParticipant(styled);
      setStatus({
        ...scheduled,
        mode: selectedMode,
        lobbyDurationSeconds: RAID_MODE_DETAILS[selectedMode].durationSeconds,
        participants: [styled],
      });
      addToast?.('Raid launched! Rally your team.', 'success');
    } catch (err) {
      console.error(err);
      addToast?.(getErrorMessage(err, 'Unable to launch raid right now.'), 'error');
    } finally {
      setLaunching(false);
    }
  };

  const handleModeSelection = (mode: RaidMode) => {
    setSelectedMode(mode);
    setStatus((prev) => (prev ? { ...prev, mode } : prev));
  };

  const handleSpectate = () => {
    if (isSpectating) {
      addToast?.('You’re already floating in the spectator booth!', 'info');
      return;
    }
    const spectator = stylizeParticipant(
      {
        userId: profile.id,
        username: profile.username,
        damageDealt: 0,
        answersSubmitted: 0,
        lastActive: new Date().toISOString(),
        role: 'spectator',
      },
      teamPreference,
    );
    spectator.role = 'spectator';
    setIsSpectating(true);
    setSpectatorRoster((prev) => {
      if (prev.some((player) => player.userId === spectator.userId)) {
        return prev;
      }
      return [...prev, spectator];
    });
    addToast?.('Spectator visor on—drop cheers whenever you like!', 'success');
  };

  const handleCheer = (team: RaidTeam) => {
    if (!isSpectating) {
      addToast?.('Join as a spectator before launching emotes.', 'info');
      return;
    }
    const cheer: CheerEvent = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      user: profile.username,
      message: randomItem(CHEER_MESSAGES),
      emoji: TEAM_STYLES[team].emoji,
      team,
    };
    setCheerFeed((prev) => [cheer, ...prev].slice(0, 6));
    setSpectatorRoster((prev) =>
      prev.map((fan) =>
        fan.userId === profile.id ? { ...fan, cheerCount: (fan.cheerCount ?? 0) + 1 } : fan,
      ),
    );
  };

  const handleAnswer = async (choiceIndex: number) => {
    if (!status || !status.raidId || !activeWave || !participant || !currentQuestion) return;
    if (answering) return;

    setSelectedOption(choiceIndex);
    setAnswering(true);

    try {
      const answerText = currentQuestion.answers[choiceIndex] ?? currentQuestion.answers[0] ?? '';
      const payload = {
        raidId: status.raidId,
        questionId: currentQuestion.id,
        waveNumber: activeWave.waveNumber,
        isCorrect: currentQuestion.correctIndex === choiceIndex,
        score: currentQuestion.correctIndex === choiceIndex ? currentQuestion.baseScore : 0,
        waveScoreThreshold: activeWave.scoreThreshold,
        bossHp: activeWave.bossHp,
        timeTakenSeconds: 20,
        participantId: participant.userId,
        answerText,
      };

      const result = await GameService.submitRaidWaveAnswer(payload, activeWave, participant);
      setStatus((prev) => {
        if (!prev) return prev;
        const updatedWaves = prev.waves.map((wave) =>
          wave.waveNumber === result.updatedWave.waveNumber ? result.updatedWave : wave,
        );
        const updatedParticipants = prev.participants.some((p) => p.userId === participant.userId)
          ? prev.participants.map((p) => (p.userId === participant.userId ? result.updatedParticipant : p))
          : [...prev.participants, result.updatedParticipant];
        return { ...prev, waves: updatedWaves, participants: updatedParticipants };
      });
      setParticipant(result.updatedParticipant);
      setAnswerFeedback(
        result.damage > 0
          ? `Delivered ${result.damage} damage! ${result.waveCleared ? 'Wave secured—advance!' : 'Stay sharp for the next prompt.'}`
          : `Missed—team clock adds +${result.penaltySeconds}s. Rally and recover!`,
      );
      setQuestionIndex((prev) => {
        if (waveQuestions.length === 0) {
          return prev;
        }
        return (prev + 1) % waveQuestions.length;
      });
      setSelectedOption(null);
    } catch (err) {
      console.error(err);
      addToast?.(getErrorMessage(err, 'Answer submission failed.'), 'error');
    } finally {
      setAnswering(false);
    }
  };

  const handleLeave = () => {
    onComplete();
  };

  const renderWaveCard = (wave: RaidWaveState) => {
    const progress = Math.round((wave.damageDealt / wave.bossHp) * 100);
    const icon = wave.difficulty === 'easy' ? '🎈' : wave.difficulty === 'medium' ? '🎯' : '💀';
    return (
      <div
        key={wave.waveNumber}
        className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-lg shadow-slate-900/5 backdrop-blur"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Wave {wave.waveNumber}</p>
            <p className="text-xl font-bold text-slate-900 capitalize">
              {icon} {wave.difficulty}
            </p>
            <p className="text-xs text-slate-500">Spike bundle: {wave.spikeQuestions} elite prompts</p>
          </div>
          <div className="text-right">
            <span className="text-xs font-semibold text-slate-500">Boss HP</span>
            <p className="text-lg font-bold text-slate-900">{wave.bossHp}</p>
          </div>
        </div>
        <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${wave.completed ? 'bg-emerald-400' : 'bg-indigo-500'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 text-xs font-semibold text-slate-500">{progress}% armor cracked</p>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-6 flex justify-center">
        <img src="/BRAINS.svg" alt="Loading..." className="w-24 h-24 animate-pulse" style={{ filter: 'drop-shadow(0 0 20px rgba(0, 212, 255, 0.6))' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-center text-red-500">{error}</p>
        <button className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-white" onClick={() => void loadData()}>
          Retry
        </button>
      </div>
    );
  }

  if (!status) {
    const unlockReady = bossUnlock?.unlocked ?? false;
    return (
      <div className="p-6">
        <p className="text-center text-slate-500">No raid is live yet. Spark one for your squad and set the pace.</p>
        <div className="mt-4 flex flex-col items-center gap-3">
          <button
            className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-40"
            onClick={handleStudentLaunch}
            disabled={launching || loading || !unlockReady}
          >
            {launching ? 'Launching…' : 'Launch Raid' }
          </button>
          {loading ? (
            <p className="text-xs text-slate-500 text-center">Checking your raid credentials…</p>
          ) : !unlockReady ? (
            <p className="text-xs text-slate-500 text-center">
              Clear three Medium+ streak missions at ≥80% accuracy and maintain a Crushed topic in-branch to unlock raids.
            </p>
          ) : null}
          <button className="rounded-md border border-slate-300 px-4 py-2 text-sm" onClick={handleLeave}>
            Back
          </button>
        </div>
      </div>
    );
  }

  const unlocked = bossUnlock?.unlocked ?? false;
  const lobbySeconds = status.lobbyDurationSeconds ?? modeDetails.durationSeconds;
  const panicSeconds = status.panicPhaseSeconds ?? 60;
  const spectatorCount = decoratedSpectators.length;

  return (
    <div className="space-y-6 bg-slate-950/95 p-4 text-slate-100 md:p-6">
      <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 p-6 shadow-2xl shadow-indigo-900/40">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-3xl font-black text-white">Raid Command Center</h2>
            <p className="text-sm text-slate-200">
              {status.arenaTheme || 'Neon Cortex Arena'} is live. Coordinate jokes, curveballs, and clutch answers to melt the boss.
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-wide text-slate-300">
              <span className="rounded-full border border-white/30 px-3 py-1">Mode · {modeDetails.label}</span>
              <span className="rounded-full border border-white/30 px-3 py-1">
                Runtime · {Math.round(lobbySeconds / 60)} min
              </span>
              <span className="rounded-full border border-white/30 px-3 py-1">Panic · {panicSeconds}s</span>
            </div>
          </div>
          <div className="flex items-center gap-3 self-end text-white">
            <button
              className="rounded-full border border-white/30 px-3 py-1 text-sm font-semibold text-white hover:bg-white/10"
              onClick={() => setShowHowTo((prev) => !prev)}
              aria-label="How raid battles work"
            >
              Briefing
            </button>
            <button className="rounded-md border border-white/30 px-3 py-2 text-sm" onClick={handleLeave}>
              Exit
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {(['alpha', 'beta'] as RaidTeam[]).map((team) => {
            const roster = team === 'alpha' ? alphaTeam : betaTeam;
            const percent = team === 'alpha' ? alphaPercent : betaPercent;
            const damage = team === 'alpha' ? alphaDamage : betaDamage;
            const styles = TEAM_STYLES[team];
            const slotsLeft = Math.max(teamCapacity - roster.length, 0);
            const cheerTotal = roster.reduce((sum, player) => sum + (player.cheerCount ?? 0), 0);
            return (
              <div
                key={team}
                className={`rounded-2xl border border-white/15 bg-gradient-to-br ${styles.accent} p-4 text-white ${styles.glow}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-white/70">{styles.label}</p>
                    <p className="text-3xl font-black">{styles.emoji}</p>
                    <p className="text-lg font-semibold">{damage} dmg dealt</p>
                  </div>
                  <div className="text-right text-xs text-white/80">
                    <p>Slots {roster.length}/{teamCapacity}</p>
                    <p>Cheers {cheerTotal}</p>
                    <p>{slotsLeft > 0 ? `${slotsLeft} open` : 'Roster locked'}</p>
                  </div>
                </div>
                <div className="mt-4 h-2 w-full rounded-full bg-white/30">
                  <div className="h-full rounded-full bg-white" style={{ width: `${percent}%` }} />
                </div>
                <ul className="mt-3 space-y-2 text-sm">
                  {roster.length > 0 ? (
                    roster.map((p) => (
                      <li key={p.userId} className="flex items-center justify-between text-white/90">
                        <span>
                          {p.username}
                          {p.isMvp && (
                            <span className="ml-2 rounded-full bg-white/30 px-2 py-0.5 text-xs font-bold text-yellow-100">MVP</span>
                          )}
                        </span>
                        <span>{p.damageDealt} dmg</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-white/80">No one yet—claim the banner.</li>
                  )}
                </ul>
              </div>
            );
          })}

          <div className="rounded-2xl border border-white/15 bg-white/5 p-4 text-white">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Arena pulse</p>
            <p className="text-2xl font-black">
              {winningTeam
                ? `${TEAM_STYLES[winningTeam].emoji} ${TEAM_STYLES[winningTeam].label} are ahead`
                : 'Neck-and-neck chaos'}
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-xs text-white/70">Damage split</p>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-cyan-300" style={{ width: `${alphaPercent}%` }} />
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-white/60">
                  <span>Nova {alphaDamage}</span>
                  <span>Chaos {betaDamage}</span>
                </div>
              </div>
              <p className="text-xs text-white/70">
                Team slots · Nova {alphaTeam.length}/{teamCapacity} • Chaos {betaTeam.length}/{teamCapacity}
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                {(['alpha', 'beta'] as RaidTeam[]).map((team) => (
                  <button
                    key={team}
                    type="button"
                    className={`rounded-full border px-3 py-1 font-semibold ${
                      teamPreference === team ? 'border-white bg-white/20' : 'border-white/30 bg-transparent'
                    }`}
                    onClick={() => setTeamPreference(team)}
                  >
                    Prefer {TEAM_STYLES[team].label}
                  </button>
                ))}
              </div>
              <div className="grid w-full gap-2 sm:grid-cols-2">
                <button
                  className="rounded-xl bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-40"
                  onClick={handleJoin}
                  disabled={!unlocked}
                >
                  Join {TEAM_STYLES[teamPreference].label}
                </button>
                <button
                  className="rounded-xl border border-white/30 px-3 py-2 text-sm font-semibold text-white"
                  onClick={handleSpectate}
                >
                  Spectate & Cheer
                </button>
              </div>
              {!unlocked && (
                <p className="text-xs text-amber-200">
                  Unlock raids by acing three Medium+ streak missions at ≥80% accuracy.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {Object.entries(RAID_MODE_DETAILS).map(([modeKey, detail]) => {
          const typedKey = modeKey as RaidMode;
          const active = selectedMode === typedKey;
          return (
            <button
              type="button"
              key={modeKey}
              onClick={() => handleModeSelection(typedKey)}
              className={`rounded-2xl border p-4 text-left shadow-sm transition-all ${
                active
                  ? 'border-indigo-500 bg-indigo-500/10 text-indigo-100'
                  : 'border-slate-800 bg-slate-900/70 text-slate-200'
              }`}
            >
              <p className="text-sm font-semibold uppercase tracking-wide">{detail.label}</p>
              <p className="text-xs text-slate-300">{detail.durationLabel}</p>
              <p className="mt-2 text-sm text-slate-100">{detail.description}</p>
              <p className="mt-2 text-xs text-slate-300">{detail.spectatorLine}</p>
            </button>
          );
        })}
      </div>

      {showHowTo && (
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm text-slate-200">
          <p className="font-semibold text-white">Raid briefing</p>
          <ul className="mt-2 space-y-1">
            <li>1. Earn access: finish three Medium+ missions at ≥80% accuracy with at least one crushed topic.</li>
            <li>2. Launch: pick a mode, hit “Launch Raid,” and your avatar beams into the lobby.</li>
            <li>3. Rally teammates: drag friends into Nova vs. Chaos rosters before the boss wakes up.</li>
            <li>4. Battle: correct answers nuke HP, misses add +5s to the shared timer and spawn banana-peel taunts.</li>
            <li>5. Panic finale: 60-second lightning round decides ties; losers drop coins while slipping dramatically.</li>
          </ul>
        </div>
      )}

      {!unlocked && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-amber-100">
          <p className="font-semibold">Boss Node Locked</p>
          <p className="text-sm">
            {bossUnlock?.reason ||
              'Clear three Medium+ streak missions at ≥80% accuracy and maintain a Crushed topic in-branch to unlock raid access.'}
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">{status.waves.map(renderWaveCard)}</div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
          <p className="text-sm font-semibold text-slate-100">Spectator booth ({spectatorCount})</p>
          <p className="text-xs text-slate-300">
            Spectators float above the arena, hurling cheers that glow around their favorite team.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {decoratedSpectators.length > 0 ? (
              decoratedSpectators.map((spectator) => (
                <span
                  key={spectator.userId}
                  className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs text-white"
                >
                  {spectator.username}
                  {spectator.cheerCount ? `(${spectator.cheerCount})` : null}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-400">Bleachers empty—summon the hype squad.</span>
            )}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              className="rounded-xl border border-white/30 px-3 py-2 text-sm font-semibold text-white"
              onClick={handleSpectate}
            >
              Enter Spectator Mode
            </button>
            <button
              className="rounded-xl bg-cyan-400/20 px-3 py-2 text-sm font-semibold text-cyan-200"
              onClick={() => handleCheer('alpha')}
            >
              Cheer Team Nova
            </button>
            <button
              className="rounded-xl bg-rose-400/20 px-3 py-2 text-sm font-semibold text-rose-200"
              onClick={() => handleCheer('beta')}
            >
              Cheer Team Chaos
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
          <p className="text-sm font-semibold text-slate-100">Live cheer feed</p>
          <div className="mt-3 space-y-2">
            {cheerFeed.length > 0 ? (
              cheerFeed.map((cheer) => (
                <div
                  key={cheer.id}
                  className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-xs text-white"
                >
                  <span>
                    <span className="font-semibold">{cheer.user}</span> {cheer.message}
                  </span>
                  <span className={TEAM_STYLES[cheer.team].cheerColor}>{cheer.emoji}</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400">No cheers yet—spectators can drop emotes to flex.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
          <p className="text-sm font-semibold text-slate-100">Risk & reward</p>
          <ul className="mt-2 space-y-2 text-sm text-slate-200">
            <li>🏆 Winners split {status.rewardPool.coins} coins + {status.rewardPool.xp} XP, with MVP stealing 30% bonus.</li>
            <li>💀 Losers drop half their personal coins and get roasted by banana-peel animations.</li>
            <li>😂 Comedy curveballs flash goofy stickers but still count toward wave damage.</li>
            <li>⏱ Wrong answers add +5s to the team clock—panic phase auto-submits answers.</li>
          </ul>
        </div>
      </div>

      {participant && activeWave && !currentQuestion && (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 text-white">
          <p className="text-sm font-semibold text-slate-300">Wave {activeWave.waveNumber}</p>
          <p className="text-lg font-bold text-white">
            {questionsLoading ? 'Synchronizing live questions…' : 'Questions loading'}
          </p>
          <p className="text-sm text-slate-300">
            {questionsLoading
              ? 'Pulling spike prompts from the MCQ vault.'
              : 'Question feed unavailable. Fallback prompts will appear shortly.'}
          </p>
          {questionLoadError && <p className="mt-2 text-xs text-amber-300">{questionLoadError}</p>}
        </div>
      )}

      {participant && activeWave && currentQuestion && (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 text-white shadow-2xl shadow-indigo-900/30">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Current engagement</p>
              <p className="text-2xl font-bold text-white">Wave {activeWave.waveNumber}</p>
              {currentQuestion.isSpike && (
                <p className="text-xs font-semibold uppercase text-rose-300">Spike question · banana traps active</p>
              )}
            </div>
            <div className="text-right text-sm text-slate-300">
              <p>Total damage</p>
              <p className="text-xl font-black text-white">{participant.damageDealt}</p>
            </div>
          </div>
          <div className="mt-4 space-y-4">
            <p className="text-lg font-semibold text-white">{currentQuestion.prompt}</p>
            <div className="grid gap-3 md:grid-cols-2">
              {currentQuestion.answers.map((answer, idx) => (
                <button
                  key={`${currentQuestion.id}_${idx}`}
                  className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition-all ${
                    selectedOption === idx
                      ? 'border-emerald-300 bg-emerald-400/20 text-white'
                      : 'border-white/10 bg-white/5 text-white hover:border-white/30'
                  }`}
                  onClick={() => handleAnswer(idx)}
                  disabled={answering}
                >
                  {answer}
                </button>
              ))}
            </div>
          </div>
          {answerFeedback && <p className="mt-4 text-sm text-slate-200">{answerFeedback}</p>}
        </div>
      )}
    </div>
  );
};

export default RaidView;
