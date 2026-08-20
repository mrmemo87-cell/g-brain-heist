import React, { useEffect, useState } from 'react';
import { STUDENT_THEME_COLORS, useLightMode, type StudentThemeColor } from '../src/contexts/LightModeContext';
import { Profile } from '../types';
import { deactivate_neon_frame, deactivate_flicker_theme, brains_master_toggle_badge } from '../services/gameService';
import { isBrainsMasterActive } from '../src/utils/premiumHelpers';
import AvatarWithFrame from './AvatarWithFrame';
import { isFlickerThemeActive } from '../src/lib/cosmetics';
import { supabase } from '../services/supabaseClient';

interface SettingsModalProps {
  onClose: () => void;
  profile: Profile;
  isAdminMode: boolean;
  avatarPresets: string[];
  selectedAvatar: string;
  uploadingAvatar: boolean;
  avatarUploadError: string;
  onAvatarSelect: (url: string) => Promise<void>;
  onAvatarUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onNeonFrameDeactivated?: () => void | Promise<void>;
  onFlickerThemeDeactivated?: () => void | Promise<void>;
  onUsernameChange?: (newUsername: string) => Promise<void>;
  avatarUploadSuccess?: boolean;
  requiredChanges?: { username?: boolean; avatar?: boolean; reason?: string } | null;
  placement?: 'center' | 'header-bottom';
  headerOffsetPx?: number;
}

const THEME_COLOR_OPTIONS: Record<StudentThemeColor, { label: string; personality: string; swatches: [string, string, string] }> = {
  blue: { label: 'Blue', personality: 'Clear, electric, focused', swatches: ['#22d3ee', '#3b82f6', '#a5f3fc'] },
  pink: { label: 'Pink', personality: 'Bright, playful, confident', swatches: ['#f472b6', '#ec4899', '#c084fc'] },
  green: { label: 'Green', personality: 'Fresh, energetic, balanced', swatches: ['#34d399', '#22c55e', '#2dd4bf'] },
  purple: { label: 'Purple', personality: 'Creative, bold, dreamy', swatches: ['#c084fc', '#8b5cf6', '#a78bfa'] },
  red: { label: 'Red', personality: 'Powerful, warm, fearless', swatches: ['#fb7185', '#ef4444', '#f59e0b'] },
  dark: { label: 'Dark', personality: 'Stealthy, calm, premium', swatches: ['#94a3b8', '#38bdf8', '#334155'] },
};

