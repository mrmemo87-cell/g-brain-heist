import React from 'react';
import { Profile } from '../types';
import { APIcon, CoinIcon, GemIcon, ShieldIcon, StreakIcon, XPIcon, BrainIcon } from './icons';

interface UserProfileModalProps {
  profile: Profile;
  apValue?: number;
  onClose: () => void;
}

const StatPill: React.FC<{ label: string; value: string | number; icon?: React.ReactNode }> = ({ label, value, icon }) => (
  <div className="flex items-center gap-2 rounded-xl border border-slate-800/60 bg-slate-900/60 px-3 py-2 shadow-inner shadow-slate-950/30">
    {icon && <div className="text-cyan-300">{icon}</div>}
    <div className="flex flex-col leading-tight">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="font-mono text-sm font-bold text-white">{value}</span>
    </div>
  </div>
);

const UserProfileModal: React.FC<UserProfileModalProps> = ({ profile, apValue, onClose }) => {
  const clanLine = profile.clan_name
    ? `${profile.clan_name}${profile.clan_role ? ` · ${profile.clan_role}` : ''}`
    : 'No clan yet';

  const bioText = profile.bio?.trim() || 'Add a short bio from Settings to let others know more about you.';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900/90 shadow-2xl shadow-cyan-900/40">
        <div className="flex items-start justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-4">
            <div className={`relative h-14 w-14 overflow-hidden rounded-full border-2 ${profile.active_cosmetic_frame === 'neon' ? 'neon-frame neon-frame-sm' : 'border-pink-400/60'}`}>
              <img src={profile.avatar_url} alt={profile.username} className="h-full w-full object-cover" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">{profile.username}</h3>
              <p className="text-xs uppercase tracking-wide text-cyan-300">Level {profile.level}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-200 transition hover:bg-slate-800"
          >
            Close
          </button>
        </div>

        <div className="grid gap-4 px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <StatPill
              label="Coins"
              value={profile.coins.toLocaleString()}
              icon={<CoinIcon className="h-5 w-5 text-yellow-300 drop-shadow-[0_0_6px_rgba(234,179,8,0.6)]" />}
            />
            <StatPill
              label="XP"
              value={profile.xp.toLocaleString()}
              icon={<XPIcon className="h-5 w-5 text-cyan-300 drop-shadow-[0_0_6px_rgba(34,211,238,0.6)]" />}
            />
            <StatPill
              label="Gemstones"
              value={profile.gemstones.toLocaleString()}
              icon={<GemIcon className="h-5 w-5 text-rose-300 drop-shadow-[0_0_6px_rgba(244,114,182,0.6)]" />}
            />
            <StatPill
              label="AP"
              value={`${apValue ?? profile.ap_now}/${profile.ap_max}`}
              icon={<APIcon className="h-5 w-5 text-emerald-300 drop-shadow-[0_0_6px_rgba(16,185,129,0.6)]" />}
            />
            <StatPill
              label="Streak"
              value={`${profile.streak || 0} days`}
              icon={<StreakIcon className="h-5 w-5 text-orange-300 drop-shadow-[0_0_6px_rgba(251,146,60,0.6)]" />}
            />
            <StatPill
              label="PvP Score"
              value={profile.pvp_score}
              icon={<BrainIcon className="h-5 w-5 text-indigo-300 drop-shadow-[0_0_6px_rgba(165,180,252,0.6)]" />}
            />
            <StatPill
              label="Attack"
              value={profile.attack_power}
              icon={<BrainIcon className="h-5 w-5 text-pink-300 drop-shadow-[0_0_6px_rgba(244,114,182,0.6)]" />}
            />
            <StatPill
              label="Defense"
              value={profile.defense_power}
              icon={<ShieldIcon className="h-5 w-5 text-blue-300 drop-shadow-[0_0_6px_rgba(96,165,250,0.6)]" />}
            />
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Bio</h4>
            <p className="mt-1 text-sm text-slate-200">{bioText}</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Clan</h4>
              <p className="mt-1 text-sm text-slate-200">{clanLine}</p>
            </div>
            {profile.clan_name && <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-200">Active</span>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserProfileModal;
