import React, { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { supabase } from '../services/supabaseClient';
import BackButton from './BackButton';
import { ClanMember } from '../types';
import AvatarWithFrame from './AvatarWithFrame';
import { fetchNeonFrameOwners, fetchFlickerThemeOwners, fetchGlitchEffectOwners } from '../services/cosmeticService';
import { neonIcon } from './visualAssets';
import ClickableUsername from './ClickableUsername';
import BrainsMasterBadge from './BrainsMasterBadge';



type PlayerLeaderboardEntry = {
  id: string;
  username: string;
  avatar_url: string;
  value: number;
  batch: string;
  is_self?: boolean;
  last_seen?: string;
  role?: string;
  active_cosmetic_frame?: 'neon' | null;
  active_cosmetic_theme?: 'flicker' | null;
  active_cosmetic_effect?: 'glitch' | null;
  brains_master_show_badge?: boolean;
  brains_master_until?: string | null;
};

type RankedPlayerEntry = PlayerLeaderboardEntry & { rank: number };

type ClanLeaderboardEntry = {
  id: string;
  name: string;
  member_count: number;
  clan_total_score: number;
  avg_member_score?: number;
  highest_member_score?: number;
};

type RankedClanEntry = ClanLeaderboardEntry & { rank: number };

interface LeaderboardViewProps {
  onComplete: () => void;
  currentUserId: string;
  schoolId?: string | null;
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
      const diff = b.clan_total_score - a.clan_total_score;
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    })
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

