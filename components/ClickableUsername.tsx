import React, { useState, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Profile } from '../types';
import { getPublicProfile } from '../services/gameService';
import { ShieldIcon, BrainIcon } from './icons';
import AvatarWithFrame from './AvatarWithFrame';
import DeveloperBadge from './DeveloperBadge';
import { isDeveloperBadgeUser } from './developerBadge';

interface ClickableUsernameProps {
  /** The user ID to fetch profile for */
  userId: string;
  /** The username to display */
  username: string;
  /** Optional className for styling the clickable text */
  className?: string;
  /** Children to render instead of the username text (for custom rendering) */
  children?: React.ReactNode;
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

// Portal-based modal that renders at document.body level for proper centering
const ModalPortal: React.FC<{ children: React.ReactNode; onClose: () => void }> = ({ children, onClose }) => {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return ReactDOM.createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      style={{ margin: 0, padding: 0, top: 0, left: 0, right: 0, bottom: 0 }}
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-md mx-4 rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};

const ProfileModal: React.FC<{ profile: Profile; onClose: () => void }> = ({ profile, onClose }) => {
  const clanLine = profile.clan_name
    ? `${profile.clan_name}${profile.clan_role ? ` · ${profile.clan_role}` : ''}${profile.clan_custom_title ? ` · ${profile.clan_custom_title}` : ''}`
    : 'No clan';

  const bioText = profile.bio?.trim() || 'No bio set.';
  const showDeveloperBadge = isDeveloperBadgeUser(profile.id);

  return (
    <ModalPortal onClose={onClose}>
      <div className="flex items-start justify-between border-b border-slate-700 px-5 py-4">
        <div className="flex items-center gap-4">
          <AvatarWithFrame
            src={profile.avatar_url}
            alt={profile.username}
            size="lg"
            hasNeonFrame={profile.active_cosmetic_frame === 'neon'}
            hasGlitchTheme={profile.active_cosmetic_theme === 'flicker'}
            hasGlitchEffect={profile.active_cosmetic_effect === 'glitch'}
            fallbackFrameClassName="border-2 border-pink-400/60"
          />
          <div>
            <h3 className="text-lg font-bold text-white inline-flex items-center">
              <span>{profile.username}</span>
              {showDeveloperBadge && <DeveloperBadge />}
            </h3>
            <p className="text-xs uppercase tracking-wide text-cyan-300">Level {profile.level}</p>
            {profile.batch && profile.batch !== 'N/A' && (
              <p className="text-xs text-slate-400">Batch {profile.batch}</p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-slate-600 px-3 py-1 text-sm text-slate-200 transition hover:bg-slate-700"
        >
          Close
        </button>
      </div>

      <div className="grid gap-4 px-5 py-4">
        {/* Public Stats - Only show PvP, Attack, Defense */}
        <div className="grid grid-cols-3 gap-3">
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

        {/* Bio */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Bio</h4>
          <p className="mt-1 text-sm text-slate-200">{bioText}</p>
        </div>

        {/* Clan */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Clan</h4>
            <p className="mt-1 text-sm text-slate-200">{clanLine}</p>
          </div>
          {profile.clan_name && <span className="rounded-full bg-cyan-500/20 px-3 py-1 text-xs font-semibold text-cyan-200">Active</span>}
        </div>
      </div>
    </ModalPortal>
  );
};

const ClickableUsername: React.FC<ClickableUsernameProps> = ({ 
  userId, 
  username, 
  className = '',
  children 
}) => {
  const [showModal, setShowModal] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Reset state and show modal immediately
    setProfile(null);
    setError(null);
    setShowModal(true);
    setLoading(true);

    try {
      const fetchedProfile = await getPublicProfile(userId);
      if (fetchedProfile) {
        setProfile(fetchedProfile);
      } else {
        setError('Failed to load profile');
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const handleClose = useCallback(() => {
    setShowModal(false);
  }, []);

  const defaultClassName = 'cursor-pointer hover:text-cyan-300 transition-colors underline decoration-dotted decoration-cyan-400/50 underline-offset-2';
  const showDeveloperBadge = isDeveloperBadgeUser(userId);

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={className || defaultClassName}
      >
        <span className="inline-flex items-center">
          {children || username}
          {showDeveloperBadge && <DeveloperBadge />}
        </span>
      </button>

      {showModal && (
        <>
          {loading && (
            <ModalPortal onClose={handleClose}>
              <div className="flex flex-col items-center gap-3 p-12">
                <div className="w-10 h-10 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-300 text-sm">Loading profile...</p>
              </div>
            </ModalPortal>
          )}

          {error && !loading && (
            <ModalPortal onClose={handleClose}>
              <div className="flex flex-col items-center justify-center gap-4 p-12">
                <p className="text-red-400 text-sm">{error}</p>
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm hover:bg-slate-600 transition"
                >
                  Close
                </button>
              </div>
            </ModalPortal>
          )}

          {profile && !loading && !error && (
            <ProfileModal profile={profile} onClose={handleClose} />
          )}
        </>
      )}
    </>
  );
};

export default ClickableUsername;
