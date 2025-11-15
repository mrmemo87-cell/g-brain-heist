import React, { useEffect, useMemo, useState } from 'react';
import { Profile } from '../../../types';
import * as GameService from '../../../services/gameService';
import { RaidParticipantState, RaidStatus, RaidWaveState, BossUnlockState } from './raidTypes';

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

const RaidView: React.FC<RaidViewProps> = ({ profile, onComplete, addToast }) => {
  const [status, setStatus] = useState<RaidStatus | null>(null);
  const [participant, setParticipant] = useState<RaidParticipantState | null>(null);
  const [bossUnlock, setBossUnlock] = useState<BossUnlockState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answering, setAnswering] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answerFeedback, setAnswerFeedback] = useState<string | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);

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
      setBossUnlock(unlock);
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
          ? `Damage dealt: ${result.damage}. ${result.waveCleared ? 'Wave cleared!' : ''}`
          : `Wrong answer. +${result.penaltySeconds}s team penalty.`,
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
        <p className="mt-1 text-xs text-slate-500">Spike questions: {wave.spikeQuestions} hard stingers</p>
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
    return (
      <div className="p-6">
        <p className="text-center text-slate-500">No raid scheduled yet. Check back soon.</p>
        <button className="mt-4 rounded-md border border-slate-300 px-4 py-2" onClick={handleLeave}>
          Back
        </button>
      </div>
    );
  }

  const unlocked = bossUnlock?.unlocked ?? false;

  return (
    <div className="space-y-6 bg-slate-50 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Raid Operation</h2>
          <p className="text-sm text-slate-500">Coordinate with your class to defeat the boss.</p>
        </div>
        <button className="rounded-md border border-slate-300 px-3 py-2 text-sm" onClick={handleLeave}>
          Exit
        </button>
      </div>

      {!unlocked && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="font-semibold text-amber-700">Boss node locked</p>
          <p className="text-sm text-amber-700/80">
            {bossUnlock?.reason ||
              'Complete 3 Medium+ missions in a row with ≥80% accuracy and keep at least one crushed topic to unlock raids.'}
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {status.waves.map(renderWaveCard)}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold text-slate-500">Team status</p>
        {status.participants.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No agents have joined yet.</p>
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
          <p className="mt-3 text-sm text-emerald-600">You are enlisted. Keep attacking!</p>
        ) : (
          <button
            className="mt-3 rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-40"
            onClick={handleJoin}
            disabled={!unlocked}
          >
            Join Raid
          </button>
        )}
      </div>

      {participant && activeWave && currentQuestion && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500">Current Wave</p>
              <p className="text-lg font-bold text-slate-900">Wave {activeWave.waveNumber}</p>
            </div>
            <span className="text-sm text-slate-500">Damage dealt: {participant.damageDealt}</span>
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
                    selectedOption === idx ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white'
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
