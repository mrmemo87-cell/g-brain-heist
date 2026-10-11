import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import DOMPurify from 'dompurify';
import { Profile, TeacherQuestion, Teacher, Subject, QuestionDifficulty, QuestionType, TeacherAssignmentSummary, TeacherAssignmentReportRow, StudentForAssignment, QuestionOption, StudentAssignmentAnswer, AssignmentQuestionAnalysis, AssignmentBatch, AssignmentCategory } from '../types';
import * as GameService from '../services/gameService';
import * as AuthService from '../services/authService';
import * as SchoolAdminService from '../services/schoolAdminService';
import {
  fetchTeacherTeachingGroupRoster,
  fetchTeacherTeachingGroups,
  type SchoolSubjectGroup,
  type SubjectGroupRosterStudent,
} from '../services/schoolSubjectGroupService';
import { supabase } from '../services/supabaseClient';
import { getAcademicReportingContext, type AcademicReportingYear } from '../services/academicReportingService';
import { fetchTeacherAssignmentDiagnosticIntelligence, type TeacherAssignmentDiagnosticIntelligence } from '../services/teacherDiagnosticService';
import type { PreparedDiagnostic } from '../services/diagnosticComposerService';
import { useAssignmentQuestionSelection } from '../src/hooks/useAssignmentQuestionSelection';
import BackButton from './BackButton';
import SettingsModal from './SettingsModal';
import CollapsedNavTooltip from './CollapsedNavTooltip';
const TeacherGuideHelpModal = React.lazy(() => import('./TeacherGuideHelpModal'));
import { NotificationCenter } from './NotificationCenter';
const DiagramBuilder = React.lazy(() => import('./geometry/DiagramBuilder'));
const QuestionBank = React.lazy(() => import('./teacher/QuestionBank'));
const QuestionBatchWorkspace = React.lazy(() => import('./teacher/QuestionBatchWorkspace'));
const PaperAssignmentWorkspace = React.lazy(() => import('./teacher/PaperAssignmentWorkspace'));
const AssignmentWizard = React.lazy(() => import('./teacher/AssignmentWizard'));
const DiagnosticComposer = React.lazy(() => import('./teacher/DiagnosticComposer'));
import DiagnosticIntelligencePanel, { DiagnosticStudentSkillMap } from './teacher/DiagnosticIntelligencePanel';
import AssignmentCard from './teacher/AssignmentCard';
import JoinSchoolCard from './JoinSchoolCard';
import '../src/styles/teacher-theme.css';
import { brainsAlert, brainsConfirm } from '../src/utils/brainsAlert';
import { chemistryAnswerKeys, chemistryQuestionRanges } from './chemistryAnswerKeys';
import { buildBiologyAnswerKeyFromSavedMetadata, isBiologyCambridgeQuiz } from './biologyReviewAnswerKey';
import type { QuestionData } from './cambridgeQuestionData';
import {
  CAMBRIDGE_LISTENING_TEST_1_ANSWER_KEY,
  CAMBRIDGE_LISTENING_TEST_1_QUESTIONS,
  CAMBRIDGE_LISTENING_TEST_1_SECTIONS,
  getPrimaryCambridgeAnswer,
  isCambridgeAnswerCorrect,
  parseCambridgeResponses,
  type CambridgeExpectedAnswer,
} from './cambridgeListeningReview';
import { fetchSchoolPlanDetails, fetchPilotQuotas, getQuotaForFeature, QUOTA_LABELS, FEATURE_TO_QUOTA, tryConsumePilotQuota, type SchoolPlanDetails, type PilotQuotaStatus, type PilotQuota } from '../services/tierService';
import { FEATURE_KEYS, getEntitlements, type EntitlementSet, type FeatureKey } from '../services/entitlementService';
import ProfessionalCambridgeReport, { generateSerialNumber, StudentOverviewReport, getGradeFromPercentage } from './ProfessionalCambridgeReport';
import type { ProfessionalReportData, StudentOverviewReportData, StudentTestEntry } from './ProfessionalCambridgeReport';
const CollectiveAssignmentReport = React.lazy(() => import('./CollectiveAssignmentReport'));
import { notificationService } from '../services/notificationService';
const WritingMonitoringView = React.lazy(() => import('../src/pages/writing/WritingMonitoringView'));
const WritingAnalyticsDashboard = React.lazy(() => import('../src/pages/writing/WritingAnalyticsDashboard'));
const WritingExportCenter = React.lazy(() => import('../src/pages/writing/WritingExportCenter'));
const TeacherAcademicProfilesPage = React.lazy(() => import('./student-progress/TeacherAcademicProfilesPage'));
const TeacherCurriculumIntelligencePage = React.lazy(() => import('./teacher/TeacherCurriculumIntelligencePage'));
const TeacherInterventionIntelligencePage = React.lazy(() => import('./student-progress/TeacherInterventionIntelligencePage'));
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
import {
  parseTeacherQuestionImport,
  TEACHER_QUESTION_IMPORT_TEMPLATE,
  type TeacherQuestionImportPreview,
} from '../src/lib/teacherQuestionBulkImport';

import { ProfileIcon } from './student-progress/AcademicProfilePremium';
import { useIeltsTeacherProgrammeEntry } from '../src/hooks/useIeltsTeacherProgrammeEntry';
import TeacherIeltsProgrammeShortcut, { IeltsProgrammeIcon } from './teacher/TeacherIeltsProgrammeShortcut';
import { teacherProgrammeRoute } from '../services/ieltsTeacherProgrammeEntry';

interface TeacherPortalProps {
  profile: Profile;
  onComplete: () => void;
  onLogout?: () => void;
  onLockdown?: () => void;
  isSchoolAdmin?: boolean;
  onOpenSchoolAdmin?: () => void;
  initialView?: PortalView;
  academicProfilePresentation?: boolean;
  onAssignmentSummary?: (summary: GameService.TeacherAssignmentSuccessSummary | null) => void;
}

// Plan details state (fetched once)
let _cachedPlanDetails: SchoolPlanDetails | null = null;

export type PortalView = 'dashboard' | 'students' | 'create-question' | 'question-bank' | 'question-batch' | 'csv-upload' | 'assignments' | 'create-assignment' | 'reports' | 'report-detail' | 'report-analysis' | 'collective-report' | 'academic-profiles' | 'curriculum-intelligence' | 'interventions' | 'documents' | 'writing-hub' | 'writing-monitoring' | 'writing-analytics' | 'writing-export-center' | 'clan-wars' | 'geometry-diagrams' | 'cambridge-reports' | 'join-school';
type TeacherNavSection = 'dashboard' | 'students' | 'questions' | 'assignments' | 'reports' | 'academic-profiles' | 'curriculum-intelligence' | 'interventions' | 'writing-hub' | 'cambridge' | 'clan-wars' | 'join-school' | 'ielts-programme';
type WritingHubSection = 'monitor' | 'analytics' | 'reports';

