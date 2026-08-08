import React, { useState, useEffect, useRef } from 'react';
import { Profile } from '../types';
import { CoinIcon, XPIcon, APIcon, LogoutIcon, StreakIcon, GemIcon } from './icons';
import CoinAnimation from './CoinAnimation';
import { audioService } from '../services/audioService';
import { NotificationCenter } from './NotificationCenter';
import { notificationService, Notification } from '../services/notificationService';
import { update_avatar, upload_avatar_file, update_username } from '../services/gameService';
import { isAdmin } from '../services/adminService';
import SettingsModal from './SettingsModal';
import UserProfileModal from './UserProfileModal';
import AvatarWithFrame from './AvatarWithFrame';
import { isFlickerThemeActive } from '../src/lib/cosmetics';
import { fetchSchoolPlanDetails, type SchoolPlanDetails, type SchoolPlan } from '../services/tierService';
import { visualAssets, neonIcon } from './visualAssets';
import { useSchoolBranding } from '../src/hooks/useSchoolBranding';
import { createSchoolBrand } from '../src/lib/schoolBranding';
import { SchoolBrand } from '../src/components/SchoolBrand';

/** Returns the streak badge PNG for the highest achieved tier, or null. */
const getStreakBadge = (streak: number): string | null => {
  if (streak >= 30) return visualAssets.streak.day30;
  if (streak >= 14) return visualAssets.streak.day14;
  if (streak >= 7)  return visualAssets.streak.day7;
  if (streak >= 5)  return visualAssets.streak.day5;
  if (streak >= 3)  return visualAssets.streak.day3;
  if (streak >= 1)  return visualAssets.streak.day1;
  return null;
};

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
                {subtitle && <span className="font-mono text-[11px] sm:text-xs text-gray-400 leading-none mt-0.5">{subtitle}</span>}
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
  onShowStreak?: () => void;
  onNavigate?: (view: 'dashboard' | 'quest' | 'pvp' | 'shop' | 'clan' | 'inventory' | 'leaderboard' | 'achievements' | 'teacher' | 'admin' | 'raids' | 'raid_admin') => void;
  onNotificationAction?: (notification: Notification) => void;
  liteMode?: boolean;
  onToggleLiteMode?: () => void;
  onProfileAvatarChange?: (avatarUrl: string) => void;
  onProfileRefresh?: () => Promise<void>;
  isAdminMode?: boolean;
  isSchoolAdmin?: boolean;
  onOpenSchoolAdmin?: () => void;
}

