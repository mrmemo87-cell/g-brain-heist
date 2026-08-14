import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Profile, ActiveClanBuff } from '../types';
import { TrophyIcon, BattleIcon, ShieldIcon, ClanIcon } from './icons';
import AvatarWithFrame from './AvatarWithFrame';
import { isFlickerThemeActive } from '../src/lib/cosmetics';
import { getXpProgress } from '../src/lib/leveling';

interface PlayerProfileCardProps {
  profile: Profile;
}

type StatDisplayProps = {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accentClass: string;
  subtitle?: string;
  containerClassName?: string;
};

const StatDisplay: React.FC<StatDisplayProps> = ({ icon, label, value, accentClass, subtitle, containerClassName }) => (
  <div
    className={`student-profile-stat flex items-center gap-2.5 rounded-xl border border-white/10 bg-slate-900/70 p-2.5 shadow-[0_8px_20px_rgba(0,0,0,0.4)] ${
      containerClassName ?? ''
    }`}
  >
    <div className={`w-8 h-8 flex-shrink-0 rounded-lg bg-black/30 flex items-center justify-center ${accentClass}`}>{icon}</div>
    <div className="min-w-0 flex-1">
      <div className="text-[10px] uppercase tracking-wider text-slate-300/80">{label}</div>
      <div className="text-base font-semibold font-heading leading-tight text-white truncate">{value}</div>
      {subtitle && <div className="text-[10px] text-slate-400 truncate">{subtitle}</div>}
    </div>
  </div>
);

const describeClanBuffEffect = (effect: ActiveClanBuff['effect'] = {}): string => {
  const segments: string[] = [];
  if (effect.xp_multiplier && effect.xp_multiplier !== 1) {
    segments.push(`XP +${Math.round((effect.xp_multiplier - 1) * 100)}%`);
  }
  if (effect.attack_multiplier && effect.attack_multiplier !== 1) {
    segments.push(`Attack +${Math.round((effect.attack_multiplier - 1) * 100)}%`);
  }
  if (effect.defense_multiplier && effect.defense_multiplier !== 1) {
    segments.push(`Defense +${Math.round((effect.defense_multiplier - 1) * 100)}%`);
  }
  if (effect.shield_bonus_percent) {
    segments.push(`Shield +${effect.shield_bonus_percent}%`);
  }
  if (effect.ap_bonus) {
    segments.push(`AP +${effect.ap_bonus}`);
  }
  return segments.length ? segments.join(' • ') : 'Passive effect active';
};

