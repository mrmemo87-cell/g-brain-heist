import React, { useState, useEffect } from 'react';
import { Profile, ToastMessage } from '../types';
import BackButton from './BackButton';
import * as GameService from '../services/gameService';
import { supabase } from '../services/supabaseClient';

interface AdminPortalProps {
  profile: Profile;
  onComplete: () => void;
  addToast: (message: string, type: ToastMessage['type']) => void;
}

type AdminTab = 'dashboard' | 'users' | 'game' | 'clans' | 'analytics' | 'system';

const AdminPortal: React.FC<AdminPortalProps> = ({ profile, onComplete, addToast }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeToday: 0,
    totalXP: 0,
    totalCoins: 0,
    totalClans: 0
  });
  const [adminVisible, setAdminVisible] = useState(profile.admin_visible || false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const { data: users, error } = await supabase
        .from('users')
        .select('*')
        .order('xp', { ascending: false });

      if (error) throw error;

      setAllUsers(users || []);

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
                    onClick={() => addToast('🚀 Coming soon!', 'info')}
                    className="bg-green-600/30 hover:bg-green-600/50 border border-green-400 text-white font-semibold px-6 py-3 rounded-lg transition-all hover:shadow-[0_0_20px_rgba(34,197,94,0.6)]"
                  >
                    📢 Send Announcement
                  </button>
                  <button
                    onClick={() => addToast('🔥 God Mode Active!', 'success')}
                    className="bg-pink-600/30 hover:bg-pink-600/50 border border-pink-400 text-white font-semibold px-6 py-3 rounded-lg transition-all hover:shadow-[0_0_20px_rgba(236,72,153,0.6)]"
                  >
                    👑 God Powers
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="card-glass p-6 border-2 border-purple-400/50">
              <h3 className="text-3xl font-heading font-bold text-purple-300 mb-6">👥 User Management</h3>
              
              <div className="max-h-[600px] overflow-y-auto space-y-3">
                {allUsers.map((user) => (
                  <div
                    key={user.id}
                    className="bg-black/40 p-4 rounded-lg border border-gray-700 hover:border-purple-400 transition-all"
                  >
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <div className="flex items-center gap-3">
                        <img src={user.avatar_url} alt={user.username} className="w-12 h-12 rounded-full" />
                        <div>
                          <p className="font-bold text-white">{user.username}</p>
                          <p className="text-sm text-gray-400">
                            Level {user.level} | {user.xp.toLocaleString()} XP | {user.coins.toLocaleString()} 🪙
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <button
                          onClick={() => grantCoins(user.id, 1000)}
                          className="bg-yellow-600/30 hover:bg-yellow-600/50 border border-yellow-400 text-white px-3 py-1 rounded text-sm"
                          title="Grant 1000 coins"
                        >
                          💰 +1000
                        </button>
                        <button
                          onClick={() => resetUserAP(user.id)}
                          className="bg-green-600/30 hover:bg-green-600/50 border border-green-400 text-white px-3 py-1 rounded text-sm"
                          title="Reset AP to 20"
                        >
                          ⚡ Reset AP
                        </button>
                        <button
                          onClick={() => banUser(user.id)}
                          className="bg-red-600/30 hover:bg-red-600/50 border border-red-400 text-white px-3 py-1 rounded text-sm"
                          title="Ban user"
                        >
                          🔨 Ban
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
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
    </div>
  );
};

export default AdminPortal;
