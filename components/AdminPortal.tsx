import React, { useState, useEffect, useCallback } from 'react';
import { Batch, Grade, Profile, ToastMessage, SchoolRole } from '../types';
import BackButton from './BackButton';
import * as AuthService from '../services/authService';
import { supabase } from '../services/supabaseClient';
import * as CompetitionService from '../services/competitionService';
import * as SchoolRequestService from '../services/schoolRequestService';
import * as SchoolAdminService from '../services/schoolAdminService';
import { SchoolMember } from '../services/schoolAdminService';
import { chemistryAnswerKeys, chemistryQuestionRanges } from './chemistryAnswerKeys';
import { buildBiologyAnswerKeyFromSavedMetadata, isBiologyCambridgeQuiz } from './biologyReviewAnswerKey';
import {
  CAMBRIDGE_LISTENING_TEST_1_ANSWER_KEY,
  CAMBRIDGE_LISTENING_TEST_1_SECTIONS,
  isCambridgeAnswerCorrect,
  parseCambridgeResponses,
  type CambridgeExpectedAnswer,
} from './cambridgeListeningReview';

import AdminContext from './admin/AdminContext';
import DashboardTab from './admin/tabs/DashboardTab';
import UsersTab from './admin/tabs/UsersTab';
import SchoolsTab from './admin/tabs/SchoolsTab';
import ApplicationsTab from './admin/tabs/ApplicationsTab';
import BookedAppointmentsTab from './admin/tabs/BookedAppointmentsTab';
import BillingAccessTab from './admin/tabs/BillingAccessTab';
import GameTab from './admin/tabs/GameTab';
import ClansTab from './admin/tabs/ClansTab';
import AnalyticsTab from './admin/tabs/AnalyticsTab';
import CambridgeTab from './admin/tabs/CambridgeTab';
import IeltsTab from './admin/tabs/IeltsTab';
import SystemTab from './admin/tabs/SystemTab';
import ReportModal from './admin/modals/ReportModal';
import AnswerReflectionModal from './admin/modals/AnswerReflectionModal';
import AnnouncementModal from './admin/modals/AnnouncementModal';

const SCHOOL_PLANS = ['none', 'pilot', 'core', 'standard', 'pro', 'enterprise'] as const;

interface AdminPortalProps {
  profile: Profile;
  onComplete: () => void;
  addToast: (message: string, type: ToastMessage['type']) => void;
}