const LeaderboardView: React.FC<LeaderboardViewProps> = ({ onComplete, currentUserId, schoolId }) => {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'score' | 'xp' | 'pvp' | 'clans'>('score');
  const [scoreLeaderboard, setScoreLeaderboard] = useState<RankedPlayerEntry[]>([]);
  const [xpLeaderboard, setXpLeaderboard] = useState<RankedPlayerEntry[]>([]);
  const [pvpLeaderboard, setPvpLeaderboard] = useState<RankedPlayerEntry[]>([]);
  const [clanLeaderboard, setClanLeaderboard] = useState<RankedClanEntry[]>([]);
  const [clanMembersModal, setClanMembersModal] = useState<{
    clan: RankedClanEntry;
    members: ClanMember[];
    loading: boolean;
    error: string | null;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const modalOverlayRef = useRef<HTMLDivElement | null>(null);
  const modalPanelRef = useRef<HTMLDivElement | null>(null);
  const initialAnimatedRef = useRef(false);
  const previousTabRef = useRef(tab);
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    reduceMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    fetchLeaderboards();

    const handler = () => fetchLeaderboards();
    window.addEventListener('leaderboards:refresh', handler);
    return () => {
      window.removeEventListener('leaderboards:refresh', handler);
    };
  }, [schoolId]);

  const fetchLeaderboards = async () => {
    setLoading(true);
    try {
      // Use school-scoped RPCs to enforce tenant isolation
      const [
        scoreResult,
        xpResult,
        pvpResult,
        clanResult,
      ] = await Promise.all([
        supabase.rpc('get_school_leaderboard', { p_sort_by: 'total_score', p_limit: 100 }),
        supabase.rpc('get_school_leaderboard', { p_sort_by: 'xp', p_limit: 100 }),
        supabase.rpc('get_school_leaderboard', { p_sort_by: 'pvp_score', p_limit: 100 }),
        supabase.rpc('get_school_clan_leaderboard', { p_limit: 20 }),
      ]);

      const { data: totalPlayers, error: totalError } = scoreResult;
      const { data: xpPlayers, error: xpError } = xpResult;
      const { data: pvpPlayers, error: pvpError } = pvpResult;
      const { data: clanData, error: clanError } = clanResult;

      let scoreEntries: PlayerLeaderboardEntry[] = [];
      let xpEntries: PlayerLeaderboardEntry[] = [];
      let pvpEntries: PlayerLeaderboardEntry[] = [];

      if (!totalError && totalPlayers) {
        scoreEntries = totalPlayers.map((row: any) => ({
          id: row.id,
          username: row.username ?? 'Unknown agent',
          avatar_url: row.avatar_url || '',
          value: Number(row.total_score ?? 0),
          batch: row.batch ?? '—',
          is_self: row.id === currentUserId,
          last_seen: row.updated_at,
        }));
      }

      if (!xpError && xpPlayers) {
        xpEntries = xpPlayers.map((row: any) => ({
          id: row.id,
          username: row.username ?? 'Unknown agent',
          avatar_url: row.avatar_url || '',
          value: Number(row.xp ?? 0),
          batch: row.batch ?? '—',
          is_self: row.id === currentUserId,
          last_seen: row.updated_at,
        }));
      }

      if (!pvpError && pvpPlayers) {
        pvpEntries = pvpPlayers
          .filter((row: any) => Number(row.pvp_score ?? 0) > 0)
          .map((row: any) => ({
            id: row.id,
            username: row.username ?? 'Unknown agent',
            avatar_url: row.avatar_url || '',
            value: Number(row.pvp_score ?? 0),
            batch: row.batch ?? '—',
            is_self: row.id === currentUserId,
            last_seen: row.updated_at,
          }));
      }

      let clansWithScores: ClanLeaderboardEntry[] = [];
      if (!clanError && clanData) {
        clansWithScores = clanData.map((clan: any) => ({
          id: clan.id,
          name: clan.name,
          member_count: clan.member_count ?? 0,
          clan_total_score: Number(clan.clan_total_score ?? 0),
          avg_member_score: clan.avg_member_score,
          highest_member_score: clan.highest_member_score,
        }));
      }

      const uniquePlayerIds = Array.from(new Set([
        ...scoreEntries.map(entry => entry.id),
        ...xpEntries.map(entry => entry.id),
        ...pvpEntries.map(entry => entry.id),
      ]));
      const [neonOwners, flickerOwners, glitchOwners] = await Promise.all([
        fetchNeonFrameOwners(uniquePlayerIds),
        fetchFlickerThemeOwners(uniquePlayerIds),
        fetchGlitchEffectOwners(uniquePlayerIds),
      ]);

      const decorateWithCosmetics = (entry: PlayerLeaderboardEntry): PlayerLeaderboardEntry => ({
        ...entry,
        active_cosmetic_frame: neonOwners.has(entry.id) ? 'neon' : null,
        active_cosmetic_theme: flickerOwners.has(entry.id) ? 'flicker' : null,
        active_cosmetic_effect: glitchOwners.has(entry.id) ? 'glitch' : null,
      });

      setScoreLeaderboard(rankPlayers(scoreEntries.map(decorateWithCosmetics)).slice(0, 50));
      setXpLeaderboard(rankPlayers(xpEntries.map(decorateWithCosmetics)).slice(0, 50));
      setPvpLeaderboard(rankPlayers(pvpEntries.map(decorateWithCosmetics)).slice(0, 50));
      setClanLeaderboard(rankClans(clansWithScores).slice(0, 20));
    } catch (error) {
      console.error('Failed to fetch leaderboards:', error);
    } finally {
      setLoading(false);
    }
  };

  const openClanMembers = async (clan: RankedClanEntry) => {
    setClanMembersModal({ clan, members: [], loading: true, error: null });

    try {
      const { data, error } = await supabase.rpc('rpc_get_clan_members', { p_clan_id: clan.id });

      if (error) throw error;

      const members: ClanMember[] = (data || []).map((member: any) => ({
        user_id: member.player_id,
        username: member.username ?? 'Unknown agent',
        role: (member.role_name as ClanMember['role']) || 'member',
        contribution: Number(member.total_score ?? 0),
        avatar_url: member.avatar_url || '',
        total_score: member.total_score,
        xp: member.xp,
        pvp_score: member.pvp_score,
        bio: member.bio,
        custom_title: member.custom_title,
      }));

      const [neonOwners, flickerOwners, glitchOwners] = await Promise.all([
        fetchNeonFrameOwners(members.map(member => member.user_id)),
        fetchFlickerThemeOwners(members.map(member => member.user_id)),
        fetchGlitchEffectOwners(members.map(member => member.user_id)),
      ]);
      const membersWithCosmetics = members.map(member => ({
        ...member,
        active_cosmetic_frame: neonOwners.has(member.user_id) ? 'neon' : null,
        active_cosmetic_theme: flickerOwners.has(member.user_id) ? 'flicker' : null,
        active_cosmetic_effect: glitchOwners.has(member.user_id) ? 'glitch' : null,
      }));

      setClanMembersModal({ clan, members: membersWithCosmetics, loading: false, error: null });
    } catch (err: any) {
      const message = err?.message || 'Failed to load clan members.';
      setClanMembersModal(prev => (prev ? { ...prev, loading: false, error: message } : prev));
    }
  };

  useEffect(() => {
    if (!rootRef.current || loading || reduceMotionRef.current || initialAnimatedRef.current) return;

    const ctx = gsap.context(() => {
      gsap.set('[data-lb-title], [data-lb-tab]', { willChange: 'transform, opacity' });
      gsap.from('[data-lb-title]', {
        opacity: 0,
        y: -20,
        duration: 0.5,
        ease: 'power3.out',
        clearProps: 'all',
      });
      gsap.from('[data-lb-title-icon]', {
        opacity: 0,
        scale: 0.6,
        rotate: -25,
        duration: 0.6,
        ease: 'back.out(1.6)',
        delay: 0.08,
        clearProps: 'all',
      });
      gsap.from('[data-lb-tab]', {
        opacity: 0,
        y: 14,
        stagger: 0.06,
        duration: 0.45,
        ease: 'power2.out',
        delay: 0.12,
        clearProps: 'all',
      });
    }, rootRef);

    initialAnimatedRef.current = true;
    return () => ctx.revert();
  }, [loading]);

  useEffect(() => {
    if (!contentRef.current || loading || reduceMotionRef.current) {
      previousTabRef.current = tab;
      return;
    }

    const rows = Array.from(contentRef.current.querySelectorAll('[data-lb-row]'));
    if (rows.length === 0) {
      previousTabRef.current = tab;
      return;
    }

    const isTabSwitch = previousTabRef.current !== tab;
    const topRows = rows.filter(row => Number(row.getAttribute('data-lb-rank')) <= 3);
    const otherRows = rows.filter(row => Number(row.getAttribute('data-lb-rank')) > 3);

    const tl = gsap.timeline();
    tl.set(rows, { willChange: 'transform, opacity' });
    tl.from(rows, {
      opacity: 0,
      y: isTabSwitch ? 12 : 18,
      duration: isTabSwitch ? 0.3 : 0.4,
      stagger: 0.035,
      ease: 'power2.out',
    });

    if (topRows.length) {
      tl.from(
        topRows,
        {
          scale: 0.97,
          filter: 'brightness(1.35)',
          duration: 0.45,
          stagger: 0.04,
          ease: 'power2.out',
        },
        '<0.05'
      );
    }

    if (otherRows.length) {
      tl.from(
        otherRows,
        {
          opacity: 0.92,
          duration: 0.2,
          stagger: 0.02,
          ease: 'none',
        },
        '<'
      );
    }

    tl.set(rows, { clearProps: 'all' });
    previousTabRef.current = tab;

    return () => { tl.kill(); };
  }, [tab, loading, scoreLeaderboard, xpLeaderboard, pvpLeaderboard, clanLeaderboard]);

  useEffect(() => {
    if (!clanMembersModal || reduceMotionRef.current) return;

    const overlay = modalOverlayRef.current;
    const panel = modalPanelRef.current;
    if (!overlay || !panel) return;

    const memberRows = Array.from(panel.querySelectorAll('[data-clan-member-row]'));
    const tl = gsap.timeline();
    tl.set([overlay, panel], { willChange: 'transform, opacity' });
    tl.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.22, ease: 'power2.out' });
    tl.fromTo(panel, { opacity: 0, y: 18, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: 'power3.out' }, '<0.02');
    if (memberRows.length > 0 && !clanMembersModal.loading && !clanMembersModal.error) {
      tl.from(memberRows, {
        opacity: 0,
        y: 10,
        duration: 0.24,
        stagger: 0.035,
        ease: 'power2.out',
      }, '<0.06');
    }
    tl.set([overlay, panel], { clearProps: 'all' });

    return () => { tl.kill(); };
  }, [clanMembersModal]);

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
    const metricLabel = tab === 'score' ? 'Score' : tab === 'xp' ? 'XP' : 'PvP';
    const displayName = entry.username.length > 12 ? `${entry.username.slice(0, 12)}…` : entry.username;

    return (
      <div
        key={`${entry.rank}-${entry.id}`}
        data-lb-row
        data-lb-rank={entry.rank}
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
          <AvatarWithFrame
            src={entry.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${entry.username}`}
            alt={entry.username}
            size="md"
            hasNeonFrame={entry.active_cosmetic_frame === 'neon'}
            hasGlitchTheme={entry.active_cosmetic_theme === 'flicker'}
            hasGlitchEffect={entry.active_cosmetic_effect === 'glitch'}
          />
          <div 
            className={`absolute bottom-0 right-0 w-3 h-3 ${status.color} rounded-full border-2 border-gray-900`}
            title={status.label}
          />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-white">
            <ClickableUsername userId={entry.id} username={entry.username} className="cursor-pointer text-cyan-300 hover:text-cyan-200 transition-colors underline decoration-dotted decoration-cyan-400/60 underline-offset-2">
              <span title={entry.username}>{displayName}</span>
            </ClickableUsername>
            <BrainsMasterBadge showBadge={entry.brains_master_show_badge} until={entry.brains_master_until} />
            {entry.is_self && ' (You)'}
          </p>
          <p className="text-xs text-gray-400">Batch {entry.batch}</p>
        </div>
        <div className="text-right">
          <p className="font-bold text-white text-lg">{entry.value.toLocaleString()}</p>
          <p className="text-xs text-gray-400">{metricLabel}</p>
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
      <button
        key={clan.id}
        data-lb-row
        data-lb-rank={clan.rank}
        type="button"
        onClick={() => openClanMembers(clan)}
        className="flex w-full items-center gap-3 p-3 rounded-lg bg-black/20 hover:bg-black/30 transition-all text-left"
      >
        <div className={`font-bold text-lg w-8 text-center ${rankColors[clan.rank] || 'text-gray-400'}`}>
          {clan.rank <= 3 ? ['🥇', '🥈', '🥉'][clan.rank - 1] : `#${clan.rank}`}
        </div>
        <div className="flex-1">
          <p className="font-semibold text-white flex items-center gap-2">
            <span>{clan.name}</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-white/10 text-gray-200 border border-white/10">
              {clan.member_count} members
            </span>
          </p>
          <p className="text-xs text-gray-400">Tap to view roster</p>
        </div>
        <div className="text-right">
          <p className="font-bold text-white text-lg">{clan.clan_total_score.toLocaleString()}</p>
          <p className="text-xs text-gray-400">Clan Score</p>
          {typeof clan.avg_member_score === 'number' && (
            <p className="text-[11px] text-gray-500">Avg {Math.round(clan.avg_member_score).toLocaleString()}</p>
          )}
        </div>
      </button>
    );
  };

  if (!schoolId && scoreLeaderboard.length === 0 && !loading) {
    return (
      <div className="mt-6 max-w-2xl mx-auto text-center">
        <BackButton onClick={onComplete} />
        <div className="card-glass p-6">
          <h2 className="font-heading text-2xl text-white">No players found</h2>
          <p className="mt-2 text-sm text-gray-400">
            There are no other individual players on the leaderboard yet. Keep playing to be the first!
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center mt-20">
        <img src="/BRAINS.svg" alt="Loading..." className="w-32 h-32 animate-pulse" style={{ filter: 'drop-shadow(0 0 30px rgba(0, 212, 255, 0.6))' }} />
      </div>
    );
  }

  return (
    <div ref={rootRef} className="mt-6 max-w-4xl mx-auto">
      <BackButton onClick={onComplete} />
      <h2 data-lb-title className="font-heading text-3xl text-center mb-6 flex items-center justify-center gap-3" style={{ color: 'var(--amber-warn)' }}>
        <img data-lb-title-icon src={neonIcon('leaderboard')} alt="" className="w-8 h-8 object-contain" />
        Leaderboards
      </h2>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 justify-center flex-wrap">
        <button
          data-lb-tab
          onClick={() => setTab('score')}
          className={`px-6 py-2 rounded-lg font-heading transition-all ${
            tab === 'score'
              ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-white'
              : 'bg-black/20 text-gray-400 hover:text-white'
          }`}
        >
          Total Score
        </button>
        <button
          data-lb-tab
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
          data-lb-tab
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
          data-lb-tab
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
      <div className="card-glass p-6 max-h-[70vh] md:max-h-[600px] flex flex-col">
        <div ref={contentRef} className="space-y-2 overflow-y-auto pr-1 flex-1 min-h-0">
          {tab === 'score' && scoreLeaderboard.map(renderPlayerRow)}
          {tab === 'xp' && xpLeaderboard.map(renderPlayerRow)}
          {tab === 'pvp' && pvpLeaderboard.map(renderPlayerRow)}
          {tab === 'clans' && clanLeaderboard.map(renderClanRow)}
          
          {tab === 'score' && scoreLeaderboard.length === 0 && <p className="text-center text-gray-400">No score data yet</p>}
          {tab === 'xp' && xpLeaderboard.length === 0 && <p className="text-center text-gray-400">No data yet</p>}
          {tab === 'pvp' && pvpLeaderboard.length === 0 && <p className="text-center text-gray-400">No PvP battles yet</p>}
          {tab === 'clans' && clanLeaderboard.length === 0 && <p className="text-center text-gray-400">No clans yet</p>}
        </div>
      </div>

      {clanMembersModal && (
        <div ref={modalOverlayRef} className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div ref={modalPanelRef} className="card-glass w-full max-w-lg m-4 p-6 border border-amber-400/50">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-heading text-2xl text-amber-300">{clanMembersModal.clan.name}</h3>
                <p className="text-sm text-gray-400">
                  {clanMembersModal.clan.member_count} members • Tap a clan row to view its roster
                </p>
              </div>
              <button
                type="button"
                onClick={() => setClanMembersModal(null)}
                className="text-gray-300 hover:text-white px-3 py-1 rounded-lg bg-white/10"
              >
                Close
              </button>
            </div>

            {clanMembersModal.loading && <p className="text-center text-gray-300 py-4">Loading members...</p>}
            {!clanMembersModal.loading && clanMembersModal.error && (
              <p className="text-center text-danger-red py-4">{clanMembersModal.error}</p>
            )}
            {!clanMembersModal.loading && !clanMembersModal.error && (
              <ul className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {clanMembersModal.members.length === 0 ? (
                  <li className="text-center text-gray-300 py-4">No members yet.</li>
                ) : (
                  clanMembersModal.members.map(member => (
                    <li key={member.user_id} data-clan-member-row className="flex items-start justify-between bg-black/20 p-3 rounded-lg">
                      <div className="flex items-start gap-3">
                        <AvatarWithFrame
                          src={member.avatar_url || `https://api.dicebear.com/7.x/shapes/svg?seed=${member.username}`}
                          alt={member.username}
                          size="md"
                          hasNeonFrame={member.active_cosmetic_frame === 'neon'}
                          hasGlitchTheme={member.active_cosmetic_theme === 'flicker'}
                          hasGlitchEffect={member.active_cosmetic_effect === 'glitch'}
                        />
                        <div>
                          <p className="font-semibold text-white flex items-center gap-2">
                            <ClickableUsername userId={member.user_id} username={member.username}>
                              {member.username}
                            </ClickableUsername>
                            {member.custom_title && (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-amber-200">
                                {member.custom_title}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-400 capitalize">{member.role}</p>
                          {member.bio && <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{member.bio}</p>}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-amber-300">{(member.total_score ?? member.contribution ?? 0).toLocaleString()} pts</p>
                        <p className="text-xs text-gray-400">XP {(member.xp ?? 0).toLocaleString()} • PvP {member.pvp_score ?? 0}</p>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LeaderboardView;
