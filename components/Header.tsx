import React, { useState, useEffect, useRef } from 'react';
import { Profile } from '../types';
import { CoinIcon, XPIcon, APIcon, LogoutIcon } from './icons';
import { audioService } from '../services/audioService';

// Custom hook for animating number changes
const useAnimatedValue = (endValue: number, duration: number = 500) => {
    const [currentValue, setCurrentValue] = useState(endValue);
    // FIX: The error "Expected 1 arguments, but got 0." likely refers to this line. Using useRef with a generic but no argument is ambiguous. Explicitly initializing with null is more robust.
    const frameRef = useRef<number | null>(null);
    const prevValueRef = useRef(endValue);

    useEffect(() => {
        const startValue = prevValueRef.current;
        const valueDiff = endValue - startValue;
        if (valueDiff === 0) return;

        let startTime: number;

        const animate = (timestamp: number) => {
            if (!startTime) startTime = timestamp;
            const progress = timestamp - startTime;
            const percentage = Math.min(progress / duration, 1);
            
            const easedPercentage = 1 - Math.pow(1 - percentage, 3); // easeOutCubic

            const nextValue = startValue + valueDiff * easedPercentage;
            setCurrentValue(Math.round(nextValue));

            if (progress < duration) {
                frameRef.current = requestAnimationFrame(animate);
            } else {
                setCurrentValue(endValue);
                prevValueRef.current = endValue;
            }
        };

        frameRef.current = requestAnimationFrame(animate);

        return () => {
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
            prevValueRef.current = endValue;
        };
    }, [endValue, duration]);

    return currentValue;
};


const StatChip: React.FC<{ icon: React.ReactNode; value: number; 'data-testid': string }> = ({ icon, value, 'data-testid': testId }) => {
    const animatedValue = useAnimatedValue(value);
    return (
        <div id={testId} className="flex items-center space-x-1 sm:space-x-2 bg-black/20 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full">
            <div className="w-4 h-4 sm:w-5 sm:h-5">{icon}</div>
            <span className="font-mono font-semibold text-xs sm:text-base">{animatedValue.toLocaleString()}</span>
        </div>
    );
};

interface HeaderProps {
  profile: Profile;
  onLogout: () => void;
  currentView: string;
  onBackToDashboard?: () => void;
}

const Header: React.FC<HeaderProps> = ({ profile, onLogout, currentView, onBackToDashboard }) => {
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(audioService.isAudioEnabled());
  const [bgMusicEnabled, setBgMusicEnabled] = useState(audioService.isBgMusicEnabled());
  const [selectedAvatar, setSelectedAvatar] = useState<string>(profile.avatar_url || '');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const avatarPresets = [
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Shadow',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Cyber',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Ghost',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Matrix',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Glitch',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Hack'
  ];

  const handleAudioToggle = () => {
    const newState = !audioEnabled;
    setAudioEnabled(newState);
    audioService.setAudioEnabled(newState);
  };

  const handleBgMusicToggle = () => {
    const newState = !bgMusicEnabled;
    setBgMusicEnabled(newState);
    audioService.setBgMusicEnabled(newState);
  };

  const handleAvatarSelect = async (avatarUrl: string) => {
    setSelectedAvatar(avatarUrl);
    setUploadingAvatar(true);
    try {
      const { update_avatar } = await import('../services/gameService');
      await update_avatar(avatarUrl);
      // Profile will be refreshed via real-time subscription
      audioService.play('collect');
    } catch (error) {
      console.error('Failed to update avatar:', error);
      audioService.play('wrong');
    } finally {
      setUploadingAvatar(false);
    }
  };

  useEffect(() => {
    setSelectedAvatar(profile.avatar_url || '');
  }, [profile.avatar_url]);

  return (
    <>
      <header className="sticky top-0 z-40 flex justify-between items-center card-glass glow-ion p-2 sm:p-4">
        <div className="flex items-center space-x-2 sm:space-x-4">
          <h1 className="font-heading text-xl sm:text-2xl md:text-3xl font-bold tracking-wider" style={{ color: 'var(--ion-blue)' }}>
              BH
          </h1>
          <span className="hidden sm:block text-base sm:text-lg font-medium text-gray-300">{profile.username}</span>
        </div>
        <div className="flex items-center space-x-1 sm:space-x-3">
          <div className="flex items-center space-x-1 sm:space-x-2">
            <StatChip icon={<CoinIcon />} value={profile.coins} data-testid="coin-hud" />
            <StatChip icon={<XPIcon />} value={profile.xp} data-testid="xp-hud" />
            <StatChip icon={<APIcon />} value={profile.ap_now} data-testid="ap-hud" />
          </div>
          <img src={profile.avatar_url} alt="Player Avatar" className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2" style={{ borderColor: 'var(--plasma-pink)' }} />
          
          <button 
              onClick={() => setShowSettingsModal(true)}
              className="p-1.5 sm:p-2 rounded-full bg-black/20 hover:bg-amber-warn/30 transition-colors"
              aria-label="Settings"
              title="Settings"
          >
              <span className="text-base sm:text-xl">⚙️</span>
          </button>

          <button 
              onClick={onLogout}
              className="hidden sm:block p-2 rounded-full bg-black/20 hover:bg-plasma-pink/30 transition-colors"
              aria-label="Log Out"
              title="Log Out"
          >
              <LogoutIcon className="w-5 h-5 sm:w-6 sm:h-6 text-mist-400" />
          </button>
        </div>
      </header>

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card-glass glow-ion p-8 max-w-md w-full">
            <h2 className="font-heading text-3xl mb-6" style={{ color: 'var(--ion-blue)' }}>
              ⚙️ Settings
            </h2>
            
            <div className="space-y-6">
              {/* Avatar Selection */}
              <div>
                <h3 className="font-heading text-xl mb-3" style={{ color: 'var(--amber-warn)' }}>Avatar</h3>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {avatarPresets.map((avatarUrl, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleAvatarSelect(avatarUrl)}
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
                {uploadingAvatar && (
                  <p className="text-xs text-center text-cyan-400 animate-pulse">Updating avatar...</p>
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
                  <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
                    <span className="text-gray-300">Batch</span>
                    <span className="font-bold text-white">{profile.batch}</span>
                  </div>
                </div>
              </div>

              {/* Audio Settings */}
              <div>
                <h3 className="font-heading text-xl mb-3" style={{ color: 'var(--amber-warn)' }}>Audio</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
                    <span className="text-gray-300">Sound Effects</span>
                    <button
                      onClick={handleAudioToggle}
                      className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                        audioEnabled 
                          ? 'bg-green-500/30 text-green-400 border border-green-500' 
                          : 'bg-red-500/30 text-red-400 border border-red-500'
                      }`}
                    >
                      {audioEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
                    <span className="text-gray-300">Background Music</span>
                    <button
                      onClick={handleBgMusicToggle}
                      className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                        bgMusicEnabled 
                          ? 'bg-green-500/30 text-green-400 border border-green-500' 
                          : 'bg-red-500/30 text-red-400 border border-red-500'
                      }`}
                    >
                      {bgMusicEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Note about future features */}
              <div className="text-xs text-gray-500 text-center pt-4 border-t border-gray-700">
                <p>Username editing, custom bio, and theme settings coming soon!</p>
              </div>
            </div>

            <button
              onClick={() => setShowSettingsModal(false)}
              className="w-full mt-6 py-3 px-6 rounded-xl font-heading transition-all hover:scale-105 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400 text-white"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default Header;
