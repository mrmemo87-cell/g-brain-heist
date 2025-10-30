import React from 'react';
import { Caps } from '../types';

interface ProgressBarProps {
    label: string;
    remaining: number;
    total: number;
    color: string;
    glowClass: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ label, remaining, total, color, glowClass }) => {
    const used = total - remaining;
    const percent = total > 0 ? (used / total) * 100 : 0;

    return (
        <div>
            <div className="flex justify-between items-end mb-1">
                <span className="text-sm font-medium">{label}</span>
                <span className="text-xs font-mono" style={{ color: 'var(--mist-400)' }}>{used.toLocaleString()} / {total.toLocaleString()}</span>
            </div>
            <div className="w-full bg-black/30 rounded-full h-2">
                <div className={`h-2 rounded-full ${glowClass}`} style={{ width: `${percent}%`, backgroundColor: color }}></div>
            </div>
        </div>
    );
};

interface CapTrackerProps {
  caps: Caps;
}

const CapTracker: React.FC<CapTrackerProps> = ({ caps }) => {
  return (
    <div className="card-glass p-4">
      <h3 className="font-heading text-lg text-gray-300 mb-4 text-center">Resource Caps</h3>
      <div className="space-y-4">
        <ProgressBar label="Daily XP" remaining={caps.xp_daily_remaining} total={caps.daily_xp_cap} color="var(--ion-blue)" glowClass="progress-bar-glow-ion"/>
        <ProgressBar label="Daily Coins" remaining={caps.coins_daily_remaining} total={caps.daily_coins_cap} color="var(--amber-warn)" glowClass="progress-bar-glow-warn"/>
        <ProgressBar label="Weekly XP" remaining={caps.xp_weekly_remaining} total={caps.weekly_xp_cap} color="var(--ion-blue)" glowClass="progress-bar-glow-ion"/>
        <ProgressBar label="Weekly Coins" remaining={caps.coins_weekly_remaining} total={caps.weekly_coins_cap} color="var(--amber-warn)" glowClass="progress-bar-glow-warn"/>
      </div>
    </div>
  );
};

export default CapTracker;
