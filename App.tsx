import React, { Suspense, useState, useEffect, useRef, useMemo } from 'react';
import { Profile, Task, SessionStatus, Caps, NewsEvent, ToastMessage, Announcement, Grade, Batch, StudentAssignmentTask } from './types';
import * as GameService from './services/gameService';
import { supabase } from './services/supabaseClient';
import Header from './components/Header';
import { useLightMode } from './src/contexts/LightModeContext';
import PlayerProfileCard from './components/PlayerProfileCard';
import TaskList from './components/TaskList';
import MainActions from './components/MainActions';
import NewsFeed from './components/NewsFeed';
import Toast from './components/Toast';
import LevelUpModal from './components/LevelUpModal';
import TutorialModal from './components/TutorialModal';
import HelpModal from './components/HelpModal';
import { ToastContainer } from './components/ToastNotification';
import { isAdmin } from './services/adminService';
import { audioService } from './services/audioService';
import { aiHostService } from './services/aiHostService';
import CinematicEffects from './components/CinematicEffects';
import { fetchNextAnnouncement, markAnnouncementSeen } from './services/competitionService';
import { notificationService } from './services/notificationService';
import { BAN_MESSAGE, isBannedFlag, storeBanMessage } from './services/banMessage';

const QuestView = React.lazy(() => import('./components/QuestView'));
const PvPView = React.lazy(() => import('./components/PvPView'));
const ShopView = React.lazy(() => import('./components/ShopView'));
const ClanView = React.lazy(() => import('./components/ClanView'));
const InventoryView = React.lazy(() => import('./components/InventoryView'));
const LeaderboardView = React.lazy(() => import('./components/LeaderboardView'));
const AchievementView = React.lazy(() => import('./components/AchievementView'));
const TeacherPortal = React.lazy(() => import('./components/TeacherPortal'));
const AdminPortal = React.lazy(() => import('./components/AdminPortal'));
const TournamentHub = React.lazy(() => import('./components/TournamentHub'));
const TournamentAdminDashboard = React.lazy(() => import('./components/TournamentAdminDashboard'));
const Phase1PlayView = React.lazy(() => import('./components/phase1/Phase1PlayView'));
const Phase1LeaderboardView = React.lazy(() => import('./components/phase1/Phase1LeaderboardView'));
const Phase1AdminDashboard = React.lazy(() => import('./components/phase1/Phase1AdminDashboard'));
const AnnouncementBanner = React.lazy(() => import('./components/phase1/AnnouncementBanner'));
const RaidView = React.lazy(() => import('./src/features/raids/RaidView'));
const RaidAdminView = React.lazy(() => import('./src/features/raids/RaidAdminView'));
const IeltsHome = React.lazy(() => import('./src/pages/ielts/IeltsHome'));
const ClanTerritoryManager = React.lazy(() => import('./src/features/clanTerritory/ClanTerritoryManager'));

const GRADE_TO_BATCH: Record<Grade, Batch[]> = {
  6: ['6A', '6B', '6C', 'N/A'],
  7: ['7A', '7B', '7C', 'N/A'],
  8: ['8A', '8B', '8C', 'N/A'],
  9: ['9A', '9B', '9C', 'N/A'],
  10: ['10A', '10B', '10C', 'N/A'],
  11: ['11A', '11B', '11C', 'N/A'],
  12: ['12A', '12B', '12C', 'N/A'],
};
const DEFAULT_BATCH: Batch = 'N/A';
interface AppProps {
  onLogout: () => void;
}

