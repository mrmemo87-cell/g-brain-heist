import { useLanguage } from './src/contexts/LanguageContext';
import React, { Suspense, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Profile, Task, SessionStatus, Caps, NewsEvent, ToastMessage, Announcement, SchoolGrade, StudentAssignmentTask, XpStatus, DailyStreakRewardReceipt } from './types';
import * as GameService from './services/gameService';
import { supabase } from './services/supabaseClient';
import Header from './components/Header';
import WhoAreYou from './components/WhoAreYou';
import SkeletonDashboard from './components/SkeletonDashboard';
import RecognitionText from './components/RecognitionText';
import { useLightMode } from './src/contexts/LightModeContext';
import PlayerProfileCard from './components/PlayerProfileCard';
import TaskList from './components/TaskList';
import MainActions from './components/MainActions';
import StudentDashboardNavigation, { StudentDashboardBottomNavigation, type StudentDashboardDestination } from './components/StudentDashboardNavigation';
import JoinSchoolCard from './components/JoinSchoolCard';
import NewsFeed from './components/NewsFeed';
import CapTracker from './components/CapTracker';
import Toast from './components/Toast';
import LevelUpModal from './components/LevelUpModal';
import StreakRewardModal from './components/StreakRewardModal';
import { ToastContainer } from './components/ToastNotification';
import BackButton from './components/BackButton';
import { isSuperadmin } from './services/adminService';
import { getMySchoolCapabilities, isSchoolAdmin, type SchoolCapabilities } from './services/schoolAdminService';
import SchoolWorkspaceChooser from './components/SchoolWorkspaceChooser';
import { audioService } from './services/audioService';
import { aiHostService } from './services/aiHostService';
import { fetchNextAnnouncement, markAnnouncementSeen } from './services/competitionService';
import { notificationService, type Notification } from './services/notificationService';
import { BAN_MESSAGE, isBannedFlag, storeBanMessage } from './services/banMessage';
import { isEmailVerified } from './services/emailVerification';
import EmailVerificationGate from './components/EmailVerificationGate';
import UpgradeModal from './components/UpgradeModal';
import DashboardTourOverlay from './components/onboarding/DashboardTourOverlay';
import { fetchEffectiveTier, isPro as isProTier, invalidateTierCache, fetchSchoolPlanDetails, type AccountTier } from './services/tierService';
import { FEATURE_KEYS, getEntitlements, type EntitlementSet, type FeatureKey, type StudentProgrammeKey } from './services/entitlementService';
import { listMyPendingProgrammeAccessRequests, requestProgrammeAccess } from './services/programmeAccessRequestService';
import { getGuardianChildren } from './services/guardianService';
import { enrollInApprovedSchoolClass, listMySchoolClasses, type ApprovedSignupClass } from './services/authService';
import { assignmentCategoryBadgeStyle, getAssignmentCategoryMeta } from './src/lib/assignmentCategory';
import ProgramIdentityBanner from './src/components/ProgramIdentityBanner';
import { PROGRAM_ARTWORK } from './src/lib/programArtwork';

// Lazy-loaded: only fetched when the user actually opens these views/modals
// Uses lazyRetry to auto-recover from stale deployment chunk errors
import { lazyRetry } from './src/utils/lazyRetry';
import { getOnboardingFlags } from './src/features/onboarding/featureFlags';
import { logLegacyTutorialSuppressionDebug } from './src/features/onboarding/ftueTakeover';
const IeltsHome = lazyRetry(() => import('./src/pages/ielts/IeltsHome'), 'IeltsHome');
const importWritingHub = () => import('./src/pages/writing/WritingHub');
const preloadWritingHub = (): void => {
  void importWritingHub().catch(() => {
    // Speculative preload should never surface an unhandled rejection.
  });
};
const WritingHub = lazyRetry(() => importWritingHub(), 'WritingHub');
const HelpModal = lazyRetry(() => import('./components/HelpModal'), 'HelpModal');
const TutorialModal = lazyRetry(() => import('./components/TutorialModal'), 'TutorialModal');

const QuestView = lazyRetry(() => import('./components/QuestView'), 'QuestView');
const PvPView = lazyRetry(() => import('./components/PvPView'), 'PvPView');
const ShopView = lazyRetry(() => import('./components/ShopView'), 'ShopView');
const ClanView = lazyRetry(() => import('./components/ClanView'), 'ClanView');
const RivalryView = lazyRetry(() => import('./components/RivalryView'), 'RivalryView');
const InventoryView = lazyRetry(() => import('./components/InventoryView'), 'InventoryView');
const LeaderboardView = lazyRetry(() => import('./components/LeaderboardView'), 'LeaderboardView');
const AchievementView = lazyRetry(() => import('./components/AchievementView'), 'AchievementView');
const TeacherPortal = lazyRetry(() => import('./components/TeacherPortalShell'), 'TeacherPortalShell');
const AdminPortal = lazyRetry(() => import('./components/AdminPortal'), 'AdminPortal');
const TournamentHub = lazyRetry(() => import('./components/TournamentHub'), 'TournamentHub');
const TournamentAdminDashboard = lazyRetry(() => import('./components/TournamentAdminDashboard'), 'TournamentAdminDashboard');
const Phase1PlayView = lazyRetry(() => import('./components/phase1/Phase1PlayView'), 'Phase1PlayView');
const Phase1LeaderboardView = lazyRetry(() => import('./components/phase1/Phase1LeaderboardView'), 'Phase1LeaderboardView');
const Phase1AdminDashboard = lazyRetry(() => import('./components/phase1/Phase1AdminDashboard'), 'Phase1AdminDashboard');
const AnnouncementBanner = lazyRetry(() => import('./components/phase1/AnnouncementBanner'), 'AnnouncementBanner');
const RaidView = lazyRetry(() => import('./src/features/raids/RaidView'), 'RaidView');
const RaidAdminView = lazyRetry(() => import('./src/features/raids/RaidAdminView'), 'RaidAdminView');
const ClanTerritoryManager = lazyRetry(() => import('./src/features/clanTerritory/ClanTerritoryManager'), 'ClanTerritoryManager');
const LockdownManager = lazyRetry(() => import('./src/features/lockdown/LockdownManager'), 'LockdownManager');
const CambridgeTestsHub = lazyRetry(() => import('./components/CambridgeTestsHub'), 'CambridgeTestsHub');
const SchoolAdminPortal = lazyRetry(() => import('./components/SchoolAdminPortal'), 'SchoolAdminPortal');
const SchoolHeadPortal = lazyRetry(() => import('./components/SchoolHeadPortal'), 'SchoolHeadPortal');
const ParentPortal = lazyRetry(() => import('./components/guardian/ParentPortal'), 'ParentPortal');
const StudentAcademicProfile = lazyRetry(() => import('./components/student-progress/StudentAcademicProfile'), 'StudentAcademicProfile');

interface StudentProgrammeCardProps {
  programme: StudentProgrammeKey;
  eyebrow: string;
  title: string;
  description: string;
  locked: boolean;
  lockMessage: string;
  openLabel: string;
  onOpen: () => void;
  onPreload?: () => void;
  requestState?: 'idle' | 'sending' | 'sent';
  onRequest?: () => void;
}

const StudentProgrammeCard: React.FC<StudentProgrammeCardProps> = ({
  programme,
  eyebrow,
  title,
  description,
  locked,
  lockMessage,
  openLabel,
  onOpen,
  onPreload,
  requestState = 'idle',
  onRequest,
}) => {
  const lockMessageId = `${programme}-programme-lock-message`;
  return (
    <article className={`student-feed-card student-learning-card ${locked ? 'is-locked' : ''}`}>
      <div
        className="student-learning-card__icon"
        aria-hidden="true"
        style={{
          width: 'clamp(4.75rem, 14vw, 6rem)',
          height: 'clamp(4.75rem, 14vw, 6rem)',
          overflow: 'hidden',
          padding: 0,
        }}
      >
        <img
          src={PROGRAM_ARTWORK[programme].src}
          alt=""
          loading="lazy"
          decoding="async"
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: PROGRAM_ARTWORK[programme].objectPosition }}
        />
      </div>
      <div className="student-learning-card__copy">
        <span className="student-learning-card__eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
        {locked ? <p id={lockMessageId} className="mt-2 text-xs font-semibold text-slate-300">🔒 {lockMessage}</p> : null}
      </div>
      <button
        type="button"
        disabled={locked && (requestState === 'sending' || requestState === 'sent')}
        aria-describedby={locked ? lockMessageId : undefined}
        onMouseEnter={locked ? undefined : onPreload}
        onFocus={locked ? undefined : onPreload}
        onClick={locked ? onRequest : onOpen}
        className="student-primary-button disabled:cursor-not-allowed disabled:bg-slate-500 disabled:text-slate-200"
      >
        {locked
          ? requestState === 'sending'
            ? 'Sending request…'
            : requestState === 'sent'
              ? 'Request sent to the school admin'
              : 'Send a request to the school admin'
          : <>{openLabel} <span aria-hidden>→</span></>}
      </button>
    </article>
  );
};

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
type AppView = 'workspace_chooser' | 'dashboard' | 'quest' | 'pvp' | 'shop' | 'clan' | 'rivalry' | 'inventory' | 'leaderboard' | 'achievements' | 'teacher' | 'admin' | 'tournament' | 'tournament_admin' | 'phase1_play' | 'phase1_leaderboard' | 'phase1_admin' | 'raids' | 'raid_admin' | 'ielts' | 'writing' | 'lockdown' | 'cambridge' | 'school_admin' | 'school_head' | 'parent';
type AccountWorkspace = Extract<AppView, 'school_head' | 'school_admin' | 'teacher' | 'parent'>;

const resolveAccountWorkspace = (
  profileRole: Profile['role'],
  capabilities: SchoolCapabilities | null,
  hasParentWorkspace: boolean,
): AppView => {
  const available: AccountWorkspace[] = [];
  if (capabilities?.is_owner) available.push('school_head');
  if (capabilities?.can_administer) available.push('school_admin');
  if ((profileRole === 'teacher' && !capabilities?.can_administer)
    || Boolean(capabilities?.can_teach && capabilities.has_active_teacher_allocation)) available.push('teacher');
  if (hasParentWorkspace) available.push('parent');

  const requested = new URLSearchParams(window.location.search).get('view') as AccountWorkspace | null;
  if (requested && available.includes(requested)) return requested;
  const schoolId = capabilities?.school_id;
  const preferred = schoolId ? localStorage.getItem(`school_workspace:${schoolId}`) as AccountWorkspace | null : null;
  if (preferred && available.includes(preferred)) return preferred;
  if (available.length > 1) return 'workspace_chooser';
  return available[0] ?? (profileRole === 'school_admin' ? 'school_admin' : 'teacher');
};

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

