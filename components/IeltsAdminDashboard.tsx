import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { 
  fetchIeltsAdminStats, 
  fetchIeltsRecentAttempts, 
  fetchAllIeltsUsers,
  fetchIeltsContent 
} from '../services/ieltsService';

interface IeltsAdminProps {
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

type IeltsSubTab = 'overview' | 'applications' | 'attempts' | 'users' | 'content' | 'notifications';

const IeltsAdminDashboard: React.FC<IeltsAdminProps> = ({ addToast }) => {
  const [activeSubTab, setActiveSubTab] = useState<IeltsSubTab>('overview');
  const [isLoading, setIsLoading] = useState(true);
  
  // Data states
  const [stats, setStats] = useState<any>(null);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [content, setContent] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [primeApplications, setPrimeApplications] = useState<any[]>([]);
  
  // Filters
  const [skillFilter, setSkillFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<string>('all');
  
  // Modal states for Answers and Reports
  const [selectedAttempt, setSelectedAttempt] = useState<any>(null);
  const [showAnswerModal, setShowAnswerModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
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
      const [statsData, attemptsData, usersData, contentData] = await Promise.all([
        fetchIeltsAdminStats().catch(() => null),
        fetchIeltsRecentAttempts(100).catch(() => []),
        fetchAllIeltsUsers().catch(() => []),
        fetchIeltsContent().catch(() => null),
      ]);

      setStats(statsData);
      setAttempts(attemptsData);
      setUsers(usersData);
      setContent(contentData);
      setNotifications(notifData);
      setPrimeApplications(appsData);
    } catch (error) {
      console.error('Error loading IELTS admin data:', error);
      addToast('Failed to load IELTS data', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Filter attempts
  const filteredAttempts = attempts.filter(a => {
    if (skillFilter !== 'all' && a.skill !== skillFilter) return false;
    if (searchQuery && !a.user_name?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (dateFilter !== 'all') {
      const attemptDate = new Date(a.attempt_date);
      const now = new Date();
      if (dateFilter === 'today') {
        if (attemptDate.toDateString() !== now.toDateString()) return false;
      } else if (dateFilter === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (attemptDate < weekAgo) return false;
      } else if (dateFilter === 'month') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        if (attemptDate < monthAgo) return false;
      }
    }
    return true;
  });

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatTime = (seconds: number) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const getSkillIcon = (skill: string) => {
    const icons: Record<string, string> = {
      reading: '📖',
      listening: '🎧',
      writing: '✍️',
      speaking: '🎤',
    };
    return icons[skill] || '📝';
  };

  const getSkillColor = (skill: string) => {
    const colors: Record<string, string> = {
      reading: 'from-blue-500 to-blue-600',
      listening: 'from-purple-500 to-purple-600',
      writing: 'from-green-500 to-green-600',
      speaking: 'from-orange-500 to-orange-600',
    };
    return colors[skill] || 'from-gray-500 to-gray-600';
  };

  const getBandColor = (band: number | null) => {
    if (!band) return 'text-gray-400';
    if (band >= 7) return 'text-green-400';
    if (band >= 6) return 'text-yellow-400';
    if (band >= 5) return 'text-orange-400';
    return 'text-red-400';
  };

  // Export functions
  const exportAttemptsCsv = () => {
    if (filteredAttempts.length === 0) {
      addToast('No data to export', 'error');
      return;
    }
    const headers = ['Skill', 'User', 'Content', 'Score', 'Percentage', 'Band', 'Time', 'Date', 'Email Requested', 'SMS Requested', 'Phone'];
    const rows = filteredAttempts.map(a => [
      a.skill,
      a.user_name || 'Unknown',
      a.content_title || '',
      `${a.raw_score || '-'}/${a.total_questions || '-'}`,
      a.percent ? `${a.percent}%` : '-',
      a.est_band || '-',
      formatTime(a.time_spent_seconds),
      formatDate(a.attempt_date),
      a.notify_by_email ? 'Yes' : 'No',
      a.notify_by_sms ? 'Yes' : 'No',
      a.phone_number || '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ielts_attempts_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    addToast('📥 CSV exported successfully', 'success');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-2xl text-cyan-400 animate-pulse">Loading IELTS Data...</div>
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
        {(['overview', 'applications', 'attempts', 'users', 'content', 'notifications'] as IeltsSubTab[]).map(tab => (
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
            {tab === 'applications' && `⭐ Applications (${primeApplications.length})`}
            {tab === 'attempts' && '📝 Attempts'}
            {tab === 'users' && '👥 Users'}
            {tab === 'content' && '📚 Content'}
            {tab === 'notifications' && '🔔 Notifications'}
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

          {/* Average Scores */}
          <div className="bg-black/40 rounded-xl p-6 border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-4">📈 Average Performance</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-400">{stats.avg_reading_percent || 0}%</div>
                <div className="text-gray-400">Avg Reading Score</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-400">{stats.avg_listening_percent || 0}%</div>
                <div className="text-gray-400">Avg Listening Score</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-400">{stats.avg_writing_band || 0}</div>
                <div className="text-gray-400">Avg Writing Band</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-orange-400">{stats.avg_speaking_band || 0}</div>
                <div className="text-gray-400">Avg Speaking Band</div>
              </div>
            </div>
          </div>

          {/* Content Overview */}
          <div className="bg-black/40 rounded-xl p-6 border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-4">📚 Active Content</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-900/30 rounded-lg p-4 text-center border border-blue-500/30">
                <div className="text-2xl font-bold text-blue-400">{stats.active_reading_sets || 0}</div>
                <div className="text-gray-400 text-sm">Reading Sets</div>
              </div>
              <div className="bg-purple-900/30 rounded-lg p-4 text-center border border-purple-500/30">
                <div className="text-2xl font-bold text-purple-400">{stats.active_listening_sets || 0}</div>
                <div className="text-gray-400 text-sm">Listening Sets</div>
              </div>
              <div className="bg-green-900/30 rounded-lg p-4 text-center border border-green-500/30">
                <div className="text-2xl font-bold text-green-400">{stats.active_writing_tasks || 0}</div>
                <div className="text-gray-400 text-sm">Writing Tasks</div>
              </div>
              <div className="bg-orange-900/30 rounded-lg p-4 text-center border border-orange-500/30">
                <div className="text-2xl font-bold text-orange-400">{stats.active_speaking_tasks || 0}</div>
                <div className="text-gray-400 text-sm">Speaking Tasks</div>
              </div>
            </div>
          </div>

          {/* Trial Test Info */}
          <div className="bg-black/40 rounded-xl p-6 border border-teal-500/50">
            <h3 className="text-xl font-bold text-teal-400 mb-4">🎯 Free Trial Listening Test</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-teal-900/20 rounded-lg p-4 border border-teal-500/30">
                <h4 className="font-semibold text-white mb-2">Test Details</h4>
                <ul className="text-gray-300 text-sm space-y-1">
                  <li>• <span className="text-teal-400 font-medium">40 questions</span> across 4 sections</li>
                  <li>• Section 1: Moving Company (Fill-in + Matching)</li>
                  <li>• Section 2: Conference Schedule (Table + MCQ)</li>
                  <li>• Section 3: Course Details (MCQ + Multi-select)</li>
                  <li>• Section 4: Astronomy Lecture (Sentence completion)</li>
                </ul>
              </div>
              <div className="bg-teal-900/20 rounded-lg p-4 border border-teal-500/30">
                <h4 className="font-semibold text-white mb-2">Access Information</h4>
                <ul className="text-gray-300 text-sm space-y-1">
                  <li>• Route: <code className="bg-black/40 px-2 py-0.5 rounded text-teal-300">/ielts/trial-test</code></li>
                  <li>• Status: <span className="text-green-400 font-medium">✅ Always Active</span></li>
                  <li>• Audio Source: Supabase Storage (ielts-audio bucket)</li>
                  <li>• Note: Results are shown locally (not saved to database)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Prime Applications Tab */}
      {activeSubTab === 'applications' && (
        <div className="space-y-4">
          {/* Header with stats */}
          <div className="bg-gradient-to-r from-yellow-900/30 to-amber-900/30 rounded-xl p-6 border border-yellow-500/50">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-yellow-400">⭐ Prime Applications</h3>
                <p className="text-gray-400 text-sm">Review and approve upgrade requests</p>
              </div>
              <div className="flex gap-4 text-center">
                <div className="bg-black/40 rounded-lg px-4 py-2">
                  <div className="text-2xl font-bold text-yellow-400">{primeApplications.filter(a => a.status === 'pending').length}</div>
                  <div className="text-xs text-gray-400">Pending</div>
                </div>
                <div className="bg-black/40 rounded-lg px-4 py-2">
                  <div className="text-2xl font-bold text-green-400">{primeApplications.filter(a => a.status === 'approved').length}</div>
                  <div className="text-xs text-gray-400">Approved</div>
                </div>
                <div className="bg-black/40 rounded-lg px-4 py-2">
                  <div className="text-2xl font-bold text-red-400">{primeApplications.filter(a => a.status === 'rejected').length}</div>
                  <div className="text-xs text-gray-400">Rejected</div>
                </div>
              </div>
            </div>
          </div>

          {/* Applications Table */}
          {primeApplications.length === 0 ? (
            <div className="bg-black/40 rounded-xl p-12 text-center border border-gray-700">
              <div className="text-6xl mb-4">📭</div>
              <h4 className="text-xl font-bold text-white mb-2">No Applications Yet</h4>
              <p className="text-gray-400">Prime applications will appear here when users submit them.</p>
            </div>
          ) : (
            <div className="bg-black/40 rounded-xl border border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-gray-400 text-sm font-semibold">Status</th>
                      <th className="px-4 py-3 text-left text-gray-400 text-sm font-semibold">Name</th>
                      <th className="px-4 py-3 text-left text-gray-400 text-sm font-semibold">Email</th>
                      <th className="px-4 py-3 text-left text-gray-400 text-sm font-semibold">Phone</th>
                      <th className="px-4 py-3 text-left text-gray-400 text-sm font-semibold">Target Band</th>
                      <th className="px-4 py-3 text-left text-gray-400 text-sm font-semibold">Level</th>
                      <th className="px-4 py-3 text-left text-gray-400 text-sm font-semibold">Plan</th>
                      <th className="px-4 py-3 text-left text-gray-400 text-sm font-semibold">Date</th>
                      <th className="px-4 py-3 text-left text-gray-400 text-sm font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {primeApplications.map((app, idx) => (
                      <tr key={app.id || idx} className="border-t border-gray-700/50 hover:bg-gray-800/50">
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                            app.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                            app.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {app.status?.toUpperCase() || 'PENDING'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-white">{app.full_name || 'Unknown'}</div>
                        </td>
                        <td className="px-4 py-3">
                          <a href={`mailto:${app.email}`} className="text-cyan-400 hover:underline text-sm">{app.email}</a>
                        </td>
                        <td className="px-4 py-3">
                          {app.phone ? (
                            <a href={`tel:${app.phone}`} className="text-green-400 hover:underline text-sm">{app.phone}</a>
                          ) : (
                            <span className="text-gray-500 text-sm">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-yellow-400 font-bold">{app.target_band_score || '-'}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300">{app.current_level || '-'}</td>
                        <td className="px-4 py-3">
                          <span className="capitalize text-purple-400 text-sm">{app.payment_method || 'monthly'}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">{formatDate(app.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            {app.status === 'pending' && (
                              <>
                                <button
                                  onClick={async () => {
                                    await supabase.from('ielts_prime_applications').update({ status: 'approved' }).eq('id', app.id);
                                    loadData();
                                    addToast('✅ Application approved!', 'success');
                                  }}
                                  className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={async () => {
                                    await supabase.from('ielts_prime_applications').update({ status: 'rejected' }).eq('id', app.id);
                                    loadData();
                                    addToast('❌ Application rejected', 'info');
                                  }}
                                  className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            {app.goals && (
                              <button
                                onClick={() => alert(`Goals: ${app.goals}`)}
                                className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                              >
                                View Goals
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Attempts Tab */}
      {activeSubTab === 'attempts' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-4 items-center bg-black/40 rounded-xl p-4 border border-gray-700">
            <input
              type="text"
              placeholder="🔍 Search by name..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="flex-1 min-w-[200px] px-4 py-2 bg-black/50 border border-gray-600 rounded-lg text-white focus:border-cyan-400 focus:outline-none"
            />
            <select
              value={skillFilter}
              onChange={e => setSkillFilter(e.target.value)}
              className="px-4 py-2 bg-black/50 border border-gray-600 rounded-lg text-white"
            >
              <option value="all">All Skills</option>
              <option value="reading">📖 Reading</option>
              <option value="listening">🎧 Listening</option>
              <option value="writing">✍️ Writing</option>
              <option value="speaking">🎤 Speaking</option>
            </select>
            <select
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              className="px-4 py-2 bg-black/50 border border-gray-600 rounded-lg text-white"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">Past Week</option>
              <option value="month">Past Month</option>
            </select>
            <button
              onClick={exportAttemptsCsv}
              className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg font-semibold hover:scale-105 transition-transform"
            >
              📥 Export CSV
            </button>
            <button
              onClick={loadData}
              className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg font-semibold hover:scale-105 transition-transform"
            >
              🔄 Refresh
            </button>
          </div>

          {/* Summary */}
          <div className="text-gray-400 text-sm">
            Showing {filteredAttempts.length} of {attempts.length} attempts
          </div>

          {/* Attempts Table */}
          <div className="bg-black/40 rounded-xl border border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-800/50">
                    <th className="px-4 py-3 text-left text-gray-400 font-semibold">Skill</th>
                    <th className="px-4 py-3 text-left text-gray-400 font-semibold">User</th>
                    <th className="px-4 py-3 text-left text-gray-400 font-semibold">Content</th>
                    <th className="px-4 py-3 text-center text-gray-400 font-semibold">Score</th>
                    <th className="px-4 py-3 text-center text-gray-400 font-semibold">Band</th>
                    <th className="px-4 py-3 text-center text-gray-400 font-semibold">Time</th>
                    <th className="px-4 py-3 text-center text-gray-400 font-semibold">Date</th>
                    <th className="px-4 py-3 text-center text-gray-400 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAttempts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                        No attempts found
                      </td>
                    </tr>
                  ) : (
                    filteredAttempts.map((attempt, idx) => (
                      <tr key={`${attempt.skill}-${attempt.id}-${idx}`} className="border-t border-gray-700/50 hover:bg-gray-800/30">
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-gradient-to-r ${getSkillColor(attempt.skill)} text-white`}>
                            {getSkillIcon(attempt.skill)} {attempt.skill}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-white font-medium">{attempt.user_name || 'Unknown'}</td>
                        <td className="px-4 py-3 text-gray-400 max-w-[200px] truncate">{attempt.content_title || '-'}</td>
                        <td className="px-4 py-3 text-center text-white">
                          {attempt.raw_score !== null ? `${attempt.raw_score}/${attempt.total_questions}` : '-'}
                          {attempt.percent !== null && <span className="text-gray-400 text-xs ml-1">({attempt.percent}%)</span>}
                        </td>
                        <td className={`px-4 py-3 text-center font-bold ${getBandColor(attempt.est_band)}`}>
                          {attempt.est_band || '-'}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-400">{formatTime(attempt.time_spent_seconds)}</td>
                        <td className="px-4 py-3 text-center text-gray-400 text-sm">{formatDate(attempt.attempt_date)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => { setSelectedAttempt(attempt); setShowAnswerModal(true); }}
                              className="bg-blue-600/30 hover:bg-blue-600/50 border border-blue-400 text-white text-xs px-3 py-1 rounded transition-colors"
                            >
                              📝 Answers
                            </button>
                            <button
                              onClick={() => { setSelectedAttempt(attempt); setShowReportModal(true); }}
                              className="bg-purple-600/30 hover:bg-purple-600/50 border border-purple-400 text-white text-xs px-3 py-1 rounded transition-colors"
                            >
                              📄 Report
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Users Tab */}
      {activeSubTab === 'users' && (
        <div className="space-y-4">
          <div className="flex items-center gap-4 bg-black/40 rounded-xl p-4 border border-gray-700">
            <input
              type="text"
              placeholder="🔍 Search by name or email..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="flex-1 px-4 py-2 bg-black/50 border border-gray-600 rounded-lg text-white focus:border-cyan-400 focus:outline-none"
            />
            <span className="text-gray-400">Total: {users.length}</span>
          </div>

          <div className="bg-black/40 rounded-xl border border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-800/50">
                    <th className="px-4 py-3 text-left text-gray-400 font-semibold">Name</th>
                    <th className="px-4 py-3 text-left text-gray-400 font-semibold">Email</th>
                    <th className="px-4 py-3 text-left text-gray-400 font-semibold">Phone</th>
                    <th className="px-4 py-3 text-center text-gray-400 font-semibold">Tier</th>
                    <th className="px-4 py-3 text-center text-gray-400 font-semibold">Target Band</th>
                    <th className="px-4 py-3 text-center text-gray-400 font-semibold">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {users
                    .filter(u => !searchQuery || 
                      u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      u.username?.toLowerCase().includes(searchQuery.toLowerCase())
                    )
                    .map(user => (
                      <tr key={user.id} className="border-t border-gray-700/50 hover:bg-gray-800/30">
                        <td className="px-4 py-3">
                          <div className="text-white font-medium">{user.full_name || user.username || 'Unknown'}</div>
                          {user.username && user.full_name && (
                            <div className="text-gray-500 text-xs">@{user.username}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-cyan-400">{user.email || '-'}</td>
                        <td className="px-4 py-3 text-gray-400">{user.phone || '-'}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            user.tier === 'premium' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-500/20 text-gray-400'
                          }`}>
                            {user.tier || 'free'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-cyan-400 font-bold">{user.target_band || '-'}</td>
                        <td className="px-4 py-3 text-center text-gray-400 text-sm">
                          {user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Content Tab */}
      {activeSubTab === 'content' && content && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Reading Sets */}
          <ContentCard
            title="📖 Reading Sets"
            items={content.readingSets}
            columns={['Title', 'Level', 'Active']}
            renderRow={(item: any) => (
              <>
                <td className="px-3 py-2 text-white">{item.title}</td>
                <td className="px-3 py-2 text-gray-400 capitalize">{item.level}</td>
                <td className="px-3 py-2 text-center">
                  {item.is_active ? '✅' : '❌'}
                </td>
              </>
            )}
          />

          {/* Listening Sets */}
          <ContentCard
            title="🎧 Listening Sets"
            items={content.listeningSets}
            columns={['Title', 'Level', 'Active']}
            renderRow={(item: any) => (
              <>
                <td className="px-3 py-2 text-white">{item.title}</td>
                <td className="px-3 py-2 text-gray-400 capitalize">{item.level}</td>
                <td className="px-3 py-2 text-center">
                  {item.is_active ? '✅' : '❌'}
                </td>
              </>
            )}
          />

          {/* Writing Tasks */}
          <ContentCard
            title="✍️ Writing Tasks"
            items={content.writingTasks}
            columns={['Title', 'Type', 'Active']}
            renderRow={(item: any) => (
              <>
                <td className="px-3 py-2 text-white">{item.title}</td>
                <td className="px-3 py-2 text-gray-400">{item.task_type}</td>
                <td className="px-3 py-2 text-center">
                  {item.is_active ? '✅' : '❌'}
                </td>
              </>
            )}
          />

          {/* Speaking Tasks */}
          <ContentCard
            title="🎤 Speaking Tasks"
            items={content.speakingTasks}
            columns={['Part', 'Prompt', 'Active']}
            renderRow={(item: any) => (
              <>
                <td className="px-3 py-2 text-white">Part {item.part}</td>
                <td className="px-3 py-2 text-gray-400 max-w-[200px] truncate">{item.prompt}</td>
                <td className="px-3 py-2 text-center">
                  {item.is_active ? '✅' : '❌'}
                </td>
              </>
            )}
          />
        </div>
      )}

      {/* Notifications Tab */}
      {activeSubTab === 'notifications' && (
        <div className="space-y-4">
          <div className="bg-black/40 rounded-xl p-6 border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-4">📬 Pending Notifications</h3>
            <p className="text-gray-400 mb-4">
              Users who have requested email/SMS notifications for their results.
            </p>
            
            {notifications.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No notification requests yet
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-800/50">
                      <th className="px-4 py-3 text-left text-gray-400">Type</th>
                      <th className="px-4 py-3 text-left text-gray-400">Attempt ID</th>
                      <th className="px-4 py-3 text-left text-gray-400">Alt Email</th>
                      <th className="px-4 py-3 text-left text-gray-400">Phone</th>
                      <th className="px-4 py-3 text-center text-gray-400">Email</th>
                      <th className="px-4 py-3 text-center text-gray-400">SMS</th>
                      <th className="px-4 py-3 text-center text-gray-400">Email Sent</th>
                      <th className="px-4 py-3 text-center text-gray-400">SMS Sent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notifications.map((n, idx) => (
                      <tr key={n.id || idx} className="border-t border-gray-700/50">
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 bg-cyan-900/30 text-cyan-400 rounded text-xs font-semibold">
                            {n.attempt_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-white">{n.attempt_id}</td>
                        <td className="px-4 py-3 text-gray-400">{n.alternate_email || '-'}</td>
                        <td className="px-4 py-3 text-gray-400">{n.phone_number || '-'}</td>
                        <td className="px-4 py-3 text-center">{n.notify_by_email ? '✅' : '❌'}</td>
                        <td className="px-4 py-3 text-center">{n.notify_by_sms ? '✅' : '❌'}</td>
                        <td className="px-4 py-3 text-center">
                          {n.email_sent_at ? (
                            <span className="text-green-400">✓ {formatDate(n.email_sent_at)}</span>
                          ) : (
                            <span className="text-yellow-400">Pending</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {n.sms_sent_at ? (
                            <span className="text-green-400">✓ {formatDate(n.sms_sent_at)}</span>
                          ) : n.notify_by_sms ? (
                            <span className="text-yellow-400">Pending</span>
                          ) : (
                            <span className="text-gray-600">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* SMS Integration Notice */}
          <div className="bg-yellow-900/20 rounded-xl p-6 border border-yellow-500/30">
            <h4 className="text-lg font-bold text-yellow-400 mb-2">📱 SMS Integration Required</h4>
            <p className="text-gray-300">
              To send SMS notifications, you need to integrate with an SMS provider like Twilio.
              Create a Supabase Edge Function to handle sending SMS messages when results are ready.
            </p>
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
                <div className="text-right">
                  <h2 className="text-lg font-semibold text-blue-800">{selectedAttempt.content_title || selectedAttempt.skill}</h2>
                  <p className="text-sm text-gray-500">{formatDate(selectedAttempt.attempt_date)}</p>
                </div>
              </div>
            </div>

            {/* Student Banner */}
            <div className="bg-gradient-to-r from-blue-700 to-purple-800 text-white p-5 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-white">{selectedAttempt.user_name || 'Student'}</h2>
                <p className="text-sm opacity-80">Skill: {selectedAttempt.skill} | Band: {selectedAttempt.est_band || 'N/A'}</p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-white">{selectedAttempt.raw_score}/{selectedAttempt.total_questions}</div>
                <div className="text-sm opacity-80">{selectedAttempt.percent}% Score</div>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-green-100 p-4 rounded-xl text-center">
                  <div className="text-3xl">✓</div>
                  <div className="text-3xl font-bold text-green-700">{selectedAttempt.raw_score || 0}</div>
                  <div className="text-sm text-gray-600">Correct</div>
                </div>
                <div className="bg-red-100 p-4 rounded-xl text-center">
                  <div className="text-3xl">✗</div>
                  <div className="text-3xl font-bold text-red-700">{(selectedAttempt.total_questions || 0) - (selectedAttempt.raw_score || 0)}</div>
                  <div className="text-sm text-gray-600">Wrong</div>
                </div>
                <div className="bg-amber-100 p-4 rounded-xl text-center">
                  <div className="text-3xl">⏱️</div>
                  <div className="text-3xl font-bold text-amber-700">{formatTime(selectedAttempt.time_spent_seconds)}</div>
                  <div className="text-sm text-gray-600">Time Taken</div>
                </div>
              </div>

              {/* Band Score Display */}
              <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border-2 border-yellow-400 rounded-xl p-6 text-center">
                <p className="text-sm text-amber-800 mb-1">Estimated IELTS Band Score</p>
                <div className="text-5xl font-bold text-amber-600">{selectedAttempt.est_band || 'N/A'}</div>
                <p className="text-xs text-gray-500 mt-2">Based on {selectedAttempt.percent}% accuracy</p>
              </div>

              {/* Performance Note */}
              <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg">
                <p className="text-sm text-gray-700">
                  <strong className="text-blue-800">Note:</strong> Detailed question-by-question answers are available in the student's practice session. 
                  This summary shows overall performance metrics for {selectedAttempt.skill} practice.
                </p>
              </div>

              {/* Skill Tips */}
              <div className="bg-gray-50 rounded-xl p-5">
                <h4 className="font-semibold text-gray-800 mb-3">📚 Tips for {selectedAttempt.skill?.charAt(0).toUpperCase() + selectedAttempt.skill?.slice(1)}</h4>
                <ul className="text-sm text-gray-700 space-y-2">
                  {selectedAttempt.skill === 'listening' && (
                    <>
                      <li>• Practice with different English accents (British, Australian, American)</li>
                      <li>• Read questions before listening to predict answers</li>
                      <li>• Pay attention to signal words and transitions</li>
                    </>
                  )}
                  {selectedAttempt.skill === 'reading' && (
                    <>
                      <li>• Skim the passage first to understand the main idea</li>
                      <li>• Practice identifying keywords in questions</li>
                      <li>• Manage your time - 20 minutes per passage</li>
                    </>
                  )}
                  {selectedAttempt.skill === 'writing' && (
                    <>
                      <li>• Plan your essay structure before writing</li>
                      <li>• Use a variety of sentence structures</li>
                      <li>• Leave time to review and edit</li>
                    </>
                  )}
                  {selectedAttempt.skill === 'speaking' && (
                    <>
                      <li>• Practice speaking English daily</li>
                      <li>• Record yourself and listen back</li>
                      <li>• Expand your vocabulary on common topics</li>
                    </>
                  )}
                </ul>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t flex justify-between items-center text-xs text-gray-400">
              <span>Brains Heist IELTS Preparation</span>
              <div className="flex gap-3">
                <button onClick={() => window.print()} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700">🖨️ Print</button>
                <button onClick={() => setShowAnswerModal(false)} className="px-4 py-2 bg-gray-600 text-white rounded-lg font-semibold hover:bg-gray-700">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* IELTS Report Modal */}
      {showReportModal && selectedAttempt && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/90 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full my-8 print-content" style={{ fontFamily: 'Segoe UI, Arial, sans-serif' }}>
            {/* Report Header */}
            <div className="p-6 border-b-4 border-purple-600">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <img src="/logo.png" alt="Brains Heist" style={{ width: '48px', height: '48px' }} />
                  <div>
                    <h1 className="text-2xl font-bold text-purple-800">Brains Heist - IELTS</h1>
                    <p className="text-sm text-gray-500">Performance Report</p>
                  </div>
                </div>
                <div className="text-right">
                  <h2 className="text-lg font-semibold text-purple-800">{selectedAttempt.skill?.toUpperCase()} Practice</h2>
                  <p className="text-sm text-gray-500">Generated: {new Date().toLocaleDateString()}</p>
                </div>
              </div>
            </div>

            {/* Student Banner */}
            <div className="bg-gradient-to-r from-purple-800 to-indigo-900 text-white p-6 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-white">{selectedAttempt.user_name || 'Student'}</h2>
                <p className="opacity-80">Skill: {selectedAttempt.skill?.toUpperCase()} | Completed: {formatDate(selectedAttempt.attempt_date)} | Time: {formatTime(selectedAttempt.time_spent_seconds)}</p>
              </div>
              <div className="w-20 h-20 rounded-full bg-white flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-purple-800">{selectedAttempt.est_band || 'N/A'}</span>
                <span className="text-xs text-gray-600">Band</span>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Score Breakdown */}
              <div>
                <h3 className="text-lg font-semibold text-purple-800 border-b-2 border-gray-200 pb-2 mb-4">📊 Score Analysis</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-blue-50 rounded-xl p-4 text-center">
                    <div className="text-4xl font-bold text-blue-700">{selectedAttempt.raw_score}/{selectedAttempt.total_questions}</div>
                    <p className="text-sm text-gray-600">Raw Score</p>
                  </div>
                  <div className="bg-green-50 rounded-xl p-4 text-center">
                    <div className="text-4xl font-bold text-green-700">{selectedAttempt.percent}%</div>
                    <p className="text-sm text-gray-600">Accuracy</p>
                  </div>
                </div>
              </div>

              {/* Band Progression */}
              <div>
                <h3 className="text-lg font-semibold text-purple-800 border-b-2 border-gray-200 pb-2 mb-4">📈 Band Score Progress</h3>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 w-16">Current:</span>
                  <div className="flex-1 h-6 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all ${
                        (selectedAttempt.est_band || 0) >= 7 ? 'bg-green-500' : 
                        (selectedAttempt.est_band || 0) >= 6 ? 'bg-blue-500' : 
                        (selectedAttempt.est_band || 0) >= 5 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${((selectedAttempt.est_band || 0) / 9) * 100}%` }}
                    />
                  </div>
                  <span className="font-bold text-lg text-purple-700">{selectedAttempt.est_band || 'N/A'}</span>
                </div>
              </div>

              {/* Recommendations */}
              <div className="border-2 border-purple-600 rounded-xl p-5">
                <h3 className="text-lg font-semibold text-purple-800 mb-4">📋 Personalized Recommendations</h3>
                {(selectedAttempt.percent || 0) >= 80 ? (
                  <div className="flex gap-4 p-4 bg-green-50 rounded-lg">
                    <div className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">✓</div>
                    <div>
                      <h4 className="font-semibold text-gray-800">Excellent Performance!</h4>
                      <p className="text-sm text-gray-600">Continue practicing with more challenging materials. Focus on time management and accuracy.</p>
                    </div>
                  </div>
                ) : (selectedAttempt.percent || 0) >= 60 ? (
                  <div className="flex gap-4 p-4 bg-yellow-50 rounded-lg">
                    <div className="w-8 h-8 bg-yellow-600 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">📈</div>
                    <div>
                      <h4 className="font-semibold text-gray-800">Good Progress - Room for Improvement</h4>
                      <p className="text-sm text-gray-600">Practice more {selectedAttempt.skill} exercises. Review the questions you missed and understand the patterns.</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-4 p-4 bg-red-50 rounded-lg">
                    <div className="w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">💪</div>
                    <div>
                      <h4 className="font-semibold text-gray-800">Focus on Fundamentals</h4>
                      <p className="text-sm text-gray-600">Consider more practice with basic {selectedAttempt.skill} exercises. Review strategies and techniques for this skill.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Encouragement */}
              <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6 rounded-xl text-center">
                <h3 className="text-xl font-bold mb-2">Keep Practicing! 🚀</h3>
                <p className="opacity-90">Every practice session brings you closer to your target band score. Stay consistent!</p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t flex justify-between items-center text-xs text-gray-400">
              <span>Brains Heist IELTS Preparation</span>
              <span>Report ID: {selectedAttempt.id?.toString().substring(0, 8) || 'N/A'}</span>
              <div className="flex gap-3">
                <button onClick={() => window.print()} className="px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700">🖨️ Print</button>
                <button onClick={() => setShowReportModal(false)} className="px-4 py-2 bg-gray-600 text-white rounded-lg font-semibold hover:bg-gray-700">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper Components
const StatCard: React.FC<{ icon: string; label: string; value: number | string; color: string }> = ({ icon, label, value, color }) => {
  const colorClasses: Record<string, string> = {
    cyan: 'from-cyan-600/20 to-cyan-900/20 border-cyan-400 text-cyan-300',
    yellow: 'from-yellow-600/20 to-yellow-900/20 border-yellow-400 text-yellow-300',
    blue: 'from-blue-600/20 to-blue-900/20 border-blue-400 text-blue-300',
    purple: 'from-purple-600/20 to-purple-900/20 border-purple-400 text-purple-300',
    green: 'from-green-600/20 to-green-900/20 border-green-400 text-green-300',
    orange: 'from-orange-600/20 to-orange-900/20 border-orange-400 text-orange-300',
    pink: 'from-pink-600/20 to-pink-900/20 border-pink-400 text-pink-300',
    teal: 'from-teal-600/20 to-teal-900/20 border-teal-400 text-teal-300',
  };

  return (
    <div className={`bg-gradient-to-br ${colorClasses[color]} border-2 rounded-xl p-4`}>
      <div className="text-3xl mb-2">{icon}</div>
      <div className={`text-2xl font-bold ${colorClasses[color].split(' ').pop()}`}>{value}</div>
      <div className="text-gray-400 text-sm">{label}</div>
    </div>
  );
};

const ContentCard: React.FC<{
  title: string;
  items: any[];
  columns: string[];
  renderRow: (item: any) => React.ReactNode;
}> = ({ title, items, columns, renderRow }) => (
  <div className="bg-black/40 rounded-xl border border-gray-700 overflow-hidden">
    <div className="bg-gray-800/50 px-4 py-3 border-b border-gray-700">
      <h4 className="text-lg font-bold text-white">{title}</h4>
      <span className="text-gray-400 text-sm">{items.length} items</span>
    </div>
    <div className="overflow-x-auto max-h-[300px]">
      <table className="w-full">
        <thead className="bg-gray-800">
          <tr>
            {columns.map(col => (
              <th key={col} className="px-3 py-2 text-left text-gray-400 text-sm">{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.id || idx} className="border-t border-gray-700/50 hover:bg-gray-800/30">
              {renderRow(item)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export default IeltsAdminDashboard;
