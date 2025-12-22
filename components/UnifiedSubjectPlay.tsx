import React, { useState, useEffect } from 'react';
import { SubjectProgress, QuestProgress, SoloDifficulty } from '../types';
import { XPIcon, CoinIcon } from './icons';
import { getRewardPreview } from '../src/utils/difficultyHelpers';

interface QuestCardProps {
  quest: QuestProgress;
  onStart: () => void;
}

const QuestCard: React.FC<QuestCardProps> = ({ quest, onStart }) => {
  const newQuestionsLeft = Math.max(0, quest.totalQuestions - quest.rewardedQuestions);
  const hasNewQuestions = newQuestionsLeft > 0;
  const buttonText = hasNewQuestions ? 'Start quest (earn XP)' : 'Practice quest (no rewards)';
  const progressPercent = quest.totalQuestions > 0
    ? Math.min(100, (quest.rewardedQuestions / quest.totalQuestions) * 100)
    : 0;

  return (
    <button
      onClick={onStart}
      className={`relative p-6 rounded-2xl border-2 transition-all duration-300 bg-gradient-to-br ${
        hasNewQuestions
          ? 'from-purple-500/20 to-pink-500/10 border-purple-400/60 hover:border-purple-400 hover:shadow-purple-500/30 hover:scale-105'
          : 'from-slate-800/40 to-slate-700/20 border-slate-600/60 hover:border-slate-500'
      } shadow-lg hover:shadow-xl`}
    >
      {/* Top Pill Badge */}
      <div className="absolute -top-3 -right-3 px-3 py-1 rounded-full text-white text-xs font-bold shadow-lg border">
        {hasNewQuestions ? (
          <div className="bg-green-500/90 border-green-400">💰 Earn XP & coins</div>
        ) : (
          <div className="bg-amber-600/90 border-amber-400">🔄 Practice Only</div>
        )}
      </div>

      <div className="text-left mb-4">
        <h4 className="text-xl font-bold text-white mb-1">{quest.title}</h4>
        {quest.description && (
          <p className="text-sm text-gray-400">{quest.description}</p>
        )}
      </div>

      {/* Progress Status */}
      <div className="mb-4">
        {hasNewQuestions ? (
          <>
            <p className="text-lg font-bold text-purple-300 mb-2">
              New questions with rewards: {newQuestionsLeft}
            </p>
            <div className="flex justify-between text-sm text-gray-400 mb-2">
              <span>Rewarded questions:</span>
              <span className="font-medium">{quest.rewardedQuestions} / {quest.totalQuestions}</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="h-full transition-all duration-500 bg-gradient-to-r from-purple-500 to-pink-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </>
        ) : (
          <>
            <p className="text-lg font-bold text-gray-300 mb-2">
              All {quest.totalQuestions} questions completed for rewards ✅
            </p>
            <div className="flex justify-between text-sm text-gray-400 mb-2">
              <span>Rewarded questions:</span>
              <span className="font-medium">{quest.rewardedQuestions} / {quest.totalQuestions}</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="h-full transition-all duration-500 bg-gradient-to-r from-purple-500 to-pink-500"
                style={{ width: '100%' }}
              />
            </div>
          </>
        )}
      </div>

      {/* Button Text */}
      <div className={`text-center font-bold text-sm ${
        hasNewQuestions ? 'text-purple-300' : 'text-gray-400'
      }`}>
        {buttonText}
      </div>

      {/* Hint for completed quest */}
      {!hasNewQuestions && (
        <p className="text-xs text-gray-500 text-center mt-2">
          For new XP, try another subject or difficulty.
        </p>
      )}
    </button>
  );
};

interface DifficultyCardProps {
  level: SoloDifficulty;
  progress: {
    totalQuestions: number;
    rewardedQuestions: number;
  };
  isRecommended: boolean;
  onStart: () => void;
}