const App: React.FC<AppProps> = ({ onLogout }) => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);
  const [caps, setCaps] = useState<Caps | null>(null);
  const [news, setNews] = useState<NewsEvent[]>([]);
  const [activeAssignment, setActiveAssignment] = useState<StudentAssignmentTask | null>(null);
  const [loading, setLoading] = useState(true);
    const [view, setView] = useState<'dashboard' | 'quest' | 'pvp' | 'shop' | 'clan' | 'inventory' | 'leaderboard' | 'achievements' | 'teacher' | 'admin' | 'tournament' | 'tournament_admin' | 'phase1_play' | 'phase1_leaderboard' | 'phase1_admin' | 'raids' | 'raid_admin' | 'ielts' | 'lockdown'>('dashboard');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [showLevelUpModal, setShowLevelUpModal] = useState(false);
  const [levelUpData, setLevelUpData] = useState<{ newLevel: number; rewards: any } | null>(null);
  const [previousLevel, setPreviousLevel] = useState<number | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [tutorialChecked, setTutorialChecked] = useState(false); // Track if we've checked tutorial status
  const [loadError, setLoadError] = useState<string | null>(null);
  const [effectsIntensity, setEffectsIntensity] = useState<'calm' | 'active' | 'alert'>('calm');
  const [activeAnnouncement, setActiveAnnouncement] = useState<Announcement | null>(null);
  const previousViewRef = useRef(view);
  const previousSessionActiveRef = useRef<boolean | null>(null);
  const [showAcademicSetup, setShowAcademicSetup] = useState(false);
  const [pendingGrade, setPendingGrade] = useState<Grade | null>(null);
  const [pendingBatch, setPendingBatch] = useState<Batch>(DEFAULT_BATCH);
  const [savingAcademic, setSavingAcademic] = useState(false);
  const [academicError, setAcademicError] = useState<string | null>(null);
  const [attackAlert, setAttackAlert] = useState(false);
  const attackAlertTimeoutRef = useRef<number | null>(null);
  const lastRewardedLevelRef = useRef<number | null>(null);
  const { isLightMode: isLiteMode, toggleLightMode } = useLightMode();
  const [pendingClanRequests, setPendingClanRequests] = useState(0);

  const renderLazy = (node: React.ReactNode) => (
    <Suspense
      fallback={(
        <div className="p-8 text-center text-gray-300">
          Loading view...
        </div>
      )}
    >
      {node}
    </Suspense>
  );
  const academicClassOptions = useMemo(() => {
    if (pendingGrade === null) {
      return [DEFAULT_BATCH];
    }
    return GRADE_TO_BATCH[pendingGrade as Grade];
  }, [pendingGrade]);

  const addToast = (message: string, type: ToastMessage['type'] = 'info', retryAction?: () => void) => {
    const id = Date.now();
    setToasts((prevToasts: ToastMessage[]) => [...prevToasts, { id, message, type, retryAction }]);
  };

  const removeToast = (id: number) => {
    setToasts((prevToasts: ToastMessage[]) => prevToasts.filter((toast: ToastMessage) => toast.id !== id));
  };

  const handleAcademicGradeChange = (value: string) => {
    if (!value) {
      setPendingGrade(null);
      setPendingBatch(DEFAULT_BATCH);
      setAcademicError(null);
      return;
    }

    const parsed = parseInt(value, 10) as Grade;
    setPendingGrade(parsed);
    setAcademicError(null);

    const validOptions = GRADE_TO_BATCH[parsed];
    if (!validOptions.includes(pendingBatch)) {
      setPendingBatch(DEFAULT_BATCH);
    }
  };

  const handleAcademicBatchChange = (value: string) => {
    setPendingBatch((value as Batch) || DEFAULT_BATCH);
    setAcademicError(null);
  };

  const refreshAssignment = async (profileOverride?: Profile | null) => {
    const targetProfile = profileOverride ?? profile;
    const role = targetProfile?.role ?? 'student';

    if (!targetProfile || role === 'teacher' || role === 'admin') {
      setActiveAssignment(null);
      return;
    }

    try {
      const assignment = await GameService.get_student_active_assignment();
      setActiveAssignment(assignment);
    } catch (error) {
      console.error('Failed to load assignment state:', error);
    }
  };

  const refreshPendingJoinRequests = async () => {
    if (!profile) {
      setPendingClanRequests(0);
      return;
    }

    try {
      const count = await GameService.clan_get_pending_request_count();
      setPendingClanRequests(count);
    } catch (error) {
      console.error('Failed to load clan join requests', error);
    }
  };

  const handleAcademicSave = async () => {
    if (!profile) {
      return;
    }

    if (pendingGrade === null) {
      setAcademicError('Select your grade to continue.');
      return;
    }

    setSavingAcademic(true);
    setAcademicError(null);
    try {
      const { error } = await supabase
        .from('users')
        .update({
          grade: pendingGrade,
          batch: pendingBatch,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id);

      if (error) {
        console.error('Failed to update grade/class', error);
        setAcademicError('Failed to save your class info. Please try again.');
        return;
      }

        setProfile((prevProfile: Profile | null) =>
          prevProfile
            ? { ...prevProfile, grade: pendingGrade, batch: pendingBatch }
            : prevProfile
      );
      setShowAcademicSetup(false);
      addToast('Class info saved. Welcome agent!', 'success');
    } finally {
      setSavingAcademic(false);
    }
  };

  useEffect(() => {
    return aiHostService.init();
  }, []);

  useEffect(() => {
    const unsubscribe = notificationService.subscribe((notification) => {
      if (notification.type === 'attack_incoming') {
        if (attackAlertTimeoutRef.current) {
          window.clearTimeout(attackAlertTimeoutRef.current);
        }

        setAttackAlert(true);
        attackAlertTimeoutRef.current = window.setTimeout(() => {
          setAttackAlert(false);
          attackAlertTimeoutRef.current = null;
        }, 6000);
      }
    });

    return () => {
      if (attackAlertTimeoutRef.current) {
        window.clearTimeout(attackAlertTimeoutRef.current);
      }
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    void refreshPendingJoinRequests();
  }, [profile?.id, view]);

  useEffect(() => {
    if (!profile || profile.role === 'teacher' || profile.role === 'admin') {
      setShowAcademicSetup(false);
      return;
    }

    const needsGrade = profile.grade === null;
    const needsBatch = !profile.batch;

    if (needsGrade || needsBatch) {
      setPendingGrade(profile.grade);
      setPendingBatch((profile.batch ?? DEFAULT_BATCH) as Batch);
      setShowAcademicSetup(true);
    } else {
      setShowAcademicSetup(false);
    }
  }, [profile]);

  const fetchGameData = async () => {
    try {
      setLoading(true);
      setLoadError(null);

      // Check if offline before attempting fetch
      if (!navigator.onLine) {
        throw new Error('No internet connection');
      }

      // Add timeout to prevent infinite loading (30 seconds)
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout - server took too long to respond')), 30000)
      );

      const dataPromise = Promise.all([
        GameService.whoami(),
        GameService.tasks_list(),
        GameService.session_status(),
        GameService.caps_status(),
        GameService.news_feed(),
      ]);

      const [profileData, tasksData, sessionData, capsData, newsData] = await Promise.race([
        dataPromise,
        timeoutPromise
      ]) as any;

      setProfile(profileData);
      
      // Admin users don't need tasks/sessions - set defaults
      if (profileData?.role === 'admin') {
        setTasks(tasksData || []);
        setSessionStatus(sessionData || { status: 'idle', current_task: null, started_at: null, multiplier: 1 });
        setCaps(capsData || { daily: 0, weekly: 0, monthly: 0 });
      } else {
        setTasks(tasksData);
        setSessionStatus(sessionData);
        setCaps(capsData);
      }
      
      setNews(newsData || []);

      await refreshAssignment(profileData);

      // Show tutorial if first time user (only check once on initial load)
      if (!tutorialChecked && profileData && !profileData.tutorial_completed) {
        setShowTutorial(true);
        setTutorialChecked(true);
      } else if (!tutorialChecked) {
        setTutorialChecked(true);
      }
    } catch (error: any) {
      console.error("Failed to load game data:", error);
      
      // Check for database setup issues
      const isDatabaseError = error?.message?.includes('relation') || 
                              error?.message?.includes('does not exist') ||
                              error?.code === '42P01' ||
                              error?.code === 'PGRST116';
      
      if (isDatabaseError) {
        setLoadError('database_not_setup');
      } else if (!navigator.onLine || error?.message?.includes('fetch') || error?.message?.includes('network')) {
        setLoadError('network_error');
      } else if (error?.message?.includes('timeout')) {
        setLoadError('timeout_error');
      } else {
        setLoadError('unknown_error');
      }
      
      addToast(`Failed to load: ${error?.message || 'Unknown error'}`, "error", fetchGameData);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGameData();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadAnnouncement = async () => {
      try {
        const next = await fetchNextAnnouncement();
        if (!cancelled) {
          setActiveAnnouncement(next);
        }
      } catch (err) {
        console.warn('Failed to load announcements', err);
      }
    };

    loadAnnouncement();
    const interval = setInterval(loadAnnouncement, 60000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (previousViewRef.current !== view) {
      if (previousViewRef.current) {
        audioService.play('activate');
      }
      previousViewRef.current = view;
    }
  }, [view]);

  useEffect(() => {
    if (sessionStatus) {
      if (previousSessionActiveRef.current !== null && previousSessionActiveRef.current !== sessionStatus.active) {
        audioService.play(sessionStatus.active ? 'hack_win' : 'collect');
      }
      previousSessionActiveRef.current = sessionStatus.active;
    }
  }, [sessionStatus]);

  useEffect(() => {
    if (!sessionStatus) return;

    if (sessionStatus.active) {
      setEffectsIntensity('alert');
    } else if (view !== 'dashboard') {
      setEffectsIntensity('active');
    } else {
      setEffectsIntensity('calm');
    }
  }, [sessionStatus, view]);

  const cinematicViewClass = useMemo(() => {
    if (sessionStatus?.active) {
      return 'cinematic-view cinematic-view--alert';
    }

    if (view !== 'dashboard') {
      return 'cinematic-view cinematic-view--active';
    }

    return 'cinematic-view cinematic-view--calm';
  }, [view, sessionStatus?.active]);

  const isStudent = profile?.role === 'student';

  // Auto-refresh profile every 60 seconds to update AP regeneration
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (navigator.onLine && profile) {
        refreshProfile();
      }
    }, 60000); // 60 seconds

    return () => clearInterval(intervalId);
  }, [profile]);

  // Network status detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      addToast('🌐 Connection restored', 'success');
      // Refresh data when coming back online
      fetchGameData();
    };

    const handleOffline = () => {
      setIsOnline(false);
      addToast('📡 No internet connection', 'error');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Real-time subscription for activity feed
  useEffect(() => {
    if (!profile) return;
    
    const activityChannel = supabase
      .channel('activities')
      .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'activities'
        },
        (payload) => {
          console.log('New activity detected!', payload);
          const newActivity = payload.new as any;
          
          // Show toast if user is the target of an action (got hacked)
          if (newActivity.target_id === profile.id) {
            if (newActivity.kind === 'pvp_win') {
              addToast(`⚔️ ${newActivity.actor_username} hacked you! ${newActivity.data?.details || ''}`, 'error');
            } else if (newActivity.kind === 'pvp_blocked') {
              addToast(`🛡️ Your shield blocked ${newActivity.actor_username}'s attack!`, 'success');
            }
          }
          
          // Refresh feed
          GameService.news_feed().then(setNews);
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(activityChannel);
    };
  }, [profile]);

  // Real-time subscription for profile updates
  useEffect(() => {
    if (!profile?.id) return;

    let isSubscribed = true;
    let lastUpdateTime = 0;
    const UPDATE_THROTTLE_MS = 2000; // Minimum 2 seconds between updates

    const hydrateProfileFromServer = async (fallbackProfile?: Profile, levelHint?: number) => {
      // Throttle updates to prevent infinite loops
      const now = Date.now();
      if (now - lastUpdateTime < UPDATE_THROTTLE_MS) {
        console.log('Profile update throttled');
        return;
      }
      lastUpdateTime = now;

      try {
        const hydratedProfile = await GameService.whoami();
        if (!isSubscribed) return;

        const resolvedLevel = levelHint ?? hydratedProfile.level ?? null;
        setProfile(hydratedProfile);
        if (resolvedLevel !== null) {
          setPreviousLevel(resolvedLevel);
          lastRewardedLevelRef.current = resolvedLevel;
        }
      } catch (err) {
        console.error('Failed to refresh profile after realtime update:', err);
        if (!isSubscribed || !fallbackProfile) return;

        const resolvedLevel = levelHint ?? fallbackProfile.level ?? null;
        setProfile(fallbackProfile);
        if (resolvedLevel !== null) {
          setPreviousLevel(resolvedLevel);
          lastRewardedLevelRef.current = resolvedLevel;
        }
      }
    };

    const profileChannel = supabase
      .channel('profile_updates')
      .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${profile.id}`
        },
        (payload) => {
          const newProfile = payload.new as Profile;
          const oldProfile = (payload.old as Profile) || null;

          // Skip if only last_seen or last_ap_update changed (avoid infinite loops)
          const significantChange = 
            newProfile.xp !== oldProfile?.xp ||
            newProfile.coins !== oldProfile?.coins ||
            newProfile.level !== oldProfile?.level ||
            newProfile.gemstones !== oldProfile?.gemstones ||
            newProfile.ap_now !== oldProfile?.ap_now ||
            newProfile.is_banned !== oldProfile?.is_banned ||
            newProfile.streak !== oldProfile?.streak;
          
          if (!significantChange) {
            return; // Silent skip for non-significant updates
          }

          console.log('Profile updated! (significant change)', payload);

          const isNowBanned = isBannedFlag(newProfile?.is_banned);
          const wasBanned = isBannedFlag(oldProfile?.is_banned);

          if (isNowBanned) {
            if (!wasBanned) {
              storeBanMessage(BAN_MESSAGE);
              addToast(BAN_MESSAGE, 'error');
              void supabase.auth.signOut().catch((err) => {
                console.error('Failed to sign out after ban enforcement', err);
              });
            }
            return;
          }
          
          const nextLevel = newProfile.level ?? 1;
          const lastRewardedLevel = lastRewardedLevelRef.current;

          // Detect level up
          if (
            previousLevel !== null &&
            nextLevel > previousLevel &&
            (lastRewardedLevel === null || nextLevel > lastRewardedLevel)
          ) {
            lastRewardedLevelRef.current = nextLevel;
            // Call RPC to grant level-up rewards
            supabase.rpc('rpc_grant_levelup_rewards', { p_new_level: nextLevel })
              .then(({ data, error }) => {
                if (error) {
                  console.error('Failed to grant level-up rewards:', error);
                  return;
                }

                const rewards = data || { coins: 100 * nextLevel, ap_refill: true };
                setLevelUpData({ newLevel: nextLevel, rewards });
                setShowLevelUpModal(true);

                // Refresh profile to show updated rewards
                hydrateProfileFromServer(undefined, nextLevel);
              });
          } else {
            // Use the realtime payload directly instead of calling whoami()
            // This avoids triggering another last_seen update
            setProfile(prev => prev ? { ...prev, ...newProfile } : newProfile);
            setPreviousLevel(nextLevel);
          }
        }
      )
      .subscribe();

    return () => {
      isSubscribed = false;
      supabase.removeChannel(profileChannel);
    };
  }, [profile?.id, previousLevel]);
  
  // Set initial level when profile loads
  useEffect(() => {
    if (profile && previousLevel === null) {
      setPreviousLevel(profile.level);
      lastRewardedLevelRef.current = profile.level;
    }
  }, [profile, previousLevel]);
  
  const handleViewComplete = () => {
    setView('dashboard');
    // Only refresh profile data (lightweight) instead of all game data
    refreshProfile();
  };

  // Lightweight profile refresh (no loading screen)
  const refreshProfile = async () => {
    try {
      const profileData = await GameService.whoami();
      setProfile(profileData);
      await refreshAssignment(profileData);
    } catch (error) {
      console.error('Failed to refresh profile:', error);
    }
  };

  const handleQuestAction = () => {
    if (activeAssignment) {
      const teacherName = activeAssignment.teacher_username || 'your teacher';
      addToast(`Assignment pending from ${teacherName}. Complete it before starting new quests.`, 'warning');
    }
    setView('quest');
  };

  const handleGrantReward = (deltas: { xp?: number; coins?: number; gemstones?: number; ap?: number }) => {
    if (!profile) return;

    // Optimistic update for smooth UI feedback
      setProfile((prevProfile: Profile | null) => {
      if (!prevProfile) return null;

      const nextXP = prevProfile.xp + (deltas.xp || 0);
      const nextCoins = prevProfile.coins + (deltas.coins || 0);
      const nextGemstones = prevProfile.gemstones + (deltas.gemstones || 0);
      const nextAP = prevProfile.ap_now + (deltas.ap || 0);

      return {
        ...prevProfile,
        xp: Math.max(0, nextXP),
        coins: Math.max(0, nextCoins),
        gemstones: Math.max(0, nextGemstones),
        ap_now: Math.min(prevProfile.ap_max, Math.max(0, nextAP)),
      };
    });

    // Verify rewards were actually saved to database by refreshing after a short delay
    // This helps catch silent failures in the reward persistence
    if ((deltas.xp || 0) + (deltas.coins || 0) > 0) {
      setTimeout(async () => {
        try {
          const currentProfile = await GameService.whoami();
          const expectedXP = profile.xp + (deltas.xp || 0);
          const expectedCoins = profile.coins + (deltas.coins || 0);
          
          // If the database values don't match expectations, something went wrong
          if (currentProfile.xp < expectedXP || currentProfile.coins < expectedCoins) {
            console.warn('[REWARD VERIFICATION] Mismatch detected:', {
              expected: { xp: expectedXP, coins: expectedCoins },
              actual: { xp: currentProfile.xp, coins: currentProfile.coins }
            });
            addToast('⚠️ Warning: Your rewards may not have been saved. Refreshing...', 'warning');
            // Refresh the full profile to get accurate data
            await refreshProfile();
          } else {
            // Sync local profile with database values to ensure consistency
            setProfile(currentProfile);
          }
        } catch (error) {
          console.error('[REWARD VERIFICATION] Failed to verify rewards:', error);
          // On verification failure, try to refresh profile to get accurate data
          try {
            await refreshProfile();
          } catch (refreshError) {
            console.error('[REWARD VERIFICATION] Failed to refresh profile:', refreshError);
          }
        }
      }, 3500); // Wait 3.5 seconds to account for retries (up to 3 attempts with backoff)
    }
  };

  const handleDismissAnnouncement = async () => {
    if (!activeAnnouncement) {
      return;
    }

    const announcementId = activeAnnouncement.id;
    setActiveAnnouncement(null);

    try {
      await markAnnouncementSeen(announcementId);

      const next = await fetchNextAnnouncement();
      if (next && next.id !== announcementId) {
        setActiveAnnouncement(next);
      }
    } catch (error) {
      console.warn('Failed to dismiss announcement', error);
    }
  };


  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="relative w-64 h-64 flex items-center justify-center">
          <div className="absolute w-32 h-32 border-4 border-ion-blue border-t-transparent rounded-full animate-spin"></div>
          <div className="absolute w-24 h-24 border-4 border-plasma-pink border-t-transparent rounded-full animate-spin" style={{animationDirection: 'reverse', animationDuration: '1.5s'}}></div>
        </div>
        <div className="font-heading text-2xl animate-pulse mt-4" style={{color: 'var(--ion-blue)'}}>
          Initializing Heist OS...
        </div>
        <div className="text-sm text-gray-400 mt-2">
          Loading your profile and game data...
        </div>
      </div>
    );
  }

  // Database not set up error screen
  if (loadError === 'database_not_setup') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card-glass p-8 max-w-2xl w-full text-center">
          <div className="text-6xl mb-4">🗄️</div>
          <h1 className="font-heading text-3xl mb-4" style={{color: 'var(--danger-red)'}}>
            Database Not Set Up
          </h1>
          <p className="text-gray-300 mb-4">
            The game database needs to be initialized before you can play.
          </p>
          <div className="bg-black/40 p-4 rounded-lg text-left mb-6">
            <p className="font-bold mb-2" style={{color: 'var(--ion-blue)'}}>Quick Setup (2 minutes):</p>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-300">
              <li>Open your <strong>Supabase Dashboard</strong> → <strong>SQL Editor</strong></li>
              <li>Run <code className="bg-black/50 px-2 py-1 rounded">supabase-schema.sql</code> (creates tables)</li>
              <li>Run <code className="bg-black/50 px-2 py-1 rounded">supabase-rls-policies.sql</code> (enables security)</li>
              <li>Run <code className="bg-black/50 px-2 py-1 rounded">DATABASE_MIGRATIONS.sql</code> (adds features)</li>
              <li>Click the retry button below</li>
            </ol>
          </div>
          <p className="text-sm text-gray-400 mb-6">
            📖 See <code className="bg-black/50 px-2 py-1 rounded">DATABASE_SETUP_GUIDE.md</code> in your repo for detailed instructions.
          </p>
          <button 
            onClick={() => {
              setLoadError(null);
              fetchGameData();
            }}
            className="px-6 py-3 rounded-lg font-bold gradient-cyan hover:scale-105 transition-transform"
          >
            🔄 Retry Connection
          </button>
          <button 
            onClick={onLogout}
            className="ml-4 px-6 py-3 rounded-lg font-bold bg-gray-700 hover:bg-gray-600 transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    );
  }

  // Network error screen
  if (loadError === 'network_error' || loadError === 'timeout_error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card-glass p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">{loadError === 'timeout_error' ? '⏱️' : '📡'}</div>
          <h1 className="font-heading text-3xl mb-4" style={{color: 'var(--amber-warn)'}}>
            {loadError === 'timeout_error' ? 'Request Timeout' : 'Connection Lost'}
          </h1>
          <p className="text-gray-300 mb-6">
            {loadError === 'timeout_error' 
              ? 'The server took too long to respond. This might be due to slow internet or server issues.'
              : 'Unable to connect to the game server. Please check your internet connection and try again.'}
          </p>
          <button 
            onClick={() => {
              setLoadError(null);
              fetchGameData();
            }}
            className="px-6 py-3 rounded-lg font-bold gradient-cyan hover:scale-105 transition-transform"
          >
            🔄 Retry Connection
          </button>
        </div>
      </div>
    );
  }

  // Unknown error screen
  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card-glass p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="font-heading text-3xl mb-4" style={{color: 'var(--danger-red)'}}>
            Something Went Wrong
          </h1>
          <p className="text-gray-300 mb-6">
            Failed to load game data. This might be a temporary issue.
          </p>
          <button 
            onClick={() => {
              setLoadError(null);
              fetchGameData();
            }}
            className="px-6 py-3 rounded-lg font-bold gradient-cyan hover:scale-105 transition-transform"
          >
            🔄 Try Again
          </button>
          <button 
            onClick={onLogout}
            className="ml-4 px-6 py-3 rounded-lg font-bold bg-gray-700 hover:bg-gray-600 transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    );
  }

  if (!profile || !tasks || !sessionStatus || !caps || !news) {
     return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card-glass p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="font-heading text-2xl mb-4" style={{color: 'var(--danger-red)'}}>
            Critical Data Missing
          </h1>
          <p className="text-gray-300 mb-6">
            Some required game data failed to load properly.
          </p>
          <button 
            onClick={fetchGameData}
            className="px-6 py-3 rounded-lg font-bold gradient-cyan hover:scale-105 transition-transform"
          >
            🔄 Reload
          </button>
        </div>
      </div>
    );
  }

  const renderView = () => {
    switch(view) {
        case 'quest':
            return renderLazy(
              <QuestView
                onComplete={handleViewComplete}
                onGrantReward={handleGrantReward}
                initialAssignment={activeAssignment}
                refreshAssignment={() => refreshAssignment()}
              />
            );
        case 'pvp':
            return renderLazy(<PvPView onComplete={handleViewComplete} onGrantReward={handleGrantReward} profile={profile} />);
        case 'shop':
            return renderLazy(
              <ShopView
                onComplete={handleViewComplete}
                onPurchase={handleGrantReward}
                profile={profile}
                addToast={addToast}
                onNavigateToInventory={() => setView('inventory')}
              />
            );
        case 'clan':
            return renderLazy(
              <ClanView
                onComplete={handleViewComplete}
                profile={profile}
                onUpdateProfile={setProfile}
                addToast={addToast}
                onPendingCountChange={setPendingClanRequests}
              />
            );
        case 'inventory':
            return renderLazy(
              <InventoryView
                onComplete={handleViewComplete}
                addToast={addToast}
                onNavigateToShop={() => setView('shop')}
                onProfileUpdate={setProfile}
              />
            );
        case 'leaderboard':
            return renderLazy(<LeaderboardView onComplete={handleViewComplete} currentUserId={profile.id} />);
        case 'achievements':
            return renderLazy(<AchievementView onComplete={handleViewComplete} addToast={addToast} />);
        case 'raids':
            return renderLazy(<RaidView profile={profile} onComplete={handleViewComplete} addToast={addToast} />);
        case 'raid_admin':
            return renderLazy(<RaidAdminView profile={profile} onComplete={handleViewComplete} addToast={addToast} />);
        case 'teacher':
            return renderLazy(<TeacherPortal profile={profile} onComplete={handleViewComplete} />);
        case 'admin':
            return renderLazy(<AdminPortal profile={profile} onComplete={handleViewComplete} addToast={addToast} />);
        case 'tournament':
            return renderLazy(<TournamentHub profile={profile} onClose={handleViewComplete} addToast={addToast} />);
        case 'tournament_admin':
            return renderLazy(<TournamentAdminDashboard profile={profile} onClose={handleViewComplete} addToast={addToast} />);
        case 'phase1_play':
            return renderLazy(
              <Phase1PlayView
                profile={profile}
                onExit={() => setView('dashboard')}
                onProfileUpdate={(updatedProfile) => setProfile(updatedProfile)}
                addToast={addToast}
              />
            );
        case 'phase1_leaderboard':
            return renderLazy(
              <Phase1LeaderboardView
                profile={profile}
                onExit={() => setView('dashboard')}
                addToast={addToast}
              />
            );
        case 'phase1_admin':
            return renderLazy(
              <Phase1AdminDashboard
                profile={profile}
                onExit={() => setView('dashboard')}
                addToast={addToast}
              />
            );
        case 'ielts':
            return renderLazy(
              <div className="relative">
                  <button
                      onClick={() => setView('dashboard')}
                      className="mb-4 px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors flex items-center gap-2"
                  >
                      ← Back to Dashboard
                  </button>
                  <IeltsHome />
              </div>
            );
        case 'lockdown':
          return renderLazy(
            <ClanTerritoryManager
              onExit={() => setView('dashboard')}
              isTeacher={profile?.role === 'teacher'}
              playerName={profile?.username || 'Agent'}
              clanId={profile?.clan_id}
              clanName={profile?.clan_name}
              onRefreshProfile={fetchGameData}
              onGoToClan={() => setView('clan')}
            />
          );
        case 'dashboard':
        default:
            // Teacher Dashboard - simplified view focused on teaching
            if (profile?.role === 'teacher') {
                return (
                    <main className="mt-6 max-w-6xl mx-auto">
                        <div className="text-center mb-8">
                            <h1 className="font-heading text-4xl mb-2" style={{color: 'var(--ion-blue)'}}>👨‍🏫 Teacher Dashboard</h1>
                            <p className="text-gray-300">Manage your questions and track student progress</p>
                        </div>
                        
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                            {/* Quick Stats */}
                            <div className="card-glass p-6">
                                <h3 className="font-heading text-xl mb-4" style={{color: 'var(--ion-blue)'}}>Overview</h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center p-3 bg-black/20 rounded-lg">
                                        <span className="text-gray-300">Username</span>
                                        <span className="font-bold text-white">{profile.username}</span>
                                    </div>
                                    <div className="flex justify-between items-center p-3 bg-purple-500/20 rounded-lg border border-purple-400">
                                        <span className="text-gray-300">Role</span>
                                        <span className="font-bold text-white">👨‍🏫 Teacher</span>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Quick Actions */}
                            <div className="card-glass p-6">
                                <h3 className="font-heading text-xl mb-4" style={{color: 'var(--amber-warn)'}}>Quick Actions</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <button
                                        onClick={() => setView('teacher')}
                                        className="w-full p-6 rounded-xl bg-gradient-to-r from-purple-500/20 to-blue-500/20 border-2 border-purple-400 hover:border-purple-300 transition-all hover:scale-105 active:scale-95"
                                    >
                                        <div className="text-4xl mb-2">🧑‍🏫📘</div>
                                        <div className="font-heading text-xl mb-1">Question Management</div>
                                        <div className="text-sm text-gray-300">Create and manage your questions</div>
                                    </button>
                                    <button
                                        onClick={() => setView('lockdown')}
                                        className="w-full p-6 rounded-xl bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border-2 border-emerald-400 hover:border-emerald-300 transition-all hover:scale-105 active:scale-95"
                                    >
                                        <div className="text-4xl mb-2">🔒🛰️</div>
                                        <div className="font-heading text-xl mb-1">Lockdown Mode</div>
                                        <div className="text-sm text-gray-300">Host a live classroom session</div>
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                    </main>
                );
            }
            
            // Student Dashboard - full gameplay experience
            const pendingTasks = tasks.filter((task) => !task.claimed && task.progress < task.target).length;
            const completedTasks = tasks.filter((task) => task.progress >= task.target).length;
            const studyProgress = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0;
            const apReadyPercent = Math.min(100, Math.round((profile.ap_now / profile.ap_max) * 100));
            return (
              <main className="mt-6 space-y-6">

                <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                  {/* Left Column */}
                  <div className="space-y-6 lg:col-span-4 xl:col-span-3">
                    <PlayerProfileCard profile={profile} />
                  </div>

                  {/* Middle Column */}
                  <div className="space-y-6 lg:col-span-5 xl:col-span-6">
                    <MainActions
                      onStartQuest={handleQuestAction}
                      onStartPvp={() => setView('pvp')}
                      onOpenRaid={!isStudent ? () => setView('raids') : undefined}
                      onVisitShop={() => setView('shop')}
                      onGoToClan={() => setView('clan')}
                      onVisitInventory={() => setView('inventory')}
                      onViewLeaderboard={() => setView('leaderboard')}
                      onViewAchievements={() => setView('achievements')}
                      onOpenRaidAdmin={isAdmin(profile) ? () => setView('raid_admin') : undefined}
                      onOpenTournament={() => setView('tournament')}
                      onOpenAdminPortal={isAdmin(profile) ? () => setView('admin') : undefined}
                      onOpenTournamentAdmin={isAdmin(profile) ? () => setView('tournament_admin') : undefined}
                      onOpenCompetitionPlay={!isStudent && profile?.grade && !profile?.is_banned ? () => setView('phase1_play') : undefined}
                      onOpenCompetitionLeaderboard={() => setView('phase1_leaderboard')}
                      onOpenCompetitionAdmin={profile?.is_admin ? () => setView('phase1_admin') : undefined}
                      onOpenIeltsPrep={!isStudent ? () => setView('ielts') : undefined}
                      onOpenLockdown={() => setView('lockdown')}
                      hasPendingAssignment={Boolean(activeAssignment)}
                      clanBadgeCount={pendingClanRequests}
                    />
                    <TaskList tasks={tasks} onTasksUpdate={fetchGameData} />
                  </div>

                  {/* Right Column */}
                  <div className="space-y-6 lg:col-span-3 xl:col-span-3">
                    <NewsFeed news={news} />
                  </div>
                </section>
              </main>
            );
    }
  }

  return (
    <div
      className={
        isLiteMode
          ? 'relative min-h-screen w-full p-4 md:p-6 lg:p-8 max-w-screen-2xl mx-auto lite-mode-wrapper overflow-y-auto'
          : 'relative min-h-screen overflow-hidden p-4 md:p-6 lg:p-8 max-w-screen-2xl mx-auto'
      }
    >
      {!isLiteMode && <CinematicEffects intensity={effectsIntensity} />}
      {attackAlert && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center">
          <div className="absolute inset-0 bg-red-700/40 backdrop-blur-sm transition-opacity duration-300 animate-pulse" />
          <div className="pointer-events-none relative rounded-xl border border-red-500/80 bg-red-950/70 px-6 py-4 text-center shadow-2xl">
            <div className="text-5xl mb-2">🚨</div>
            <p className="font-heading text-xl text-red-200 tracking-wide uppercase">Incoming Attack Detected</p>
            <p className="text-sm text-red-100/80 mt-1">Hold tight while defenses deploy…</p>
          </div>
        </div>
      )}
      {showAcademicSetup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4">
          <div className="w-full max-w-xl rounded-2xl bg-slate-900 p-8 shadow-2xl ring-2 ring-amber-400/40">
            <h2 className="font-heading text-2xl text-white mb-2">Almost ready!</h2>
            <p className="text-sm text-gray-300 mb-6">
              We need your grade and class to place you on the right leaderboards. You can pick <span className="font-semibold text-amber-300">N/A</span> if you are not sure yet.
            </p>
            <form
              className="space-y-6"
              onSubmit={(event) => {
                event.preventDefault();
                void handleAcademicSave();
              }}
            >
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-200">Grade</label>
                <select
                  required
                  className="w-full rounded-lg border border-gray-700 bg-black/40 px-4 py-3 text-white focus:border-amber-300 focus:outline-none"
                  value={pendingGrade ?? ''}
                  onChange={(event) => handleAcademicGradeChange(event.target.value)}
                >
                  <option value="" disabled>
                    Select your grade
                  </option>
                  {Object.keys(GRADE_TO_BATCH)
                    .map((grade) => parseInt(grade, 10) as Grade)
                    .sort((a, b) => a - b)
                    .map((gradeOption) => (
                      <option key={gradeOption} value={gradeOption}>
                        Grade {gradeOption}
                      </option>
                    ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-200">Class</label>
                <select
                  required
                  className="w-full rounded-lg border border-gray-700 bg-black/40 px-4 py-3 text-white focus:border-amber-300 focus:outline-none"
                  value={pendingBatch}
                  onChange={(event) => handleAcademicBatchChange(event.target.value)}
                >
                  <option value="" disabled>
                    Select your class
                  </option>
                  {academicClassOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                {academicError && (
                  <p className="rounded-lg border border-red-500/60 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                    {academicError}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={savingAcademic}
                  className="flex h-12 w-full items-center justify-center rounded-lg bg-amber-500 text-black font-semibold hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-amber-600/40"
                >
                  {savingAcademic ? 'Saving…' : 'Save and Continue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <div className="relative z-10">
        <Header
          profile={profile}
          onLogout={onLogout}
          currentView={view}
          onBackToDashboard={() => setView('dashboard')}
          onShowHelp={() => setShowHelp(true)}
          onNavigate={(targetView) => setView(targetView)}
          liteMode={isLiteMode}
          onToggleLiteMode={toggleLightMode}
          onProfileAvatarChange={(avatarUrl) => setProfile((p) => p ? { ...p, avatar_url: avatarUrl } : p)}
          onProfileRefresh={refreshProfile}
        />

        {/* Offline Banner */}
        {!isOnline && (
          <div className="fixed top-20 left-0 right-0 z-50 flex justify-center">
            <div className="bg-red-500/90 text-white px-6 py-3 rounded-lg shadow-lg backdrop-blur-sm">
              <p className="font-semibold">📡 No internet connection - Some features may not work</p>
            </div>
          </div>
        )}

        {activeAnnouncement && (
          <Suspense fallback={null}>
            <AnnouncementBanner
              announcement={activeAnnouncement}
              onDismiss={handleDismissAnnouncement}
            />
          </Suspense>
        )}

        <div className={cinematicViewClass}>
          {renderView()}
        </div>
        <div className="fixed top-6 right-6 z-[100] space-y-3">
          {toasts.map(toast => (
            <Toast
              key={toast.id}
              id={toast.id}
              message={toast.message}
              type={toast.type}
              retryAction={toast.retryAction}
              onDismiss={() => removeToast(toast.id)}
            />
          ))}
        </div>

        {/* Level Up Modal */}
        {showLevelUpModal && levelUpData && (
          <LevelUpModal
            newLevel={levelUpData.newLevel}
            rewards={levelUpData.rewards}
            onClose={() => {
              setShowLevelUpModal(false);
              setLevelUpData(null);
            }}
          />
        )}

        {/* Tutorial Modal */}
        {showTutorial && (
          <TutorialModal
            onComplete={() => {
              setShowTutorial(false);
              // Don't refetch data - tutorial already updated DB
              // Just refresh the profile to show updated tutorial_completed status
              setTimeout(async () => {
                try {
                  const updatedProfile = await GameService.whoami();
                  setProfile(updatedProfile);
                } catch (error) {
                  console.error('Failed to refresh profile:', error);
                }
              }, 100);
            }}
            onSkip={() => {
              setShowTutorial(false);
              // Skip also marks tutorial as complete, so refresh profile
              setTimeout(async () => {
                try {
                  const updatedProfile = await GameService.whoami();
                  setProfile(updatedProfile);
                } catch (error) {
                  console.error('Failed to refresh profile:', error);
                }
              }, 100);
            }}
          />
        )}

        {/* Help Modal */}
        {showHelp && (
          <HelpModal onClose={() => setShowHelp(false)} />
        )}

        {/* Toast Notifications */}
        <ToastContainer />
      </div>
    </div>
  );
};

export default App;
