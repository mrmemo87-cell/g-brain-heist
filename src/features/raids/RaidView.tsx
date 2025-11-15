import React, { useEffect, useMemo, useState } from 'react';
import { Profile } from '../../../types';
import * as GameService from '../../../services/gameService';
import { RaidParticipantState, RaidStatus, RaidWaveState, BossUnlockState } from './raidTypes';
import { getBranchHistories, getTopicSummaries } from '../../../services/adaptiveService';

interface RaidViewProps {
  profile: Profile;
  onComplete: () => void;
  addToast?: (message: string, type?: 'info' | 'success' | 'error') => void;
}

interface RaidQuestion {
  id: string;
  prompt: string;
  answers: string[];
  correctIndex: number;
  difficulty: 'easy' | 'medium' | 'hard';
  baseScore: number;
  isSpike: boolean;
}

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

const generateQuestions = (wave: RaidWaveState): RaidQuestion[] => {
  const spikeIndexes = generateSpikeIndexes(wave);
  return Array.from({ length: 5 }, (_, idx) => {
    const isSpike = spikeIndexes.includes(idx);
    const difficulty = isSpike ? 'hard' : wave.difficulty;
    const baseScore = difficulty === 'easy' ? 60 : difficulty === 'medium' ? 80 : 100;
    return {
      id: `${wave.waveNumber}_${idx}`,
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
  const [showHowTo, setShowHowTo] = useState(false);

  const activeWave = useMemo(() => status?.waves.find((wave) => !wave.completed) ?? null, [status]);
  const waveQuestions = useMemo(() => (activeWave ? generateQuestions(activeWave) : []), [activeWave]);
  const currentQuestion = waveQuestions[questionIndex] ?? null;

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
        const joined = raid.participants.find((p) => p.userId === profile.id) ?? null;
        setParticipant(joined);
      }
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Failed to load raid intel.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleJoin = async () => {
    if (!status || !status.raidId) {
      addToast?.('Raid is not ready yet.', 'error');
      return;
    }
    try {
      const joined = await GameService.joinRaid(status.raidId, profile.username, profile.id);
      setParticipant(joined);
      addToast?.('Joined the raid strike team!', 'success');
    } catch (err) {
      console.error(err);
      addToast?.('Unable to join raid right now.', 'error');
    }
  };

  const handleStudentLaunch = async () => {
    if (launching) return;
    if (!bossUnlock?.unlocked) {
      addToast?.('Meet the unlock requirements before launching a raid.', 'error');
      return;
    }
    setLaunching(true);
    try {
      const scheduled = await GameService.startRaidEncounter('obsidian_sentinel');
      const joined = await GameService.joinRaid(scheduled.raidId, profile.username, profile.id);
      setParticipant(joined);
      setStatus({ ...scheduled, participants: [joined] });
      addToast?.('Raid launched! Rally your team.', 'success');
    } catch (err) {
      console.error(err);
      addToast?.('Unable to launch raid right now.', 'error');
    } finally {
      setLaunching(false);
    }
  };

  const handleAnswer = async (choiceIndex: number) => {
    if (!status || !status.raidId || !activeWave || !participant || !currentQuestion) return;
    if (answering) return;

    setSelectedOption(choiceIndex);
    setAnswering(true);

    try {
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
        answerText: currentQuestion.answers[choiceIndex],
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
      setQuestionIndex((prev) => (prev + 1) % waveQuestions.length);
      setSelectedOption(null);
    } catch (err) {
      console.error(err);
      addToast?.('Answer submission failed.', 'error');
    } finally {
      setAnswering(false);
    }
  };

  const handleLeave = () => {
    onComplete();
  };

  const renderWaveCard = (wave: RaidWaveState) => {
    const progress = Math.round((wave.damageDealt / wave.bossHp) * 100);
    return (
      <div key={wave.waveNumber} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-500">Wave {wave.waveNumber}</p>
            <p className="text-lg font-bold text-slate-900 capitalize">{wave.difficulty}</p>
          </div>
          <span className="text-sm font-semibold text-slate-600">Boss HP: {wave.bossHp}</span>
        </div>
        <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${wave.completed ? 'bg-emerald-500' : 'bg-indigo-500'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 text-sm text-slate-500">{progress}% integrity broken</p>
  <p className="mt-1 text-xs text-slate-500">Spike challenges: {wave.spikeQuestions} elite prompts</p>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-center text-slate-500">Scanning raid network…</p>
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

  return (
    <div className="space-y-6 bg-slate-50 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Raid Command Center</h2>
          <p className="text-sm text-slate-500">Mobilize your crew, outscore the boss, and keep the momentum high.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-full border border-slate-300 px-3 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            onClick={() => setShowHowTo((prev) => !prev)}
            aria-label="How raid battles work"
          >
            ?
          </button>
          <button className="rounded-md border border-slate-300 px-3 py-2 text-sm" onClick={handleLeave}>
            Exit
          </button>
        </div>
      </div>

      {showHowTo && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-700">Raid briefing</p>
          <ul className="mt-2 space-y-1">
            <li>1. Earn access: finish three Medium+ missions at ≥80% accuracy with at least one crushed topic.</li>
            <li>2. Launch: hit “Launch Raid” to spawn the boss arena—your name appears in the strike roster.</li>
            <li>3. Rally teammates: they can jump in via “Join Strike Team” before waves escalate.</li>
            <li>4. Battle: correct answers cut boss HP, misses add a brief time penalty—communicate before locking in.</li>
            <li>5. Debrief: once waves fall, review rewards and MVP highlights in the results panel.</li>
          </ul>
        </div>
      )}

      {!unlocked && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="font-semibold text-amber-700">Boss Node Locked</p>
          <p className="text-sm text-amber-700/80">
            {bossUnlock?.reason ||
              'Clear three Medium+ streak missions at ≥80% accuracy and maintain a Crushed topic in-branch to unlock raid access.'}
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {status.waves.map(renderWaveCard)}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold text-slate-500">Team status</p>
        {status.participants.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Roster is open—claim a slot and set the pace.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {status.participants.map((p) => (
              <li key={p.userId} className="flex items-center justify-between text-sm text-slate-600">
                <span>
                  {p.username}
                  {p.isMvp && <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">MVP</span>}
                </span>
                <span>{p.damageDealt} dmg</span>
              </li>
            ))}
          </ul>
        )}
        {participant ? (
          <p className="mt-3 text-sm text-emerald-600">You’re on the strike team—keep pressure on the boss!</p>
        ) : (
          <button
            className="mt-3 rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-40"
            onClick={handleJoin}
            disabled={!unlocked}
          >
            Join Strike Team
          </button>
        )}
      </div>

      {participant && activeWave && currentQuestion && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500">Current Engagement</p>
              <p className="text-lg font-bold text-slate-900">Wave {activeWave.waveNumber}</p>
            </div>
            <span className="text-sm text-slate-500">Total damage: {participant.damageDealt}</span>
          </div>
          <div className="mt-4">
            <p className="font-semibold text-slate-800">{currentQuestion.prompt}</p>
            {currentQuestion.isSpike && (
              <p className="text-xs font-semibold uppercase text-rose-500">Spike question</p>
            )}
            <div className="mt-3 space-y-2">
              {currentQuestion.answers.map((answer, idx) => (
                <button
                  key={answer}
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    selectedOption === idx
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                  onClick={() => handleAnswer(idx)}
                  disabled={answering}
                >
                  {answer}
                </button>
              ))}
            </div>
          </div>
          {answerFeedback && <p className="mt-3 text-sm text-slate-600">{answerFeedback}</p>}
        </div>
      )}
    </div>
  );
};

export default RaidView;
