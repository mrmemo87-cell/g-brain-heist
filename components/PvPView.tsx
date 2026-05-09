import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import gsap from 'gsap';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { useGSAP } from '@gsap/react';
import { RaidTarget, RaidAttackResult, Profile, XpStatus } from '../types';
import * as GameService from '../services/gameService';
import { supabase } from '../services/supabaseClient';
import { audioService } from '../services/audioService';
import BackButton from './BackButton';
import { ShieldIcon, HackIcon, CoinIcon, XPIcon, GemIcon, BattleIcon, TrophyIcon } from './icons';
import { createPortal } from 'react-dom';
import AvatarWithFrame from './AvatarWithFrame';
import { isFlickerThemeActive } from '../src/lib/cosmetics';
import { fetchNeonFrameOwners, fetchFlickerThemeOwners, fetchGlitchEffectOwners } from '../services/cosmeticService';
import { tryConsumePilotQuota } from '../services/tierService';
import ClickableUsername from './ClickableUsername';
import BrainsMasterBadge from './BrainsMasterBadge';

type PvPStage = 'loading' | 'targets' | 'cinematic' | 'result';
type BreachPhase = 'lockon' | 'charge' | 'impact' | 'outcome';

interface BattleNarration {
  text: string;
  delay: number;
  color?: string;
  icon?: string;
}

const RAID_AP_COST = 2;

interface PvPViewProps {
  profile: Profile;
  focusTargetUserId?: string | null;
  onComplete: () => void;
  addToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
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
  const hasFlickerTheme = isFlickerThemeActive(target.active_cosmetic_theme);
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
          hasFlickerTheme={hasFlickerTheme}
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
        <BrainsMasterBadge showBadge={target.brains_master_show_badge} until={target.brains_master_until} />
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
  active_cosmetic_theme?: 'flicker' | 'glitch' | null;
}

type TargetFilter = 'all' | 'nearby' | 'easy' | 'challenge' | 'rivals';

