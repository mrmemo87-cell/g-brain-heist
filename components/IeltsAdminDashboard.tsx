import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { fetchAllIeltsUsers, fetchIeltsAdminStats, fetchIeltsRecentAttempts } from '../services/ieltsService';

const NAV_SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'queues', label: 'Queues' },
  { id: 'attempts', label: 'Attempts' },
  { id: 'writing', label: 'Writing Inbox' },
  { id: 'speaking', label: 'Speaking Inbox' },
  { id: 'prime', label: 'Prime' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'violations', label: 'Violations' },
  { id: 'audit', label: 'Audit' },
] as const;

type NavSection = (typeof NAV_SECTIONS)[number]['id'];

type Toast = {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
};

type UserCaseTab =
  | 'summary'
  | 'timeline'
  | 'progress'
  | 'writing'
  | 'speaking'
  | 'prime'
  | 'notes'
  | 'violations'
  | 'notifications'
  | 'audit';

type UserCaseData = {
  reading: any[];
  listening: any[];
  writing: any[];
  speaking: any[];
  sessions: any[];
  violations: any[];
  notes: any[];
  tags: string[];
  memberships: any[];
  primeApplications: any[];
  notifications: any[];
  audit: any[];
};

const USER_CASE_TABS: { id: UserCaseTab; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'progress', label: 'Progress' },
  { id: 'writing', label: 'Writing' },
  { id: 'speaking', label: 'Speaking' },
  { id: 'prime', label: 'Prime' },
  { id: 'notes', label: 'Notes/Tags' },
  { id: 'violations', label: 'Violations' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'audit', label: 'Audit' },
];

const PRIME_PLAN_MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  annually: 12,
};

const isMissingRpc = (error: { message?: string; code?: string }) => {
  const message = error?.message?.toLowerCase() ?? '';
  return error?.code === 'PGRST202' || message.includes('function') || message.includes('not found');
};

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDateOnly = (value?: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatBand = (value?: number | null) => (value ? value.toFixed(1) : '—');

const formatDuration = (seconds?: number | null) => {
  if (!seconds) return '—';
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
};

const formatCountdown = (expiresAt?: string | null) => {
  if (!expiresAt) return '—';
  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) return '—';
  const diffMs = expiry.getTime() - Date.now();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'Expired';
  if (diffDays === 0) return 'Expires today';
  return `${diffDays} day${diffDays === 1 ? '' : 's'} remaining`;
};

const getLatestMembership = (memberships: any[]) => {
  if (!memberships.length) return null;
  return [...memberships].sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())[0];
};

const StatCard: React.FC<{ icon: string; label: string; value: number; color: string }> = ({
  icon,
  label,
  value,
  color,
}) => {
  const colorClasses: Record<string, string> = {
    cyan: 'text-cyan-300',
    yellow: 'text-yellow-300',
    blue: 'text-blue-300',
    purple: 'text-purple-300',
    green: 'text-emerald-300',
    orange: 'text-orange-300',
    pink: 'text-pink-300',
    teal: 'text-teal-300',
  };
  const colorClass = colorClasses[color] ?? 'text-cyan-300';

  return (
    <div className="rounded-2xl bg-slate-900 p-4 shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
        </div>
        <span className={`text-2xl ${colorClass}`}>{icon}</span>
      </div>
    </div>
  );
};

const Sparkline: React.FC<{ values: number[] }> = ({ values }) => {
  if (!values.length) {
    return <div className="text-xs text-slate-500">No data</div>;
  }
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1 || 1)) * 100;
      const y = 100 - ((value - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg className="h-12 w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        points={points}
        className="text-cyan-400"
      />
    </svg>
  );
};