const formatBuffTimeRemaining = (expiresAt?: string): string => {
  if (!expiresAt) return 'Unknown expiry';
  const expires = new Date(expiresAt).getTime();
  const now = Date.now();
  const minutes = Math.max(0, Math.round((expires - now) / (1000 * 60)));
  if (minutes <= 0) return 'Expiring soon';
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return `${hours}h ${remainingMinutes}m left`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h left`;
};

const groupActiveBuffs = (buffs: ActiveClanBuff[]) => Object.values(
  buffs.reduce<Record<string, ActiveClanBuff & { stackCount: number }>>((acc, buff) => {
    const key = buff.template_code || buff.id;

    if (!acc[key]) {
      acc[key] = { ...buff, stackCount: 1 };
      return acc;
    }

    acc[key].stackCount += 1;

    if (new Date(buff.expires_at).getTime() > new Date(acc[key].expires_at).getTime()) {
      acc[key].expires_at = buff.expires_at;
      acc[key].activated_at = buff.activated_at;
      acc[key].activated_by = buff.activated_by;
      acc[key].activated_by_name = buff.activated_by_name;
    }

    return acc;
  }, {})
);


const PlayerProfileCard: React.FC<PlayerProfileCardProps> = ({ profile }) => {
  const xpProgress = getXpProgress(profile.xp, profile.level);

  // Level mismatch warnings suppressed - using hard curve formula now
  // Database will auto-sync on next XP update via trigger

  const lastLevelRef = useRef(xpProgress.effectiveLevel);
  const [showLevelUp, setShowLevelUp] = useState(false);

  useEffect(() => {
    if (xpProgress.effectiveLevel > lastLevelRef.current) {
      setShowLevelUp(true);
      const timeout = setTimeout(() => setShowLevelUp(false), 2000);
      lastLevelRef.current = xpProgress.effectiveLevel;
      return () => clearTimeout(timeout);
    }
    lastLevelRef.current = xpProgress.effectiveLevel;
  }, [xpProgress.effectiveLevel]);

  const totalScore = profile.total_score ?? (profile.xp + (profile.pvp_score ?? 0) * 10);
  const clanBuffs = profile.active_clan_buffs ?? [];
  const groupedClanBuffs = useMemo(() => groupActiveBuffs(clanBuffs), [clanBuffs]);
  const attackValue = profile.attack_power_effective ?? profile.attack_power;
  const defenseValue = profile.defense_power_effective ?? profile.defense_power;
  const attackSubtitle = groupedClanBuffs.length ? `Base ${profile.attack_power}` : undefined;
  const defenseSubtitle = groupedClanBuffs.length ? `Base ${profile.defense_power}` : undefined;



  const secondaryStats: StatDisplayProps[] = [
    {
      icon: <TrophyIcon className="w-4 h-4" />,
      label: 'Total Score',
      value: totalScore.toLocaleString(),
      subtitle: 'XP + PvP',
      accentClass: 'text-amber-200 border border-amber-300/40',
    },
    {
      icon: <BattleIcon className="w-4 h-4" />,
      label: 'PvP Score',
      value: profile.pvp_score.toLocaleString(),
      subtitle: '3 pts per win',
      accentClass: 'text-rose-200 border border-rose-300/40',
    },
    {
      icon: <BattleIcon className="w-4 h-4" />,
      label: 'Attack',
      value: attackValue || 10,
      subtitle: attackSubtitle,
      accentClass: 'text-orange-300 border-2 border-orange-500/60 bg-orange-950/30 shadow-[0_0_12px_rgba(249,115,22,0.3)]',
      containerClassName: 'ring-1 ring-orange-400/30',
    },
    {
      icon: <ShieldIcon className="w-4 h-4" />,
      label: 'Defense',
      value: defenseValue || 10,
      subtitle: defenseSubtitle,
      accentClass: 'text-emerald-300 border-2 border-emerald-500/60 bg-emerald-950/30 shadow-[0_0_12px_rgba(16,185,129,0.3)]',
      containerClassName: 'ring-1 ring-emerald-400/30',
    },
  ];
  // Earnings breakdown stats
  const earningsStats: StatDisplayProps[] = [
    {
      icon: <span className="text-base">🏆</span>,
      label: 'From Achievements',
      value: `${(profile.coins_from_achievements || 0).toLocaleString()} coins`,
      subtitle: `${(profile.xp_from_achievements || 0).toLocaleString()} XP`,
      accentClass: 'text-purple-200 border border-purple-300/40',
    },
    {
      icon: <span className="text-base">⚔️</span>,
      label: 'From PvP Attacks',
      value: `${(profile.coins_from_pvp || 0).toLocaleString()} coins`,
      subtitle: `${(profile.xp_from_pvp || 0).toLocaleString()} XP • ${profile.pvp_wins || 0} wins`,
      accentClass: 'text-red-200 border border-red-300/40',
    },
    {
      icon: <span className="text-base">📋</span>,
      label: 'From Assignments',
      value: `${(profile.coins_from_assignments || 0).toLocaleString()} coins`,
      subtitle: `${(profile.xp_from_assignments || 0).toLocaleString()} XP`,
      accentClass: 'text-green-200 border border-green-300/40',
    },
    {
      icon: <span className="text-base">🎯</span>,
      label: 'From Quests',
      value: `${(profile.coins_from_quests || 0).toLocaleString()} coins`,
      subtitle: `${(profile.xp_from_quests || 0).toLocaleString()} XP`,
      accentClass: 'text-blue-200 border border-blue-300/40',
    },
  ];
  return (
    <div data-testid="dashboard-profile-card" className="student-profile-panel animate-fade-in-up rounded-2xl border border-pink-500/30 bg-slate-950/90 p-3 sm:p-4 shadow-[0_20px_50px_rgba(0,0,0,0.55)]">
      <div className="flex flex-col gap-3">
        <div className="student-profile-summary flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-pink-500/25 bg-black/40 p-3 shadow-[0_10px_30px_rgba(255,45,145,0.15)]">
          <div className="flex items-center gap-3">
            <AvatarWithFrame
              src={profile.avatar_url}
              alt={profile.username}
              size="lg"
              hasNeonFrame={profile.active_cosmetic_frame === 'neon'}
              hasFlickerTheme={isFlickerThemeActive(profile.active_cosmetic_theme)}
              hasGlitchEffect={profile.active_cosmetic_effect === 'glitch'}
              imgClassName="sm:w-16 sm:h-16 animate-float"
              fallbackFrameClassName="border-4 border-pink-500/80"
            />
            <div className="space-y-0.5">
              <h2 className="text-lg sm:text-xl font-bold font-heading" style={{ color: 'var(--plasma-pink)' }}>
                {profile.username}
              </h2>
              <p className="text-xs sm:text-sm" style={{ color: 'var(--mist-400)' }}>
                {profile.batch ? `Batch ${profile.batch} | ` : ''}
                {profile.role === 'teacher' ? '👨‍🏫 Teacher | ' : ''}
                Level {xpProgress.effectiveLevel}
              </p>
            </div>
          </div>
          <div data-testid="profile-xp-progress" className="w-full sm:w-1/2">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ion-blue)' }}>XP</span>
              <span className="text-[10px] font-mono" style={{ color: 'var(--mist-400)' }}>
                {xpProgress.xpIntoLevel.toLocaleString()} / {xpProgress.xpForNextLevel}
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full border border-sky-400/20 bg-slate-900/70 overflow-hidden">
              <div
                className={`h-full rounded-full progress-bar-glow-ion shimmer-effect ${showLevelUp ? 'animate-pulse' : ''}`}
                style={{ width: `${xpProgress.progress * 100}%`, backgroundColor: 'var(--ion-blue)' }}
              ></div>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Stats</p>
            <span className="text-[11px] text-slate-400">Performance & combat</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-2">
            {secondaryStats.map((stat) => (
              <StatDisplay key={stat.label} {...stat} />
            ))}
          </div>
        </div>

        {/* Earnings breakdown hidden per user request */}

        {profile.clan_name && (
          <div className="grid gap-2">
            <div className="rounded-xl border border-amber-400/25 bg-black/40 p-3 shadow-[0_10px_30px_rgba(255,183,77,0.12)]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 text-amber-400 flex-shrink-0"><ClanIcon /></div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-amber-200/80">Clan</p>
                    <p className="text-base sm:text-lg font-heading text-amber-300">{profile.clan_name}</p>
                    <p className="text-xs text-gray-400 capitalize">
                      {profile.clan_role}
                      {profile.clan_custom_title ? ` • ${profile.clan_custom_title}` : ''}
                    </p>
                  </div>
                </div>
                {typeof profile.clan_total_score === 'number' && (
                  <div className="text-right">
                    <p className="font-semibold text-white text-sm">{profile.clan_total_score.toLocaleString()}</p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Clan Score</p>
                  </div>
                )}
              </div>
            </div>

            {groupedClanBuffs.length > 0 && (
              <div className="rounded-xl border border-sky-400/25 bg-slate-900/70 p-3 shadow-[0_10px_30px_rgba(14,165,233,0.15)] space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-heading text-sm text-amber-200">Active Clan Effects</h3>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400">{groupedClanBuffs.length} active</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {groupedClanBuffs.map((buff) => (
                    <div
                      key={buff.id}
                      className="relative overflow-hidden rounded-lg border border-white/10 bg-gradient-to-br from-slate-900/80 to-slate-950/90 p-2.5 shadow-[0_8px_20px_rgba(0,0,0,0.35)]"
                      style={{
                        backgroundImage: 'linear-gradient(145deg, rgba(9, 37, 68, 0.9), rgba(8, 17, 36, 0.95))',
                        borderColor: 'rgba(255,255,255,0.08)'
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <p className="font-semibold text-white text-sm">{buff.name}</p>
                          <p className="text-[10px] text-gray-400 leading-snug">{describeClanBuffEffect(buff.effect)}</p>
                        </div>
                        <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-300">
                          {buff.template_code?.toUpperCase() ?? 'Buff'}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[10px] text-gray-400">
                        <div className="space-y-0.5">
                          <p>{formatBuffTimeRemaining(buff.expires_at)}</p>
                          {buff.stackCount > 1 && <p className="text-amber-300 font-semibold">Stacked x{buff.stackCount}</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(PlayerProfileCard);
