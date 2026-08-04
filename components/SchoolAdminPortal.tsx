import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import '../src/styles/school-admin-mobile.css';
import { ToastMessage } from '../types';
import * as SchoolAdminService from '../services/schoolAdminService';
import { supabase } from '../services/supabaseClient';
import {
  fetchSchoolPlanDetails,
  type SchoolPlanDetails,
} from '../services/tierService';
import type {
  SchoolStats,
  SchoolMember,
  SchoolInfo,
  SchoolClass,
  SchoolTeacher,
  ClassTeacherAssignment,
  ModerationLogEntry,
  StudentModStatus,
} from '../services/schoolAdminService';
import type { SchoolRole } from '../types';


import SchoolAdminContext from './school-admin/SchoolAdminContext';
import DashboardTab from './school-admin/tabs/DashboardTab';
import MembersTab from './school-admin/tabs/MembersTab';
import TeachersTab from './school-admin/tabs/TeachersTab';
import OrganisationTab from './school-admin/tabs/OrganisationTab';
import SubjectsTab from './school-admin/tabs/SubjectsTab';
import BillingTab from './school-admin/tabs/BillingTab';
import SettingsTab from './school-admin/tabs/SettingsTab';
import CambridgeTab from './school-admin/tabs/CambridgeTab';
import DocumentsTab from './school-admin/tabs/DocumentsTab';
import IeltsExamsTab from './school-admin/tabs/IeltsExamsTab';
import IeltsPracticeTab from './school-admin/tabs/IeltsPracticeTab';
import IeltsResultsTab from './school-admin/tabs/IeltsResultsTab';
import IeltsSettingsTab from './school-admin/tabs/IeltsSettingsTab';
import IeltsReviewAdminGuard from './ielts/IeltsReviewAdminGuard';
import IeltsExamModeAdminGuard from './ielts/IeltsExamModeAdminGuard';
import MemberActionModal from './school-admin/modals/MemberActionModal';
import ConfirmDialogModal from './school-admin/modals/ConfirmDialogModal';
import AdmissionHub from './AdmissionHub';
import { SchoolBrand } from '../src/components/SchoolBrand';
import { createSchoolBrand } from '../src/lib/schoolBranding';
import { friendlySchoolAdminError } from '../src/lib/schoolAdminPresentation';
import { useSmartCollapsedNavigation } from '../src/hooks/useSmartCollapsedNavigation';
import {
  buildSchoolAdminNavigationUrl,
  parseSchoolAdminNavigation,
  type SchoolAdminIeltsTab,
  type SchoolAdminTab,
} from '../src/lib/schoolAdminIeltsNavigation';

interface SchoolAdminPortalProps {
  onComplete: () => void;
  onLogout: () => void;
  onNavigate: (view: string) => void;
  addToast: (message: string, type: ToastMessage['type']) => void;
  onOpenTeacherPortal?: () => void;
}

type IeltsSubTab = SchoolAdminIeltsTab;
type MainAdminTab = SchoolAdminTab;
type AdminTab = MainAdminTab | IeltsSubTab;
type IeltsToolNavItem = { id: IeltsSubTab; icon: string; label: string; hint: string };

const IeltsJourneyDashboard = React.lazy(() => import('../src/pages/ielts/IeltsJourneyDashboard'));
const IeltsReviewQueue = React.lazy(() => import('../src/pages/ielts/IeltsReviewQueue'));
const IeltsSubmissionReview = React.lazy(() => import('../src/pages/ielts/IeltsSubmissionReview'));
const IeltsExamMonitor = React.lazy(() => import('../src/pages/ielts/IeltsExamMonitor'));

const SCHOOL_ADMIN_NAV_ITEMS: Array<{ id: MainAdminTab; icon: string; label: string; mobileLabel: string; description: string }> = [
  { id: 'dashboard', icon: '🏠', label: 'Overview', mobileLabel: 'Overview', description: 'School status and priorities' },
  { id: 'members', icon: '👥', label: 'Students & Staff', mobileLabel: 'People', description: 'Members, roles and access' },
  { id: 'teachers', icon: '🎓', label: 'Teacher Assignments', mobileLabel: 'Teachers', description: 'Teaching responsibilities' },
  { id: 'classes', icon: '🏫', label: 'Classes & Registration', mobileLabel: 'Classes', description: 'Classes and registration' },
  { id: 'subjects', icon: '📚', label: 'Curriculum & Subjects', mobileLabel: 'Subjects', description: 'Subjects and curriculum' },
  { id: 'documents', icon: '🗂️', label: 'Document Center', mobileLabel: 'Documents', description: 'Reports, printing and access' },
  { id: 'admissions', icon: '📝', label: 'Admissions', mobileLabel: 'Admissions', description: 'Admission tests and candidates' },
  { id: 'cambridge', icon: '🧾', label: 'Cambridge Assessments', mobileLabel: 'Cambridge', description: 'Cambridge assessments' },
  { id: 'ielts', icon: '🌐', label: 'IELTS Programme', mobileLabel: 'IELTS', description: 'IELTS programme' },
  { id: 'billing', icon: '💳', label: 'Plan & Billing', mobileLabel: 'Billing', description: 'Plan and billing' },
  { id: 'settings', icon: '⚙️', label: 'School Settings', mobileLabel: 'Settings', description: 'School configuration' },
];

const SCHOOL_ADMIN_PRIMARY_TAB_IDS = new Set<MainAdminTab>(['dashboard', 'members', 'classes', 'admissions']);
const SCHOOL_ADMIN_PRIMARY_NAV_ITEMS = SCHOOL_ADMIN_NAV_ITEMS.filter(({ id }) => SCHOOL_ADMIN_PRIMARY_TAB_IDS.has(id));

const IELTS_TOOL_NAV_ITEMS: IeltsToolNavItem[] = [
  { id: 'ielts-exams', icon: '🧪', label: 'Exams', hint: 'Secure mock exams' },
  { id: 'ielts-practice', icon: '📝', label: 'Assignment Overview', hint: 'Assign & monitor' },
  { id: 'ielts-reviews', icon: '✍️', label: 'Reviews', hint: 'Writing & speaking' },
  { id: 'ielts-results', icon: '📈', label: 'Results', hint: 'Student scores' },
  { id: 'ielts-student-progress', icon: '📊', label: 'Student Progress', hint: 'Journey dashboard' },
  { id: 'ielts-settings', icon: '⚙️', label: 'Settings', hint: 'Config & features' },
];

const getCambridgeReportKey = (score: any) =>
  `${score.test_id || score.quiz_name || 'unknown'}::${score.quiz_version || 'legacy-v1'}`;

const getCambridgeReportLabel = (score: any) =>
  `${score.quiz_name || 'Unknown test'} · ${score.quiz_version || 'legacy-v1'}`;

