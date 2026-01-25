import React, { useState, useEffect, useMemo } from 'react';
import { RaidTarget, RaidAttackResult, Profile, XpStatus } from '../types';
import * as GameService from '../services/gameService';
import { supabase } from '../services/supabaseClient';
import { audioService } from '../services/audioService';
import BackButton from './BackButton';
import { ShieldIcon, HackIcon, CoinIcon, XPIcon, GemIcon, BattleIcon, TrophyIcon } from './icons';
import { createPortal } from 'react-dom';
import AvatarWithFrame from './AvatarWithFrame';
import { fetchNeonFrameOwners, fetchFlickerThemeOwners, fetchGlitchEffectOwners } from '../services/cosmeticService';
import ClickableUsername from './ClickableUsername';

type PvPStage = 'loading' | 'targets' | 'cinematic' | 'result';

interface BattleNarration {
  text: string;
  delay: number;
  color?: string;
  icon?: string;
}

const RAID_AP_COST = 2;

interface PvPViewProps {
  profile: Profile;
  onComplete: () => void;
  onGrantReward: (
    deltas: { xp?: number; coins?: number; gemstones?: number; ap?: number },
    finalValues?: { xp: number; coins: number; level: number; gemstones: number; xp_status?: XpStatus }
  ) => void;
}

const TargetCard: React.FC<{ target: RaidTarget, onSelect: (target: RaidTarget) => void }> = ({ target, onSelect }) => {
  // Calculate online status based on last_seen
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
  
  // Check if target is on cooldown (attacked in last 5 minutes)
  const isOnCooldown = target.last_attacked_at && 
    (Date.now() - new Date(target.last_attacked_at).getTime()) < 5 * 60 * 1000;
  
  const getCooldownRemaining = () => {
    if (!isOnCooldown || !target.last_attacked_at) return 0;
    const elapsed = Date.now() - new Date(target.last_attacked_at).getTime();
    const remaining = (5 * 60 * 1000) - elapsed;
    return Math.ceil(remaining / 1000 / 60); // minutes
  };
  
  const status = getOnlineStatus(target.last_seen);
  const hasNeonFrame = target.active_cosmetic_frame === 'neon';
  const hasGlitchTheme = target.active_cosmetic_theme === 'flicker';
  const hasGlitchEffect = target.active_cosmetic_effect === 'glitch';
  
  return (
    <div className="card-glass p-4 flex flex-col items-center text-center relative overflow-hidden">
      {/* Cooldown Badge */}
      {isOnCooldown && (
        <div className="absolute top-2 left-2 bg-red-500/80 text-white text-xs px-2 py-0.5 rounded-full z-10" title="Recently attacked">
          🕐 {getCooldownRemaining()}m
        </div>
      )}
      
      {target.has_shield && (
        <div className="absolute top-2 right-2 w-6 h-6 text-cyan-400" title="Shield Active">
          <ShieldIcon />
        </div>
      )}
      <div className="relative mb-3">
        <AvatarWithFrame
          src={target.avatar_url}
          alt={target.username}
          size="lg"
          hasNeonFrame={hasNeonFrame}
          hasGlitchTheme={hasGlitchTheme}
          hasGlitchEffect={hasGlitchEffect}
          fallbackFrameClassName="border-2 border-gray-600"
        />
        <div 
          className={`absolute bottom-0 right-0 w-4 h-4 ${status.color} rounded-full border-2 border-gray-900`}
          title={status.label}
        />
      </div>
      <h3 className="font-heading text-lg" style={{ color: 'var(--plasma-pink)' }}>
        <ClickableUsername userId={target.user_id} username={target.username}>
          {target.username}
        </ClickableUsername>
      </h3>
      <p className="text-sm text-gray-400">Lvl {target.level} | Batch {target.batch}</p>
      {target.clan_name && target.clan_id && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            (window as any).openClanMembers?.(target.clan_id, target.clan_name);
          }}
          className="text-xs text-ion-blue mt-1 hover:text-cyan-300 transition-colors underline"
        >
          ⚔️ {target.clan_name}
        </button>
      )}
      {target.clan_name && !target.clan_id && (
        <p className="text-xs text-ion-blue mt-1">⚔️ {target.clan_name}</p>
      )}
      <p className="text-xs text-amber-400 mt-1">~{target.coins.toLocaleString()} Coins</p>
      <button
        onClick={() => onSelect(target)}
        disabled={isOnCooldown}
        className={`mt-4 w-full font-heading font-bold py-2 rounded-xl transition-all duration-200 ${
          isOnCooldown
            ? 'bg-gray-500/20 border border-gray-600 text-gray-500 cursor-not-allowed'
            : 'bg-pink-500/20 hover:bg-pink-500/30 border border-pink-400 text-white'
        }`}
      >
        {isOnCooldown ? `🕐 Cooldown ${getCooldownRemaining()}m` : '⚔️ Attack'}
      </button>
    </div>
  );
};


