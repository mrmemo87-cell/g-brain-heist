import React, { useState, useEffect, useRef } from 'react';
import { Profile } from '../types';
import { CoinIcon, XPIcon, APIcon, LogoutIcon, StreakIcon, GemIcon } from './icons';
import { audioService } from '../services/audioService';
import { NotificationCenter } from './NotificationCenter';
import { notificationService } from '../services/notificationService';
import { update_avatar, upload_avatar_file } from '../services/gameService';
import { isAdmin } from '../services/adminService';
import SettingsModal from './SettingsModal';

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


const StatChip: React.FC<{ icon: React.ReactNode; value: number; 'data-testid': string; subtitle?: string; highlight?: boolean }> = ({ icon, value, 'data-testid': testId, subtitle, highlight }) => {
    const animatedValue = useAnimatedValue(value);
    return (
        <div 
            id={testId} 
            className={`stat-chip flex items-center space-x-1 sm:space-x-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-full touch-manipulation transition-all ${
                highlight 
                    ? 'bg-gradient-to-r from-orange-500/30 to-red-500/30 border border-orange-400 animate-pulse-glow' 
                    : 'bg-black/30 hover:bg-black/40 backdrop-blur-sm'
            }`}
        >
            <div className="w-5 h-5 sm:w-6 sm:h-6">{icon}</div>
            <div className="flex flex-col">
                <span className="font-mono font-semibold text-sm sm:text-base leading-none">{animatedValue.toLocaleString()}</span>
                {subtitle && <span className="font-mono text-[10px] sm:text-xs text-gray-400 leading-none mt-0.5">{subtitle}</span>}
            </div>
        </div>
    );
};

interface HeaderProps {
  profile: Profile;
  onLogout: () => void;
  currentView: string;
  onBackToDashboard?: () => void;
  onShowHelp?: () => void;
  onNavigate?: (view: 'dashboard' | 'quest' | 'pvp' | 'shop' | 'clan' | 'inventory' | 'leaderboard' | 'achievements' | 'teacher' | 'admin' | 'raids' | 'raid_admin') => void;
  liteMode?: boolean;
  onToggleLiteMode?: () => void;
  onProfileAvatarChange?: (avatarUrl: string) => void;
}

