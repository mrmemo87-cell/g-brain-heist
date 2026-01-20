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

type IeltsSubTab = 'overview' | 'attempts' | 'users' | 'content' | 'notifications' | 'prime' | 'violations';

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
  const [violations, setViolations] = useState<any[]>([]);
  
  // Filters
  const [skillFilter, setSkillFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});
  const [statusUpdates, setStatusUpdates] = useState<Record<string, string>>({});
  
  // Modal states for Answers and Reports
  const [selectedAttempt, setSelectedAttempt] = useState<any>(null);
  const [showAnswerModal, setShowAnswerModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  const notificationColumns = {
    emailSent: notifications.some(n => Object.prototype.hasOwnProperty.call(n, 'email_sent_at')),
    smsSent: notifications.some(n => Object.prototype.hasOwnProperty.call(n, 'sms_sent_at')),
    inAppShown: notifications.some(n => Object.prototype.hasOwnProperty.call(n, 'in_app_shown_at')),
  };

  const fetchViolationLogs = async () => {
    const { data, error } = await supabase.rpc('admin_ielts_violation_logs');
    if (error) {
      console.error('Error loading violation logs:', error);
      return [];
    }
    return data || [];
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadAdminData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Load notification preferences separately to handle errors
      let notifData: any[] = [];
      try {
        const notifResult = await supabase
          .from('ielts_notification_preferences')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);
        notifData = notifResult.error ? [] : (notifResult.data || []);
      } catch {
        notifData = [];
      }

      // Load prime applications
      let appsData: any[] = [];
      try {
        const appsResult = await supabase
          .from('ielts_prime_applications')
          .select('*')
          .order('created_at', { ascending: false });
        appsData = appsResult.error ? [] : (appsResult.data || []);
        console.log('Prime applications loaded:', appsData.length, appsResult.error);
      } catch (e) {
        console.error('Error loading prime applications:', e);
        appsData = [];
      }

      // Load stats, attempts, users, and content in parallel
      const [statsData, attemptsData, usersData, contentData, violationsData] = await Promise.all([
        fetchIeltsAdminStats().catch(() => null),
        fetchIeltsRecentAttempts(200).catch(() => []),
        fetchAllIeltsUsers().catch(() => []),
        fetchIeltsContent().catch(() => null),
        fetchViolationLogs().catch(() => []),
      ]);

      setStats(statsData);
      setRecentAttempts(attemptsData);
      setUsers(usersData);
      setContent(contentData);
      setNotifications(notifData);
      setPrimeApplications(appsData);
      setViolations(violationsData);
    } catch (error) {
      console.error('Error loading IELTS admin data:', error);
      addToast('Failed to load IELTS data', 'error');
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

  const formatViolationDate = (value: string | number | null) => {
    if (!value) return '-';
    const d = typeof value === 'number' ? new Date(value) : new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatViolationDate = (value: string | number | null) => {
    if (!value) return '-';
    const d = typeof value === 'number' ? new Date(value) : new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatTime = (seconds: number) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
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

  const updateViolationStatus = async (violationId: string, status: string, resolutionNote?: string) => {
    const { error } = await supabase.rpc('admin_ielts_violation_set_status', {
      p_violation_id: violationId,
      p_status: status,
      p_resolution_note: resolutionNote ?? null,
    });

    if (error) {
      console.error('Error updating violation status:', error);
      addToast('Failed to update violation status', 'error');
      return;
    }
    addToast(`Violation marked as ${status}`, 'success');
    await loadData();
  };

  const updateViolationStatus = async (violationId: string, status: string, resolutionNote?: string) => {
    const { error } = await supabase.rpc('admin_ielts_violation_set_status', {
      p_violation_id: violationId,
      p_status: status,
      p_resolution_note: resolutionNote ?? null,
    });

    if (error) {
      console.error('Error updating violation status:', error);
      addToast('Failed to update violation status', 'error');
      return;
    }
    addToast(`Violation marked as ${status}`, 'success');
    await loadData();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="animate-pulse text-lg font-semibold">Loading IELTS Admin Portal...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Print styles for modals */}
      <style>{`
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
          .print-content button {
            display: none !important;
          }
        }
      `}</style>

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-2 justify-center mb-6">
        {(['overview', 'attempts', 'users', 'content', 'notifications', 'prime', 'violations'] as IeltsSubTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveSubTab(tab)}
            className={`px-4 py-2 rounded-lg font-semibold transition-all ${
              activeSubTab === tab
                ? 'bg-gradient-to-r from-emerald-400 to-cyan-500 text-black'
                : 'bg-black/30 text-gray-400 hover:text-white border border-gray-600'
            }`}
          >
            {tab === 'overview' && '📊 Overview'}
            {tab === 'attempts' && '📝 Attempts'}
            {tab === 'users' && '👥 Users'}
            {tab === 'content' && '📚 Content'}
            {tab === 'notifications' && '🔔 Notifications'}
            {tab === 'prime' && `⭐ Prime (${primeApplications.length})`}
            {tab === 'violations' && `🚨 Violations (${violations.length})`}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeSubTab === 'overview' && stats && (
        <div className="space-y-6">
          {/* Main Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon="👥" label="Total IELTS Users" value={stats.total_ielts_users || 0} color="cyan" />
            <StatCard icon="⭐" label="Premium Users" value={stats.premium_users || 0} color="yellow" />
            <StatCard icon="📖" label="Reading Attempts" value={stats.total_reading_attempts || 0} color="blue" />
            <StatCard icon="🎧" label="Listening Attempts" value={stats.total_listening_attempts || 0} color="purple" />
            <StatCard icon="✍️" label="Writing Attempts" value={stats.total_writing_attempts || 0} color="green" />
            <StatCard icon="🎤" label="Speaking Attempts" value={stats.total_speaking_attempts || 0} color="orange" />
            <StatCard icon="📧" label="Email Notifs Requested" value={stats.email_notifications_requested || 0} color="pink" />
            <StatCard icon="📱" label="SMS Notifs Requested" value={stats.sms_notifications_requested || 0} color="teal" />
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

      {/* Violations Tab */}
      {activeSubTab === 'violations' && (
        <div className="space-y-4">
          <div className="bg-black/40 rounded-xl p-6 border border-gray-700">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-xl font-bold text-white mb-1">🚨 Violation Logs</h3>
                <p className="text-gray-400 text-sm">Review ExamGuard violations and update their status.</p>
              </div>
              <button
                onClick={async () => {
                  await loadData();
                  addToast('Violation logs refreshed', 'success');
                }}
                className="px-3 py-2 bg-cyan-600/40 hover:bg-cyan-600/70 text-white text-xs rounded transition-colors"
              >
                Refresh
              </button>
            </div>

            {violations.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No violations logged yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-800/50">
                      <th className="px-4 py-3 text-left text-gray-400">User</th>
                      <th className="px-4 py-3 text-left text-gray-400">Test</th>
                      <th className="px-4 py-3 text-left text-gray-400">Type</th>
                      <th className="px-4 py-3 text-left text-gray-400">Timestamp</th>
                      <th className="px-4 py-3 text-center text-gray-400">Words</th>
                      <th className="px-4 py-3 text-center text-gray-400">Chars</th>
                      <th className="px-4 py-3 text-left text-gray-400">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {violations.map((log, idx) => {
                      const statusValue = statusUpdates[log.id] ?? log.status ?? 'open';
                      const resolutionValue = resolutionNotes[log.id] ?? log.resolution_note ?? '';
                      return (
                        <tr key={log.id || idx} className="border-t border-gray-700/50">
                          <td className="px-4 py-3 text-white">{log.user_name || log.user_id || log.userId || '-'}</td>
                          <td className="px-4 py-3 text-gray-400">{log.test_title || log.test_id || log.testId || '-'}</td>
                          <td className="px-4 py-3 text-gray-400">{log.violation_type || log.type || '-'}</td>
                          <td className="px-4 py-3 text-gray-400 text-sm">
                            {formatViolationDate(log.created_at || log.timestamp)}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-400">
                            {log.word_count ?? log.wordCount ?? '-'}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-400">
                            {log.char_count ?? log.charCount ?? '-'}
                          </td>
                          <td className="px-4 py-3 text-gray-400">
                            <select
                              value={statusValue}
                              onChange={async e => {
                                const nextStatus = e.target.value;
                                if (!log.id) {
                                  addToast('Violation record missing ID', 'error');
                                  return;
                                }
                                setStatusUpdates(prev => ({ ...prev, [log.id]: nextStatus }));
                                if (nextStatus !== 'resolved') {
                                  await updateViolationStatus(log.id, nextStatus);
                                }
                              }}
                              className="px-3 py-2 bg-black/50 border border-gray-600 rounded-lg text-white text-sm"
                            >
                              <option value="open">Open</option>
                              <option value="reviewing">Reviewing</option>
                              <option value="resolved">Resolved</option>
                            </select>
                            {statusValue === 'resolved' && (
                              <div className="mt-2 space-y-2">
                                <input
                                  type="text"
                                  placeholder="Resolution note..."
                                  value={resolutionValue}
                                  onChange={e =>
                                    setResolutionNotes(prev => ({ ...prev, [log.id]: e.target.value }))
                                  }
                                  className="w-full px-3 py-2 bg-black/50 border border-gray-600 rounded-lg text-white text-sm focus:border-cyan-400 focus:outline-none"
                                />
                                <button
                                  onClick={async () => {
                                    if (!log.id) {
                                      addToast('Violation record missing ID', 'error');
                                      return;
                                    }
                                    await updateViolationStatus(log.id, 'resolved', resolutionValue);
                                  }}
                                  className="px-3 py-2 bg-emerald-600/40 hover:bg-emerald-600/70 text-white text-xs rounded transition-colors"
                                >
                                  Confirm Resolve
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Violations Tab */}
      {activeSubTab === 'violations' && (
        <div className="space-y-4">
          <div className="bg-black/40 rounded-xl p-6 border border-gray-700">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-xl font-bold text-white mb-1">🚨 Violation Logs</h3>
                <p className="text-gray-400 text-sm">Review ExamGuard violations and update their status.</p>
              </div>
              <button
                onClick={async () => {
                  await loadData();
                  addToast('Violation logs refreshed', 'success');
                }}
                className="px-3 py-2 bg-cyan-600/40 hover:bg-cyan-600/70 text-white text-xs rounded transition-colors"
              >
                Refresh
              </button>
            </div>

            {violations.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No violations logged yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-800/50">
                      <th className="px-4 py-3 text-left text-gray-400">User</th>
                      <th className="px-4 py-3 text-left text-gray-400">Test</th>
                      <th className="px-4 py-3 text-left text-gray-400">Type</th>
                      <th className="px-4 py-3 text-left text-gray-400">Timestamp</th>
                      <th className="px-4 py-3 text-center text-gray-400">Words</th>
                      <th className="px-4 py-3 text-center text-gray-400">Chars</th>
                      <th className="px-4 py-3 text-left text-gray-400">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {violations.map((log, idx) => {
                      const violationId = log.id ?? log.violation_id;
                      const statusKey = violationId ? String(violationId) : '';
                      const statusValue = statusUpdates[statusKey] ?? log.status ?? 'open';
                      const resolutionValue = resolutionNotes[statusKey] ?? log.resolution_note ?? '';
                      return (
                        <tr key={violationId || idx} className="border-t border-gray-700/50">
                          <td className="px-4 py-3 text-white">{log.user_name || log.user_id || log.userId || '-'}</td>
                          <td className="px-4 py-3 text-gray-400">{log.test_title || log.test_id || log.testId || '-'}</td>
                          <td className="px-4 py-3 text-gray-400">{log.violation_type || log.type || '-'}</td>
                          <td className="px-4 py-3 text-gray-400 text-sm">
                            {formatViolationDate(log.created_at || log.timestamp)}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-400">
                            {log.word_count ?? log.wordCount ?? '-'}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-400">
                            {log.char_count ?? log.charCount ?? '-'}
                          </td>
                          <td className="px-4 py-3 text-gray-400">
                            <select
                              value={statusValue}
                              onChange={async e => {
                                const nextStatus = e.target.value;
                                if (!violationId) {
                                  addToast('Violation record missing ID', 'error');
                                  return;
                                }
                                setStatusUpdates(prev => ({ ...prev, [statusKey]: nextStatus }));
                                if (nextStatus !== 'resolved') {
                                  await updateViolationStatus(String(violationId), nextStatus);
                                }
                              }}
                              className="px-3 py-2 bg-black/50 border border-gray-600 rounded-lg text-white text-sm"
                            >
                              <option value="open">Open</option>
                              <option value="reviewing">Reviewing</option>
                              <option value="resolved">Resolved</option>
                            </select>
                            {statusValue === 'resolved' && (
                              <div className="mt-2 space-y-2">
                                <input
                                  type="text"
                                  placeholder="Resolution note..."
                                  value={resolutionValue}
                                  onChange={e =>
                                    setResolutionNotes(prev => ({ ...prev, [statusKey]: e.target.value }))
                                  }
                                  className="w-full px-3 py-2 bg-black/50 border border-gray-600 rounded-lg text-white text-sm focus:border-cyan-400 focus:outline-none"
                                />
                                <button
                                  onClick={async () => {
                                    if (!violationId) {
                                      addToast('Violation record missing ID', 'error');
                                      return;
                                    }
                                    await updateViolationStatus(String(violationId), 'resolved', resolutionValue);
                                  }}
                                  className="px-3 py-2 bg-emerald-600/40 hover:bg-emerald-600/70 text-white text-xs rounded transition-colors"
                                >
                                  Confirm Resolve
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* IELTS Answer Modal */}
      {showAnswerModal && selectedAttempt && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/90 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full my-8 print-content" style={{ fontFamily: 'Segoe UI, Arial, sans-serif' }}>
            {/* Header */}
            <div className="p-6 border-b-4 border-blue-600">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <img src="/logo.png" alt="Brains Heist" style={{ width: '48px', height: '48px' }} />
                  <div>
                    <h1 className="text-2xl font-bold text-blue-800">Brains Heist - IELTS</h1>
                    <p className="text-sm text-gray-500">Answer Review - {selectedAttempt.skill?.toUpperCase()}</p>
                  </div>
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