interface ClanMember {
  user_id: string;
  username: string;
  role: string;
  avatar_url?: string;
  active_cosmetic_frame?: 'neon' | null;
  active_cosmetic_theme?: 'glitch' | null;
}

type TargetFilter = 'all' | 'nearby' | 'easy' | 'challenge' | 'rivals';

const PvPView: React.FC<PvPViewProps> = ({ profile, onComplete, onGrantReward }) => {
  const [stage, setStage] = useState<PvPStage>('loading');
  const [targets, setTargets] = useState<RaidTarget[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<RaidTarget | null>(null);
  const [attackResult, setAttackResult] = useState<RaidAttackResult | null>(null);
  const [useCracker, setUseCracker] = useState(false);
  const [battleNarration, setBattleNarration] = useState<BattleNarration[]>([]);
  const [visibleNarrations, setVisibleNarrations] = useState<number>(0);
  const [clanModal, setClanModal] = useState<{ clanId: string; clanName: string; members: ClanMember[]; loading: boolean } | null>(null);
  const [filterTab, setFilterTab] = useState<TargetFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [levelRange, setLevelRange] = useState<number | null>(null);
  const [minCoins, setMinCoins] = useState<string>('');
  const [hideCooldown, setHideCooldown] = useState(false);

  useEffect(() => {
    GameService.raid_targets().then(data => {
      // Filter out admin users (they cannot be attacked)
      const attackableTargets = data.filter((target: any) => target.role !== 'admin');
      setTargets(attackableTargets);
      setStage('targets');
    });
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim().toLowerCase());
    }, 250);
    return () => window.clearTimeout(handle);
  }, [searchTerm]);

  const sortedTargets = useMemo(() => {
    const stableTargets = targets.map((target, index) => ({ target, index }));
    stableTargets.sort((a, b) => {
      const levelDiffA = Math.abs(a.target.level - profile.level);
      const levelDiffB = Math.abs(b.target.level - profile.level);
      if (levelDiffA !== levelDiffB) return levelDiffA - levelDiffB;
      if (a.target.coins !== b.target.coins) return b.target.coins - a.target.coins;
      const nameCompare = a.target.username.localeCompare(b.target.username, undefined, { sensitivity: 'base' });
      if (nameCompare !== 0) return nameCompare;
      return a.index - b.index;
    });
    return stableTargets.map(({ target }) => target);
  }, [targets, profile.level]);

  const hasCooldownField = useMemo(
    () => sortedTargets.some(target => Boolean(target.last_attacked_at)),
    [sortedTargets]
  );

  const openClanMembers = async (clanId: string, clanName: string) => {
    setClanModal({ clanId, clanName, members: [], loading: true });
    
    try {
      const { data, error } = await supabase
        .from('clan_members')
        .select(`
          user_id,
          role,
          users!inner (
            username,
            avatar_url
          )
        `)
        .eq('clan_id', clanId);

      if (error) throw error;

      const members: ClanMember[] = (data || []).map((m: any) => ({
        user_id: m.user_id,
        username: m.users?.username || 'Unknown',
        role: m.role || 'member',
        avatar_url: m.users?.avatar_url,
      }));

      const neonOwners = await fetchNeonFrameOwners(members.map(member => member.user_id));
      const flickerOwners = await fetchFlickerThemeOwners(members.map(member => member.user_id));
      const glitchOwners = await fetchGlitchEffectOwners(members.map(member => member.user_id));
      const membersWithCosmetics = members.map(member => ({
        ...member,
        active_cosmetic_frame: neonOwners.has(member.user_id) ? 'neon' : null,
        active_cosmetic_theme: flickerOwners.has(member.user_id) ? 'flicker' : null,
        active_cosmetic_effect: glitchOwners.has(member.user_id) ? 'glitch' : null,
      }));

      setClanModal({ clanId, clanName, members: membersWithCosmetics, loading: false });
    } catch (err) {
      console.error('Failed to load clan members:', err);
      setClanModal(null);
    }
  };

  useEffect(() => {
    (window as any).openClanMembers = openClanMembers;
    return () => {
      delete (window as any).openClanMembers;
    };
  }, []);

  const isTargetOnCooldown = (target: RaidTarget) => {
    if (!target.last_attacked_at) return false;
    return (Date.now() - new Date(target.last_attacked_at).getTime()) < 5 * 60 * 1000;
  };

  const getFilteredTargets = () => {
    const baseTargets = sortedTargets;
    switch (filterTab) {
      case 'nearby':
        return baseTargets.filter(t => Math.abs(t.level - profile.level) <= 2);
      case 'easy':
        return baseTargets.filter(t => t.level < profile.level);
      case 'challenge':
        return baseTargets.filter(t => t.level > profile.level);
      case 'rivals':
        return baseTargets.filter(t => t.clan_name && t.clan_name !== profile.clan_name);
      default:
        return baseTargets;
    }
  };

  const filteredTargets = useMemo(() => {
    let nextTargets = getFilteredTargets();
    if (levelRange !== null) {
      nextTargets = nextTargets.filter(target => Math.abs(target.level - profile.level) <= levelRange);
    }
    if (minCoins !== '') {
      const minCoinsValue = Number(minCoins);
      if (!Number.isNaN(minCoinsValue)) {
        nextTargets = nextTargets.filter(target => target.coins >= minCoinsValue);
      }
    }
    if (hideCooldown) {
      nextTargets = nextTargets.filter(target => !isTargetOnCooldown(target));
    }
    if (debouncedSearch) {
      nextTargets = nextTargets.filter(target => {
        const email = (target as RaidTarget & { email?: string }).email;
        const haystack = `${target.username ?? ''} ${email ?? ''}`.toLowerCase();
        return haystack.includes(debouncedSearch);
      });
    }
    return nextTargets;
  }, [debouncedSearch, hideCooldown, levelRange, minCoins, profile.level, filterTab, sortedTargets]);

  const clearFilters = () => {
    setSearchTerm('');
    setDebouncedSearch('');
    setLevelRange(null);
    setMinCoins('');
    setHideCooldown(false);
    setFilterTab('all');
  };

  const handleAttack = async (target: RaidTarget) => {
    if (profile.ap_now < RAID_AP_COST) {
      audioService.play('wrong');
      alert('Not enough Action Points to launch a raid. Regain AP before attacking again.');
      return;
    }

    setSelectedTarget(target);
    setStage('cinematic');
    setBattleNarration([]);
    setVisibleNarrations(0);

    // Generate battle narration based on combat stats
    const narrativeSteps: BattleNarration[] = [];
    
    // Calculate estimated stats (client-side approximation)
    const attackerAttack = profile.attack_power || 10;
    const baseDefense = 10 + (target.level * 2); // Estimate based on level
    const defenderDefense = baseDefense + (target.has_shield ? 20 : 0);
    const winChance = Math.round((attackerAttack / (attackerAttack + defenderDefense)) * 100);

    // Opening
    narrativeSteps.push({
      text: `💥 ${profile.username} charges at ${target.username}!`,
      delay: 0,
      color: 'text-cyan-400'
    });

    // Show combat stats
    narrativeSteps.push({
      text: `⚔️ Your Attack Power: ${attackerAttack}`,
      delay: 600,
      color: 'text-green-400'
    });

    narrativeSteps.push({
      text: `🛡️ Enemy Defense: ${defenderDefense}${target.has_shield ? ' (+20 Shield)' : ''}`,
      delay: 1200,
      color: 'text-yellow-400'
    });

    // Win chance calculation
    narrativeSteps.push({
      text: `🎲 Victory Chance: ${winChance}%`,
      delay: 1800,
      color: 'text-purple-400'
    });

    // Rolling
    narrativeSteps.push({
      text: `🎰 Rolling the dice of fate...`,
      delay: 2400,
      color: 'text-pink-400',
      icon: '🎲'
    });

    setBattleNarration(narrativeSteps);

    // Animate narrations appearing
    narrativeSteps.forEach((_, index) => {
      setTimeout(() => {
        setVisibleNarrations(index + 1);
      }, narrativeSteps[index].delay);
    });

    try {
      const requestId = (crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
      // Call the actual attack (starts immediately but runs in parallel with animations)
      const result = await GameService.raid_attack(target.user_id, useCracker, target, requestId);

      console.log('Battle result received:', result); // Debug log
      
      setAttackResult(result);

      // Play appropriate sound based on result
      if (result.result === 'win') {
        audioService.play('hack_win');
      } else if (result.result === 'blocked') {
        audioService.play('hack_fail');
      } else {
        audioService.play('hack_fail');
      }

      const xpDelta = Number(result.attacker_deltas?.xp ?? 0);
      const coinsDelta = Number(result.attacker_deltas?.coins ?? 0);
      const gemstonesDelta = Number(result.attacker_deltas?.gemstones ?? 0);

      // Grant rewards/penalties (server-authoritative AP spend handled in RPC)
      onGrantReward({
        xp: xpDelta,
        coins: coinsDelta,
        gemstones: gemstonesDelta,
      }, result.final_profile_values);

      // Wait for minimum animation time (2.8s) before showing result
      const elapsedTime = 2800;
      setTimeout(() => {
        setStage('result');
      }, elapsedTime);

    } catch (error) {
      console.error('Battle attack error:', error);
      // Show error and go back to targets
      alert('Battle failed and no action points were consumed: ' + (error as Error).message);
      setStage('loading');
      GameService.raid_targets().then(data => {
        setTargets(data);
        setStage('targets');
      });
    }
  };

  const renderTargets = () => (
    <div className="w-full px-4 sm:px-6 py-6">
      <div className="max-w-full mx-auto">
        <h2 className="font-heading text-3xl text-center mb-6 flex items-center justify-center gap-2" style={{ color: 'var(--plasma-pink)' }}><BattleIcon className="w-8 h-8" /> Choose Your Target</h2>

        {/* Filter Bar */}
        <div className="card-glass p-4 mb-6">
          <div className="flex flex-col gap-3">
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search username or email"
              className="w-full bg-black/40 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-pink-400"
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <label className="text-xs text-gray-400">
                  Level range
                  <select
                    value={levelRange ?? ''}
                    onChange={(event) => {
                      const value = event.target.value;
                      setLevelRange(value === '' ? null : Number(value));
                    }}
                    className="mt-1 w-full sm:w-auto bg-black/40 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white"
                  >
                    <option value="">Any</option>
                    <option value="5">±5</option>
                    <option value="10">±10</option>
                    <option value="15">±15</option>
                  </select>
                </label>
                <label className="text-xs text-gray-400">
                  Min coins
                  <input
                    type="number"
                    min="0"
                    value={minCoins}
                    onChange={(event) => setMinCoins(event.target.value)}
                    placeholder="0"
                    className="mt-1 w-full sm:w-32 bg-black/40 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white"
                  />
                </label>
              </div>
              {hasCooldownField && (
                <label className="flex items-center gap-2 text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={hideCooldown}
                    onChange={(event) => setHideCooldown(event.target.checked)}
                    className="h-4 w-4 accent-pink-400"
                  />
                  Hide cooldown targets
                </label>
              )}
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex justify-center gap-2 mb-8 flex-wrap px-2">
          <button
            onClick={() => setFilterTab('all')}
            className={`px-3 py-2 rounded-lg font-semibold transition-all text-sm sm:text-base ${
              filterTab === 'all'
                ? 'bg-pink-500/30 border-2 border-pink-400 text-white'
                : 'bg-black/20 border border-gray-600 text-gray-400 hover:text-white'
            }`}
          >
            All ({sortedTargets.length})
          </button>
          <button
            onClick={() => setFilterTab('nearby')}
            className={`px-3 py-2 rounded-lg font-semibold transition-all text-sm sm:text-base ${
              filterTab === 'nearby'
                ? 'bg-pink-500/30 border-2 border-pink-400 text-white'
                : 'bg-black/20 border border-gray-600 text-gray-400 hover:text-white'
            }`}
          >
            ⚖️ Fair Fights ({sortedTargets.filter(t => Math.abs(t.level - profile.level) <= 2).length})
          </button>
          <button
            onClick={() => setFilterTab('easy')}
            className={`px-3 py-2 rounded-lg font-semibold transition-all text-sm sm:text-base ${
              filterTab === 'easy'
                ? 'bg-pink-500/30 border-2 border-pink-400 text-white'
                : 'bg-black/20 border border-gray-600 text-gray-400 hover:text-white'
            }`}
          >
            ✅ Easy ({sortedTargets.filter(t => t.level < profile.level).length})
          </button>
          <button
            onClick={() => setFilterTab('challenge')}
            className={`px-3 py-2 rounded-lg font-semibold transition-all text-sm sm:text-base ${
              filterTab === 'challenge'
                ? 'bg-pink-500/30 border-2 border-pink-400 text-white'
                : 'bg-black/20 border border-gray-600 text-gray-400 hover:text-white'
            }`}
          >
            💪 Challenges ({sortedTargets.filter(t => t.level > profile.level).length})
          </button>
          <button
            onClick={() => setFilterTab('rivals')}
            className={`px-3 py-2 rounded-lg font-semibold transition-all text-sm sm:text-base ${
              filterTab === 'rivals'
                ? 'bg-pink-500/30 border-2 border-pink-400 text-white'
                : 'bg-black/20 border border-gray-600 text-gray-400 hover:text-white'
            }`}
          >
            ⚔️ Clan Rivals ({sortedTargets.filter(t => t.clan_name && t.clan_name !== profile.clan_name).length})
          </button>
        </div>
        
        {/* Targets Grid */}
        {filteredTargets.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <p className="text-xl">No results found</p>
            <p className="text-sm mt-2">Try adjusting your filters or search.</p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 inline-flex items-center justify-center rounded-lg border border-pink-400 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-500/20"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
            {filteredTargets.map(target => (
              <TargetCard key={target.user_id} target={target} onSelect={handleAttack} />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderCinematic = () => {
    if (!selectedTarget) return null;
    return (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center z-50 p-4 overflow-hidden">
        {/* Battle Arena Background Effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-red-900/20 via-purple-900/20 to-blue-900/20 animate-pulse"></div>
        
        {/* Combatants */}
        <div className="relative z-10 flex items-center justify-around w-full max-w-2xl mb-8">
            <div className="flex flex-col items-center animate-slideInLeft">
                <div className="relative">
                  <AvatarWithFrame
                    src={profile.avatar_url}
                    alt={profile.username}
                    size="xl"
                    hasNeonFrame={profile.active_cosmetic_frame === 'neon'}
                    hasGlitchTheme={profile.active_cosmetic_theme === 'flicker'}
                    hasGlitchEffect={profile.active_cosmetic_effect === 'glitch'}
                    className="shadow-[0_0_30px_rgba(34,211,238,0.6)]"
                    fallbackFrameClassName="border-4 border-cyan-500 shadow-[0_0_30px_rgba(34,211,238,0.6)]"
                    imgClassName="w-24 h-24 md:w-32 md:h-32"
                  />
                  <div className="absolute -top-2 -right-2 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                    ⚔️ {profile.attack_power || 10}
                  </div>
                </div>
                <span className="mt-3 font-heading text-xl text-cyan-400 font-bold">{profile.username}</span>
                <span className="text-sm text-gray-400">Level {profile.level}</span>
            </div>
            
            <div className="relative">
              <div className="font-heading text-5xl md:text-6xl text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-yellow-500 to-red-500 animate-pulse font-black">
                VS
              </div>
              <div className="absolute inset-0 blur-xl bg-gradient-to-r from-red-500 via-yellow-500 to-red-500 opacity-50 animate-pulse"></div>
            </div>
            
            <div className="flex flex-col items-center animate-slideInRight">
                <div className="relative">
                  <AvatarWithFrame
                    src={selectedTarget.avatar_url}
                    alt={selectedTarget.username}
                    size="xl"
                    hasNeonFrame={selectedTarget.active_cosmetic_frame === 'neon'}
                    hasGlitchTheme={selectedTarget.active_cosmetic_theme === 'flicker'}
                    hasGlitchEffect={selectedTarget.active_cosmetic_effect === 'glitch'}
                    className="shadow-[0_0_30px_rgba(236,72,153,0.6)]"
                    fallbackFrameClassName="border-4 border-pink-500 shadow-[0_0_30px_rgba(236,72,153,0.6)]"
                    imgClassName="w-24 h-24 md:w-32 md:h-32"
                  />
                  {selectedTarget.has_shield && (
                    <div className="absolute -top-2 -left-2 bg-yellow-500 text-white text-xs font-bold px-2 py-1 rounded-full animate-pulse">
                      🛡️ +20
                    </div>
                  )}
                  <div className="absolute -bottom-2 -right-2 bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                    🛡️ {10 + (selectedTarget.level * 2) + (selectedTarget.has_shield ? 20 : 0)}
                  </div>
                </div>
                <span className="mt-3 font-heading text-xl text-pink-400 font-bold">{selectedTarget.username}</span>
                <span className="text-sm text-gray-400">Level {selectedTarget.level}</span>
            </div>
        </div>

        {/* Battle Narration */}
        <div className="relative z-10 w-full max-w-2xl bg-black/60 backdrop-blur-sm border-2 border-purple-500/50 rounded-2xl p-6 min-h-[280px] shadow-[0_0_50px_rgba(168,85,247,0.4)]">
          <div className="flex flex-col space-y-3">
            {battleNarration.slice(0, visibleNarrations).map((narration, index) => (
              <div 
                key={index}
                className={`${narration.color || 'text-white'} font-mono text-base md:text-lg font-semibold animate-fade-in-up flex items-center gap-3 ${
                  index === visibleNarrations - 1 ? 'animate-pulse' : ''
                }`}
                style={{ 
                  animationDelay: '0ms',
                  animationFillMode: 'both'
                }}
              >
                {narration.icon && (
                  <span className="text-2xl animate-bounce">{narration.icon}</span>
                )}
                <span>{narration.text}</span>
              </div>
            ))}
            
            {visibleNarrations === battleNarration.length && (
              <div className="mt-4 flex items-center justify-center">
                <div className="flex space-x-2">
                  <div className="w-3 h-3 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-3 h-3 bg-pink-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-3 h-3 bg-yellow-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Energy waves animation */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border-4 border-cyan-500/30 rounded-full animate-ping"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 border-4 border-pink-500/20 rounded-full animate-ping" style={{ animationDelay: '1s' }}></div>
      </div>
    );
  };
  
  const normalizePvpResult = (result: string) => {
    if (result === 'pvp_win') return 'win';
    if (result === 'pvp_loss') return 'lose';
    if (result === 'pvp_blocked') return 'blocked';
    return result;
  };

  const renderResult = () => {
    if (!attackResult || !selectedTarget) return null;

    const xpDelta = Number(attackResult.attacker_deltas?.xp ?? 0);
    const coinsDelta = Number(attackResult.attacker_deltas?.coins ?? 0);
    const gemstonesDelta = Number(attackResult.attacker_deltas?.gemstones ?? 0);

    const resultText = {
        win: { title: 'Victory! �', subtitle: 'Enemy systems breached', color: 'var(--success-teal)' },
        lose: { title: 'Defeated �', subtitle: 'Attack repelled', color: 'var(--danger-red)' },
        blocked: { title: 'Blocked by Shield 🛡️', subtitle: 'Barrier held strong', color: 'var(--amber-warn)' },
        default: { title: 'Battle complete', subtitle: 'Result recorded', color: 'var(--ion-blue)' }
    };
    const normalizedResult = normalizePvpResult(attackResult.result);
    const { title, subtitle, color } = resultText[normalizedResult] ?? resultText.default;

    // Combat result messages
    const getResultMessage = () => {
        if (normalizedResult === 'win') {
            return `You defeated ${selectedTarget.username}! Your superior combat skills overwhelmed their defenses! 💪`;
        } else if (normalizedResult === 'blocked') {
            return `${selectedTarget.username}'s shield absorbed your attack! Their protective barrier held strong! �️`;
        } else if (normalizedResult === 'lose') {
            return `${selectedTarget.username} defended successfully! Their combat prowess turned the tide of battle! ⚔️`;
        }
        return 'Battle complete. Result recorded.';
    };

    const handleAttackAnother = () => {
        setStage('loading');
        setSelectedTarget(null);
        setAttackResult(null);
        GameService.raid_targets().then(data => {
            setTargets(data);
            setStage('targets');
        });
    };

    return (
        <div className="w-full px-4 sm:px-6 py-6">
          <div className="text-center max-w-lg mx-auto">
              <div className="flex flex-col items-center mb-6">
                {normalizedResult === 'win' && (
                  <div className="text-8xl mb-4 animate-bounce">🏆</div>
                )}
                {normalizedResult === 'blocked' && (
                  <div className="text-8xl mb-4 animate-pulse">🛡️</div>
                )}
                {normalizedResult === 'lose' && (
                  <div className="text-8xl mb-4 animate-ping">💥</div>
                )}
                <h2 className="font-heading text-4xl" style={{ color }}>{title}</h2>
                <p className="text-sm text-gray-300 mt-2">{subtitle}</p>
              </div>
              <div className="card-glass p-6 sm:p-8" style={{borderColor: `${color}80`}}>
                   <p className="text-lg mb-6">{getResultMessage()}</p>

                  <div className="text-lg sm:text-2xl font-heading space-y-3 mb-6">
                      <p>XP Delta: <span style={{color: xpDelta > 0 ? 'var(--ion-blue)' : 'var(--danger-red)'}}>{xpDelta >= 0 ? `+${xpDelta}` : xpDelta}</span></p>
                      <p>Coins Delta: <span style={{color: 'var(--amber-warn)'}}>{coinsDelta >= 0 ? `+${coinsDelta}`: coinsDelta}</span></p>
                      <p className="flex items-center justify-center gap-2">
                        Gemstones:
                        <span className="inline-flex items-center gap-1 text-rose-200 gem-glow">
                          <GemIcon className="w-5 h-5" />
                          {gemstonesDelta >= 0 ? `+${gemstonesDelta}` : gemstonesDelta}
                        </span>
                      </p>
                  </div>

                  <button
                      onClick={handleAttackAnother}
                      className="w-full bg-plasma-pink/20 hover:bg-plasma-pink/30 border border-plasma-pink text-white shadow-lg shadow-plasma-pink/20 font-heading font-bold text-lg tracking-wider p-4 rounded-2xl transition-all duration-300 transform hover:scale-105"
                  >
                      ⚔️ Battle Another Target
                  </button>
              </div>
          </div>
        </div>
    );
  };


  const renderContent = () => {
    switch(stage) {
      case 'loading': return <div className="font-heading text-2xl animate-pulse text-center mt-20" style={{color: 'var(--plasma-pink)'}}>🎯 Searching for opponents...</div>;
      case 'targets': return renderTargets();
      case 'cinematic': return createPortal(renderCinematic(), document.body);
      case 'result': return renderResult();
      default: return null;
    }
  }

  return (
    <div className="mt-6 mb-12 pb-24">
      <BackButton onClick={onComplete} containerClassName="sticky top-4 z-40 mb-6" />
      <div className="mt-4">
        {renderContent()}
      </div>

      {stage !== 'cinematic' && (
        <button
          type="button"
          onClick={onComplete}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-black/70 border border-cyan-400 px-4 py-2 text-sm font-semibold text-cyan-200 shadow-lg shadow-cyan-500/30 hover:bg-cyan-500/20"
        >
          <BattleIcon className="w-4 h-4" />
          Dashboard
        </button>
      )}
      
      {/* Clan Members Modal */}
      {clanModal && (
        <div 
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setClanModal(null)}
        >
          <div 
            className="card-glass max-w-md w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-heading text-2xl text-amber-300">⚔️ {clanModal.clanName}</h3>
                <button 
                  onClick={() => setClanModal(null)}
                  className="text-gray-400 hover:text-white text-2xl"
                >
                  ×
                </button>
              </div>
              
              {clanModal.loading ? (
                <p className="text-center text-gray-300 py-4">Loading members...</p>
              ) : (
                <div className="space-y-2">
                  {clanModal.members.map((member) => (
                    <div key={member.user_id} className="flex items-center gap-3 p-3 bg-black/20 rounded-lg">
                      <AvatarWithFrame
                        src={member.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.username}`}
                        alt={member.username}
                        size="md"
                        hasNeonFrame={member.active_cosmetic_frame === 'neon'}
                        hasGlitchTheme={member.active_cosmetic_theme === 'flicker'}
                        hasGlitchEffect={member.active_cosmetic_effect === 'glitch'}
                        fallbackFrameClassName="border-2 border-gray-600"
                      />
                      <div className="flex-1">
                        <p className="font-semibold text-white">
                          <ClickableUsername userId={member.user_id} username={member.username}>
                            {member.username}
                          </ClickableUsername>
                        </p>
                        <p className="text-xs text-gray-400 capitalize">{member.role}</p>
                      </div>
                    </div>
                  ))}
                  {clanModal.members.length === 0 && (
                    <p className="text-center text-gray-400 py-4">No members found</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PvPView;