const TEACHER_VIEW_FEATURES: Partial<Record<PortalView, FeatureKey>> = {
  'create-question': FEATURE_KEYS.CUSTOM_QUESTIONS,
  'question-bank': FEATURE_KEYS.QUESTION_BANK,
  'question-batch': FEATURE_KEYS.CUSTOM_QUESTIONS,
  'csv-upload': FEATURE_KEYS.CUSTOM_QUESTIONS,
  assignments: FEATURE_KEYS.ASSIGNMENTS,
  'create-assignment': FEATURE_KEYS.ASSIGNMENTS,
  reports: FEATURE_KEYS.REPORTS,
  'report-detail': FEATURE_KEYS.REPORTS,
  'report-analysis': FEATURE_KEYS.REPORTS,
  'collective-report': FEATURE_KEYS.REPORTS,
  'academic-profiles': FEATURE_KEYS.REPORTS,
  'curriculum-intelligence': FEATURE_KEYS.REPORTS,
  interventions: FEATURE_KEYS.REPORTS,
  'writing-hub': FEATURE_KEYS.WRITING_HUB,
  'writing-monitoring': FEATURE_KEYS.WRITING_HUB,
  'writing-analytics': FEATURE_KEYS.WRITING_HUB,
  'writing-export-center': FEATURE_KEYS.WRITING_HUB,
  'clan-wars': FEATURE_KEYS.CLANS,
  'geometry-diagrams': FEATURE_KEYS.CUSTOM_QUESTIONS,
  'cambridge-reports': FEATURE_KEYS.CAMBRIDGE_TESTS,
};

const TEACHER_SECTION_FEATURES: Partial<Record<TeacherNavSection, FeatureKey>> = {
  questions: FEATURE_KEYS.QUESTION_BANK,
  assignments: FEATURE_KEYS.ASSIGNMENTS,
  reports: FEATURE_KEYS.REPORTS,
  'academic-profiles': FEATURE_KEYS.REPORTS,
  'curriculum-intelligence': FEATURE_KEYS.REPORTS,
  interventions: FEATURE_KEYS.REPORTS,
  'writing-hub': FEATURE_KEYS.WRITING_HUB,
  cambridge: FEATURE_KEYS.CAMBRIDGE_TESTS,
  'clan-wars': FEATURE_KEYS.CLANS,
};

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