const WritingHubRouteFallback: React.FC = () => (
  <div className="space-y-3">
    <div className="rounded-lg border border-blue-400/40 bg-slate-900/70 p-4 text-blue-100">
      Opening Writing Hub…
    </div>
    <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
      <div className="h-4 w-40 animate-pulse rounded bg-slate-700/70" />
      <div className="mt-3 h-3 w-full animate-pulse rounded bg-slate-800/80" />
      <div className="mt-2 h-3 w-11/12 animate-pulse rounded bg-slate-800/80" />
      <div className="mt-2 h-3 w-9/12 animate-pulse rounded bg-slate-800/80" />
    </div>
  </div>
);

const App: React.FC<AppProps> = ({ onLogout }) => {
  const { t, language, direction } = useLanguage();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [appMode, setAppMode] = useState<'pending' | 'player' | 'admin'>('pending');
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [tasks, setTasks] = useState<Task[]>(() => readCache<Task[]>(CACHE_KEYS.tasks) ?? []);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>(DEFAULT_SESSION_STATUS);
  const [caps, setCaps] = useState<Caps | null>(() => readCache<Caps>(CACHE_KEYS.caps));
  const [news, setNews] = useState<NewsEvent[]>(() => readCache<NewsEvent[]>(CACHE_KEYS.news) ?? []);
  const [activeAssignment, setActiveAssignment] = useState<StudentAssignmentTask | null>(null);
  const [pendingAssignments, setPendingAssignments] = useState<StudentAssignmentTask[]>([]);
  const [criticalLoading, setCriticalLoading] = useState(true);
  const [view, setView] = useState<AppView>('dashboard');
  const [studentDashboardTab, setStudentDashboardTab] = useState<StudentDashboardDestination>('home');
  const [studentLearningView, setStudentLearningView] = useState<'catalog' | 'academic-profile'>('catalog');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [showLevelUpModal, setShowLevelUpModal] = useState(false);
  const [levelUpData, setLevelUpData] = useState<{ newLevel: number; rewards: any } | null>(null);
  const [previousLevel, setPreviousLevel] = useState<number | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [helpInitialSection, setHelpInitialSection] = useState<'overview' | 'streak'>('overview');
  const [streakRewardData, setStreakRewardData] = useState<DailyStreakRewardReceipt | null>(null);
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
  const [pendingGrade, setPendingGrade] = useState<SchoolGrade | null>(null);
  const [selectedAcademicClassId, setSelectedAcademicClassId] = useState('');
  const [schoolAcademicClasses, setSchoolAcademicClasses] = useState<ApprovedSignupClass[]>([]);
  const [loadingAcademicClasses, setLoadingAcademicClasses] = useState(false);
  const [savingAcademic, setSavingAcademic] = useState(false);
  const [academicError, setAcademicError] = useState<string | null>(null);
  const [attackAlert, setAttackAlert] = useState(false);
  const [pvpFocusTargetUserId, setPvpFocusTargetUserId] = useState<string | null>(null);
  const [pendingQuestMissionId, setPendingQuestMissionId] = useState<string | null>(null);
  const attackAlertTimeoutRef = useRef<number | null>(null);
  const lastRewardedLevelRef = useRef<number | null>(null);
  const shownStreakRewardRef = useRef<string | null>(null);
  const cachedDataLoadedRef = useRef(false);
  const { isLightMode: isLiteMode, toggleLightMode } = useLightMode();
  const [pendingClanRequests, setPendingClanRequests] = useState(0);
  const [unreadClanChatMessages, setUnreadClanChatMessages] = useState(0);
  const [isUserSchoolAdmin, setIsUserSchoolAdmin] = useState(false);
  const [schoolCapabilities, setSchoolCapabilities] = useState<SchoolCapabilities | null>(null);
  const [hasParentWorkspace, setHasParentWorkspace] = useState(false);
  const [sessionMissing, setSessionMissing] = useState(false);
  const [isInteractive, setIsInteractive] = useState(false);
  const [accountTier, setAccountTier] = useState<AccountTier>('free');
  const [effectiveEntitlements, setEffectiveEntitlements] = useState<EntitlementSet | null>(null);
  const [programmeRequestStates, setProgrammeRequestStates] = useState<Record<StudentProgrammeKey, 'idle' | 'sending' | 'sent'>>({
    cambridge: 'idle', ielts: 'idle', writing: 'idle',
  });
  const [isPilotPlan, setIsPilotPlan] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeFeatureLabel, setUpgradeFeatureLabel] = useState<string | undefined>(undefined);
  const [peekedRole, setPeekedRole] = useState<'student' | 'teacher' | 'admin' | null>(null);
  const [peekedUser, setPeekedUser] = useState<{
    username: string; level?: number; coins?: number;
    gems?: number; streak?: number; clanName?: string;
    avatarUrl?: string;
  } | null>(null);
  const [recognitionHold, setRecognitionHold] = useState(true);
  const recognitionTimerRef = useRef<number | null>(null);
  const taskRealtimeRefreshTimerRef = useRef<number | null>(null);
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
  const criticalBootIdRef = useRef(0);
  const nonCriticalAbortRef = useRef<AbortController | null>(null);
  const profileRefreshInFlightRef = useRef<Promise<void> | null>(null);
  const runNonCriticalLoadsRef = useRef<(targets?: NonCriticalKey[]) => void>(() => {});
  const isCambridgeView = view === 'cambridge';
  const isIeltsOnlyUser =
    profile?.school_name?.trim().toLowerCase() === IELTS_ONLY_SCHOOL_NAME.toLowerCase();
  const isPlayerMode = appMode === 'player';
  const hasSchool = Boolean(profile?.school_id);
  const isProUser = isProTier(accountTier);
  const canUsePlanFeature = useCallback((featureKey: FeatureKey, allowIndividual = false) => (
    (!hasSchool && allowIndividual) || effectiveEntitlements?.canUse(featureKey) === true
  ), [effectiveEntitlements, hasSchool]);
  const canUseSchoolModule = useCallback((module: 'cambridge' | 'ielts' | 'writing' | 'admissions') => (
    Boolean(hasSchool && effectiveEntitlements?.modules[module])
  ), [effectiveEntitlements, hasSchool]);
  const schoolProgrammeLockMessage = "You're not selected for this program. Ask your school admin if you need it.";
  const hasActiveTeacherAllocation = Boolean(schoolCapabilities?.has_active_teacher_allocation);
  const canOpenTeacherWorkspace = (profile?.role === 'teacher' && !schoolCapabilities?.can_administer)
    || Boolean(schoolCapabilities?.can_teach && hasActiveTeacherAllocation);
  const isTeacherRole = canOpenTeacherWorkspace;
  const isSchoolAdminRole = isUserSchoolAdmin;
  const isSchoolHeadRole = Boolean(schoolCapabilities?.is_owner && schoolCapabilities.account_type === 'school_head');
  const isFullScreenView = view === 'workspace_chooser' || view === 'school_admin' || view === 'school_head' || view === 'teacher' || view === 'parent' || view === 'admin' || (view === 'dashboard' && isTeacherRole) || (view === 'dashboard' && isSchoolAdminRole);
  const actionableAssignments = useMemo(
    () => pendingAssignments.filter((assignment) => !assignment.is_closed),
    [pendingAssignments],
  );

  useEffect(() => {
    if (!isPlayerMode || !profile?.id || isSchoolAdminRole) return;

    const touchPresence = () => {
      if (document.visibilityState !== 'visible') return;
      void supabase.rpc('rpc_touch_last_seen').then(() => {}, () => {});
    };

    touchPresence();
    const intervalId = setInterval(touchPresence, 60_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') touchPresence();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', touchPresence);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', touchPresence);
    };
  }, [isPlayerMode, profile?.id, isSchoolAdminRole]);

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
        <h3 className="student-section-heading font-heading text-lg">{title}</h3>
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
  const academicGradeOptions = useMemo(() => Array.from(new Set(
    schoolAcademicClasses
      .map((schoolClass) => schoolClass.grade_level?.trim())
      .filter((grade): grade is string => Boolean(grade)),
  )).sort((left, right) => left.localeCompare(right, undefined, { numeric: true })), [schoolAcademicClasses]);
  const academicClassOptions = useMemo(() => schoolAcademicClasses.filter((schoolClass) => (
    pendingGrade !== null && String(schoolClass.grade_level) === String(pendingGrade)
  )), [pendingGrade, schoolAcademicClasses]);

  const addToast = useCallback((message: string, type: ToastMessage['type'] = 'info', retryAction?: () => void) => {
    const id = Date.now();
    setToasts((prevToasts: ToastMessage[]) => {
      const duplicateToast = prevToasts.find((toast) => toast.message === message && toast.type === type);
      if (duplicateToast) {
        return prevToasts.map((toast) =>
          toast.id === duplicateToast.id ? { ...toast, id, retryAction: retryAction ?? toast.retryAction } : toast,
        );
      }
      return [...prevToasts, { id, message, type, retryAction }];
    });
  }, []);

  useEffect(() => {
    if (!profile?.id) { setEffectiveEntitlements(null); return; }
    let cancelled = false;
    const requestsPromise = profile.role === 'student' && profile.school_id
      ? listMyPendingProgrammeAccessRequests().catch(() => [] as StudentProgrammeKey[])
      : Promise.resolve([] as StudentProgrammeKey[]);
    void Promise.all([getEntitlements(true), requestsPromise]).then(([entitlements, requestedProgrammes]) => {
      if (cancelled) return;
      setEffectiveEntitlements(entitlements);
      const requested = new Set(requestedProgrammes);
      setProgrammeRequestStates({
        cambridge: requested.has('cambridge') ? 'sent' : 'idle',
        ielts: requested.has('ielts') ? 'sent' : 'idle',
        writing: requested.has('writing') ? 'sent' : 'idle',
      });
    }).catch(() => {
      if (!cancelled) setEffectiveEntitlements(null);
    });
    return () => { cancelled = true; };
  }, [profile?.id]);

  useEffect(() => {
    if (!caps || !isPlayerMode) return;

    const now = new Date();
    const todayKey = now.toISOString().split('T')[0];
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weeklyKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;

    const maybeNotify = (storageKey: string, condition: boolean, message: string) => {
      if (!condition) return;
      const alreadyNotified = localStorage.getItem(storageKey) === '1';
      if (alreadyNotified) return;
      localStorage.setItem(storageKey, '1');
      addToast(message, 'warning');
    };

    maybeNotify(
      `cap_notice_daily_xp_${todayKey}`,
      caps.xp_daily_remaining <= 0,
      'Daily XP cap reached. Additional XP rewards today will not count.'
    );
    maybeNotify(
      `cap_notice_daily_coins_${todayKey}`,
      caps.coins_daily_remaining <= 0,
      'Daily coin cap reached. Additional coin rewards today will not count.'
    );
    maybeNotify(
      `cap_notice_weekly_xp_${weeklyKey}`,
      caps.xp_weekly_remaining <= 0,
      'Weekly XP cap reached. Additional XP rewards this week will not count.'
    );
    maybeNotify(
      `cap_notice_weekly_coins_${weeklyKey}`,
      caps.coins_weekly_remaining <= 0,
      'Weekly coin cap reached. Additional coin rewards this week will not count.'
    );
  }, [addToast, caps, isPlayerMode]);

  const handleViewChange = (nextView: AppView) => {
    const gatedModule = nextView === 'cambridge' ? 'cambridge' : nextView === 'writing' ? 'writing' : nextView === 'ielts' ? 'ielts' : null;
    if (gatedModule && hasSchool && !canUseSchoolModule(gatedModule)) {
      addToast(schoolProgrammeLockMessage(gatedModule), 'info');
      return;
    }
    if (schoolCapabilities?.school_id && ['school_admin', 'school_head', 'teacher', 'parent'].includes(nextView)) {
      localStorage.setItem(`school_workspace:${schoolCapabilities.school_id}`, nextView);
    }
    if (nextView !== 'pvp' && pvpFocusTargetUserId) {
      setPvpFocusTargetUserId(null);
    }
    // School admin is a formal account — only allow admin/school views
    if (isSchoolAdminRole) {
      const allowedSchoolAdminViews = ['school_admin', 'cambridge', 'ielts'];
      if (isSchoolHeadRole) allowedSchoolAdminViews.push('school_head');
      // Teachers who are also school admins can still access their teacher portal
      if (isTeacherRole) allowedSchoolAdminViews.push('teacher', 'lockdown', 'workspace_chooser');
      if (hasParentWorkspace) allowedSchoolAdminViews.push('parent', 'workspace_chooser');
      // Superadmins can access the admin portal from school admin
      if (isAdminMode) allowedSchoolAdminViews.push('admin');
      if (!allowedSchoolAdminViews.includes(nextView)) {
        addToast(`${isSchoolHeadRole ? 'School Head' : 'School admin'} accounts manage the school — game features are not available.`, 'info');
        setView(isSchoolHeadRole ? 'school_head' : 'school_admin');
        return;
      }
    }
    // Block navigation when profile changes are required (student enforcement)
    const rc = profile?.required_changes;
    if (rc && typeof rc === 'object' && (rc.username || rc.avatar) && !['dashboard', 'parent', 'workspace_chooser'].includes(nextView)) {
      addToast('Please update your profile before accessing other features.', 'info');
      setView('dashboard');
      return;
    }
    if (!hasSchool && ['phase1_play', 'phase1_leaderboard', 'phase1_admin', 'school_admin', 'school_head'].includes(nextView)) {
      addToast('Join a school to access school-based features.', 'info');
      return;
    }
    // Individuals mode: academic features (Cambridge, IELTS) require school membership
    if (!hasSchool && ['cambridge', 'ielts'].includes(nextView)) {
      addToast('Cambridge and IELTS prep are available to school members. Join a school to unlock.', 'info');
      return;
    }
    // Every route uses the same feature keys as the database authority.
    const viewFeatures: Partial<Record<AppView, { key: FeatureKey; allowIndividual?: boolean }>> = {
      pvp: { key: FEATURE_KEYS.PVP_BATTLES, allowIndividual: true },
      shop: { key: FEATURE_KEYS.SHOP, allowIndividual: true },
      clan: { key: FEATURE_KEYS.CLANS, allowIndividual: true },
      rivalry: { key: FEATURE_KEYS.CLANS, allowIndividual: true },
      inventory: { key: FEATURE_KEYS.SHOP, allowIndividual: true },
      leaderboard: { key: FEATURE_KEYS.PVP_BATTLES, allowIndividual: true },
      achievements: { key: FEATURE_KEYS.PVP_BATTLES, allowIndividual: true },
      tournament: { key: FEATURE_KEYS.TOURNAMENTS, allowIndividual: true },
      raids: { key: FEATURE_KEYS.RAIDS, allowIndividual: true },
      cambridge: { key: FEATURE_KEYS.CAMBRIDGE_TESTS },
      ielts: { key: FEATURE_KEYS.IELTS_TESTS },
    };
    const requiredFeature = viewFeatures[nextView];
    if (requiredFeature && !canUsePlanFeature(requiredFeature.key, requiredFeature.allowIndividual)) {
      const labels: Record<string, string> = {
        pvp: 'Launch Attack', shop: 'Shop', clan: 'Clans', inventory: 'Inventory',
        leaderboard: 'Leaderboard', achievements: 'Achievements', tournament: 'Tournaments',
        raids: 'Raids', rivalry: 'Clan Rivalry', cambridge: 'Cambridge Tests', ielts: 'IELTS Prep',
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
    if (isAdminMode && !['admin', 'school_admin', 'school_head', 'parent', 'workspace_chooser'].includes(nextView)) {
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

  const handleNotificationAction = useCallback((notification: Notification) => {
    if (notification.data?.destination === 'programme_seats') {
      const url = new URL(window.location.href);
      url.searchParams.set('view', 'school_admin');
      url.searchParams.set('adminTab', 'billing');
      url.searchParams.delete('headTab');
      window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`);
      setView('school_admin');
      window.requestAnimationFrame(() => window.dispatchEvent(new PopStateEvent('popstate')));
      return;
    }
    if (notification.type === 'school_head_decision') {
      const url = new URL(window.location.href);
      url.searchParams.set('view', 'school_head');
      url.searchParams.set('headTab', 'decisions');
      url.searchParams.delete('adminTab');
      window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`);
      setView('school_head');
      window.requestAnimationFrame(() => window.dispatchEvent(new PopStateEvent('popstate')));
      return;
    }
    if (notification.type !== 'revenge_available') return;

    const targetIdFromData = typeof notification.data?.target_id === 'string'
      ? notification.data.target_id
      : null;

    setPvpFocusTargetUserId(targetIdFromData);
  }, []);

  useEffect(() => {
    const handleProfileAttack = (event: Event) => {
      const detail = (event as CustomEvent<{ targetUserId?: string | null }>).detail;
      setPvpFocusTargetUserId(typeof detail?.targetUserId === 'string' ? detail.targetUserId : null);
      handleViewChange('pvp');
    };

    window.addEventListener('bh:attack-profile', handleProfileAttack);
    return () => window.removeEventListener('bh:attack-profile', handleProfileAttack);
  }, [handleViewChange]);

  const removeToast = (id: number) => {
    setToasts((prevToasts: ToastMessage[]) => prevToasts.filter((toast: ToastMessage) => toast.id !== id));
  };

  const handleAcademicGradeChange = (value: string) => {
    if (!value) {
      setPendingGrade(null);
      setSelectedAcademicClassId('');
      setAcademicError(null);
      return;
    }

    setPendingGrade(value);
    setSelectedAcademicClassId('');
    setAcademicError(null);
  };

  const handleAcademicBatchChange = (value: string) => {
    setSelectedAcademicClassId(value);
    setAcademicError(null);
  };

  const refreshAssignment = async (profileOverride?: Profile | null) => {
    const targetProfile = profileOverride ?? profile;
    const role = targetProfile?.role ?? 'student';

    if (!targetProfile || role === 'teacher' || role === 'admin') {
      setActiveAssignment(null);
      setPendingAssignments([]);
      return;
    }

    try {
      const assignments = await GameService.get_student_pending_assignments();
      setPendingAssignments(assignments);
      setActiveAssignment(assignments.find((assignment) => !assignment.is_closed) ?? null);
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

    if (!selectedAcademicClassId) {
      setAcademicError('Select your class to continue.');
      return;
    }

    setSavingAcademic(true);
    setAcademicError(null);
    try {
      const selectedClass = schoolAcademicClasses.find((schoolClass) => schoolClass.id === selectedAcademicClassId);
      if (!selectedClass) {
        setAcademicError('That class is no longer available. Refresh and choose another class.');
        return;
      }

      const result = await enrollInApprovedSchoolClass(selectedAcademicClassId);
      if (!result.success) {
        console.error('Failed to update grade/class', result.error);
        setAcademicError(result.error || 'Failed to save your class info. Please try again.');
        return;
      }

      setProfile((prevProfile: Profile | null) =>
        prevProfile
          ? { ...prevProfile, grade: selectedClass.grade_level ?? pendingGrade, batch: selectedClass.class_code }
          : prevProfile
      );
      setShowAcademicSetup(false);
      addToast('Class info saved. Welcome agent!', 'success');
    } finally {
      setSavingAcademic(false);
    }
  };

  useEffect(() => {
    if (!isPlayerMode || isTeacherRole || isSchoolAdminRole) {
      return;
    }
    return aiHostService.init();
  }, [isPlayerMode, isTeacherRole, isSchoolAdminRole]);

  useEffect(() => {
    const receipt = profile?.daily_streak_reward;
    if (!receipt?.claimed || (profile?.role ?? 'student') !== 'student') return;

    const receiptKey = `${receipt.reward_date}:${receipt.streak}:${receipt.coins_awarded}`;
    if (shownStreakRewardRef.current === receiptKey) return;

    shownStreakRewardRef.current = receiptKey;
    setStreakRewardData(GameService.consumeDailyStreakReward() ?? receipt);
  }, [profile?.daily_streak_reward, profile?.role]);

  useEffect(() => {
    if (!isPlayerMode || isTeacherRole || isSchoolAdminRole) {
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
    if (!isPlayerMode || !profile?.id || !profile?.clan_id) {
      setUnreadClanChatMessages(0);
      return;
    }

    if (view === 'clan') {
      return;
    }

    const channel = supabase
      .channel(`app-clan-chat-unread-${profile.clan_id}-${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'clan_chat', filter: `clan_id=eq.${profile.clan_id}` },
        (payload) => {
          const row = payload.new as { user_id?: string };
          if (row.user_id === profile.id) return;
          setUnreadClanChatMessages((prev) => prev + 1);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isPlayerMode, profile?.clan_id, profile?.id, view]);

  useEffect(() => {
    if (!isPlayerMode) return;
    if (profile && isIeltsOnlyUser && view !== 'ielts') {
      setView('ielts');
    }
  }, [profile, isIeltsOnlyUser, view, isPlayerMode]);

  useEffect(() => {
    let cancelled = false;
    if (!isPlayerMode) return undefined;
    if (!profile || profile.role === 'teacher' || profile.role === 'admin' || profile.role === 'school_admin') {
      setShowAcademicSetup(false);
      setSchoolAcademicClasses([]);
      return undefined;
    }

    // Individuals (no school) skip the academic setup — grade/batch are school concepts
    if (!profile.school_id) {
      setShowAcademicSetup(false);
      setSchoolAcademicClasses([]);
      return undefined;
    }

    const needsGrade = profile.grade === null;
    const needsBatch = !profile.batch;

    if (needsGrade || needsBatch) {
      setPendingGrade(profile.grade);
      setSelectedAcademicClassId('');
      setShowAcademicSetup(true);
      setLoadingAcademicClasses(true);
      setAcademicError(null);
      void listMySchoolClasses().then((result) => {
        if (cancelled) return;
        setLoadingAcademicClasses(false);
        if (!result.success) {
          setSchoolAcademicClasses([]);
          setAcademicError(result.error || 'Your school classes could not be loaded. Please try again.');
          return;
        }
        setSchoolAcademicClasses(result.classes);
        if (!result.classes.length) {
          setAcademicError('Your school has no active classes yet. Ask your school administrator to set one up.');
          return;
        }
        const currentClass = profile.batch
          ? result.classes.find((schoolClass) => schoolClass.class_code === profile.batch)
          : undefined;
        if (currentClass) {
          setPendingGrade(currentClass.grade_level);
          setSelectedAcademicClassId(currentClass.id);
        }
      }).catch(() => {
        if (cancelled) return;
        setLoadingAcademicClasses(false);
        setSchoolAcademicClasses([]);
        setAcademicError('Your school classes could not be loaded. Please try again.');
      });
    } else {
      setShowAcademicSetup(false);
    }
    return () => { cancelled = true; };
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
    const bootId = ++criticalBootIdRef.current;
    criticalAbortRef.current?.abort();
    const criticalController = new AbortController();
    criticalAbortRef.current = criticalController;
    nonCriticalAbortRef.current?.abort();
    if (import.meta.env.DEV) {
      console.info('[auth-flow] auth refresh start', { bootId, pathname: window.location.pathname });
      console.info('[auth-flow] loading state transition', { target: 'criticalLoading', next: true, reason: 'critical-boot:start' });
    }
    const bootWatchdog = window.setTimeout(() => {
      if (criticalBootIdRef.current !== bootId || criticalController.signal.aborted) return;
      console.warn('[auth-flow] critical boot timed out; clearing loading fallback', { bootId });
      criticalController.abort();
      setLoadError('timeout_error');
      setCriticalLoading(false);
      setIsInteractive(true);
    }, 35000);
    setCriticalLoading(true);
    setLoadError(null);
    setSessionMissing(false);
    setIsInteractive(false);
    setAppMode('pending');
    setIsAdminMode(false);
    setHasParentWorkspace(false);
    setPeekedRole(null);
    setPeekedUser(null);
    setRecognitionHold(true);
    if (recognitionTimerRef.current) { clearTimeout(recognitionTimerRef.current); recognitionTimerRef.current = null; }

    try {
      const { data, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      if (!data.session) {
        setSessionMissing(true);
        return;
      }

      const guardianChildrenPromise = getGuardianChildren().catch(() => []);

      // One minimal profile request decides the role and unlocks the dashboard.
      // Expensive student game hydration and portal datasets load after paint.
      let profileData: Profile | null = null;
      try {
        profileData = await GameService.whoamiFast();
      } catch (fastBootError: any) {
        // Preserve first-login/OAuth profile creation through the legacy path.
        if (fastBootError?.code === 'PGRST116') {
          const { session, profile: createdProfile } = await GameService.getCriticalBootData({
            signal: criticalController.signal,
            timeoutMs: 12000,
            retryOnTimeout: 0,
          });
          if (!session) {
            setSessionMissing(true);
            return;
          }
          profileData = createdProfile;
        } else {
          throw fastBootError;
        }
      }

      if (!profileData) {
        throw new Error('Profile not loaded');
      }

      setPeekedRole(profileData.role === 'teacher' || profileData.role === 'admin' ? profileData.role : 'student');
      if (profileData.username) {
        setPeekedUser({
          username: profileData.username,
          level: profileData.level ?? undefined,
          coins: profileData.coins ?? undefined,
          gems: profileData.gemstones ?? undefined,
          streak: profileData.streak ?? undefined,
          clanName: profileData.clan_name ?? undefined,
          avatarUrl: profileData.avatar_url ?? undefined,
        });
      }

      setProfile(profileData);
      const guardianChildren = await guardianChildrenPromise;
      const hasParentAccess = guardianChildren.length > 0;
      setHasParentWorkspace(hasParentAccess);

      const whoamiMs = performance.now() - bootStartRef.current;
      bootTimingsRef.current.whoami = whoamiMs;
      logBootTiming('time to whoami resolved', whoamiMs);

      // ── TEACHER: minimal remaining boot ──
      if (profileData.role === 'teacher') {
        // Fetch tier in parallel (non-blocking)
        fetchEffectiveTier().then(tier => setAccountTier(tier)).catch(() => {});
        // Detect pilot plan
        fetchSchoolPlanDetails().then(d => setIsPilotPlan(d.plan === 'pilot' && d.is_active)).catch(() => {});
        const capabilities = await getMySchoolCapabilities(profileData.school_id);
        setSchoolCapabilities(capabilities);
        setIsUserSchoolAdmin(Boolean(capabilities?.can_administer));
        setView(resolveAccountWorkspace(profileData.role, capabilities, hasParentAccess));

        setIsAdminMode(false);
        setAppMode('player');
        if (import.meta.env.DEV) {
          console.info('[auth-flow] loading state transition', { target: 'criticalLoading', next: false, reason: 'teacher-boot:resolved' });
        }
        setCriticalLoading(false);
        requestAnimationFrame(() => setIsInteractive(true));
        return;
      }

      // ── SCHOOL ADMIN: formal account — go directly to portal ──
      if (profileData.role === 'school_admin') {
        fetchEffectiveTier().then(tier => setAccountTier(tier)).catch(() => {});
        fetchSchoolPlanDetails().then(d => setIsPilotPlan(d.plan === 'pilot' && d.is_active)).catch(() => {});
        const capabilities = await getMySchoolCapabilities(profileData.school_id);
        setSchoolCapabilities(capabilities);
        setIsUserSchoolAdmin(Boolean(capabilities?.can_administer));
        setIsAdminMode(false);
        setAppMode('player');
        setView(resolveAccountWorkspace(profileData.role, capabilities, hasParentAccess));
        if (import.meta.env.DEV) {
          console.info('[auth-flow] loading state transition', { target: 'criticalLoading', next: false, reason: 'school-admin-boot:resolved' });
        }
        setCriticalLoading(false);
        requestAnimationFrame(() => setIsInteractive(true));
        return;
      }

      // ── STUDENT / ADMIN PATH (unchanged) ──
      // Fetch payment tier (non-blocking, defaults to 'free')
      fetchEffectiveTier().then(tier => setAccountTier(tier)).catch(() => {});
      // Detect pilot plan
      fetchSchoolPlanDetails().then(d => setIsPilotPlan(d.plan === 'pilot' && d.is_active)).catch(() => {});

      // Handle post-checkout redirect (Paddle / Stripe)
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('upgrade') === 'success') {
        // Clear URL param, refresh tier
        window.history.replaceState({}, '', window.location.pathname);
        invalidateTierCache();
        fetchEffectiveTier().then(tier => {
          setAccountTier(tier);
          if (isProTier(tier)) {
            addToast('🎉 Welcome to Brains Heist Pro! All features unlocked.', 'success');
          }
        }).catch(() => {});
      } else if (urlParams.get('upgrade') === 'cancelled') {
        window.history.replaceState({}, '', window.location.pathname);
      }

      // Check email verification status
      const verified = await isEmailVerified();
      setEmailVerified(verified);

      // Legacy tutorial coexistence: the Phase 1A route gate owns active learner
      // FTUE, but this App-level predicate is a defensive suppression layer for
      // any path where App mounts before/without the gate. Keep legacy tutorial
      // available only for rollback (ftue_enabled=false), teachers/admins, and
      // learners who are not in an active learner FTUE resolution.
      const suppressLegacyTutorialForFtue = logLegacyTutorialSuppressionDebug('App.checkAuthAndSetup.beforeSetShowTutorial', {
        flags: getOnboardingFlags(),
        profile: profileData,
      }).suppress;
      if (suppressLegacyTutorialForFtue) {
        setShowTutorial(false);
      }
      if (!tutorialCheckedRef.current && profileData && !profileData.tutorial_completed && !suppressLegacyTutorialForFtue) {
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
        setView(hasParentAccess ? 'workspace_chooser' : 'admin');
      } else {
        setIsAdminMode(false);
        setAppMode('player');
        if (hasParentAccess) setView(profileData.role === 'student' && profileData.school_id ? 'workspace_chooser' : 'parent');
        loadCachedData();
      }

      if (import.meta.env.DEV) {
        console.info('[auth-flow] loading state transition', { target: 'criticalLoading', next: false, reason: 'critical-boot:resolved' });
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
      if (import.meta.env.DEV) {
        console.info('[auth-flow] loading state transition', { target: 'criticalLoading', next: false, reason: 'critical-boot:error' });
      }
      setCriticalLoading(false);
    } finally {
      window.clearTimeout(bootWatchdog);
      if (import.meta.env.DEV) {
        console.info('[auth-flow] auth refresh end', { bootId, aborted: criticalController.signal.aborted });
      }
    }
  }, [addToast, classifyBootError, logBootTiming, loadCachedData]);

  const runNonCriticalLoads = useCallback((targets?: NonCriticalKey[]) => {
    if (!profile) return;

    // Teachers and school admins don't need student game data (tasks, caps, news, assignments)
    if (profile.role === 'teacher' || profile.role === 'school_admin') {
      // Only load session status for teachers / school admins
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
      setPendingAssignments([]);
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
          setPendingAssignments(assignmentData);
          setActiveAssignment(assignmentData.find((assignment) => !assignment.is_closed) ?? null);
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
    if (!isPlayerMode || !profile?.id) return;
    if (profile.role === 'teacher' || profile.role === 'admin' || profile.role === 'school_admin') return;

    const queueTaskRefresh = () => {
      if (taskRealtimeRefreshTimerRef.current) {
        window.clearTimeout(taskRealtimeRefreshTimerRef.current);
      }
      taskRealtimeRefreshTimerRef.current = window.setTimeout(() => {
        runNonCriticalLoadsRef.current(['tasks']);
        taskRealtimeRefreshTimerRef.current = null;
      }, 250);
    };

    const channel = supabase
      .channel(`app-task-progress-${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activities', filter: `actor_id=eq.${profile.id}` },
        (payload) => {
          const row = payload.new as { kind?: string };
          if (['quest_complete', 'pvp_win', 'attack_success', 'task_claimed'].includes(row.kind || '')) {
            queueTaskRefresh();
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'quest_runs', filter: `user_id=eq.${profile.id}` },
        () => {
          queueTaskRefresh();
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'quest_runs', filter: `user_id=eq.${profile.id}` },
        (payload) => {
          const row = payload.new as { status?: string };
          if (row.status === 'completed') {
            queueTaskRefresh();
          }
        },
      )
      .subscribe();

    return () => {
      if (taskRealtimeRefreshTimerRef.current) {
        window.clearTimeout(taskRealtimeRefreshTimerRef.current);
        taskRealtimeRefreshTimerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [isPlayerMode, profile?.id, profile?.role]);

  useEffect(() => {
    startCriticalBoot();
  }, [startCriticalBoot]);

  useEffect(() => {
    if (sessionMissing) {
      onLogout();
    }
  }, [sessionMissing, onLogout]);

  // Keep the ref in sync so the effect below always calls the latest version
  // without re-firing on every periodic profile refresh (which would flash a skeleton).
  useEffect(() => { runNonCriticalLoadsRef.current = runNonCriticalLoads; }, [runNonCriticalLoads]);

  useEffect(() => {
    if (!isPlayerMode || !profile || !isInteractive) return;
    runNonCriticalLoadsRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, isInteractive, isPlayerMode]);

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
    const isFullWidthPortalView =
      view === 'teacher' ||
      view === 'admin' ||
      view === 'school_admin' ||
      view === 'parent' ||
      (view === 'dashboard' && (isTeacherRole || isSchoolAdminRole));

    // Keep portal-style views free from parent transforms.
    // iOS Safari can render fixed headers and full-width cards incorrectly
    // when an ancestor has transform/filter applied.
    if (isFullWidthPortalView) {
      return 'cinematic-view cinematic-view--calm';
    }

    if (sessionStatus?.active) {
      return 'cinematic-view cinematic-view--alert';
    }

    if (view !== 'dashboard') {
      return 'cinematic-view cinematic-view--active';
    }

    return 'cinematic-view cinematic-view--calm';
  }, [view, sessionStatus?.active, isTeacherRole, isSchoolAdminRole]);

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
    if (!isPlayerMode || !profile || !isInteractive || isTeacherRole || isSchoolAdminRole) return;
    
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
  }, [profile, isInteractive, isPlayerMode, isSchoolAdminRole]);

  // Real-time subscription for profile updates
  useEffect(() => {
    if (!isPlayerMode || !profile?.id || !isInteractive || isSchoolAdminRole) return;

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
            newProfile.banned_until !== oldProfile?.banned_until ||
            newProfile.required_changes !== oldProfile?.required_changes ||
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
            console.warn('Level-up reward grant is temporarily disabled pending server-verified flow');
            const rewards = {
              coins: 0,
              ap_refill: false,
              message: 'Level-up rewards are temporarily disabled pending server-verified flow',
            };
            setLevelUpData({ newLevel: nextLevel, rewards });
            setShowLevelUpModal(true);

            // Refresh profile without reward RPC minting
            hydrateProfileFromServer(undefined, nextLevel);
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
  }, [profile?.id, previousLevel, isInteractive, isPlayerMode, isSchoolAdminRole]);
  
  // Set initial level when profile loads
  useEffect(() => {
    if (profile && previousLevel === null) {
      setPreviousLevel(profile.level);
      lastRewardedLevelRef.current = profile.level;
    }
  }, [profile, previousLevel]);
  
  const handleViewComplete = () => {
    if (isAdminMode && view !== 'workspace_chooser' && view !== 'parent') {
      setView('admin');
      return;
    }
    // School admin is a formal account — never load game data
    if (isSchoolAdminRole) {
      setView(view === 'teacher' && isTeacherRole ? 'teacher' : isSchoolHeadRole ? 'school_head' : 'school_admin');
      return;
    }
    handleViewChange('dashboard');
    // Only refresh profile data (lightweight) instead of all game data
    refreshProfile();
  };

  // Lightweight profile refresh (no loading screen)
  const refreshProfile = async () => {
    if (!isPlayerMode || isSchoolAdminRole) return;
    if (profileRefreshInFlightRef.current) {
      if (import.meta.env.DEV) {
        console.info('[auth-flow] profile fetch skipped; already in flight');
      }
      return profileRefreshInFlightRef.current;
    }

    const refreshPromise = (async () => {
      try {
        if (import.meta.env.DEV) {
          console.info('[auth-flow] profile fetch start');
        }
        const profileData = await GameService.whoami();
        setProfile(profileData);
        await refreshAssignment(profileData);
      } catch (error) {
        console.error('Failed to refresh profile:', error);
      } finally {
        if (import.meta.env.DEV) {
          console.info('[auth-flow] profile fetch end');
        }
      }
    })();

    profileRefreshInFlightRef.current = refreshPromise;
    try {
      await refreshPromise;
    } finally {
      if (profileRefreshInFlightRef.current === refreshPromise) {
        profileRefreshInFlightRef.current = null;
      }
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
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('brains-heist:first-mission-cta-clicked'));
    }
    if (activeAssignment) {
      const teacherName = activeAssignment.teacher_username || 'your teacher';
      addToast(`Assignment pending from ${teacherName}. Complete it before starting new quests.`, 'warning');
    }
    handleViewChange('quest');
  };

  const handleProgrammeAccessRequest = async (moduleKey: StudentProgrammeKey) => {
    if (programmeRequestStates[moduleKey] !== 'idle') return;
    setProgrammeRequestStates((current) => ({ ...current, [moduleKey]: 'sending' }));
    try {
      await requestProgrammeAccess(moduleKey);
      setProgrammeRequestStates((current) => ({ ...current, [moduleKey]: 'sent' }));
      addToast('Your request was sent to the school admin.', 'success');
    } catch (error) {
      setProgrammeRequestStates((current) => ({ ...current, [moduleKey]: 'idle' }));
      addToast(error instanceof Error ? error.message : 'Your request could not be sent. Please try again.', 'error');
    }
  };

  const handleOpenStudentAssignment = (assignment: StudentAssignmentTask) => {
    setActiveAssignment(assignment);
    handleViewChange('quest');
  };

  const handleShareInvite = async () => {
    const shareData = {
      title: 'Brains Heist',
      text: 'Join me on Brains Heist and learn together!',
      url: window.location.origin,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }

      await navigator.clipboard.writeText(shareData.url);
      addToast('Invite link copied. Send it to a friend when you are ready.', 'success');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      addToast('The invite could not be shared. Please try again.', 'error');
    }
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

  // Start recognition hold timer once peekedUser arrives (minimum 4s of personalised text)
  useEffect(() => {
    if (peekedUser && recognitionHold) {
      recognitionTimerRef.current = window.setTimeout(() => {
        setRecognitionHold(false);
      }, 4000);
      return () => { if (recognitionTimerRef.current) clearTimeout(recognitionTimerRef.current); };
    }
  }, [peekedUser, recognitionHold]);


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
      return <SectionPlaceholder title={t("Assignment")} lines={3} />;
    }
    if (profile.role !== 'student') {
      return null;
    }

    if (nonCriticalErrors.assignment) {
      return (
        <SectionError
          title={t("Assignment")}
          message={nonCriticalErrors.assignment}
          onRetry={() => retryNonCritical('assignment')}
        />
      );
    }

    if (!pendingAssignments.length && (nonCriticalStatus.assignment === 'loading' || criticalLoading)) {
      return <SectionPlaceholder title={t("Teacher assignments")} lines={3} />;
    }

    if (!pendingAssignments.length) {
      return (
        <div className="student-assignment-section card-glass rounded-2xl p-5">
          <h3 className="student-assignment-heading font-heading mb-2 text-lg">{t("Teacher assignments")}</h3>
          <p className="text-sm text-gray-300">{t("No active assignments right now.")}</p>
        </div>
      );
    }

    return (
      <div className="student-assignment-section card-glass rounded-2xl p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="student-assignment-heading font-heading text-lg">{t("Teacher assignments")}</h3>
            <p className="mt-1 text-xs text-gray-400">{t('Ready to complete: {count} · open any card for full details', { count: actionableAssignments.length })}</p>
          </div>
        </div>
        <div className="grid gap-3">
          {pendingAssignments.map((assignment) => {
            const dueLabel = assignment.due_at ? new Date(assignment.due_at).toLocaleString() : t("No deadline");
            const statusLabel = assignment.is_closed ? t("Closed") : assignment.is_late ? t("Late · still open") : t("Ready");
            const categoryMeta = getAssignmentCategoryMeta(assignment.assignment_category);
            return (
              <details key={assignment.assignment_id} className="student-assignment-card rounded-xl border border-slate-700 bg-slate-950/45">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-4 focus-visible:outline focus-visible:outline-2">
                  <span className="min-w-0">
                    <span className="block text-sm font-black text-white">{assignment.title || assignment.topic_name || t("New assignment")}</span>
                    <span className="mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide" style={assignmentCategoryBadgeStyle(assignment.assignment_category)}>{categoryMeta.label}</span>
                    <span className="mt-1 block text-xs text-slate-400">{assignment.subject_name || t("General")} · {assignment.teacher_username || t("Your teacher")} · {t('Due {date}', { date: dueLabel })}</span>
                  </span>
                  <span className={`flex-none rounded-full px-2.5 py-1 text-[11px] font-bold ${assignment.is_closed ? 'bg-slate-700 text-slate-200' : assignment.is_late ? 'bg-amber-500/20 text-amber-200' : 'bg-emerald-500/20 text-emerald-200'}`}>{statusLabel}</span>
                </summary>
                <div className="border-t border-slate-700/70 p-4">
                  <dl className="grid gap-3 text-xs text-slate-300 sm:grid-cols-2">
                    <div><dt className="font-bold uppercase tracking-wide text-slate-500">{t("Topic")}</dt><dd className="mt-1">{assignment.topic_name || t("General")}</dd></div>
                    <div><dt className="font-bold uppercase tracking-wide text-slate-500">{t("Questions")}</dt><dd className="mt-1">{assignment.questions.length}</dd></div>
                    <div><dt className="font-bold uppercase tracking-wide text-slate-500">{t("Given")}</dt><dd className="mt-1">{new Date(assignment.assigned_at).toLocaleString()}</dd></div>
                    <div><dt className="font-bold uppercase tracking-wide text-slate-500">{t("Class")}</dt><dd className="mt-1">{assignment.batch || t("Selected students")}</dd></div>
                  </dl>
                  {assignment.instructions ? <div className="mt-4 rounded-lg bg-white/5 p-3 text-sm leading-6 text-slate-300"><strong className="text-white">{t("Teacher instructions:")}</strong> <span dir="auto">{assignment.instructions}</span></div> : null}
                  <button type="button" disabled={assignment.is_closed} onClick={() => handleOpenStudentAssignment(assignment)} className="student-primary-button mt-4 w-full sm:w-auto">
                    {assignment.is_closed ? t("Assignment closed") : t("Go to this assignment")} <span aria-hidden>{assignment.is_closed ? '🔒' : '→'}</span>
                  </button>
                </div>
              </details>
            );
          })}
        </div>
      </div>
    );
  };

  const renderCapsSection = () => {
    if (nonCriticalErrors.caps) {
      return (
        <SectionError
          title={t("Caps")}
          message={nonCriticalErrors.caps}
          onRetry={() => retryNonCritical('caps')}
        />
      );
    }

    if (!caps && (nonCriticalStatus.caps === 'loading' || criticalLoading)) {
      return <SectionPlaceholder title={t("Caps")} lines={4} />;
    }

    if (!caps) {
      return (
        <div className="card-glass p-5">
          <h3 className="student-section-heading font-heading mb-2 text-lg">{t("Caps")}</h3>
          <p className="text-sm text-gray-300">{t("Caps data is unavailable.")}</p>
        </div>
      );
    }

    return <CapTracker caps={caps} profile={profile} />;
  };

  const renderTasksSection = () => {
    if (nonCriticalErrors.tasks) {
      return (
        <SectionError
          title={t("Tasks")}
          message={nonCriticalErrors.tasks}
          onRetry={() => retryNonCritical('tasks')}
        />
      );
    }

    if (!tasks.length && (nonCriticalStatus.tasks === 'loading' || criticalLoading)) {
      return <SectionPlaceholder title={t("Tasks")} lines={5} />;
    }

    if (!tasks.length) {
      return (
        <div className="card-glass p-5">
          <h3 className="student-section-heading font-heading mb-2 text-lg">{t("Tasks")}</h3>
          <p className="text-sm text-gray-300">{t("No tasks available right now.")}</p>
        </div>
      );
    }

    return <TaskList tasks={tasks} onTasksUpdate={handleTasksRefresh} addToast={addToast} />;
  };

  const renderNewsSection = () => {
    if (nonCriticalErrors.news) {
      return (
        <SectionError
          title={t("News")}
          message={nonCriticalErrors.news}
          onRetry={() => retryNonCritical('news')}
        />
      );
    }

    if (!news.length && (nonCriticalStatus.news === 'loading' || criticalLoading)) {
      return <SectionPlaceholder title={t("News")} lines={6} />;
    }

    if (!news.length) {
      return (
        <div className="card-glass p-5">
          <h3 className="student-section-heading font-heading mb-2 text-lg">{t("News")}</h3>
          <p className="text-sm text-gray-300">{t("No news yet. Check back soon.")}</p>
        </div>
      );
    }

    return <div lang="en" dir="ltr"><NewsFeed news={news} /></div>;
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

    // Phase 2: Role known → show personalised recognition text
    // Stays visible until BOTH profile is loaded AND minimum 4s elapsed.
    // This kills perceived wait time — data loads in background, less skeleton later.
    if (peekedRole && !loadError) {
      if (peekedUser && (!profile || recognitionHold)) {
        return <RecognitionText {...peekedUser} role={peekedRole} />;
      }
      if (criticalLoading && !profile) {
        return <SkeletonDashboard role={peekedRole} />;
      }
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
        case 'workspace_chooser':
          return profile ? (
            <SchoolWorkspaceChooser
              schoolName={profile.school_name}
              onOpenSchoolHead={isSchoolHeadRole ? () => handleViewChange('school_head') : undefined}
              onOpenAdministration={schoolCapabilities?.can_administer ? () => handleViewChange('school_admin') : undefined}
              onOpenTeaching={canOpenTeacherWorkspace ? () => handleViewChange('teacher') : undefined}
              onOpenParent={hasParentWorkspace ? () => handleViewChange('parent') : undefined}
              onOpenStudent={profile.role === 'student' && Boolean(profile.school_id) ? () => handleViewChange('dashboard') : undefined}
              onOpenPlatformAdmin={isAdminMode ? () => handleViewChange('admin') : undefined}
              onLogout={onLogout}
            />
          ) : null;
        case 'parent':
          return hasParentWorkspace ? renderLazy(
            <ParentPortal
              onChooseWorkspace={() => handleViewChange('workspace_chooser')}
              onLogout={onLogout}
            />
          ) : null;
        case 'quest':
            return renderLazy(
              <QuestView
                onComplete={handleViewComplete}
                onGrantReward={handleGrantReward}
                initialAssignment={activeAssignment}
                refreshAssignment={() => refreshAssignment()}
                avatarUrl={profile?.avatar_url ?? undefined}
                viewerRole={profile?.is_admin ? 'admin' : profile?.role}
                openMissionId={pendingQuestMissionId}
                onOpenMissionHandled={() => setPendingQuestMissionId(null)}
                currentProfile={profile}
              />
            );
        case 'pvp':
            return renderLazy(
              <PvPView
                onComplete={handleViewComplete}
                onGrantReward={handleGrantReward}
                profile={profile}
                focusTargetUserId={pvpFocusTargetUserId}
                addToast={addToast}
              />
            );
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
                onChatUnreadCountChange={setUnreadClanChatMessages}
                initialChatUnreadCount={unreadClanChatMessages}
              />
            );
        case 'rivalry':
            return renderLazy(
              <RivalryView
                onComplete={handleViewComplete}
                profile={profile}
                addToast={addToast}
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
        case 'writing':
            return renderLazy(
              <div className="relative">
                  <button
                      onClick={() => handleViewChange('dashboard')}
                      className="mb-4 px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors flex items-center gap-2"
                  >
                      ← Back to Dashboard
                  </button>
                  <ProgramIdentityBanner
                    program="writing"
                    eyebrow="Writing coach"
                    title="Writing Hub"
                    description="Draft, repair, and improve with guided AI coaching while keeping the writing workspace focused on the learner's work."
                    compact
                    className="mb-4"
                  />
                  {!profile?.id ? (
                    <div className="rounded-lg border border-blue-400/40 bg-slate-900/70 p-4 text-blue-100">
                      Loading your writing profile…
                    </div>
                  ) : (
                    <Suspense fallback={<WritingHubRouteFallback />}>
                      <WritingHub
                        studentId={profile.id}
                        studentName={profile.username ?? undefined}
                        grade={Number(profile?.grade) || 8}
                        genre="essay"
                        onOpenQuestMission={(missionId?: string) => {
                          setPendingQuestMissionId(missionId ?? null);
                          handleViewChange('quest');
                        }}
                      />
                    </Suspense>
                  )}
              </div>
            );
        case 'lockdown':
          return renderLazy(
            <LockdownManager
              onExit={() => handleViewChange(canOpenTeacherWorkspace ? 'teacher' : 'dashboard')}
              isTeacher={canOpenTeacherWorkspace}
              playerName={profile?.username || 'Agent'}
              clanId={profile?.clan_id}
              clanName={profile?.clan_name}
            />
          );
        case 'cambridge':
          return renderLazy(
            <div className="grid gap-4">
              <ProgramIdentityBanner
                program="cambridge"
                eyebrow="Subject practice"
                title="Cambridge Tests"
                description="Exam-ready practice across Cambridge English and science subjects, with results kept connected to the learner record."
                compact
              />
              <CambridgeTestsHub
                profile={profile}
                onExit={() => handleViewChange('dashboard')}
              />
            </div>
          );
        case 'school_admin':
          return renderLazy(
            <SchoolAdminPortal
              onComplete={handleViewComplete}
              onLogout={onLogout}
              onNavigate={handleViewChange}
              addToast={addToast}
              onOpenTeacherPortal={canOpenTeacherWorkspace ? () => handleViewChange('teacher') : undefined}
              onOpenSchoolHeadPortal={isSchoolHeadRole ? () => handleViewChange('school_head') : undefined}
              onOpenParentPortal={hasParentWorkspace ? () => handleViewChange('parent') : undefined}
            />
          );
        case 'school_head':
          return schoolCapabilities?.school_id && isSchoolHeadRole ? renderLazy(
            <SchoolHeadPortal
              schoolId={schoolCapabilities.school_id}
              onLogout={onLogout}
              addToast={addToast}
              onOpenTeacherPortal={canOpenTeacherWorkspace ? () => handleViewChange('teacher') : undefined}
              onOpenAdministration={(adminTab) => {
                const url = new URL(window.location.href);
                url.searchParams.set('view', 'school_admin');
                if (adminTab) url.searchParams.set('adminTab', adminTab);
                else url.searchParams.delete('adminTab');
                url.searchParams.delete('headTab');
                window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`);
                handleViewChange('school_admin');
              }}
            />
          ) : renderLazy(
            <SchoolAdminPortal
              onComplete={handleViewComplete}
              onLogout={onLogout}
              onNavigate={handleViewChange}
              addToast={addToast}
              onOpenTeacherPortal={canOpenTeacherWorkspace ? () => handleViewChange('teacher') : undefined}
              onOpenParentPortal={hasParentWorkspace ? () => handleViewChange('parent') : undefined}
            />
          );
        case 'dashboard':
        default:
            // School admin goes directly to SchoolAdminPortal — formal account, no game
            if (isSchoolAdminRole) {
                if (schoolCapabilities?.school_id && isSchoolHeadRole) {
                    return renderLazy(
                        <SchoolHeadPortal
                            schoolId={schoolCapabilities.school_id}
                            onLogout={onLogout}
                            addToast={addToast}
                            onOpenTeacherPortal={canOpenTeacherWorkspace ? () => handleViewChange('teacher') : undefined}
                            onOpenAdministration={(adminTab) => {
                              const url = new URL(window.location.href);
                              url.searchParams.set('view', 'school_admin');
                              if (adminTab) url.searchParams.set('adminTab', adminTab);
                              else url.searchParams.delete('adminTab');
                              url.searchParams.delete('headTab');
                              window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`);
                              handleViewChange('school_admin');
                            }}
                        />
                    );
                }
                return renderLazy(
                    <SchoolAdminPortal
                        onComplete={handleViewComplete}
                        onLogout={onLogout}
                        onNavigate={handleViewChange}
                        addToast={addToast}
                        onOpenTeacherPortal={canOpenTeacherWorkspace ? () => handleViewChange('teacher') : undefined}
                        onOpenParentPortal={hasParentWorkspace ? () => handleViewChange('parent') : undefined}
                    />
                );
            }
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
                    />
                );
            }
            
            // Student Dashboard - full gameplay experience
            const pendingTasks = tasks.filter((task) => !task.claimed && task.progress < task.target).length;

            // ── Suspension overlay ──
            const bannedUntil = profile?.banned_until ? new Date(profile.banned_until) : null;
            const isSuspended = bannedUntil && bannedUntil > new Date();
            if (isSuspended) {
              return (
                <main className="mt-6 flex items-center justify-center min-h-[60vh]">
                  <div className="bg-gray-800 rounded-2xl p-8 max-w-lg w-full border-2 border-amber-500/50 text-center space-y-4">
                    <div className="text-5xl">⏱️</div>
                    <h2 className="text-2xl font-bold text-amber-400">Account Suspended</h2>
                    <p className="text-gray-300">
                      Your gameplay access has been temporarily suspended by a school administrator.
                    </p>
                    <div className="bg-gray-900/60 rounded-lg p-4">
                      <p className="text-sm text-gray-400">Suspension ends:</p>
                      <p className="text-lg font-mono text-amber-300">{bannedUntil.toLocaleString()}</p>
                    </div>
                    <p className="text-xs text-gray-500">
                      If you believe this is an error, please speak with your school administrator.
                    </p>
                  </div>
                </main>
              );
            }

            // ── Required profile changes overlay ──
            const reqChanges = profile?.required_changes;
            if (reqChanges && typeof reqChanges === 'object' && Object.keys(reqChanges).length > 0) {
              return (
                <main className="mt-6 flex items-center justify-center min-h-[60vh]">
                  <div className="bg-gray-800 rounded-2xl p-8 max-w-lg w-full border-2 border-yellow-500/50 text-center space-y-4">
                    <div className="text-5xl">✏️</div>
                    <h2 className="text-2xl font-bold text-yellow-400">Profile Update Required</h2>
                    <p className="text-gray-300">
                      A school administrator has requested that you update your profile before continuing.
                    </p>
                    {reqChanges.reason && (
                      <div className="bg-gray-900/60 rounded-lg p-4">
                        <p className="text-sm text-gray-400">Reason:</p>
                        <p className="text-sm text-yellow-300">{reqChanges.reason}</p>
                      </div>
                    )}
                    <div className="text-left space-y-2 bg-gray-900/60 rounded-lg p-4">
                      <p className="text-sm font-semibold text-gray-300">Required changes:</p>
                      {reqChanges.username && <p className="text-sm text-yellow-200">• Change your username</p>}
                      {reqChanges.avatar && <p className="text-sm text-yellow-200">• Change your avatar</p>}
                    </div>
                    <p className="text-sm text-gray-300">
                      Use the profile menu in the top-right header to update your {reqChanges.username ? 'username' : ''}{reqChanges.username && reqChanges.avatar ? ' and ' : ''}{reqChanges.avatar ? 'avatar' : ''}, then your access will be restored automatically.
                    </p>
                    <p className="text-xs text-gray-500">
                      After updating, your access will be restored automatically.
                    </p>
                  </div>
                </main>
              );
            }

            const dashboardNavigate = (destination: StudentDashboardDestination) => {
              if (destination === 'clan' || destination === 'leaderboard') {
                const allowed = destination === 'clan'
                  ? canUsePlanFeature(FEATURE_KEYS.CLANS, true)
                  : canUsePlanFeature(FEATURE_KEYS.PVP_BATTLES, true);
                if (!allowed) {
                  setUpgradeFeatureLabel(destination === 'clan' ? 'Clan' : 'Leaderboard');
                  setShowUpgradeModal(true);
                  return;
                }
              }
              if (destination === studentDashboardTab) {
                return;
              }
              if (destination !== 'learn') setStudentLearningView('catalog');
              setStudentDashboardTab(destination);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            };

            const nextActionLabel = activeAssignment ? t("Start assignment") : t("Start today’s practice");
            const nextActionTitle = activeAssignment?.title || t("Daily skill practice");

            return (
              <main className="localized-ui mt-4 sm:mt-6" lang={language} dir={direction}>
                {profile && !hasSchool && (
                  <div className="mb-4 sm:mb-6"><JoinSchoolCard onJoined={handleJoinSchoolSuccess} /></div>
                )}

                <div className="student-dashboard-shell">
                  <StudentDashboardNavigation
                    username={profile?.username || 'Agent'}
                    level={profile?.xp_status?.level || profile?.level || 1}
                    avatarUrl={profile?.avatar_url}
                    assignmentCount={actionableAssignments.length}
                    clanBadgeCount={pendingClanRequests + unreadClanChatMessages}
                    activeDestination={studentDashboardTab}
                    onNavigate={dashboardNavigate}
                  />

                  <section className="student-dashboard-feed" lang={studentDashboardTab === 'clan' || studentDashboardTab === 'leaderboard' || studentLearningView === 'academic-profile' ? 'en' : language} dir={studentDashboardTab === 'clan' || studentDashboardTab === 'leaderboard' || studentLearningView === 'academic-profile' ? 'ltr' : direction} aria-label={`${studentDashboardTab} dashboard tab`}>
                    {studentDashboardTab === 'home' && (
                      <>
                        {renderProfileSlot()}
                        <article className="student-feed-card student-next-mission relative p-5 sm:p-6" data-testid="dashboard-start-quest">
                          <div className="student-next-mission__atmosphere pointer-events-none absolute inset-0" aria-hidden />
                          <div className="relative">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="student-theme-pill rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wider">{t("Up next")}</span>
                              <span className="text-xs font-semibold text-slate-300">{activeAssignment ? t("Teacher assignment") : t("Matched to your progress")}</span>
                            </div>
                            <h2 className="mt-4 font-heading text-2xl text-white sm:text-3xl"><bdi>{nextActionTitle}</bdi></h2>
                            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
                              {activeAssignment
                                ? `${activeAssignment.subject_name || t("General")} · ${activeAssignment.due_at ? t('Due {date}', { date: new Date(activeAssignment.due_at).toLocaleString(language) }) : t("No deadline")}`
                                : t("A short adaptive mission based on your current level. Finish it to keep your streak moving.")}
                            </p>
                            <button type="button" onClick={handleQuestAction} className="student-primary-button mt-5">
                              {nextActionLabel} <span className="ml-2" aria-hidden>→</span>
                            </button>
                          </div>
                        </article>

                        <section className="student-quick-stats" aria-label={t("Player stats")}>
                          <button type="button" onClick={() => { setHelpInitialSection('streak'); setShowHelp(true); }} aria-label={t('Open streak rewards guide. Current streak: {count} days', { count: profile?.streak || 0 })} className="student-feed-card student-quick-stat text-left transition hover:-translate-y-0.5 hover:border-orange-300/50"><span className="student-quick-stat__icon" aria-hidden>🔥</span><span><strong>{t("Streak")}</strong><b>{t('Days: {count}', { count: profile?.streak || 0 })}</b><small>{t("Tap to view the reward ladder")}</small></span></button>
                          <div className="student-feed-card student-quick-stat"><span className="student-quick-stat__icon" aria-hidden>⚡</span><span><strong>{t("Action points")}</strong><b>{profile?.ap_now || 0}/{profile?.ap_max || 0}</b><small>{t("Ready for missions")}</small></span></div>
                        </section>
                        {renderCapsSection()}
                        <article className="student-feed-card student-invite-card">
                          <span className="student-invite-card__icon" aria-hidden>👥</span>
                          <div className="student-invite-card__copy"><h2>{t("Invite a friend")}</h2><p>{t("Share a secure link and learn together.")}</p></div>
                          <button type="button" onClick={() => void handleShareInvite()} className="student-secondary-button">{t("Share link")}</button>
                        </article>
                        {renderNewsSection()}
                      </>
                    )}

                    {studentDashboardTab === 'tasks' && (
                      <div className="grid gap-4">
                        {renderAssignmentSection()}
                        {renderTasksSection()}
                      </div>
                    )}

                    {studentDashboardTab === 'learn' && (
                      studentLearningView === 'academic-profile' ? renderLazy(
                        <StudentAcademicProfile
                          studentId={profile.id}
                          mode="student"
                          backLabel={t("Back to Learn")}
                          onClose={() => setStudentLearningView('catalog')}
                        />
                      ) : <div className="student-learning-grid">
                        {isStudent && hasSchool && <article className="student-feed-card student-learning-card"><div className="student-learning-card__icon" aria-hidden>📈</div><div className="student-learning-card__copy"><span className="student-learning-card__eyebrow">{t("Your learning record")}</span><h2>{t("Academic Progress")}</h2><p>{t("See your subject performance, strengths, improvement, focus areas, evidence confidence, and curriculum coverage.")}</p></div><button type="button" onClick={() => setStudentLearningView('academic-profile')} className="student-primary-button">{t("Open Academic Progress")}<span aria-hidden>→</span></button></article>}
                        {isStudent && <StudentProgrammeCard programme="writing" eyebrow={t("Writing coach")} title={t("Writing Hub")} description={t("Draft, repair, and improve with guided AI coaching.")} locked={hasSchool && !canUseSchoolModule('writing')} lockMessage={schoolProgrammeLockMessage} requestState={programmeRequestStates.writing} onRequest={() => void handleProgrammeAccessRequest('writing')} openLabel={t("Open Writing Hub")} onPreload={preloadWritingHub} onOpen={() => handleViewChange('writing')} />}
                        {isStudent && hasSchool && <StudentProgrammeCard programme="ielts" eyebrow={t("Exam preparation")} title={t("IELTS Prep")} description={t("Focused preparation across reading, writing, listening, and speaking.")} locked={!canUseSchoolModule('ielts')} lockMessage={schoolProgrammeLockMessage} requestState={programmeRequestStates.ielts} onRequest={() => void handleProgrammeAccessRequest('ielts')} openLabel={t("Open IELTS Prep")} onOpen={() => { window.location.href = '/ielts'; }} />}
                        {isStudent && hasSchool && <StudentProgrammeCard programme="cambridge" eyebrow={t("Subject practice")} title={t("Cambridge Tests")} description={t("Practice Cambridge reading, grammar, and science tests.")} locked={!canUseSchoolModule('cambridge')} lockMessage={schoolProgrammeLockMessage} requestState={programmeRequestStates.cambridge} onRequest={() => void handleProgrammeAccessRequest('cambridge')} openLabel={t("Open Cambridge Tests")} onOpen={() => handleViewChange('cambridge')} />}
                      </div>
                    )}

                    {studentDashboardTab === 'game' && (
                      <MainActions
                        onStartQuest={handleQuestAction} onStartPvp={() => handleViewChange('pvp')}
                        onOpenRaid={!isStudent ? () => handleViewChange('raids') : undefined} onVisitShop={() => handleViewChange('shop')}
                        onGoToClan={() => dashboardNavigate('clan')} onOpenRivalry={() => handleViewChange('rivalry')}
                        onVisitInventory={() => handleViewChange('inventory')} onViewLeaderboard={() => dashboardNavigate('leaderboard')}
                        onViewAchievements={() => handleViewChange('achievements')} onOpenTournament={() => handleViewChange('tournament')}
                        onOpenIeltsPrep={canUseSchoolModule('ielts') ? () => { window.location.href = '/ielts'; } : undefined}
                        onOpenCambridgeTests={canUseSchoolModule('cambridge') ? () => handleViewChange('cambridge') : undefined} onOpenLockdown={() => handleViewChange('lockdown')}
                        profile={profile!} isIndividual={!hasSchool} hasPendingAssignment={actionableAssignments.length > 0}
                        clanBadgeCount={pendingClanRequests + unreadClanChatMessages} schoolName={profile?.school_name} schoolLogoUrl={profile?.school_logo_url}
                        isPro={isProUser} isPilot={isPilotPlan} onUpgrade={(featureLabel) => { setUpgradeFeatureLabel(featureLabel); setShowUpgradeModal(true); }}
                      />
                    )}

                    {studentDashboardTab === 'tournaments' && (
                      <article className="student-feed-card p-6 text-center"><img src="/mission-console-images/tournament.webp" alt="" className="mx-auto h-40 w-40 object-contain" /><h2 className="font-heading text-2xl text-white">{t("Tournaments")}</h2><p className="mt-2 text-sm text-slate-400">{t("Compete in live events and climb the tournament standings.")}</p><button type="button" onClick={() => handleViewChange('tournament')} className="student-primary-button mt-5">{t("Open Tournaments")}</button></article>
                    )}

                    {studentDashboardTab === 'clan' && (
                      <ClanView
                        embedded
                        profile={profile!}
                        onComplete={() => setStudentDashboardTab('home')}
                        onUpdateProfile={setProfile}
                        addToast={addToast}
                        onPendingCountChange={setPendingClanRequests}
                        onChatUnreadCountChange={setUnreadClanChatMessages}
                        initialChatUnreadCount={unreadClanChatMessages}
                      />
                    )}

                    {studentDashboardTab === 'leaderboard' && (
                      <LeaderboardView
                        embedded
                        onComplete={() => setStudentDashboardTab('home')}
                        currentUserId={profile!.id}
                        schoolId={profile?.school_id}
                      />
                    )}

                    {studentDashboardTab === 'more' && (
                      <div className="student-more-grid">
                        {([
                          { id: 'tasks', icon: '✅', label: t("Tasks"), description: pendingTasks > 0 ? t('Tasks waiting: {count}', { count: pendingTasks }) : t("Review assignments and completed work") },
                          { id: 'tournaments', icon: '🏅', label: t("Tournaments"), description: t("View live events and competition standings") },
                          { id: 'leaderboard', icon: '🏆', label: t("Leaderboard"), description: t("See your position in your school community") },
                        ] as Array<{ id: StudentDashboardDestination; icon: string; label: string; description: string }>).map((item) => <button key={item.id} type="button" onClick={() => dashboardNavigate(item.id)} className="student-feed-card student-more-card"><span className="student-more-card__icon" aria-hidden>{item.icon}</span><span className="student-more-card__copy"><strong>{item.label}</strong><small>{item.description}</small></span><span className="student-more-card__arrow" aria-hidden>→</span></button>)}
                      </div>
                    )}
                  </section>
                </div>
              </main>
            );
    }
  }

  return (
    <div
      className={
        isFullScreenView
          ? 'relative min-h-screen w-full'
          : isLiteMode
          ? 'relative min-h-screen w-full p-4 md:p-6 lg:p-8 max-w-screen-xl mx-auto lite-mode-wrapper'
          : 'relative min-h-screen p-4 md:p-6 lg:p-8 max-w-screen-xl mx-auto'
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
              Choose your grade and class from the options set up by your school so we can place you correctly.
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
                  {academicGradeOptions.map((gradeOption) => (
                      <option key={gradeOption} value={gradeOption}>
                        {/^[0-9]+$/.test(gradeOption) ? `Grade ${gradeOption}` : gradeOption}
                      </option>
                    ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-200">Class</label>
                <select
                  required
                  className="w-full rounded-lg border border-gray-700 bg-black/40 px-4 py-3 text-white focus:border-amber-300 focus:outline-none"
                  value={selectedAcademicClassId}
                  onChange={(event) => handleAcademicBatchChange(event.target.value)}
                  disabled={!pendingGrade || loadingAcademicClasses}
                >
                  <option value="" disabled>
                    Select your class
                  </option>
                  {academicClassOptions.map((schoolClass) => (
                    <option key={schoolClass.id} value={schoolClass.id}>
                      {schoolClass.class_code} — {schoolClass.class_name}
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
                  disabled={savingAcademic || loadingAcademicClasses || !schoolAcademicClasses.length}
                  className="flex h-12 w-full items-center justify-center rounded-lg bg-amber-500 text-black font-semibold hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-amber-600/40"
                >
                  {loadingAcademicClasses ? 'Loading school classes…' : savingAcademic ? 'Saving…' : 'Save and Continue'}
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
              onShowHelp={() => {
                setHelpInitialSection('overview');
                setShowHelp(true);
              }}
              onShowStreak={() => {
                setHelpInitialSection('streak');
                setShowHelp(true);
              }}
              onNavigate={(targetView) => handleViewChange(targetView)}
              onNotificationAction={handleNotificationAction}
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

        {/* Phase 1A learner FTUE suppresses broadcast overlays by render ownership:
            OnboardingRouteGate does not mount App while FTUE is active. */}
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
        {profile && isPlayerMode && !isTeacherRole && !isSchoolAdminRole && view !== 'dashboard' && ['leaderboard', 'shop', 'inventory', 'pvp', 'lockdown', 'tournament', 'achievements', 'cambridge', 'clan'].includes(view) && (
          <StudentDashboardBottomNavigation
            assignmentCount={actionableAssignments.length}
            clanBadgeCount={pendingClanRequests + unreadClanChatMessages}
            activeDestination={view === 'clan' ? 'clan' : view === 'tournament' ? 'tournaments' : view === 'leaderboard' ? 'leaderboard' : 'game'}
            onNavigate={(destination) => {
              if (destination === 'clan') { handleViewChange('clan'); return; }
              setStudentDashboardTab(destination);
              handleViewChange('dashboard');
            }}
          />
        )}
        {profile && view === 'dashboard' && isPlayerMode && !isTeacherRole && !isSchoolAdminRole && (
          <DashboardTourOverlay
            profile={profile}
            active={isOnline}
            onStartMission={handleQuestAction}
          />
        )}
        <div className="fixed inset-0 z-[10001] flex flex-col items-center justify-center gap-3 px-4 pointer-events-none">
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

        {/* Daily streak reward celebration */}
        {streakRewardData && (
          <StreakRewardModal
            streak={streakRewardData.streak}
            coinsAwarded={streakRewardData.coins_awarded}
            coinBalance={streakRewardData.coins}
            onClose={() => setStreakRewardData(null)}
          />
        )}

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

        {/* Legacy tutorial modal. Kept for rollback and non-FTUE segments; active
            learner FTUE is also suppressed here as a final render guard. */}
        {showTutorial && !logLegacyTutorialSuppressionDebug('App.render.legacyTutorialConditional', { flags: getOnboardingFlags(), profile }).suppress && (
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
          <HelpModal
            initialSection={helpInitialSection}
            currentStreak={profile?.streak}
            onClose={() => setShowHelp(false)}
          />
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
        />

        {/* Toast Notifications */}
        <ToastContainer onAction={handleNotificationAction} />
      </div>
    </div>
  );
};

export default App;
