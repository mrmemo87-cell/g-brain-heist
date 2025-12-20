import React, { useState, useEffect } from 'react';
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
  is_earned?: boolean;
  earned_at?: string;
  progress?: number;
}

interface AchievementViewProps {
  onComplete: () => void;
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const AchievementView: React.FC<AchievementViewProps> = ({ onComplete, addToast }) => {
  const [loading, setLoading] = useState(true);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [filter, setFilter] = useState<'all' | 'earned' | 'locked'>('all');
  const [completedAssignments, setCompletedAssignments] = useState<CompletedAssignment[]>([]);
  const [showAssignments, setShowAssignments] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<CompletedAssignment | null>(null);
  const [assignmentAnswers, setAssignmentAnswers] = useState<MyAssignmentAnswer[]>([]);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  useEffect(() => {
    fetchAchievements();
    fetchCompletedAssignments();
  }, []);

  const fetchCompletedAssignments = async () => {
    try {
      const data = await GameService.get_student_completed_assignments();
      setCompletedAssignments(data || []);
    } catch (error) {
      console.error('Failed to fetch completed assignments:', error);
      setCompletedAssignments([]);
    }
  };

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
      
      // Check if it's a missing table error
      if (error?.message?.includes('does not exist') || error?.code === '42P01') {
        addToast('⚠️ Achievements not set up yet. Please run the SQL migrations.', 'error');
      } else {
        addToast('Failed to load achievements. Please try again.', 'error');
      }
      setAchievements([]); // Set empty array to prevent crashes
    } finally {
      setLoading(false);
    }
  };

  const filteredAchievements = achievements.filter(ach => {
    if (filter === 'earned') return ach.is_earned;
    if (filter === 'locked') return !ach.is_earned;
    return true;
  });

  const earnedCount = achievements.filter(a => a.is_earned).length;
  const totalCount = achievements.length;

  const renderAchievementCard = (achievement: Achievement) => {
    const progress = achievement.progress || 0;
    const target = achievement.condition_value;
    const percentage = Math.min((progress / target) * 100, 100);

    return (
      <div
        key={achievement.id}
        className={`card-glass p-4 transition-all ${
          achievement.is_earned
            ? 'border-2 border-yellow-400 shadow-lg shadow-yellow-400/20'
            : 'border border-gray-700 opacity-75'
        }`}
      >
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div
            className={`text-5xl flex-shrink-0 ${
              achievement.is_earned ? 'animate-pulse' : 'grayscale'
            }`}
          >
            {achievement.icon}
          </div>

          {/* Content */}
          <div className="flex-1">
            <h3 className={`font-heading text-xl mb-1 ${achievement.is_earned ? 'text-yellow-400' : 'text-gray-400'}`}>
              {achievement.name}
            </h3>
            <p className="text-sm text-gray-400 mb-3">{achievement.description}</p>

            {/* Progress Bar (only for locked achievements) */}
            {!achievement.is_earned && (
              <div className="mb-2">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Progress</span>
                  <span>{progress}/{target}</span>
                </div>
                <div className="h-2 bg-black/50 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            )}

            {/* Rewards */}
            <div className="flex gap-3 text-sm">
              {achievement.reward_xp > 0 && (
                <span className="text-blue-400">
                  ⭐ {achievement.reward_xp} XP
                </span>
              )}
              {achievement.reward_coins > 0 && (
                <span className="text-yellow-400">
                  💰 {achievement.reward_coins} Coins
                </span>
              )}
            </div>

            {/* Earned Timestamp */}
            {achievement.is_earned && achievement.earned_at && (
              <p className="text-xs text-gray-500 mt-2">
                Earned: {new Date(achievement.earned_at).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="font-heading text-2xl animate-pulse text-center mt-20" style={{ color: 'var(--amber-warn)' }}>
        Loading Achievements...
      </div>
    );
  }

  return (
    <div className="mt-6 max-w-4xl mx-auto">
      <BackButton onClick={onComplete} />
      <h2 className="font-heading text-3xl text-center mb-2" style={{ color: 'var(--amber-warn)' }}>
        🏆 Achievements
      </h2>
      <p className="text-center text-gray-400 mb-6">
        {earnedCount} of {totalCount} unlocked
      </p>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6 justify-center">
        <button
          onClick={() => setFilter('all')}
          className={`px-6 py-2 rounded-lg font-heading transition-all ${
            filter === 'all'
              ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white'
              : 'bg-black/20 text-gray-400 hover:text-white'
          }`}
        >
          All ({totalCount})
        </button>
        <button
          onClick={() => setFilter('earned')}
          className={`px-6 py-2 rounded-lg font-heading transition-all ${
            filter === 'earned'
              ? 'bg-gradient-to-r from-yellow-600 to-amber-600 text-white'
              : 'bg-black/20 text-gray-400 hover:text-white'
          }`}
        >
          Earned ({earnedCount})
        </button>
        <button
          onClick={() => setFilter('locked')}
          className={`px-6 py-2 rounded-lg font-heading transition-all ${
            filter === 'locked'
              ? 'bg-gradient-to-r from-gray-600 to-gray-700 text-white'
              : 'bg-black/20 text-gray-400 hover:text-white'
          }`}
        >
          Locked ({totalCount - earnedCount})
        </button>
      </div>

      {/* Achievement Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredAchievements.map(renderAchievementCard)}
      </div>

      {filteredAchievements.length === 0 && (
        <p className="text-center text-gray-400 mt-10">No achievements in this category</p>
      )}

      {/* Completed Assignments Section */}
      {completedAssignments.length > 0 && (
        <div className="mt-10">
          <button
            onClick={() => setShowAssignments(!showAssignments)}
            className="w-full card-glass p-4 flex items-center justify-between hover:bg-white/5 transition-all"
          >
            <div className="flex items-center gap-3">
              <span className="text-3xl">📚</span>
              <div className="text-left">
                <h3 className="font-heading text-xl text-cyan-400">Completed Assignments</h3>
                <p className="text-sm text-gray-400">{completedAssignments.length} assignments finished</p>
              </div>
            </div>
            <span className="text-2xl text-gray-400 transition-transform" style={{ transform: showAssignments ? 'rotate(180deg)' : 'rotate(0deg)' }}>
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
                    className={`card-glass p-4 border-l-4 ${
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
                        <div className={`text-2xl font-heading ${
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
                        className="px-3 py-1 text-xs rounded-lg bg-cyan-600/30 text-cyan-300 hover:bg-cyan-600/50 transition-all"
                      >
                        📊 View Analysis
                      </button>
                    </div>
                  </div>
                );
              })}
                      <span>
                        Completed: {new Date(assignment.completed_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Assignment Stats Summary */}
              <div className="card-glass p-4 bg-gradient-to-r from-purple-900/30 to-blue-900/30 mt-4">
                <h4 className="font-heading text-lg text-purple-400 mb-3">📊 Assignment Stats</h4>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-heading text-white">{completedAssignments.length}</div>
                    <div className="text-xs text-gray-400">Total Completed</div>
                  </div>
                  <div>
                    <div className="text-2xl font-heading text-yellow-400">
                      {completedAssignments.filter(a => (a.correct / a.total_questions) >= 0.9).length}
                    </div>
                    <div className="text-xs text-gray-400">Perfect Scores</div>
                  </div>
                  <div>
                    <div className="text-2xl font-heading text-green-400">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-auto rounded-2xl bg-slate-900 p-6 shadow-2xl border border-cyan-500/30">
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
                className="text-gray-400 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>

            {loadingAnalysis ? (
              <div className="text-center py-10">
                <div className="text-4xl mb-4 animate-spin">⚙️</div>
                <p className="text-gray-400">Loading your answers...</p>
              </div>
            ) : assignmentAnswers.length === 0 ? (
              <div className="text-center py-10">
                <div className="text-4xl mb-4">📝</div>
                <p className="text-gray-400">No detailed answer data available.</p>
                <p className="text-sm text-gray-500 mt-2">
                  Answer tracking was added recently. Your future assignments will show detailed analysis.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Summary Stats */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="card-glass p-4 text-center border border-green-500/30">
                    <div className="text-2xl font-heading text-green-400">
                      {assignmentAnswers.filter(a => a.is_correct).length}
                    </div>
                    <div className="text-xs text-gray-400">Correct</div>
                  </div>
                  <div className="card-glass p-4 text-center border border-red-500/30">
                    <div className="text-2xl font-heading text-red-400">
                      {assignmentAnswers.filter(a => !a.is_correct).length}
                    </div>
                    <div className="text-xs text-gray-400">Incorrect</div>
                  </div>
                  <div className="card-glass p-4 text-center border border-blue-500/30">
                    <div className="text-2xl font-heading text-blue-400">
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
                    className={`card-glass p-4 border-l-4 ${
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
                          <div className={`p-2 rounded ${answer.is_correct ? 'bg-green-900/30' : 'bg-red-900/30'}`}>
                            <span className="text-gray-400">Your answer:</span>{' '}
                            <span className={answer.is_correct ? 'text-green-300' : 'text-red-300'}>
                              {answer.student_answer}
                            </span>
                          </div>
                          {!answer.is_correct && (
                            <div className="p-2 rounded bg-green-900/30">
                              <span className="text-gray-400">Correct answer:</span>{' '}
                              <span className="text-green-300">{answer.correct_answer}</span>
                            </div>
                          )}
                        </div>
                        {answer.explanation && !answer.is_correct && (
                          <div className="mt-2 p-2 rounded bg-blue-900/20 border border-blue-500/20">
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
                className="px-6 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-heading hover:scale-105 transition-all"
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
