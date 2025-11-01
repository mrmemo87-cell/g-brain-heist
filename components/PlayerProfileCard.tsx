import React, { useState, useEffect } from 'react';
import { Profile } from '../types';
import { CoinIcon, StreakIcon, XPIcon, APIcon } from './icons';

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


const PlayerProfileCard: React.FC<PlayerProfileCardProps> = ({ profile }) => {
  const xpForNextLevel = Math.ceil(100 * Math.pow(profile.level + 1, 1.5));
  const xpProgressPercent = (profile.xp / xpForNextLevel) * 100;

  const [apCountdown, setApCountdown] = useState<string>('');

  // Calculate time until next AP regeneration
  useEffect(() => {
    const updateCountdown = () => {
      if (profile.ap_now >= profile.ap_max) {
        setApCountdown('Full');
        return;
      }

      const now = new Date();
      const lastApUpdate = profile.last_ap_update ? new Date(profile.last_ap_update) : now;
      const msElapsed = now.getTime() - lastApUpdate.getTime();
      const minutesElapsed = Math.floor(msElapsed / (1000 * 60));
      const minutesUntilNext = 10 - (minutesElapsed % 10);
      const secondsUntilNext = 60 - (Math.floor((msElapsed % (1000 * 60)) / 1000));

      if (minutesUntilNext === 10) {
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
        <StatDisplay icon={<StreakIcon />} label="Streak" value={`${profile.streak} days`} color={'var(--danger-red)'} />
        <StatDisplay icon={<XPIcon />} label="Total XP" value={profile.xp.toLocaleString()} color={'var(--ion-blue)'} />
        <StatDisplay 
          icon={<APIcon />} 
          label="Action Points" 
          value={`${profile.ap_now}/${profile.ap_max}`} 
          color={'var(--success-teal)'} 
          subtitle={profile.ap_now < profile.ap_max ? `+1 in ${apCountdown}` : undefined}
        />
        <StatDisplay icon={<span>⚔️</span>} label="Attack" value={profile.attack_power || 10} color={'var(--danger-red)'} />
        <StatDisplay icon={<span>🛡️</span>} label="Defense" value={profile.defense_power || 10} color={'var(--ion-blue)'} />
      </div>
    </div>
  );
};

export default PlayerProfileCard;
