import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { ToastMessage } from '../types';
import * as SchoolAdminService from '../services/schoolAdminService';
import { supabase } from '../services/supabaseClient';
import ClassRoster from './ClassRoster';
import {
  fetchSchoolPlanDetails,
  startPilot,
  createCheckoutSession,
  invalidateTierCache,
  PAID_PLANS,
  PILOT_PLAN,
  type SchoolPlanDetails,
  type PlanInfo,
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

interface SchoolAdminPortalProps {
  onComplete: () => void;
  onLogout: () => void;
  onNavigate: (view: string) => void;
  addToast: (message: string, type: ToastMessage['type']) => void;
}

type AdminTab = 'dashboard' | 'members' | 'classes' | 'roster' | 'subjects' | 'teachers' | 'students' | 'invites' | 'settings' | 'billing' | 'cambridge';

const SchoolAdminPortal: React.FC<SchoolAdminPortalProps> = ({ onComplete, onLogout, onNavigate, addToast }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [school, setSchool] = useState<SchoolInfo | null>(null);
  const [stats, setStats] = useState<SchoolStats | null>(null);
  const [members, setMembers] = useState<SchoolMember[]>([]);

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
    onConfirm: (reason?: string) => Promise<void> | void;
  } | null>(null);
  const [confirmReason, setConfirmReason] = useState('');
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Settings state
  const [settingsName, setSettingsName] = useState('');
  const [settingsAllowStudent, setSettingsAllowStudent] = useState(true);
  const [settingsAllowTeacher, setSettingsAllowTeacher] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

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
  const [modTargetLoading, setModTargetLoading] = useState(false);
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
      const [classList, teacherList, assignmentsList, studentList, subjectList] = await Promise.all([
        SchoolAdminService.listSchoolClasses(schoolId),
        SchoolAdminService.listSchoolTeachers(schoolId),
        SchoolAdminService.listTeacherAssignments(schoolId),
        SchoolAdminService.listSchoolMembers(schoolId, { role: 'student', limit: 10000 }).then((res) => res.members),
        SchoolAdminService.listSchoolSubjects(schoolId),
      ]);

      setClasses(classList);
      setTeachers(teacherList);
      setTeacherAssignments(assignmentsList);
      setStudents(studentList);
      setDbSubjects(subjectList);

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
  const fetchQuizScores = async () => {
    setQuizScoresLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_school_cambridge_scores', { p_limit: 500 });

      if (error) {
        console.error('Failed to fetch Cambridge scores:', error);
        addToast('Failed to load Cambridge test scores', 'error');
        setQuizScores([]);
        return;
      }

      setQuizScores(data || []);
    } catch (error) {
      console.error('Exception fetching quiz scores:', error);
      addToast('Failed to fetch Cambridge test scores', 'error');
    } finally {
      setQuizScoresLoading(false);
    }
  };

  const deleteQuizSubmission = async (scoreId: string, studentName: string) => {
    setConfirmDialog({
      title: 'Delete Submission',
      description: `Delete submission from ${studentName}? This will allow them to retake the test.`,
      confirmLabel: 'Delete',
      isDestructive: true,
      onConfirm: async () => {
        try {
          const result = await SchoolAdminService.deleteQuizSubmission(scoreId);

          if (!result.success) {
            addToast(`Failed to delete: ${result.error || 'Unknown error'}`, 'error');
            return;
          }

          setQuizScores(prev => prev.filter(score => score.id !== scoreId));
          addToast(`Deleted submission for ${studentName}`, 'success');
        } catch (error: any) {
          console.error('Failed to delete submission:', error);
          addToast(`Failed to delete submission: ${error.message}`, 'error');
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

    const headers = ['Student Name', 'Class', 'Quiz Name', 'Score', 'Total', 'Percentage', 'Time (seconds)', 'Submitted At'];
    const rows = filtered.map(s => [
      s.student_name || '',
      s.student_class || '',
      s.quiz_name || '',
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
    if (quizFilter !== 'all' && s.quiz_name !== quizFilter) return false;
    if (classFilter !== 'all' && (s.student_class || 'Unknown') !== classFilter) return false;
    return true;
  });

  const uniqueQuizNames = Array.from(new Set(quizScores.map(s => s.quiz_name).filter(Boolean)));
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
    
    setActionLoading(true);
    const result = await SchoolAdminService.updateMemberRole(
      school.id,
      selectedMember.user_id,
      newRole
    );
    setActionLoading(false);

    if (result.success) {
      addToast(`Updated ${selectedMember.username}'s role to ${newRole}`, 'success');
      await loadMembers(school.id);
      setShowMemberActionModal(false);
    } else {
      addToast(result.error || 'Failed to update role', 'error');
    }
  };

  const handleRemoveMember = async () => {
    if (!school || !selectedMember) return;
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
          addToast(result.error || 'Failed to remove member', 'error');
        }
      },
    });
  };

  const handleBanMember = async () => {
    if (!school || !selectedMember) return;
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
          addToast(result.error || 'Failed to ban member', 'error');
        }
      },
    });
  };

  const handleUnbanMember = async () => {
    if (!school || !selectedMember) return;
    
    setActionLoading(true);
    const result = await SchoolAdminService.unbanMember(school.id, selectedMember.user_id);
    setActionLoading(false);

    if (result.success) {
      addToast(`Unbanned ${selectedMember.username}`, 'success');
      await loadMembers(school.id);
      await refreshSchool(school.id);
      setShowMemberActionModal(false);
    } else {
      addToast(result.error || 'Failed to unban member', 'error');
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
    setSuspendLoading(true);
    try {
      const result = await SchoolAdminService.suspendStudent(
        modTargetStatus.user_id,
        suspendDuration,
        suspendReason || undefined
      );
      if (result.success) {
        addToast(`Suspended ${modTargetStatus.username} for ${suspendDuration}h`, 'success');
        setSuspendReason('');
        await loadStudentModStatus(modTargetStatus.user_id);
        await loadModerationLog();
        if (school) await loadMembers(school.id);
      } else {
        addToast(result.error || 'Failed to suspend student', 'error');
      }
    } finally {
      setSuspendLoading(false);
    }
  }, [modTargetStatus, suspendDuration, suspendReason, addToast, loadStudentModStatus, loadModerationLog, school]);

  const handleUnsuspendStudent = useCallback(async () => {
    if (!modTargetStatus) return;
    setSuspendLoading(true);
    try {
      const result = await SchoolAdminService.unsuspendStudent(
        modTargetStatus.user_id,
        'Early lift by school admin'
      );
      if (result.success) {
        addToast(`Unsuspended ${modTargetStatus.username}`, 'success');
        await loadStudentModStatus(modTargetStatus.user_id);
        await loadModerationLog();
        if (school) await loadMembers(school.id);
      } else {
        addToast(result.error || 'Failed to unsuspend student', 'error');
      }
    } finally {
      setSuspendLoading(false);
    }
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
          addToast(result.error || 'Failed to rotate invite code', 'error');
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
    const result = await SchoolAdminService.updateSchoolSettings(school.id, {
      name: settingsName,
      allow_student_signup: settingsAllowStudent,
      allow_teacher_signup: settingsAllowTeacher,
    });
    setSavingSettings(false);

    if (result.success) {
      addToast('Settings saved successfully', 'success');
      await refreshSchool(school.id);
    } else {
      addToast(result.error || 'Failed to save settings', 'error');
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
      addToast(result.error || 'Failed to save class', 'error');
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
      assignmentActive
    );
    setAssignmentSaving(false);

    if (!result.success) {
      addToast(result.error || 'Failed to assign teacher', 'error');
      return;
    }

    addToast('Teacher assigned successfully', 'success');
    setAssignmentClassId('');
    setAssignmentTeacherId('');
    setAssignmentSubjectInput('');
    await loadAdminTools(school.id);
  };

  const handleEnrollStudent = async () => {
    if (!school) return;
    if (!selectedStudentId || !selectedClassId) {
      addToast('Select a student and class', 'error');
      return;
    }

    const enrolledStudentId = selectedStudentId;
    const enrolledClassId = selectedClassId;

    // Use the new RPC with optional grade
    setStudentSaving(true);
    const result = await SchoolAdminService.moveStudentToClassViaRPC(
      selectedStudentId,
      selectedClassId,
      selectedGrade ? Number(selectedGrade) : undefined
    );
    setStudentSaving(false);

    if (!result.success) {
      addToast(result.error || 'Failed to enroll student', 'error');
      return;
    }

    addToast('Student enrolled successfully', 'success');
    
    // Immediately update local state to reflect the assignment
    setStudentAssignments((prev) => ({
      ...prev,
      [enrolledStudentId]: enrolledClassId,
    }));
    
    // Reset form
    setSelectedStudentId('');
    setSelectedGrade('');
    setSelectedClassId('');
    
    // Wait longer for DB replication, then refresh with race condition protection
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Refresh data but preserve optimistic update if DB hasn't caught up yet
    setClassesLoading(true);
    try {
      const classIds = classes.map((cls) => cls.id);
      const studentRows = await SchoolAdminService.listClassStudents(classIds, school?.id);
      const assignmentMap: Record<string, string | null> = {};
      studentRows.forEach((row) => {
        assignmentMap[row.student_id] = row.class_id;
      });
      
      // Only update with fresh data if it contains our new assignment
      // Otherwise keep the optimistic update to avoid race condition flicker
      if (assignmentMap[enrolledStudentId]) {
        setStudentAssignments(assignmentMap);
      } else {
        // Database hasn't replicated yet, keep optimistic update
        setStudentAssignments((prev) => ({
          ...assignmentMap,
          [enrolledStudentId]: enrolledClassId, // Preserve optimistic update
        }));
      }
    } catch (err) {
      console.error('Error refreshing student assignments:', err);
      // Keep optimistic update on error
    } finally {
      setClassesLoading(false);
    }
  };

  // ============================================
  // Subject Management Handlers (DB-Driven)
  // ============================================

  const handleAddSubject = async () => {
    if (!school || !subjectName.trim()) {
      addToast('Subject name is required', 'error');
      return;
    }

    setSubjectSaving(true);
    const result = await SchoolAdminService.createSchoolSubject(
      school.id,
      subjectName,
      subjectCode || undefined
    );
    setSubjectSaving(false);

    if (!result.success) {
      addToast(result.error || 'Failed to create subject', 'error');
      return;
    }

    addToast(`Subject "${subjectName}" created successfully`, 'success');
    setSubjectName('');
    setSubjectCode('');
    await loadAdminTools(school.id);
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
          addToast(result.error || 'Failed to delete subject', 'error');
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
      addToast(result.error || 'Failed to update subject', 'error');
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
    const selectedMembers = members.filter((member) => selectedMemberIds.has(member.user_id));
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

  return (
    <div className="school-admin-portal min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-slate-900 text-white p-4 pb-24">
      {/* Premium Header - Fixed and Clean */}
      <div className="school-admin-header mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            {school.logo_url ? (
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-cyan-500 rounded-lg blur-sm opacity-40" />
                <img 
                  src={school.logo_url} 
                  alt={school.name} 
                  className="relative h-12 w-12 rounded-lg object-cover border-2 border-purple-400/50 shadow-lg" 
                />
              </div>
            ) : (
              <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-purple-600 to-cyan-600 flex items-center justify-center text-xl shadow-lg">
                🏫
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold text-white drop-shadow-md">
                {school.name}
              </h1>
              <span className="px-2 py-0.5 bg-gradient-to-r from-purple-600 to-purple-500 text-white text-xs font-semibold rounded-full shadow-lg inline-block">
                ⭐ SCHOOL ADMIN
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate('admissions')}
              className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-cyan-500/20"
            >
              🎓 Admissions Hub
            </button>
            <button
              onClick={onLogout}
              className="px-4 py-2 bg-gray-700 hover:bg-red-600 text-gray-300 hover:text-white rounded-lg text-sm font-medium transition-all"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Premium Tab Navigation */}
      <div className="school-admin-tabs flex flex-wrap gap-2 mb-8 pb-2" role="tablist" aria-label="School admin navigation">
        {(['dashboard', 'members', 'classes', 'roster', 'subjects', 'teachers', 'students', 'invites', 'billing', 'settings', 'cambridge'] as AdminTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            role="tab"
            aria-selected={activeTab === tab}
            className={`px-4 py-2 sm:px-5 sm:py-3 rounded-xl font-medium transition-all text-sm sm:text-base border ${
              activeTab === tab
                ? 'bg-gradient-to-r from-purple-600 to-cyan-600 text-white border-transparent shadow-lg shadow-purple-500/25'
                : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50 border-gray-700/50 hover:text-white hover:border-gray-600'
            }`}
          >
            {tab === 'dashboard' && '📊 Dashboard'}
            {tab === 'members' && `👥 Members (${membersTotal})`}
            {tab === 'classes' && '🏫 Classes'}
            {tab === 'roster' && '📋 Roster'}
            {tab === 'subjects' && '📚 Subjects'}
            {tab === 'teachers' && '🧑‍🏫 Teachers'}
            {tab === 'students' && '🎒 Students'}
            {tab === 'invites' && '🔑 Invites'}
            {tab === 'billing' && '💳 Plan & Billing'}
            {tab === 'settings' && '⚙️ Settings'}
            {tab === 'cambridge' && '📚 Cambridge'}
          </button>
        ))}
      </div>

      {/* Dashboard Tab */}
      {activeTab === 'dashboard' && stats && (
        <div className="space-y-8">
          {/* Premium Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-800/80 backdrop-blur-sm rounded-2xl p-5 border border-cyan-500/30 hover:border-cyan-500/50 transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="text-3xl">🎓</span>
                <span className="text-xs text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full">Active</span>
              </div>
              <div className="text-4xl font-bold text-cyan-400">{stats.students}</div>
              <div className="text-gray-400 text-sm mt-1">Students Enrolled</div>
            </div>

            <div className="bg-gray-800/80 backdrop-blur-sm rounded-2xl p-5 border border-blue-500/30 hover:border-blue-500/50 transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="text-3xl">👨‍🏫</span>
                <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">Active</span>
              </div>
              <div className="text-4xl font-bold text-blue-400">{stats.teachers}</div>
              <div className="text-gray-400 text-sm mt-1">Teachers</div>
            </div>

            <div className="bg-gray-800/80 backdrop-blur-sm rounded-2xl p-5 border border-purple-500/30 hover:border-purple-500/50 transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="text-3xl">👑</span>
                <span className="text-xs text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full">Admin</span>
              </div>
              <div className="text-4xl font-bold text-purple-400">{stats.admins}</div>
              <div className="text-gray-400 text-sm mt-1">School Admins</div>
            </div>

            <div className="bg-gray-800/80 backdrop-blur-sm rounded-2xl p-5 border border-green-500/30 hover:border-green-500/50 transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="text-3xl">🌟</span>
                <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">Total</span>
              </div>
              <div className="text-4xl font-bold text-green-400">{stats.total}</div>
              <div className="text-gray-400 text-sm mt-1">Total Members</div>
            </div>
          </div>

          {/* Quick Actions - Premium Style */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/50">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <span className="text-2xl">⚡</span> Quick Actions
            </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={() => setActiveTab('invites')}
                  className="group relative overflow-hidden p-4 rounded-xl bg-gradient-to-br from-cyan-600/20 to-cyan-500/10 border border-cyan-500/30 hover:border-cyan-500/60 transition-all hover:scale-[1.02]"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/0 to-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative flex items-center gap-3">
                    <div className="text-3xl">🔑</div>
                    <div className="text-left">
                      <div className="font-semibold text-white">Invite Code</div>
                      <div className="text-xs text-gray-400">Share school access</div>
                    </div>
                  </div>
                </button>
                
                <button
                  onClick={() => setActiveTab('members')}
                  className="group relative overflow-hidden p-4 rounded-xl bg-gradient-to-br from-purple-600/20 to-purple-500/10 border border-purple-500/30 hover:border-purple-500/60 transition-all hover:scale-[1.02]"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-500/0 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative flex items-center gap-3">
                    <div className="text-3xl">👥</div>
                    <div className="text-left">
                      <div className="font-semibold text-white">Manage Members</div>
                      <div className="text-xs text-gray-400">View & edit roles</div>
                    </div>
                  </div>
                </button>
                
                <button
                  onClick={() => setActiveTab('classes')}
                  className="group relative overflow-hidden p-4 rounded-xl bg-gradient-to-br from-blue-600/20 to-blue-500/10 border border-blue-500/30 hover:border-blue-500/60 transition-all hover:scale-[1.02]"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 to-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative flex items-center gap-3">
                    <div className="text-3xl">🏫</div>
                    <div className="text-left">
                      <div className="font-semibold text-white">Manage Classes</div>
                      <div className="text-xs text-gray-400">Create & organize</div>
                    </div>
                  </div>
                </button>
              </div>
          </div>
          
          {/* Power User Tips */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-amber-500/30">
              <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                <span className="text-xl">💡</span> Admin Power Tips
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="flex items-start gap-2 text-gray-300">
                  <span className="text-amber-400">•</span>
                  <span>Use <strong>Teacher Assignments</strong> to assign teachers to specific classes and subjects</span>
                </div>
                <div className="flex items-start gap-2 text-gray-300">
                  <span className="text-amber-400">•</span>
                  <span>Use <strong>Student Enrollment</strong> to move students between classes</span>
                </div>
                <div className="flex items-start gap-2 text-gray-300">
                  <span className="text-amber-400">•</span>
                  <span>Share the <strong>Invite Code</strong> to let new users join your school</span>
                </div>
                <div className="flex items-start gap-2 text-gray-300">
                  <span className="text-amber-400">•</span>
                  <span>Control signup permissions in <strong>Settings</strong> for security</span>
                </div>
              </div>
          </div>
        </div>
      )}

      {/* Members Tab */}
      {activeTab === 'members' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-4 items-center">
            <label htmlFor="member-search" className="sr-only">
              Search members
            </label>
            <input
              id="member-search"
              type="text"
              placeholder="Search by username or email..."
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              className="flex-1 min-w-[200px] px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/40"
            />
            <label htmlFor="member-role-filter" className="sr-only">
              Filter by role
            </label>
            <select
              id="member-role-filter"
              value={memberRoleFilter}
              onChange={(e) => setMemberRoleFilter(e.target.value as SchoolRole | '')}
              className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/40"
            >
              <option value="">All Roles</option>
              <option value="student">Students</option>
              <option value="teacher">Teachers</option>
              <option value="school_admin">Admins</option>
            </select>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span>Rows:</span>
              <select
                value={memberPageSize}
                onChange={(e) => setMemberPageSize(Number(e.target.value))}
                className="px-2 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>

          {/* Bulk Actions */}
          <div className="flex flex-wrap items-center gap-3 bg-gray-800/60 border border-gray-700 rounded-lg px-4 py-3">
            <span className="text-sm text-gray-400">
              {selectedMemberIds.size} selected
            </span>
            <select
              value={bulkMemberAction}
              onChange={(e) => setBulkMemberAction(e.target.value)}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="">Bulk actions</option>
              <option value="role:student">Change role → Student</option>
              <option value="role:teacher">Change role → Teacher</option>
              <option value="role:school_admin">Change role → Admin</option>
              <option value="ban">Ban selected</option>
              <option value="unban">Unban selected</option>
              <option value="remove">Remove from school</option>
            </select>
            <button
              onClick={handleBulkMemberAction}
              disabled={!bulkMemberAction || selectedMemberIds.size === 0 || actionLoading}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg text-sm font-medium"
            >
              Apply
            </button>
          </div>

          {/* Members List */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-750 border-b border-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={members.length > 0 && members.every((member) => selectedMemberIds.has(member.user_id))}
                          onChange={(e) => toggleSelectAllMembers(members.map((m) => m.user_id), e.target.checked)}
                          className="rounded border-gray-600 bg-gray-700 text-cyan-500 focus:ring-cyan-500"
                          aria-label="Select all members on this page"
                        />
                        <button
                          type="button"
                          onClick={() => toggleMemberSort('username')}
                          className="inline-flex items-center gap-1 hover:text-white"
                        >
                          User
                          <span className="text-xs">{memberSortKey === 'username' ? (memberSortDirection === 'asc' ? '▲' : '▼') : ''}</span>
                        </button>
                      </label>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">
                      <button
                        type="button"
                        onClick={() => toggleMemberSort('role')}
                        className="inline-flex items-center gap-1 hover:text-white"
                      >
                        Role
                        <span className="text-xs">{memberSortKey === 'role' ? (memberSortDirection === 'asc' ? '▲' : '▼') : ''}</span>
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 hidden md:table-cell">
                      <button
                        type="button"
                        onClick={() => toggleMemberSort('grade')}
                        className="inline-flex items-center gap-1 hover:text-white"
                      >
                        Grade
                        <span className="text-xs">{memberSortKey === 'grade' ? (memberSortDirection === 'asc' ? '▲' : '▼') : ''}</span>
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 hidden lg:table-cell">
                      <button
                        type="button"
                        onClick={() => toggleMemberSort('level')}
                        className="inline-flex items-center gap-1 hover:text-white"
                      >
                        Level
                        <span className="text-xs">{memberSortKey === 'level' ? (memberSortDirection === 'asc' ? '▲' : '▼') : ''}</span>
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 hidden lg:table-cell">
                      <button
                        type="button"
                        onClick={() => toggleMemberSort('last_seen')}
                        className="inline-flex items-center gap-1 hover:text-white"
                      >
                        Last Seen
                        <span className="text-xs">{memberSortKey === 'last_seen' ? (memberSortDirection === 'asc' ? '▲' : '▼') : ''}</span>
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">
                      <button
                        type="button"
                        onClick={() => toggleMemberSort('status')}
                        className="inline-flex items-center gap-1 hover:text-white"
                      >
                        Status
                        <span className="text-xs">{memberSortKey === 'status' ? (memberSortDirection === 'asc' ? '▲' : '▼') : ''}</span>
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {sortedMembers.map((member) => (
                    <tr key={member.user_id} className="hover:bg-gray-750">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={selectedMemberIds.has(member.user_id)}
                            onChange={() => toggleMemberSelection(member.user_id)}
                            className="rounded border-gray-600 bg-gray-700 text-cyan-500 focus:ring-cyan-500"
                            aria-label={`Select ${member.username}`}
                          />
                          <img
                            src={member.avatar_url || '/avatars/default.png'}
                            alt={member.username}
                            className="w-8 h-8 rounded-full bg-gray-700"
                          />
                          <div>
                            <div className="font-medium text-white">{member.username}</div>
                            <div className="text-xs text-gray-500">{member.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(member.role)}`}>
                          {member.role.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 hidden md:table-cell">
                        {member.grade ? `Grade ${member.grade}${member.batch ? ` (${member.batch})` : ''}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-400 hidden lg:table-cell">
                        Lvl {member.level} ({member.xp.toLocaleString()} XP)
                      </td>
                      <td className="px-4 py-3 text-gray-400 hidden lg:table-cell">
                        {formatRelativeTime(member.last_seen)}
                      </td>
                      <td className="px-4 py-3">
                        {member.is_banned ? (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-500/20 text-red-400">
                            Banned
                          </span>
                        ) : member.banned_until && new Date(member.banned_until) > new Date() ? (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400" title={`Until ${new Date(member.banned_until).toLocaleString()}`}>
                            Suspended
                          </span>
                        ) : member.required_changes ? (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">
                            Change Req
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => {
                            setSelectedMember(member);
                            setShowMemberActionModal(true);
                            // Auto-load moderation status for students
                            if (member.role === 'student') {
                              setModTargetId(member.user_id);
                              loadStudentModStatus(member.user_id);
                            } else {
                              setModTargetStatus(null);
                            }
                          }}
                          className="text-cyan-400 hover:text-cyan-300 text-sm"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {members.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-700 text-sm text-gray-400">
                <span>
                  Page {memberPage} of {memberTotalPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setMemberPage((prev) => Math.max(1, prev - 1))}
                    disabled={memberPage === 1}
                    className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setMemberPage((prev) => Math.min(memberTotalPages, prev + 1))}
                    disabled={memberPage >= memberTotalPages}
                    className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
            {members.length === 0 && (
              <div className="p-8 text-center text-gray-500">
                No members found matching your criteria
              </div>
            )}
          </div>

          {/* Collapsible Moderation Audit Log */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <button
              onClick={() => {
                setModLogExpanded(!modLogExpanded);
                if (!modLogExpanded && modLog.length === 0) loadModerationLog();
              }}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-700/50 transition-colors"
            >
              <h3 className="text-lg font-semibold text-gray-200">📋 Moderation Log</h3>
              <span className="text-gray-400 text-sm">{modLogExpanded ? '▲ Collapse' : '▼ Expand'}</span>
            </button>
            {modLogExpanded && (
              <div className="px-6 pb-4">
                <div className="flex justify-end mb-3">
                  <button
                    onClick={loadModerationLog}
                    disabled={modLogLoading}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg text-sm transition-colors"
                  >
                    {modLogLoading ? 'Loading...' : 'Refresh'}
                  </button>
                </div>
                {modLog.length === 0 && !modLogLoading && (
                  <p className="text-sm text-gray-500">No moderation actions recorded yet.</p>
                )}
                {modLog.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-400 border-b border-gray-700">
                          <th className="pb-2 pr-4">When</th>
                          <th className="pb-2 pr-4">Admin</th>
                          <th className="pb-2 pr-4">Action</th>
                          <th className="pb-2 pr-4">Student</th>
                          <th className="pb-2">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-700/50">
                        {modLog.map((entry) => (
                          <tr key={entry.id} className="text-gray-300 hover:bg-gray-700/30">
                            <td className="py-2 pr-4 whitespace-nowrap text-xs text-gray-500">
                              {new Date(entry.created_at).toLocaleString()}
                            </td>
                            <td className="py-2 pr-4 whitespace-nowrap">{entry.actor_username}</td>
                            <td className="py-2 pr-4 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                entry.action === 'student_suspended' ? 'bg-amber-600/30 text-amber-300' :
                                entry.action === 'student_unsuspended' ? 'bg-green-600/30 text-green-300' :
                                entry.action === 'force_profile_change' ? 'bg-yellow-600/30 text-yellow-300' :
                                'bg-gray-600/30 text-gray-300'
                              }`}>
                                {entry.action.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="py-2 pr-4 whitespace-nowrap">{entry.target_username}</td>
                            <td className="py-2 text-xs text-gray-500 max-w-[300px] truncate">
                              {entry.details?.reason || entry.details?.duration_hours ? `${entry.details.duration_hours ? entry.details.duration_hours + 'h — ' : ''}${entry.details.reason || ''}` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'classes' && (
        <div className="space-y-6">
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 className="text-lg font-semibold mb-4">{classForm.id ? 'Edit Class' : 'Create Class'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Class Code</label>
                <input
                  type="text"
                  value={classForm.class_code}
                  onChange={(e) => setClassForm((prev) => ({ ...prev, class_code: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  placeholder="e.g. 9A"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-400 mb-1">Class Name</label>
                <input
                  type="text"
                  value={classForm.class_name}
                  onChange={(e) => setClassForm((prev) => ({ ...prev, class_name: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  placeholder="e.g. Grade 9 Blue"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Grade Level</label>
                <input
                  type="number"
                  value={classForm.grade_level}
                  onChange={(e) => setClassForm((prev) => ({ ...prev, grade_level: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  placeholder="9"
                />
              </div>
            </div>
            <div className="flex items-center gap-4 mt-4">
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={classForm.is_active}
                  onChange={(e) => setClassForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                  className="rounded border-gray-600 bg-gray-700 text-cyan-500 focus:ring-cyan-500"
                />
                Active
              </label>
              <button
                onClick={handleSaveClass}
                disabled={classSaving}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg transition-colors font-medium"
              >
                {classSaving ? 'Saving...' : classForm.id ? 'Update Class' : 'Create Class'}
              </button>
              {classForm.id && (
                <button
                  onClick={() => setClassForm({ id: '', class_code: '', class_name: '', grade_level: '', is_active: true })}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-sm"
                >
                  Cancel Edit
                </button>
              )}
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-300">Classes in School</h4>
              {classesLoading && <span className="text-xs text-gray-500">Refreshing...</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-750 border-b border-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Code</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Grade</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {classes.map((schoolClass) => (
                    <tr key={schoolClass.id} className="hover:bg-gray-750">
                      <td className="px-4 py-3 text-sm text-white font-semibold">{schoolClass.class_code}</td>
                      <td className="px-4 py-3 text-sm text-gray-200">{schoolClass.class_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {schoolClass.grade_level ? `Grade ${schoolClass.grade_level}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${schoolClass.is_active ? 'bg-green-500/20 text-green-300' : 'bg-gray-600/40 text-gray-300'}`}>
                          {schoolClass.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          onClick={() => handleEditClass(schoolClass)}
                          className="text-cyan-400 hover:text-cyan-300 text-sm"
                        >
                          Edit
                        </button>
                        {schoolClass.is_active && (
                          <button
                            onClick={() => {
                              setConfirmReason('');
                              setConfirmDialog({
                                title: 'Archive Class',
                                description: `Archive "${schoolClass.class_name}" (${schoolClass.class_code})? This will make it inactive. You can reactivate it later by editing.`,
                                confirmLabel: 'Archive',
                                cancelLabel: 'Cancel',
                                isDestructive: true,
                                onConfirm: async () => {
                                  if (!school) return;
                                  const result = await SchoolAdminService.archiveSchoolClass(school.id, schoolClass.id);
                                  if (result.success) {
                                    addToast('Class archived successfully', 'success');
                                    await loadAdminTools(school.id);
                                  } else {
                                    addToast(`Failed to archive: ${result.error}`, 'error');
                                  }
                                },
                              });
                            }}
                            className="text-amber-400 hover:text-amber-300 text-sm"
                          >
                            Archive
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {classes.length === 0 && (
              <div className="p-8 text-center text-gray-400">No classes created yet.</div>
            )}
          </div>
        </div>
      )}

      {/* Class Roster Tab - Full Student Management */}
      {activeTab === 'roster' && school && (
        <ClassRoster
          schoolId={school.id}
          addToast={addToast}
          onRefresh={() => loadAdminTools(school.id)}
        />
      )}

      {/* Subjects Tab - DB-DRIVEN */}
      {activeTab === 'subjects' && (
        <div className="space-y-6">
          {/* Add Subject Form */}
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 className="text-lg font-semibold mb-4">Add New Subject</h3>
            <p className="text-sm text-gray-400 mb-4">
              Create subjects that teachers can be assigned to. All subjects are stored in the database.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-400 mb-1">Subject Name *</label>
                <input
                  type="text"
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !subjectSaving) {
                      handleAddSubject();
                    }
                  }}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  placeholder="e.g., Mathematics, Physics, English Literature"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Code (Optional)</label>
                <input
                  type="text"
                  value={subjectCode}
                  onChange={(e) => setSubjectCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !subjectSaving) {
                      handleAddSubject();
                    }
                  }}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  placeholder="e.g., MATH, PHYS"
                />
              </div>
            </div>
            <button
              onClick={handleAddSubject}
              disabled={subjectSaving || !subjectName.trim()}
              className="mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors font-medium"
            >
              {subjectSaving ? 'Adding...' : 'Add Subject'}
            </button>
          </div>

          {/* Subjects List */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-700">
              <h4 className="text-sm font-semibold text-gray-300">Active Subjects ({dbSubjects.length})</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-750 border-b border-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Subject Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Code</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Created</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {dbSubjects.map((subject) => (
                    <tr key={subject.id} className="hover:bg-gray-750">
                      {editingSubjectId === subject.id ? (
                        <>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={editingSubjectName}
                              onChange={(e) => setEditingSubjectName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEditSubject();
                                if (e.key === 'Escape') handleCancelEditSubject();
                              }}
                              className="w-full px-2 py-1 bg-gray-700 border border-cyan-500 rounded text-white text-sm focus:outline-none"
                              autoFocus
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={editingSubjectCode}
                              onChange={(e) => setEditingSubjectCode(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEditSubject();
                                if (e.key === 'Escape') handleCancelEditSubject();
                              }}
                              className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-cyan-500"
                              placeholder="Code"
                            />
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {new Date(subject.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-right space-x-2">
                            <button
                              onClick={handleSaveEditSubject}
                              disabled={editingSubjectSaving || !editingSubjectName.trim()}
                              className="text-green-400 hover:text-green-300 text-sm font-medium disabled:opacity-50"
                            >
                              {editingSubjectSaving ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={handleCancelEditSubject}
                              className="text-gray-400 hover:text-gray-300 text-sm"
                            >
                              Cancel
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-sm text-gray-200 font-medium">📚 {subject.name}</td>
                          <td className="px-4 py-3 text-sm text-gray-400">{subject.code || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {new Date(subject.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-right space-x-2">
                            <button
                              onClick={() => handleStartEditSubject(subject)}
                              className="text-cyan-400 hover:text-cyan-300 text-sm font-medium"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteSubject(subject.id, subject.name)}
                              className="text-red-400 hover:text-red-300 text-sm font-medium"
                            >
                              Delete
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {dbSubjects.length === 0 && (
              <div className="p-8 text-center text-gray-400">
                No subjects added yet. Add subjects to enable teacher assignments.
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'teachers' && (
        <div className="space-y-6">
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 className="text-lg font-semibold mb-4">Assign Teacher to Class + Subject</h3>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Class</label>
                <select
                  value={assignmentClassId}
                  onChange={(e) => setAssignmentClassId(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="">Select class</option>
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.class_code} — {cls.class_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Teacher</label>
                <select
                  value={assignmentTeacherId}
                  onChange={(e) => setAssignmentTeacherId(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="">Select teacher</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.user_id} value={teacher.user_id}>
                      {teacher.username}
                    </option>
                  ))}
                </select>
              </div>
              <div className="lg:col-span-2">
                <label className="block text-sm font-medium text-gray-400 mb-1">Subject</label>
                <select
                  value={assignmentSubjectInput}
                  onChange={(e) => setAssignmentSubjectInput(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="">Select subject</option>
                  {dbSubjects.map((subject) => (
                    <option key={subject.id} value={subject.name}>
                      {subject.name} {subject.code && `(${subject.code})`}
                    </option>
                  ))}
                </select>
                {dbSubjects.length === 0 && (
                  <p className="text-xs text-yellow-500 mt-1">
                    ⚠️ No subjects available. Go to the Subjects tab to add some.
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4 mt-4">
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={assignmentActive}
                  onChange={(e) => setAssignmentActive(e.target.checked)}
                  className="rounded border-gray-600 bg-gray-700 text-cyan-500 focus:ring-cyan-500"
                />
                Active assignment
              </label>
              <button
                onClick={handleAssignTeacher}
                disabled={assignmentSaving || !assignmentClassId || !assignmentTeacherId || !assignmentSubjectInput}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg transition-colors font-medium"
              >
                {assignmentSaving ? 'Assigning...' : 'Assign Teacher'}
              </button>
            </div>
            {teachers.length === 0 && (
              <p className="text-xs text-gray-500 mt-3">No teachers found for this school yet.</p>
            )}
          </div>

          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-700 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <h4 className="text-sm font-semibold text-gray-300">Current Assignments</h4>
              <div className="flex flex-wrap gap-3">
                <select
                  value={assignmentPageSize}
                  onChange={(e) => setAssignmentPageSize(Number(e.target.value))}
                  className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-xs text-white"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                </select>
                <select
                  value={assignmentFilterClassId}
                  onChange={(e) => setAssignmentFilterClassId(e.target.value)}
                  className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-xs text-white"
                >
                  <option value="">All classes</option>
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.class_code}
                    </option>
                  ))}
                </select>
                <select
                  value={assignmentFilterTeacherId}
                  onChange={(e) => setAssignmentFilterTeacherId(e.target.value)}
                  className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-xs text-white"
                >
                  <option value="">All teachers</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.user_id} value={teacher.user_id}>
                      {teacher.username}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-750 border-b border-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Class</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Teacher</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Subject</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {pagedTeacherAssignments.map((assignment) => {
                    const cls = classById[assignment.class_id];
                    const teacher = teachers.find((t) => t.user_id === assignment.teacher_user_id);
                    return (
                      <tr key={assignment.id} className="hover:bg-gray-750">
                        <td className="px-4 py-3 text-sm text-gray-200">
                          {cls ? `${cls.class_code} — ${cls.class_name}` : <span className="text-yellow-400 italic text-xs">Unknown class</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-200">
                          {teacher ? (
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{teacher.username}</span>
                              {teacher.verified && <span className="text-cyan-400 text-xs">✓</span>}
                            </div>
                          ) : (
                            <span className="text-yellow-400 italic text-xs">Unknown teacher</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300">{assignment.subject}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${assignment.active ? 'bg-green-500/20 text-green-300' : 'bg-gray-600/40 text-gray-300'}`}>
                            {assignment.active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => {
                              setConfirmReason('');
                              setConfirmDialog({
                                title: 'Delete assignment',
                                description: `Remove ${teacher?.username || 'this teacher'} from teaching ${assignment.subject} in ${cls?.class_code || 'this class'}?`,
                                confirmLabel: 'Delete assignment',
                                cancelLabel: 'Cancel',
                                isDestructive: true,
                                onConfirm: async () => {
                                  const result = await SchoolAdminService.deleteTeacherAssignment(assignment.id, school?.id);
                                  if (result.success) {
                                    addToast('Assignment deleted successfully', 'success');
                                    if (school) await loadAdminTools(school.id);
                                  } else {
                                    addToast(`Failed to delete: ${result.error}`, 'error');
                                  }
                                },
                              });
                            }}
                            className="text-red-400 hover:text-red-300 text-sm font-medium"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredTeacherAssignments.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-700 text-sm text-gray-400">
                <span>
                  Page {assignmentPage} of {assignmentTotalPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAssignmentPage((prev) => Math.max(1, prev - 1))}
                    disabled={assignmentPage === 1}
                    className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setAssignmentPage((prev) => Math.min(assignmentTotalPages, prev + 1))}
                    disabled={assignmentPage >= assignmentTotalPages}
                    className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
            {filteredTeacherAssignments.length === 0 && (
              <div className="p-8 text-center text-gray-400">No assignments found.</div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'students' && (
        <div className="space-y-6">
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 className="text-lg font-semibold mb-4">Enroll or Move Student</h3>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Student</label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => {
                    const studentId = e.target.value;
                    setSelectedStudentId(studentId);
                    // Auto-fill grade from student's current grade
                    const student = students.find(s => s.user_id === studentId);
                    setSelectedGrade(student?.grade ? Number(student.grade) : '');
                    setSelectedClassId(studentAssignments[studentId] || '');
                  }}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="">Select student</option>
                  {students.map((student) => (
                    <option key={student.user_id} value={student.user_id}>
                      {student.username} (Grade {student.grade || 'N/A'})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Grade</label>
                <select
                  value={selectedGrade || ''}
                  onChange={(e) => {
                    const gradeValue = e.target.value.trim();
                    const grade = gradeValue ? Number(gradeValue) : '';
                    setSelectedGrade(grade);
                    // Reset class selection when grade changes
                    setSelectedClassId('');
                  }}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="">Select grade</option>
                  {[6, 7, 8, 9, 10, 11, 12].map((grade) => (
                    <option key={grade} value={String(grade)}>
                      Grade {grade}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Class</label>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="">Select class</option>
                  {classes
                    .filter((cls) => {
                      // Show all classes if no grade selected
                      if (!selectedGrade && selectedGrade !== 0) return true;
                      
                      // Convert both to numbers for comparison (handles string/number mismatch)
                      const selectedGradeNum = Number(selectedGrade);
                      const classGradeNum = Number(cls.grade_level);
                      
                      // Use loose equality to compare numbers
                      return classGradeNum == selectedGradeNum;
                    })
                    .map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.class_code} — {cls.class_name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleEnrollStudent}
                  disabled={studentSaving}
                  className="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg transition-colors font-medium"
                >
                  {studentSaving ? 'Saving...' : 'Save Enrollment'}
                </button>
              </div>
            </div>
            {selectedStudentId && (
              <p className="text-xs text-gray-500 mt-2">
                Current class:{' '}
                {studentAssignments[selectedStudentId] && classById[studentAssignments[selectedStudentId] || '']
                  ? `${classById[studentAssignments[selectedStudentId] || '']?.class_code}`
                  : 'None'}
              </p>
            )}
          </div>

          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-700 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <h4 className="text-sm font-semibold text-gray-300">Students in School</h4>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="student-search" className="sr-only">
                  Search students
                </label>
                <input
                  id="student-search"
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Search students..."
                  className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-xs text-white"
                />
                <select
                  value={studentPageSize}
                  onChange={(e) => setStudentPageSize(Number(e.target.value))}
                  className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-xs text-white"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-750 border-b border-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Student</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Class</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {pagedStudents.map((student) => {
                    const classId = studentAssignments[student.user_id];
                    const cls = classId ? classById[classId] : null;
                    return (
                      <tr key={student.user_id} className="hover:bg-gray-750">
                        <td className="px-4 py-3 text-sm text-gray-200">{student.username}</td>
                        <td className="px-4 py-3 text-sm text-gray-400">{student.email}</td>
                        <td className="px-4 py-3 text-sm text-gray-300">
                          {cls ? `${cls.class_code} — ${cls.class_name}` : 'Unassigned'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => {
                              setSelectedStudentId(student.user_id);
                              setSelectedClassId(classId || '');
                            }}
                            className="text-cyan-400 hover:text-cyan-300 text-sm"
                          >
                            Select
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredStudents.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-700 text-sm text-gray-400">
                <span>
                  Page {studentPage} of {studentTotalPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setStudentPage((prev) => Math.max(1, prev - 1))}
                    disabled={studentPage === 1}
                    className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setStudentPage((prev) => Math.min(studentTotalPages, prev + 1))}
                    disabled={studentPage >= studentTotalPages}
                    className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
            {filteredStudents.length === 0 && (
              <div className="p-8 text-center text-gray-400">No students found.</div>
            )}
          </div>
        </div>
      )}

      {/* Invites Tab */}
      {activeTab === 'invites' && (
        <div className="space-y-4">
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 className="text-lg font-semibold mb-4">Current Invite Code</h3>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  className="font-mono text-2xl font-bold text-cyan-400 hover:text-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 rounded-lg"
                  onClick={() => copyToClipboard(school.invite_code || '')}
                  aria-label="Copy invite code"
                >
                  {school.invite_code || 'No code'}
                </button>
                <div className="text-sm text-gray-400">
                  Share this with teachers/students to join.
                </div>
              </div>
              <button
                onClick={handleRotateInviteCode}
                disabled={actionLoading}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg transition-colors font-medium"
              >
                {actionLoading ? 'Rotating...' : 'Rotate Code'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Rotating invalidates the old code immediately.
            </p>
          </div>
        </div>
      )}


      {/* Billing & Plan Tab */}
      {activeTab === 'billing' && (
        <BillingTab
          planDetails={planDetails}
          loading={billingLoading}
          billingAction={billingAction}
          billingInterval={billingInterval}
          setBillingInterval={setBillingInterval}
          onRefreshPlan={async () => {
            setBillingLoading(true);
            const details = await fetchSchoolPlanDetails();
            setPlanDetails(details);
            setBillingLoading(false);
          }}
          onStartPilot={async () => {
            setBillingAction('pilot');
            const result = await startPilot();
            if (result.success) {
              addToast('🚀 30-day pilot activated! All features unlocked.', 'success');
              invalidateTierCache();
              const details = await fetchSchoolPlanDetails();
              setPlanDetails(details);
            } else {
              addToast(result.error || 'Failed to start pilot', 'error');
            }
            setBillingAction(null);
          }}
          onSubscribe={async (plan: PlanInfo) => {
            setBillingAction(plan.id);
            const result = await createCheckoutSession({
              plan: plan.id as 'core' | 'standard' | 'pro',
              interval: billingInterval,
            });
            if ('checkout_url' in result) {
              window.location.href = result.checkout_url;
            } else {
              addToast(result.error || 'Checkout failed', 'error');
              setBillingAction(null);
            }
          }}
        />
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="max-w-2xl space-y-6">
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 className="text-lg font-semibold mb-4">School Settings</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">School Name</label>
                <input
                  type="text"
                  value={settingsName}
                  onChange={(e) => setSettingsName(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">School Slug</label>
                <div className="px-4 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-gray-400">
                  {school.slug}
                </div>
                <p className="text-xs text-gray-500 mt-1">Slug cannot be changed</p>
              </div>

              <div className="border-t border-gray-700 pt-4 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settingsAllowStudent}
                    onChange={(e) => setSettingsAllowStudent(e.target.checked)}
                    className="rounded border-gray-600 bg-gray-700 text-cyan-500 focus:ring-cyan-500"
                  />
                  <span className="text-white">Allow student self-registration</span>
                </label>
                <p className="text-xs text-gray-500 ml-6">
                  When enabled, students can sign up for this school without an invite code
                </p>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settingsAllowTeacher}
                    onChange={(e) => setSettingsAllowTeacher(e.target.checked)}
                    className="rounded border-gray-600 bg-gray-700 text-cyan-500 focus:ring-cyan-500"
                  />
                  <span className="text-white">Allow teacher self-registration</span>
                </label>
                <p className="text-xs text-gray-500 ml-6">
                  When enabled, teachers can sign up for this school without an invite code
                </p>
              </div>

              <div className="pt-4">
                <button
                  onClick={handleSaveSettings}
                  disabled={savingSettings}
                  className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors font-medium"
                >
                  {savingSettings ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="bg-gray-800 rounded-xl p-6 border border-red-500/30">
            <h3 className="text-lg font-semibold mb-2 text-red-400">Danger Zone</h3>
            <p className="text-sm text-gray-400 mb-4">
              These actions are irreversible. Please be careful.
            </p>
            <button
              disabled
              className="px-4 py-2 bg-red-600/50 text-red-200 rounded-lg cursor-not-allowed opacity-50"
            >
              Delete School (Coming Soon)
            </button>
          </div>
        </div>
      )}

      {/* Cambridge Reports Tab */}
      {activeTab === 'cambridge' && (
        <div className="space-y-6">
          <div className="bg-gray-800 rounded-xl p-6 border border-cyan-600/50">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-cyan-300">📚 Cambridge Test Reports</h3>
              <button
                onClick={() => {
                  setShowSchoolVisibility(!showSchoolVisibility);
                  if (!showSchoolVisibility && schoolVisibility.length === 0) {
                    loadSchoolVisibility();
                  }
                }}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  showSchoolVisibility
                    ? 'bg-purple-600 text-white hover:bg-purple-700'
                    : 'bg-purple-600/30 hover:bg-purple-600/50 border border-purple-400 text-white'
                }`}
              >
                👁️ {showSchoolVisibility ? 'Hide' : 'Test'} Visibility Manager
              </button>
            </div>

            {/* School-Level Visibility Manager Panel */}
            {showSchoolVisibility && (
              <div className="bg-gray-900/70 rounded-xl p-5 border border-purple-500/50 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-lg font-bold text-purple-300">🏫 School-Level Test Visibility</h4>
                    <p className="text-xs text-gray-400 mt-1">Hide or show Cambridge tests for your entire school. Hidden tests are invisible to all teachers and students.</p>
                  </div>
                  <button
                    onClick={loadSchoolVisibility}
                    disabled={schoolVisibilityLoading}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                  >
                    {schoolVisibilityLoading ? '⏳' : '🔄'} Refresh
                  </button>
                </div>

                {schoolVisibilityLoading ? (
                  <div className="text-center py-8 text-gray-400">
                    <div className="text-3xl mb-2">⏳</div>
                    Loading test visibility settings...
                  </div>
                ) : schoolVisibility.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <div className="text-3xl mb-2">📋</div>
                    No Cambridge tests found in the catalog.
                  </div>
                ) : (
                  <>
                    {/* Subject filter + selection + bulk actions */}
                    <div className="flex flex-wrap items-center gap-3 mb-4">
                      <select
                        value={schoolVisibilitySubjectFilter}
                        onChange={(e) => {
                          setSchoolVisibilitySubjectFilter(e.target.value);
                          setSelectedSchoolTests(new Set());
                        }}
                        className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500"
                      >
                        <option value="all">All Subjects ({schoolVisibility.length})</option>
                        {schoolVisibilitySubjects.map(subj => (
                          <option key={subj} value={subj}>
                            {subj} ({schoolVisibility.filter(t => t.subject === subj).length})
                          </option>
                        ))}
                      </select>

                      {/* Select All / Deselect All */}
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={selectedSchoolTests.size === filteredSchoolVisibility.length && filteredSchoolVisibility.length > 0}
                          ref={el => { if (el) el.indeterminate = selectedSchoolTests.size > 0 && selectedSchoolTests.size < filteredSchoolVisibility.length; }}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedSchoolTests(new Set(filteredSchoolVisibility.map(t => t.test_id)));
                            } else {
                              setSelectedSchoolTests(new Set());
                            }
                          }}
                          className="w-4 h-4 rounded border-gray-500 bg-gray-700 text-purple-500 focus:ring-purple-500"
                        />
                        <span className="text-xs text-gray-300 font-medium">
                          {selectedSchoolTests.size === filteredSchoolVisibility.length && filteredSchoolVisibility.length > 0
                            ? 'Deselect All'
                            : 'Select All'} ({filteredSchoolVisibility.length})
                        </span>
                      </label>

                      {/* Bulk actions for selected tests */}
                      {selectedSchoolTests.size > 0 && (
                        <>
                          <button
                            onClick={() => setConfirmDialog({
                              title: '✅ Show Selected Tests?',
                              description: `This will make ${selectedSchoolTests.size} test(s) visible to all teachers and students in your school.`,
                              confirmLabel: 'Show Tests',
                              onConfirm: async () => {
                                await bulkSetSchoolVisibility(Array.from(selectedSchoolTests), true);
                                setSelectedSchoolTests(new Set());
                              }
                            })}
                            disabled={Array.from(selectedSchoolTests).every(id => filteredSchoolVisibility.find(t => t.test_id === id)?.is_visible)}
                            className="px-3 py-1.5 bg-green-600/30 hover:bg-green-600/50 border border-green-500 text-green-300 text-xs font-semibold rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            ✅ Show Selected ({selectedSchoolTests.size})
                          </button>
                          <button
                            onClick={() => setConfirmDialog({
                              title: '🔒 Hide Selected Tests?',
                              description: `This will hide ${selectedSchoolTests.size} test(s) from ALL teachers and students in your school. They can be shown again later.`,
                              confirmLabel: 'Hide Tests',
                              isDestructive: true,
                              onConfirm: async () => {
                                await bulkSetSchoolVisibility(Array.from(selectedSchoolTests), false);
                                setSelectedSchoolTests(new Set());
                              }
                            })}
                            disabled={Array.from(selectedSchoolTests).every(id => !filteredSchoolVisibility.find(t => t.test_id === id)?.is_visible)}
                            className="px-3 py-1.5 bg-red-600/30 hover:bg-red-600/50 border border-red-500 text-red-300 text-xs font-semibold rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            🚫 Hide Selected ({selectedSchoolTests.size})
                          </button>
                        </>
                      )}

                      <span className="text-xs text-gray-500 ml-auto">
                        {selectedSchoolTests.size > 0 ? `${selectedSchoolTests.size} selected · ` : ''}
                        {filteredSchoolVisibility.filter(t => t.is_visible).length} / {filteredSchoolVisibility.length} visible
                      </span>
                    </div>

                    {/* Tests list with checkboxes */}
                    <div className="bg-gray-800/50 rounded-lg border border-gray-700 divide-y divide-gray-700/50 max-h-96 overflow-y-auto">
                      {filteredSchoolVisibility.map(test => (
                        <div key={test.test_id} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-700/30 transition-colors">
                          <input
                            type="checkbox"
                            checked={selectedSchoolTests.has(test.test_id)}
                            onChange={(e) => {
                              const next = new Set(selectedSchoolTests);
                              if (e.target.checked) next.add(test.test_id);
                              else next.delete(test.test_id);
                              setSelectedSchoolTests(next);
                            }}
                            className="w-4 h-4 rounded border-gray-500 bg-gray-700 text-purple-500 focus:ring-purple-500 flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0 mr-3">
                            <p className="text-sm font-medium text-white truncate">{test.test_name}</p>
                            <p className="text-xs text-gray-500">{test.subject} · {test.category || 'N/A'}</p>
                          </div>
                          <button
                            onClick={() => setConfirmDialog({
                              title: test.is_visible ? '🔒 Hide This Test?' : '👁️ Show This Test?',
                              description: test.is_visible
                                ? `"${test.test_name}" will be hidden from all teachers and students in your school.`
                                : `"${test.test_name}" will become visible to teachers and students in your school.`,
                              confirmLabel: test.is_visible ? 'Hide Test' : 'Show Test',
                              isDestructive: test.is_visible,
                              onConfirm: async () => {
                                await toggleSchoolTestVisibility(test.test_id, test.is_visible);
                              }
                            })}
                            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors flex-shrink-0 ${
                              test.is_visible
                                ? 'bg-green-600/20 text-green-300 border border-green-500/50 hover:bg-green-600/40'
                                : 'bg-red-600/20 text-red-300 border border-red-500/50 hover:bg-red-600/40'
                            }`}
                          >
                            {test.is_visible ? '👁️ Visible' : '🔒 Hidden'}
                          </button>
                        </div>
                      ))}
                    </div>

                    <p className="text-xs text-gray-500 mt-3">
                      💡 Hidden tests won't appear for any teacher or student in your school. Tests default to visible if not overridden.
                    </p>
                  </>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3 mb-6">
              <button
                onClick={fetchQuizScores}
                disabled={quizScoresLoading}
                className="bg-cyan-600 hover:bg-cyan-500 text-white font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {quizScoresLoading ? '⏳ Loading...' : '🔄 Load/Refresh Reports'}
              </button>
              {quizScores.length > 0 && (
                <button
                  onClick={exportCSV}
                  className="bg-green-600 hover:bg-green-500 text-white font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  📥 Export CSV
                </button>
              )}
            </div>

            {quizScores.length > 0 && (
              <>
                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Filter by Test</label>
                    <select
                      value={quizFilter}
                      onChange={(e) => setQuizFilter(e.target.value)}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                    >
                      <option value="all">All Tests ({quizScores.length})</option>
                      {uniqueQuizNames.map(name => (
                        <option key={name} value={name}>
                          {name} ({quizScores.filter(s => s.quiz_name === name).length})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Filter by Class</label>
                    <select
                      value={classFilter}
                      onChange={(e) => setClassFilter(e.target.value)}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                    >
                      <option value="all">All Classes ({quizScores.length})</option>
                      {uniqueClasses.map(cls => (
                        <option key={cls} value={cls}>
                          {cls} ({quizScores.filter(s => (s.student_class || 'Unknown') === cls).length})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Results Table */}
                <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-800 border-b border-gray-700">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Student</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Class</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Test</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-400">Score</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-400">Percentage</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-400">Time</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-400">Submitted</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-400">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-700">
                        {filteredQuizScores.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                              No submissions found with current filters
                            </td>
                          </tr>
                        ) : (
                          filteredQuizScores.map((score) => (
                            <tr key={score.id} className="hover:bg-gray-800/50 transition-colors">
                              <td className="px-4 py-3 text-sm text-white">{score.student_name || 'Unknown'}</td>
                              <td className="px-4 py-3 text-sm text-gray-300">{score.student_class || 'Unknown'}</td>
                              <td className="px-4 py-3 text-sm text-gray-300 max-w-xs truncate">{score.quiz_name || 'Unknown'}</td>
                              <td className="px-4 py-3 text-sm text-center font-semibold text-cyan-300">
                                {score.score}/{score.total_questions}
                              </td>
                              <td className="px-4 py-3 text-sm text-center">
                                <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${
                                  score.percentage >= 80 ? 'bg-green-500/20 text-green-300' :
                                  score.percentage >= 60 ? 'bg-yellow-500/20 text-yellow-300' :
                                  'bg-red-500/20 text-red-300'
                                }`}>
                                  {score.percentage}%
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-center text-gray-300">
                                {Math.floor((score.time_taken_seconds || 0) / 60)}m
                              </td>
                              <td className="px-4 py-3 text-sm text-center text-gray-400">
                                {score.submitted_at ? new Date(score.submitted_at).toLocaleDateString() : 'N/A'}
                              </td>
                              <td className="px-4 py-3 text-sm text-center">
                                <button
                                  onClick={() => deleteQuizSubmission(score.id, score.student_name)}
                                  className="text-red-400 hover:text-red-300 transition-colors font-medium text-xs"
                                  title="Delete submission (allows retake)"
                                >
                                  🗑️ Delete
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <p className="text-sm text-gray-400 mt-4">
                  Showing {filteredQuizScores.length} of {quizScores.length} total submissions
                </p>
              </>
            )}

            {quizScores.length === 0 && !quizScoresLoading && (
              <div className="text-center p-8 text-gray-400">
                <p className="text-lg mb-2">📋 No Cambridge test submissions yet</p>
                <p className="text-sm">Click "Load/Refresh Reports" to check for new submissions</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Member Action Modal */}
      {showMemberActionModal && selectedMember && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] p-4">
          <div
            className="bg-gray-800 rounded-xl p-6 max-w-lg w-full border border-gray-700 max-h-[90vh] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="member-action-title"
            aria-describedby="member-action-description"
          >
            <div className="flex items-center gap-4 mb-4">
              <img
                src={selectedMember.avatar_url || '/avatars/default.png'}
                alt={selectedMember.username}
                className="w-12 h-12 rounded-full bg-gray-700"
              />
              <div>
                <h3 id="member-action-title" className="text-xl font-bold">{selectedMember.username}</h3>
                <p id="member-action-description" className="text-gray-400 text-sm">{selectedMember.email}</p>
              </div>
            </div>

            <div className="space-y-3">
              {/* Role Change */}
              <div className="bg-gray-700/50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-400 mb-2">Change Role</h4>
                <div className="flex gap-2">
                  {(['student', 'teacher', 'school_admin'] as SchoolRole[]).map((role) => (
                    <button
                      key={role}
                      onClick={() => handleUpdateRole(role)}
                      disabled={selectedMember.role === role || actionLoading}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        selectedMember.role === role
                          ? 'bg-cyan-500 text-white cursor-default'
                          : 'bg-gray-600 hover:bg-gray-500 text-gray-200'
                      } disabled:opacity-50`}
                    >
                      {role.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ban/Unban */}
              <div className="bg-gray-700/50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-400 mb-2">Account Status</h4>
                {selectedMember.is_banned ? (
                  <button
                    onClick={handleUnbanMember}
                    disabled={actionLoading}
                    className="w-full px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-lg transition-colors"
                  >
                    {actionLoading ? 'Processing...' : 'Unban User'}
                  </button>
                ) : (
                  <button
                    onClick={handleBanMember}
                    disabled={actionLoading}
                    className="w-full px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 rounded-lg transition-colors"
                  >
                    {actionLoading ? 'Processing...' : 'Ban User'}
                  </button>
                )}
              </div>

              {/* Suspension Controls — students only */}
              {selectedMember.role === 'student' && !selectedMember.is_banned && (
                <div className="bg-gray-700/50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-amber-400 mb-2">⏱️ Time-Limited Suspension</h4>
                  {modTargetStatus && modTargetStatus.mod_status === 'suspended' ? (
                    <div className="space-y-2">
                      <p className="text-sm text-amber-200">
                        Suspended until {new Date(modTargetStatus.banned_until!).toLocaleString()}
                      </p>
                      <button
                        onClick={handleUnsuspendStudent}
                        disabled={suspendLoading}
                        className="w-full px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-lg transition-colors text-white font-medium"
                      >
                        {suspendLoading ? 'Processing...' : 'Lift Suspension Early'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-3 items-end">
                        <div className="w-32">
                          <label className="block text-xs text-gray-400 mb-1">Duration</label>
                          <select
                            value={suspendDuration}
                            onChange={(e) => setSuspendDuration(Number(e.target.value))}
                            className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
                          >
                            <option value={1}>1 hour</option>
                            <option value={6}>6 hours</option>
                            <option value={24}>24 hours</option>
                            <option value={72}>3 days</option>
                            <option value={168}>7 days</option>
                            <option value={720}>30 days</option>
                          </select>
                        </div>
                        <div className="flex-1 min-w-[140px]">
                          <label className="block text-xs text-gray-400 mb-1">Reason</label>
                          <input
                            type="text"
                            value={suspendReason}
                            onChange={(e) => setSuspendReason(e.target.value)}
                            placeholder="e.g. Inappropriate behavior"
                            className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
                          />
                        </div>
                      </div>
                      <button
                        onClick={handleSuspendStudent}
                        disabled={suspendLoading}
                        className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-lg transition-colors text-white font-medium"
                      >
                        {suspendLoading ? 'Suspending...' : 'Suspend Student'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Force Profile Change — students only */}
              {selectedMember.role === 'student' && !selectedMember.is_banned && (
                <div className="bg-gray-700/50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-yellow-400 mb-2">✏️ Force Profile Change</h4>
                  {modTargetStatus?.required_changes ? (
                    <div className="space-y-2">
                      <div className="space-y-1">
                        {modTargetStatus.required_changes.username && (
                          <p className="text-sm text-yellow-200">⬜ Username change pending</p>
                        )}
                        {modTargetStatus.required_changes.avatar && (
                          <p className="text-sm text-yellow-200">⬜ Avatar change pending</p>
                        )}
                        {modTargetStatus.required_changes.reason && (
                          <p className="text-xs text-gray-400 mt-1">Reason: {modTargetStatus.required_changes.reason}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => loadStudentModStatus(modTargetStatus.user_id)}
                          className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition-colors text-white font-medium text-sm"
                        >
                          🔄 Refresh Status
                        </button>
                        <button
                          onClick={handleClearProfileChange}
                          disabled={forceChangeLoading}
                          className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-lg transition-colors text-white font-medium text-sm"
                        >
                          {forceChangeLoading ? 'Clearing...' : 'Clear Requirement'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-4 items-center">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={forceChangeUsername}
                            onChange={(e) => setForceChangeUsername(e.target.checked)}
                            className="w-4 h-4 rounded border-gray-600 text-purple-600 focus:ring-purple-500"
                          />
                          <span className="text-sm text-gray-300">Username</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={forceChangeAvatar}
                            onChange={(e) => setForceChangeAvatar(e.target.checked)}
                            className="w-4 h-4 rounded border-gray-600 text-purple-600 focus:ring-purple-500"
                          />
                          <span className="text-sm text-gray-300">Avatar</span>
                        </label>
                      </div>
                      <input
                        type="text"
                        value={forceChangeReason}
                        onChange={(e) => setForceChangeReason(e.target.value)}
                        placeholder="Reason (optional)"
                        className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
                      />
                      <button
                        onClick={handleForceProfileChange}
                        disabled={forceChangeLoading || (!forceChangeUsername && !forceChangeAvatar)}
                        className="w-full px-4 py-2 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 rounded-lg transition-colors text-white font-medium"
                      >
                        {forceChangeLoading ? 'Setting...' : 'Require Change'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Remove from School */}
              <button
                onClick={handleRemoveMember}
                disabled={actionLoading}
                className="w-full px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-lg transition-colors"
              >
                {actionLoading ? 'Processing...' : 'Remove from School'}
              </button>
            </div>

            <button
              onClick={() => {
                setShowMemberActionModal(false);
                setSelectedMember(null);
                setModTargetStatus(null);
                setModTargetId('');
                setSuspendReason('');
                setForceChangeUsername(false);
                setForceChangeAvatar(false);
                setForceChangeReason('');
              }}
              className="w-full mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              autoFocus
            >
              Close
            </button>
          </div>
        </div>,
        document.body
      )}

      {confirmDialog && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] p-4">
          <div
            className="bg-gray-800 rounded-xl p-6 max-w-md w-full border border-gray-700"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-description"
          >
            <h3 id="confirm-dialog-title" className="text-xl font-bold mb-2">
              {confirmDialog.title}
            </h3>
            <p id="confirm-dialog-description" className="text-sm text-gray-400 mb-4">
              {confirmDialog.description}
            </p>
            {confirmDialog.requiresReason && (
              <div className="mb-4">
                <label htmlFor="confirm-reason" className="block text-sm font-medium text-gray-300 mb-1">
                  Reason (optional)
                </label>
                <input
                  id="confirm-reason"
                  type="text"
                  value={confirmReason}
                  onChange={(e) => setConfirmReason(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  placeholder="Add a reason for this action"
                />
              </div>
            )}
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  if (confirmBusy) return;
                  setConfirmDialog(null);
                  setConfirmReason('');
                }}
                disabled={confirmBusy}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg transition-colors"
              >
                {confirmDialog.cancelLabel || 'Cancel'}
              </button>
              <button
                disabled={confirmBusy}
                onClick={async () => {
                  setConfirmBusy(true);
                  try {
                    await confirmDialog.onConfirm(confirmReason.trim() || undefined);
                  } finally {
                    setConfirmBusy(false);
                    setConfirmDialog(null);
                    setConfirmReason('');
                  }
                }}
                className={`px-4 py-2 rounded-lg transition-colors disabled:opacity-50 ${
                  confirmDialog.isDestructive
                    ? 'bg-red-600 hover:bg-red-500 text-white'
                    : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                }`}
              >
                {confirmBusy ? 'Processing…' : (confirmDialog.confirmLabel || 'Confirm')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};


// ============================================================================
// BillingTab — Plan status + upgrade UI (inside SchoolAdminPortal)
// ============================================================================

interface BillingTabProps {
  planDetails: SchoolPlanDetails | null;
  loading: boolean;
  billingAction: string | null;
  billingInterval: 'monthly' | 'yearly';
  setBillingInterval: (v: 'monthly' | 'yearly') => void;
  onRefreshPlan: () => void;
  onStartPilot: () => void;
  onSubscribe: (plan: PlanInfo) => void;
}

const BillingTab: React.FC<BillingTabProps> = ({
  planDetails,
  loading,
  billingAction,
  billingInterval,
  setBillingInterval,
  onRefreshPlan,
  onStartPilot,
  onSubscribe,
}) => {
  useEffect(() => {
    if (!planDetails) onRefreshPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planDetails]);

  if (loading || !planDetails) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <svg className="h-5 w-5 animate-spin mr-2" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading plan details…
      </div>
    );
  }

  const plan = planDetails.plan;
  const isActive = planDetails.is_active;
  const trialExpired = planDetails.trial_expired;
  const isNone = plan === 'none';
  const isPilot = plan === 'pilot';
  const isPaid = ['core', 'standard', 'pro', 'enterprise'].includes(plan);

  // Trial days remaining
  const trialDaysLeft = isPilot && planDetails.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(planDetails.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const planLabel: Record<string, string> = {
    none: 'Free (Lockdown Only)',
    pilot: 'Pilot Trial',
    core: 'Core',
    standard: 'Standard',
    pro: 'Pro',
    enterprise: 'Enterprise',
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Current Plan Status */}
      <div className={`rounded-xl p-6 border ${
        isPaid ? 'bg-emerald-900/20 border-emerald-500/30' :
        isPilot && isActive ? 'bg-cyan-900/20 border-cyan-500/30' :
        trialExpired ? 'bg-red-900/20 border-red-500/30' :
        'bg-gray-800 border-gray-700'
      }`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">
              {isPaid && '✅ '}{isPilot && isActive && '🚀 '}{trialExpired && '⏰ '}{isNone && '🔓 '}
              {planLabel[plan] || plan}
            </h3>
            <p className="text-sm text-gray-400 mt-1">
              {isNone && 'Your school is using the free Lockdown mode. Start a pilot or subscribe to unlock everything.'}
              {isPilot && isActive && `${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} remaining. Subscribe to keep access after the trial.`}
              {trialExpired && 'Your pilot trial has expired. Subscribe to restore full access.'}
              {isPaid && 'All features are unlocked for your school.'}
            </p>
          </div>
          {planDetails.seats && (isPaid || (isPilot && isActive)) && (
            <div className="flex gap-3 text-xs">
              <span className="bg-gray-800 rounded-lg px-3 py-1.5 border border-gray-700">
                📚 {planDetails.seats.cambridge ?? '∞'} Cambridge
              </span>
              <span className="bg-gray-800 rounded-lg px-3 py-1.5 border border-gray-700">
                🎧 {planDetails.seats.ielts ?? '∞'} IELTS
              </span>
              <span className="bg-gray-800 rounded-lg px-3 py-1.5 border border-gray-700">
                🎮 {planDetails.seats.game ?? '∞'} Game
              </span>
            </div>
          )}
        </div>
        {planDetails.current_members > 0 && (
          <p className="text-xs text-gray-500 mt-3">
            Current members: {planDetails.current_members}
          </p>
        )}
      </div>

      {/* Pilot CTA (only show for 'none') */}
      {isNone && (
        <div className="rounded-xl p-5 border border-cyan-500/20 bg-cyan-500/5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-cyan-300">🚀 {PILOT_PLAN.label} — {PILOT_PLAN.days} Days Free</div>
              <p className="text-xs text-gray-400 mt-1">
                {PILOT_PLAN.seats.cambridge} Cambridge · {PILOT_PLAN.seats.ielts} IELTS · {PILOT_PLAN.seats.game} Game seats. No credit card needed.
              </p>
            </div>
            <button
              onClick={onStartPilot}
              disabled={billingAction !== null}
              className="shrink-0 rounded-lg bg-cyan-600 hover:bg-cyan-500 px-4 py-2 text-sm font-medium text-white transition-colors active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {billingAction === 'pilot' ? 'Starting…' : 'Start Free Pilot'}
            </button>
          </div>
        </div>
      )}

      {/* Paid plans (show when not on a paid plan, or on pilot/expired) */}
      {!isPaid && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">
              {isNone ? 'Or subscribe now' : trialExpired ? 'Choose a plan to restore access' : 'Upgrade to a paid plan'}
            </h3>
            <div className="inline-flex rounded-xl border border-gray-700 bg-gray-800/50 p-1">
              <button
                onClick={() => setBillingInterval('monthly')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  billingInterval === 'monthly' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingInterval('yearly')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  billingInterval === 'yearly' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                Annual
                <span className="ml-1 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300">Save ~17%</span>
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {PAID_PLANS.map((p) => {
              const price = billingInterval === 'yearly' ? p.yearly : p.monthly;
              return (
                <div
                  key={p.id}
                  className={`relative rounded-2xl border p-5 ${
                    p.popular
                      ? 'border-emerald-500/40 bg-emerald-500/5 ring-1 ring-emerald-500/20'
                      : 'border-gray-700 bg-gray-800/40'
                  }`}
                >
                  {p.popular && (
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-3 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                      Most Popular
                    </div>
                  )}
                  <h4 className={`text-lg font-bold ${p.popular ? 'text-emerald-300' : 'text-white'}`}>
                    {p.label}
                  </h4>
                  <div className="mt-1 text-2xl font-bold text-white">
                    ${price.toLocaleString()}
                    <span className="text-sm font-normal text-gray-400">/{billingInterval === 'yearly' ? 'yr' : 'mo'}</span>
                  </div>
                  {billingInterval === 'yearly' && (
                    <p className="text-xs text-emerald-400/70">${Math.round(p.yearly / 12).toLocaleString()}/mo billed annually</p>
                  )}

                  <div className="mt-3 space-y-1.5 text-xs">
                    <div className="flex justify-between rounded-lg bg-gray-900/50 px-2.5 py-1.5">
                      <span className="text-gray-400">📚 Cambridge</span>
                      <span className="font-semibold text-white">up to {p.seats.cambridge}</span>
                    </div>
                    <div className="flex justify-between rounded-lg bg-gray-900/50 px-2.5 py-1.5">
                      <span className="text-gray-400">🎧 IELTS</span>
                      <span className="font-semibold text-white">up to {p.seats.ielts}</span>
                    </div>
                    <div className="flex justify-between rounded-lg bg-gray-900/50 px-2.5 py-1.5">
                      <span className="text-gray-400">🎮 Game</span>
                      <span className="font-semibold text-white">up to {p.seats.game}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => onSubscribe(p)}
                    disabled={billingAction !== null}
                    className={`mt-4 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${
                      p.popular
                        ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white shadow-lg shadow-emerald-500/20 hover:brightness-110'
                        : 'bg-gray-700 text-white hover:bg-gray-600'
                    }`}
                  >
                    {billingAction === p.id ? 'Redirecting…' : 'Subscribe'}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Enterprise */}
          <div className="rounded-xl border border-gray-700/40 bg-gray-800/20 p-4 text-center">
            <p className="text-sm text-gray-300">
              <span className="font-semibold text-white">🏢 Enterprise</span> — Unlimited seats · Multi-campus · Custom pricing
            </p>
            <a
              href="mailto:sales@brainsheist.com?subject=Enterprise%20Plan%20Inquiry"
              className="mt-1 inline-block text-sm font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              Contact sales@brainsheist.com →
            </a>
          </div>
        </>
      )}

      {/* Already on paid — show manage link */}
      {isPaid && (
        <div className="rounded-xl p-5 border border-gray-700 bg-gray-800/40">
          <h4 className="font-semibold text-white mb-2">Manage Subscription</h4>
          <p className="text-sm text-gray-400 mb-3">
            To change plans, update payment details, or cancel, use the Paddle customer portal below.
          </p>
          <p className="text-xs text-gray-500">
            Contact <a href="mailto:support@brainsheist.com" className="text-cyan-400 hover:underline">support@brainsheist.com</a> if you need help managing your subscription.
          </p>
        </div>
      )}

      {/* Trust / FAQ */}
      <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-gray-500 pt-2">
        <span>🔒 Secure payment via Stripe</span>
        <span>↩️ Cancel anytime</span>
        <span>⚡ Instant activation</span>
        <span>👥 Covers all teachers & students</span>
      </div>
    </div>
  );
};


export default SchoolAdminPortal;
