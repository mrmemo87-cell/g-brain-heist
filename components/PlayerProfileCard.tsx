import React from 'react';
import { useLightMode } from '../src/contexts/LightModeContext';
import { Profile } from '../types';
import { getXpProgress } from '../src/lib/leveling';

interface PlayerProfileCardProps {
  profile: Profile;
}

const PlayerProfileCard: React.FC<PlayerProfileCardProps> = ({ profile }) => {
  const { isLightMode: isLiteMode } = useLightMode();
  const xpProgress = getXpProgress(profile.xp, profile.level);
  const totalScore = profile.total_score ?? (profile.xp + (profile.pvp_score ?? 0) * 10);
  const attackValue = profile.attack_power_effective ?? profile.attack_power;
  const defenseValue = profile.defense_power_effective ?? profile.defense_power;

  if (!isLiteMode) {
    // Full Mode UI (minimal, valid JSX only)
    return (
      <div className="fullMode-profile-card">
        <div className="fullMode-profile-header">
          <div className="fullMode-profile-avatar">
            <img src={profile.avatar_url} alt={profile.username} className="fullMode-profile-avatar-img" />
          </div>
          <div className="fullMode-profile-meta">
            <span className="fullMode-profile-username">{profile.username}</span>
            <span className="fullMode-profile-level">Lv {xpProgress.effectiveLevel}</span>
            <div className="fullMode-profile-xp-bar">
              <div className="fullMode-profile-xp-fill" style={{ width: `${Math.round(xpProgress.progress * 100)}%` }} />
            </div>
            <span className="fullMode-profile-xp-label">{xpProgress.xpIntoLevel.toLocaleString()} / {xpProgress.xpForNextLevel} XP</span>
          </div>
        </div>
        <div className="fullMode-profile-stats">
          <div className="fullMode-profile-stat"><span>🏆</span> {totalScore.toLocaleString()} <span className="fullMode-profile-stat-label">Total Score</span></div>
          <div className="fullMode-profile-stat"><span>⚔️</span> {profile.pvp_score.toLocaleString()} <span className="fullMode-profile-stat-label">PvP</span></div>
          <div className="fullMode-profile-stat"><span>🔥</span> {profile.streak ?? 0} <span className="fullMode-profile-stat-label">Streak</span></div>
          <div className="fullMode-profile-stat"><span>🛡️</span> {defenseValue || 10} <span className="fullMode-profile-stat-label">Defense</span></div>
          <div className="fullMode-profile-stat"><span>💥</span> {attackValue || 10} <span className="fullMode-profile-stat-label">Attack</span></div>
        </div>
      </div>
    );
  }
  // Lightweight/original mode (untouched)
  return (
    <div>
      <span>{profile.username}</span>
    </div>
  );
};

export default PlayerProfileCard;
