import React from 'react';
import { useAdmin } from '../AdminContext';
import ClickableUsername from '../../ClickableUsername';

const UsersTab: React.FC = () => {
  const {
    PAGE_SIZE, batchByGrade, changeUserRole, customCoinAmount, customGemstoneAmount, customLevelAmount, customXpAmount,
    deleteUser, gradeOptions, grantCoins, grantCustomCoins, grantCustomGemstones, grantCustomXP, grantGemstones, grantXP,
    handleBatchChange, handleGradeChange, hasNextPage, resetUserAP, resetUserAcademics,
    resetUserProgress, resolveUserEmail, resolveUserLabel, roleChangeLoading, searchQuery,
    setCustomCoinAmount, setCustomGemstoneAmount, setCustomLevel, setCustomLevelAmount, setCustomXpAmount, setSearchQuery,
    setShowCustomGrant, setUserBanState, setUserLevel, setUserPage, showCustomGrant, userPage,
    users, usersError, usersLoading,
  } = useAdmin();

  return (
    <div className="card-glass p-6 border-2 border-purple-400/50">
      <h3 className="text-3xl font-heading font-bold text-purple-300 mb-6">👥 User Management</h3>

      {/* Search Bar */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="🔍 Search by username, email, or class..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-3 bg-black/40 border-2 border-purple-400/50 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-400 focus:shadow-[0_0_20px_rgba(168,85,247,0.4)]"
        />
        <p className="text-sm text-gray-400 mt-2">
          Showing {users.length} users • Page {userPage + 1}
        </p>
      </div>

      {usersError && (
        <div className="mb-4 rounded-xl border border-red-400/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {usersError}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span>Results per page: {PAGE_SIZE}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setUserPage((prev) => Math.max(0, prev - 1))}
            disabled={userPage === 0}
            className="rounded-lg border border-purple-400/50 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40 hover:bg-purple-500/20"
          >
            ◀ Prev
          </button>
          <span className="text-sm text-gray-300">Page {userPage + 1}</span>
          <button
            type="button"
            onClick={() => setUserPage((prev) => prev + 1)}
            disabled={!hasNextPage}
            className="rounded-lg border border-purple-400/50 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40 hover:bg-purple-500/20"
          >
            Next ▶
          </button>
        </div>
      </div>

      <div className="max-h-[600px] overflow-y-auto space-y-3">
        {usersLoading && (
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-gray-300">
            Loading users…
          </div>
        )}
        {!usersLoading && users.length === 0 && (
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-gray-300">
            No users found for this page.
          </div>
        )}
        {!usersLoading && users.map((user) => {
          const isBanned = Boolean(user.is_banned);
          const userGrade: Grade | null = (() => {
            if (typeof user.grade === 'number') {
              return user.grade as Grade;
            }
            if (typeof user.grade === 'string' && user.grade.trim() !== '') {
              const parsed = parseInt(user.grade, 10);
              return parsed >= 6 && parsed <= 12 ? (parsed as Grade) : null;
            }
            return null;
          })();

          const gradeValue = userGrade ?? '';
          const batchValue = typeof user.batch === 'string' ? user.batch : '';
          const availableBatches = userGrade ? batchByGrade[userGrade] : ['N/A'];

          return (
            <div
              key={user.id}
              className={`p-4 rounded-lg border transition-all ${
                isBanned
                  ? 'bg-red-950/40 border-red-500/70 hover:border-red-400'
                  : 'bg-black/40 border-gray-700 hover:border-purple-400'
              }`}
            >
              <div className="flex items-start justify-between flex-wrap gap-4">
                {/* User Info */}
                <div className="flex items-center gap-3 flex-1">
                  <div className="w-16 h-16 rounded-full border-2 border-purple-400 overflow-hidden bg-gray-800 flex items-center justify-center">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt={resolveUserLabel(user)} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.innerHTML = '<span class="text-2xl">👤</span>'; }} />
                    ) : (
                      <span className="text-2xl">👤</span>
                    )}
                  </div>
                  <div>
                    <p className="font-bold text-white text-lg">
                      <ClickableUsername userId={user.id} username={resolveUserLabel(user)}>
                        {resolveUserLabel(user)}
                      </ClickableUsername>
                    </p>
                    <p className="text-sm text-gray-400">{resolveUserEmail(user)}</p>
                    <div className="flex gap-3 mt-1">
                      <span className="text-xs bg-cyan-600/30 text-cyan-300 px-2 py-1 rounded">Lvl {Number(user.level ?? 0)}</span>
                      <span className="text-xs bg-purple-600/30 text-purple-300 px-2 py-1 rounded">{user.batch || 'No class'}</span>
                      <span className="text-xs bg-yellow-600/30 text-yellow-300 px-2 py-1 rounded">{user.role || 'student'}</span>
                      {isBanned && (
                        <span className="text-xs bg-red-700/60 text-red-200 px-2 py-1 rounded">BANNED</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-blue-600/20 px-3 py-2 rounded border border-blue-400/50">
                    <p className="text-blue-300 font-mono">{Number(user.xp ?? 0).toLocaleString()} XP</p>
                  </div>
                  <div className="bg-yellow-600/20 px-3 py-2 rounded border border-yellow-400/50">
                    <p className="text-yellow-300 font-mono">{Number(user.coins ?? 0).toLocaleString()} 🪙</p>
                  </div>
                  <div className="bg-emerald-600/20 px-3 py-2 rounded border border-emerald-400/50">
                    <p className="text-emerald-300 font-mono">{Number(user.gemstones ?? 0).toLocaleString()} 💎</p>
                  </div>
                  <div className="bg-green-600/20 px-3 py-2 rounded border border-green-400/50">
                    <p className="text-green-300 font-mono">{Number(user.ap_now ?? 0)}/{Number(user.ap_max ?? 0)} AP</p>
                  </div>
                  <div className="bg-red-600/20 px-3 py-2 rounded border border-red-400/50">
                    <p className="text-red-300 font-mono">⚔️ {Number(user.attack_power ?? 0)} | 🛡️ {Number(user.defense_power ?? 0)}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Grade</label>
                  <select
                    value={gradeValue}
                    onChange={(e) => handleGradeChange(user.id, e.target.value)}
                    className="w-full bg-black/40 border border-purple-400/50 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-300"
                  >
                    <option value="">Unset</option>
                    {gradeOptions.map((grade) => (
                      <option key={grade} value={grade}>{grade}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Class</label>
                  <select
                    value={batchValue}
                    onChange={(e) => handleBatchChange(user.id, e.target.value)}
                    className="w-full bg-black/40 border border-purple-400/50 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-300"
                  >
                    <option value="">Unset</option>
                    {availableBatches.map((batch) => (
                      <option key={batch} value={batch}>{batch}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Role</label>
                  <select
                    value={user.role || 'student'}
                    onChange={(e) => changeUserRole(user.id, e.target.value)}
                    disabled={roleChangeLoading === user.id}
                    className="w-full bg-black/40 border border-amber-400/50 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-300"
                  >
                    <option value="student">Student</option>
                    <option value="teacher">Teacher</option>
                    <option value="school_admin">School Admin</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>

              {/* Quick Action Buttons */}
              <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-700">
                <button
                  onClick={() => grantCoins(user.id, 1000)}
                  className="bg-yellow-600/30 hover:bg-yellow-600/50 border border-yellow-400 text-white text-sm px-3 py-2 rounded transition-all hover:shadow-[0_0_15px_rgba(251,191,36,0.5)]"
                >
                  💰 +1000 Coins
                </button>
                <button
                  onClick={() => grantXP(user.id, 500)}
                  className="bg-blue-600/30 hover:bg-blue-600/50 border border-blue-400 text-white text-sm px-3 py-2 rounded transition-all hover:shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                >
                  ⚡ +500 XP
                </button>
                <button
                  onClick={() => grantGemstones(user.id, 10)}
                  className="bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-400 text-white text-sm px-3 py-2 rounded transition-all hover:shadow-[0_0_15px_rgba(16,185,129,0.5)]"
                >
                  💎 +10 Gemstones
                </button>
                <button
                  onClick={() => resetUserAP(user.id)}
                  className="bg-green-600/30 hover:bg-green-600/50 border border-green-400 text-white text-sm px-3 py-2 rounded transition-all hover:shadow-[0_0_15px_rgba(34,197,94,0.5)]"
                >
                  🔋 Reset AP
                </button>
                <button
                  onClick={() => setUserLevel(user.id, user.level)}
                  className="bg-purple-600/30 hover:bg-purple-600/50 border border-purple-400 text-white text-sm px-3 py-2 rounded transition-all hover:shadow-[0_0_15px_rgba(168,85,247,0.5)]"
                >
                  📈 +1 Level
                </button>
                <button
                  onClick={() => resetUserProgress(user.id, resolveUserLabel(user))}
                  className="bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-400 text-white text-sm px-3 py-2 rounded transition-all hover:shadow-[0_0_15px_rgba(99,102,241,0.5)]"
                >
                  ♻️ Reset Progress
                </button>
                <button
                  onClick={() => resetUserAcademics(user.id, resolveUserLabel(user))}
                  className="bg-orange-600/30 hover:bg-orange-600/50 border border-orange-400 text-white text-sm px-3 py-2 rounded transition-all hover:shadow-[0_0_15px_rgba(251,146,60,0.5)]"
                >
                  🏫 Reset School/Grade/Class
                </button>
                <button
                  onClick={() => setUserBanState(user.id, resolveUserLabel(user), !isBanned)}
                  className={`${
                    isBanned
                      ? 'bg-green-600/30 hover:bg-green-600/50 border border-green-400 hover:shadow-[0_0_15px_rgba(34,197,94,0.5)]'
                      : 'bg-red-600/30 hover:bg-red-600/50 border border-red-400 hover:shadow-[0_0_15px_rgba(239,68,68,0.5)]'
                  } text-white text-sm px-3 py-2 rounded transition-all`}
                >
                  {isBanned ? '♻️ Unban' : '🔨 Ban'}
                </button>
                <button
                  onClick={() => deleteUser(user.id, resolveUserLabel(user))}
                  className="bg-red-900/40 hover:bg-red-900/60 border border-red-600 text-white text-sm px-3 py-2 rounded transition-all hover:shadow-[0_0_18px_rgba(220,38,38,0.5)]"
                >
                  🗑️ Delete User
                </button>
                <button
                  onClick={() => setShowCustomGrant(prev => ({ ...prev, [user.id]: !prev[user.id] }))}
                  className="bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-400 text-white text-sm px-3 py-2 rounded transition-all hover:shadow-[0_0_15px_rgba(6,182,212,0.5)]"
                >
                  🎛️ Custom
                </button>
              </div>

              {/* Custom Grant Panel */}
              {showCustomGrant[user.id] && (
                <div className="mt-3 p-3 bg-black/30 border border-cyan-400/30 rounded-lg">
                  <p className="text-xs text-cyan-300 font-semibold mb-2">🎛️ Custom Grants & Level Set</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    <div className="flex gap-1">
                      <input type="number" placeholder="Coins" value={customCoinAmount[user.id] || ''} onChange={(e) => setCustomCoinAmount(prev => ({ ...prev, [user.id]: e.target.value }))} className="flex-1 bg-black/50 border border-yellow-400/40 rounded px-2 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400" />
                      <button onClick={() => grantCustomCoins(user.id, parseInt(customCoinAmount[user.id]) || 0)} className="bg-yellow-600/40 hover:bg-yellow-600/60 border border-yellow-400 text-white text-xs px-2 py-1.5 rounded">💰 Grant</button>
                    </div>
                    <div className="flex gap-1">
                      <input type="number" placeholder="XP" value={customXpAmount[user.id] || ''} onChange={(e) => setCustomXpAmount(prev => ({ ...prev, [user.id]: e.target.value }))} className="flex-1 bg-black/50 border border-blue-400/40 rounded px-2 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-400" />
                      <button onClick={() => grantCustomXP(user.id, parseInt(customXpAmount[user.id]) || 0)} className="bg-blue-600/40 hover:bg-blue-600/60 border border-blue-400 text-white text-xs px-2 py-1.5 rounded">⚡ Grant</button>
                    </div>
                    <div className="flex gap-1">
                      <input type="number" placeholder="Gemstones" value={customGemstoneAmount[user.id] || ''} onChange={(e) => setCustomGemstoneAmount(prev => ({ ...prev, [user.id]: e.target.value }))} className="flex-1 bg-black/50 border border-emerald-400/40 rounded px-2 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-400" />
                      <button onClick={() => grantCustomGemstones(user.id, parseInt(customGemstoneAmount[user.id]) || 0)} className="bg-emerald-600/40 hover:bg-emerald-600/60 border border-emerald-400 text-white text-xs px-2 py-1.5 rounded">💎 Grant</button>
                    </div>
                    <div className="flex gap-1">
                      <input type="number" placeholder="Level" value={customLevelAmount[user.id] || ''} onChange={(e) => setCustomLevelAmount(prev => ({ ...prev, [user.id]: e.target.value }))} className="flex-1 bg-black/50 border border-purple-400/40 rounded px-2 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-400" />
                      <button onClick={() => setCustomLevel(user.id, parseInt(customLevelAmount[user.id]) || 0)} className="bg-purple-600/40 hover:bg-purple-600/60 border border-purple-400 text-white text-xs px-2 py-1.5 rounded">📈 Set</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default UsersTab;