const TeacherPortal: React.FC<TeacherPortalProps> = ({ profile, onComplete, onLogout, onLockdown, isSchoolAdmin, onOpenSchoolAdmin, initialView = 'dashboard', onAssignmentSummary, academicProfilePresentation = false }) => {
  const ieltsProgramme = useIeltsTeacherProgrammeEntry(profile.id, profile.role, profile.school_id);
  const resolvedBranding = useSchoolBranding({ schoolId: profile.school_id, schoolName: profile.school_name, schoolLogoUrl: profile.school_logo_url });
  const schoolBrand = createSchoolBrand({ schoolId: profile.school_id, ...resolvedBranding });
  const initialWritingSection: WritingHubSection =
    initialView === 'writing-analytics' ? 'analytics' :
      initialView === 'writing-export-center' ? 'reports' :
        'monitor';
  const normalizedInitialView: PortalView =
    initialView === 'documents'
      ? 'dashboard'
      : ['writing-monitoring', 'writing-analytics', 'writing-export-center'].includes(initialView)
        ? 'writing-hub'
        : initialView;
  const [view, setView] = useState<PortalView>(normalizedInitialView);
  const [writingHubSection, setWritingHubSection] = useState<WritingHubSection>(initialWritingSection);
  const [writingHubFilterQuery, setWritingHubFilterQuery] = useState('');
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [questions, setQuestions] = useState<TeacherQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const initCalledRef = useRef(false);
  const [questionBankRevision, setQuestionBankRevision] = useState(0);
  const mergeLoadedQuestions = useCallback((loaded: TeacherQuestion[]) => {
    setQuestions((current) => [...new Map([...current, ...loaded].map((q) => [q.id, q])).values()]);
  }, []);
  const reportLoadRequestRef = useRef(0);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [bulkImportPreview, setBulkImportPreview] = useState<TeacherQuestionImportPreview | null>(null);
  const [bulkImportSource, setBulkImportSource] = useState('');
  const [bulkPasteText, setBulkPasteText] = useState('');
  const [editingQuestion, setEditingQuestion] = useState<TeacherQuestion | null>(null);
  const [effectiveEntitlements, setEffectiveEntitlements] = useState<EntitlementSet | null>(null);
  const [pilotQuotas, setPilotQuotas] = useState<PilotQuotaStatus | null>(null);
  const [questionSearchTerm, setQuestionSearchTerm] = useState('');
  const [questionSubjectFilter, setQuestionSubjectFilter] = useState<'all' | Subject>('all');
  const [questionTopicFilter, setQuestionTopicFilter] = useState<string>('all');
  const [questionDifficultyFilter, setQuestionDifficultyFilter] = useState<'all' | QuestionDifficulty>('all');
  const [questionTypeFilter, setQuestionTypeFilter] = useState<'all' | 'multiple_choice' | 'true_false' | 'short_answer'>('all');

  // Teacher class allocation state
  const [allocatedClasses, setAllocatedClasses] = useState<SchoolAdminService.TeacherAllocatedClass[]>([]);
  const [teachingGroups, setTeachingGroups] = useState<SchoolSubjectGroup[]>([]);
  const [teachingGroupRosters, setTeachingGroupRosters] = useState<Record<string, SubjectGroupRosterStudent[]>>({});
  const [teacherHasClassAllocations, setTeacherHasClassAllocations] = useState(false);
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
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
  }, [view]);

  const canUseTeacherFeature = useCallback((featureKey: FeatureKey) => (
    effectiveEntitlements?.canUse(featureKey) === true
  ), [effectiveEntitlements]);

  const showFeatureUnavailable = useCallback((label: string) => {
    brainsAlert(`${label} is not included in this school's current plan. Ask the school administrator to start the Pilot or upgrade.`, 'info');
  }, []);

  const openEntitledView = useCallback((targetView: PortalView, label: string) => {
    const featureKey = TEACHER_VIEW_FEATURES[targetView];
    if (featureKey && !canUseTeacherFeature(featureKey)) {
      showFeatureUnavailable(label);
      return false;
    }
    setView(targetView);
    return true;
  }, [canUseTeacherFeature, showFeatureUnavailable]);

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
  const [eligibleGradeLevels, setEligibleGradeLevels] = useState<number[]>([]);
  const [manualRegistryLeaves, setManualRegistryLeaves] = useState<GameService.TeacherAcademicSkillRegistryLeaf[]>([]);
  const [manualRegistryVersion, setManualRegistryVersion] = useState('');
  const [manualRegistryPhase, setManualRegistryPhase] = useState('');
  const [manualRegistryProgrammes, setManualRegistryProgrammes] = useState<Array<{ code: string; name: string }>>([]);
  const [manualRegistrySupported, setManualRegistrySupported] = useState<boolean | null>(null);
  const [manualRegistryLoading, setManualRegistryLoading] = useState(false);
  const [manualStrandCode, setManualStrandCode] = useState('');
  const [manualPrimarySkillCode, setManualPrimarySkillCode] = useState('');
  const [manualAtomicSubskillCode, setManualAtomicSubskillCode] = useState('');
  const [manualEvidenceFocuses, setManualEvidenceFocuses] = useState<GameService.TeacherAcademicEvidenceFocus[]>([]);
  const [manualEvidenceFocusCode, setManualEvidenceFocusCode] = useState('');
  const [manualEvidenceFocusLoading, setManualEvidenceFocusLoading] = useState(false);
  const [submitForAcademicVerification, setSubmitForAcademicVerification] = useState(false);
  const [questionBatchDefaults, setQuestionBatchDefaults] = useState<{ subject?: Subject; topic?: string }>({});

  const manualRegistryStrands = useMemo(() => {
    const seen = new Map<string, string>();
    manualRegistryLeaves.forEach((leaf) => {
      if (!seen.has(leaf.strandCode)) seen.set(leaf.strandCode, leaf.strandName);
    });
    return [...seen.entries()]
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [manualRegistryLeaves]);

  const manualRegistryPrimarySkills = useMemo(() => {
    const seen = new Map<string, { code: string; name: string; strandName: string; strandCode: string; description?: string }>();
    manualRegistryLeaves
      .filter((leaf) => !manualStrandCode || leaf.strandCode === manualStrandCode)
      .forEach((leaf) => {
        if (!seen.has(leaf.skillCode)) {
          seen.set(leaf.skillCode, {
            code: leaf.skillCode,
            name: leaf.skillName,
            strandName: leaf.strandName,
            strandCode: leaf.strandCode,
            description: leaf.skillDescription,
          });
        }
      });
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [manualRegistryLeaves, manualStrandCode]);

  const selectedManualRegistrySkill = useMemo(
    () => manualRegistryPrimarySkills.find((skill) => skill.code === manualPrimarySkillCode) || null,
    [manualPrimarySkillCode, manualRegistryPrimarySkills],
  );

  const manualRegistrySubskills = useMemo(
    () => manualRegistryLeaves
      .filter((leaf) => leaf.skillCode === manualPrimarySkillCode)
      .sort((a, b) => a.subskillName.localeCompare(b.subskillName)),
    [manualPrimarySkillCode, manualRegistryLeaves],
  );

  const selectedManualRegistryLeaf = useMemo(
    () => manualRegistryLeaves.find((leaf) => leaf.subskillCode === manualAtomicSubskillCode) || null,
    [manualAtomicSubskillCode, manualRegistryLeaves],
  );

  const selectedManualEvidenceFocus = useMemo(
    () => manualEvidenceFocuses.find((focus) => focus.code === manualEvidenceFocusCode) || null,
    [manualEvidenceFocusCode, manualEvidenceFocuses],
  );

  useEffect(() => {
    let cancelled = false;
    setManualRegistryLeaves([]);
    setManualRegistryVersion('');
    setManualRegistryPhase('');
    setManualRegistryProgrammes([]);
    setManualRegistrySupported(null);
    setManualRegistryLoading(false);
    setManualStrandCode('');
    setManualPrimarySkillCode('');
    setManualAtomicSubskillCode('');
    setManualEvidenceFocuses([]);
    setManualEvidenceFocusCode('');
    setManualEvidenceFocusLoading(false);
    setSubmitForAcademicVerification(false);

    if (eligibleGradeLevels.length !== 1) return () => { cancelled = true; };

    setManualRegistryLoading(true);
    void GameService.get_teacher_academic_skill_registry(subject, eligibleGradeLevels[0])
      .then((registry) => {
        if (cancelled) return;
        setManualRegistrySupported(registry.supported);
        setManualRegistryLeaves(registry.skills || []);
        setManualRegistryVersion(registry.registryVersion || '');
        setManualRegistryPhase(registry.phase || '');
        setManualRegistryProgrammes(registry.cambridgeProgrammes || []);
      })
      .catch((registryError) => {
        if (!cancelled) {
          console.warn('Academic Skill Registry could not be loaded for manual question creation:', registryError);
          setManualRegistrySupported(false);
        }
      })
      .finally(() => { if (!cancelled) setManualRegistryLoading(false); });

    return () => { cancelled = true; };
  }, [subject, eligibleGradeLevels]);

  useEffect(() => {
    let cancelled = false;
    setManualEvidenceFocuses([]);
    setManualEvidenceFocusCode('');
    setSubmitForAcademicVerification(false);

    if (
      eligibleGradeLevels.length !== 1
      || !manualRegistrySupported
      || !manualAtomicSubskillCode
    ) {
      setManualEvidenceFocusLoading(false);
      return () => { cancelled = true; };
    }

    setManualEvidenceFocusLoading(true);
    void GameService.get_teacher_academic_evidence_focuses(
      subject,
      eligibleGradeLevels[0],
      manualAtomicSubskillCode,
    )
      .then((focuses) => {
        if (cancelled) return;
        setManualEvidenceFocuses(focuses);
        if (focuses.length === 1) setManualEvidenceFocusCode(focuses[0].code);
      })
      .catch((focusError) => {
        if (!cancelled) {
          console.warn('Evidence Focus catalogue could not be loaded for manual question creation:', focusError);
          setManualEvidenceFocuses([]);
        }
      })
      .finally(() => {
        if (!cancelled) setManualEvidenceFocusLoading(false);
      });

    return () => { cancelled = true; };
  }, [subject, eligibleGradeLevels, manualRegistrySupported, manualAtomicSubskillCode]);

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
  const [reportAcademicYears, setReportAcademicYears] = useState<AcademicReportingYear[]>([]);
  const [reportAcademicYearId, setReportAcademicYearId] = useState('');
  const [reportAssignments, setReportAssignments] = useState<TeacherAssignmentSummary[]>([]);
  const [reportAssignmentsLoading, setReportAssignmentsLoading] = useState(false);
  const [deletingAssignmentId, setDeletingAssignmentId] = useState<string | null>(null);
  const [printingAssignmentId, setPrintingAssignmentId] = useState<string | null>(null);
  const [editingAssignment, setEditingAssignment] = useState<TeacherAssignmentSummary | null>(null);
  const [assignmentPublishStatus, setAssignmentPublishStatus] = useState<'draft' | 'scheduled' | 'published'>('published');
  const [assignmentCategory, setAssignmentCategory] = useState<AssignmentCategory | null>(null);
  const [assignmentCloseAfterDue, setAssignmentCloseAfterDue] = useState(false);
  const [assignmentNotifyByEmail, setAssignmentNotifyByEmail] = useState(false);
  const [assignmentSuccess, setAssignmentSuccess] = useState<GameService.TeacherAssignmentSuccessSummary | null>(null);
  const [paperWorkspaceMode, setPaperWorkspaceMode] = useState<"manual" | "scan">("manual");
  const [paperAssignment, setPaperAssignment] = useState<TeacherAssignmentSummary | null>(null);
  const [assignmentDelivery, setAssignmentDelivery] = useState<'online' | 'paper' | 'mixed'>('online');
  const [assignmentMode, setAssignmentMode] = useState<'batch' | 'custom'>('batch');
  const [assignmentBatches, setAssignmentBatches] = useState<string[]>([]);
  const [assignmentGroupId, setAssignmentGroupId] = useState('');
  const { assignmentSubject, setAssignmentSubject, assignmentQuestionIds,
    setAssignmentQuestionIds, chooseAssignmentSubject } = useAssignmentQuestionSelection();
  const [assignmentLockedSubject, setAssignmentLockedSubject] = useState<string | null>(null);
  const [preparedDiagnostic, setPreparedDiagnostic] = useState<PreparedDiagnostic | null>(null);
  const [diagnosticComposerOpen, setDiagnosticComposerOpen] = useState(false);
  const [diagnosticInitialGroupId, setDiagnosticInitialGroupId] = useState<string | null>(null);
  const [assignmentTopicMode, setAssignmentTopicMode] = useState<'general' | 'custom'>('general');
  const [assignmentTopicName, setAssignmentTopicName] = useState('');
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [assignmentDescription, setAssignmentDescription] = useState('');
  const [assignmentInstructions, setAssignmentInstructions] = useState('');
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

  useEffect(() => {
    if (!teacher || !canUseTeacherFeature(FEATURE_KEYS.REPORTS)) return;
    let cancelled = false;
    void getAcademicReportingContext()
      .then((reportingContext) => {
        if (cancelled) return;
        setReportAcademicYears(reportingContext.years);
        const currentYear = reportingContext.years.find((year) => year.status === 'current') || reportingContext.years[0] || null;
        setReportAcademicYearId((current) => current && reportingContext.years.some((year) => year.id === current)
          ? current
          : currentYear?.id || '');
      })
      .catch((error) => console.error('Error loading report academic years:', error));
    return () => { cancelled = true; };
  }, [teacher?.id, canUseTeacherFeature]);

  useEffect(() => {
    if (!teacher || !reportAcademicYearId) {
      setReportAssignments([]);
      return;
    }
    const selectedYear = reportAcademicYears.find((year) => year.id === reportAcademicYearId) || null;
    if (!selectedYear || selectedYear.status === 'current') {
      setReportAssignments(assignments);
      setReportAssignmentsLoading(false);
      return;
    }

    let cancelled = false;
    setReportAssignments([]);
    setReportAssignmentsLoading(true);
    void supabase.rpc('rpc_get_assignments_for_teacher_for_year', {
      p_teacher_id: teacher.id,
      p_academic_year_id: reportAcademicYearId,
    }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.error('Error loading archived assignment reports:', error);
        setReportAssignments([]);
      } else {
        setReportAssignments((data as TeacherAssignmentSummary[]) || []);
      }
      setReportAssignmentsLoading(false);
    });
    return () => { cancelled = true; };
  }, [teacher?.id, assignments, reportAcademicYearId, reportAcademicYears]);

  const selectedReportAcademicYear = reportAcademicYears.find((year) => year.id === reportAcademicYearId) || null;
  const isArchivedReportYear = Boolean(selectedReportAcademicYear && selectedReportAcademicYear.status !== 'current');

  // Assignment Filtering State (Folder Organization)
  const [assignmentSearchTerm, setAssignmentSearchTerm] = useState('');
  const [assignmentSubjectFilter, setAssignmentSubjectFilter] = useState<'all' | Subject>('all');
  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState<'all' | 'in-progress' | 'completed'>('all');
  const [assignmentClassFilter, setAssignmentClassFilter] = useState<string>('all');

  // Assignment Analysis State
  const [questionAnalysis, setQuestionAnalysis] = useState<AssignmentQuestionAnalysis[]>([]);
  const [questionAnalysisLoading, setQuestionAnalysisLoading] = useState(false);
  const [diagnosticIntelligence, setDiagnosticIntelligence] = useState<TeacherAssignmentDiagnosticIntelligence | null>(null);
  const [diagnosticIntelligenceLoading, setDiagnosticIntelligenceLoading] = useState(false);
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
  const [cambridgeQuestionLookup, setCambridgeQuestionLookup] = useState<typeof import('./cambridgeQuestionData')['getQuestionsForQuiz'] | null>(null);
  const [cambridgeQuestionsError, setCambridgeQuestionsError] = useState(false);
  const [cambridgeQuestionsRetry, setCambridgeQuestionsRetry] = useState(0);
  useEffect(() => {
    if (!showCambridgeAnswers || !selectedCambridgeStudent || cambridgeQuestionLookup) return;
    let cancelled = false; setCambridgeQuestionsError(false);
    void import('./cambridgeQuestionData').then((module) => { if (!cancelled) setCambridgeQuestionLookup(() => module.getQuestionsForQuiz); })
      .catch(() => { if (!cancelled) setCambridgeQuestionsError(true); });
    return () => { cancelled = true; };
  }, [showCambridgeAnswers, selectedCambridgeStudent?.quiz_name, cambridgeQuestionLookup, cambridgeQuestionsRetry]);
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
  const teacherSubjectResourceMap = useMemo(() => {
    const map = new Map<string, string>();
    teachingGroups.forEach((group) => {
      map.set(group.schoolSubjectName, group.academicSubjectName || group.schoolSubjectName);
    });
    allocatedClasses.forEach((item) => {
      if (!map.has(item.subject)) map.set(item.subject, item.academic_subject_name || item.subject);
    });
    return map;
  }, [allocatedClasses, teachingGroups]);

  const assignmentResourceSubject = teacherSubjectResourceMap.get(assignmentSubject) || assignmentSubject;
  const assignmentQuestionPool = useMemo(() => (
    questions.filter((q) => q.subject === assignmentSubject || q.subject === assignmentResourceSubject)
  ), [questions, assignmentSubject, assignmentResourceSubject]);

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

  // Operational identity comes from teaching groups. Legacy class allocations
  // remain a transition fallback until every school has migrated.
  const teacherAssignedSubjects = useMemo(() => {
    const subjects = new Set<string>();
    teachingGroups.forEach((group) => {
      if (group.schoolSubjectName) subjects.add(group.schoolSubjectName);
    });
    allocatedClasses.forEach((cls) => {
      if (cls.subject) subjects.add(cls.subject);
    });
    return Array.from(subjects).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
  }, [allocatedClasses, teachingGroups]);

  const getAssignedGradesForQuestionSubject = useCallback((subjectName: string) => {
    const normalizedSubject = subjectName.trim().toLowerCase();
    const grades = new Set<number>();

    teachingGroups.forEach((group) => {
      if (group.status !== 'active' || group.schoolSubjectName.trim().toLowerCase() !== normalizedSubject) return;
      const grade = Number.parseInt(group.gradeLevel, 10);
      if (Number.isInteger(grade) && grade >= 1 && grade <= 12) grades.add(grade);
    });

    allocatedClasses.forEach((cls) => {
      if (!cls.is_active || cls.subject.trim().toLowerCase() !== normalizedSubject) return;
      if (Number.isInteger(cls.grade_level) && cls.grade_level! >= 1 && cls.grade_level! <= 12) {
        grades.add(cls.grade_level!);
      }
    });

    return [...grades].sort((a, b) => a - b);
  }, [allocatedClasses, teachingGroups]);

  const teacherQuestionAssignedGrades = useMemo(
    () => getAssignedGradesForQuestionSubject(subject),
    [getAssignedGradesForQuestionSubject, subject],
  );

  useEffect(() => {
    if (view !== 'create-question' || editingQuestion || eligibleGradeLevels.length > 0) return;
    if (teacherQuestionAssignedGrades.length === 1) {
      setEligibleGradeLevels([teacherQuestionAssignedGrades[0]]);
    }
  }, [editingQuestion, eligibleGradeLevels.length, teacherQuestionAssignedGrades, view]);

  // Academic mappings unlock resources/capabilities without changing the local
  // subject identity used by groups, assignments, grades and reports.
  const teacherResourceSubjects = useMemo(() => {
    const subjects = new Set<string>();
    teachingGroups.forEach((group) => {
      subjects.add(group.schoolSubjectName);
      if (group.academicSubjectName) subjects.add(group.academicSubjectName);
    });
    teacherAssignedSubjects.forEach((schoolSubject) => {
      subjects.add(schoolSubject);
      const canonical = teacherSubjectResourceMap.get(schoolSubject);
      if (canonical) subjects.add(canonical);
    });
    return Array.from(subjects).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
  }, [teacherAssignedSubjects, teacherSubjectResourceMap, teachingGroups]);

  // A class may appear more than once when a teacher has multiple subject
  // allocations. Keep the Cambridge class picker based on current allocations,
  // rather than only the historical class labels on submissions.
  const allocatedCambridgeClassCodes = useMemo(() => (
    [...new Set(allocatedClasses.map((cls) => cls.class_code).filter(Boolean))].sort()
  ), [allocatedClasses]);

  // Get unique subjects from assignments for folder tabs
  const assignmentSubjects = useMemo(() => {
    const subjects = new Set<string>();
    assignments.forEach(a => {
      if (a.subject_name) subjects.add(a.subject_name);
    });
    return Array.from(subjects).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
  }, [assignments]);

  const assignmentClassFolders = useMemo(() => {
    const labels = new Map<string, string>();
    const rememberClass = (value?: string | null) => {
      const label = value?.trim();
      if (!label || label.toLowerCase() === 'all') return;
      const key = label.toLocaleLowerCase();
      if (!labels.has(key)) labels.set(key, label);
    };

    allocatedClasses.forEach((item) => {
      if (item.is_active) rememberClass(item.class_code);
    });
    assignments.forEach((assignment) => {
      if (assignment.subject_group_name) {
        rememberClass(assignment.subject_group_name);
      } else if (assignment.assignment_mode !== 'custom') {
        rememberClass(assignment.batch);
      }
    });

    return [...labels.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
  }, [allocatedClasses, assignments]);

  const assignmentFolderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    assignments.forEach((assignment) => {
      const groupKey = assignment.subject_group_name?.trim().toLocaleLowerCase();
      if (groupKey) {
        counts.set(groupKey, (counts.get(groupKey) || 0) + 1);
        return;
      }
      if (assignment.assignment_mode === 'custom') {
        counts.set('individual', (counts.get('individual') || 0) + 1);
        return;
      }
      const key = assignment.batch?.trim().toLocaleLowerCase();
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }, [assignments]);

  useEffect(() => {
    if (assignmentClassFilter === 'all' || assignmentClassFilter === 'individual') return;
    const stillAvailable = assignmentClassFolders.some((classCode) => classCode.toLocaleLowerCase() === assignmentClassFilter.toLocaleLowerCase());
    if (!stillAvailable) setAssignmentClassFilter('all');
  }, [assignmentClassFilter, assignmentClassFolders]);

  // Filtered assignments based on class folder, search, subject, and status filters
  const filteredAssignments = useMemo(() => {
    return assignments.filter(a => {
      const assignmentFolder = a.subject_group_name?.trim()
        || (a.assignment_mode === 'custom' ? 'individual' : (a.batch || '').trim());
      if (assignmentClassFilter === 'individual') {
        if (assignmentFolder.toLocaleLowerCase() !== 'individual') return false;
      } else if (assignmentClassFilter !== 'all') {
        if (assignmentFolder.toLocaleLowerCase() !== assignmentClassFilter.trim().toLocaleLowerCase()) return false;
      }
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
  }, [assignments, assignmentClassFilter, assignmentSearchTerm, assignmentSubjectFilter, assignmentStatusFilter]);


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
    if (view === 'academic-profiles') return 'academic-profiles';
    if (view === 'curriculum-intelligence') return 'curriculum-intelligence';
    if (view === 'interventions') return 'interventions';
    if (view === 'documents') return 'dashboard';
    if (view === 'join-school') return 'join-school';
    if (view === 'question-bank' || view === 'create-question' || view === 'question-batch' || view === 'csv-upload') return 'questions';
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

    const requiredFeature = TEACHER_SECTION_FEATURES[section];
    if (requiredFeature && !canUseTeacherFeature(requiredFeature)) {
      showFeatureUnavailable(section.split('-').map((word) => word[0]?.toUpperCase() + word.slice(1)).join(' '));
      return;
    }

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
      case 'ielts-programme':
        if (ieltsProgramme.entry) window.location.assign(teacherProgrammeRoute(ieltsProgramme.entry));
        break;
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
        reportLoadRequestRef.current += 1;
        setReportLoading(false);
        setQuestionAnalysisLoading(false);
        setSelectedReportAssignment(null);
        setAssignmentReport([]);
        setView('reports');
        break;
      case 'academic-profiles':
        setView('academic-profiles');
        break;
      case 'curriculum-intelligence':
        setView('curriculum-intelligence');
        break;
      case 'interventions':
        setView('interventions');
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

    getEntitlements(true).then(setEffectiveEntitlements).catch(() => setEffectiveEntitlements(null));

    // Fetch pilot quotas (non-blocking)
    fetchPilotQuotas().then(q => { if (q) setPilotQuotas(q); }).catch(() => {});
  }, []);

  const canUseWritingModule = !profile.school_id || effectiveEntitlements?.modules.writing === true;
  const canUseCambridgeModule = !profile.school_id || effectiveEntitlements?.modules.cambridge === true;

  useEffect(() => {
    if (!effectiveEntitlements) return;
    const writingView = ['writing-hub', 'writing-monitoring', 'writing-analytics', 'writing-export-center'].includes(view);
    const requiredFeature = TEACHER_VIEW_FEATURES[view];
    if ((requiredFeature && !canUseTeacherFeature(requiredFeature)) || (writingView && !canUseWritingModule) || (view === 'cambridge-reports' && !canUseCambridgeModule)) {
      setView('dashboard');
    }
  }, [canUseCambridgeModule, canUseTeacherFeature, canUseWritingModule, effectiveEntitlements, view]);

  // Default to the first subject in the teacher's allocations.
  useEffect(() => {
    if (teacherAssignedSubjects.length > 0) {
      // Only update if current subject is not in the assigned subjects list
      if (!teacherAssignedSubjects.includes(subject)) {
        setSubject(teacherAssignedSubjects[0] as Subject);
      }
      if (!teacherAssignedSubjects.includes(assignmentSubject)) {
        chooseAssignmentSubject(teacherAssignedSubjects[0] as Subject);
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
      onAssignmentSummary?.(summary);
    } catch (error) {
      console.error('Error loading assignment success:', error);
      setAssignmentSuccess(null);
      onAssignmentSummary?.(null);
    }
  }, [onAssignmentSummary]);

  useEffect(() => {
    if (view === 'dashboard' && canUseTeacherFeature(FEATURE_KEYS.REPORTS)) {
      void loadAssignmentSuccess();
    } else if (view === 'dashboard') {
      setAssignmentSuccess(null);
    }
  }, [canUseTeacherFeature, view, loadAssignmentSuccess]);

  useEffect(() => {
    if (!effectiveEntitlements || !teacher?.id) return;

    // Assignment history is a plan capability. Core class/student visibility is
    // loaded independently during teacher boot.
    if (!canUseTeacherFeature(FEATURE_KEYS.ASSIGNMENTS)) {
      setAssignments([]);
      return;
    }

    void GameService.get_teacher_assignments(teacher.id)
      .then(setAssignments)
      .catch((error) => {
        console.error('Error loading assignments:', error);
        setAssignments([]);
      });
  }, [canUseTeacherFeature, effectiveEntitlements, teacher?.id]);

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
    const lowerSubjects = teacherResourceSubjects.map(s => s.toLowerCase());
    return schoolVisibility.filter(test => {
      const testSubj = (test.subject || '').toLowerCase();
      return lowerSubjects.some(s =>
        testSubj.includes(s) || s.includes(testSubj) || testSubj.includes(s.split(' ')[0])
      );
    });
  }, [schoolVisibility, teacherResourceSubjects]);

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
    ...allocatedCambridgeClassCodes,
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
    const linkingWords = …102356 tokens truncated…rmed={async () => {
                    setScanConfirmed(true);
                    props.onRecorded();
                    await load();
                  }}
                />
              </Suspense>
            ) : (
              <>
                <div className="paw-toolbar">
                  <span className="paw-progress">
                    <strong>
                      {completed}/{packet.students.length}
                    </strong>{" "}
                    completed
                  </span>
                  <button
                    className="paw-button"
                    onClick={() => setMode("scan")}
                  >
                    ▤ Print
                  </button>
                  <button
                    className="paw-button"
                    onClick={() =>
                      openPrintableTeacherAssignment({
                        packet,
                        schoolName: props.schoolName,
                        schoolLogoUrl: props.schoolLogoUrl,
                        teacherName: props.teacherName,
                        markingKey: true,
                      })
                    }
                  >
                    Teacher key
                  </button>
                </div>
                {error ? (
                  <div className="paw-error" role="alert">
                    {error}
                    {closeFailed && canLeave.current() && (
                      <button className="paw-button" onClick={props.onClose}>
                        Close · draft on this device
                      </button>
                    )}
                  </div>
                ) : null}
                <div className="paw-layout">
                  <aside className="paw-roster">
                    <label className="paw-search">
                      <span className="sr-only">Find student</span>
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Find student"
                      />
                    </label>
                    <nav aria-label="Class students">
                      {packet.students
                        .filter((s) =>
                          s.name.toLowerCase().includes(search.toLowerCase()),
                        )
                        .map((s) => (
                          <button
                            key={s.id}
                            aria-current={
                              selected === s.id ? "true" : undefined
                            }
                            className={`paw-student ${selected === s.id ? "is-active" : ""}`}
                            onClick={() => void switchStudent(s.id)}
                          >
                            <span className="paw-avatar" aria-hidden="true">
                              {s.name.slice(0, 1).toUpperCase()}
                            </span>
                            <span>
                              <strong>{s.name}</strong>
                              <small>
                                {s.status === "completed"
                                  ? `${s.source === "paper" ? "Paper" : "Online"} · Completed`
                                  : s.draft
                                    ? "Draft saved"
                                    : s.existingAnswerCount
                                      ? `${s.existingAnswerCount} online answers`
                                      : "Not started"}
                              </small>
                            </span>
                            <span aria-hidden="true">
                              {s.status === "completed" ? "✓" : "›"}
                            </span>
                          </button>
                        ))}
                    </nav>
                    {!packet.students.length && (
                      <p className="paw-empty">No students assigned.</p>
                    )}
                  </aside>
                  <main className="paw-main">
                    {student ? (
                      <PaperStudentEditor
                        key={student.id}
                        packet={packet}
                        student={student}
                        userId={props.userId}
                        flush={flush}
                        canLeave={canLeave}
                        onDraft={(draft) =>
                          setPacket((p) =>
                            p
                              ? {
                                  ...p,
                                  students: p.students.map((s) =>
                                    s.id === student.id ? { ...s, draft } : s,
                                  ),
                                }
                              : p,
                          )
                        }
                        onConfirmed={async () => {
                          props.onRecorded();
                          await load();
                        }}
                      />
                    ) : (
                      <div className="paw-empty">
                        Choose a student to begin.
                      </div>
                    )}
                  </main>
                </div>
              </>
            )}
          </>
        ) : (
          <div className="paw-empty">
            <p role="alert">{error}</p>
            <button className="paw-button" onClick={() => void load()}>
              Try again
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function PaperStudentEditor({
  packet,
  student,
  userId,
  flush,
  canLeave,
  onDraft,
  onConfirmed,
}: {
  packet: PaperWorkspace;
  student: PaperStudent;
  userId: string;
  flush: React.MutableRefObject<() => Promise<void>>;
  canLeave: React.MutableRefObject<() => boolean>;
  onDraft: (draft: NonNullable<PaperStudent["draft"]>) => void;
  onConfirmed: () => Promise<void>;
}) {
  const storageKey = `bh:paper-draft:v1:${userId}:${packet.assignment.id}:${student.id}`;
  const initial = useRef<{
    answers: PaperAnswers;
    assessedAt: string;
    revision: number;
    conflict: boolean;
  } | null>(null);
  if (!initial.current) {
    const draft = student.draft;
    let local: {
      answers: PaperAnswers;
      assessedAt: string;
      revision: number;
      formHash: string;
    } | null = null;
    try {
      local = JSON.parse(localStorage.getItem(storageKey) || "null");
    } catch {
      /* server draft remains usable */
    }
    const compatible =
      local &&
      local.formHash === packet.formHash &&
      local.revision === (draft?.revision || 0) &&
      typeof local.answers === "object" &&
      local.answers !== null &&
      Number.isFinite(Date.parse(local.assessedAt));
    initial.current = {
      answers: compatible
        ? local!.answers
        : draft?.formHash === packet.formHash
          ? draft.answers
          : {},
      assessedAt: compatible
        ? local!.assessedAt
        : draft?.assessedAt || new Date().toISOString(),
      revision: draft?.revision || 0,
      conflict: !!local && !compatible,
    };
  }
  const [answers, setAnswers] = useState(initial.current.answers);
  const [assessedAt, setAssessedAt] = useState(initial.current.assessedAt);
  const [state, setState] = useState<"saved" | "saving" | "local" | "failed">(
    JSON.stringify(initial.current.answers) ===
      JSON.stringify(student.draft?.answers || {})
      ? "saved"
      : "local",
  );
  const [error, setError] = useState(
    initial.current.conflict
      ? "An older device draft was found. The latest school draft is shown."
      : "",
  );
  const [review, setReview] = useState(false);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  busyRef.current = busy;
  const [activeQuestion, setActiveQuestion] = useState(0);
  const revision = useRef(initial.current.revision);
  const latest = useRef({ answers, assessedAt });
  latest.current = { answers, assessedAt };
  const saved = useRef(
    student.draft
      ? JSON.stringify({
          answers: student.draft.answers,
          assessedAt: student.draft.assessedAt,
        })
      : "",
  );
  const chain = useRef<Promise<void>>(Promise.resolve());
  const onDraftRef = useRef(onDraft);
  onDraftRef.current = onDraft;
  const locked = student.status === "completed";
  const supported = supportsPaperEntry(packet.questions);
  const answered = packet.questions.filter((q) =>
    Object.hasOwn(answers, q.questionId),
  ).length;
  const storeLocal = (value: typeof latest.current) => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          ...value,
          revision: revision.current,
          formHash: packet.formHash,
        }),
      );
      return true;
    } catch {
      return false;
    }
  };
  const persist = useCallback(() => {
    const operation = async () => {
      if (locked) return;
      const value = { ...latest.current };
      const fingerprint = JSON.stringify(value);
      if (fingerprint === saved.current || !Object.keys(value.answers).length)
        return;
      setState("saving");
      try {
        const next = await savePaperDraft({
          assignmentId: packet.assignment.id,
          studentId: student.id,
          formHash: packet.formHash,
          ...value,
          revision: revision.current,
        });
        revision.current = next;
        saved.current = fingerprint;
        onDraftRef.current({
          ...value,
          revision: next,
          formHash: packet.formHash,
        });
        if (JSON.stringify(latest.current) === fingerprint) {
          try {
            localStorage.removeItem(storageKey);
          } catch {}
          setState("saved");
        } else {
          storeLocal(latest.current);
          setState("local");
        }
        setError("");
      } catch (cause) {
        setState("failed");
        setError(errorText(cause));
        throw cause;
      }
    };
    const next = chain.current.catch(() => {}).then(operation);
    chain.current = next;
    return next;
  }, [locked, packet.assignment.id, packet.formHash, storageKey, student.id]);
  useEffect(() => {
    flush.current = () =>
      busyRef.current
        ? Promise.reject(new Error("Confirmation is in progress. Please wait."))
        : persist();
    canLeave.current = () => {
      if (busyRef.current) return false;
      if (locked || JSON.stringify(latest.current) === saved.current)
        return true;
      try {
        const value = JSON.parse(localStorage.getItem(storageKey) || "null");
        return (
          value?.formHash === packet.formHash &&
          value?.revision === revision.current &&
          value?.assessedAt === latest.current.assessedAt &&
          JSON.stringify(value?.answers) ===
            JSON.stringify(latest.current.answers)
        );
      } catch {
        return false;
      }
    };
    return () => {
      flush.current = async () => {};
      canLeave.current = () => false;
    };
  }, [flush, canLeave, persist, locked]);
  useEffect(() => {
    if (locked || !Object.keys(answers).length) return;
    const timer = setTimeout(() => {
      void persist().catch(() => {});
    }, 650);
    return () => clearTimeout(timer);
  }, [answers, assessedAt, locked, persist]);
  useEffect(() => {
    const recover = () => {
      void persist().catch(() => {});
    };
    window.addEventListener("online", recover);
    return () => window.removeEventListener("online", recover);
  }, [persist]);
  const change = (id: string, answer: string | null) => {
    const value = {
      answers: { ...latest.current.answers, [id]: answer },
      assessedAt: latest.current.assessedAt,
    };
    latest.current = value;
    setAnswers(value.answers);
    setReview(false);
    setState("local");
    if (!storeLocal(value))
      setError(
        "Device storage is unavailable. Keep this screen open until Saved appears.",
      );
  };
  const dateChange = (value: string) => {
    if (!value || !Number.isFinite(Date.parse(value))) return;
    const next = {
      ...latest.current,
      assessedAt: new Date(value).toISOString(),
    };
    latest.current = next;
    setAssessedAt(next.assessedAt);
    setState("local");
    storeLocal(next);
  };
  useEffect(() => {
    if (locked || review || busy || !supported) return;
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      const current = packet.questions[activeQuestion];
      const index = event.key.toUpperCase().charCodeAt(0) - 65;
      if (
        event.key.length === 1 &&
        index >= 0 &&
        index < paperOptions(current).length
      ) {
        event.preventDefault();
        change(current.questionId, paperOptions(current)[index].text);
      }
    };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, [activeQuestion, locked, review, busy, supported, packet.questions]);
  const question = packet.questions[activeQuestion];
  const finalize = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await persist();
      await confirmPaper({
        assignmentId: packet.assignment.id,
        studentId: student.id,
        formHash: packet.formHash,
        ...latest.current,
        replacePartial: replace,
      });
      try {
        localStorage.removeItem(storageKey);
      } catch {}
      saved.current = JSON.stringify(latest.current);
      await onConfirmed();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="paw-editor-title">
        <div>
          <span className="paw-eyebrow">Student</span>
          <h3>{student.name}</h3>
        </div>
        <span role="status" aria-live="polite" className={`paw-save ${state}`}>
          {locked
            ? "✓ Completed"
            : answered === 0
              ? "Ready"
              : state === "saving"
                ? "Saving…"
                : state === "saved"
                  ? "✓ Saved"
                  : state === "local"
                    ? "On this device"
                    : "Needs attention"}
        </span>
      </div>
      {locked ? (
        <div className="paw-complete">
          <span aria-hidden="true">✓</span>
          <h4>
            {student.source === "paper"
              ? "Paper · Teacher confirmed"
              : "Completed online"}
          </h4>
          <strong>{student.accuracy ?? "—"}%</strong>
          <p>
            {student.completedAt
              ? new Date(student.completedAt).toLocaleDateString()
              : ""}
          </p>
          <small>This result is protected.</small>
        </div>
      ) : !supported ? (
        <div className="paw-empty">
          Paper entry supports multiple choice and true/false with text answer
          choices. You can still print this assignment.
        </div>
      ) : (
        <>
          <label className="paw-date">
            Assessment time
            <input
              type="datetime-local"
              value={localTime(assessedAt)}
              min={localTime(packet.assignment.assignedAt)}
              max={localTime(new Date().toISOString())}
              onChange={(e) => dateChange(e.target.value)}
              disabled={busy}
            />
          </label>
          {error ? (
            <div className="paw-error" role="alert">
              {error}
              {state === "failed" && (
                <button
                  className="paw-button"
                  onClick={() => void persist().catch(() => {})}
                >
                  Retry save
                </button>
              )}
            </div>
          ) : null}
          {review ? (
            <section className="paw-review">
              <span className="paw-eyebrow">Ready to confirm</span>
              <h4>{answered} answers checked</h4>
              <div className="paw-answer-summary">
                {packet.questions.map((q) => (
                  <span key={q.questionId}>
                    <small>{q.orderIndex}</small>
                    <strong>
                      {answers[q.questionId] === null
                        ? "—"
                        : String.fromCharCode(
                            65 +
                              paperOptions(q).findIndex(
                                (o) => o.text === answers[q.questionId],
                              ),
                          )}
                    </strong>
                  </span>
                ))}
              </div>
              {student.existingAnswerCount > 0 && (
                <label className="paw-replace">
                  <input
                    type="checkbox"
                    checked={replace}
                    onChange={(e) => setReplace(e.target.checked)}
                  />
                  Replace {student.existingAnswerCount} unfinished online
                  answers with this paper. The previous answers are kept in the
                  audit.
                </label>
              )}
              <div className="paw-actions">
                <button
                  className="paw-button"
                  onClick={() => setReview(false)}
                  disabled={busy}
                >
                  Back to answers
                </button>
                <button
                  className="paw-button primary"
                  disabled={
                    busy || (student.existingAnswerCount > 0 && !replace)
                  }
                  onClick={() => void finalize()}
                >
                  {busy ? "Confirming…" : "Confirm paper result"}
                </button>
              </div>
            </section>
          ) : (
            <>
              <div className="paw-question-nav" aria-label="Questions">
                {packet.questions.map((q, i) => (
                  <button
                    key={q.questionId}
                    className={`${i === activeQuestion ? "active" : ""} ${Object.hasOwn(answers, q.questionId) ? "answered" : ""}`}
                    aria-label={`Question ${q.orderIndex}${Object.hasOwn(answers, q.questionId) ? ", recorded" : ""}`}
                    aria-current={i === activeQuestion ? "step" : undefined}
                    onClick={() => setActiveQuestion(i)}
                  >
                    {q.orderIndex}
                  </button>
                ))}
              </div>
              {question && (
                <section className="paw-question">
                  <span className="paw-eyebrow">
                    Question {question.orderIndex} of {packet.questions.length}
                  </span>
                  <h4>{question.questionText}</h4>
                  {question.imageUrl && (
                    <img
                      className="paw-question-image"
                      src={question.imageUrl}
                      alt={question.imageAltText || "Question visual"}
                    />
                  )}
                  <div
                    className="paw-options"
                    role="radiogroup"
                    aria-label={`Answer for question ${question.orderIndex}`}
                    onKeyDown={(event) => {
                      if (
                        ![
                          "ArrowLeft",
                          "ArrowRight",
                          "ArrowUp",
                          "ArrowDown",
                        ].includes(event.key)
                      )
                        return;
                      event.preventDefault();
                      const choices = [
                        ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                          "button",
                        ),
                      ];
                      const index = choices.indexOf(
                        document.activeElement as HTMLButtonElement,
                      );
                      const next =
                        choices[
                          (index +
                            (["ArrowLeft", "ArrowUp"].includes(event.key)
                              ? -1
                              : 1) +
                            choices.length) %
                            choices.length
                        ];
                      next?.focus();
                      next?.click();
                    }}
                  >
                    {paperOptions(question).map((option, i) => (
                      <button
                        key={i}
                        role="radio"
                        aria-checked={
                          answers[question.questionId] === option.text
                        }
                        className={
                          answers[question.questionId] === option.text
                            ? "selected"
                            : ""
                        }
                        onClick={() => change(question.questionId, option.text)}
                      >
                        <span>{String.fromCharCode(65 + i)}</span>
                        <span>
                          {option.text}
                          {option.imageUrl && (
                            <img
                              src={option.imageUrl}
                              alt="Answer choice visual"
                            />
                          )}
                        </span>
                        {answers[question.questionId] === option.text && (
                          <span aria-hidden="true">✓</span>
                        )}
                      </button>
                    ))}
                    <button
                      role="radio"
                      aria-checked={
                        Object.hasOwn(answers, question.questionId) &&
                        answers[question.questionId] === null
                      }
                      className={`paw-blank ${Object.hasOwn(answers, question.questionId) && answers[question.questionId] === null ? "selected" : ""}`}
                      onClick={() => change(question.questionId, null)}
                    >
                      <span>—</span>
                      <span>Blank on paper</span>
                    </button>
                  </div>
                </section>
              )}
              <footer className="paw-editor-footer">
                <span>
                  {answered}/{packet.questions.length} recorded
                </span>
                <div className="paw-actions">
                  <button
                    className="paw-button"
                    onClick={() => setActiveQuestion((i) => Math.max(0, i - 1))}
                    disabled={activeQuestion === 0}
                  >
                    Previous
                  </button>
                  {activeQuestion < packet.questions.length - 1 &&
                  answered !== packet.questions.length ? (
                    <button
                      className="paw-button primary"
                      onClick={() => setActiveQuestion((i) => i + 1)}
                    >
                      Next question
                    </button>
                  ) : (
                    <button
                      className="paw-button primary"
                      disabled={answered !== packet.questions.length}
                      onClick={() => setReview(true)}
                    >
                      Review answers
                    </button>
                  )}
                </div>
              </footer>
            </>
          )}
        </>
      )}
    </>
  );
}
