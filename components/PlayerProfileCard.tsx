import React, { useState, useEffect } from 'react';
import { Profile, ActiveClanBuff } from '../types';
import { CoinIcon, StreakIcon, XPIcon, APIcon, GemIcon } from './icons';

interface PlayerProfileCardProps {
  profile: Profile;
}

const StatDisplay: React.FC<{ icon: React.ReactNode; label: string; value: string | number; color: string; subtitle?: string }> = ({ icon, label, value, color, subtitle }) => (
  <div className="flex items-center space-x-3 bg-black/20 p-3 rounded-2xl">
    <div className="w-8 h-8 flex-shrink-0" style={{ color }}>{icon}</div>
    <div>
      <div className="text-sm" style={{ color: 'var(--mist-400)' }}>{label}</div>
      <div className="text-lg font-semibold font-heading">{value}</div>
      {subtitle && <div className="text-xs" style={{ color: 'var(--mist-400)' }}>{subtitle}</div>}
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
    <div className="card-glass glow-plasma p-5 animate-fade-in-up" style={{ borderColor: 'rgba(255, 45, 145, 0.3)' }}>
      <div className="flex items-center space-x-4 mb-5">
        <img src={profile.avatar_url} alt={profile.username} className="w-20 h-20 rounded-full border-4 animate-float" style={{ borderColor: 'var(--plasma-pink)' }}/>
        <div>
          <h2 className="text-2xl font-bold font-heading neon-text" style={{ color: 'var(--plasma-pink)' }}>{profile.username}</h2>
          <p style={{ color: 'var(--mist-400)' }}>
            {profile.batch ? `Batch ${profile.batch} | ` : ''}
            {profile.role === 'teacher' ? '👨‍🏫 Teacher | ' : ''}
            Level {profile.level}
          </p>
        </div>
      </div>

      <div>
        <div className="flex justify-between items-end mb-1">
          <span className="text-sm font-bold" style={{ color: 'var(--ion-blue)' }}>XP</span>
          <span className="text-xs font-mono" style={{ color: 'var(--mist-400)' }}>{profile.xp} / {xpForNextLevel}</span>
        </div>
        <div className="w-full bg-black/30 rounded-full h-2.5">
          <div className="h-2.5 rounded-full progress-bar-glow-ion shimmer-effect" style={{ width: `${xpProgressPercent}%`, backgroundColor: 'var(--ion-blue)' }}></div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-6">
        <StatDisplay icon={<CoinIcon />} label="Coins" value={profile.coins.toLocaleString()} color={'var(--amber-warn)'} />
        <StatDisplay icon={<GemIcon />} label="Gemstones" value={profile.gemstones.toLocaleString()} color={'var(--ion-blue)'} />
        <StatDisplay icon={<StreakIcon />} label="Streak" value={`${profile.streak} days`} color={'var(--danger-red)'} />
        <StatDisplay icon={<span>🏆</span>} label="Total Score" value={totalScore.toLocaleString()} color={'var(--amber-warn)'} subtitle="XP + PvP" />
        <StatDisplay icon={<XPIcon />} label="Total XP" value={profile.xp.toLocaleString()} color={'var(--ion-blue)'} />
        <StatDisplay icon={<span>🥊</span>} label="PvP Score" value={profile.pvp_score.toLocaleString()} color={'var(--danger-red)'} subtitle="3 pts per win" />
        <StatDisplay 
          icon={<APIcon />} 
          label="Action Points" 
          value={`${calculatedAP}/${profile.ap_max}`} 
          color={'var(--success-teal)'} 
          subtitle={calculatedAP < profile.ap_max ? `+1 in ${apCountdown}` : undefined}
        />
        <StatDisplay icon={<span>⚔️</span>} label="Attack" value={attackValue || 10} color={'var(--danger-red)'} subtitle={attackSubtitle} />
        <StatDisplay icon={<span>🛡️</span>} label="Defense" value={defenseValue || 10} color={'var(--ion-blue)'} subtitle={defenseSubtitle} />
      </div>

      {profile.clan_name && (
        <>
          <div className="mt-6 bg-black/20 p-4 rounded-2xl border border-white/5">
            <p className="text-xs uppercase tracking-wide text-gray-400">Clan</p>
            <div className="flex items-center justify-between mt-1">
              <div>
                <p className="text-xl font-heading text-amber-300">{profile.clan_name}</p>
                <p className="text-sm text-gray-400 capitalize">
                  {profile.clan_role}
                  {profile.clan_custom_title ? ` • ${profile.clan_custom_title}` : ''}
                </p>
              </div>
              {typeof profile.clan_total_score === 'number' && (
                <div className="text-right">
                  <p className="font-semibold text-white">{profile.clan_total_score.toLocaleString()}</p>
                  <p className="text-xs text-gray-400">Clan Score</p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 bg-black/20 p-4 rounded-3xl border border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-xl text-amber-300">Active Clan Effects</h3>
              <p className="text-xs uppercase tracking-wider text-gray-400">{clanBuffs.length} aligned</p>
            </div>
            {clanBuffs.length === 0 ? (
              <p className="text-sm text-gray-400">No clan buffs are active right now.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {clanBuffs.map((buff, index) => (
                  <div
                    key={buff.id}
                    className="relative card-glass p-4 rounded-2xl border border-white/10 shadow-[0_15px_35px_rgba(0,0,0,0.35)]"
                    style={{
                      backgroundImage: 'linear-gradient(145deg, rgba(9, 37, 68, 0.9), rgba(8, 17, 36, 0.95))',
                      borderColor: 'rgba(255,255,255,0.08)'
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white text-lg">{buff.name}</p>
                        <p className="text-xs text-gray-400">{describeClanBuffEffect(buff.effect)}</p>
                      </div>
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-300">
                        {buff.template_code?.toUpperCase() ?? 'Buff'}
                      </span>
                    </div>
                    <div className="mt-3 flex justify-between items-center text-xs text-gray-400">
                      <div>
                        <p>{formatBuffTimeRemaining(buff.expires_at)}</p>
                        {buff.activated_by_name && <p>Activated by {buff.activated_by_name}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-gray-500">
                          {buff.activated_at
                            ? `Since ${new Date(buff.activated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                            : 'Activation time unknown'}
                        </p>
                      </div>
                    </div>
                    <div
                      className="absolute inset-0 rounded-2xl pointer-events-none"
                      style={{
                        border: '1px solid rgba(96, 165, 250, 0.4)',
                        boxShadow: '0 0 35px rgba(14, 165, 233, 0.4)'
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default PlayerProfileCard;
