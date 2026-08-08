Warning: truncated output (original token count: 112458)
Total output lines: 8926

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
import CollapsedNavTooltip from './CollapsedNavTooltip';
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
const TEACHER_MOBILE_NAV_QUERY = '(max-width: 1024px)';

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
  const [navTooltip, setNavTooltip] = useState<{ label: string; anchor: HTMLElement } | null>(null);
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
  } = useSmartCollapsedNavigation(view, TEACHER_MOBILE_NAV_QUERY);

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
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
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
      structureIssues.push('Your text doesn\'t end with proper punctuation. Always finish with a period (.), question mark (?)…62458 tokens truncated…size/style attrs before applying our safe defaults
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
    profile.role === 'admin' || teachesEnglish;

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
                      onMouseEnter={(event) => desktopSidebarCollapsed && setNavTooltip({ label: tab.label, anchor: event.currentTarget })}
                      onMouseLeave={() => setNavTooltip(null)}
                      onFocus={(event) => desktopSidebarCollapsed && setNavTooltip({ label: tab.label, anchor: event.currentTarget })}
                      onBlur={() => setNavTooltip(null)}
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
          {view === 'documents' && profile.school_id && <SchoolDocumentCenter schoolId={profile.school_id} mode="teacher" />}
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
                <small>{tab.id === 'dashboard' ? 'Home' : tab.id === 'students' ? 'Classes' : tab.id === 'assignments' ? 'Tasks' : tab.label}</small>
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
      {navTooltip && <CollapsedNavTooltip label={navTooltip.label} anchor={navTooltip.anchor} />}
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
