import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import BackButton from './BackButton';



type PlayerLeaderboardEntry = {
  id: string;
  username: string;
  avatar_url: string;
  value: number;
  batch: string;
  is_self?: boolean;
  last_seen?: string;
  role?: string;
};

type RankedPlayerEntry = PlayerLeaderboardEntry & { rank: number };

type ClanLeaderboardEntry = {
  id: string;
  name: string;
  member_count: number;
  total_xp: number;
};

type RankedClanEntry = ClanLeaderboardEntry & { rank: number };

interface LeaderboardViewProps {
  onComplete: () => void;
  currentUserId: string;
}

const rankPlayers = (entries: PlayerLeaderboardEntry[]): RankedPlayerEntry[] =>
  entries
    .slice()
    .sort((a, b) => {
      const diff = b.value - a.value;
      if (diff !== 0) return diff;
      return a.username.localeCompare(b.username);
    })
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

const rankClans = (entries: ClanLeaderboardEntry[]): RankedClanEntry[] =>
  entries
    .slice()
    .sort((a, b) => {
      const diff = b.total_xp - a.total_xp;
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    })
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

const LeaderboardView: React.FC<LeaderboardViewProps> = ({ onComplete, currentUserId }) => {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'xp' | 'pvp' | 'clans'>('xp');
  const [xpLeaderboard, setXpLeaderboard] = useState<RankedPlayerEntry[]>([]);
  const [pvpLeaderboard, setPvpLeaderboard] = useState<RankedPlayerEntry[]>([]);
  const [clanLeaderboard, setClanLeaderboard] = useState<RankedClanEntry[]>([]);

  useEffect(() => {
    fetchLeaderboards();

    const handler = () => fetchLeaderboards();
    window.addEventListener('leaderboards:refresh', handler);
    return () => {
      window.removeEventListener('leaderboards:refresh', handler);
    };
  }, []);

  const fetchLeaderboards = async () => {
    setLoading(true);
    try {
      // XP Leaderboard - unified view filters admins/bots
      const { data: xpData, error: xpError } = await supabase
        .from('leaderboard_player_stats')
        .select('id, username, avatar_url, xp, batch, grade, last_seen, pvp_wins')
        .order('xp', { ascending: false })
        .limit(50);

      let realXpEntries: PlayerLeaderboardEntry[] = [];
      if (!xpError && xpData) {
        realXpEntries = xpData.map((user: any) => ({
          id: user.id,
          username: user.username,
          avatar_url: user.avatar_url,
          value: Number(user.xp ?? 0),
          batch: user.batch,
          is_self: user.id === currentUserId,
          last_seen: user.last_seen,
        }));
      }

      // PvP Wins Leaderboard
      const { data: pvpData, error: pvpError } = await supabase
        .from('leaderboard_player_stats')
        .select('id, username, avatar_url, batch, last_seen, pvp_wins')
        .order('pvp_wins', { ascending: false })
        .limit(50);

      let realPvpEntries: PlayerLeaderboardEntry[] = [];
      if (!pvpError && pvpData) {
        realPvpEntries = pvpData
          .filter((row: any) => (row.pvp_wins ?? 0) > 0)
          .map((row: any) => ({
            id: row.id,
            username: row.username,
            avatar_url: row.avatar_url,
            value: Number(row.pvp_wins ?? 0),
            batch: row.batch,
            is_self: row.id === currentUserId,
            last_seen: row.last_seen,
          }));
      }

      // Clan Leaderboard (by total XP)
      const { data: clanData, error: clanError } = await supabase
        .from('leaderboard_clan_stats')
        .select('id, name, member_count, total_xp')
        .order('total_xp', { ascending: false })
        .limit(20);

      let clansWithXP: ClanLeaderboardEntry[] = [];
      if (!clanError && clanData) {
        clansWithXP = clanData.map((clan: any) => ({
          id: clan.id,
          name: clan.name,
          member_count: clan.member_count,
          total_xp: clan.total_xp,
        }));
      }

      setXpLeaderboard(rankPlayers(realXpEntries).slice(0, 50));
      setPvpLeaderboard(rankPlayers(realPvpEntries).slice(0, 50));
      setClanLeaderboard(rankClans(clansWithXP).slice(0, 20));
    } catch (error) {
      console.error('Failed to fetch leaderboards:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderPlayerRow = (entry: RankedPlayerEntry) => {
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
        key={`${entry.rank}-${entry.id}`}
        className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
          entry.is_self
            ? 'bg-cyan-500/20 border border-cyan-400'
            : 'bg-black/20 hover:bg-black/30'
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
          <p className="font-semibold text-white">
            {entry.username} {entry.is_self && '(You)'}
          </p>
          <p className="text-xs text-gray-400">Batch {entry.batch}</p>
        </div>
        <div className="text-right">
          <p className="font-bold text-white text-lg">{entry.value.toLocaleString()}</p>
          <p className="text-xs text-gray-400">{tab === 'xp' ? 'XP' : 'Wins'}</p>
        </div>
      </div>
    );
  };

  const renderClanRow = (clan: RankedClanEntry) => {
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
