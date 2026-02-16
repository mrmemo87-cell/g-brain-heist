import React, { Suspense, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Profile, Task, SessionStatus, Caps, NewsEvent, ToastMessage, Announcement, Grade, Batch, StudentAssignmentTask, XpStatus } from './types';
import * as GameService from './services/gameService';
import { supabase } from './services/supabaseClient';
import Header from './components/Header';
import WhoAreYou from './components/WhoAreYou';
import SkeletonDashboard from './components/SkeletonDashboard';
import { useLightMode } from './src/contexts/LightModeContext';
import PlayerProfileCard from './components/PlayerProfileCard';
import TaskList from './components/TaskList';
import MainActions from './components/MainActions';
import JoinSchoolCard from './components/JoinSchoolCard';
import NewsFeed from './components/NewsFeed';
import CapTracker from './components/CapTracker';
import Toast from './components/Toast';
import LevelUpModal from './components/LevelUpModal';
import { ToastContainer } from './components/ToastNotification';
import { isSuperadmin } from './services/adminService';
import { isSchoolAdmin } from './services/schoolAdminService';
import { audioService } from './services/audioService';
import { aiHostService } from './services/aiHostService';
import { fetchNextAnnouncement, markAnnouncementSeen } from './services/competitionService';
import { notificationService } from './services/notificationService';
import { BAN_MESSAGE, isBannedFlag, storeBanMessage } from './services/banMessage';
import { isEmailVerified } from './services/emailVerification';
import EmailVerificationGate from './components/EmailVerificationGate';
import UpgradeModal from './components/UpgradeModal';
import { fetchEffectiveTier, isPro as isProTier, invalidateTierCache, fetchSchoolPlanDetails, type AccountTier } from './services/tierService';

// Lazy-loaded: only fetched when the user actually opens these views/modals
const IeltsHome = React.lazy(() => import('./src/pages/ielts/IeltsHome'));
const HelpModal = React.lazy(() => import('./components/HelpModal'));
const TutorialModal = React.lazy(() => import('./components/TutorialModal'));

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
const ClanTerritoryManager = React.lazy(() => import('./src/features/clanTerritory/ClanTerritoryManager'));
const CambridgeTestsHub = React.lazy(() => import('./components/CambridgeTestsHub'));
const SchoolAdminPortal = React.lazy(() => import('./components/SchoolAdminPortal'));
const AdmissionHub = React.lazy(() => import('./components/AdmissionHub'));

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

const IELTS_ONLY_SCHOOL_NAME = 'Just for IELTS';
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_KEYS = {
  tasks: 'brains_heist_cache_tasks',
  caps: 'brains_heist_cache_caps',
  news: 'brains_heist_cache_news',
};
const DEFAULT_SESSION_STATUS: SessionStatus = {
  active: false,
  remaining_seconds: 0,
  current_multiplier: 1,
  today_used: false,
};

type NonCriticalLoadState = 'idle' | 'loading' | 'ready' | 'error' | 'cached';
type NonCriticalKey = 'tasks' | 'caps' | 'news' | 'assignment' | 'sessionStatus';

const readCache = <T,>(key: string): T | null => {
  const raw = localStorage.getItem(key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { timestamp: number; value: T };
    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.value;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
};

const writeCache = <T,>(key: string, value: T) => {
  localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), value }));
};

