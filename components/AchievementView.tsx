import React, { useState, useEffect } from 'react';
import * as GameService from '../services/gameService';
import BackButton from './BackButton';

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

  useEffect(() => {
    fetchAchievements();
  }, []);

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
    } catch (error) {
      console.error('Failed to fetch achievements:', error);
      addToast('Failed to load achievements', 'error');
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
    </div>
  );
};

export default AchievementView;
