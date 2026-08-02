import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import DOMPurify from 'dompurify';
import { Profile, TeacherQuestion, Teacher, Subject, QuestionDifficulty, QuestionType, TeacherAssignmentSummary, TeacherAssignmentReportRow, StudentForAssignment, QuestionOption, StudentAssignmentAnswer, AssignmentQuestionAnalysis, AssignmentBatch } from '../types';
import * as GameService from '../services/gameService';
import * as AuthService from '../services/authService';
import * as SchoolAdminService from '../services/schoolAdminService';
import { supabase } from '../services/supabaseClient';
import BackButton from './BackButton';
import SettingsModal from './SettingsModal';
const HelpModal = React.lazy(() => import('./HelpModal'));
import { NotificationCenter } from './NotificationCenter';
const DiagramBuilder = React.lazy(() => import('./geometry/DiagramBuilder'));
const QuestionBank = React.lazy(() => import('./teacher/QuestionBank'));
const AssignmentWizard = React.lazy(() => import('./teacher/AssignmentWizard'));
import JoinSchoolCard from './JoinSchoolCard';
import '../src/styles/teacher-theme.css';
import { brainsAlert, brainsConfirm } from '../src/utils/brainsAlert';
import { chemistryAnswerKeys, chemistryQuestionRanges } from './chemistryAnswerKeys';
import { buildBiologyAnswerKeyFromSavedMetadata, isBiologyCambridgeQuiz } from './biologyReviewAnswerKey';
import { getQuestionsForQuiz, type QuestionData } from './cambridgeQuestionData';
import {
  CAMBRIDGE_LISTENING_TEST_1_ANSWER_KEY,
  CAMBRIDGE_LISTENING_TEST_1_QUESTIONS,
  CAMBRIDGE_LISTENING_TEST_1_SECTIONS,
  getPrimaryCambridgeAnswer,
  isCambridgeAnswerCorrect,
  parseCambridgeResponses,
  type CambridgeExpectedAnswer,
} from './cambridgeListeningReview';
import { fetchSchoolPlanDetails, fetchEffectiveTier, isPro, fetchPilotQuotas, getQuotaForFeature, QUOTA_LABELS, FEATURE_TO_QUOTA, tryConsumePilotQuota, type SchoolPlanDetails, type AccountTier, type PilotQuotaStatus, type PilotQuota } from '../services/tierService';
import ProfessionalCambridgeReport, { generateSerialNumber, StudentOverviewReport, getGradeFromPercentage } from './ProfessionalCambridgeReport';
import type { ProfessionalReportData, StudentOverviewReportData, StudentTestEntry } from './ProfessionalCambridgeReport';
const CollectiveAssignmentReport = React.lazy(() => import('./CollectiveAssignmentReport'));
import { notificationService } from '../services/notificationService';
const WritingMonitoringView = React.lazy(() => import('../src/pages/writing/WritingMonitoringView'));
const WritingAnalyticsDashboard = React.lazy(() => import('../src/pages/writing/WritingAnalyticsDashboard'));
const WritingExportCenter = React.lazy(() => import('../src/pages/writing/WritingExportCenter'));
const SchoolDocumentCenter = React.lazy(() => import('../src/components/SchoolDocumentCenter'));
const ClanTerritoryManager = React.lazy(() => import('../src/features/clanTerritory/ClanTerritoryManager'));
import { normalizePart2CommunicativeAchievement, sanitizeCommunicativeAchievementText } from '../src/lib/writingCommunicativeAchievement';
import { useSchoolBranding } from '../src/hooks/useSchoolBranding';
import { createSchoolBrand } from '../src/lib/schoolBranding';
import { SchoolBrand } from '../src/components/SchoolBrand';
import { useSmartCollapsedNavigation } from '../src/hooks/useSmartCollapsedNavigation';
import {
  createSchoolDocumentId,
  escapeSchoolDocumentHtml,
  openSchoolDocumentPreview,
  safeCsvCell,
  schoolDocumentFileName,
  type SchoolDocumentAudience,
} from '../src/lib/schoolDocument';

interface TeacherPortalProps {
  profile: Profile;
  onComplete: () => void;
  onLogout?: () => void;
  onLockdown?: () => void;
  isSchoolAdmin?: boolean;
  onOpenSchoolAdmin?: () => void;
  initialView?: PortalView;
}

// Plan details state (fetched once)
let _cachedPlanDetails: SchoolPlanDetails | null = null;
let _cachedTeacherTier: AccountTier | null = null;

export type PortalView = 'dashboard' | 'students' | 'create-question' | 'question-bank' | 'csv-upload' | 'assignments' | 'create-assignment' | 'reports' | 'report-detail' | 'report-analysis' | 'collective-report' | 'documents' | 'writing-hub' | 'writing-monitoring' | 'writing-analytics' | 'writing-export-center' | 'clan-wars' | 'geometry-diagrams' | 'cambridge-reports' | 'join-school';
type TeacherNavSection = 'dashboard' | 'students' | 'questions' | 'assignments' | 'reports' | 'documents' | 'writing-hub' | 'cambridge' | 'clan-wars' | 'join-school';
type WritingHubSection = 'monitor' | 'analytics' | 'reports';

// XP points based on difficulty: Easy=10, Medium=15, Hard=20
const getDefaultPointsForDifficulty = (diff: QuestionDifficulty): number => {
  switch (diff) {
    case 'easy': return 10;
    case 'medium': return 15;
    case 'hard': return 20;
    default: return 10;
  }
};

// Maximum XP a teacher can assign to a question
const MAX_QUESTION_XP = 30;
const TEACHER_SIDEBAR_STORAGE_KEY = 'brains-heist:teacher-sidebar-collapsed';
const TEACHER_SIDEBAR_COMPACT_QUERY = '(max-width: 1279px)';

const getInitialSidebarCollapsed = () => {
  if (typeof window === 'undefined') return false;

  const savedPreference = window.localStorage.getItem(TEACHER_SIDEBAR_STORAGE_KEY);
  if (savedPreference !== null) return savedPreference === 'true';

  return window.matchMedia(TEACHER_SIDEBAR_COMPACT_QUERY).matches;
};

const getQuestionTopicLabel = (question: TeacherQuestion) => question.topic_name || question.topic || 'General';

const WRITING_TEST_NAMES = ['Cambridge Writing Test 1', 'Cambridge Writing Test 2'];
const TRAVEL_TOURISM_TEST_NAMES = ['Cambridge Travel & Tourism — Operation Sustainable Tourism'];
const TEACHER_MARKED_CAMBRIDGE_TEST_NAMES = [...WRITING_TEST_NAMES, ...TRAVEL_TOURISM_TEST_NAMES];
const isTravelTourismCambridgeTest = (quizName?: string | null) => TRAVEL_TOURISM_TEST_NAMES.includes(quizName || '');
const isTeacherMarkedCambridgeTest = (quizName?: string | null) => TEACHER_MARKED_CAMBRIDGE_TEST_NAMES.includes(quizName || '');
const DEFAULT_WRITING_MARK = 3;

const WRITING_TEST_METADATA: Record<string, {
  part1Label: string;
  part1Context: string;
  part2Label: string;
  part2Context: string;
}> = {
  'Cambridge Writing Test 1': {
    part1Label: 'Message',
    part1Context: 'Photography lessons',
    part2Label: 'Essay',
    part2Context: 'Online vs shop shopping',
  },
  'Cambridge Writing Test 2': {
    part1Label: 'Email',
    part1Context: 'Band email to Sam',
    part2Label: 'Story',
    part2Context: 'Midnight phone call story',
  },
};

const scoreProgressColor = (percentage: number) => (
  percentage >= 80 ? 'bg-green-500' : percentage >= 60 ? 'bg-yellow-500' : 'bg-red-500'
);

const splitGrammarAndPunctuation = (items: { wrong: string; correct: string; explanation: string }[] = []) => {
  const punctuation = items.filter((item) => /punct|comma|full stop|period|apostrophe|quote|capital/i.test(item.explanation || item.wrong));
  const grammar = items.filter((item) => !punctuation.includes(item));
  return { grammar, punctuation };
};

const TeacherPortal: React.FC<TeacherPortalProps> = ({ profile, onComplete, onLogout, isSchoolAdmin, onOpenSchoolAdmin, initialView = 'dashboard' }) => {
  const resolvedBranding = useSchoolBranding({ schoolId: profile.school_id, schoolName: profile.school_name, schoolLogoUrl: profile.school_logo_url });
  const schoolBrand = createSchoolBrand({ schoolId: profile.school_id, ...resolvedBranding });
  const initialWritingSection: WritingHubSection =
    initialView === 'writing-analytics' ? 'analytics' :
      initialView === 'writing-export-center' ? 'reports' :
        'monitor';
  const normalizedInitialView: PortalView =
    ['writing-monitoring', 'writing-analytics', 'writing-export-center'].includes(initialView)
      ? 'writing-hub'
      : initialView;
  const [view, setView] = useState<PortalView>(normalizedInitialView);
  const [writingHubSection, setWritingHubSection] = useState<WritingHubSection>(initialWritingSection);
  const [writingHubFilterQuery, setWritingHubFilterQuery] = useState('');
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [questions, setQuestions] = useState<TeacherQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const initCalledRef = useRef(false);
  const questionsLoadRef = useRef<Promise<void> | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [editingQuestion, setEditingQuestion] = useState<TeacherQuestion | null>(null);
  const [isProPlan, setIsProPlan] = useState(() => isPro(_cachedTeacherTier));
  const [pilotQuotas, setPilotQuotas] = useState<PilotQuotaStatus | null>(null);
  const [questionSearchTerm, setQuestionSearchTerm] = useState('');
  const [questionSubjectFilter, setQuestionSubjectFilter] = useState<'all' | Subject>('all');
  const [questionTopicFilter, setQuestionTopicFilter] = useState<string>('all');
  const [questionDifficultyFilter, setQuestionDifficultyFilter] = useState<'all' | QuestionDifficulty>('all');
  const [questionTypeFilter, setQuestionTypeFilter] = useState<'all' | 'multiple_choice' | 'true_false' | 'short_answer'>('all');

  // Teacher class assignments state
  const [assignedClasses, setAssignedClasses] = useState<SchoolAdminService.TeacherAssignedClass[]>([]);
  const [teacherHasClassAssignments, setTeacherHasClassAssignments] = useState(false);
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url || '/BRAINS.svg');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [topNavMenuOpen, setTopNavMenuOpen] = useState(false);
  const [mobileWorkspaceMenuOpen, setMobileWorkspaceMenuOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(getInitialSidebarCollapsed);
  const topNavRef = useRef<HTMLElement | null>(null);
  const topNavMenuRef = useRef<HTMLDivElement | null>(null);
  const [topNavHeight, setTopNavHeight] = useState(0);
  const [selectedAvatar, setSelectedAvatar] = useState<string>(profile.avatar_url || '');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarUploadError, setAvatarUploadError] = useState<string | null>(null);
  const [avatarUploadSuccess, setAvatarUploadSuccess] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const compactViewport = window.matchMedia(TEACHER_SIDEBAR_COMPACT_QUERY);
    const adaptSidebarToViewport = (event: MediaQueryListEvent) => {
      if (window.localStorage.getItem(TEACHER_SIDEBAR_STORAGE_KEY) === null) {
        setDesktopSidebarCollapsed(event.matches);
      }
    };

    compactViewport.addEventListener('change', adaptSidebarToViewport);
    return () => compactViewport.removeEventListener('change', adaptSidebarToViewport);
  }, []);

  const toggleDesktopSidebar = () => {
    setDesktopSidebarCollapsed((collapsed) => {
      const nextCollapsed = !collapsed;
      window.localStorage.setItem(TEACHER_SIDEBAR_STORAGE_KEY, String(nextCollapsed));
      return nextCollapsed;
    });
  };

  // Question form state
  const [questionText, setQuestionText] = useState('');
  const [questionImage, setQuestionImage] = useState<File | null>(null);
  const [questionImageUrl, setQuestionImageUrl] = useState<string>('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [subject, setSubject] = useState<Subject>('Maths');
  const [difficulty, setDifficulty] = useState<QuestionDifficulty>('easy');
  const [questionType, setQuestionType] = useState<'multiple_choice' | 'true_false' | 'short_answer'>('multiple_choice');
  const [options, setOptions] = useState<QuestionOption[]>([
    { text: '', image_url: undefined },
    { text: '', image_url: undefined },
    { text: '', image_url: undefined },
    { text: '', image_url: undefined }
  ]);
  const [optionImages, setOptionImages] = useState<(File | null)[]>([null, null, null, null]);
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [explanation, setExplanation] = useState('');
  const [points, setPoints] = useState(10);
  const [topicMode, setTopicMode] = useState<'general' | 'custom'>('general');
  const [customTopicName, setCustomTopicName] = useState('');

  useEffect(() => {
    setAvatarUrl(profile.avatar_url || '/BRAINS.svg');
    setSelectedAvatar(profile.avatar_url || '');
  }, [profile.avatar_url]);

  useEffect(() => {
    if (!topNavMenuOpen) return;

    const handleDismiss = (event: MouseEvent | TouchEvent) => {
      if (topNavMenuRef.current && !topNavMenuRef.current.contains(event.target as Node)) {
        setTopNavMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleDismiss);
    document.addEventListener('touchstart', handleDismiss, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleDismiss);
      document.removeEventListener('touchstart', handleDismiss);
    };
  }, [topNavMenuOpen]);

  useLayoutEffect(() => {
    if (!topNavRef.current) return;

    const updateTopNavHeight = () => {
      if (!topNavRef.current) return;
      const measuredHeight = Math.ceil(topNavRef.current.getBoundingClientRect().height);
      if (measuredHeight > 0) {
        setTopNavHeight(measuredHeight);
      }
    };

    updateTopNavHeight();

    const resizeObserver = new ResizeObserver(() => updateTopNavHeight());
    resizeObserver.observe(topNavRef.current);

    window.addEventListener('resize', updateTopNavHeight);
    window.addEventListener('orientationchange', updateTopNavHeight);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateTopNavHeight);
      window.removeEventListener('orientationchange', updateTopNavHeight);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const updateUnreadCount = async () => {
      try {
        const count = await notificationService.getUnreadCount();
        if (mounted) setUnreadCount(count);
      } catch (error) {
        console.warn('Failed to fetch teacher unread notification count:', error);
      }
    };

    void updateUnreadCount();

    const unsubscribe = notificationService.subscribe(() => {
      void updateUnreadCount();
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

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

  const applyAvatarChange = async (avatar: string) => {
    try {
      const updatedProfile = await GameService.update_avatar(avatar);
      const nextAvatar = updatedProfile.avatar_url || avatar;
      setAvatarUrl(nextAvatar);
      setSelectedAvatar(nextAvatar);
      setAvatarUploadSuccess(true);
    } catch (error: any) {
      console.error('Failed to apply avatar change from teacher portal:', error);
      setAvatarUploadError(error?.message || 'Unable to update profile picture.');
      throw error;
    }
  };

  const handleAvatarSelect = async (avatar: string) => {
    if (uploadingAvatar) return;
    setUploadingAvatar(true);
    setAvatarUploadError(null);
    try {
      await applyAvatarChange(avatar);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || uploadingAvatar) return;
    setUploadingAvatar(true);
    setAvatarUploadError(null);
    try {
      const uploadedUrl = await GameService.upload_avatar_file(file);
      await applyAvatarChange(uploadedUrl);
    } catch (error: any) {
      console.error('Failed to upload avatar from teacher portal:', error);
      setAvatarUploadError(error?.message || 'Unable to upload profile picture.');
    } finally {
      setUploadingAvatar(false);
      event.target.value = '';
    }
  };

  const handleUsernameChange = async (newUsername: string) => {
    await GameService.update_username(newUsername);
    brainsAlert('Username updated.', 'success');
  };

  // Assignment state
  const [assignments, setAssignments] = useState<TeacherAssignmentSummary[]>([]);
  const [dashboardAssignmentReports, setDashboardAssignmentReports] = useState<Record<string, TeacherAssignmentReportRow[]>>({});
  const [dashboardReportsLoaded, setDashboardReportsLoaded] = useState(false);
  const [deletingAssignmentId, setDeletingAssignmentId] = useState<string | null>(null);
  const [assignmentSuccess, setAssignmentSuccess] = useState<GameService.TeacherAssignmentSuccessSummary | null>(null);
  const [assignmentMode, setAssignmentMode] = useState<'batch' | 'custom'>('batch');
  const [assignmentBatches, setAssignmentBatches] = useState<string[]>([]);
  const questionBankSubjectRef = useRef(false);
  const [assignmentSubject, setAssignmentSubject] = useState<Subject>('Maths');
  const [assignmentLockedSubject, setAssignmentLockedSubject] = useState<Subject | null>(null);
  const [assignmentTopicMode, setAssignmentTopicMode] = useState<'general' | 'custom'>('general');
  const [assignmentTopicName, setAssignmentTopicName] = useState('');
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [assignmentDescription, setAssignmentDescription] = useState('');
  const [assignmentInstructions, setAssignmentInstructions] = useState('');
  const [assignmentQuestionIds, setAssignmentQuestionIds] = useState<string[]>([]);
  const [assignmentDueAt, setAssignmentDueAt] = useState('');
  const [assignmentAssignedAt, setAssignmentAssignedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [assignmentDifficulty, setAssignmentDifficulty] = useState<QuestionDifficulty>('easy');
  const [assignmentSubmitting, setAssignmentSubmitting] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [assignmentReport, setAssignmentReport] = useState<TeacherAssignmentReportRow[]>([]);
  const [selectedReportAssignment, setSelectedReportAssignment] = useState<TeacherAssignmentSummary | null>(null);
  const [availableStudents, setAvailableStudents] = useState<StudentForAssignment[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [studentSearchTerm, setStudentSearchTerm] = useState('');
  const [assignmentQuestionSearchTerm, setAssignmentQuestionSearchTerm] = useState('');
  const [assignmentQuestionDifficultyFilter, setAssignmentQuestionDifficultyFilter] = useState<'all' | QuestionDifficulty>('all');
  const [assignmentQuestionTypeFilter, setAssignmentQuestionTypeFilter] = useState<'all' | QuestionType>('all');

  // Assignment Filtering State (Folder Organization)
  const [assignmentSearchTerm, setAssignmentSearchTerm] = useState('');
  const [assignmentSubjectFilter, setAssignmentSubjectFilter] = useState<'all' | Subject>('all');
  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState<'all' | 'in-progress' | 'completed'>('all');

  // Assignment Analysis State
  const [questionAnalysis, setQuestionAnalysis] = useState<AssignmentQuestionAnalysis[]>([]);
  const [studentAnswers, setStudentAnswers] = useState<StudentAssignmentAnswer[]>([]);
  const [selectedAnalysisStudent, setSelectedAnalysisStudent] = useState<TeacherAssignmentReportRow | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisTab, setAnalysisTab] = useState<'overview' | 'questions' | 'student'>('overview');
  const [answerOrder, setAnswerOrder] = useState<'assignment' | 'review'>('assignment');

  // Cambridge Test Reports State
  const [cambridgeScores, setCambridgeScores] = useState<any[]>([]);
  const [cambridgeLoading, setCambridgeLoading] = useState(false);
  const [cambridgeClassFilter, setCambridgeClassFilter] = useState<string>('all');
  const [cambridgeActiveTab, setCambridgeActiveTab] = useState<string>('all'); // Tab for test types
  const [cambridgeStudentFilter, setCambridgeStudentFilter] = useState<string>('all');
  const [cambridgeSearchTerm, setCambridgeSearchTerm] = useState('');
  const [cambridgeStatusFilters, setCambridgeStatusFilters] = useState<string[]>([]);
  const [cambridgeNeedsMarkingOnly, setCambridgeNeedsMarkingOnly] = useState(false);
  const [cambridgeReleasedOnly, setCambridgeReleasedOnly] = useState(false);
  const [cambridgeSort, setCambridgeSort] = useState('newest');

  const [cambridgeFiltersOpen, setCambridgeFiltersOpen] = useState(false);
  const [cambridgeTestSearch, setCambridgeTestSearch] = useState('');
  const [cambridgeSelectedIds, setCambridgeSelectedIds] = useState<string[]>([]);
  const [showCambridgeReport, setShowCambridgeReport] = useState(false);
  const [showCambridgeAnswers, setShowCambridgeAnswers] = useState(false);
  const [selectedCambridgeStudent, setSelectedCambridgeStudent] = useState<any | null>(null);
  const [showStudentOverviewReport, setShowStudentOverviewReport] = useState(false);
  const [studentOverviewData, setStudentOverviewData] = useState<StudentOverviewReportData | null>(null);
  const [cambridgeDrawerOpen, setCambridgeDrawerOpen] = useState(false);
  const [cambridgeDrawerAttempt, setCambridgeDrawerAttempt] = useState<any | null>(null);
  const [cambridgeRetakeAttempt, setCambridgeRetakeAttempt] = useState<any | null>(null);
  const [cambridgeRetakeReason, setCambridgeRetakeReason] = useState('');
  const [cambridgeRetakeSubmitting, setCambridgeRetakeSubmitting] = useState(false);
  const [cambridgeRetakeError, setCambridgeRetakeError] = useState<string | null>(null);

  // Test Visibility Management State
  const [testVisibilitySettings, setTestVisibilitySettings] = useState<Map<string, boolean>>(new Map());
  const [visibilityLoading, setVisibilityLoading] = useState(false);
  const [showVisibilityManager, setShowVisibilityManager] = useState(false);
  const [visibilityTestsData, setVisibilityTestsData] = useState<any[]>([]);

  // School-Level Visibility State
  const [showSchoolLevelVisibility, setShowSchoolLevelVisibility] = useState(false);
  const [schoolVisibility, setSchoolVisibility] = useState<{test_id: string; test_name: string; subject: string; category: string; is_visible: boolean; updated_by: string | null; updated_at: string | null}[]>([]);
  const [schoolVisibilityLoading, setSchoolVisibilityLoading] = useState(false);
  const [schoolVisibilitySubjectFilter, setSchoolVisibilitySubjectFilter] = useState<string>('all');
  const [selectedSchoolTests, setSelectedSchoolTests] = useState<Set<string>>(new Set());
  const [schoolVisConfirmDialog, setSchoolVisConfirmDialog] = useState<{title: string; description: string; confirmLabel: string; isDestructive?: boolean; onConfirm: () => Promise<void>} | null>(null);

  const [showWritingMarkingModal, setShowWritingMarkingModal] = useState(false);
  const [autoProofreadLoading, setAutoProofreadLoading] = useState(false);
  const [travelTourismAiSuggestion, setTravelTourismAiSuggestion] = useState<any | null>(null);
  const [travelTourismMark, setTravelTourismMark] = useState(0);
  const [travelTourismFeedback, setTravelTourismFeedback] = useState('');
  const [savingMarks, setSavingMarks] = useState(false);
  const [bulkProofreadLoading, setBulkProofreadLoading] = useState(false);
  const [bulkProofreadProgress, setBulkProofreadProgress] = useState({ current: 0, total: 0, currentStudent: '' });
  const [writingMarks, setWritingMarks] = useState<{
    part1: { content: number; organisation: number; language: number };
    part2: { content: number; communicativeAchievement: number; organisation: number; language: number };
  }>({
    part1: { content: 0, organisation: 0, language: 0 },
    part2: { content: 0, communicativeAchievement: 0, organisation: 0, language: 0 },
  });
  const [writingFeedback, setWritingFeedback] = useState<{
    part1: { 
      feedback: string; 
      correctedVersion: string;
      spellingMistakes?: { wrong: string; correct: string; explanation: string }[];
      grammarMistakes?: { wrong: string; correct: string; explanation: string }[];
      markJustifications?: { content: string; organisation: string; language: string };
      modelAnswer?: string;
    };
    part2: { 
      feedback: string; 
      correctedVersion: string;
      spellingMistakes?: { wrong: string; correct: string; explanation: string }[];
      grammarMistakes?: { wrong: string; correct: string; explanation: string }[];
      markJustifications?: { content: string; organisation: string; language: string; communicativeAchievement?: string };
      modelAnswer?: string;
    };
    overallComments: string;
    releasedToStudent: boolean;
  }>({
    part1: { feedback: '', correctedVersion: '' },
    part2: { feedback: '', correctedVersion: '' },
    overallComments: '',
    releasedToStudent: false,
  });
  const [cambridgeStats, setCambridgeStats] = useState<{
    totalSubmissions: number;
    avgPercentage: number;
    highestScore: { name: string; percentage: number } | null;
    lowestScore: { name: string; percentage: number } | null;
    classStats: Record<string, { count: number; avg: number; total: number }>;
  }>({
    totalSubmissions: 0,
    avgPercentage: 0,
    highestScore: null,
    lowestScore: null,
    classStats: {}
  });
  
  // Score release state
  const [releasingScores, setReleasingScores] = useState(false);
  const [scoreReleaseStats, setScoreReleaseStats] = useState<{
    quizName: string;
    releasedCount: number;
    unreleasedCount: number;
  }[]>([]);

  const questionTopicLabel = useMemo(() => (
    topicMode === 'general' ? 'General' : (customTopicName.trim() || 'Custom Topic')
  ), [topicMode, customTopicName]);

  const subjectFilterOptions = useMemo(() => {
    const subjects = new Set<Subject>();
    questions.forEach((q) => subjects.add(q.subject));
    return Array.from(subjects).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
  }, [questions]);

  const topicFilterOptions = useMemo(() => {
    const topics = new Set<string>();
    questions
      .filter((q) => questionSubjectFilter === 'all' || q.subject === questionSubjectFilter)
      .forEach((q) => topics.add(getQuestionTopicLabel(q)));
    return Array.from(topics).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
  }, [questions, questionSubjectFilter]);

  const filteredQuestions = useMemo(() => {
    const search = questionSearchTerm.trim().toLowerCase();

    return questions.filter((question) => {
      const subjectMatches = questionSubjectFilter === 'all' || question.subject === questionSubjectFilter;
      const topicMatches = questionTopicFilter === 'all' || getQuestionTopicLabel(question) === questionTopicFilter;
      const difficultyMatches = questionDifficultyFilter === 'all' || question.difficulty === questionDifficultyFilter;
      const typeMatches = questionTypeFilter === 'all' || question.question_type === questionTypeFilter;
      const searchMatches = !search ||
        question.question_text.toLowerCase().includes(search) ||
        getQuestionTopicLabel(question).toLowerCase().includes(search) ||
        question.subject.toLowerCase().includes(search);

      return subjectMatches && topicMatches && difficultyMatches && typeMatches && searchMatches;
    });
  }, [questions, questionSearchTerm, questionSubjectFilter, questionTopicFilter, questionDifficultyFilter, questionTypeFilter]);

  const groupedQuestions = useMemo(() => {
    const groups: Record<string, Record<string, TeacherQuestion[]>> = {};

    filteredQuestions.forEach((question) => {
      const subjectKey = question.subject || 'Uncategorized';
      const topicKey = getQuestionTopicLabel(question);

      if (!groups[subjectKey]) groups[subjectKey] = {};
      if (!groups[subjectKey][topicKey]) groups[subjectKey][topicKey] = [];
      groups[subjectKey][topicKey].push(question);
    });

    return groups;
  }, [filteredQuestions]);

  const assignmentTopicLabel = useMemo(() => (
    assignmentTopicMode === 'general' ? 'General' : (assignmentTopicName.trim() || 'Custom Topic')
  ), [assignmentTopicMode, assignmentTopicName]);
  const assignmentQuestionPool = useMemo(() => (
    questions.filter((q) => q.subject === assignmentSubject)
  ), [questions, assignmentSubject]);

  const assignmentFilteredQuestionPool = useMemo(() => {
    const search = assignmentQuestionSearchTerm.trim().toLowerCase();

    return assignmentQuestionPool.filter((question) => {
      const topicLabel = getQuestionTopicLabel(question);
      const matchesSearch = !search
        || question.question_text.toLowerCase().includes(search)
        || topicLabel.toLowerCase().includes(search)
        || question.correct_answer?.toLowerCase().includes(search);
      const matchesDifficulty = assignmentQuestionDifficultyFilter === 'all' || question.difficulty === assignmentQuestionDifficultyFilter;
      const matchesType = assignmentQuestionTypeFilter === 'all' || question.question_type === assignmentQuestionTypeFilter;

      return matchesSearch && matchesDifficulty && matchesType;
    });
  }, [assignmentQuestionPool, assignmentQuestionSearchTerm, assignmentQuestionDifficultyFilter, assignmentQuestionTypeFilter]);

  const assignmentQuestionGroups = useMemo(() => {
    const groups = new Map<string, TeacherQuestion[]>();

    assignmentFilteredQuestionPool.forEach((question) => {
      const topicLabel = getQuestionTopicLabel(question);
      if (!groups.has(topicLabel)) groups.set(topicLabel, []);
      groups.get(topicLabel)!.push(question);
    });

    return Array.from(groups.entries())
      .map(([topic, topicQuestions]) => ({
        topic,
        questions: topicQuestions.sort((a, b) => a.question_text.localeCompare(b.question_text)),
      }))
      .sort((a, b) => {
        if (a.topic === 'General') return 1;
        if (b.topic === 'General') return -1;
        return a.topic.localeCompare(b.topic, undefined, { sensitivity: 'base', numeric: true });
      });
  }, [assignmentFilteredQuestionPool]);

  const selectedAssignmentQuestions = useMemo(() => (
    questions.filter((q) => assignmentQuestionIds.includes(q.id))
  ), [questions, assignmentQuestionIds]);
  
  // Get unique batches from available students (dynamic, not hardcoded)
  const availableBatches = useMemo(() => {
    const batches = new Set<string>();
    availableStudents.forEach(s => {
      if (s.batch) batches.add(s.batch);
    });
    return Array.from(batches).sort();
  }, [availableStudents]);

  // Get unique subjects teacher is assigned to teach (from class assignments)
  const teacherAssignedSubjects = useMemo(() => {
    const subjects = new Set<string>();
    assignedClasses.forEach(cls => {
      if (cls.subject) subjects.add(cls.subject);
    });
    // Sort alphabetically
    return Array.from(subjects).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
  }, [assignedClasses]);

  // A class may appear more than once when a teacher has multiple subject
  // assignments. Keep the Cambridge class picker based on the current class
  // assignments, rather than only the historical class labels on submissions.
  const assignedCambridgeClassCodes = useMemo(() => (
    [...new Set(assignedClasses.map((cls) => cls.class_code).filter(Boolean))].sort()
  ), [assignedClasses]);

  // Get unique subjects from assignments for folder tabs
  const assignmentSubjects = useMemo(() => {
    const subjects = new Set<string>();
    assignments.forEach(a => {
      if (a.subject_name) subjects.add(a.subject_name);
    });
    return Array.from(subjects).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
  }, [assignments]);

  // Filtered assignments based on search, subject, and status filters
  const filteredAssignments = useMemo(() => {
    return assignments.filter(a => {
      // Search filter
      if (assignmentSearchTerm.trim()) {
        const search = assignmentSearchTerm.toLowerCase();
        const matchesSearch = 
          (a.title?.toLowerCase().includes(search)) ||
          a.topic_name.toLowerCase().includes(search) ||
          a.subject_name.toLowerCase().includes(search);
        if (!matchesSearch) return false;
      }
      // Subject filter
      if (assignmentSubjectFilter !== 'all' && a.subject_name !== assignmentSubjectFilter) {
        return false;
      }
      // Status filter
      if (assignmentStatusFilter !== 'all') {
        const isCompleted = a.completed_count >= a.student_count;
        if (assignmentStatusFilter === 'completed' && !isCompleted) return false;
        if (assignmentStatusFilter === 'in-progress' && isCompleted) return false;
      }
      return true;
    });
  }, [assignments, assignmentSearchTerm, assignmentSubjectFilter, assignmentStatusFilter]);

  const teacherOwnedTopics = useMemo(() => {
    if (!teacher) return [];
    return [...new Set(
      questions
        .filter((question) => question.teacher_id === teacher.id && question.subject === subject)
        .map((question) => getQuestionTopicLabel(question)),
    )].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
  }, [questions, subject, teacher]);
  
  const filteredStudents = useMemo(() => {
    if (!studentSearchTerm.trim()) return availableStudents;
    const search = studentSearchTerm.toLowerCase();
    return availableStudents.filter(s => 
      s.display_name.toLowerCase().includes(search) ||
      s.batch?.toLowerCase().includes(search)
    );
  }, [availableStudents, studentSearchTerm]);
  const primarySection = useMemo<TeacherNavSection>(() => {
    if (view === 'dashboard') return 'dashboard';
    if (view === 'students') return 'students';
    if (view === 'documents') return 'documents';
    if (view === 'join-school') return 'join-school';
    if (view === 'question-bank' || view === 'create-question' || view === 'csv-upload') return 'questions';
    if (view === 'assignments' || view === 'create-assignment') return 'assignments';
    if (view === 'writing-hub' || view === 'writing-monitoring' || view === 'writing-analytics' || view === 'writing-export-center') return 'writing-hub';
    if (view === 'clan-wars') return 'clan-wars';
    if (view === 'cambridge-reports') return 'cambridge';
    return 'reports'; // catches 'reports', 'report-detail', 'report-analysis', 'collective-report'
  }, [view]);
  const {
    navigationRef: mobileNavigationRef,
    revealNavigation: revealMobileNavigation,
  } = useSmartCollapsedNavigation(view, '(max-width: 1023px)');

  const changeSection = async (section: TeacherNavSection) => {
    revealMobileNavigation();
    setMobileWorkspaceMenuOpen(false);
    if (view === 'create-assignment') {
      const hasProgress = Boolean(
        assignmentQuestionIds.length ||
        assignmentTitle.trim() ||
        assignmentDescription.trim() ||
        assignmentInstructions.trim() ||
        assignmentDueAt ||
        assignmentBatches.length ||
        selectedStudentIds.length,
      );
      if (hasProgress) {
        const confirmed = await brainsConfirm({
          title: 'Leave assignment setup?',
          message: 'This assignment has not been published. Your selected audience, questions, title, and due date will be lost.',
          confirmLabel: 'Leave and discard',
          cancelLabel: 'Keep editing',
          destructive: true,
        });
        if (!confirmed) return;
      }
    }
    switch (section) {
      case 'dashboard':
        setView('dashboard');
        break;
      case 'students':
        setView('students');
        break;
      case 'questions':
        void loadQuestionsOnDemand();
        setView('question-bank');
        break;
      case 'assignments':
        setSelectedReportAssignment(null);
        setView('assignments');
        break;
      case 'reports':
        setSelectedReportAssignment(null);
        setAssignmentReport([]);
        setView('reports');
        break;
      case 'documents':
        setView('documents');
        break;
      case 'writing-hub':
        setView('writing-hub');
        break;
      case 'cambridge':
        setView('cambridge-reports');
        loadCambridgeScores();
        break;
      case 'clan-wars':
        setView('clan-wars');
        break;
      case 'join-school':
        setView('join-school');
        break;
      default:
        setView('dashboard');
    }
  };

  useEffect(() => {
    // Guard against StrictMode double-mount
    if (initCalledRef.current) return;
    initCalledRef.current = true;

    loadTeacherData();

    // Fetch tier in parallel (non-blocking)
    if (_cachedTeacherTier) {
      setIsProPlan(isPro(_cachedTeacherTier));
    } else {
      fetchEffectiveTier().then(tier => {
        _cachedTeacherTier = tier;
        setIsProPlan(isPro(tier));
      }).catch(() => {});
    }

    // Fetch pilot quotas (non-blocking)
    fetchPilotQuotas().then(q => { if (q) setPilotQuotas(q); }).catch(() => {});
  }, []);

  // Set default subject to first assigned subject when teacher has class assignments
  useEffect(() => {
    if (teacherAssignedSubjects.length > 0) {
      // Only update if current subject is not in the assigned subjects list
      if (!teacherAssignedSubjects.includes(subject)) {
        setSubject(teacherAssignedSubjects[0] as Subject);
      }
      if (!teacherAssignedSubjects.includes(assignmentSubject)) {
        setAssignmentSubject(teacherAssignedSubjects[0] as Subject);
      }
    }
  }, [teacherAssignedSubjects]);

  // Load the server-authorized, class-scoped Cambridge catalog.
  useEffect(() => {
    if (!showVisibilityManager) return;

    const loadVisibilityTests = async () => {
      setVisibilityLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_teacher_cambridge_test_catalog');
        if (error) throw error;
        const rows = data || [];
        setVisibilityTestsData(rows);
        const next = new Map<string, boolean>();
        rows.forEach((row: any) => {
          next.set(`${row.class_id}|${row.test_id}`, row.teacher_released === true);
        });
        setTestVisibilitySettings(next);
      } catch (error) {
        console.error('Error loading Cambridge class releases:', error);
        setVisibilityTestsData([]);
        brainsAlert('Unable to load tests. Refresh and try again, or ask your school admin to verify your class and subject assignment.', 'error');
      } finally {
        setVisibilityLoading(false);
      }
    };

    loadVisibilityTests();
  }, [showVisibilityManager]);

  useEffect(() => {
    // Don't clear questions when subject was set from the Question Bank "Host" flow
    if (questionBankSubjectRef.current) {
      questionBankSubjectRef.current = false;
      return;
    }
    setAssignmentQuestionIds([]);
  }, [assignmentSubject]);

  const loadAssignments = async () => {
    try {
      const rows = await GameService.get_teacher_assignments();
      setAssignments(rows);
    } catch (error) {
      console.error('Error loading assignments:', error);
    }
  };

  const loadAssignmentSuccess = useCallback(async () => {
    try {
      const summary = await GameService.get_teacher_assignment_success_summary();
      setAssignmentSuccess(summary);
    } catch (error) {
      console.error('Error loading assignment success:', error);
      setAssignmentSuccess(null);
    }
  }, []);

  useEffect(() => {
    if (view === 'dashboard') {
      void loadAssignmentSuccess();
    }
  }, [view, loadAssignmentSuccess]);

  useEffect(() => {
    if (view !== 'dashboard' || assignments.length === 0) {
      setDashboardAssignmentReports({});
      setDashboardReportsLoaded(false);
      return;
    }

    let cancelled = false;
    setDashboardReportsLoaded(false);
    void GameService.get_all_assignment_reports(assignments.map((assignment) => assignment.id))
      .then((reports) => {
        if (!cancelled) {
          setDashboardAssignmentReports(reports);
          setDashboardReportsLoaded(true);
        }
      })
      .catch((error) => {
        console.error('Error loading dashboard assignment details:', error);
        if (!cancelled) setDashboardAssignmentReports({});
      });

    return () => {
      cancelled = true;
    };
  }, [view, assignments]);

  // Correct answers for Cambridge tests
  const correctAnswers: Record<string, Record<number, CambridgeExpectedAnswer>> = {
    'Cambridge Reading 25': {
      1:"common", 2:"typically", 3:"access", 4:"stay", 5:"hunt", 6:"defend", 7:"escape", 8:"number",
      9:"B", 10:"A", 11:"A", 12:"C", 13:"A",
      14:"G", 15:"D", 16:"F", 17:"A", 18:"C",
      19:"nothing", 20:"be", 21:"for", 22:"can", 23:"the", 24:"if", 25:"would", 26:"to",
      27:"C", 28:"A", 29:"B", 30:"C", 31:"A", 32:"D", 33:"C", 34:"A", 35:"B", 36:"C",
      37:"C", 38:"B", 39:"D", 40:"A", 41:"B", 42:"C"
    },
    'Cambridge Listening Test 1': CAMBRIDGE_LISTENING_TEST_1_ANSWER_KEY,
  };

  // Skill categories for analysis
  const skillCategories: Record<string, Record<string, { questions: number[]; icon: string }>> = {
    'Cambridge Reading 25': {
      "Vocabulary & Context": { questions: [1,2,3,4,5,6,7,8], icon: "📚" },
      "Reading Comprehension": { questions: [9,10,11,12,13], icon: "📖" },
      "Scanning & Matching": { questions: [14,15,16,17,18], icon: "🔍" },
      "Grammar & Structure": { questions: [19,20,21,22,23,24,25,26], icon: "✍️" },
      "Detailed Analysis": { questions: [27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42], icon: "🎯" }
    },
    'Cambridge Listening Test 1': {
      "Picture Selection 1": { questions: [1,2,3,4,5], icon: "🖼️" },
      "Picture Selection 2": { questions: [6,7,8,9,10], icon: "🖼️" },
      "Short Conversations": { questions: [11,12,13,14,15], icon: "💬" },
      "Writer Interview": { questions: [16,17,18,19,20], icon: "🎤" },
      "Note Completion": { questions: [21,22,23,24,25], icon: "📝" },
      "Musician Interview": { questions: [26,27,28,29,30], icon: "🎧" }
    }
  };

  // Section definitions for answer details
  const testSections: Record<string, Array<{ name: string; icon: string; questions: number[] }>> = {
    'Cambridge Reading 25': [
      { name: "Part 1: Vocabulary & Context", icon: "📚", questions: [1,2,3,4,5,6,7,8] },
      { name: "Part 2: Reading Comprehension", icon: "📖", questions: [9,10,11,12,13] },
      { name: "Part 3: Matching Paragraphs", icon: "🔍", questions: [14,15,16,17,18] },
      { name: "Part 4: Grammar & Gap Fill", icon: "✍️", questions: [19,20,21,22,23,24,25,26] },
      { name: "Part 5: Detailed Comprehension", icon: "🎯", questions: [27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42] }
    ],
    'Cambridge Listening Test 1': CAMBRIDGE_LISTENING_TEST_1_SECTIONS,
  };

  // Action plans for improvement
  const actionPlans: Record<string, { title: string; tips: string[] }> = {
    "Vocabulary & Context": {
      title: "Build Your Vocabulary",
      tips: ["Read for 15-20 minutes daily", "Create flashcards for new words", "Use new words in your own writing"]
    },
    "Reading Comprehension": {
      title: "Strengthen Reading Skills",
      tips: ["Read questions first before the passage", "Underline keywords in questions", "Practice summarizing paragraphs"]
    },
    "Scanning & Matching": {
      title: "Improve Scanning Technique",
      tips: ["Practice finding specific names and dates", "Identify topic sentences", "Look for synonyms"]
    },
    "Grammar & Structure": {
      title: "Master Grammar Patterns",
      tips: ["Review preposition rules", "Study common collocations", "Read the complete sentence before answering"]
    },
    "Detailed Analysis": {
      title: "Develop Analytical Reading",
      tips: ["Pay attention to contrast words", "Be skeptical of extreme answers", "Find evidence in the text"]
    },
    "Picture Selection": {
      title: "Improve Visual Listening",
      tips: ["Study all pictures before audio plays", "Note key differences between options", "Listen for specific details"]
    },
    "Picture Selection 1": {
      title: "Improve Visual Listening",
      tips: ["Compare the three pictures before the recording", "Circle the detail that changes between options", "Listen for corrections and contrasts"]
    },
    "Picture Selection 2": {
      title: "Improve Visual Listening",
      tips: ["Compare the three pictures before the recording", "Circle the detail that changes between options", "Listen for corrections and contrasts"]
    },
    "Short Conversations": {
      title: "Find the Speaker's Main Point",
      tips: ["Read the question before listening", "Listen beyond matching words", "Use the speaker's final decision or opinion"]
    },
    "Writer Interview": {
      title: "Follow Extended Interviews",
      tips: ["Track one question at a time", "Listen for reasons and attitudes", "Watch for distractors that are mentioned then rejected"]
    },
    "Note Completion": {
      title: "Strengthen Note Completion",
      tips: ["Predict whether the gap needs a time, place, or object", "Write the exact word you hear", "Check spelling and singular/plural forms"]
    },
    "Musician Interview": {
      title: "Follow Extended Interviews",
      tips: ["Underline the difference between options", "Listen for paraphrases", "Choose the answer that matches the whole response"]
    },
    "Multiple Choice": {
      title: "Master MCQ Listening",
      tips: ["Read all options before listening", "Eliminate obviously wrong answers", "Listen for synonyms"]
    },
    "Form Completion": {
      title: "Improve Note-Taking",
      tips: ["Predict what type of word is needed", "Pay attention to spelling", "Listen for numbers and names"]
    },
    "Interview Comprehension": {
      title: "Understand Conversations",
      tips: ["Focus on the speaker's main point", "Listen for opinion words", "Note changes in tone"]
    },
    "Speaker Matching": {
      title: "Match Speakers Accurately",
      tips: ["Listen for key phrases", "Match feelings/opinions to speakers", "Don't be confused by similar content"]
    }
  };

  // Load Cambridge test scores for teacher's school (school-isolated)
  const loadCambridgeScores = async () => {
    setCambridgeLoading(true);
    try {
      // Use hardened RPC only (no direct table fallback)
      const { data, error } = await supabase.rpc('get_school_cambridge_scores', { p_limit: 500 });

      if (error) {
        throw error;
      }

      if (!Array.isArray(data)) {
        throw new Error('Invalid Cambridge scores response from get_school_cambridge_scores');
      }

      const scores = data || [];
      setCambridgeScores(scores);
      calculateCambridgeStats(scores);
    } catch (error) {
      console.error('Failed to fetch Cambridge scores:', error);
      setCambridgeScores([]);
      calculateCambridgeStats([]);
      brainsAlert(
        'Unable to load Cambridge scores because the secure school-scoped RPC failed. Please contact your admin.',
        'error'
      );
    } finally {
      setCambridgeLoading(false);
    }
  };

  // Helper to calculate Cambridge stats
  const calculateCambridgeStats = (scores: any[]) => {
    if (scores.length > 0) {
      const avgPercentage = Math.round(scores.reduce((sum, s) => sum + (s.percentage || 0), 0) / scores.length);
      const sorted = [...scores].sort((a, b) => b.percentage - a.percentage);
      const highestScore = sorted[0] ? { name: sorted[0].student_name, percentage: sorted[0].percentage } : null;
      const lowestScore = sorted[sorted.length - 1] ? { name: sorted[sorted.length - 1].student_name, percentage: sorted[sorted.length - 1].percentage } : null;
      
      // Class stats
      const classStats: Record<string, { count: number; avg: number; total: number }> = {};
      scores.forEach(s => {
        const cls = s.student_class || 'Unknown';
        if (!classStats[cls]) classStats[cls] = { count: 0, avg: 0, total: 0 };
        classStats[cls].count++;
        classStats[cls].total += s.percentage || 0;
      });
      Object.keys(classStats).forEach(cls => {
        classStats[cls].avg = Math.round(classStats[cls].total / classStats[cls].count);
      });

      setCambridgeStats({
        totalSubmissions: scores.length,
        avgPercentage,
        highestScore,
        lowestScore,
        classStats
      });
    } else {
      setCambridgeStats({
        totalSubmissions: 0,
        avgPercentage: 0,
        highestScore: null,
        lowestScore: null,
        classStats: {}
      });
    }
    
    // Calculate score release stats
    const releaseStatsMap = new Map<string, { released: number; unreleased: number }>();
    scores.forEach(s => {
      const qn = s.quiz_name;
      if (!releaseStatsMap.has(qn)) {
        releaseStatsMap.set(qn, { released: 0, unreleased: 0 });
      }
      const stat = releaseStatsMap.get(qn)!;
      if (s.scores_released) {
        stat.released++;
      } else {
        stat.unreleased++;
      }
    });
    setScoreReleaseStats(
      Array.from(releaseStatsMap.entries()).map(([quizName, { released, unreleased }]) => ({
        quizName,
        releasedCount: released,
        unreleasedCount: unreleased
      }))
    );
  };

  // Teacher releases are scoped to a real assigned class.
  const loadTestVisibilitySettings = async () => {
    // Opening the manager triggers the authoritative catalog effect above.
  };

  const toggleTestVisibility = async (
    classId: string,
    testId: string,
    currentVisibility: boolean
  ) => {
    const newVisibility = !currentVisibility;
    try {
      const { data, error } = await supabase.rpc('set_teacher_cambridge_class_visibility', {
        p_class_id: classId,
        p_test_id: testId,
        p_is_visible: newVisibility,
      });
      if (error) throw error;
      if (!data?.success) {
        brainsAlert(data?.error || 'Unable to update this class release.', 'error');
        return;
      }
      setTestVisibilitySettings(prev => {
        const next = new Map(prev);
        next.set(`${classId}|${testId}`, newVisibility);
        return next;
      });
      setVisibilityTestsData(prev => prev.map((test: any) =>
        test.class_id === classId && test.test_id === testId
          ? { ...test, teacher_released: newVisibility }
          : test
      ));
    } catch (error: any) {
      console.error('Exception updating Cambridge class release:', error);
      brainsAlert(error?.message || 'Unable to update this class release.', 'error');
    }
  };

  const bulkSetTestVisibility = async (
    classId: string,
    testIds: string[],
    visibility: boolean
  ) => {
    try {
      const { data, error } = await supabase.rpc('bulk_set_teacher_cambridge_class_visibility', {
        p_class_id: classId,
        p_test_ids: testIds,
        p_is_visible: visibility,
      });
      if (error) throw error;
      if (!data?.success) {
        brainsAlert(data?.error || 'Unable to update these class releases.', 'error');
        return;
      }
      const ids = new Set(testIds);
      setTestVisibilitySettings(prev => {
        const next = new Map(prev);
        testIds.forEach(id => next.set(`${classId}|${id}`, visibility));
        return next;
      });
      setVisibilityTestsData(prev => prev.map((test: any) =>
        test.class_id === classId && ids.has(test.test_id)
          ? { ...test, teacher_released: visibility }
          : test
      ));
      brainsAlert(
        visibility
          ? `Released ${data.updated_count} test(s) to this class.`
          : `Hid ${data.updated_count} test(s) from this class.`,
        'success'
      );
    } catch (error: any) {
      console.error('Exception bulk updating Cambridge class releases:', error);
      brainsAlert(error?.message || 'Unable to update these class releases.', 'error');
    }
  };

  // ── School-Level Visibility Handlers  // ── School-Level Visibility Handlers ──────────────────────────────────

  const loadSchoolVisibility = async () => {
    setSchoolVisibilityLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_school_cambridge_test_visibility_settings');
      if (error) {
        console.error('Failed to load school visibility:', error);
        brainsAlert('Unable to load school test visibility settings.', 'error');
        return;
      }
      setSchoolVisibility(data || []);
    } catch (err) {
      console.error('Exception loading school visibility:', err);
      brainsAlert('Unable to load school test visibility settings.', 'error');
    } finally {
      setSchoolVisibilityLoading(false);
    }
  };

  const toggleSchoolTestVisibility = async (testId: string, currentlyVisible: boolean) => {
    try {
      const { data, error } = await supabase.rpc('set_school_cambridge_test_visibility', {
        p_test_id: testId,
        p_is_visible: !currentlyVisible,
      });
      if (error) {
        console.error('Toggle error:', error);
        brainsAlert('Unable to update test visibility: ' + error.message, 'error');
        return;
      }
      if (data && !data.success) {
        brainsAlert(data.error || 'Unable to update visibility.', 'error');
        return;
      }
      setSchoolVisibility(prev => prev.map(t =>
        t.test_id === testId ? { ...t, is_visible: !currentlyVisible } : t
      ));
    } catch (err) {
      console.error('Exception toggling school visibility:', err);
      brainsAlert('Unable to update test visibility.', 'error');
    }
  };

  const bulkSetSchoolVisibility = async (testIds: string[], isVisible: boolean) => {
    try {
      const { data, error } = await supabase.rpc('bulk_set_school_cambridge_test_visibility', {
        p_test_ids: testIds,
        p_is_visible: isVisible,
      });
      if (error) {
        console.error('Bulk toggle error:', error);
        brainsAlert('Unable to bulk update visibility: ' + error.message, 'error');
        return;
      }
      if (data && !data.success) {
        brainsAlert(data.error || 'Unable to update visibility.', 'error');
        return;
      }
      const idSet = new Set(testIds);
      setSchoolVisibility(prev => prev.map(t =>
        idSet.has(t.test_id) ? { ...t, is_visible: isVisible } : t
      ));
    } catch (err) {
      console.error('Exception in bulk school visibility:', err);
      brainsAlert('Unable to bulk update visibility.', 'error');
    }
  };

  // Filter school visibility to teacher's assigned subjects (flexible matching)
  const teacherFilteredSchoolVisibility = useMemo(() => {
    if (schoolVisibility.length === 0) return [];
    const lowerSubjects = teacherAssignedSubjects.map(s => s.toLowerCase());
    return schoolVisibility.filter(test => {
      const testSubj = (test.subject || '').toLowerCase();
      return lowerSubjects.some(s =>
        testSubj.includes(s) || s.includes(testSubj) || testSubj.includes(s.split(' ')[0])
      );
    });
  }, [schoolVisibility, teacherAssignedSubjects]);

  const schoolVisSubjectOptions = useMemo(() =>
    Array.from(new Set(teacherFilteredSchoolVisibility.map(t => t.subject).filter(Boolean))).sort()
  , [teacherFilteredSchoolVisibility]);

  const displayedSchoolVisibility = schoolVisibilitySubjectFilter === 'all'
    ? teacherFilteredSchoolVisibility
    : teacherFilteredSchoolVisibility.filter(t => t.subject === schoolVisibilitySubjectFilter);

  // ── End School-Level Visibility Handlers ──────────────────────────────

  // Release scores for a quiz (make visible to students)
  const releaseScores = async (quizName: string, classFilter?: string) => {
    setReleasingScores(true);
    try {
      const { error } = await supabase.rpc('release_quiz_scores', {
        p_quiz_name: quizName,
        p_class: classFilter || null
      });

      if (error) {
        throw error;
      }

      brainsAlert(`Scores for ${quizName}${classFilter ? ` (${classFilter})` : ''} have been released to students.`, 'success');
      loadCambridgeScores(); // Refresh the list
    } catch (err) {
      console.error('Failed to release scores:', err);
      brainsAlert('Unable to release scores. Please try again.', 'error');
    } finally {
      setReleasingScores(false);
    }
  };

  // Hide scores for a quiz (make invisible to students again)
  const hideScores = async (quizName: string, classFilter?: string) => {
    setReleasingScores(true);
    try {
      const { error } = await supabase.rpc('hide_quiz_scores', {
        p_quiz_name: quizName,
        p_class: classFilter || null
      });

      if (error) {
        throw error;
      }

      brainsAlert(`Scores for ${quizName}${classFilter ? ` (${classFilter})` : ''} are now hidden from students.`, 'success');
      loadCambridgeScores(); // Refresh the list
    } catch (err) {
      console.error('Failed to set scores to pending:', err);
      brainsAlert('Unable to update score status. Please try again.', 'error');
    } finally {
      setReleasingScores(false);
    }
  };

  const releaseScoresByIds = async (ids: string[], successMessage: string) => {
    if (ids.length === 0) return;
    setReleasingScores(true);
    try {
      const selectedRows = cambridgeScores.filter((row) => ids.includes(row.id));
      if (selectedRows.length === 0) {
        brainsAlert('No valid attempts selected for release.', 'info');
        return;
      }

      const groupMap = new Map<string, { quizName: string; classFilter?: string }>();
      selectedRows.forEach((row) => {
        const classFilter = row.student_class || undefined;
        const key = `${row.quiz_name}::${classFilter || ''}`;
        if (!groupMap.has(key)) {
          groupMap.set(key, { quizName: row.quiz_name, classFilter });
        }
      });

      for (const group of groupMap.values()) {
        const { error } = await supabase.rpc('release_quiz_scores', {
          p_quiz_name: group.quizName,
          p_class: group.classFilter || null,
        });
        if (error) throw error;
      }

      brainsAlert(successMessage, 'success');
      setCambridgeSelectedIds([]);
      loadCambridgeScores();
    } catch (err) {
      console.error('Failed to release selected scores:', err);
      brainsAlert('Unable to release the selected scores. Please try again.', 'error');
    } finally {
      setReleasingScores(false);
    }
  };

  // Get unique quiz names and classes for filters
  const uniqueCambridgeQuizNames = [...new Set(cambridgeScores.map(s => s.quiz_name))];
  const uniqueCambridgeClasses = [...new Set([
    ...assignedCambridgeClassCodes,
    ...cambridgeScores.map(s => s.student_class || 'Unknown'),
  ])].sort();
  const uniqueCambridgeStudents = useMemo(() => {
    if (cambridgeClassFilter === 'all') return [];
    const students = cambridgeScores
      .filter(s => (s.student_class || 'Unknown') === cambridgeClassFilter)
      .map(s => s.student_name)
      .filter(Boolean);
    return [...new Set(students)].sort();
  }, [cambridgeClassFilter, cambridgeScores]);

  // Filter Cambridge scores
  const filteredCambridgeScores = useMemo(() => {
    const search = cambridgeSearchTerm.trim().toLowerCase();
    return cambridgeScores.filter(s => {
      const isWritingTest = isTeacherMarkedCambridgeTest(s.quiz_name);
      const needsMarking = isWritingTest && s.answers?.requires_marking;
      const isReleased = Boolean(s.scores_released);
      const isMarked = !needsMarking;

      if (cambridgeActiveTab !== 'all' && s.quiz_name !== cambridgeActiveTab) return false;
      if (cambridgeClassFilter !== 'all' && (s.student_class || 'Unknown') !== cambridgeClassFilter) return false;
      if (cambridgeStudentFilter !== 'all' && s.student_name !== cambridgeStudentFilter) return false;
      if (cambridgeNeedsMarkingOnly && !needsMarking) return false;
      if (cambridgeReleasedOnly && !isReleased) return false;

      if (cambridgeStatusFilters.length > 0) {
        const matchesStatus = cambridgeStatusFilters.some((status) => {
          if (status === 'Pending') return needsMarking;
          if (status === 'Marked') return isMarked;
          if (status === 'Released') return isReleased;
          return false;
        });
        if (!matchesStatus) return false;
      }

      if (search) {
        const haystack = [
          s.student_name,
          s.student_class,
          s.quiz_name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(search)) return false;
      }

      return true;
    });
  }, [
    cambridgeScores,
    cambridgeActiveTab,
    cambridgeClassFilter,
    cambridgeStudentFilter,
    cambridgeNeedsMarkingOnly,
    cambridgeReleasedOnly,
    cambridgeSearchTerm,
    cambridgeStatusFilters
  ]);

  const sortedCambridgeScores = useMemo(() => {
    const scores = [...filteredCambridgeScores];
    const getTimestamp = (score: any) => {
      if (!score?.submitted_at) return 0;
      const time = new Date(score.submitted_at).getTime();
      return Number.isNaN(time) ? 0 : time;
    };
    switch (cambridgeSort) {
      case 'highest':
        return scores.sort((a, b) => (b.percentage || 0) - (a.percentage || 0));
      case 'lowest':
        return scores.sort((a, b) => (a.percentage || 0) - (b.percentage || 0));
      case 'student-asc':
        return scores.sort((a, b) => (a.student_name || '').localeCompare(b.student_name || ''));
      case 'student-desc':
        return scores.sort((a, b) => (b.student_name || '').localeCompare(a.student_name || ''));
      case 'oldest':
        return scores.sort((a, b) => getTimestamp(a) - getTimestamp(b));
      case 'newest':
      default:
        return scores.sort((a, b) => getTimestamp(b) - getTimestamp(a));
    }
  }, [filteredCambridgeScores, cambridgeSort]);

  useEffect(() => {
    setCambridgeStudentFilter('all');
  }, [cambridgeClassFilter]);

  useEffect(() => {
    setCambridgeSelectedIds((prev) => prev.filter((id) => filteredCambridgeScores.some((score) => score.id === id)));
  }, [filteredCambridgeScores]);

  // Handle escape key to close modals
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showCambridgeReport) setShowCambridgeReport(false);
        if (showCambridgeAnswers) setShowCambridgeAnswers(false);
        if (cambridgeDrawerOpen) setCambridgeDrawerOpen(false);
        if (showWritingMarkingModal) setShowWritingMarkingModal(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCambridgeReport, showCambridgeAnswers, cambridgeDrawerOpen, showWritingMarkingModal]);

  const toggleCambridgeSelection = (id: string) => {
    setCambridgeSelectedIds((prev) => (
      prev.includes(id) ? prev.filter((selectedId) => selectedId !== id) : [...prev, id]
    ));
  };

  const toggleCambridgeSelectionAll = (ids: string[], checked: boolean) => {
    setCambridgeSelectedIds((prev) => {
      if (checked) {
        return Array.from(new Set([...prev, ...ids]));
      }
      return prev.filter((selectedId) => !ids.includes(selectedId));
    });
  };

  // Format time taken
  const formatCambridgeTime = (seconds: number) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  // Analyze skill performance for a student
  const analyzeSkillPerformance = (student: any) => {
    const quizName = student.quiz_name;
    const answers = getStudentResponses(student);
    const correct = correctAnswers[quizName] || {};
    const skills = skillCategories[quizName] || {};
    
    const result: Record<string, { correct: number; total: number; percentage: number; icon: string }> = {};
    
    Object.entries(skills).forEach(([skill, data]) => {
      let skillCorrect = 0;
      data.questions.forEach(q => {
        const expected = correct[q];
        if (expected !== undefined && isCambridgeAnswerCorrect(answers[q], expected)) skillCorrect++;
      });
      result[skill] = {
        correct: skillCorrect,
        total: data.questions.length,
        percentage: Math.round((skillCorrect / data.questions.length) * 100),
        icon: data.icon
      };
    });
    
    return result;
  };

  const normalizeAnswer = (value: unknown) => (value ?? '').toString().trim();

  const getStudentResponses = (student: any) => {
    return parseCambridgeResponses(student?.answers);
  };

  /** Normalize dash-like characters so DB names (may contain U+FFFD from
   *  Windows-1252 0x97) match answer-key names (which use U+2014 em-dash). */
  const normalizeDashes = (s: string) =>
    s.replace(/[\u2012\u2013\u2014\u2015\uFFFD]/g, '\u2014');

  const getScienceAnswerKey = (quizName: string | undefined, student?: any) => {
    if (!quizName) return {};
    if (isBiologyCambridgeQuiz(quizName)) {
      return buildBiologyAnswerKeyFromSavedMetadata(student?.answers).answerKey;
    }

    const baseName = quizName.replace(/\s*\(Part\s+\d+\)\s*/i, '').trim();
    const normalizedName = normalizeDashes(quizName);
    const normalizedBase = normalizeDashes(baseName);
    const partMatch = quizName.match(/\(Part\s+(\d+)\)/i);
    const baseKey = chemistryAnswerKeys[quizName] || chemistryAnswerKeys[baseName]
      || chemistryAnswerKeys[normalizedName] || chemistryAnswerKeys[normalizedBase] || {};
    const range = chemistryQuestionRanges[baseName] || chemistryQuestionRanges[normalizedBase];

    if (!partMatch || !range) {
      return baseKey;
    }

    const part = Number(partMatch[1]);
    const { splitIndex } = range;
    const lowerBound = part === 1 ? 1 : splitIndex + 1;
    const upperBound = part === 1 ? splitIndex : range.total;
    const filtered: Record<number, string> = {};

    Object.entries(baseKey).forEach(([q, ans]) => {
      const questionNumber = Number(q);
      if (questionNumber >= lowerBound && questionNumber <= upperBound) {
        filtered[questionNumber] = ans;
      }
    });

    return filtered;
  };

  const buildResponseSummary = (student: any, answerKey: Record<number, CambridgeExpectedAnswer>) => {
    const responses = getStudentResponses(student);
    const totalQuestions = student?.total_questions || Object.keys(answerKey).length || 0;
    let correctCount = student?.score || 0;
    let unansweredCount = 0;
    let wrongCount = 0;
    const details: Array<{ q: number; studentAns: string; correctAns: string; status: 'correct' | 'wrong' | 'unanswered' | 'answered' }> = [];

    if (Object.keys(answerKey).length > 0) {
      // Detect legacy submissions where Part 2 responses were stored with local 1-N keys
      // instead of global question numbers (before the originalNumber fix was deployed).
      const akKeys = Object.keys(answerKey).map(Number);
      const minAkKey = Math.min(...akKeys);
      const responsesHaveAkKeys = akKeys.some(k => (responses[k] ?? '') !== '');
      const responsesHaveLocalKeys = Object.keys(responses).some(
        k => Number(k) < minAkKey && (responses[k] ?? '') !== ''
      );
      const isLegacyLocalFormat = minAkKey > 1 && !responsesHaveAkKeys && responsesHaveLocalKeys;

      if (isLegacyLocalFormat) {
        // Can't map local keys back to global questions (questions were shuffled randomly).
        // Fall back to the stored score; show answers using local keys without per-question key.
        correctCount = student?.score || 0;
        unansweredCount = 0;
        for (let i = 1; i <= totalQuestions; i++) {
          const studentAns = normalizeAnswer(responses[i] ?? '');
          if (!studentAns) {
            unansweredCount++;
            details.push({ q: i, studentAns: '—', correctAns: '—', status: 'unanswered' });
          } else {
            details.push({ q: i, studentAns, correctAns: '—', status: 'answered' });
          }
        }
        wrongCount = Math.max(totalQuestions - correctCount - unansweredCount, 0);
      } else {
        correctCount = 0;
        Object.entries(answerKey).forEach(([qStr, expectedAnswer]) => {
          const q = Number(qStr);
          const studentAns = normalizeAnswer(responses[q] ?? '');
          const correctAns = getPrimaryCambridgeAnswer(expectedAnswer);

          if (!studentAns) {
            unansweredCount++;
            details.push({ q, studentAns: '—', correctAns: correctAns || '—', status: 'unanswered' });
            return;
          }

          if (isCambridgeAnswerCorrect(studentAns, expectedAnswer)) {
            correctCount++;
            details.push({ q, studentAns, correctAns: correctAns || '—', status: 'correct' });
            return;
          }

          wrongCount++;
          details.push({ q, studentAns, correctAns: correctAns || '—', status: 'wrong' });
        });
      }
    } else if (totalQuestions > 0) {
      for (let q = 1; q <= totalQuestions; q += 1) {
        const studentAns = normalizeAnswer(responses[q] ?? '');
        if (!studentAns) {
          unansweredCount++;
        }
      }
      wrongCount = Math.max(totalQuestions - correctCount - unansweredCount, 0);
      for (let q = 1; q <= totalQuestions; q += 1) {
        const studentAns = normalizeAnswer(responses[q] ?? '');
        const status = !studentAns ? 'unanswered' : 'answered';
        details.push({ q, studentAns: studentAns || '—', correctAns: '—', status });
      }
    }

    return { correctCount, wrongCount, unansweredCount, totalQuestions, details };
  };

  const getGeneralActionPlan = (student: any, summary: { correctCount: number; wrongCount: number; unansweredCount: number; totalQuestions: number }) => {
    const percentage = student?.percentage ?? 0;
    const name = student?.student_name || 'this student';
    const total = summary.totalQuestions || student?.total_questions || 0;
    const unanswered = summary.unansweredCount;
    const wrong = summary.wrongCount;

    if (percentage < 40) {
      return {
        title: `Start with the foundations, ${name.split(' ')[0] || name}`,
        tips: [
          `Revisit the key concepts from the chapter notes before retrying (${wrong} incorrect).`,
          unanswered > 0 ? `Complete the ${unanswered} unanswered questions and check each option carefully.` : 'Attempt every question and avoid leaving blanks.',
          `Practice 10–15 mixed questions daily until accuracy improves.`
        ]
      };
    }

    if (percentage < 60) {
      return {
        title: 'Strengthen core understanding',
        tips: [
          `Review the most missed ideas and summarize them in your own words.`,
          unanswered > 0 ? `Focus on completing all questions (you skipped ${unanswered}/${total}).` : 'Work on speed so you can attempt every question.',
          'Redo similar questions and check why each option is correct or incorrect.'
        ]
      };
    }

    return {
      title: 'Keep building momentum',
      tips: [
        'Target the remaining weak topics with focused practice.',
        'Explain each answer aloud to confirm the reasoning.',
        'Maintain a steady revision schedule before the next test.'
      ]
    };
  };

  // Get grade based on percentage
  const getGrade = (percentage: number) => {
    if (percentage >= 90) return 'A+';
    if (percentage >= 80) return 'A';
    if (percentage >= 70) return 'B';
    if (percentage >= 60) return 'C';
    if (percentage >= 50) return 'D';
    return 'F';
  };

  // Get encouragement based on grade
  const getEncouragement = (grade: string) => {
    switch (grade) {
      case 'A+': return { title: "🌟 Outstanding Achievement!", message: "You've mastered this material! Keep challenging yourself with advanced content." };
      case 'A': return { title: "🎯 Excellent Work!", message: "You're performing at a high level. Focus on the few areas that need polish." };
      case 'B': return { title: "👍 Good Progress!", message: "You have a solid foundation. Target your weak areas for improvement." };
      case 'C': return { title: "📈 Room to Grow", message: "You're on the right track. More practice will boost your scores." };
      case 'D': return { title: "💪 Keep Pushing!", message: "Don't give up! Focus on understanding core concepts." };
      default: return { title: "🚀 Start Your Journey", message: "Every expert was once a beginner. Let's work on building your skills." };
    }
  };

  // Open report modal
  const openCambridgeReport = (student: any) => {
    setSelectedCambridgeStudent(student);
    setShowCambridgeReport(true);
  };

  // Open student overview report (general report for a student across all tests)
  const openStudentOverviewReport = (studentName: string) => {
    const studentScores = cambridgeScores.filter(s => s.student_name === studentName);
    if (studentScores.length === 0) return;

    const tests: StudentTestEntry[] = studentScores.map(s => ({
      id: s.id,
      quizName: s.quiz_name,
      score: s.score || 0,
      totalQuestions: s.total_questions || 0,
      percentage: s.percentage || 0,
      grade: getGradeFromPercentage(s.percentage || 0),
      submittedAt: s.submitted_at,
      timeTakenSeconds: s.time_taken_seconds,
    }));

    const avgPercentage = Math.round(tests.reduce((sum, t) => sum + t.percentage, 0) / tests.length);
    const sorted = [...tests].sort((a, b) => b.percentage - a.percentage);

    const overviewData: StudentOverviewReportData = {
      studentName,
      studentClass: studentScores[0]?.student_class || undefined,
      tests,
      averagePercentage: avgPercentage,
      averageGrade: getGradeFromPercentage(avgPercentage),
      totalTestsTaken: tests.length,
      bestScore: sorted[0] || null,
      worstScore: sorted[sorted.length - 1] || null,
      schoolName: profile.school_name || teacher?.school_name || undefined,
      schoolLogoUrl: profile.school_logo_url,
      schoolId: profile.school_id,
    };

    setStudentOverviewData(overviewData);
    setShowStudentOverviewReport(true);
  };

  // Open answers modal
  const openCambridgeAnswers = (student: any) => {
    setSelectedCambridgeStudent(student);
    setShowCambridgeAnswers(true);
  };

  // Open writing marking modal
  const openWritingMarking = (student: any) => {
    setSelectedCambridgeStudent(student);
    if (isTravelTourismCambridgeTest(student.quiz_name)) {
      setTravelTourismMark(student.answers?.marks?.total ?? student.score ?? 0);
      setTravelTourismFeedback(student.answers?.feedback?.teacher_comment || '');
      setTravelTourismAiSuggestion(student.answers?.ai_marking_suggestion || null);
      setShowWritingMarkingModal(true);
      return;
    }
    // Reset marks or load existing marks if already marked
    if (student.percentage > 0 && student.answers?.marks) {
      setWritingMarks(student.answers.marks);
    } else {
      setWritingMarks({
        part1: { content: 0, organisation: 0, language: 0 },
        part2: { content: 0, communicativeAchievement: 0, organisation: 0, language: 0 },
      });
    }
    // Load existing feedback if available (including GPT fields)
    if (student.answers?.feedback) {
      const existingFeedback = student.answers.feedback;
      setWritingFeedback({
        part1: {
          feedback: existingFeedback.part1?.feedback || '',
          correctedVersion: existingFeedback.part1?.correctedVersion || '',
          spellingMistakes: existingFeedback.part1?.spellingMistakes || [],
          grammarMistakes: existingFeedback.part1?.grammarMistakes || [],
          markJustifications: existingFeedback.part1?.markJustifications,
          modelAnswer: existingFeedback.part1?.modelAnswer,
        },
        part2: {
          feedback: existingFeedback.part2?.feedback || '',
          correctedVersion: existingFeedback.part2?.correctedVersion || '',
          spellingMistakes: existingFeedback.part2?.spellingMistakes || [],
          grammarMistakes: existingFeedback.part2?.grammarMistakes || [],
          markJustifications: existingFeedback.part2?.markJustifications
            ? {
                ...existingFeedback.part2.markJustifications,
                communicativeAchievement: sanitizeCommunicativeAchievementText(
                  existingFeedback.part2.markJustifications.communicativeAchievement,
                  'Communicative Achievement feedback was unavailable. Please review manually.',
                ),
              }
            : undefined,
          modelAnswer: existingFeedback.part2?.modelAnswer,
        },
        overallComments: existingFeedback.overallComments || '',
        releasedToStudent: existingFeedback.releasedToStudent || false,
      });
    } else {
      setWritingFeedback({
        part1: { feedback: '', correctedVersion: '' },
        part2: { feedback: '', correctedVersion: '' },
        overallComments: '',
        releasedToStudent: false,
      });
    }
    setShowWritingMarkingModal(true);
  };

  const openCambridgeDrawer = useCallback((attempt: any) => {
    setCambridgeDrawerAttempt(attempt);
    setCambridgeDrawerOpen(true);
  }, []);

  const closeCambridgeDrawer = useCallback(() => {
    setCambridgeDrawerOpen(false);
  }, []);

  const openCambridgeRetake = useCallback((attempt: any) => {
    setCambridgeRetakeAttempt(attempt);
    setCambridgeRetakeReason('');
    setCambridgeRetakeError(null);
  }, []);

  const closeCambridgeRetake = useCallback(() => {
    if (cambridgeRetakeSubmitting) return;
    setCambridgeRetakeAttempt(null);
    setCambridgeRetakeReason('');
    setCambridgeRetakeError(null);
  }, [cambridgeRetakeSubmitting]);

  const allowCambridgeRetake = async () => {
    if (!cambridgeRetakeAttempt?.id || cambridgeRetakeSubmitting) return;
    setCambridgeRetakeSubmitting(true);
    setCambridgeRetakeError(null);
    try {
      const { data, error } = await supabase.rpc('allow_cambridge_retake', {
        p_score_id: cambridgeRetakeAttempt.id,
        p_reason: cambridgeRetakeReason.trim() || null,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Unable to allow this retake.');

      setCambridgeSelectedIds(prev => prev.filter(id => id !== cambridgeRetakeAttempt.id));
      setCambridgeRetakeAttempt(null);
      setCambridgeRetakeReason('');
      setCambridgeDrawerOpen(false);
      setCambridgeDrawerAttempt(null);
      await loadCambridgeScores();
      brainsAlert(
        `Retake allowed for ${data.student_name}. The original attempt was preserved in history.`,
        'success'
      );
    } catch (error: any) {
      console.error('Failed to allow Cambridge retake:', error);
      setCambridgeRetakeError(error?.message || 'Unable to allow this retake.');
    } finally {
      setCambridgeRetakeSubmitting(false);
    }
  };

  useEffect(() => {
    if (!cambridgeDrawerOpen || cambridgeRetakeAttempt) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCambridgeDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cambridgeDrawerOpen, cambridgeRetakeAttempt]);

  useEffect(() => {
    if (!cambridgeRetakeAttempt) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeCambridgeRetake();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cambridgeRetakeAttempt, closeCambridgeRetake]);

  const buildMarkSet = (
    suggestedMarks: Record<string, unknown> | undefined,
    existingMarks: { content?: number; organisation?: number; language?: number; communicativeAchievement?: number } = {},
    isPart1: boolean = false,
  ) => {
    const fallback = (value: unknown, existing: number | undefined) =>
      typeof value === 'number' && Number.isFinite(value) ? value : (existing ?? DEFAULT_WRITING_MARK);

    const base = {
      content: fallback(suggestedMarks?.content, existingMarks.content),
      organisation: fallback(suggestedMarks?.organisation, existingMarks.organisation),
      language: fallback(suggestedMarks?.language, existingMarks.language),
    };

    if (isPart1) return base;

    return {
      ...base,
      communicativeAchievement: fallback(
        suggestedMarks?.communicativeAchievement,
        existingMarks.communicativeAchievement,
      ),
    };
  };

  const sanitizePart2Feedback = (part2: any) => {
    const markJustifications = part2?.markJustifications && typeof part2.markJustifications === 'object'
      ? {
          ...part2.markJustifications,
          communicativeAchievement: sanitizeCommunicativeAchievementText(
            part2.markJustifications.communicativeAchievement,
            'Communicative Achievement feedback was unavailable. Please review manually.',
          ),
        }
      : part2?.markJustifications;

    return {
      ...part2,
      markJustifications,
    };
  };

  // Submit writing marks
  const submitWritingMarks = async (releaseToStudent: boolean = false) => {
    if (!selectedCambridgeStudent) {
      brainsAlert('Please select a student before proceeding.', 'info');
      return;
    }
    
    setSavingMarks(true);
    
    const part1Total = writingMarks.part1.content + writingMarks.part1.organisation + writingMarks.part1.language;
    const part2Total = writingMarks.part2.content + writingMarks.part2.communicativeAchievement + 
                       writingMarks.part2.organisation + writingMarks.part2.language;
    const totalScore = part1Total + part2Total;
    const maxScore = 35; // 15 for Part 1 + 20 for Part 2
    const percentage = Math.round((totalScore / maxScore) * 100);
    
    const updatedFeedback = {
      ...writingFeedback,
      part2: sanitizePart2Feedback(writingFeedback.part2),
      releasedToStudent: releaseToStudent,
    };

    console.log('=== SAVE WRITING MARKS ===');
    console.log('Student ID:', selectedCambridgeStudent.id);
    console.log('Student Name:', selectedCambridgeStudent.student_name);
    console.log('Total score:', totalScore, 'Percentage:', percentage);
    console.log('Release to student:', releaseToStudent);
    console.log('Writing feedback has spellingMistakes:', writingFeedback.part1?.spellingMistakes?.length || 0, 'for part1');
    console.log('Writing feedback has grammarMistakes:', writingFeedback.part1?.grammarMistakes?.length || 0, 'for part1');
    
    try {
      const updatePayload = {
        score: totalScore,
        percentage: percentage,
        answers: {
          ...selectedCambridgeStudent.answers,
          marks: writingMarks,
          feedback: updatedFeedback,
          marked_by: profile.username,
          marked_at: new Date().toISOString(),
          requires_marking: false  // This is the key field that removes "Pending" status
        }
      };
      
      console.log('Update payload:', JSON.stringify(updatePayload, null, 2));
      
      let markQuery = supabase
        .from('quiz_scores')
        .update(updatePayload)
        .eq('id', selectedCambridgeStudent.id);
      
      // Defense-in-depth: scope to own school
      if (profile.school_id) {
        markQuery = markQuery.eq('school_id', profile.school_id);
      }
      
      const { data, error } = await markQuery.select();
      
      if (error) {
        console.error('Supabase UPDATE error:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        console.error('Error details:', error.details);
        console.error('Error hint:', error.hint);
        throw error;
      }
      
      console.log('Update successful!');
      console.log('Returned data:', data);
      
      if (!data || data.length === 0) {
        console.warn('Update returned no data - this might indicate no rows were updated (RLS issue?)');
      }
      
      brainsAlert(releaseToStudent 
        ? 'Writing has been marked and released to the student.' 
        : 'Writing has been marked successfully. (Not yet visible to student)', 'success');
      setShowWritingMarkingModal(false);
      loadCambridgeScores(); // Refresh the list
    } catch (error: any) {
      console.error('Failed to submit marks:', error);
      
      // Check for RLS permission error
      if (error?.code === '42501' || error?.message?.includes('permission') || error?.message?.includes('policy')) {
        brainsAlert('Permission denied. The required database migration (ADD_QUIZ_SCORES_UPDATE_POLICY.sql) has not been applied yet.', 'error');
      } else {
        brainsAlert('Unable to submit marks: ' + (error instanceof Error ? error.message : String(error)), 'error');
      }
    } finally {
      setSavingMarks(false);
    }
  };

  // Detailed teacher-style proofreading function
  const proofreadText = (text: string, wordTarget: string, isPart1: boolean): {
    feedback: string;
    correctedVersion: string;
    suggestedMarks: Record<string, number>;
  } => {
    const originalText = text;
    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    // Spelling corrections dictionary with explanations
    const spellingFixes: { pattern: RegExp; correct: string; why: string }[] = [
      { pattern: /\bhelo\b/gi, correct: 'hello', why: 'Missing an "l"' },
      { pattern: /\bhelllo\b/gi, correct: 'hello', why: 'Extra "l"' },
      { pattern: /\bteh\b/gi, correct: 'the', why: 'Letters in wrong order' },
      { pattern: /\bwiht\b/gi, correct: 'with', why: 'Letters in wrong order' },
      { pattern: /\bfreind\b/gi, correct: 'friend', why: '"i" before "e" except after "c"' },
      { pattern: /\brecieve\b/gi, correct: 'receive', why: '"i" before "e" except after "c"' },
      { pattern: /\bbecouse\b/gi, correct: 'because', why: 'Incorrect spelling' },
      { pattern: /\bbeacuse\b/gi, correct: 'because', why: 'Letters in wrong order' },
      { pattern: /\bbecuase\b/gi, correct: 'because', why: 'Letters in wrong order' },
      { pattern: /\bdefinately\b/gi, correct: 'definitely', why: 'Common misspelling - remember "finite"' },
      { pattern: /\bdefintely\b/gi, correct: 'definitely', why: 'Missing letters' },
      { pattern: /\bintresting\b/gi, correct: 'interesting', why: 'Missing "e"' },
      { pattern: /\bintersting\b/gi, correct: 'interesting', why: 'Missing "e"' },
      { pattern: /\brealy\b/gi, correct: 'really', why: 'Missing "l"' },
      { pattern: /\breallly\b/gi, correct: 'really', why: 'Extra "l"' },
      { pattern: /\bbeautifull\b/gi, correct: 'beautiful', why: 'Only one "l" at the end' },
      { pattern: /\bbeatiful\b/gi, correct: 'beautiful', why: 'Missing "u"' },
      { pattern: /\balot\b/gi, correct: 'a lot', why: 'Should be two words' },
      { pattern: /\bthier\b/gi, correct: 'their', why: '"e" before "i"' },
      { pattern: /\bwierd\b/gi, correct: 'weird', why: '"e" before "i" (exception to rule)' },
      { pattern: /\buntill\b/gi, correct: 'until', why: 'Only one "l"' },
      { pattern: /\boccured\b/gi, correct: 'occurred', why: 'Double "r"' },
      { pattern: /\bseperate\b/gi, correct: 'separate', why: '"a" not "e" in the middle' },
      { pattern: /\bneccessary\b/gi, correct: 'necessary', why: 'One "c", double "s"' },
      { pattern: /\bnecesary\b/gi, correct: 'necessary', why: 'Double "s"' },
      { pattern: /\baccomodate\b/gi, correct: 'accommodate', why: 'Double "c" and double "m"' },
      { pattern: /\btommorow\b/gi, correct: 'tomorrow', why: 'One "m", double "r"' },
      { pattern: /\btomorow\b/gi, correct: 'tomorrow', why: 'Double "r"' },
      { pattern: /\bwich\b/gi, correct: 'which', why: 'Missing "h"' },
      { pattern: /\bwher\b/gi, correct: 'where', why: 'Missing "e"' },
      { pattern: /\bnex\b/gi, correct: 'next', why: 'Missing "t"' },
      { pattern: /\bmatch\b(?=\s+(cost|money|it))/gi, correct: 'much', why: '"match" ≠ "much"' },
      { pattern: /\bpictshars\b/gi, correct: 'pictures', why: 'Incorrect spelling' },
      { pattern: /\bpicters\b/gi, correct: 'pictures', why: 'Missing "u"' },
      { pattern: /\bphotograpy\b/gi, correct: 'photography', why: 'Missing "h"' },
      { pattern: /\bohotography\b/gi, correct: 'photography', why: 'Letters in wrong order' },
      { pattern: /\btakeing\b/gi, correct: 'taking', why: 'Remove the "e" before "-ing"' },
      { pattern: /\bcomeing\b/gi, correct: 'coming', why: 'Remove the "e" before "-ing"' },
      { pattern: /\bwriteing\b/gi, correct: 'writing', why: 'Remove the "e" before "-ing"' },
      { pattern: /\bhaveing\b/gi, correct: 'having', why: 'Remove the "e" before "-ing"' },
      { pattern: /\bloveing\b/gi, correct: 'loving', why: 'Remove the "e" before "-ing"' },
      { pattern: /\bdint\b/gi, correct: "didn't / don't", why: '"dint" is not a word' },
      { pattern: /\bwanna\b/gi, correct: 'want to', why: 'Informal - use "want to" in formal writing' },
      { pattern: /\bgonna\b/gi, correct: 'going to', why: 'Informal - use "going to" in formal writing' },
      { pattern: /\bgotta\b/gi, correct: 'got to / have to', why: 'Informal - use "have to" in formal writing' },
      { pattern: /\bppl\b/gi, correct: 'people', why: 'Avoid abbreviations in formal writing' },
      { pattern: /\bu\b/gi, correct: 'you', why: 'Avoid text-speak in formal writing' },
      { pattern: /\bur\b/gi, correct: 'your / you\'re', why: 'Avoid text-speak in formal writing' },
      { pattern: /\br\b(?=\s)/gi, correct: 'are', why: 'Avoid text-speak in formal writing' },
      { pattern: /\bshoping\b/gi, correct: 'shopping', why: 'Double "p"' },
      { pattern: /\bexperiance\b/gi, correct: 'experience', why: '"e" not "a"' },
      { pattern: /\bexpirence\b/gi, correct: 'experience', why: 'Incorrect spelling' },
    ];
    
    // Grammar fixes with contractions
    const grammarFixes: { pattern: RegExp; correct: string; why: string }[] = [
      { pattern: /\bdont\b/gi, correct: "don't", why: 'Missing apostrophe' },
      { pattern: /\bcant\b/gi, correct: "can't", why: 'Missing apostrophe' },
      { pattern: /\bwont\b/gi, correct: "won't", why: 'Missing apostrophe' },
      { pattern: /\bdidnt\b/gi, correct: "didn't", why: 'Missing apostrophe' },
      { pattern: /\bisnt\b/gi, correct: "isn't", why: 'Missing apostrophe' },
      { pattern: /\barent\b/gi, correct: "aren't", why: 'Missing apostrophe' },
      { pattern: /\bwasnt\b/gi, correct: "wasn't", why: 'Missing apostrophe' },
      { pattern: /\bwerent\b/gi, correct: "weren't", why: 'Missing apostrophe' },
      { pattern: /\bhasnt\b/gi, correct: "hasn't", why: 'Missing apostrophe' },
      { pattern: /\bhavent\b/gi, correct: "haven't", why: 'Missing apostrophe' },
      { pattern: /\bwouldnt\b/gi, correct: "wouldn't", why: 'Missing apostrophe' },
      { pattern: /\bcouldnt\b/gi, correct: "couldn't", why: 'Missing apostrophe' },
      { pattern: /\bshouldnt\b/gi, correct: "shouldn't", why: 'Missing apostrophe' },
      { pattern: /\bits\b(?=\s+(a\s+)?(good|great|nice|bad|important|better|worse|easy|hard|difficult))/gi, correct: "it's", why: '"it\'s" = "it is"' },
      { pattern: /\byoure\b/gi, correct: "you're", why: '"you\'re" = "you are"' },
      { pattern: /\btheyre\b/gi, correct: "they're", why: '"they\'re" = "they are"' },
      { pattern: /\bwere\b(?=\s+(going|coming|doing|making|leaving|taking))/gi, correct: "we're", why: '"we\'re" = "we are"' },
      { pattern: /\bcould of\b/gi, correct: 'could have', why: '"of" sounds like "have" but is incorrect' },
      { pattern: /\bwould of\b/gi, correct: 'would have', why: '"of" sounds like "have" but is incorrect' },
      { pattern: /\bshould of\b/gi, correct: 'should have', why: '"of" sounds like "have" but is incorrect' },
    ];
    
    // Find spelling mistakes
    const spellingMistakes: { wrong: string; correct: string; why: string }[] = [];
    let correctedText = text;
    
    spellingFixes.forEach(({ pattern, correct, why }) => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          if (!spellingMistakes.find(m => m.wrong.toLowerCase() === match.toLowerCase())) {
            spellingMistakes.push({ wrong: match, correct, why });
          }
        });
        correctedText = correctedText.replace(pattern, correct);
      }
    });
    
    // Find grammar mistakes
    const grammarMistakes: { wrong: string; correct: string; why: string }[] = [];
    
    grammarFixes.forEach(({ pattern, correct, why }) => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          if (!grammarMistakes.find(m => m.wrong.toLowerCase() === match.toLowerCase())) {
            grammarMistakes.push({ wrong: match, correct, why });
          }
        });
        correctedText = correctedText.replace(pattern, correct);
      }
    });
    
    // Check for lowercase "i"
    const lowercaseI = text.match(/\bi\b(?![''])/g);
    if (lowercaseI) {
      grammarMistakes.push({ wrong: 'i', correct: 'I', why: 'Pronoun "I" is always capitalized' });
      correctedText = correctedText.replace(/\bi\b(?![''])/g, 'I');
    }
    
    // Check for uncapitalized city/country names
    const commonPlaces = ['paris', 'london', 'tokyo', 'england', 'france', 'america', 'china', 'spain', 'italy', 'germany'];
    commonPlaces.forEach(place => {
      const regex = new RegExp(`\\b${place}\\b`, 'g');
      if (regex.test(text)) {
        const capitalized = place.charAt(0).toUpperCase() + place.slice(1);
        spellingMistakes.push({ wrong: place, correct: capitalized, why: 'Capitalize city/country names' });
        correctedText = correctedText.replace(regex, capitalized);
      }
    });
    
    // Fix punctuation
    correctedText = correctedText
      .replace(/\s+,/g, ',')
      .replace(/,(?!\s)/g, ', ')
      .replace(/\s+\./g, '.')
      .replace(/\.(?!\s|$)/g, '. ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    
    // Capitalize first letter
    if (correctedText.length > 0) {
      correctedText = correctedText[0].toUpperCase() + correctedText.slice(1);
    }
    
    // Build detailed feedback with 6 structured sections
    const feedbackParts: string[] = [];
    const targetMatch = wordTarget.match(/(\d+)-(\d+)/);
    
    // ═══════════════════════════════════════════════════════════
    // SECTION 1: ORIGINAL STUDENT TEXT
    // ═══════════════════════════════════════════════════════════
    feedbackParts.push('📝 SECTION 1: ORIGINAL STUDENT TEXT');
    feedbackParts.push('═'.repeat(45));
    feedbackParts.push('');
    feedbackParts.push(`"${originalText}"`);
    feedbackParts.push('');
    if (targetMatch) {
      const [, min, max] = targetMatch;
      feedbackParts.push(`📊 Word Count: ${wordCount} words (Target: ${wordTarget})`);
      if (wordCount < parseInt(min)) {
        feedbackParts.push(`⚠️ Your text is ${parseInt(min) - wordCount} words below the minimum.`);
      } else if (wordCount > parseInt(max)) {
        feedbackParts.push(`⚠️ Your text is ${wordCount - parseInt(max)} words above the maximum.`);
      } else {
        feedbackParts.push('✅ Great! Word count is within the target range.');
      }
    }
    feedbackParts.push('');
    
    // ═══════════════════════════════════════════════════════════
    // SECTION 2: SPELLING MISTAKES & CORRECTIONS
    // ═══════════════════════════════════════════════════════════
    feedbackParts.push('🔤 SECTION 2: SPELLING MISTAKES & CORRECTIONS');
    feedbackParts.push('═'.repeat(45));
    feedbackParts.push('');
    
    if (spellingMistakes.length > 0) {
      feedbackParts.push('| ❌ Wrong | ✅ Correct | 💡 Why? |');
      feedbackParts.push('|---------|-----------|---------|');
      spellingMistakes.forEach(({ wrong, correct, why }) => {
        feedbackParts.push(`| ${wrong} | ${correct} | ${why} |`);
      });
      feedbackParts.push('');
      feedbackParts.push(`📌 Total spelling errors found: ${spellingMistakes.length}`);
    } else {
      feedbackParts.push('✅ Excellent! No spelling mistakes detected.');
      feedbackParts.push('Your spelling is accurate — well done!');
    }
    feedbackParts.push('');
    
    // ═══════════════════════════════════════════════════════════
    // SECTION 3: GRAMMAR & STRUCTURE ISSUES
    // ═══════════════════════════════════════════════════════════
    feedbackParts.push('🔧 SECTION 3: GRAMMAR & STRUCTURE ISSUES');
    feedbackParts.push('═'.repeat(45));
    feedbackParts.push('');
    
    let issueNumber = 1;
    
    if (grammarMistakes.length > 0) {
      grammarMistakes.forEach(({ wrong, correct, why }) => {
        feedbackParts.push(`${issueNumber}. ❌ You wrote: "${wrong}"`);
        feedbackParts.push(`   ✅ Correct: "${correct}"`);
        feedbackParts.push(`   💡 Explanation: ${why}`);
        feedbackParts.push('');
        issueNumber++;
      });
    }
    
    // Structure issues
    const structureIssues: string[] = [];
    
    if (sentences.length < 2) {
      structureIssues.push('Your response has only one sentence. Try developing your ideas with 2-3 sentences for better clarity.');
    }
    
    if (text.length > 100 && !text.includes('.')) {
      structureIssues.push('This is a run-on sentence! Long sentences without periods are hard to read. Break your ideas into shorter sentences.');
    }
    
    if (!isPart1 && !text.includes('\n') && wordCount > 80) {
      structureIssues.push('Your essay is one big block of text. Use paragraphs to organize your ideas (introduction, main point, conclusion).');
    }
    
    if (text.length > 0 && text[0] !== text[0].toUpperCase()) {
      structureIssues.push('Always start your writing with a capital letter.');
    }
    
    if (!text.match(/[.!?]$/)) {
      structureIssues.push('Your text doesn\'t end with proper punctuation. Always finish with a period (.), question mark (?), or exclamation mark (!).');
    }
    
    // Check for very short sentences
    const shortSentences = sentences.filter(s => s.trim().split(/\s+/).length < 3);
    if (shortSentences.length > 0) {
      structureIssues.push('Some of your sentences are very short. Try combining ideas or adding more detail.');
    }
    
    // Check for repetitive sentence starts
    const sentenceStarts = sentences.map(s => s.trim().split(/\s+/)[0]?.toLowerCase());
    const repeatedStarts = sentenceStarts.filter((start, i) => sentenceStarts.indexOf(start) !== i);
    if (repeatedStarts.length > 0) {
      structureIssues.push(`You start multiple sentences with "${repeatedStarts[0]}". Vary your sentence beginnings for better flow.`);
    }
    
    if (structureIssues.length > 0) {
      structureIssues.forEach(issue => {
        feedbackParts.push(`${issueNumber}. 📝 ${issue}`);
        issueNumber++;
      });
    }
    
    if (grammarMistakes.length === 0 && structureIssues.length === 0) {
      feedbackParts.push('✅ Good job! No major grammar or structure issues found.');
    }
    feedbackParts.push('');
    
    // ═══════════════════════════════════════════════════════════
    // SECTION 4: ORGANIZATION & CLARITY
    // ═══════════════════════════════════════════════════════════
    feedbackParts.push('📋 SECTION 4: ORGANIZATION & CLARITY');
    feedbackParts.push('═'.repeat(45));
    feedbackParts.push('');
    
    const clarityPoints: string[] = [];
    
    // Check cohesion - linking words
    const linkingWords = ['however', 'therefore', 'moreover', 'furthermore', 'also', 'in addition', 'firstly', 'secondly', 'finally', 'because', 'although', 'while'];
    const usedLinkingWords = linkingWords.filter(word => text.toLowerCase().includes(word));
    
    if (usedLinkingWords.length > 0) {
      clarityPoints.push(`✅ Good use of linking words: ${usedLinkingWords.join(', ')}`);
    } else if (sentences.length > 2) {
      clarityPoints.push('💡 Tip: Use linking words (however, also, because, therefore) to connect your ideas.');
    }
    
    // Check for clear topic
    if (isPart1) {
      if (text.toLowerCase().includes('photography') || text.toLowerCase().includes('photo') || text.toLowerCase().includes('picture')) {
        clarityPoints.push('✅ You addressed the topic (photography) clearly.');
      } else {
        clarityPoints.push('⚠️ Make sure you address the main topic in your response.');
      }
    } else {
      if (text.toLowerCase().includes('shop') || text.toLowerCase().includes('buy') || text.toLowerCase().includes('store') || text.toLowerCase().includes('online')) {
        clarityPoints.push('✅ You addressed the topic (shopping) in your essay.');
      }
    }
    
    // Flow check
    if (sentences.length >= 3) {
      clarityPoints.push('✅ Good length — you developed your ideas well.');
    } else if (sentences.length === 2) {
      clarityPoints.push('💡 Try adding one more sentence to fully develop your point.');
    }
    
    clarityPoints.forEach(point => feedbackParts.push(point));
    feedbackParts.push('');
    
    // ═══════════════════════════════════════════════════════════
    // SECTION 5: IMPROVED VERSION
    // ═══════════════════════════════════════════════════════════
    feedbackParts.push('✨ SECTION 5: IMPROVED VERSION');
    feedbackParts.push('═'.repeat(45));
    feedbackParts.push('');
    feedbackParts.push('Here is your text with all corrections applied:');
    feedbackParts.push('');
    feedbackParts.push(`"${correctedText}"`);
    feedbackParts.push('');
    feedbackParts.push('📌 Compare this with your original to see the improvements!');
    feedbackParts.push('');
    
    // ═══════════════════════════════════════════════════════════
    // SECTION 6: TEACHER FEEDBACK FOR THE STUDENT
    // ═══════════════════════════════════════════════════════════
    feedbackParts.push('💬 SECTION 6: TEACHER FEEDBACK FOR YOU');
    feedbackParts.push('═'.repeat(45));
    feedbackParts.push('');
    
    const totalErrors = spellingMistakes.length + grammarMistakes.length + structureIssues.length;
    
    if (totalErrors === 0) {
      feedbackParts.push('🌟 Outstanding work! Your writing is clear, accurate, and well-organized.');
      feedbackParts.push('');
      feedbackParts.push('You\'ve shown excellent control of spelling, grammar, and sentence structure.');
      feedbackParts.push('Keep reading and writing regularly to maintain this high standard!');
      feedbackParts.push('');
      feedbackParts.push('⭐ Next challenge: Try using more advanced vocabulary or complex sentences.');
    } else if (totalErrors <= 3) {
      feedbackParts.push('👏 Well done! You communicated your ideas clearly with just a few small errors.');
      feedbackParts.push('');
      feedbackParts.push('What you did well:');
      feedbackParts.push('• You expressed your thoughts clearly');
      feedbackParts.push('• Your message was easy to understand');
      feedbackParts.push('');
      feedbackParts.push('To improve:');
      if (spellingMistakes.length > 0) {
        feedbackParts.push(`• Review these spellings: ${spellingMistakes.map(m => m.correct).join(', ')}`);
      }
      if (grammarMistakes.length > 0) {
        feedbackParts.push('• Practice using apostrophes in contractions (don\'t, can\'t, it\'s)');
      }
      feedbackParts.push('');
      feedbackParts.push('⭐ Keep practising — you\'re doing great!');
    } else if (totalErrors <= 6) {
      feedbackParts.push('📈 Good effort! You\'re making progress, and I can see you\'re trying.');
      feedbackParts.push('');
      feedbackParts.push('Focus areas for improvement:');
      if (spellingMistakes.length > 2) {
        feedbackParts.push('⭐ Spelling: Keep a vocabulary notebook and write each word 3 times.');
      }
      if (grammarMistakes.length > 1) {
        feedbackParts.push('⭐ Grammar: Read your work aloud — you\'ll catch more mistakes!');
      }
      if (structureIssues.length > 1) {
        feedbackParts.push('⭐ Structure: Plan your writing before you start (beginning, middle, end).');
      }
      feedbackParts.push('');
      feedbackParts.push('💪 You\'re improving! Keep working on the areas above.');
    } else {
      feedbackParts.push('💪 Don\'t give up! Every mistake is a chance to learn.');
      feedbackParts.push('');
      feedbackParts.push('I noticed you need extra practice with:');
      feedbackParts.push('');
      feedbackParts.push('1️⃣ SPELLING');
      feedbackParts.push('   • Write new words in a notebook');
      feedbackParts.push('   • Practice each word 5 times');
      feedbackParts.push('   • Use them in your own sentences');
      feedbackParts.push('');
      feedbackParts.push('2️⃣ CAPITALIZATION');
      feedbackParts.push('   • Always capitalize "I"');
      feedbackParts.push('   • Capitalize names of people and places');
      feedbackParts.push('   • Start every sentence with a capital letter');
      feedbackParts.push('');
      feedbackParts.push('3️⃣ PUNCTUATION');
      feedbackParts.push('   • End every sentence with . ? or !');
      feedbackParts.push('   • Use apostrophes: don\'t, can\'t, I\'m');
      feedbackParts.push('');
      feedbackParts.push('⭐ Tip: Read your writing slowly before submitting. You\'ll catch many errors!');
      feedbackParts.push('');
      feedbackParts.push('I believe in you! 📚');
    }
    
    // Calculate scores
    let contentScore = 4;
    let organisationScore = 4;
    let languageScore = 4;
    
    // Adjust based on word count
    if (targetMatch) {
      const [, min] = targetMatch;
      if (wordCount < parseInt(min) * 0.5) {
        contentScore = 1;
      } else if (wordCount < parseInt(min) * 0.75) {
        contentScore = 2;
      } else if (wordCount < parseInt(min)) {
        contentScore = 3;
      }
    }
    
    // Adjust based on errors
    if (totalErrors > 8) {
      languageScore = 1;
    } else if (totalErrors > 5) {
      languageScore = 2;
    } else if (totalErrors > 2) {
      languageScore = 3;
    } else if (totalErrors === 0) {
      languageScore = 5;
    }
    
    // Adjust organisation based on structure
    if (structureIssues.length > 2) {
      organisationScore = 2;
    } else if (structureIssues.length > 0) {
      organisationScore = 3;
    } else if (sentences.length >= 3) {
      organisationScore = 5;
    }

    let communicativeAchievementScore = 4;
    if (totalErrors > 8) {
      communicativeAchievementScore = 1;
    } else if (totalErrors > 5) {
      communicativeAchievementScore = 2;
    } else if (wordCount < 80) {
      communicativeAchievementScore = 3;
    } else if (structureIssues.length === 0 && sentences.length >= 4) {
      communicativeAchievementScore = 5;
    }
    
    const marks: Record<string, number> = isPart1
      ? { content: contentScore, organisation: organisationScore, language: languageScore }
      : { content: contentScore, communicativeAchievement: communicativeAchievementScore, organisation: organisationScore, language: languageScore };
    
    return {
      feedback: feedbackParts.join('\n'),
      correctedVersion: correctedText,
      suggestedMarks: marks,
    };
  };

  // Auto-proofread writing using GPT-4o-mini

  const autoMarkTravelTourism = async () => {
    if (!selectedCambridgeStudent) return;
    setAutoProofreadLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error('Not authenticated');
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/travel_tourism_marking`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ quiz_score_id: selectedCambridgeStudent.id }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      const suggestion = await response.json();
      setTravelTourismAiSuggestion(suggestion);
      if (typeof suggestion.total_suggested_mark === 'number') {
        setTravelTourismMark(Math.max(0, Math.min(80, Math.round(suggestion.total_suggested_mark))));
      }
      brainsAlert('AI marking suggestion generated. Please review and adjust before saving.', 'success');
    } catch (error) {
      console.error('Travel & Tourism AI marking failed:', error);
      brainsAlert('AI marking failed. Please mark manually.', 'error');
    } finally {
      setAutoProofreadLoading(false);
    }
  };

  const submitTravelTourismMarks = async (releaseToStudent: boolean = false) => {
    if (!selectedCambridgeStudent) return;
    const totalScore = Math.max(0, Math.min(80, Number(travelTourismMark) || 0));
    const percentage = Math.round((totalScore / 80) * 100);
    setSavingMarks(true);
    try {
      const updatePayload = {
        score: totalScore,
        percentage,
        answers: {
          ...selectedCambridgeStudent.answers,
          marks: { total: totalScore, max: 80 },
          feedback: {
            ...(selectedCambridgeStudent.answers?.feedback || {}),
            teacher_comment: travelTourismFeedback,
            releasedToStudent: releaseToStudent,
          },
          ai_marking_suggestion: travelTourismAiSuggestion || selectedCambridgeStudent.answers?.ai_marking_suggestion,
          marked_by: profile.username,
          marked_at: new Date().toISOString(),
          requires_marking: false,
          teacher_marked: true,
          marking_status: releaseToStudent ? 'released' : 'marked_pending_release',
        },
        scores_released: releaseToStudent,
      };
      let markQuery = supabase.from('quiz_scores').update(updatePayload).eq('id', selectedCambridgeStudent.id);
      if (profile.school_id) markQuery = markQuery.eq('school_id', profile.school_id);
      const { error } = await markQuery;
      if (error) throw error;
      brainsAlert(releaseToStudent ? 'Travel & Tourism marks saved and released.' : 'Travel & Tourism marks saved as draft.', 'success');
      setShowWritingMarkingModal(false);
      await loadCambridgeScores();
    } catch (error) {
      console.error('Failed to save Travel & Tourism marks:', error);
      brainsAlert('Unable to save marks.', 'error');
    } finally {
      setSavingMarks(false);
    }
  };

  const autoProofreadWriting = async () => {
    if (!selectedCambridgeStudent) return;
    if (isTravelTourismCambridgeTest(selectedCambridgeStudent.quiz_name)) {
      await autoMarkTravelTourism();
      return;
    }
    
    const answers = selectedCambridgeStudent.answers || {};
    const part1Text = answers.part1 || '';
    const part2Text = answers.part2 || '';
    
    if (!part1Text && !part2Text) {
      brainsAlert('No student writing to proofread.', 'info');
      return;
    }
    
    setAutoProofreadLoading(true);
    
    try {
      // Get current session for auth token
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      
      if (!accessToken) {
        throw new Error('Not authenticated');
      }

      // Call Edge Function using direct fetch to avoid custom fetch wrapper issues
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/proofread_writing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          part1Text: part1Text.trim() || undefined,
          part2Text: part2Text.trim() || undefined,
          testType: selectedCambridgeStudent.quiz_name || 'Cambridge B2 First Writing'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data?.part2) {
        const validation = normalizePart2CommunicativeAchievement(data.part2);
        if (validation.errors.length > 0) {
          throw new Error(`Invalid communicative achievement data: ${validation.errors.join('; ')}`);
        }
        data.part2 = sanitizePart2Feedback(data.part2);
      }
      
      console.log('=== GPT PROOFREAD RESPONSE ===');
      console.log('Full response:', JSON.stringify(data, null, 2));
      console.log('Part 1 spellingMistakes:', data?.part1?.spellingMistakes);
      console.log('Part 1 grammarMistakes:', data?.part1?.grammarMistakes);
      console.log('Part 1 markJustifications:', data?.part1?.markJustifications);
      console.log('Part 1 modelAnswer:', data?.part1?.modelAnswer?.substring(0, 100) + '...');
      console.log('Part 2 spellingMistakes:', data?.part2?.spellingMistakes);
      console.log('Part 2 grammarMistakes:', data?.part2?.grammarMistakes);

      // Apply GPT feedback to Part 1
      if (data?.part1) {
        const p1 = data.part1;
        setWritingFeedback(prev => ({
          ...prev,
          part1: { 
            feedback: p1.feedback, 
            correctedVersion: p1.correctedVersion,
            spellingMistakes: p1.spellingMistakes || [],
            grammarMistakes: p1.grammarMistakes || [],
            markJustifications: p1.markJustifications,
            modelAnswer: p1.modelAnswer,
          }
        }));
        setWritingMarks(prev => ({
          ...prev,
          part1: buildMarkSet(
            p1.suggestedMarks,
            prev.part1,
            true,
          )
        }));
      }

      // Apply GPT feedback to Part 2
      if (data?.part2) {
        const p2 = data.part2;
        setWritingFeedback(prev => ({
          ...prev,
          part2: { 
            feedback: p2.feedback, 
            correctedVersion: p2.correctedVersion,
            spellingMistakes: p2.spellingMistakes || [],
            grammarMistakes: p2.grammarMistakes || [],
            markJustifications: p2.markJustifications,
            modelAnswer: p2.modelAnswer,
          }
        }));
        setWritingMarks(prev => ({
          ...prev,
          part2: buildMarkSet(
            p2.suggestedMarks,
            prev.part2,
            false,
          )
        }));
      }

      // Set overall comments from GPT
      const overallComments = [
        data?.part1?.overallComments,
        data?.part2?.overallComments
      ].filter(Boolean).join('\n\n');

      if (overallComments) {
        setWritingFeedback(prev => ({
          ...prev,
          overallComments
        }));
      }

      brainsAlert('AI Proofread complete. Please review the suggested feedback and marks, then adjust as needed.', 'success');

    } catch (error) {
      console.error('Auto-proofread failed:', error);
      brainsAlert('AI proofread was unavailable. Falling back to basic proofreading.', 'error');
      // Fall back to local proofreading
      const answers = selectedCambridgeStudent.answers || {};
      fallbackLocalProofread(answers.part1 || '', answers.part2 || '');
    } finally {
      setAutoProofreadLoading(false);
    }
  };

  // Bulk AI Proofread all pending writing submissions
  const bulkProofreadWriting = async (releaseToStudent: boolean) => {
    // Get all writing submissions that need marking
    const writingSubmissions = cambridgeScores.filter(
      s => WRITING_TEST_NAMES.includes(s.quiz_name) && s.answers?.requires_marking
    );

    if (writingSubmissions.length === 0) {
      brainsAlert('No pending writing submissions to proofread.', 'info');
      return;
    }

    const confirmMsg = releaseToStudent
      ? `This will AI proofread ${writingSubmissions.length} submissions and RELEASE marks to students. Continue?`
      : `This will AI proofread ${writingSubmissions.length} submissions and save as DRAFTS (not visible to students). Continue?`;

    const confirmed = await brainsConfirm({
      title: releaseToStudent ? 'Proofread and release marks?' : 'Proofread and save drafts?',
      message: confirmMsg,
      confirmLabel: releaseToStudent ? 'Proofread and release' : 'Proofread and save',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;

    setBulkProofreadLoading(true);
    setBulkProofreadProgress({ current: 0, total: writingSubmissions.length, currentStudent: '' });

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    if (!accessToken) {
      brainsAlert('Not authenticated. Please sign in again.', 'error');
      setBulkProofreadLoading(false);
      return;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < writingSubmissions.length; i++) {
      const student = writingSubmissions[i];
      setBulkProofreadProgress({ 
        current: i + 1, 
        total: writingSubmissions.length, 
        currentStudent: student.student_name 
      });

      try {
        const answers = student.answers || {};
        const part1Text = answers.part1 || '';
        const part2Text = answers.part2 || '';

        if (!part1Text && !part2Text) {
          console.log(`Skipping ${student.student_name} - no text`);
          continue;
        }

        // Call GPT API
        const response = await fetch(`${supabaseUrl}/functions/v1/proofread_writing`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            part1Text: part1Text.trim() || undefined,
            part2Text: part2Text.trim() || undefined,
            testType: 'Cambridge B2 First Writing'
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        if (data?.part2) {
          const validation = normalizePart2CommunicativeAchievement(data.part2);
          if (validation.errors.length > 0) {
            throw new Error(`Invalid communicative achievement data: ${validation.errors.join('; ')}`);
          }
          data.part2 = sanitizePart2Feedback(data.part2);
        }
        console.log(`GPT response for ${student.student_name}:`, data);

        // Calculate marks from GPT response
        const existingMarks = answers.marks || {};
        const part1Marks = buildMarkSet(data?.part1?.suggestedMarks, existingMarks.part1, true);
        const part2Marks = buildMarkSet(data?.part2?.suggestedMarks, existingMarks.part2, false);

        const part1Total = part1Marks.content + part1Marks.organisation + part1Marks.language;
        const part2Total = part2Marks.content + part2Marks.communicativeAchievement + 
                          part2Marks.organisation + part2Marks.language;
        const totalScore = part1Total + part2Total;
        const percentage = Math.round((totalScore / 35) * 100);

        // Build feedback object
        const feedback = {
          part1: {
            feedback: data?.part1?.feedback || '',
            correctedVersion: data?.part1?.correctedVersion || '',
            spellingMistakes: data?.part1?.spellingMistakes || [],
            grammarMistakes: data?.part1?.grammarMistakes || [],
            markJustifications: data?.part1?.markJustifications,
            modelAnswer: data?.part1?.modelAnswer,
          },
          part2: {
            feedback: data?.part2?.feedback || '',
            correctedVersion: data?.part2?.correctedVersion || '',
            spellingMistakes: data?.part2?.spellingMistakes || [],
            grammarMistakes: data?.part2?.grammarMistakes || [],
            markJustifications: data?.part2?.markJustifications,
            modelAnswer: data?.part2?.modelAnswer,
          },
          overallComments: [data?.part1?.overallComments, data?.part2?.overallComments].filter(Boolean).join('\n\n'),
          releasedToStudent: releaseToStudent,
        };

        // Save to database
        const updatePayload = {
          score: totalScore,
          percentage: percentage,
          answers: {
            ...student.answers,
            marks: { part1: part1Marks, part2: part2Marks },
            feedback: feedback,
            marked_by: profile.username,
            marked_at: new Date().toISOString(),
            requires_marking: false,
          }
        };

        let proofQuery = supabase
          .from('quiz_scores')
          .update(updatePayload)
          .eq('id', student.id);
        
        // Defense-in-depth: scope to own school
        if (profile.school_id) {
          proofQuery = proofQuery.eq('school_id', profile.school_id);
        }

        const { error } = await proofQuery;

        if (error) {
          console.error(`Failed to save ${student.student_name}:`, error);
          failCount++;
        } else {
          successCount++;
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.error(`Failed to proofread ${student.student_name}:`, error);
        failCount++;
      }
    }

    setBulkProofreadLoading(false);
    setBulkProofreadProgress({ current: 0, total: 0, currentStudent: '' });
    loadCambridgeScores(); // Refresh the list

    const releaseText = releaseToStudent ? 'and released to students' : 'as drafts';
    brainsAlert(`Bulk AI Proofread complete.\n\n${successCount} marked ${releaseText}\n${failCount} failed`, 'success');
  };

  // Fallback to local regex-based proofreading if GPT fails
  const fallbackLocalProofread = (part1Text: string, part2Text: string) => {
    try {
      if (part1Text.trim()) {
        const result1 = proofreadText(part1Text, '45-55', true);
        setWritingFeedback(prev => ({
          ...prev,
          part1: { feedback: result1.feedback, correctedVersion: result1.correctedVersion }
        }));
        setWritingMarks(prev => ({
          ...prev,
          part1: {
            content: result1.suggestedMarks.content ?? prev.part1.content,
            organisation: result1.suggestedMarks.organisation ?? prev.part1.organisation,
            language: result1.suggestedMarks.language ?? prev.part1.language,
          }
        }));
      }
      
      if (part2Text.trim()) {
        const result2 = proofreadText(part2Text, '110-130', false);
        setWritingFeedback(prev => ({
          ...prev,
          part2: { feedback: result2.feedback, correctedVersion: result2.correctedVersion }
        }));
        setWritingMarks(prev => ({
          ...prev,
          part2: {
            content: result2.suggestedMarks.content ?? prev.part2.content,
            communicativeAchievement: result2.suggestedMarks.communicativeAchievement ?? prev.part2.communicativeAchievement,
            organisation: result2.suggestedMarks.organisation ?? prev.part2.organisation,
            language: result2.suggestedMarks.language ?? prev.part2.language,
          }
        }));
      }
      
      // Generate overall comments based on word counts
      const p1Words = part1Text.trim().split(/\s+/).filter((w: string) => w.length > 0).length;
      const p2Words = part2Text.trim().split(/\s+/).filter((w: string) => w.length > 0).length;
      const totalWords = p1Words + p2Words;
      
      let overallMessage = '';
      if (totalWords > 150) {
        overallMessage = '👍 Good job on meeting the word count requirements! Review the specific feedback for each part.';
      } else if (totalWords > 100) {
        overallMessage = '📈 Making progress! Consider adding more detail to reach the target word counts.';
      } else {
        overallMessage = '💪 Keep practising! Try to write more to meet the word count targets.';
      }
      
      setWritingFeedback(prev => ({
        ...prev,
        overallComments: overallMessage
      }));
      
      brainsAlert('Basic proofread complete. (AI was unavailable)', 'success');
    } catch (error) {
      console.error('Fallback proofread failed:', error);
      brainsAlert('Proofread failed. Please try again.', 'error');
    }
  };

  // Export Cambridge results to CSV
  const exportCambridgeCSV = () => {
    if (filteredCambridgeScores.length === 0) return;
    
    const headers = ['Student Name', 'Class', 'Test', 'Score', 'Total', 'Percentage', 'Time (seconds)', 'Submitted At'];
    const rows = filteredCambridgeScores.map(r => [
      r.student_name,
      r.student_class || '',
      r.quiz_name,
      r.score,
      r.total_questions,
      r.percentage,
      r.time_taken_seconds || '',
      r.submitted_at
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `cambridge_results_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const loadQuestionsOnDemand = () => {
    if (questionsLoadRef.current) return questionsLoadRef.current;

    const request = (async () => {
      const pageSize = 500;
      const unique = new Map<string, TeacherQuestion>();
      for (let offset = 0; ; offset += pageSize) {
        const page = await GameService.get_all_questions({ limit: pageSize, offset });
        page.forEach((question) => unique.set(question.id, question));
        if (page.length < pageSize) break;
      }
      return [...unique.values()];
    })()
      .then(setQuestions)
      .catch((error) => {
        console.error('Error loading global question bank:', error);
        setQuestions([]);
      })
      .finally(() => {
        questionsLoadRef.current = null;
      });

    questionsLoadRef.current = request;
    return request;
  };

  const loadTeacherData = async () => {
    try {
      setLoading(true);
      const teacherProfile = await GameService.get_teacher_profile();
      if (!teacherProfile) {
        setTeacher(await GameService.create_teacher_profile());
      } else {
        setTeacher(teacherProfile);
      }

      // The usable dashboard opens as soon as identity is known. Secondary
      // cards hydrate independently; the global question bank is tab-only.
      setLoading(false);

      void SchoolAdminService.getTeacherAssignedClasses()
        .then((classes) => {
          setAssignedClasses(classes);
          setTeacherHasClassAssignments(classes.length > 0);
        })
        .catch((error) => {
          console.error('Error loading assigned classes:', error);
          setAssignedClasses([]);
          setTeacherHasClassAssignments(false);
        });

      void GameService.get_students_for_assignment()
        .then(setAvailableStudents)
        .catch((error) => {
          console.error('Error loading students:', error);
          setAvailableStudents([]);
        });

      void GameService.get_teacher_assignments()
        .then(setAssignments)
        .catch((error) => {
          console.error('Error loading assignments:', error);
          setAssignments([]);
        });
    } catch (error) {
      console.error('Error loading teacher data:', error);
      setLoading(false);
    }
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();

    // Consume pilot quota if applicable
    const quota = await tryConsumePilotQuota('questions_created');
    if (!quota.proceed) {
      brainsAlert(quota.error || 'You\'ve reached the question creation limit on the Pilot plan. Upgrade to continue.', 'error');
      return;
    }

    if (topicMode === 'custom' && !customTopicName.trim()) {
      brainsAlert('Please enter a topic name for your question.', 'info');
      return;
    }

    try {
      setUploadingImage(true);
      
      // Upload question image if selected
      let imageUrl = questionImageUrl;
      if (questionImage) {
        try {
          imageUrl = await GameService.upload_question_image(questionImage);
        } catch (uploadError) {
          brainsAlert('Unable to upload question image: ' + (uploadError as Error).message, 'error');
          setUploadingImage(false);
          return;
        }
      }

      // Upload option images and build final options array
      let finalOptions: QuestionOption[] | undefined = undefined;
      if (questionType === 'multiple_choice') {
        const processedOptions: QuestionOption[] = [];
        for (let i = 0; i < options.length; i++) {
          const opt = options[i];
          if (opt.text.trim()) {
            let optImageUrl = opt.image_url;
            // Upload new option image if selected
            if (optionImages[i]) {
              try {
                optImageUrl = await GameService.upload_question_image(optionImages[i]!);
              } catch (uploadError) {
                brainsAlert(`Unable to upload image for Option ${String.fromCharCode(65 + i)}: ` + (uploadError as Error).message, 'error');
                setUploadingImage(false);
                return;
              }
            }
            processedOptions.push({
              text: opt.text,
              image_url: optImageUrl
            });
          }
        }
        finalOptions = processedOptions;
      }

      setUploadingImage(false);

      const questionData = {
        subject,
        topic: questionTopicLabel,
        topic_name: questionTopicLabel,
        difficulty,
        question_text: questionText,
        image_url: imageUrl || undefined,
        question_type: questionType,
        options: finalOptions,
        correct_answer: correctAnswer,
        explanation,
        points,
        is_public: false,
      };

      if (editingQuestion) {
        if (!teacher || editingQuestion.teacher_id !== teacher.id) {
          brainsAlert('Brains Heist Pool questions are protected and cannot be edited.', 'error');
          return;
        }
        // Update existing question
        await GameService.update_question(editingQuestion.id, questionData);
        brainsAlert('Question updated successfully.', 'success');
      } else {
        // Create new question
        await GameService.create_question(questionData);
        brainsAlert('Question created successfully.', 'success');
      }

      // Reset form
      setQuestionText('');
      setQuestionImage(null);
      setQuestionImageUrl('');
      setOptions([
        { text: '', image_url: undefined },
        { text: '', image_url: undefined },
        { text: '', image_url: undefined },
        { text: '', image_url: undefined }
      ]);
      setOptionImages([null, null, null, null]);
      setCorrectAnswer('');
      setExplanation('');
      setTopicMode('general');
      setCustomTopicName('');
      setEditingQuestion(null);

      // Reload the complete authorized library, not only the RPC's first page.
      await loadQuestionsOnDemand();

      setView('question-bank');
    } catch (error) {
      console.error('Error saving question:', error);
      brainsAlert('Unable to save question: ' + (error as Error).message, 'error');
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    const question = questions.find((item) => item.id === questionId);
    if (!question || !teacher || question.teacher_id !== teacher.id) {
      brainsAlert('Only questions in My Pool can be deleted.', 'error');
      return;
    }
    const confirmed = await brainsConfirm({
      title: 'Delete this question?',
      message: 'This removes the question from My Pool. Existing assignment records will not be rewritten.',
      confirmLabel: 'Delete question',
      cancelLabel: 'Keep question',
      destructive: true,
    });
    if (!confirmed) return;

    try {
      await GameService.delete_question(questionId);
      const allQuestions = await GameService.get_all_questions();
      setQuestions(allQuestions);
      brainsAlert('Question deleted successfully.', 'success');
    } catch (error) {
      console.error('Error deleting question:', error);
      brainsAlert('Unable to delete question. Please try again.', 'error');
    }
  };

  // Helper to convert options from various formats to QuestionOption[]
  const normalizeOptions = (opts: (string | QuestionOption)[] | undefined): QuestionOption[] => {
    if (!opts || opts.length === 0) {
      return [
        { text: '', image_url: undefined },
        { text: '', image_url: undefined },
        { text: '', image_url: undefined },
        { text: '', image_url: undefined }
      ];
    }
    const normalized = opts.map(opt => {
      if (typeof opt === 'string') {
        return { text: opt, image_url: undefined };
      }
      return { text: opt.text || '', image_url: opt.image_url };
    });
    // Ensure we have at least 4 options
    while (normalized.length < 4) {
      normalized.push({ text: '', image_url: undefined });
    }
    return normalized;
  };

  const handleEditQuestion = (question: TeacherQuestion) => {
    if (!teacher || question.teacher_id !== teacher.id) {
      brainsAlert('Brains Heist Pool questions are protected and cannot be edited.', 'error');
      return;
    }
    // Set editing mode
    setEditingQuestion(question);
    
    // Pre-fill the form with the question data
    setSubject(question.subject);
    setDifficulty(question.difficulty);
    setQuestionType(question.question_type);
    setQuestionText(question.question_text);
    setQuestionImage(null);
    setQuestionImageUrl(question.image_url || '');
    setOptions(normalizeOptions(question.options));
    setOptionImages([null, null, null, null]);
    setCorrectAnswer(question.correct_answer);
    setExplanation(question.explanation || '');
    setPoints(question.points);
    const existingTopic = question.topic_name || question.topic || 'General';
    if (existingTopic !== 'General') {
      setTopicMode('custom');
      setCustomTopicName(existingTopic);
    } else {
      setTopicMode('general');
      setCustomTopicName('');
    }

    // Switch to create view
    setView('create-question');
  };

  const openMyPoolQuestionForm = (preferredSubject?: Subject, preferredTopic?: string) => {
    setEditingQuestion(null);
    if (preferredSubject) setSubject(preferredSubject);
    if (preferredTopic && preferredTopic !== 'General') {
      setTopicMode('custom');
      setCustomTopicName(preferredTopic);
    } else {
      setTopicMode('general');
      setCustomTopicName('');
    }
    setView('create-question');
  };

  const handleRenameTopic = async (topicQuestions: TeacherQuestion[], nextTopic: string) => {
    const owned = topicQuestions.filter((question) => teacher && question.teacher_id === teacher.id);
    if (!owned.length || owned.length !== topicQuestions.length) {
      brainsAlert('Only topics in My Pool can be renamed.', 'error');
      return;
    }
    await Promise.all(owned.map((question) => GameService.update_question(question.id, { topic: nextTopic, topic_name: nextTopic })));
    setQuestions(await GameService.get_all_questions());
    brainsAlert(`Topic renamed to “${nextTopic}”.`, 'success');
  };

  const handleDeleteTopic = async (topicQuestions: TeacherQuestion[]) => {
    const owned = topicQuestions.filter((question) => teacher && question.teacher_id === teacher.id);
    if (!owned.length || owned.length !== topicQuestions.length) {
      brainsAlert('Only topics in My Pool can be deleted.', 'error');
      return;
    }
    const confirmed = await brainsConfirm({
      title: 'Delete this topic?',
      message: `This will permanently delete ${owned.length} question${owned.length === 1 ? '' : 's'} from My Pool.`,
      confirmLabel: 'Delete topic',
      cancelLabel: 'Keep topic',
      destructive: true,
    });
    if (!confirmed) return;
    await Promise.all(owned.map((question) => GameService.delete_question(question.id)));
    setQuestions(await GameService.get_all_questions());
    brainsAlert('Topic deleted from My Pool.', 'success');
  };

  const handleDuplicateQuestion = (question: TeacherQuestion) => {
    // Clear editing mode
    setEditingQuestion(null);
    
    // Pre-fill the form with the question data
    setSubject(question.subject);
    setDifficulty(question.difficulty);
    setQuestionType(question.question_type);
    setQuestionText(question.question_text + ' (Copy)');
    setQuestionImage(null);
    setQuestionImageUrl(question.image_url || '');
    setOptions(normalizeOptions(question.options));
    setOptionImages([null, null, null, null]);
    setCorrectAnswer(question.correct_answer);
    setExplanation(question.explanation || '');
    setPoints(question.points);
    const existingTopic = question.topic_name || question.topic || 'General';
    if (existingTopic !== 'General') {
      setTopicMode('custom');
      setCustomTopicName(existingTopic);
    } else {
      setTopicMode('general');
      setCustomTopicName('');
    }

    // Switch to create view
    setView('create-question');
  };

  const toggleAssignmentQuestion = (questionId: string) => {
    setAssignmentQuestionIds((prev) => (
      prev.includes(questionId) ? prev.filter((id) => id !== questionId) : [...prev, questionId]
    ));
  };

  const setAssignmentQuestionsSelected = (questionIds: string[], shouldSelect: boolean) => {
    setAssignmentQuestionIds((prev) => {
      const next = new Set(prev);
      questionIds.forEach((id) => {
        if (shouldSelect) {
          next.add(id);
        } else {
          next.delete(id);
        }
      });
      return Array.from(next);
    });
  };

  const toggleStudentSelection = (studentId: string) => {
    setSelectedStudentIds((prev) => 
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  };

  const resetAssignmentDraft = useCallback(() => {
    localStorage.removeItem('brains_heist_teacher_assignment_draft_v2');
    questionBankSubjectRef.current = false;
    setAssignmentLockedSubject(null);
    setAssignmentQuestionIds([]);
    setAssignmentTitle('');
    setAssignmentDescription('');
    setAssignmentInstructions('');
    setSelectedStudentIds([]);
    setAssignmentBatches([]);
    setStudentSearchTerm('');
    setAssignmentQuestionSearchTerm('');
    setAssignmentQuestionDifficultyFilter('all');
    setAssignmentQuestionTypeFilter('all');
    setAssignmentTopicMode('general');
    setAssignmentTopicName('');
    setAssignmentDueAt('');
    setAssignmentAssignedAt(new Date().toISOString().slice(0, 16));
  }, []);

  const openBlankAssignmentForm = useCallback(() => {
    resetAssignmentDraft();
    void loadQuestionsOnDemand();
    setView('create-assignment');
  }, [resetAssignmentDraft]);

  // Handle "Use Set" from the Blooket-style QuestionBank
  const handleUseQuestionSet = useCallback((questionIds: string[], subject: Subject, topic: string) => {
    if (teacherAssignedSubjects.length > 0 && !teacherAssignedSubjects.includes(subject)) {
      brainsAlert('You can only create assignments for subjects assigned to you by the school admin.', 'error');
      return;
    }

    // Pre-select the questions and set subject/topic from the selected set
    questionBankSubjectRef.current = true; // Prevent the subject-change useEffect from clearing these IDs
    setAssignmentLockedSubject(subject);
    setAssignmentQuestionIds(questionIds);
    setAssignmentSubject(subject);
    if (topic && topic !== 'General') {
      setAssignmentTopicMode('custom');
      setAssignmentTopicName(topic);
    } else {
      setAssignmentTopicMode('general');
      setAssignmentTopicName('');
    }
    void loadQuestionsOnDemand();
    setView('create-assignment');
  }, [teacherAssignedSubjects]);

  const selectAllStudents = () => {
    setSelectedStudentIds(filteredStudents.map(s => s.id));
  };

  const deselectAllStudents = () => {
    setSelectedStudentIds([]);
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!assignmentTitle.trim()) {
      brainsAlert('Assignment title is required.', 'info');
      return;
    }

    if (teacherAssignedSubjects.length > 0 && !teacherAssignedSubjects.includes(assignmentSubject)) {
      brainsAlert('You can only create assignments for subjects assigned to you by the school admin.', 'error');
      return;
    }

    if (assignmentTopicMode === 'custom' && !assignmentTopicName.trim()) {
      brainsAlert('Please enter a topic for this assignment.', 'info');
      return;
    }

    if (!assignmentQuestionIds.length) {
      brainsAlert('Select at least one question to assign.', 'info');
      return;
    }

    if (assignmentMode === 'batch' && assignmentBatches.length === 0) {
      brainsAlert('Please select at least one class/batch for this assignment.', 'info');
      return;
    }

    if (assignmentMode === 'custom' && selectedStudentIds.length === 0) {
      brainsAlert('Please select at least one student for this assignment.', 'info');
      return;
    }

    if (assignmentDueAt) {
      const dueDate = new Date(assignmentDueAt);
      if (Number.isNaN(dueDate.getTime()) || dueDate.getTime() <= Date.now()) {
        brainsAlert('Choose a due date and time in the future. Students cannot receive an assignment that is already overdue.', 'error');
        return;
      }
    }

    const toIso = (value: string): string | undefined => {
      if (!value) return undefined;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return undefined;
      return date.toISOString();
    };

    try {
      setAssignmentSubmitting(true);

      // Consume pilot quota if applicable
      const assignQuota = await tryConsumePilotQuota('assignments_created');
      if (!assignQuota.proceed) {
        brainsAlert(assignQuota.error || 'You\'ve reached the assignment creation limit on the Pilot plan. Upgrade to continue.', 'error');
        setAssignmentSubmitting(false);
        return;
      }

      let successMessage: string | null = null;
      let shouldResetAfterCreate = false;

      if (assignmentMode === 'batch') {
        // Create one assignment per selected batch/class
        const batchesToAssign = assignmentBatches.includes('All')
          ? availableBatches
          : assignmentBatches.filter((batch) => batch !== 'All');
        const results: string[] = [];
        const errors: string[] = [];

        for (const batch of batchesToAssign) {
          try {
            await GameService.create_assignment({
              subject: assignmentSubject,
              topic_name: assignmentTopicLabel,
              batch: batch as AssignmentBatch,
              question_ids: assignmentQuestionIds,
              assigned_at: toIso(assignmentAssignedAt) ?? new Date().toISOString(),
              due_at: toIso(assignmentDueAt),
              title: assignmentTitle.trim(),
              description: assignmentDescription || undefined,
              instructions: assignmentInstructions || undefined,
              difficulty: assignmentDifficulty,
              assignment_mode: 'batch',
            });
            results.push(batch);
          } catch (err) {
            errors.push(`${batch}: ${(err as Error).message}`);
          }
        }

        if (errors.length > 0) {
          brainsAlert(`Assignment created for ${results.length} class(es), but failed for:\n${errors.join('\n')}`, 'error');
          if (results.length === 0) {
            return;
          }
        } else {
          const classCount = results.length;
          successMessage = `Assignment created and sent to ${classCount} class${classCount !== 1 ? 'es' : ''}.`;
        }
        shouldResetAfterCreate = results.length > 0;
      } else {
        // Custom mode — single creation for selected students
        await GameService.create_assignment({
          subject: assignmentSubject,
          topic_name: assignmentTopicLabel,
          batch: undefined,
          question_ids: assignmentQuestionIds,
          assigned_at: toIso(assignmentAssignedAt) ?? new Date().toISOString(),
          due_at: toIso(assignmentDueAt),
          title: assignmentTitle.trim(),
          description: assignmentDescription || undefined,
          instructions: assignmentInstructions || undefined,
          difficulty: assignmentDifficulty,
          assignment_mode: 'custom',
          student_ids: selectedStudentIds,
        });
        successMessage = `Assignment created and sent to ${selectedStudentIds.length} student${selectedStudentIds.length !== 1 ? 's' : ''}.`;
        shouldResetAfterCreate = true;
      }

      if (successMessage) {
        brainsAlert(successMessage, 'success');
      }
      if (shouldResetAfterCreate) {
        resetAssignmentDraft();
        await loadAssignments();
        setView('assignments');
      }
    } catch (error) {
      console.error('Error creating assignment:', error);
      brainsAlert('Unable to create assignment: ' + (error as Error).message, 'error');
    } finally {
      setAssignmentSubmitting(false);
    }
  };

  const handleOpenReport = async (assignment: TeacherAssignmentSummary) => {
    try {
      setReportLoading(true);
      setSelectedReportAssignment(assignment);
      const reportRows = await GameService.get_teacher_assignment_report(assignment.id);
      // Assignment submissions retain the game username for gameplay history.
      // Teacher-facing documents must instead use the official roster identity.
      const officialNames = new Map(availableStudents.map((student) => [student.id, student.display_name]));
      const rows = reportRows.map((row) => ({
        ...row,
        student_name: officialNames.get(row.student_id) || 'Student name unavailable',
      }));
      setAssignmentReport(rows);
      setAssignments((current) => current.map((item) => (
        item.id === assignment.id
          ? { ...item, completed_count: rows.length }
          : item
      )));
      setSelectedReportAssignment((current) => (
        current?.id === assignment.id
          ? { ...current, completed_count: rows.length }
          : current
      ));
      
      // Also load question analysis
      try {
        const analysis = await GameService.get_assignment_question_analysis(assignment.id);
        setQuestionAnalysis(analysis);
      } catch (err) {
        console.warn('Question analysis not available:', err);
        setQuestionAnalysis([]);
      }
      
      setView('report-detail');
    } catch (error) {
      console.error('Error loading assignment report:', error);
      brainsAlert('Unable to load report: ' + (error as Error).message, 'error');
    } finally {
      setReportLoading(false);
    }
  };

  const handleViewStudentAnalysis = async (student: TeacherAssignmentReportRow) => {
    if (!selectedReportAssignment) return;
    
    try {
      setAnalysisLoading(true);
      setSelectedAnalysisStudent(student);
      const answers = await GameService.get_assignment_student_answers(
        selectedReportAssignment.id,
        student.student_id
      );
      setStudentAnswers(answers);
      
      // Student-level reporting uses stored answers and scoring only.
      // AI analysis remains off until its Edge Function has authenticated,
      // school-scoped authorization and is deployed.
      
      setView('report-analysis');
    } catch (error) {
      console.error('Error loading student answers:', error);
      brainsAlert('Unable to load student analysis: ' + (error as Error).message, 'error');
    } finally {
      setAnalysisLoading(false);
    }
  };

  const handleExportReport = async () => {
    if (!selectedReportAssignment || assignmentReport.length === 0) return;

    // Consume pilot quota if applicable
    const quota = await tryConsumePilotQuota('reports_generated');
    if (!quota.proceed) {
      brainsAlert(quota.error || 'You\'ve reached the report export limit on the Pilot plan. Upgrade to continue.', 'error');
      return;
    }

    const csvHeader = 'Student,Class,Score,Correct,Incorrect,Accuracy (%),Completed At';
    const header = csvHeader.split(',').map(safeCsvCell).join(',');
    const rows = assignmentReport.map((row) => (
      [
        row.student_name,
        row.batch ?? '—',
        row.score,
        row.correct,
        row.incorrect,
        row.accuracy,
        new Date(row.completed_at).toLocaleString(),
      ].map(safeCsvCell).join(',')
    ));
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedReportAssignment.topic_name || 'assignment'}-report.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handlePrintStudentAnalysis = (audience: SchoolDocumentAudience = 'teacher') => {
    if (!selectedReportAssignment || !selectedAnalysisStudent) return;
    const assignmentTitle = selectedReportAssignment.title || selectedReportAssignment.topic_name;
    const answerRows = audience === 'teacher' && studentAnswers.length
      ? studentAnswers.map((answer, index) => `
        <article class="document-card">
          <strong>Question ${index + 1} · ${answer.is_correct ? 'Correct' : 'Needs review'} · ${Math.round(answer.time_taken_ms / 1000)}s</strong>
          <p>${escapeSchoolDocumentHtml(answer.question_text)}</p>
          <div class="document-grid"><div><strong>Student answer</strong><p>${escapeSchoolDocumentHtml(answer.student_answer || 'No answer')}</p></div><div><strong>Correct answer</strong><p>${escapeSchoolDocumentHtml(answer.correct_answer)}</p></div></div>
          ${answer.explanation ? `<div class="document-callout"><strong>Teacher explanation</strong><p>${escapeSchoolDocumentHtml(answer.explanation)}</p></div>` : ''}
        </article>`).join('')
      : '';
    const supportMessage = selectedAnalysisStudent.accuracy >= 80
      ? 'The student demonstrated secure understanding. Continue with suitable extension and application tasks.'
      : selectedAnalysisStudent.accuracy >= 60
        ? 'The student is developing securely. Revisit the questions marked for review before the next assessment.'
        : 'The student would benefit from targeted reteaching and a short follow-up check before moving on.';
    const bodyHtml = `
      <h2>Performance summary</h2>
      <div class="document-grid">
        <div class="document-card"><strong>Accuracy</strong><p>${selectedAnalysisStudent.accuracy}%</p></div>
        <div class="document-card"><strong>Response summary</strong><p>${selectedAnalysisStudent.correct} correct · ${selectedAnalysisStudent.incorrect} need review</p></div>
      </div>
      <div class="document-callout"><strong>Recommended next step</strong><p>${escapeSchoolDocumentHtml(supportMessage)}</p></div>
      ${audience === 'teacher' ? `<section class="document-appendix"><h2>Teacher evidence appendix</h2>${answerRows || '<p>Question-by-question evidence is not available for this submission.</p>'}</section>` : ''}
      ${audience === 'family' ? '<p>This family copy provides a concise learning summary. Detailed answer evidence remains available to authorised school staff.</p>' : ''}`;
    try {
      openSchoolDocumentPreview({
        meta: {
          documentId: createSchoolDocumentId('assignment'),
          templateVersion: 'assignment-student-v2',
          title: assignmentTitle,
          subtitle: audience === 'family' ? 'Student learning summary' : 'Individual performance and answer evidence',
          schoolName: resolvedBranding.schoolName,
          schoolLogoUrl: resolvedBranding.schoolLogoUrl,
          audience,
          status: 'final',
          confidentiality: audience === 'family' ? 'family-copy' : 'confidential',
          generatedAt: new Date().toISOString(),
          generatedBy: profile.full_name || profile.username || 'Teacher',
          subject: selectedReportAssignment.subject_name,
          className: selectedAnalysisStudent.batch || undefined,
          studentName: selectedAnalysisStudent.student_name,
          schoolId: profile.school_id,
          studentUserId: selectedAnalysisStudent.student_id,
          sourceType: 'teacher_assignment',
          sourceId: selectedReportAssignment.id,
        },
        bodyHtml,
        orientation: 'portrait',
        fileName: schoolDocumentFileName(resolvedBranding.schoolName, selectedAnalysisStudent.student_name, assignmentTitle, audience, new Date().toISOString().slice(0, 10)),
      });
    } catch (error) {
      brainsAlert(error instanceof Error ? error.message : 'Unable to open the document preview.', 'info');
    }
  };

  // Download CSV template
  const downloadCSVTemplate = () => {
    const template = `subject,topic,difficulty,question_type,question_text,option1,option2,option3,option4,correct_answer,explanation,points
Maths,General,easy,multiple_choice,"What is 2 + 2?","2","3","4","5","4","Addition of two numbers",10
Science,Lab Safety,medium,true_false,"Water boils at 100°C at sea level","True","False","","","True","Water's boiling point at standard pressure",15
English,Grammar,hard,short_answer,"What is the past tense of 'go'?","","","","","went","Irregular verb conjugation",20`;
    
    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'question_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const parseCSVRows = (csvText: string): string[][] => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentValue = '';
    let inQuotes = false;

    for (let i = 0; i < csvText.length; i++) {
      const char = csvText[i];
      const next = csvText[i + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          currentValue += '"';
          i++;
          continue;
        }
        inQuotes = !inQuotes;
        continue;
      }

      if (char === ',' && !inQuotes) {
        currentRow.push(currentValue.trim());
        currentValue = '';
        continue;
      }

      if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && next === '\n') i++;
        currentRow.push(currentValue.trim());
        currentValue = '';
        rows.push(currentRow);
        currentRow = [];
        continue;
      }

      currentValue += char;
    }

    if (currentValue.length > 0 || currentRow.length > 0) {
      currentRow.push(currentValue.trim());
      rows.push(currentRow);
    }

    return rows;
  };

  const normalizeSubjectValue = (value: string): Subject | null => {
    const normalized = value.trim().toLowerCase();
    const map: Record<string, Subject> = {
      maths: 'Maths',
      math: 'Maths',
      science: 'Science',
      english: 'English',
      russian: 'Russian Language',
      'russian language': 'Russian Language',
      kyrgyz: 'Kyrgyz Language',
      'kyrgyz language': 'Kyrgyz Language',
      german: 'German Language',
      'german language': 'German Language',
      geography: 'Geography',
      'global perspective': 'Global Perspective',
      ict: 'ICT',
    };
    return map[normalized] ?? null;
  };

  const normalizeDifficultyValue = (value: string): QuestionDifficulty | null => {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'easy' || normalized === 'medium' || normalized === 'hard') {
      return normalized;
    }
    return null;
  };

  const normalizeQuestionTypeValue = (value: string): 'multiple_choice' | 'true_false' | 'short_answer' | null => {
    const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (normalized === 'multiple_choice' || normalized === 'mcq') return 'multiple_choice';
    if (normalized === 'true_false' || normalized === 'boolean') return 'true_false';
    if (normalized === 'short_answer' || normalized === 'shortanswer') return 'short_answer';
    return null;
  };

  // Parse and upload CSV
  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress({ current: 0, total: 0 });

    try {
      const text = await file.text();
      const cleanedText = text.replace(/^\uFEFF/, '');
      const csvRows = parseCSVRows(cleanedText);

      if (csvRows.length < 2) {
        throw new Error('CSV must include a header row and at least one data row.');
      }

      const header = csvRows[0].map((value) => value.trim().toLowerCase());
      const getColumnIndex = (...aliases: string[]) =>
        aliases
          .map((alias) => header.indexOf(alias))
          .find((index) => index >= 0) ?? -1;

      const columnIndex = {
        subject: getColumnIndex('subject'),
        topic: getColumnIndex('topic', 'topic_name'),
        difficulty: getColumnIndex('difficulty'),
        questionType: getColumnIndex('question_type', 'questiontype'),
        questionText: getColumnIndex('question_text', 'question'),
        option1: getColumnIndex('option1', 'option_1'),
        option2: getColumnIndex('option2', 'option_2'),
        option3: getColumnIndex('option3', 'option_3'),
        option4: getColumnIndex('option4', 'option_4'),
        correctAnswer: getColumnIndex('correct_answer', 'answer'),
        explanation: getColumnIndex('explanation'),
        points: getColumnIndex('points', 'xp'),
      };

      if (
        columnIndex.subject < 0 ||
        columnIndex.difficulty < 0 ||
        columnIndex.questionType < 0 ||
        columnIndex.questionText < 0 ||
        columnIndex.correctAnswer < 0
      ) {
        throw new Error('Missing required columns. Required: subject, difficulty, question_type, question_text, correct_answer.');
      }

      const dataRows = csvRows.slice(1).filter((row) => row.some((cell) => cell.trim() !== ''));
      setUploadProgress({ current: 0, total: dataRows.length });

      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        try {
          const read = (index: number): string => (index >= 0 ? (row[index] ?? '').trim() : '');

          const subjectStr = normalizeSubjectValue(read(columnIndex.subject));
          const topicStr = read(columnIndex.topic);
          const difficultyStr = normalizeDifficultyValue(read(columnIndex.difficulty));
          const questionType = normalizeQuestionTypeValue(read(columnIndex.questionType));
          const questionText = read(columnIndex.questionText);
          const opt1 = read(columnIndex.option1);
          const opt2 = read(columnIndex.option2);
          const opt3 = read(columnIndex.option3);
          const opt4 = read(columnIndex.option4);
          const correctAnswer = read(columnIndex.correctAnswer);
          const explanation = read(columnIndex.explanation);
          const pointsStr = read(columnIndex.points);

          if (!subjectStr) throw new Error('Invalid or missing subject');
          if (!difficultyStr) throw new Error('Invalid or missing difficulty');
          if (!questionType) throw new Error('Invalid or missing question_type');
          if (!questionText) throw new Error('Missing question_text');
          if (!correctAnswer) throw new Error('Missing correct_answer');

          const options = questionType === 'multiple_choice'
            ? [opt1, opt2, opt3, opt4].filter(Boolean)
            : questionType === 'true_false'
              ? ['True', 'False']
              : undefined;

          if (questionType === 'multiple_choice' && options.length < 2) {
            throw new Error('multiple_choice rows require at least 2 options');
          }

          if (questionType === 'multiple_choice') {
            const spreadsheetDatePattern = /^(?:20\d{2}[⁄/]\d{1,2}[⁄/]\d{1,2}|\d{1,2}月\d{1,2}日)$/;
            const convertedValue = [...options, correctAnswer].find(value => spreadsheetDatePattern.test(value));
            if (convertedValue) {
              throw new Error(
                `"${convertedValue}" looks like a fraction converted into a date. Format fraction cells as Text in the spreadsheet, restore values such as 3/4, then export the CSV again.`
              );
            }

            const normalizedOptions = options.map(value => value.trim().toLocaleLowerCase());
            if (new Set(normalizedOptions).size !== normalizedOptions.length) {
              throw new Error(
                'Options must be unique. Duplicate TRUE/FALSE values usually mean the spreadsheet evaluated comparison formulas; format option cells as Text before exporting.'
              );
            }

            if (!options.includes(correctAnswer)) {
              throw new Error('correct_answer must exactly match one of the options');
            }
          }

          const questionData = {
            subject: subjectStr,
            topic: topicStr || 'General',
            topic_name: topicStr || 'General',
            difficulty: difficultyStr,
            question_text: questionText,
            question_type: questionType,
            options,
            correct_answer: correctAnswer,
            explanation: explanation || '',
            points: Math.min(Math.max(Number.parseInt(pointsStr, 10) || 10, 1), 30),
            is_public: true
          };

          await GameService.create_question(questionData);
          successCount++;
          setUploadProgress({ current: i + 1, total: dataRows.length });
        } catch (err) {
          errors.push(`Row ${i + 2}: ${(err as Error).message}`);
          errorCount++;
        }
      }

      // Reload questions from global bank
      const allQuestions = await GameService.get_all_questions();
      setQuestions(allQuestions);

      // Show results
      const message = `CSV Upload Complete\n\nCreated questions: ${successCount}\nSkipped/failed rows: ${errorCount}${errors.length > 0 ? '\n\nRow issues:\n' + errors.slice(0, 5).join('\n') + (errors.length > 5 ? `\n... and ${errors.length - 5} more` : '') : ''}`;
      const alertTone = successCount === 0 ? 'error' : (errorCount > 0 ? 'info' : 'success');
      brainsAlert(message, alertTone);
      
      setView('question-bank');
    } catch (error) {
      console.error('CSV upload error:', error);
      brainsAlert('CSV upload failed: ' + (error as Error).message, 'error');
    } finally {
      setUploading(false);
      setUploadProgress({ current: 0, total: 0 });
      // Reset file input
      e.target.value = '';
    }
  };

  // Render Dashboard
  const renderDashboard = () => {
    const myClasses = Array.from(new Set(assignedClasses.map((cls) => cls.class_code)));
    const activeAssignments = assignments.filter((a) => a.completed_count < a.student_count).length;
    const totalSubmissions = assignmentSuccess?.submission_count ?? 0;
    const hasAssignmentSuccess = totalSubmissions > 0;
    const successRate = assignmentSuccess?.success_rate ?? 0;
    const pendingWriting = cambridgeScores.filter(
      (score) => isTeacherMarkedCambridgeTest(score.quiz_name) && score.answers?.requires_marking
    ).length;
    const studentsWithoutClass = availableStudents.filter((student) => !student.batch).length;

    const classHealthRows = myClasses.map((classCode) => {
      const classStudents = availableStudents.filter((student) => student.batch === classCode);
      const classAssignments = assignments.filter((assignment) => assignment.batch === classCode);
      const totalAssigned = classAssignments.reduce((sum, assignment) => sum + (assignment.student_count || 0), 0);
      const totalCompleted = classAssignments.reduce((sum, assignment) => sum + (assignment.completed_count || 0), 0);
      const completionRate = totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 0;

      const classCambridgeScores = cambridgeScores.filter((score) => (score.student_class || 'Unknown') === classCode);
      const averageScore = classCambridgeScores.length > 0
        ? Math.round(classCambridgeScores.reduce((sum, score) => sum + (score.percentage || 0), 0) / classCambridgeScores.length)
        : null;

      return {
        classCode,
        studentCount: classStudents.length,
        assignmentsInProgress: classAssignments.filter((assignment) => assignment.completed_count < assignment.student_count).length,
        completionRate,
        averageScore,
      };
    }).sort((a, b) => a.completionRate - b.completionRate);

    const lowCompletionClasses = classHealthRows.filter((row) => row.completionRate > 0 && row.completionRate < 60);

    const studentRiskMap = new Map<string, { name: string; batch: string; reasons: string[]; riskScore: number }>();
    const markRisk = (studentId: string, name: string, batch: string, reason: string, weight: number) => {
      const existing = studentRiskMap.get(studentId);
      if (existing) {
        existing.riskScore += weight;
        if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
        return;
      }
      studentRiskMap.set(studentId, { name, batch, reasons: [reason], riskScore: weight });
    };

    availableStudents.forEach((student) => {
      if (!student.batch) {
        markRisk(student.id, student.display_name || student.username, 'Unassigned', 'Not mapped to a class/batch yet', 4);
      }
    });

    lowCompletionClasses.forEach((row) => {
      availableStudents
        .filter((student) => student.batch === row.classCode)
        .forEach((student) => {
          markRisk(
            student.id,
            student.display_name || student.username,
            student.batch || 'Unknown',
            `${row.classCode} completion is ${row.completionRate}%`,
            2
          );
        });
    });

    cambridgeScores
      .filter((score) => Number(score.percentage || 0) < 60)
      .forEach((score) => {
        const matchedStudent = availableStudents.find((student) => student.username === score.student_name || student.display_name === score.student_name);
        if (!matchedStudent) return;
        markRisk(
          matchedStudent.id,
          matchedStudent.display_name || matchedStudent.username,
          matchedStudent.batch || score.student_class || 'Unknown',
          `Low Cambridge score (${score.percentage}%) on ${score.quiz_name}`,
          3
        );
      });

    const atRiskStudents = Array.from(studentRiskMap.values())
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 6);

    const topIssues: string[] = [];
    if (!teacherHasClassAssignments) topIssues.push('No class assignments are configured for this teacher account.');
    if (lowCompletionClasses.length > 0) topIssues.push(`${lowCompletionClasses.length} class(es) are below 60% assignment completion.`);
    if (studentsWithoutClass > 0) topIssues.push(`${studentsWithoutClass} student(s) have no class/batch mapping.`);
    if (hasAssignmentSuccess && successRate < 65) topIssues.push(`Assignment success rate is ${successRate}% (below target).`);
    if (pendingWriting > 0) topIssues.push(`${pendingWriting} Cambridge writing submission(s) still need marking.`);

    const recommendedActions = [
      lowCompletionClasses.length > 0
        ? `Run a catch-up check with ${lowCompletionClasses[0].classCode} and review missed assignment blockers.`
        : 'Keep assignment momentum by scheduling the next formative check this week.',
      pendingWriting > 0
        ? 'Open Cambridge Tests and clear pending writing to unlock score release.'
        : 'Review Cambridge trends and release marked scores to students.',
      studentsWithoutClass > 0
        ? 'Coordinate with school admin to map unassigned students into classes.'
        : 'Use Reports to target the bottom-performing students with a custom assignment.',
    ];

    const priorityItems = [
      activeAssignments > 0 ? `Review ${activeAssignments} assignment${activeAssignments > 1 ? 's' : ''} still in progress.` : 'No pending assignments — great pacing today.',
      teacherHasClassAssignments
        ? `Prepare next class for ${myClasses.slice(0, 2).join(' • ')}${myClasses.length > 2 ? '…' : ''}.`
        : 'Coordinate with school admin to finalize class assignments.',
      !hasAssignmentSuccess
        ? 'Assignment success will appear after the first student submission.'
        : successRate < 65
        ? 'Success rate is below 65% — prioritize revision and targeted support.'
        : 'Success trend is healthy — keep momentum with formative checks.',
    ];

    const alertItems: Array<{ tone: 'warning' | 'info'; text: string }> = [];
    const studentNameById = new Map(
      availableStudents.map((student) => [student.id, student.display_name || student.username])
    );

    if (dashboardReportsLoaded) assignments.forEach((assignment) => {
      const assignmentLabel = assignment.title || assignment.topic_name || 'Untitled assignment';
      const completedRows = dashboardAssignmentReports[assignment.id] || [];
      const completedStudentIds = new Set(completedRows.map((row) => row.student_id));

      completedRows
        .filter((row) => Number(row.accuracy) < 65)
        .forEach((row) => {
          const studentName = studentNameById.get(row.student_id) || row.student_name || 'Student name unavailable';
          alertItems.push({
            tone: 'info',
            text: `${studentName} needs help with “${assignmentLabel}” (${Math.round(Number(row.accuracy))}% accuracy).`,
          });
        });

      if (assignment.completed_count >= assignment.student_count || assignment.assignment_mode === 'custom' || !assignment.batch) return;

      availableStudents
        .filter((student) => student.batch === assignment.batch && !completedStudentIds.has(student.id))
        .forEach((student) => {
          alertItems.push({
            tone: 'warning',
            text: `${student.display_name || student.username} has not completed “${assignmentLabel}”.`,
          });
        });
    });

    const visibleStudentAlerts = alertItems.slice(0, 8);
    if (alertItems.length > visibleStudentAlerts.length) {
      visibleStudentAlerts.push({
        tone: 'warning',
        text: `${alertItems.length - visibleStudentAlerts.length} more student follow-up${alertItems.length - visibleStudentAlerts.length === 1 ? '' : 's'} — open Reports for the full list.`,
      });
    }

    if (activeAssignments > 0 && alertItems.length === 0) {
      visibleStudentAlerts.push({
        tone: 'warning',
        text: `${activeAssignments} in-progress assignment${activeAssignments > 1 ? 's' : ''} — open Reports to review the assigned students.`,
      });
    }
    if (!teacherHasClassAssignments) {
      visibleStudentAlerts.push({ tone: 'warning', text: 'No class assignments found for this teacher account.' });
    }

    return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="teacher-section-header">
        <h2 className="teacher-section-title">
          <span>📊</span> Dashboard Overview
        </h2>
        <p className="teacher-section-subtitle">Manage your classes, questions, and track student progress</p>
      </div>

      {/* Dashboard shortcuts */}
      <div className="teacher-stats-grid">
        <button type="button" onClick={() => setView('students')} className="teacher-dashboard-stat cyan text-left" aria-label="Open My Classes">
          <div className="teacher-dashboard-stat-info">
            <h4>My Classes</h4>
            <div className="teacher-dashboard-stat-value">{myClasses.length || 0}</div>
            <p className="teacher-dashboard-stat-sub">{myClasses.slice(0, 3).join(' · ') || 'No classes assigned'}</p>
          </div>
          <div className="teacher-dashboard-stat-icon">🏫</div>
        </button>

        <button type="button" onClick={() => setView('assignments')} className="teacher-dashboard-stat green text-left" aria-label="Open Assignments">
          <div className="teacher-dashboard-stat-info">
            <h4>Assignments</h4>
            <div className="teacher-dashboard-stat-value">{assignments.length}</div>
            <p className="teacher-dashboard-stat-sub">{activeAssignments} in progress</p>
          </div>
          <div className="teacher-dashboard-stat-icon">📋</div>
        </button>

        <button type="button" onClick={() => setView('reports')} className="teacher-dashboard-stat amber text-left" aria-label="Open Reports">
          <div className="teacher-dashboard-stat-info">
            <h4>Reports</h4>
            <div className="teacher-dashboard-stat-value">{assignmentSuccess ? totalSubmissions : '—'}</div>
            <p className="teacher-dashboard-stat-sub">Completed assignment submissions</p>
          </div>
          <div className="teacher-dashboard-stat-icon">💬</div>
        </button>

        <button type="button" onClick={() => setView('reports')} className="teacher-dashboard-stat purple text-left" aria-label="Open Assignment Success reports">
          <div className="teacher-dashboard-stat-info">
            <h4>Assignment Success</h4>
            <div className="teacher-dashboard-stat-value">{assignmentSuccess ? `${successRate}%` : '—'}</div>
            <p className="teacher-dashboard-stat-sub">
              {hasAssignmentSuccess
                ? `${assignmentSuccess?.correct_answer_count ?? 0}/${assignmentSuccess?.answered_question_count ?? 0} answers correct`
                : 'Appears after the first submission'}
            </p>
          </div>
          <div className="teacher-dashboard-stat-icon">📈</div>
        </button>
      </div>

      <div className="teacher-dashboard-grid">
        <div className="teacher-panel-card">
          <h3 className="teacher-subsection-title">
            <span>🎯</span> Today&apos;s Priorities
          </h3>
          <ul className="teacher-priority-list">
            {priorityItems.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>

        {/* Quick Actions Section */}
        <div className="teacher-panel-card">
          <h3 className="teacher-subsection-title">
            <span>⚡</span> Quick Actions
          </h3>
          <div className="teacher-actions-grid teacher-actions-grid-compact">
          {(() => {
            // Pilot quota helper
            const tq = (label: string): PilotQuota | null => getQuotaForFeature(label, pilotQuotas);
            const isPilot = pilotQuotas?.is_pilot && !pilotQuotas?.expired;
            const isExhausted = (label: string) => tq(label)?.exhausted === true;
            const isDisabled = (label: string) => !isProPlan || (isPilot && isExhausted(label));
            const quotaBadge = (label: string) => {
              if (!isPilot) return null;
              const q = tq(label);
              if (!q) return null;
              const fid = FEATURE_TO_QUOTA[label];
              const ql = fid ? QUOTA_LABELS[fid] : '';
              if (q.exhausted) return <span className="teacher-pro-badge" style={{ background: 'linear-gradient(135deg, #ef4444, #f97316)', borderColor: '#ef4444' }}>⚡ UPGRADE</span>;
              return <span className="teacher-pro-badge" style={{ background: 'linear-gradient(135deg, #06b6d4, #3b82f6)', borderColor: '#22d3ee' }}>{q.remaining}/{q.limit} {ql}</span>;
            };
            return <>
          <button
            onClick={() => !isDisabled('Create Question') ? setView('create-question') : undefined}
            className={`teacher-action-card teacher-action-card--mini ${isDisabled('Create Question') ? 'opacity-50 cursor-not-allowed' : ''}`}
            data-color="pink"
            disabled={isDisabled('Create Question')}
          >
            {!isProPlan && !isPilot && <span className="teacher-pro-badge">PRO</span>}
            {quotaBadge('Create Question')}
            <div className="teacher-action-icon">➕</div>
            <h4 className="teacher-action-title">Create Question</h4>
            <p className="teacher-action-desc">Add a new question to your library</p>
          </button>

          <button
            onClick={() => !isDisabled('Question Bank') ? setView('question-bank') : undefined}
            className={`teacher-action-card teacher-action-card--mini ${isDisabled('Question Bank') ? 'opacity-50 cursor-not-allowed' : ''}`}
            data-color="cyan"
            disabled={isDisabled('Question Bank')}
          >
            {!isProPlan && !isPilot && <span className="teacher-pro-badge">PRO</span>}
            {quotaBadge('Question Bank')}
            <div className="teacher-action-icon">📚</div>
            <h4 className="teacher-action-title">Question Bank</h4>
            <p className="teacher-action-desc">View and manage all questions</p>
          </button>

          <button
            onClick={() => !isDisabled('Bulk Upload') ? setView('csv-upload') : undefined}
            className={`teacher-action-card teacher-action-card--mini ${isDisabled('Bulk Upload') ? 'opacity-50 cursor-not-allowed' : ''}`}
            data-color="green"
            disabled={isDisabled('Bulk Upload')}
          >
            {!isProPlan && !isPilot && <span className="teacher-pro-badge">PRO</span>}
            {quotaBadge('Bulk Upload')}
            <div className="teacher-action-icon">📤</div>
            <h4 className="teacher-action-title">Bulk Upload</h4>
            <p className="teacher-action-desc">Import questions via CSV</p>
          </button>

          <button
            onClick={() => !isDisabled('New Assignment') ? openBlankAssignmentForm() : undefined}
            className={`teacher-action-card teacher-action-card--mini ${isDisabled('New Assignment') ? 'opacity-50 cursor-not-allowed' : ''}`}
            data-color="purple"
            disabled={isDisabled('New Assignment')}
          >
            {!isProPlan && !isPilot && <span className="teacher-pro-badge">PRO</span>}
            {quotaBadge('New Assignment')}
            <div className="teacher-action-icon">📋</div>
            <h4 className="teacher-action-title">New Assignment</h4>
            <p className="teacher-action-desc">Assign work to students</p>
          </button>
            </>;
          })()}

          {/* Clan Wars - Free for non-pilot, quota-tracked for pilot */}
          {(() => {
            const isPilotLd = pilotQuotas?.is_pilot && !pilotQuotas?.expired;
            const ldQuota = getQuotaForFeature('Lockdown Mode', pilotQuotas);
            const ldExhausted = isPilotLd && ldQuota?.exhausted === true;
            return (
              <button
                onClick={() => !ldExhausted ? setView('clan-wars') : undefined}
                className={`teacher-action-card teacher-action-card-lockdown teacher-action-card--mini ${ldExhausted ? 'opacity-50 cursor-not-allowed' : ''}`}
                data-color="emerald"
                disabled={ldExhausted}
              >
                {!isPilotLd && <span className="teacher-free-badge">FREE</span>}
                {isPilotLd && ldQuota && !ldQuota.exhausted && (
                  <span className="teacher-pro-badge" style={{ background: 'linear-gradient(135deg, #06b6d4, #3b82f6)', borderColor: '#22d3ee' }}>
                    {ldQuota.remaining}/{ldQuota.limit} sessions
                  </span>
                )}
                {ldExhausted && (
                  <span className="teacher-pro-badge" style={{ background: 'linear-gradient(135deg, #ef4444, #f97316)', borderColor: '#ef4444' }}>⚡ UPGRADE</span>
                )}
                <div className="teacher-action-icon">⚔️</div>
                <h4 className="teacher-action-title">Clan Wars</h4>
                <p className="teacher-action-desc">Host an official class battle</p>
              </button>
            );
          })()}
        </div>
      </div>
      </div>

      <div className="teacher-dashboard-grid teacher-dashboard-grid-bottom">
        {/* Recent Activity Section */}
        <div className="teacher-panel-card">
          <h3 className="teacher-subsection-title">
            <span>📅</span> Recent Assignments
          </h3>
          {assignments.length > 0 ? (
            <div className="teacher-table-container">
              <table className="teacher-table teacher-responsive-summary-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Subject</th>
                    <th style={{ textAlign: 'center' }}>Completed</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.slice(0, 5).map((a) => (
                    <tr key={a.id}>
                      <td data-label="Assignment" style={{ fontWeight: 500 }}>{a.title}</td>
                      <td data-label="Subject">{a.subject_name}</td>
                      <td data-label="Completed" style={{ textAlign: 'center' }}>{a.completed_count}/{a.student_count}</td>
                      <td data-label="Status" style={{ textAlign: 'center' }}>
                        <span className={`teacher-badge ${
                          a.completed_count >= a.student_count ? 'success' : 'warning'
                        }`}>
                          {a.completed_count >= a.student_count ? '✅ Complete' : '⏳ In Progress'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No assignments yet. Use Quick Actions to create your first one.</p>
          )}
        </div>

        <div className="teacher-panel-card">
          <h3 className="teacher-subsection-title">
            <span>🚨</span> Student Alerts
          </h3>
          {visibleStudentAlerts.length > 0 ? (
            <ul className="teacher-alert-list">
              {visibleStudentAlerts.map((item, idx) => (
                <li key={idx} className={`teacher-alert-item ${item.tone}`}>
                  {item.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No critical alerts right now.</p>
          )}
        </div>
      </div>

      <div className="teacher-dashboard-grid teacher-dashboard-grid-bottom">
        <div className="teacher-panel-card">
          <h3 className="teacher-subsection-title">
            <span>🩺</span> Class Health Dashboard
          </h3>
          {classHealthRows.length === 0 ? (
            <p className="text-sm text-slate-500">No class health data yet. Class metrics will appear after assignments and submissions.</p>
          ) : (
            <div className="teacher-table-container">
              <table className="teacher-table teacher-responsive-summary-table">
                <thead>
                  <tr>
                    <th>Class</th>
                    <th style={{ textAlign: 'center' }}>Students</th>
                    <th style={{ textAlign: 'center' }}>In Progress</th>
                    <th style={{ textAlign: 'center' }}>Completion</th>
                    <th style={{ textAlign: 'center' }}>Avg Score</th>
                  </tr>
                </thead>
                <tbody>
                  {classHealthRows.map((row) => (
                    <tr key={row.classCode}>
                      <td data-label="Class" style={{ fontWeight: 600 }}>{row.classCode}</td>
                      <td data-label="Students" style={{ textAlign: 'center' }}>{row.studentCount}</td>
                      <td data-label="In progress" style={{ textAlign: 'center' }}>{row.assignmentsInProgress}</td>
                      <td data-label="Completion" style={{ textAlign: 'center' }}>
                        <span className={`teacher-badge ${row.completionRate >= 75 ? 'success' : row.completionRate >= 50 ? 'warning' : 'danger'}`}>
                          {row.completionRate}%
                        </span>
                      </td>
                      <td data-label="Average score" style={{ textAlign: 'center' }}>{row.averageScore !== null ? `${row.averageScore}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="teacher-panel-card">
          <h3 className="teacher-subsection-title">
            <span>🧯</span> At-Risk Students
          </h3>
          {atRiskStudents.length === 0 ? (
            <p className="text-sm text-slate-500">No high-risk students detected from current submissions.</p>
          ) : (
            <ul className="space-y-3">
              {atRiskStudents.map((student, index) => (
                <li key={`${student.name}-${index}`} className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-red-800">{student.name}</div>
                    <span className="text-xs text-red-700">{student.batch}</span>
                  </div>
                  <p className="text-xs text-red-700 mt-1">{student.reasons[0]}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="teacher-dashboard-grid teacher-dashboard-grid-bottom">
        <div className="teacher-panel-card">
          <h3 className="teacher-subsection-title">
            <span>⚠️</span> Top Issues
          </h3>
          {topIssues.length === 0 ? (
            <p className="text-sm text-slate-500">No major issues detected right now.</p>
          ) : (
            <ul className="teacher-alert-list">
              {topIssues.map((issue, index) => (
                <li key={index} className="teacher-alert-item warning">
                  {issue}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="teacher-panel-card">
          <h3 className="teacher-subsection-title">
            <span>✅</span> Recommended Actions
          </h3>
          <ul className="teacher-priority-list">
            {recommendedActions.map((action, index) => (
              <li key={index}>{action}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Geometry Builder is the only dashboard tool without its own portal navigation route. */}
      <div className="teacher-mb-8">
        <h3 className="teacher-subsection-title">
          <span>📐</span> Specialist Tool
        </h3>
        <div className="teacher-tools-grid teacher-tools-grid--single">
          {(() => {
            const tq = (label: string): PilotQuota | null => getQuotaForFeature(label, pilotQuotas);
            const isPilot = pilotQuotas?.is_pilot && !pilotQuotas?.expired;
            const isExhausted = (label: string) => tq(label)?.exhausted === true;
            const isDisabledT = (label: string) => !isProPlan || (isPilot && isExhausted(label));
            const quotaBadgeSm = (label: string) => {
              if (!isPilot) return null;
              const q = tq(label);
              if (!q) return null;
              const fid = FEATURE_TO_QUOTA[label];
              const ql = fid ? QUOTA_LABELS[fid] : '';
              if (q.exhausted) return <span className="teacher-pro-badge-sm" style={{ background: 'linear-gradient(135deg, #ef4444, #f97316)', borderColor: '#ef4444' }}>⚡ UPGRADE</span>;
              return <span className="teacher-pro-badge-sm" style={{ background: 'linear-gradient(135deg, #06b6d4, #3b82f6)', borderColor: '#22d3ee', color: '#e0f2fe' }}>{q.remaining}/{q.limit} {ql}</span>;
            };
            return <>
          <button
            type="button"
            onClick={() => !isDisabledT('Geometry Builder') ? setView('geometry-diagrams') : undefined}
            className={`teacher-tool-card teacher-tool-card--geometry orange ${isDisabledT('Geometry Builder') ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={isDisabledT('Geometry Builder')}
          >
            <div className="teacher-tool-icon">📐</div>
            <div className="teacher-tool-info">
              <h4 className="teacher-tool-title">Geometry Builder</h4>
              <p className="teacher-tool-desc">Create interactive diagram questions</p>
            </div>
            {!isProPlan && !isPilot && <span className="teacher-pro-badge-sm">PRO</span>}
            {quotaBadgeSm('Geometry Builder')}
          </button>
            </>;
          })()}
        </div>
      </div>
    </div>
  );
  };

  // Render Create Question Form
  const renderCreateQuestion = () => {
    // If teacher has no assigned classes/subjects, show access denied
    if (!teacherHasClassAssignments) {
      return (
        <div className="max-w-3xl mx-auto">
          <button
            onClick={() => setView('dashboard')}
            className="teacher-back-btn"
          >
            <span>←</span> Back to Dashboard
          </button>
          
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center mt-6">
            <div className="text-4xl mb-4">🔒</div>
            <h2 className="text-xl font-bold text-amber-800 mb-2">No Class Assignments</h2>
            <p className="text-amber-700 mb-4">
              You need to be assigned to at least one class and subject by your school admin before you can create questions.
            </p>
            <p className="text-sm text-amber-600">
              Please contact your school administrator to assign you to classes.
            </p>
          </div>
        </div>
      );
    }
    
    return (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={() => {
          setEditingQuestion(null);
          setView('question-bank');
        }}
        className="teacher-back-btn"
      >
        <span>←</span> Back to Questions
      </button>

      <h2 className="text-2xl font-bold text-slate-800 mb-6">
        {editingQuestion ? '✏️ Edit Question' : '➕ Create New Question'}
      </h2>

      {/* Question type selector */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Question type</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => {
              setQuestionType('multiple_choice');
              setQuestionText('');
              setCorrectAnswer('');
              setOptions([
                { text: '', image_url: undefined },
                { text: '', image_url: undefined },
                { text: '', image_url: undefined },
                { text: '', image_url: undefined }
              ]);
            }}
            className="p-3 bg-white hover:bg-cyan-50 border border-slate-200 hover:border-cyan-400 rounded-lg transition-all text-sm"
          >
            <div className="text-2xl mb-1">📝</div>
            <div className="text-slate-700 font-semibold">Multiple Choice</div>
          </button>
          
          <button
            type="button"
            onClick={() => {
              setQuestionType('true_false');
              setQuestionText('');
              setCorrectAnswer('True');
              setOptions([
                { text: 'True', image_url: undefined },
                { text: 'False', image_url: undefined }
              ]);
            }}
            className="p-3 bg-white hover:bg-green-50 border border-slate-200 hover:border-green-400 rounded-lg transition-all text-sm"
          >
            <div className="text-2xl mb-1">✓✗</div>
            <div className="text-slate-700 font-semibold">True/False</div>
          </button>
          
          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 p-3 text-sm opacity-65"
          >
            <div className="text-2xl mb-1">✏️</div>
            <div className="font-semibold text-slate-500">Short Answer</div>
            <div className="mt-1 text-xs text-slate-400">Unavailable</div>
          </button>
          
          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 p-3 text-sm opacity-65"
          >
            <div className="text-2xl mb-1">↕</div>
            <div className="font-semibold text-slate-500">Drag &amp; Drop</div>
            <div className="mt-1 text-xs text-slate-400">Coming soon</div>
          </button>
        </div>
      </div>

      <div className="teacher-card">
        <form onSubmit={handleCreateQuestion} className="space-y-6">
          {/* Subject & Difficulty */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="teacher-form-group">
              <label className="teacher-label">Subject</label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value as Subject)}
                className="teacher-select"
                required
              >
                {teacherAssignedSubjects.length > 0 ? (
                  teacherAssignedSubjects.map(subj => (
                    <option key={subj} value={subj}>{subj}</option>
                  ))
                ) : (
                  <>
                    <option value="Maths">Maths</option>
                    <option value="Science">Science</option>
                    <option value="English">English</option>
                    <option value="Russian Language">Russian Language</option>
                    <option value="Kyrgyz Language">Kyrgyz Language</option>
                    <option value="German Language">German Language</option>
                    <option value="Geography">Geography</option>
                    <option value="Global Perspective">Global Perspective</option>
                    <option value="ICT">ICT</option>
                  </>
                )}
              </select>
              {teacherAssignedSubjects.length > 0 && (
                <p className="text-xs text-slate-500 mt-1">Only subjects assigned to your classes</p>
              )}
            </div>

            <div className="teacher-form-group">
              <label className="teacher-label">Difficulty</label>
              <select
                value={difficulty}
                onChange={(e) => {
                  const newDifficulty = e.target.value as QuestionDifficulty;
                  setDifficulty(newDifficulty);
                  // Auto-set points based on difficulty
                  setPoints(getDefaultPointsForDifficulty(newDifficulty));
                }}
                className="teacher-select"
                required
              >
                <option value="easy">⭐ Easy (10 XP)</option>
                <option value="medium">⭐⭐ Medium (15 XP)</option>
                <option value="hard">⭐⭐⭐ Hard (20 XP)</option>
              </select>
            </div>
          </div>

          {/* Topic Selection */}
          <div className="teacher-form-group">
            <label className="teacher-label">My Pool topic</label>
            <div className={`teacher-topic-picker ${topicMode === 'custom' && !teacherOwnedTopics.includes(customTopicName) ? 'is-creating' : ''}`}>
              <select
                value={topicMode === 'general' ? 'General' : (teacherOwnedTopics.includes(customTopicName) ? customTopicName : '__new__')}
                onChange={(e) => {
                  if (e.target.value === 'General') {
                    setTopicMode('general');
                    setCustomTopicName('');
                  } else if (e.target.value === '__new__') {
                    setTopicMode('custom');
                    setCustomTopicName('');
                  } else {
                    setTopicMode('custom');
                    setCustomTopicName(e.target.value);
                  }
                }}
                className="teacher-select"
              >
                <option value="General">General</option>
                {teacherOwnedTopics.filter((topic) => topic !== 'General').map((topic) => <option key={topic} value={topic}>{topic}</option>)}
                <option value="__new__">＋ Create a new topic</option>
              </select>
              {topicMode === 'custom' && !teacherOwnedTopics.includes(customTopicName) && (
                <input
                  type="text"
                  value={customTopicName}
                  onChange={(e) => setCustomTopicName(e.target.value)}
                  className="teacher-input teacher-topic-picker__new"
                  placeholder="Name the new topic"
                  required
                />
              )}
            </div>
            <p className="text-xs text-slate-500 mt-2">Choose one of your topics or create a new one. The topic is added to My Pool when this question is saved.</p>
          </div>

          {/* Question Type */}
          <div className="teacher-form-group">
            <label className="teacher-label">Question type</label>
            <select
              value={questionType}
              onChange={(e) => {
                const nextQuestionType = e.target.value as typeof questionType;
                setQuestionType(nextQuestionType);
                setCorrectAnswer(nextQuestionType === 'true_false' ? 'True' : '');
              }}
              className="teacher-select"
              required
            >
              <option value="multiple_choice">Multiple Choice</option>
              <option value="true_false">True/False</option>
              <option value="short_answer" disabled>Short Answer — unavailable</option>
              <option value="drag_drop" disabled>Drag &amp; Drop — coming soon</option>
            </select>
          </div>

          {/* Question Text */}
          <div className="teacher-form-group">
            <label className="teacher-label">Question</label>
            <textarea
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              onPaste={(e) => {
                // Handle image paste from clipboard for question image
                const items = e.clipboardData?.items;
                if (items) {
                  for (let i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf('image') !== -1) {
                      const file = items[i].getAsFile();
                      if (file) {
                        setQuestionImage(file);
                        setQuestionImageUrl('');
                      }
                      break;
                    }
                  }
                }
              }}
              className="teacher-textarea min-h-[100px]"
              placeholder="Enter your question here... (paste screenshot to add image)"
              required
            />
          </div>

          {/* Question Image (Optional) */}
          <div className="teacher-form-group">
            <label className="teacher-label">Question Image (Optional)</label>
            <div 
              className="space-y-3"
              onPaste={(e) => {
                // Handle image paste from clipboard
                const items = e.clipboardData?.items;
                if (items) {
                  for (let i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf('image') !== -1) {
                      e.preventDefault();
                      const file = items[i].getAsFile();
                      if (file) {
                        setQuestionImage(file);
                        setQuestionImageUrl('');
                      }
                      break;
                    }
                  }
                }
              }}
              tabIndex={0}
            >
              {(questionImageUrl || questionImage) && (
                <div className="relative inline-block">
                  <img
                    src={questionImage ? URL.createObjectURL(questionImage) : questionImageUrl}
                    alt="Question preview"
                    className="max-w-full max-h-48 rounded-lg border border-slate-300"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setQuestionImage(null);
                      setQuestionImageUrl('');
                    }}
                    className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold"
                  >
                    ×
                  </button>
                </div>
              )}
              {!questionImage && !questionImageUrl && (
                <div 
                  className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center cursor-pointer hover:border-cyan-500 transition-all bg-slate-50"
                  onClick={() => document.getElementById('question-image-input')?.click()}
                >
                  <div className="text-slate-500">
                    <span className="text-2xl">📷</span>
                    <p className="mt-2">Click to upload or <span className="text-cyan-600 font-medium">paste screenshot</span> (Ctrl+V)</p>
                    <p className="text-xs mt-1">JPEG, PNG, GIF, SVG, or WebP (max 5MB)</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3">
                <label className="cursor-pointer bg-purple-50 hover:bg-purple-100 border border-purple-300 rounded-lg px-4 py-2 text-purple-700 font-medium transition-all">
                  📷 {questionImage || questionImageUrl ? 'Change Image' : 'Upload Image'}
                  <input
                    id="question-image-input"
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setQuestionImage(file);
                        setQuestionImageUrl('');
                      }
                    }}
                    className="hidden"
                  />
                </label>
                <span className="text-xs text-slate-500">or paste screenshot (Ctrl+V)</span>
              </div>
              {uploadingImage && (
                <div className="text-cyan-600 text-sm animate-pulse">⏳ Uploading image...</div>
              )}
            </div>
          </div>

          {/* Multiple Choice Options */}
          {questionType === 'multiple_choice' && (
            <div className="teacher-form-group">
              <label className="teacher-label">Answer Options (Check the correct answer)</label>
              <div className="space-y-4">
                {options.map((option, index) => (
                  <div 
                    key={index} 
                    className={`bg-slate-50 border rounded-xl p-4 transition-all ${
                      correctAnswer === option.text && option.text.trim() 
                        ? 'border-emerald-500 bg-emerald-50' 
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {/* Correct Answer Checkbox */}
                      <input
                        type="checkbox"
                        checked={correctAnswer === option.text && option.text.trim() !== ''}
                        onChange={(e) => {
                          if (e.target.checked && option.text.trim()) {
                            setCorrectAnswer(option.text);
                          } else if (!e.target.checked && correctAnswer === option.text) {
                            setCorrectAnswer('');
                          }
                        }}
                        className="w-5 h-5 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer"
                        title="Mark as correct answer"
                      />
                      <span className="text-cyan-600 font-bold">{String.fromCharCode(65 + index)}.</span>
                      <input
                        type="text"
                        value={option.text}
                        onChange={(e) => {
                          const oldText = option.text;
                          const newOptions = [...options];
                          newOptions[index] = { ...newOptions[index], text: e.target.value };
                          setOptions(newOptions);
                          // Update correct answer if this was the correct one
                          if (correctAnswer === oldText) {
                            setCorrectAnswer(e.target.value);
                          }
                        }}
                        onPaste={(e) => {
                          // Handle image paste from clipboard
                          const items = e.clipboardData?.items;
                          if (items) {
                            for (let i = 0; i < items.length; i++) {
                              if (items[i].type.indexOf('image') !== -1) {
                                e.preventDefault();
                                const file = items[i].getAsFile();
                                if (file) {
                                  const newImages = [...optionImages];
                                  newImages[index] = file;
                                  setOptionImages(newImages);
                                  const newOptions = [...options];
                                  newOptions[index] = { ...newOptions[index], image_url: undefined };
                                  setOptions(newOptions);
                                }
                                break;
                              }
                            }
                          }
                        }}
                        className="teacher-input flex-1"
                        placeholder={`Option ${String.fromCharCode(65 + index)} text (paste image here)`}
                        required
                      />
                      {correctAnswer === option.text && option.text.trim() && (
                        <span className="text-emerald-600 text-sm font-semibold">✓ Correct</span>
                      )}
                    </div>
                    {/* Option Image */}
                    <div className="ml-12 flex items-center gap-3">
                      {(option.image_url || optionImages[index]) && (
                        <div className="relative inline-block">
                          <img
                            src={optionImages[index] ? URL.createObjectURL(optionImages[index]!) : option.image_url}
                            alt={`Option ${String.fromCharCode(65 + index)} preview`}
                            className="max-h-20 rounded border border-slate-300"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const newOptions = [...options];
                              newOptions[index] = { ...newOptions[index], image_url: undefined };
                              setOptions(newOptions);
                              const newImages = [...optionImages];
                              newImages[index] = null;
                              setOptionImages(newImages);
                            }}
                            className="absolute -top-1 -right-1 bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold"
                          >
                            ×
                          </button>
                        </div>
                      )}
                      <label className="cursor-pointer text-xs bg-purple-50 hover:bg-purple-100 border border-purple-300 rounded px-2 py-1 text-purple-700 font-medium transition-all">
                        📷 {option.image_url || optionImages[index] ? 'Change' : 'Add Image'}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const newImages = [...optionImages];
                              newImages[index] = file;
                              setOptionImages(newImages);
                              // Clear existing URL when new file is selected
                              const newOptions = [...options];
                              newOptions[index] = { ...newOptions[index], image_url: undefined };
                              setOptions(newOptions);
                            }
                          }}
                          className="hidden"
                        />
                      </label>
                      <span className="text-xs text-slate-500">or paste screenshot</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* True/False Answer */}
          {questionType === 'true_false' && (
            <div className="teacher-form-group">
              <fieldset>
                <legend className="teacher-label">
                Correct Answer
                </legend>
                <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Correct answer">
                  {(['True', 'False'] as const).map((answer) => (
                    <label
                      key={answer}
                      className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border p-3 font-semibold transition-all ${
                        correctAnswer.toLowerCase() === answer.toLowerCase()
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="true-false-correct-answer"
                        value={answer}
                        checked={correctAnswer.toLowerCase() === answer.toLowerCase()}
                        onChange={() => setCorrectAnswer(answer)}
                        className="h-5 w-5 border-slate-300 text-emerald-500 focus:ring-emerald-500"
                        required
                      />
                      {answer}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          )}

          {/* Explanation */}
          <div className="teacher-form-group">
            <label className="teacher-label">Explanation (Optional)</label>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              className="teacher-textarea"
              placeholder="Explain why this answer is correct..."
              rows={3}
            />
          </div>

          {/* Points */}
          <div className="teacher-form-group">
            <label className="teacher-label">
              Points (XP Reward) <span className="text-slate-500 font-normal">— Max {MAX_QUESTION_XP} XP</span>
            </label>
            <input
              type="number"
              value={points}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 0;
                setPoints(Math.min(Math.max(val, 1), MAX_QUESTION_XP));
              }}
              className="teacher-input"
              min="1"
              max={MAX_QUESTION_XP}
              required
            />
            <p className="text-xs text-slate-500 mt-1">
              Default: Easy=10, Medium=15, Hard=20. You can adjust up to {MAX_QUESTION_XP} XP.
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="teacher-btn teacher-btn-primary w-full py-4 text-lg"
          >
            {editingQuestion ? '💾 Save Changes' : '✨ Create Question'}
          </button>
        </form>
      </div>
    </div>
    );
  };

  // Render CSV Upload View
  const renderCSVUpload = () => (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={() => setView('question-bank')}
        className="teacher-back-link mb-4"
      >
        ← Back to Questions
      </button>

      <div className="teacher-card">
        <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
          <span className="text-2xl">📤</span> Bulk Upload Questions
        </h2>

        {/* Instructions */}
        <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-6 mb-6">
          <h3 className="font-bold text-cyan-700 mb-3 flex items-center gap-2">
            <span>📋</span> How to Use CSV Upload
          </h3>
          <ol className="list-decimal list-inside space-y-2 text-sm text-slate-600">
            <li>Download the CSV template using the button below</li>
            <li>Fill in your questions following the template format</li>
            <li>For fractions and comparisons, format option cells as <strong>Text</strong> so spreadsheets do not convert them into dates or TRUE/FALSE</li>
            <li>Save your file as a CSV (comma-separated values)</li>
            <li>Upload the file using the upload button</li>
            <li>Review the results and fix any errors if needed</li>
          </ol>
        </div>

        {/* CSV Format Guide */}
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-6 mb-6">
          <h3 className="font-bold text-purple-700 mb-3">📝 CSV Format</h3>
          <div className="text-xs text-slate-500 mb-2">Columns (in order):</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-slate-600">1. <code className="text-cyan-600 bg-cyan-50 px-1 rounded">subject</code> - Maths, Science, English, etc.</div>
            <div className="text-slate-600">2. <code className="text-cyan-600 bg-cyan-50 px-1 rounded">topic</code> - General or any custom topic</div>
            <div className="text-slate-600">3. <code className="text-cyan-600 bg-cyan-50 px-1 rounded">difficulty</code> - easy, medium, hard</div>
            <div className="text-slate-600">4. <code className="text-cyan-600 bg-cyan-50 px-1 rounded">question_type</code> - multiple_choice, true_false, short_answer</div>
            <div className="text-slate-600">5. <code className="text-cyan-600 bg-cyan-50 px-1 rounded">question_text</code> - The question</div>
            <div className="text-slate-600">6-9. <code className="text-cyan-600 bg-cyan-50 px-1 rounded">option1-4</code> - Answer choices</div>
            <div className="text-slate-600">10. <code className="text-cyan-600 bg-cyan-50 px-1 rounded">correct_answer</code> - The correct answer</div>
            <div className="text-slate-600">11. <code className="text-cyan-600 bg-cyan-50 px-1 rounded">explanation</code> - Why it's correct</div>
            <div className="text-slate-600">12. <code className="text-cyan-600 bg-cyan-50 px-1 rounded">points</code> - Point value (10-50)</div>
          </div>
        </div>

        {/* Download Template Button */}
        <div className="mb-6">
          <button
            onClick={downloadCSVTemplate}
            className="teacher-btn teacher-btn-primary w-full py-4 text-lg"
          >
            <span className="text-2xl">📥</span>
            <span>Download CSV Template</span>
          </button>
        </div>

        {/* Upload Section */}
        <div className="border-2 border-dashed border-emerald-400 rounded-xl p-8 text-center bg-emerald-50/50">
          <input
            type="file"
            accept=".csv"
            onChange={handleCSVUpload}
            disabled={uploading}
            className="hidden"
            id="csv-upload"
          />
          <label
            htmlFor="csv-upload"
            className={`cursor-pointer inline-block ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="text-6xl mb-4">📤</div>
            <div className="font-bold text-xl text-emerald-600 mb-2">
              {uploading ? 'Uploading...' : 'Click to Upload CSV File'}
            </div>
            <div className="text-sm text-slate-500">
              {uploading ? 'Please wait while we process your questions' : 'Select a .csv file from your computer'}
            </div>
          </label>

          {/* Upload Progress */}
          {uploading && uploadProgress.total > 0 && (
            <div className="mt-6">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-500">Processing questions...</span>
                <span className="text-cyan-600 font-medium">{uploadProgress.current} / {uploadProgress.total}</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-300"
                  style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Tips */}
        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h4 className="font-bold text-amber-700 mb-2 flex items-center gap-2">
            <span>💡</span> Tips for Success
          </h4>
          <ul className="text-sm text-slate-600 space-y-1">
            <li>• Use quotes around text with commas (e.g., "What is 2 + 2, exactly?")</li>
            <li>• For true/false questions, leave option1-4 empty</li>
            <li>• For short answer, leave option1-4 empty</li>
            <li>• Ensure correct_answer matches one of your options exactly</li>
            <li>• Test with 1-2 questions first before uploading many</li>
          </ul>
        </div>
      </div>
    </div>
  );

  const renderStudents = () => {
    const classMap = new Map<string, { subjects: Set<string>; students: StudentForAssignment[] }>();
    assignedClasses
      .filter((assignedClass) => assignedClass.is_active)
      .forEach((assignedClass) => {
        const existing = classMap.get(assignedClass.class_code) || { subjects: new Set<string>(), students: [] };
        if (assignedClass.subject) existing.subjects.add(assignedClass.subject);
        classMap.set(assignedClass.class_code, existing);
      });
    availableStudents.forEach((student) => {
      const classCode = student.batch || 'Class not assigned';
      const existing = classMap.get(classCode) || { subjects: new Set<string>(), students: [] };
      existing.students.push(student);
      classMap.set(classCode, existing);
    });
    const search = studentSearchTerm.trim().toLocaleLowerCase();
    const classGroups = [...classMap.entries()]
      .map(([classCode, value]) => ({
        classCode,
        subjects: [...value.subjects].sort(),
        students: value.students.filter((student) => !search || [
          student.display_name,
          student.batch,
        ].join(' ').toLocaleLowerCase().includes(search)),
      }))
      .filter((group) => !search ||
        group.students.length > 0 ||
        group.classCode.toLocaleLowerCase().includes(search) ||
        group.subjects.some((subjectName) => subjectName.toLocaleLowerCase().includes(search)))
      .sort((left, right) => left.classCode.localeCompare(right.classCode));

    const printClassDocuments = (groups: typeof classGroups, mode: 'roster' | 'register') => {
      if (!groups.length) return;
      const today = new Date().toISOString().slice(0, 10);
      const bodyHtml = groups.map((group, groupIndex) => `
        <section class="${groupIndex > 0 ? 'document-page-break' : ''}">
          <h2>Class ${escapeSchoolDocumentHtml(group.classCode)}</h2>
          <p><strong>Subjects:</strong> ${escapeSchoolDocumentHtml(group.subjects.join(', ') || 'Not linked')}</p>
          <table>
            <thead><tr><th style="width:8%">No.</th><th>Official student name</th><th style="width:14%">Grade</th>${mode === 'register' ? '<th>Present</th><th>Absent</th><th>Late</th><th style="width:24%">Notes</th>' : '<th style="width:35%">Teacher notes</th>'}</tr></thead>
            <tbody>${group.students.length ? group.students.map((student, index) => `<tr><td>${index + 1}</td><td>${escapeSchoolDocumentHtml(student.display_name)}</td><td>${escapeSchoolDocumentHtml(student.grade || '—')}</td>${mode === 'register' ? '<td>□</td><td>□</td><td>□</td><td></td>' : '<td></td>'}</tr>`).join('') : `<tr><td colspan="${mode === 'register' ? 7 : 4}">No students are currently enrolled in this class.</td></tr>`}</tbody>
          </table>
        </section>`).join('');
      try {
        openSchoolDocumentPreview({
          meta: {
            documentId: createSchoolDocumentId(mode === 'register' ? 'roster' : 'class'),
            templateVersion: mode === 'register' ? 'class-register-v1' : 'class-roster-v1',
            title: mode === 'register' ? 'Class Attendance Register' : 'Class Roster',
            subtitle: groups.length === 1 ? `Class ${groups[0]?.classCode || ''}` : `${groups.length} assigned classes`,
            schoolName: resolvedBranding.schoolName,
            schoolLogoUrl: resolvedBranding.schoolLogoUrl,
            audience: 'teacher',
            status: 'final',
            confidentiality: 'confidential',
            generatedAt: new Date().toISOString(),
            generatedBy: profile.full_name || profile.username || 'Teacher',
            className: groups.length === 1 ? groups[0]?.classCode : undefined,
            schoolId: profile.school_id,
            sourceType: mode === 'register' ? 'class_register' : 'class_roster',
            sourceId: groups.length === 1 ? groups[0]?.classCode : 'all-assigned-classes',
          },
          bodyHtml,
          orientation: 'portrait',
          inkSaver: true,
          fileName: schoolDocumentFileName(resolvedBranding.schoolName, mode === 'register' ? 'Attendance_Register' : 'Class_Roster', groups.length === 1 ? groups[0]?.classCode : 'All_Classes', today),
        });
      } catch (error) {
        brainsAlert(error instanceof Error ? error.message : 'Unable to open the class document.', 'info');
      }
    };

    return (
      <div className="space-y-6">
        <div className="teacher-section-header">
          <div>
            <h2>🏫 My Classes</h2>
            <p className="text-sm text-slate-500 mt-1">Every assigned class, subject, and student in one organised view.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="teacher-btn teacher-btn-secondary" onClick={() => printClassDocuments(classGroups, 'roster')} disabled={!classGroups.length}>Print all rosters</button>
            <button type="button" className="teacher-btn teacher-btn-primary" onClick={() => printClassDocuments(classGroups, 'register')} disabled={!classGroups.length}>Attendance register</button>
          </div>
        </div>

        <div className="teacher-card p-4">
          <label htmlFor="teacher-student-search" className="sr-only">Search classes and students</label>
          <input
            id="teacher-student-search"
            type="search"
            value={studentSearchTerm}
            onChange={(event) => setStudentSearchTerm(event.target.value)}
            placeholder="Search by class, subject, or student…"
            className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
        </div>

        {classGroups.length === 0 ? (
          <div className="teacher-card p-10 text-center text-slate-500">No classes or students match this search.</div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-2">
            {classGroups.map((group) => (
                <section key={group.classCode} className="teacher-card p-0 overflow-hidden">
                  <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-bold text-slate-800">Class {group.classCode}</h3>
                      <div className="flex items-center gap-2"><span className="text-sm text-slate-500">{group.students.length} student{group.students.length === 1 ? '' : 's'}</span><button type="button" className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100" onClick={() => printClassDocuments([group], 'roster')}>Print</button></div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {group.subjects.length
                        ? group.subjects.map((subjectName) => <span key={subjectName} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">{subjectName}</span>)
                        : <span className="text-xs text-slate-400">No subject linked</span>}
                    </div>
                  </div>
                  {group.students.length ? (
                    <ul className="divide-y divide-slate-100">
                    {group.students.map((student) => (
                      <li key={student.id} className="flex items-center gap-3 px-5 py-3">
                        <img src={student.avatar_url || '/default-avatar.png'} alt="" className="h-10 w-10 rounded-full object-cover bg-slate-100" />
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-800">{student.display_name}</div>
                          <div className="truncate text-xs text-slate-500">Grade {student.grade || '—'}</div>
                        </div>
                      </li>
                    ))}
                    </ul>
                  ) : (
                    <p className="px-5 py-6 text-sm text-slate-500">No students are currently enrolled in this assigned class.</p>
                  )}
                </section>
            ))}
          </div>
        )}
      </div>
    );
  };

  const handleDeleteAssignment = async (assignment: TeacherAssignmentSummary) => {
    if (!teacher || assignment.teacher_id !== teacher.id || deletingAssignmentId) {
      brainsAlert('You can only delete assignments that you created.', 'error');
      return;
    }

    const assignmentName = assignment.title || assignment.topic_name;
    const firstConfirmation = await brainsConfirm({
      title: `Delete “${assignmentName}”?`,
      message: 'This will permanently delete the assignment for every assigned student.',
      confirmLabel: 'Continue to final warning',
      cancelLabel: 'Keep assignment',
      destructive: true,
    });
    if (!firstConfirmation) return;

    const finalConfirmation = await brainsConfirm({
      title: 'Final confirmation: this cannot be restored',
      message: 'Deleting this assignment is permanent. The assignment and all related student submissions, answers, results, and grades will be lost and cannot be recovered.',
      confirmLabel: 'Permanently delete all data',
      cancelLabel: 'Cancel deletion',
      destructive: true,
    });
    if (!finalConfirmation) return;

    setDeletingAssignmentId(assignment.id);
    try {
      await GameService.delete_teacher_assignment(assignment.id);
      setAssignments((current) => current.filter((item) => item.id !== assignment.id));
      if (selectedReportAssignment?.id === assignment.id) {
        setSelectedReportAssignment(null);
        setAssignmentReport([]);
      }
      brainsAlert('Assignment and all related data were permanently deleted.', 'success');
    } catch (error) {
      console.error('Error deleting assignment:', error);
      brainsAlert(error instanceof Error ? error.message : 'Unable to delete assignment. Please try again.', 'error');
    } finally {
      setDeletingAssignmentId(null);
    }
  };

  const renderAssignments = () => (
    <div className="space-y-6">
      {/* Header with Title and Create Button */}
      <div className="teacher-section-header">
        <h2>🗂️ Assignments</h2>
        <button
          onClick={openBlankAssignmentForm}
          className="teacher-btn teacher-btn-primary"
        >
          ➕ New Assignment
        </button>
      </div>

      {/* Folder Organization: Filters & Search */}
      {assignments.length > 0 && (
        <div className="teacher-card p-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(240px,1fr)_minmax(0,1.5fr)_minmax(0,1fr)]">
            {/* Search Bar */}
            <div className="flex-1 w-full lg:w-auto">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                <input
                  type="text"
                  placeholder="Search assignments..."
                  value={assignmentSearchTerm}
                  onChange={(e) => setAssignmentSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-white text-slate-700"
                />
              </div>
            </div>

            <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <legend className="px-1 text-xs font-bold uppercase tracking-wider text-slate-500">Subject</legend>
              <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setAssignmentSubjectFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  assignmentSubjectFilter === 'all'
                    ? 'bg-cyan-500 text-white shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                📁 All Subjects
              </button>
              {assignmentSubjects.map(subject => (
                <button
                  key={subject}
                  onClick={() => setAssignmentSubjectFilter(subject as Subject)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    assignmentSubjectFilter === subject
                      ? 'bg-purple-500 text-white shadow-md'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  📂 {subject}
                </button>
              ))}
              </div>
            </fieldset>

            <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <legend className="px-1 text-xs font-bold uppercase tracking-wider text-slate-500">Progress</legend>
              <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setAssignmentStatusFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  assignmentStatusFilter === 'all'
                    ? 'bg-slate-700 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setAssignmentStatusFilter('in-progress')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  assignmentStatusFilter === 'in-progress'
                    ? 'bg-amber-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                ⏳ In Progress
              </button>
              <button
                onClick={() => setAssignmentStatusFilter('completed')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  assignmentStatusFilter === 'completed'
                    ? 'bg-green-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                ✅ Completed
              </button>
              </div>
            </fieldset>
          </div>

          {/* Results Summary */}
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-sm text-slate-500">
              Showing {filteredAssignments.length} of {assignments.length} assignments
            </span>
            {(assignmentSearchTerm || assignmentSubjectFilter !== 'all' || assignmentStatusFilter !== 'all') && (
              <button
                onClick={() => {
                  setAssignmentSearchTerm('');
                  setAssignmentSubjectFilter('all');
                  setAssignmentStatusFilter('all');
                }}
                className="text-sm text-cyan-600 hover:text-cyan-700 font-medium"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      )}

      {assignments.length === 0 ? (
        <div className="teacher-card p-12 text-center">
          <div className="text-6xl mb-4">🧭</div>
          <p className="text-xl text-slate-500 mb-4">No assignments yet</p>
          <p className="text-slate-400">Create a mission to block normal quests until students finish.</p>
        </div>
      ) : filteredAssignments.length === 0 ? (
        <div className="teacher-card p-12 text-center">
          <div className="text-5xl mb-4">🔍</div>
          <p className="text-lg text-slate-500 mb-2">No assignments match your filters</p>
          <button
            onClick={() => {
              setAssignmentSearchTerm('');
              setAssignmentSubjectFilter('all');
              setAssignmentStatusFilter('all');
            }}
            className="text-cyan-600 hover:text-cyan-700 font-medium"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
            <div><span className="text-xs font-bold uppercase tracking-wider text-blue-600">All assignments</span><h3 className="mt-1 text-lg font-bold text-slate-800">Assignment workspace</h3></div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">{filteredAssignments.length} shown</span>
          </header>
          <div className="grid gap-3 p-4 xl:grid-cols-2">
            {filteredAssignments.map((assignment) => {
                          const completed = assignment.student_count > 0 && assignment.completed_count >= assignment.student_count;
                          const completionPercent = assignment.student_count > 0
                            ? Math.round((assignment.completed_count / assignment.student_count) * 100)
                            : 0;
                          return (
                            <article key={assignment.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <span className="text-xs font-bold text-blue-600">{assignment.subject_name} · {assignment.topic_name}</span>
                                  <h5 className="mt-1 text-lg font-bold text-slate-800">{assignment.title || assignment.topic_name}</h5>
                                </div>
                                <span className={`rounded-full px-3 py-1 text-xs font-bold ${completed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{completed ? 'Completed' : `${completionPercent}% complete`}</span>
                              </div>
                              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" aria-label={`${completionPercent}% completed`}>
                                <span className={`block h-full rounded-full ${completed ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${completionPercent}%` }} />
                              </div>
                              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                                <div><dt className="text-xs font-semibold uppercase text-slate-400">Class</dt><dd>{assignment.assignment_mode === 'custom' ? 'Selected students' : assignment.batch || '—'}</dd></div>
                                <div><dt className="text-xs font-semibold uppercase text-slate-400">Created</dt><dd>{new Date(assignment.assigned_at).toLocaleDateString()}</dd></div>
                                <div><dt className="text-xs font-semibold uppercase text-slate-400">Questions</dt><dd>{assignment.question_count}</dd></div>
                                <div><dt className="text-xs font-semibold uppercase text-slate-400">Students</dt><dd>{assignment.student_count}</dd></div>
                                <div><dt className="text-xs font-semibold uppercase text-slate-400">Completed</dt><dd>{assignment.completed_count}/{assignment.student_count}</dd></div>
                                <div><dt className="text-xs font-semibold uppercase text-slate-400">Due</dt><dd>{assignment.due_at ? new Date(assignment.due_at).toLocaleDateString() : 'None'}</dd></div>
                              </dl>
                              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                                <button onClick={() => handleOpenReport(assignment)} className="teacher-btn teacher-btn-secondary w-full">
                                  View report
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteAssignment(assignment)}
                                  disabled={deletingAssignmentId !== null}
                                  className="teacher-btn w-full border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  aria-label={`Delete ${assignment.title || assignment.topic_name}`}
                                >
                                  {deletingAssignmentId === assignment.id ? 'Deleting…' : 'Delete assignment'}
                                </button>
                              </div>
                            </article>
                          );
            })}
          </div>
        </section>
      )}
    </div>
  );

  const renderCreateAssignment = () => {
    if (!teacherHasClassAssignments) {
      return (
        <div className="max-w-3xl mx-auto">
          <button onClick={() => setView('dashboard')} className="teacher-back-link mb-6">
            <span>←</span> Back to Dashboard
          </button>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center mt-6">
            <div className="text-4xl mb-4">🔒</div>
            <h2 className="text-xl font-bold text-amber-800 mb-2">No Class Assignments</h2>
            <p className="text-amber-700 mb-4">
              You need to be assigned to at least one class and subject by your school admin before you can create assignments.
            </p>
            <p className="text-sm text-amber-600">Please contact your school administrator to assign you to classes.</p>
          </div>
        </div>
      );
    }

    return (
      <React.Suspense
        fallback={(
          <div className="min-h-[60vh] grid place-items-center rounded-2xl border border-cyan-400/20 bg-slate-950 text-cyan-100">
            Preparing assignment workspace…
          </div>
        )}
      >
        <AssignmentWizard
          initialStep={assignmentLockedSubject ? 2 : 1}
          lockedSubject={assignmentLockedSubject}
          assignmentMode={assignmentMode}
          setAssignmentMode={setAssignmentMode}
          assignmentBatches={assignmentBatches}
          setAssignmentBatches={setAssignmentBatches}
          assignmentSubject={assignmentSubject}
          setAssignmentSubject={setAssignmentSubject}
          assignmentTitle={assignmentTitle}
          setAssignmentTitle={setAssignmentTitle}
          assignmentDescription={assignmentDescription}
          setAssignmentDescription={setAssignmentDescription}
          assignmentInstructions={assignmentInstructions}
          setAssignmentInstructions={setAssignmentInstructions}
          assignmentQuestionIds={assignmentQuestionIds}
          setAssignmentQuestionIds={setAssignmentQuestionIds}
          assignmentDueAt={assignmentDueAt}
          setAssignmentDueAt={setAssignmentDueAt}
          assignmentDifficulty={assignmentDifficulty}
          setAssignmentDifficulty={setAssignmentDifficulty}
          assignmentTopicMode={assignmentTopicMode}
          setAssignmentTopicMode={setAssignmentTopicMode}
          assignmentTopicName={assignmentTopicName}
          setAssignmentTopicName={setAssignmentTopicName}
          assignmentSubmitting={assignmentSubmitting}
          availableStudents={availableStudents}
          selectedStudentIds={selectedStudentIds}
          setSelectedStudentIds={setSelectedStudentIds}
          assignedClasses={assignedClasses}
          teacherAssignedSubjects={teacherAssignedSubjects}
          teacherId={teacher?.id}
          questions={questions}
          onSubmit={handleCreateAssignment}
          onCancel={() => setView('assignments')}
        />
      </React.Suspense>
    );
  };

  const renderReports = () => (
    <div>
      <div className="teacher-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <h2>📊 Assignment Reports</h2>
        {assignments.length > 0 && (
          <button
            onClick={() => setView('collective-report')}
            className="teacher-btn teacher-btn-primary text-sm flex items-center gap-2"
          >
            📋 Collective Report
          </button>
        )}
      </div>
      {assignments.length === 0 ? (
        <div className="teacher-card p-10 text-center">
          <div className="text-5xl mb-3">📄</div>
          <p className="text-slate-500">Create an assignment to see progress here.</p>
        </div>
      ) : (
        <div className="teacher-card p-0 overflow-hidden">
          <div className="teacher-mobile-record-list" aria-label="Assignment reports">
            {assignments.map((assignment) => {
              const completed = assignment.completed_count >= assignment.student_count;
              const completionPercent = assignment.student_count > 0
                ? Math.round((assignment.completed_count / assignment.student_count) * 100)
                : 0;
              return (
                <article key={assignment.id} className="teacher-mobile-record-card">
                  <div className="teacher-mobile-record-heading">
                    <div>
                      <span className="teacher-mobile-record-eyebrow">{assignment.subject_name}</span>
                      <h3>{assignment.title || assignment.topic_name}</h3>
                    </div>
                    <span className={`teacher-badge ${completed ? 'success' : 'warning'}`}>
                      {completed ? 'Complete' : 'In progress'}
                    </span>
                  </div>
                  <dl className="teacher-mobile-record-meta">
                    <div><dt>Class</dt><dd>{assignment.assignment_mode === 'custom' ? 'Selected students' : assignment.batch || '—'}</dd></div>
                    <div><dt>Questions</dt><dd>{assignment.question_count}</dd></div>
                    <div><dt>Created</dt><dd>{new Date(assignment.assigned_at).toLocaleDateString()}</dd></div>
                    <div><dt>Due</dt><dd>{assignment.due_at ? new Date(assignment.due_at).toLocaleDateString() : 'No deadline'}</dd></div>
                  </dl>
                  <div className="teacher-mobile-record-progress">
                    <div>
                      <span>Student completion</span>
                      <strong>{assignment.completed_count}/{assignment.student_count}</strong>
                    </div>
                    <div className="teacher-mobile-progress-track" aria-label={`${completionPercent}% completed`}>
                      <span style={{ width: `${completionPercent}%` }} />
                    </div>
                  </div>
                  <button type="button" onClick={() => handleOpenReport(assignment)} className="teacher-mobile-record-action">
                    View assignment report <span aria-hidden="true">→</span>
                  </button>
                </article>
              );
            })}
          </div>
          <table className="teacher-table teacher-desktop-only-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Title</th>
                <th>Topic</th>
                <th>Class</th>
                <th>Created</th>
                <th>Questions</th>
                <th>Students</th>
                <th>Due</th>
                <th>Completed</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((assignment) => (
                <tr key={assignment.id}>
                  <td className="font-medium">{assignment.subject_name}</td>
                  <td className="font-medium">{assignment.title || assignment.topic_name}</td>
                  <td>{assignment.topic_name}</td>
                  <td>{assignment.assignment_mode === 'custom' ? 'Selected students' : assignment.batch || '—'}</td>
                  <td>{new Date(assignment.assigned_at).toLocaleDateString()}</td>
                  <td>{assignment.question_count}</td>
                  <td>{assignment.student_count}</td>
                  <td>{assignment.due_at ? new Date(assignment.due_at).toLocaleDateString() : '—'}</td>
                  <td>
                    <span className="teacher-badge teacher-badge-primary">
                      {assignment.completed_count}/{assignment.student_count}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => handleOpenReport(assignment)}
                      className="teacher-btn teacher-btn-secondary text-sm"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderReportDetail = () => (
    <div>
      <button
        onClick={() => setView('reports')}
        className="teacher-back-link mb-4"
      >
        <span>←</span> Back to Reports
      </button>

      {reportLoading ? (
        <div className="teacher-card p-12 text-center text-cyan-600">Loading report...</div>
      ) : !selectedReportAssignment ? (
        <div className="teacher-card p-12 text-center text-slate-500">Select an assignment to view details.</div>
      ) : (
        <div className="space-y-6">
          <div className="teacher-card">
            <h2 className="text-2xl font-bold text-slate-800 mb-2">{selectedReportAssignment.title || selectedReportAssignment.topic_name}</h2>
            <p className="text-slate-600">
              {selectedReportAssignment.subject_name} · Topic {selectedReportAssignment.topic_name} · Class {selectedReportAssignment.assignment_mode === 'custom' ? 'Selected students' : selectedReportAssignment.batch || '—'}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
              <div><dt className="text-xs font-semibold uppercase text-slate-400">Created</dt><dd>{new Date(selectedReportAssignment.assigned_at).toLocaleDateString()}</dd></div>
              <div><dt className="text-xs font-semibold uppercase text-slate-400">Class</dt><dd>{selectedReportAssignment.assignment_mode === 'custom' ? 'Selected students' : selectedReportAssignment.batch || '—'}</dd></div>
              <div><dt className="text-xs font-semibold uppercase text-slate-400">Questions</dt><dd>{selectedReportAssignment.question_count}</dd></div>
              <div><dt className="text-xs font-semibold uppercase text-slate-400">Students</dt><dd>{selectedReportAssignment.student_count}</dd></div>
              <div><dt className="text-xs font-semibold uppercase text-slate-400">Due</dt><dd>{selectedReportAssignment.due_at ? new Date(selectedReportAssignment.due_at).toLocaleDateString() : 'No deadline'}</dd></div>
            </dl>
          </div>

          {assignmentReport.length === 0 ? (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-10 text-center text-slate-500">No students have completed this assignment yet.</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
                <div><h3 className="text-xl font-bold text-slate-800">Student Performance</h3><p className="mt-1 text-sm text-slate-500">Open a student to review every answer and the evidence behind their result.</p></div>
                <button
                  onClick={handleExportReport}
                  className="teacher-btn teacher-btn-secondary"
                >
                  Export CSV
                </button>
              </div>

              {/* Student Performance Table */}
              <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-100 border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4 text-slate-700 font-semibold">Student</th>
                      <th className="py-3 px-4 text-slate-700 font-semibold">Class</th>
                      <th className="py-3 px-4 text-slate-700 font-semibold">
                        <span className="inline-flex items-center gap-1">Score <span title="Total XP points earned from correct answers. Each question can carry different points." aria-label="Score explanation" className="cursor-help text-cyan-600">ⓘ</span></span>
                      </th>
                      <th className="py-3 px-4 text-slate-700 font-semibold">Correct</th>
                      <th className="py-3 px-4 text-slate-700 font-semibold">Incorrect</th>
                      <th className="py-3 px-4 text-slate-700 font-semibold">Accuracy</th>
                      <th className="py-3 px-4 text-slate-700 font-semibold">Completed</th>
                      <th className="py-3 px-4 text-slate-700 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignmentReport.map((row, i) => (
                      <tr key={row.student_id} className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                        <td className="py-3 px-4 text-slate-800 font-medium">{row.student_name}</td>
                        <td className="py-3 px-4 text-slate-600">{row.batch ?? '—'}</td>
                        <td className="py-3 px-4 text-slate-700">{row.score}</td>
                        <td className="py-3 px-4 text-green-600 font-medium">{row.correct}</td>
                        <td className="py-3 px-4 text-red-600 font-medium">{row.incorrect}</td>
                        <td className="py-3 px-4">
                          <span className={`font-bold ${row.accuracy >= 70 ? 'text-green-600' : row.accuracy >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                            {row.accuracy}%
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500 text-sm">{new Date(row.completed_at).toLocaleString()}</td>
                        <td className="py-3 px-4">
                          <button
                            onClick={() => handleViewStudentAnalysis(row)}
                            className="px-3 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg text-xs font-medium transition-colors"
                          >
                            🔍 Analyze
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Question Analysis follows the complete student roster and stays closed by default. */}
              <details className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
                  <span>
                    <span className="block text-lg font-bold text-slate-800">📊 Question Analysis</span>
                    <span className="mt-1 block text-sm text-slate-500">Review accuracy, response time, and common mistakes for every question.</span>
                  </span>
                  <span className="flex flex-none items-center gap-2 text-sm font-semibold text-cyan-700">
                    {questionAnalysis.length > 0 ? `${questionAnalysis.length} questions` : 'No data yet'}
                    <span aria-hidden="true" className="text-lg transition-transform group-open:rotate-180">⌄</span>
                  </span>
                </summary>
                <div className="border-t border-slate-200 p-4 sm:p-5">
                  {questionAnalysis.length > 0 ? (
                    <>
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-600">Choose how questions are arranged</p>
                        <div className="inline-flex rounded-lg border border-slate-300 p-1 text-xs" aria-label="Question order">
                          <button type="button" onClick={() => setAnswerOrder('assignment')} className={`rounded-md px-3 py-1.5 font-semibold ${answerOrder === 'assignment' ? 'bg-cyan-600 text-white' : 'text-slate-600'}`}>Assignment order</button>
                          <button type="button" onClick={() => setAnswerOrder('review')} className={`rounded-md px-3 py-1.5 font-semibold ${answerOrder === 'review' ? 'bg-cyan-600 text-white' : 'text-slate-600'}`}>Needs review first</button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {(answerOrder === 'assignment' ? questionAnalysis : [...questionAnalysis].sort((a, b) => a.accuracy_percent - b.accuracy_percent)).map((qa, idx) => (
                          <div
                            key={qa.question_id}
                            className={`rounded-xl border p-4 ${
                              qa.accuracy_percent < 50
                                ? 'border-red-300 bg-red-50'
                                : qa.accuracy_percent < 70
                                  ? 'border-amber-300 bg-amber-50'
                                  : 'border-green-300 bg-green-50'
                            }`}
                          >
                            <div className="mb-2 flex items-start justify-between">
                              <span className="text-xs font-bold text-slate-500">Q{qa.order_index ?? idx + 1}</span>
                              <span className={`text-lg font-bold ${qa.accuracy_percent < 50 ? 'text-red-600' : qa.accuracy_percent < 70 ? 'text-amber-600' : 'text-green-600'}`}>
                                {qa.accuracy_percent}%
                              </span>
                            </div>
                            <p className="mb-2 line-clamp-2 text-sm text-slate-700">{qa.question_text}</p>
                            <div className="flex items-center justify-between text-xs text-slate-500">
                              <span>✅ {qa.correct_count} / ❌ {qa.incorrect_count}</span>
                              <span>⏱️ {Math.round(qa.avg_time_ms / 1000)}s avg</span>
                            </div>
                            {qa.common_wrong_answers && qa.common_wrong_answers.length > 0 && (
                              <div className="mt-2 border-t border-slate-200 pt-2">
                                <span className="text-xs font-semibold text-red-600">Common mistakes:</span>
                                <ul className="mt-1 text-xs text-slate-600">
                                  {qa.common_wrong_answers.slice(0, 2).map((w, wi) => (
                                    <li key={wi}>"{w.answer}" ({w.count}x)</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">Question-level analysis is not available for these submissions yet.</div>
                  )}
                </div>
              </details>
            </>
          )}
        </div>
      )}
    </div>
  );

  // Render Student Analysis View - Personalized feedback on mistakes
  const renderReportAnalysis = () => (
    <div className="max-w-4xl mx-auto space-y-6">
      <button
        onClick={() => setView('report-detail')}
        className="teacher-back-link mb-4"
      >
        <span>←</span> Back to Report
      </button>

      {analysisLoading ? (
        <div className="teacher-card p-12 text-center text-cyan-600">Loading student analysis...</div>
      ) : !selectedAnalysisStudent ? (
        <div className="teacher-card p-12 text-center text-slate-500">No student selected.</div>
      ) : (
        <div className="space-y-6">
          {/* Student Header */}
          <div className="teacher-card">
            <div className="mb-6 border-b border-slate-200 pb-5 text-center">
              <span className="text-xs font-bold uppercase tracking-[.14em] text-blue-600">Assignment performance report</span>
              <h1 className="mt-2 text-2xl font-bold text-slate-900">{selectedReportAssignment?.title || selectedReportAssignment?.topic_name || 'Assignment'}</h1>
              <p className="mt-1 text-sm text-slate-500">{selectedReportAssignment?.subject_name} · {selectedReportAssignment?.topic_name}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={() => handlePrintStudentAnalysis('family')} className="teacher-btn teacher-btn-secondary">Family report</button>
                <button type="button" onClick={() => handlePrintStudentAnalysis('teacher')} className="teacher-btn teacher-btn-primary">Teacher report + evidence</button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                  <span className="text-3xl">👤</span>
                  {selectedAnalysisStudent.student_name}
                </h2>
                <p className="text-slate-600 mt-1">
                  Class: {selectedAnalysisStudent.batch ?? '—'} ·
                  Completed: {new Date(selectedAnalysisStudent.completed_at).toLocaleString()}
                </p>
              </div>
              <div className="text-center">
                <div className={`text-4xl font-bold ${
                  selectedAnalysisStudent.accuracy >= 70 
                    ? 'text-green-600' 
                    : selectedAnalysisStudent.accuracy >= 50 
                      ? 'text-amber-600' 
                      : 'text-red-600'
                }`}>
                  {selectedAnalysisStudent.accuracy}%
                </div>
                <div className="text-sm text-slate-500">Accuracy</div>
              </div>
            </div>

            {/* Performance Summary */}
            <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-slate-200">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{selectedAnalysisStudent.correct}</div>
                <div className="text-xs text-slate-500">Correct</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{selectedAnalysisStudent.incorrect}</div>
                <div className="text-xs text-slate-500">Incorrect</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{selectedAnalysisStudent.score}</div>
                <div className="text-xs text-slate-500">Total Score</div>
                <div className="mt-1 max-w-[180px] text-xs leading-4 text-slate-400">XP points earned from correct answers; questions may have different point values.</div>
              </div>
            </div>
          </div>

          {/* Detailed Answers */}
          {studentAnswers.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
              <span className="text-4xl mb-2 block">📝</span>
              <p className="text-amber-800 font-medium">No detailed answer data available yet.</p>
              <p className="text-amber-600 text-sm mt-1">
                Answer tracking is enabled for new assignments. Students who complete assignments going forward will have their answers recorded for analysis.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="text-xl font-bold text-slate-800">📋 Question-by-Question Analysis</h3>
              
              {/* Show incorrect answers first for learning focus */}
              {studentAnswers.filter(a => !a.is_correct).length > 0 && (
                <div className="mb-6">
                  <h4 className="text-lg font-semibold text-red-700 mb-3 flex items-center gap-2">
                    <span>❌</span> Questions to Review ({studentAnswers.filter(a => !a.is_correct).length})
                  </h4>
                  {studentAnswers.filter(a => !a.is_correct).map((answer, idx) => (
                    <div key={answer.question_id} className="bg-red-50 border border-red-200 rounded-xl p-4 mb-3">
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-1 rounded">INCORRECT</span>
                        <span className="text-xs text-slate-500">⏱️ {Math.round(answer.time_taken_ms / 1000)}s</span>
                      </div>
                      <p className="text-slate-800 font-medium mb-3">{answer.question_text}</p>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="bg-red-100 rounded-lg p-3">
                          <span className="text-xs font-semibold text-red-700 block mb-1">Student's Answer:</span>
                          <span className="text-red-800">{answer.student_answer}</span>
                        </div>
                        <div className="bg-green-100 rounded-lg p-3">
                          <span className="text-xs font-semibold text-green-700 block mb-1">Correct Answer:</span>
                          <span className="text-green-800">{answer.correct_answer}</span>
                        </div>
                      </div>
                      {answer.explanation && (
                        <div className="mt-3 bg-blue-50 rounded-lg p-3">
                          <span className="text-xs font-semibold text-blue-700 block mb-1">💡 Explanation:</span>
                          <span className="text-blue-800 text-sm">{answer.explanation}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Correct answers section */}
              {studentAnswers.filter(a => a.is_correct).length > 0 && (
                <div>
                  <h4 className="text-lg font-semibold text-green-700 mb-3 flex items-center gap-2">
                    <span>✅</span> Correct Answers ({studentAnswers.filter(a => a.is_correct).length})
                  </h4>
                  {studentAnswers.filter(a => a.is_correct).map((answer, idx) => (
                    <div key={answer.question_id} className="bg-green-50 border border-green-200 rounded-xl p-4 mb-3">
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-1 rounded">CORRECT</span>
                        <span className="text-xs text-slate-500">⏱️ {Math.round(answer.time_taken_ms / 1000)}s</span>
                      </div>
                      <p className="text-slate-800 font-medium mb-2">{answer.question_text}</p>
                      <div className="bg-green-100 rounded-lg p-3 text-sm">
                        <span className="text-xs font-semibold text-green-700 block mb-1">Answer:</span>
                        <span className="text-green-800">{answer.student_answer}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Learning Recommendations */}
          {studentAnswers.filter(a => !a.is_correct).length > 0 && (
            <div className="teacher-card bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
              <h4 className="text-lg font-bold text-purple-800 mb-3 flex items-center gap-2">
                <span>🎯</span> Personalized Recommendations
              </h4>
              <ul className="space-y-2 text-slate-700">
                <li className="flex items-start gap-2">
                  <span className="text-purple-500">•</span>
                  <span>Review the {studentAnswers.filter(a => !a.is_correct).length} incorrect answer{studentAnswers.filter(a => !a.is_correct).length !== 1 ? 's' : ''} above with the student</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-500">•</span>
                  <span>Focus on understanding why the correct answers are right, not just memorizing them</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-500">•</span>
                  <span>Consider assigning targeted practice on the topics where mistakes occurred</span>
                </li>
                {studentAnswers.some(a => !a.is_correct && a.time_taken_ms < 5000) && (
                  <li className="flex items-start gap-2">
                    <span className="text-amber-500">⚠️</span>
                    <span>Some questions were answered very quickly - encourage the student to read more carefully</span>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // Render Cambridge Reports View - Compact with Tabs
  const renderCambridgeReports = () => {
    const pendingWriting = cambridgeScores.filter(s => isTeacherMarkedCambridgeTest(s.quiz_name) && s.answers?.requires_marking).length;
    const drawerAttempt = cambridgeDrawerAttempt;
    const drawerIsWriting = drawerAttempt ? isTeacherMarkedCambridgeTest(drawerAttempt.quiz_name) : false;
    const drawerNeedsMarking = drawerIsWriting && drawerAttempt?.answers?.requires_marking;
    const canReleaseDrawerScores = Boolean(drawerAttempt && !drawerNeedsMarking && !drawerAttempt.scores_released);
    const visibleScores = sortedCambridgeScores;
    const allVisibleIds = visibleScores.map((score) => score.id);
    const allVisibleSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => cambridgeSelectedIds.includes(id));
    const selectedScores = visibleScores.filter((score) => cambridgeSelectedIds.includes(score.id));
    const pendingCountForActiveTest = cambridgeActiveTab === 'all'
      ? cambridgeScores.filter(s => isTeacherMarkedCambridgeTest(s.quiz_name) && s.answers?.requires_marking).length
      : cambridgeScores.filter(s => s.quiz_name === cambridgeActiveTab && s.answers?.requires_marking).length;
    const selectedReleaseIds = selectedScores
      .filter((score) => {
        const needsMarking = isTeacherMarkedCambridgeTest(score.quiz_name) && score.answers?.requires_marking;
        return !needsMarking && !score.scores_released;
      })
      .map((score) => score.id);
    const releaseMarkedIds = visibleScores
      .filter((score) => {
        const needsMarking = isTeacherMarkedCambridgeTest(score.quiz_name) && score.answers?.requires_marking;
        return !needsMarking && !score.scores_released;
      })
      .map((score) => score.id);
    const filteredTests = uniqueCambridgeQuizNames.filter((name) => name.toLowerCase().includes(cambridgeTestSearch.trim().toLowerCase()));
    const statusOptions = ['Pending', 'Marked', 'Released'];
    const canReleaseAll = cambridgeActiveTab !== 'all';
    const hasRows = visibleScores.length > 0;

    const filtersPanel = (
      <div className="flex min-h-0 flex-col space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Search</label>
          <input
            value={cambridgeSearchTerm}
            onChange={(event) => setCambridgeSearchTerm(event.target.value)}
            placeholder="Search student, test, class…"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        <details open className="rounded-xl border border-slate-200 bg-slate-50/40 flex flex-col min-h-0">
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-700">Tests</summary>
          <div className="px-3 pb-3 flex min-h-0 flex-col gap-2">
            <input
              value={cambridgeTestSearch}
              onChange={(event) => setCambridgeTestSearch(event.target.value)}
              placeholder="Search tests"
              className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-700"
            />
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1">
              <button
                onClick={() => setCambridgeActiveTab('all')}
                className={`w-full text-left px-2 py-1.5 rounded-md text-sm ${
                  cambridgeActiveTab === 'all' ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 text-slate-600'
                }`}
              >
                All Tests ({cambridgeScores.length})
              </button>
              {filteredTests.map((name) => {
                const count = cambridgeScores.filter((s) => s.quiz_name === name).length;
                return (
                  <button
                    key={name}
                    onClick={() => setCambridgeActiveTab(name)}
                    className={`w-full text-left px-2 py-1.5 rounded-md text-sm ${
                      cambridgeActiveTab === name ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 text-slate-600'
                    }`}
                  >
                    {name.replace('Cambridge ', '')} <span className="text-xs">({count})</span>
                  </button>
                );
              })}
              {filteredTests.length === 0 && (
                <p className="text-xs text-slate-400">No tests found.</p>
              )}
            </div>
          </div>
        </details>

        <details open className="rounded-xl border border-slate-200 bg-slate-50/40 flex flex-col min-h-0">
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-700">Classes</summary>
          <div className="px-3 pb-3">
            {teacherHasClassAssignments && (
              <p className="text-xs text-slate-500 mb-2">
                ✓ Showing only students from your {assignedCambridgeClassCodes.length} assigned class{assignedCambridgeClassCodes.length !== 1 ? 'es' : ''}
              </p>
            )}
            <select
              value={cambridgeClassFilter}
              onChange={(event) => setCambridgeClassFilter(event.target.value)}
              className="w-full rounded-md border border-slate-200 px-2 py-2 text-sm text-slate-700 bg-white"
            >
              <option value="all">All Classes</option>
              {uniqueCambridgeClasses.map((cls) => (
                <option key={cls} value={cls}>{cls}</option>
              ))}
            </select>
          </div>
        </details>

        <details open className="rounded-xl border border-slate-200 bg-slate-50/40 flex flex-col min-h-0">
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-700">Students</summary>
          <div className="px-3 pb-3">
            {cambridgeClassFilter === 'all' ? (
              <p className="text-xs text-slate-400">Select a class to filter students.</p>
            ) : (
              <select
                value={cambridgeStudentFilter}
                onChange={(event) => setCambridgeStudentFilter(event.target.value)}
                className="w-full rounded-md border border-slate-200 px-2 py-2 text-sm text-slate-700 bg-white"
              >
                <option value="all">All Students</option>
                {uniqueCambridgeStudents.map((student) => (
                  <option key={student} value={student}>{student}</option>
                ))}
              </select>
            )}
          </div>
        </details>

        <details open className="rounded-xl border border-slate-200 bg-slate-50/40 flex flex-col min-h-0">
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-700">Status</summary>
          <div className="px-3 pb-3 flex flex-wrap gap-2">
            {statusOptions.map((status) => {
              const active = cambridgeStatusFilters.includes(status);
              return (
                <button
                  key={status}
                  onClick={() => {
                    setCambridgeStatusFilters((prev) => (
                      prev.includes(status)
                        ? prev.filter((item) => item !== status)
                        : [...prev, status]
                    ));
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                    active ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {status}
                </button>
              );
            })}
          </div>
        </details>

        <details open className="rounded-xl border border-slate-200 bg-slate-50/40 flex flex-col min-h-0">
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-700">Other</summary>
          <div className="px-3 pb-3 space-y-2 text-sm text-slate-600">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={cambridgeNeedsMarkingOnly}
                onChange={(event) => setCambridgeNeedsMarkingOnly(event.target.checked)}
              />
              Needs marking only
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={cambridgeReleasedOnly}
                onChange={(event) => setCambridgeReleasedOnly(event.target.checked)}
              />
              Released only
            </label>
          </div>
        </details>
      </div>
    );

    return (
    <div className="cambridge-reports-container">
      {/* Fixed Header Section - Always Visible */}
      <div className="cambridge-reports-header">
        {/* Row 1: Title + Stats */}
        <div className="cambridge-reports-title-row flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2 whitespace-nowrap">
              <span className="text-xl">📊</span> Cambridge Tests
            </h2>
          </div>
          <div className="cambridge-summary-chips flex flex-wrap items-center gap-2 text-xs flex-shrink-0">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 border border-slate-200">
              <span className="text-slate-500">Total:</span>
              <span className="font-bold text-slate-900">{cambridgeStats.totalSubmissions}</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 border border-blue-200">
              <span className="text-blue-600">Avg:</span>
              <span className="font-bold text-blue-700">{cambridgeStats.avgPercentage}%</span>
            </span>
            {pendingWriting > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 border border-amber-300 text-amber-700 font-semibold">
                ⏳ {pendingWriting} marking
              </span>
            )}
          </div>
        </div>
        {/* Row 2: Action Buttons */}
        <div className="cambridge-header-actions flex flex-wrap items-center gap-2">
              <details className="relative">
                <summary className="list-none cursor-pointer select-none bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-blue-700">
                  Release Scores ▾
                </summary>
                <div className="absolute right-0 mt-2 w-56 rounded-lg border border-slate-200 bg-white shadow-lg p-2 text-sm z-10">
                  <button
                    onClick={() => releaseScoresByIds(releaseMarkedIds, `✅ Released ${releaseMarkedIds.length} marked attempts.`)}
                    disabled={releaseMarkedIds.length === 0 || releasingScores}
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                    title={releaseMarkedIds.length === 0 ? 'No marked attempts available' : 'Release all marked attempts in the current view'}
                  >
                    Release all marked
                  </button>
                  <button
                    onClick={() => releaseScoresByIds(selectedReleaseIds, `✅ Released ${selectedReleaseIds.length} selected attempts.`)}
                    disabled={cambridgeSelectedIds.length === 0 || selectedReleaseIds.length === 0 || releasingScores}
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                    title={cambridgeSelectedIds.length === 0 ? 'Select attempts to enable' : 'Release selected attempts'}
                  >
                    Release selected
                  </button>
                  <button
                    onClick={() => releaseScores(cambridgeActiveTab, cambridgeClassFilter !== 'all' ? cambridgeClassFilter : undefined)}
                    disabled={!canReleaseAll || releasingScores}
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                    title={canReleaseAll ? 'Release all attempts for the current test/class' : 'Select a test to enable'}
                  >
                    Release all
                  </button>
                  {cambridgeActiveTab !== 'all' && (
                    <button
                      onClick={() => hideScores(cambridgeActiveTab, cambridgeClassFilter !== 'all' ? cambridgeClassFilter : undefined)}
                      disabled={releasingScores}
                      className="w-full text-left px-3 py-2 rounded-md hover:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                      title="Set scores to pending for the current test/class"
                    >
                      Set pending
                    </button>
                  )}
                </div>
              </details>
              <details className="relative">
                <summary className="list-none cursor-pointer select-none bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-teal-700">
                  📄 Student Report ▾
                </summary>
                <div className="absolute right-0 mt-2 w-64 rounded-lg border border-slate-200 bg-white shadow-lg p-2 text-sm z-10 max-h-60 overflow-y-auto">
                  {(() => {
                    const studentNames = [...new Set(cambridgeScores.map(s => s.student_name))].sort();
                    if (studentNames.length === 0) return <p className="text-slate-400 px-3 py-2">No students found.</p>;
                    return studentNames.map(name => {
                      const count = cambridgeScores.filter(s => s.student_name === name).length;
                      return (
                        <button
                          key={name}
                          onClick={() => openStudentOverviewReport(name)}
                          className="w-full text-left px-3 py-2 rounded-md hover:bg-slate-100 text-slate-700 flex justify-between items-center"
                        >
                          <span className="truncate">{name}</span>
                          <span className="text-xs text-slate-400 ml-2 shrink-0">{count} test{count !== 1 ? 's' : ''}</span>
                        </button>
                      );
                    });
                  })()}
                </div>
              </details>
              <button
                onClick={exportCambridgeCSV}
                disabled={cambridgeScores.length === 0}
                className="border border-slate-200 px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
              >
                CSV
              </button>
              <button
                onClick={loadCambridgeScores}
                disabled={cambridgeLoading}
                className="border border-slate-200 px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
              >
                {cambridgeLoading ? 'Refreshing…' : 'Refresh'}
              </button>
              <button
                onClick={() => {
                  setShowVisibilityManager(true);
                  loadTestVisibilitySettings();
                }}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700"
                title="Manage which tests students can see"
              >
                👁️ Test Visibility
              </button>
            </div>
          </div>

      <div className="cambridge-workspace-note mb-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
        <strong>Your Cambridge workspace:</strong> Your school admin chooses which Cambridge tests the school can use. You can then release available tests to each class you teach; results are limited to your assigned classes and subjects
        {teacherAssignedSubjects.length > 0 ? ` (${teacherAssignedSubjects.join(', ')})` : ''}. Marking and score release stay limited to the subjects you teach.
      </div>

      <div className="cambridge-reports-body">
        {/* Left Sidebar - Filters (Desktop) */}
        <div className="hidden lg:flex lg:flex-col" style={{ width: '280px', flexShrink: 0 }}>
          <div className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100 flex-shrink-0">
              <span className="font-semibold text-slate-800 text-sm">🔍 Filters</span>
              <button
                onClick={() => {
                  setCambridgeActiveTab('all');
                  setCambridgeClassFilter('all');
                  setCambridgeStudentFilter('all');
                  setCambridgeSearchTerm('');
                  setCambridgeStatusFilters([]);
                  setCambridgeNeedsMarkingOnly(false);
                  setCambridgeReleasedOnly(false);
                }}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                Reset
              </button>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0 pr-1">
              {filtersPanel}
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          {/* Toolbar Row */}
          <div className="cambridge-toolbar flex flex-wrap items-center justify-between gap-3 mb-3 bg-white border border-slate-200 rounded-xl px-3 py-2" style={{ flexShrink: 0 }}>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setCambridgeFiltersOpen(true)}
                className="lg:hidden border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1"
              >
                <span>🔍</span> Filters
              </button>
              <span className="text-xs text-slate-600">
                <strong className="text-slate-900">{visibleScores.length}</strong> results
              </span>
              {cambridgeSelectedIds.length > 0 && (
                <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                  {cambridgeSelectedIds.length} selected
                </span>
              )}
              {cambridgeActiveTab !== 'all' && (
                <span className="text-xs font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
                  {cambridgeActiveTab.replace('Cambridge ', '')}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {WRITING_TEST_NAMES.includes(cambridgeActiveTab) && pendingCountForActiveTest > 0 && (
                bulkProofreadLoading ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-xs font-semibold">
                    <span className="animate-spin">⏳</span>
                    <span>Processing {bulkProofreadProgress.current}/{bulkProofreadProgress.total}</span>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => bulkProofreadWriting(false)}
                      className="px-2.5 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700"
                    >
                      AI Proofread ({pendingCountForActiveTest}) Draft
                    </button>
                    <button
                      onClick={() => bulkProofreadWriting(true)}
                      className="px-2.5 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700"
                    >
                      AI Proofread ({pendingCountForActiveTest}) Release
                    </button>
                  </>
                )
              )}
              <select
                value={cambridgeSort}
                onChange={(event) => setCambridgeSort(event.target.value)}
                className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 bg-white"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="highest">Highest %</option>
                <option value="lowest">Lowest %</option>
                <option value="student-asc">A–Z</option>
                <option value="student-desc">Z–A</option>
              </select>
            </div>
          </div>

          {/* Scrollable Results Area */}
          <div className="cambridge-results-scroll flex-1 min-h-0 overflow-y-auto">
            {cambridgeScores.length === 0 ? (
              cambridgeLoading ? (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center">
                  <p className="text-slate-600">⏳ Loading submissions...</p>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center">
                  <div className="text-4xl mb-2">📭</div>
                  <p className="text-slate-600 font-medium">No test submissions yet</p>
                  <p className="text-sm text-slate-500">Click Refresh to check for new submissions</p>
                </div>
              )
            ) : (
              <>
                {cambridgeSelectedIds.length > 0 && (
                  <div className="sticky top-0 z-20 bg-white border border-slate-200 rounded-xl px-4 py-2 flex flex-wrap items-center gap-3 shadow-sm mb-3">
                    <span className="text-xs font-semibold text-slate-800">{cambridgeSelectedIds.length} selected</span>
                    <button
                      onClick={() => releaseScoresByIds(selectedReleaseIds, `✅ Released ${selectedReleaseIds.length} selected attempts.`)}
                      disabled={selectedReleaseIds.length === 0 || releasingScores}
                      className="px-2.5 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
                      title={selectedReleaseIds.length === 0 ? 'No eligible attempts selected' : 'Release selected attempts'}
                    >
                      Release
                    </button>
                    <button
                      onClick={exportCambridgeCSV}
                      className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      CSV
                    </button>
                    <button
                      onClick={() => setCambridgeSelectedIds([])}
                      className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Clear
                    </button>
                  </div>
                )}

                <div className="cambridge-mobile-results lg:hidden">
                  {visibleScores.map((score) => {
                    const isWritingTest = isTeacherMarkedCambridgeTest(score.quiz_name);
                    const needsMarking = isWritingTest && score.answers?.requires_marking;
                    const statusLabel = needsMarking ? 'Needs marking' : score.scores_released ? 'Released' : 'Pending release';
                    const parsedResponses = parseCambridgeResponses(score.answers);
                    const attemptedCount = Object.values(parsedResponses).filter((answer) => String(answer ?? '').trim() !== '').length;
                    return (
                      <article key={score.id} className="cambridge-attempt-card">
                        <div className="cambridge-attempt-card__top">
                          <label className="cambridge-attempt-card__check">
                            <input
                              type="checkbox"
                              checked={cambridgeSelectedIds.includes(score.id)}
                              onChange={() => toggleCambridgeSelection(score.id)}
                            />
                            <span className="sr-only">Select {score.student_name}</span>
                          </label>
                          <div className="min-w-0 flex-1">
                            <h3>{score.student_name}</h3>
                            <p>{score.student_class || 'No class'} · Attempt {score.attempt_number || 1}</p>
                          </div>
                          <span className={`cambridge-attempt-status ${
                            needsMarking ? 'is-marking' : score.scores_released ? 'is-released' : 'is-pending'
                          }`}>
                            {statusLabel}
                          </span>
                        </div>
                        <div className="cambridge-attempt-card__test">
                          <span>{score.test_subject || 'Cambridge'}</span>
                          <strong>{score.quiz_name.replace('Cambridge ', '')}</strong>
                        </div>
                        <dl className="cambridge-attempt-card__metrics">
                          <div><dt>Score</dt><dd>{needsMarking ? '—' : `${score.score}/${score.total_questions}`}</dd></div>
                          <div><dt>Answered</dt><dd>{attemptedCount}/{score.total_questions}</dd></div>
                          <div><dt>Result</dt><dd>{needsMarking ? 'Pending' : `${score.percentage}%`}</dd></div>
                          <div><dt>Time</dt><dd>{formatCambridgeTime(score.time_taken_seconds)}</dd></div>
                        </dl>
                        <button type="button" onClick={() => openCambridgeDrawer(score)} className="cambridge-attempt-card__action">
                          {needsMarking ? 'Open marking' : 'Review attempt'} <span aria-hidden="true">→</span>
                        </button>
                      </article>
                    );
                  })}
                  {!hasRows && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                      No results match these filters.
                    </div>
                  )}
                </div>

                <div className="hidden bg-white border border-slate-200 rounded-xl shadow-sm lg:flex lg:flex-col">
                <div className="overflow-x-auto overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100 scroll-smooth flex-1" style={{ WebkitOverflowScrolling: 'touch' }}>
                  <table className="w-full text-sm border-collapse min-w-[1100px]">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold w-10">
                          <input
                            type="checkbox"
                            checked={allVisibleSelected}
                            onChange={(event) => toggleCambridgeSelectionAll(allVisibleIds, event.target.checked)}
                            aria-label="Select all visible attempts"
                          />
                        </th>
                        <th className="px-4 py-3 text-left font-semibold">Student</th>
                        <th className="px-4 py-3 text-left font-semibold">Class</th>
                        <th className="px-4 py-3 text-left font-semibold">Test</th>
                        <th className="px-4 py-3 text-center font-semibold">Score</th>
                        <th className="px-4 py-3 text-center font-semibold">%</th>
                        <th className="px-4 py-3 text-center font-semibold">Status</th>
                        <th className="px-4 py-3 text-center font-semibold">Time</th>
                        <th className="px-4 py-3 text-right font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleScores.map((score) => {
                        const isWritingTest = isTeacherMarkedCambridgeTest(score.quiz_name);
                        const needsMarking = isWritingTest && score.answers?.requires_marking;
                        const statusLabel = needsMarking ? 'Needs marking' : score.scores_released ? 'Released' : 'Pending';
                        const parsedResponses = parseCambridgeResponses(score.answers);
                        const attemptedCount = Object.values(parsedResponses).filter((answer) => String(answer ?? '').trim() !== '').length;
                        return (
                          <tr
                            key={score.id}
                            className={`cursor-pointer hover:bg-slate-50 ${needsMarking ? 'bg-amber-50' : ''}`}
                            onClick={() => openCambridgeDrawer(score)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                openCambridgeDrawer(score);
                              }
                            }}
                            role="button"
                            tabIndex={0}
                          >
                            <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={cambridgeSelectedIds.includes(score.id)}
                                onClick={(event) => event.stopPropagation()}
                                onChange={() => toggleCambridgeSelection(score.id)}
                                aria-label={`Select ${score.student_name}`}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-slate-900">{score.student_name}</div>
                              <div className="mt-0.5 text-[11px] font-semibold text-slate-400">Attempt {score.attempt_number || 1}</div>
                            </td>
                            <td className="px-4 py-3 text-slate-500">{score.student_class || '-'}</td>
                            <td className="px-4 py-3">
                              <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                                {score.quiz_name.replace('Cambridge ', '')}
                              </span>
                              {score.test_subject && (
                                <div className="mt-1 text-[11px] font-semibold text-indigo-600">{score.test_subject}</div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {needsMarking ? (
                                <span className="inline-flex px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">Pending</span>
                              ) : (
                                <div>
                                  <span className="font-mono text-slate-800">{score.score}/{score.total_questions}</span>
                                  <div className="mt-0.5 text-[11px] text-slate-400">{attemptedCount}/{score.total_questions} answered</div>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {needsMarking ? (
                                <span className="text-amber-600">—</span>
                              ) : (
                                <span className={`font-semibold ${
                                  score.percentage >= 70 ? 'text-green-600' :
                                  score.percentage >= 50 ? 'text-amber-600' : 'text-red-600'
                                }`}>{score.percentage}%</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                                needsMarking ? 'bg-amber-100 text-amber-700' :
                                score.scores_released ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                              }`}>
                                {statusLabel}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center text-slate-500 text-xs">{formatCambridgeTime(score.time_taken_seconds)}</td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex justify-end gap-2">
                                {isWritingTest ? (
                                  <>
                                    <button
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        openCambridgeDrawer(score);
                                        openWritingMarking(score);
                                      }}
                                      className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                                        needsMarking ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                      }`}
                                    >
                                      {needsMarking ? 'Mark' : 'View'}
                                    </button>
                                    <button
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        openCambridgeDrawer(score);
                                        openCambridgeAnswers(score);
                                      }}
                                      className="px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-100 text-blue-700 hover:bg-blue-200"
                                    >
                                      Answers
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        openCambridgeDrawer(score);
                                        openCambridgeAnswers(score);
                                      }}
                                      className="px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-100 text-blue-700 hover:bg-blue-200"
                                    >
                                      Answers
                                    </button>
                                    <button
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        openCambridgeDrawer(score);
                                        openCambridgeReport(score);
                                      }}
                                      className="px-2.5 py-1 rounded-md text-xs font-semibold bg-purple-100 text-purple-700 hover:bg-purple-200"
                                    >
                                      Report
                                    </button>
                                    <button
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        openStudentOverviewReport(score.student_name);
                                      }}
                                      className="px-2.5 py-1 rounded-md text-xs font-semibold bg-teal-100 text-teal-700 hover:bg-teal-200"
                                      title="View all test results for this student"
                                    >
                                      Overview
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {!hasRows && (
                        <tr>
                          <td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-500">
                            No results match these filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              </>
            )}
          </div>
        </div>
      </div>

      {cambridgeDrawerOpen && drawerAttempt && createPortal(
        <div className="fixed inset-0 z-[50] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeCambridgeDrawer}
          />
          <div className="relative flex items-center justify-center p-4 sm:p-6 w-full max-w-lg">
            <div className="w-full max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] bg-white shadow-2xl flex flex-col rounded-2xl overflow-hidden">
            <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Attempt Details</p>
                <h3 className="text-lg font-semibold text-slate-900">Attempt Details</h3>
              </div>
              <button
                onClick={closeCambridgeDrawer}
                className="text-slate-400 hover:text-slate-700 rounded-md px-2 py-1"
                aria-label="Close details"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              <div>
                <h4 className="text-2xl font-semibold text-slate-900">{drawerAttempt.student_name}</h4>
                <div className="flex flex-wrap items-center gap-2 mt-2 text-sm">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {drawerAttempt.student_class || '—'}
                  </span>
                  <span className="text-slate-500">{drawerAttempt.quiz_name}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-xl p-3">
                  <p className="text-xs uppercase text-slate-400">Score</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {drawerNeedsMarking ? 'Pending' : `${drawerAttempt.score}/${drawerAttempt.total_questions}`}
                  </p>
                </div>
                <div className="border border-slate-200 rounded-xl p-3">
                  <p className="text-xs uppercase text-slate-400">Percentage</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {drawerNeedsMarking ? '—' : `${drawerAttempt.percentage}%`}
                  </p>
                </div>
                <div className="border border-slate-200 rounded-xl p-3">
                  <p className="text-xs uppercase text-slate-400">Time taken</p>
                  <p className="text-sm font-medium text-slate-700">{formatCambridgeTime(drawerAttempt.time_taken_seconds)}</p>
                </div>
                <div className="border border-slate-200 rounded-xl p-3">
                  <p className="text-xs uppercase text-slate-400">Status</p>
                  <p className="text-sm font-medium text-slate-700">
                    {drawerNeedsMarking ? 'Needs marking' : drawerAttempt.scores_released ? 'Released' : 'Pending release'}
                  </p>
                </div>
                <div className="border border-slate-200 rounded-xl p-3">
                  <p className="text-xs uppercase text-slate-400">Submitted</p>
                  <p className="text-sm font-medium text-slate-700">
                    {drawerAttempt.submitted_at ? new Date(drawerAttempt.submitted_at).toLocaleString('en-GB') : '—'}
                  </p>
                </div>
                <div className="border border-slate-200 rounded-xl p-3">
                  <p className="text-xs uppercase text-slate-400">Released state</p>
                  <p className="text-sm font-medium text-slate-700">
                    {drawerAttempt.scores_released ? 'Released' : 'Pending'}
                  </p>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 space-y-2">
              <button
                onClick={() => openCambridgeAnswers(drawerAttempt)}
                className="w-full px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
              >
                View detailed answers
              </button>
              {drawerIsWriting ? (
                <button
                  onClick={() => openWritingMarking(drawerAttempt)}
                  className="w-full px-4 py-2 rounded-md bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600"
                >
                  {drawerNeedsMarking ? 'Open marking' : 'View marking'}
                </button>
              ) : (
                <button
                  onClick={() => openCambridgeReport(drawerAttempt)}
                  className="w-full px-4 py-2 rounded-md bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700"
                >
                  Create report
                </button>
              )}
              <button
                onClick={() => openStudentOverviewReport(drawerAttempt.student_name)}
                className="w-full px-4 py-2 rounded-md bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700"
                title="View all test results for this student"
              >
                📄 Student Overview
              </button>
              {drawerAttempt.scores_released ? (
                <button
                  className="w-full px-4 py-2 rounded-md border border-slate-200 text-sm font-semibold text-slate-400 cursor-not-allowed"
                  disabled
                >
                  Scores released
                </button>
              ) : canReleaseDrawerScores ? (
                <button
                  onClick={() => releaseScores(drawerAttempt.quiz_name, drawerAttempt.student_class || undefined)}
                  className="w-full px-4 py-2 rounded-md border border-green-200 bg-green-50 text-sm font-semibold text-green-700 hover:bg-green-100"
                  title="Releases scores for this test and class"
                >
                  Release score
                </button>
              ) : (
                <button
                  className="w-full px-4 py-2 rounded-md border border-slate-200 text-sm font-semibold text-slate-400 cursor-not-allowed"
                  disabled
                  title="Not available yet"
                >
                  Release score
                </button>
              )}
              <button
                onClick={() => openCambridgeRetake(drawerAttempt)}
                className="w-full px-4 py-2 rounded-md border border-amber-300 bg-amber-50 text-sm font-semibold text-amber-800 hover:bg-amber-100"
                title="Preserve this attempt and allow the student to take the test again"
              >
                ↻ Allow retake
              </button>
            </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {cambridgeRetakeAttempt && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="cambridge-retake-title">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/60"
            onClick={closeCambridgeRetake}
            aria-label="Cancel retake"
          />
          <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="border-b border-slate-200 px-6 py-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Cambridge attempt</p>
              <h3 id="cambridge-retake-title" className="mt-1 text-xl font-bold text-slate-900">Allow this student to retake?</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                The original attempt will be preserved in the audit history. It will stop appearing as the active result, and the student can start a fresh attempt.
              </p>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                <p className="font-semibold text-slate-900">{cambridgeRetakeAttempt.student_name}</p>
                <p className="mt-1 text-slate-600">{cambridgeRetakeAttempt.student_class || 'No class'} · {cambridgeRetakeAttempt.quiz_name}</p>
                <p className="mt-1 text-slate-500">Current result: {cambridgeRetakeAttempt.score}/{cambridgeRetakeAttempt.total_questions} ({cambridgeRetakeAttempt.percentage}%)</p>
              </div>
              <label className="block text-sm font-semibold text-slate-800" htmlFor="cambridge-retake-reason">
                Reason <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <textarea
                id="cambridge-retake-reason"
                value={cambridgeRetakeReason}
                onChange={(event) => setCambridgeRetakeReason(event.target.value.slice(0, 500))}
                rows={3}
                maxLength={500}
                autoFocus
                placeholder="For example: interrupted connection, approved absence, or teacher-authorized second attempt"
                className="w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
              />
              <p className="text-right text-xs text-slate-400">{cambridgeRetakeReason.length}/500</p>
              {cambridgeRetakeError && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {cambridgeRetakeError}
                </div>
              )}
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeCambridgeRetake}
                disabled={cambridgeRetakeSubmitting}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={allowCambridgeRetake}
                disabled={cambridgeRetakeSubmitting}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-wait disabled:opacity-60"
              >
                {cambridgeRetakeSubmitting ? 'Allowing retake…' : 'Preserve attempt and allow retake'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {cambridgeFiltersOpen && createPortal(
        <div className="fixed inset-0 z-[50] lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCambridgeFiltersOpen(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white shadow-2xl p-4 rounded-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Filters</h3>
              <button
                onClick={() => setCambridgeFiltersOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>
            {filtersPanel}
            </div>
          </div>
        </div>,
        document.body
      )}

      <details className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <summary className="px-4 py-3 cursor-pointer bg-gray-50 hover:bg-gray-100 font-medium text-gray-800 flex items-center gap-2">
          📊 Class Performance Summary
        </summary>
        <div className="p-4 flex flex-wrap gap-2">
          {Object.entries(cambridgeStats.classStats).sort((a, b) => b[1].avg - a[1].avg).map(([cls, stats]) => (
            <div key={cls} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <p className="font-semibold text-gray-800">{cls}</p>
              <p className="text-xs text-gray-600">
                {stats.count} students • <span className={`font-bold ${stats.avg >= 70 ? 'text-green-600' : stats.avg >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{stats.avg}%</span>
              </p>
            </div>
          ))}
        </div>
      </details>

      {/* Performance Report Modal - Professional Report with Serial Number */}
      {showCambridgeReport && selectedCambridgeStudent && (() => {
        const skillPerf = analyzeSkillPerformance(selectedCambridgeStudent);
        const reportAnswerKey = (selectedCambridgeStudent.quiz_name?.toLowerCase().includes('chemistry') || selectedCambridgeStudent.quiz_name?.toLowerCase().includes('biology'))
          ? getScienceAnswerKey(selectedCambridgeStudent.quiz_name, selectedCambridgeStudent)
          : (correctAnswers[selectedCambridgeStudent.quiz_name] || {});
        const responseSummary = buildResponseSummary(selectedCambridgeStudent, reportAnswerKey);
        const fallbackPlan = getGeneralActionPlan(selectedCambridgeStudent, responseSummary);
        const studentFirstName = selectedCambridgeStudent.student_name?.split(' ')[0] || selectedCambridgeStudent.student_name || 'Student';
        const accuracy = responseSummary.totalQuestions > 0
          ? Math.round((responseSummary.correctCount / responseSummary.totalQuestions) * 100)
          : selectedCambridgeStudent.percentage;
        const personalizedNote = `${studentFirstName}, you answered ${responseSummary.correctCount}/${responseSummary.totalQuestions || selectedCambridgeStudent.total_questions} correctly (${accuracy}%). ${responseSummary.unansweredCount > 0 ? `There were ${responseSummary.unansweredCount} unanswered questions—aim to attempt every item next time.` : 'Great job attempting every question.'}`;
        const sortedSkills = Object.entries(skillPerf).sort((a, b) => a[1].percentage - b[1].percentage);
        const weakAreas = sortedSkills.filter(([_, data]) => data.percentage < 70);
        const grade = getGrade(selectedCambridgeStudent.percentage);
        const encouragement = getEncouragement(grade);
        
        const reportData: ProfessionalReportData = {
          id: selectedCambridgeStudent.id || '',
          studentName: selectedCambridgeStudent.student_name || 'Student',
          studentClass: selectedCambridgeStudent.student_class,
          quizName: selectedCambridgeStudent.quiz_name,
          score: selectedCambridgeStudent.score,
          totalQuestions: selectedCambridgeStudent.total_questions,
          percentage: selectedCambridgeStudent.percentage,
          submittedAt: selectedCambridgeStudent.submitted_at,
          timeTakenSeconds: selectedCambridgeStudent.time_taken_seconds,
          skillPerformance: skillPerf,
          correctCount: responseSummary.correctCount,
          wrongCount: responseSummary.wrongCount,
          unansweredCount: responseSummary.unansweredCount,
          grade,
          encouragement,
          actionPlanItems: weakAreas.slice(0, 3).map(([skill, data]) => {
            const plan = actionPlans[skill];
            return plan ? { skill, title: plan.title, tips: plan.tips, percentage: data.percentage } : { skill, title: skill, tips: [], percentage: data.percentage };
          }).filter(item => item.tips.length > 0),
          fallbackPlan: weakAreas.length === 0 ? fallbackPlan : undefined,
          personalizedNote,
          schoolName: profile.school_name || teacher?.school_name || undefined,
          schoolLogoUrl: profile.school_logo_url,
          schoolId: profile.school_id,
        };
        
        return <ProfessionalCambridgeReport data={reportData} onClose={() => setShowCambridgeReport(false)} isTeacherView={true} />;
      })()}

      {/* Student Overview Report Modal */}
      {showStudentOverviewReport && studentOverviewData && (
        <StudentOverviewReport data={studentOverviewData} onClose={() => setShowStudentOverviewReport(false)} />
      )}

      {/* Answer Reflection Modal */}
      {showCambridgeAnswers && selectedCambridgeStudent && (() => {
        const answers = selectedCambridgeStudent.answers || {};
        const quizName = selectedCambridgeStudent.quiz_name;
        const isChemistryTest = quizName?.toLowerCase().includes('chemistry') || quizName?.toLowerCase().includes('biology');

        const studentResponses = getStudentResponses(selectedCambridgeStudent);
        
        // Special handling for Writing Test
        if (WRITING_TEST_NAMES.includes(quizName)) {
          const writingMeta = WRITING_TEST_METADATA[quizName] ?? WRITING_TEST_METADATA['Cambridge Writing Test 1'];
          const feedback = answers.feedback || {};
          const earlierAttempts = cambridgeScores
            .filter((row) =>
              row.student_name === selectedCambridgeStudent.student_name &&
              WRITING_TEST_NAMES.includes(row.quiz_name) &&
              row.submitted_at <= selectedCambridgeStudent.submitted_at
            )
            .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
            .slice(0, 8);
          
          return createPortal(
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-2 sm:p-4 overflow-y-auto" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="bg-white rounded-2xl max-w-4xl sm:max-w-5xl w-full max-h-[90vh] overflow-y-auto" style={{ fontFamily: 'Segoe UI, Arial, sans-serif' }}>
                {/* Header */}
                <div className="p-6 border-b-4 border-blue-600">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <span className="text-4xl">✏️</span>
                      <div>
                        <h1 className="text-2xl font-bold text-blue-800">Writing Test Submission & Feedback</h1>
                        <p className="text-sm text-gray-500">Student's Written Responses with Teacher Feedback</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowCambridgeAnswers(false)}
                      className="p-2 hover:bg-red-100 rounded-full text-xl text-gray-600 hover:text-red-600 transition-all font-bold w-10 h-10 flex items-center justify-center"
                      title="Close (Esc key also works)"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Student Info */}
                <div className="bg-gradient-to-r from-blue-700 to-purple-800 text-white p-5 flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-bold">{selectedCambridgeStudent.student_name}</h2>
                    <p className="text-sm opacity-80">Class: {selectedCambridgeStudent.student_class || 'N/A'} | {new Date(selectedCambridgeStudent.submitted_at).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    {answers.requires_marking ? (
                      <div className="text-yellow-300 font-bold">⏳ Awaiting Marking</div>
                    ) : (
                      <>
                        <div className="text-3xl font-bold">{selectedCambridgeStudent.score}/35</div>
                        <div className="text-sm opacity-80">{selectedCambridgeStudent.percentage}% Score</div>
                        {feedback.releasedToStudent && <div className="text-green-300 text-xs mt-1">✓ Released to student</div>}
                      </>
                    )}
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  {earlierAttempts.length > 0 && (
                    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                      <h3 className="text-sm font-bold text-slate-700 mb-3">📚 Earlier Writing Submissions (student timeline)</h3>
                      <div className="space-y-2">
                        {earlierAttempts.map((attempt, index) => {
                          const prev = earlierAttempts[index + 1];
                          const trend = !prev ? '—' : attempt.percentage > prev.percentage ? '↑' : attempt.percentage < prev.percentage ? '↓' : '→';
                          const attemptAnswers = attempt.answers || {};
                          const attemptFeedback = attemptAnswers.feedback || {};
                          const allIssues = [...(attemptFeedback?.part1?.grammarMistakes || []), ...(attemptFeedback?.part2?.grammarMistakes || [])];
                          const { grammar, punctuation } = splitGrammarAndPunctuation(allIssues);
                          const part1Marks = attemptAnswers?.marks?.part1 || null;
                          const part2Marks = attemptAnswers?.marks?.part2 || null;
                          return (
                            <div key={attempt.id || `${attempt.submitted_at}-${index}`} className="grid grid-cols-5 gap-2 text-xs items-center bg-white border border-slate-200 rounded-lg p-2">
                              <span>{new Date(attempt.submitted_at).toLocaleDateString()}</span>
                              <span>{attempt.score}/35</span>
                              <span>{attempt.percentage}%</span>
                              <span>G:{grammar.length} • P:{punctuation.length}</span>
                              <span className={trend === '↑' ? 'text-green-600 font-semibold' : trend === '↓' ? 'text-red-600 font-semibold' : 'text-slate-500'}>{trend}</span>
                              <div className="col-span-5 mt-1 grid gap-1">
                                {part1Marks && (
                                  <p className="text-[11px] text-slate-600 m-0">
                                    Part 1 — Content {part1Marks.content}/5 · Organization {part1Marks.organisation}/5 · Language {part1Marks.language}/5
                                  </p>
                                )}
                                {part2Marks && (
                                  <p className="text-[11px] text-slate-600 m-0">
                                    Part 2 — Content {part2Marks.content}/5 · Communicative Achievement {part2Marks.communicativeAchievement}/5 · Organization {part2Marks.organisation}/5 · Language {part2Marks.language}/5
                                  </p>
                                )}
                                {allIssues.length > 0 && (
                                  <details>
                                    <summary className="cursor-pointer font-semibold text-[11px] text-slate-700">Word-level corrections ({allIssues.length})</summary>
                                    <div className="mt-1 grid gap-1">
                                      {allIssues.slice(0, 8).map((issue, issueIdx) => (
                                        <p key={`${attempt.id}-issue-${issueIdx}`} className="text-[11px] text-slate-700 m-0">
                                          <span className="line-through text-red-600">{issue.wrong}</span> → <span className="text-green-700 font-semibold">{issue.correct}</span> — {issue.explanation}
                                        </p>
                                      ))}
                                    </div>
                                  </details>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {/* Part 1 */}
                  <div className="border-2 border-blue-200 rounded-xl overflow-hidden">
                    <div className="bg-blue-100 p-4">
                      <h3 className="text-lg font-bold text-blue-800">📝 Part 1: {writingMeta.part1Label}</h3>
                      <p className="text-sm text-blue-600">{writingMeta.part1Context} • Word count: {answers.part1_words || 0} (Target: 45-55)</p>
                    </div>
                    <div className="p-4">
                      <label className="text-sm font-semibold text-gray-700 block mb-2">Student's Original Response:</label>
                      <div className="rounded-xl border border-slate-200 bg-white/95 p-4 text-slate-900 shadow-sm shadow-slate-900/5 ring-1 ring-slate-100 whitespace-pre-wrap leading-relaxed min-h-[100px]">
                        {answers.part1 || 'No response submitted'}
                      </div>
                      {answers.marks?.part1 && (
                        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                          <div className="bg-green-100 p-2 rounded-lg">
                            <div className="text-xs text-gray-500">Content</div>
                            <div className="text-lg font-bold text-green-700">{answers.marks.part1.content}/5</div>
                          </div>
                          <div className="bg-blue-100 p-2 rounded-lg">
                            <div className="text-xs text-gray-500">Organisation</div>
                            <div className="text-lg font-bold text-blue-700">{answers.marks.part1.organisation}/5</div>
                          </div>
                          <div className="bg-purple-100 p-2 rounded-lg">
                            <div className="text-xs text-gray-500">Language</div>
                            <div className="text-lg font-bold text-purple-700">{answers.marks.part1.language}/5</div>
                          </div>
                        </div>
                      )}
                      {answers.marks?.part1 && (
                        <div className="mt-3 h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                          <div className={`h-full ${scoreProgressColor(Math.round(((answers.marks.part1.content + answers.marks.part1.organisation + answers.marks.part1.language) / 15) * 100))}`} style={{ width: `${Math.round(((answers.marks.part1.content + answers.marks.part1.organisation + answers.marks.part1.language) / 15) * 100)}%` }} />
                        </div>
                      )}
                      
                      {/* Teacher Feedback for Part 1 */}
                      {feedback.part1?.feedback && (
                        <div className="mt-4 bg-orange-50 border-2 border-orange-200 rounded-lg p-4">
                          <h4 className="text-sm font-bold text-orange-800 mb-2">🔴 Teacher's Comments:</h4>
                          <p className="text-gray-700 whitespace-pre-wrap">{feedback.part1.feedback}</p>
                        </div>
                      )}
                      
                      {feedback.part1?.correctedVersion && (
                        <div className="mt-4 bg-green-50 border-2 border-green-200 rounded-lg p-4">
                          <h4 className="text-sm font-bold text-green-800 mb-2">✅ Corrected/Model Version:</h4>
                          <p className="text-gray-700 whitespace-pre-wrap">{feedback.part1.correctedVersion}</p>
                        </div>
                      )}
                      {feedback.part1?.grammarMistakes?.length > 0 && (() => {
                        const { grammar, punctuation } = splitGrammarAndPunctuation(feedback.part1.grammarMistakes);
                        return (
                          <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-xs">
                            <h4 className="text-sm font-bold text-yellow-800 mb-2">🛠️ Grammar & punctuation details</h4>
                            {grammar.map((m, i) => <p key={`g1-${i}`} className="mb-1"><span className="line-through text-red-600">{m.wrong}</span> → <span className="text-green-700 font-semibold">{m.correct}</span> — {m.explanation}</p>)}
                            {punctuation.length > 0 && <p className="mt-2 font-semibold text-yellow-800">Punctuation/capitalization</p>}
                            {punctuation.map((m, i) => <p key={`p1-${i}`} className="mb-1"><span className="line-through text-red-600">{m.wrong}</span> → <span className="text-green-700 font-semibold">{m.correct}</span> — {m.explanation}</p>)}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Part 2 */}
                  <div className="border-2 border-indigo-200 rounded-xl overflow-hidden">
                    <div className="bg-indigo-100 p-4">
                      <h3 className="text-lg font-bold text-indigo-800">📝 Part 2: {writingMeta.part2Label}</h3>
                      <p className="text-sm text-indigo-600">{writingMeta.part2Context} • Word count: {answers.part2_words || 0} (Target: 110-130)</p>
                    </div>
                    <div className="p-4">
                      <label className="text-sm font-semibold text-gray-700 block mb-2">Student's Original Response:</label>
                      <div className="rounded-xl border border-slate-200 bg-white/95 p-4 text-slate-900 shadow-sm shadow-slate-900/5 ring-1 ring-slate-100 whitespace-pre-wrap leading-relaxed min-h-[150px]">
                        {answers.part2 || 'No response submitted'}
                      </div>
                      {answers.marks?.part2 && (
                        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                          <div className="bg-green-100 p-2 rounded-lg">
                            <div className="text-xs text-gray-500">Content</div>
                            <div className="text-lg font-bold text-green-700">{answers.marks.part2.content}/5</div>
                          </div>
                          <div className="bg-yellow-100 p-2 rounded-lg">
                            <div className="text-xs text-gray-500">Comm. Ach.</div>
                            <div className="text-lg font-bold text-yellow-700">{answers.marks.part2.communicativeAchievement}/5</div>
                          </div>
                          <div className="bg-blue-100 p-2 rounded-lg">
                            <div className="text-xs text-gray-500">Organisation</div>
                            <div className="text-lg font-bold text-blue-700">{answers.marks.part2.organisation}/5</div>
                          </div>
                          <div className="bg-purple-100 p-2 rounded-lg">
                            <div className="text-xs text-gray-500">Language</div>
                            <div className="text-lg font-bold text-purple-700">{answers.marks.part2.language}/5</div>
                          </div>
                        </div>
                      )}
                      {answers.marks?.part2 && (
                        <div className="mt-3 h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                          <div className={`h-full ${scoreProgressColor(Math.round(((answers.marks.part2.content + answers.marks.part2.communicativeAchievement + answers.marks.part2.organisation + answers.marks.part2.language) / 20) * 100))}`} style={{ width: `${Math.round(((answers.marks.part2.content + answers.marks.part2.communicativeAchievement + answers.marks.part2.organisation + answers.marks.part2.language) / 20) * 100)}%` }} />
                        </div>
                      )}
                      
                      {/* Teacher Feedback for Part 2 */}
                      {feedback.part2?.feedback && (
                        <div className="mt-4 bg-orange-50 border-2 border-orange-200 rounded-lg p-4">
                          <h4 className="text-sm font-bold text-orange-800 mb-2">🔴 Teacher's Comments:</h4>
                          <p className="text-gray-700 whitespace-pre-wrap">{feedback.part2.feedback}</p>
                        </div>
                      )}
                      
                      {feedback.part2?.correctedVersion && (
                        <div className="mt-4 bg-green-50 border-2 border-green-200 rounded-lg p-4">
                          <h4 className="text-sm font-bold text-green-800 mb-2">✅ Corrected/Model Version:</h4>
                          <p className="text-gray-700 whitespace-pre-wrap">{feedback.part2.correctedVersion}</p>
                        </div>
                      )}
                      {feedback.part2?.grammarMistakes?.length > 0 && (() => {
                        const { grammar, punctuation } = splitGrammarAndPunctuation(feedback.part2.grammarMistakes);
                        return (
                          <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-xs">
                            <h4 className="text-sm font-bold text-yellow-800 mb-2">🛠️ Grammar & punctuation details</h4>
                            {grammar.map((m, i) => <p key={`g2-${i}`} className="mb-1"><span className="line-through text-red-600">{m.wrong}</span> → <span className="text-green-700 font-semibold">{m.correct}</span> — {m.explanation}</p>)}
                            {punctuation.length > 0 && <p className="mt-2 font-semibold text-yellow-800">Punctuation/capitalization</p>}
                            {punctuation.map((m, i) => <p key={`p2-${i}`} className="mb-1"><span className="line-through text-red-600">{m.wrong}</span> → <span className="text-green-700 font-semibold">{m.correct}</span> — {m.explanation}</p>)}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Overall Comments */}
                  {feedback.overallComments && (
                    <div className="border-2 border-gray-300 rounded-xl overflow-hidden">
                      <div className="bg-gray-100 p-4">
                        <h3 className="text-lg font-bold text-gray-800">💬 Overall Teacher Comments</h3>
                      </div>
                      <div className="p-4">
                        <p className="text-gray-700 whitespace-pre-wrap">{feedback.overallComments}</p>
                      </div>
                    </div>
                  )}

                  {answers.marked_by && (
                    <div className="text-center text-sm text-gray-500">
                      Marked by {answers.marked_by} on {new Date(answers.marked_at).toLocaleDateString()}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t flex justify-between items-center">
                  <span className="text-xs text-gray-400" style={{ fontFamily: "'Courier New', Courier, monospace" }}>Serial: {generateSerialNumber(selectedCambridgeStudent.id || '', selectedCambridgeStudent.student_name || '', selectedCambridgeStudent.submitted_at || '')}</span>
                  <div className="flex gap-3">
                    {(answers.requires_marking || !feedback.releasedToStudent) && (
                      <button
                        onClick={() => { setShowCambridgeAnswers(false); openWritingMarking(selectedCambridgeStudent); }}
                        className="px-4 py-2 bg-purple-100 text-black rounded-lg font-semibold hover:bg-purple-200"
                      >
                        ✏️ {answers.requires_marking ? 'Mark This' : 'Edit Feedback'}
                      </button>
                    )}
                    <button onClick={() => setShowCambridgeAnswers(false)} className="px-4 py-2 bg-red-100 text-red-700 rounded-lg font-semibold hover:bg-red-200 transition-all" title="Close (Press Esc)">✕ Close</button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          );
        }
        
        // Regular test handling
        const answerKey = isChemistryTest ? getScienceAnswerKey(quizName, selectedCambridgeStudent) : (correctAnswers[quizName] || {});
        const sections = testSections[quizName] || [];
        const summary = buildResponseSummary(selectedCambridgeStudent, answerKey);
        const questionBank = quizName === 'Cambridge Listening Test 1'
          ? CAMBRIDGE_LISTENING_TEST_1_QUESTIONS as QuestionData[]
          : getQuestionsForQuiz(quizName);
        const questionMap = new Map<number, QuestionData>();
        questionBank.forEach(q => questionMap.set(q.number, q));
        const mistakes = summary.details
          .filter((detail) => detail.status === 'wrong' || detail.status === 'unanswered')
          .map((detail) => ({
            q: detail.q,
            studentAns: detail.status === 'unanswered' ? '(No answer)' : detail.studentAns,
            correctAns: detail.correctAns,
            unanswered: detail.status === 'unanswered'
          }));
        const hasAnswerKey = Object.keys(answerKey).length > 0;
        const biologyMetadataUnavailable = isBiologyCambridgeQuiz(quizName) && !buildBiologyAnswerKeyFromSavedMetadata(selectedCambridgeStudent.answers).hasMetadata;

        /** Escape HTML special characters to prevent XSS when interpolating
         *  captured regex groups back into HTML strings. */
        const escapeHTML = (s: string) =>
          s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
           .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

        /** Fix encoding-damaged placeholders in chemistry HTML:
         *  1) <span aria-label="p orbital" ...>?</span>  →  sanitized badge with escaped label
         *  2) <sup>N?</sup>  →  <sup>N−</sup>  (superscript minus/charge signs lost to Windows-1252 encoding)
         *  3) <img ...>  →  normalized to consistent max size, centered; run through DOMPurify */
        const fixChemHtml = (html: string) => {
          const replaced = html
            .replace(/<span\s+aria-label="([^"]+)"[^>]*>\s*\?\s*<\/span>/gi,
              (_m: string, label: string) => `<span style="font-size:11px; background:#e0e7ff; color:#3730a3; padding:1px 5px; border-radius:4px; font-weight:600;">${escapeHTML(label)}</span>`)
            .replace(/<sup>(\d*)\?<\/sup>/g, '<sup>$1\u2212</sup>')
            .replace(/<img\b([^>]*?)(?:\s*\/)?>/gi, (_m: string, attrs: string) => {
              // Strip any existing size/style attrs before applying our safe defaults
              const cleanAttrs = attrs.replace(/\s*(?:width|height|style)\s*=\s*(?:"[^"]*"|'[^']*'|\S+)/gi, '');
              return `<img${cleanAttrs} style="max-width:100%;max-height:300px;height:auto;display:block;margin:8px auto;border-radius:3px;" />`;
            });
          return DOMPurify.sanitize(replaced, {
            ALLOWED_TAGS: ['sup', 'sub', 'span', 'img', 'br', 'div', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
            ALLOWED_ATTR: ['style', 'src', 'alt', 'class', 'aria-label'],
          });
        };

        const printCambridgeAnswerReview = () => {
          const rows = summary.details.map((detail) => {
            const question = questionMap.get(detail.q);
            const prompt = question?.prompt
              ? DOMPurify.sanitize(fixChemHtml(question.prompt), {
                ALLOWED_TAGS: ['sup', 'sub', 'span', 'br', 'div', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
                ALLOWED_ATTR: ['style', 'class', 'aria-label'],
              })
              : 'Question prompt unavailable for this older submission.';
            return `<tr><td>${detail.q}</td><td>${prompt}</td><td>${escapeSchoolDocumentHtml(detail.studentAns)}</td><td>${escapeSchoolDocumentHtml(detail.correctAns)}</td><td>${escapeSchoolDocumentHtml(detail.status === 'wrong' ? 'Needs review' : detail.status.charAt(0).toUpperCase() + detail.status.slice(1))}</td></tr>`;
          }).join('');
          try {
            openSchoolDocumentPreview({
              meta: {
                documentId: createSchoolDocumentId('cambridge'),
                templateVersion: 'cambridge-answer-reflection-v1',
                title: 'Cambridge Answer Reflection',
                subtitle: selectedCambridgeStudent.quiz_name,
                schoolName: resolvedBranding.schoolName,
                schoolLogoUrl: resolvedBranding.schoolLogoUrl,
                audience: 'teacher',
                status: 'final',
                confidentiality: 'confidential',
                generatedAt: new Date().toISOString(),
                generatedBy: profile.full_name || profile.username || 'Teacher',
                className: selectedCambridgeStudent.student_class || undefined,
                studentName: selectedCambridgeStudent.student_name,
                schoolId: profile.school_id,
                sourceType: 'cambridge_attempt',
                sourceId: selectedCambridgeStudent.id || undefined,
              },
              bodyHtml: `<h2>Attempt summary</h2><div class="document-grid"><div class="document-card"><strong>Score</strong><p>${selectedCambridgeStudent.score}/${selectedCambridgeStudent.total_questions} (${selectedCambridgeStudent.percentage}%)</p></div><div class="document-card"><strong>Responses</strong><p>${summary.correctCount} correct · ${summary.wrongCount} incorrect · ${summary.unansweredCount} unanswered</p></div></div><div class="document-callout document-callout--private"><strong>Teacher evidence appendix</strong><p>This document contains answer-level evidence and is not the default family report.</p></div><h2>Question-by-question review</h2><table><thead><tr><th>No.</th><th>Question</th><th>Student answer</th><th>Correct answer</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`,
              orientation: 'landscape',
              inkSaver: true,
              fileName: schoolDocumentFileName(resolvedBranding.schoolName, selectedCambridgeStudent.student_name, selectedCambridgeStudent.quiz_name, 'Answer_Reflection'),
            });
          } catch (error) {
            brainsAlert(error instanceof Error ? error.message : 'Unable to open the answer reflection document.', 'info');
          }
        };
        
        return createPortal(
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-2 sm:p-4 overflow-y-auto" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="bg-white rounded-2xl max-w-4xl sm:max-w-5xl w-full max-h-[90vh] overflow-y-auto" style={{ fontFamily: 'Segoe UI, Arial, sans-serif' }}>
              {/* Header */}
              <div className="p-6 border-b-4 border-blue-600">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <img src={profile.school_logo_url || '/logo.png'} alt={`${profile.school_name || teacher?.school_name || 'Brains Heist'} logo`} className="w-12 h-12 object-contain" />
                    <div>
                      <h1 className="text-2xl font-bold text-blue-800">{profile.school_name || teacher?.school_name || 'Brains Heist'}</h1>
                      <p className="text-sm text-gray-500">Test Reflection & Answer Review</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <h2 className="text-lg font-semibold text-blue-800">{selectedCambridgeStudent.quiz_name}</h2>
                    <p className="text-sm text-gray-500">Answer Details</p>
                  </div>
                </div>
              </div>

              {/* Student Info Banner */}
              <div className="bg-gradient-to-r from-blue-700 to-purple-800 text-white p-5 flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold">{selectedCambridgeStudent.student_name}</h2>
                  <p className="text-sm opacity-80">Class: {selectedCambridgeStudent.student_class || 'N/A'} | {new Date(selectedCambridgeStudent.submitted_at).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold">{selectedCambridgeStudent.score}/{selectedCambridgeStudent.total_questions}</div>
                  <div className="text-sm opacity-80">{selectedCambridgeStudent.percentage}% Score</div>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Summary Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-blue-100 p-4 rounded-xl text-center">
                    <div className="text-3xl">📝</div>
                    <div className="text-3xl font-bold text-blue-700">{summary.totalQuestions - summary.unansweredCount}/{summary.totalQuestions}</div>
                    <div className="text-sm text-gray-600">Attempted</div>
                  </div>
                  <div className="bg-green-100 p-4 rounded-xl text-center">
                    <div className="text-3xl">✓</div>
                    <div className="text-3xl font-bold text-green-700">{summary.correctCount}</div>
                    <div className="text-sm text-gray-600">Correct</div>
                  </div>
                  <div className="bg-red-100 p-4 rounded-xl text-center">
                    <div className="text-3xl">✗</div>
                    <div className="text-3xl font-bold text-red-700">{summary.wrongCount}</div>
                    <div className="text-sm text-gray-600">Wrong</div>
                  </div>
                  <div className="bg-amber-100 p-4 rounded-xl text-center">
                    <div className="text-3xl">⚠️</div>
                    <div className="text-3xl font-bold text-amber-700">{summary.unansweredCount}</div>
                    <div className="text-sm text-gray-600">Unanswered</div>
                  </div>
                </div>

                {/* Mistakes Summary */}
                {mistakes.length > 0 && (
                  <div className="border-2 border-red-400 rounded-xl p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-semibold text-red-800">🎯 Teaching Focus</h4>
                      <div className="flex gap-2 text-xs font-semibold">
                        <span className="rounded-full bg-red-100 px-2.5 py-1 text-red-700">{summary.wrongCount} incorrect</span>
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-700">{summary.unansweredCount} unanswered</span>
                      </div>
                    </div>
                    <p className="mb-3 text-sm text-slate-600">Review incorrect responses for misconceptions. Treat unanswered items separately as completion or time-management evidence.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[200px] overflow-y-auto">
                      {mistakes.map((m) => (
                        <div key={m.q} className={`p-2 rounded-lg text-sm ${m.unanswered ? 'bg-amber-50 border border-amber-300' : 'bg-red-50 border border-red-300'}`}>
                          <span className="font-bold text-gray-700">Q{m.q}:</span>
                          <span className={`ml-2 ${m.unanswered ? 'text-amber-600' : 'text-red-600'}`}>{m.studentAns}</span>
                          <span className="text-gray-400 mx-1">→</span>
                          <span className="text-green-600 font-semibold">{m.correctAns}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Detailed Answers by Section */}
                {sections.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-blue-800 mb-3">📋 Detailed Answers by Section</h4>
                    {sections.map((section) => (
                      <div key={section.name} className="mb-4 border border-gray-200 rounded-xl overflow-hidden">
                        <div className="flex flex-wrap items-center justify-between gap-2 bg-gray-100 px-4 py-2 font-semibold text-gray-700">
                          <span>{section.icon} {section.name}</span>
                          <span className="text-xs font-medium text-slate-500">
                            {section.questions.filter((q) => {
                              const expected = answerKey[q];
                              return expected !== undefined && isCambridgeAnswerCorrect(studentResponses[q], expected);
                            }).length}/{section.questions.length} correct · {section.questions.filter(q => normalizeAnswer(studentResponses[q] ?? '') !== '').length}/{section.questions.length} attempted
                          </span>
                        </div>
                        <div className="p-4">
                          <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                            {section.questions.map((q) => {
                              const studentAns = normalizeAnswer(studentResponses[q] ?? '');
                              const expectedAnswer = answerKey[q];
                              const correctAns = expectedAnswer === undefined ? '' : getPrimaryCambridgeAnswer(expectedAnswer);
                              const isCorrect = expectedAnswer !== undefined && isCambridgeAnswerCorrect(studentAns, expectedAnswer);
                              const isEmpty = !studentAns;
                              
                              return (
                                <div
                                  key={q}
                                  className={`p-2 rounded-lg text-center text-xs ${
                                    isEmpty ? 'bg-amber-100 border border-amber-300' :
                                    isCorrect ? 'bg-green-100 border border-green-300' :
                                    'bg-red-100 border border-red-300'
                                  }`}
                                  title={`Q${q}: Student: "${studentAns || '(empty)'}" | Correct: "${correctAns}"`}
                                >
                                  <div className="font-bold text-gray-700">Q{q}</div>
                                  <div className={`font-semibold ${isEmpty ? 'text-amber-600' : isCorrect ? 'text-green-600' : 'text-red-600'}`}>
                                    {isEmpty ? '—' : studentAns}
                                  </div>
                                  {!isCorrect && !isEmpty && (
                                    <div className="text-green-600 text-xs mt-1">✓ {correctAns}</div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {summary.details.length > 0 && (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 px-4 py-3 flex items-center justify-between">
                      <h4 className="font-semibold text-slate-800">🧾 Full Answer Review {questionMap.size > 0 && <span className="text-xs font-normal text-indigo-500 ml-2">with question details</span>}</h4>
                      {hasAnswerKey ? (
                        <span className="text-xs text-green-600 font-semibold">Answer key verified</span>
                      ) : biologyMetadataUnavailable ? (
                        <span className="text-xs text-amber-600 font-semibold">Answer metadata unavailable</span>
                      ) : (
                        <span className="text-xs text-amber-600 font-semibold">Answer key unavailable</span>
                      )}
                    </div>
                    <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
                      {summary.details.map((detail) => {
                        const qData = questionMap.get(detail.q);
                        return (
                        <div key={detail.q} className={`px-4 py-4 ${
                          detail.status === 'correct' ? 'bg-green-50/30' :
                          detail.status === 'wrong' ? 'bg-red-50/30' :
                          detail.status === 'unanswered' ? 'bg-amber-50/30' : ''
                        }`}>
                          {/* Question header */}
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-sm font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">Q{detail.q}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              detail.status === 'correct' ? 'bg-green-100 text-green-700' :
                              detail.status === 'wrong' ? 'bg-red-100 text-red-700' :
                              detail.status === 'answered' ? 'bg-blue-100 text-blue-700' :
                              'bg-amber-100 text-amber-700'
                            }`}>
                              {detail.status === 'correct' ? '✓ Correct' : detail.status === 'wrong' ? '✗ Wrong' : detail.status === 'answered' ? 'Answered' : '⚠ Unanswered'}
                            </span>
                          </div>

                          {/* Question prompt */}
                          {qData?.prompt && (
                            <div
                              className="text-sm text-slate-700 mb-3 leading-relaxed border-l-2 border-slate-200 ml-1 py-1"
                              style={{ paddingLeft: '10px' }}
                              dangerouslySetInnerHTML={{ __html: fixChemHtml(qData.prompt) }}
                            />
                          )}

                          {/* Table-based options (e.g., chemistry tables) */}
                          {qData?.table && (
                            <div className="mb-3 overflow-x-auto ml-2">
                              <table className="text-xs border-collapse w-full max-w-lg">
                                <thead>
                                  <tr>
                                    <th className="border border-slate-300 bg-slate-100 px-2 py-1 text-left font-semibold text-slate-600"></th>
                                    {qData.table.headers.map((h, hi) => (
                                      <th key={hi} className="border border-slate-300 bg-slate-100 px-2 py-1 text-left font-semibold text-slate-600" dangerouslySetInnerHTML={{ __html: fixChemHtml(h) }} />
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {qData.table.rows.map((row) => {
                                    const isStudentChoice = detail.studentAns.toUpperCase() === row.label;
                                    const isCorrectChoice = detail.correctAns.toUpperCase() === row.label;
                                    return (
                                      <tr key={row.label} className={`${
                                        isCorrectChoice && isStudentChoice ? 'bg-green-100' :
                                        isStudentChoice ? 'bg-red-100' :
                                        isCorrectChoice ? 'bg-green-50' : ''
                                      }`}>
                                        <td className="border border-slate-300 px-2 py-1 font-bold text-slate-600">
                                          {row.label}
                                          {isStudentChoice && !isCorrectChoice && <span className="ml-1 text-red-500">✗</span>}
                                          {isCorrectChoice && <span className="ml-1 text-green-600">✓</span>}
                                        </td>
                                        {row.values.map((v, vi) => (
                                          <td key={vi} className="border border-slate-300 px-2 py-1" dangerouslySetInnerHTML={{ __html: fixChemHtml(v) }} />
                                        ))}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* Regular options (A/B/C/D) */}
                          {qData?.options && !qData.table && (
                            <div className="mb-3 ml-2 space-y-1">
                              {Object.entries(qData.options).map(([letter, text]) => {
                                const isStudentChoice = detail.studentAns.toUpperCase() === letter;
                                const isCorrectChoice = detail.correctAns.toUpperCase() === letter;
                                return (
                                  <div key={letter} className={`flex items-start gap-2 px-2 py-1.5 rounded text-xs ${
                                    isCorrectChoice && isStudentChoice ? 'bg-green-100 border border-green-300' :
                                    isStudentChoice ? 'bg-red-100 border border-red-300' :
                                    isCorrectChoice ? 'bg-green-50 border border-green-200' :
                                    'bg-white border border-slate-100'
                                  }`}>
                                    <span className={`font-bold min-w-[20px] ${
                                      isCorrectChoice ? 'text-green-700' :
                                      isStudentChoice ? 'text-red-600' : 'text-slate-500'
                                    }`}>
                                      {letter}.
                                      {isStudentChoice && !isCorrectChoice && <span className="ml-0.5">✗</span>}
                                      {isCorrectChoice && <span className="ml-0.5">✓</span>}
                                    </span>
                                    <span className="text-slate-700" dangerouslySetInnerHTML={{ __html: fixChemHtml(text) }} />
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Fallback when no question data available */}
                          {!qData && (
                            <div className="flex flex-col md:flex-row gap-2 md:items-center text-xs text-slate-600 mt-1">
                              <span>Student: <strong className="text-slate-800">{detail.studentAns || '—'}</strong></span>
                              <span className="hidden md:inline">•</span>
                              <span>Correct: <strong className="text-emerald-600">{detail.correctAns || '—'}</strong></span>
                            </div>
                          )}

                          {/* Answer summary line (when question data is present) */}
                          {qData && (
                            <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 ml-2">
                              <span>Student chose: <strong className={detail.status === 'correct' ? 'text-green-700' : detail.status === 'unanswered' ? 'text-amber-600' : 'text-red-600'}>{detail.studentAns || '—'}</strong></span>
                              <span>•</span>
                              <span>Correct: <strong className="text-emerald-600">{detail.correctAns || '—'}</strong></span>
                            </div>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {biologyMetadataUnavailable && (
                  <div className="bg-amber-50 border border-amber-300 text-amber-800 rounded-xl p-4 text-sm">
                    Biology answer metadata is unavailable for this older submission, so teacher review cannot safely reconstruct correct answers. The stored score is shown, but per-question correctness is not inferred.
                  </div>
                )}

                {sections.length === 0 && summary.details.length === 0 && (
                  <div className="bg-blue-50 border-2 border-blue-400 rounded-xl p-5">
                    <h3 className="text-lg font-semibold text-blue-700 mb-4">🧪 Cambridge Test Results</h3>
                    <p className="text-gray-700 mb-3">
                      Score: <strong>{selectedCambridgeStudent.score}</strong> out of <strong>{selectedCambridgeStudent.total_questions}</strong> ({selectedCambridgeStudent.percentage}%)
                    </p>
                    <p className="text-gray-600 text-sm">
                      Detailed answer review is not available for this test in the teacher portal yet.
                      Students will be able to review their answers once the score is released.
                    </p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t flex justify-between items-center text-xs text-gray-400">
                <span style={{ fontFamily: "'Courier New', Courier, monospace" }}>Serial: {generateSerialNumber(selectedCambridgeStudent.id || '', selectedCambridgeStudent.student_name || '', selectedCambridgeStudent.submitted_at || '')}</span>
                <span>Confidential — For Student & Teacher Use Only</span>
                <div className="flex gap-3">
                  <button onClick={printCambridgeAnswerReview} className="px-4 py-2 bg-green-100 text-black rounded-lg font-semibold hover:bg-green-200">Print teacher appendix</button>
                  <button onClick={() => setShowCambridgeAnswers(false)} className="px-4 py-2 bg-red-100 text-red-700 rounded-lg font-semibold hover:bg-red-200 transition-all" title="Close (Press Esc)">✕ Close</button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* Writing Marking Modal */}
      {showWritingMarkingModal && selectedCambridgeStudent && (() => {
        const answers = selectedCambridgeStudent.answers || {};
        if (isTravelTourismCambridgeTest(selectedCambridgeStudent.quiz_name)) {
          const percentage = Math.round((Math.max(0, Math.min(80, Number(travelTourismMark) || 0)) / 80) * 100);
          return createPortal(
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 overflow-y-auto">
              <div className="bg-white rounded-2xl max-w-6xl w-full max-h-[95vh] overflow-y-auto" style={{ fontFamily: 'Segoe UI, Arial, sans-serif' }}>
                <div className="p-6 border-b-4 border-cyan-600 bg-gradient-to-r from-cyan-50 to-indigo-50 flex justify-between items-start">
                  <div>
                    <h1 className="text-2xl font-bold text-cyan-800">Travel & Tourism Marking</h1>
                    <p className="text-sm text-gray-600">Cambridge 9395 Paper 1 style • Teacher remains final authority</p>
                  </div>
                  <button onClick={() => setShowWritingMarkingModal(false)} className="p-2 hover:bg-gray-200 rounded-full text-xl">✕</button>
                </div>
                <div className="bg-gray-100 text-black p-5 flex justify-between items-center gap-4">
                  <div>
                    <h2 className="text-xl font-bold">{selectedCambridgeStudent.student_name}</h2>
                    <p className="text-sm opacity-80">Class: {selectedCambridgeStudent.student_class || 'N/A'} | Submitted: {new Date(selectedCambridgeStudent.submitted_at).toLocaleDateString()}</p>
                  </div>
                  <button onClick={autoMarkTravelTourism} disabled={autoProofreadLoading} className="px-5 py-3 rounded-xl font-bold bg-gradient-to-r from-cyan-500 to-blue-500 text-white disabled:opacity-60">
                    {autoProofreadLoading ? 'AI analyzing…' : '🤖 Generate AI marking suggestion'}
                  </button>
                  <div className="text-right text-black"><div className="text-3xl font-bold">{travelTourismMark}/80</div><div className="text-lg font-semibold">{percentage}%</div></div>
                </div>
                <div className="p-6 space-y-6 text-slate-900">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {Object.entries(answers.responses || {}).map(([questionId, response]) => (
                      <div key={questionId} className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                        <h3 className="font-bold text-slate-800 mb-2">Question {questionId}</h3>
                        <div className="whitespace-pre-wrap text-sm bg-white rounded-lg border p-3">{Array.isArray(response) ? response.filter(Boolean).join('\n\n') : String(response || 'No response submitted')}</div>
                      </div>
                    ))}
                  </div>
                  {travelTourismAiSuggestion && (
                    <div className="border-2 border-cyan-200 rounded-xl p-4 bg-cyan-50">
                      <h3 className="font-bold text-cyan-900 mb-2">AI suggestion: {travelTourismAiSuggestion.total_suggested_mark}/80</h3>
                      <p className="text-sm text-cyan-900 mb-3">Confidence: {travelTourismAiSuggestion.confidence ?? 'n/a'} • Teacher review required</p>
                      <div className="max-h-80 overflow-auto space-y-2">
                        {(travelTourismAiSuggestion.question_results || []).map((item: any) => (
                          <div key={item.question_id} className="bg-white border rounded-lg p-3 text-sm">
                            <strong>{item.question_id}: {item.suggested_mark}/{item.max_mark}</strong> — {item.reason}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <label className="block"><span className="font-bold text-sm">Final mark /80</span><input type="number" min={0} max={80} value={travelTourismMark} onChange={(e) => setTravelTourismMark(Number(e.target.value))} className="w-full mt-1 p-3 border rounded-lg text-slate-900" /></label>
                    <label className="block md:col-span-2"><span className="font-bold text-sm">Teacher feedback / rationale</span><textarea value={travelTourismFeedback} onChange={(e) => setTravelTourismFeedback(e.target.value)} className="w-full mt-1 p-3 border rounded-lg text-slate-900 min-h-28" /></label>
                  </div>
                  <div className="flex justify-end gap-3 border-t pt-4">
                    <button onClick={() => submitTravelTourismMarks(false)} disabled={savingMarks} className="px-5 py-3 rounded-xl font-bold bg-slate-700 text-white">Save draft marks</button>
                    <button onClick={() => submitTravelTourismMarks(true)} disabled={savingMarks} className="px-5 py-3 rounded-xl font-bold bg-green-600 text-white">Save & release</button>
                  </div>
                </div>
              </div>
            </div>, document.body
          );
        }
        const part1Total = writingMarks.part1.content + writingMarks.part1.organisation + writingMarks.part1.language;
        const part2Total = writingMarks.part2.content + writingMarks.part2.communicativeAchievement + 
                          writingMarks.part2.organisation + writingMarks.part2.language;
        const totalScore = part1Total + part2Total;
        const percentage = Math.round((totalScore / 35) * 100);
        const writingMeta = WRITING_TEST_METADATA[selectedCambridgeStudent.quiz_name] ?? WRITING_TEST_METADATA['Cambridge Writing Test 1'];
        
        return createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-6xl w-full max-h-[95vh] overflow-y-auto" style={{ fontFamily: 'Segoe UI, Arial, sans-serif' }}>
              {/* Header */}
              <div className="p-6 border-b-4 border-purple-600 bg-gradient-to-r from-purple-50 to-indigo-50">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <span className="text-4xl">✏️</span>
                    <div>
                      <h1 className="text-2xl font-bold text-purple-800">Writing Test Marking & Feedback</h1>
                      <p className="text-sm text-gray-500">E2L Stage 9 Paper 3 — Provide marks and detailed feedback</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowWritingMarkingModal(false)}
                    className="p-2 hover:bg-gray-200 rounded-full text-xl"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Student Info */}
              <div className="bg-gray-100 text-black p-5 flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold">{selectedCambridgeStudent.student_name}</h2>
                  <p className="text-sm opacity-80">Class: {selectedCambridgeStudent.student_class || 'N/A'} | Submitted: {new Date(selectedCambridgeStudent.submitted_at).toLocaleDateString()}</p>
                </div>
                
                {/* Auto-Proofread Button */}
                <button
                  onClick={autoProofreadWriting}
                  disabled={autoProofreadLoading}
                  className={`px-5 py-3 rounded-xl font-bold flex items-center gap-2 transition-all ${
                    autoProofreadLoading
                      ? 'bg-gray-200 cursor-wait text-black'
                      : 'bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 shadow-lg hover:shadow-xl text-white'
                  }`}
                >
                  {autoProofreadLoading ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      AI Analyzing...
                    </>
                  ) : (
                    <>
                      <span>🤖</span>
                      AI Proofread (GPT)
                    </>
                  )}
                </button>
                
                <div className="text-right text-black">
                  <div className="text-3xl font-bold">{totalScore}/35</div>
                  <div className="text-lg font-semibold">{percentage}%</div>
                </div>
              </div>

              <div className="p-6 space-y-8">
                {/* Part 1 */}
                <div className="border-2 border-blue-200 rounded-xl overflow-hidden">
                  <div className="bg-blue-100 p-4">
                    <h3 className="text-lg font-bold text-blue-800">📝 Part 1: {writingMeta.part1Label} (15 marks)</h3>
                    <p className="text-sm text-blue-600">{writingMeta.part1Context} • Target: 45-55 words • Actual: {answers.part1_words || 0} words</p>
                  </div>
                  
                  {/* Student's Answer */}
                  <div className="p-4 bg-white border-b">
                    <label className="text-sm font-semibold text-gray-700 block mb-2">Student's Original Response:</label>
                    <div className="rounded-xl border border-slate-200 bg-white/95 p-4 text-slate-900 shadow-sm shadow-slate-900/5 ring-1 ring-slate-100 whitespace-pre-wrap leading-relaxed">
                      {answers.part1 || 'No response submitted'}
                    </div>
                  </div>
                  
                  {/* Marking Grid */}
                  <div className="p-4 border-b bg-white">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-green-50 p-4 rounded-xl border border-green-200">
                        <label className="text-sm font-bold text-green-800 block mb-2">Content (0-5)</label>
                        <select
                          value={writingMarks.part1.content}
                          onChange={(e) => setWritingMarks(prev => ({
                            ...prev,
                            part1: { ...prev.part1, content: parseInt(e.target.value) }
                          }))}
                          className="w-full p-2 border-2 border-green-300 rounded-lg text-lg font-bold text-center bg-white text-gray-900"
                        >
                          {[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <p className="text-xs text-gray-600 mt-2">5: All 3 content points fully covered</p>
                      </div>
                      <div className="bg-blue-50 p-4 rounded-xl border border-blue-200">
                        <label className="text-sm font-bold text-blue-800 block mb-2">Organisation (0-5)</label>
                        <select
                          value={writingMarks.part1.organisation}
                          onChange={(e) => setWritingMarks(prev => ({
                            ...prev,
                            part1: { ...prev.part1, organisation: parseInt(e.target.value) }
                          }))}
                          className="w-full p-2 border-2 border-blue-300 rounded-lg text-lg font-bold text-center bg-white text-gray-900"
                        >
                          {[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <p className="text-xs text-gray-600 mt-2">5: Well organised, coherent, appropriate linking</p>
                      </div>
                      <div className="bg-purple-50 p-4 rounded-xl border border-purple-200">
                        <label className="text-sm font-bold text-purple-800 block mb-2">Language (0-5)</label>
                        <select
                          value={writingMarks.part1.language}
                          onChange={(e) => setWritingMarks(prev => ({
                            ...prev,
                            part1: { ...prev.part1, language: parseInt(e.target.value) }
                          }))}
                          className="w-full p-2 border-2 border-purple-300 rounded-lg text-lg font-bold text-center bg-white text-gray-900"
                        >
                          {[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <p className="text-xs text-gray-600 mt-2">5: Sufficiently accurate, message clear</p>
                      </div>
                    </div>
                    <div className="mt-4 text-right">
                      <span className="text-lg font-bold text-blue-800">Part 1 Total: {part1Total}/15</span>
                    </div>
                  </div>
                  
                  {/* Feedback Section for Part 1 */}
                  <div className="p-4 bg-orange-50">
                    <h4 className="text-md font-bold text-orange-800 mb-3">📋 Feedback for Part 1 (visible to student when released)</h4>
                    
                    {/* Debug: Show if GPT data is present */}
                    <div className="mb-3 p-2 bg-gray-100 rounded text-xs text-gray-600">
                      <span className="font-mono">
                        GPT Data: {writingFeedback.part1.spellingMistakes?.length || 0} spelling, {' '}
                        {writingFeedback.part1.grammarMistakes?.length || 0} grammar, {' '}
                        {writingFeedback.part1.markJustifications ? '✓' : '✗'} justifications, {' '}
                        {writingFeedback.part1.modelAnswer ? '✓' : '✗'} model answer
                      </span>
                    </div>
                    
                    {/* Spelling Mistakes */}
                    {writingFeedback.part1.spellingMistakes && writingFeedback.part1.spellingMistakes.length > 0 && (
                      <div className="mb-4 bg-red-50 p-3 rounded-lg border border-red-200">
                        <h5 className="text-sm font-bold text-red-800 mb-2">🔤 Spelling Mistakes ({writingFeedback.part1.spellingMistakes.length})</h5>
                        <div className="space-y-2">
                          {writingFeedback.part1.spellingMistakes.map((m, i) => (
                            <div key={i} className="text-sm bg-white p-2 rounded border">
                              <span className="text-red-600 line-through">{m.wrong}</span>
                              <span className="mx-2">→</span>
                              <span className="text-green-600 font-semibold">{m.correct}</span>
                              <p className="text-gray-600 text-xs mt-1">{m.explanation}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Grammar Mistakes */}
                    {writingFeedback.part1.grammarMistakes && writingFeedback.part1.grammarMistakes.length > 0 && (
                      <div className="mb-4 bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                        <h5 className="text-sm font-bold text-yellow-800 mb-2">📝 Grammar Mistakes ({writingFeedback.part1.grammarMistakes.length})</h5>
                        <div className="space-y-2">
                          {writingFeedback.part1.grammarMistakes.map((m, i) => (
                            <div key={i} className="text-sm bg-white p-2 rounded border">
                              <span className="text-red-600 line-through">{m.wrong}</span>
                              <span className="mx-2">→</span>
                              <span className="text-green-600 font-semibold">{m.correct}</span>
                              <p className="text-gray-600 text-xs mt-1">{m.explanation}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Mark Justifications */}
                    {writingFeedback.part1.markJustifications && (
                      <div className="mb-4 bg-blue-50 p-3 rounded-lg border border-blue-200">
                        <h5 className="text-sm font-bold text-blue-800 mb-2">📊 Mark Justifications</h5>
                        <div className="space-y-2 text-sm">
                          <div><strong>Content:</strong> {writingFeedback.part1.markJustifications.content}</div>
                          <div><strong>Organisation:</strong> {writingFeedback.part1.markJustifications.organisation}</div>
                          <div><strong>Language:</strong> {writingFeedback.part1.markJustifications.language}</div>
                        </div>
                      </div>
                    )}
                    
                    <div className="mb-4">
                      <label className="text-sm font-semibold text-gray-700 block mb-2">
                        🔴 Teacher's Comments & Corrections:
                      </label>
                      <textarea
                        value={writingFeedback.part1.feedback}
                        onChange={(e) => setWritingFeedback(prev => ({
                          ...prev,
                          part1: { ...prev.part1, feedback: e.target.value }
                        }))}
                        placeholder="Point out spelling errors, grammar mistakes, missing content points, etc. Be specific about what the student did wrong and how to improve..."
                        className="w-full p-3 border-2 border-orange-300 rounded-lg min-h-[100px] text-sm"
                      />
                    </div>
                    
                    <div className="mb-4">
                      <label className="text-sm font-semibold text-gray-700 block mb-2">
                        ✅ Corrected Version (student's text with errors fixed):
                      </label>
                      <textarea
                        value={writingFeedback.part1.correctedVersion}
                        onChange={(e) => setWritingFeedback(prev => ({
                          ...prev,
                          part1: { ...prev.part1, correctedVersion: e.target.value }
                        }))}
                        placeholder="Write a corrected version of the student's response..."
                        className="w-full p-3 border-2 border-green-300 rounded-lg min-h-[100px] text-sm bg-green-50"
                      />
                    </div>
                    
                    {/* Model Answer */}
                    {writingFeedback.part1.modelAnswer && (
                      <div>
                        <label className="text-sm font-semibold text-gray-700 block mb-2">
                          ⭐ Model Answer (high-band example):
                        </label>
                        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 p-4 rounded-lg border-2 border-purple-300 text-sm whitespace-pre-wrap">
                          {writingFeedback.part1.modelAnswer}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Part 2 */}
                <div className="border-2 border-indigo-200 rounded-xl overflow-hidden">
                  <div className="bg-indigo-100 p-4">
                    <h3 className="text-lg font-bold text-indigo-800">📝 Part 2: {writingMeta.part2Label} (20 marks)</h3>
                    <p className="text-sm text-indigo-600">{writingMeta.part2Context} • Target: 110-130 words • Actual: {answers.part2_words || 0} words</p>
                  </div>
                  
                  {/* Student's Answer */}
                  <div className="p-4 bg-white border-b">
                    <label className="text-sm font-semibold text-gray-700 block mb-2">Student's Original Response:</label>
                    <div className="rounded-xl border border-slate-200 bg-white/95 p-4 text-slate-900 shadow-sm shadow-slate-900/5 ring-1 ring-slate-100 whitespace-pre-wrap leading-relaxed min-h-[150px]">
                      {answers.part2 || 'No response submitted'}
                    </div>
                  </div>
                  
                  {/* Marking Grid */}
                  <div className="p-4 border-b bg-white">
                    <div className="grid grid-cols-4 gap-3">
                      <div className="bg-green-50 p-3 rounded-xl border border-green-200">
                        <label className="text-sm font-bold text-green-800 block mb-2">Content (0-5)</label>
                        <select
                          value={writingMarks.part2.content}
                          onChange={(e) => setWritingMarks(prev => ({
                            ...prev,
                            part2: { ...prev.part2, content: parseInt(e.target.value) }
                          }))}
                          className="w-full p-2 border-2 border-green-300 rounded-lg text-lg font-bold text-center bg-white text-gray-900"
                        >
                          {[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <p className="text-xs text-gray-600 mt-2">5: All relevant, reader fully informed</p>
                      </div>
                      <div className="bg-yellow-50 p-3 rounded-xl border border-yellow-200">
                        <label className="text-sm font-bold text-yellow-800 block mb-2">Comm. Ach. (0-5)</label>
                        <select
                          value={writingMarks.part2.communicativeAchievement}
                          onChange={(e) => setWritingMarks(prev => ({
                            ...prev,
                            part2: { ...prev.part2, communicativeAchievement: parseInt(e.target.value) }
                          }))}
                          className="w-full p-2 border-2 border-yellow-300 rounded-lg text-lg font-bold text-center bg-white text-gray-900"
                        >
                          {[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <p className="text-xs text-gray-600 mt-2">5: Clear, appropriate style</p>
                      </div>
                      <div className="bg-blue-50 p-3 rounded-xl border border-blue-200">
                        <label className="text-sm font-bold text-blue-800 block mb-2">Organisation (0-5)</label>
                        <select
                          value={writingMarks.part2.organisation}
                          onChange={(e) => setWritingMarks(prev => ({
                            ...prev,
                            part2: { ...prev.part2, organisation: parseInt(e.target.value) }
                          }))}
                          className="w-full p-2 border-2 border-blue-300 rounded-lg text-lg font-bold text-center bg-white text-gray-900"
                        >
                          {[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <p className="text-xs text-gray-600 mt-2">5: Well organised, coherent</p>
                      </div>
                      <div className="bg-purple-50 p-3 rounded-xl border border-purple-200">
                        <label className="text-sm font-bold text-purple-800 block mb-2">Language (0-5)</label>
                        <select
                          value={writingMarks.part2.language}
                          onChange={(e) => setWritingMarks(prev => ({
                            ...prev,
                            part2: { ...prev.part2, language: parseInt(e.target.value) }
                          }))}
                          className="w-full p-2 border-2 border-purple-300 rounded-lg text-lg font-bold text-center bg-white text-gray-900"
                        >
                          {[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <p className="text-xs text-gray-600 mt-2">5: Range of vocab, good control</p>
                      </div>
                    </div>
                    <div className="mt-4 text-right">
                      <span className="text-lg font-bold text-indigo-800">Part 2 Total: {part2Total}/20</span>
                    </div>
                  </div>
                  
                  {/* Feedback Section for Part 2 */}
                  <div className="p-4 bg-orange-50">
                    <h4 className="text-md font-bold text-orange-800 mb-3">📋 Feedback for Part 2 (visible to student when released)</h4>
                    
                    {/* Debug: Show if GPT data is present */}
                    <div className="mb-3 p-2 bg-gray-100 rounded text-xs text-gray-600">
                      <span className="font-mono">
                        GPT Data: {writingFeedback.part2.spellingMistakes?.length || 0} spelling, {' '}
                        {writingFeedback.part2.grammarMistakes?.length || 0} grammar, {' '}
                        {writingFeedback.part2.markJustifications ? '✓' : '✗'} justifications, {' '}
                        {writingFeedback.part2.modelAnswer ? '✓' : '✗'} model answer
                      </span>
                    </div>
                    
                    {/* Spelling Mistakes */}
                    {writingFeedback.part2.spellingMistakes && writingFeedback.part2.spellingMistakes.length > 0 && (
                      <div className="mb-4 bg-red-50 p-3 rounded-lg border border-red-200">
                        <h5 className="text-sm font-bold text-red-800 mb-2">🔤 Spelling Mistakes ({writingFeedback.part2.spellingMistakes.length})</h5>
                        <div className="space-y-2">
                          {writingFeedback.part2.spellingMistakes.map((m, i) => (
                            <div key={i} className="text-sm bg-white p-2 rounded border">
                              <span className="text-red-600 line-through">{m.wrong}</span>
                              <span className="mx-2">→</span>
                              <span className="text-green-600 font-semibold">{m.correct}</span>
                              <p className="text-gray-600 text-xs mt-1">{m.explanation}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Grammar Mistakes */}
                    {writingFeedback.part2.grammarMistakes && writingFeedback.part2.grammarMistakes.length > 0 && (
                      <div className="mb-4 bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                        <h5 className="text-sm font-bold text-yellow-800 mb-2">📝 Grammar Mistakes ({writingFeedback.part2.grammarMistakes.length})</h5>
                        <div className="space-y-2">
                          {writingFeedback.part2.grammarMistakes.map((m, i) => (
                            <div key={i} className="text-sm bg-white p-2 rounded border">
                              <span className="text-red-600 line-through">{m.wrong}</span>
                              <span className="mx-2">→</span>
                              <span className="text-green-600 font-semibold">{m.correct}</span>
                              <p className="text-gray-600 text-xs mt-1">{m.explanation}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Mark Justifications */}
                    {writingFeedback.part2.markJustifications && (
                      <div className="mb-4 bg-blue-50 p-3 rounded-lg border border-blue-200">
                        <h5 className="text-sm font-bold text-blue-800 mb-2">📊 Mark Justifications</h5>
                        <div className="space-y-2 text-sm">
                          <div><strong>Content:</strong> {writingFeedback.part2.markJustifications.content}</div>
                          <div><strong>Communicative Achievement:</strong> {writingFeedback.part2.markJustifications.communicativeAchievement}</div>
                          <div><strong>Organisation:</strong> {writingFeedback.part2.markJustifications.organisation}</div>
                          <div><strong>Language:</strong> {writingFeedback.part2.markJustifications.language}</div>
                        </div>
                      </div>
                    )}
                    
                    <div className="mb-4">
                      <label className="text-sm font-semibold text-gray-700 block mb-2">
                        🔴 Teacher's Comments & Corrections:
                      </label>
                      <textarea
                        value={writingFeedback.part2.feedback}
                        onChange={(e) => setWritingFeedback(prev => ({
                          ...prev,
                          part2: { ...prev.part2, feedback: e.target.value }
                        }))}
                        placeholder="Point out spelling errors, grammar mistakes, weak arguments, organisation issues, etc. Be specific about what the student did wrong and how to improve..."
                        className="w-full p-3 border-2 border-orange-300 rounded-lg min-h-[120px] text-sm"
                      />
                    </div>
                    
                    <div className="mb-4">
                      <label className="text-sm font-semibold text-gray-700 block mb-2">
                        ✅ Corrected Version (student's text with errors fixed):
                      </label>
                      <textarea
                        value={writingFeedback.part2.correctedVersion}
                        onChange={(e) => setWritingFeedback(prev => ({
                          ...prev,
                          part2: { ...prev.part2, correctedVersion: e.target.value }
                        }))}
                        placeholder="Write a corrected version of the student's essay..."
                        className="w-full p-3 border-2 border-green-300 rounded-lg min-h-[150px] text-sm bg-green-50"
                      />
                    </div>
                    
                    {/* Model Answer */}
                    {writingFeedback.part2.modelAnswer && (
                      <div>
                        <label className="text-sm font-semibold text-gray-700 block mb-2">
                          ⭐ Model Answer (high-band example - 110-130 words):
                        </label>
                        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 p-4 rounded-lg border-2 border-purple-300 text-sm whitespace-pre-wrap">
                          {writingFeedback.part2.modelAnswer}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Overall Comments */}
                <div className="border-2 border-gray-300 rounded-xl overflow-hidden">
                  <div className="bg-gray-100 p-4">
                    <h3 className="text-lg font-bold text-gray-800">💬 Overall Comments & Tips</h3>
                  </div>
                  <div className="p-4">
                    <textarea
                      value={writingFeedback.overallComments}
                      onChange={(e) => setWritingFeedback(prev => ({
                        ...prev,
                        overallComments: e.target.value
                      }))}
                      placeholder="Add any overall comments, encouragement, or specific tips for this student to improve their writing skills..."
                      className="w-full p-3 border-2 border-gray-300 rounded-lg min-h-[100px] text-sm"
                    />
                  </div>
                </div>

                {/* Total Score Summary */}
                <div className={`p-6 rounded-xl text-center ${
                  percentage >= 70 ? 'bg-green-100 border-2 border-green-400' :
                  percentage >= 50 ? 'bg-yellow-100 border-2 border-yellow-400' :
                  'bg-red-100 border-2 border-red-400'
                }`}>
                  <h3 className="text-2xl font-bold mb-2">Total Score: {totalScore}/35 ({percentage}%)</h3>
                  <p className="text-gray-600">
                    {percentage >= 80 ? '🏆 Excellent work!' :
                     percentage >= 70 ? '👍 Good effort!' :
                     percentage >= 50 ? '📈 Room for improvement' :
                     '💪 Needs more practice'}
                  </p>
                </div>
              </div>

              {/* Footer with Release Options */}
              <div className="p-4 border-t bg-gray-50">
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500">
                    {answers.marked_by ? (
                      <span>
                        Previously marked by <strong>{answers.marked_by}</strong>
                        {answers.feedback?.releasedToStudent && <span className="ml-2 text-green-600">✓ Released to student</span>}
                      </span>
                    ) : 'Not yet marked'}
                  </div>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setShowWritingMarkingModal(false)} 
                      className="px-4 py-2 bg-gray-500 text-white rounded-lg font-semibold hover:bg-gray-600"
                      disabled={savingMarks}
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={() => submitWritingMarks(false)} 
                      className="px-5 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={savingMarks}
                    >
                      {savingMarks ? '⏳ Saving...' : '💾 Save (Draft)'}
                    </button>
                    <button 
                      onClick={() => submitWritingMarks(true)} 
                      className="px-5 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={savingMarks}
                    >
                      {savingMarks ? '⏳ Saving...' : '✅ Save & Release to Student'}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-2 text-center">
                  💡 "Save (Draft)" keeps feedback hidden. "Save & Release" makes marks and feedback visible to the student.
                </p>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* Class-scoped Cambridge release manager */}
      {showVisibilityManager && (() => {
        const groups = Object.values(
          visibilityTestsData.reduce((acc: Record<string, any>, test: any) => {
            const key = `${test.class_id}|${test.curriculum_subject}`;
            if (!acc[key]) {
              acc[key] = {
                classId: test.class_id,
                classCode: test.class_code,
                className: test.class_name,
                gradeLevel: test.grade_level,
                subject: test.curriculum_subject,
                tests: [],
              };
            }
            acc[key].tests.push(test);
            return acc;
          }, {})
        ) as any[];

        return createPortal(
          <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-labelledby="cambridge-release-title">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-[1000px] max-h-[90vh] flex flex-col overflow-hidden">
              <div className="bg-gradient-to-r from-purple-700 to-indigo-700 text-white p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-purple-200">Teacher release control</p>
                    <h2 id="cambridge-release-title" className="text-2xl font-bold mt-1">Release Cambridge Tests</h2>
                    <p className="text-purple-100 text-sm mt-1">Choose exactly what students in each assigned class can see.</p>
                  </div>
                  <button onClick={() => setShowVisibilityManager(false)} className="min-h-11 min-w-11 rounded-xl bg-white/10 text-2xl hover:bg-white/20" aria-label="Close release manager">×</button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
                {visibilityLoading ? (
                  <div className="text-center py-12 text-gray-500" role="status">
                    <div className="text-4xl mb-3">⏳</div>
                    Loading tests for your classes…
                  </div>
                ) : groups.length === 0 ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
                    <div className="text-4xl mb-3">📚</div>
                    <h3 className="font-bold text-amber-950">No matching Cambridge tests yet</h3>
                    <p className="mt-2 text-sm text-amber-800">Ask your school admin to confirm that tests are enabled and that your class has the correct grade and subject assignment.</p>
                  </div>
                ) : groups.map(group => {
                  const available = group.tests.filter((test: any) => test.school_available);
                  const releasedCount = available.filter((test: any) => testVisibilitySettings.get(`${group.classId}|${test.test_id}`) === true).length;
                  const allReleased = available.length > 0 && releasedCount === available.length;
                  return (
                    <section key={`${group.classId}-${group.subject}`} className="overflow-hidden rounded-2xl border border-gray-200" aria-labelledby={`release-${group.classId}`}>
                      <div className="flex flex-col gap-3 border-b border-gray-200 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 id={`release-${group.classId}`} className="font-bold text-gray-950">{group.classCode} · {group.subject}</h3>
                          <p className="text-xs text-gray-600 mt-1">Grade {group.gradeLevel} · {releasedCount} of {available.length} available tests released</p>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => bulkSetTestVisibility(group.classId, available.map((test: any) => test.test_id), true)} disabled={allReleased || available.length === 0} className="min-h-10 rounded-lg bg-green-600 px-3 text-xs font-bold text-white disabled:opacity-40">Release all</button>
                          <button onClick={() => bulkSetTestVisibility(group.classId, available.map((test: any) => test.test_id), false)} disabled={releasedCount === 0} className="min-h-10 rounded-lg bg-gray-700 px-3 text-xs font-bold text-white disabled:opacity-40">Hide all</button>
                        </div>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {group.tests.map((test: any) => {
                          const released = testVisibilitySettings.get(`${group.classId}|${test.test_id}`) === true;
                          return (
                            <div key={test.test_id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-gray-950">{test.test_name}</p>
                                <p className="mt-1 text-xs text-gray-600">{test.subject}{test.curriculum_stage ? ` · Cambridge Stage ${test.curriculum_stage}` : ''}{test.category ? ` · ${test.category}` : ''}</p>
                                {!test.school_available && <p className="mt-2 text-xs font-semibold text-amber-700">Unavailable: disabled by your school administrator</p>}
                              </div>
                              <button
                                onClick={() => toggleTestVisibility(group.classId, test.test_id, released)}
                                disabled={!test.school_available}
                                aria-pressed={released}
                                className={`min-h-11 min-w-[132px] rounded-xl px-4 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:bg-amber-100 disabled:text-amber-700 ${released ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                              >
                                {!test.school_available ? 'Admin disabled' : released ? '✓ Released' : 'Release'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>

              <div className="flex flex-col gap-3 border-t border-gray-200 bg-gray-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-gray-600">Students see a test only when the school enables it and you release it to their class.</p>
                <button onClick={() => setShowVisibilityManager(false)} className="min-h-11 rounded-xl bg-purple-700 px-6 font-bold text-white hover:bg-purple-800">Done</button>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}
    </div>
  );
  };

  if (loading) {
    return (
      <div className="teacher-loading" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <img src="/BRAINS.svg" alt="Loading..." style={{ width: '200px', height: '200px', filter: 'drop-shadow(0 0 30px rgba(0, 212, 255, 0.6))' }} />
      </div>
    );
  }

  const teachesEnglish = teacherAssignedSubjects.some((subjectName) =>
    subjectName.trim().toLocaleLowerCase().includes('english'),
  );
  const canAccessWritingInsights =
    profile.role === 'admin' || (profile.role === 'teacher' && teachesEnglish);

  const navTabs: Array<{ id: TeacherNavSection; label: string; icon: string; description: string; proOnly?: boolean; highlight?: boolean }> = [
    { id: 'dashboard', label: 'Dashboard', icon: '🏠', description: 'Overview & Quick Actions' },
    { id: 'students', label: 'My Classes', icon: '🏫', description: 'Assigned Classes & Students' },
    ...(!profile.school_id ? [{ id: 'join-school' as const, label: 'Join Your School', icon: '🏫', description: 'Use your invite code to unlock school features', highlight: true }] : []),
    { id: 'assignments', label: 'Assignments', icon: '📋', description: 'Assign Work to Students', proOnly: true },
    { id: 'reports', label: 'Reports', icon: '📊', description: 'Student Performance', proOnly: true },
    ...(profile.school_id ? [{ id: 'documents' as const, label: 'Document Center', icon: '🗃️', description: 'Print History & Reprints', proOnly: true }] : []),
    { id: 'questions', label: 'Question Bank', icon: '📚', description: 'Create & Manage Questions', proOnly: true },
    ...(canAccessWritingInsights
      ? [
          { id: 'writing-hub' as const, label: 'Writing Hub', icon: '✍️', description: 'Monitor, analyse, and export writing progress', proOnly: true },
        ]
      : []),
    { id: 'cambridge', label: 'Cambridge Tests', icon: '🧾', description: 'Writing & Test Results', proOnly: true },
    { id: 'clan-wars', label: 'Clan Wars', icon: '⚔️', description: 'Host official class battles' },
  ];

  // Plan badge info for top bar
  const getPlanBadge = () => {
    if (!_cachedPlanDetails || !_cachedPlanDetails.success) return null;
    const plan = _cachedPlanDetails.plan;
    if (plan === 'none') return null;
    if (plan === 'pilot') {
      let countdown: string | null = null;
      if (_cachedPlanDetails.trial_ends_at) {
        const end = new Date(_cachedPlanDetails.trial_ends_at).getTime();
        const diff = end - Date.now();
        countdown = diff > 0 ? `${Math.ceil(diff / (1000 * 60 * 60 * 24))}d left` : 'Expired';
      }
      return { label: 'PILOT', color: 'cyan', icon: '🚀', countdown };
    }
    const colorMap: Record<string, string> = { core: 'blue', standard: 'emerald', pro: 'amber', enterprise: 'purple' };
    const iconMap: Record<string, string> = { core: '⚡', standard: '⚡', pro: '👑', enterprise: '💎' };
    return { label: plan.toUpperCase(), color: colorMap[plan] || 'blue', icon: iconMap[plan] || '⚡', countdown: null };
  };
  const planBadge = getPlanBadge();
  const getNavTabState = (tab: (typeof navTabs)[number]) => {
    const isPilot = pilotQuotas?.is_pilot && !pilotQuotas?.expired;
    const tabQuotaMap: Record<string, string> = {
      questions: 'Question Bank',
      assignments: 'New Assignment',
      reports: 'Performance Reports',
      documents: 'Performance Reports',
      'writing-hub': 'Performance Reports',
      'clan-wars': 'Lockdown Mode',
      cambridge: 'Cambridge Marking',
    };
    const featureLabel = tabQuotaMap[tab.id];
    const quota = featureLabel ? getQuotaForFeature(featureLabel, pilotQuotas) : null;
    const pilotExhausted = Boolean(isPilot && quota?.exhausted);
    return {
      isPilot,
      quota,
      pilotExhausted,
      locked: Boolean((tab.proOnly && !isProPlan) || pilotExhausted),
    };
  };
  const mobilePrimaryTabs = navTabs.filter((tab) =>
    ['dashboard', 'students', 'assignments', 'reports'].includes(tab.id)
  );

  return (
    <div
      className="teacher-portal"
      style={{ '--teacher-top-nav-height': `${topNavHeight || 76}px` } as React.CSSProperties}
    >
      {/* Top Navigation Bar */}
      <header
        ref={topNavRef}
        className="teacher-topbar fixed left-0 right-0 top-0 z-50 border-b border-slate-800 bg-slate-950"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 20px)' }}
      >
        <div className="teacher-topbar-inner mx-auto flex w-full max-w-[1600px] items-center justify-between px-3 py-2 sm:px-4 lg:px-6">
          {/* Left: Logo + Brand */}
          <div className="teacher-topbar-brand flex min-w-0 items-center gap-2 lg:gap-3">
            <img
              src="/logo.png"
              alt="Brains Heist"
              className="w-8 h-8 lg:w-10 lg:h-10 drop-shadow-[0_0_10px_rgba(59,130,246,0.6)] flex-shrink-0"
            />
            <span className="font-heading text-lg lg:text-xl font-black tracking-wider select-none hidden sm:inline">
              <span style={{ backgroundImage: 'linear-gradient(90deg, #22d3ee 0%, #3b82f6 25%, #8b5cf6 50%, #3b82f6 75%, #22d3ee 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundSize: '200% 100%', animation: 'shimmer 3s linear infinite' }}>BRAINS</span>
              {' '}
              <span style={{ backgroundImage: 'linear-gradient(90deg, #ec4899 0%, #ef4444 25%, #f97316 50%, #ef4444 75%, #ec4899 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundSize: '200% 100%', animation: 'shimmer 3s linear infinite', animationDelay: '1.5s' }}>HEIST</span>
            </span>
            <span className="font-heading text-base font-black tracking-wide text-cyan-300 sm:hidden">BH</span>

            {/* Username */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-black/40 rounded-full border border-cyan-500/30 backdrop-blur-sm">
              <img
                src={avatarUrl}
                alt={profile.username}
                className="w-6 h-6 rounded-full border border-pink-500/70 object-cover"
              />
              <span className="font-bold text-white text-sm truncate max-w-[120px]">{profile.username}</span>
            </div>

            {/* Plan Badge */}
            {planBadge && (
              <div className={`teacher-desktop-plan-badge plan-badge plan-badge--${planBadge.color} flex-shrink-0`}>
                <span className="plan-badge__icon">{planBadge.icon}</span>
                <span className="plan-badge__label">{planBadge.label}</span>
                {planBadge.countdown && <span className="plan-badge__countdown">{planBadge.countdown}</span>}
              </div>
            )}
            {planBadge && (
              <div className={`teacher-mobile-plan-badge plan-badge plan-badge--${planBadge.color} sm:hidden`}>
                <span className="plan-badge__label">{planBadge.label}</span>
                {planBadge.countdown && <span className="plan-badge__countdown">{planBadge.countdown}</span>}
              </div>
            )}
          </div>

          {/* Right: Actions */}
          <div className="relative flex items-center gap-2" ref={topNavMenuRef}>
            <button
              type="button"
              onClick={() => {
                setShowNotifications((prev) => !prev);
                setUnreadCount(0);
              }}
              className="relative hidden h-11 w-11 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900/70 text-lg text-slate-200 shadow-sm shadow-slate-950/40 transition hover:border-purple-500/60 hover:text-white sm:flex"
              aria-label="Open notifications"
              title="Notifications"
            >
              🔔
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-bold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              className="hidden sm:flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900/70 text-lg text-slate-200 shadow-sm shadow-slate-950/40 transition hover:border-cyan-500/60 hover:text-white"
              aria-label="Open help and guide"
              title="Guide & Help"
            >
              ❓
            </button>
            <button
              type="button"
              onClick={() => setTopNavMenuOpen((prev) => !prev)}
              className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900/70 text-xl text-slate-200 shadow-sm shadow-slate-950/40 transition hover:border-cyan-500/60 hover:text-white"
              aria-label="Open quick menu"
            >
              ☰
            </button>
            <button
              type="button"
              onClick={() => setShowSettingsModal(true)}
              className="rounded-full border-2 border-pink-500/80 p-0.5 shadow-[0_0_20px_rgba(236,72,153,0.35)] transition-all hover:border-pink-300 disabled:opacity-60"
              title={`${profile.username} settings`}
            >
              <img
                src={avatarUrl}
                alt={profile.username}
                className="h-10 w-10 rounded-full object-cover"
              />
            </button>

            {topNavMenuOpen && (
              <div className="absolute right-0 top-14 z-[60] w-60 max-w-[90vw] rounded-2xl border border-slate-800/70 bg-slate-950/95 p-2 shadow-2xl shadow-slate-950/70">
                <button
                  type="button"
                  onClick={() => {
                    setShowNotifications(true);
                    setUnreadCount(0);
                    setTopNavMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800/60 sm:hidden"
                >
                  <span className="flex items-center gap-2"><span className="text-lg">🔔</span>Notifications</span>
                  {unreadCount > 0 && (
                    <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-bold text-white">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowHelp(true);
                    setTopNavMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-cyan-200 transition hover:bg-cyan-500/20"
                >
                  <span className="text-lg">❓</span>
                  Guide & Help
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSettingsModal(true);
                    setTopNavMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800/60"
                >
                  <span className="text-lg">⚙️</span>
                  Settings
                </button>
                {isSchoolAdmin && onOpenSchoolAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenSchoolAdmin();
                      setTopNavMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-purple-200 transition hover:bg-purple-500/20"
                  >
                    <span className="text-lg">🏫</span>
                    School Admin Portal
                  </button>
                )}
                {onLogout && (
                  <button
                    type="button"
                    onClick={() => {
                      onLogout();
                      setTopNavMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-rose-200 transition hover:bg-rose-500/20"
                  >
                    <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Logout
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>
      {showSettingsModal && (
        <SettingsModal
          onClose={() => setShowSettingsModal(false)}
          profile={profile}
          isAdminMode={false}
          avatarPresets={avatarPresets}
          selectedAvatar={selectedAvatar}
          uploadingAvatar={uploadingAvatar}
          avatarUploadError={avatarUploadError || ''}
          onAvatarSelect={handleAvatarSelect}
          onAvatarUpload={handleAvatarUpload}
          onUsernameChange={handleUsernameChange}
          avatarUploadSuccess={avatarUploadSuccess}
          requiredChanges={profile.required_changes as { username?: boolean; avatar?: boolean; reason?: string } | null}
          placement="header-bottom"
          headerOffsetPx={topNavHeight}
        />
      )}
      {showHelp && (
        <HelpModal
          onClose={() => setShowHelp(false)}
          placement="header-bottom"
          headerOffsetPx={topNavHeight}
        />
      )}
      <NotificationCenter
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
        userRole="teacher"
      />

      <div
        aria-hidden
        style={{ height: `${topNavHeight}px` }}
      />
      <div className="teacher-portal-container">
        {/* Professional Header */}
        <div className="teacher-header">
          <div className="teacher-header-content">
            <div className="teacher-header-info">
              <div className="teacher-header-badge">
                <span>🎓</span> Educator Workspace
              </div>
              <h1 className="teacher-header-title">
                <SchoolBrand brand={schoolBrand} showName={false} imageClassName="h-9 w-9 rounded-md object-contain inline-block mr-2" />
                <span className="hidden sm:inline">{schoolBrand.name} Teacher Portal</span>
                <span className="sm:hidden">Teacher Portal</span>
              </h1>

              
              {/* Display Assigned Classes */}
              {teacherHasClassAssignments && assignedClasses.length > 0 && (
                <div className="teacher-assigned-classes mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sky-700 font-semibold text-sm">📚 Your Assigned Classes ({assignedClasses.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {assignedClasses.slice(0, 6).map((cls, index) => (
                      <div key={index} className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200 px-3 py-1 text-xs">
                        <span className="font-semibold text-slate-700">{cls.class_code}</span>
                        <span className="text-slate-400">•</span>
                        <span className="text-slate-600">{cls.subject}</span>
                      </div>
                    ))}
                    {assignedClasses.length > 6 && (
                      <span className="inline-flex items-center rounded-full bg-white border border-slate-200 px-3 py-1 text-xs text-slate-600">
                        +{assignedClasses.length - 6} more
                      </span>
                    )}
                  </div>
                </div>
              )}
              
              {!teacherHasClassAssignments && (
                <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3">
                  <p className="text-sm text-amber-900">
                    ⚠️ No classes assigned yet. Contact your school admin to assign you to classes.
                  </p>
                </div>
              )}

            </div>
          </div>
        </div>

        {/* Plan Status Banner */}
        <TeacherPlanBanner
          isSchoolAdmin={isSchoolAdmin}
          onOpenSchoolAdmin={onOpenSchoolAdmin}
        />

        <div className={`teacher-workspace-shell ${desktopSidebarCollapsed ? 'is-sidebar-collapsed' : ''}`}>
          {/* Navigation */}
          <aside className={`teacher-sidebar teacher-desktop-sidebar ${desktopSidebarCollapsed ? 'is-collapsed' : ''}`}>
            <div className="teacher-nav-container teacher-nav-container--sidebar">
              <button
                type="button"
                className="teacher-sidebar-toggle"
                onClick={toggleDesktopSidebar}
                aria-label={desktopSidebarCollapsed ? 'Expand side navigation' : 'Collapse side navigation'}
                aria-expanded={!desktopSidebarCollapsed}
                aria-controls="teacher-primary-navigation"
                title={desktopSidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
              >
                <span className="teacher-sidebar-toggle__icon" aria-hidden="true">{desktopSidebarCollapsed ? '›' : '‹'}</span>
                <span>{desktopSidebarCollapsed ? 'Expand' : 'Collapse'}</span>
              </button>
              <div id="teacher-primary-navigation" className="teacher-nav-grid teacher-nav-grid--sidebar">
                {navTabs.map((tab) => {
                  const { isPilot, quota: tq, pilotExhausted, locked } = getNavTabState(tab);
                  return (
                    <button
                      key={tab.id}
                      onClick={() => { if (!locked) changeSection(tab.id); }}
                      disabled={locked}
                      className={`teacher-nav-btn ${primarySection === tab.id ? 'active' : ''} ${locked ? 'teacher-nav-locked' : ''} ${tab.highlight ? 'teacher-nav-btn--highlight' : ''}`}
                      title={desktopSidebarCollapsed ? tab.label : undefined}
                      aria-label={tab.label}
                      aria-current={primarySection === tab.id ? 'page' : undefined}
                      data-label={tab.label}
                    >
                      <span className="teacher-nav-icon">{tab.icon}</span>
                      <div className="teacher-nav-text">
                        <span className="teacher-nav-label">
                          {tab.label}
                          {locked && !isPilot && <span className="teacher-nav-pro-tag">PRO</span>}
                          {pilotExhausted && <span className="teacher-nav-pro-tag" style={{ background: 'linear-gradient(135deg, #ef4444, #f97316)' }}>⚡ UPGRADE</span>}
                          {isPilot && tq && !tq.exhausted && <span className="teacher-nav-pro-tag" style={{ background: 'linear-gradient(135deg, #06b6d4, #3b82f6)' }}>{tq.remaining}/{tq.limit}</span>}
                        </span>
                        <span className="teacher-nav-desc">{tab.description}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          {/* Main Content Panel */}
          <div className="teacher-main-panel min-h-0">
          {view === 'dashboard' && renderDashboard()}
          {view === 'students' && renderStudents()}
          {view === 'create-question' && renderCreateQuestion()}
          {view === 'question-bank' && (
            <QuestionBank
              questions={questions}
              teacher={teacher}
              onUseSet={handleUseQuestionSet}
              onEditQuestion={handleEditQuestion}
              onDeleteQuestion={handleDeleteQuestion}
              onCreateQuestion={openMyPoolQuestionForm}
              onRenameTopic={(topicQuestions, nextTopic) => { void handleRenameTopic(topicQuestions, nextTopic); }}
              onDeleteTopic={(topicQuestions) => { void handleDeleteTopic(topicQuestions); }}
              restrictedSubjects={profile.school_id && teacherAssignedSubjects.length ? teacherAssignedSubjects : undefined}
              schoolName={resolvedBranding.schoolName}
              schoolLogoUrl={resolvedBranding.schoolLogoUrl}
              teacherName={profile.full_name || profile.username || 'Teacher'}
              schoolId={profile.school_id}
            />
          )}
          {view === 'csv-upload' && renderCSVUpload()}
          {view === 'assignments' && renderAssignments()}
          {view === 'create-assignment' && renderCreateAssignment()}
          {view === 'reports' && renderReports()}
          {view === 'documents' && profile.school_id && <SchoolDocumentCenter schoolId={profile.school_id} />}
          {view === 'writing-hub' && canAccessWritingInsights && (
            <section className="teacher-writing-hub" aria-labelledby="writing-hub-title">
              <div className="teacher-writing-hub__header">
                <div>
                  <span className="teacher-writing-hub__eyebrow">Writing workspace</span>
                  <h2 id="writing-hub-title">✍️ Writing Hub</h2>
                  <p>Follow student progress, understand class patterns, and prepare reports in one place.</p>
                </div>
                <div className="teacher-writing-hub__tabs" role="tablist" aria-label="Writing Hub sections">
                  {([
                    ['monitor', '📝', 'Monitor'],
                    ['analytics', '📈', 'Analytics'],
                    ['reports', '📤', 'Reports'],
                  ] as const).map(([section, icon, label]) => (
                    <button
                      key={section}
                      type="button"
                      role="tab"
                      aria-selected={writingHubSection === section}
                      className={writingHubSection === section ? 'is-active' : ''}
                      onClick={() => setWritingHubSection(section)}
                    >
                      <span aria-hidden="true">{icon}</span>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="teacher-writing-hub__content">
                {writingHubSection === 'monitor' && <WritingMonitoringView filterQuery={writingHubFilterQuery} />}
                {writingHubSection === 'analytics' && (
                  <WritingAnalyticsDashboard
                    onNavigate={(path) => {
                      const [, query = ''] = path.split('?');
                      setWritingHubFilterQuery(query ? `?${query}` : '');
                      setWritingHubSection('monitor');
                    }}
                  />
                )}
                {writingHubSection === 'reports' && <WritingExportCenter mode="teacher" />}
              </div>
            </section>
          )}
          {view === 'clan-wars' && (
            <React.Suspense fallback={<div className="teacher-section-loading">Preparing Clan Wars…</div>}>
              <ClanTerritoryManager
                onExit={() => setView('dashboard')}
                isTeacher
                canHost
                playerName={profile.username || 'Teacher'}
                clanId={profile.clan_id}
                clanName={profile.clan_name}
                assignedClasses={assignedClasses}
              />
            </React.Suspense>
          )}
          {view === 'report-detail' && renderReportDetail()}
          {view === 'report-analysis' && renderReportAnalysis()}
          {view === 'collective-report' && (
            <CollectiveAssignmentReport
              assignments={assignments}
              students={availableStudents}
              school={{ id: profile.school_id, name: profile.school_name || teacher?.school_name || 'School', logoUrl: profile.school_logo_url }}
              teacherName={profile.full_name || profile.username || 'Teacher'}
              onBack={() => setView('reports')}
              onViewAssignment={(a) => handleOpenReport(a)}
            />
          )}
          {view === 'cambridge-reports' && renderCambridgeReports()}
          {view === 'join-school' && (
            <JoinSchoolCard onJoined={() => window.location.reload()} initialRole="teacher" />
          )}
          {view === 'geometry-diagrams' && teacher && (
            <DiagramBuilder
              teacherId={teacher!.id}
              onComplete={() => setView('dashboard')}
              schoolName={resolvedBranding.schoolName}
              schoolLogoUrl={resolvedBranding.schoolLogoUrl}
              teacherName={profile.full_name || profile.username || 'Teacher'}
              schoolId={profile.school_id}
            />
          )}
          </div>
        </div>

        <nav ref={mobileNavigationRef} className="teacher-mobile-bottom-nav" onFocus={revealMobileNavigation} aria-label="Teacher workspace">
          <button
            type="button"
            className="smart-mobile-nav-reveal"
            onClick={revealMobileNavigation}
            aria-label="Show teacher navigation"
          >
            <span aria-hidden="true" />
          </button>
          {mobilePrimaryTabs.map((tab) => {
            const { locked } = getNavTabState(tab);
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => { if (!locked) changeSection(tab.id); }}
                disabled={locked}
                className={primarySection === tab.id ? 'is-active' : ''}
                aria-current={primarySection === tab.id ? 'page' : undefined}
                aria-label={tab.label}
              >
                <span aria-hidden="true">{tab.icon}</span>
                <small>{tab.label === 'My Classes' ? 'Classes' : tab.label}</small>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              revealMobileNavigation();
              setMobileWorkspaceMenuOpen(true);
            }}
            className={!mobilePrimaryTabs.some((tab) => tab.id === primarySection) ? 'is-active' : ''}
            aria-expanded={mobileWorkspaceMenuOpen}
            aria-label="More"
          >
            <span aria-hidden="true">•••</span>
            <small>More</small>
          </button>
        </nav>
      </div>

      {mobileWorkspaceMenuOpen && createPortal(
        <div className="teacher-mobile-menu-layer" role="dialog" aria-modal="true" aria-labelledby="teacher-mobile-menu-title">
          <button
            type="button"
            className="teacher-mobile-menu-backdrop"
            onClick={() => setMobileWorkspaceMenuOpen(false)}
            aria-label="Close workspace menu"
          />
          <div className="teacher-mobile-menu-sheet">
            <div className="teacher-mobile-menu-heading">
              <div>
                <p>Teacher workspace</p>
                <h2 id="teacher-mobile-menu-title">All tools</h2>
              </div>
              <button type="button" onClick={() => setMobileWorkspaceMenuOpen(false)} aria-label="Close workspace menu">×</button>
            </div>
            <div className="teacher-mobile-menu-grid">
              {navTabs.map((tab) => {
                const { isPilot, quota, pilotExhausted, locked } = getNavTabState(tab);
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => { if (!locked) changeSection(tab.id); }}
                    disabled={locked}
                    className={primarySection === tab.id ? 'is-active' : ''}
                  >
                    <span className="teacher-mobile-menu-icon" aria-hidden="true">{tab.icon}</span>
                    <span className="teacher-mobile-menu-copy">
                      <strong>{tab.label}</strong>
                      <small>{tab.description}</small>
                    </span>
                    {locked && !isPilot && <em>PRO</em>}
                    {pilotExhausted && <em>Upgrade</em>}
                    {isPilot && quota && !quota.exhausted && <em>{quota.remaining}/{quota.limit}</em>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};


// ============================================================================
// TeacherPlanBanner — shows school plan status to teachers
// ============================================================================

const TeacherPlanBanner: React.FC<{
  isSchoolAdmin?: boolean;
  onOpenSchoolAdmin?: () => void;
}> = ({ isSchoolAdmin, onOpenSchoolAdmin }) => {
  const [details, setDetails] = useState<SchoolPlanDetails | null>(_cachedPlanDetails);

  useEffect(() => {
    if (!details) {
      fetchSchoolPlanDetails().then(d => {
        _cachedPlanDetails = d;
        setDetails(d);
      }).catch(() => {});
    }
  }, []);

  if (!details) return null;

  const { plan, is_active, trial_expired, trial_ends_at } = details;

  // Don't show banner for active paid plans — everything works
  if (['core', 'standard', 'pro', 'enterprise'].includes(plan)) return null;

  // Active pilot — show countdown
  if (plan === 'pilot' && is_active && trial_ends_at) {
    const daysLeft = Math.max(0, Math.ceil(
      (new Date(trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    ));
    // Teachers already see the active plan in the persistent top bar. Keep this
    // second banner only when it provides the school admin with a billing action.
    if (!isSchoolAdmin || !onOpenSchoolAdmin) return null;
    return (
      <div className="teacher-plan-callout mx-4 my-2 rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm text-cyan-200">
          🚀 <strong>Pilot Trial</strong> — {daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining.
          {' '}All features unlocked.
        </span>
        {isSchoolAdmin && onOpenSchoolAdmin && (
          <button
            onClick={onOpenSchoolAdmin}
            className="text-xs font-semibold text-cyan-300 hover:text-cyan-200 transition-colors"
          >
            Upgrade to keep access →
          </button>
        )}
      </div>
    );
  }

  // Expired pilot
  if (trial_expired) {
    return (
      <div className="mx-4 my-2 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm text-red-200">
          ⏰ <strong>Pilot trial expired.</strong> Some features are now locked.
        </span>
        {isSchoolAdmin && onOpenSchoolAdmin ? (
          <button
            onClick={onOpenSchoolAdmin}
            className="text-xs font-semibold text-red-300 hover:text-red-200 transition-colors"
          >
            Subscribe to restore access →
          </button>
        ) : (
          <span className="text-xs text-red-400">Ask your school admin to subscribe.</span>
        )}
      </div>
    );
  }

  // No plan (free lockdown only)
  if (plan === 'none') {
    return (
      <div className="mx-4 my-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm text-amber-200">
          🔓 <strong>Free plan</strong> — Lockdown mode only.
          {' '}Upgrade to unlock Cambridge tests, IELTS, assignments & more.
        </span>
        {isSchoolAdmin && onOpenSchoolAdmin ? (
          <button
            onClick={onOpenSchoolAdmin}
            className="text-xs font-semibold text-amber-300 hover:text-amber-200 transition-colors"
          >
            View plans →
          </button>
        ) : (
          <span className="text-xs text-amber-400">Ask your school admin about upgrading.</span>
        )}
      </div>
    );
  }

  return null;
};


export default TeacherPortal;
