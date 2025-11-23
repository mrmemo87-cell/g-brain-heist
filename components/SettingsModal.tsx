import React, { useEffect, useState } from 'react';
import { useLightMode } from '../src/contexts/LightModeContext';
import { Profile } from '../types';
import { isAdmin } from '../services/adminService';
import { deactivate_neon_frame } from '../services/gameService';

interface SettingsModalProps {
  onClose: () => void;
  profile: Profile;
  avatarPresets: string[];
  selectedAvatar: string;
  uploadingAvatar: boolean;
  avatarUploadError: string;
  onAvatarSelect: (url: string) => Promise<void>;
  onAvatarUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onNeonFrameDeactivated?: () => void | Promise<void>;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ 
  onClose, 
  profile,
  avatarPresets,
  selectedAvatar,
  uploadingAvatar,
  avatarUploadError,
  onAvatarSelect,
  onAvatarUpload,
  onNeonFrameDeactivated
}) => {
  const { isLightMode, toggleLightMode } = useLightMode();
  const [hasNeonFrame, setHasNeonFrame] = useState(profile.active_cosmetic_frame === 'neon');
  const [neonBusy, setNeonBusy] = useState(false);
  const [neonError, setNeonError] = useState<string | null>(null);
  const [neonSuccess, setNeonSuccess] = useState<string | null>(null);

  useEffect(() => {
    setHasNeonFrame(profile.active_cosmetic_frame === 'neon');
  }, [profile.active_cosmetic_frame]);

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
            </div>
            {uploadingAvatar && (
              <p className="text-xs text-center text-cyan-400 animate-pulse mt-3">Saving avatar...</p>
            )}
          </div>

          {/* Profile Section */}
          <div>
            <h3 className="font-heading text-xl mb-3" style={{ color: 'var(--amber-warn)' }}>Profile</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
                <span className="text-gray-300">Username</span>
                <span className="font-bold text-white">{profile.username}</span>
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
              {isAdmin(profile.username) && (
                <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg border border-pink-500/50">
                  <span className="text-gray-300">Admin</span>
                  <span className="font-bold text-pink-400">✓ Verified</span>
                </div>
              )}
            </div>
          </div>

          {/* Cosmetics */}
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
          </div>

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
            </div>
          </div>

          {/* Note about future features */}
          <div className="text-xs text-gray-500 text-center pt-4 border-t border-gray-700">
            <p>Username editing, custom bio, and theme settings coming soon!</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