const IeltsAdminDashboard: React.FC = () => {
  const [activeSection, setActiveSection] = useState<NavSection>('overview');
  const [isCaseLoading, setIsCaseLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [rpcMissing, setRpcMissing] = useState<string | null>(null);
  const [sectionLoading, setSectionLoading] = useState<Partial<Record<NavSection, boolean>>>({});
  const [loadedSections, setLoadedSections] = useState<Partial<Record<NavSection, boolean>>>({});

  const [stats, setStats] = useState<any>(null);
  const [recentAttempts, setRecentAttempts] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [writingAttempts, setWritingAttempts] = useState<any[]>([]);
  const [speakingAttempts, setSpeakingAttempts] = useState<any[]>([]);
  const [primeApplications, setPrimeApplications] = useState<any[]>([]);
  const [notificationPrefs, setNotificationPrefs] = useState<any[]>([]);
  const [violations, setViolations] = useState<any[]>([]);
  const [auditEntries, setAuditEntries] = useState<any[]>([]);
  const [audioUrlMap, setAudioUrlMap] = useState<Record<string, { status: 'loading' | 'ready' | 'error'; url?: string }>>({});

  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [userCaseData, setUserCaseData] = useState<UserCaseData | null>(null);
  const [userCaseTab, setUserCaseTab] = useState<UserCaseTab>('summary');
  const [tagDraft, setTagDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [membershipAction, setMembershipAction] = useState({ plan: 'monthly', months: 1, reason: '' });
  const [resetScope, setResetScope] = useState({
    reading: false,
    listening: false,
    writing: false,
    speaking: false,
    mock: false,
    sessions: false,
    notifications: false,
    violations: false,
  });
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');

  const [gradeModal, setGradeModal] = useState<{ type: 'writing' | 'speaking'; attempt: any } | null>(null);
  const [gradeForm, setGradeForm] = useState({
    bandOverall: '',
    feedback: '',
    criteria: '',
    fluency: '',
    pronunciation: '',
    lexical: '',
    grammar: '',
  });

  const [userSearch, setUserSearch] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [attemptSearch, setAttemptSearch] = useState('');
  const [attemptSkillFilter, setAttemptSkillFilter] = useState('all');
  const [attemptPage, setAttemptPage] = useState(1);
  const [primeSearch, setPrimeSearch] = useState('');
  const [primePage, setPrimePage] = useState(1);
  const [notificationSearch, setNotificationSearch] = useState('');
  const [notificationPage, setNotificationPage] = useState(1);
  const [violationSearch, setViolationSearch] = useState('');
  const [violationPage, setViolationPage] = useState(1);
  const [auditFilters, setAuditFilters] = useState({
    action: '',
    targetUser: '',
    dateFrom: '',
    dateTo: '',
  });
  const [auditPage, setAuditPage] = useState(1);

  const [membershipSearch, setMembershipSearch] = useState('');
  const [membershipTarget, setMembershipTarget] = useState<any | null>(null);
  const [membershipHistory, setMembershipHistory] = useState<any[]>([]);
  const [primeApprovalModal, setPrimeApprovalModal] = useState<{
    application: any;
    plan: 'monthly' | 'quarterly' | 'annually';
    months: number;
  } | null>(null);

  useEffect(() => {
    if (!loadedSections[activeSection]) {
      void loadSectionData(activeSection);
    }
  }, [activeSection, loadedSections]);

  const addToast = (message: string, type: Toast['type']) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => dismissToast(id), 4000);
  };

  const userLookup = useMemo(() => {
    return users.reduce<Record<string, { username?: string; full_name?: string; email?: string }>>((acc, user) => {
      if (!user?.id) return acc;
      acc[user.id] = {
        username: user.username,
        full_name: user.full_name,
        email: user.email,
      };
      return acc;
    }, {});
  }, [users]);

  const formatUserDisplay = (userId?: string | null, fallbackName?: string | null) => {
    if (!userId && !fallbackName) {
      return { primary: 'Unknown user', secondary: null };
    }
    const user = userId ? userLookup[userId] : null;
    const primary = fallbackName ?? user?.full_name ?? user?.username ?? user?.email ?? userId ?? 'Unknown user';
    const secondary = userId && primary !== userId ? userId : null;
    return { primary, secondary };
  };

  const dismissToast = (id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const handleRpc = async (rpcName: string, payload: Record<string, any>) => {
    try {
      const { data, error } = await supabase.rpc(rpcName, payload);
      if (error) {
        if (isMissingRpc(error)) {
          setRpcMissing(`Missing RPC: ${rpcName}. Please deploy the latest IELTS admin functions.`);
        }
        addToast(error.message || 'RPC failed', 'error');
        return null;
      }
      return data;
    } catch (err: any) {
      addToast(err?.message || 'RPC failed', 'error');
      return null;
    }
  };

  const markSectionsLoaded = (sections: NavSection[]) => {
    setLoadedSections((prev) => {
      const next = { ...prev };
      sections.forEach((section) => {
        next[section] = true;
      });
      return next;
    });
  };

  const setSectionLoadingState = (section: NavSection, value: boolean) => {
    setSectionLoading((prev) => ({ ...prev, [section]: value }));
  };

  const fetchOverviewData = async () => {
    const tasks = [fetchIeltsAdminStats().catch(() => null), fetchIeltsRecentAttempts(200).catch(() => [])];
    if (!loadedSections.users) {
      tasks.push(fetchAllIeltsUsers().catch(() => []));
    }
    const [statsData, attemptsData, usersData] = await Promise.all(tasks);
    setStats(statsData);
    setRecentAttempts(attemptsData || []);
    if (usersData) {
      setUsers(usersData || []);
    }
  };

  const fetchUsersData = async () => {
    const usersData = await fetchAllIeltsUsers().catch(() => []);
    setUsers(usersData || []);
  };

  const fetchWritingAttemptsData = async () => {
    const { data } = await supabase
      .from('ielts_writing_attempts')
      .select('*')
      .order('submitted_at', { ascending: false })
      .limit(200);
    setWritingAttempts(data ?? []);
  };

  const fetchSpeakingAttemptsData = async () => {
    const { data } = await supabase
      .from('ielts_speaking_attempts')
      .select('*')
      .order('submitted_at', { ascending: false })
      .limit(200);
    setSpeakingAttempts(data ?? []);
  };

  const fetchPrimeApplicationsData = async () => {
    const { data } = await supabase
      .from('ielts_prime_applications')
      .select('*')
      .order('created_at', { ascending: false });
    setPrimeApplications(data ?? []);
  };

  const fetchNotificationPrefsData = async () => {
    const { data } = await supabase
      .from('ielts_notification_preferences')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    setNotificationPrefs(data ?? []);
  };

  const fetchViolationsData = async () => {
    const { data } = await supabase
      .from('ielts_violation_logs')
      .select('*')
      .order('occurred_at', { ascending: false })
      .limit(200);
    setViolations(data ?? []);
  };

  const fetchAuditEntriesData = async () => {
    const { data } = await supabase
      .from('ielts_admin_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300);
    setAuditEntries(data ?? []);
  };

  const loadSectionData = async (section: NavSection, force = false) => {
    if (!force && loadedSections[section]) return;
    setSectionLoadingState(section, true);
    setError(null);
    try {
      switch (section) {
        case 'overview':
        case 'attempts':
          await fetchOverviewData();
          markSectionsLoaded(['overview', 'attempts', 'users']);
          break;
        case 'users':
          await fetchUsersData();
          markSectionsLoaded(['users']);
          break;
        case 'queues': {
          const tasks = [
            force || !loadedSections.prime ? fetchPrimeApplicationsData() : Promise.resolve(),
            force || !loadedSections.writing ? fetchWritingAttemptsData() : Promise.resolve(),
            force || !loadedSections.speaking ? fetchSpeakingAttemptsData() : Promise.resolve(),
            force || !loadedSections.violations ? fetchViolationsData() : Promise.resolve(),
            force || !loadedSections.notifications ? fetchNotificationPrefsData() : Promise.resolve(),
            force || !loadedSections.users ? fetchUsersData() : Promise.resolve(),
          ];
          await Promise.all(tasks);
          markSectionsLoaded(['queues', 'prime', 'writing', 'speaking', 'violations', 'notifications', 'users']);
          break;
        }
        case 'writing':
          await Promise.all([
            fetchWritingAttemptsData(),
            force || !loadedSections.users ? fetchUsersData() : Promise.resolve(),
          ]);
          markSectionsLoaded(['writing', 'users']);
          break;
        case 'speaking':
          await Promise.all([
            fetchSpeakingAttemptsData(),
            force || !loadedSections.users ? fetchUsersData() : Promise.resolve(),
          ]);
          markSectionsLoaded(['speaking', 'users']);
          break;
        case 'prime':
          await Promise.all([
            fetchPrimeApplicationsData(),
            force || !loadedSections.users ? fetchUsersData() : Promise.resolve(),
          ]);
          markSectionsLoaded(['prime', 'users']);
          break;
        case 'notifications':
          await Promise.all([
            fetchNotificationPrefsData(),
            force || !loadedSections.users ? fetchUsersData() : Promise.resolve(),
          ]);
          markSectionsLoaded(['notifications', 'users']);
          break;
        case 'violations':
          await Promise.all([
            fetchViolationsData(),
            force || !loadedSections.users ? fetchUsersData() : Promise.resolve(),
          ]);
          markSectionsLoaded(['violations', 'users']);
          break;
        case 'audit':
          await Promise.all([
            fetchAuditEntriesData(),
            force || !loadedSections.users ? fetchUsersData() : Promise.resolve(),
          ]);
          markSectionsLoaded(['audit', 'users']);
          break;
        default:
          break;
      }
    } catch (loadError) {
      console.error('Error loading IELTS admin data:', loadError);
      setError('Failed to load IELTS admin data.');
      addToast('Failed to load IELTS data', 'error');
    } finally {
      setSectionLoadingState(section, false);
    }
  };

  const loadAdminData = async (force = false) => {
    const sectionsToRefresh: NavSection[] = [
      'overview',
      'users',
      'queues',
      'writing',
      'speaking',
      'prime',
      'notifications',
      'violations',
      'audit',
    ];
    await Promise.all(sectionsToRefresh.map((section) => loadSectionData(section, force)));
  };

  const loadUserCaseFile = async (user: any) => {
    setSelectedUser(user);
    setUserCaseTab('summary');
    setIsCaseLoading(true);
    setRpcMissing(null);

    try {
      const [reading, listening, writing, speaking, sessions, violationsLog, notes, tags, membership, primeApps, notifications, audit] =
        await Promise.all([
          supabase.from('ielts_reading_attempts').select('*').eq('user_id', user.id).order('submitted_at', { ascending: false }),
          supabase.from('ielts_listening_attempts').select('*').eq('user_id', user.id).order('submitted_at', { ascending: false }),
          supabase.from('ielts_writing_attempts').select('*').eq('user_id', user.id).order('submitted_at', { ascending: false }),
          supabase.from('ielts_speaking_attempts').select('*').eq('user_id', user.id).order('submitted_at', { ascending: false }),
          supabase.from('ielts_sessions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
          supabase.from('ielts_violation_logs').select('*').eq('user_id', user.id).order('occurred_at', { ascending: false }),
          supabase.from('ielts_admin_notes').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
          supabase.from('ielts_admin_user_tags').select('*').eq('user_id', user.id),
          supabase.from('ielts_memberships').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
          supabase.from('ielts_prime_applications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
          supabase.from('ielts_notification_preferences').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
          supabase.from('ielts_admin_audit_log').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        ]);

      const tagsRow = tags.data?.[0];
      setUserCaseData({
        reading: reading.data ?? [],
        listening: listening.data ?? [],
        writing: writing.data ?? [],
        speaking: speaking.data ?? [],
        sessions: sessions.data ?? [],
        violations: violationsLog.data ?? [],
        notes: notes.data ?? [],
        tags: tagsRow?.tags ?? [],
        memberships: membership.data ?? [],
        primeApplications: primeApps.data ?? [],
        notifications: notifications.data ?? [],
        audit: audit.data ?? [],
      });
    } catch (caseError) {
      console.error(caseError);
      addToast('Failed to load user case file.', 'error');
    } finally {
      setIsCaseLoading(false);
    }
  };

  const refreshUserTags = async (userId: string) => {
    const { data, error: tagsError } = await supabase.from('ielts_admin_user_tags').select('*').eq('user_id', userId);
    if (tagsError) {
      addToast('Failed to load tags.', 'error');
      return;
    }
    const tagsRow = data?.[0];
    setUserCaseData((prev) => (prev ? { ...prev, tags: tagsRow?.tags ?? [] } : prev));
  };

  const refreshUserNotes = async (userId: string) => {
    const { data, error: notesError } = await supabase
      .from('ielts_admin_notes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (notesError) {
      addToast('Failed to load notes.', 'error');
      return;
    }
    setUserCaseData((prev) => (prev ? { ...prev, notes: data ?? [] } : prev));
  };

  const refreshUserMemberships = async (userId: string) => {
    const { data, error: membershipError } = await supabase
      .from('ielts_memberships')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (membershipError) {
      addToast('Failed to load memberships.', 'error');
      return;
    }
    setUserCaseData((prev) => (prev ? { ...prev, memberships: data ?? [] } : prev));
  };

  const refreshUserNotifications = async (userId: string) => {
    const { data, error: notificationsError } = await supabase
      .from('ielts_notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (notificationsError) {
      addToast('Failed to load notifications.', 'error');
      return;
    }
    setUserCaseData((prev) => (prev ? { ...prev, notifications: data ?? [] } : prev));
  };

  const refreshNotificationPrefs = async () => {
    const { data, error: notifError } = await supabase
      .from('ielts_notification_preferences')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (notifError) {
      addToast('Failed to load notifications.', 'error');
      return;
    }
    setNotificationPrefs(data ?? []);
  };

  const submitWritingGrade = async () => {
    if (!gradeModal?.attempt) return;
    let parsedCriteria: Record<string, unknown> = {};
    try {
      parsedCriteria = JSON.parse(gradeForm.criteria || '{}');
    } catch (parseError) {
      addToast('Criteria JSON is invalid.', 'error');
      return;
    }
    const payload = {
      attempt_id: gradeModal.attempt.id,
      band_overall: Number(gradeForm.bandOverall),
      feedback: gradeForm.feedback,
      criteria: parsedCriteria,
    };
    const result = await handleRpc('admin_ielts_write_grade', payload);
    if (result) {
      addToast('Writing grade saved.', 'success');
      setGradeModal(null);
      await loadAdminData(true);
      if (selectedUser) {
        await loadUserCaseFile(selectedUser);
      }
    }
  };

  const submitSpeakingGrade = async () => {
    if (!gradeModal?.attempt) return;
    const payload = {
      attempt_id: gradeModal.attempt.id,
      band_overall: Number(gradeForm.bandOverall),
      band_fluency: Number(gradeForm.fluency),
      band_pronunciation: Number(gradeForm.pronunciation),
      band_lexical: Number(gradeForm.lexical),
      band_grammar: Number(gradeForm.grammar),
      feedback: gradeForm.feedback,
    };
    const result = await handleRpc('admin_ielts_speaking_grade', payload);
    if (result) {
      addToast('Speaking grade saved.', 'success');
      setGradeModal(null);
      await loadAdminData(true);
      if (selectedUser) {
        await loadUserCaseFile(selectedUser);
      }
    }
  };

  const openGradeModal = (type: 'writing' | 'speaking', attempt: any) => {
    setGradeModal({ type, attempt });
    setGradeForm({
      bandOverall: attempt.band_overall?.toString() ?? '',
      feedback: attempt.feedback ?? '',
      criteria: attempt.criteria ? JSON.stringify(attempt.criteria, null, 2) : '',
      fluency: attempt.band_fluency?.toString() ?? '',
      pronunciation: attempt.band_pronunciation?.toString() ?? '',
      lexical: attempt.band_lexical?.toString() ?? '',
      grammar: attempt.band_grammar?.toString() ?? '',
    });
  };

  const setUserTags = async () => {
    if (!selectedUser) return;
    const tags = tagDraft.split(',').map((tag) => tag.trim()).filter(Boolean);
    const result = await handleRpc('admin_ielts_set_user_tags', {
      p_user_id: selectedUser.id,
      p_tags: tags,
    });
    if (result) {
      addToast('Tags updated.', 'success');
      setTagDraft('');
      await refreshUserTags(selectedUser.id);
    }
  };

  const addNote = async () => {
    if (!selectedUser || !noteDraft.trim()) return;
    const result = await handleRpc('admin_ielts_add_note', {
      p_user_id: selectedUser.id,
      p_note: noteDraft.trim(),
    });
    if (result) {
      addToast('Note added.', 'success');
      setNoteDraft('');
      await refreshUserNotes(selectedUser.id);
    }
  };

  const deleteNote = async (noteId: number) => {
    const result = await handleRpc('admin_ielts_note_delete', { note_id: noteId });
    if (result) {
      addToast('Note removed.', 'success');
      if (selectedUser) {
        await loadUserCaseFile(selectedUser);
      }
    }
  };

  const updateMembershipForUser = async (userId: string, action: 'grant' | 'extend' | 'revoke') => {
    const payload =
      action === 'grant'
        ? {
            p_user_id: userId,
            p_plan: membershipAction.plan,
            p_months: Number(membershipAction.months),
          }
        : action === 'extend'
          ? { p_user_id: userId, p_months: Number(membershipAction.months) }
          : { p_user_id: userId, p_reason: membershipAction.reason || 'Admin revoked' };

    const rpcName =
      action === 'grant'
        ? 'admin_ielts_membership_grant'
        : action === 'extend'
          ? 'admin_ielts_membership_extend'
          : 'admin_ielts_membership_revoke';

    const result = await handleRpc(rpcName, payload);
    if (result) {
      addToast(`Membership ${action}ed.`, 'success');
      if (selectedUser?.id === userId) {
        await refreshUserMemberships(selectedUser.id);
      }
      if (membershipTarget?.id === userId) {
        await fetchMembershipHistory(userId);
      }
      await fetchUsersData();
    }
  };

  const resetUserProgress = async () => {
    if (!selectedUser) return;
    const result = await handleRpc('admin_ielts_reset_progress', {
      p_user_id: selectedUser.id,
      p_reset_scope: resetScope,
    });
    if (result) {
      addToast('Progress reset queued.', 'success');
      setResetModalOpen(false);
      setResetConfirmText('');
      await loadUserCaseFile(selectedUser);
    }
  };

  const markNotificationSent = async (pref: any, channel: 'email' | 'sms' | 'in_app') => {
    const result = await handleRpc('admin_ielts_mark_notification_sent', {
      p_pref_id: String(pref.id),
      p_channel: channel,
    });
    if (result) {
      addToast('Notification marked sent.', 'success');
      await refreshNotificationPrefs();
      if (selectedUser?.id === pref.user_id) {
        await refreshUserNotifications(selectedUser.id);
      }
    }
  };

  const updatePrimeApplication = async (applicationId: string | number, status: string) => {
    const { error: updateError } = await supabase
      .from('ielts_prime_applications')
      .update({ status })
      .eq('id', applicationId);

    if (updateError) {
      addToast(updateError.message, 'error');
      return;
    }
    addToast(`Application ${status}.`, 'success');
    await loadAdminData(true);
    if (selectedUser) {
      await loadUserCaseFile(selectedUser);
    }
  };

  const openPrimeApprovalModal = (application: any) => {
    const plan =
      application?.payment_method && PRIME_PLAN_MONTHS[application.payment_method]
        ? application.payment_method
        : 'monthly';
    setPrimeApprovalModal({
      application,
      plan,
      months: PRIME_PLAN_MONTHS[plan] ?? 1,
    });
  };

  const approvePrimeApplication = async () => {
    if (!primeApprovalModal?.application) return;
    const { application, plan, months } = primeApprovalModal;
    const result = await handleRpc('admin_ielts_prime_approve_and_grant', {
      p_application_id: application.id,
      p_plan: plan,
      p_months: Number(months),
    });
    if (result) {
      addToast('Application approved and membership granted.', 'success');
      setPrimeApprovalModal(null);
      await loadAdminData(true);
      if (selectedUser) {
        await loadUserCaseFile(selectedUser);
      }
      if (membershipTarget?.id) {
        await fetchMembershipHistory(membershipTarget.id);
      }
    }
  };

  const updateViolationStatus = async (violationId: string | number, status: string, resolutionNote?: string) => {
    const result = await handleRpc('admin_ielts_violation_set_status', {
      p_violation_id: violationId,
      p_status: status,
      p_resolution_note: resolutionNote ?? null,
    });
    if (!result) return;
    addToast(`Violation marked as ${status}`, 'success');
    await loadAdminData(true);
    if (selectedUser) {
      await loadUserCaseFile(selectedUser);
    }
  };

  const fetchMembershipHistory = async (userId: string) => {
    const { data, error: membershipError } = await supabase
      .from('ielts_memberships')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (membershipError) {
      addToast('Failed to load membership history', 'error');
      return;
    }
    setMembershipHistory(data ?? []);
  };

  const pendingPrime = useMemo(
    () => primeApplications.filter((app) => (app.status ?? 'pending') === 'pending'),
    [primeApplications]
  );

  const ungradedWriting = useMemo(
    () => writingAttempts.filter((attempt) => attempt.band_overall == null),
    [writingAttempts]
  );

  const ungradedSpeaking = useMemo(
    () => speakingAttempts.filter((attempt) => attempt.band_overall == null),
    [speakingAttempts]
  );

  const unresolvedViolations = useMemo(
    () => violations.filter((violation) => (violation.status ?? 'open') !== 'resolved'),
    [violations]
  );

  const pendingNotifications = useMemo(
    () =>
      notificationPrefs.filter(
        (pref) =>
          (pref.notify_by_email && !pref.email_sent_at) ||
          (pref.notify_by_sms && !pref.sms_sent_at) ||
          (pref.show_in_app && !pref.in_app_shown_at)
      ),
    [notificationPrefs]
  );

  const premiumUserCount = useMemo(() => {
    return users.filter((user) => {
      const tier = user.current_tier ?? user.tier ?? user.subscription_tier ?? user.membership_tier;
      return tier === 'prime_prep_user';
    }).length;
  }, [users]);

  const inactivityBuckets = useMemo(() => {
    const now = Date.now();
    const days7: any[] = [];
    const days14: any[] = [];
    const days30: any[] = [];

    users.forEach((user) => {
      const last = user.last_active_at ?? user.updated_at ?? user.created_at;
      const lastTime = new Date(last ?? 0).getTime();
      if (!lastTime) return;
      const diffDays = Math.floor((now - lastTime) / (1000 * 60 * 60 * 24));
      if (diffDays >= 7) days7.push(user);
      if (diffDays >= 14) days14.push(user);
      if (diffDays >= 30) days30.push(user);
    });

    return { days7, days14, days30 };
  }, [users]);

  const caseTimeline = useMemo(() => {
    if (!userCaseData) return [];
    const attemptEvents = [
      ...userCaseData.reading.map((attempt) => ({
        type: 'Reading Attempt',
        date: attempt.submitted_at,
        detail: `Band ${formatBand(attempt.band_overall)} • Set ${attempt.set_id ?? '—'}`,
      })),
      ...userCaseData.listening.map((attempt) => ({
        type: 'Listening Attempt',
        date: attempt.submitted_at,
        detail: `Band ${formatBand(attempt.band_overall)} • Set ${attempt.set_id ?? '—'}`,
      })),
      ...userCaseData.writing.map((attempt) => ({
        type: 'Writing Attempt',
        date: attempt.submitted_at,
        detail: `Band ${formatBand(attempt.band_overall)} • Task ${attempt.task_id ?? '—'}`,
      })),
      ...userCaseData.speaking.map((attempt) => ({
        type: 'Speaking Attempt',
        date: attempt.submitted_at,
        detail: `Band ${formatBand(attempt.band_overall)} • Task ${attempt.task_id ?? '—'}`,
      })),
    ];

    const sessionEvents = userCaseData.sessions.map((session) => ({
      type: 'Session',
      date: session.created_at,
      detail: `Module ${session.module ?? session.module_type ?? '—'} • Status ${session.status ?? '—'}`,
    }));

    const violationEvents = userCaseData.violations.map((violation) => ({
      type: 'Violation',
      date: violation.occurred_at,
      detail: violation.reason ?? violation.code ?? violation.type ?? 'Violation logged',
    }));

    const auditEvents = userCaseData.audit.map((entry) => ({
      type: 'Admin Audit',
      date: entry.created_at,
      detail: entry.action ?? entry.event_type ?? 'Audit entry',
    }));

    return [...attemptEvents, ...sessionEvents, ...violationEvents, ...auditEvents]
      .filter((event) => event.date)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [userCaseData]);

  const progressSummary = useMemo(() => {
    if (!userCaseData) return [];
    const now = Date.now();
    const timeframes = [7, 30, 90];
    const skills = [
      { label: 'Reading', attempts: userCaseData.reading },
      { label: 'Listening', attempts: userCaseData.listening },
      { label: 'Writing', attempts: userCaseData.writing },
      { label: 'Speaking', attempts: userCaseData.speaking },
    ];

    const buildMetrics = (attempts: any[], days: number) => {
      const cutoff = now - days * 24 * 60 * 60 * 1000;
      const filtered = attempts.filter((attempt) => {
        const date = new Date(attempt.submitted_at ?? attempt.created_at ?? 0).getTime();
        return date >= cutoff;
      });
      const bands = filtered.map((attempt) => Number(attempt.band_overall)).filter((value) => !Number.isNaN(value));
      const average = bands.length ? bands.reduce((sum, value) => sum + value, 0) / bands.length : null;
      const variance = bands.length
        ? bands.reduce((sum, value) => sum + Math.pow(value - (average ?? 0), 2), 0) / bands.length
        : null;
      const stdDev = variance != null ? Math.sqrt(variance) : null;
      const consistency = stdDev != null && average ? Math.max(0, 100 - (stdDev / average) * 100) : null;
      return {
        count: filtered.length,
        average,
        consistency,
        bands,
      };
    };

    return skills.map((skill) => ({
      label: skill.label,
      timeframes: timeframes.map((days) => ({
        days,
        metrics: buildMetrics(skill.attempts, days),
      })),
    }));
  }, [userCaseData]);

  const userMembership = useMemo(() => {
    if (!userCaseData) return null;
    return getLatestMembership(userCaseData.memberships);
  }, [userCaseData]);

  const resolveAudioUrl = async (attempt: any) => {
    if (!attempt?.id) return;
    const key = String(attempt.id);
    if (audioUrlMap[key]) return;
    setAudioUrlMap((prev) => {
      if (prev[key]) return prev;
      if (!attempt.audio_url) {
        return { ...prev, [key]: { status: 'error' } };
      }
      return { ...prev, [key]: { status: 'loading' } };
    });

    if (!attempt.audio_url) return;
    if (attempt.audio_url.startsWith('http')) {
      setAudioUrlMap((prev) => ({ ...prev, [key]: { status: 'ready', url: attempt.audio_url } }));
      return;
    }

    const { data, error } = await supabase.storage.from('ielts-recordings').createSignedUrl(attempt.audio_url, 3600);
    if (error || !data?.signedUrl) {
      setAudioUrlMap((prev) => ({ ...prev, [key]: { status: 'error' } }));
      return;
    }
    setAudioUrlMap((prev) => ({ ...prev, [key]: { status: 'ready', url: data.signedUrl } }));
  };

  useEffect(() => {
    speakingAttempts.forEach((attempt) => {
      void resolveAudioUrl(attempt);
    });
  }, [speakingAttempts]);

  useEffect(() => {
    if (!userCaseData?.speaking?.length) return;
    userCaseData.speaking.forEach((attempt) => {
      void resolveAudioUrl(attempt);
    });
  }, [userCaseData?.speaking]);

  const paginated = <T,>(items: T[], page: number, pageSize: number) => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  };

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) => {
      const name = `${user.full_name ?? ''} ${user.username ?? ''} ${user.email ?? ''}`.toLowerCase();
      return name.includes(query) || (user.id ?? '').toLowerCase().includes(query);
    });
  }, [userSearch, users]);

  const filteredAttempts = useMemo(() => {
    const query = attemptSearch.trim().toLowerCase();
    return recentAttempts.filter((attempt) => {
      const matchesQuery =
        !query ||
        `${attempt.user_name ?? attempt.username ?? ''} ${attempt.user_id ?? ''}`.toLowerCase().includes(query);
      const matchesSkill =
        attemptSkillFilter === 'all' ||
        (attempt.skill ?? attempt.attempt_type ?? '').toLowerCase() === attemptSkillFilter;
      return matchesQuery && matchesSkill;
    });
  }, [attemptSearch, attemptSkillFilter, recentAttempts]);

  const filteredPrimeApps = useMemo(() => {
    const query = primeSearch.trim().toLowerCase();
    return primeApplications.filter((app) => {
      if (!query) return true;
      const haystack = `${app.full_name ?? ''} ${app.user_name ?? ''} ${app.user_id ?? ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [primeApplications, primeSearch]);

  const filteredNotifications = useMemo(() => {
    const query = notificationSearch.trim().toLowerCase();
    if (!query) return notificationPrefs;
    return notificationPrefs.filter((pref) => `${pref.user_id ?? ''}`.toLowerCase().includes(query));
  }, [notificationPrefs, notificationSearch]);

  const filteredViolations = useMemo(() => {
    const query = violationSearch.trim().toLowerCase();
    if (!query) return violations;
    return violations.filter((violation) => `${violation.user_id ?? ''}`.toLowerCase().includes(query));
  }, [violations, violationSearch]);

  const filteredAuditEntries = useMemo(() => {
    return auditEntries.filter((entry) => {
      if (auditFilters.action && !(entry.action ?? entry.event_type ?? '').toLowerCase().includes(auditFilters.action.toLowerCase())) {
        return false;
      }
      if (auditFilters.targetUser && !(entry.user_id ?? '').toLowerCase().includes(auditFilters.targetUser.toLowerCase())) {
        return false;
      }
      if (auditFilters.dateFrom) {
        const from = new Date(auditFilters.dateFrom).getTime();
        if (new Date(entry.created_at ?? 0).getTime() < from) return false;
      }
      if (auditFilters.dateTo) {
        const to = new Date(auditFilters.dateTo).getTime();
        if (new Date(entry.created_at ?? 0).getTime() > to) return false;
      }
      return true;
    });
  }, [auditEntries, auditFilters]);

  const resetGuardMatched = useMemo(() => {
    if (!selectedUser) return false;
    const candidate = resetConfirmText.trim().toLowerCase();
    if (!candidate) return false;
    return [selectedUser.username, selectedUser.email]
      .filter(Boolean)
      .some((value: string) => value.toLowerCase() === candidate);
  }, [resetConfirmText, selectedUser]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 justify-center">
        {NAV_SECTIONS.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            className={`px-4 py-2 rounded-lg font-semibold transition-all ${
              activeSection === section.id
                ? 'bg-gradient-to-r from-emerald-400 to-cyan-500 text-black'
                : 'bg-black/30 text-gray-400 hover:text-white border border-gray-600'
            }`}
          >
            {section.label}
          </button>
        ))}
      </div>

      <main className="flex-1 space-y-8 px-4 py-6 md:px-8">
        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {rpcMissing && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
            {rpcMissing}
          </div>
        )}

        {activeSection === 'overview' && (
          <section className="space-y-6">
            <header className="space-y-2">
              <h2 className="text-2xl font-semibold">Overview</h2>
              <p className="text-sm text-slate-400">IELTS monitoring snapshot and high-level operational stats.</p>
            </header>
            {sectionLoading.overview && (
              <div className="text-sm text-slate-400">Loading overview...</div>
            )}
            {stats ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard icon="👥" label="Total IELTS Users" value={stats.total_ielts_users || 0} color="cyan" />
                  <StatCard icon="⭐" label="Premium Users" value={premiumUserCount} color="yellow" />
                  <StatCard icon="📖" label="Reading Attempts" value={stats.total_reading_attempts || 0} color="blue" />
                  <StatCard icon="🎧" label="Listening Attempts" value={stats.total_listening_attempts || 0} color="purple" />
                  <StatCard icon="✍️" label="Writing Attempts" value={stats.total_writing_attempts || 0} color="green" />
                  <StatCard icon="🎤" label="Speaking Attempts" value={stats.total_speaking_attempts || 0} color="orange" />
                  <StatCard icon="📧" label="Email Notifs Requested" value={stats.email_notifications_requested || 0} color="pink" />
                  <StatCard icon="📱" label="SMS Notifs Requested" value={stats.sms_notifications_requested || 0} color="teal" />
                </div>
                <div className="rounded-2xl bg-slate-900 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Recent activity</h3>
                    <button className="text-sm text-cyan-400 hover:text-cyan-300" onClick={() => void loadSectionData('overview', true)}>
                      Refresh
                    </button>
                  </div>
                  <div className="mt-4 space-y-3">
                    {recentAttempts.slice(0, 6).map((attempt) => {
                      const userDisplay = formatUserDisplay(attempt.user_id, attempt.user_name ?? attempt.username);
                      return (
                        <div key={attempt.id} className="flex flex-col gap-1 rounded-xl border border-slate-800 px-3 py-2 text-sm md:flex-row md:items-center md:justify-between">
                          <div className="flex flex-col">
                            <span className="font-medium">{userDisplay.primary}</span>
                            {userDisplay.secondary && <span className="text-xs text-slate-500">{userDisplay.secondary}</span>}
                          </div>
                          <span className="text-slate-400">{attempt.skill ?? attempt.attempt_type}</span>
                          <span className="text-slate-400">Band {formatBand(attempt.est_band ?? attempt.band_overall)}</span>
                          <span className="text-slate-500">{formatDate(attempt.attempt_date ?? attempt.submitted_at)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-2xl bg-slate-900 p-6 text-sm text-slate-400">
                Load overview stats to get started.
              </div>
            )}
          </section>
        )}

        {activeSection === 'users' && (
          <section className="space-y-4">
            <header>
              <h2 className="text-2xl font-semibold">Users</h2>
              <p className="text-sm text-slate-400">Open a case file to manage IELTS-only operations.</p>
            </header>
            {sectionLoading.users && <div className="text-sm text-slate-400">Loading users...</div>}
            <div className="rounded-2xl bg-slate-900 p-4 space-y-4">
              <div className="flex flex-wrap gap-2">
                <input
                  className="flex-1 min-w-[240px] rounded-lg bg-slate-800 p-2 text-sm"
                  placeholder="Search by name, email, username, or ID"
                  value={userSearch}
                  onChange={(event) => {
                    setUserSearch(event.target.value);
                    setUserPage(1);
                  }}
                />
              </div>
              <div className="space-y-3">
                {paginated(filteredUsers, userPage, 20).map((user) => (
                  <button
                    key={user.id}
                    onClick={() => void loadUserCaseFile(user)}
                    className="flex w-full flex-col gap-2 rounded-xl border border-slate-800 p-3 text-left transition hover:border-cyan-400"
                  >
                    <span className="font-semibold">{user.full_name ?? user.username ?? 'IELTS user'}</span>
                    <span className="text-xs text-slate-400">{user.email ?? 'No email'} • Joined {formatDate(user.created_at)}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Showing {Math.min(filteredUsers.length, userPage * 20)} of {filteredUsers.length}</span>
                <div className="flex gap-2">
                  <button
                    className="rounded-full border border-slate-700 px-3 py-1"
                    disabled={userPage === 1}
                    onClick={() => setUserPage((prev) => Math.max(1, prev - 1))}
                  >
                    Prev
                  </button>
                  <button
                    className="rounded-full border border-slate-700 px-3 py-1"
                    disabled={userPage * 20 >= filteredUsers.length}
                    onClick={() => setUserPage((prev) => prev + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {activeSection === 'queues' && (
          <section className="space-y-6">
            <header>
              <h2 className="text-2xl font-semibold">Follow-up queues</h2>
              <p className="text-sm text-slate-400">Priority items requiring IELTS admin attention.</p>
            </header>
            {sectionLoading.queues && <div className="text-sm text-slate-400">Loading queues...</div>}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-slate-900 p-4">
                <h3 className="text-lg font-semibold">Prime applications pending</h3>
                <p className="text-sm text-slate-400">{pendingPrime.length} pending</p>
                <div className="mt-3 space-y-2 text-sm">
                  {pendingPrime.slice(0, 5).map((app) => (
                    <div key={app.id} className="rounded-xl border border-slate-800 p-2">
                      <p>{app.full_name ?? app.user_name ?? app.user_id}</p>
                      <p className="text-xs text-slate-400">{formatDate(app.created_at)}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl bg-slate-900 p-4">
                <h3 className="text-lg font-semibold">Ungraded writing</h3>
                <p className="text-sm text-slate-400">{ungradedWriting.length} waiting</p>
                <div className="mt-3 space-y-2 text-sm">
                  {ungradedWriting.slice(0, 5).map((attempt) => (
                    <div key={attempt.id} className="rounded-xl border border-slate-800 p-2">
                      <p>Attempt #{attempt.id}</p>
                      <p className="text-xs text-slate-400">{formatDate(attempt.submitted_at)}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl bg-slate-900 p-4">
                <h3 className="text-lg font-semibold">Ungraded speaking</h3>
                <p className="text-sm text-slate-400">{ungradedSpeaking.length} waiting</p>
                <div className="mt-3 space-y-2 text-sm">
                  {ungradedSpeaking.slice(0, 5).map((attempt) => (
                    <div key={attempt.id} className="rounded-xl border border-slate-800 p-2">
                      <p>Attempt #{attempt.id}</p>
                      <p className="text-xs text-slate-400">{formatDate(attempt.submitted_at)}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl bg-slate-900 p-4">
                <h3 className="text-lg font-semibold">Violations unresolved</h3>
                <p className="text-sm text-slate-400">{unresolvedViolations.length} items</p>
                <div className="mt-3 space-y-2 text-sm">
                  {unresolvedViolations.slice(0, 5).map((violation) => (
                    <div key={violation.id} className="rounded-xl border border-slate-800 p-2">
                      <p>{violation.reason ?? violation.code ?? violation.type ?? 'Violation'}</p>
                      <p className="text-xs text-slate-400">{formatDate(violation.occurred_at)}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl bg-slate-900 p-4">
                <h3 className="text-lg font-semibold">Inactive users</h3>
                <p className="text-sm text-slate-400">7d: {inactivityBuckets.days7.length} • 14d: {inactivityBuckets.days14.length} • 30d: {inactivityBuckets.days30.length}</p>
                <div className="mt-3 space-y-2 text-sm">
                  {inactivityBuckets.days30.slice(0, 5).map((user) => (
                    <div key={user.id} className="rounded-xl border border-slate-800 p-2">
                      <p>{user.full_name ?? user.username ?? user.id}</p>
                      <p className="text-xs text-slate-400">Last activity: 30+ days</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl bg-slate-900 p-4">
                <h3 className="text-lg font-semibold">Notifications pending</h3>
                <p className="text-sm text-slate-400">{pendingNotifications.length} pending</p>
                <div className="mt-3 space-y-2 text-sm">
                  {pendingNotifications.slice(0, 5).map((pref) => {
                    const userDisplay = formatUserDisplay(pref.user_id);
                    return (
                      <div key={pref.id} className="rounded-xl border border-slate-800 p-2">
                        <p>{userDisplay.primary}</p>
                        {userDisplay.secondary && <p className="text-[10px] text-slate-500">{userDisplay.secondary}</p>}
                        <p className="text-xs text-slate-400">{formatDate(pref.created_at)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        )}

        {activeSection === 'attempts' && (
          <section className="space-y-4">
            <header>
              <h2 className="text-2xl font-semibold">Attempts</h2>
              <p className="text-sm text-slate-400">Full IELTS attempt monitoring.</p>
            </header>
            {sectionLoading.attempts && <div className="text-sm text-slate-400">Loading attempts...</div>}
            <div className="rounded-2xl bg-slate-900 p-4 space-y-4">
              <div className="flex flex-wrap gap-2">
                <input
                  className="flex-1 min-w-[240px] rounded-lg bg-slate-800 p-2 text-sm"
                  placeholder="Search by user name or ID"
                  value={attemptSearch}
                  onChange={(event) => {
                    setAttemptSearch(event.target.value);
                    setAttemptPage(1);
                  }}
                />
                <select
                  className="rounded-lg bg-slate-800 p-2 text-sm"
                  value={attemptSkillFilter}
                  onChange={(event) => {
                    setAttemptSkillFilter(event.target.value);
                    setAttemptPage(1);
                  }}
                >
                  <option value="all">All skills</option>
                  <option value="reading">Reading</option>
                  <option value="listening">Listening</option>
                  <option value="writing">Writing</option>
                  <option value="speaking">Speaking</option>
                  <option value="mock">Mock</option>
                </select>
              </div>
              <div className="space-y-2 text-sm">
                {paginated(filteredAttempts, attemptPage, 20).map((attempt) => {
                  const userDisplay = formatUserDisplay(attempt.user_id, attempt.user_name ?? attempt.username);
                  return (
                    <div key={attempt.id} className="rounded-xl border border-slate-800 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-col">
                          <span className="font-semibold">{userDisplay.primary}</span>
                          {userDisplay.secondary && <span className="text-xs text-slate-500">{userDisplay.secondary}</span>}
                        </div>
                        <span className="text-slate-400">{attempt.skill ?? attempt.attempt_type}</span>
                        <span className="text-slate-400">Band {formatBand(attempt.est_band ?? attempt.band_overall)}</span>
                        <span className="text-slate-500">{formatDate(attempt.attempt_date ?? attempt.submitted_at)}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
                        <span>Raw score: {attempt.raw_score ?? '—'}/{attempt.total_questions ?? '—'}</span>
                        <span>Time: {formatDuration(attempt.time_spent_seconds)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Showing {Math.min(filteredAttempts.length, attemptPage * 20)} of {filteredAttempts.length}</span>
                <div className="flex gap-2">
                  <button className="rounded-full border border-slate-700 px-3 py-1" disabled={attemptPage === 1} onClick={() => setAttemptPage((prev) => Math.max(1, prev - 1))}>
                    Prev
                  </button>
                  <button className="rounded-full border border-slate-700 px-3 py-1" disabled={attemptPage * 20 >= filteredAttempts.length} onClick={() => setAttemptPage((prev) => prev + 1)}>
                    Next
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {activeSection === 'writing' && (
          <section className="space-y-4">
            <header>
              <h2 className="text-2xl font-semibold">Writing inbox</h2>
              <p className="text-sm text-slate-400">Review and grade writing submissions.</p>
            </header>
            {sectionLoading.writing && <div className="text-sm text-slate-400">Loading writing queue...</div>}
            <div className="rounded-2xl bg-slate-900 p-4">
              <div className="space-y-3">
                {ungradedWriting.slice(0, 20).map((attempt) => {
                  const userDisplay = formatUserDisplay(attempt.user_id);
                  return (
                    <div key={attempt.id} className="rounded-xl border border-slate-800 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold">Attempt #{attempt.id}</p>
                          <p className="text-xs text-slate-400">
                            User: <span className="text-slate-200">{userDisplay.primary}</span>
                          </p>
                          {userDisplay.secondary && <p className="text-[10px] text-slate-500">{userDisplay.secondary}</p>}
                        </div>
                        <button
                          className="rounded-full bg-cyan-500 px-4 py-1 text-sm font-semibold text-slate-900"
                          onClick={() => openGradeModal('writing', attempt)}
                        >
                          Grade
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">Submitted {formatDate(attempt.submitted_at)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {activeSection === 'speaking' && (
          <section className="space-y-4">
            <header>
              <h2 className="text-2xl font-semibold">Speaking inbox</h2>
              <p className="text-sm text-slate-400">Listen and grade speaking attempts.</p>
            </header>
            {sectionLoading.speaking && <div className="text-sm text-slate-400">Loading speaking queue...</div>}
            <div className="rounded-2xl bg-slate-900 p-4">
              <div className="space-y-3">
                {ungradedSpeaking.slice(0, 20).map((attempt) => {
                  const userDisplay = formatUserDisplay(attempt.user_id);
                  const audioState = audioUrlMap[String(attempt.id)];
                  return (
                    <div key={attempt.id} className="rounded-xl border border-slate-800 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold">Attempt #{attempt.id}</p>
                          <p className="text-xs text-slate-400">
                            User: <span className="text-slate-200">{userDisplay.primary}</span>
                          </p>
                          {userDisplay.secondary && <p className="text-[10px] text-slate-500">{userDisplay.secondary}</p>}
                        </div>
                        <button
                          className="rounded-full bg-cyan-500 px-4 py-1 text-sm font-semibold text-slate-900"
                          onClick={() => openGradeModal('speaking', attempt)}
                        >
                          Review
                        </button>
                      </div>
                      {attempt.audio_url ? (
                        audioState?.status === 'ready' ? (
                          <audio className="mt-2 w-full" controls src={audioState.url} />
                        ) : audioState?.status === 'error' ? (
                          <p className="mt-2 text-xs text-slate-400">Audio unavailable</p>
                        ) : (
                          <p className="mt-2 text-xs text-slate-400">Loading audio...</p>
                        )
                      ) : (
                        <p className="mt-2 text-xs text-slate-400">Audio unavailable</p>
                      )}
                      <p className="mt-2 text-xs text-slate-400">Submitted {formatDate(attempt.submitted_at)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {activeSection === 'prime' && (
          <section className="space-y-4">
            <header>
              <h2 className="text-2xl font-semibold">Prime operations</h2>
              <p className="text-sm text-slate-400">Approve/reject applications and manage memberships.</p>
            </header>
            {sectionLoading.prime && <div className="text-sm text-slate-400">Loading prime operations...</div>}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl bg-slate-900 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Prime applications</h3>
                  <input
                    className="rounded-lg bg-slate-800 p-2 text-xs"
                    placeholder="Search applicants"
                    value={primeSearch}
                    onChange={(event) => {
                      setPrimeSearch(event.target.value);
                      setPrimePage(1);
                    }}
                  />
                </div>
                <div className="mt-3 space-y-2">
                  {paginated(filteredPrimeApps, primePage, 10).map((application) => (
                    <div key={application.id} className="rounded-xl border border-slate-800 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold">{application.full_name ?? application.user_name ?? application.user_id}</p>
                          <p className="text-xs text-slate-400">Status: {application.status ?? 'unknown'}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs text-slate-400">{formatDate(application.created_at)}</p>
                          {application.status === 'pending' && (
                            <>
                              <button
                                className="rounded-full border border-emerald-400 px-3 py-1 text-xs text-emerald-200"
                                onClick={() => openPrimeApprovalModal(application)}
                              >
                                Approve
                              </button>
                              <button
                                className="rounded-full border border-red-400 px-3 py-1 text-xs text-red-200"
                                onClick={() => updatePrimeApplication(application.id, 'rejected')}
                              >
                                Reject
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                  <span>Showing {Math.min(filteredPrimeApps.length, primePage * 10)} of {filteredPrimeApps.length}</span>
                  <div className="flex gap-2">
                    <button className="rounded-full border border-slate-700 px-3 py-1" disabled={primePage === 1} onClick={() => setPrimePage((prev) => Math.max(1, prev - 1))}>
                      Prev
                    </button>
                    <button className="rounded-full border border-slate-700 px-3 py-1" disabled={primePage * 10 >= filteredPrimeApps.length} onClick={() => setPrimePage((prev) => prev + 1)}>
                      Next
                    </button>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl bg-slate-900 p-4 space-y-4">
                <div>
                  <h3 className="text-lg font-semibold">Membership manager</h3>
                  <p className="text-xs text-slate-400">Search a user to grant, extend, or revoke IELTS Prime access.</p>
                </div>
                <input
                  className="rounded-lg bg-slate-800 p-2 text-sm"
                  placeholder="Search by name, username, or email"
                  value={membershipSearch}
                  onChange={(event) => setMembershipSearch(event.target.value)}
                />
                {membershipSearch && (
                  <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-800">
                    {users
                      .filter((user) => {
                        const query = membershipSearch.toLowerCase();
                        const haystack = `${user.full_name ?? ''} ${user.username ?? ''} ${user.email ?? ''}`.toLowerCase();
                        return haystack.includes(query);
                      })
                      .slice(0, 6)
                      .map((user) => (
                        <button
                          key={user.id}
                          className="w-full border-b border-slate-800 px-3 py-2 text-left text-sm hover:bg-slate-800/60"
                          onClick={async () => {
                            setMembershipTarget(user);
                            await fetchMembershipHistory(user.id);
                            setMembershipSearch('');
                          }}
                        >
                          <div className="font-semibold">{user.full_name ?? user.username ?? user.id}</div>
                          <div className="text-xs text-slate-400">{user.email ?? 'No email'}</div>
                        </button>
                      ))}
                  </div>
                )}
                {membershipTarget ? (
                  <div className="rounded-xl border border-slate-800 p-3 text-sm space-y-3">
                    <div>
                      <p className="font-semibold">{membershipTarget.full_name ?? membershipTarget.username ?? membershipTarget.id}</p>
                      <p className="text-xs text-slate-400">{membershipTarget.email ?? 'No email'}</p>
                    </div>
                    <div className="rounded-lg bg-slate-950 p-3">
                      <p className="text-xs uppercase text-slate-400">Latest membership</p>
                      <p className="text-sm">{getLatestMembership(membershipHistory)?.plan ?? 'None'}</p>
                      <p className="text-xs text-slate-400">Expires: {formatDate(getLatestMembership(membershipHistory)?.expires_at)}</p>
                      <p className="text-xs text-slate-500">{formatCountdown(getLatestMembership(membershipHistory)?.expires_at)}</p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <label className="text-xs">
                        Plan
                        <select
                          className="mt-1 w-full rounded-lg bg-slate-800 p-2 text-sm"
                          value={membershipAction.plan}
                          onChange={(event) => setMembershipAction((prev) => ({ ...prev, plan: event.target.value }))}
                        >
                          <option value="monthly">Monthly</option>
                          <option value="quarterly">Quarterly</option>
                          <option value="annually">Annually</option>
                        </select>
                      </label>
                      <label className="text-xs">
                        Months
                        <input
                          type="number"
                          className="mt-1 w-full rounded-lg bg-slate-800 p-2 text-sm"
                          value={membershipAction.months}
                          onChange={(event) => setMembershipAction((prev) => ({ ...prev, months: Number(event.target.value) }))}
                        />
                      </label>
                      <label className="text-xs">
                        Revoke reason
                        <input
                          className="mt-1 w-full rounded-lg bg-slate-800 p-2 text-sm"
                          value={membershipAction.reason}
                          onChange={(event) => setMembershipAction((prev) => ({ ...prev, reason: event.target.value }))}
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button className="rounded-full bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-900" onClick={() => updateMembershipForUser(membershipTarget.id, 'grant')}>
                        Grant
                      </button>
                      <button className="rounded-full bg-slate-700 px-4 py-2 text-xs" onClick={() => updateMembershipForUser(membershipTarget.id, 'extend')}>
                        Extend
                      </button>
                      <button className="rounded-full bg-red-500 px-4 py-2 text-xs" onClick={() => updateMembershipForUser(membershipTarget.id, 'revoke')}>
                        Revoke
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">
                    Select a user to manage membership.
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {activeSection === 'notifications' && (
          <section className="space-y-4">
            <header>
              <h2 className="text-2xl font-semibold">Notification operations</h2>
              <p className="text-sm text-slate-400">Track delivery and mark messages as sent.</p>
            </header>
            {sectionLoading.notifications && <div className="text-sm text-slate-400">Loading notifications...</div>}
            <div className="rounded-2xl bg-slate-900 p-4 space-y-4">
              <input
                className="rounded-lg bg-slate-800 p-2 text-sm"
                placeholder="Search by user ID"
                value={notificationSearch}
                onChange={(event) => {
                  setNotificationSearch(event.target.value);
                  setNotificationPage(1);
                }}
              />
              <div className="space-y-3">
                {paginated(filteredNotifications, notificationPage, 15).map((pref) => {
                  const userDisplay = formatUserDisplay(pref.user_id);
                  return (
                    <div key={pref.id} className="rounded-xl border border-slate-800 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold">{userDisplay.primary}</p>
                          {userDisplay.secondary && <p className="text-[10px] text-slate-500">{userDisplay.secondary}</p>}
                          <p className="text-xs text-slate-400">Created {formatDate(pref.created_at)}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {pref.notify_by_email && !pref.email_sent_at && (
                            <button
                              className="rounded-full border border-cyan-500 px-3 py-1 text-xs text-cyan-200"
                              onClick={() => markNotificationSent(pref, 'email')}
                            >
                              Mark email sent
                            </button>
                          )}
                          {pref.notify_by_sms && !pref.sms_sent_at && (
                            <button
                              className="rounded-full border border-purple-500 px-3 py-1 text-xs text-purple-200"
                              onClick={() => markNotificationSent(pref, 'sms')}
                            >
                              Mark SMS sent
                            </button>
                          )}
                          {pref.show_in_app && !pref.in_app_shown_at && (
                            <button
                              className="rounded-full border border-emerald-500 px-3 py-1 text-xs text-emerald-200"
                              onClick={() => markNotificationSent(pref, 'in_app')}
                            >
                              Mark in-app sent
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Showing {Math.min(filteredNotifications.length, notificationPage * 15)} of {filteredNotifications.length}</span>
                <div className="flex gap-2">
                  <button className="rounded-full border border-slate-700 px-3 py-1" disabled={notificationPage === 1} onClick={() => setNotificationPage((prev) => Math.max(1, prev - 1))}>
                    Prev
                  </button>
                  <button className="rounded-full border border-slate-700 px-3 py-1" disabled={notificationPage * 15 >= filteredNotifications.length} onClick={() => setNotificationPage((prev) => prev + 1)}>
                    Next
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {activeSection === 'violations' && (
          <section className="space-y-4">
            <header>
              <h2 className="text-2xl font-semibold">Violations</h2>
              <p className="text-sm text-slate-400">Detailed per-user violation log and global feed.</p>
            </header>
            {sectionLoading.violations && <div className="text-sm text-slate-400">Loading violations...</div>}
            <div className="rounded-2xl bg-slate-900 p-4 space-y-4">
              <input
                className="rounded-lg bg-slate-800 p-2 text-sm"
                placeholder="Search by user ID"
                value={violationSearch}
                onChange={(event) => {
                  setViolationSearch(event.target.value);
                  setViolationPage(1);
                }}
              />
              <div className="space-y-2 text-sm">
                {paginated(filteredViolations, violationPage, 15).map((violation) => {
                  const userDisplay = formatUserDisplay(violation.user_id);
                  return (
                    <div key={violation.id} className="rounded-xl border border-slate-800 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-col">
                          <span className="font-semibold">{userDisplay.primary}</span>
                          {userDisplay.secondary && <span className="text-[10px] text-slate-500">{userDisplay.secondary}</span>}
                        </div>
                        <span className="text-slate-400">{violation.module ?? 'IELTS'}</span>
                        <span className="text-slate-400">{violation.reason ?? violation.code ?? violation.type}</span>
                        <span className="text-slate-500">{formatDate(violation.occurred_at)}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full bg-slate-800 px-2 py-1">Status: {violation.status ?? 'open'}</span>
                        <button
                          className="rounded-full border border-emerald-400 px-3 py-1 text-xs text-emerald-200"
                          onClick={() => updateViolationStatus(violation.id, 'resolved', violation.resolution_note ?? '')}
                        >
                          Resolve
                        </button>
                      </div>
                      {violation.metadata && (
                        <pre className="mt-2 max-h-24 overflow-auto rounded-lg bg-slate-950 p-2 text-xs text-slate-300">
                          {JSON.stringify(violation.metadata, null, 2)}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Showing {Math.min(filteredViolations.length, violationPage * 15)} of {filteredViolations.length}</span>
                <div className="flex gap-2">
                  <button className="rounded-full border border-slate-700 px-3 py-1" disabled={violationPage === 1} onClick={() => setViolationPage((prev) => Math.max(1, prev - 1))}>
                    Prev
                  </button>
                  <button className="rounded-full border border-slate-700 px-3 py-1" disabled={violationPage * 15 >= filteredViolations.length} onClick={() => setViolationPage((prev) => prev + 1)}>
                    Next
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {activeSection === 'audit' && (
          <section className="space-y-4">
            <header>
              <h2 className="text-2xl font-semibold">Audit log</h2>
              <p className="text-sm text-slate-400">Filter and inspect IELTS admin audit activity.</p>
            </header>
            {sectionLoading.audit && <div className="text-sm text-slate-400">Loading audit log...</div>}
            <div className="rounded-2xl bg-slate-900 p-4 space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <input
                  className="rounded-lg bg-slate-800 p-2 text-sm"
                  placeholder="Action"
                  value={auditFilters.action}
                  onChange={(event) => {
                    setAuditFilters((prev) => ({ ...prev, action: event.target.value }));
                    setAuditPage(1);
                  }}
                />
                <input
                  className="rounded-lg bg-slate-800 p-2 text-sm"
                  placeholder="Target user"
                  value={auditFilters.targetUser}
                  onChange={(event) => {
                    setAuditFilters((prev) => ({ ...prev, targetUser: event.target.value }));
                    setAuditPage(1);
                  }}
                />
                <input
                  type="date"
                  className="rounded-lg bg-slate-800 p-2 text-sm"
                  value={auditFilters.dateFrom}
                  onChange={(event) => {
                    setAuditFilters((prev) => ({ ...prev, dateFrom: event.target.value }));
                    setAuditPage(1);
                  }}
                />
                <input
                  type="date"
                  className="rounded-lg bg-slate-800 p-2 text-sm"
                  value={auditFilters.dateTo}
                  onChange={(event) => {
                    setAuditFilters((prev) => ({ ...prev, dateTo: event.target.value }));
                    setAuditPage(1);
                  }}
                />
              </div>
              <div className="space-y-2 text-sm">
                {paginated(filteredAuditEntries, auditPage, 15).map((entry) => {
                  const actorId = entry.actor_user_id ?? entry.actor_id ?? entry.admin_user_id ?? entry.actor ?? entry.created_by ?? null;
                  const targetId = entry.target_user_id ?? entry.user_id ?? entry.target_id ?? null;
                  const actorDisplay = formatUserDisplay(actorId);
                  const targetDisplay = formatUserDisplay(targetId);
                  return (
                    <div key={entry.id} className="rounded-xl border border-slate-800 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">{entry.action ?? entry.event_type ?? 'Action'}</span>
                        <div className="flex flex-col text-xs text-slate-400">
                          <span>
                            Actor: <span className="text-slate-200">{actorDisplay.primary}</span>
                          </span>
                          {actorDisplay.secondary && <span className="text-[10px] text-slate-500">{actorDisplay.secondary}</span>}
                        </div>
                        <div className="flex flex-col text-xs text-slate-400">
                          <span>
                            Target: <span className="text-slate-200">{targetDisplay.primary}</span>
                          </span>
                          {targetDisplay.secondary && <span className="text-[10px] text-slate-500">{targetDisplay.secondary}</span>}
                        </div>
                        <span className="text-xs text-slate-500">{formatDate(entry.created_at)}</span>
                      </div>
                      {entry.details && (
                        <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-slate-950 p-2 text-xs text-slate-300">
                          {JSON.stringify(entry.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Showing {Math.min(filteredAuditEntries.length, auditPage * 15)} of {filteredAuditEntries.length}</span>
                <div className="flex gap-2">
                  <button className="rounded-full border border-slate-700 px-3 py-1" disabled={auditPage === 1} onClick={() => setAuditPage((prev) => Math.max(1, prev - 1))}>
                    Prev
                  </button>
                  <button className="rounded-full border border-slate-700 px-3 py-1" disabled={auditPage * 15 >= filteredAuditEntries.length} onClick={() => setAuditPage((prev) => prev + 1)}>
                    Next
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {selectedUser && (
        <aside className="fixed inset-0 z-40 flex items-end justify-end bg-slate-950/70 backdrop-blur">
          <div className="h-full w-full max-w-4xl overflow-y-auto bg-slate-900 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase text-slate-400">User Case File</p>
                <h2 className="text-2xl font-semibold">{selectedUser.full_name ?? selectedUser.username ?? selectedUser.id}</h2>
                <p className="text-sm text-slate-400">{selectedUser.email ?? 'No email on file'}</p>
              </div>
              <button
                className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200"
                onClick={() => {
                  setSelectedUser(null);
                  setUserCaseData(null);
                }}
              >
                Close
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {USER_CASE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    userCaseTab === tab.id ? 'bg-cyan-500 text-slate-900' : 'bg-slate-800 text-slate-200'
                  }`}
                  onClick={() => setUserCaseTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {isCaseLoading && (
              <div className="mt-6 text-sm text-slate-400">Loading case file...</div>
            )}

            {!isCaseLoading && userCaseData && (
              <div className="mt-6 space-y-6">
                {userCaseTab === 'summary' && (
                  <section className="space-y-4">
                    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                      <h3 className="text-lg font-semibold">Identity</h3>
                      <dl className="mt-3 grid gap-2 text-sm">
                        <div className="flex justify-between"><dt className="text-slate-400">User ID</dt><dd>{selectedUser.id}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-400">Username</dt><dd>{selectedUser.username ?? '—'}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-400">Email</dt><dd>{selectedUser.email ?? '—'}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-400">Phone</dt><dd>{selectedUser.phone_number ?? selectedUser.phone ?? '—'}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-400">Tier</dt><dd>{selectedUser.current_tier ?? selectedUser.tier ?? selectedUser.subscription_tier ?? '—'}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-400">Membership</dt><dd>{userMembership?.plan ?? 'None'}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-400">Expires</dt><dd>{formatDate(userMembership?.expires_at)}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-400">Last activity</dt><dd>{formatDate(caseTimeline[0]?.date)}</dd></div>
                      </dl>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold">Reset progress</h3>
                        <button
                          className="rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-white"
                          onClick={() => setResetModalOpen(true)}
                        >
                          Reset
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">Choose scopes and confirm before resetting user progress.</p>
                    </div>
                  </section>
                )}

                {userCaseTab === 'timeline' && (
                  <section className="space-y-3">
                    {caseTimeline.map((event, index) => (
                      <div key={`${event.type}-${index}`} className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{event.type}</span>
                          <span className="text-slate-400">{formatDate(event.date)}</span>
                        </div>
                        <p className="mt-2 text-slate-300">{event.detail}</p>
                      </div>
                    ))}
                  </section>
                )}

                {userCaseTab === 'progress' && (
                  <section className="space-y-4">
                    <h3 className="text-lg font-semibold">Progress analytics</h3>
                    <div className="space-y-4">
                      {progressSummary.map((skill) => (
                        <div key={skill.label} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                          <p className="text-sm font-semibold text-slate-200">{skill.label}</p>
                          <div className="mt-3 grid gap-4 md:grid-cols-3">
                            {skill.timeframes.map((frame) => (
                              <div key={frame.days} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                                <div className="flex items-center justify-between">
                                  <p className="text-xs uppercase text-slate-400">Last {frame.days} days</p>
                                  <p className="text-xs text-slate-400">{frame.metrics.count} attempts</p>
                                </div>
                                <p className="mt-2 text-lg font-semibold">Avg band {formatBand(frame.metrics.average)}</p>
                                <p className="text-xs text-slate-400">Consistency {frame.metrics.consistency ? `${frame.metrics.consistency.toFixed(0)}%` : '—'}</p>
                                <div className="mt-2">
                                  <Sparkline values={frame.metrics.bands} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {userCaseTab === 'writing' && (
                  <section className="space-y-3">
                    {userCaseData.writing.map((attempt) => (
                      <div key={attempt.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">Attempt #{attempt.id}</span>
                          <button
                            className="rounded-full border border-cyan-400 px-3 py-1 text-xs"
                            onClick={() => openGradeModal('writing', attempt)}
                          >
                            {attempt.band_overall ? 'Update grade' : 'Grade'}
                          </button>
                        </div>
                        <p className="mt-2 text-slate-400">Submitted {formatDate(attempt.submitted_at)}</p>
                        <div className="mt-2 rounded-lg bg-slate-900 p-3">
                          <p className="text-xs uppercase text-slate-400">Answer</p>
                          <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-200">{attempt.answer_text ?? 'No answer captured.'}</pre>
                        </div>
                        <div className="mt-3 grid gap-2 text-xs text-slate-400">
                          <span>Band: {formatBand(attempt.band_overall)}</span>
                          <span>Graded at: {formatDate(attempt.graded_at)}</span>
                          {attempt.criteria && (
                            <pre className="rounded-lg bg-slate-900 p-2 text-xs text-slate-300">
                              {JSON.stringify(attempt.criteria, null, 2)}
                            </pre>
                          )}
                        </div>
                      </div>
                    ))}
                  </section>
                )}

                {userCaseTab === 'speaking' && (
                  <section className="space-y-3">
                    {userCaseData.speaking.map((attempt) => {
                      const audioState = audioUrlMap[String(attempt.id)];
                      return (
                        <div key={attempt.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">Attempt #{attempt.id}</span>
                            <button
                              className="rounded-full border border-cyan-400 px-3 py-1 text-xs"
                              onClick={() => openGradeModal('speaking', attempt)}
                            >
                              {attempt.band_overall ? 'Update grade' : 'Review'}
                            </button>
                          </div>
                          {attempt.audio_url ? (
                            audioState?.status === 'ready' ? (
                              <audio className="mt-2 w-full" controls src={audioState.url} />
                            ) : audioState?.status === 'error' ? (
                              <p className="mt-2 text-xs text-slate-400">Audio unavailable</p>
                            ) : (
                              <p className="mt-2 text-xs text-slate-400">Loading audio...</p>
                            )
                          ) : (
                            <p className="mt-2 text-xs text-slate-400">Audio unavailable</p>
                          )}
                          <p className="mt-2 text-slate-400">Submitted {formatDate(attempt.submitted_at)}</p>
                          <div className="mt-3 grid gap-1 text-xs text-slate-400">
                            <span>Band: {formatBand(attempt.band_overall)}</span>
                            <span>Fluency: {formatBand(attempt.band_fluency)}</span>
                            <span>Pronunciation: {formatBand(attempt.band_pronunciation)}</span>
                            <span>Lexical: {formatBand(attempt.band_lexical)}</span>
                            <span>Grammar: {formatBand(attempt.band_grammar)}</span>
                            <span>Graded at: {formatDate(attempt.graded_at)}</span>
                            {attempt.feedback && <span className="text-slate-300">Feedback: {attempt.feedback}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </section>
                )}

                {userCaseTab === 'prime' && (
                  <section className="space-y-4">
                    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                      <h3 className="text-lg font-semibold">Membership actions</h3>
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <label className="text-sm">
                          Plan
                          <select
                            className="mt-1 w-full rounded-lg bg-slate-800 p-2"
                            value={membershipAction.plan}
                            onChange={(event) => setMembershipAction((prev) => ({ ...prev, plan: event.target.value }))}
                          >
                            <option value="monthly">Monthly</option>
                            <option value="quarterly">Quarterly</option>
                            <option value="annually">Annually</option>
                          </select>
                        </label>
                        <label className="text-sm">
                          Months
                          <input
                            type="number"
                            className="mt-1 w-full rounded-lg bg-slate-800 p-2"
                            value={membershipAction.months}
                            onChange={(event) => setMembershipAction((prev) => ({ ...prev, months: Number(event.target.value) }))}
                          />
                        </label>
                        <label className="text-sm">
                          Revoke reason
                          <input
                            className="mt-1 w-full rounded-lg bg-slate-800 p-2"
                            value={membershipAction.reason}
                            onChange={(event) => setMembershipAction((prev) => ({ ...prev, reason: event.target.value }))}
                          />
                        </label>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button className="rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-900" onClick={() => updateMembershipForUser(selectedUser.id, 'grant')}>
                          Grant
                        </button>
                        <button className="rounded-full bg-slate-700 px-4 py-2 text-sm" onClick={() => updateMembershipForUser(selectedUser.id, 'extend')}>
                          Extend
                        </button>
                        <button className="rounded-full bg-red-500 px-4 py-2 text-sm" onClick={() => updateMembershipForUser(selectedUser.id, 'revoke')}>
                          Revoke
                        </button>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                      <h3 className="text-lg font-semibold">Prime applications</h3>
                      <div className="mt-3 space-y-2 text-sm">
                        {userCaseData.primeApplications.map((application) => (
                          <div key={application.id} className="rounded-xl border border-slate-800 p-3">
                            <div className="flex flex-wrap items-center justify-between">
                              <span>{application.status ?? 'unknown'}</span>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                                <span>{formatDate(application.created_at)}</span>
                                {application.status === 'pending' && (
                                  <>
                                    <button
                                      className="rounded-full border border-emerald-400 px-3 py-1 text-xs text-emerald-200"
                                      onClick={() => openPrimeApprovalModal(application)}
                                    >
                                      Approve
                                    </button>
                                    <button
                                      className="rounded-full border border-red-400 px-3 py-1 text-xs text-red-200"
                                      onClick={() => updatePrimeApplication(application.id, 'rejected')}
                                    >
                                      Reject
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                            <p className="text-xs text-slate-400">{application.notes ?? application.reason ?? '—'}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                      <h3 className="text-lg font-semibold">Membership history</h3>
                      <div className="mt-3 space-y-2 text-sm">
                        {userCaseData.memberships.map((membership) => (
                          <div key={membership.id} className="rounded-xl border border-slate-800 p-3">
                            <div className="flex flex-wrap items-center justify-between">
                              <span>{membership.plan ?? 'Plan'}</span>
                              <span className="text-slate-400">Expires {formatDate(membership.expires_at)}</span>
                            </div>
                            <p className="text-xs text-slate-500">{formatDate(membership.created_at)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>
                )}

                {userCaseTab === 'notes' && (
                  <section className="space-y-4">
                    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                      <h3 className="text-lg font-semibold">Tags</h3>
                      <p className="text-xs text-slate-400">Comma-separated tags</p>
                      <input
                        className="mt-2 w-full rounded-lg bg-slate-800 p-2 text-sm"
                        value={tagDraft}
                        onChange={(event) => setTagDraft(event.target.value)}
                        placeholder={(userCaseData.tags ?? []).join(', ')}
                      />
                      <button className="mt-3 rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-900" onClick={setUserTags}>
                        Save tags
                      </button>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                      <h3 className="text-lg font-semibold">Admin notes</h3>
                      <textarea
                        className="mt-2 w-full rounded-lg bg-slate-800 p-2 text-sm"
                        rows={3}
                        value={noteDraft}
                        onChange={(event) => setNoteDraft(event.target.value)}
                      />
                      <button className="mt-3 rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-900" onClick={addNote}>
                        Add note
                      </button>
                      <div className="mt-4 space-y-2 text-sm">
                        {userCaseData.notes.map((note) => (
                          <div key={note.id} className="rounded-xl border border-slate-800 p-3">
                            <div className="flex items-center justify-between">
                              <span>{note.note}</span>
                              <button className="text-xs text-red-400" onClick={() => deleteNote(note.id)}>Delete</button>
                            </div>
                            <p className="mt-2 text-xs text-slate-500">{formatDate(note.created_at)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>
                )}

                {userCaseTab === 'violations' && (
                  <section className="space-y-2">
                    {userCaseData.violations.map((violation) => (
                      <div key={violation.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{violation.reason ?? violation.code ?? violation.type}</span>
                          <span className="text-xs text-slate-400">{formatDate(violation.occurred_at)}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          <span className="rounded-full bg-slate-800 px-2 py-1">Status: {violation.status ?? 'open'}</span>
                          <button
                            className="rounded-full border border-emerald-400 px-3 py-1 text-xs text-emerald-200"
                            onClick={() => updateViolationStatus(violation.id, 'resolved', violation.resolution_note ?? '')}
                          >
                            Resolve
                          </button>
                        </div>
                        {violation.metadata && (
                          <pre className="mt-2 max-h-28 overflow-auto rounded-lg bg-slate-900 p-2 text-xs text-slate-300">
                            {JSON.stringify(violation.metadata, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </section>
                )}

                {userCaseTab === 'notifications' && (
                  <section className="space-y-2">
                    {userCaseData.notifications.map((pref) => (
                      <div key={pref.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold">Preference #{pref.id}</p>
                            <p className="text-xs text-slate-400">Created {formatDate(pref.created_at)}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {pref.notify_by_email && !pref.email_sent_at && (
                              <button className="rounded-full border border-cyan-400 px-3 py-1 text-xs" onClick={() => markNotificationSent(pref, 'email')}>
                                Mark email sent
                              </button>
                            )}
                            {pref.notify_by_sms && !pref.sms_sent_at && (
                              <button className="rounded-full border border-purple-400 px-3 py-1 text-xs" onClick={() => markNotificationSent(pref, 'sms')}>
                                Mark SMS sent
                              </button>
                            )}
                            {pref.show_in_app && !pref.in_app_shown_at && (
                              <button className="rounded-full border border-emerald-400 px-3 py-1 text-xs" onClick={() => markNotificationSent(pref, 'in_app')}>
                                Mark in-app sent
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="mt-2 grid gap-1 text-xs text-slate-400">
                          <span>Email sent: {formatDate(pref.email_sent_at)}</span>
                          <span>SMS sent: {formatDate(pref.sms_sent_at)}</span>
                          <span>In-app sent: {formatDate(pref.in_app_shown_at)}</span>
                        </div>
                      </div>
                    ))}
                  </section>
                )}

                {userCaseTab === 'audit' && (
                  <section className="space-y-2">
                    {userCaseData.audit.map((entry) => {
                      const actorId = entry.actor_user_id ?? entry.actor_id ?? entry.admin_user_id ?? entry.actor ?? entry.created_by ?? null;
                      const targetId = entry.target_user_id ?? entry.user_id ?? entry.target_id ?? null;
                      const actorDisplay = formatUserDisplay(actorId);
                      const targetDisplay = formatUserDisplay(targetId);
                      return (
                        <div key={entry.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">{entry.action ?? entry.event_type}</span>
                            <span className="text-xs text-slate-400">{formatDate(entry.created_at)}</span>
                          </div>
                          <div className="mt-2 grid gap-2 text-xs text-slate-400 md:grid-cols-2">
                            <div>
                              <span>
                                Actor: <span className="text-slate-200">{actorDisplay.primary}</span>
                              </span>
                              {actorDisplay.secondary && <div className="text-[10px] text-slate-500">{actorDisplay.secondary}</div>}
                            </div>
                            <div>
                              <span>
                                Target: <span className="text-slate-200">{targetDisplay.primary}</span>
                              </span>
                              {targetDisplay.secondary && <div className="text-[10px] text-slate-500">{targetDisplay.secondary}</div>}
                            </div>
                          </div>
                          {entry.details && (
                            <pre className="mt-2 max-h-28 overflow-auto rounded-lg bg-slate-900 p-2 text-xs text-slate-300">
                              {JSON.stringify(entry.details, null, 2)}
                            </pre>
                          )}
                        </div>
                      );
                    })}
                  </section>
                )}
              </div>
            )}
          </div>
        </aside>
      )}

      {resetModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-slate-900 p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Reset progress for {selectedUser.username ?? selectedUser.email}</h3>
              <button className="text-slate-400" onClick={() => setResetModalOpen(false)}>Close</button>
            </div>
            <div className="mt-4 grid gap-2 text-sm md:grid-cols-2">
              {Object.keys(resetScope).map((key) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={(resetScope as any)[key]}
                    onChange={(event) =>
                      setResetScope((prev) => ({ ...prev, [key]: event.target.checked }))
                    }
                  />
                  <span className="capitalize">{key}</span>
                </label>
              ))}
            </div>
            <div className="mt-4">
              <p className="text-xs text-slate-400">Type the user&apos;s username or email to confirm.</p>
              <input
                className="mt-2 w-full rounded-lg bg-slate-800 p-2 text-sm"
                value={resetConfirmText}
                onChange={(event) => setResetConfirmText(event.target.value)}
                placeholder="Enter username or email"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-full bg-slate-700 px-4 py-2 text-sm" onClick={() => setResetModalOpen(false)}>
                Cancel
              </button>
              <button
                className="rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                disabled={!resetGuardMatched}
                onClick={resetUserProgress}
              >
                Confirm reset
              </button>
            </div>
          </div>
        </div>
      )}

      {primeApprovalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Approve Prime application</h3>
              <button className="text-slate-400" onClick={() => setPrimeApprovalModal(null)}>Close</button>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-lg bg-slate-950 p-3 text-xs text-slate-300">
                {formatUserDisplay(primeApprovalModal.application.user_id, primeApprovalModal.application.full_name).primary}
              </div>
              <label className="text-xs">
                Plan
                <select
                  className="mt-1 w-full rounded-lg bg-slate-800 p-2 text-sm"
                  value={primeApprovalModal.plan}
                  onChange={(event) =>
                    setPrimeApprovalModal((prev) =>
                      prev
                        ? {
                            ...prev,
                            plan: event.target.value as 'monthly' | 'quarterly' | 'annually',
                            months: PRIME_PLAN_MONTHS[event.target.value] ?? prev.months,
                          }
                        : prev
                    )
                  }
                >
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annually">Annually</option>
                </select>
              </label>
              <label className="text-xs">
                Months
                <input
                  type="number"
                  min={1}
                  className="mt-1 w-full rounded-lg bg-slate-800 p-2 text-sm"
                  value={primeApprovalModal.months}
                  onChange={(event) =>
                    setPrimeApprovalModal((prev) =>
                      prev
                        ? {
                            ...prev,
                            months: Math.max(1, Number(event.target.value) || 1),
                          }
                        : prev
                    )
                  }
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-full bg-slate-700 px-4 py-2 text-sm" onClick={() => setPrimeApprovalModal(null)}>
                Cancel
              </button>
              <button
                className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900"
                onClick={approvePrimeApplication}
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {gradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-slate-900 p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{gradeModal.type === 'writing' ? 'Grade writing' : 'Grade speaking'} attempt</h3>
              <button className="text-slate-400" onClick={() => setGradeModal(null)}>Close</button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-sm">Overall band
                <input
                  className="mt-1 w-full rounded-lg bg-slate-800 p-2"
                  value={gradeForm.bandOverall}
                  onChange={(event) => setGradeForm((prev) => ({ ...prev, bandOverall: event.target.value }))}
                />
              </label>
              {gradeModal.type === 'speaking' && (
                <>
                  <label className="text-sm">Fluency
                    <input
                      className="mt-1 w-full rounded-lg bg-slate-800 p-2"
                      value={gradeForm.fluency}
                      onChange={(event) => setGradeForm((prev) => ({ ...prev, fluency: event.target.value }))}
                    />
                  </label>
                  <label className="text-sm">Pronunciation
                    <input
                      className="mt-1 w-full rounded-lg bg-slate-800 p-2"
                      value={gradeForm.pronunciation}
                      onChange={(event) => setGradeForm((prev) => ({ ...prev, pronunciation: event.target.value }))}
                    />
                  </label>
                  <label className="text-sm">Lexical
                    <input
                      className="mt-1 w-full rounded-lg bg-slate-800 p-2"
                      value={gradeForm.lexical}
                      onChange={(event) => setGradeForm((prev) => ({ ...prev, lexical: event.target.value }))}
                    />
                  </label>
                  <label className="text-sm">Grammar
                    <input
                      className="mt-1 w-full rounded-lg bg-slate-800 p-2"
                      value={gradeForm.grammar}
                      onChange={(event) => setGradeForm((prev) => ({ ...prev, grammar: event.target.value }))}
                    />
                  </label>
                </>
              )}
              {gradeModal.type === 'writing' && (
                <label className="text-sm md:col-span-2">Criteria JSON
                  <textarea
                    className="mt-1 w-full rounded-lg bg-slate-800 p-2"
                    rows={4}
                    value={gradeForm.criteria}
                    onChange={(event) => setGradeForm((prev) => ({ ...prev, criteria: event.target.value }))}
                  />
                </label>
              )}
              <label className="text-sm md:col-span-2">Feedback
                <textarea
                  className="mt-1 w-full rounded-lg bg-slate-800 p-2"
                  rows={4}
                  value={gradeForm.feedback}
                  onChange={(event) => setGradeForm((prev) => ({ ...prev, feedback: event.target.value }))}
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-full bg-slate-700 px-4 py-2 text-sm" onClick={() => setGradeModal(null)}>
                Cancel
              </button>
              <button
                className="rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-900"
                onClick={gradeModal.type === 'writing' ? submitWritingGrade : submitSpeakingGrade}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {toasts.length > 0 && (
        <div className="fixed right-6 top-6 z-50 space-y-2">
          {toasts.map((toast) => (
            <div key={toast.id} className={`rounded-xl px-4 py-3 text-sm shadow ${
              toast.type === 'success' ? 'bg-emerald-500/90' : toast.type === 'error' ? 'bg-red-500/90' : 'bg-slate-700/90'
            }`}>
              <div className="flex items-center justify-between gap-2">
                <span>{toast.message}</span>
                <button className="text-xs text-white" onClick={() => dismissToast(toast.id)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default IeltsAdminDashboard;
