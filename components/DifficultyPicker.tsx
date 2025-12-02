import React from 'react';
import { SoloDifficulty, DifficultyProgress, SubjectProgress } from '../types';
import { XPIcon, CoinIcon } from './icons';
import { getRewardPreview, hasMinimumWarmup } from '../src/utils/difficultyHelpers';

interface DifficultyCardProps {
  level: SoloDifficulty;
  progress: DifficultyProgress;
  isRecommended: boolean;
  onStart: () => void;
  disabled?: boolean;
  subject: SubjectProgress;
}

const DifficultyCard: React.FC<DifficultyCardProps> = ({
  level,
  progress,
  isRecommended,
  onStart,
  disabled,
  subject
}) => {
  const reward = getRewardPreview(level);
  const hasNewQuestions = progress.newLeft > 0;
  const isPracticeOnly = !hasNewQuestions;
  const actuallyDisabled = disabled;
  
  // Soft guardrail for Hard difficulty
  const needsWarmup = level === 'hard' && !hasMinimumWarmup(subject);
  
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
  
  const starIcons = {
    easy: '⭐',
    medium: '⭐⭐',
    hard: '⭐⭐⭐'
  };

  return (
    <button
      onClick={onStart}
      disabled={actuallyDisabled}
      className={`relative p-6 rounded-2xl border-2 transition-all duration-300 ${
        actuallyDisabled
          ? 'opacity-50 cursor-not-allowed bg-slate-800/40 border-slate-700'
          : `bg-gradient-to-br ${colorClasses[level]} shadow-lg hover:scale-105 hover:shadow-xl`
      }`}
    >
      {/* Recommended Badge */}
      {isRecommended && hasNewQuestions && !actuallyDisabled && (
        <div className="absolute -top-3 -right-3 px-3 py-1 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full text-white text-xs font-bold shadow-lg animate-pulse">
          ✨ Recommended
        </div>
      )}
      
      {/* Practice Only Badge */}
      {isPracticeOnly && (
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

      {/* New Questions Status */}
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-gray-300">New questions left</span>
          <span className={`font-bold ${hasNewQuestions ? textColors[level] : 'text-gray-500'}`}>
            {progress.newLeft}
          </span>
        </div>
        <div className="flex justify-between text-xs text-gray-400 mb-2">
          <span>Already rewarded</span>
          <span>{progress.answeredWithRewards} / {progress.total}</span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              level === 'easy' ? 'bg-green-500' : level === 'medium' ? 'bg-amber-500' : 'bg-rose-500'
            }`}
            style={{ width: `${Math.min(100, (progress.answeredWithRewards / progress.total) * 100)}%` }}
      {/* Rewards or Practice Badge */}
      {hasNewQuestions ? (
        <div className="flex items-center justify-center gap-4 mb-3">
          <div className="px-3 py-1.5 bg-green-500/20 border border-green-400/50 rounded-full text-green-300 text-xs font-bold">
            💰 Earn XP & coins
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center mb-3">
          <div className="px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded-full text-slate-400 text-xs font-semibold">
            🔄 Practice only (no rewards)
          </div>
        </div>
      )}
      
      {/* Reward Preview */}
      {hasNewQuestions && (
        <div className="flex items-center justify-center gap-4 text-sm text-gray-400">
          <div className="flex items-center gap-1">
            <XPIcon className="w-4 h-4 text-cyan-400" />
            <span>~{reward.xp}</span>
          </div>
          <div className="flex items-center gap-1">
            <CoinIcon className="w-4 h-4 text-amber-400" />
            <span>~{reward.coins}</span>
          </div>
        </div>
      )} className="flex items-center gap-1">
          <CoinIcon className="w-5 h-5 text-amber-400" />
          <span className="text-amber-300 font-bold">+{reward.coins}</span>
        </div>
      </div>

      {/* Warm-up Warning for Hard */}
      {needsWarmup && !actuallyDisabled && (
        <div className="mt-3 p-2 bg-amber-500/10 border border-amber-400/30 rounded-lg text-xs text-amber-200">
          <span className="mr-1">👀</span>
          You'll learn faster if you warm up with a few Easy questions first
        </div>
      )}
    </button>
  );
};

interface DifficultyPickerProps {
  subject: SubjectProgress;
  onSelectDifficulty: (difficulty: SoloDifficulty) => void;
  onBack: () => void;
}

const DifficultyPicker: React.FC<DifficultyPickerProps> = ({
  subject,
  onSelectDifficulty,
  onBack
}) => {
  const recommended = subject.easy.completed < subject.easy.total ? 'easy'
    : subject.medium.completed < subject.medium.total ? 'medium'
    : subject.hard.completed < subject.hard.total ? 'hard'
    : 'done';

  return (
    <div className="max-w-5xl mx-auto animate-fade-in-up">
      <button
        onClick={onBack}
        className="mb-6 px-4 py-2 rounded-lg bg-slate-800/50 border border-slate-700 text-gray-300 hover:bg-slate-700/50 hover:border-slate-600 transition-all"
      >
        ← Back to Subjects
      </button>

      <h2 className="font-heading text-4xl text-center mb-3 animate-fade-in-up" style={{ color: 'var(--ion-blue)' }}>
        {subject.name}
      </h2>
      <p className="text-center text-gray-300 text-lg mb-8">Choose your difficulty level</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <DifficultyCard
          level="easy"
          progress={subject.easy}
          isRecommended={recommended === 'easy'}
          onStart={() => onSelectDifficulty('easy')}
          subject={subject}
        />
        <DifficultyCard
          level="medium"
          progress={subject.medium}
          isRecommended={recommended === 'medium'}
          onStart={() => onSelectDifficulty('medium')}
          subject={subject}
        />
        <DifficultyCard
          level="hard"
          progress={subject.hard}
          isRecommended={recommended === 'hard'}
          onStart={() => onSelectDifficulty('hard')}
          subject={subject}
        />
      </div>
    </div>
  );
};

export default DifficultyPicker;
