import React, { useState, useEffect, useRef } from 'react';
import { Profile } from '../types';
import { CoinIcon, XPIcon, APIcon, LogoutIcon, StreakIcon, GemIcon } from './icons';
import CoinAnimation from './CoinAnimation';
import { audioService } from '../services/audioService';
import { NotificationCenter } from './NotificationCenter';
import { notificationService } from '../services/notificationService';
import { update_avatar, upload_avatar_file } from '../services/gameService';
import { isAdmin } from '../services/adminService';
import SettingsModal from './SettingsModal';
import UserProfileModal from './UserProfileModal';

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
  onProfileRefresh?: () => Promise<void>;
}

const Header: React.FC<HeaderProps> = ({ profile, onLogout, currentView, onBackToDashboard, onShowHelp, onNavigate, liteMode, onToggleLiteMode, onProfileAvatarChange, onProfileRefresh }) => {
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);

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
    if (!input.files?.length) return;

    setUploadingAvatar(true);
    setAvatarUploadError(null);
    
    try {
      const file = input.files[0];
      await upload_avatar_file(file);
      await applyAvatarChange(file);
      audioService.play('collect');
    } catch (error: any) {
      console.error('Failed to upload avatar:', error);
      setAvatarUploadError(error.message || 'Failed to upload avatar. Please try again.');
      audioService.play('wrong');
    } finally {
      setUploadingAvatar(false);
      input.value = '';
    }
  };

  useEffect(() => {
    setSelectedAvatar(profile.avatar_url || '');
  }, [profile.avatar_url]);

  const hasNeonFrame = profile.active_cosmetic_frame === 'neon';
  const hasFlickerTheme = profile.active_cosmetic_theme === 'flicker';

  useEffect(() => {
    if (!mobileMenuOpen) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [currentView]);

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
    setMobileMenuOpen(false);
    if (onNavigate) {
      onNavigate('dashboard');
    } else {
      onBackToDashboard?.();
    }
  };

  return (
    <>
      <header className="z-40 border-b border-slate-800/60 bg-slate-950/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-3 py-3 sm:px-6">
          
          {/* Mobile Layout (< 768px) */}
          <div className="md:hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <img 
                  src="/logo.png" 
                  alt="Brains Heist Logo" 
                  className="w-8 h-8 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)] cursor-pointer"
                  onClick={handleBrandClick}
                />
                <button
                  type="button"
                  onClick={handleBrandClick}
                  className="font-heading text-lg font-black tracking-wider select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
                  aria-label="Go to dashboard"
                >
                  <span
                    className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent animate-shimmer bg-[length:200%_100%]"
                    style={{
                      backgroundImage: 'linear-gradient(90deg, #22d3ee 0%, #3b82f6 25%, #8b5cf6 50%, #3b82f6 75%, #22d3ee 100%)',
                      animation: 'shimmer 3s linear infinite',
                    }}
                  >
                    BRAINS
                  </span>
                  {' '}
                  <span
                    className="bg-gradient-to-r from-pink-500 via-red-500 to-orange-500 bg-clip-text text-transparent animate-shimmer bg-[length:200%_100%]"
                    style={{
                      backgroundImage: 'linear-gradient(90deg, #ec4899 0%, #ef4444 25%, #f97316 50%, #ef4444 75%, #ec4899 100%)',
                      animation: 'shimmer 3s linear infinite',
                      animationDelay: '1.5s',
                    }}
                  >
                    HEIST
                  </span>
                </button>
              </div>
              <div className="relative flex items-center gap-2" ref={mobileMenuRef}>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen((prev) => !prev)}
                  className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/60 text-xl text-slate-200 shadow-sm shadow-slate-950/40 transition hover:border-emerald-500/60 hover:text-white"
                  aria-label="Open quick menu"
                >
                  ☰
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSettingsModal(true);
                    setMobileMenuOpen(false);
                  }}
                  className={`relative overflow-hidden rounded-full ${hasFlickerTheme ? 'glitch-frame glitch-frame-sm' : hasNeonFrame ? 'neon-frame neon-frame-sm' : 'border border-pink-500/70'}`}
                  aria-label="Open settings"
                >
                  <img
                    src={profile.avatar_url || avatarPresets[0]}
                    alt={profile.username || 'Player avatar'}
                    className={`h-10 w-10 rounded-full object-cover ${hasFlickerTheme ? 'glitch-frame-avatar' : hasNeonFrame ? 'neon-frame-avatar' : ''}`}
                  />
                </button>

                {mobileMenuOpen && (
                  <div className="fixed inset-0 z-50 flex items-start justify-end px-3 pt-16">
                    <div
                      className="absolute inset-0 bg-black/30 backdrop-blur-[1px]"
                      onClick={() => setMobileMenuOpen(false)}
                      aria-hidden
                    />
                    <div className="relative w-64 max-w-full rounded-2xl border border-slate-800/70 bg-slate-950/95 p-2 shadow-2xl shadow-slate-950/60">
                      <button
                        type="button"
                        onClick={() => {
                          setShowNotifications(true);
                          setMobileMenuOpen(false);
                          // Clear badge immediately when opening
                          setUnreadCount(0);
                        }}
                        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800/60"
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-lg">🔔</span>
                          Notifications
                        </span>
                        {unreadCount > 0 && (
                          <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            {unreadCount > 9 ? '9+' : unreadCount}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          onShowHelp?.();
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800/60"
                      >
                        <span className="text-lg">❓</span>
                        Help & Guides
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowSettingsModal(true);
                          setMobileMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800/60"
                      >
                        <span className="text-lg">⚙️</span>
                        Settings
                      </button>
                      {isAdmin(profile) && (
                        <button
                          type="button"
                          onClick={() => {
                            setMobileMenuOpen(false);
                            onNavigate?.('admin');
                          }}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-amber-200 transition hover:bg-amber-500/20"
                        >
                          <span className="text-lg">👑</span>
                          Admin Portal
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          onLogout();
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-rose-200 transition hover:bg-rose-500/20"
                      >
                        <LogoutIcon className="h-5 w-5" />
                        Log Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {profile.role !== 'teacher' && (
              <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
                {/* Coins */}
                <div className="flex items-center gap-1.5 rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-2.5 py-1.5">
                  <CoinAnimation width={18} height={18} />
                  <span id="coin-hud" className="font-mono text-xs font-bold text-white">
                    {profile.coins.toLocaleString()}
                  </span>
                </div>
                {/* Gemstones */}
                <div className="flex items-center gap-1.5 rounded-xl border border-rose-500/50 bg-rose-500/10 px-2.5 py-1.5">
                  <div className="h-4 w-4">
                    <GemIcon />
                  </div>
                  <span id="gem-hud" className="font-mono text-xs font-bold text-white">
                    {profile.gemstones.toLocaleString()}
                  </span>
                </div>
                {/* XP */}
                <div className="flex items-center gap-1.5 rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-2.5 py-1.5">
                  <div className="h-4 w-4 text-cyan-300">
                    <XPIcon />
                  </div>
                  <span id="xp-hud" className="font-mono text-xs font-bold text-white">
                    {profile.xp.toLocaleString()}
                  </span>
                </div>
                {/* AP */}
                <div className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5">
                  <div className="h-4 w-4 text-emerald-300">
                    <APIcon />
                  </div>
                  <span id="ap-hud" className="font-mono text-xs font-bold text-white">
                    {calculatedAP}<span className="text-[10px] text-slate-400">/{profile.ap_max}</span>
                  </span>
                </div>
                {/* Streak */}
                <div className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 ${
                  profile.streak >= 7 ? 'border-orange-500/50 bg-orange-500/15' : 'border-slate-700 bg-slate-800/40'
                }`}>
                  <div className={`h-4 w-4 ${profile.streak >= 7 ? 'text-orange-300' : 'text-slate-400'}`}>
                    <StreakIcon />
                  </div>
                  <span id="streak-hud" className={`font-mono text-xs font-bold ${profile.streak >= 7 ? 'text-orange-200' : 'text-white'}`}>
                    {profile.streak || 0}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Desktop Layout (>= 768px) */}
          <div className="hidden md:flex items-center justify-between gap-4">
            
            {/* Left: BRAIN HEIST Brand */}
            <div className="flex items-center space-x-4">
              <div className="relative group flex items-center gap-3">
                <img 
                  src="/logo.png" 
                  alt="Brains Heist Logo" 
                  className="w-10 h-10 lg:w-12 lg:h-12 drop-shadow-[0_0_10px_rgba(59,130,246,0.6)] cursor-pointer hover:scale-110 transition-transform"
                  onClick={handleBrandClick}
                />
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
              <div
                className="flex items-center space-x-2 px-4 py-2 bg-black/40 rounded-full border border-cyan-500/30 backdrop-blur-sm cursor-pointer"
                role="button"
                tabIndex={0}
                onClick={() => setShowProfileModal(true)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setShowProfileModal(true);
                  }
                }}
              >
                <div
                  className={`flex-shrink-0 rounded-full transition-transform duration-200 hover:scale-110 ${hasFlickerTheme ? 'glitch-frame glitch-frame-sm' : hasNeonFrame ? 'neon-frame neon-frame-sm' : 'border-2 border-pink-500'}`}
                >
                  <img
                    src={profile.avatar_url}
                    alt={profile.username}
                    className={`w-8 h-8 rounded-full object-cover ${hasFlickerTheme ? 'glitch-frame-avatar' : hasNeonFrame ? 'neon-frame-avatar' : ''}`}
                  />
                </div>
                <span className="font-bold text-white text-sm underline decoration-dotted decoration-cyan-400/70 underline-offset-4">
                  {profile.username}
                </span>
              </div>
            </div>

            {/* Right: Stats and Actions */}
            <div className="flex items-center gap-2">
              
              {/* Stats Row - Only for students */}
              {profile.role !== 'teacher' && (
              <div className="flex items-center gap-2">
                {/* Coins */}
                <div className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-br from-yellow-600/20 to-orange-600/20 rounded-xl border border-yellow-500/50 backdrop-blur-sm hover:scale-105 transition-transform">
                  <CoinAnimation width={22} height={22} />
                  <span id="coin-hud" className="font-mono font-bold text-sm text-white">{profile.coins.toLocaleString()}</span>
                </div>

                {/* Gemstones */}
                <div className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-br from-rose-700/25 to-pink-600/20 rounded-xl border border-rose-500/60 backdrop-blur-sm hover:scale-105 transition-transform">
                  <div className="w-5 h-5">
                    <GemIcon />
                  </div>
                  <span id="gem-hud" className="font-mono font-bold text-sm text-white">{profile.gemstones.toLocaleString()}</span>
                </div>

                {/* XP */}
                <div className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-br from-blue-600/20 to-cyan-600/20 rounded-xl border border-cyan-500/50 backdrop-blur-sm hover:scale-105 transition-transform">
                  <div className="w-5 h-5 text-cyan-400">
                    <XPIcon />
                  </div>
                  <span id="xp-hud" className="font-mono font-bold text-sm text-white">{profile.xp.toLocaleString()}</span>
                </div>

                {/* AP */}
                <div className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-br from-green-600/20 to-emerald-600/20 rounded-xl border border-green-500/50 backdrop-blur-sm hover:scale-105 transition-transform">
                  <div className="w-5 h-5 text-green-400">
                    <APIcon />
                  </div>
                  <span id="ap-hud" className="font-mono font-bold text-sm text-white">{calculatedAP}<span className="text-xs text-gray-400">/{profile.ap_max}</span></span>
                </div>

                {/* Streak */}
                <div className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border backdrop-blur-sm hover:scale-105 transition-transform ${
                  profile.streak >= 7 
                    ? 'bg-gradient-to-br from-orange-600/30 to-red-600/30 border-orange-500/60' 
                    : 'bg-gradient-to-br from-gray-700/20 to-gray-600/20 border-gray-500/30'
                }`}>
                  <div className={`w-5 h-5 ${profile.streak >= 7 ? 'text-orange-400' : 'text-gray-400'}`}>
                    <StreakIcon />
                  </div>
                  <span id="streak-hud" className={`font-mono font-bold text-sm ${profile.streak >= 7 ? 'text-orange-300' : 'text-white'}`}>
                    {profile.streak || 0}
                  </span>
                </div>
              </div>
              )}

              {/* Notification Bell */}
              <button 
                onClick={() => {
                  setShowNotifications(!showNotifications);
                  // Clear badge immediately when opening
                  if (!showNotifications) {
                    setUnreadCount(0);
                  }
                }}
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
          onNeonFrameDeactivated={onProfileRefresh ? () => onProfileRefresh() : undefined}
        />
      )}

      {showProfileModal && (
        <UserProfileModal
          profile={profile}
          apValue={calculatedAP}
          onClose={() => setShowProfileModal(false)}
        />
      )}

      <NotificationCenter
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
        onNavigate={onNavigate}
        userRole={profile.role as 'student' | 'teacher' | 'admin' | undefined}
      />
    </>
  );
};

export default Header;
