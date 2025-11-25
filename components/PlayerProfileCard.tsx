import React, { useState, useEffect } from 'react';
import { Profile, ActiveClanBuff } from '../types';
import { CoinIcon, StreakIcon, XPIcon, APIcon, GemIcon, TrophyIcon, BattleIcon, ShieldIcon, ClanIcon } from './icons';
import AvatarWithFrame from './AvatarWithFrame';

interface PlayerProfileCardProps {
  profile: Profile;
}

const StatDisplay: React.FC<{ icon: React.ReactNode; label: string; value: string | number; color: string; subtitle?: string }> = ({ icon, label, value, color, subtitle }) => (
  <div className="flex items-center gap-3 rounded-xl border border-cyan-400/20 bg-slate-900/70 p-3 shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
    <div className="w-9 h-9 flex-shrink-0 rounded-lg bg-black/30 flex items-center justify-center" style={{ color }}>
      {icon}
    </div>
    <div className="space-y-0.5">
      <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--mist-400)' }}>{label}</div>
      <div className="text-lg font-semibold font-heading leading-tight">{value}</div>
      {subtitle && <div className="text-[11px]" style={{ color: 'var(--mist-400)' }}>{subtitle}</div>}
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


const PlayerProfileCard: React.FC<PlayerProfileCardProps> = ({ profile }) => {
  console.log('[ProfileCard] Rendering with cosmetics:', { 
    active_cosmetic_frame: profile.active_cosmetic_frame,
    active_cosmetic_theme: profile.active_cosmetic_theme
  });
  const xpForNextLevel = Math.ceil(100 * Math.pow(profile.level + 1, 1.5));
  const xpProgressPercent = (profile.xp / xpForNextLevel) * 100;
  const totalScore = profile.total_score ?? (profile.xp + (profile.pvp_score ?? 0) * 10);
  const clanBuffs = profile.active_clan_buffs ?? [];
  const attackValue = profile.attack_power_effective ?? profile.attack_power;
  const defenseValue = profile.defense_power_effective ?? profile.defense_power;
  const attackSubtitle = clanBuffs.length ? `Base ${profile.attack_power}` : undefined;
  const defenseSubtitle = clanBuffs.length ? `Base ${profile.defense_power}` : undefined;

  const [apCountdown, setApCountdown] = useState<string>('');
  const [calculatedAP, setCalculatedAP] = useState<number>(profile.ap_now);

  // Calculate time until next AP regeneration and current AP
  useEffect(() => {
    const updateCountdown = () => {
      if (!profile.last_ap_update) {
        setCalculatedAP(profile.ap_now);
        setApCountdown('--');
        return;
      }

      const now = new Date();
      const lastApUpdate = new Date(profile.last_ap_update);
      const msElapsed = now.getTime() - lastApUpdate.getTime();
      const minutesElapsed = Math.floor(msElapsed / (1000 * 60));
      
      // Calculate current AP based on time elapsed (1 AP per 10 minutes)
      const apRegenerated = Math.floor(minutesElapsed / 10);
      const currentAP = Math.min(profile.ap_now + apRegenerated, profile.ap_max);
      setCalculatedAP(currentAP);

      if (currentAP >= profile.ap_max) {
        setApCountdown('Full');
        return;
      }

      // Calculate time until next AP regen
      const msPerAP = 10 * 60 * 1000; // 10 minutes in ms
      const msUntilNextAP = msPerAP - (msElapsed % msPerAP);
      
      const minutesUntilNext = Math.floor(msUntilNextAP / (1000 * 60));
      const secondsUntilNext = Math.floor((msUntilNextAP % (1000 * 60)) / 1000);

      if (minutesUntilNext === 0) {
        setApCountdown(`${secondsUntilNext}s`);
      } else {
        setApCountdown(`${minutesUntilNext}m ${secondsUntilNext}s`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [profile.ap_now, profile.ap_max, profile.last_ap_update]);

  return (
    <div className="animate-fade-in-up rounded-2xl border border-pink-500/30 bg-slate-950/90 p-5 shadow-[0_20px_50px_rgba(0,0,0,0.55)]">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-pink-500/25 bg-black/40 p-4 shadow-[0_10px_30px_rgba(255,45,145,0.15)]">
          <div className="flex items-center gap-3">
            <AvatarWithFrame
              src={profile.avatar_url}
              alt={profile.username}
              size="lg"
              hasNeonFrame={profile.active_cosmetic_frame === 'neon'}
              hasGlitchTheme={profile.active_cosmetic_theme === 'flicker'}
              imgClassName="sm:w-20 sm:h-20 animate-float"
              fallbackFrameClassName="border-4 border-pink-500/80"
            />
            <div className="space-y-1">
              <h2 className="text-xl sm:text-2xl font-bold font-heading" style={{ color: 'var(--plasma-pink)' }}>
                {profile.username}
              </h2>
              <p className="text-sm" style={{ color: 'var(--mist-400)' }}>
                {profile.batch ? `Batch ${profile.batch} | ` : ''}
                {profile.role === 'teacher' ? '👨‍🏫 Teacher | ' : ''}
                Level {profile.level}
              </p>
            </div>
          </div>
          <div className="w-full sm:w-1/2">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--ion-blue)' }}>XP</span>
              <span className="text-[11px] font-mono" style={{ color: 'var(--mist-400)' }}>{profile.xp} / {xpForNextLevel}</span>
            </div>
            <div className="w-full h-3 rounded-full border border-sky-400/20 bg-slate-900/70 overflow-hidden">
              <div
                className="h-full rounded-full progress-bar-glow-ion shimmer-effect"
                style={{ width: `${xpProgressPercent}%`, backgroundColor: 'var(--ion-blue)' }}
              ></div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatDisplay icon={<CoinIcon />} label="Coins" value={profile.coins.toLocaleString()} color={'var(--amber-warn)'} />
          <StatDisplay icon={<GemIcon />} label="Gemstones" value={profile.gemstones.toLocaleString()} color={'var(--ion-blue)'} />
          <StatDisplay icon={<StreakIcon />} label="Streak" value={`${profile.streak} days`} color={'var(--danger-red)'} />
          <StatDisplay icon={<TrophyIcon className="w-4 h-4" />} label="Total Score" value={totalScore.toLocaleString()} color={'var(--amber-warn)'} subtitle="XP + PvP" />
          <StatDisplay icon={<XPIcon />} label="Total XP" value={profile.xp.toLocaleString()} color={'var(--ion-blue)'} />
          <StatDisplay icon={<BattleIcon className="w-4 h-4" />} label="PvP Score" value={profile.pvp_score.toLocaleString()} color={'var(--danger-red)'} subtitle="3 pts per win" />
          <StatDisplay
            icon={<APIcon />}
            label="Action Points"
            value={`${calculatedAP}/${profile.ap_max}`}
            color={'var(--success-teal)'}
            subtitle={calculatedAP < profile.ap_max ? `+1 in ${apCountdown}` : undefined}
          />
          <StatDisplay icon={<BattleIcon className="w-4 h-4" />} label="Attack" value={attackValue || 10} color={'var(--danger-red)'} subtitle={attackSubtitle} />
          <StatDisplay icon={<ShieldIcon className="w-4 h-4" />} label="Defense" value={defenseValue || 10} color={'var(--ion-blue)'} subtitle={defenseSubtitle} />
        </div>

        {profile.clan_name && (
          <div className="grid gap-3">
            <div className="rounded-xl border border-amber-400/25 bg-black/40 p-4 shadow-[0_10px_30px_rgba(255,183,77,0.12)]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 text-amber-400 flex-shrink-0"><ClanIcon /></div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-amber-200/80">Clan</p>
                    <p className="text-lg sm:text-xl font-heading text-amber-300">{profile.clan_name}</p>
                    <p className="text-sm text-gray-400 capitalize">
                      {profile.clan_role}
                      {profile.clan_custom_title ? ` • ${profile.clan_custom_title}` : ''}
                    </p>
                  </div>
                </div>
                {typeof profile.clan_total_score === 'number' && (
                  <div className="text-right">
                    <p className="font-semibold text-white">{profile.clan_total_score.toLocaleString()}</p>
                    <p className="text-[11px] text-gray-400 uppercase tracking-wide">Clan Score</p>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-sky-400/25 bg-slate-900/70 p-4 shadow-[0_10px_30px_rgba(14,165,233,0.15)] space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-heading text-lg text-amber-200">Active Clan Effects</h3>
                <p className="text-[11px] uppercase tracking-wider text-gray-400">{clanBuffs.length} aligned</p>
              </div>
              {clanBuffs.length === 0 ? (
                <p className="text-sm text-gray-400">No clan buffs are active right now.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {clanBuffs.map((buff, index) => (
                    <div
                      key={buff.id}
                      className="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-slate-900/80 to-slate-950/90 p-3 shadow-[0_12px_30px_rgba(0,0,0,0.4)]"
                      style={{
                        backgroundImage: 'linear-gradient(145deg, rgba(9, 37, 68, 0.9), rgba(8, 17, 36, 0.95))',
                        borderColor: 'rgba(255,255,255,0.08)'
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-semibold text-white text-base">{buff.name}</p>
                          <p className="text-xs text-gray-400 leading-snug">{describeClanBuffEffect(buff.effect)}</p>
                        </div>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                          {buff.template_code?.toUpperCase() ?? 'Buff'}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-[11px] text-gray-400">
                        <div className="space-y-0.5">
                          <p>{formatBuffTimeRemaining(buff.expires_at)}</p>
                          {buff.activated_by_name && <p>Activated by {buff.activated_by_name}</p>}
                        </div>
                        <div className="text-right text-gray-500">
                          <p>
                            {buff.activated_at
                              ? `Since ${new Date(buff.activated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                              : 'Activation time unknown'}
                          </p>
                        </div>
                      </div>
                      <div
                        className="pointer-events-none absolute inset-0 rounded-xl"
                        style={{
                          border: '1px solid rgba(96, 165, 250, 0.4)',
                          boxShadow: '0 0 25px rgba(14, 165, 233, 0.35)'
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlayerProfileCard;
