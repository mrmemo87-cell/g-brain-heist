import React, { useState, useEffect, useCallback } from 'react';
import { Batch, Grade, Profile, ToastMessage, SchoolRole } from '../types';
import BackButton from './BackButton';
import * as AuthService from '../services/authService';
import * as GameService from '../services/gameService';
import { supabase } from '../services/supabaseClient';
import * as CompetitionService from '../services/competitionService';
import ClickableUsername from './ClickableUsername';
import IeltsAdminDashboard from './IeltsAdminDashboard';
import * as SchoolRequestService from '../services/schoolRequestService';
import * as SchoolAdminService from '../services/schoolAdminService';
import { SchoolMember } from '../services/schoolAdminService';

interface AdminPortalProps {
  profile: Profile;
  onComplete: () => void;
  addToast: (message: string, type: ToastMessage['type']) => void;
}

type AdminTab = 'dashboard' | 'users' | 'schools' | 'applications' | 'game' | 'clans' | 'analytics' | 'cambridge' | 'ielts' | 'system';

const AdminPortal: React.FC<AdminPortalProps> = ({ profile, onComplete, addToast }) => {
  const PAGE_SIZE = 50;
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [users, setUsers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [userPage, setUserPage] = useState(0);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [clanList, setClanList] = useState<any[]>([]);
  const [schoolRequests, setSchoolRequests] = useState<SchoolRequestService.SchoolRequestRecord[]>([]);
  const [schoolRequestsLoading, setSchoolRequestsLoading] = useState(false);
  const [schoolRequestsError, setSchoolRequestsError] = useState<string | null>(null);
  const [schoolRequestSearch, setSchoolRequestSearch] = useState('');
  const [schoolRequestStatus, setSchoolRequestStatus] = useState<'pending' | 'needs_more_info' | 'approved' | 'rejected' | 'duplicate' | 'all'>('pending');
  const [schoolRequestNotes, setSchoolRequestNotes] = useState<Record<string, string>>({});
  const [schoolRequestDuplicates, setSchoolRequestDuplicates] = useState<Record<string, string>>({});
  const [schoolRequestActionLoading, setSchoolRequestActionLoading] = useState<string | null>(null);
  const [schoolRequestMessages, setSchoolRequestMessages] = useState<
    Record<string, SchoolRequestService.SchoolRequestMessage[]>
  >({});
  const [schoolRequestMessagesLoading, setSchoolRequestMessagesLoading] = useState<Record<string, boolean>>({});
  const [schoolRequestMessagesError, setSchoolRequestMessagesError] = useState<Record<string, string>>({});
  const [schoolRequestMessagesUnavailable, setSchoolRequestMessagesUnavailable] = useState<Record<string, boolean>>({});
  const [schoolRequestMessagesOpen, setSchoolRequestMessagesOpen] = useState<Record<string, boolean>>({});
  const [schoolOptions, setSchoolOptions] = useState<{ id: string; name: string }[]>([]);
  const [schoolAdminSchoolId, setSchoolAdminSchoolId] = useState('');
  const [schoolMemberSearch, setSchoolMemberSearch] = useState('');
  const [schoolMembers, setSchoolMembers] = useState<SchoolAdminService.SchoolMember[]>([]);
  const [schoolMembersLoading, setSchoolMembersLoading] = useState(false);
  const [schoolMembersError, setSchoolMembersError] = useState<string | null>(null);
  const [schoolAdminActionLoading, setSchoolAdminActionLoading] = useState<string | null>(null);
  const [isSuperadmin, setIsSuperadmin] = useState(Boolean(profile.is_admin));
  const [stats, setStats] = useState({
    totalUsers: null as number | null,
    totalTeachers: null as number | null,
    bhMembers: null as number | null,
    ieltsUsers: null as number | null,
    ieltsTeachers: null as number | null,
  });
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [adminVisible, setAdminVisible] = useState(profile.admin_visible || false);
  const [showAnnouncementComposer, setShowAnnouncementComposer] = useState(false);
  const [announcementText, setAnnouncementText] = useState('');
  const [announcementExpiry, setAnnouncementExpiry] = useState<'never' | '1d' | '7d' | '30d' | 'custom'>('never');
  const [customAnnouncementExpiry, setCustomAnnouncementExpiry] = useState('');
  const [isSendingAnnouncement, setIsSendingAnnouncement] = useState(false);
  const [isResettingAll, setIsResettingAll] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  
  // Cambridge Tests Reports State
  const [quizScores, setQuizScores] = useState<any[]>([]);
  const [quizScoresLoading, setQuizScoresLoading] = useState(false);
  const [quizFilter, setQuizFilter] = useState<string>('all');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showAnswerReflection, setShowAnswerReflection] = useState(false);
  const [reportStudent, setReportStudent] = useState<any | null>(null);
  const [quizStats, setQuizStats] = useState<{
    totalSubmissions: number;
    avgPercentage: number;
    highestScore: { name: string; percentage: number } | null;
    lowestScore: { name: string; percentage: number } | null;
    classStats: Record<string, { count: number; avg: number }>;
  }>({
    totalSubmissions: 0,
    avgPercentage: 0,
    highestScore: null,
    lowestScore: null,
    classStats: {}
  });

  const gradeOptions: Grade[] = [6, 7, 8, 9, 10, 11, 12];
  const batchByGrade: Record<Grade, Batch[]> = {
    6: ['6A', '6B', '6C', 'N/A'],
    7: ['7A', '7B', '7C', 'N/A'],
    8: ['8A', '8B', '8C', 'N/A'],
    9: ['9A', '9B', '9C', 'N/A'],
    10: ['10A', '10B', '10C', 'N/A'],
    11: ['11A', '11B', '11C', 'N/A'],
    12: ['12A', '12B', '12C', 'N/A'],
  };

  // Fetch Cambridge Quiz Scores (school-isolated for admins)
  const fetchQuizScores = async () => {
    setQuizScoresLoading(true);
    try {
      // Use school-scoped RPC to get only scores from admin's school
      const { data, error } = await supabase.rpc('get_school_cambridge_scores', { p_limit: 500 });

      if (error) {
        // Fallback to direct query if RPC doesn't exist yet (migration not run)
        reportRpcError('RPC get_school_cambridge_scores not available, falling back:', error, 'Failed to load Cambridge scores.');
        const fallback = await supabase
          .from('quiz_scores')
          .select('*')
          .order('submitted_at', { ascending: false });
        
        if (fallback.error) throw fallback.error;
        setQuizScores(fallback.data || []);
        calculateQuizStats(fallback.data || []);
        return;
      }

      const scores = data || [];
      setQuizScores(scores);
      calculateQuizStats(scores);
    } catch (error) {
      reportRpcError('Failed to fetch quiz scores:', error, 'Failed to fetch Cambridge test scores');
    } finally {
      setQuizScoresLoading(false);
    }
  };

  const loadSchoolRequests = useCallback(async () => {
    setSchoolRequestsLoading(true);
    setSchoolRequestsError(null);
    try {
      const statusFilter = schoolRequestStatus === 'all' ? null : schoolRequestStatus;
      const result = await SchoolRequestService.listSchoolRequests(statusFilter, 200);
      if (!result.success) {
        setSchoolRequestsError(result.error || 'Failed to load school requests.');
        setSchoolRequests([]);
        return;
      }
      setSchoolRequests(result.requests);
    } catch (err: any) {
      setSchoolRequestsError(err?.message || 'Failed to load school requests.');
      setSchoolRequests([]);
    } finally {
      setSchoolRequestsLoading(false);
    }
  }, [schoolRequestStatus]);

  const loadSchoolRequestMessages = useCallback(async (requestId: string) => {
    setSchoolRequestMessagesLoading((prev) => ({ ...prev, [requestId]: true }));
    setSchoolRequestMessagesError((prev) => {
      if (!prev[requestId]) return prev;
      const { [requestId]: _removed, ...rest } = prev;
      return rest;
    });
    const result = await SchoolRequestService.listSchoolRequestMessages(requestId);
    setSchoolRequestMessagesLoading((prev) => ({ ...prev, [requestId]: false }));

    if (!result.success) {
      setSchoolRequestMessagesError((prev) => ({
        ...prev,
        [requestId]: result.error || 'Unable to load conversation.',
      }));
      setSchoolRequestMessages((prev) => ({ ...prev, [requestId]: [] }));
      return;
    }

    setSchoolRequestMessages((prev) => ({ ...prev, [requestId]: result.messages }));
    setSchoolRequestMessagesUnavailable((prev) => ({
      ...prev,
      [requestId]: Boolean(result.unavailable),
    }));
  }, []);

  const loadSchoolOptions = useCallback(async () => {
    const mapSchoolOptions = (rows: any[]) =>
      rows
        .map((row) => ({ id: row.id, name: row.name }))
        .filter((school) => school.id && school.name);

    const { data: adminData, error: adminError } = await supabase.rpc('admin_list_schools');
    if (!adminError && Array.isArray(adminData)) {
      setSchoolOptions(mapSchoolOptions(adminData));
      return;
    }

    if (adminError) {
      console.warn('admin_list_schools not available, falling back:', adminError.message);
    }

    const { data: availableData, error: availableError } = await supabase.rpc('get_available_schools');
    if (!availableError && Array.isArray(availableData)) {
      setSchoolOptions(mapSchoolOptions(availableData));
      return;
    }

    if (availableError) {
      console.warn('get_available_schools not available, falling back:', availableError.message);
    }

    const { data, error } = await supabase
      .from('schools')
      .select('id, name')
      .eq('status', 'active')
      .order('name', { ascending: true });

    if (error) {
      console.warn('Failed to load schools for duplicate selection:', error.message);
      return;
    }

    setSchoolOptions(data || []);
  }, []);

  const loadSchoolMembers = useCallback(
    async (schoolId: string) => {
      if (!schoolId) {
        setSchoolMembers([]);
        setSchoolMembersError('Select a school to load members.');
        return;
      }

      setSchoolMembersLoading(true);
      setSchoolMembersError(null);
      try {
        // Try the RPC first
        const { members } = await SchoolAdminService.listSchoolMembers(schoolId, { limit: 200 });
        if (members.length > 0) {
          setSchoolMembers(members);
          return;
        }
        
        // Fallback: Try direct query on school_members table
        const { data: smData, error: smError } = await supabase
          .from('school_members')
          .select(`
            id,
            user_id,
            role_in_school,
            status,
            joined_at,
            users:user_id (
              id,
              username,
              email,
              avatar_url,
              role
            )
          `)
          .eq('school_id', schoolId)
          .eq('status', 'active')
          .limit(200);
        
        if (!smError && smData && smData.length > 0) {
          const mapped: SchoolMember[] = smData.map((row: any) => ({
            user_id: row.user_id,
            username: row.users?.username || '',
            email: row.users?.email || '',
            role: (row.role_in_school || row.users?.role || 'student') as SchoolRole,
            avatar_url: row.users?.avatar_url || null,
            grade: null,
            batch: null,
            level: 1,
            xp: 0,
            last_seen: null,
            is_banned: false,
            joined_at: row.joined_at || '',
          }));
          setSchoolMembers(mapped);
          return;
        }
        
        // Fallback 2: Try direct query on users table with school_id
        const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select('id, username, email, avatar_url, role, created_at')
          .eq('school_id', schoolId)
          .limit(200);
        
        if (!usersError && usersData && usersData.length > 0) {
          const mapped: SchoolMember[] = usersData.map((row: any) => ({
            user_id: row.id,
            username: row.username || '',
            email: row.email || '',
            role: (row.role || 'student') as SchoolRole,
            avatar_url: row.avatar_url || null,
            grade: null,
            batch: null,
            level: 1,
            xp: 0,
            last_seen: null,
            is_banned: false,
            joined_at: row.created_at || '',
          }));
          setSchoolMembers(mapped);
          return;
        }
        
        // No members found
        setSchoolMembers([]);
      } catch (error) {
        console.error('Failed to load school members:', error);
        addToast('Failed to load school members.', 'error');
        setSchoolMembers([]);
        setSchoolMembersError('Failed to load school members.');
      } finally {
        setSchoolMembersLoading(false);
      }
    },
    [addToast]
  );

  const handleSetSchoolAdmin = async (schoolId: string, userId: string, makeAdmin: boolean = true) => {
    if (!schoolId) {
      addToast('Select a school before assigning an admin.', 'error');
      return;
    }

    setSchoolAdminActionLoading(userId);
    try {
      // Try RPC first - always pass p_is_admin to avoid ambiguity
      const { data, error } = await supabase.rpc('admin_set_school_admin', {
        p_school_id: schoolId,
        p_user_id: userId,
        p_is_admin: makeAdmin,
      });

      if (error) {
        console.warn('admin_set_school_admin RPC failed, trying fallback:', error.message);
        
        const newRole = makeAdmin ? 'school_admin' : 'student';
        
        // Fallback: Try updating school_members table directly
        const { error: smError } = await supabase
          .from('school_members')
          .update({ role_in_school: newRole })
          .eq('school_id', schoolId)
          .eq('user_id', userId);
        
        if (smError) {
          // Fallback 2: Try updating users table directly
          const { error: usersError } = await supabase
            .from('users')
            .update({ role: newRole })
            .eq('id', userId)
            .eq('school_id', schoolId);
          
          if (usersError) {
            throw usersError;
          }
        }
      }

      addToast(makeAdmin ? 'School admin assigned.' : 'School admin removed.', 'success');
      await loadSchoolMembers(schoolId);
    } catch (error) {
      console.error('Failed to update school admin:', error);
      addToast('Failed to update school admin.', 'error');
    } finally {
      setSchoolAdminActionLoading(null);
    }
  };

  const handleSchoolRequestAction = async (
    requestId: string,
    action: 'approve' | 'reject' | 'mark_duplicate' | 'needs_more_info'
  ) => {
    setSchoolRequestActionLoading(requestId);
    const notes = schoolRequestNotes[requestId]?.trim() || undefined;
    const existingSchoolId = schoolRequestDuplicates[requestId] || undefined;

    if (action === 'mark_duplicate' && !existingSchoolId) {
      addToast('Select the existing school before marking duplicate.', 'error');
      setSchoolRequestActionLoading(null);
      return;
    }

    if (action === 'needs_more_info' && !notes) {
      addToast('Add a message before requesting more info.', 'error');
      setSchoolRequestActionLoading(null);
      return;
    }

    const result = await SchoolRequestService.reviewSchoolRequest(
      requestId,
      action,
      notes,
      existingSchoolId
    );

    if (!result.success) {
      addToast(result.error || 'Failed to update request.', 'error');
      setSchoolRequestActionLoading(null);
      return;
    }

    if (action === 'approve') {
      const inviteLabel = result.inviteCode || 'generated';
      const schoolIdLabel = result.schoolId || 'created';
      addToast(
        `Approved request. Invite code: ${inviteLabel} • School ID: ${schoolIdLabel}. Requester joined as student/teacher. Assign a school admin separately.`,
        'success'
      );
    } else {
      addToast(result.message || 'Request updated.', 'success');
    }

    await Promise.all([loadSchoolRequests(), fetchDashboardStats()]);
    setSchoolRequestActionLoading(null);
  };

  useEffect(() => {
    if (activeTab === 'applications' || activeTab === 'schools') {
      loadSchoolRequests();
      loadSchoolOptions();
    }
  }, [activeTab, loadSchoolRequests, loadSchoolOptions]);

  useEffect(() => {
    let isMounted = true;

    const checkSuperadmin = async () => {
      const { data, error } = await supabase.rpc('rpc_is_superadmin');
      if (error) {
        console.warn('Failed to check superadmin status:', error.message);
        return;
      }
      if (isMounted) {
        setIsSuperadmin(Boolean(data));
      }
    };

    void checkSuperadmin();

    return () => {
      isMounted = false;
    };
  }, []);

  // Helper to calculate quiz stats
  const calculateQuizStats = (scores: any[]) => {
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

      setQuizStats({
        totalSubmissions: scores.length,
        avgPercentage,
        highestScore,
        lowestScore,
        classStats
      });
    } else {
      setQuizStats({
        totalSubmissions: 0,
        avgPercentage: 0,
        highestScore: null,
        lowestScore: null,
        classStats: {}
      });
    }
  };

  // Get unique quiz names and classes for filters
  const uniqueQuizNames = [...new Set(quizScores.map(s => s.quiz_name))];
  const uniqueClasses = [...new Set(quizScores.map(s => s.student_class || 'Unknown'))].sort();

  // Filter quiz scores
  const filteredQuizScores = quizScores.filter(s => {
    if (quizFilter !== 'all' && s.quiz_name !== quizFilter) return false;
    if (classFilter !== 'all' && (s.student_class || 'Unknown') !== classFilter) return false;
    return true;
  });

  const filteredSchoolRequests = schoolRequests.filter((request) => {
    if (!schoolRequestSearch.trim()) return true;
    const query = schoolRequestSearch.trim().toLowerCase();
    return (
      request.requested_name?.toLowerCase().includes(query) ||
      request.requester_email?.toLowerCase().includes(query) ||
      request.requester_role?.toLowerCase().includes(query)
    );
  });

  const filteredSchoolMembers = schoolMembers.filter((member) => {
    const role = member.role;
    const isEligibleRole = role === 'student' || role === 'teacher' || role === 'school_admin';
    if (!isEligibleRole) return false;
    if (!schoolMemberSearch.trim()) return true;
    const query = schoolMemberSearch.trim().toLowerCase();
    return (
      member.username?.toLowerCase().includes(query) ||
      member.email?.toLowerCase().includes(query)
    );
  });
  const currentSchoolAdmin = schoolMembers.find((member) => member.role === 'school_admin');

  // Format time taken
  const formatTime = (seconds: number) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const requestStatusStyles: Record<string, string> = {
    pending: 'bg-amber-500/20 text-amber-200 border-amber-400/40',
    needs_more_info: 'bg-orange-500/20 text-orange-200 border-orange-400/40',
    approved: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40',
    rejected: 'bg-red-500/20 text-red-200 border-red-400/40',
    duplicate: 'bg-purple-500/20 text-purple-200 border-purple-400/40',
  };

  const resolveUserLabel = (user: any) => user?.username ?? user?.email ?? 'Unknown';

  const resolveUserEmail = (user: any) => user?.email ?? 'Unknown';

  const isPlayerAccount = (user: any) => {
    const role = String(user?.role ?? '').toLowerCase();
    if (user?.is_admin) return false;
    if (role && role !== 'student') return false;
    return true;
  };

  const playerUsers = users.filter(isPlayerAccount);

  // Delete a quiz score entry
  const deleteQuizScore = async (id: string, studentName: string) => {
    if (!window.confirm(`Delete submission from ${studentName}? This will allow them to retake the test.`)) return;
    try {
      const { error } = await supabase.from('quiz_scores').delete().eq('id', id);
      if (error) throw error;
      addToast(`🗑️ Deleted submission from ${studentName}`, 'success');
      fetchQuizScores();
    } catch (error) {
      reportRpcError('Failed to delete submission:', error, 'Failed to delete submission');
    }
  };

  // Correct answers for different tests
  const correctAnswers: Record<string, Record<number, string>> = {
    'Cambridge Reading 25': {
      1:"common", 2:"typically", 3:"access", 4:"stay", 5:"hunt", 6:"defend", 7:"escape", 8:"number",
      9:"B", 10:"A", 11:"A", 12:"C", 13:"A",
      14:"G", 15:"D", 16:"F", 17:"A", 18:"C",
      19:"nothing", 20:"be", 21:"for", 22:"can", 23:"the", 24:"if", 25:"would", 26:"to",
      27:"C", 28:"A", 29:"B", 30:"C", 31:"A", 32:"D", 33:"C", 34:"A", 35:"B", 36:"C",
      37:"C", 38:"B", 39:"D", 40:"A", 41:"B", 42:"C"
    },
    'Cambridge Listening Test 1': {
      1:"C", 2:"A", 3:"B", 4:"B", 5:"C",
      6:"B", 7:"B", 8:"A", 9:"C", 10:"A",
      11:"Thursdays", 12:"flute", 13:"dance studio", 14:"restaurant", 15:"DRASTLE",
      16:"B", 17:"C", 18:"C", 19:"A", 20:"A",
      21:"H", 22:"E", 23:"D", 24:"C", 25:"B"
    }
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
      "Picture Selection": { questions: [1,2,3,4,5], icon: "🖼️" },
      "Multiple Choice": { questions: [6,7,8,9,10], icon: "📝" },
      "Form Completion": { questions: [11,12,13,14,15], icon: "📋" },
      "Interview Comprehension": { questions: [16,17,18,19,20], icon: "🎤" },
      "Speaker Matching": { questions: [21,22,23,24,25], icon: "🔊" }
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
    'Cambridge Listening Test 1': [
      { name: "Part 1: Picture Selection", icon: "🖼️", questions: [1,2,3,4,5] },
      { name: "Part 2: Multiple Choice", icon: "📝", questions: [6,7,8,9,10] },
      { name: "Part 3: Form Completion", icon: "📋", questions: [11,12,13,14,15] },
      { name: "Part 4: Interview", icon: "🎤", questions: [16,17,18,19,20] },
      { name: "Part 5: Speaker Matching", icon: "🔊", questions: [21,22,23,24,25] }
    ]
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
    "Multiple Choice": {
      title: "Master MCQ Listening",
      tips: ["Read all options before listening", "Eliminate obviously wrong answers", "Listen for synonyms"]
    },
    "Form Completion": {
      title: "Improve Note-Taking",
      tips: ["Predict what type of answer is needed", "Write exactly what you hear", "Check spelling carefully"]
    },
    "Interview Comprehension": {
      title: "Understand Conversations",
      tips: ["Focus on speaker attitudes", "Listen for tone changes", "Note who says what"]
    },
    "Speaker Matching": {
      title: "Identify Speakers",
      tips: ["Listen for different voices", "Focus on main ideas per speaker", "Match opinions to statements"]
    },
    "Overall Performance": {
      title: "Improve Your Chemistry Knowledge",
      tips: ["Review the questions you got wrong", "Study the relevant chapter in your textbook", "Practice more past paper questions", "Ask your teacher for help with difficult concepts"]
    }
  };

  // Analyze skill performance
  const analyzeSkillPerformance = (result: any) => {
    const quizName = result.quiz_name || '';
    const rawAnswers = result.answers || {};
    const categories = skillCategories[quizName] || {};
    const correctAnswersForQuiz = correctAnswers[quizName] || {};
    
    // Check if this is a Chemistry test (no predefined skill categories)
    const isChemistryTest = quizName.toLowerCase().includes('chemistry');
    
    // For Chemistry tests, create a simple overall performance entry
    if (isChemistryTest || Object.keys(categories).length === 0) {
      // Parse the answers structure - Chemistry tests store responses inside answers.responses
      const responses = rawAnswers.responses || rawAnswers || {};
      const totalQuestions = result.total_questions || Object.keys(responses).length || 1;
      const actualScore = result.score || 0;
      const percentage = result.percentage || Math.round((actualScore / totalQuestions) * 100);
      
      // Create a single "Overall Performance" entry for Chemistry tests
      return {
        "Overall Performance": {
          correct: actualScore,
          total: totalQuestions,
          percentage: percentage,
          icon: "🧪"
        }
      };
    }

    // For English tests with defined skill categories
    const skillPerformance: Record<string, { correct: number; total: number; percentage: number; icon: string }> = {};
    
    Object.entries(categories).forEach(([skill, data]) => {
      let correctCount = 0;
      data.questions.forEach(q => {
        const studentAns = (rawAnswers[q] || '').toString().trim().toLowerCase();
        const correctAns = (correctAnswersForQuiz[q] || '').toString().toLowerCase();
        if (studentAns === correctAns) correctCount++;
      });
      skillPerformance[skill] = {
        correct: correctCount,
        total: data.questions.length,
        percentage: Math.round((correctCount / data.questions.length) * 100),
        icon: data.icon
      };
    });

    return skillPerformance;
  };

  // Get grade from percentage
  const getGrade = (percentage: number) => {
    if (percentage >= 90) return 'A';
    if (percentage >= 80) return 'B';
    if (percentage >= 70) return 'C';
    if (percentage >= 60) return 'D';
    return 'F';
  };

  // Get encouragement message
  const getEncouragement = (grade: string) => {
    const messages: Record<string, { title: string; message: string }> = {
      'A': { title: "Outstanding Achievement! 🏆", message: "You've demonstrated excellent skills. Challenge yourself with more advanced material!" },
      'B': { title: "Great Work! ⭐", message: "You're performing above average. Focus on weak areas to reach the top!" },
      'C': { title: "Good Progress! 👍", message: "You're building solid foundations. Targeted practice will help you improve!" },
      'D': { title: "Keep Pushing! 💪", message: "Every expert was once a beginner. Follow the action plan and practice consistently!" },
      'F': { title: "Time for a Fresh Start 📚", message: "This is a learning opportunity. Work through the action plan step by step." }
    };
    return messages[grade] || messages['C'];
  };

  // Open report modal
  const openReport = (student: any) => {
    setReportStudent(student);
    setShowReportModal(true);
  };

  // Open answer reflection modal
  const openAnswerReflection = (student: any) => {
    setReportStudent(student);
    setShowAnswerReflection(true);
  };

  // Export to CSV
  const exportCSV = () => {
    if (filteredQuizScores.length === 0) {
      addToast('No data to export', 'error');
      return;
    }
    const headers = ['Name', 'Class', 'Quiz', 'Score', 'Total', 'Percentage', 'Time (seconds)', 'Date'];
    const rows = filteredQuizScores.map(r => [
      r.student_name,
      r.student_class || '',
      r.quiz_name,
      r.score,
      r.total_questions,
      r.percentage,
      r.time_taken_seconds || '',
      r.submitted_at
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cambridge_test_results_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    addToast('📥 CSV exported successfully', 'success');
  };

  const updateUserInState = (userId: string, patch: Record<string, unknown>) => {
    setUsers(prev => prev.map(user => user.id === userId ? { ...user, ...patch } : user));
  };

  const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    if (typeof (error as { message?: string })?.message === 'string') {
      return (error as { message?: string }).message as string;
    }
    return fallback;
  };

  const logRpcError = (context: string, error: unknown) => {
    if (import.meta.env.DEV) {
      console.error(context, error);
    }
  };

  const reportRpcError = (context: string, error: unknown, fallback: string) => {
    const message = getErrorMessage(error, fallback);
    logRpcError(context, error);
    addToast(message, 'error');
    return message;
  };

  const handleLogout = async () => {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);
    try {
      await AuthService.logout();
      onComplete();
    } catch (error) {
      reportRpcError('Failed to log out:', error, 'Failed to log out.');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const isMissingRpc = (error: unknown, rpcName: string) => {
    const message = (error as { message?: string })?.message?.toLowerCase() ?? '';
    return (
      message.includes('function') &&
      message.includes(rpcName.toLowerCase()) &&
      (message.includes('does not exist') || message.includes('not found') || message.includes('404'))
    );
  };

  const fetchDashboardStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const { data, error } = await supabase.rpc('rpc_admin_dashboard_stats');
      if (error) throw error;

      const payload = Array.isArray(data) ? data[0] : data;
      const resolved = payload || {};

      setStats({
        totalUsers: Number(resolved.total_users ?? resolved.totalUsers ?? 0),
        totalTeachers: Number(resolved.total_teachers ?? resolved.totalTeachers ?? 0),
        bhMembers: Number(resolved.bh_members ?? resolved.bhMembers ?? 0),
        ieltsUsers: Number(resolved.ielts_users ?? resolved.ieltsUsers ?? 0),
        ieltsTeachers: Number(resolved.ielts_teachers ?? resolved.ieltsTeachers ?? 0),
      });
    } catch (error) {
      const message = reportRpcError('Failed to fetch admin stats:', error, 'Failed to load admin stats.');
      setStatsError(message);
      setStats({
        totalUsers: null,
        totalTeachers: null,
        bhMembers: null,
        ieltsUsers: null,
        ieltsTeachers: null,
      });
    } finally {
      setStatsLoading(false);
    }
  }, [addToast]);

  const fetchUsers = useCallback(
    async (page = 0, query = '') => {
      setUsersLoading(true);
      setUsersError(null);
      try {
        const { data, error } = await supabase.rpc('rpc_admin_list_users', {
          p_limit: PAGE_SIZE,
          p_offset: page * PAGE_SIZE,
          p_search: query.trim() || null,
        });
        if (error) throw error;

        const list = (data as any[]) ?? [];
        setUsers(list);
        setHasNextPage(list.length === PAGE_SIZE);
      } catch (error) {
        const message = reportRpcError('Failed to fetch users:', error, 'Failed to load users.');
        setUsersError(message);
        setUsers([]);
        setHasNextPage(false);
      } finally {
        setUsersLoading(false);
      }
    },
    [PAGE_SIZE, addToast]
  );

  const refreshAdminData = useCallback(async () => {
    await Promise.all([
      fetchDashboardStats(),
      fetchUsers(userPage, searchQuery),
    ]);
  }, [fetchDashboardStats, fetchUsers, searchQuery, userPage]);

  useEffect(() => {
    void fetchDashboardStats();
  }, [fetchDashboardStats]);

  useEffect(() => {
    setUserPage(0);
  }, [searchQuery]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void fetchUsers(userPage, searchQuery);
    }, 300);

    return () => {
      window.clearTimeout(handle);
    };
  }, [fetchUsers, searchQuery, userPage]);

  const toggleAdminVisibility = async () => {
    try {
      const newVisibility = !adminVisible;
      const { error } = await supabase
        .from('users')
        .update({ admin_visible: newVisibility })
        .eq('id', profile.id);

      if (error) throw error;

      setAdminVisible(newVisibility);
      addToast(
        newVisibility ? '👁️ Admin now VISIBLE in leaderboards & PvP' : '👻 Admin now HIDDEN from leaderboards & PvP',
        'success'
      );
    } catch (error) {
      reportRpcError('Failed to toggle visibility:', error, 'Failed to toggle visibility');
    }
  };

  const grantCoins = async (userId: string, amount: number) => {
    try {
      const user = users.find(u => u.id === userId);
      if (!user) return;

      const { error } = await supabase.rpc('rpc_admin_grant', {
        p_user_id: userId,
        p_xp_delta: 0,
        p_coins_delta: amount,
      });

      if (error) throw error;

      updateUserInState(userId, { coins: Number(user.coins ?? 0) + amount });
      addToast(`✨ Granted ${amount} coins to ${user.username ?? user.email ?? 'Unknown'}`, 'success');
      await refreshAdminData();
    } catch (error) {
      reportRpcError('Failed to grant coins:', error, 'Failed to grant coins');
    }
  };

  const grantXP = async (userId: string, amount: number) => {
    try {
      const user = users.find(u => u.id === userId);
      if (!user) return;

      const { error } = await supabase.rpc('rpc_admin_grant', {
        p_user_id: userId,
        p_xp_delta: amount,
        p_coins_delta: 0,
      });

      if (error) throw error;

      updateUserInState(userId, { xp: Number(user.xp ?? 0) + amount });
      addToast(`⚡ Granted ${amount} XP to ${user.username ?? user.email ?? 'Unknown'}`, 'success');
      await refreshAdminData();
    } catch (error) {
      reportRpcError('Failed to grant XP:', error, 'Failed to grant XP');
    }
  };

  const setUserLevel = async (userId: string, currentLevel: number) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    const nextLevel = Number(currentLevel ?? 0) + 1;

    try {
      const { error } = await supabase.rpc('rpc_admin_set_level', {
        p_user_id: userId,
        p_level: nextLevel,
      });

      if (error) {
        if (isMissingRpc(error, 'rpc_admin_set_level')) {
          logRpcError('Missing rpc_admin_set_level:', error);
          addToast('Backend missing rpc_admin_set_level', 'error');
          return;
        }
        throw error;
      }

      updateUserInState(userId, { level: nextLevel });
      addToast(`📈 Level updated for ${user.username ?? user.email ?? 'Unknown'}`, 'success');
      await refreshAdminData();
    } catch (error) {
      reportRpcError('Failed to set level:', error, 'Failed to set level');
    }
  };

  const resetUserAP = async (userId: string) => {
    try {
      const { error } = await supabase.rpc('rpc_admin_reset_ap', {
        p_user_id: userId,
      });

      if (error) {
        if (isMissingRpc(error, 'rpc_admin_reset_ap')) {
          logRpcError('Missing rpc_admin_reset_ap:', error);
          addToast('Backend missing rpc_admin_reset_ap', 'error');
          return;
        }
        throw error;
      }

      addToast('⚡ AP reset to 20', 'success');
      await refreshAdminData();
    } catch (error) {
      reportRpcError('Failed to reset AP:', error, 'Failed to reset AP');
    }
  };

  const resetUserProgress = async (userId: string, username: string) => {
    try {
      const confirmReset = window.confirm(`Reset progress for ${username}? This clears XP, coins, and streak.`);
      if (!confirmReset) {
        return;
      }

      await CompetitionService.resetPlayerProgress(userId);
      addToast(`♻️ Progress reset for ${username}`, 'success');
      await refreshAdminData();
      window.dispatchEvent(new CustomEvent('leaderboards:refresh'));
    } catch (error) {
      reportRpcError('Failed to reset progress:', error, 'Failed to reset progress');
    }
  };

  const resetAllProgress = async () => {
    try {
      const confirmReset = window.confirm('Reset progress for ALL players (excluding admins)? This action cannot be undone.');
      if (!confirmReset) {
        return;
      }

      setIsResettingAll(true);
      const affected = await CompetitionService.resetAllPlayerProgress();
      addToast(`🧨 Reset progress for ${affected} players`, 'success');
      await refreshAdminData();
      window.dispatchEvent(new CustomEvent('leaderboards:refresh'));
    } catch (error) {
      reportRpcError('Failed to reset everyone:', error, 'Failed to reset everyone');
    } finally {
      setIsResettingAll(false);
    }
  };

  const handleGradeChange = async (userId: string, nextGrade: string) => {
    const grade = nextGrade ? parseInt(nextGrade, 10) : null;
    const user = users.find(u => u.id === userId);
    if (!user) return;

    const batch: Batch | null = (() => {
      const existingBatch = (typeof user.batch === 'string' ? user.batch : null) as Batch | null;

      if (!grade) {
        return existingBatch === 'N/A' ? 'N/A' : null;
      }

      if (!existingBatch) {
        return null;
      }
      const allowed = batchByGrade[grade as Grade];
      return allowed.includes(existingBatch) ? existingBatch : null;
    })();

    try {
      await CompetitionService.updatePlayerAcademics(userId, grade, batch);
      addToast(`🎓 Updated grade${batch ? ' and class' : ''} for ${user.username ?? user.email ?? 'Unknown'}`, 'success');
      updateUserInState(userId, { grade, batch });
    } catch (error) {
      reportRpcError('Failed to update grade:', error, 'Failed to update grade');
    }
  };

  const handleBatchChange = async (userId: string, nextBatch: string) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    const grade = user.grade !== null && user.grade !== undefined ? Number(user.grade) : null;
    const batch = nextBatch || null;

    try {
      await CompetitionService.updatePlayerAcademics(userId, grade, batch);
      addToast(`🏫 Updated class for ${user.username ?? user.email ?? 'Unknown'}`, 'success');
      updateUserInState(userId, { batch });
    } catch (error) {
      reportRpcError('Failed to update class:', error, 'Failed to update class');
    }
  };

  const resetUserAcademics = async (userId: string, username: string) => {
    try {
      const confirmReset = window.confirm(`Reset school, grade, and class for ${username}? They will need to re-select these when they next log in.`);
      if (!confirmReset) {
        return;
      }

      await CompetitionService.resetPlayerAcademics(userId);
      addToast(`🏫 Reset school/grade/class for ${username}`, 'success');
      updateUserInState(userId, { school: null, grade: null, batch: null });
    } catch (error) {
      reportRpcError('Failed to reset academics:', error, 'Failed to reset academics');
    }
  };

  const sendAnnouncement = async () => {
    if (!announcementText.trim()) {
      addToast('Announcement text is empty', 'error');
      return;
    }

    try {
      let expiresAt: string | null = null;

      if (announcementExpiry !== 'never') {
        if (announcementExpiry === 'custom') {
          if (!customAnnouncementExpiry) {
            addToast('Select an expiration date/time', 'error');
            return;
          }
          const parsed = new Date(customAnnouncementExpiry);
          if (Number.isNaN(parsed.getTime())) {
            addToast('Expiration date/time is invalid', 'error');
            return;
          }
          expiresAt = parsed.toISOString();
        } else {
          const days = announcementExpiry === '1d' ? 1 : announcementExpiry === '7d' ? 7 : 30;
          const expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + days);
          expiresAt = expiryDate.toISOString();
        }
      }
      setIsSendingAnnouncement(true);
      await CompetitionService.postAnnouncement(announcementText.trim(), expiresAt);
      addToast('📢 Announcement sent to all players', 'success');
      setAnnouncementText('');
      setAnnouncementExpiry('never');
      setCustomAnnouncementExpiry('');
      setShowAnnouncementComposer(false);
    } catch (error) {
      reportRpcError('Failed to send announcement:', error, 'Failed to send announcement');
    } finally {
      setIsSendingAnnouncement(false);
    }
  };

  const setUserBanState = async (userId: string, username: string, shouldBan: boolean) => {
    const confirmMessage = shouldBan
      ? `Ban ${username}? They will be kicked immediately.`
      : `Unban ${username}? They can log in again.`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      const newStatus = await CompetitionService.setPlayerBanned(userId, shouldBan);
      updateUserInState(userId, { is_banned: newStatus });
      await refreshAdminData();
      addToast(shouldBan ? '🔨 Player banned successfully' : '✅ Player unbanned', 'success');
    } catch (error) {
      reportRpcError('Failed to toggle ban:', error, shouldBan ? 'Failed to ban player' : 'Failed to unban player');
    }
  };

  const deleteUser = async (userId: string, username: string) => {
    if (!window.confirm(`Delete ${username}? This will remove their account permanently.`)) {
      return;
    }

    try {
      await CompetitionService.deletePlayer(userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
      await refreshAdminData();
      addToast(`🗑️ Deleted ${username}`, 'success');
    } catch (error) {
      reportRpcError('Failed to delete user:', error, 'Failed to delete user');
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Epic Animated Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-pink-900/20 to-red-900/20 animate-pulse-slow"></div>
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="admin-particles"></div>
        </div>
      </div>

      <div className="relative z-10 p-6">
        <BackButton onClick={handleLogout} label={isLoggingOut ? 'Logging out…' : 'Log out'} />

        {/* Godly Admin Header */}
        <div className="text-center mb-8 relative">
          <div className="inline-block relative">
            {/* Rotating Glow Effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-600 blur-3xl opacity-50 animate-spin-slow"></div>
            
            <h1 className="relative font-heading text-6xl font-black mb-2 animate-float">
              <span className="bg-gradient-to-r from-yellow-300 via-pink-400 to-purple-500 bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(255,215,0,0.8)]">
                ⚡ ADMIN PORTAL ⚡
              </span>
            </h1>
            
            <div className="flex items-center justify-center gap-3 mt-4">
              <div className="w-16 h-16 rounded-full border-4 border-yellow-400 animate-pulse-glow overflow-hidden">
                <img src={profile.avatar_url} alt="Admin" className="w-full h-full object-cover" />
              </div>
              <div className="text-left">
                <p className="text-2xl font-bold text-yellow-300 drop-shadow-[0_0_10px_rgba(255,215,0,1)]">
                  {profile.username}
                </p>
                <p className="text-sm text-purple-300">👑 Supreme Administrator 👑</p>
              </div>
            </div>
          </div>
        </div>

        {/* Visibility Toggle - Godly Button */}
        <div className="max-w-4xl mx-auto mb-8">
          <button
            onClick={toggleAdminVisibility}
            className={`w-full relative group overflow-hidden rounded-2xl p-6 transition-all duration-500 ${
              adminVisible
                ? 'bg-gradient-to-r from-green-600/30 to-emerald-600/30 border-2 border-green-400 hover:shadow-[0_0_40px_rgba(34,197,94,0.6)]'
                : 'bg-gradient-to-r from-purple-600/30 to-indigo-600/30 border-2 border-purple-400 hover:shadow-[0_0_40px_rgba(168,85,247,0.6)]'
            }`}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
            
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`text-5xl ${adminVisible ? 'animate-pulse-glow' : ''}`}>
                  {adminVisible ? '👁️' : '👻'}
                </div>
                <div className="text-left">
                  <p className="text-2xl font-bold text-white mb-1">
                    {adminVisible ? 'VISIBLE MODE' : 'GHOST MODE'}
                  </p>
                  <p className="text-sm text-gray-300">
                    {adminVisible 
                      ? 'You appear in leaderboards & PvP (but cannot be attacked)'
                      : 'You are hidden from leaderboards & PvP'
                    }
                  </p>
                </div>
              </div>
              <div className="text-4xl font-bold text-white animate-bounce">
                {adminVisible ? '→ HIDE' : '→ SHOW'}
              </div>
            </div>
          </button>
        </div>

        {/* Tab Navigation - Epic Style */}
        <div className="max-w-6xl mx-auto mb-6">
          <div className="flex flex-wrap gap-2 justify-center">
            {(['dashboard', 'users', 'schools', 'applications', 'game', 'clans', 'analytics', 'cambridge', 'ielts', 'system'] as AdminTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`relative px-6 py-3 rounded-xl font-heading text-lg font-bold transition-all duration-300 ${
                  activeTab === tab
                    ? 'bg-gradient-to-r from-yellow-400 to-pink-500 text-black shadow-[0_0_30px_rgba(255,215,0,0.8)] scale-110'
                    : 'bg-black/40 text-gray-400 hover:text-white border border-gray-600 hover:border-yellow-400'
                }`}
              >
                {activeTab === tab && (
                  <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 to-pink-500 blur-xl opacity-50 -z-10"></div>
                )}
                {tab.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="max-w-7xl mx-auto">
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {statsError && (
                <div className="rounded-xl border border-red-400/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {statsError}
                </div>
              )}
              {/* Stats Grid - Godly Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[
                  {
                    key: 'totalUsers',
                    label: 'Total Users',
                    value: stats.totalUsers,
                    icon: '👥',
                    containerClass: 'bg-gradient-to-br from-cyan-600/20 to-cyan-900/20 border-2 border-cyan-400',
                    valueClass: 'text-cyan-300'
                  },
                  {
                    key: 'totalTeachers',
                    label: 'Total Teachers',
                    value: stats.totalTeachers,
                    icon: '🧑‍🏫',
                    containerClass: 'bg-gradient-to-br from-orange-600/20 to-orange-900/20 border-2 border-orange-400',
                    valueClass: 'text-orange-300'
                  },
                  {
                    key: 'bhMembers',
                    label: 'BH Members',
                    value: stats.bhMembers,
                    icon: '🧠',
                    containerClass: 'bg-gradient-to-br from-blue-600/20 to-blue-900/20 border-2 border-blue-400',
                    valueClass: 'text-blue-300'
                  },
                  {
                    key: 'ieltsUsers',
                    label: 'IELTS Users',
                    value: stats.ieltsUsers,
                    icon: '📘',
                    containerClass: 'bg-gradient-to-br from-yellow-600/20 to-yellow-900/20 border-2 border-yellow-400',
                    valueClass: 'text-yellow-300'
                  },
                  {
                    key: 'ieltsTeachers',
                    label: 'IELTS Teachers',
                    value: stats.ieltsTeachers,
                    icon: '🎓',
                    containerClass: 'bg-gradient-to-br from-emerald-600/20 to-emerald-900/20 border-2 border-emerald-400',
                    valueClass: 'text-emerald-300'
                  },
                  {
                    key: 'godMode',
                    label: 'God Mode',
                    value: 'ACTIVE',
                    icon: '👑',
                    containerClass: 'bg-gradient-to-br from-pink-600/20 to-pink-900/20 border-2 border-pink-400',
                    valueClass: 'text-pink-300'
                  }
                ].map((stat, idx) => {
                  const resolvedValue =
                    stat.key === 'godMode'
                      ? 'ACTIVE'
                      : statsError
                        ? '—'
                        : (stats as Record<string, number | null>)[stat.key] ?? '—';

                  return (
                  <div
                    key={idx}
                    className={`relative overflow-hidden rounded-2xl p-6 ${stat.containerClass} hover:shadow-[0_0_40px_rgba(255,215,0,0.4)] transition-all duration-300 hover:scale-105`}
                  >
                    <div className="absolute top-0 right-0 text-9xl opacity-10">{stat.icon}</div>
                    <div className="relative">
                      <p className="text-sm text-gray-300 mb-2">{stat.label}</p>
                      {statsLoading && stat.key !== 'godMode' ? (
                        <div className="h-10 w-24 rounded-lg bg-white/10 animate-pulse" />
                      ) : (
                        <p className={`text-4xl font-bold font-mono ${stat.valueClass}`}>{resolvedValue}</p>
                      )}
                    </div>
                  </div>
                );
                })}
              </div>

              {/* Quick Actions */}
              <div className="card-glass p-6 border-2 border-yellow-400/50">
                <h3 className="text-2xl font-heading font-bold text-yellow-300 mb-4">⚡ Quick Actions</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <button
                    onClick={refreshAdminData}
                    className="bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-400 text-white font-semibold px-6 py-3 rounded-lg transition-all hover:shadow-[0_0_20px_rgba(6,182,212,0.6)]"
                  >
                    🔄 Refresh Data
                  </button>
                  <button
                    onClick={() => setShowAnnouncementComposer(true)}
                    className="bg-green-600/30 hover:bg-green-600/50 border border-green-400 text-white font-semibold px-6 py-3 rounded-lg transition-all hover:shadow-[0_0_20px_rgba(34,197,94,0.6)]"
                  >
                    📢 Send Announcement
                  </button>
                  <button
                    onClick={resetAllProgress}
                    disabled={isResettingAll}
                    className={`border border-red-400 text-white font-semibold px-6 py-3 rounded-lg transition-all ${
                      isResettingAll
                        ? 'bg-red-600/20 cursor-not-allowed'
                        : 'bg-red-600/30 hover:bg-red-600/50 hover:shadow-[0_0_20px_rgba(248,113,113,0.6)]'
                    }`}
                  >
                    {isResettingAll ? '⏳ Resetting...' : '🧨 Reset All Progress'}
                  </button>
                </div>
              </div>

              {/* Detailed User Analytics */}
              <div className="card-glass p-6 border-2 border-cyan-400/50">
                <h3 className="text-2xl font-heading font-bold text-cyan-300 mb-4">📊 User Analytics</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="bg-black/30 p-4 rounded-lg border border-cyan-400/50">
                    <p className="text-sm text-gray-400 mb-1">Average Level</p>
                    <p className="text-3xl font-bold text-cyan-300">
                      {playerUsers.length > 0 ? (playerUsers.reduce((sum, u) => sum + Number(u.level ?? 0), 0) / playerUsers.length).toFixed(1) : '0'}
                    </p>
                  </div>
                  <div className="bg-black/30 p-4 rounded-lg border border-blue-400/50">
                    <p className="text-sm text-gray-400 mb-1">Average XP</p>
                    <p className="text-3xl font-bold text-blue-300">
                      {playerUsers.length > 0 ? Math.floor(playerUsers.reduce((sum, u) => sum + Number(u.xp ?? 0), 0) / playerUsers.length).toLocaleString() : '0'}
                    </p>
                  </div>
                  <div className="bg-black/30 p-4 rounded-lg border border-yellow-400/50">
                    <p className="text-sm text-gray-400 mb-1">Richest Player</p>
                    <p className="text-xl font-bold text-yellow-300">
                      {playerUsers.length > 0 ? resolveUserLabel(playerUsers.reduce((max, u) => Number(u.coins ?? 0) > Number(max.coins ?? 0) ? u : max, playerUsers[0])) : 'None'}
                    </p>
                    <p className="text-sm text-gray-400">
                      {playerUsers.length > 0 ? `${Number(playerUsers.reduce((max, u) => Number(u.coins ?? 0) > Number(max.coins ?? 0) ? u : max, playerUsers[0])?.coins ?? 0).toLocaleString()} 🪙` : ''}
                    </p>
                  </div>
                  <div className="bg-black/30 p-4 rounded-lg border border-purple-400/50">
                    <p className="text-sm text-gray-400 mb-1">Highest Level</p>
                    <p className="text-xl font-bold text-purple-300">
                      {playerUsers.length > 0 ? resolveUserLabel(playerUsers.reduce((max, u) => Number(u.level ?? 0) > Number(max.level ?? 0) ? u : max, playerUsers[0])) : 'None'}
                    </p>
                    <p className="text-sm text-gray-400">
                      {playerUsers.length > 0 ? `Level ${Number(playerUsers.reduce((max, u) => Number(u.level ?? 0) > Number(max.level ?? 0) ? u : max, playerUsers[0])?.level ?? 0)}` : ''}
                    </p>
                  </div>
                  <div className="bg-black/30 p-4 rounded-lg border border-green-400/50">
                    <p className="text-sm text-gray-400 mb-1">Total AP Pool</p>
                    <p className="text-3xl font-bold text-green-300">
                      {playerUsers.reduce((sum, u) => sum + Number(u.ap_now ?? 0), 0)}
                    </p>
                  </div>
                  <div className="bg-black/30 p-4 rounded-lg border border-red-400/50">
                    <p className="text-sm text-gray-400 mb-1">Students</p>
                    <p className="text-3xl font-bold text-red-300">
                      {playerUsers.length}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="card-glass p-6 border-2 border-purple-400/50">
              <h3 className="text-3xl font-heading font-bold text-purple-300 mb-6">👥 User Management</h3>
              
              {/* Search Bar */}
              <div className="mb-6">
                <input
                  type="text"
                  placeholder="🔍 Search by username, email, or batch..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-3 bg-black/40 border-2 border-purple-400/50 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-400 focus:shadow-[0_0_20px_rgba(168,85,247,0.4)]"
                />
                <p className="text-sm text-gray-400 mt-2">
                  Showing {users.length} users • Page {userPage + 1}
                </p>
              </div>

              {usersError && (
                <div className="mb-4 rounded-xl border border-red-400/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {usersError}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <span>Results per page: {PAGE_SIZE}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setUserPage((prev) => Math.max(0, prev - 1))}
                    disabled={userPage === 0}
                    className="rounded-lg border border-purple-400/50 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40 hover:bg-purple-500/20"
                  >
                    ◀ Prev
                  </button>
                  <span className="text-sm text-gray-300">Page {userPage + 1}</span>
                  <button
                    type="button"
                    onClick={() => setUserPage((prev) => prev + 1)}
                    disabled={!hasNextPage}
                    className="rounded-lg border border-purple-400/50 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40 hover:bg-purple-500/20"
                  >
                    Next ▶
                  </button>
                </div>
              </div>

              <div className="max-h-[600px] overflow-y-auto space-y-3">
                {usersLoading && (
                  <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-gray-300">
                    Loading users…
                  </div>
                )}
                {!usersLoading && users.length === 0 && (
                  <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-gray-300">
                    No users found for this page.
                  </div>
                )}
                {!usersLoading && users.map((user) => {
                  const isBanned = Boolean(user.is_banned);
                  const userGrade: Grade | null = (() => {
                    if (typeof user.grade === 'number') {
                      return user.grade as Grade;
                    }
                    if (typeof user.grade === 'string' && user.grade.trim() !== '') {
                      const parsed = parseInt(user.grade, 10);
                      return parsed >= 6 && parsed <= 12 ? (parsed as Grade) : null;
                    }
                    return null;
                  })();

                  const gradeValue = userGrade ?? '';
                  const batchValue = typeof user.batch === 'string' ? user.batch : '';
                  const availableBatches = userGrade ? batchByGrade[userGrade] : ['N/A'];

                  return (
                    <div
                      key={user.id}
                      className={`p-4 rounded-lg border transition-all ${
                        isBanned
                          ? 'bg-red-950/40 border-red-500/70 hover:border-red-400'
                          : 'bg-black/40 border-gray-700 hover:border-purple-400'
                      }`}
                    >
                      <div className="flex items-start justify-between flex-wrap gap-4">
                        {/* User Info */}
                        <div className="flex items-center gap-3 flex-1">
                          <img src={user.avatar_url} alt={resolveUserLabel(user)} className="w-16 h-16 rounded-full border-2 border-purple-400" />
                          <div>
                            <p className="font-bold text-white text-lg">
                              <ClickableUsername userId={user.id} username={resolveUserLabel(user)}>
                                {resolveUserLabel(user)}
                              </ClickableUsername>
                            </p>
                            <p className="text-sm text-gray-400">{resolveUserEmail(user)}</p>
                            <div className="flex gap-3 mt-1">
                              <span className="text-xs bg-cyan-600/30 text-cyan-300 px-2 py-1 rounded">Lvl {Number(user.level ?? 0)}</span>
                              <span className="text-xs bg-purple-600/30 text-purple-300 px-2 py-1 rounded">{user.batch || 'No Batch'}</span>
                              <span className="text-xs bg-yellow-600/30 text-yellow-300 px-2 py-1 rounded">{user.role || 'student'}</span>
                              {isBanned && (
                                <span className="text-xs bg-red-700/60 text-red-200 px-2 py-1 rounded">BANNED</span>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div className="bg-blue-600/20 px-3 py-2 rounded border border-blue-400/50">
                            <p className="text-blue-300 font-mono">{Number(user.xp ?? 0).toLocaleString()} XP</p>
                          </div>
                          <div className="bg-yellow-600/20 px-3 py-2 rounded border border-yellow-400/50">
                            <p className="text-yellow-300 font-mono">{Number(user.coins ?? 0).toLocaleString()} 🪙</p>
                          </div>
                          <div className="bg-emerald-600/20 px-3 py-2 rounded border border-emerald-400/50">
                            <p className="text-emerald-300 font-mono">{Number(user.gemstones ?? 0).toLocaleString()} 💎</p>
                          </div>
                          <div className="bg-green-600/20 px-3 py-2 rounded border border-green-400/50">
                            <p className="text-green-300 font-mono">{Number(user.ap_now ?? 0)}/{Number(user.ap_max ?? 0)} AP</p>
                          </div>
                          <div className="bg-red-600/20 px-3 py-2 rounded border border-red-400/50">
                            <p className="text-red-300 font-mono">⚔️ {Number(user.attack_power ?? 0)} | 🛡️ {Number(user.defense_power ?? 0)}</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">Grade</label>
                          <select
                            value={gradeValue}
                            onChange={(e) => handleGradeChange(user.id, e.target.value)}
                            className="w-full bg-black/40 border border-purple-400/50 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-300"
                          >
                            <option value="">Unset</option>
                            {gradeOptions.map((grade) => (
                              <option key={grade} value={grade}>{grade}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">Class</label>
                          <select
                            value={batchValue}
                            onChange={(e) => handleBatchChange(user.id, e.target.value)}
                            className="w-full bg-black/40 border border-purple-400/50 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-300"
                          >
                            <option value="">Unset</option>
                            {availableBatches.map((batch) => (
                              <option key={batch} value={batch}>{batch}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-700">
                        <button
                          onClick={() => grantCoins(user.id, 1000)}
                          className="bg-yellow-600/30 hover:bg-yellow-600/50 border border-yellow-400 text-white text-sm px-3 py-2 rounded transition-all hover:shadow-[0_0_15px_rgba(251,191,36,0.5)]"
                        >
                          💰 +1000 Coins
                        </button>
                        <button
                          onClick={() => grantXP(user.id, 500)}
                          className="bg-blue-600/30 hover:bg-blue-600/50 border border-blue-400 text-white text-sm px-3 py-2 rounded transition-all hover:shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                        >
                          ⚡ +500 XP
                        </button>
                        <button
                          onClick={() => resetUserAP(user.id)}
                          className="bg-green-600/30 hover:bg-green-600/50 border border-green-400 text-white text-sm px-3 py-2 rounded transition-all hover:shadow-[0_0_15px_rgba(34,197,94,0.5)]"
                        >
                          🔋 Reset AP
                        </button>
                        <button
                          onClick={() => setUserLevel(user.id, user.level)}
                          className="bg-purple-600/30 hover:bg-purple-600/50 border border-purple-400 text-white text-sm px-3 py-2 rounded transition-all hover:shadow-[0_0_15px_rgba(168,85,247,0.5)]"
                        >
                          📈 +1 Level
                        </button>
                        <button
                          onClick={() => resetUserProgress(user.id, resolveUserLabel(user))}
                          className="bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-400 text-white text-sm px-3 py-2 rounded transition-all hover:shadow-[0_0_15px_rgba(99,102,241,0.5)]"
                        >
                          ♻️ Reset Progress
                        </button>
                        <button
                          onClick={() => resetUserAcademics(user.id, resolveUserLabel(user))}
                          className="bg-orange-600/30 hover:bg-orange-600/50 border border-orange-400 text-white text-sm px-3 py-2 rounded transition-all hover:shadow-[0_0_15px_rgba(251,146,60,0.5)]"
                        >
                          🏫 Reset School/Grade/Class
                        </button>
                        <button
                          onClick={() => setUserBanState(user.id, resolveUserLabel(user), !isBanned)}
                          className={`${
                            isBanned
                              ? 'bg-green-600/30 hover:bg-green-600/50 border border-green-400 hover:shadow-[0_0_15px_rgba(34,197,94,0.5)]'
                              : 'bg-red-600/30 hover:bg-red-600/50 border border-red-400 hover:shadow-[0_0_15px_rgba(239,68,68,0.5)]'
                          } text-white text-sm px-3 py-2 rounded transition-all`}
                        >
                          {isBanned ? '♻️ Unban' : '🔨 Ban'}
                        </button>
                        <button
                          onClick={() => deleteUser(user.id, resolveUserLabel(user))}
                          className="bg-red-900/40 hover:bg-red-900/60 border border-red-600 text-white text-sm px-3 py-2 rounded transition-all hover:shadow-[0_0_18px_rgba(220,38,38,0.5)]"
                        >
                          🗑️ Delete User
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'schools' && (
            <div className="space-y-6">
              {isSuperadmin && (
                <div className="card-glass border-2 border-indigo-400/50 p-6">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-2xl font-heading font-bold text-indigo-200">🏫 School Admin Management</h3>
                        <span className="rounded-full border border-indigo-300/40 bg-indigo-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-100">
                          Superadmin only
                        </span>
                      </div>
                      <p className="text-sm text-gray-400">
                        Assign school admin role to users within a school. School admins can manage their school's members, classes, and settings.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => loadSchoolMembers(schoolAdminSchoolId)}
                      disabled={!schoolAdminSchoolId || schoolMembersLoading}
                      className="rounded-lg border border-indigo-400/60 bg-indigo-500/20 px-4 py-2 text-sm font-semibold text-indigo-100 hover:bg-indigo-500/30 disabled:opacity-60"
                    >
                      {schoolMembersLoading ? 'Loading...' : '🔄 Refresh Members'}
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-[2fr,1fr]">
                    <select
                      value={schoolAdminSchoolId}
                      onChange={(event) => {
                        const selectedId = event.target.value;
                        setSchoolAdminSchoolId(selectedId);
                        setSchoolMembers([]);
                        setSchoolMembersError(null);
                        if (selectedId) {
                          loadSchoolMembers(selectedId);
                        }
                      }}
                      className="w-full rounded-lg border border-indigo-400/30 bg-black/40 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    >
                      <option value="">Select a school to manage</option>
                      {schoolOptions.map((school) => (
                        <option key={school.id} value={school.id}>
                          {school.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={schoolMemberSearch}
                      onChange={(event) => setSchoolMemberSearch(event.target.value)}
                      placeholder="Search username or email..."
                      className="w-full rounded-lg border border-indigo-400/30 bg-black/40 px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>

                  {schoolAdminSchoolId && (
                    <div className="mt-4 rounded-lg border border-indigo-400/20 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-100">
                      {currentSchoolAdmin ? (
                        <span>
                          📌 Current school admin: <strong>{currentSchoolAdmin.username || currentSchoolAdmin.email}</strong>
                          {currentSchoolAdmin.email && ` (${currentSchoolAdmin.email})`}
                        </span>
                      ) : (
                        <span>⚠️ No school admin assigned yet. Select a member below to make them school admin.</span>
                      )}
                    </div>
                  )}

                  {schoolMembersError && (
                    <div className="mt-4 rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
                      ❌ {schoolMembersError}
                    </div>
                  )}

                  {schoolMembersLoading && (
                    <div className="mt-4 rounded-lg border border-white/10 bg-black/30 p-8 text-center">
                      <div className="inline-block animate-spin h-8 w-8 border-4 border-indigo-400 border-t-transparent rounded-full"></div>
                      <p className="text-sm text-gray-400 mt-3">Loading school members...</p>
                    </div>
                  )}

                  {!schoolMembersLoading && schoolAdminSchoolId && filteredSchoolMembers.length === 0 && (
                    <div className="mt-4 rounded-lg border border-white/10 bg-black/30 p-8 text-center text-sm text-gray-400">
                      <p className="text-4xl mb-2">🔍</p>
                      <p>No members found for this school.</p>
                      {schoolMemberSearch && <p className="text-xs mt-2">Try adjusting your search.</p>}
                    </div>
                  )}

                  {filteredSchoolMembers.length > 0 && (
                    <div className="mt-4 space-y-3">
                      <p className="text-xs text-gray-400">
                        Showing {filteredSchoolMembers.length} member{filteredSchoolMembers.length !== 1 ? 's' : ''}
                      </p>
                      {filteredSchoolMembers.map((member) => {
                        const isAdmin = member.role === 'school_admin';
                        return (
                          <div
                            key={member.user_id}
                            className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 transition-all ${
                              isAdmin
                                ? 'border-indigo-400/60 bg-indigo-500/15 shadow-[0_0_20px_rgba(99,102,241,0.3)]'
                                : 'border-white/10 bg-black/40 hover:bg-black/50'
                            }`}
                          >
                            <div className="flex-1">
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <p className="font-semibold text-white text-lg">
                                  {member.username || member.email || member.user_id}
                                </p>
                                {isAdmin && (
                                  <span className="rounded-full border border-indigo-300/40 bg-indigo-500/30 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-100 shadow-lg">
                                    👑 School Admin
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-3 text-xs text-gray-400">
                                <span>📧 {member.email || 'No email'}</span>
                                <span>•</span>
                                <span>👤 {member.role.replace(/_/g, ' ')}</span>
                                {member.grade && (
                                  <>
                                    <span>•</span>
                                    <span>📚 Grade {member.grade}</span>
                                  </>
                                )}
                                {member.level > 0 && (
                                  <>
                                    <span>•</span>
                                    <span>⭐ Level {member.level}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleSetSchoolAdmin(schoolAdminSchoolId, member.user_id, !isAdmin)}
                              disabled={schoolAdminActionLoading === member.user_id}
                              className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-all ${
                                isAdmin
                                  ? schoolAdminActionLoading === member.user_id
                                    ? 'border-red-400/50 bg-red-500/30 text-red-100 cursor-wait'
                                    : 'border-red-400/50 bg-red-500/20 text-red-100 hover:bg-red-500/40 hover:border-red-400'
                                  : schoolAdminActionLoading === member.user_id
                                    ? 'border-indigo-400/50 bg-indigo-500/30 text-indigo-100 cursor-wait'
                                    : 'border-indigo-400/50 bg-indigo-500/20 text-indigo-100 hover:bg-indigo-500/40 hover:border-indigo-400'
                              }`}
                            >
                              {schoolAdminActionLoading === member.user_id ? (
                                <>⏳ Updating...</>
                              ) : isAdmin ? (
                                <>❌ Remove Admin</>
                              ) : (
                                <>👑 Make School Admin</>
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {!isSuperadmin && (
                <div className="card-glass border-2 border-red-400/50 p-8 text-center">
                  <p className="text-4xl mb-4">🔒</p>
                  <h3 className="text-2xl font-bold text-red-300 mb-2">Access Restricted</h3>
                  <p className="text-gray-400">Only superadmins can manage schools and school admins.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'applications' && (
            <div className="space-y-6">
              <div className="card-glass p-6 border-2 border-cyan-400/50">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-3xl font-heading font-bold text-cyan-300">🏫 School Applications</h3>
                    <p className="text-sm text-gray-400">Review school requests and keep duplicates down.</p>
                  </div>
                  <button
                    onClick={loadSchoolRequests}
                    className="rounded-lg border border-cyan-400/60 bg-cyan-500/20 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/30"
                  >
                    🔄 Refresh
                  </button>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <input
                    type="text"
                    value={schoolRequestSearch}
                    onChange={(event) => setSchoolRequestSearch(event.target.value)}
                    placeholder="Search by name or email..."
                    className="w-full rounded-lg border border-cyan-400/30 bg-black/40 px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  />
                  <select
                    value={schoolRequestStatus}
                    onChange={(event) => setSchoolRequestStatus(event.target.value as typeof schoolRequestStatus)}
                    className="w-full rounded-lg border border-cyan-400/30 bg-black/40 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  >
                    <option value="pending">Pending</option>
                    <option value="needs_more_info">Needs more info</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="duplicate">Duplicate</option>
                    <option value="all">All statuses</option>
                  </select>
                  <div className="flex items-center justify-center rounded-lg border border-cyan-400/30 bg-black/40 px-4 py-2 text-sm text-cyan-100">
                    Showing {filteredSchoolRequests.length} requests
                  </div>
                </div>

                {schoolRequestsError && (
                  <div className="mt-4 rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
                    {schoolRequestsError}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {schoolRequestsLoading && (
                  <div className="rounded-lg border border-cyan-400/30 bg-black/40 p-6 text-center text-sm text-cyan-100">
                    Loading applications...
                  </div>
                )}

                {!schoolRequestsLoading && filteredSchoolRequests.length === 0 && (
                  <div className="rounded-lg border border-white/10 bg-black/30 p-6 text-center text-sm text-gray-400">
                    No school requests match your filters.
                  </div>
                )}

                {filteredSchoolRequests.map((request) => {
                  const status = request.status || 'pending';
                  const isActionLoading = schoolRequestActionLoading === request.id;
                  const noteValue = schoolRequestNotes[request.id] ?? request.admin_notes ?? '';
                  const isMessagesOpen = Boolean(schoolRequestMessagesOpen[request.id]);
                  const messages = schoolRequestMessages[request.id] ?? [];
                  const isMessagesLoading = Boolean(schoolRequestMessagesLoading[request.id]);
                  const messagesError = schoolRequestMessagesError[request.id];
                  const messagesUnavailable = Boolean(schoolRequestMessagesUnavailable[request.id]);
                  return (
                    <div key={request.id} className="card-glass p-6 border border-white/10">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h4 className="text-xl font-semibold text-white">{request.requested_name}</h4>
                          <p className="text-xs text-gray-400">
                            Requested by {request.requester_email || 'Unknown'} • {request.requester_role || 'student'}
                          </p>
                          {request.created_at && (
                            <p className="text-xs text-gray-500">
                              {new Date(request.created_at).toLocaleString()}
                            </p>
                          )}
                        </div>
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${requestStatusStyles[status] || 'border-white/20 text-white/60'}`}>
                          {status.replace(/_/g, ' ')}
                        </span>
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="text-xs text-gray-400">Admin notes / message</label>
                          <textarea
                            value={noteValue}
                            onChange={(event) =>
                              setSchoolRequestNotes((prev) => ({ ...prev, [request.id]: event.target.value }))
                            }
                            rows={3}
                            className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
                            placeholder="Share reason or request more info..."
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400">Duplicate school (if needed)</label>
                          <select
                            value={schoolRequestDuplicates[request.id] || ''}
                            onChange={(event) =>
                              setSchoolRequestDuplicates((prev) => ({ ...prev, [request.id]: event.target.value }))
                            }
                            className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
                          >
                            <option value="">Select existing school</option>
                            {schoolOptions.map((school) => (
                              <option key={school.id} value={school.id}>
                                {school.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          onClick={() => handleSchoolRequestAction(request.id, 'approve')}
                          disabled={isActionLoading}
                          className="rounded-lg border border-emerald-400/50 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-60"
                        >
                          ✅ Approve
                        </button>
                        <button
                          onClick={() => handleSchoolRequestAction(request.id, 'reject')}
                          disabled={isActionLoading}
                          className="rounded-lg border border-red-400/50 bg-red-500/20 px-4 py-2 text-sm font-semibold text-red-100 hover:bg-red-500/30 disabled:opacity-60"
                        >
                          ❌ Reject
                        </button>
                        <button
                          onClick={() => handleSchoolRequestAction(request.id, 'mark_duplicate')}
                          disabled={isActionLoading}
                          className="rounded-lg border border-purple-400/50 bg-purple-500/20 px-4 py-2 text-sm font-semibold text-purple-100 hover:bg-purple-500/30 disabled:opacity-60"
                        >
                          🧩 Mark duplicate
                        </button>
                        <button
                          onClick={() => handleSchoolRequestAction(request.id, 'needs_more_info')}
                          disabled={isActionLoading}
                          className="rounded-lg border border-amber-400/50 bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/30 disabled:opacity-60"
                        >
                          📩 Request more info
                        </button>
                        <button
                          onClick={() => {
                            const nextOpen = !isMessagesOpen;
                            setSchoolRequestMessagesOpen((prev) => ({ ...prev, [request.id]: nextOpen }));
                            if (nextOpen && !schoolRequestMessages[request.id] && !schoolRequestMessagesLoading[request.id]) {
                              void loadSchoolRequestMessages(request.id);
                            }
                          }}
                          className="rounded-lg border border-cyan-400/50 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/20"
                        >
                          {isMessagesOpen ? 'Hide conversation' : 'View conversation'}
                        </button>
                      </div>

                      {isMessagesOpen && (
                        <div className="mt-4 rounded-lg border border-white/10 bg-black/40 p-4">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-white">Conversation</p>
                            <button
                              type="button"
                              onClick={() => loadSchoolRequestMessages(request.id)}
                              className="text-xs text-cyan-200 hover:text-cyan-100"
                            >
                              Refresh
                            </button>
                          </div>
                          {messagesUnavailable ? (
                            <p className="mt-3 text-xs text-gray-400">Messaging is not available yet.</p>
                          ) : isMessagesLoading ? (
                            <p className="mt-3 text-sm text-gray-300">Loading messages...</p>
                          ) : messagesError ? (
                            <p className="mt-3 text-sm text-red-200">{messagesError}</p>
                          ) : messages.length === 0 ? (
                            <p className="mt-3 text-sm text-gray-400">No messages yet.</p>
                          ) : (
                            <div className="mt-3 space-y-2">
                              {messages.map((message) => (
                                <div
                                  key={message.id}
                                  className="rounded-lg border border-white/10 bg-black/50 p-3 text-sm text-gray-100"
                                >
                                  <div className="flex items-center justify-between text-xs text-gray-400">
                                    <span>{message.sender_role?.toLowerCase() === 'admin' ? 'Admin' : 'Applicant'}</span>
                                    {message.created_at && (
                                      <span>{new Date(message.created_at).toLocaleString()}</span>
                                    )}
                                  </div>
                                  <p className="mt-2 whitespace-pre-wrap">{message.message}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

            </div>
          )}

          {activeTab === 'game' && (
            <div className="card-glass p-6 border-2 border-green-400/50">
              <h3 className="text-3xl font-heading font-bold text-green-300 mb-6">🎮 Game Management</h3>
                        <div className="space-y-3">
                          <button onClick={async () => {
                              try {
                                  const affected = await CompetitionService.refillAllAp();
                                  addToast(`⚡ Refilled AP for ${affected} players`, 'success');
                                  await refreshAdminData();
                              } catch (error) {
                                reportRpcError('Failed to refill AP:', error, 'Failed to refill AP');
                              }
                          }} className="w-full bg-green-500/20 hover:bg-green-500/30 border border-green-400 text-white px-4 py-2 rounded">Refill AP for all players</button>

                          <button onClick={async () => {
                              try {
                                  const affected = await CompetitionService.resetAllPlayerProgress();
                                  addToast(`Reset progress for ${affected} players`, 'success');
                                  await refreshAdminData();
                              } catch (error) {
                                reportRpcError('Failed to reset all progress:', error, 'Failed to reset all progress');
                              }
                          }} className="w-full bg-red-500/20 hover:bg-red-500/30 border border-red-400 text-white px-4 py-2 rounded">Reset ALL player progress</button>
                        </div>
            </div>
          )}

          {activeTab === 'clans' && (
            <div className="card-glass p-6 border-2 border-blue-400/50">
              <h3 className="text-3xl font-heading font-bold text-blue-300 mb-6">🛡️ Clan Management</h3>
                        <div className="space-y-4">
                          <button onClick={async () => {
                            try {
                              const { data, error } = await supabase.from('clans').select('*').order('name');
                              if (error) throw error;
                              setClanList(data || []);
                              addToast(`Loaded ${data?.length ?? 0} clans`, 'success');
                            } catch (error) {
                              reportRpcError('Failed to load clans:', error, 'Failed to load clans');
                            }
                          }} className="w-full bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400 text-white px-4 py-2 rounded">Refresh Clans</button>

                          <div className="text-sm text-gray-400">Tip: Click 'Refresh Clans' then choose a clan from the list to disband it.</div>
                          {clanList.length > 0 && (
                            <div className="mt-4 space-y-2">
                              {clanList.map(c => (
                                <div key={c.id} className="flex items-center justify-between bg-black/20 p-2 rounded">
                                  <div>
                                    <p className="font-semibold text-white">{c.name}</p>
                                    <p className="text-xs text-gray-400">{c.member_count ?? 0} members</p>
                                  </div>
                                  <div>
                                    <button onClick={async () => {
                                      try {
                                        if (!confirm(`Disband ${c.name}? This will delete the clan.`)) return;
                                        await CompetitionService.disbandClan(c.id);
                                        addToast(`${c.name} disbanded`, 'success');
                                        setClanList(prev => prev.filter(x => x.id !== c.id));
                                        await refreshAdminData();
                                      } catch (error) {
                                        reportRpcError('Failed to disband clan:', error, 'Failed to disband clan');
                                      }
                                    }} className="bg-red-500/20 hover:bg-red-500/30 border border-red-400 text-white px-3 py-1 rounded">Disband</button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="card-glass p-6 border-2 border-pink-400/50">
              <h3 className="text-3xl font-heading font-bold text-pink-300 mb-6">📊 Analytics</h3>
                        <div>
                          <button className="w-full bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400 text-white px-4 py-2 rounded" onClick={async () => {
                            try {
                              const stats = await CompetitionService.fetchAdminOverviewStats();
                              addToast(`Players today: ${stats.players_today}`, 'success');
                            } catch (error) {
                              reportRpcError('Failed to fetch analytics:', error, 'Failed to fetch analytics');
                            }
                          }}>Refresh Analytics</button>
                          <p className="text-gray-400 mt-2">Quick analytics and health checks for the server</p>
                        </div>
            </div>
          )}

          {activeTab === 'cambridge' && (
            <div className="card-glass p-6 border-2 border-teal-400/50">
              <h3 className="text-3xl font-heading font-bold text-teal-300 mb-6">📚 Cambridge Test Reports</h3>
              
              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3 mb-6">
                <button
                  onClick={fetchQuizScores}
                  disabled={quizScoresLoading}
                  className="bg-teal-600/30 hover:bg-teal-600/50 border border-teal-400 text-white font-semibold px-6 py-3 rounded-lg transition-all hover:shadow-[0_0_20px_rgba(20,184,166,0.6)]"
                >
                  {quizScoresLoading ? '⏳ Loading...' : '🔄 Load/Refresh Reports'}
                </button>
                {quizScores.length > 0 && (
                  <button
                    onClick={exportCSV}
                    className="bg-green-600/30 hover:bg-green-600/50 border border-green-400 text-white font-semibold px-6 py-3 rounded-lg transition-all hover:shadow-[0_0_20px_rgba(34,197,94,0.6)]"
                  >
                    📥 Export CSV
                  </button>
                )}
                {/* Bulk Release Scores for Chemistry tests */}
                {quizFilter !== 'all' && quizFilter.toLowerCase().includes('chemistry') && (
                  <button
                    onClick={async () => {
                      if (!window.confirm(`Release all unreleased scores for "${quizFilter}"${classFilter !== 'all' ? ` in class ${classFilter}` : ''}? Students will be able to see their results.`)) {
                        return;
                      }
                      try {
                        const { data, error } = await supabase.rpc('bulk_release_quiz_scores', {
                          p_quiz_name: quizFilter,
                          p_student_class: classFilter !== 'all' ? classFilter : null
                        });
                        if (error) throw error;
                        if (!data?.success) throw new Error(data?.error || 'Failed to release scores');
                        addToast(`✅ ${data.affected || 0} scores released`, 'success');
                        fetchQuizScores();
                      } catch (error: any) {
                        reportRpcError('Failed to bulk release scores:', error, 'Failed to bulk release scores');
                      }
                    }}
                    className="bg-purple-600/30 hover:bg-purple-600/50 border border-purple-400 text-white font-semibold px-6 py-3 rounded-lg transition-all hover:shadow-[0_0_20px_rgba(168,85,247,0.6)]"
                  >
                    🔓 Bulk Release Scores
                  </button>
                )}
              </div>

              {quizScores.length > 0 && (
                <>
                  {/* Stats Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <div className="bg-gradient-to-br from-teal-600/20 to-teal-900/20 border-2 border-teal-400 p-4 rounded-xl">
                      <p className="text-sm text-gray-300">Total Submissions</p>
                      <p className="text-3xl font-bold text-teal-300">{quizStats.totalSubmissions}</p>
                    </div>
                    <div className="bg-gradient-to-br from-blue-600/20 to-blue-900/20 border-2 border-blue-400 p-4 rounded-xl">
                      <p className="text-sm text-gray-300">Average Score</p>
                      <p className="text-3xl font-bold text-blue-300">{quizStats.avgPercentage}%</p>
                    </div>
                    <div className="bg-gradient-to-br from-green-600/20 to-green-900/20 border-2 border-green-400 p-4 rounded-xl">
                      <p className="text-sm text-gray-300">Highest Score</p>
                      <p className="text-xl font-bold text-green-300">{quizStats.highestScore?.name || '-'}</p>
                      <p className="text-sm text-gray-400">{quizStats.highestScore ? `${quizStats.highestScore.percentage}%` : ''}</p>
                    </div>
                    <div className="bg-gradient-to-br from-red-600/20 to-red-900/20 border-2 border-red-400 p-4 rounded-xl">
                      <p className="text-sm text-gray-300">Lowest Score</p>
                      <p className="text-xl font-bold text-red-300">{quizStats.lowestScore?.name || '-'}</p>
                      <p className="text-sm text-gray-400">{quizStats.lowestScore ? `${quizStats.lowestScore.percentage}%` : ''}</p>
                    </div>
                  </div>

                  {/* Class Performance Summary */}
                  <div className="bg-black/30 border border-teal-400/50 rounded-xl p-4 mb-6">
                    <h4 className="text-lg font-bold text-teal-300 mb-3">📊 Class Performance</h4>
                    <div className="flex flex-wrap gap-3">
                      {Object.entries(quizStats.classStats).sort((a, b) => b[1].avg - a[1].avg).map(([cls, stats]) => (
                        <div key={cls} className="bg-black/40 border border-gray-600 rounded-lg px-4 py-2">
                          <p className="font-bold text-white">{cls}</p>
                          <p className="text-sm text-gray-400">{stats.count} students • Avg: <span className={stats.avg >= 70 ? 'text-green-400' : stats.avg >= 50 ? 'text-yellow-400' : 'text-red-400'}>{stats.avg}%</span></p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Filters */}
                  <div className="flex flex-wrap gap-4 mb-6">
                    <div>
                      <label className="text-sm text-gray-400 block mb-1">Filter by Test</label>
                      <select
                        value={quizFilter}
                        onChange={(e) => setQuizFilter(e.target.value)}
                        className="bg-black/40 border border-teal-400/50 rounded-lg px-4 py-2 text-white min-w-[200px]"
                      >
                        <option value="all">All Tests</option>
                        {uniqueQuizNames.map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400 block mb-1">Filter by Class</label>
                      <select
                        value={classFilter}
                        onChange={(e) => setClassFilter(e.target.value)}
                        className="bg-black/40 border border-teal-400/50 rounded-lg px-4 py-2 text-white min-w-[150px]"
                      >
                        <option value="all">All Classes</option>
                        {uniqueClasses.map(cls => (
                          <option key={cls} value={cls}>{cls}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-end">
                      <p className="text-gray-400">Showing {filteredQuizScores.length} of {quizScores.length} results</p>
                    </div>
                  </div>

                  {/* Results Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-teal-400/50">
                          <th className="px-4 py-3 text-teal-300">Student</th>
                          <th className="px-4 py-3 text-teal-300">Class</th>
                          <th className="px-4 py-3 text-teal-300">Test</th>
                          <th className="px-4 py-3 text-teal-300">Score</th>
                          <th className="px-4 py-3 text-teal-300">%</th>
                          <th className="px-4 py-3 text-teal-300">Time</th>
                          <th className="px-4 py-3 text-teal-300">Submitted</th>
                          <th className="px-4 py-3 text-teal-300">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredQuizScores.map((score) => (
                          <tr key={score.id} className="border-b border-gray-700 hover:bg-black/30">
                            <td className="px-4 py-3 text-white font-semibold">{score.student_name}</td>
                            <td className="px-4 py-3 text-gray-300">{score.student_class || '-'}</td>
                            <td className="px-4 py-3 text-gray-300 text-sm">{score.quiz_name}</td>
                            <td className="px-4 py-3">
                              <span className="font-mono text-white">{score.score}/{score.total_questions}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`font-bold ${
                                score.percentage >= 70 ? 'text-green-400' :
                                score.percentage >= 50 ? 'text-yellow-400' : 'text-red-400'
                              }`}>{score.percentage}%</span>
                            </td>
                            <td className="px-4 py-3 text-gray-400 text-sm">{formatTime(score.time_taken_seconds)}</td>
                            <td className="px-4 py-3 text-gray-400 text-sm">
                              {new Date(score.submitted_at).toLocaleDateString()} {new Date(score.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-2 flex-wrap">
                                <button
                                  onClick={() => openAnswerReflection(score)}
                                  className="bg-blue-600/30 hover:bg-blue-600/50 border border-blue-400 text-white text-xs px-3 py-1 rounded"
                                >
                                  📝 Answers
                                </button>
                                <button
                                  onClick={() => openReport(score)}
                                  className="bg-purple-600/30 hover:bg-purple-600/50 border border-purple-400 text-white text-xs px-3 py-1 rounded"
                                >
                                  📄 Report
                                </button>
                                <button
                                  onClick={() => deleteQuizScore(score.id, score.student_name)}
                                  className="bg-red-600/30 hover:bg-red-600/50 border border-red-400 text-white text-xs px-3 py-1 rounded"
                                >
                                  🗑️ Delete
                                </button>
                                {/* Show Release Score button for Chemistry tests */}
                                {score.quiz_name && score.quiz_name.toLowerCase().includes('chemistry') && !score.scores_released && (
                                  <button
                                    onClick={async () => {
                                      try {
                                        const { data, error } = await supabase.rpc('release_quiz_score', {
                                          p_quiz_score_id: score.id
                                        });
                                        if (error) throw error;
                                        if (!data?.success) throw new Error(data?.error || 'Failed to release score');
                                        addToast(`✅ Score released for ${score.student_name}`, 'success');
                                        fetchQuizScores();
                                      } catch (error: any) {
                                        reportRpcError('Failed to release score:', error, 'Failed to release score');
                                      }
                                    }}
                                    className="bg-green-600/30 hover:bg-green-600/50 border border-green-400 text-white text-xs px-3 py-1 rounded"
                                  >
                                    🔓 Release Score
                                  </button>
                                )}
                                {score.scores_released && score.quiz_name && score.quiz_name.toLowerCase().includes('chemistry') && (
                                  <span className="text-xs text-green-400 px-2 py-1">✓ Released</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {quizScores.length === 0 && !quizScoresLoading && (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-6xl mb-4">📭</p>
                  <p className="text-xl">No test submissions yet</p>
                  <p className="text-sm mt-2">Click "Load/Refresh Reports" to check for submissions</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'ielts' && (
            <div className="card-glass p-6 border-2 border-emerald-400/50">
              <h3 className="text-3xl font-heading font-bold text-emerald-300 mb-6">🎯 IELTS Prep Dashboard</h3>
              <IeltsAdminDashboard />
            </div>
          )}

          {activeTab === 'system' && (
            <div className="card-glass p-6 border-2 border-red-400/50">
              <h3 className="text-3xl font-heading font-bold text-red-300 mb-6">⚙️ System Control</h3>
                        <div className="space-y-2">
                          <button className="w-full bg-gray-700/20 hover:bg-gray-700/30 border border-gray-600 text-white px-4 py-2 rounded" onClick={async () => {
                            try {
                              if (!confirm('This will wipe EVERY player\'s XP, level, AP, PvP stats/champions, tasks, inventory, clans, and activity feed. This cannot be undone. Proceed?')) {
                                return;
                              }
                              const affected = await CompetitionService.resetAllPlayerProgress();
                              addToast(`System: reset applied to ${affected} accounts`, 'success');
                              await refreshAdminData();
                            } catch (error) {
                              reportRpcError('Failed system reset:', error, 'Failed system reset');
                            }
                          }}>Reset Player Progress (System)</button>
                          <button className="w-full bg-gray-700/20 hover:bg-gray-700/30 border border-gray-600 text-white px-4 py-2 rounded" onClick={async () => {
                            try {
                              const affected = await CompetitionService.refillAllAp();
                              addToast(`System: Refilled AP for ${affected} players`, 'success');
                              await refreshAdminData();
                            } catch (error) {
                              reportRpcError('Failed system AP refill:', error, 'Failed system AP refill');
                            }
                          }}>Refill AP (System)</button>
                          <button className="w-full bg-gray-700/20 hover:bg-gray-700/30 border border-gray-600 text-white px-4 py-2 rounded" onClick={async () => {
                            try {
                              if (!confirm('Reset PvP Champions leaderboard? This removes all recorded PvP wins.')) {
                                return;
                              }
                              const affected = await CompetitionService.resetPvpWinsLeaderboard();
                              addToast(`System: Cleared ${affected} PvP win records`, 'success');
                              await refreshAdminData();
                            } catch (error) {
                              reportRpcError('Failed to reset PvP leaderboard:', error, 'Failed to reset PvP leaderboard');
                            }
                          }}>Reset PvP Champions Leaderboard</button>
                        </div>
            </div>
          )}
        </div>
      </div>

      {/* Custom Styles */}
      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        @keyframes pulse-slow {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
        
        .animate-spin-slow {
          animation: spin-slow 20s linear infinite;
        }
        
        .animate-pulse-slow {
          animation: pulse-slow 4s ease-in-out infinite;
        }
        
        .admin-particles {
          background-image: 
            radial-gradient(2px 2px at 20% 30%, rgba(255, 215, 0, 0.5), transparent),
            radial-gradient(2px 2px at 60% 70%, rgba(255, 105, 180, 0.5), transparent),
            radial-gradient(2px 2px at 50% 50%, rgba(138, 43, 226, 0.5), transparent),
            radial-gradient(2px 2px at 80% 10%, rgba(255, 215, 0, 0.5), transparent);
          background-size: 200% 200%;
          background-position: 0% 0%;
          height: 100%;
          width: 100%;
          animation: particle-float 20s ease-in-out infinite;
        }
        
        @keyframes particle-float {
          0%, 100% { background-position: 0% 0%; }
          25% { background-position: 100% 0%; }
          50% { background-position: 100% 100%; }
          75% { background-position: 0% 100%; }
        }

        /* Print styles - only print the modal content */
        @media print {
          body * {
            visibility: hidden;
          }
          .print-content, .print-content * {
            visibility: visible;
          }
          .print-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
          }
          .no-print {
            display: none !important;
          }
          .print-content button {
            display: none !important;
          }
        }
      `}</style>

      {/* Performance Report Modal */}
      {showReportModal && reportStudent && (() => {
        const skillPerf = analyzeSkillPerformance(reportStudent);
        const sortedSkills = Object.entries(skillPerf).sort((a, b) => a[1].percentage - b[1].percentage);
        const grade = getGrade(reportStudent.percentage);
        // For F grade, show areas below 70%; for others use grade-appropriate threshold
        const threshold = grade === 'F' ? 70 : grade === 'D' ? 65 : 60;
        const weakAreas = sortedSkills.filter(([_, data]) => data.percentage < threshold);
        const encouragement = getEncouragement(grade);
        
        return (
          <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/90 p-4 overflow-y-auto no-print">
            <div className="bg-white rounded-2xl max-w-4xl w-full my-8 print-content" style={{ fontFamily: 'Segoe UI, Arial, sans-serif' }}>
              {/* Report Header */}
              <div className="p-6 border-b-4 border-purple-600 no-print-hide">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <img src="/logo.png" alt="Brains Heist" style={{ width: '48px', height: '48px' }} />
                    <div>
                      <h1 className="text-2xl font-bold text-purple-800">Brains Heist</h1>
                      <p className="text-sm text-gray-500">Student Performance Report</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <h2 className="text-lg font-semibold text-purple-800">{reportStudent.quiz_name}</h2>
                    <p className="text-sm text-gray-500">Generated: {new Date().toLocaleDateString()}</p>
                  </div>
                </div>
              </div>

              {/* Student Banner */}
              <div className="bg-gradient-to-r from-purple-800 to-indigo-900 text-white p-6 flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold">{reportStudent.student_name}</h2>
                  <p className="opacity-80">Class: {reportStudent.student_class || 'N/A'} | Completed: {new Date(reportStudent.submitted_at).toLocaleDateString()} | Time: {formatTime(reportStudent.time_taken_seconds)}</p>
                </div>
                <div className="w-20 h-20 rounded-full bg-white flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-purple-800">{grade}</span>
                  <span className="text-xs text-gray-600">{reportStudent.percentage}%</span>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Skills Performance */}
                <div>
                  <h3 className="text-lg font-semibold text-purple-800 border-b-2 border-gray-200 pb-2 mb-4">📊 Skills Performance Analysis</h3>
                  <div className="space-y-3">
                    {sortedSkills.map(([skill, data]) => (
                      <div key={skill} className="flex items-center gap-3">
                        <span className="w-40 text-sm text-gray-600">{data.icon} {skill}</span>
                        <div className="flex-1 h-4 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all ${data.percentage >= 80 ? 'bg-green-500' : data.percentage >= 65 ? 'bg-blue-500' : data.percentage >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${data.percentage}%` }}
                          />
                        </div>
                        <span className="w-12 text-sm font-semibold text-right">{data.percentage}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Focus Areas */}
                {weakAreas.length > 0 && (
                  <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-lg">
                    <h4 className="font-semibold text-amber-800 mb-2">⚠️ Priority Focus Areas</h4>
                    <ul className="text-sm text-gray-700 space-y-1">
                      {weakAreas.map(([skill, data]) => (
                        <li key={skill}>• <strong>{skill}</strong> — You scored {data.percentage}% ({data.correct}/{data.total} correct)</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Action Plan */}
                <div className="border-2 border-purple-600 rounded-xl p-5">
                  <h3 className="text-lg font-semibold text-purple-800 mb-4">📋 Personalized Action Plan</h3>
                  {weakAreas.length > 0 ? weakAreas.slice(0, 3).map(([skill, data], idx) => {
                    const plan = actionPlans[skill];
                    return plan ? (
                      <div key={skill} className="flex gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
                        <div className="w-8 h-8 bg-purple-800 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">{idx + 1}</div>
                        <div>
                          <h4 className="font-semibold text-gray-800">{plan.title} (Currently {data.percentage}%)</h4>
                          <p className="text-sm text-gray-600">{plan.tips.join(' • ')}</p>
                        </div>
                      </div>
                    ) : null;
                  }) : (
                    <div className="flex gap-4 p-4 bg-green-50 rounded-lg">
                      <div className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">✓</div>
                      <div>
                        <h4 className="font-semibold text-gray-800">Maintain Your Excellence</h4>
                        <p className="text-sm text-gray-600">Continue challenging yourself • Read diverse texts daily • Help classmates who are struggling</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Encouragement */}
                <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6 rounded-xl text-center">
                  <h3 className="text-xl font-bold mb-2">{encouragement.title}</h3>
                  <p className="opacity-90">{encouragement.message}</p>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t flex justify-between items-center text-xs text-gray-400">
                <span>Brains Heist Learning Platform</span>
                <span>Report ID: {reportStudent.id?.substring(0, 8) || 'N/A'}</span>
                <div className="flex gap-3">
                  <button onClick={() => window.print()} className="px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700">🖨️ Print</button>
                  <button onClick={() => setShowReportModal(false)} className="px-4 py-2 bg-gray-600 text-white rounded-lg font-semibold hover:bg-gray-700">Close</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Answer Reflection Modal */}
      {showAnswerReflection && reportStudent && (() => {
        const rawAnswers = reportStudent.answers || {};
        const quizName = reportStudent.quiz_name || '';
        const isChemistryTest = quizName.toLowerCase().includes('chemistry');
        
        // For Chemistry tests, extract responses from answers.responses
        const studentResponses = isChemistryTest 
          ? (rawAnswers.responses || rawAnswers || {})
          : rawAnswers;
        
        // Get correct answers - for Chemistry, they're NOT in the frontend
        const correctAnswersForQuiz = correctAnswers[quizName] || {};
        const sections = testSections[quizName] || [];
        
        let correctCount = reportStudent.score || 0;
        let wrongCount = 0;
        let unansweredCount = 0;
        const mistakes: Array<{ q: number; studentAns: string; correctAns: string; unanswered: boolean }> = [];
        
        // For non-Chemistry tests with defined correct answers
        if (Object.keys(correctAnswersForQuiz).length > 0) {
          correctCount = 0;
          Object.keys(correctAnswersForQuiz).forEach(qStr => {
            const q = parseInt(qStr);
            const studentAns = (studentResponses[q] || '').toString().trim();
            const correctAns = correctAnswersForQuiz[q] || '';
            
            if (!studentAns) {
              unansweredCount++;
              mistakes.push({ q, studentAns: '(No answer)', correctAns, unanswered: true });
            } else if (studentAns.toLowerCase() === correctAns.toLowerCase()) {
              correctCount++;
            } else {
              wrongCount++;
              mistakes.push({ q, studentAns, correctAns, unanswered: false });
            }
          });
        } else {
          // For Chemistry tests, use the stored score
          const totalQ = reportStudent.total_questions || 0;
          wrongCount = totalQ - correctCount;
          // We don't have detailed answer breakdown for Chemistry in frontend
        }
        
        return (
          <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/90 p-4 overflow-y-auto no-print">
            <div className="bg-white rounded-2xl max-w-5xl w-full my-8 print-content" style={{ fontFamily: 'Segoe UI, Arial, sans-serif' }}>
              {/* Header */}
              <div className="p-6 border-b-4 border-blue-600 no-print-hide">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <img src="/logo.png" alt="Brains Heist" style={{ width: '48px', height: '48px' }} />
                    <div>
                      <h1 className="text-2xl font-bold text-blue-800">Brains Heist</h1>
                      <p className="text-sm text-gray-500">Test Reflection & Answer Review</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <h2 className="text-lg font-semibold text-blue-800">{reportStudent.quiz_name}</h2>
                    <p className="text-sm text-gray-500">Answer Details</p>
                  </div>
                </div>
              </div>

              {/* Student Info Banner */}
              <div className="bg-gradient-to-r from-blue-700 to-purple-800 text-white p-5 flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold">{reportStudent.student_name}</h2>
                  <p className="text-sm opacity-80">Class: {reportStudent.student_class || 'N/A'} | {new Date(reportStudent.submitted_at).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold">{reportStudent.score}/{reportStudent.total_questions}</div>
                  <div className="text-sm opacity-80">{reportStudent.percentage}% Score</div>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Summary Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-green-100 p-4 rounded-xl text-center">
                    <div className="text-3xl">✓</div>
                    <div className="text-3xl font-bold text-green-700">{correctCount}</div>
                    <div className="text-sm text-gray-600">Correct</div>
                  </div>
                  <div className="bg-red-100 p-4 rounded-xl text-center">
                    <div className="text-3xl">✗</div>
                    <div className="text-3xl font-bold text-red-700">{wrongCount}</div>
                    <div className="text-sm text-gray-600">Wrong</div>
                  </div>
                  <div className="bg-amber-100 p-4 rounded-xl text-center">
                    <div className="text-3xl">⚠️</div>
                    <div className="text-3xl font-bold text-amber-700">{unansweredCount}</div>
                    <div className="text-sm text-gray-600">Unanswered</div>
                  </div>
                </div>

                {/* Sections with Answers */}
                {sections.length > 0 ? sections.map(section => {
                  let sectionCorrect = 0;
                  return (
                    <div key={section.name}>
                      <div className="bg-blue-50 p-3 border-l-4 border-blue-600 mb-3 flex justify-between items-center">
                        <span className="font-semibold text-gray-800">{section.icon} {section.name}</span>
                        <span className="text-blue-600 text-sm">
                          {section.questions.filter(q => {
                            const studentAns = (studentResponses[q] || '').toString().trim().toLowerCase();
                            const correctAns = (correctAnswersForQuiz[q] || '').toLowerCase();
                            const isCorrect = studentAns === correctAns;
                            if (isCorrect) sectionCorrect++;
                            return isCorrect;
                          }).length}/{section.questions.length} correct
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                        {section.questions.map(q => {
                          const studentAns = (studentResponses[q] || '').toString().trim();
                          const correctAns = correctAnswersForQuiz[q] || '';
                          const isCorrect = studentAns.toLowerCase() === correctAns.toLowerCase();
                          const isUnanswered = !studentAns;
                          
                          return (
                            <div key={q} className={`p-3 rounded-lg border-2 flex items-center gap-3 ${isCorrect ? 'bg-green-50 border-green-400' : isUnanswered ? 'bg-amber-50 border-amber-400' : 'bg-red-50 border-red-400'}`}>
                              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm ${isCorrect ? 'bg-green-500' : isUnanswered ? 'bg-amber-500' : 'bg-red-500'}`}>Q{q}</div>
                              <div className="flex-1 text-sm">
                                <div><strong>Your answer:</strong> {studentAns || <em className="text-gray-400">blank</em>}</div>
                                {!isCorrect && <div className="text-green-600 font-semibold">✓ Correct: {correctAns}</div>}
                              </div>
                              <span className="text-xl">{isCorrect ? '✓' : isUnanswered ? '⚠️' : '✗'}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }) : (
                  /* For Chemistry tests without predefined sections, show a simple summary */
                  <div className="bg-blue-50 border-2 border-blue-400 rounded-xl p-5">
                    <h3 className="text-lg font-semibold text-blue-700 mb-4">🧪 Chemistry Test Results</h3>
                    <p className="text-gray-700 mb-3">
                      Score: <strong>{reportStudent.score}</strong> out of <strong>{reportStudent.total_questions}</strong> ({reportStudent.percentage}%)
                    </p>
                    <p className="text-gray-600 text-sm">
                      For detailed answer review with correct answers, please check the test page directly. 
                      The student can view their answers when you release the score.
                    </p>
                  </div>
                )}

                {/* Key Mistakes Section */}
                {mistakes.length > 0 && (
                  <div className="bg-red-50 border-2 border-red-400 rounded-xl p-5">
                    <h3 className="text-lg font-semibold text-red-700 mb-4">📝 Key Mistakes to Learn From</h3>
                    <div className="space-y-3">
                      {mistakes.slice(0, 8).map(m => (
                        <div key={m.q} className="bg-white rounded-lg p-4 border-l-4 border-red-400">
                          <div className="font-semibold text-gray-800 mb-2">Question {m.q}</div>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="bg-red-100 p-3 rounded text-gray-800">
                              <strong className="text-red-700">{m.unanswered ? '⚠️ Unanswered' : '✗ Your Answer:'}</strong><br/>
                              <span className="text-gray-900 font-medium">{m.unanswered ? 'No response given' : m.studentAns}</span>
                            </div>
                            <div className="bg-green-100 p-3 rounded text-gray-800">
                              <strong className="text-green-700">✓ Correct Answer:</strong><br/>
                              <span className="text-gray-900 font-medium">{m.correctAns}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                      {mistakes.length > 8 && <p className="text-center text-gray-600">+ {mistakes.length - 8} more mistakes (see full details above)</p>}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t flex justify-between items-center text-xs text-gray-400">
                <span>Brains Heist Learning Platform</span>
                <span>Use this sheet to review mistakes and improve!</span>
                <div className="flex gap-3">
                  <button onClick={() => window.print()} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700">🖨️ Print</button>
                  <button onClick={() => setShowAnswerReflection(false)} className="px-4 py-2 bg-gray-600 text-white rounded-lg font-semibold hover:bg-gray-700">Close</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {showAnnouncementComposer && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4">
          <div className="bg-gray-900 border border-green-400/60 rounded-2xl max-w-xl w-full p-6 space-y-4">
            <h3 className="text-2xl font-heading text-green-300">📢 Broadcast Announcement</h3>
            <p className="text-sm text-gray-400">
              This message appears for every player until they dismiss it or it expires.
            </p>
            <textarea
              value={announcementText}
              onChange={(e) => setAnnouncementText(e.target.value)}
              rows={5}
              className="w-full bg-black/50 border border-green-400/40 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green-300"
              placeholder="Share mission updates, tournament news, or urgent warnings..."
            />
            <div className="space-y-2">
              <label className="text-sm text-gray-300 font-semibold">Expiration</label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <select
                  value={announcementExpiry}
                  onChange={(e) => setAnnouncementExpiry(e.target.value as typeof announcementExpiry)}
                  className="w-full rounded-lg border border-green-400/40 bg-black/60 px-3 py-2 text-sm text-white focus:outline-none focus:border-green-300"
                >
                  <option value="never">Never expire</option>
                  <option value="1d">Expires in 24 hours</option>
                  <option value="7d">Expires in 7 days</option>
                  <option value="30d">Expires in 30 days</option>
                  <option value="custom">Custom date/time</option>
                </select>
                {announcementExpiry === 'custom' && (
                  <input
                    type="datetime-local"
                    value={customAnnouncementExpiry}
                    onChange={(e) => setCustomAnnouncementExpiry(e.target.value)}
                    className="w-full rounded-lg border border-green-400/40 bg-black/60 px-3 py-2 text-sm text-white focus:outline-none focus:border-green-300"
                  />
                )}
              </div>
              <p className="text-xs text-gray-400">
                When the expiration time is reached, the announcement will stop showing for everyone.
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAnnouncementComposer(false);
                  setAnnouncementText('');
                  setAnnouncementExpiry('never');
                  setCustomAnnouncementExpiry('');
                }}
                className="px-4 py-2 rounded-lg border border-gray-500 text-gray-300 hover:bg-gray-800/80"
              >
                Cancel
              </button>
              <button
                onClick={sendAnnouncement}
                disabled={isSendingAnnouncement}
                className={`px-5 py-2 rounded-lg border border-green-400 text-white font-semibold transition-all ${
                  isSendingAnnouncement
                    ? 'bg-green-600/30 cursor-not-allowed'
                    : 'bg-green-600/40 hover:bg-green-600/60 hover:shadow-[0_0_20px_rgba(34,197,94,0.6)]'
                }`}
              >
                {isSendingAnnouncement ? 'Sending...' : 'Send Broadcast'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPortal;