type AdminTab = 'dashboard' | 'users' | 'schools' | 'applications' | 'booked-appointments' | 'billing' | 'game' | 'clans' | 'analytics' | 'cambridge' | 'ielts' | 'system';

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
  const [applicationsUnreadTotal, setApplicationsUnreadTotal] = useState(0);
  const [schoolOptions, setSchoolOptions] = useState<{ id: string; name: string; school_plan?: string }[]>([]);
  const [schoolAdminSchoolId, setSchoolAdminSchoolId] = useState('');
  const [schoolMemberSearch, setSchoolMemberSearch] = useState('');
  const [schoolMembers, setSchoolMembers] = useState<SchoolAdminService.SchoolMember[]>([]);
  const [schoolMembersLoading, setSchoolMembersLoading] = useState(false);
  const [schoolMembersError, setSchoolMembersError] = useState<string | null>(null);
  const [schoolAdminActionLoading, setSchoolAdminActionLoading] = useState<string | null>(null);
  const [isSuperadmin, setIsSuperadmin] = useState(Boolean(profile.is_admin));
  // Pilot quota admin state
  const [schoolQuotas, setSchoolQuotas] = useState<Record<string, { used: number; limit: number; remaining: number; exhausted: boolean }> | null>(null);
  const [schoolQuotasLoading, setSchoolQuotasLoading] = useState(false);
  const [quotaEditFeature, setQuotaEditFeature] = useState<string | null>(null);
  const [quotaEditValue, setQuotaEditValue] = useState('');
  const [quotaActionLoading, setQuotaActionLoading] = useState(false);
  const [pilotTrialEnd, setPilotTrialEnd] = useState<string | null>(null);
  const [extendDays, setExtendDays] = useState(30);
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
  // Announcement targeting
  const [announcementAudience, setAnnouncementAudience] = useState<'all' | 'school' | 'school_admins' | 'school_admins_school' | 'grade' | 'grade_school' | 'class' | 'teachers'>('all');
  const [announcementTargetSchoolId, setAnnouncementTargetSchoolId] = useState<string>('');
  const [announcementTargetGrade, setAnnouncementTargetGrade] = useState<string>('');
  const [announcementTargetClassId, setAnnouncementTargetClassId] = useState<string>('');
  const [targetSchoolClasses, setTargetSchoolClasses] = useState<{id: string; class_code: string; class_name: string}[]>([]);
  const [isResettingAll, setIsResettingAll] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Custom grant amounts
  const [customCoinAmount, setCustomCoinAmount] = useState<Record<string, string>>({});
  const [customXpAmount, setCustomXpAmount] = useState<Record<string, string>>({});
  const [customGemstoneAmount, setCustomGemstoneAmount] = useState<Record<string, string>>({});
  const [customLevelAmount, setCustomLevelAmount] = useState<Record<string, string>>({});
  const [showCustomGrant, setShowCustomGrant] = useState<Record<string, boolean>>({});

  // Role management
  const [roleChangeLoading, setRoleChangeLoading] = useState<string | null>(null);

  // Analytics state
  const [analyticsData, setAnalyticsData] = useState<{
    playersToday: number;
    attemptsToday: number;
    activeNow: number;
    totalClans: number;
    totalQuestions: number;
    recentErrors: string[];
    batchStats: Array<{ batch: string; playerCount: number; totalXp: number }>;
    gradeDistribution: Record<string, number>;
    roleDistribution: Record<string, number>;
  } | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Enhanced clan state
  const [selectedClan, setSelectedClan] = useState<any | null>(null);
  const [clanMembers, setClanMembers] = useState<any[]>([]);
  const [clanMembersLoading, setClanMembersLoading] = useState(false);
  const [clanEditName, setClanEditName] = useState('');
  const [clanEditDescription, setClanEditDescription] = useState('');

  // System feature toggles
  const [featureToggles, setFeatureToggles] = useState<Record<string, boolean>>({
    pvp_enabled: true,
    shop_enabled: true,
    clans_enabled: true,
    leaderboard_enabled: true,
    tournaments_enabled: true,
    quests_enabled: true,
    raids_enabled: true,
    cambridge_tests_enabled: true,
    ielts_enabled: true,
    announcements_enabled: true,
  });

  // Announcement management
  const [existingAnnouncements, setExistingAnnouncements] = useState<any[]>([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);
  
  // Cambridge Tests Reports State
  const [quizScores, setQuizScores] = useState<any[]>([]);
  const [quizScoresLoading, setQuizScoresLoading] = useState(false);
  const [quizFilter, setQuizFilter] = useState<string>('all');
  const [classFilter, setClassFilter] = useState<string>('all');
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
        .map((row) => ({ id: row.id, name: row.name, school_plan: row.school_plan }))
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
      .select('id, name, school_plan')
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

  // Load pilot quotas for a selected school
  const loadSchoolQuotas = useCallback(async (schoolId: string) => {
    if (!schoolId) { setSchoolQuotas(null); return; }
    setSchoolQuotasLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_get_school_pilot_quotas', { p_school_id: schoolId });
      if (error || !data?.success) {
        setSchoolQuotas(null);
        setPilotTrialEnd(null);
        return;
      }
      setSchoolQuotas(data.quotas || null);
      setPilotTrialEnd(data.trial_ends_at || null);
    } catch {
      setSchoolQuotas(null);
    } finally {
      setSchoolQuotasLoading(false);
    }
  }, []);

  const handleResetQuotas = async (schoolId: string) => {
    setQuotaActionLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_reset_school_quotas', { p_school_id: schoolId });
      if (error || !data?.success) {
        addToast(error?.message || data?.error || 'Failed to reset quotas', 'error');
        return;
      }
      addToast(`✅ All quotas reset to 0 for this school`, 'success');
      loadSchoolQuotas(schoolId);
    } catch {
      addToast('Failed to reset quotas', 'error');
    } finally {
      setQuotaActionLoading(false);
    }
  };

  const handleSetQuota = async (schoolId: string, featureId: string, newUsed: number) => {
    setQuotaActionLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_set_school_quota', {
        p_school_id: schoolId,
        p_feature_id: featureId,
        p_used_count: newUsed,
      });
      if (error || !data?.success) {
        addToast(error?.message || data?.error || 'Failed to set quota', 'error');
        return;
      }
      addToast(`✅ ${featureId} set to ${newUsed}/${data.limit}`, 'success');
      setQuotaEditFeature(null);
      loadSchoolQuotas(schoolId);
    } catch {
      addToast('Failed to set quota', 'error');
    } finally {
      setQuotaActionLoading(false);
    }
  };

  const handleExtendTrial = async (schoolId: string, days: number) => {
    setQuotaActionLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_extend_pilot_trial', {
        p_school_id: schoolId,
        p_extra_days: days,
      });
      if (error || !data?.success) {
        addToast(error?.message || data?.error || 'Failed to extend trial', 'error');
        return;
      }
      const newEnd = new Date(data.new_trial_ends_at).toLocaleDateString();
      addToast(`✅ Trial extended by ${days} days — new end: ${newEnd}`, 'success');
      setPilotTrialEnd(data.new_trial_ends_at);
    } catch {
      addToast('Failed to extend trial', 'error');
    } finally {
      setQuotaActionLoading(false);
    }
  };

  const handleSetSchoolAdmin = async (schoolId: string, userId: string, makeAdmin: boolean = true) => {
    if (!schoolId) {
      addToast('Select a school before assigning an admin.', 'error');
      return;
    }

    setSchoolAdminActionLoading(userId);
    try {
      // Role changes must stay on the governed RPC path. Never fall back to a
      // direct membership or user-role write from the browser.
      const { error } = await supabase.rpc('admin_set_school_admin', {
        p_school_id: schoolId,
        p_user_id: userId,
        p_is_admin: makeAdmin,
      });

      if (error) {
        throw error;
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
    let isDisposed = false;

    const refreshApplicationsUnreadTotal = async () => {
      if (schoolRequests.length === 0) {
        if (!isDisposed) setApplicationsUnreadTotal(0);
        return;
      }

      const unreadCounts = await Promise.all(
        schoolRequests.map(async (request) => {
          const result = await SchoolRequestService.listSchoolRequestMessages(request.id);
          if (!result.success || result.unavailable) return 0;
          const lastSeenAt = SchoolRequestService.getSchoolRequestLastSeenAt(request.id, 'admin');
          return SchoolRequestService.getUnreadSchoolRequestMessageCount(
            result.messages,
            'admin',
            lastSeenAt
          );
        })
      );

      if (!isDisposed) {
        const unreadMessagesTotal = unreadCounts.reduce((sum, count) => sum + count, 0);
        const pendingRequestsTotal = schoolRequests.filter((request) => request.status === 'pending').length;
        setApplicationsUnreadTotal(unreadMessagesTotal + pendingRequestsTotal);
      }
    };

    void refreshApplicationsUnreadTotal();

    const handleThreadSeen = (event: Event) => {
      const customEvent = event as CustomEvent<{ viewerRole?: string }>;
      if (customEvent.detail?.viewerRole === 'admin') {
        void refreshApplicationsUnreadTotal();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener(SchoolRequestService.SCHOOL_REQUEST_THREAD_SEEN_EVENT, handleThreadSeen);
    }

    const channel = SchoolRequestService.subscribeToSchoolRequestMessageChanges(
      'admin-applications-nav-unread',
      () => {
        void refreshApplicationsUnreadTotal();
      }
    );

    return () => {
      isDisposed = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener(SchoolRequestService.SCHOOL_REQUEST_THREAD_SEEN_EVENT, handleThreadSeen);
      }
      void supabase.removeChannel(channel);
    };
  }, [schoolRequests]);

  // Load school options when announcement composer opens (needed for targeting)
  useEffect(() => {
    if (showAnnouncementComposer && schoolOptions.length === 0) {
      loadSchoolOptions();
    }
  }, [showAnnouncementComposer, schoolOptions.length, loadSchoolOptions]);

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

  // Preserve a Cambridge attempt and allow a retake (via scoped audited RPC).
  const deleteQuizScore = async (id: string, studentName: string) => {
    if (!window.confirm(`Allow ${studentName} to retake this test? The original attempt will be preserved in audit history.`)) return;
    try {
      const { data, error } = await supabase.rpc('allow_cambridge_retake', {
        p_score_id: id,
        p_reason: 'Platform administrator authorized a retake',
      });
      if (error) throw error;
      const result = typeof data === 'string' ? JSON.parse(data) : data;
      if (result && result.success === false) throw new Error(result.error || 'Failed');
      addToast(`↻ Retake allowed for ${studentName}; original attempt preserved`, 'success');
      fetchQuizScores();
    } catch (error) {
      reportRpcError('Failed to allow retake:', error, 'Failed to allow retake');
    }
  };

  // Correct answers for different tests
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
    ...chemistryAnswerKeys
  };

  const getScienceAnswerKey = (quizName: string | undefined, result?: any) => {
    if (!quizName) return {};
    if (isBiologyCambridgeQuiz(quizName)) {
      return buildBiologyAnswerKeyFromSavedMetadata(result?.answers).answerKey;
    }

    const baseName = quizName.replace(/\s*\(Part\s+\d+\)\s*/i, '').trim();
    const partMatch = quizName.match(/\(Part\s+(\d+)\)/i);
    const baseKey = chemistryAnswerKeys[quizName] || chemistryAnswerKeys[baseName] || {};
    const range = chemistryQuestionRanges[baseName];

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
      title: "Improve Your Science Knowledge",
      tips: ["Review the questions you got wrong", "Study the relevant chapter in your textbook", "Practice more past paper questions", "Ask your teacher for help with difficult concepts"]
    }
  };

  // Analyze skill performance
  const analyzeSkillPerformance = (result: any) => {
    const quizName = result.quiz_name || '';
    const rawAnswers = parseCambridgeResponses(result.answers);
    const categories = skillCategories[quizName] || {};
    const correctAnswersForQuiz = correctAnswers[quizName] || {};
    
    // Check if this is a Chemistry test (no predefined skill categories)
    const isChemistryTest = quizName.toLowerCase().includes('chemistry') || quizName.toLowerCase().includes('biology');
    
    // For Chemistry/Biology tests, create a simple overall performance entry
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
        const expected = correctAnswersForQuiz[q];
        if (expected !== undefined && isCambridgeAnswerCorrect(rawAnswers[q], expected)) correctCount++;
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
        p_gemstones_delta: 0,
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
        p_gemstones_delta: 0,
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
      const confirmReset = window.confirm('Reset ALL player records (excluding admins)? This clears achievements, PvP records, answered-question history, task records, and resets caps. This action cannot be undone.');
      if (!confirmReset) {
        return;
      }

      setIsResettingAll(true);
      const affected = await CompetitionService.resetAllPlayerProgress();
      addToast(`🧨 Reset all records + caps for ${affected} players`, 'success');
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

  // Load classes for a school (for class-targeted announcements)
  const loadClassesForSchool = async (schoolId: string) => {
    if (!schoolId) { setTargetSchoolClasses([]); return; }
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('id, class_code, class_name')
        .eq('school_id', schoolId)
        .eq('is_active', true)
        .order('class_code');
      if (!error && data) setTargetSchoolClasses(data);
    } catch { setTargetSchoolClasses([]); }
  };

  const sendAnnouncement = async () => {
    if (!announcementText.trim()) {
      addToast('Announcement text is empty', 'error');
      return;
    }

    // Validate targeting
    const needsSchool = ['school', 'school_admins_school', 'grade_school', 'class'].includes(announcementAudience);
    const needsGrade = ['grade', 'grade_school'].includes(announcementAudience);
    const needsClass = announcementAudience === 'class';

    if (needsSchool && !announcementTargetSchoolId) {
      addToast('Select a school for this audience target', 'error');
      return;
    }
    if (needsGrade && !announcementTargetGrade) {
      addToast('Select a grade for this audience target', 'error');
      return;
    }
    if (needsClass && !announcementTargetClassId) {
      addToast('Select a class for this audience target', 'error');
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

      // Build targeting
      const target: CompetitionService.AnnouncementTarget = { audience: announcementAudience };
      if (needsSchool) target.schoolId = announcementTargetSchoolId;
      if (needsGrade) target.grade = Number(announcementTargetGrade);
      if (needsClass) target.classId = announcementTargetClassId;

      setIsSendingAnnouncement(true);
      await CompetitionService.postAnnouncement(announcementText.trim(), expiresAt, target);

      const audienceLabels: Record<string, string> = {
        all: 'all players',
        school: `school "${schoolOptions.find(s => s.id === announcementTargetSchoolId)?.name || announcementTargetSchoolId}"`,
        school_admins: 'all school admins',
        school_admins_school: `school admins at "${schoolOptions.find(s => s.id === announcementTargetSchoolId)?.name || ''}"`,
        grade: `Grade ${announcementTargetGrade} (all schools)`,
        grade_school: `Grade ${announcementTargetGrade} at "${schoolOptions.find(s => s.id === announcementTargetSchoolId)?.name || ''}"`,
        class: `class "${targetSchoolClasses.find(c => c.id === announcementTargetClassId)?.class_code || announcementTargetClassId}"`,
        teachers: 'all teachers',
      };
      addToast(`📢 Announcement sent to ${audienceLabels[announcementAudience] || 'selected audience'}`, 'success');

      setAnnouncementText('');
      setAnnouncementExpiry('never');
      setCustomAnnouncementExpiry('');
      setAnnouncementAudience('all');
      setAnnouncementTargetSchoolId('');
      setAnnouncementTargetGrade('');
      setAnnouncementTargetClassId('');
      setTargetSchoolClasses([]);
      setShowAnnouncementComposer(false);
    } catch (error) {
      reportRpcError('Failed to send announcement:', error, 'Failed to send announcement');
    } finally {
      setIsSendingAnnouncement(false);
    }
  };

  const grantGemstones = async (userId: string, amount: number) => {
    try {
      const user = users.find(u => u.id === userId);
      if (!user) return;

      const { error } = await supabase.rpc('rpc_admin_grant', {
        p_user_id: userId,
        p_xp_delta: 0,
        p_coins_delta: 0,
        p_gemstones_delta: amount,
      });

      if (error) throw error;

      updateUserInState(userId, { gemstones: Number(user.gemstones ?? 0) + amount });
      addToast(`💎 Granted ${amount} gemstones to ${user.username ?? user.email ?? 'Unknown'}`, 'success');
      await refreshAdminData();
    } catch (error) {
      reportRpcError('Failed to grant gemstones:', error, 'Failed to grant gemstones');
    }
  };

  // Custom grant with any amount
  const grantCustomCoins = async (userId: string, amount: number) => {
    if (!amount || amount <= 0) { addToast('Enter a positive amount', 'error'); return; }
    try {
      const user = users.find(u => u.id === userId);
      if (!user) return;
      const { error } = await supabase.rpc('rpc_admin_grant', { p_user_id: userId, p_xp_delta: 0, p_coins_delta: amount, p_gemstones_delta: 0 });
      if (error) throw error;
      updateUserInState(userId, { coins: Number(user.coins ?? 0) + amount });
      addToast(`✨ Granted ${amount.toLocaleString()} coins to ${resolveUserLabel(user)}`, 'success');
      setCustomCoinAmount(prev => ({ ...prev, [userId]: '' }));
    } catch (error) { reportRpcError('Failed to grant coins:', error, 'Failed to grant coins'); }
  };

  const grantCustomXP = async (userId: string, amount: number) => {
    if (!amount || amount <= 0) { addToast('Enter a positive amount', 'error'); return; }
    try {
      const user = users.find(u => u.id === userId);
      if (!user) return;
      const { error } = await supabase.rpc('rpc_admin_grant', { p_user_id: userId, p_xp_delta: amount, p_coins_delta: 0, p_gemstones_delta: 0 });
      if (error) throw error;
      updateUserInState(userId, { xp: Number(user.xp ?? 0) + amount });
      addToast(`⚡ Granted ${amount.toLocaleString()} XP to ${resolveUserLabel(user)}`, 'success');
      setCustomXpAmount(prev => ({ ...prev, [userId]: '' }));
    } catch (error) { reportRpcError('Failed to grant XP:', error, 'Failed to grant XP'); }
  };

  const grantCustomGemstones = async (userId: string, amount: number) => {
    if (!amount || amount <= 0) { addToast('Enter a positive amount', 'error'); return; }
    try {
      const user = users.find(u => u.id === userId);
      if (!user) return;
      const { error } = await supabase.rpc('rpc_admin_grant', { p_user_id: userId, p_xp_delta: 0, p_coins_delta: 0, p_gemstones_delta: amount });
      if (error) throw error;
      updateUserInState(userId, { gemstones: Number(user.gemstones ?? 0) + amount });
      addToast(`💎 Granted ${amount.toLocaleString()} gemstones to ${resolveUserLabel(user)}`, 'success');
      setCustomGemstoneAmount(prev => ({ ...prev, [userId]: '' }));
    } catch (error) { reportRpcError('Failed to grant gemstones:', error, 'Failed to grant gemstones'); }
  };

  const setCustomLevel = async (userId: string, level: number) => {
    if (!level || level < 1) { addToast('Level must be at least 1', 'error'); return; }
    try {
      const user = users.find(u => u.id === userId);
      if (!user) return;
      const { error } = await supabase.rpc('rpc_admin_set_level', { p_user_id: userId, p_level: level });
      if (error) throw error;
      updateUserInState(userId, { level });
      addToast(`📈 Set level to ${level} for ${resolveUserLabel(user)}`, 'success');
      setCustomLevelAmount(prev => ({ ...prev, [userId]: '' }));
    } catch (error) { reportRpcError('Failed to set level:', error, 'Failed to set level'); }
  };

  // Role management
  const changeUserRole = async (userId: string, newRole: string) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    const confirmMsg = `Change ${resolveUserLabel(user)}'s role to "${newRole}"?`;
    if (!window.confirm(confirmMsg)) return;
    setRoleChangeLoading(userId);
    try {
      const { error } = await supabase.from('users').update({ role: newRole }).eq('id', userId);
      if (error) throw error;
      updateUserInState(userId, { role: newRole, is_admin: newRole === 'admin' || newRole === 'superadmin' });
      addToast(`👤 Role updated to "${newRole}" for ${resolveUserLabel(user)}`, 'success');
    } catch (error) { reportRpcError('Failed to change role:', error, 'Failed to change role'); }
    finally { setRoleChangeLoading(null); }
  };

  // Analytics
  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const stats = await CompetitionService.fetchAdminOverviewStats();
      const batchStats = await CompetitionService.fetchSchoolBatches();
      
      // Fetch grade & role distribution from current users
      const gradeDistribution: Record<string, number> = {};
      const roleDistribution: Record<string, number> = {};
      
      // Get a larger set of users for analytics
      const { data: allUsers } = await supabase.from('users').select('grade, role, is_admin').limit(5000);
      (allUsers || []).forEach((u: any) => {
        const grade = u.grade ? `Grade ${u.grade}` : 'Unset';
        gradeDistribution[grade] = (gradeDistribution[grade] || 0) + 1;
        const role = u.is_admin ? 'admin' : (u.role || 'student');
        roleDistribution[role] = (roleDistribution[role] || 0) + 1;
      });

      // Clan count
      const { count: clanCount } = await supabase.from('clans').select('id', { head: true, count: 'exact' });

      // Question count
      const { count: questionCount } = await supabase.from('questions').select('id', { head: true, count: 'exact' });

      setAnalyticsData({
        playersToday: stats.players_today ?? 0,
        attemptsToday: stats.attempts_last_5min ?? 0,
        activeNow: stats.attempts_last_5min ?? 0,
        totalClans: clanCount ?? 0,
        totalQuestions: questionCount ?? 0,
        recentErrors: stats.recent_errors ? [stats.recent_errors] : [],
        batchStats: batchStats.map(b => ({ batch: b.batch, playerCount: b.player_count, totalXp: b.total_xp })),
        gradeDistribution,
        roleDistribution,
      });
    } catch (error) {
      reportRpcError('Failed to fetch analytics:', error, 'Failed to fetch analytics');
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  // Enhanced clan management
  const loadClanMembers = async (clanId: string) => {
    setClanMembersLoading(true);
    try {
      const { data, error } = await supabase
        .from('clan_members')
        .select('*, users:user_id(id, username, email, avatar_url, level, xp, role)')
        .eq('clan_id', clanId);
      if (error) throw error;
      setClanMembers(data || []);
    } catch (error) {
      reportRpcError('Failed to load clan members:', error, 'Failed to load clan members');
      setClanMembers([]);
    } finally {
      setClanMembersLoading(false);
    }
  };

  const removeClanMember = async (clanId: string, userId: string, username: string) => {
    if (!confirm(`Remove ${username} from the clan?`)) return;
    try {
      const { error } = await supabase.from('clan_members').delete().eq('clan_id', clanId).eq('user_id', userId);
      if (error) throw error;
      addToast(`Removed ${username} from clan`, 'success');
      setClanMembers(prev => prev.filter(m => m.user_id !== userId));
    } catch (error) { reportRpcError('Failed to remove member:', error, 'Failed to remove clan member'); }
  };

  const transferClanLeadership = async (clanId: string, newLeaderId: string, newLeaderName: string) => {
    if (!confirm(`Transfer clan leadership to ${newLeaderName}?`)) return;
    try {
      // Update clan leader
      const { error: clanError } = await supabase.from('clans').update({ leader_id: newLeaderId }).eq('id', clanId);
      if (clanError) throw clanError;
      // Update member roles
      await supabase.from('clan_members').update({ role: 'member' }).eq('clan_id', clanId).eq('role', 'leader');
      await supabase.from('clan_members').update({ role: 'leader' }).eq('clan_id', clanId).eq('user_id', newLeaderId);
      addToast(`👑 Leadership transferred to ${newLeaderName}`, 'success');
      loadClanMembers(clanId);
    } catch (error) { reportRpcError('Failed to transfer leadership:', error, 'Failed to transfer leadership'); }
  };

  // Fetch existing announcements
  const fetchAnnouncements = async () => {
    setAnnouncementsLoading(true);
    try {
      const { data, error } = await supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(20);
      if (error) throw error;
      setExistingAnnouncements(data || []);
    } catch (error) {
      reportRpcError('Failed to fetch announcements:', error, 'Failed to fetch announcements');
    } finally {
      setAnnouncementsLoading(false);
    }
  };

  const deleteAnnouncement = async (id: string) => {
    if (!confirm('Delete this announcement?')) return;
    try {
      const { error } = await supabase.from('announcements').delete().eq('id', id);
      if (error) throw error;
      setExistingAnnouncements(prev => prev.filter(a => a.id !== id));
      addToast('🗑️ Announcement deleted', 'success');
    } catch (error) { reportRpcError('Failed to delete:', error, 'Failed to delete announcement'); }
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
      const result = await CompetitionService.deletePlayer(userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
      await refreshAdminData();

      const totalRowsDeleted = Object.values(result.rows_deleted || {}).reduce((sum, count) => sum + Number(count || 0), 0);
      const warningSuffix = result.warnings?.length ? ` ⚠️ ${result.warnings.length} warning(s).` : '';
      addToast(
        `🗑️ Deleted ${username}. Auth deleted: ${result.auth_deleted ? 'yes' : 'no'}. Rows: ${totalRowsDeleted}. Storage objects: ${result.storage_deleted}.${warningSuffix}`,
        result.warnings?.length ? 'info' : 'success'
      );
    } catch (error) {
      reportRpcError('Failed to delete user:', error, 'Failed to delete user');
    }
  };


  // ─── Context value for child components ──────────────
  const contextValue = {
    // Props & externals
    profile, addToast, supabase,
    // State
    stats, statsLoading, statsError, users, usersLoading, usersError,
    searchQuery, setSearchQuery, userPage, setUserPage, hasNextPage, PAGE_SIZE,
    adminVisible, setAdminVisible,
    showAnnouncementComposer, setShowAnnouncementComposer,
    announcementText, setAnnouncementText, announcementExpiry, setAnnouncementExpiry,
    customAnnouncementExpiry, setCustomAnnouncementExpiry, isSendingAnnouncement,
    announcementAudience, setAnnouncementAudience,
    announcementTargetSchoolId, setAnnouncementTargetSchoolId,
    announcementTargetGrade, setAnnouncementTargetGrade,
    announcementTargetClassId, setAnnouncementTargetClassId,
    targetSchoolClasses, loadClassesForSchool,
    isResettingAll, setIsResettingAll,
    quizScores, quizScoresLoading, quizFilter, setQuizFilter, classFilter, setClassFilter,
    showReportModal, setShowReportModal, reportStudent,
    showAnswerReflection, setShowAnswerReflection,
    featureToggles, setFeatureToggles,
    activeTab, setActiveTab,
    clanList, setClanList, selectedClan, setSelectedClan,
    clanMembers, setClanMembers, clanMembersLoading,
    clanEditName, setClanEditName, clanEditDescription, setClanEditDescription,
    analyticsData, analyticsLoading,
    schoolAdminSchoolId, setSchoolAdminSchoolId, schoolOptions,
    schoolMembers, setSchoolMembers, schoolMembersLoading, schoolMembersError, setSchoolMembersError,
    schoolMemberSearch, setSchoolMemberSearch,
    schoolQuotas, setSchoolQuotas, schoolQuotasLoading,
    quotaEditFeature, setQuotaEditFeature, quotaEditValue, setQuotaEditValue,
    quotaActionLoading, pilotTrialEnd, setPilotTrialEnd, extendDays, setExtendDays,
    schoolAdminActionLoading,
    schoolRequestSearch, setSchoolRequestSearch, schoolRequestStatus, setSchoolRequestStatus,
    schoolRequestsLoading, schoolRequestsError, schoolRequestActionLoading,
    schoolRequestNotes, setSchoolRequestNotes,
    schoolRequestDuplicates, setSchoolRequestDuplicates,
    schoolRequestMessagesOpen, setSchoolRequestMessagesOpen,
    schoolRequestMessages, schoolRequestMessagesLoading,
    schoolRequestMessagesError, schoolRequestMessagesUnavailable,
    applicationsUnreadTotal,
    existingAnnouncements, announcementsLoading,
    showCustomGrant, setShowCustomGrant,
    customCoinAmount, setCustomCoinAmount, customXpAmount, setCustomXpAmount,
    customGemstoneAmount, setCustomGemstoneAmount, customLevelAmount, setCustomLevelAmount, roleChangeLoading,
    // Derived state
    uniqueQuizNames, uniqueClasses, filteredQuizScores, quizStats,
    filteredSchoolRequests, filteredSchoolMembers, currentSchoolAdmin,
    playerUsers, isSuperadmin, requestStatusStyles,
    // Functions
    refreshAdminData, resetAllProgress, fetchQuizScores, exportCSV,
    openReport, openAnswerReflection, sendAnnouncement,
    fetchAnnouncements, deleteAnnouncement, grantCoins, grantXP, grantGemstones,
    setUserLevel, resetUserAP, resetUserProgress, resetUserAcademics,
    setUserBanState, deleteUser, grantCustomCoins, grantCustomXP, grantCustomGemstones,
    setCustomLevel, changeUserRole, handleGradeChange, handleBatchChange,
    toggleAdminVisibility, loadSchoolMembers, loadSchoolQuotas,
    handleResetQuotas, handleSetQuota, handleExtendTrial, handleSetSchoolAdmin,
    handleSchoolRequestAction, loadSchoolRequests, loadSchoolRequestMessages,
    loadClanMembers, removeClanMember, transferClanLeadership, fetchAnalytics,
    deleteQuizScore, reportRpcError, fetchUsers,
    // Utilities
    resolveUserLabel, resolveUserEmail, formatTime,
    correctAnswers, getScienceAnswerKey, analyzeSkillPerformance,
    getGrade, getEncouragement, actionPlans, testSections,
    // Constants
    SCHOOL_PLANS, gradeOptions, batchByGrade,
  };

  return (
    <AdminContext.Provider value={contextValue}>
    <div className="admin-portal min-h-screen relative overflow-hidden">
      {/* Epic Animated Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-pink-900/20 to-red-900/20 animate-pulse-slow"></div>
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="admin-particles"></div>
        </div>
      </div>

      <div className="admin-portal-content relative z-10 p-6">
        <BackButton onClick={handleLogout} label={isLoggingOut ? 'Logging out…' : 'Log out'} />

        {/* Godly Admin Header */}
        <div className="admin-portal-hero text-center mb-8 relative">
          <div className="inline-block relative">
            {/* Rotating Glow Effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-600 blur-3xl opacity-50 animate-spin-slow"></div>
            
            <h1 className="relative font-heading text-6xl font-black mb-2 animate-float">
              <span className="bg-gradient-to-r from-yellow-300 via-pink-400 to-purple-500 bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(255,215,0,0.8)]">
                ⚡ ADMIN PORTAL ⚡
              </span>
            </h1>
            
            <div className="flex items-center justify-center gap-3 mt-4">
              <div className="w-16 h-16 rounded-full border-4 border-yellow-400 animate-pulse-glow overflow-hidden bg-gray-800 flex items-center justify-center">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="Admin" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <span className="text-2xl">👑</span>
                )}
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
            
            <div className="admin-portal-visibility-content relative flex items-center justify-between">
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
        <div className="admin-portal-tabs max-w-6xl mx-auto mb-6">
          <div className="admin-portal-tablist flex flex-wrap gap-2 justify-center" role="tablist" aria-label="Admin portal navigation">
            {(['dashboard', 'users', 'schools', 'applications', 'booked-appointments', 'billing', 'game', 'clans', 'analytics', 'cambridge', 'ielts', 'system'] as AdminTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                role="tab"
                aria-selected={activeTab === tab}
                className={`admin-portal-tab relative px-6 py-3 rounded-xl font-heading text-lg font-bold transition-all duration-300 ${
                  activeTab === tab
                    ? 'bg-gradient-to-r from-yellow-400 to-pink-500 text-black shadow-[0_0_30px_rgba(255,215,0,0.8)] scale-110'
                    : 'bg-black/40 text-gray-400 hover:text-white border border-gray-600 hover:border-yellow-400'
                }`}
              >
                {activeTab === tab && (
                  <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 to-pink-500 blur-xl opacity-50 -z-10"></div>
                )}
                {tab.replace(/-/g, ' ').toUpperCase()}
                {tab === 'applications' && applicationsUnreadTotal > 0 && (
                  <span className="absolute -right-2 -top-2 inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white shadow-lg">
                    {Math.min(applicationsUnreadTotal, 99)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="max-w-7xl mx-auto">
          {activeTab === 'dashboard' && <DashboardTab />}
          {activeTab === 'users' && <UsersTab />}
          {activeTab === 'schools' && <SchoolsTab />}
          {activeTab === 'applications' && <ApplicationsTab />}
          {activeTab === 'booked-appointments' && <BookedAppointmentsTab />}
          {activeTab === 'billing' && <BillingAccessTab />}
          {activeTab === 'game' && <GameTab />}
          {activeTab === 'clans' && <ClansTab />}
          {activeTab === 'analytics' && <AnalyticsTab />}
          {activeTab === 'cambridge' && <CambridgeTab />}
          {activeTab === 'ielts' && <IeltsTab />}
          {activeTab === 'system' && <SystemTab />}
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

        @media (max-width: 768px) {
          .admin-portal-content {
            padding: 1rem;
          }

          .admin-portal-hero h1 {
            font-size: 2.25rem;
            line-height: 1.1;
          }

          .admin-portal-hero .text-2xl {
            font-size: 1.25rem;
          }

          .admin-portal-hero .text-sm {
            font-size: 0.75rem;
          }

          .admin-portal-visibility-content {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.75rem;
          }

          .admin-portal-visibility-content .text-4xl {
            align-self: flex-end;
          }

          .admin-portal-tabs {
            margin-bottom: 1rem;
          }

          .admin-portal-tablist {
            flex-wrap: nowrap;
            justify-content: flex-start;
            overflow-x: auto;
            padding-bottom: 0.5rem;
            scroll-snap-type: x mandatory;
          }

          .admin-portal-tab {
            flex: 0 0 auto;
            font-size: 0.75rem;
            padding: 0.5rem 0.75rem;
            scroll-snap-align: start;
          }
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
          .print-modal-overlay {
            position: static !important;
            display: block !important;
            overflow: visible !important;
            background: white !important;
            padding: 0 !important;
          }
          .no-print {
            display: none !important;
          }
          .print-content button {
            display: none !important;
          }
        }
      `}</style>

      {/* Modals */}
      <ReportModal />
      <AnswerReflectionModal />
      <AnnouncementModal />
    </div>
    </AdminContext.Provider>
  );
};

export default AdminPortal;
