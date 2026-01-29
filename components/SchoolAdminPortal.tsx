import React, { useState, useEffect, useCallback } from 'react';
import BackButton from './BackButton';
import { ToastMessage } from '../types';
import * as SchoolAdminService from '../services/schoolAdminService';
import type {
  SchoolStats,
  SchoolMember,
  SchoolInfo,
  SchoolClass,
  SchoolTeacher,
  ClassTeacherAssignment,
} from '../services/schoolAdminService';
import type { SchoolRole } from '../types';

interface SchoolAdminPortalProps {
  onComplete: () => void;
  addToast: (message: string, type: ToastMessage['type']) => void;
}

type AdminTab = 'dashboard' | 'members' | 'classes' | 'teachers' | 'students' | 'invites' | 'settings';

const SchoolAdminPortal: React.FC<SchoolAdminPortalProps> = ({ onComplete, addToast }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [school, setSchool] = useState<SchoolInfo | null>(null);
  const [stats, setStats] = useState<SchoolStats | null>(null);
  const [members, setMembers] = useState<SchoolMember[]>([]);
  const [membersTotal, setMembersTotal] = useState(0);

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

  // Teacher assignment state
  const [teachers, setTeachers] = useState<SchoolTeacher[]>([]);
  const [teacherAssignments, setTeacherAssignments] = useState<ClassTeacherAssignment[]>([]);
  const [assignmentClassId, setAssignmentClassId] = useState('');
  const [assignmentTeacherId, setAssignmentTeacherId] = useState('');
  const [assignmentSubjectInput, setAssignmentSubjectInput] = useState('');
  const [assignmentSubjects, setAssignmentSubjects] = useState<string[]>([]);
  const [assignmentActive, setAssignmentActive] = useState(true);
  const [assignmentFilterClassId, setAssignmentFilterClassId] = useState('');
  const [assignmentFilterTeacherId, setAssignmentFilterTeacherId] = useState('');
  const [assignmentSaving, setAssignmentSaving] = useState(false);

  // Student enrollment state
  const [students, setStudents] = useState<SchoolMember[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [studentAssignments, setStudentAssignments] = useState<Record<string, string | null>>({});
  const [studentSaving, setStudentSaving] = useState(false);
  
  // Filters
  const [memberSearch, setMemberSearch] = useState('');
  const [memberRoleFilter, setMemberRoleFilter] = useState<SchoolRole | ''>('');
  
  // Modals
  const [showMemberActionModal, setShowMemberActionModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<SchoolMember | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Settings state
  const [settingsName, setSettingsName] = useState('');
  const [settingsAllowStudent, setSettingsAllowStudent] = useState(true);
  const [settingsAllowTeacher, setSettingsAllowTeacher] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

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
      const [classList, teacherList, assignmentsList, studentList] = await Promise.all([
        SchoolAdminService.listSchoolClasses(schoolId),
        SchoolAdminService.listSchoolTeachers(schoolId),
        SchoolAdminService.listTeacherAssignments(schoolId),
        SchoolAdminService.listSchoolMembers(schoolId, { role: 'student', limit: 200 }).then((res) => res.members),
      ]);

      setClasses(classList);
      setTeachers(teacherList);
      setTeacherAssignments(assignmentsList);
      setStudents(studentList);

      const classIds = classList.map((cls) => cls.id);
      const studentRows = await SchoolAdminService.listClassStudents(classIds);
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
      limit: 50,
    });
    setMembers(memberList);
    setMembersTotal(total);
  }, [memberRoleFilter, memberSearch]);

  // Reload members when filters change
  useEffect(() => {
    if (school?.id) {
      loadMembers(school.id);
    }
  }, [school?.id, memberSearch, memberRoleFilter, loadMembers]);

  useEffect(() => {
    if (school?.id) {
      loadAdminTools(school.id);
    }
  }, [school?.id, loadAdminTools]);

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
    
    if (!confirm(`Are you sure you want to remove ${selectedMember.username} from the school?`)) {
      return;
    }

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
  };

  const handleBanMember = async () => {
    if (!school || !selectedMember) return;
    
    const reason = prompt('Enter ban reason (optional):');
    
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

  // Invite code actions (single code per school)
  const handleRotateInviteCode = async () => {
    if (!school) return;

    if (!confirm('Rotate invite code? Old code will stop working immediately.')) return;

    setActionLoading(true);
    const result = await SchoolAdminService.rotateInviteCode(school.id);
    setActionLoading(false);

    if (result.success && result.code) {
      addToast(`New invite code: ${result.code}`, 'success');
      await refreshSchool(school.id);
    } else {
      addToast(result.error || 'Failed to rotate invite code', 'error');
    }
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

  const handleAddSubject = () => {
    const subject = assignmentSubjectInput.trim();
    if (!subject) return;
    if (assignmentSubjects.includes(subject)) {
      setAssignmentSubjectInput('');
      return;
    }
    setAssignmentSubjects((prev) => [...prev, subject]);
    setAssignmentSubjectInput('');
  };

  const handleAssignTeacher = async () => {
    if (!school) return;
    if (!assignmentClassId || !assignmentTeacherId) {
      addToast('Select a class and teacher', 'error');
      return;
    }

    const subjects = [...assignmentSubjects];
    if (assignmentSubjectInput.trim()) {
      subjects.push(assignmentSubjectInput.trim());
    }

    const uniqueSubjects = Array.from(new Set(subjects.filter((subject) => subject.length > 0)));
    if (uniqueSubjects.length === 0) {
      addToast('Enter at least one subject', 'error');
      return;
    }

    setAssignmentSaving(true);
    const results = await Promise.all(
      uniqueSubjects.map((subject) =>
        SchoolAdminService.assignTeacherToClassSubject(
          school.id,
          assignmentClassId,
          assignmentTeacherId,
          subject,
          assignmentActive
        )
      )
    );
    setAssignmentSaving(false);

    const failed = results.find((res) => !res.success);
    if (failed) {
      addToast(failed.error || 'Failed to assign teacher', 'error');
      return;
    }

    addToast(`Assigned ${uniqueSubjects.length} subject${uniqueSubjects.length > 1 ? 's' : ''}`, 'success');
    setAssignmentSubjects([]);
    setAssignmentSubjectInput('');
    await loadAdminTools(school.id);
  };

  const handleEnrollStudent = async () => {
    if (!school) return;
    if (!selectedStudentId || !selectedClassId) {
      addToast('Select a student and class', 'error');
      return;
    }

    const currentClassId = studentAssignments[selectedStudentId];
    if (currentClassId === selectedClassId) {
      addToast('Student already enrolled in this class', 'error');
      return;
    }

    setStudentSaving(true);
    const result = await SchoolAdminService.moveStudentToClass(
      classes.map((cls) => cls.id),
      selectedStudentId,
      selectedClassId
    );
    setStudentSaving(false);

    if (result.success) {
      addToast('Student enrollment updated', 'success');
      await loadAdminTools(school.id);
    } else {
      addToast(result.error || 'Failed to update enrollment', 'error');
    }
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
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-slate-900 text-white p-4 pb-24">
      {/* Premium Header with Crown Badge */}
      <div className="relative mb-8">
        {/* Background Glow Effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-purple-600/10 via-cyan-500/10 to-purple-600/10 blur-3xl -z-10" />
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <BackButton onClick={onComplete} />
            <div className="relative">
              {/* Crown Badge */}
              <div className="absolute -top-3 -left-2 text-2xl animate-pulse">👑</div>
              <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-200 drop-shadow-lg">
                {school.name}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="px-2 py-0.5 bg-gradient-to-r from-purple-600 to-purple-500 text-white text-xs font-semibold rounded-full shadow-lg shadow-purple-500/25">
                  ⭐ SCHOOL ADMIN
                </span>
                <span className="text-gray-400 text-sm">Premium Management Portal</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {school.logo_url ? (
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-cyan-500 rounded-xl blur-md opacity-50" />
                <img 
                  src={school.logo_url} 
                  alt={school.name} 
                  className="relative h-14 w-14 rounded-xl object-cover border-2 border-purple-400/50 shadow-lg" 
                />
              </div>
            ) : (
              <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-purple-600 to-cyan-600 flex items-center justify-center text-2xl shadow-lg shadow-purple-500/25">
                🏫
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Premium Tab Navigation */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
        {(['dashboard', 'members', 'classes', 'teachers', 'students', 'invites', 'settings'] as AdminTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-3 rounded-xl font-medium transition-all whitespace-nowrap border ${
              activeTab === tab
                ? 'bg-gradient-to-r from-purple-600 to-cyan-600 text-white border-transparent shadow-lg shadow-purple-500/25'
                : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50 border-gray-700/50 hover:text-white hover:border-gray-600'
            }`}
          >
            {tab === 'dashboard' && '📊 Dashboard'}
            {tab === 'members' && `👥 Members (${membersTotal})`}
            {tab === 'classes' && '🏫 Classes'}
            {tab === 'teachers' && '🧑‍🏫 Teacher Assignments'}
            {tab === 'students' && '🎒 Student Enrollment'}
            {tab === 'invites' && '🔑 Invite Code'}
            {tab === 'settings' && '⚙️ Settings'}
          </button>
        ))}
      </div>

      {/* Dashboard Tab */}
      {activeTab === 'dashboard' && stats && (
        <div className="space-y-8">
          {/* Premium Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-2xl blur opacity-20 group-hover:opacity-40 transition-opacity" />
              <div className="relative bg-gray-800/80 backdrop-blur-sm rounded-2xl p-5 border border-cyan-500/30 hover:border-cyan-500/50 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-3xl">🎓</span>
                  <span className="text-xs text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full">Active</span>
                </div>
                <div className="text-4xl font-bold text-cyan-400">{stats.students}</div>
                <div className="text-gray-400 text-sm mt-1">Students Enrolled</div>
              </div>
            </div>
            
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-blue-400 rounded-2xl blur opacity-20 group-hover:opacity-40 transition-opacity" />
              <div className="relative bg-gray-800/80 backdrop-blur-sm rounded-2xl p-5 border border-blue-500/30 hover:border-blue-500/50 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-3xl">👨‍🏫</span>
                  <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">Active</span>
                </div>
                <div className="text-4xl font-bold text-blue-400">{stats.teachers}</div>
                <div className="text-gray-400 text-sm mt-1">Teachers</div>
              </div>
            </div>
            
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-purple-400 rounded-2xl blur opacity-20 group-hover:opacity-40 transition-opacity" />
              <div className="relative bg-gray-800/80 backdrop-blur-sm rounded-2xl p-5 border border-purple-500/30 hover:border-purple-500/50 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-3xl">👑</span>
                  <span className="text-xs text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full">Admin</span>
                </div>
                <div className="text-4xl font-bold text-purple-400">{stats.admins}</div>
                <div className="text-gray-400 text-sm mt-1">School Admins</div>
              </div>
            </div>
            
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-green-500 to-emerald-400 rounded-2xl blur opacity-20 group-hover:opacity-40 transition-opacity" />
              <div className="relative bg-gray-800/80 backdrop-blur-sm rounded-2xl p-5 border border-green-500/30 hover:border-green-500/50 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-3xl">🌟</span>
                  <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">Total</span>
                </div>
                <div className="text-4xl font-bold text-green-400">{stats.total}</div>
                <div className="text-gray-400 text-sm mt-1">Total Members</div>
              </div>
            </div>
          </div>

          {/* Quick Actions - Premium Style */}
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-600/5 via-cyan-500/5 to-purple-600/5 rounded-2xl" />
            <div className="relative bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/50">
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
          </div>
          
          {/* Power User Tips */}
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-amber-600/5 via-orange-500/5 to-amber-600/5 rounded-2xl" />
            <div className="relative bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-amber-500/30">
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
        </div>
      )}

      {/* Members Tab */}
      {activeTab === 'members' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-4 items-center">
            <input
              type="text"
              placeholder="Search by username or email..."
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              className="flex-1 min-w-[200px] px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
            />
            <select
              value={memberRoleFilter}
              onChange={(e) => setMemberRoleFilter(e.target.value as SchoolRole | '')}
              className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="">All Roles</option>
              <option value="student">Students</option>
              <option value="teacher">Teachers</option>
              <option value="school_admin">Admins</option>
            </select>
          </div>

          {/* Members List */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-750 border-b border-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">User</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Role</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400 hidden md:table-cell">Grade</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400 hidden lg:table-cell">Level</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400 hidden lg:table-cell">Last Seen</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Status</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {members.map((member) => (
                    <tr key={member.user_id} className="hover:bg-gray-750">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
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
                        ) : (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => { setSelectedMember(member); setShowMemberActionModal(true); }}
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
            {members.length === 0 && (
              <div className="p-8 text-center text-gray-500">
                No members found matching your criteria
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
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleEditClass(schoolClass)}
                          className="text-cyan-400 hover:text-cyan-300 text-sm"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {classes.length === 0 && (
              <div className="p-6 text-center text-gray-500">No classes created yet.</div>
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
                <label className="block text-sm font-medium text-gray-400 mb-1">Subjects</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={assignmentSubjectInput}
                    onChange={(e) => setAssignmentSubjectInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSubject();
                      }
                    }}
                    className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                    placeholder="e.g. Mathematics"
                  />
                  <button
                    onClick={handleAddSubject}
                    className="px-3 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg text-sm"
                  >
                    Add
                  </button>
                </div>
                {assignmentSubjects.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {assignmentSubjects.map((subject) => (
                      <span key={subject} className="px-2 py-1 rounded-full bg-gray-700 text-xs text-gray-200 flex items-center gap-2">
                        {subject}
                        <button
                          onClick={() => setAssignmentSubjects((prev) => prev.filter((item) => item !== subject))}
                          className="text-gray-400 hover:text-white"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
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
                disabled={assignmentSaving}
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {filteredTeacherAssignments.map((assignment) => {
                    const cls = classById[assignment.class_id];
                    const teacher = teachers.find((t) => t.user_id === assignment.teacher_user_id);
                    return (
                      <tr key={assignment.id} className="hover:bg-gray-750">
                        <td className="px-4 py-3 text-sm text-gray-200">
                          {cls ? `${cls.class_code} — ${cls.class_name}` : assignment.class_id}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-200">
                          {teacher?.username || assignment.teacher_user_id}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300">{assignment.subject}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${assignment.active ? 'bg-green-500/20 text-green-300' : 'bg-gray-600/40 text-gray-300'}`}>
                            {assignment.active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredTeacherAssignments.length === 0 && (
              <div className="p-6 text-center text-gray-500">No assignments found.</div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'students' && (
        <div className="space-y-6">
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 className="text-lg font-semibold mb-4">Enroll or Move Student</h3>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Student</label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => {
                    const studentId = e.target.value;
                    setSelectedStudentId(studentId);
                    setSelectedClassId(studentAssignments[studentId] || '');
                  }}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="">Select student</option>
                  {students.map((student) => (
                    <option key={student.user_id} value={student.user_id}>
                      {student.username}
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
                  {classes.map((cls) => (
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
              <input
                type="text"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Search students..."
                className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-xs text-white"
              />
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
                  {filteredStudents.map((student) => {
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
            {filteredStudents.length === 0 && (
              <div className="p-6 text-center text-gray-500">No students found.</div>
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
                <div
                  className="font-mono text-2xl font-bold text-cyan-400 cursor-pointer hover:text-cyan-300"
                  onClick={() => copyToClipboard(school.invite_code || '')}
                  title="Click to copy"
                >
                  {school.invite_code || 'No code'}
                </div>
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

      {/* Member Action Modal */}
      {showMemberActionModal && selectedMember && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full border border-gray-700">
            <div className="flex items-center gap-4 mb-4">
              <img
                src={selectedMember.avatar_url || '/avatars/default.png'}
                alt={selectedMember.username}
                className="w-12 h-12 rounded-full bg-gray-700"
              />
              <div>
                <h3 className="text-xl font-bold">{selectedMember.username}</h3>
                <p className="text-gray-400 text-sm">{selectedMember.email}</p>
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
              onClick={() => { setShowMemberActionModal(false); setSelectedMember(null); }}
              className="w-full mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchoolAdminPortal;