const DifficultyCard: React.FC<DifficultyCardProps> = ({
  level,
  progress,
  isRecommended,
  onStart,
}) => {
  const reward = getRewardPreview(level);
  const newQuestionsLeft = Math.max(0, progress.totalQuestions - progress.rewardedQuestions);
  const hasNewQuestions = newQuestionsLeft > 0;
  const buttonText = hasNewQuestions ? 'Start (earn XP)' : 'Practice (no rewards)';
  const progressPercent = progress.totalQuestions > 0
    ? Math.min(100, (progress.rewardedQuestions / progress.totalQuestions) * 100)
    : 0;

  const colorClasses = {
    easy: 'from-green-500/20 to-emerald-500/10 border-green-400/60 hover:border-green-400 hover:shadow-green-500/30',
    medium: 'from-amber-500/20 to-yellow-500/10 border-amber-400/60 hover:border-amber-400 hover:shadow-amber-500/30',
    hard: 'from-rose-500/20 to-red-500/10 border-rose-400/60 hover:border-rose-400 hover:shadow-rose-500/30'
  };

  const textColors = {
    easy: 'text-green-300',
    medium: 'text-amber-300',
    hard: 'text-rose-300'
  };

  const progressBarColors = {
    easy: 'bg-green-500',
    medium: 'bg-amber-500',
    hard: 'bg-rose-500'
  };

  const starIcons = {
    easy: '⭐',
    medium: '⭐⭐',
    hard: '⭐⭐⭐'
  };

  return (
    <button
      onClick={onStart}
      className={`relative p-6 rounded-2xl border-2 transition-all duration-300 bg-gradient-to-br ${colorClasses[level]} shadow-lg hover:scale-105 hover:shadow-xl`}
    >
      {/* Recommended Badge */}
      {isRecommended && hasNewQuestions && (
        <div className="absolute -top-3 -right-3 px-3 py-1 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full text-white text-xs font-bold shadow-lg animate-pulse">
          ✨ Recommended
        </div>
      )}

      {/* Practice Only Badge */}
      {!hasNewQuestions && (
        <div className="absolute -top-3 -right-3 px-3 py-1 bg-amber-600/90 rounded-full text-white text-xs font-bold border border-amber-400 shadow-lg">
          🔄 Practice Only
        </div>
      )}

      <div className="flex items-start justify-between mb-4">
        <div className="text-left flex-1">
          <h3 className={`text-2xl font-bold ${textColors[level]} mb-1`}>
            {level.charAt(0).toUpperCase() + level.slice(1)}
          </h3>
          <p className="text-sm text-gray-400">{starIcons[level]}</p>
        </div>
      </div>

      {/* Questions Status */}
      <div className="mb-4">
        {hasNewQuestions ? (
          <>
            <p className={`text-lg font-bold ${textColors[level]} mb-2`}>
              New questions with rewards: {newQuestionsLeft}
            </p>
            <div className="flex justify-between text-sm text-gray-400 mb-2">
              <span>Rewarded questions:</span>
              <span className="font-medium">{progress.rewardedQuestions} / {progress.totalQuestions}</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${progressBarColors[level]}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </>
        ) : (
          <>
            <p className="text-lg font-bold text-gray-300 mb-2">
              All {progress.totalQuestions} questions completed for rewards ✅
            </p>
            <div className="flex justify-between text-sm text-gray-400 mb-2">
              <span>Rewarded questions:</span>
              <span className="font-medium">{progress.rewardedQuestions} / {progress.totalQuestions}</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${progressBarColors[level]}`}
                style={{ width: '100%' }}
              />
            </div>
          </>
        )}
      </div>

      {/* Top Pill Badge */}
      <div className="flex items-center justify-center mb-3">
        {hasNewQuestions ? (
          <div className="px-3 py-1.5 bg-green-500/20 border border-green-400/50 rounded-full text-green-300 text-xs font-bold">
            💰 Earn XP & coins
          </div>
        ) : (
          <div className="px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded-full text-slate-400 text-xs font-semibold">
            🔄 Practice Only
          </div>
        )}
      </div>

      {/* Reward Preview (only for new questions) */}
      {hasNewQuestions && (
        <div className="flex items-center justify-center gap-4 text-sm text-gray-400 mb-3">
          <div className="flex items-center gap-1">
            <XPIcon className="w-4 h-4 text-cyan-400" />
            <span>~{reward.xp}</span>
          </div>
          <div className="flex items-center gap-1">
            <CoinIcon className="w-4 h-4 text-amber-400" />
            <span>~{reward.coins}</span>
          </div>
        </div>
      )}

      {/* Button Text */}
      <div className={`text-center font-bold text-sm mb-2 ${
        hasNewQuestions ? textColors[level] : 'text-gray-400'
      }`}>
        {buttonText}
      </div>

      {/* Hint for completed difficulty */}
      {!hasNewQuestions && (
        <p className="text-xs text-gray-500 text-center">
          For new XP, try another subject or difficulty.
        </p>
      )}
    </button>
  );
};

interface UnifiedSubjectPlayProps {
  subject: SubjectProgress;
  teacherQuests: QuestProgress[];
  onSelectDifficulty: (difficulty: SoloDifficulty) => void;
  onSelectQuest: (questId: string) => void;
  onBack: () => void;
}

const UnifiedSubjectPlay: React.FC<UnifiedSubjectPlayProps> = ({
  subject,
  teacherQuests,
  onSelectDifficulty,
  onSelectQuest,
  onBack
}) => {
  // Determine recommended difficulty
  const easyLeft = Math.max(0, subject.easy.total - subject.easy.answeredWithRewards);
  const mediumLeft = Math.max(0, subject.medium.total - subject.medium.answeredWithRewards);
  const hardLeft = Math.max(0, subject.hard.total - subject.hard.answeredWithRewards);
  
  const recommended: SoloDifficulty | 'done' = easyLeft > 0 ? 'easy'
    : mediumLeft > 0 ? 'medium'
    : hardLeft > 0 ? 'hard'
    : 'done';

  // Convert DifficultyProgress to QuestionProgress format
  const easyProgress = {
    totalQuestions: subject.easy.total,
    rewardedQuestions: subject.easy.answeredWithRewards
  };
  const mediumProgress = {
    totalQuestions: subject.medium.total,
    rewardedQuestions: subject.medium.answeredWithRewards
  };
  const hardProgress = {
    totalQuestions: subject.hard.total,
    rewardedQuestions: subject.hard.answeredWithRewards
  };

  return (
    <div className="max-w-6xl mx-auto animate-fade-in-up">
      <button
        onClick={onBack}
        className="mb-6 px-4 py-2 rounded-lg bg-slate-800/50 border border-slate-700 text-gray-300 hover:bg-slate-700/50 hover:border-slate-600 transition-all"
      >
        ← Back to Subjects
      </button>

      <h2 className="font-heading text-4xl text-center mb-3 animate-fade-in-up" style={{ color: 'var(--ion-blue)' }}>
        {subject.name}
      </h2>

      {/* Teacher Quests Section */}
      {teacherQuests.length > 0 && (
        <div className="mb-12">
          <h3 className="font-heading text-2xl mb-6 text-purple-300 flex items-center gap-2">
            <span>📚</span> Teacher Quests
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teacherQuests.map(quest => (
              <QuestCard
                key={quest.questId}
                quest={quest}
                onStart={() => onSelectQuest(quest.questId)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Free Practice Section */}
      <div>
        <h3 className="font-heading text-2xl mb-6 text-cyan-300 flex items-center gap-2">
          <span>🎮</span> Free practice
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <DifficultyCard
            level="easy"
            progress={easyProgress}
            isRecommended={recommended === 'easy'}
            onStart={() => onSelectDifficulty('easy')}
          />
          <DifficultyCard
            level="medium"
            progress={mediumProgress}
            isRecommended={recommended === 'medium'}
            onStart={() => onSelectDifficulty('medium')}
          />
          <DifficultyCard
            level="hard"
            progress={hardProgress}
            isRecommended={recommended === 'hard'}
            onStart={() => onSelectDifficulty('hard')}
          />
        </div>
      </div>
    </div>
  );
};

export default UnifiedSubjectPlay;
