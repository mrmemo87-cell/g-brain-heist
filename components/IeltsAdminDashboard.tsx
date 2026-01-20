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

type NavSection = typeof NAV_SECTIONS[number]['id'];

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
  { id: 'audit', label: 'Audit Trail' },
];

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

const formatBand = (value?: number | null) => (value ? value.toFixed(1) : '—');

const formatDuration = (seconds?: number | null) => {
  if (!seconds) return '—';
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
};

const getLatestMembership = (memberships: any[]) => {
  if (!memberships.length) return null;
  return [...memberships].sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())[0];
};

const IeltsAdminDashboard: React.FC = () => {
  const [activeSection, setActiveSection] = useState<NavSection>('overview');
  const [isLoading, setIsLoading] = useState(true);
  const [isCaseLoading, setIsCaseLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [rpcMissing, setRpcMissing] = useState<string | null>(null);

  const [stats, setStats] = useState<any>(null);
  const [recentAttempts, setRecentAttempts] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [writingAttempts, setWritingAttempts] = useState<any[]>([]);
  const [speakingAttempts, setSpeakingAttempts] = useState<any[]>([]);
  const [primeApplications, setPrimeApplications] = useState<any[]>([]);
  const [notificationPrefs, setNotificationPrefs] = useState<any[]>([]);
  const [violationLogs, setViolationLogs] = useState<any[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [memberships, setMemberships] = useState<any[]>([]);

  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [userCaseTab, setUserCaseTab] = useState<UserCaseTab>('summary');
  const [userCaseData, setUserCaseData] = useState<{
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
  } | null>(null);

  const [gradeModal, setGradeModal] = useState<{
    type: 'writing' | 'speaking';
    attempt: any;
  } | null>(null);

  const [gradeForm, setGradeForm] = useState({
    bandOverall: '',
    feedback: '',
    criteria: '{}',
    fluency: '',
    pronunciation: '',
    lexical: '',
    grammar: '',
  });

  const [noteDraft, setNoteDraft] = useState('');
  const [tagDraft, setTagDraft] = useState('');
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

  const [membershipAction, setMembershipAction] = useState({
    plan: 'monthly',
    months: 1,
    reason: '',
  });
  const [auditFilters, setAuditFilters] = useState({
    action: '',
    type: '',
    user: '',
  });

  const addToast = (message: string, type: Toast['type'] = 'info') => {
    setToasts((prev) => [...prev, { id: Date.now(), message, type }]);
  };

  const dismissToast = (id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const loadAdminData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [statsData, attemptsData, usersData] = await Promise.all([
        fetchIeltsAdminStats().catch(() => null),
        fetchIeltsRecentAttempts(200).catch(() => []),
        fetchAllIeltsUsers().catch(() => []),
      ]);

      setStats(statsData);
      setRecentAttempts(attemptsData);
      setUsers(usersData);

      const [writingData, speakingData, primeData, notificationData, violationData, auditData, membershipData] =
        await Promise.all([
          supabase.from('ielts_writing_attempts').select('*').order('submitted_at', { ascending: false }).limit(200),
          supabase.from('ielts_speaking_attempts').select('*').order('submitted_at', { ascending: false }).limit(200),
          supabase.from('ielts_prime_applications').select('*').order('created_at', { ascending: false }),
          supabase.from('ielts_notification_preferences').select('*').order('created_at', { ascending: false }),
          supabase.from('ielts_violation_logs').select('*').order('occurred_at', { ascending: false }).limit(200),
          supabase.from('ielts_admin_audit_log').select('*').order('created_at', { ascending: false }).limit(200),
          supabase.from('ielts_memberships').select('*').order('created_at', { ascending: false }),
        ]);

      setWritingAttempts(writingData.data ?? []);
      setSpeakingAttempts(speakingData.data ?? []);
      setPrimeApplications(primeData.data ?? []);
      setNotificationPrefs(notificationData.data ?? []);
      setViolationLogs(violationData.data ?? []);
      setAuditLog(auditData.data ?? []);
      setMemberships(membershipData.data ?? []);
    } catch (loadError) {
      console.error(loadError);
      setError('Unable to load IELTS admin data.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadUserCaseFile = async (user: any) => {
    setSelectedUser(user);
    setUserCaseTab('summary');
    setIsCaseLoading(true);
    setRpcMissing(null);

    try {
      const [reading, listening, writing, speaking, sessions, violations, notes, tags, membership, primeApps, notifications, audit] =
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
        violations: violations.data ?? [],
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

  useEffect(() => {
    void loadAdminData();
  }, []);

  const inactivityBuckets = useMemo(() => {
    const now = Date.now();
    const latestAttemptMap = new Map<string, number>();

    recentAttempts.forEach((attempt) => {
      if (!attempt.user_id || !attempt.attempt_date) return;
      const timestamp = new Date(attempt.attempt_date).getTime();
      const current = latestAttemptMap.get(attempt.user_id) ?? 0;
      if (timestamp > current) {
        latestAttemptMap.set(attempt.user_id, timestamp);
      }
    });

    const results = {
      days7: [] as any[],
      days14: [] as any[],
      days30: [] as any[],
    };

    users.forEach((user) => {
      const lastAttempt = latestAttemptMap.get(user.id);
      if (!lastAttempt) {
        results.days30.push(user);
        return;
      }
      const diffDays = (now - lastAttempt) / (1000 * 60 * 60 * 24);
      if (diffDays >= 30) {
        results.days30.push(user);
      } else if (diffDays >= 14) {
        results.days14.push(user);
      } else if (diffDays >= 7) {
        results.days7.push(user);
      }
    });

    return results;
  }, [recentAttempts, users]);

  const ungradedWriting = useMemo(
    () => writingAttempts.filter((attempt) => attempt.band_overall == null || attempt.feedback == null),
    [writingAttempts],
  );

  const ungradedSpeaking = useMemo(
    () => speakingAttempts.filter((attempt) => attempt.band_overall == null),
    [speakingAttempts],
  );

  const pendingNotifications = useMemo(
    () =>
      notificationPrefs.filter((pref) =>
        (pref.notify_by_email && !pref.email_sent_at) ||
        (pref.notify_by_sms && !pref.sms_sent_at) ||
        (pref.show_in_app && !pref.in_app_shown_at)
      ),
    [notificationPrefs],
  );

  const pendingPrime = useMemo(
    () => primeApplications.filter((application) => application.status === 'pending'),
    [primeApplications],
  );

  const unresolvedViolations = useMemo(
    () => violationLogs.filter((violation) => !violation.status || violation.status !== 'resolved'),
    [violationLogs],
  );

  const filteredAuditLog = useMemo(() => {
    return auditLog.filter((entry) => {
      const actionMatch = auditFilters.action
        ? (entry.action ?? entry.event_type ?? '').toLowerCase().includes(auditFilters.action.toLowerCase())
        : true;
      const typeMatch = auditFilters.type
        ? (entry.event_type ?? entry.action ?? '').toLowerCase().includes(auditFilters.type.toLowerCase())
        : true;
      const userMatch = auditFilters.user
        ? (entry.user_id ?? '').toLowerCase().includes(auditFilters.user.toLowerCase())
        : true;
      return actionMatch && typeMatch && userMatch;
    });
  }, [auditLog, auditFilters]);

  const handleRpc = async (name: string, payload: Record<string, any>) => {
    setRpcMissing(null);
    const { data, error } = await supabase.rpc(name, payload);
    if (error) {
      if (isMissingRpc(error)) {
        setRpcMissing('Backend RPC missing');
        addToast('Backend RPC missing', 'error');
        return null;
      }
      addToast(error.message, 'error');
      return null;
    }
    return data;
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
      await loadAdminData();
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
      await loadAdminData();
      if (selectedUser) {
        await loadUserCaseFile(selectedUser);
      }
    }
  };

  const setUserTags = async () => {
    if (!selectedUser) return;
    const tags = tagDraft.split(',').map((tag) => tag.trim()).filter(Boolean);
    const result = await handleRpc('admin_ielts_set_user_tags', {
      user_id: selectedUser.id,
      tags,
    });
    if (result) {
      addToast('Tags updated.', 'success');
      setTagDraft('');
      await loadUserCaseFile(selectedUser);
    }
  };

  const addNote = async () => {
    if (!selectedUser || !noteDraft.trim()) return;
    const result = await handleRpc('admin_ielts_add_note', {
      user_id: selectedUser.id,
      note: noteDraft.trim(),
    });
    if (result) {
      addToast('Note added.', 'success');
      setNoteDraft('');
      await loadUserCaseFile(selectedUser);
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

  const updateMembership = async (action: 'grant' | 'extend' | 'revoke') => {
    if (!selectedUser) return;
    const payload =
      action === 'grant'
        ? { user_id: selectedUser.id, plan: membershipAction.plan, months: membershipAction.months }
        : action === 'extend'
          ? { user_id: selectedUser.id, months: membershipAction.months }
          : { user_id: selectedUser.id, reason: membershipAction.reason || 'Admin revoked' };

    const rpcName =
      action === 'grant'
        ? 'admin_ielts_membership_grant'
        : action === 'extend'
          ? 'admin_ielts_membership_extend'
          : 'admin_ielts_membership_revoke';

    const result = await handleRpc(rpcName, payload);
    if (result) {
      addToast(`Membership ${action}ed.`, 'success');
      await loadAdminData();
      if (selectedUser) {
        await loadUserCaseFile(selectedUser);
      }
    }
  };

  const resetUserProgress = async () => {
    if (!selectedUser) return;
    const result = await handleRpc('admin_ielts_reset_progress', {
      user_id: selectedUser.id,
      reset_scope: resetScope,
    });
    if (result) {
      addToast('Progress reset queued.', 'success');
      await loadUserCaseFile(selectedUser);
    }
  };

  const markNotificationSent = async (pref: any, channel: 'email' | 'sms' | 'in_app') => {
    const result = await handleRpc('admin_ielts_mark_notification_sent', {
      pref_id: pref.id,
      channel,
    });
    if (result) {
      addToast('Notification marked sent.', 'success');
      await loadAdminData();
      if (selectedUser) {
        await loadUserCaseFile(selectedUser);
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
    await loadAdminData();
    if (selectedUser) {
      await loadUserCaseFile(selectedUser);
    }
  };

  const openGradeModal = (type: 'writing' | 'speaking', attempt: any) => {
    setGradeModal({ type, attempt });
    setGradeForm({
      bandOverall: attempt.band_overall ?? '',
      feedback: attempt.feedback ?? '',
      criteria: JSON.stringify(attempt.criteria ?? {}, null, 2),
      fluency: attempt.band_fluency ?? '',
      pronunciation: attempt.band_pronunciation ?? '',
      lexical: attempt.band_lexical ?? '',
      grammar: attempt.band_grammar ?? '',
    });
  };

  const userMembership = selectedUser
    ? getLatestMembership(userCaseData?.memberships ?? memberships.filter((row) => row.user_id === selectedUser.id))
    : null;

  const caseTimeline = useMemo(() => {
    if (!userCaseData) return [];
    const events = [
      ...userCaseData.reading.map((item) => ({ type: 'Reading', date: item.submitted_at ?? item.created_at, detail: `Set ${item.set_id ?? ''}` })),
      ...userCaseData.listening.map((item) => ({ type: 'Listening', date: item.submitted_at ?? item.created_at, detail: `Set ${item.set_id ?? ''}` })),
      ...userCaseData.writing.map((item) => ({ type: 'Writing', date: item.submitted_at ?? item.created_at, detail: `Task ${item.task_id ?? ''}` })),
      ...userCaseData.speaking.map((item) => ({ type: 'Speaking', date: item.submitted_at ?? item.created_at, detail: `Task ${item.task_id ?? ''}` })),
      ...userCaseData.sessions.map((item) => ({ type: 'Session', date: item.created_at, detail: item.reference_code ?? item.id })),
      ...userCaseData.violations.map((item) => ({ type: 'Violation', date: item.occurred_at, detail: item.reason ?? item.code ?? item.type })),
      ...userCaseData.audit.map((item) => ({ type: 'Admin', date: item.created_at, detail: item.action ?? item.event_type ?? 'Action' })),
    ];
    return events.sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime());
  }, [userCaseData]);

  const progressSummary = useMemo(() => {
    if (!userCaseData) return null;
    const entries = [
      { label: 'Reading', attempts: userCaseData.reading, bandKey: 'band_overall' },
      { label: 'Listening', attempts: userCaseData.listening, bandKey: 'band_overall' },
      { label: 'Writing', attempts: userCaseData.writing, bandKey: 'band_overall' },
      { label: 'Speaking', attempts: userCaseData.speaking, bandKey: 'band_overall' },
    ];

    return entries.map((entry) => {
      const bands = entry.attempts.map((attempt: any) => attempt[entry.bandKey]).filter((band: any) => band != null);
      const times = entry.attempts
        .map((attempt: any) => attempt.time_spent_seconds ?? attempt.time_spent ?? null)
        .filter((value: any) => value != null);
      const average = bands.length ? bands.reduce((acc: number, value: number) => acc + value, 0) / bands.length : null;
      const variance = bands.length
        ? bands.reduce((acc: number, value: number) => acc + Math.pow(value - (average ?? 0), 2), 0) / bands.length
        : null;
      const consistency = variance != null ? Math.max(0, 100 - Math.sqrt(variance) * 20) : null;
      const averageTime = times.length ? times.reduce((acc: number, value: number) => acc + value, 0) / times.length : null;
      return {
        label: entry.label,
        average,
        consistency,
        count: entry.attempts.length,
        lastFive: entry.attempts.slice(0, 5),
        averageTime,
      };
    });
  }, [userCaseData]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="animate-pulse text-lg font-semibold">Loading IELTS Admin Portal...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="flex flex-col lg:flex-row">
        <nav className="sticky top-0 z-30 w-full border-b border-slate-800 bg-slate-950/95 p-4 backdrop-blur lg:h-screen lg:w-64 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between lg:flex-col lg:items-start lg:gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">IELTS Admin</p>
              <h1 className="text-xl font-semibold">Operations Portal</h1>
            </div>
            <div className="flex flex-wrap gap-2 lg:flex-col">
              {NAV_SECTIONS.map((section) => (
                <button
                  key={section.id}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    activeSection === section.id
                      ? 'bg-cyan-500 text-slate-900'
                      : 'bg-slate-900 text-slate-200 hover:bg-slate-800'
                  }`}
                  onClick={() => setActiveSection(section.id)}
                >
                  {section.label}
                </button>
              ))}
            </div>
          </div>
        </nav>

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
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl bg-slate-900 p-4 shadow">
                  <p className="text-xs uppercase text-slate-400">Total Users</p>
                  <p className="text-2xl font-semibold">{stats?.total_users ?? users.length}</p>
                </div>
                <div className="rounded-2xl bg-slate-900 p-4 shadow">
                  <p className="text-xs uppercase text-slate-400">Active Attempts</p>
                  <p className="text-2xl font-semibold">{stats?.total_attempts ?? recentAttempts.length}</p>
                </div>
                <div className="rounded-2xl bg-slate-900 p-4 shadow">
                  <p className="text-xs uppercase text-slate-400">Prime Members</p>
                  <p className="text-2xl font-semibold">{stats?.prime_members ?? memberships.length}</p>
                </div>
              </div>
              <div className="rounded-2xl bg-slate-900 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Recent activity</h3>
                  <button className="text-sm text-cyan-400 hover:text-cyan-300" onClick={loadAdminData}>
                    Refresh
                  </button>
                </div>
                <div className="mt-4 space-y-3">
                  {recentAttempts.slice(0, 6).map((attempt) => (
                    <div key={attempt.id} className="flex flex-col gap-1 rounded-xl border border-slate-800 px-3 py-2 text-sm md:flex-row md:items-center md:justify-between">
                      <span className="font-medium">{attempt.user_name ?? attempt.username ?? attempt.user_id}</span>
                      <span className="text-slate-400">{attempt.skill ?? attempt.attempt_type}</span>
                      <span className="text-slate-400">Band {formatBand(attempt.est_band ?? attempt.band_overall)}</span>
                      <span className="text-slate-500">{formatDate(attempt.attempt_date ?? attempt.submitted_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {activeSection === 'users' && (
            <section className="space-y-4">
              <header>
                <h2 className="text-2xl font-semibold">Users</h2>
                <p className="text-sm text-slate-400">Open a case file to manage IELTS-only operations.</p>
              </header>
              <div className="rounded-2xl bg-slate-900 p-4">
                <div className="space-y-3">
                  {users.slice(0, 50).map((user) => (
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
              </div>
            </section>
          )}

          {activeSection === 'queues' && (
            <section className="space-y-6">
              <header>
                <h2 className="text-2xl font-semibold">Follow-up queues</h2>
                <p className="text-sm text-slate-400">Priority items requiring IELTS admin attention.</p>
              </header>
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
                    {pendingNotifications.slice(0, 5).map((pref) => (
                      <div key={pref.id} className="rounded-xl border border-slate-800 p-2">
                        <p>{pref.user_id}</p>
                        <p className="text-xs text-slate-400">{formatDate(pref.created_at)}</p>
                      </div>
                    ))}
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
              <div className="rounded-2xl bg-slate-900 p-4">
                <div className="space-y-2 text-sm">
                  {recentAttempts.map((attempt) => (
                    <div key={attempt.id} className="rounded-xl border border-slate-800 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">{attempt.user_name ?? attempt.username ?? attempt.user_id}</span>
                        <span className="text-slate-400">{attempt.skill ?? attempt.attempt_type}</span>
                        <span className="text-slate-400">Band {formatBand(attempt.est_band ?? attempt.band_overall)}</span>
                        <span className="text-slate-500">{formatDate(attempt.attempt_date ?? attempt.submitted_at)}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
                        <span>Raw score: {attempt.raw_score ?? '—'}/{attempt.total_questions ?? '—'}</span>
                        <span>Time: {formatDuration(attempt.time_spent_seconds)}</span>
                      </div>
                    </div>
                  ))}
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
              <div className="rounded-2xl bg-slate-900 p-4">
                <div className="space-y-3">
                  {ungradedWriting.map((attempt) => (
                    <div key={attempt.id} className="rounded-xl border border-slate-800 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold">Attempt #{attempt.id}</p>
                          <p className="text-xs text-slate-400">User: {attempt.user_id}</p>
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
                  ))}
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
              <div className="rounded-2xl bg-slate-900 p-4">
                <div className="space-y-3">
                  {ungradedSpeaking.map((attempt) => (
                    <div key={attempt.id} className="rounded-xl border border-slate-800 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold">Attempt #{attempt.id}</p>
                          <p className="text-xs text-slate-400">User: {attempt.user_id}</p>
                        </div>
                        <button
                          className="rounded-full bg-cyan-500 px-4 py-1 text-sm font-semibold text-slate-900"
                          onClick={() => openGradeModal('speaking', attempt)}
                        >
                          Review
                        </button>
                      </div>
                      {attempt.audio_url && (
                        <audio className="mt-2 w-full" controls src={attempt.audio_url.startsWith('http') ? attempt.audio_url : `/storage/v1/object/public/ielts-recordings/${attempt.audio_url}`} />
                      )}
                      <p className="mt-2 text-xs text-slate-400">Submitted {formatDate(attempt.submitted_at)}</p>
                    </div>
                  ))}
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
              <div className="rounded-2xl bg-slate-900 p-4">
                <h3 className="text-lg font-semibold">Prime applications</h3>
                <div className="mt-3 space-y-2">
                  {primeApplications.map((application) => (
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
                                onClick={() => updatePrimeApplication(application.id, 'approved')}
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
              </div>
            </section>
          )}

          {activeSection === 'notifications' && (
            <section className="space-y-4">
              <header>
                <h2 className="text-2xl font-semibold">Notification operations</h2>
                <p className="text-sm text-slate-400">Track delivery and mark messages as sent.</p>
              </header>
              <div className="rounded-2xl bg-slate-900 p-4">
                <div className="space-y-3">
                  {notificationPrefs.map((pref) => (
                    <div key={pref.id} className="rounded-xl border border-slate-800 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold">User {pref.user_id}</p>
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
                  ))}
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
              <div className="rounded-2xl bg-slate-900 p-4">
                <div className="space-y-2 text-sm">
                  {violationLogs.map((violation) => (
                    <div key={violation.id} className="rounded-xl border border-slate-800 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">{violation.user_id}</span>
                        <span className="text-slate-400">{violation.module ?? 'IELTS'}</span>
                        <span className="text-slate-400">{violation.reason ?? violation.code ?? violation.type}</span>
                        <span className="text-slate-500">{formatDate(violation.occurred_at)}</span>
                      </div>
                      {violation.metadata && (
                        <pre className="mt-2 max-h-24 overflow-auto rounded-lg bg-slate-950 p-2 text-xs text-slate-300">
                          {JSON.stringify(violation.metadata, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {activeSection === 'audit' && (
            <section className="space-y-4">
              <header>
                <h2 className="text-2xl font-semibold">Audit log</h2>
                <p className="text-sm text-slate-400">Every IELTS admin action recorded.</p>
              </header>
              <div className="rounded-2xl bg-slate-900 p-4">
                <div className="mb-4 grid gap-3 text-sm md:grid-cols-3">
                  <input
                    className="rounded-lg bg-slate-800 p-2"
                    placeholder="Filter by action"
                    value={auditFilters.action}
                    onChange={(event) => setAuditFilters((prev) => ({ ...prev, action: event.target.value }))}
                  />
                  <input
                    className="rounded-lg bg-slate-800 p-2"
                    placeholder="Filter by type"
                    value={auditFilters.type}
                    onChange={(event) => setAuditFilters((prev) => ({ ...prev, type: event.target.value }))}
                  />
                  <input
                    className="rounded-lg bg-slate-800 p-2"
                    placeholder="Filter by user"
                    value={auditFilters.user}
                    onChange={(event) => setAuditFilters((prev) => ({ ...prev, user: event.target.value }))}
                  />
                </div>
                <div className="space-y-2 text-sm">
                  {filteredAuditLog.map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-slate-800 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">{entry.admin_name ?? entry.admin_id ?? 'Admin'}</span>
                        <span className="text-slate-400">{entry.action ?? entry.event_type ?? 'Action'}</span>
                        <span className="text-slate-400">User: {entry.user_id ?? '—'}</span>
                        <span className="text-slate-500">{formatDate(entry.created_at)}</span>
                      </div>
                      {entry.details && (
                        <pre className="mt-2 max-h-24 overflow-auto rounded-lg bg-slate-950 p-2 text-xs text-slate-300">
                          {JSON.stringify(entry.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </main>
      </div>

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
                        <div className="flex justify-between"><dt className="text-slate-400">Membership</dt><dd>{userMembership?.plan ?? 'None'}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-400">Expires</dt><dd>{formatDate(userMembership?.expires_at)}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-400">Last activity</dt><dd>{formatDate(caseTimeline[0]?.date)}</dd></div>
                      </dl>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                      <h3 className="text-lg font-semibold">Reset progress</h3>
                      <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
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
                      <button
                        className="mt-4 rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-white"
                        onClick={resetUserProgress}
                      >
                        Confirm reset
                      </button>
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
                    <div className="grid gap-4 md:grid-cols-2">
                      {progressSummary?.map((summary) => (
                        <div key={summary.label} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                          <p className="text-sm uppercase text-slate-400">{summary.label}</p>
                          <p className="text-2xl font-semibold">Avg Band {formatBand(summary.average)}</p>
                          <p className="text-xs text-slate-400">Consistency {summary.consistency ? `${summary.consistency.toFixed(0)}%` : '—'}</p>
                          <p className="text-xs text-slate-400">Avg time {formatDuration(summary.averageTime)}</p>
                          <p className="text-xs text-slate-500">Attempts {summary.count}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {summary.lastFive.map((attempt: any) => (
                              <span key={attempt.id} className="rounded-full bg-slate-800 px-3 py-1 text-xs">
                                {formatBand(attempt.band_overall)} • {formatDate(attempt.submitted_at)}
                              </span>
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
                            Grade
                          </button>
                        </div>
                        <p className="mt-2 text-slate-400">Submitted {formatDate(attempt.submitted_at)}</p>
                      </div>
                    ))}
                  </section>
                )}

                {userCaseTab === 'speaking' && (
                  <section className="space-y-3">
                    {userCaseData.speaking.map((attempt) => (
                      <div key={attempt.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">Attempt #{attempt.id}</span>
                          <button
                            className="rounded-full border border-cyan-400 px-3 py-1 text-xs"
                            onClick={() => openGradeModal('speaking', attempt)}
                          >
                            Review
                          </button>
                        </div>
                        {attempt.audio_url && (
                          <audio className="mt-2 w-full" controls src={attempt.audio_url.startsWith('http') ? attempt.audio_url : `/storage/v1/object/public/ielts-recordings/${attempt.audio_url}`} />
                        )}
                        <p className="mt-2 text-slate-400">Submitted {formatDate(attempt.submitted_at)}</p>
                      </div>
                    ))}
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
                        <button className="rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-900" onClick={() => updateMembership('grant')}>
                          Grant
                        </button>
                        <button className="rounded-full bg-slate-700 px-4 py-2 text-sm" onClick={() => updateMembership('extend')}>
                          Extend
                        </button>
                        <button className="rounded-full bg-red-500 px-4 py-2 text-sm" onClick={() => updateMembership('revoke')}>
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
                                      onClick={() => updatePrimeApplication(application.id, 'approved')}
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
                      </div>
                    ))}
                  </section>
                )}

                {userCaseTab === 'audit' && (
                  <section className="space-y-2">
                    {userCaseData.audit.map((entry) => (
                      <div key={entry.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{entry.action ?? entry.event_type}</span>
                          <span className="text-xs text-slate-400">{formatDate(entry.created_at)}</span>
                        </div>
                        {entry.details && (
                          <pre className="mt-2 max-h-28 overflow-auto rounded-lg bg-slate-900 p-2 text-xs text-slate-300">
                            {JSON.stringify(entry.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </section>
                )}
              </div>
            )}
          </div>
        </aside>
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