const App: React.FC<AppProps> = ({ onLogout }) => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [appMode, setAppMode] = useState<'pending' | 'player' | 'admin'>('pending');
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [tasks, setTasks] = useState<Task[]>(() => readCache<Task[]>(CACHE_KEYS.tasks) ?? []);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>(DEFAULT_SESSION_STATUS);
  const [caps, setCaps] = useState<Caps | null>(() => readCache<Caps>(CACHE_KEYS.caps));
  const [news, setNews] = useState<NewsEvent[]>(() => readCache<NewsEvent[]>(CACHE_KEYS.news) ?? []);
  const [activeAssignment, setActiveAssignment] = useState<StudentAssignmentTask | null>(null);
  const [criticalLoading, setCriticalLoading] = useState(true);
  const [view, setView] = useState<'dashboard' | 'quest' | 'pvp' | 'shop' | 'clan' | 'inventory' | 'leaderboard' | 'achievements' | 'teacher' | 'admin' | 'tournament' | 'tournament_admin' | 'phase1_play' | 'phase1_leaderboard' | 'phase1_admin' | 'raids' | 'raid_admin' | 'ielts' | 'lockdown' | 'cambridge' | 'school_admin' | 'admissions'>('dashboard');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [showLevelUpModal, setShowLevelUpModal] = useState(false);
  const [levelUpData, setLevelUpData] = useState<{ newLevel: number; rewards: any } | null>(null);
  const [previousLevel, setPreviousLevel] = useState<number | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [tutorialChecked, setTutorialChecked] = useState(false); // Track if we've checked tutorial status
  const tutorialCheckedRef = useRef(tutorialChecked);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);
  const [activeAnnouncement, setActiveAnnouncement] = useState<Announcement | null>(null);
  const previousViewRef = useRef(view);
  const [showJoinSchoolModal, setShowJoinSchoolModal] = useState(false);
  const previousSessionActiveRef = useRef<boolean | null>(null);
  const [showAcademicSetup, setShowAcademicSetup] = useState(false);
  const [pendingGrade, setPendingGrade] = useState<Grade | null>(null);
  const [pendingBatch, setPendingBatch] = useState<Batch>(DEFAULT_BATCH);
  const [savingAcademic, setSavingAcademic] = useState(false);
  const [academicError, setAcademicError] = useState<string | null>(null);
  const [attackAlert, setAttackAlert] = useState(false);
  const attackAlertTimeoutRef = useRef<number | null>(null);
  const lastRewardedLevelRef = useRef<number | null>(null);
  const cachedDataLoadedRef = useRef(false);
  const { isLightMode: isLiteMode, toggleLightMode } = useLightMode();
  const [pendingClanRequests, setPendingClanRequests] = useState(0);
  const [isUserSchoolAdmin, setIsUserSchoolAdmin] = useState(false);
  const [sessionMissing, setSessionMissing] = useState(false);
  const [isInteractive, setIsInteractive] = useState(false);
  const [accountTier, setAccountTier] = useState<AccountTier>('free');
  const [isPilotPlan, setIsPilotPlan] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeFeatureLabel, setUpgradeFeatureLabel] = useState<string | undefined>(undefined);
  const [peekedRole, setPeekedRole] = useState<'student' | 'teacher' | 'admin' | null>(null);
  const [nonCriticalStatus, setNonCriticalStatus] = useState({
    tasks: 'idle' as NonCriticalLoadState,
    caps: 'idle' as NonCriticalLoadState,
    news: 'idle' as NonCriticalLoadState,
    assignment: 'idle' as NonCriticalLoadState,
    sessionStatus: 'idle' as NonCriticalLoadState,
  });
  const [nonCriticalErrors, setNonCriticalErrors] = useState<Record<NonCriticalKey, string | null>>({
    tasks: null,
    caps: null,
    news: null,
    assignment: null,
    sessionStatus: null,
  });
  const bootStartRef = useRef<number>(performance.now());
  const bootTimingsRef = useRef<{ firstRender?: number; whoami?: number; nonCritical?: number }>({});
  const criticalAbortRef = useRef<AbortController | null>(null);
  const nonCriticalAbortRef = useRef<AbortController | null>(null);
  const isCambridgeView = view === 'cambridge';
  const isIeltsOnlyUser =
    profile?.school_name?.trim().toLowerCase() === IELTS_ONLY_SCHOOL_NAME.toLowerCase();
  const isPlayerMode = appMode === 'player';
  const hasSchool = Boolean(profile?.school_id);
  const isProUser = isProTier(accountTier);
  const isTeacherRole = profile?.role === 'teacher';
  const isFullScreenView = view === 'school_admin' || view === 'teacher' || view === 'admin' || view === 'admissions' || (view === 'dashboard' && isTeacherRole);

  const SkeletonBlock: React.FC<{ className?: string }> = ({ className }) => (
    <div className={`skeleton-bone rounded-xl bg-white/10 ${className ?? ''}`} />
  );

  const SectionPlaceholder: React.FC<{ title: string; lines?: number; action?: React.ReactNode }> = ({
    title,
    lines = 3,
    action,
  }) => (
    <div className="card-glass p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-heading text-lg text-cyan-200">{title}</h3>
        {action}
      </div>
      <div className="space-y-3">
        {Array.from({ length: lines }).map((_, index) => (
          <SkeletonBlock key={index} className="h-4 w-full" />
        ))}
      </div>
    </div>
  );

  const SectionError: React.FC<{ title: string; message: string; onRetry: () => void }> = ({
    title,
    message,
    onRetry,
  }) => (
    <div className="card-glass p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-heading text-lg text-amber-300">{title}</h3>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-amber-400/60 px-3 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-500/20"
        >
          Retry
        </button>
      </div>
      <p className="text-sm text-gray-300">{message}</p>
    </div>
  );

  const HeaderShell = () => (
    <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
      <div className="flex items-center justify-between">
        <SkeletonBlock className="h-6 w-32" />
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full skeleton-bone bg-white/10" />
          <SkeletonBlock className="h-4 w-20" />
        </div>
      </div>
    </div>
  );

  const renderLazy = (node: React.ReactNode) => (
    <Suspense
      fallback={(
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="skeleton-bone h-8 w-48 rounded-xl bg-white/10" />
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

  const addToast = useCallback((message: string, type: ToastMessage['type'] = 'info', retryAction?: () => void) => {
    const id = Date.now();
    setToasts((prevToasts: ToastMessage[]) => [...prevToasts, { id, message, type, retryAction }]);
  }, []);

  const handleViewChange = (nextView: typeof view) => {
    if (!hasSchool && ['clan', 'leaderboard', 'phase1_play', 'phase1_leaderboard', 'phase1_admin', 'school_admin', 'admissions'].includes(nextView)) {
      addToast('Join a school to access school-based features.', 'info');
      return;
    }
    // Pro-gated views: free users see upgrade modal instead
    const proOnlyViews = ['pvp', 'shop', 'clan', 'inventory', 'leaderboard', 'achievements', 'tournament', 'raids', 'cambridge', 'ielts'];
    if (!isProUser && proOnlyViews.includes(nextView)) {
      const labels: Record<string, string> = {
        pvp: 'Launch Attack', shop: 'Shop', clan: 'Clans', inventory: 'Inventory',
        leaderboard: 'Leaderboard', achievements: 'Achievements', tournament: 'Tournaments',
        raids: 'Raids', cambridge: 'Cambridge Tests', ielts: 'IELTS Prep',
      };
      setUpgradeFeatureLabel(labels[nextView] || nextView);
      setShowUpgradeModal(true);
      return;
    }
    if (!isAdminMode && nextView === 'admin') {
      addToast('Admin access requires server verification.', 'error');
      setView('dashboard');
      return;
    }
    if (isAdminMode && nextView !== 'admin') {
      addToast('Admin mode is active. Gameplay screens are not available.', 'info');
      setView('admin');
      return;
    }
    if (isIeltsOnlyUser && nextView !== 'ielts') {
      addToast(
        'This account is IELTS-only. Sign out and sign up with another school to access Brains Heist.',
        'info'
      );
      setView('ielts');
      return;
    }
    setView(nextView);
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
    if (!isPlayerMode || isTeacherRole) {
      return;
    }
    return aiHostService.init();
  }, [isPlayerMode, isTeacherRole]);

  useEffect(() => {
    if (!isPlayerMode || isTeacherRole) {
      return;
    }

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
  }, [isPlayerMode]);

  useEffect(() => {
    if (!isPlayerMode) return;
    void refreshPendingJoinRequests();
  }, [profile?.id, view, isPlayerMode]);

  useEffect(() => {
    if (!isPlayerMode) return;
    if (profile && isIeltsOnlyUser && view !== 'ielts') {
      setView('ielts');
    }
  }, [profile, isIeltsOnlyUser, view, isPlayerMode]);

  useEffect(() => {
    if (!isPlayerMode) return;
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
  }, [profile, isPlayerMode]);

  const loadCachedData = useCallback(() => {
    if (cachedDataLoadedRef.current) return;
    cachedDataLoadedRef.current = true;

    const cachedTasks = readCache<Task[]>(CACHE_KEYS.tasks);
    const cachedCaps = readCache<Caps>(CACHE_KEYS.caps);
    const cachedNews = readCache<NewsEvent[]>(CACHE_KEYS.news);

    if (cachedTasks) {
      setTasks(cachedTasks);
      setNonCriticalStatus((prev) => ({ ...prev, tasks: 'cached' }));
    }
    if (cachedCaps) {
      setCaps(cachedCaps);
      setNonCriticalStatus((prev) => ({ ...prev, caps: 'cached' }));
    }
    if (cachedNews) {
      setNews(cachedNews);
      setNonCriticalStatus((prev) => ({ ...prev, news: 'cached' }));
    }
  }, []);

  const logBootTiming = useCallback((label: string, value: number) => {
    if (!import.meta.env.DEV) return;
    console.info(`[Boot diagnostics] ${label}: ${Math.round(value)}ms`);
  }, []);

  useEffect(() => {
    const firstRenderMs = performance.now() - bootStartRef.current;
    bootTimingsRef.current.firstRender = firstRenderMs;
    logBootTiming('time to first render', firstRenderMs);
  }, [logBootTiming]);

  const classifyBootError = useCallback((error: any) => {
    const isDatabaseError = error?.message?.includes('relation') || 
                            error?.message?.includes('does not exist') ||
                            error?.code === '42P01' ||
                            error?.code === 'PGRST116';

    if (isDatabaseError) return 'database_not_setup';
    if (!navigator.onLine || error?.message?.includes('fetch') || error?.message?.includes('network')) return 'network_error';
    if (error?.message?.includes('timeout')) return 'timeout_error';
    return 'unknown_error';
  }, []);

  const scheduleAfterPaint = useCallback((callback: () => void) => {
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback?.(callback);
    } else {
      window.setTimeout(callback, 0);
    }
  }, []);

  useEffect(() => {
    tutorialCheckedRef.current = tutorialChecked;
  }, [tutorialChecked]);

  const startCriticalBoot = useCallback(async () => {
    criticalAbortRef.current?.abort();
    const criticalController = new AbortController();
    criticalAbortRef.current = criticalController;
    nonCriticalAbortRef.current?.abort();
    setCriticalLoading(true);
    setLoadError(null);
    setSessionMissing(false);
    setIsInteractive(false);
    setAppMode('pending');
    setIsAdminMode(false);
    setPeekedRole(null);

    try {
      const { data, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      if (!data.session) {
        setSessionMissing(true);
        return;
      }

      // ── FAST TEACHER PATH ──
      // Peek at user role from a lightweight query before running the full whoami.
      // Teachers skip AP regen, streak, clan, cosmetics, inventory, XP status.
      let profileData: Profile | null = null;
      try {
        const { data: peekRow } = await supabase
          .from('users')
          .select('role')
          .eq('id', data.session.user.id)
          .single();
        if (peekRow?.role === 'teacher') {
          setPeekedRole('teacher');
          profileData = await GameService.whoamiTeacher();
        } else {
          setPeekedRole(peekRow?.role === 'admin' ? 'admin' : 'student');
        }
      } catch { /* fall through to normal boot */ }

      if (!profileData) {
        const { session, profile: fullProfile } = await GameService.getCriticalBootData({
          signal: criticalController.signal,
          timeoutMs: 12000,
          retryOnTimeout: 1,
        });

        if (!session) {
          setSessionMissing(true);
          return;
        }
        profileData = fullProfile;
      }

      if (!profileData) {
        throw new Error('Profile not loaded');
      }

      setProfile(profileData);

      const whoamiMs = performance.now() - bootStartRef.current;
      bootTimingsRef.current.whoami = whoamiMs;
      logBootTiming('time to whoami resolved', whoamiMs);

      // ── TEACHER: minimal remaining boot ──
      if (profileData.role === 'teacher') {
        // Fetch tier in parallel (non-blocking)
        fetchEffectiveTier().then(tier => setAccountTier(tier)).catch(() => {});
        // Detect pilot plan
        fetchSchoolPlanDetails().then(d => setIsPilotPlan(d.plan === 'pilot' && d.is_active)).catch(() => {});
        // Check school admin status in parallel (non-blocking)
        isSchoolAdmin().then(setIsUserSchoolAdmin).catch(() => setIsUserSchoolAdmin(false));

        setIsAdminMode(false);
        setAppMode('player');
        setCriticalLoading(false);
        requestAnimationFrame(() => setIsInteractive(true));
        return;
      }

      // ── STUDENT / ADMIN PATH (unchanged) ──
      // Fetch payment tier (non-blocking, defaults to 'free')
      fetchEffectiveTier().then(tier => setAccountTier(tier)).catch(() => {});
      // Detect pilot plan
      fetchSchoolPlanDetails().then(d => setIsPilotPlan(d.plan === 'pilot' && d.is_active)).catch(() => {});

      // Handle post-Stripe-checkout redirect
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('upgrade') === 'success') {
        // Clear URL param, refresh tier
        window.history.replaceState({}, '', window.location.pathname);
        invalidateTierCache();
        fetchEffectiveTier().then(tier => {
          setAccountTier(tier);
          if (tier === 'pro') {
            addToast('🎉 Welcome to Brain Heist Pro! All features unlocked.', 'success');
          }
        }).catch(() => {});
      } else if (urlParams.get('upgrade') === 'cancelled') {
        window.history.replaceState({}, '', window.location.pathname);
      }

      // Check email verification status
      const verified = await isEmailVerified();
      setEmailVerified(verified);

      // Show tutorial if first time user (only check once on initial load)
      if (!tutorialCheckedRef.current && profileData && !profileData.tutorial_completed) {
        setShowTutorial(true);
        setTutorialChecked(true);
      } else if (!tutorialCheckedRef.current) {
        setTutorialChecked(true);
      }

      let isVerifiedAdmin = false;
      try {
        isVerifiedAdmin = await isSuperadmin();
      } catch (adminError) {
        console.warn('Failed to check superadmin status, continuing player boot.', adminError);
      }

      if (isVerifiedAdmin) {
        console.info('[admin] Superadmin detected, entering admin mode');
        setIsAdminMode(true);
        setAppMode('admin');
        setView('admin');
      } else {
        setIsAdminMode(false);
        setAppMode('player');
        loadCachedData();
      }

      setCriticalLoading(false);

      requestAnimationFrame(() => {
        setIsInteractive(true);
      });
    } catch (error: any) {
      if (error?.name === 'AbortError' || criticalController.signal.aborted) {
        // Aborted by a newer boot call (e.g. StrictMode double-mount).
        // Do NOT clear criticalLoading — the newer call owns that flag.
        return;
      }
      console.error('Failed to load critical boot data:', error);
      setLoadError(classifyBootError(error));
      addToast(`Failed to load: ${error?.message || 'Unknown error'}`, 'error', startCriticalBoot);
      setCriticalLoading(false);
    }
  }, [addToast, classifyBootError, logBootTiming, loadCachedData]);

  const runNonCriticalLoads = useCallback((targets?: NonCriticalKey[]) => {
    if (!profile) return;

    // Teachers don't need student game data (tasks, caps, news, assignments)
    if (profile.role === 'teacher') {
      // Only load session status for teachers
      const teacherTargets: NonCriticalKey[] = targets
        ? targets.filter(t => t === 'sessionStatus')
        : ['sessionStatus'];
      if (!teacherTargets.length) return;
      targets = teacherTargets;
    }

    const isStudentRole = profile.role === 'student';
    const resolvedTargets = targets
      ? targets.filter((target) => (target === 'assignment' ? isStudentRole : true))
      : (['tasks', 'caps', 'news', 'assignment', 'sessionStatus'] as NonCriticalKey[]).filter((target) =>
          target === 'assignment' ? isStudentRole : true
        );

    if (!resolvedTargets.length) {
      setNonCriticalStatus((prev) => ({ ...prev, assignment: 'ready' }));
      setActiveAssignment(null);
      return;
    }

    nonCriticalAbortRef.current?.abort();
    const controller = new AbortController();
    nonCriticalAbortRef.current = controller;

    setNonCriticalStatus((prev) => {
      const next = { ...prev };
      resolvedTargets.forEach((target) => {
        next[target] = 'loading';
      });
      return next;
    });
    setNonCriticalErrors((prev) => {
      const next = { ...prev };
      resolvedTargets.forEach((target) => {
        next[target] = null;
      });
      return next;
    });

    scheduleAfterPaint(() => {
      const { allSettled } = GameService.kickOffNonCriticalBootLoads({
        signal: controller.signal,
        targets: resolvedTargets,
        onTasks: (tasksData) => {
          setTasks(tasksData);
          writeCache(CACHE_KEYS.tasks, tasksData);
          setNonCriticalStatus((prev) => ({ ...prev, tasks: 'ready' }));
        },
        onCaps: (capsData) => {
          setCaps(capsData);
          writeCache(CACHE_KEYS.caps, capsData);
          setNonCriticalStatus((prev) => ({ ...prev, caps: 'ready' }));
        },
        onNews: (newsData) => {
          const normalized = newsData || [];
          setNews(normalized);
          writeCache(CACHE_KEYS.news, normalized);
          setNonCriticalStatus((prev) => ({ ...prev, news: 'ready' }));
        },
        onAssignment: (assignmentData) => {
          setActiveAssignment(assignmentData);
          setNonCriticalStatus((prev) => ({ ...prev, assignment: 'ready' }));
        },
        onSessionStatus: (status) => {
          setSessionStatus(status);
          setNonCriticalStatus((prev) => ({ ...prev, sessionStatus: 'ready' }));
        },
        onError: (key, error) => {
          setNonCriticalStatus((prev) => ({ ...prev, [key]: 'error' }));
          setNonCriticalErrors((prev) => ({ ...prev, [key]: (error as Error)?.message || 'Failed to load' }));
        },
      });

      void allSettled.then(() => {
        const nonCriticalMs = performance.now() - bootStartRef.current;
        bootTimingsRef.current.nonCritical = nonCriticalMs;
        logBootTiming('time to non-critical resolved', nonCriticalMs);
      });

      void isSchoolAdmin().then(setIsUserSchoolAdmin).catch(() => setIsUserSchoolAdmin(false));
    });
  }, [profile, scheduleAfterPaint, logBootTiming]);

  const retryNonCritical = useCallback(
    (target: NonCriticalKey) => {
      runNonCriticalLoads([target]);
    },
    [runNonCriticalLoads]
  );

  useEffect(() => {
    startCriticalBoot();
  }, [startCriticalBoot]);

  useEffect(() => {
    if (sessionMissing) {
      onLogout();
    }
  }, [sessionMissing, onLogout]);

  useEffect(() => {
    if (!isPlayerMode || !profile || !isInteractive) return;
    runNonCriticalLoads();
  }, [profile?.id, isInteractive, runNonCriticalLoads, isPlayerMode]);

  useEffect(() => {
    return () => {
      criticalAbortRef.current?.abort();
      nonCriticalAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!isPlayerMode || !isInteractive) return;
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
  }, [isInteractive, isPlayerMode]);

  useEffect(() => {
    if (!isPlayerMode) return;
    if (previousViewRef.current !== view) {
      if (previousViewRef.current) {
        audioService.play('activate');
      }
      previousViewRef.current = view;
    }
  }, [view, isPlayerMode]);

  useEffect(() => {
    if (!isPlayerMode) return;
    if (sessionStatus) {
      if (previousSessionActiveRef.current !== null && previousSessionActiveRef.current !== sessionStatus.active) {
        audioService.play(sessionStatus.active ? 'activate' : 'collect');
      }
      previousSessionActiveRef.current = sessionStatus.active;
    }
  }, [sessionStatus, isPlayerMode]);

  useEffect(() => {
    if (!isAdminMode && view === 'admin') {
      addToast('Admin access requires server verification.', 'error');
      setView('dashboard');
    }
  }, [addToast, isAdminMode, view]);

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
  const isAdminUser = isAdminMode;

  // Auto-refresh profile every 60 seconds (only for students who need AP regeneration)
  useEffect(() => {
    // Only refresh profile for students who need AP regeneration
    // Teachers and admins don't need this
    if (!isPlayerMode || !profile || profile.role !== 'student') return;
    
    const intervalId = setInterval(() => {
      if (navigator.onLine && profile) {
        refreshProfile();
      }
    }, 60000); // 60 seconds

    return () => clearInterval(intervalId);
  }, [profile, isPlayerMode]);

  // Network status detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      addToast('🌐 Connection restored', 'success');
      // Refresh data when coming back online
      startCriticalBoot();
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
  }, [addToast, startCriticalBoot]);

  // Real-time subscription for activity feed
  useEffect(() => {
    if (!isPlayerMode || !profile || !isInteractive || isTeacherRole) return;
    
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
  }, [profile, isInteractive, isPlayerMode]);

  // Real-time subscription for profile updates
  useEffect(() => {
    if (!isPlayerMode || !profile?.id || !isInteractive) return;

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
  }, [profile?.id, previousLevel, isInteractive, isPlayerMode]);
  
  // Set initial level when profile loads
  useEffect(() => {
    if (profile && previousLevel === null) {
      setPreviousLevel(profile.level);
      lastRewardedLevelRef.current = profile.level;
    }
  }, [profile, previousLevel]);
  
  const handleViewComplete = () => {
    if (isAdminMode) {
      setView('admin');
      return;
    }
    handleViewChange('dashboard');
    // Only refresh profile data (lightweight) instead of all game data
    refreshProfile();
  };

  // Lightweight profile refresh (no loading screen)
  const refreshProfile = async () => {
    if (!isPlayerMode) return;
    try {
      const profileData = await GameService.whoami();
      setProfile(profileData);
      await refreshAssignment(profileData);
    } catch (error) {
      console.error('Failed to refresh profile:', error);
    }
  };

  const handleJoinSchoolSuccess = useCallback(async () => {
    await refreshProfile();
    retryNonCritical('tasks');
    retryNonCritical('caps');
    retryNonCritical('news');
  }, [refreshProfile, retryNonCritical]);

  const handleTasksRefresh = useCallback(() => {
    retryNonCritical('tasks');
    void refreshProfile();
  }, [retryNonCritical, refreshProfile]);

  const handleQuestAction = () => {
    if (activeAssignment) {
      const teacherName = activeAssignment.teacher_username || 'your teacher';
      addToast(`Assignment pending from ${teacherName}. Complete it before starting new quests.`, 'warning');
    }
    handleViewChange('quest');
  };

  const handleGrantReward = (
    deltas: { xp?: number; coins?: number; gemstones?: number; ap?: number },
    finalValues?: { xp: number; coins: number; level: number; gemstones: number; xp_status?: XpStatus }
  ) => {
    if (!profile) return;

    // If we have final values from the backend, use them directly for accurate sync
    if (finalValues) {
      let xpGained = 0;
      let coinsGained = 0;
      let gemstonesGained = 0;
      
      setProfile((prevProfile: Profile | null) => {
        if (!prevProfile) return null;
        
        // Calculate the delta for user visibility
        xpGained = finalValues.xp - prevProfile.xp;
        coinsGained = finalValues.coins - prevProfile.coins;
        gemstonesGained = finalValues.gemstones - prevProfile.gemstones;
        
        console.log('[REWARD APPLIED] ✓', {
          xpGained: xpGained > 0 ? `+${xpGained}` : xpGained,
          coinsGained: coinsGained > 0 ? `+${coinsGained}` : coinsGained,
          gemstonesGained: gemstonesGained > 0 ? `+${gemstonesGained}` : gemstonesGained,
          newTotals: { xp: finalValues.xp, coins: finalValues.coins, gemstones: finalValues.gemstones }
        });
        
        return {
          ...prevProfile,
          xp: finalValues.xp,
          coins: finalValues.coins,
          level: finalValues.level,
          gemstones: finalValues.gemstones,
          xp_status: finalValues.xp_status ?? prevProfile.xp_status,
        };
      });
      
      // Show success toast to confirm rewards were saved
      if (xpGained > 0 || coinsGained > 0 || gemstonesGained > 0) {
        const rewardParts: string[] = [];
        if (xpGained > 0) rewardParts.push(`+${xpGained} XP`);
        if (coinsGained > 0) rewardParts.push(`+${coinsGained} coins`);
        if (gemstonesGained > 0) rewardParts.push(`+${gemstonesGained} gems`);
        addToast(`✓ Rewards saved: ${rewardParts.join(', ')}`, 'success');
      } else if (xpGained === 0 && coinsGained === 0 && gemstonesGained === 0) {
        // Check if this is because of duplicate answer
        const isDuplicate = deltas.xp === 0 && deltas.coins === 0;
        if (isDuplicate) {
          addToast('⚠️ Already answered - You already earned rewards for this question', 'warning');
        }
      }
      
      console.log('[handleGrantReward] Profile synced with backend values:', finalValues);
      refreshProfile();
      return; // No need for verification when we have exact values
    }

    // Fallback: Optimistic update for smooth UI feedback (used for AP and other non-quest rewards)
    setProfile((prevProfile: Profile | null) => {
      if (!prevProfile) return null;

      const nextAP = prevProfile.ap_now + (deltas.ap || 0);

      return {
        ...prevProfile,
        ap_now: Math.min(prevProfile.ap_max, Math.max(0, nextAP)),
      };
    });

    // Verify rewards were actually saved to database by refreshing after a short delay
    // This helps catch silent failures in the reward persistence
    if ((deltas.xp || 0) + (deltas.coins || 0) + (deltas.gemstones || 0) > 0) {
      setTimeout(async () => {
        try {
          const currentProfile = await GameService.whoami();
          // Sync local profile with database values to ensure consistency
          setProfile(currentProfile);
          console.log('[REWARD VERIFICATION] Profile synced with database:', {
            xp: currentProfile.xp,
            coins: currentProfile.coins
          });
        } catch (error) {
          console.error('[REWARD VERIFICATION] Failed to verify rewards:', error);
          // On verification failure, try to refresh profile to get accurate data
          try {
            await refreshProfile();
          } catch (refreshError) {
            console.error('[REWARD VERIFICATION] Failed to refresh profile:', refreshError);
          }
        }
      }, 2000); // Wait 2 seconds for DB to settle
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


  if (sessionMissing) {
    return null;
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
              startCriticalBoot();
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
              startCriticalBoot();
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
              startCriticalBoot();
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

  const isStudentRole = profile?.role === 'student' || !profile?.role;

  const renderAssignmentSection = () => {
    if (!profile) {
      return <SectionPlaceholder title="Assignment" lines={3} />;
    }
    if (profile.role !== 'student') {
      return null;
    }

    if (nonCriticalErrors.assignment) {
      return (
        <SectionError
          title="Assignment"
          message={nonCriticalErrors.assignment}
          onRetry={() => retryNonCritical('assignment')}
        />
      );
    }

    if (!activeAssignment && (nonCriticalStatus.assignment === 'loading' || criticalLoading)) {
      return <SectionPlaceholder title="Assignment" lines={3} />;
    }

    if (!activeAssignment) {
      return (
        <div className="card-glass p-5">
          <h3 className="font-heading text-lg text-cyan-200 mb-2">Assignment</h3>
          <p className="text-sm text-gray-300">No active assignments right now.</p>
        </div>
      );
    }

    return (
      <div className="card-glass p-5">
        <h3 className="font-heading text-lg text-cyan-200 mb-2">Assignment</h3>
        <p className="text-sm text-gray-100 font-semibold">{activeAssignment.title || 'New assignment'}</p>
        <div className="mt-2 text-xs text-gray-300 space-y-1">
          <p>Teacher: {activeAssignment.teacher_username || 'Your teacher'}</p>
          <p>Subject: {activeAssignment.subject_name || 'General'}</p>
          <p>Due: {activeAssignment.due_at ? new Date(activeAssignment.due_at).toLocaleString() : 'No deadline'}</p>
        </div>
      </div>
    );
  };

  const renderCapsSection = () => {
    if (nonCriticalErrors.caps) {
      return (
        <SectionError
          title="Caps"
          message={nonCriticalErrors.caps}
          onRetry={() => retryNonCritical('caps')}
        />
      );
    }

    if (!caps && (nonCriticalStatus.caps === 'loading' || criticalLoading)) {
      return <SectionPlaceholder title="Caps" lines={4} />;
    }

    if (!caps) {
      return (
        <div className="card-glass p-5">
          <h3 className="font-heading text-lg text-cyan-200 mb-2">Caps</h3>
          <p className="text-sm text-gray-300">Caps data is unavailable.</p>
        </div>
      );
    }

    return <CapTracker caps={caps} />;
  };

  const renderTasksSection = () => {
    if (nonCriticalErrors.tasks) {
      return (
        <SectionError
          title="Tasks"
          message={nonCriticalErrors.tasks}
          onRetry={() => retryNonCritical('tasks')}
        />
      );
    }

    if (!tasks.length && (nonCriticalStatus.tasks === 'loading' || criticalLoading)) {
      return <SectionPlaceholder title="Tasks" lines={5} />;
    }

    if (!tasks.length) {
      return (
        <div className="card-glass p-5">
          <h3 className="font-heading text-lg text-cyan-200 mb-2">Tasks</h3>
          <p className="text-sm text-gray-300">No tasks available right now.</p>
        </div>
      );
    }

    return <TaskList tasks={tasks} onTasksUpdate={handleTasksRefresh} />;
  };

  const renderNewsSection = () => {
    if (nonCriticalErrors.news) {
      return (
        <SectionError
          title="News"
          message={nonCriticalErrors.news}
          onRetry={() => retryNonCritical('news')}
        />
      );
    }

    if (!news.length && (nonCriticalStatus.news === 'loading' || criticalLoading)) {
      return <SectionPlaceholder title="News" lines={6} />;
    }

    if (!news.length) {
      return (
        <div className="card-glass p-5">
          <h3 className="font-heading text-lg text-cyan-200 mb-2">News</h3>
          <p className="text-sm text-gray-300">No news yet. Check back soon.</p>
        </div>
      );
    }

    return <NewsFeed news={news} />;
  };

  const renderProfileSlot = () => {
    if (profile) {
      return <PlayerProfileCard profile={profile} />;
    }
    return (
      <div className="card-glass p-5 flex items-center gap-4">
        <div className="h-14 w-14 rounded-full skeleton-bone bg-white/10 shrink-0" />
        <div className="flex-1 space-y-2.5">
          <SkeletonBlock className="h-5 w-28" />
          <SkeletonBlock className="h-3.5 w-36" />
          <SkeletonBlock className="h-2.5 w-20" />
        </div>
      </div>
    );
  };

  const renderView = () => {
    // Phase 1: No role known yet → "Who are you?" text animation
    if (criticalLoading && !peekedRole && !profile) {
      return <WhoAreYou />;
    }

    // Phase 2: Role known but profile not loaded → role-specific skeleton
    if (criticalLoading && !profile && peekedRole) {
      return <SkeletonDashboard role={peekedRole} />;
    }

    // Block unverified users (except for IELTS-only users)
    if (emailVerified === false && profile && profile.school_name?.trim().toLowerCase() !== IELTS_ONLY_SCHOOL_NAME.toLowerCase()) {
      return <EmailVerificationGate />;
    }

    if (isAdminMode) {
      if (!profile) {
        return <SkeletonDashboard role="admin" />;
      }
      return renderLazy(<AdminPortal profile={profile} onComplete={handleViewComplete} addToast={addToast} />);
    }
    const resolvedView = profile ? view : 'dashboard';
    switch(resolvedView) {
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
                onNavigateToInventory={() => handleViewChange('inventory')}
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
                onNavigateToShop={() => handleViewChange('shop')}
                onProfileUpdate={setProfile}
              />
            );
        case 'leaderboard':
            return renderLazy(
              <LeaderboardView
                onComplete={handleViewComplete}
                currentUserId={profile.id}
                schoolId={profile.school_id}
              />
            );
        case 'achievements':
            return renderLazy(<AchievementView onComplete={handleViewComplete} addToast={addToast} />);
        case 'raids':
            return renderLazy(<RaidView profile={profile} onComplete={handleViewComplete} addToast={addToast} />);
        case 'raid_admin':
            return renderLazy(<RaidAdminView profile={profile} onComplete={handleViewComplete} addToast={addToast} />);
        case 'teacher':
            return renderLazy(
              <TeacherPortal
                profile={profile}
                onComplete={handleViewComplete}
                onLogout={onLogout}
                onLockdown={() => handleViewChange('lockdown')}
                isSchoolAdmin={isUserSchoolAdmin}
                onOpenSchoolAdmin={isUserSchoolAdmin && hasSchool ? () => handleViewChange('school_admin') : undefined}
                onOpenAdmissions={isUserSchoolAdmin && hasSchool ? () => handleViewChange('admissions') : undefined}
              />
            );
        case 'admin':
            return isAdminMode
              ? renderLazy(<AdminPortal profile={profile} onComplete={handleViewComplete} addToast={addToast} />)
              : null;
        case 'tournament':
            return renderLazy(<TournamentHub profile={profile} onClose={handleViewComplete} addToast={addToast} />);
        case 'tournament_admin':
            return renderLazy(<TournamentAdminDashboard profile={profile} onClose={handleViewComplete} addToast={addToast} />);
        case 'phase1_play':
            return renderLazy(
              <Phase1PlayView
                profile={profile}
                onExit={() => handleViewChange('dashboard')}
                onProfileUpdate={(updatedProfile) => setProfile(updatedProfile)}
                addToast={addToast}
              />
            );
        case 'phase1_leaderboard':
            return renderLazy(
              <Phase1LeaderboardView
                profile={profile}
                onExit={() => handleViewChange('dashboard')}
                addToast={addToast}
              />
            );
        case 'phase1_admin':
            return renderLazy(
              <Phase1AdminDashboard
                profile={profile}
                onExit={() => handleViewChange('dashboard')}
                addToast={addToast}
              />
            );
        case 'ielts':
            return renderLazy(
              <div className="relative">
                  {!isIeltsOnlyUser && (
                    <button
                        onClick={() => handleViewChange('dashboard')}
                        className="mb-4 px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors flex items-center gap-2"
                    >
                        ← Back to Dashboard
                    </button>
                  )}
                  <Suspense fallback={null}><IeltsHome /></Suspense>
              </div>
            );
        case 'lockdown':
          return renderLazy(
            <ClanTerritoryManager
              onExit={() => handleViewChange('dashboard')}
              isTeacher={profile?.role === 'teacher'}
              playerName={profile?.username || 'Agent'}
              clanId={profile?.clan_id}
              clanName={profile?.clan_name}
              onRefreshProfile={startCriticalBoot}
              onGoToClan={() => handleViewChange('clan')}
            />
          );
        case 'cambridge':
          return renderLazy(
            <CambridgeTestsHub
              profile={profile}
              onExit={() => handleViewChange('dashboard')}
            />
          );
        case 'school_admin':
          return renderLazy(
            <SchoolAdminPortal
              onComplete={handleViewComplete}
              addToast={addToast}
            />
          );
        case 'admissions':
          return renderLazy(
            <AdmissionHub
              onComplete={handleViewComplete}
              addToast={addToast}
            />
          );
        case 'dashboard':
        default:
            // Teacher goes directly to TeacherPortal - unified experience
            if (profile?.role === 'teacher') {
                return renderLazy(
                    <TeacherPortal
                        profile={profile}
                        onComplete={handleViewComplete}
                        onLogout={onLogout}
                        onLockdown={() => handleViewChange('lockdown')}
                        isSchoolAdmin={isUserSchoolAdmin}
                        onOpenSchoolAdmin={isUserSchoolAdmin && hasSchool ? () => handleViewChange('school_admin') : undefined}
                        onOpenAdmissions={isUserSchoolAdmin && hasSchool ? () => handleViewChange('admissions') : undefined}
                    />
                );
            }
            
            // Student Dashboard - full gameplay experience
            const pendingTasks = tasks.filter((task) => !task.claimed && task.progress < task.target).length;
            const completedTasks = tasks.filter((task) => task.progress >= task.target).length;
            const studyProgress = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0;
            return (
              <main className="mt-6 space-y-6">

                <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                  {/* Left Column */}
                  <div className="space-y-6 lg:col-span-4 xl:col-span-3">
                    {renderProfileSlot()}
                  </div>

                  {/* Middle Column */}
                  <div className="space-y-6 lg:col-span-5 xl:col-span-6">
                    {profile ? (
                      <MainActions
                        onStartQuest={handleQuestAction}
                        onStartPvp={() => handleViewChange('pvp')}
                        onOpenRaid={!isStudent ? () => handleViewChange('raids') : undefined}
                        onVisitShop={() => handleViewChange('shop')}
                        onGoToClan={hasSchool ? () => handleViewChange('clan') : undefined}
                        onVisitInventory={() => handleViewChange('inventory')}
                        onViewLeaderboard={hasSchool ? () => handleViewChange('leaderboard') : undefined}
                        onViewAchievements={() => handleViewChange('achievements')}
                        onOpenRaidAdmin={isAdminUser ? () => handleViewChange('raid_admin') : undefined}
                        onOpenTournament={() => handleViewChange('tournament')}
                        onOpenAdminPortal={isAdminUser ? () => handleViewChange('admin') : undefined}
                        onOpenSchoolAdmin={isUserSchoolAdmin && hasSchool ? () => handleViewChange('school_admin') : undefined}
                        onOpenAdmissions={isUserSchoolAdmin && hasSchool ? () => handleViewChange('admissions') : undefined}
                        onOpenTournamentAdmin={isAdminUser ? () => handleViewChange('tournament_admin') : undefined}
                        onOpenCompetitionPlay={!isStudent && profile?.grade && !profile?.is_banned && hasSchool ? () => handleViewChange('phase1_play') : undefined}
                        onOpenCompetitionLeaderboard={hasSchool ? () => handleViewChange('phase1_leaderboard') : undefined}
                        onOpenCompetitionAdmin={profile?.is_admin && hasSchool ? () => handleViewChange('phase1_admin') : undefined}
                        onOpenIeltsPrep={() => {
                          window.location.href = '/ielts';
                        }}
                        onOpenCambridgeTests={() => handleViewChange('cambridge')}
                        onOpenLockdown={() => handleViewChange('lockdown')}
                        onJoinSchool={undefined}
                        profile={profile}
                        hasPendingAssignment={Boolean(activeAssignment)}
                        clanBadgeCount={pendingClanRequests}
                        schoolName={profile?.school_name}
                        schoolLogoUrl={profile?.school_logo_url}
                        isPro={isProUser}
                        isPilot={isPilotPlan}
                        onUpgrade={(featureLabel) => {
                          setUpgradeFeatureLabel(featureLabel);
                          setShowUpgradeModal(true);
                        }}
                      />
                    ) : (
                      <SectionPlaceholder title="Mission Console" lines={4} />
                    )}
                    {/* Join School Card - replaces the annoying banner */}
                    {profile && !hasSchool && (
                      <JoinSchoolCard onJoined={handleJoinSchoolSuccess} />
                    )}
                    {(!profile || isStudentRole) && renderTasksSection()}
                  </div>

                  {/* Right Column */}
                  <div className="space-y-6 lg:col-span-3 xl:col-span-3">
                    {(!profile || isStudentRole) && renderAssignmentSection()}
                    {(!profile || isStudentRole) && renderCapsSection()}
                    {renderNewsSection()}
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
      {attackAlert && isPlayerMode && !isTeacherRole && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center">
          <div className="absolute inset-0 bg-red-700/40 backdrop-blur-sm transition-opacity duration-300 animate-pulse" />
          <div className="pointer-events-none relative rounded-xl border border-red-500/80 bg-red-950/70 px-6 py-4 text-center shadow-2xl">
            <div className="text-5xl mb-2">🚨</div>
            <p className="font-heading text-xl text-red-200 tracking-wide uppercase">Incoming Attack Detected</p>
            <p className="text-sm text-red-100/80 mt-1">Hold tight while defenses deploy…</p>
          </div>
        </div>
      )}
      {showAcademicSetup && isPlayerMode && !isTeacherRole && (
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
        {!isCambridgeView && !isFullScreenView && isPlayerMode && (
          profile ? (
            <Header
              profile={profile}
              isAdminMode={isAdminMode}
              onLogout={onLogout}
              currentView={view}
              onBackToDashboard={() => handleViewChange('dashboard')}
              onShowHelp={() => setShowHelp(true)}
              onNavigate={(targetView) => handleViewChange(targetView)}
              liteMode={isLiteMode}
              onToggleLiteMode={toggleLightMode}
              onProfileAvatarChange={(avatarUrl) => setProfile((p) => p ? { ...p, avatar_url: avatarUrl } : p)}
              onProfileRefresh={refreshProfile}
              isSchoolAdmin={isUserSchoolAdmin}
              onOpenSchoolAdmin={() => handleViewChange('school_admin')}
            />
          ) : (
            <HeaderShell />
          )
        )}

        {/* Offline Banner */}
        {!isOnline && (
          <div className="fixed top-20 left-0 right-0 z-50 flex justify-center">
            <div className="bg-red-500/90 text-white px-6 py-3 rounded-lg shadow-lg backdrop-blur-sm">
              <p className="font-semibold">📡 No internet connection - Some features may not work</p>
            </div>
          </div>
        )}

        {activeAnnouncement && isPlayerMode && (
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
          <Suspense fallback={null}>
          <TutorialModal
            profile={profile}
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
          </Suspense>
        )}

        {/* Help Modal */}
        {showHelp && (
          <Suspense fallback={null}>
          <HelpModal onClose={() => setShowHelp(false)} />
          </Suspense>
        )}

        {/* Upgrade Modal */}
        <UpgradeModal
          isOpen={showUpgradeModal}
          onClose={() => {
            setShowUpgradeModal(false);
            setUpgradeFeatureLabel(undefined);
          }}
          featureLabel={upgradeFeatureLabel}
          onPilotStarted={() => {
            invalidateTierCache();
            fetchEffectiveTier().then(tier => setAccountTier(tier));
            setShowUpgradeModal(false);
            setUpgradeFeatureLabel(undefined);
            addToast('🚀 30-day pilot activated! All features unlocked.', 'success');
          }}
        />

        {/* Toast Notifications */}
        <ToastContainer />
      </div>
    </div>
  );
};

export default App;
