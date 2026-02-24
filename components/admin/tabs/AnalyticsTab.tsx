import React from 'react';
import { useAdmin } from '../AdminContext';

const AnalyticsTab: React.FC = () => {
  const {
    analyticsData, analyticsLoading, fetchAnalytics,
  } = useAdmin();

  return (
    <div className="space-y-6">
      <div className="card-glass p-6 border-2 border-pink-400/50">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-3xl font-heading font-bold text-pink-300">📊 Analytics Dashboard</h3>
          <button onClick={fetchAnalytics} disabled={analyticsLoading} className="bg-pink-500/20 hover:bg-pink-500/30 border border-pink-400 text-white px-4 py-2 rounded-lg font-semibold transition-all hover:shadow-[0_0_20px_rgba(236,72,153,0.5)]">
            {analyticsLoading ? '⏳ Loading...' : '🔄 Refresh Analytics'}
          </button>
        </div>

        {!analyticsData && !analyticsLoading && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-6xl mb-4">📊</p>
            <p className="text-xl">Click "Refresh Analytics" to load the dashboard</p>
          </div>
        )}

        {analyticsLoading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin h-8 w-8 border-4 border-pink-400 border-t-transparent rounded-full"></div>
            <p className="text-sm text-gray-400 mt-3">Crunching numbers...</p>
          </div>
        )}

        {analyticsData && !analyticsLoading && (
          <div className="space-y-6">
            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { label: 'Players Today', value: analyticsData.playersToday, icon: '🎮', containerClass: 'bg-gradient-to-br from-pink-600/20 to-pink-900/20 border-2 border-pink-400', valueClass: 'text-pink-300' },
                { label: 'Active Now', value: analyticsData.activeNow, icon: '🟢', containerClass: 'bg-gradient-to-br from-green-600/20 to-green-900/20 border-2 border-green-400', valueClass: 'text-green-300' },
                { label: 'Total Clans', value: analyticsData.totalClans, icon: '🛡️', containerClass: 'bg-gradient-to-br from-blue-600/20 to-blue-900/20 border-2 border-blue-400', valueClass: 'text-blue-300' },
                { label: 'Total Questions', value: analyticsData.totalQuestions, icon: '❓', containerClass: 'bg-gradient-to-br from-purple-600/20 to-purple-900/20 border-2 border-purple-400', valueClass: 'text-purple-300' },
                { label: 'Recent Errors', value: analyticsData.recentErrors.length, icon: analyticsData.recentErrors.length > 0 ? '⚠️' : '✅', containerClass: analyticsData.recentErrors.length > 0 ? 'bg-gradient-to-br from-red-600/20 to-red-900/20 border-2 border-red-400' : 'bg-gradient-to-br from-green-600/20 to-green-900/20 border-2 border-green-400', valueClass: analyticsData.recentErrors.length > 0 ? 'text-red-300' : 'text-green-300' },
              ].map((metric, i) => (
                <div key={i} className={`${metric.containerClass} rounded-xl p-4 text-center`}>
                  <p className="text-3xl mb-1">{metric.icon}</p>
                  <p className={`text-2xl font-bold font-mono ${metric.valueClass}`}>{metric.value}</p>
                  <p className="text-xs text-gray-400">{metric.label}</p>
                </div>
              ))}
            </div>

            {/* Grade Distribution */}
            <div className="card-glass border border-pink-400/30 p-4 rounded-xl">
              <h4 className="text-lg font-heading font-bold text-pink-200 mb-3">📚 Grade Distribution</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {Object.entries(analyticsData.gradeDistribution)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([grade, count]) => (
                    <div key={grade} className="bg-black/30 border border-pink-400/20 rounded-lg p-3 text-center">
                      <p className="text-sm font-semibold text-white">{grade}</p>
                      <p className="text-2xl font-bold text-pink-300">{count}</p>
                    </div>
                  ))}
              </div>
            </div>

            {/* Role Distribution */}
            <div className="card-glass border border-purple-400/30 p-4 rounded-xl">
              <h4 className="text-lg font-heading font-bold text-purple-200 mb-3">👥 Role Distribution</h4>
              <div className="flex flex-wrap gap-3">
                {Object.entries(analyticsData.roleDistribution)
                  .sort(([, a], [, b]) => b - a)
                  .map(([role, count]) => {
                    const total = Object.values(analyticsData.roleDistribution).reduce((s, v) => s + v, 0);
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                    return (
                      <div key={role} className="bg-black/30 border border-purple-400/20 rounded-lg px-4 py-3 flex-1 min-w-[120px]">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold text-white capitalize">{role}</span>
                          <span className="text-xs text-purple-300">{pct}%</span>
                        </div>
                        <p className="text-xl font-bold text-purple-300">{count}</p>
                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mt-1">
                          <div className="h-full rounded-full bg-purple-500 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Batch/Class Stats */}
            {analyticsData.batchStats.length > 0 && (
              <div className="card-glass border border-cyan-400/30 p-4 rounded-xl">
                <h4 className="text-lg font-heading font-bold text-cyan-200 mb-3">🏫 Class/Batch Stats</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-cyan-400/30">
                        <th className="px-3 py-2 text-cyan-300">Class</th>
                        <th className="px-3 py-2 text-cyan-300">Players</th>
                        <th className="px-3 py-2 text-cyan-300">Total XP</th>
                        <th className="px-3 py-2 text-cyan-300">Avg XP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyticsData.batchStats
                        .sort((a, b) => b.totalXp - a.totalXp)
                        .map((b, i) => (
                          <tr key={i} className="border-b border-gray-700/50 hover:bg-cyan-500/5">
                            <td className="px-3 py-2 text-white font-semibold">{b.batch}</td>
                            <td className="px-3 py-2 text-gray-300">{b.playerCount}</td>
                            <td className="px-3 py-2 text-cyan-300 font-mono">{b.totalXp.toLocaleString()}</td>
                            <td className="px-3 py-2 text-gray-400 font-mono">{b.playerCount > 0 ? Math.round(b.totalXp / b.playerCount).toLocaleString() : 0}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Error Log */}
            {analyticsData.recentErrors.length > 0 && (
              <div className="card-glass border border-red-400/30 p-4 rounded-xl">
                <h4 className="text-lg font-heading font-bold text-red-300 mb-3">⚠️ Recent Errors</h4>
                {analyticsData.recentErrors.map((err, i) => (
                  <div key={i} className="bg-red-500/10 border border-red-400/20 rounded-lg p-3 text-sm text-red-200 font-mono">
                    {err}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalyticsTab;