const Header: React.FC<HeaderProps> = ({ profile, onLogout, currentView, onBackToDashboard, onShowHelp, onNavigate, liteMode, onToggleLiteMode, onProfileAvatarChange }) => {
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(audioService.isAudioEnabled());
  const [bgMusicEnabled, setBgMusicEnabled] = useState(audioService.isBgMusicEnabled());
  const [selectedAvatar, setSelectedAvatar] = useState<string>(profile.avatar_url || '');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarUploadError, setAvatarUploadError] = useState<string | null>(null);
  const [apRegenCountdown, setApRegenCountdown] = useState<string>('');
  const [calculatedAP, setCalculatedAP] = useState<number>(profile.ap_now);

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

  const applyAvatarChange = async (avatarUrl: string) => {
    try {
      await update_avatar(avatarUrl);
      setSelectedAvatar(avatarUrl);
      onProfileAvatarChange?.(avatarUrl);
      setAvatarUploadError(null);
      audioService.play('collect');
    } catch (error) {
      console.error('Failed to update avatar:', error);
      setAvatarUploadError('Failed to update avatar. Please try again.');
      audioService.play('wrong');
      throw error;
    }
  };

  const handleAvatarSelect = async (avatarUrl: string) => {
    if (uploadingAvatar) return;
    setUploadingAvatar(true);
    try {
      await applyAvatarChange(avatarUrl);
    } catch {
      /* handled in applyAvatarChange */
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    setUploadingAvatar(true);
    setAvatarUploadError(null);
    try {
      const publicUrl = await upload_avatar_file(file);
      await applyAvatarChange(publicUrl);
    } catch (error) {
      if (error instanceof Error) {
        setAvatarUploadError(error.message);
      } else {
        setAvatarUploadError('Failed to upload avatar. Please try again.');
      }
      audioService.play('wrong');
    } finally {
      setUploadingAvatar(false);
      input.value = '';
    }
  };

  useEffect(() => {
    setSelectedAvatar(profile.avatar_url || '');
  }, [profile.avatar_url]);

  // Load and subscribe to notifications
  useEffect(() => {
    const loadUnreadCount = async () => {
      const count = await notificationService.getUnreadCount();
      setUnreadCount(count);
    };

    loadUnreadCount();

    // Subscribe to new notifications
    const unsubscribe = notificationService.subscribe(() => {
      loadUnreadCount();
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // AP Regeneration Countdown Timer
  useEffect(() => {
    const calculateCountdown = () => {
      if (!profile.last_ap_update) {
        setCalculatedAP(profile.ap_now);
        setApRegenCountdown('--');
        return;
      }

      const now = new Date();
      const lastUpdate = new Date(profile.last_ap_update);
      const msElapsed = now.getTime() - lastUpdate.getTime();
      const minutesElapsed = Math.floor(msElapsed / (1000 * 60));
      
      // Calculate current AP based on time elapsed (1 AP per 10 minutes)
      const apRegenerated = Math.floor(minutesElapsed / 10);
      const currentAP = Math.min(profile.ap_now + apRegenerated, profile.ap_max);
      setCalculatedAP(currentAP);

      if (currentAP >= profile.ap_max) {
        setApRegenCountdown('MAX');
        return;
      }

      // Calculate time until next AP regen
      const msPerAP = 10 * 60 * 1000; // 10 minutes in ms
      const msUntilNextAP = msPerAP - (msElapsed % msPerAP);
      
      const minutesLeft = Math.floor(msUntilNextAP / (1000 * 60));
      const secondsLeft = Math.floor((msUntilNextAP % (1000 * 60)) / 1000);
      
      setApRegenCountdown(`${minutesLeft}m ${secondsLeft}s`);
    };

    calculateCountdown();
    const interval = setInterval(calculateCountdown, 1000); // Update every second

    return () => clearInterval(interval);
  }, [profile.ap_now, profile.ap_max, profile.last_ap_update]);

  const handleBrandClick = () => {
    if (onNavigate) {
      onNavigate('dashboard');
    } else {
      onBackToDashboard?.();
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-gradient-to-r from-gray-900 via-black to-gray-900 border-b-2 border-cyan-500/30 shadow-2xl shadow-cyan-500/20">
        <div className="max-w-7xl mx-auto px-2 sm:px-6 py-2 sm:py-3">
          
          {/* Mobile Layout (< 768px) */}
          <div className="md:hidden">
            {/* Top row: Brand + Avatar + Settings */}
            <div className="flex items-center justify-between mb-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={handleBrandClick}
                  className="font-heading text-lg font-black tracking-wider select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 rounded"
                  aria-label="Go to dashboard"
                >
                  <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent animate-shimmer bg-[length:200%_100%]" 
                        style={{ 
                          backgroundImage: 'linear-gradient(90deg, #22d3ee 0%, #3b82f6 25%, #8b5cf6 50%, #3b82f6 75%, #22d3ee 100%)',
                          animation: 'shimmer 3s linear infinite'
                        }}>
                    BRAINS
                  </span>
                  {' '}
                  <span className="bg-gradient-to-r from-pink-500 via-red-500 to-orange-500 bg-clip-text text-transparent animate-shimmer bg-[length:200%_100%]"
                        style={{ 
                          backgroundImage: 'linear-gradient(90deg, #ec4899 0%, #ef4444 25%, #f97316 50%, #ef4444 75%, #ec4899 100%)',
                          animation: 'shimmer 3s linear infinite',
                          animationDelay: '1.5s'
                        }}>
                    HEIST
                  </span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <img
                  src={profile.avatar_url}
                  alt={profile.username}
                  className="w-9 h-9 rounded-full border-2 border-pink-500"
                  onClick={() => setShowSettingsModal(true)}
                />
                {/* Notification Bell */}
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative p-2 rounded-lg bg-black/40 border border-gray-600 hover:border-purple-500 transition-colors"
                  aria-label="Notifications"
                >
                  <span className="text-lg">🔔</span>
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 px-1.5 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full min-w-[20px] text-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => onShowHelp?.()}
                  className="p-2 rounded-lg bg-black/40 border border-gray-600 hover:border-cyan-500 transition-colors"
                  aria-label="Help"
                  title="Help & Guide"
                >
                  <span className="text-lg">❓</span>
                </button>
                <button
                  onClick={() => setShowSettingsModal(true)}
                  className="p-2 rounded-lg bg-black/40 border border-gray-600 hover:border-yellow-500 transition-colors"
                  aria-label="Settings"
                >
                  <span className="text-lg">⚙️</span>
                </button>
                <button
                  onClick={onLogout}
                  className="p-2 rounded-lg bg-black/40 border border-gray-600 hover:border-red-500 transition-colors"
                  aria-label="Log Out"
                  title="Log Out"
                >
                  <LogoutIcon className="w-5 h-5 text-red-400" />
                </button>
              </div>
            </div>

            {/* Bottom row: Stats in 2x2 grid - Only for students */}
            {profile.role !== 'teacher' && (
            <div className="grid grid-cols-2 gap-1.5">
              {/* Coins */}
              <div className="flex items-center gap-1.5 px-2 py-1.5 bg-gradient-to-br from-yellow-600/20 to-orange-600/20 rounded-lg border border-yellow-500/50 backdrop-blur-sm">
                <div className="w-5 h-5 text-yellow-400">
                  <CoinIcon />
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] text-yellow-300/80 font-semibold uppercase leading-none">Coins</span>
                  <span id="coin-hud" className="font-mono font-bold text-sm text-white leading-none mt-0.5">{profile.coins.toLocaleString()}</span>
                </div>
              </div>

              {/* Gemstones */}
              <div className="flex items-center gap-1.5 px-2 py-1.5 bg-gradient-to-br from-cyan-600/20 to-blue-600/20 rounded-lg border border-cyan-500/50 backdrop-blur-sm">
                <div className="w-5 h-5 text-cyan-300">
                  <GemIcon />
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] text-cyan-200/80 font-semibold uppercase leading-none">Gemstones</span>
                  <span id="gem-hud" className="font-mono font-bold text-sm text-white leading-none mt-0.5">{profile.gemstones.toLocaleString()}</span>
                </div>
              </div>

              {/* XP */}
              <div className="flex items-center gap-1.5 px-2 py-1.5 bg-gradient-to-br from-blue-600/20 to-cyan-600/20 rounded-lg border border-cyan-500/50 backdrop-blur-sm">
                <div className="w-5 h-5 text-cyan-400">
                  <XPIcon />
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] text-cyan-300/80 font-semibold uppercase leading-none">XP</span>
                  <span id="xp-hud" className="font-mono font-bold text-sm text-white leading-none mt-0.5">{profile.xp.toLocaleString()}</span>
                </div>
              </div>

              {/* AP */}
              <div className="flex items-center gap-1.5 px-2 py-1.5 bg-gradient-to-br from-green-600/20 to-emerald-600/20 rounded-lg border border-green-500/50 backdrop-blur-sm">
                <div className="w-5 h-5 text-green-400">
                  <APIcon />
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] text-green-300/80 font-semibold uppercase leading-none">AP</span>
                  <div className="flex items-baseline gap-1">
                    <span id="ap-hud" className="font-mono font-bold text-sm text-white leading-none">{calculatedAP}</span>
                    <span className="text-[10px] text-gray-400">/{profile.ap_max}</span>
                  </div>
                  {apRegenCountdown !== 'MAX' && (
                    <span className="text-[8px] text-green-300/60 leading-none">+1 in {apRegenCountdown}</span>
                  )}
                </div>
              </div>

              {/* Streak */}
              <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border backdrop-blur-sm ${
                profile.streak >= 7 
                  ? 'bg-gradient-to-br from-orange-600/30 to-red-600/30 border-orange-500/60' 
                  : 'bg-gradient-to-br from-gray-700/20 to-gray-600/20 border-gray-500/30'
              }`}>
                <div className={`w-5 h-5 ${profile.streak >= 7 ? 'text-orange-400 animate-pulse' : 'text-gray-400'}`}>
                  <StreakIcon />
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] text-gray-300/80 font-semibold uppercase leading-none">Streak</span>
                  <span id="streak-hud" className={`font-mono font-bold text-sm leading-none mt-0.5 ${profile.streak >= 7 ? 'text-orange-300' : 'text-white'}`}>
                    {profile.streak || 0} days
                  </span>
                </div>
              </div>
            </div>
            )}
          </div>

          {/* Desktop Layout (>= 768px) */}
          <div className="hidden md:flex items-center justify-between gap-4">
            
            {/* Left: BRAIN HEIST Brand */}
            <div className="flex items-center space-x-4">
              <div className="relative group">
                <button
                  type="button"
                  onClick={handleBrandClick}
                  className="font-heading text-2xl sm:text-3xl lg:text-4xl font-black tracking-widest select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 rounded"
                  aria-label="Go to dashboard"
                >
                  <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent animate-shimmer bg-[length:200%_100%]" 
                        style={{ 
                          backgroundImage: 'linear-gradient(90deg, #22d3ee 0%, #3b82f6 25%, #8b5cf6 50%, #3b82f6 75%, #22d3ee 100%)',
                          animation: 'shimmer 3s linear infinite'
                        }}>
                    BRAINS
                  </span>
                  {' '}
                  <span className="bg-gradient-to-r from-pink-500 via-red-500 to-orange-500 bg-clip-text text-transparent animate-shimmer bg-[length:200%_100%]"
                        style={{ 
                          backgroundImage: 'linear-gradient(90deg, #ec4899 0%, #ef4444 25%, #f97316 50%, #ef4444 75%, #ec4899 100%)',
                          animation: 'shimmer 3s linear infinite',
                          animationDelay: '1.5s'
                        }}>
                    HEIST
                  </span>
                </button>
                <div className="absolute -bottom-1 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-500 via-pink-500 to-cyan-500 opacity-50 blur-sm"></div>
              </div>
              
              {/* Username badge */}
              <div className="flex items-center space-x-2 px-4 py-2 bg-black/40 rounded-full border border-cyan-500/30 backdrop-blur-sm">
                <img 
                  src={profile.avatar_url} 
                  alt={profile.username} 
                  className="w-8 h-8 rounded-full border-2 border-pink-500 cursor-pointer hover:scale-110 transition-transform"
                  onClick={() => setShowSettingsModal(true)}
                />
                <span className="font-bold text-white text-sm">{profile.username}</span>
              </div>
            </div>

            {/* Right: Stats and Actions */}
            <div className="flex items-center gap-3">
              
              {/* Stats Row - Only for students */}
              {profile.role !== 'teacher' && (
              <div className="flex items-center gap-3">
                {/* Coins */}
                <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-br from-yellow-600/20 to-orange-600/20 rounded-xl border-2 border-yellow-500/50 backdrop-blur-sm hover:scale-105 transition-transform min-w-[100px]">
                  <div className="w-7 h-7 text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.8)]">
                    <CoinIcon />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-yellow-300/80 font-semibold uppercase tracking-wide leading-none">Coins</span>
                    <span id="coin-hud" className="font-mono font-bold text-lg text-white leading-none mt-0.5">{profile.coins.toLocaleString()}</span>
                  </div>
                </div>

                {/* Gemstones */}
                <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-br from-cyan-600/20 to-blue-600/20 rounded-xl border-2 border-cyan-500/50 backdrop-blur-sm hover:scale-105 transition-transform min-w-[100px]">
                  <div className="w-7 h-7 text-cyan-300 drop-shadow-[0_0_8px_rgba(56,189,248,0.8)]">
                    <GemIcon />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-cyan-200/80 font-semibold uppercase tracking-wide leading-none">Gemstones</span>
                    <span id="gem-hud" className="font-mono font-bold text-lg text-white leading-none mt-0.5">{profile.gemstones.toLocaleString()}</span>
                  </div>
                </div>

                {/* XP */}
                <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-br from-blue-600/20 to-cyan-600/20 rounded-xl border-2 border-cyan-500/50 backdrop-blur-sm hover:scale-105 transition-transform min-w-[100px]">
                  <div className="w-7 h-7 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]">
                    <XPIcon />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-cyan-300/80 font-semibold uppercase tracking-wide leading-none">XP</span>
                    <span id="xp-hud" className="font-mono font-bold text-lg text-white leading-none mt-0.5">{profile.xp.toLocaleString()}</span>
                  </div>
                </div>

                {/* AP */}
                <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-br from-green-600/20 to-emerald-600/20 rounded-xl border-2 border-green-500/50 backdrop-blur-sm hover:scale-105 transition-transform min-w-[100px]">
                  <div className="w-7 h-7 text-green-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.8)]">
                    <APIcon />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-green-300/80 font-semibold uppercase tracking-wide leading-none">AP</span>
                    <div className="flex items-baseline gap-1">
                      <span id="ap-hud" className="font-mono font-bold text-lg text-white leading-none">{calculatedAP}</span>
                      <span className="text-xs text-gray-400">/{profile.ap_max}</span>
                    </div>
                    {apRegenCountdown !== 'MAX' && (
                      <span className="text-[9px] text-green-300/60 leading-none mt-0.5">+1 in {apRegenCountdown}</span>
                    )}
                  </div>
                </div>

                {/* Streak */}
                <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 backdrop-blur-sm hover:scale-105 transition-transform ${
                  profile.streak >= 7 
                    ? 'bg-gradient-to-br from-orange-600/30 to-red-600/30 border-orange-500/60' 
                    : 'bg-gradient-to-br from-gray-700/20 to-gray-600/20 border-gray-500/30'
                }`}>
                  <div className={`w-6 h-6 ${profile.streak >= 7 ? 'text-orange-400 animate-pulse' : 'text-gray-400'}`}>
                    <StreakIcon />
                  </div>
                  <div className="flex flex-col">
                    <span id="streak-hud" className={`font-mono font-bold text-base leading-none ${profile.streak >= 7 ? 'text-orange-300' : 'text-white'}`}>
                      {profile.streak || 0}
                    </span>
                  </div>
                </div>
              </div>
              )}

              {/* Notification Bell */}
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2.5 rounded-xl bg-black/40 border border-gray-600 hover:border-purple-500 hover:bg-purple-500/10 transition-all hover:scale-110 backdrop-blur-sm"
                aria-label="Notifications"
              >
                <span className="text-xl">🔔</span>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 px-1.5 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full min-w-[20px] text-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Help Button */}
              <button 
                onClick={() => onShowHelp?.()}
                className="p-2.5 rounded-xl bg-black/40 border border-gray-600 hover:border-cyan-500 hover:bg-cyan-500/10 transition-all hover:scale-110 backdrop-blur-sm"
                aria-label="Help"
                title="Help & Guide"
              >
                <span className="text-xl">❓</span>
              </button>

              {/* Admin Button (only for admins) */}
              {isAdmin(profile) && (
                <button 
                  onClick={() => onNavigate?.('admin')}
                  className="p-2.5 rounded-xl bg-gradient-to-br from-amber-600/40 to-yellow-600/40 border border-amber-500/80 hover:border-amber-400 hover:bg-amber-500/20 transition-all hover:scale-110 backdrop-blur-sm shadow-lg shadow-amber-500/30 animate-pulse"
                  aria-label="Admin Portal"
                  title="Admin Portal - God Mode Active 👑"
                >
                  <span className="text-xl">👑</span>
                </button>
              )}

              {/* Settings Button */}
              <button 
                onClick={() => setShowSettingsModal(true)}
                className="p-2.5 rounded-xl bg-black/40 border border-gray-600 hover:border-yellow-500 hover:bg-yellow-500/10 transition-all hover:scale-110 backdrop-blur-sm"
                aria-label="Settings"
              >
                <span className="text-xl">⚙️</span>
              </button>

              {/* Logout Button */}
              <button 
                onClick={onLogout}
                className="flex p-2.5 rounded-xl bg-black/40 border border-gray-600 hover:border-red-500 hover:bg-red-500/10 transition-all hover:scale-110 backdrop-blur-sm items-center justify-center"
                aria-label="Log Out"
              >
                <LogoutIcon className="w-5 h-5 text-red-400" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Notification Center */}
      {showSettingsModal && (
        <SettingsModal 
          onClose={() => setShowSettingsModal(false)}
          profile={profile}
          avatarPresets={avatarPresets}
          selectedAvatar={selectedAvatar}
          uploadingAvatar={uploadingAvatar}
          avatarUploadError={avatarUploadError || ''}
          onAvatarSelect={handleAvatarSelect}
          onAvatarUpload={handleAvatarUpload}
        />
      )}

      <NotificationCenter 
        isOpen={showNotifications} 
        onClose={() => setShowNotifications(false)} 
        onNavigate={onNavigate}
      />
    </>
  );
};

export default Header;
