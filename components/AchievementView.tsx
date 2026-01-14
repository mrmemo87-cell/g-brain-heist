import React, { useState, useEffect, useMemo } from 'react';
import * as GameService from '../services/gameService';
import BackButton from './BackButton';
import { CompletedAssignment, MyAssignmentAnswer } from '../types';

interface Achievement {
  id: string;
  name: string;
  description: string;
  condition_type: string;
  condition_value: number;
  reward_xp: number;
  reward_coins: number;
  icon: string;
  category?: string;
  rarity?: string;
  is_earned?: boolean;
  earned_at?: string;
  progress?: number;
}

interface AchievementViewProps {
  onComplete: () => void;
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

// Category configuration
const CATEGORIES = {
  progression: { name: 'Progression', icon: '📈', color: 'from-blue-600 to-cyan-500', border: 'border-blue-500' },
  combat: { name: 'Combat', icon: '⚔️', color: 'from-red-600 to-orange-500', border: 'border-red-500' },
  social: { name: 'Social', icon: '👥', color: 'from-purple-600 to-pink-500', border: 'border-purple-500' },
  collection: { name: 'Collection', icon: '💎', color: 'from-yellow-600 to-amber-500', border: 'border-yellow-500' },
  assignments: { name: 'Assignments', icon: '📚', color: 'from-green-600 to-emerald-500', border: 'border-green-500' },
  general: { name: 'General', icon: '🎮', color: 'from-gray-600 to-slate-500', border: 'border-gray-500' },
};

// Rarity configuration
const RARITY_CONFIG = {
  common: { name: 'Common', color: 'text-gray-300', bg: 'bg-gray-700/50', glow: '' },
  rare: { name: 'Rare', color: 'text-blue-400', bg: 'bg-blue-900/30', glow: 'shadow-blue-500/20' },
  epic: { name: 'Epic', color: 'text-purple-400', bg: 'bg-purple-900/30', glow: 'shadow-purple-500/30' },
  legendary: { name: 'Legendary', color: 'text-yellow-400', bg: 'bg-yellow-900/30', glow: 'shadow-yellow-500/40 animate-pulse' },
};

const AchievementView: React.FC<AchievementViewProps> = ({ onComplete, addToast }) => {
  const [loading, setLoading] = useState(true);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [filter, setFilter] = useState<'all' | 'earned' | 'locked'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [completedAssignments, setCompletedAssignments] = useState<CompletedAssignment[]>([]);
  const [showAssignments, setShowAssignments] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<CompletedAssignment | null>(null);
  const [assignmentAnswers, setAssignmentAnswers] = useState<MyAssignmentAnswer[]>([]);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  useEffect(() => {
    fetchAchievements();
    fetchCompletedAssignments();
  }, []);

  const fetchCompletedAssignements = async () => {
    try {
      const data = await GameService.get_student_completed_assignments();
      setCompletedAssignments(data || []);
    } catch (error) {
      console.error('Failed to fetch completed assignments:', error);
      setCompletedAssignments([]);
    }
  };

  const fetchCompletedAssignments = fetchCompletedAssignements;

  const handleViewAnalysis = async (assignment: CompletedAssignment) => {
    setLoadingAnalysis(true);
    setSelectedAssignment(assignment);
    try {
      const answers = await GameService.get_my_assignment_answers(assignment.assignment_id);
      setAssignmentAnswers(answers);
    } catch (error: any) {
      console.error('Failed to load assignment analysis:', error);
      addToast('Failed to load assignment analysis. Please try again.', 'error');
      setAssignmentAnswers([]);
    } finally {
      setLoadingAnalysis(false);
    }
  };

  const fetchAchievements = async () => {
    setLoading(true);
    try {
      const data = await GameService.achievements_list();
      setAchievements(data);

      // Check for newly earned achievements
      const newlyEarned = await GameService.check_achievements();
      if (newlyEarned && newlyEarned.length > 0) {
        newlyEarned.forEach((ach: Achievement) => {
          addToast(`🎉 Achievement Unlocked: ${ach.name}!`, 'success');
        });
        // Refresh achievements after checking
        const refreshed = await GameService.achievements_list();
        setAchievements(refreshed);
      }
    } catch (error: any) {
      console.error('Failed to fetch achievements:', error);
      
      if (error?.message?.includes('does not exist') || error?.code === '42P01') {
        addToast('⚠️ Achievements not set up yet. Please run the SQL migrations.', 'error');
      } else {
        addToast('Failed to load achievements. Please try again.', 'error');
      }
      setAchievements([]);
    } finally {
      setLoading(false);
    }
  };

  // Group achievements by category
  const achievementsByCategory = useMemo(() => {
    const grouped: Record<string, Achievement[]> = {};
    achievements.forEach(ach => {
      const cat = ach.category || 'general';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(ach);
    });
    return grouped;
  }, [achievements]);

  // Get unique categories from achievements
  const availableCategories = useMemo(() => {
    return Object.keys(achievementsByCategory);
  }, [achievementsByCategory]);

  // Filter achievements
  const filteredAchievements = useMemo(() => {
    return achievements.filter(ach => {
      // Status filter
      if (filter === 'earned' && !ach.is_earned) return false;
      if (filter === 'locked' && ach.is_earned) return false;
      // Category filter
      if (categoryFilter !== 'all' && (ach.category || 'general') !== categoryFilter) return false;
      return true;
    });
  }, [achievements, filter, categoryFilter]);

  const earnedCount = achievements.filter(a => a.is_earned).length;
  const totalCount = achievements.length;

  const getRarityConfig = (rarity?: string) => {
    return RARITY_CONFIG[rarity as keyof typeof RARITY_CONFIG] || RARITY_CONFIG.common;
  };

  const getCategoryConfig = (category?: string) => {
    return CATEGORIES[category as keyof typeof CATEGORIES] || CATEGORIES.general;
  };

  const renderAchievementCard = (achievement: Achievement) => {
    const progress = achievement.progress || 0;
    const target = achievement.condition_value || 1;
    const percentage = Math.min((progress / target) * 100, 100);
    const rarityConfig = getRarityConfig(achievement.rarity);
    const categoryConfig = getCategoryConfig(achievement.category);

    return (
      <div
        key={achievement.id}
        className={`relative overflow-hidden rounded-xl transition-all duration-300 transform hover:scale-[1.02] ${
          achievement.is_earned
            ? `${rarityConfig.bg} border-2 ${categoryConfig.border} shadow-lg ${rarityConfig.glow}`
            : 'bg-slate-800/50 border border-slate-700/50 opacity-70'
        }`}
      >
        {/* Rarity ribbon */}
        {achievement.is_earned && achievement.rarity && achievement.rarity !== 'common' && (
          <div className={`absolute top-0 right-0 px-3 py-1 text-xs font-bold ${rarityConfig.color} bg-black/50 rounded-bl-lg`}>
            {rarityConfig.name}
          </div>
        )}

        <div className="p-4">
          <div className="flex items-start gap-4">
            {/* Icon with glow effect */}
            <div className="relative">
              <div
                className={`text-5xl flex-shrink-0 transition-all ${
                  achievement.is_earned 
                    ? 'drop-shadow-lg' 
                    : 'grayscale opacity-50'
                }`}
              >
                {achievement.icon}
              </div>
              {achievement.is_earned && (
                <div className="absolute -bottom-1 -right-1 text-lg bg-green-500 rounded-full w-6 h-6 flex items-center justify-center shadow-lg">
                  ✓
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className={`font-heading text-lg truncate ${
                  achievement.is_earned ? rarityConfig.color : 'text-gray-500'
                }`}>
                  {achievement.name}
                </h3>
              </div>
              <p className="text-sm text-gray-400 mb-3 line-clamp-2">{achievement.description}</p>

              {/* Progress Bar (only for locked achievements) */}
              {!achievement.is_earned && target > 0 && (
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Progress</span>
                    <span>{Math.min(progress, target)}/{target}</span>
                  </div>
                  <div className="h-2 bg-black/50 rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-gradient-to-r ${categoryConfig.color} transition-all duration-500`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Rewards */}
              <div className="flex items-center gap-3 text-sm flex-wrap">
                {(achievement.reward_xp > 0 || achievement.condition_value > 0) && (
                  <span className="flex items-center gap-1 bg-blue-900/30 px-2 py-0.5 rounded text-blue-300">
                    ⭐ {achievement.reward_xp || Math.floor((achievement.condition_value || 1) * 10)} XP
                  </span>
                )}
                {(achievement.reward_coins > 0 || achievement.condition_value > 0) && (
                  <span className="flex items-center gap-1 bg-yellow-900/30 px-2 py-0.5 rounded text-yellow-300">
                    💰 {achievement.reward_coins || Math.floor((achievement.condition_value || 1) * 5)}
                  </span>
                )}
              </div>

              {/* Earned Timestamp */}
              {achievement.is_earned && achievement.earned_at && (
                <p className="text-xs text-gray-500 mt-2">
                  🏆 Earned: {new Date(achievement.earned_at).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <img src="/BRAINS.svg" alt="Loading..." className="w-40 h-40 animate-pulse" style={{ filter: 'drop-shadow(0 0 30px rgba(0, 212, 255, 0.6))' }} />
      </div>
    );
  }

  return (
    <div className="mt-6 max-w-5xl mx-auto px-4">
      <BackButton onClick={onComplete} containerClassName="sticky top-4 z-40 mb-6" />
      
      {/* Header with Stats */}
      <div className="text-center mb-8">
        <h2 className="font-heading text-4xl mb-2" style={{ color: 'var(--amber-warn)' }}>
          🏆 Achievement Hall
        </h2>
        
        {/* Progress Ring */}
        <div className="flex justify-center mb-4">
          <div className="relative w-32 h-32">
            <svg className="w-32 h-32 transform -rotate-90">
              <circle
                cx="64"
                cy="64"
                r="56"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                className="text-slate-700"
              />
              <circle
                cx="64"
                cy="64"
                r="56"
                stroke="url(#gradient)"
                strokeWidth="8"
                fill="none"
                strokeDasharray={`${(earnedCount / Math.max(totalCount, 1)) * 352} 352`}
                strokeLinecap="round"
                className="transition-all duration-1000"
              />
              <defs>
                <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#fbbf24" />
                  <stop offset="100%" stopColor="#f59e0b" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-heading text-yellow-400">{earnedCount}</span>
              <span className="text-sm text-gray-400">of {totalCount}</span>
            </div>
          </div>
        </div>

        {/* Rarity Stats */}
        <div className="flex justify-center gap-4 flex-wrap mb-6">
          {Object.entries(RARITY_CONFIG).map(([key, config]) => {
            const count = achievements.filter(a => a.is_earned && (a.rarity || 'common') === key).length;
            if (count === 0 && key !== 'common') return null;
            return (
              <div key={key} className={`px-3 py-1 rounded-full ${config.bg} ${config.color} text-sm`}>
                {config.name}: {count}
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 mb-4 justify-center">
        <button
          onClick={() => setFilter('all')}
          className={`px-5 py-2 rounded-lg font-heading transition-all ${
            filter === 'all'
              ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg shadow-cyan-500/30'
              : 'bg-slate-800/50 text-gray-400 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          All ({totalCount})
        </button>
        <button
          onClick={() => setFilter('earned')}
          className={`px-5 py-2 rounded-lg font-heading transition-all ${
            filter === 'earned'
              ? 'bg-gradient-to-r from-yellow-600 to-amber-600 text-white shadow-lg shadow-amber-500/30'
              : 'bg-slate-800/50 text-gray-400 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          ✓ Earned ({earnedCount})
        </button>
        <button
          onClick={() => setFilter('locked')}
          className={`px-5 py-2 rounded-lg font-heading transition-all ${
            filter === 'locked'
              ? 'bg-gradient-to-r from-gray-600 to-slate-600 text-white shadow-lg'
              : 'bg-slate-800/50 text-gray-400 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          🔒 Locked ({totalCount - earnedCount})
        </button>
      </div>

      {/* Category Filters */}
      <div className="flex flex-wrap gap-2 mb-6 justify-center">
        <button
          onClick={() => setCategoryFilter('all')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
            categoryFilter === 'all'
              ? 'bg-white/20 text-white border border-white/30'
              : 'bg-slate-800/30 text-gray-500 hover:text-gray-300'
          }`}
        >
          All Categories
        </button>
        {availableCategories.map(cat => {
          const config = getCategoryConfig(cat);
          const count = achievements.filter(a => (a.category || 'general') === cat).length;
          return (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 ${
                categoryFilter === cat
                  ? `bg-gradient-to-r ${config.color} text-white shadow-lg`
                  : 'bg-slate-800/30 text-gray-500 hover:text-gray-300'
              }`}
            >
              {config.icon} {config.name} ({count})
            </button>
          );
        })}
      </div>

      {/* Achievement Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {filteredAchievements.map(renderAchievementCard)}
      </div>

      {filteredAchievements.length === 0 && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4 opacity-50">🔍</div>
          <p className="text-gray-400 text-lg">No achievements found in this category</p>
          <button
            onClick={() => { setFilter('all'); setCategoryFilter('all'); }}
            className="mt-4 text-cyan-400 hover:text-cyan-300 underline"
          >
            Show all achievements
          </button>
        </div>
      )}

      {/* Completed Assignments Section */}
      {completedAssignments.length > 0 && (
        <div className="mt-10 mb-8">
          <button
            onClick={() => setShowAssignments(!showAssignments)}
            className="w-full rounded-xl bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-500/30 p-4 flex items-center justify-between hover:from-green-900/50 hover:to-emerald-900/50 transition-all"
          >
            <div className="flex items-center gap-3">
              <span className="text-4xl">📚</span>
              <div className="text-left">
                <h3 className="font-heading text-xl text-green-400">Completed Assignments</h3>
                <p className="text-sm text-gray-400">{completedAssignments.length} assignments finished</p>
              </div>
            </div>
            <span className={`text-2xl text-green-400 transition-transform duration-300 ${showAssignments ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>

          {showAssignments && (
            <div className="mt-4 space-y-3">
              {completedAssignments.map((assignment) => {
                const scorePercent = assignment.total_questions > 0 
                  ? Math.round((assignment.score / assignment.total_questions) * 100) 
                  : 0;
                const isExcellent = scorePercent >= 90;
                const isGood = scorePercent >= 70 && scorePercent < 90;

                return (
                  <div
                    key={assignment.id}
                    className={`rounded-xl p-4 border-l-4 bg-slate-800/50 transition-all hover:bg-slate-800/70 ${
                      isExcellent ? 'border-l-yellow-400' : isGood ? 'border-l-green-500' : 'border-l-blue-500'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-heading text-lg text-white">{assignment.title || assignment.subject_name}</h4>
                        <p className="text-sm text-gray-400">
                          Assigned by {assignment.teacher_name || 'Teacher'}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className={`text-3xl font-heading ${
                          isExcellent ? 'text-yellow-400' : isGood ? 'text-green-400' : 'text-blue-400'
                        }`}>
                          {scorePercent}%
                        </div>
                        <div className="text-sm text-gray-400">
                          {assignment.correct}/{assignment.total_questions}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="text-xs text-gray-500">
                        {isExcellent ? '🌟 Excellent!' : isGood ? '✅ Good job!' : '📖 Keep practicing!'}
                        <span className="ml-2">
                          Completed: {new Date(assignment.completed_at).toLocaleDateString()}
                        </span>
                      </div>
                      <button
                        onClick={() => handleViewAnalysis(assignment)}
                        className="px-4 py-1.5 text-sm rounded-lg bg-cyan-600/30 text-cyan-300 hover:bg-cyan-600/50 transition-all flex items-center gap-1"
                      >
                        📊 View Analysis
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Assignment Stats Summary */}
              <div className="rounded-xl p-5 bg-gradient-to-r from-purple-900/30 to-blue-900/30 border border-purple-500/20 mt-4">
                <h4 className="font-heading text-lg text-purple-400 mb-4">📊 Assignment Statistics</h4>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="bg-black/20 rounded-lg p-3">
                    <div className="text-3xl font-heading text-white">{completedAssignments.length}</div>
                    <div className="text-xs text-gray-400">Total Completed</div>
                  </div>
                  <div className="bg-black/20 rounded-lg p-3">
                    <div className="text-3xl font-heading text-yellow-400">
                      {completedAssignments.filter(a => (a.correct / a.total_questions) >= 0.9).length}
                    </div>
                    <div className="text-xs text-gray-400">90%+ Scores</div>
                  </div>
                  <div className="bg-black/20 rounded-lg p-3">
                    <div className="text-3xl font-heading text-green-400">
                      {completedAssignments.length > 0 
                        ? Math.round(completedAssignments.reduce((sum, a) => sum + (a.correct / a.total_questions) * 100, 0) / completedAssignments.length)
                        : 0}%
                    </div>
                    <div className="text-xs text-gray-400">Avg Score</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Assignment Analysis Modal */}
      {selectedAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-auto rounded-2xl bg-gradient-to-b from-slate-900 to-slate-800 p-6 shadow-2xl border border-cyan-500/30">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-heading text-2xl text-cyan-400">
                  📊 Assignment Analysis
                </h3>
                <p className="text-gray-400 text-sm">
                  {selectedAssignment.title || selectedAssignment.subject_name} • {selectedAssignment.topic_name}
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedAssignment(null);
                  setAssignmentAnswers([]);
                }}
                className="text-gray-400 hover:text-white text-2xl transition-colors"
              >
                ✕
              </button>
            </div>

            {loadingAnalysis ? (
              <div className="text-center py-10">
                <div className="text-5xl mb-4 animate-spin">⚙️</div>
                <p className="text-gray-400">Loading your answers...</p>
              </div>
            ) : assignmentAnswers.length === 0 ? (
              <div className="text-center py-10">
                <div className="text-5xl mb-4">📝</div>
                <p className="text-gray-400">No detailed answer data available.</p>
                <p className="text-sm text-gray-500 mt-2">
                  Answer tracking was added recently. Your future assignments will show detailed analysis.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Summary Stats */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="rounded-xl p-4 text-center bg-green-900/20 border border-green-500/30">
                    <div className="text-3xl font-heading text-green-400">
                      {assignmentAnswers.filter(a => a.is_correct).length}
                    </div>
                    <div className="text-xs text-gray-400">Correct</div>
                  </div>
                  <div className="rounded-xl p-4 text-center bg-red-900/20 border border-red-500/30">
                    <div className="text-3xl font-heading text-red-400">
                      {assignmentAnswers.filter(a => !a.is_correct).length}
                    </div>
                    <div className="text-xs text-gray-400">Incorrect</div>
                  </div>
                  <div className="rounded-xl p-4 text-center bg-blue-900/20 border border-blue-500/30">
                    <div className="text-3xl font-heading text-blue-400">
                      {Math.round(assignmentAnswers.filter(a => a.is_correct).length / assignmentAnswers.length * 100)}%
                    </div>
                    <div className="text-xs text-gray-400">Accuracy</div>
                  </div>
                </div>

                {/* Question-by-Question Review */}
                <h4 className="font-heading text-lg text-white mb-3">Question Review</h4>
                {assignmentAnswers.map((answer, index) => (
                  <div
                    key={answer.question_id}
                    className={`rounded-xl p-4 border-l-4 bg-slate-800/50 ${
                      answer.is_correct ? 'border-l-green-500' : 'border-l-red-500'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`text-2xl ${answer.is_correct ? 'text-green-400' : 'text-red-400'}`}>
                        {answer.is_correct ? '✓' : '✗'}
                      </div>
                      <div className="flex-1">
                        <p className="text-white font-medium mb-2">
                          Q{index + 1}: {answer.question_text}
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                          <div className={`p-2 rounded-lg ${answer.is_correct ? 'bg-green-900/30' : 'bg-red-900/30'}`}>
                            <span className="text-gray-400">Your answer:</span>{' '}
                            <span className={answer.is_correct ? 'text-green-300' : 'text-red-300'}>
                              {answer.student_answer}
                            </span>
                          </div>
                          {!answer.is_correct && (
                            <div className="p-2 rounded-lg bg-green-900/30">
                              <span className="text-gray-400">Correct answer:</span>{' '}
                              <span className="text-green-300">{answer.correct_answer}</span>
                            </div>
                          )}
                        </div>
                        {answer.explanation && !answer.is_correct && (
                          <div className="mt-2 p-3 rounded-lg bg-blue-900/20 border border-blue-500/20">
                            <span className="text-blue-300 text-sm">💡 {answer.explanation}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  setSelectedAssignment(null);
                  setAssignmentAnswers([]);
                }}
                className="px-8 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-heading hover:scale-105 transition-all shadow-lg shadow-cyan-500/30"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AchievementView;
