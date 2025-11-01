import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { Profile } from '../types';
import BackButton from './BackButton';

interface LeaderboardEntry {
  rank: number;
  username: string;
  avatar_url: string;
  value: number;
  batch: string;
  is_self?: boolean;
  last_seen?: string;
}

interface LeaderboardViewProps {
  onComplete: () => void;
  currentUserId: string;
}

const LeaderboardView: React.FC<LeaderboardViewProps> = ({ onComplete, currentUserId }) => {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'xp' | 'pvp' | 'clans'>('xp');
  const [xpLeaderboard, setXpLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [pvpLeaderboard, setPvpLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [clanLeaderboard, setClanLeaderboard] = useState<any[]>([]);

  useEffect(() => {
    fetchLeaderboards();
  }, []);

  const fetchLeaderboards = async () => {
    setLoading(true);
    try {
      // XP Leaderboard - Exclude teachers
      const { data: xpData, error: xpError } = await supabase
        .from('users')
        .select('id, username, avatar_url, xp, batch, last_seen')
        .neq('role', 'teacher')
        .order('xp', { ascending: false })
        .limit(50);

      if (!xpError && xpData) {
        const xpLB = xpData.map((user, index) => ({
          rank: index + 1,
          username: user.username,
          avatar_url: user.avatar_url,
          value: user.xp,
          batch: user.batch,
          is_self: user.id === currentUserId,
          last_seen: user.last_seen,
        }));
        setXpLeaderboard(xpLB);
      }

      // PvP Wins Leaderboard (count pvp_win activities per user)
      const { data: pvpData, error: pvpError } = await supabase
        .from('activities')
        .select('actor_id, actor_username')
        .eq('kind', 'pvp_win');

      if (!pvpError && pvpData) {
        // Count wins per user
        const winCounts: Record<string, { username: string; wins: number; actor_id: string }> = {};
        pvpData.forEach(activity => {
          if (!winCounts[activity.actor_id]) {
            winCounts[activity.actor_id] = {
              actor_id: activity.actor_id,
              username: activity.actor_username,
              wins: 0,
            };
          }
          winCounts[activity.actor_id].wins++;
        });

        // Fetch avatars for top PvP players
        const topPvpIds = Object.keys(winCounts);
        const { data: avatars } = await supabase
          .from('users')
          .select('id, avatar_url, batch, last_seen')
          .in('id', topPvpIds);

        const avatarMap: Record<string, { avatar_url: string; batch: string; last_seen?: string }> = {};
        (avatars || []).forEach((u: any) => {
          avatarMap[u.id] = { avatar_url: u.avatar_url, batch: u.batch, last_seen: u.last_seen };
        });

        const pvpLB = Object.values(winCounts)
          .sort((a, b) => b.wins - a.wins)
          .slice(0, 50)
          .map((entry, index) => ({
            rank: index + 1,
            username: entry.username,
            avatar_url: avatarMap[entry.actor_id]?.avatar_url || '',
            value: entry.wins,
            batch: avatarMap[entry.actor_id]?.batch || '?',
            is_self: entry.actor_id === currentUserId,
            last_seen: avatarMap[entry.actor_id]?.last_seen,
          }));

        setPvpLeaderboard(pvpLB);
      }

      // Clan Leaderboard (by total XP)
      const { data: clanData, error: clanError } = await supabase
        .from('clans')
        .select(`
          id,
          name,
          member_count,
          clan_members!inner (
            users!inner (xp)
          )
        `);

      if (!clanError && clanData) {
        const clansWithXP = clanData.map((clan: any) => {
          const totalXP = clan.clan_members?.reduce((sum: number, member: any) => {
            return sum + (member.users?.xp || 0);
          }, 0) || 0;

          return {
            id: clan.id,
            name: clan.name,
            member_count: clan.clan_members?.length || 0,
            total_xp: totalXP,
          };
        });

        clansWithXP.sort((a, b) => b.total_xp - a.total_xp);
        const topClans = clansWithXP.slice(0, 20).map((clan, index) => ({
          rank: index + 1,
          ...clan,
        }));

        setClanLeaderboard(topClans);
      }
    } catch (error) {
      console.error('Failed to fetch leaderboards:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderPlayerRow = (entry: LeaderboardEntry) => {
    const rankColors: Record<number, string> = {
      1: 'text-yellow-400',
      2: 'text-gray-300',
      3: 'text-amber-600',
    };

    // Calculate online status
    const getOnlineStatus = (last_seen?: string): { color: string; label: string } => {
      if (!last_seen) return { color: 'bg-gray-500', label: 'Unknown' };
      
      const lastSeenTime = new Date(last_seen).getTime();
      const now = Date.now();
      const minutesAgo = (now - lastSeenTime) / 1000 / 60;
      
      if (minutesAgo < 5) {
        return { color: 'bg-green-500', label: 'Online' };
      } else if (minutesAgo < 30) {
        return { color: 'bg-yellow-500', label: 'Away' };
      } else {
        return { color: 'bg-red-500', label: 'Offline' };
      }
    };
    
    const status = getOnlineStatus(entry.last_seen);

    return (
      <div
        key={`${entry.rank}-${entry.username}`}
        className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
          entry.is_self ? 'bg-cyan-500/20 border border-cyan-400' : 'bg-black/20 hover:bg-black/30'
        }`}
      >
        <div className={`font-bold text-lg w-8 text-center ${rankColors[entry.rank] || 'text-gray-400'}`}>
          {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : `#${entry.rank}`}
        </div>
        <div className="relative">
          <img
            src={entry.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${entry.username}`}
            alt={entry.username}
            className="w-10 h-10 rounded-full border-2 border-gray-600"
          />
          <div 
            className={`absolute bottom-0 right-0 w-3 h-3 ${status.color} rounded-full border-2 border-gray-900`}
            title={status.label}
          />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-white">{entry.username} {entry.is_self && '(You)'}</p>
          <p className="text-xs text-gray-400">Batch {entry.batch}</p>
        </div>
        <div className="text-right">
          <p className="font-bold text-white text-lg">{entry.value.toLocaleString()}</p>
          <p className="text-xs text-gray-400">{tab === 'xp' ? 'XP' : 'Wins'}</p>
        </div>
      </div>
    );
  };

  const renderClanRow = (clan: any) => {
    const rankColors: Record<number, string> = {
      1: 'text-yellow-400',
      2: 'text-gray-300',
      3: 'text-amber-600',
    };

    return (
      <div
        key={clan.id}
        className="flex items-center gap-3 p-3 rounded-lg bg-black/20 hover:bg-black/30 transition-all"
      >
        <div className={`font-bold text-lg w-8 text-center ${rankColors[clan.rank] || 'text-gray-400'}`}>
          {clan.rank <= 3 ? ['🥇', '🥈', '🥉'][clan.rank - 1] : `#${clan.rank}`}
        </div>
        <div className="flex-1">
          <p className="font-semibold text-white">{clan.name}</p>
          <p className="text-xs text-gray-400">{clan.member_count} members</p>
        </div>
        <div className="text-right">
          <p className="font-bold text-white text-lg">{clan.total_xp.toLocaleString()}</p>
          <p className="text-xs text-gray-400">Total XP</p>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="font-heading text-2xl animate-pulse text-center mt-20" style={{ color: 'var(--amber-warn)' }}>
        Loading Leaderboards...
      </div>
    );
  }

  return (
    <div className="mt-6 max-w-4xl mx-auto">
      <BackButton onClick={onComplete} />
      <h2 className="font-heading text-3xl text-center mb-6" style={{ color: 'var(--amber-warn)' }}>
        🏆 Leaderboards
      </h2>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 justify-center">
        <button
          onClick={() => setTab('xp')}
          className={`px-6 py-2 rounded-lg font-heading transition-all ${
            tab === 'xp'
              ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white'
              : 'bg-black/20 text-gray-400 hover:text-white'
          }`}
        >
          Top XP
        </button>
        <button
          onClick={() => setTab('pvp')}
          className={`px-6 py-2 rounded-lg font-heading transition-all ${
            tab === 'pvp'
              ? 'bg-gradient-to-r from-red-600 to-pink-600 text-white'
              : 'bg-black/20 text-gray-400 hover:text-white'
          }`}
        >
          PvP Champions
        </button>
        <button
          onClick={() => setTab('clans')}
          className={`px-6 py-2 rounded-lg font-heading transition-all ${
            tab === 'clans'
              ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white'
              : 'bg-black/20 text-gray-400 hover:text-white'
          }`}
        >
          Top Clans
        </button>
      </div>

      {/* Leaderboard Content */}
      <div className="card-glass p-6 max-h-[600px] overflow-y-auto">
        <div className="space-y-2">
          {tab === 'xp' && xpLeaderboard.map(renderPlayerRow)}
          {tab === 'pvp' && pvpLeaderboard.map(renderPlayerRow)}
          {tab === 'clans' && clanLeaderboard.map(renderClanRow)}
          
          {tab === 'xp' && xpLeaderboard.length === 0 && <p className="text-center text-gray-400">No data yet</p>}
          {tab === 'pvp' && pvpLeaderboard.length === 0 && <p className="text-center text-gray-400">No PvP battles yet</p>}
          {tab === 'clans' && clanLeaderboard.length === 0 && <p className="text-center text-gray-400">No clans yet</p>}
        </div>
      </div>
    </div>
  );
};

export default LeaderboardView;