const SchoolAdminPortal: React.FC<SchoolAdminPortalProps> = ({ onComplete, onLogout, onNavigate, addToast, onOpenTeacherPortal }) => {
  const initialNavigation = useMemo(() => parseSchoolAdminNavigation(window.location.search), []);
  const [activeTab, setActiveTab] = useState<AdminTab>(initialNavigation.adminTab);
  const [activeIeltsSubTab, setActiveIeltsSubTab] = useState<IeltsSubTab>(initialNavigation.ieltsTab);
  const [activeIeltsReview, setActiveIeltsReview] = useState<{ skill: 'writing' | 'speaking'; attemptId: string } | null>(initialNavigation.review);
  const [activeIeltsMonitorExamId, setActiveIeltsMonitorExamId] = useState<string | null>(initialNavigation.monitorExamId);
  const ieltsTabRefs = useRef<Partial<Record<IeltsSubTab, HTMLButtonElement | null>>>({});
  const [mobileAdminMenuOpen, setMobileAdminMenuOpen] = useState(false);
  const {
    navigationRef: mobileAdminNavigationRef,
    revealNavigation: revealMobileAdminNavigation,
  } = useSmartCollapsedNavigation(activeTab, '(max-width: 768px)');
  const [loading, setLoading] = useState(true);
  const [school, setSchool] = useState<SchoolInfo | null>(null);
  const [stats, setStats] = useState<SchoolStats | null>(null);
  const [members, setMembers] = useState<SchoolMember[]>([]);
  const [schoolAdmins, setSchoolAdmins] = useState<SchoolMember[]>([]);
  const [currentCapabilities, setCurrentCapabilities] = useState<SchoolAdminService.SchoolCapabilities | null>(null);

  const writeNavigationState = useCallback((next: {
    adminTab: MainAdminTab;
    ieltsTab: IeltsSubTab;
    review: { skill: 'writing' | 'speaking'; attemptId: string } | null;
    monitorExamId: string | null;
  }, mode: 'push' | 'replace' = 'push') => {
    const nextUrl = buildSchoolAdminNavigationUrl(next, window.location.href);
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) {
      window.history[mode === 'replace' ? 'replaceState' : 'pushState'](null, '', nextUrl);
    }
  }, []);

  const selectAdminTab = useCallback((tab: MainAdminTab) => {
    revealMobileAdminNavigation();
    setMobileAdminMenuOpen(false);
    setActiveTab(tab);
    setActiveIeltsReview(null);
    setActiveIeltsMonitorExamId(null);
    writeNavigationState({ adminTab: tab, ieltsTab: activeIeltsSubTab, review: null, monitorExamId: null });
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
  }, [activeIeltsSubTab, revealMobileAdminNavigation, writeNavigationState]);

  const selectIeltsSubTab = useCallback((tab: IeltsSubTab) => {
    setActiveIeltsReview(null);
    setActiveIeltsMonitorExamId(null);
    setActiveIeltsSubTab(tab);
    writeNavigationState({ adminTab: 'ielts', ieltsTab: tab, review: null, monitorExamId: null });
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
  }, [writeNavigationState]);

  const selectIeltsReview = useCallback((
    review: { skill: 'writing' | 'speaking'; attemptId: string } | null,
    mode: 'push' | 'replace' = 'push',
  ) => {
    setActiveIeltsReview(review);
    setActiveIeltsMonitorExamId(null);
    writeNavigationState({ adminTab: 'ielts', ieltsTab: 'ielts-reviews', review, monitorExamId: null }, mode);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
  }, [writeNavigationState]);

  const selectIeltsMonitor = useCallback((examEventId: string | null, mode: 'push' | 'replace' = 'push') => {
    setActiveIeltsReview(null);
    setActiveIeltsSubTab('ielts-exams');
    setActiveIeltsMonitorExamId(examEventId);
    writeNavigationState({ adminTab: 'ielts', ieltsTab: 'ielts-exams', review: null, monitorExamId: examEventId }, mode);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
  }, [writeNavigationState]);

  const handleIeltsTabKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>, currentTab: IeltsSubTab) => {
    const currentIndex = IELTS_TOOL_NAV_ITEMS.findIndex(({ id }) => id === currentTab);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % IELTS_TOOL_NAV_ITEMS.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + IELTS_TOOL_NAV_ITEMS.length) % IELTS_TOOL_NAV_ITEMS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = IELTS_TOOL_NAV_ITEMS.length - 1;
    else return;

    event.preventDefault();
    const nextTab = IELTS_TOOL_NAV_ITEMS[nextIndex].id;
    selectIeltsSubTab(nextTab);
    window.requestAnimationFrame(() => ieltsTabRefs.current[nextTab]?.focus());
  }, [selectIeltsSubTab]);

  useEffect(() => {
    const restoreNavigation = () => {
      const restored = parseSchoolAdminNavigation(window.location.search);
      setActiveTab(restored.adminTab);
      setActiveIeltsSubTab(restored.ieltsTab);
      setActiveIeltsReview(restored.review);
      setActiveIeltsMonitorExamId(restored.monitorExamId);
      setMobileAdminMenuOpen(false);
    };

    window.addEventListener('popstate', restoreNavigation);
    return () => window.removeEventListener('popstate', restoreNavigation);
  }, []);

  useEffect(() => {
    if (!mobileAdminMenuOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileAdminMenuOpen(false);
    };

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileAdminMenuOpen]);

  // Billing / Plan state
  const [planDetails, setPlanDetails] = useState<SchoolPlanDetails | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingAction, setBillingAction] = useState<string | null>(null);
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('yearly');
  const [membersTotal, setMembersTotal] = useState(0);
  const [memberPage, setMemberPage] = useState(1);
  const [memberPageSize, setMemberPageSize] = useState(25);
  const [memberSortKey, setMemberSortKey] = useState<'username' | 'role' | 'grade' | 'level' | 'last_seen' | 'status'>('username');
  const [memberSortDirection, setMemberSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [bulkMemberAction, setBulkMemberAction] = useState('');

  // Classes manager state
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classesLoading, setClassesLoading] = useState(false);
  const [classSaving, setClassSaving] = useState(false);
  const [classForm, setClassForm] = useState({
    id: '',
    class_code: '',
    class_name: '',
    grade_level: '',
    is_active: true,
  });

  // Subjects manager state - DB-DRIVEN
  const [dbSubjects, setDbSubjects] = useState<SchoolAdminService.SchoolSubject[]>([]);
  const [subjectName, setSubjectName] = useState('');
  const [subjectCode, setSubjectCode] = useState('');
  const [subjectSaving, setSubjectSaving] = useState(false);
  const [subjectTemplateSaving, setSubjectTemplateSaving] = useState<string | null>(null);
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [editingSubjectName, setEditingSubjectName] = useState('');
  const [editingSubjectCode, setEditingSubjectCode] = useState('');
  const [editingSubjectSaving, setEditingSubjectSaving] = useState(false);

  // Teacher assignment state
  const [teachers, setTeachers] = useState<SchoolTeacher[]>([]);
  const [teacherAssignments, setTeacherAssignments] = useState<ClassTeacherAssignment[]>([]);
  const [assignmentClassId, setAssignmentClassId] = useState('');
  const [assignmentTeacherId, setAssignmentTeacherId] = useState('');
  const [assignmentSubjectInput, setAssignmentSubjectInput] = useState('');
  const [assignmentActive, setAssignmentActive] = useState(true);
  const [assignmentFilterClassId, setAssignmentFilterClassId] = useState('');
  const [assignmentFilterTeacherId, setAssignmentFilterTeacherId] = useState('');
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentPage, setAssignmentPage] = useState(1);
  const [assignmentPageSize, setAssignmentPageSize] = useState(10);

  // Student enrollment state
  const [students, setStudents] = useState<SchoolMember[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedGrade, setSelectedGrade] = useState<number | ''>('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [studentAssignments, setStudentAssignments] = useState<Record<string, string | null>>({});
  const [studentSaving, setStudentSaving] = useState(false);
  const [studentPage, setStudentPage] = useState(1);
  const [studentPageSize, setStudentPageSize] = useState(25);
  
  // Filters
  const [memberSearch, setMemberSearch] = useState('');
  const [memberRoleFilter, setMemberRoleFilter] = useState<SchoolRole | ''>('');
  
  // Modals
  const [showMemberActionModal, setShowMemberActionModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<SchoolMember | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    isDestructive?: boolean;
    requiresReason?: boolean;
    reasonRequired?: boolean;
    onConfirm: (reason?: string) => Promise<void> | void;
  } | null>(null);
  const [confirmReason, setConfirmReason] = useState('');
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Settings state
  const [settingsName, setSettingsName] = useState('');
  const [settingsAllowStudent, setSettingsAllowStudent] = useState(true);
  const [settingsAllowTeacher, setSettingsAllowTeacher] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsLogoFile, setSettingsLogoFile] = useState<File | null>(null);
  const [settingsLogoPreview, setSettingsLogoPreview] = useState('');
  const [settingsLogoStatus, setSettingsLogoStatus] = useState<{ type: 'info' | 'success' | 'error'; message: string } | null>(null);

  // Cambridge Tests Reports State
  const [quizScores, setQuizScores] = useState<any[]>([]);
  const [quizScoresLoading, setQuizScoresLoading] = useState(false);
  const [quizFilter, setQuizFilter] = useState<string>('all');
  const [classFilter, setClassFilter] = useState<string>('all');

  // School-level Cambridge visibility state
  const [showSchoolVisibility, setShowSchoolVisibility] = useState(false);
  const [schoolVisibility, setSchoolVisibility] = useState<{test_id: string; test_name: string; subject: string; category: string; is_visible: boolean; updated_by: string | null; updated_at: string | null}[]>([]);
  const [schoolVisibilityLoading, setSchoolVisibilityLoading] = useState(false);
  const [schoolVisibilitySubjectFilter, setSchoolVisibilitySubjectFilter] = useState<string>('all');
  const [selectedSchoolTests, setSelectedSchoolTests] = useState<Set<string>>(new Set());

  // Moderation state
  const [modLog, setModLog] = useState<ModerationLogEntry[]>([]);
  const [modLogLoading, setModLogLoading] = useState(false);
  const [modLogExpanded, setModLogExpanded] = useState(false);
  const [modTargetId, setModTargetId] = useState('');
  const [modTargetStatus, setModTargetStatus] = useState<StudentModStatus | null>(null);
  const [suspendDuration, setSuspendDuration] = useState<number>(24);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspendLoading, setSuspendLoading] = useState(false);
  const [forceChangeUsername, setForceChangeUsername] = useState(false);
  const [forceChangeAvatar, setForceChangeAvatar] = useState(false);
  const [forceChangeReason, setForceChangeReason] = useState('');
  const [forceChangeLoading, setForceChangeLoading] = useState(false);

  // Load initial data
  useEffect(() => {
    loadSchoolData();
  }, []);

  const loadSchoolData = async () => {
    setLoading(true);
    try {
      const schoolData = await SchoolAdminService.getCurrentSchool();
      if (!schoolData || schoolData.role !== 'school_admin') {
        addToast('You do not have school admin permissions', 'error');
        onComplete();
        return;
      }

      setSchool(schoolData.school);
      setSettingsName(schoolData.school.name);
      setSettingsAllowStudent(schoolData.school.allow_student_signup);
      setSettingsAllowTeacher(schoolData.school.allow_teacher_signup);

      setStats(schoolData.stats);
      setCurrentCapabilities(await SchoolAdminService.getMySchoolCapabilities(schoolData.school.id));

      // Load members
      await loadMembers(schoolData.school.id);

      // Load plan details (non-blocking)
      fetchSchoolPlanDetails().then(d => setPlanDetails(d)).catch(() => {});
    } catch (err) {
      console.error('Error loading school data:', err);
      addToast('Failed to load school data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadAdminTools = useCallback(async (schoolId: string) => {
    setClassesLoading(true);
    try {
      const [classList, teacherList, assignmentsList, studentList, subjectList, adminList] = await Promise.all([
        SchoolAdminService.listSchoolClasses(schoolId),
        SchoolAdminService.listSchoolTeachers(schoolId),
        SchoolAdminService.listTeacherAssignments(schoolId),
        SchoolAdminService.listSchoolMembers(schoolId, { role: 'student', limit: 10000 }).then((res) => res.members),
        SchoolAdminService.listSchoolSubjects(schoolId),
        SchoolAdminService.listSchoolMembers(schoolId, { role: 'school_admin', limit: 100 }).then((res) => res.members),
      ]);

      // RPC contracts should return arrays, but keep the portal render-safe when a
      // partially deployed backend returns null or an object-shaped payload.
      setClasses(Array.isArray(classList) ? classList : []);
      setTeachers(Array.isArray(teacherList) ? teacherList : []);
      setTeacherAssignments(Array.isArray(assignmentsList) ? assignmentsList : []);
      setStudents(Array.isArray(studentList) ? studentList : []);
      setDbSubjects(Array.isArray(subjectList) ? subjectList : []);
      setSchoolAdmins(Array.isArray(adminList) ? adminList : []);

      const classIds = classList.map((cls) => cls.id);
      const studentRows = await SchoolAdminService.listClassStudents(classIds, schoolId);
      const assignmentMap: Record<string, string | null> = {};
      studentRows.forEach((row) => {
        assignmentMap[row.student_id] = row.class_id;
      });
      setStudentAssignments(assignmentMap);
    } catch (err) {
      console.error('Error loading admin tools:', err);
      addToast('Failed to load classes and assignments', 'error');
    } finally {
      setClassesLoading(false);
    }
  }, [addToast]);

  const refreshSchool = async (schoolId: string) => {
    const details = await SchoolAdminService.getSchoolDetails(schoolId);
    if (!details) return;

    setSchool(details.school);
    setStats(details.stats);
    setSettingsName(details.school.name);
    setSettingsAllowStudent(details.school.allow_student_signup);
    setSettingsAllowTeacher(details.school.allow_teacher_signup);
  };

  const loadMembers = useCallback(async (schoolId: string) => {
    const { members: memberList, total } = await SchoolAdminService.listSchoolMembers(schoolId, {
      role: memberRoleFilter || undefined,
      search: memberSearch || undefined,
      sortKey: memberSortKey,
      sortDirection: memberSortDirection,
      limit: memberPageSize,
      offset: (memberPage - 1) * memberPageSize,
    });
    setMembers(memberList);
    setMembersTotal(total);
    setSelectedMemberIds(new Set());
  }, [memberRoleFilter, memberSearch, memberPage, memberPageSize, memberSortKey, memberSortDirection]);

  // Reload members when filters change
  useEffect(() => {
    if (school?.id) {
      loadMembers(school.id);
    }
  }, [school?.id, memberSearch, memberRoleFilter, loadMembers]);

  // Reset to page 1 when filters or sort changes
  useEffect(() => {
    setMemberPage(1);
  }, [memberSearch, memberRoleFilter, memberPageSize, memberSortKey, memberSortDirection]);

  useEffect(() => {
    if (school?.id) {
      loadAdminTools(school.id);
    }
  }, [school?.id, loadAdminTools]);

  // Cambridge Tests functions
  const fetchQuizScores = async (): Promise<boolean> => {
    setQuizScoresLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_school_cambridge_scores', { p_limit: 500 });

      if (error) {
        console.error('Failed to fetch Cambridge scores:', error);
        addToast('Failed to load Cambridge test scores', 'error');
        return false;
      }

      setQuizScores(data || []);
      return true;
    } catch (error) {
      console.error('Exception fetching quiz scores:', error);
      addToast('Failed to fetch Cambridge test scores', 'error');
      return false;
    } finally {
      setQuizScoresLoading(false);
    }
  };

  const allowQuizRetake = async (score: any) => {
    const studentName = score.student_name || 'this student';
    const testLabel = getCambridgeReportLabel(score);
    setConfirmReason('');
    setConfirmDialog({
      title: 'Allow Cambridge Retake',
      description: `Allow ${studentName} to retake ${testLabel}, attempt ${score.attempt_number || 1}? This exact version will be preserved in audit history and removed from active results.`,
      confirmLabel: 'Allow Retake',
      requiresReason: true,
      reasonRequired: true,
      onConfirm: async (reason) => {
        const trimmedReason = reason?.trim();
        if (!trimmedReason) {
          addToast('A reason is required to allow a retake', 'error');
          return;
        }

        try {
          const result = await SchoolAdminService.allowQuizRetake(
            score.id,
            trimmedReason,
          );

          if (!result.success) {
            addToast(`Failed to allow retake: ${result.error || 'Unknown error'}`, 'error');
            return;
          }

          const refreshed = await fetchQuizScores();
          if (refreshed) {
            addToast(`Retake allowed for ${studentName}; ${testLabel} was preserved`, 'success');
          } else {
            addToast('Retake allowed, but the reports could not be refreshed. Your existing report list was preserved.', 'warning');
          }
        } catch (error: any) {
          console.error('Failed to allow retake:', error);
          addToast(`Failed to allow retake: ${error.message}`, 'error');
        }
      },
    });
  };

  const linkCambridgeAttemptStudent = async (score: any, studentId: string) => {
    const student = students.find((candidate) => candidate.user_id === studentId);
    if (!student) {
      addToast('Select an active student before linking this attempt', 'error');
      return;
    }

    const studentLabel = student.full_name || student.username;
    const historicalLabel = score.student_name || 'Unknown student';
    const testLabel = getCambridgeReportLabel(score);
    setConfirmReason('');
    setConfirmDialog({
      title: 'Confirm Cambridge student identity',
      description: `Link the historical submission for ${historicalLabel} (${testLabel}) to ${studentLabel}? The original submission name and class will remain in the audit record. This link cannot be reassigned from the portal.`,
      confirmLabel: 'Link student identity',
      isDestructive: true,
      requiresReason: true,
      reasonRequired: true,
      onConfirm: async (reason) => {
        const trimmedReason = reason?.trim();
        if (!trimmedReason) {
          addToast('A reason is required to link a historical attempt', 'error');
          return;
        }

        const result = await SchoolAdminService.linkCambridgeAttemptStudent(
          score.id,
          student.user_id,
          trimmedReason,
        );

        if (!result.success) {
          addToast(`Identity was not linked: ${result.error || 'Unknown error'}`, 'error');
          return;
        }

        const refreshed = await fetchQuizScores();
        if (refreshed) {
          addToast(`Linked ${testLabel} to ${result.student_name || studentLabel}`, 'success');
        } else {
          addToast('Identity linked, but reports could not be refreshed. Your existing report list was preserved.', 'warning');
        }
      },
    });
  };

  const exportCSV = () => {
    const filtered = filteredQuizScores;
    if (filtered.length === 0) {
      addToast('No data to export', 'error');
      return;
    }

    const headers = ['Student Name', 'Class', 'Quiz Name', 'Test ID', 'Version', 'Attempt', 'Status', 'Score', 'Total', 'Percentage', 'Time (seconds)', 'Submitted At'];
    const rows = filtered.map(s => [
      s.student_name || '',
      s.student_class || '',
      s.quiz_name || '',
      s.test_id || '',
      s.quiz_version || 'legacy-v1',
      s.attempt_number || 1,
      s.attempt_status || 'submitted',
      s.score || 0,
      s.total_questions || 0,
      s.percentage || 0,
      s.time_taken_seconds || 0,
      s.submitted_at || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `cambridge_scores_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();

    addToast('✅ CSV exported successfully', 'success');
  };

  const filteredQuizScores = quizScores.filter(s => {
    if (quizFilter !== 'all' && getCambridgeReportKey(s) !== quizFilter) return false;
    if (classFilter !== 'all' && (s.student_class || 'Unknown') !== classFilter) return false;
    return true;
  });

  const quizReportsByKey = new Map<string, { key: string; label: string; count: number }>();
  quizScores.forEach((score) => {
    const key = getCambridgeReportKey(score);
    const existing = quizReportsByKey.get(key);
    quizReportsByKey.set(key, existing
      ? { ...existing, count: existing.count + 1 }
      : { key, label: getCambridgeReportLabel(score), count: 1 });
  });
  const uniqueQuizReports = Array.from(quizReportsByKey.values())
    .sort((left, right) => left.label.localeCompare(right.label));
  const uniqueClasses = Array.from(new Set(quizScores.map(s => s.student_class || 'Unknown')));

  // School-level Cambridge visibility functions
  const loadSchoolVisibility = async () => {
    setSchoolVisibilityLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_school_cambridge_test_visibility_settings');
      if (error) {
        console.error('Failed to load school visibility:', error);
        addToast('Failed to load test visibility settings', 'error');
        return;
      }
      setSchoolVisibility(data || []);
    } catch (err) {
      console.error('Exception loading school visibility:', err);
      addToast('Failed to load test visibility settings', 'error');
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
        addToast('Failed to update test visibility', 'error');
        return;
      }
      if (data && !data.success) {
        addToast(data.error || 'Failed to update', 'error');
        return;
      }
      // Update local state optimistically
      setSchoolVisibility(prev => prev.map(t =>
        t.test_id === testId ? { ...t, is_visible: !currentlyVisible } : t
      ));
      addToast(data?.message || 'Updated', 'success');
    } catch (err) {
      console.error('Exception toggling visibility:', err);
      addToast('Failed to update test visibility', 'error');
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
        addToast('Failed to bulk update visibility', 'error');
        return;
      }
      if (data && !data.success) {
        addToast(data.error || 'Failed to update', 'error');
        return;
      }
      // Update local state
      const idSet = new Set(testIds);
      setSchoolVisibility(prev => prev.map(t =>
        idSet.has(t.test_id) ? { ...t, is_visible: isVisible } : t
      ));
      addToast(data?.message || `${testIds.length} test(s) updated`, 'success');
    } catch (err) {
      console.error('Exception in bulk visibility:', err);
      addToast('Failed to bulk update visibility', 'error');
    }
  };

  const schoolVisibilitySubjects = Array.from(new Set(schoolVisibility.map(t => t.subject).filter(Boolean))).sort();
  const filteredSchoolVisibility = schoolVisibilitySubjectFilter === 'all'
    ? schoolVisibility
    : schoolVisibility.filter(t => t.subject === schoolVisibilitySubjectFilter);

  // Member actions
  const handleUpdateRole = async (newRole: SchoolRole) => {
    if (!school || !selectedMember) return;
    if (selectedMember.is_owner) {
      addToast('The school owner is protected. Transfer ownership before changing this account.', 'error');
      return;
    }
    if ((selectedMember.role === 'school_admin' || newRole === 'school_admin') && !currentCapabilities?.is_owner) {
      addToast('Only the school owner can promote or demote delegated administrators.', 'error');
      return;
    }
    const activeAssignmentCount = teacherAssignments.filter((item) => item.active !== false && item.teacher_user_id === selectedMember.user_id).length;
    const keepTeaching = newRole === 'teacher' || (newRole === 'school_admin' && selectedMember.can_teach);
    const accessLabel = newRole === 'school_admin'
      ? (keepTeaching ? 'Delegated Admin + Teacher' : 'Delegated Admin')
      : newRole === 'teacher' ? 'Teacher' : 'Student';
    setConfirmReason('');
    setConfirmDialog({
      title: 'Change this member’s role?',
      description: `Change ${selectedMember.username} to ${accessLabel}? ${keepTeaching && activeAssignmentCount ? `Their ${activeAssignmentCount} active teaching assignment${activeAssignmentCount === 1 ? '' : 's'} will be retained.` : activeAssignmentCount ? `They have ${activeAssignmentCount} active teaching assignment${activeAssignmentCount === 1 ? '' : 's'}; the change will be blocked until those assignments are resolved.` : 'Their portal access will update immediately.'}`,
      confirmLabel: 'Change role',
      cancelLabel: 'Keep current role',
      isDestructive: true,
      onConfirm: async () => {
        setActionLoading(true);
        const result = await SchoolAdminService.updateMemberRole(school.id, selectedMember.user_id, newRole, {
          keepTeaching,
          reason: `Changed by school owner from ${selectedMember.role} to ${newRole}`,
        });
        setActionLoading(false);
        if (result.success) {
          addToast(`Updated ${selectedMember.username}'s access to ${accessLabel}`, 'success');
          await Promise.all([loadMembers(school.id), loadAdminTools(school.id)]);
          setShowMemberActionModal(false);
        } else {
          addToast(friendlySchoolAdminError(result.error, 'The member role could not be changed. Please try again.'), 'error');
        }
      },
    });
  };

  const handleRemoveMember = async () => {
    if (!school || !selectedMember) return;
    if (selectedMember.role === 'school_admin') {
      addToast('The school administrator cannot be removed from the school.', 'error');
      return;
    }
    setConfirmReason('');
    setConfirmDialog({
      title: 'Remove member',
      description: `Remove ${selectedMember.username} from the school? This action cannot be undone.`,
      confirmLabel: 'Remove member',
      cancelLabel: 'Cancel',
      isDestructive: true,
      onConfirm: async () => {
        setActionLoading(true);
        const result = await SchoolAdminService.removeMember(school.id, selectedMember.user_id);
        setActionLoading(false);
        if (result.success) {
          addToast(`Removed ${selectedMember.username} from the school`, 'success');
          await loadMembers(school.id);
          await refreshSchool(school.id);
          setShowMemberActionModal(false);
        } else {
          addToast(friendlySchoolAdminError(result.error, 'The member could not be removed. Please try again.'), 'error');
        }
      },
    });
  };

  const handleBanMember = async () => {
    if (!school || !selectedMember) return;
    if (selectedMember.role === 'school_admin') {
      addToast('The school administrator account cannot be banned.', 'error');
      return;
    }
    setConfirmReason('');
    setConfirmDialog({
      title: 'Ban member',
      description: `Ban ${selectedMember.username}? They will lose access to the school.`,
      confirmLabel: 'Ban member',
      cancelLabel: 'Cancel',
      isDestructive: true,
      requiresReason: true,
      onConfirm: async (reason) => {
        setActionLoading(true);
        const result = await SchoolAdminService.banMember(school.id, selectedMember.user_id, reason || undefined);
        setActionLoading(false);
        if (result.success) {
          addToast(`Banned ${selectedMember.username}`, 'success');
          await loadMembers(school.id);
          await refreshSchool(school.id);
          setShowMemberActionModal(false);
        } else {
          addToast(friendlySchoolAdminError(result.error, 'The member could not be banned. Please try again.'), 'error');
        }
      },
    });
  };

  const handleUnbanMember = async () => {
    if (!school || !selectedMember) return;
    if (selectedMember.role === 'school_admin') {
      addToast('The school administrator account is protected.', 'error');
      return;
    }
    
    setActionLoading(true);
    const result = await SchoolAdminService.unbanMember(school.id, selectedMember.user_id);
    setActionLoading(false);

    if (result.success) {
      addToast(`Unbanned ${selectedMember.username}`, 'success');
      await loadMembers(school.id);
      await refreshSchool(school.id);
      setShowMemberActionModal(false);
    } else {
      addToast(friendlySchoolAdminError(result.error, 'The member restriction could not be lifted. Please try again.'), 'error');
    }
  };

  // ============================================
  // MODERATION HANDLERS
  // ============================================

  const loadModerationLog = useCallback(async () => {
    setModLogLoading(true);
    try {
      const result = await SchoolAdminService.getModerationLog(50, 0);
      setModLog(result.entries);
      if (result.error) {
        addToast(result.error, 'error');
      }
    } finally {
      setModLogLoading(false);
    }
  }, [addToast]);

  const loadStudentModStatus = useCallback(async (studentId: string) => {
    if (!studentId) return;
    setModTargetLoading(true);
    try {
      const status = await SchoolAdminService.getStudentModStatus(studentId);
      setModTargetStatus(status);
      if (!status) {
        addToast('Could not load student moderation status', 'error');
      }
    } finally {
      setModTargetLoading(false);
    }
  }, [addToast]);

  const handleSuspendStudent = useCallback(async () => {
    if (!modTargetStatus) return;
    setConfirmDialog({
      title: 'Suspend this student?',
      description: `Suspend ${modTargetStatus.username} for ${suspendDuration} hours? They will temporarily lose access to the school workspace.`,
      confirmLabel: 'Suspend student',
      cancelLabel: 'Cancel',
      isDestructive: true,
      onConfirm: async () => {
        setSuspendLoading(true);
        try {
          const result = await SchoolAdminService.suspendStudent(modTargetStatus.user_id, suspendDuration, suspendReason || undefined);
          if (result.success) {
            addToast(`Suspended ${modTargetStatus.username} for ${suspendDuration}h`, 'success');
            setSuspendReason('');
            await loadStudentModStatus(modTargetStatus.user_id);
            await loadModerationLog();
            if (school) await loadMembers(school.id);
          } else addToast(friendlySchoolAdminError(result.error, 'The student could not be suspended. Please try again.'), 'error');
        } finally { setSuspendLoading(false); }
      },
    });
  }, [modTargetStatus, suspendDuration, suspendReason, addToast, loadStudentModStatus, loadModerationLog, school]);

  const handleUnsuspendStudent = useCallback(async () => {
    if (!modTargetStatus) return;
    setConfirmDialog({
      title: 'Lift this suspension?',
      description: `${modTargetStatus.username} will regain access immediately.`,
      confirmLabel: 'Lift suspension',
      cancelLabel: 'Keep suspended',
      onConfirm: async () => {
        setSuspendLoading(true);
        try {
          const result = await SchoolAdminService.unsuspendStudent(modTargetStatus.user_id, 'Early lift by school admin');
          if (result.success) {
            addToast(`Unsuspended ${modTargetStatus.username}`, 'success');
            await loadStudentModStatus(modTargetStatus.user_id);
            await loadModerationLog();
            if (school) await loadMembers(school.id);
          } else addToast(friendlySchoolAdminError(result.error, 'The suspension could not be lifted. Please try again.'), 'error');
        } finally { setSuspendLoading(false); }
      },
    });
  }, [modTargetStatus, addToast, loadStudentModStatus, loadModerationLog, school]);

  const handleForceProfileChange = useCallback(async () => {
    if (!modTargetStatus) return;
    if (!forceChangeUsername && !forceChangeAvatar) {
      addToast('Select at least one change (username or avatar)', 'error');
      return;
    }
    setForceChangeLoading(true);
    try {
      const changes: { username?: boolean; avatar?: boolean } = {};
      if (forceChangeUsername) changes.username = true;
      if (forceChangeAvatar) changes.avatar = true;

      const result = await SchoolAdminService.forceProfileChange(
        modTargetStatus.user_id,
        changes,
        forceChangeReason || undefined
      );
      if (result.success) {
        addToast(`Required profile change for ${modTargetStatus.username}`, 'success');
        setForceChangeUsername(false);
        setForceChangeAvatar(false);
        setForceChangeReason('');
        await loadStudentModStatus(modTargetStatus.user_id);
        await loadModerationLog();
      } else {
        addToast(result.error || 'Failed to set profile change', 'error');
      }
    } finally {
      setForceChangeLoading(false);
    }
  }, [modTargetStatus, forceChangeUsername, forceChangeAvatar, forceChangeReason, addToast, loadStudentModStatus, loadModerationLog]);

  const handleClearProfileChange = useCallback(async () => {
    if (!modTargetStatus) return;
    setForceChangeLoading(true);
    try {
      const result = await SchoolAdminService.clearProfileChange(modTargetStatus.user_id);
      if (result.success) {
        addToast(`Cleared profile change requirement for ${modTargetStatus.username}`, 'success');
        await loadStudentModStatus(modTargetStatus.user_id);
        await loadModerationLog();
      } else {
        addToast(result.error || 'Failed to clear profile change', 'error');
      }
    } finally {
      setForceChangeLoading(false);
    }
  }, [modTargetStatus, addToast, loadStudentModStatus, loadModerationLog]);

  // Auto-load moderation log when Members tab opens
  useEffect(() => {
    if (activeTab === 'members') {
      loadModerationLog();
    }
  }, [activeTab, loadModerationLog]);

  // Invite code actions (single code per school)
  const handleRotateInviteCode = async () => {
    if (!school) return;
    setConfirmReason('');
    setConfirmDialog({
      title: 'Rotate invite code',
      description: 'Rotate invite code? The old code will stop working immediately.',
      confirmLabel: 'Rotate code',
      cancelLabel: 'Cancel',
      isDestructive: true,
      onConfirm: async () => {
        setActionLoading(true);
        const result = await SchoolAdminService.rotateInviteCode(school.id);
        setActionLoading(false);
        if (result.success && result.code) {
          addToast(`New invite code: ${result.code}`, 'success');
          await refreshSchool(school.id);
        } else {
          addToast(friendlySchoolAdminError(result.error, 'The invite code could not be changed. Please try again.'), 'error');
        }
      },
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    addToast('Copied to clipboard!', 'success');
  };

  // Settings actions
  const handleSaveSettings = async () => {
    if (!school) return;

    setSavingSettings(true);
    setSettingsLogoStatus(settingsLogoFile
      ? { type: 'info', message: 'Uploading your new logo…' }
      : { type: 'info', message: 'Saving school settings…' });
    let logoUrl = school.logo_url;
    if (settingsLogoFile) {
      const upload = await SchoolAdminService.uploadSchoolLogo(school.id, settingsLogoFile);
      if (!upload.success || !upload.url) {
        setSavingSettings(false);
        const message = friendlySchoolAdminError(upload.error, 'The school logo could not be uploaded. Please try again.');
        setSettingsLogoStatus({ type: 'error', message: `Logo not updated. ${message}` });
        addToast(message, 'error');
        return;
      }
      logoUrl = upload.url;
      setSettingsLogoStatus({ type: 'info', message: 'Logo uploaded. Applying it across the school…' });
    }
    const result = await SchoolAdminService.updateSchoolSettings(school.id, {
      name: settingsName,
      logo_url: logoUrl,
      allow_student_signup: settingsAllowStudent,
      allow_teacher_signup: settingsAllowTeacher,
    });
    setSavingSettings(false);

    if (result.success) {
      // Update this portal immediately rather than waiting for another profile load.
      setSchool(current => current ? { ...current, name: settingsName, logo_url: logoUrl } : current);
      setSettingsLogoFile(null);
      setSettingsLogoPreview('');
      setSettingsLogoStatus({
        type: 'success',
        message: settingsLogoFile
          ? 'Logo updated successfully. It is now used across school dashboards and reports.'
          : 'School settings saved successfully.',
      });
      window.dispatchEvent(new CustomEvent('school-branding-updated', {
        detail: { schoolId: school.id, schoolName: settingsName, schoolLogoUrl: logoUrl },
      }));
      addToast(settingsLogoFile ? 'School logo updated successfully' : 'Settings saved successfully', 'success');
      await refreshSchool(school.id);
    } else {
      const message = friendlySchoolAdminError(result.error, 'The school settings could not be saved. Please try again.');
      setSettingsLogoStatus({ type: 'error', message: `Changes were not applied. ${message}` });
      addToast(message, 'error');
    }
  };

  const handleSaveClass = async () => {
    if (!school) return;
    const trimmedCode = classForm.class_code.trim();
    const trimmedName = classForm.class_name.trim();
    if (!trimmedCode || !trimmedName) {
      addToast('Class code and name are required', 'error');
      return;
    }

    const gradeValue = classForm.grade_level.trim() ? Number(classForm.grade_level) : null;
    if (classForm.grade_level.trim() && Number.isNaN(gradeValue)) {
      addToast('Grade level must be a number', 'error');
      return;
    }

    setClassSaving(true);
    const result = await SchoolAdminService.saveSchoolClass(school.id, {
      id: classForm.id || undefined,
      class_code: trimmedCode,
      class_name: trimmedName,
      grade_level: gradeValue,
      is_active: classForm.is_active,
    });
    setClassSaving(false);

    if (result.success) {
      addToast(classForm.id ? 'Class updated' : 'Class created', 'success');
      setClassForm({ id: '', class_code: '', class_name: '', grade_level: '', is_active: true });
      await loadAdminTools(school.id);
    } else {
      addToast(friendlySchoolAdminError(result.error, 'The class could not be saved. Check the details and try again.'), 'error');
    }
  };

  const handleEditClass = (schoolClass: SchoolClass) => {
    setClassForm({
      id: schoolClass.id,
      class_code: schoolClass.class_code,
      class_name: schoolClass.class_name,
      grade_level: schoolClass.grade_level ? String(schoolClass.grade_level) : '',
      is_active: schoolClass.is_active,
    });
  };

  const handleAssignTeacher = async () => {
    if (!school) return;
    if (!assignmentClassId || !assignmentTeacherId || !assignmentSubjectInput.trim()) {
      addToast('Select a class, teacher, and subject', 'error');
      return;
    }

    setAssignmentSaving(true);
    const result = await SchoolAdminService.assignTeacherToClassSubject(
      school.id,
      assignmentClassId,
      assignmentTeacherId,
      assignmentSubjectInput.trim(),
      true
    );
    setAssignmentSaving(false);

    if (!result.success) {
      addToast(friendlySchoolAdminError(result.error, 'The teacher assignment could not be saved. Check the selections and try again.'), 'error');
      return;
    }

    addToast('Teacher assigned successfully', 'success');
    setAssignmentClassId('');
    setAssignmentTeacherId('');
    setAssignmentSubjectInput('');
    await loadAdminTools(school.id);
  };

  const handleEnrollStudent = async (studentId = selectedStudentId, classId = selectedClassId) => {
    if (!school) return;
    if (!studentId || !classId) {
      addToast('Select a student and class', 'error');
      return;
    }

    const enrolledStudentId = studentId;
    const enrolledClassId = classId;

    const previousClassId = studentAssignments[studentId] || null;
    setStudentSaving(true);
    const result = await SchoolAdminService.moveStudentToClassViaRPC(
      studentId,
      classId,
      previousClassId
    );
    setStudentSaving(false);

    if (!result.success) {
      addToast(friendlySchoolAdminError(result.error, 'The student could not be placed in this class. Please try again.'), 'error');
      return;
    }

    const destinationClass = classes.find((schoolClass) => schoolClass.id === enrolledClassId);
    const authoritativeGrade = result.grade ?? destinationClass?.grade_level ?? null;
    const authoritativeBatch = result.batch ?? destinationClass?.class_code ?? null;

    addToast(result.message || 'Academic placement saved', 'success');

    setStudentAssignments((prev) => ({
      ...prev,
      [enrolledStudentId]: enrolledClassId,
    }));
    setStudents((prev) => prev.map((student) => student.user_id === enrolledStudentId
      ? { ...student, grade: authoritativeGrade as number | null, batch: authoritativeBatch }
      : student));
    setMembers((prev) => prev.map((member) => member.user_id === enrolledStudentId
      ? { ...member, grade: authoritativeGrade as number | null, batch: authoritativeBatch }
      : member));
    setSelectedMember((prev) => prev?.user_id === enrolledStudentId
      ? { ...prev, grade: authoritativeGrade as number | null, batch: authoritativeBatch }
      : prev);

    setSelectedStudentId('');
    setSelectedGrade('');
    setSelectedClassId('');

    // The RPC commits placement and profile mirrors atomically. Reload immediately
    // so the directory and roster share the same authoritative current class.
    setClassesLoading(true);
    try {
      const classIds = classes.map((cls) => cls.id);
      const studentRows = await SchoolAdminService.listClassStudents(classIds, school?.id);
      const assignmentMap: Record<string, string | null> = {};
      studentRows.forEach((row) => {
        assignmentMap[row.student_id] = row.class_id;
      });
      
      if (assignmentMap[enrolledStudentId]) {
        setStudentAssignments(assignmentMap);
      } else {
        setStudentAssignments((prev) => ({
          ...assignmentMap,
          [enrolledStudentId]: enrolledClassId,
        }));
      }
    } catch (err) {
      console.error('Error refreshing student assignments:', err);
    } finally {
      setClassesLoading(false);
    }
  };

  // ============================================
  // Subject Management Handlers (DB-Driven)
  // ============================================

  const createSubject = async (name: string, code?: string) => {
    if (!school || !name.trim()) {
      addToast('Subject name is required', 'error');
      return false;
    }

    const result = await SchoolAdminService.createSchoolSubject(
      school.id,
      name.trim(),
      code?.trim() || undefined
    );

    if (!result.success) {
      addToast(friendlySchoolAdminError(result.error, 'The subject could not be created. Check the name and code and try again.'), 'error');
      return false;
    }

    addToast(`Subject "${name.trim()}" created successfully`, 'success');
    await loadAdminTools(school.id);
    return true;
  };

  const handleAddSubject = async () => {
    setSubjectSaving(true);
    const created = await createSubject(subjectName, subjectCode);
    setSubjectSaving(false);

    if (created) {
      setSubjectName('');
      setSubjectCode('');
    }
  };

  const handleAddSubjectTemplate = async (name: string, code?: string) => {
    setSubjectTemplateSaving(name);
    await createSubject(name, code);
    setSubjectTemplateSaving(null);
  };

  const handleDeleteSubject = async (subjectId: string, subjectName: string) => {
    if (!school) return;
    setConfirmReason('');
    setConfirmDialog({
      title: 'Delete subject',
      description: `Delete subject "${subjectName}"? This will mark it as inactive.`,
      confirmLabel: 'Delete subject',
      cancelLabel: 'Cancel',
      isDestructive: true,
      onConfirm: async () => {
        const result = await SchoolAdminService.deleteSchoolSubject(subjectId, school.id);
        if (!result.success) {
          addToast(friendlySchoolAdminError(result.error, 'The subject could not be deleted. Please try again.'), 'error');
          return;
        }
        addToast(`Subject "${subjectName}" deleted`, 'success');
        await loadAdminTools(school.id);
      },
    });
  };

  const handleStartEditSubject = (subject: SchoolAdminService.SchoolSubject) => {
    setEditingSubjectId(subject.id);
    setEditingSubjectName(subject.name);
    setEditingSubjectCode(subject.code || '');
  };

  const handleCancelEditSubject = () => {
    setEditingSubjectId(null);
    setEditingSubjectName('');
    setEditingSubjectCode('');
  };

  const handleSaveEditSubject = async () => {
    if (!school || !editingSubjectId || !editingSubjectName.trim()) return;

    setEditingSubjectSaving(true);
    const result = await SchoolAdminService.updateSchoolSubject(
      editingSubjectId,
      { name: editingSubjectName.trim(), code: editingSubjectCode.trim() || undefined },
      school.id
    );
    setEditingSubjectSaving(false);

    if (!result.success) {
      addToast(friendlySchoolAdminError(result.error, 'The subject could not be updated. Check the details and try again.'), 'error');
      return;
    }

    addToast('Subject updated successfully', 'success');
    setEditingSubjectId(null);
    setEditingSubjectName('');
    setEditingSubjectCode('');
    await loadAdminTools(school.id);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatRelativeTime = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(dateString);
  };

  const getRoleBadgeColor = (role: SchoolRole | string) => {
    switch (role) {
      case 'school_admin': return 'bg-purple-500 text-white';
      case 'teacher': return 'bg-blue-500 text-white';
      case 'student': return 'bg-green-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const toggleMemberSort = (key: typeof memberSortKey) => {
    if (memberSortKey === key) {
      setMemberSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setMemberSortKey(key);
    setMemberSortDirection('asc');
  };

  const toggleMemberSelection = (memberId: string) => {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) {
        next.delete(memberId);
      } else {
        next.add(memberId);
      }
      return next;
    });
  };

  const toggleSelectAllMembers = (memberIds: string[], shouldSelect: boolean) => {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      memberIds.forEach((id) => {
        if (shouldSelect) {
          next.add(id);
        } else {
          next.delete(id);
        }
      });
      return next;
    });
  };

  const handleBulkMemberAction = async () => {
    if (!school || selectedMemberIds.size === 0 || !bulkMemberAction) return;
    const selectedMembers = members.filter((member) => selectedMemberIds.has(member.user_id) && member.role !== 'school_admin');
    if (!selectedMembers.length) {
      addToast('School administrator accounts are protected from bulk actions.', 'error');
      return;
    }
    const namesPreview = selectedMembers.slice(0, 3).map((m) => m.username).join(', ');
    const moreCount = selectedMembers.length > 3 ? ` +${selectedMembers.length - 3} more` : '';

    if (bulkMemberAction === 'ban') {
      setConfirmReason('');
      setConfirmDialog({
        title: 'Ban selected members',
        description: `Ban ${selectedMembers.length} members? (${namesPreview}${moreCount})`,
        confirmLabel: 'Ban members',
        cancelLabel: 'Cancel',
        isDestructive: true,
        requiresReason: true,
        onConfirm: async (reason) => {
          setActionLoading(true);
          for (const member of selectedMembers) {
            await SchoolAdminService.banMember(school.id, member.user_id, reason || undefined);
          }
          setActionLoading(false);
          addToast('Selected members banned', 'success');
          await loadMembers(school.id);
          await refreshSchool(school.id);
        },
      });
      return;
    }

    if (bulkMemberAction === 'unban') {
      setConfirmDialog({
        title: 'Unban selected members',
        description: `Unban ${selectedMembers.length} members? (${namesPreview}${moreCount})`,
        confirmLabel: 'Unban members',
        cancelLabel: 'Cancel',
        onConfirm: async () => {
          setActionLoading(true);
          for (const member of selectedMembers) {
            await SchoolAdminService.unbanMember(school.id, member.user_id);
          }
          setActionLoading(false);
          addToast('Selected members unbanned', 'success');
          await loadMembers(school.id);
          await refreshSchool(school.id);
        },
      });
      return;
    }

    if (bulkMemberAction === 'remove') {
      setConfirmDialog({
        title: 'Remove selected members',
        description: `Remove ${selectedMembers.length} members from the school? (${namesPreview}${moreCount})`,
        confirmLabel: 'Remove members',
        cancelLabel: 'Cancel',
        isDestructive: true,
        onConfirm: async () => {
          setActionLoading(true);
          for (const member of selectedMembers) {
            await SchoolAdminService.removeMember(school.id, member.user_id);
          }
          setActionLoading(false);
          addToast('Selected members removed', 'success');
          await loadMembers(school.id);
          await refreshSchool(school.id);
        },
      });
      return;
    }

    if (bulkMemberAction.startsWith('role:')) {
      const role = bulkMemberAction.replace('role:', '') as SchoolRole;
      setConfirmDialog({
        title: 'Change roles for selected members',
        description: `Change ${selectedMembers.length} members to ${role.replace('_', ' ')}? (${namesPreview}${moreCount})`,
        confirmLabel: 'Change roles',
        cancelLabel: 'Cancel',
        onConfirm: async () => {
          setActionLoading(true);
          for (const member of selectedMembers) {
            await SchoolAdminService.updateMemberRole(school.id, member.user_id, role);
          }
          setActionLoading(false);
          addToast('Roles updated for selected members', 'success');
          await loadMembers(school.id);
        },
      });
    }
  };

  const classById = classes.reduce<Record<string, SchoolClass>>((acc, cls) => {
    acc[cls.id] = cls;
    return acc;
  }, {});

  const filteredTeacherAssignments = teacherAssignments.filter((assignment) => {
    if (assignmentFilterClassId && assignment.class_id !== assignmentFilterClassId) return false;
    if (assignmentFilterTeacherId && assignment.teacher_user_id !== assignmentFilterTeacherId) return false;
    return true;
  });

  const filteredStudents = students.filter((student) => {
    const term = studentSearch.trim().toLowerCase();
    if (!term) return true;
    return student.username.toLowerCase().includes(term) || student.email.toLowerCase().includes(term);
  });

  useEffect(() => {
    setAssignmentPage(1);
  }, [assignmentFilterClassId, assignmentFilterTeacherId, assignmentPageSize]);

  useEffect(() => {
    setStudentPage(1);
  }, [studentSearch, studentPageSize]);

  // Server-side sort: data arrives pre-sorted from the RPC
  const sortedMembers = members;

  const memberTotalPages = Math.max(1, Math.ceil(membersTotal / memberPageSize));
  const assignmentTotalPages = Math.max(1, Math.ceil(filteredTeacherAssignments.length / assignmentPageSize));
  const studentTotalPages = Math.max(1, Math.ceil(filteredStudents.length / studentPageSize));

  const pagedTeacherAssignments = filteredTeacherAssignments.slice(
    (assignmentPage - 1) * assignmentPageSize,
    assignmentPage * assignmentPageSize
  );

  const pagedStudents = filteredStudents.slice(
    (studentPage - 1) * studentPageSize,
    studentPage * studentPageSize
  );

  if (loading) {

    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <img src="/BRAINS.svg" alt="Loading..." className="w-40 h-40 animate-pulse" style={{ filter: 'drop-shadow(0 0 30px rgba(0, 212, 255, 0.6))' }} />
      </div>
    );
  }

  if (!school) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400">No school found</p>
          <button onClick={onComplete} className="mt-4 text-cyan-400 hover:underline">
            Go Back
          </button>
        </div>
      </div>
    );
  }


  // ── Context value (every state/setter/handler exposed to child components) ──
  const contextValue = {
      actionLoading,
      addToast,
      assignmentActive,
      assignmentClassId,
      assignmentFilterClassId,
      assignmentFilterTeacherId,
      assignmentPage,
      assignmentPageSize,
      assignmentSaving,
      assignmentSubjectInput,
      assignmentTeacherId,
      assignmentTotalPages,
      billingAction,
      billingInterval,
      billingLoading,
      bulkMemberAction,
      bulkSetSchoolVisibility,
      classById,
      classFilter,
      classForm,
      classSaving,
      classes,
      classesLoading,
      confirmBusy,
      confirmDialog,
      confirmReason,
      copyToClipboard,
      dbSubjects,
      allowQuizRetake,
      editingSubjectCode,
      editingSubjectId,
      editingSubjectName,
      editingSubjectSaving,
      exportCSV,
      fetchQuizScores,
      filteredQuizScores,
      filteredSchoolVisibility,
      filteredStudents,
      filteredTeacherAssignments,
      forceChangeAvatar,
      forceChangeLoading,
      forceChangeReason,
      forceChangeUsername,
      formatRelativeTime,
      getRoleBadgeColor,
      handleAddSubject,
      handleAddSubjectTemplate,
      handleAssignTeacher,
      handleBanMember,
      handleBulkMemberAction,
      handleCancelEditSubject,
      handleClearProfileChange,
      handleDeleteSubject,
      handleEditClass,
      handleEnrollStudent,
      handleForceProfileChange,
      handleRemoveMember,
      handleRotateInviteCode,
      handleSaveClass,
      handleSaveEditSubject,
      handleSaveSettings,
      handleStartEditSubject,
      handleSuspendStudent,
      handleUnbanMember,
      handleUnsuspendStudent,
      handleUpdateRole,
      loadAdminTools,
      loadModerationLog,
      loadSchoolVisibility,
      linkCambridgeAttemptStudent,
      loadStudentModStatus,
      loading,
      memberPage,
      memberPageSize,
      memberRoleFilter,
      memberSearch,
      memberSortDirection,
      memberSortKey,
      memberTotalPages,
      members,
      modLog,
      modLogExpanded,
      modLogLoading,
      modTargetStatus,
      pagedStudents,
      pagedTeacherAssignments,
      planDetails,
      quizFilter,
      quizScores,
      quizScoresLoading,
      savingSettings,
      school,
      schoolAdmins,
      currentCapabilities,
      schoolVisibility,
      schoolVisibilityLoading,
      schoolVisibilitySubjectFilter,
      schoolVisibilitySubjects,
      selectedClassId,
      selectedGrade,
      selectedMember,
      selectedMemberIds,
      selectedSchoolTests,
      selectedStudentId,
      setActiveTab,
      setAssignmentActive,
      setAssignmentClassId,
      setAssignmentFilterClassId,
      setAssignmentFilterTeacherId,
      setAssignmentPage,
      setAssignmentPageSize,
      setAssignmentSubjectInput,
      setAssignmentTeacherId,
      setBillingAction,
      setBillingInterval,
      setBillingLoading,
      setBulkMemberAction,
      setClassFilter,
      setClassForm,
      setConfirmBusy,
      setConfirmDialog,
      setConfirmReason,
      setEditingSubjectCode,
      setEditingSubjectName,
      setForceChangeAvatar,
      setForceChangeReason,
      setForceChangeUsername,
      setMemberPage,
      setMemberPageSize,
      setMemberRoleFilter,
      setMemberSearch,
      setModLogExpanded,
      setModTargetId,
      setModTargetStatus,
      setPlanDetails,
      setQuizFilter,
      setSchoolVisibilitySubjectFilter,
      setSelectedClassId,
      setSelectedGrade,
      setSelectedMember,
      setSelectedSchoolTests,
      setSelectedStudentId,
      setSettingsAllowStudent,
      setSettingsAllowTeacher,
      setSettingsName,
      setSettingsLogoFile,
      setSettingsLogoPreview,
      settingsLogoStatus,
      setSettingsLogoStatus,
      setShowMemberActionModal,
      setShowSchoolVisibility,
      setStudentPage,
      setStudentPageSize,
      setStudentSearch,
      setSubjectCode,
      setSubjectName,
      setSuspendDuration,
      setSuspendReason,
      settingsAllowStudent,
      settingsAllowTeacher,
      settingsName,
      settingsLogoFile,
      settingsLogoPreview,
      showMemberActionModal,
      showSchoolVisibility,
      sortedMembers,
      stats,
      studentAssignments,
      studentPage,
      studentPageSize,
      studentSaving,
      studentSearch,
      studentTotalPages,
      students,
      subjectCode,
      subjectName,
      subjectSaving,
      subjectTemplateSaving,
      suspendDuration,
      suspendLoading,
      suspendReason,
      teachers,
      teacherAssignments,
      friendlySchoolAdminError,
      toggleMemberSelection,
      toggleMemberSort,
      toggleSchoolTestVisibility,
      toggleSelectAllMembers,
      uniqueClasses,
      uniqueQuizReports,
  };

  return (
    <SchoolAdminContext.Provider value={contextValue}>
    <div className="school-admin-portal min-h-screen" data-testid="school-admin-portal">
      <header className="school-admin-header">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="school-admin-identity flex items-center gap-3">
            <SchoolBrand brand={createSchoolBrand({ schoolId: school.id, schoolName: school.name, schoolLogoUrl: school.logo_url })} showName={false} imageClassName="relative h-12 w-12 rounded-xl object-contain" />
            <div className="school-admin-identity-copy">
              <p className="school-admin-eyebrow">School administration</p>
              <h1 className="text-2xl font-bold">
                {school.name}
              </h1>
              <span className="school-admin-session">Authorised administrator workspace</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {currentCapabilities?.can_teach && onOpenTeacherPortal && (
              <button type="button" onClick={onOpenTeacherPortal} className="school-admin-workspace-switch">Teacher workspace</button>
            )}
            <button
              onClick={onLogout}
              className="school-admin-signout"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <div className="school-admin-layout">
      <aside className="school-admin-sidebar" aria-label="School administration sections">
        <p className="school-admin-nav-label">Administration</p>
      <nav className="school-admin-tabs" aria-label="School admin navigation">
        {SCHOOL_ADMIN_NAV_ITEMS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => selectAdminTab(tab.id)}
            data-testid={`school-admin-tab-${tab.id}`}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            className={activeTab === tab.id ? 'is-active' : ''}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="school-admin-security-note"><strong>Secure school record</strong><span>Changes are limited to authorised administrators.</span></div>
      </aside>

      <main className="school-admin-content">
      {activeTab === 'dashboard' && stats && <DashboardTab />}
      {activeTab === 'members' && <MembersTab />}
      {activeTab === 'teachers' && <TeachersTab />}
      {activeTab === 'classes' && <OrganisationTab />}
      {activeTab === 'subjects' && <SubjectsTab />}
      {activeTab === 'documents' && <DocumentsTab />}
      {activeTab === 'billing' && <BillingTab />}
      {activeTab === 'settings' && <SettingsTab />}
      {activeTab === 'cambridge' && <CambridgeTab />}
      {activeTab === 'admissions' && <AdmissionHub onComplete={() => selectAdminTab('dashboard')} addToast={addToast} />}

      {/* ─── IELTS Academy Hub ────────────────────────────────────── */}
      {activeTab === 'ielts' && (
        <div className="school-admin-themed-tab school-admin-ielts-tab space-y-5">

          {/* Banner */}
          <section className="admin-section-heading"><div><p className="school-admin-eyebrow">School IELTS suite</p><h2>IELTS Programme</h2><p>{school?.name ?? 'Your school'} — exams, assignments, reviews, results and student progress.</p></div><span className="admin-live-pill"><i /> IELTS enabled</span></section>

          {/* Sub-tab Segmented Control */}
          <div
            className="flex gap-1 overflow-x-auto rounded-2xl border border-gray-700/50 bg-gray-900/70 p-1.5 backdrop-blur-sm"
            role="tablist"
            aria-label="IELTS sections"
            aria-orientation="horizontal"
          >
            {IELTS_TOOL_NAV_ITEMS.map(({ id, icon, label, hint }) => {
              const isActive = activeIeltsSubTab === id;
              const className = `flex min-w-[8.5rem] flex-none flex-col items-center gap-0.5 rounded-xl px-3 py-2.5 transition-all xl:min-w-0 xl:flex-1 ${
                isActive
                  ? 'bg-gradient-to-br from-teal-600 to-blue-700 text-white shadow-lg shadow-teal-500/20'
                  : 'text-gray-400 hover:bg-gray-800/60 hover:text-white'
              }`;

              return (
                <button
                  key={id}
                  ref={(element) => { ieltsTabRefs.current[id] = element; }}
                  type="button"
                  role="tab"
                  id={`school-admin-ielts-tab-${id}`}
                  data-testid={`school-admin-tab-${id}`}
                  aria-selected={activeIeltsSubTab === id}
                  aria-controls={`school-admin-ielts-panel-${id}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => selectIeltsSubTab(id)}
                  onKeyDown={(event) => handleIeltsTabKeyDown(event, id)}
                  className={className}
                >
                  <span aria-hidden="true" className="text-base leading-none">{icon}</span>
                  <span className="text-[13px] font-semibold">{label}</span>
                  <span className={`hidden text-[10px] leading-none sm:block ${
                    activeIeltsSubTab === id ? 'text-teal-100/60' : 'text-gray-600'
                  }`}>{hint}</span>
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div
            id={`school-admin-ielts-panel-${activeIeltsSubTab}`}
            role="tabpanel"
            aria-labelledby={`school-admin-ielts-tab-${activeIeltsSubTab}`}
            tabIndex={0}
            className="rounded-2xl ring-1 ring-teal-500/10"
          >
            {activeIeltsSubTab === 'ielts-exams' && (
              activeIeltsMonitorExamId ? (
                <IeltsExamModeAdminGuard>
                  <React.Suspense fallback={<div className="p-6 text-sm text-gray-400">Loading IELTS exam monitor…</div>}>
                    <IeltsExamMonitor
                      embedded
                      examEventIdOverride={activeIeltsMonitorExamId}
                      onBack={() => selectIeltsMonitor(null, 'replace')}
                    />
                  </React.Suspense>
                </IeltsExamModeAdminGuard>
              ) : (
                <IeltsExamsTab onOpenMonitor={(examEventId) => selectIeltsMonitor(examEventId)} />
              )
            )}
            {activeIeltsSubTab === 'ielts-practice'  && <IeltsPracticeTab onOpenReviews={() => selectIeltsSubTab('ielts-reviews')} />}
            {activeIeltsSubTab === 'ielts-reviews' && (
              <IeltsReviewAdminGuard>
                <React.Suspense fallback={<div className="p-6 text-sm text-gray-400">Loading IELTS reviews…</div>}>
                  {activeIeltsReview ? (
                    <IeltsSubmissionReview
                      embedded
                      skillOverride={activeIeltsReview.skill}
                      attemptIdOverride={activeIeltsReview.attemptId}
                      onBack={() => selectIeltsReview(null, 'replace')}
                    />
                  ) : (
                    <IeltsReviewQueue
                      embedded
                      onOpenReview={selectIeltsReview}
                    />
                  )}
                </React.Suspense>
              </IeltsReviewAdminGuard>
            )}
            {activeIeltsSubTab === 'ielts-results'   && <IeltsResultsTab />}
            {activeIeltsSubTab === 'ielts-student-progress' && (
              <React.Suspense fallback={<div className="p-6 text-sm text-gray-400">Loading student IELTS progress…</div>}>
                <IeltsJourneyDashboard embedded />
              </React.Suspense>
            )}
            {activeIeltsSubTab === 'ielts-settings'  && <IeltsSettingsTab />}
          </div>

        </div>
      )}

      </main>
      </div>

      <nav
        ref={mobileAdminNavigationRef}
        className="school-admin-mobile-bottom-nav"
        onFocus={revealMobileAdminNavigation}
        aria-label="School administration mobile navigation"
      >
        <button
          type="button"
          className="smart-mobile-nav-reveal"
          onClick={revealMobileAdminNavigation}
          aria-label="Show school administration navigation"
        >
          <span aria-hidden="true" />
        </button>
        {SCHOOL_ADMIN_PRIMARY_NAV_ITEMS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => selectAdminTab(tab.id)}
            className={activeTab === tab.id ? 'is-active' : ''}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            aria-label={tab.label}
          >
            <span aria-hidden="true">{tab.icon}</span>
            <small>{tab.mobileLabel}</small>
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            revealMobileAdminNavigation();
            setMobileAdminMenuOpen(true);
          }}
          className={!SCHOOL_ADMIN_PRIMARY_TAB_IDS.has(activeTab as MainAdminTab) ? 'is-active' : ''}
          aria-expanded={mobileAdminMenuOpen}
          aria-label="More school administration sections"
        >
          <span aria-hidden="true">•••</span>
          <small>More</small>
        </button>
      </nav>

      {mobileAdminMenuOpen && typeof document !== 'undefined' && createPortal(
        <div className="school-admin-mobile-menu-layer" role="dialog" aria-modal="true" aria-labelledby="school-admin-mobile-menu-title">
          <button
            type="button"
            className="school-admin-mobile-menu-backdrop"
            onClick={() => setMobileAdminMenuOpen(false)}
            aria-label="Close school administration menu"
          />
          <section className="school-admin-mobile-menu-sheet">
            <div className="school-admin-mobile-menu-heading">
              <div>
                <p>School administration</p>
                <h2 id="school-admin-mobile-menu-title">All sections</h2>
              </div>
              <button type="button" onClick={() => setMobileAdminMenuOpen(false)} aria-label="Close school administration menu">×</button>
            </div>
            <div className="school-admin-mobile-menu-grid">
              {SCHOOL_ADMIN_NAV_ITEMS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => selectAdminTab(tab.id)}
                  className={activeTab === tab.id ? 'is-active' : ''}
                  aria-current={activeTab === tab.id ? 'page' : undefined}
                >
                  <span className="school-admin-mobile-menu-icon" aria-hidden="true">{tab.icon}</span>
                  <span>
                    <strong>{tab.label}</strong>
                    <small>{tab.description}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>,
        document.body,
      )}

      {/* Modals */}
      <MemberActionModal />
      <ConfirmDialogModal />
    </div>
    </SchoolAdminContext.Provider>
  );
};


export default SchoolAdminPortal;