const PvPView: React.FC<PvPViewProps> = ({ profile, focusTargetUserId, onComplete, onGrantReward, addToast }) => {
  gsap.registerPlugin(DrawSVGPlugin);
  const [stage, setStage] = useState<PvPStage>('loading');
  const [targets, setTargets] = useState<RaidTarget[]>([]);
  const [targetsError, setTargetsError] = useState<string | null>(null);
  const [refreshingTargets, setRefreshingTargets] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<RaidTarget | null>(null);
  const [attackResult, setAttackResult] = useState<RaidAttackResult | null>(null);
  const [useCracker, setUseCracker] = useState(false);
  const [battleNarration, setBattleNarration] = useState<BattleNarration[]>([]);
  const [visibleNarrations, setVisibleNarrations] = useState<number>(0);
  const [breachPhase, setBreachPhase] = useState<BreachPhase>('lockon');
  const [breachOutcomeText, setBreachOutcomeText] = useState('EXECUTING...');
  const [clanModal, setClanModal] = useState<{ clanId: string; clanName: string; members: ClanMember[]; loading: boolean } | null>(null);
  const [filterTab, setFilterTab] = useState<TargetFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [levelRange, setLevelRange] = useState<number | null>(null);
  const [minCoins, setMinCoins] = useState<string>('');
  const [hideCooldown, setHideCooldown] = useState(false);
  const cinematicTimersRef = useRef<number[]>([]);
  const cinematicScopeRef = useRef<HTMLDivElement | null>(null);
  const attackerRef = useRef<HTMLDivElement | null>(null);
  const defenderRef = useRef<HTMLDivElement | null>(null);
  const reticleRef = useRef<SVGCircleElement | null>(null);
  const beamPathRef = useRef<SVGLineElement | null>(null);
  const shieldPathRef = useRef<SVGCircleElement | null>(null);
  const impactRingRef = useRef<HTMLDivElement | null>(null);
  const impactFlashRef = useRef<HTMLDivElement | null>(null);
  const outcomeBannerRef = useRef<HTMLDivElement | null>(null);
  const phaseStatusRef = useRef<HTMLSpanElement | null>(null);
  const autoAttackFocusRef = useRef<string | null>(null);

  const breachStatusText = useMemo(() => {
    if (breachPhase === 'lockon') return 'LOCKING TARGET...';
    if (breachPhase === 'charge') return 'CHARGING BREACH...';
    if (breachPhase === 'impact') return 'IMPACT CONFIRMED...';
    return 'DECRYPTING RESULT...';
  }, [breachPhase]);

  const clearCinematicTimers = () => {
    cinematicTimersRef.current.forEach(timer => window.clearTimeout(timer));
    cinematicTimersRef.current = [];
  };

  const queueCinematicTimer = (cb: () => void, delay: number) => {
    const timer = window.setTimeout(cb, delay);
    cinematicTimersRef.current.push(timer);
  };

  useEffect(() => {
    return () => clearCinematicTimers();
  }, []);

  useGSAP(() => {
    if (stage !== 'cinematic' || !selectedTarget) return;
    if (!reticleRef.current || !beamPathRef.current || !impactRingRef.current || !impactFlashRef.current || !outcomeBannerRef.current) return;

    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });

    gsap.set([impactRingRef.current, impactFlashRef.current, outcomeBannerRef.current], { opacity: 0 });
    gsap.set(reticleRef.current, { drawSVG: '0%' });
    gsap.set(beamPathRef.current, { drawSVG: '0%', opacity: 0 });
    if (shieldPathRef.current) gsap.set(shieldPathRef.current, { drawSVG: '0%', opacity: 0.15 });

    tl.add('lockon', 0)
      .call(() => setBreachPhase('lockon'), undefined, 'lockon')
      .to(reticleRef.current, { drawSVG: '100%', duration: 0.45, ease: 'power1.inOut' }, 'lockon')
      .to(defenderRef.current, { scale: 1.04, yoyo: true, repeat: 1, duration: 0.22 }, 'lockon+=0.1')
      .to(phaseStatusRef.current, { opacity: 1, duration: 0.2 }, 'lockon')
      .add('charge', 0.5)
      .call(() => setBreachPhase('charge'), undefined, 'charge')
      .to(attackerRef.current, { scale: 1.08, filter: 'drop-shadow(0 0 18px rgba(34,211,238,0.8))', duration: 0.35 }, 'charge')
      .to(beamPathRef.current, { opacity: 0.55, drawSVG: '35%', duration: 0.45 }, 'charge')
      .to('.breach-energy-streak', {
        x: 38,
        opacity: 0.75,
        stagger: 0.05,
        duration: 0.25,
        yoyo: true,
        repeat: 1,
      }, 'charge')
      .add('impact', 1.2)
      .call(() => setBreachPhase('impact'), undefined, 'impact')
      .to(beamPathRef.current, { drawSVG: '100%', opacity: 1, duration: 0.18, ease: 'power4.out' }, 'impact')
      .to([impactRingRef.current, impactFlashRef.current], { opacity: 1, duration: 0.08 }, 'impact')
      .to(impactRingRef.current, { scale: 1.8, opacity: 0, duration: 0.3 }, 'impact+=0.05')
      .to(impactFlashRef.current, { scale: 1.25, opacity: 0, duration: 0.22 }, 'impact+=0.04')
      .to(defenderRef.current, { x: 8, y: -4, duration: 0.04, repeat: 5, yoyo: true, ease: 'none' }, 'impact+=0.02')
      .to(shieldPathRef.current, { opacity: 1, drawSVG: '100%', duration: 0.24 }, 'impact')
      .add('outcome', 1.8)
      .call(() => setBreachPhase('outcome'), undefined, 'outcome')
      .to(outcomeBannerRef.current, { opacity: 1, scale: 1, duration: 0.25, ease: 'back.out(1.7)' }, 'outcome')
      .to(outcomeBannerRef.current, { boxShadow: '0 0 24px rgba(34,197,94,0.55)', duration: 0.35 }, 'outcome+=0.1');

    return () => tl.kill();
  }, { scope: cinematicScopeRef, dependencies: [stage, selectedTarget] });

  const loadTargets = useCallback(async (options?: { preserveTargets?: boolean }) => {
    const preserveTargets = options?.preserveTargets ?? false;
    if (!preserveTargets) {
      setStage('loading');
    } else {
      setRefreshingTargets(true);
    }
    setTargetsError(null);
    try {
      const data = await GameService.raid_targets();
      const attackableTargets = data.filter((target: any) => target.role !== 'admin');
      setTargets(attackableTargets);
      setStage('targets');
    } catch (error: any) {
      const message = error?.message || 'Unable to load PvP targets.';
      setTargetsError(message);
      setStage('targets');
      if (!preserveTargets || targets.length === 0) {
        addToast(message, 'error');
      } else {
        addToast(`Refresh failed: ${message}`, 'warning');
      }
    } finally {
      setRefreshingTargets(false);
    }
  }, [addToast, targets.length]);

  useEffect(() => {
    void loadTargets();
  }, [loadTargets]);

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
    // Consume pilot quota if applicable
    const quota = await tryConsumePilotQuota('pvp_battles');
    if (!quota.proceed) {
      addToast(quota.error || 'You\'ve reached the PvP battle limit on the Pilot plan. Upgrade to continue.', 'warning');
      return;
    }

    if (profile.ap_now < RAID_AP_COST) {
      audioService.play('wrong');
      addToast('Not enough Action Points to launch a PvP battle. Regain AP before attacking again.', 'warning');
      return;
    }

    setSelectedTarget(target);
    setStage('cinematic');
    setBreachPhase('lockon');
    setBreachOutcomeText('EXECUTING...');
    setBattleNarration([]);
    setVisibleNarrations(0);
    clearCinematicTimers();

    // No narrative text lines — the Breach Run visual phases carry the entire cinematic

    queueCinematicTimer(() => setBreachPhase('charge'), 500);
    queueCinematicTimer(() => setBreachPhase('impact'), 1200);
    queueCinematicTimer(() => setBreachPhase('outcome'), 1800);

    try {
      const attackStartTime = Date.now();
      const requestId = (crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
      // Call the actual attack (starts immediately but runs in parallel with animations)
      const result = await GameService.raid_attack(target.user_id, useCracker, target, requestId);

      console.log('Battle result received:', result); // Debug log
      
      setAttackResult(result);

      const xpDelta = Number(result.attacker_deltas?.xp ?? 0);
      const coinsDelta = Number(result.attacker_deltas?.coins ?? 0);
      const gemstonesDelta = Number(result.attacker_deltas?.gemstones ?? 0);

      // Grant rewards/penalties (server-authoritative AP spend handled in RPC)
      onGrantReward({
        xp: xpDelta,
        coins: coinsDelta,
        gemstones: gemstonesDelta,
      }, result.final_profile_values);

      const normalizedResult = normalizePvpResult(result.result);
      if (normalizedResult === 'win') {
        setBreachOutcomeText('BREACHED');
      } else if (normalizedResult === 'blocked') {
        setBreachOutcomeText('BLOCKED');
      } else {
        setBreachOutcomeText('REPELLED');
      }

      // Wait for minimum cinematic window (2.5s) before showing result + play sound
      const elapsedTime = Date.now() - attackStartTime;
      const remaining = Math.max(2500 - elapsedTime, 0);
      queueCinematicTimer(() => {
        // Play appropriate sound when result screen appears
        if (normalizedResult === 'win') {
          audioService.play('hack_win');
        } else {
          audioService.play('hack_fail');
        }
        setStage('result');
      }, remaining);

    } catch (error) {
      console.error('Battle attack error:', error);
      // Show error and go back to targets
      addToast(`Battle failed and no action points were consumed: ${(error as Error).message}`, 'error');
      setSelectedTarget(null);
      setAttackResult(null);
      void loadTargets({ preserveTargets: true });
    }
  };

  useEffect(() => {
    autoAttackFocusRef.current = null;
  }, [focusTargetUserId]);

  useEffect(() => {
    if (!focusTargetUserId || stage !== 'targets') return;
    const target = targets.find((candidate) => candidate.user_id === focusTargetUserId);
    if (!target) {
      addToast('Target is no longer available. Pick another opponent.', 'warning');
      return;
    }

    setSelectedTarget(target);
    setSearchTerm(target.username);
    setDebouncedSearch(target.username.trim().toLowerCase());

    if (isTargetOnCooldown(target)) {
      addToast(`${target.username} is on cooldown. Their target card shows when they can be attacked.`, 'info');
      return;
    }

    if (autoAttackFocusRef.current === target.user_id) return;
    autoAttackFocusRef.current = target.user_id;
    addToast(`${target.username} is locked in. Launching attack now.`, 'info');
    void handleAttack(target);
  }, [addToast, focusTargetUserId, stage, targets]);


  const renderTargets = () => (
    <div className="w-full px-4 sm:px-6 py-6">
      <div className="max-w-full mx-auto">
        <h2 className="font-heading text-3xl text-center mb-4 flex items-center justify-center gap-2" style={{ color: 'var(--plasma-pink)' }}><BattleIcon className="w-8 h-8" /> Choose Your Target</h2>
        <div className="mb-6 flex items-center justify-center">
          <button
            type="button"
            onClick={() => void loadTargets({ preserveTargets: true })}
            disabled={refreshingTargets}
            className="rounded-lg border border-pink-400/60 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-500/20 disabled:opacity-60"
          >
            {refreshingTargets ? 'Refreshing targets...' : 'Refresh targets'}
          </button>
        </div>
        {targetsError && (
          <div className="mb-4 rounded-xl border border-amber-400/50 bg-amber-900/30 p-3 text-center text-sm text-amber-100">
            <p>{targetsError}</p>
          </div>
        )}

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
        {targets.length === 0 && targetsError ? (
          <div className="text-center text-gray-300 py-12">
            <p className="text-xl">Unable to load opponents</p>
            <p className="text-sm mt-2 text-amber-200">{targetsError}</p>
            <button
              type="button"
              onClick={() => void loadTargets()}
              className="mt-4 inline-flex items-center justify-center rounded-lg border border-pink-400 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-500/20"
            >
              Retry
            </button>
          </div>
        ) : filteredTargets.length === 0 ? (
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
    const defenderDefense = 10 + (selectedTarget.level * 2) + (selectedTarget.has_shield ? 20 : 0);
    return (
      <div ref={cinematicScopeRef} className={`fixed inset-0 bg-black flex flex-col items-center justify-center z-50 overflow-hidden ${breachPhase === 'impact' ? 'breach-screen-shake' : ''}`}>
        {/* Layered background */}
        <div className="absolute inset-0 breach-grid-overlay"></div>
        <div className="absolute inset-0 breach-scanline pointer-events-none"></div>
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.85) 100%)' }}></div>

        {/* Phase ambient overlays */}
        {breachPhase === 'lockon' && <div className="absolute inset-0 bg-red-900/10 animate-pulse"></div>}
        {breachPhase === 'charge' && <div className="absolute inset-0 breach-charge-bg"></div>}
        {breachPhase === 'impact' && <div className="absolute inset-0 breach-white-flash"></div>}

        {/* HUD corners */}
        <div className="absolute top-4 left-4 z-20 font-mono text-[10px] tracking-[0.2em] uppercase breach-blink">
          <span ref={phaseStatusRef} className="text-cyan-300/90">{breachStatusText}</span>
        </div>
        <div className="absolute top-4 right-4 z-20 font-mono text-[10px] tracking-[0.15em] text-cyan-500/40">BREACH://RUN</div>

        {/* Combatants */}
        <div className="relative z-10 flex items-center justify-around w-full max-w-3xl px-6">
          {/* Attacker */}
          <div ref={attackerRef} className={`flex flex-col items-center ${breachPhase === 'charge' ? 'breach-power-tick' : ''} ${breachPhase === 'impact' ? 'breach-attacker-lunge' : ''}`} data-sfx="charge">
            <div className={`relative ${breachPhase === 'charge' ? 'breach-charge-aura' : ''}`}>
              <AvatarWithFrame
                src={profile.avatar_url}
                alt={profile.username}
                size="xl"
                hasNeonFrame={profile.active_cosmetic_frame === 'neon'}
                hasFlickerTheme={isFlickerThemeActive(profile.active_cosmetic_theme)}
                hasGlitchEffect={profile.active_cosmetic_effect === 'glitch'}
                className="shadow-[0_0_30px_rgba(34,211,238,0.6)]"
                fallbackFrameClassName="border-4 border-cyan-500 shadow-[0_0_30px_rgba(34,211,238,0.6)]"
                imgClassName="w-28 h-28 md:w-36 md:h-36"
              />
              <div className="absolute -top-3 -right-3 bg-green-500/90 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg shadow-green-500/30">
                ⚔️ {profile.attack_power || 10}
              </div>
            </div>
            <span className="mt-3 font-heading text-lg md:text-xl text-cyan-400 font-bold drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]">{profile.username}</span>
            <span className="text-xs text-gray-500 tracking-wide">LVL {profile.level}</span>
          </div>

          {/* Center — phase indicator */}
          <div className="relative flex flex-col items-center justify-center w-28 h-28 md:w-36 md:h-36">
            <svg
              className={`w-24 h-24 md:w-28 md:h-28 breach-target-reticle transition-opacity duration-200 ${breachPhase === 'lockon' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              viewBox="0 0 120 120"
              fill="none"
              data-sfx="lockon"
            >
              <circle ref={reticleRef} cx="60" cy="60" r="44" stroke="rgba(248,113,113,0.95)" strokeWidth="3.5" />
              <circle cx="60" cy="60" r="8" stroke="rgba(248,113,113,0.8)" strokeWidth="2" />
              <path d="M60 6V24M60 96V114M6 60H24M96 60H114" stroke="rgba(248,113,113,0.75)" strokeWidth="2" />
            </svg>
            <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${breachPhase === 'charge' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
              <div className="breach-energy-core"></div>
            </div>
            <div className={`absolute inset-0 flex items-center justify-center text-6xl md:text-7xl breach-explosion-burst transition-opacity duration-150 ${breachPhase === 'impact' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>💥</div>
            <div ref={outcomeBannerRef} className={`breach-outcome-banner scale-90 opacity-0 ${breachPhase === 'outcome' ? 'pointer-events-auto' : 'pointer-events-none'} ${
                breachOutcomeText === 'BREACHED' ? 'breach-win' :
                breachOutcomeText === 'BLOCKED' ? 'breach-blocked' : 'breach-lose'
              }`}>
                {breachOutcomeText}
            </div>
          </div>

          {/* Defender */}
          <div ref={defenderRef} className="flex flex-col items-center" data-sfx="impact">
            <div className={`relative ${breachPhase === 'lockon' ? 'breach-lock-pulse' : ''} ${breachPhase === 'impact' ? 'breach-impact-shake' : ''}`}>
              <AvatarWithFrame
                src={selectedTarget.avatar_url}
                alt={selectedTarget.username}
                size="xl"
                hasNeonFrame={selectedTarget.active_cosmetic_frame === 'neon'}
                hasFlickerTheme={isFlickerThemeActive(selectedTarget.active_cosmetic_theme)}
                hasGlitchEffect={selectedTarget.active_cosmetic_effect === 'glitch'}
                className="shadow-[0_0_30px_rgba(236,72,153,0.6)]"
                fallbackFrameClassName="border-4 border-pink-500 shadow-[0_0_30px_rgba(236,72,153,0.6)]"
                imgClassName="w-28 h-28 md:w-36 md:h-36"
              />
              {selectedTarget.has_shield && (
                <div className={`absolute -top-3 -left-3 bg-yellow-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg shadow-yellow-500/30 ${breachPhase === 'impact' ? 'breach-shield-pop' : 'animate-pulse'}`}>
                  🛡️ +20
                </div>
              )}
              {selectedTarget.has_shield && (
                <svg className="absolute -inset-4 w-[calc(100%+2rem)] h-[calc(100%+2rem)] pointer-events-none" viewBox="0 0 180 180" fill="none">
                  <circle ref={shieldPathRef} cx="90" cy="90" r="72" stroke="rgba(250,204,21,0.85)" strokeWidth="3" />
                </svg>
              )}
              <div className="absolute -bottom-3 -right-3 bg-blue-600/90 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg shadow-blue-500/30">
                🛡️ {defenderDefense}
              </div>
            </div>
            <span className="mt-3 font-heading text-lg md:text-xl text-pink-400 font-bold drop-shadow-[0_0_8px_rgba(236,72,153,0.5)]">{selectedTarget.username}</span>
            <span className="text-xs text-gray-500 tracking-wide">LVL {selectedTarget.level}</span>
          </div>
        </div>

        {/* Crosshair on defender during lock-on */}
        {breachPhase === 'lockon' && (
          <div className="absolute right-[14%] md:right-[21%] top-[25%] w-32 h-32 md:w-40 md:h-40 breach-crosshair z-20"></div>
        )}

        {/* Attack beam during charge */}
        <svg className="absolute inset-0 z-20 pointer-events-none" viewBox="0 0 1000 600" preserveAspectRatio="none">
          <line ref={beamPathRef} x1="260" y1="260" x2="740" y2="260" stroke="rgba(34,211,238,0.95)" strokeWidth="6" strokeLinecap="round" />
        </svg>
        <div className={`absolute top-[42%] left-[18%] right-[18%] breach-attack-beam z-20 transition-opacity duration-200 ${breachPhase === 'charge' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <div className="breach-energy-streak absolute left-[8%] top-1/2 w-10 h-1 -translate-y-1/2 rounded-full bg-cyan-300/70 blur-sm" />
            <div className="breach-energy-streak absolute left-[18%] top-1/2 w-8 h-1 -translate-y-1/2 rounded-full bg-cyan-200/60 blur-sm" />
            <div className="breach-energy-streak absolute left-[28%] top-1/2 w-12 h-1 -translate-y-1/2 rounded-full bg-cyan-100/50 blur-sm" />
        </div>

        {/* Impact effects */}
        <div ref={impactRingRef} className={`absolute right-[15%] md:right-[22%] top-[22%] w-48 h-48 breach-impact-ring z-20 transition-opacity duration-150 ${breachPhase === 'impact' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}></div>
        <div ref={impactFlashRef} className={`absolute right-[18%] md:right-[25%] top-[26%] w-36 h-36 rounded-full breach-impact-flash z-20 transition-opacity duration-150 ${breachPhase === 'impact' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}></div>

        {/* Bottom HUD — phase progress bar */}
        <div className="absolute bottom-0 left-0 right-0 z-20 px-6 pb-5">
          <div className="max-w-lg mx-auto">
            <div className="flex gap-1.5 mb-2">
              <div className="h-1 flex-1 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]"></div>
              <div className={`h-1 flex-1 rounded-full transition-all duration-300 ${breachPhase !== 'lockon' ? 'bg-cyan-500 shadow-[0_0_6px_rgba(34,211,238,0.6)]' : 'bg-gray-800'}`}></div>
              <div className={`h-1 flex-1 rounded-full transition-all duration-300 ${breachPhase === 'impact' || breachPhase === 'outcome' ? 'bg-yellow-500 shadow-[0_0_6px_rgba(251,191,36,0.6)]' : 'bg-gray-800'}`}></div>
              <div className={`h-1 flex-1 rounded-full transition-all duration-300 ${breachPhase === 'outcome' ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]' : 'bg-gray-800'}`}></div>
            </div>
            <div className="flex justify-between">
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-gray-500">
                {breachPhase === 'lockon' && 'LOCK-ON'}
                {breachPhase === 'charge' && 'CHARGING'}
                {breachPhase === 'impact' && 'IMPACT'}
                {breachPhase === 'outcome' && 'RESULT'}
              </span>
              <span className="font-mono text-[10px] tracking-[0.15em] text-gray-700">BREACH RUN</span>
            </div>
          </div>
        </div>
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
        setSelectedTarget(null);
        setAttackResult(null);
        void loadTargets({ preserveTargets: true });
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
                        hasFlickerTheme={isFlickerThemeActive(member.active_cosmetic_theme)}
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
