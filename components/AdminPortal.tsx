import React, { useState, useEffect } from 'react';
import { Batch, Grade, Profile, ToastMessage } from '../types';
import BackButton from './BackButton';
import * as GameService from '../services/gameService';
import { supabase } from '../services/supabaseClient';
import * as CompetitionService from '../services/competitionService';

interface AdminPortalProps {
  profile: Profile;
  onComplete: () => void;
  addToast: (message: string, type: ToastMessage['type']) => void;
}

type AdminTab = 'dashboard' | 'users' | 'game' | 'clans' | 'analytics' | 'system';

const AdminPortal: React.FC<AdminPortalProps> = ({ profile, onComplete, addToast }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeToday: 0,
    totalXP: 0,
    totalCoins: 0,
    totalClans: 0
  });
  const [adminVisible, setAdminVisible] = useState(profile.admin_visible || false);
  const [showAnnouncementComposer, setShowAnnouncementComposer] = useState(false);
  const [announcementText, setAnnouncementText] = useState('');
  const [isSendingAnnouncement, setIsSendingAnnouncement] = useState(false);
  const [isResettingAll, setIsResettingAll] = useState(false);

  const gradeOptions: Grade[] = [8, 9];
  const batchByGrade: Record<Grade, Batch[]> = {
    8: ['8A', '8B', '8C'],
    9: ['9A', '9B', '9C'],
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    // Filter users based on search query
    if (searchQuery.trim() === '') {
      setFilteredUsers(allUsers);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = allUsers.filter(user => 
        user.username.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query) ||
        user.batch?.toLowerCase().includes(query)
      );
      setFilteredUsers(filtered);
    }
  }, [searchQuery, allUsers]);

  const fetchDashboardData = async () => {
    try {
      const { data: users, error } = await supabase
        .from('users')
        .select('*')
        .order('xp', { ascending: false });

      if (error) throw error;

      setAllUsers(users || []);
      setFilteredUsers(users || []);

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const activeToday = users?.filter(u => {
        const lastSeen = u.last_seen ? new Date(u.last_seen) : null;
        return lastSeen && lastSeen >= todayStart;
      }).length || 0;

      const totalXP = users?.reduce((sum, u) => sum + (u.xp || 0), 0) || 0;
      const totalCoins = users?.reduce((sum, u) => sum + (u.coins || 0), 0) || 0;

      const { data: clans } = await supabase.from('clans').select('id');

      setStats({
        totalUsers: users?.length || 0,
        activeToday,
        totalXP,
        totalCoins,
        totalClans: clans?.length || 0
      });
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    }
  };

  const toggleAdminVisibility = async () => {
    try {
      const newVisibility = !adminVisible;
      const { error } = await supabase
        .from('users')
        .update({ admin_visible: newVisibility })
        .eq('id', profile.id);

      if (error) throw error;

      setAdminVisible(newVisibility);
      addToast(
        newVisibility ? '👁️ Admin now VISIBLE in leaderboards & PvP' : '👻 Admin now HIDDEN from leaderboards & PvP',
        'success'
      );
    } catch (error) {
      addToast('Failed to toggle visibility', 'error');
    }
  };

  const grantCoins = async (userId: string, amount: number) => {
    try {
      const user = allUsers.find(u => u.id === userId);
      if (!user) return;

      const { error } = await supabase
        .from('users')
        .update({ coins: user.coins + amount })
        .eq('id', userId);

      if (error) throw error;

      addToast(`✨ Granted ${amount} coins to ${user.username}`, 'success');
      fetchDashboardData();
    } catch (error) {
      addToast('Failed to grant coins', 'error');
    }
  };

  const grantXP = async (userId: string, amount: number) => {
    try {
      const user = allUsers.find(u => u.id === userId);
      if (!user) return;

      const { error } = await supabase
        .from('users')
        .update({ xp: user.xp + amount })
        .eq('id', userId);

      if (error) throw error;

      addToast(`⚡ Granted ${amount} XP to ${user.username}`, 'success');
      fetchDashboardData();
    } catch (error) {
      addToast('Failed to grant XP', 'error');
    }
  };

  const setUserLevel = async (userId: string, newLevel: number) => {
    try {
      const user = allUsers.find(u => u.id === userId);
      if (!user) return;

      const { error } = await supabase
        .from('users')
        .update({ level: newLevel })
        .eq('id', userId);

      if (error) throw error;

      addToast(`🎚️ Set ${user.username} to level ${newLevel}`, 'success');
      fetchDashboardData();
    } catch (error) {
      addToast('Failed to set level', 'error');
    }
  };

  const resetUserAP = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('users')
        .update({ ap_now: 20, last_ap_update: new Date().toISOString() })
        .eq('id', userId);

      if (error) throw error;

      addToast('⚡ AP reset to 20', 'success');
      fetchDashboardData();
    } catch (error) {
      addToast('Failed to reset AP', 'error');
    }
  };

  const resetUserProgress = async (userId: string, username: string) => {
    try {
      const confirmReset = window.confirm(`Reset progress for ${username}? This clears XP, coins, and streak.`);
      if (!confirmReset) {
        return;
      }

      await CompetitionService.resetPlayerProgress(userId);
      addToast(`♻️ Progress reset for ${username}`, 'success');
      fetchDashboardData();
    } catch (error) {
      addToast('Failed to reset progress', 'error');
    }
  };

  const resetAllProgress = async () => {
    try {
      const confirmReset = window.confirm('Reset progress for ALL players (excluding admins)? This action cannot be undone.');
      if (!confirmReset) {
        return;
      }

      setIsResettingAll(true);
      const affected = await CompetitionService.resetAllPlayerProgress();
      addToast(`🧨 Reset progress for ${affected} players`, 'success');
      fetchDashboardData();
    } catch (error) {
      addToast('Failed to reset everyone', 'error');
    } finally {
      setIsResettingAll(false);
    }
  };

  const handleGradeChange = async (userId: string, nextGrade: string) => {
    const grade = nextGrade ? parseInt(nextGrade, 10) : null;
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    const batch: Batch | null = (() => {
      if (!grade) {
        return null;
      }
      const existingBatch = user.batch as Batch | null;
      if (!existingBatch) {
        return null;
      }
      const allowed = batchByGrade[grade as Grade];
      return allowed.includes(existingBatch) ? existingBatch : null;
    })();

    try {
      await CompetitionService.updatePlayerAcademics(userId, grade, batch);
      addToast(`🎓 Updated grade${batch ? ' and class' : ''} for ${user.username}`, 'success');
      setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, grade, batch } : u));
      setFilteredUsers(prev => prev.map(u => u.id === userId ? { ...u, grade, batch } : u));
    } catch (error) {
      addToast('Failed to update grade', 'error');
    }
  };

  const handleBatchChange = async (userId: string, nextBatch: string) => {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    const grade = user.grade !== null && user.grade !== undefined ? Number(user.grade) : null;
    const batch = nextBatch || null;

    try {
      await CompetitionService.updatePlayerAcademics(userId, grade, batch);
      addToast(`🏫 Updated class for ${user.username}`, 'success');
      setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, batch } : u));
      setFilteredUsers(prev => prev.map(u => u.id === userId ? { ...u, batch } : u));
    } catch (error) {
      addToast('Failed to update class', 'error');
    }
  };

  const sendAnnouncement = async () => {
    if (!announcementText.trim()) {
      addToast('Announcement text is empty', 'error');
      return;
    }

    try {
      setIsSendingAnnouncement(true);
      await CompetitionService.postAnnouncement(announcementText.trim());
      addToast('📢 Announcement sent to all players', 'success');
      setAnnouncementText('');
      setShowAnnouncementComposer(false);
    } catch (error) {
      addToast('Failed to send announcement', 'error');
    } finally {
      setIsSendingAnnouncement(false);
    }
  };

  const banUser = async (userId: string) => {
    addToast('🔨 Ban feature coming soon!', 'info');
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Epic Animated Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-pink-900/20 to-red-900/20 animate-pulse-slow"></div>
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="admin-particles"></div>
        </div>
      </div>

      <div className="relative z-10 p-6">
        <BackButton onClick={onComplete} />

        {/* Godly Admin Header */}
        <div className="text-center mb-8 relative">
          <div className="inline-block relative">
            {/* Rotating Glow Effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-600 blur-3xl opacity-50 animate-spin-slow"></div>
            
            <h1 className="relative font-heading text-6xl font-black mb-2 animate-float">
              <span className="bg-gradient-to-r from-yellow-300 via-pink-400 to-purple-500 bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(255,215,0,0.8)]">
                ⚡ ADMIN PORTAL ⚡
              </span>
            </h1>
            
            <div className="flex items-center justify-center gap-3 mt-4">
              <div className="w-16 h-16 rounded-full border-4 border-yellow-400 animate-pulse-glow overflow-hidden">
                <img src={profile.avatar_url} alt="Admin" className="w-full h-full object-cover" />
              </div>
              <div className="text-left">
                <p className="text-2xl font-bold text-yellow-300 drop-shadow-[0_0_10px_rgba(255,215,0,1)]">
                  {profile.username}
                </p>
                <p className="text-sm text-purple-300">👑 Supreme Administrator 👑</p>
              </div>
            </div>
          </div>
        </div>

        {/* Visibility Toggle - Godly Button */}
        <div className="max-w-4xl mx-auto mb-8">
          <button
            onClick={toggleAdminVisibility}
            className={`w-full relative group overflow-hidden rounded-2xl p-6 transition-all duration-500 ${
              adminVisible
                ? 'bg-gradient-to-r from-green-600/30 to-emerald-600/30 border-2 border-green-400 hover:shadow-[0_0_40px_rgba(34,197,94,0.6)]'
                : 'bg-gradient-to-r from-purple-600/30 to-indigo-600/30 border-2 border-purple-400 hover:shadow-[0_0_40px_rgba(168,85,247,0.6)]'
            }`}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
            
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`text-5xl ${adminVisible ? 'animate-pulse-glow' : ''}`}>
                  {adminVisible ? '👁️' : '👻'}
                </div>
                <div className="text-left">
                  <p className="text-2xl font-bold text-white mb-1">
                    {adminVisible ? 'VISIBLE MODE' : 'GHOST MODE'}
                  </p>
                  <p className="text-sm text-gray-300">
                    {adminVisible 
                      ? 'You appear in leaderboards & PvP (but cannot be attacked)'
                      : 'You are hidden from leaderboards & PvP'
                    }
                  </p>
                </div>
              </div>
              <div className="text-4xl font-bold text-white animate-bounce">
                {adminVisible ? '→ HIDE' : '→ SHOW'}
              </div>
            </div>
          </button>
        </div>

        {/* Tab Navigation - Epic Style */}
        <div className="max-w-6xl mx-auto mb-6">
          <div className="flex flex-wrap gap-2 justify-center">
            {(['dashboard', 'users', 'game', 'clans', 'analytics', 'system'] as AdminTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`relative px-6 py-3 rounded-xl font-heading text-lg font-bold transition-all duration-300 ${
                  activeTab === tab
                    ? 'bg-gradient-to-r from-yellow-400 to-pink-500 text-black shadow-[0_0_30px_rgba(255,215,0,0.8)] scale-110'
                    : 'bg-black/40 text-gray-400 hover:text-white border border-gray-600 hover:border-yellow-400'
                }`}
              >
                {activeTab === tab && (
                  <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 to-pink-500 blur-xl opacity-50 -z-10"></div>
                )}
                {tab.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="max-w-7xl mx-auto">
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Stats Grid - Godly Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[
                  { label: 'Total Users', value: stats.totalUsers, icon: '👥', color: 'cyan' },
                  { label: 'Active Today', value: stats.activeToday, icon: '🔥', color: 'orange' },
                  { label: 'Total XP', value: stats.totalXP.toLocaleString(), icon: '⚡', color: 'blue' },
                  { label: 'Total Coins', value: stats.totalCoins.toLocaleString(), icon: '🪙', color: 'yellow' },
                  { label: 'Total Clans', value: stats.totalClans, icon: '🛡️', color: 'purple' },
                  { label: 'God Mode', value: 'ACTIVE', icon: '👑', color: 'pink' }
                ].map((stat, idx) => (
                  <div
                    key={idx}
                    className={`relative overflow-hidden rounded-2xl p-6 bg-gradient-to-br from-${stat.color}-600/20 to-${stat.color}-900/20 border-2 border-${stat.color}-400 hover:shadow-[0_0_40px_rgba(255,215,0,0.4)] transition-all duration-300 hover:scale-105`}
                  >
                    <div className="absolute top-0 right-0 text-9xl opacity-10">{stat.icon}</div>
                    <div className="relative">
                      <p className="text-sm text-gray-300 mb-2">{stat.label}</p>
                      <p className={`text-4xl font-bold text-${stat.color}-300 font-mono`}>{stat.value}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick Actions */}
              <div className="card-glass p-6 border-2 border-yellow-400/50">
                <h3 className="text-2xl font-heading font-bold text-yellow-300 mb-4">⚡ Quick Actions</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <button
                    onClick={fetchDashboardData}
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
                      {allUsers.length > 0 ? (allUsers.reduce((sum, u) => sum + u.level, 0) / allUsers.length).toFixed(1) : '0'}
                    </p>
                  </div>
                  <div className="bg-black/30 p-4 rounded-lg border border-blue-400/50">
                    <p className="text-sm text-gray-400 mb-1">Average XP</p>
                    <p className="text-3xl font-bold text-blue-300">
                      {allUsers.length > 0 ? Math.floor(allUsers.reduce((sum, u) => sum + u.xp, 0) / allUsers.length).toLocaleString() : '0'}
                    </p>
                  </div>
                  <div className="bg-black/30 p-4 rounded-lg border border-yellow-400/50">
                    <p className="text-sm text-gray-400 mb-1">Richest Player</p>
                    <p className="text-xl font-bold text-yellow-300">
                      {allUsers.length > 0 ? allUsers.reduce((max, u) => u.coins > max.coins ? u : max, allUsers[0])?.username : 'None'}
                    </p>
                    <p className="text-sm text-gray-400">
                      {allUsers.length > 0 ? allUsers.reduce((max, u) => u.coins > max.coins ? u : max, allUsers[0])?.coins.toLocaleString() + ' 🪙' : ''}
                    </p>
                  </div>
                  <div className="bg-black/30 p-4 rounded-lg border border-purple-400/50">
                    <p className="text-sm text-gray-400 mb-1">Highest Level</p>
                    <p className="text-xl font-bold text-purple-300">
                      {allUsers.length > 0 ? allUsers.reduce((max, u) => u.level > max.level ? u : max, allUsers[0])?.username : 'None'}
                    </p>
                    <p className="text-sm text-gray-400">
                      {allUsers.length > 0 ? 'Level ' + allUsers.reduce((max, u) => u.level > max.level ? u : max, allUsers[0])?.level : ''}
                    </p>
                  </div>
                  <div className="bg-black/30 p-4 rounded-lg border border-green-400/50">
                    <p className="text-sm text-gray-400 mb-1">Total AP Pool</p>
                    <p className="text-3xl font-bold text-green-300">
                      {allUsers.reduce((sum, u) => sum + (u.ap_now || 0), 0)}
                    </p>
                  </div>
                  <div className="bg-black/30 p-4 rounded-lg border border-red-400/50">
                    <p className="text-sm text-gray-400 mb-1">Students</p>
                    <p className="text-3xl font-bold text-red-300">
                      {allUsers.filter(u => u.role === 'student' || !u.role).length}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="card-glass p-6 border-2 border-purple-400/50">
              <h3 className="text-3xl font-heading font-bold text-purple-300 mb-6">👥 User Management</h3>
              
              {/* Search Bar */}
              <div className="mb-6">
                <input
                  type="text"
                  placeholder="🔍 Search by username, email, or batch..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-3 bg-black/40 border-2 border-purple-400/50 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-400 focus:shadow-[0_0_20px_rgba(168,85,247,0.4)]"
                />
                <p className="text-sm text-gray-400 mt-2">
                  Showing {filteredUsers.length} of {allUsers.length} users
                </p>
              </div>
              
              <div className="max-h-[600px] overflow-y-auto space-y-3">
                {filteredUsers.map((user) => {
                  const userGrade: Grade | null = (() => {
                    if (typeof user.grade === 'number') {
                      return user.grade as Grade;
                    }
                    if (typeof user.grade === 'string' && user.grade.trim() !== '') {
                      const parsed = parseInt(user.grade, 10);
                      return (parsed === 8 || parsed === 9) ? (parsed as Grade) : null;
                    }
                    return null;
                  })();

                  const gradeValue = userGrade ?? '';
                  const batchValue = typeof user.batch === 'string' ? user.batch : '';
                  const availableBatches = userGrade ? batchByGrade[userGrade] : [];

                  return (
                    <div
                      key={user.id}
                      className="bg-black/40 p-4 rounded-lg border border-gray-700 hover:border-purple-400 transition-all"
                    >
                      <div className="flex items-start justify-between flex-wrap gap-4">
                        {/* User Info */}
                        <div className="flex items-center gap-3 flex-1">
                          <img src={user.avatar_url} alt={user.username} className="w-16 h-16 rounded-full border-2 border-purple-400" />
                          <div>
                            <p className="font-bold text-white text-lg">{user.username}</p>
                            <p className="text-sm text-gray-400">{user.email}</p>
                            <div className="flex gap-3 mt-1">
                              <span className="text-xs bg-cyan-600/30 text-cyan-300 px-2 py-1 rounded">Lvl {user.level}</span>
                              <span className="text-xs bg-purple-600/30 text-purple-300 px-2 py-1 rounded">{user.batch || 'No Batch'}</span>
                              <span className="text-xs bg-yellow-600/30 text-yellow-300 px-2 py-1 rounded">{user.role || 'student'}</span>
                            </div>
                          </div>
                        </div>
                        
                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div className="bg-blue-600/20 px-3 py-2 rounded border border-blue-400/50">
                            <p className="text-blue-300 font-mono">{user.xp.toLocaleString()} XP</p>
                          </div>
                          <div className="bg-yellow-600/20 px-3 py-2 rounded border border-yellow-400/50">
                            <p className="text-yellow-300 font-mono">{user.coins.toLocaleString()} 🪙</p>
                          </div>
                          <div className="bg-green-600/20 px-3 py-2 rounded border border-green-400/50">
                            <p className="text-green-300 font-mono">{user.ap_now}/{user.ap_max} AP</p>
                          </div>
                          <div className="bg-red-600/20 px-3 py-2 rounded border border-red-400/50">
                            <p className="text-red-300 font-mono">⚔️ {user.attack_power} | 🛡️ {user.defense_power}</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
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
                            disabled={!userGrade}
                            className="w-full bg-black/40 border border-purple-400/50 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-300 disabled:opacity-50"
                          >
                            <option value="">Unset</option>
                            {availableBatches.map((batch) => (
                              <option key={batch} value={batch}>{batch}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Action Buttons */}
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
                          onClick={() => resetUserAP(user.id)}
                          className="bg-green-600/30 hover:bg-green-600/50 border border-green-400 text-white text-sm px-3 py-2 rounded transition-all hover:shadow-[0_0_15px_rgba(34,197,94,0.5)]"
                        >
                          🔋 Reset AP
                        </button>
                        <button
                          onClick={() => setUserLevel(user.id, user.level + 1)}
                          className="bg-purple-600/30 hover:bg-purple-600/50 border border-purple-400 text-white text-sm px-3 py-2 rounded transition-all hover:shadow-[0_0_15px_rgba(168,85,247,0.5)]"
                        >
                          📈 +1 Level
                        </button>
                        <button
                          onClick={() => resetUserProgress(user.id, user.username)}
                          className="bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-400 text-white text-sm px-3 py-2 rounded transition-all hover:shadow-[0_0_15px_rgba(99,102,241,0.5)]"
                        >
                          ♻️ Reset Progress
                        </button>
                        <button
                          onClick={() => banUser(user.id)}
                          className="bg-red-600/30 hover:bg-red-600/50 border border-red-400 text-white text-sm px-3 py-2 rounded transition-all hover:shadow-[0_0_15px_rgba(239,68,68,0.5)]"
                        >
                          🔨 Ban
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'game' && (
            <div className="card-glass p-6 border-2 border-green-400/50">
              <h3 className="text-3xl font-heading font-bold text-green-300 mb-6">🎮 Game Management</h3>
              <p className="text-gray-400">Game management features coming soon...</p>
            </div>
          )}

          {activeTab === 'clans' && (
            <div className="card-glass p-6 border-2 border-blue-400/50">
              <h3 className="text-3xl font-heading font-bold text-blue-300 mb-6">🛡️ Clan Management</h3>
              <p className="text-gray-400">Clan management features coming soon...</p>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="card-glass p-6 border-2 border-pink-400/50">
              <h3 className="text-3xl font-heading font-bold text-pink-300 mb-6">📊 Analytics</h3>
              <p className="text-gray-400">Analytics dashboard coming soon...</p>
            </div>
          )}

          {activeTab === 'system' && (
            <div className="card-glass p-6 border-2 border-red-400/50">
              <h3 className="text-3xl font-heading font-bold text-red-300 mb-6">⚙️ System Control</h3>
              <p className="text-gray-400">System control panel coming soon...</p>
            </div>
          )}
        </div>
      </div>

      {/* Custom Styles */}
      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        @keyframes pulse-slow {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
        
        .animate-spin-slow {
          animation: spin-slow 20s linear infinite;
        }
        
        .animate-pulse-slow {
          animation: pulse-slow 4s ease-in-out infinite;
        }
        
        .admin-particles {
          background-image: 
            radial-gradient(2px 2px at 20% 30%, rgba(255, 215, 0, 0.5), transparent),
            radial-gradient(2px 2px at 60% 70%, rgba(255, 105, 180, 0.5), transparent),
            radial-gradient(2px 2px at 50% 50%, rgba(138, 43, 226, 0.5), transparent),
            radial-gradient(2px 2px at 80% 10%, rgba(255, 215, 0, 0.5), transparent);
          background-size: 200% 200%;
          background-position: 0% 0%;
          height: 100%;
          width: 100%;
          animation: particle-float 20s ease-in-out infinite;
        }
        
        @keyframes particle-float {
          0%, 100% { background-position: 0% 0%; }
          25% { background-position: 100% 0%; }
          50% { background-position: 100% 100%; }
          75% { background-position: 0% 100%; }
        }
      `}</style>

      {showAnnouncementComposer && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4">
          <div className="bg-gray-900 border border-green-400/60 rounded-2xl max-w-xl w-full p-6 space-y-4">
            <h3 className="text-2xl font-heading text-green-300">📢 Broadcast Announcement</h3>
            <p className="text-sm text-gray-400">
              This message will appear once for every player until they dismiss it.
            </p>
            <textarea
              value={announcementText}
              onChange={(e) => setAnnouncementText(e.target.value)}
              rows={5}
              className="w-full bg-black/50 border border-green-400/40 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green-300"
              placeholder="Share mission updates, tournament news, or urgent warnings..."
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAnnouncementComposer(false);
                  setAnnouncementText('');
                }}
                className="px-4 py-2 rounded-lg border border-gray-500 text-gray-300 hover:bg-gray-800/80"
              >
                Cancel
              </button>
              <button
                onClick={sendAnnouncement}
                disabled={isSendingAnnouncement}
                className={`px-5 py-2 rounded-lg border border-green-400 text-white font-semibold transition-all ${
                  isSendingAnnouncement
                    ? 'bg-green-600/30 cursor-not-allowed'
                    : 'bg-green-600/40 hover:bg-green-600/60 hover:shadow-[0_0_20px_rgba(34,197,94,0.6)]'
                }`}
              >
                {isSendingAnnouncement ? 'Sending...' : 'Send Broadcast'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPortal;
