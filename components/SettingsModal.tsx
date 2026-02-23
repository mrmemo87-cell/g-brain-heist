import React, { useEffect, useState } from 'react';
import { useLightMode } from '../src/contexts/LightModeContext';
import { Profile } from '../types';
import { deactivate_neon_frame, deactivate_flicker_theme } from '../services/gameService';

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
}

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
  requiredChanges
}) => {
  const { isLightMode, toggleLightMode, autoEnabledReason, clearAutoEnabledReason } = useLightMode();
  const [hasNeonFrame, setHasNeonFrame] = useState(profile.active_cosmetic_frame === 'neon');
  const [hasFlickerTheme, setHasFlickerTheme] = useState(profile.active_cosmetic_theme === 'flicker');
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

  // Track whether the original username/avatar at open differs from current
  const [originalUsername] = useState(profile.username);
  const [originalAvatar] = useState(profile.avatar_url);
  const usernameChanged = profile.username !== originalUsername;
  const avatarChanged = profile.avatar_url !== originalAvatar;

  useEffect(() => {
    setHasNeonFrame(profile.active_cosmetic_frame === 'neon');
    setHasFlickerTheme(profile.active_cosmetic_theme === 'flicker');
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
      
      <div 
        className="relative w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden"
        style={{ maxHeight: '90vh' }}
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
          style={{ maxHeight: 'calc(90vh - 80px)' }}
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
              <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
                <span className="text-gray-300">Level</span>
                <span className="font-bold text-white">{profile.level}</span>
              </div>
              {profile.batch && (
                <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
                  <span className="text-gray-300">Batch</span>
                  <span className="font-bold text-white">{profile.batch}</span>
                </div>
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

          {/* Light Mode Toggle */}
          <div>
            <h3 className="font-heading text-xl mb-3" style={{ color: 'var(--amber-warn)' }}>Display</h3>
            <div className="border border-gray-700 rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-semibold text-white mb-1">
                    ⚡ Ultra Performance Mode
                  </h4>
                  <p className="text-sm text-gray-400">
                    Strips all animations, effects, shadows, and gradients. Perfect for low-end devices.
                  </p>
                  <div className="mt-2 text-xs text-gray-500">
                    <strong>Disables:</strong> Lottie animations, particles, backdrop blur, transitions, 
                    cinematic effects, toast animations, and GPU-heavy rendering.
                  </div>
                </div>
              </div>

              <button
                onClick={toggleLightMode}
                className={`w-full px-4 py-3 rounded-lg font-semibold transition ${
                  isLightMode
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                }`}
              >
                {isLightMode ? '✓ ENABLED - Ultra Fast' : '✗ DISABLED - Full Experience'}
              </button>

              {isLightMode && (
                <div className="bg-green-900/20 border border-green-700/50 rounded p-3 text-sm text-green-300">
                  <strong>⚡ Performance mode active!</strong> All heavy effects disabled.
                </div>
              )}

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
            <p>Custom bio and theme settings coming soon!</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