const SettingsModal: React.FC<SettingsModalProps> = ({ 
  onClose, 
  profile,
  isAdminMode,
  avatarPresets,
  selectedAvatar,
  uploadingAvatar,
  avatarUploadError,
  onAvatarSelect,
  onAvatarUpload,
  onNeonFrameDeactivated,
  onFlickerThemeDeactivated,
  onUsernameChange,
  avatarUploadSuccess,
  requiredChanges,
  placement = 'center',
  headerOffsetPx = 80,
}) => {
  const {
    isLightMode,
    setInterfaceStyle,
    studentThemeColor,
    setStudentThemeColor,
    autoEnabledReason,
    clearAutoEnabledReason,
  } = useLightMode();
  const [hasNeonFrame, setHasNeonFrame] = useState(profile.active_cosmetic_frame === 'neon');
  const [hasFlickerTheme, setHasFlickerTheme] = useState(isFlickerThemeActive(profile.active_cosmetic_theme));
  const [neonBusy, setNeonBusy] = useState(false);
  const [flickerBusy, setFlickerBusy] = useState(false);
  const [neonError, setNeonError] = useState<string | null>(null);
  const [flickerError, setFlickerError] = useState<string | null>(null);
  const [neonSuccess, setNeonSuccess] = useState<string | null>(null);
  const [flickerSuccess, setFlickerSuccess] = useState<string | null>(null);

  // Username editing state
  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState(profile.username);
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameSuccess, setUsernameSuccess] = useState(false);

  // Student real-name state. This is private school/exam identity, separate from the public username.
  const [fullName, setFullName] = useState(profile.full_name || '');
  const [fullNameStatus, setFullNameStatus] = useState(profile.full_name_status || 'pending');
  const [fullNameSaving, setFullNameSaving] = useState(false);
  const [fullNameMessage, setFullNameMessage] = useState<string | null>(null);
  const [fullNameError, setFullNameError] = useState<string | null>(null);

  // Brains Master badge toggle
  const bmActive = isBrainsMasterActive(profile);
  const [bmShowBadge, setBmShowBadge] = useState(profile.brains_master_show_badge !== false);
  const [bmBadgeBusy, setBmBadgeBusy] = useState(false);

  // Track whether the original username/avatar at open differs from current
  const [originalUsername] = useState(profile.username);
  const [originalAvatar] = useState(profile.avatar_url);
  const usernameChanged = profile.username !== originalUsername;
  const avatarChanged = profile.avatar_url !== originalAvatar;

  useEffect(() => {
    setHasNeonFrame(profile.active_cosmetic_frame === 'neon');
    setHasFlickerTheme(isFlickerThemeActive(profile.active_cosmetic_theme));
  }, [profile.active_cosmetic_frame, profile.active_cosmetic_theme]);

  const handleNeonDeactivate = async () => {
    if (!hasNeonFrame || neonBusy) {
      return;
    }

    const confirmed = window.confirm('This permanently removes the neon frame glow. You will need another neon drop to enable it again. Proceed?');
    if (!confirmed) {
      return;
    }

    setNeonBusy(true);
    setNeonError(null);
    setNeonSuccess(null);

    try {
      await deactivate_neon_frame();
      setHasNeonFrame(false);
      setNeonSuccess('Neon frame removed. This change is permanent.');
      await onNeonFrameDeactivated?.();
    } catch (error: any) {
      console.error('Failed to deactivate neon frame:', error);
      setNeonError(error?.message || 'Failed to deactivate neon frame.');
    } finally {
      setNeonBusy(false);
    }
  };

  const handleFlickerDeactivate = async () => {
    if (!hasFlickerTheme || flickerBusy) {
      return;
    }

    const confirmed = window.confirm('This permanently removes the flicker theme effect. You will need another flicker drop to enable it again. Proceed?');
    if (!confirmed) {
      return;
    }

    setFlickerBusy(true);
    setFlickerError(null);
    setFlickerSuccess(null);

    try {
      await deactivate_flicker_theme();
      setHasFlickerTheme(false);
      setFlickerSuccess('Flicker theme removed. This change is permanent.');
      await onFlickerThemeDeactivated?.();
    } catch (error: any) {
      console.error('Failed to deactivate flicker theme:', error);
      setFlickerError(error?.message || 'Failed to deactivate flicker theme.');
    } finally {
      setFlickerBusy(false);
    }
  };

  const handleUsernameSave = async () => {
    if (!onUsernameChange) return;
    const trimmed = newUsername.trim();
    if (trimmed === profile.username) {
      setEditingUsername(false);
      return;
    }
    setUsernameSaving(true);
    setUsernameError(null);
    setUsernameSuccess(false);
    try {
      await onUsernameChange(trimmed);
      setUsernameSuccess(true);
      setEditingUsername(false);
    } catch (error: any) {
      setUsernameError(error.message || 'Failed to update username.');
    } finally {
      setUsernameSaving(false);
    }
  };

  const handleFullNameSave = async () => {
    const trimmed = fullName.trim().replace(/\s+/g, ' ');
    if (trimmed.length < 5 || !trimmed.includes(' ')) {
      setFullNameError('Enter your real first and last name.');
      return;
    }
    const changingVerifiedName = fullNameStatus === 'verified' && trimmed !== profile.full_name;
    if (changingVerifiedName && !window.confirm('Changing a verified name sends it back to your school administrator for confirmation. Continue?')) {
      return;
    }
    setFullNameSaving(true);
    setFullNameError(null);
    setFullNameMessage(null);
    try {
      const { data, error } = await supabase.rpc('submit_my_full_name', { p_full_name: trimmed });
      if (error || !data?.success) throw new Error(data?.error || error?.message || 'Could not save your real name.');
      setFullName(trimmed);
      setFullNameStatus('pending');
      setFullNameMessage('Saved. Your school administrator now needs to confirm this name.');
    } catch (error: any) {
      setFullNameError(error?.message || 'Could not save your real name.');
    } finally {
      setFullNameSaving(false);
    }
  };

  const isHeaderAnchored = placement === 'header-bottom';
  const modalVerticalPadding = isHeaderAnchored ? `${Math.max(headerOffsetPx, 56)}px` : '16px';
  const modalMaxHeight = isHeaderAnchored
    ? `calc(100vh - ${Math.max(headerOffsetPx, 56) + 24}px)`
    : '90vh';
  const modalBodyMaxHeight = isHeaderAnchored
    ? `calc(100vh - ${Math.max(headerOffsetPx, 56) + 104}px)`
    : 'calc(90vh - 80px)';

  return (
    <div
      className={`fixed inset-0 z-[70] flex justify-center p-4 ${isHeaderAnchored ? 'items-start' : 'items-center'}`}
      style={{ paddingTop: modalVerticalPadding }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
      
      <div 
        className="relative w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden"
        style={{ maxHeight: modalMaxHeight }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Fixed */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700 bg-gray-900">
          <h2 className="font-heading text-2xl sm:text-3xl" style={{ color: 'var(--ion-blue)' }}>
            ⚙️ Settings
          </h2>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg font-semibold transition-all bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400 text-white text-sm"
          >
            Close
          </button>
        </div>

        {/* Scrollable Content */}
        <div 
          className="overflow-y-auto p-6 space-y-6"
          style={{ maxHeight: modalBodyMaxHeight }}
        >
          {/* Required Changes Status Panel */}
          {requiredChanges && (requiredChanges.username || requiredChanges.avatar) && (
            <div className="rounded-xl border-2 border-yellow-500/60 bg-yellow-500/10 p-4 space-y-3">
              <h3 className="font-heading text-lg text-yellow-400">⚠️ Profile Update Required</h3>
              {requiredChanges.reason && (
                <p className="text-sm text-yellow-200/80">Reason: {requiredChanges.reason}</p>
              )}
              <div className="space-y-2">
                {requiredChanges.username && (
                  <div className="flex items-center gap-2 text-sm">
                    {usernameChanged || usernameSuccess
                      ? <span className="text-green-400 text-lg">✅</span>
                      : <span className="text-gray-500 text-lg">⬜</span>}
                    <span className={usernameChanged || usernameSuccess ? 'text-green-300 line-through' : 'text-yellow-200'}>
                      Change your username
                    </span>
                  </div>
                )}
                {requiredChanges.avatar && (
                  <div className="flex items-center gap-2 text-sm">
                    {avatarChanged || avatarUploadSuccess
                      ? <span className="text-green-400 text-lg">✅</span>
                      : <span className="text-gray-500 text-lg">⬜</span>}
                    <span className={avatarChanged || avatarUploadSuccess ? 'text-green-300 line-through' : 'text-yellow-200'}>
                      Change your avatar
                    </span>
                  </div>
                )}
              </div>
              {((requiredChanges.username && (usernameChanged || usernameSuccess)) || !requiredChanges.username) &&
               ((requiredChanges.avatar && (avatarChanged || avatarUploadSuccess)) || !requiredChanges.avatar) && (
                <p className="text-sm text-green-300 font-semibold mt-2">🎉 All changes complete! Your access will be restored automatically.</p>
              )}
            </div>
          )}

          {/* Avatar Selection */}
          <div>
            <h3 className="font-heading text-xl mb-3" style={{ color: 'var(--amber-warn)' }}>Avatar</h3>
            <div className="mb-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-black/25 p-3">
              <AvatarWithFrame
                src={selectedAvatar || profile.avatar_url}
                alt={profile.username || 'Current avatar'}
                size="md"
                hasNeonFrame={hasNeonFrame}
                hasFlickerTheme={hasFlickerTheme}
                hasGlitchEffect={profile.active_cosmetic_effect === 'glitch'}
                fallbackFrameClassName="border-2 border-slate-700"
              />
              <div>
                <p className="text-sm font-semibold text-white">Current avatar preview</p>
                <p className="text-xs text-gray-400">Active cosmetics are rendered here the same way other players see them.</p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {avatarPresets.map((avatarUrl, idx) => (
                <button
                  key={idx}
                  onClick={() => void onAvatarSelect(avatarUrl)}
                  disabled={uploadingAvatar}
                  className={`w-full aspect-square rounded-lg overflow-hidden border-2 transition-all hover:scale-105 ${
                    selectedAvatar === avatarUrl 
                      ? 'border-cyan-400 shadow-lg shadow-cyan-500/50' 
                      : 'border-gray-600 hover:border-gray-400'
                  }`}
                >
                  <img src={avatarUrl} alt={`Avatar ${idx + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
            <div className="mt-4 border-t border-gray-700 pt-4">
              <label className="block text-sm text-gray-300 mb-2">Upload custom avatar</label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={onAvatarUpload}
                disabled={uploadingAvatar}
                className="w-full text-sm text-gray-300 file:mr-3 file:rounded-md file:border-0 file:bg-cyan-500/20 file:px-3 file:py-2 file:text-white hover:file:bg-cyan-500/30 disabled:opacity-60"
              />
              <p className="text-xs text-gray-500 mt-2">PNG, JPG, or WebP. Large images are auto-resized to fit.</p>
              {avatarUploadError && (
                <p className="mt-2 text-xs text-red-300">{avatarUploadError}</p>
              )}
              {avatarUploadSuccess && (
                <p className="mt-2 text-xs text-green-300 font-semibold">✅ Avatar updated successfully!</p>
              )}
            </div>
            {uploadingAvatar && (
              <p className="text-xs text-center text-cyan-400 animate-pulse mt-3">Saving avatar...</p>
            )}
          </div>

          {/* Profile Section */}
          <div>
            <h3 className="font-heading text-xl mb-3" style={{ color: 'var(--amber-warn)' }}>Profile</h3>
            <div className="space-y-3">
              {profile.role === 'student' && (
                <div className="p-4 bg-black/20 rounded-lg space-y-3 border border-gray-700">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">Real name</p>
                      <p className="text-xs text-gray-400">Private school identity used on Cambridge tests—not your public codename.</p>
                    </div>
                    <span className={`shrink-0 text-xs px-2 py-1 rounded-full ${
                      fullNameStatus === 'verified' ? 'bg-green-500/20 text-green-300 border border-green-500/40' :
                      fullNameStatus === 'rejected' ? 'bg-red-500/20 text-red-300 border border-red-500/40' :
                      'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    }`}>
                      {fullNameStatus === 'verified' ? 'Confirmed' : fullNameStatus === 'rejected' ? 'Correction required' : 'Awaiting confirmation'}
                    </span>
                  </div>
                  <label htmlFor="settings-full-name" className="sr-only">Real first and last name</label>
                  <input
                    id="settings-full-name"
                    type="text"
                    autoComplete="name"
                    value={fullName}
                    onChange={(event) => { setFullName(event.target.value); setFullNameError(null); setFullNameMessage(null); }}
                    placeholder="First and last name"
                    maxLength={120}
                    className="w-full min-h-11 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/30"
                  />
                  <button
                    type="button"
                    onClick={() => void handleFullNameSave()}
                    disabled={fullNameSaving || fullName.trim().length < 5 || !fullName.trim().includes(' ') || (fullNameStatus === 'verified' && fullName.trim() === profile.full_name)}
                    className="w-full min-h-11 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-400 font-semibold text-white transition"
                  >
                    {fullNameSaving ? 'Saving…' : fullNameStatus === 'verified' ? 'Submit name change' : 'Send to school for confirmation'}
                  </button>
                  {fullNameStatus === 'pending' && <p className="text-xs text-amber-200">You can use Cambridge tests after a school administrator confirms this name.</p>}
                  {fullNameStatus === 'rejected' && <p className="text-xs text-red-300">Your school requested a correction. Update the name and send it again.</p>}
                  {fullNameError && <p role="alert" className="text-xs text-red-300">{fullNameError}</p>}
                  {fullNameMessage && <p role="status" className="text-xs text-green-300">{fullNameMessage}</p>}
                </div>
              )}

              <div className="p-3 bg-black/20 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-gray-300">Username</span>
                  {!editingUsername ? (
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{profile.username}</span>
                      {onUsernameChange && (
                        <button
                          onClick={() => { setEditingUsername(true); setNewUsername(profile.username); setUsernameError(null); setUsernameSuccess(false); }}
                          className="text-xs px-2 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 transition"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        maxLength={30}
                        autoFocus
                        className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white w-40 focus:border-cyan-400 focus:outline-none"
                        onKeyDown={(e) => { if (e.key === 'Enter') void handleUsernameSave(); if (e.key === 'Escape') setEditingUsername(false); }}
                      />
                      <button
                        onClick={() => void handleUsernameSave()}
                        disabled={usernameSaving || newUsername.trim().length < 2}
                        className="text-xs px-2 py-1 rounded bg-green-500/20 hover:bg-green-500/30 text-green-300 border border-green-500/40 transition disabled:opacity-50"
                      >
                        {usernameSaving ? '...' : 'Save'}
                      </button>
                      <button
                        onClick={() => setEditingUsername(false)}
                        className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
                {usernameError && <p className="text-xs text-red-300">{usernameError}</p>}
                {usernameSuccess && <p className="text-xs text-green-300">✅ Username updated!</p>}
              </div>
              {profile.role !== 'teacher' && (
                <>
                  <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
                    <span className="text-gray-300">Level</span>
                    <span className="font-bold text-white">{profile.level}</span>
                  </div>
                  {profile.batch && (
                    <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
                      <span className="text-gray-300">Class</span>
                      <span className="font-bold text-white">{profile.batch}</span>
                    </div>
                  )}
                </>
              )}
              {profile.role === 'teacher' && (
                <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
                  <span className="text-gray-300">Role</span>
                  <span className="font-bold text-cyan-400">Teacher</span>
                </div>
              )}
              {isAdminMode && (
                <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg border border-pink-500/50">
                  <span className="text-gray-300">Admin</span>
                  <span className="font-bold text-pink-400">✓ Verified</span>
                </div>
              )}
            </div>
          </div>

          {/* Cosmetics - Only show for non-teacher accounts */}
          {profile.role !== 'teacher' && (
          <div>
            <h3 className="font-heading text-xl mb-3" style={{ color: 'var(--amber-warn)' }}>Cosmetics</h3>
            {hasNeonFrame ? (
              <div className="rounded-2xl border border-amber-400/50 bg-amber-500/10 p-4 space-y-3">
                <div>
                  <p className="font-semibold text-amber-200">Neon Frame Active</p>
                  <p className="text-sm text-amber-100/80">
                    Your avatar glows across PvP, clan, and leaderboards. Turning it off is permanent and consumes the neon frame item.
                  </p>
                </div>
                <button
                  onClick={handleNeonDeactivate}
                  disabled={neonBusy}
                  className="w-full rounded-xl border border-amber-300/70 px-4 py-2.5 font-heading text-sm font-semibold text-amber-100 transition enabled:hover:bg-amber-400/20 disabled:opacity-60"
                >
                  {neonBusy ? 'Removing…' : 'Deactivate Neon Frame Forever'}
                </button>
                <p className="text-xs text-amber-100/70">
                  ⚠️ Once disabled you must unlock another neon frame drop to regain the effect.
                </p>
                {neonError && <p className="text-xs text-red-300">{neonError}</p>}
                {neonSuccess && <p className="text-xs text-green-300">{neonSuccess}</p>}
              </div>
            ) : (
              <div className="rounded-2xl border border-gray-700 bg-black/30 p-4 text-sm text-gray-400">
                <p>No neon frame is currently active on this account.</p>
              </div>
            )}

            {/* Flicker Theme */}
            {hasFlickerTheme ? (
              <div className="mt-4 rounded-2xl border border-cyan-400/50 bg-cyan-500/10 p-4 space-y-3">
                <div>
                  <p className="font-semibold text-cyan-200">Flicker Theme Active</p>
                  <p className="text-sm text-cyan-100/80">
                    Your avatar has a flickering, datamosh effect visible across PvP, clan, and leaderboards. Turning it off is permanent and consumes the flicker theme item.
                  </p>
                </div>
                <button
                  onClick={handleFlickerDeactivate}
                  disabled={flickerBusy}
                  className="w-full rounded-xl border border-cyan-300/70 px-4 py-2.5 font-heading text-sm font-semibold text-cyan-100 transition enabled:hover:bg-cyan-400/20 disabled:opacity-60"
                >
                  {flickerBusy ? 'Removing…' : 'Deactivate Flicker Theme Forever'}
                </button>
                <p className="text-xs text-cyan-100/70">
                  ⚠️ Once disabled you must unlock another flicker theme drop to regain the effect.
                </p>
                {flickerError && <p className="text-xs text-red-300">{flickerError}</p>}
                {flickerSuccess && <p className="text-xs text-green-300">{flickerSuccess}</p>}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-gray-700 bg-black/30 p-4 text-sm text-gray-400">
                <p>No flicker theme is currently active on this account.</p>
              </div>
            )}
          </div>
          )}

          {/* Brains Master Badge Toggle */}
          {bmActive && (
          <div>
            <h3 className="font-heading text-xl mb-3" style={{ color: 'var(--amber-warn)' }}>Brains Master</h3>
            <div className="rounded-2xl border border-amber-400/50 bg-amber-500/10 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-amber-200">🧠 Public Badge Display</p>
                  <p className="text-sm text-amber-100/80">
                    Show the Brains Master badge next to your name on leaderboards, clans, and PvP.
                  </p>
                </div>
                <button
                  onClick={async () => {
                    setBmBadgeBusy(true);
                    try {
                      const next = !bmShowBadge;
                      await brains_master_toggle_badge(next);
                      setBmShowBadge(next);
                    } catch {} finally {
                      setBmBadgeBusy(false);
                    }
                  }}
                  disabled={bmBadgeBusy}
                  className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${
                    bmShowBadge
                      ? 'bg-amber-500/30 text-amber-200 border border-amber-400/50 hover:bg-amber-500/40'
                      : 'bg-gray-700 text-gray-400 border border-gray-600 hover:bg-gray-600'
                  } disabled:opacity-50`}
                >
                  {bmBadgeBusy ? '...' : bmShowBadge ? 'Visible' : 'Hidden'}
                </button>
              </div>
              <p className="text-xs text-amber-100/60">
                Premium benefits remain active regardless of badge visibility.
              </p>
            </div>
          </div>
          )}

          {/* Interface appearance */}
          <div>
            <h3 className="font-heading text-xl mb-3" style={{ color: 'var(--amber-warn)' }}>Display</h3>
            <div className="student-display-settings border border-gray-700 rounded-2xl p-4 space-y-5">
              <fieldset>
                <legend className="font-semibold text-white">Interface style</legend>
                <p className="mt-1 text-sm text-gray-400">Choose how dashboard surfaces look. This does not change your content or progress.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <button type="button" role="radio" aria-checked={!isLightMode} onClick={() => setInterfaceStyle('glassy')} className={`student-display-style-option ${!isLightMode ? 'is-selected' : ''}`}>
                    <span className="student-display-style-option__visual is-glassy" aria-hidden><i /><i /><i /></span>
                    <span className="block font-bold text-white">Glassy</span>
                    <span className="mt-1 block text-xs leading-5 text-gray-400">Layered glass, soft glow, smooth depth, and richer motion.</span>
                  </button>
                  <button type="button" role="radio" aria-checked={isLightMode} onClick={() => setInterfaceStyle('basic')} className={`student-display-style-option ${isLightMode ? 'is-selected' : ''}`}>
                    <span className="student-display-style-option__visual is-basic" aria-hidden><i /><i /><i /></span>
                    <span className="block font-bold text-white">Basic</span>
                    <span className="mt-1 block text-xs leading-5 text-gray-400">Clean solid surfaces with fewer effects for smoother use and longer battery life.</span>
                  </button>
                </div>
              </fieldset>

              {(profile.role === 'student' || profile.role === 'teacher') ? (
                <fieldset className="border-t border-gray-700 pt-4">
                  <legend className="font-semibold text-white">Interface color</legend>
                  <p className="mt-1 text-sm text-gray-400">Choose a complete dashboard personality. Your selection changes surfaces, navigation, buttons, progress, cards, and glow.</p>

                  <div className="student-theme-live-preview mt-4" role="status" aria-live="polite" aria-label={`${THEME_COLOR_OPTIONS[studentThemeColor].label} interface preview`}>
                    <div className="student-theme-live-preview__topline">
                      <span>Live preview</span>
                      <strong>{THEME_COLOR_OPTIONS[studentThemeColor].label} · {isLightMode ? 'Basic' : 'Glassy'}</strong>
                    </div>
                    <div className="student-theme-live-preview__dashboard" aria-hidden>
                      <span className="student-theme-live-preview__avatar">BH</span>
                      <span className="student-theme-live-preview__copy"><i /><i /></span>
                      <span className="student-theme-live-preview__action">Continue</span>
                    </div>
                    <div className="student-theme-live-preview__progress" aria-hidden><span /></div>
                    <div className="student-theme-live-preview__chips" aria-hidden><span>Learn</span><span>Tasks</span><span>Profile</span></div>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Dashboard interface color">
                    {STUDENT_THEME_COLORS.map((color) => {
                      const option = THEME_COLOR_OPTIONS[color];
                      const selected = studentThemeColor === color;
                      return (
                        <button key={color} type="button" role="radio" aria-checked={selected} aria-label={`${option.label}: ${option.personality}`} data-theme-color={color} onClick={() => setStudentThemeColor(color)} className={`student-theme-option ${selected ? 'is-selected' : ''}`}>
                          <span className="student-theme-option__swatches" aria-hidden>
                            {option.swatches.map((swatch) => <i key={swatch} style={{ backgroundColor: swatch }} />)}
                          </span>
                          <span className="min-w-0">
                            <span className="block font-bold text-white">{option.label}</span>
                            <span className="mt-0.5 block text-[11px] leading-4 text-slate-400">{option.personality}</span>
                          </span>
                          {selected ? <span className="student-theme-option__check" aria-hidden>✓</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ) : null}

              {autoEnabledReason && (
                <div className="bg-amber-900/30 border border-amber-600/50 rounded p-3 text-sm text-amber-100 space-y-2">
                  <div className="font-semibold">We protected your device automatically</div>
                  <p className="text-amber-100/80">{autoEnabledReason}</p>
                  <button
                    type="button"
                    onClick={clearAutoEnabledReason}
                    className="text-xs font-semibold text-amber-200 underline underline-offset-2 hover:text-amber-100"
                  >
                    Dismiss notice
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Note about future features */}
          <div className="text-xs text-gray-500 text-center pt-4 border-t border-gray-700">
            <p>Your display choices are saved on this device.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