const Header: React.FC<HeaderProps> = ({ profile, onLogout, currentView, onBackToDashboard, onShowHelp, onShowStreak, onNavigate, onNotificationAction, liteMode, onToggleLiteMode, onProfileAvatarChange, onProfileRefresh, isAdminMode, isSchoolAdmin, onOpenSchoolAdmin }) => {
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(audioService.isAudioEnabled());
  const [bgMusicEnabled, setBgMusicEnabled] = useState(audioService.isBgMusicEnabled());
  const [selectedAvatar, setSelectedAvatar] = useState<string>(profile.avatar_url || '');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarUploadError, setAvatarUploadError] = useState<string | null>(null);
  const [avatarUploadSuccess, setAvatarUploadSuccess] = useState(false);
  const [apRegenCountdown, setApRegenCountdown] = useState<string>('');
  const [calculatedAP, setCalculatedAP] = useState<number>(profile.ap_now ?? 0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [planDetails, setPlanDetails] = useState<SchoolPlanDetails | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const resolvedBranding = useSchoolBranding({ schoolId: profile.school_id, schoolName: profile.school_name, schoolLogoUrl: profile.school_logo_url });
  const schoolBrand = createSchoolBrand({ schoolId: profile.school_id, ...resolvedBranding });

  // Fetch school plan on mount
  useEffect(() => {
    let cancelled = false;
    fetchSchoolPlanDetails().then((d) => {
      if (!cancelled) setPlanDetails(d);
    });
    return () => { cancelled = true; };
  }, []);

  // Calculate pilot countdown
  const getPlanBadgeInfo = () => {
    if (!planDetails || !planDetails.success) return null;
    const plan = planDetails.plan;
    if (plan === 'none') return { label: 'FREE', color: 'gray', countdown: null };
    if (plan === 'pilot') {
      let countdown: string | null = null;
      if (planDetails.trial_ends_at) {
        const end = new Date(planDetails.trial_ends_at).getTime();
        const now = Date.now();
        const diff = end - now;
        if (diff > 0) {
          const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
          countdown = `${days}d left`;
        } else {
          countdown = 'Expired';
        }
      }
      return { label: 'PILOT', color: 'cyan', countdown };
    }
    const colorMap: Record<string, string> = {
      core: 'blue', standard: 'emerald', pro: 'amber', enterprise: 'purple'
    };
    return { label: plan.toUpperCase(), color: colorMap[plan] || 'blue', countdown: null };
  };

  const badgeInfo = getPlanBadgeInfo();

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

  // Apply avatar change (for both preset selection and custom upload)
  const applyAvatarChange = async (avatarUrl: string) => {
    try {
      // Update avatar in database
      const updatedProfile = await update_avatar(avatarUrl);
      
      // Update local state
      setSelectedAvatar(updatedProfile.avatar_url || avatarUrl);
      setAvatarUploadSuccess(true);
      
      // Notify parent component
      if (onProfileAvatarChange) {
        onProfileAvatarChange(updatedProfile.avatar_url || avatarUrl);
      }

      // If required_changes is active, refresh full profile to pick up auto-cleared flags
      if (profile.required_changes && onProfileRefresh) {
        await onProfileRefresh();
      }
      
      audioService.play('collect');
    } catch (error: any) {
      console.error('Failed to apply avatar change:', error);
      setAvatarUploadError(error.message || 'Failed to update avatar. Please try again.');
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
    // Capture file and input reference immediately (fixes mobile file selection issues)
    const files = event.target.files;
    const inputElement = event.target;
    
    if (!files || files.length === 0) {
      return;
    }
    
    // Create a copy of the file to prevent reference issues on mobile
    const originalFile = files[0];
    const file = new File([originalFile], originalFile.name, {
      type: originalFile.type,
      lastModified: originalFile.lastModified,
    });

    setUploadingAvatar(true);
    setAvatarUploadError(null);
    
    try {
      // Upload file and get the public URL
      const uploadedUrl = await upload_avatar_file(file);
      // Apply the avatar using the returned URL (not the File)
      await applyAvatarChange(uploadedUrl);
      audioService.play('collect');
    } catch (error: any) {
      console.error('Failed to upload avatar:', error);
      setAvatarUploadError(error.message || 'Failed to upload avatar. Please try again.');
      audioService.play('wrong');
    } finally {
      setUploadingAvatar(false);
      // Clear input value to allow re-selecting the same file
      if (inputElement) {
        inputElement.value = '';
      }
    }
  };

  useEffect(() => {
    setSelectedAvatar(profile.avatar_url || '');
  }, [profile.avatar_url]);

  // Reset avatar upload success when settings modal opens
  useEffect(() => {
    if (showSettingsModal) {
      setAvatarUploadSuccess(false);
    }
  }, [showSettingsModal]);

  const handleUsernameChange = async (newUsername: string) => {
    await update_username(newUsername);
    if (onProfileRefresh) await onProfileRefresh();
  };

  const hasNeonFrame = profile.active_cosmetic_frame === 'neon';
  const hasFlickerTheme = isFlickerThemeActive(profile.active_cosmetic_theme);
  const hasGlitchEffect = profile.active_cosmetic_effect === 'glitch';

  useEffect(() => {
    if (!mobileMenuOpen) {
      return;
    }

    const handleDismiss = (event: MouseEvent | TouchEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleDismiss);
    document.addEventListener('touchstart', handleDismiss, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleDismiss);
      document.removeEventListener('touchstart', handleDismiss);
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
      <header
        className="relative z-40 border-b border-slate-800/60 bg-slate-950/95 backdrop-blur"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-2 px-3 py-2 sm:px-4 lg:px-6">
          
          {/* Mobile Layout (< 768px) */}
          <div className="student-mobile-header md:hidden">
            <div className="student-mobile-header__primary">
              <div className="student-mobile-header__brand">
                <button type="button" onClick={handleBrandClick} aria-label={`Go to ${schoolBrand.name} dashboard`}>
                  <SchoolBrand brand={schoolBrand} showName={false} imageClassName="w-8 h-8 flex-shrink-0 object-contain" />
                </button>
                <button
                  type="button"
                  onClick={handleBrandClick}
                  className="student-mobile-header__name font-heading select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
                  aria-label="Go to dashboard"
                >
                  {schoolBrand.name}
                </button>
              </div>
              <div className="student-mobile-header__actions" ref={mobileMenuRef}>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen((prev) => !prev)}
                  className="student-mobile-header__menu"
                  aria-label="Open account menu"
                  aria-expanded={mobileMenuOpen}
                >
                  ⋯
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNotifications(true);
                    setMobileMenuOpen(false);
                    setUnreadCount(0);
                  }}
                  className="student-mobile-header__notifications"
                  aria-label={unreadCount > 0 ? `Open notifications, ${unreadCount} unread` : 'Open notifications'}
                  aria-haspopup="dialog"
                  aria-expanded={showNotifications}
                >
                  <span aria-hidden="true">🔔</span>
                  {unreadCount > 0 && (
                    <span className="student-mobile-header__notification-count">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
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
              <div className="student-mobile-hud" aria-label="Player resources">
                {badgeInfo && badgeInfo.label !== 'FREE' && (
                  <div className="plan-badge-mobile flex-shrink-0">
                    <div className={`plan-badge plan-badge--${badgeInfo.color}`}>
                      <span className="plan-badge__label">{badgeInfo.label}</span>
                      {badgeInfo.countdown && (
                        <span className="plan-badge__countdown">{badgeInfo.countdown}</span>
                      )}
                    </div>
                  </div>
                )}
                {/* Coins */}
                <div className="student-mobile-hud__chip border-yellow-500/40 bg-yellow-500/10">
                  <CoinAnimation width={18} height={18} />
                  <span id="coin-hud" className="font-mono text-xs font-bold text-white">
                    {(profile.coins ?? 0).toLocaleString()}
                  </span>
                </div>
                {/* Gemstones */}
                <div className="student-mobile-hud__chip border-rose-500/50 bg-rose-500/10">
                  <div className="h-4 w-4">
                    <GemIcon />
                  </div>
                  <span id="gem-hud" className="font-mono text-xs font-bold text-white">
                    {(profile.gemstones ?? 0).toLocaleString()}
                  </span>
                </div>
                {/* XP */}
                <div className="student-mobile-hud__chip border-cyan-400/40 bg-cyan-500/10">
                  <div className="h-4 w-4 text-cyan-300">
                    <XPIcon />
                  </div>
                  <span id="xp-hud" className="font-mono text-xs font-bold text-white">
                    {(profile.xp ?? 0).toLocaleString()}
                  </span>
                </div>
                {/* AP */}
                <div className="student-mobile-hud__chip border-emerald-500/40 bg-emerald-500/10">
                  <div className="h-4 w-4 text-emerald-300">
                    <APIcon />
                  </div>
                  <span id="ap-hud" className="font-mono text-xs font-bold text-white">
                    {calculatedAP}<span className="text-[10px] text-slate-400">/{profile.ap_max}</span>
                  </span>
                </div>
                {/* Streak */}
                <button type="button" onClick={onShowStreak} aria-label={`Open streak rewards guide. Current streak: ${profile.streak || 0} days`} title="Open streak rewards" className={`student-mobile-hud__chip transition hover:border-orange-300/70 hover:bg-orange-500/20 ${
                  profile.streak >= 7 ? 'border-orange-500/50 bg-orange-500/15' : 'border-slate-700 bg-slate-800/40'
                }`}>
                  {getStreakBadge(profile.streak) ? (
                    <img src={getStreakBadge(profile.streak)!} alt="" className="h-5 w-5 rounded object-contain" />
                  ) : (
                    <img src={neonIcon('streak')} alt="" className="h-4 w-4 object-contain" />
                  )}
                  <span id="streak-hud" className={`font-mono text-xs font-bold ${profile.streak >= 7 ? 'text-orange-200' : 'text-white'}`}>
                    {profile.streak || 0}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Desktop Layout (>= 768px) — Two rows */}
          <div className="hidden md:flex flex-col gap-1.5">
            
            {/* Row 1: Brand + Username + Plan Badge + Actions */}
            <div className="flex items-center justify-between">
              {/* Left: Brand + Username */}
              <div className="flex items-center gap-2 lg:gap-3 min-w-0">
                <div className="relative group flex items-center gap-1.5 lg:gap-2 flex-shrink-0">
                  <button type="button" onClick={handleBrandClick} aria-label={`Go to ${schoolBrand.name} dashboard`}>
                    <SchoolBrand brand={schoolBrand} showName={false} imageClassName="w-8 h-8 lg:w-10 lg:h-10 object-contain" />
                  </button>
                  <button
                    type="button"
                    onClick={handleBrandClick}
                    className="font-heading text-xl lg:text-2xl xl:text-3xl font-black tracking-wider select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 rounded"
                    aria-label="Go to dashboard"
                  >
                    <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-500 bg-clip-text text-transparent">
                      {schoolBrand.name}
                    </span>
                  </button>
                  <div className="absolute -bottom-1 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-500 via-pink-500 to-cyan-500 opacity-50 blur-sm"></div>
                </div>
                
                {/* Username badge */}
                <div
                  className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-black/40 rounded-full border border-cyan-500/30 backdrop-blur-sm cursor-pointer min-w-0"
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
                  <AvatarWithFrame
                    src={profile.avatar_url}
                    alt={profile.username}
                    size="xs"
                    hasNeonFrame={hasNeonFrame}
                    hasFlickerTheme={hasFlickerTheme}
                    hasGlitchEffect={hasGlitchEffect}
                    className="flex-shrink-0 transition-transform duration-200 hover:scale-110"
                    imgClassName="w-7 h-7"
                    fallbackFrameClassName="border-2 border-pink-500"
                  />
                  <span className="font-bold text-white text-sm underline decoration-dotted decoration-cyan-400/70 underline-offset-4 truncate max-w-[100px] lg:max-w-[140px] xl:max-w-none">
                    {profile.username}
                  </span>
                </div>

                {/* Plan Badge */}
                {badgeInfo && badgeInfo.label !== 'FREE' && (
                  <div className={`plan-badge plan-badge--${badgeInfo.color} flex-shrink-0`}>
                    <span className="plan-badge__icon">
                      {badgeInfo.color === 'cyan' ? '🚀' : badgeInfo.color === 'amber' ? '👑' : badgeInfo.color === 'purple' ? '💎' : '⚡'}
                    </span>
                    <span className="plan-badge__label">{badgeInfo.label}</span>
                    {badgeInfo.countdown && (
                      <span className="plan-badge__countdown">{badgeInfo.countdown}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Right: Action Buttons */}
              <div className="flex items-center gap-1 lg:gap-1.5 flex-shrink-0">
                {/* Notification Bell */}
                <button 
                  onClick={() => {
                    setShowNotifications(!showNotifications);
                    if (!showNotifications) setUnreadCount(0);
                  }}
                  className="relative p-1.5 lg:p-2 rounded-lg bg-black/40 border border-gray-600 hover:border-purple-500 hover:bg-purple-500/10 transition-all backdrop-blur-sm"
                  aria-label="Notifications"
                >
                  <span className="text-sm lg:text-base">🔔</span>
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 px-1.5 py-0.5 text-[11px] font-bold bg-red-500 text-white rounded-full min-w-[18px] text-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {/* Help Button */}
                <button 
                  onClick={() => onShowHelp?.()}
                  className="p-1.5 lg:p-2 rounded-lg bg-black/40 border border-gray-600 hover:border-cyan-500 hover:bg-cyan-500/10 transition-all backdrop-blur-sm"
                  aria-label="Help"
                  title="Help & Guide"
                >
                  <span className="text-sm lg:text-base">❓</span>
                </button>

                {/* Admin Button */}
                {isAdmin(profile) && (
                  <button 
                    onClick={() => onNavigate?.('admin')}
                    className="p-1.5 lg:p-2 rounded-lg bg-gradient-to-br from-amber-600/40 to-yellow-600/40 border border-amber-500/80 hover:border-amber-400 hover:bg-amber-500/20 transition-all backdrop-blur-sm shadow-md shadow-amber-500/20 animate-pulse"
                    aria-label="Admin Portal"
                    title="Admin Portal 👑"
                  >
                    <span className="text-sm lg:text-base">👑</span>
                  </button>
                )}

                {/* School Admin Button */}
                {isSchoolAdmin && onOpenSchoolAdmin && (
                  <button 
                    onClick={onOpenSchoolAdmin}
                    className="p-1.5 lg:p-2 rounded-lg bg-gradient-to-br from-purple-600/40 to-indigo-600/40 border border-purple-500/80 hover:border-purple-400 hover:bg-purple-500/20 transition-all backdrop-blur-sm shadow-md shadow-purple-500/20"
                    aria-label="School Admin Portal"
                    title="School Admin Portal 🏫"
                  >
                    <span className="text-sm lg:text-base">🏫</span>
                  </button>
                )}

                {/* Settings Button */}
                <button 
                  onClick={() => setShowSettingsModal(true)}
                  className="p-1.5 lg:p-2 rounded-lg bg-black/40 border border-gray-600 hover:border-yellow-500 hover:bg-yellow-500/10 transition-all backdrop-blur-sm"
                  aria-label="Settings"
                >
                  <span className="text-sm lg:text-base">⚙️</span>
                </button>

                {/* Logout Button */}
                <button 
                  onClick={onLogout}
                  className="flex p-1.5 lg:p-2 rounded-lg bg-black/40 border border-gray-600 hover:border-red-500 hover:bg-red-500/10 transition-all backdrop-blur-sm items-center justify-center"
                  aria-label="Log Out"
                >
                  <LogoutIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-red-400" />
                </button>
              </div>
            </div>

            {/* Row 2: Stats — only for students */}
            {profile.role !== 'teacher' && (
              <div className="flex items-center justify-center flex-wrap gap-1.5 lg:gap-2">
                {/* Coins */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-br from-yellow-600/20 to-orange-600/20 rounded-lg border border-yellow-500/50 backdrop-blur-sm">
                  <CoinAnimation width={16} height={16} />
                  <span id="coin-hud" className="font-mono font-bold text-xs text-white">{(profile.coins ?? 0).toLocaleString()}</span>
                </div>

                {/* Gemstones */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-br from-rose-700/25 to-pink-600/20 rounded-lg border border-rose-500/60 backdrop-blur-sm">
                  <div className="w-4 h-4"><GemIcon /></div>
                  <span id="gem-hud" className="font-mono font-bold text-xs text-white">{(profile.gemstones ?? 0).toLocaleString()}</span>
                </div>

                {/* XP */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-br from-blue-600/20 to-cyan-600/20 rounded-lg border border-cyan-500/50 backdrop-blur-sm">
                  <div className="w-4 h-4 text-cyan-400"><XPIcon /></div>
                  <span id="xp-hud" className="font-mono font-bold text-xs text-white">{(profile.xp ?? 0).toLocaleString()}</span>
                </div>

                {/* AP */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-br from-green-600/20 to-emerald-600/20 rounded-lg border border-green-500/50 backdrop-blur-sm">
                  <div className="w-4 h-4 text-green-400"><APIcon /></div>
                  <span id="ap-hud" className="font-mono font-bold text-xs text-white">{calculatedAP}<span className="text-[10px] text-gray-400">/{profile.ap_max}</span></span>
                </div>

                {/* Streak */}
                <button type="button" onClick={onShowStreak} aria-label={`Open streak rewards guide. Current streak: ${profile.streak || 0} days`} title="Open streak rewards" className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-orange-300/70 ${
                  profile.streak >= 7 
                    ? 'bg-gradient-to-br from-orange-600/30 to-red-600/30 border-orange-500/60' 
                    : 'bg-gradient-to-br from-gray-700/20 to-gray-600/20 border-gray-500/30'
                }`}>
                  <div className={`w-4 h-4 ${profile.streak >= 7 ? 'text-orange-400' : 'text-gray-400'}`}><StreakIcon /></div>
                  <span id="streak-hud" className={`font-mono font-bold text-xs ${profile.streak >= 7 ? 'text-orange-300' : 'text-white'}`}>
                    {profile.streak || 0}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Notification Center */}
      {showSettingsModal && (
        <SettingsModal
          onClose={() => setShowSettingsModal(false)}
          profile={profile}
          isAdminMode={isAdmin(profile)}
          avatarPresets={avatarPresets}
          selectedAvatar={selectedAvatar}
          uploadingAvatar={uploadingAvatar}
          avatarUploadError={avatarUploadError || ''}
          onAvatarSelect={handleAvatarSelect}
          onAvatarUpload={handleAvatarUpload}
          onNeonFrameDeactivated={onProfileRefresh ? () => onProfileRefresh() : undefined}
          onUsernameChange={handleUsernameChange}
          avatarUploadSuccess={avatarUploadSuccess}
          requiredChanges={profile.required_changes as { username?: boolean; avatar?: boolean; reason?: string } | null}
        />
      )}

      {showProfileModal && (
        <UserProfileModal
          profile={profile}
          apValue={calculatedAP}
          onClose={() => setShowProfileModal(false)}
          onAttack={() => {
            setShowProfileModal(false);
            onNavigate?.('pvp');
          }}
          attackLabel="Launch PvP"
        />
      )}

      <NotificationCenter
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
        onNavigate={onNavigate}
        onAction={onNotificationAction}
        userRole={profile.role as 'student' | 'teacher' | 'admin' | undefined}
      />
    </>
  );
};

export default Header;
