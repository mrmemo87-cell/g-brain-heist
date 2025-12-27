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
    return (
      <div className="fullMode-profile-card theme-neon-glass">
        <div className="fullMode-profile-top">
          <div className="fullMode-profile-avatarShell">
            <span className="fullMode-profile-ambient" aria-hidden />
            <img src={profile.avatar_url} alt={profile.username} className="fullMode-profile-avatar-img" />
            <span className="fullMode-profile-levelChip">Lv {xpProgress.effectiveLevel}</span>
          </div>
          <div className="fullMode-profile-meta">
            <p className="fullMode-profile-role">AGENT STATUS</p>
            <h3 className="fullMode-profile-username">{profile.username}</h3>
            <div className="fullMode-profile-xp-row">
              <div className="fullMode-profile-xp-bar" role="progressbar" aria-valuenow={Math.round(xpProgress.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                <span className="fullMode-profile-xp-fill" style={{ width: `${Math.round(xpProgress.progress * 100)}%` }} />
              </div>
              <span className="fullMode-profile-xp-label">
                {xpProgress.xpIntoLevel.toLocaleString()} / {xpProgress.xpForNextLevel} XP
              </span>
            </div>
          </div>
        </div>
        <div className="fullMode-profile-stats">
          <div className="fullMode-profile-stat">
            <span className="fullMode-profile-stat-icon">🏆</span>
            <div className="fullMode-profile-stat-content">
              <strong>{totalScore.toLocaleString()}</strong>
              <span className="fullMode-profile-stat-label">Total Score</span>
            </div>
          </div>
          <div className="fullMode-profile-stat">
            <span className="fullMode-profile-stat-icon">⚔️</span>
            <div className="fullMode-profile-stat-content">
              <strong>{profile.pvp_score.toLocaleString()}</strong>
              <span className="fullMode-profile-stat-label">PvP</span>
            </div>
          </div>
          <div className="fullMode-profile-stat">
            <span className="fullMode-profile-stat-icon">🔥</span>
            <div className="fullMode-profile-stat-content">
              <strong>{profile.streak ?? 0}</strong>
              <span className="fullMode-profile-stat-label">Streak</span>
            </div>
          </div>
          <div className="fullMode-profile-stat">
            <span className="fullMode-profile-stat-icon">🛡️</span>
            <div className="fullMode-profile-stat-content">
              <strong>{defenseValue || 10}</strong>
              <span className="fullMode-profile-stat-label">Defense</span>
            </div>
          </div>
          <div className="fullMode-profile-stat">
            <span className="fullMode-profile-stat-icon">💥</span>
            <div className="fullMode-profile-stat-content">
              <strong>{attackValue || 10}</strong>
              <span className="fullMode-profile-stat-label">Attack</span>
            </div>
          </div>
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
