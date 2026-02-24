import React from 'react';
import { useAdmin } from '../AdminContext';

const DashboardTab: React.FC = () => {
  const {
    isResettingAll, playerUsers, refreshAdminData, resetAllProgress, resolveUserLabel, 
    setShowAnnouncementComposer, stats, statsError, statsLoading,
  } = useAdmin();

  return (
    <div className="space-y-6">
      {statsError && (
        <div className="rounded-xl border border-red-400/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {statsError}
        </div>
      )}
      {/* Stats Grid - Godly Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[
          {
            key: 'totalUsers',
            label: 'Total Users',
            value: stats.totalUsers,
            icon: '👥',
            containerClass: 'bg-gradient-to-br from-cyan-600/20 to-cyan-900/20 border-2 border-cyan-400',
            valueClass: 'text-cyan-300'
          },
          {
            key: 'totalTeachers',
            label: 'Total Teachers',
            value: stats.totalTeachers,
            icon: '🧑‍🏫',
            containerClass: 'bg-gradient-to-br from-orange-600/20 to-orange-900/20 border-2 border-orange-400',
            valueClass: 'text-orange-300'
          },
          {
            key: 'bhMembers',
            label: 'BH Members',
            value: stats.bhMembers,
            icon: '🧠',
            containerClass: 'bg-gradient-to-br from-blue-600/20 to-blue-900/20 border-2 border-blue-400',
            valueClass: 'text-blue-300'
          },
          {
            key: 'ieltsUsers',
            label: 'IELTS Users',
            value: stats.ieltsUsers,
            icon: '📘',
            containerClass: 'bg-gradient-to-br from-yellow-600/20 to-yellow-900/20 border-2 border-yellow-400',
            valueClass: 'text-yellow-300'
          },
          {
            key: 'ieltsTeachers',
            label: 'IELTS Teachers',
            value: stats.ieltsTeachers,
            icon: '🎓',
            containerClass: 'bg-gradient-to-br from-emerald-600/20 to-emerald-900/20 border-2 border-emerald-400',
            valueClass: 'text-emerald-300'
          },
          {
            key: 'godMode',
            label: 'God Mode',
            value: 'ACTIVE',
            icon: '👑',
            containerClass: 'bg-gradient-to-br from-pink-600/20 to-pink-900/20 border-2 border-pink-400',
            valueClass: 'text-pink-300'
          }
        ].map((stat, idx) => {
          const resolvedValue =
            stat.key === 'godMode'
              ? 'ACTIVE'
              : statsError
                ? '—'
                : (stats as Record<string, number | null>)[stat.key] ?? '—';

          return (
          <div
            key={idx}
            className={`relative overflow-hidden rounded-2xl p-6 ${stat.containerClass} hover:shadow-[0_0_40px_rgba(255,215,0,0.4)] transition-all duration-300 hover:scale-105`}
          >
            <div className="absolute top-0 right-0 text-9xl opacity-10">{stat.icon}</div>
            <div className="relative">
              <p className="text-sm text-gray-300 mb-2">{stat.label}</p>
              {statsLoading && stat.key !== 'godMode' ? (
                <div className="h-10 w-24 rounded-lg bg-white/10 animate-pulse" />
              ) : (
                <p className={`text-3xl font-bold font-mono ${stat.valueClass}`}>{resolvedValue}</p>
              )}
            </div>
          </div>
        );
        })}
      </div>

      {/* Quick Actions */}
      <div className="card-glass p-6 border-2 border-yellow-400/50">
        <h3 className="text-2xl font-heading font-bold text-yellow-300 mb-4">⚡ Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={refreshAdminData}
            className="bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-400 text-white font-semibold px-6 py-3 rounded-lg transition-all hover:shadow-[0_0_20px_rgba(6,182,212,0.6)]"
          >
            🔄 Refresh Data
          </button>
          <button
            onClick={() => setShowAnnouncementComposer(true)}
            className="bg-green-600/30 hover:bg-green-600/50 border border-green-400 text-white font-semibold px-6 py-3 rounded-lg transition-all hover:shadow-[0_0_20px_rgba(34,197,94,0.6)]"
          >
            📢 Send Announcement
          </button>
          <button
            onClick={resetAllProgress}
            disabled={isResettingAll}
            className={`border border-red-400 text-white font-semibold px-6 py-3 rounded-lg transition-all ${
              isResettingAll
                ? 'bg-red-600/20 cursor-not-allowed'
                : 'bg-red-600/30 hover:bg-red-600/50 hover:shadow-[0_0_20px_rgba(248,113,113,0.6)]'
            }`}
          >
            {isResettingAll ? '⏳ Resetting...' : '🧨 Reset All Progress'}
          </button>
        </div>
      </div>

      {/* Detailed User Analytics */}
      <div className="card-glass p-6 border-2 border-cyan-400/50">
        <h3 className="text-2xl font-heading font-bold text-cyan-300 mb-4">📊 User Analytics</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-black/30 p-4 rounded-lg border border-cyan-400/50">
            <p className="text-sm text-gray-400 mb-1">Average Level</p>
            <p className="text-3xl font-bold text-cyan-300">
              {playerUsers.length > 0 ? (playerUsers.reduce((sum, u) => sum + Number(u.level ?? 0), 0) / playerUsers.length).toFixed(1) : '0'}
            </p>
          </div>
          <div className="bg-black/30 p-4 rounded-lg border border-blue-400/50">
            <p className="text-sm text-gray-400 mb-1">Average XP</p>
            <p className="text-3xl font-bold text-blue-300">
              {playerUsers.length > 0 ? Math.floor(playerUsers.reduce((sum, u) => sum + Number(u.xp ?? 0), 0) / playerUsers.length).toLocaleString() : '0'}
            </p>
          </div>
          <div className="bg-black/30 p-4 rounded-lg border border-yellow-400/50">
            <p className="text-sm text-gray-400 mb-1">Richest Player</p>
            <p className="text-xl font-bold text-yellow-300">
              {playerUsers.length > 0 ? resolveUserLabel(playerUsers.reduce((max, u) => Number(u.coins ?? 0) > Number(max.coins ?? 0) ? u : max, playerUsers[0])) : 'None'}
            </p>
            <p className="text-sm text-gray-400">
              {playerUsers.length > 0 ? `${Number(playerUsers.reduce((max, u) => Number(u.coins ?? 0) > Number(max.coins ?? 0) ? u : max, playerUsers[0])?.coins ?? 0).toLocaleString()} 🪙` : ''}
            </p>
          </div>
          <div className="bg-black/30 p-4 rounded-lg border border-purple-400/50">
            <p className="text-sm text-gray-400 mb-1">Highest Level</p>
            <p className="text-xl font-bold text-purple-300">
              {playerUsers.length > 0 ? resolveUserLabel(playerUsers.reduce((max, u) => Number(u.level ?? 0) > Number(max.level ?? 0) ? u : max, playerUsers[0])) : 'None'}
            </p>
            <p className="text-sm text-gray-400">
              {playerUsers.length > 0 ? `Level ${Number(playerUsers.reduce((max, u) => Number(u.level ?? 0) > Number(max.level ?? 0) ? u : max, playerUsers[0])?.level ?? 0)}` : ''}
            </p>
          </div>
          <div className="bg-black/30 p-4 rounded-lg border border-green-400/50">
            <p className="text-sm text-gray-400 mb-1">Total AP Pool</p>
            <p className="text-3xl font-bold text-green-300">
              {playerUsers.reduce((sum, u) => sum + Number(u.ap_now ?? 0), 0)}
            </p>
          </div>
          <div className="bg-black/30 p-4 rounded-lg border border-red-400/50">
            <p className="text-sm text-gray-400 mb-1">Students</p>
            <p className="text-3xl font-bold text-red-300">
              {playerUsers.length}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardTab;
