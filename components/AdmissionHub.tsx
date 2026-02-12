import React, { useState, useEffect, useCallback } from 'react';
import BackButton from './BackButton';
import type { ToastMessage } from '../types';
import * as AdmService from '../services/admissionService';
import type {
  AdmQuestionPool,
  AdmBlueprint,
  AdmTestForm,
  AdmCandidate,
  AdmAttempt,
  AdmPlacementResult,
  CandidateReport,
  PlacementBand,
} from '../services/admissionService';
import { supabase } from '../services/supabaseClient';

// ── Types ──

type AdmTab = 'overview' | 'pools' | 'blueprints' | 'forms' | 'candidates' | 'results' | 'audit';

interface AdmissionHubProps {
  onComplete: () => void;
  addToast: (message: string, type: ToastMessage['type']) => void;
}

// ── Band Colours ──

const BAND_COLORS: Record<PlacementBand, string> = {
  A: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  B: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  C: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  D: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  E: 'bg-red-500/20 text-red-300 border-red-500/40',
};

const BAND_LABELS: Record<PlacementBand, string> = {
  A: 'Outstanding',
  B: 'Above Average',
  C: 'Average',
  D: 'Below Average',
  E: 'Requires Support',
};

// ── Main Component ──

const AdmissionHub: React.FC<AdmissionHubProps> = ({ onComplete, addToast }) => {
  const [activeTab, setActiveTab] = useState<AdmTab>('overview');
  const [loading, setLoading] = useState(true);
  const [schoolId, setSchoolId] = useState<string | null>(null);

  // Data
  const [pools, setPools] = useState<AdmQuestionPool[]>([]);
  const [blueprints, setBlueprints] = useState<AdmBlueprint[]>([]);
  const [forms, setForms] = useState<AdmTestForm[]>([]);
  const [candidates, setCandidates] = useState<AdmCandidate[]>([]);
  const [attempts, setAttempts] = useState<AdmAttempt[]>([]);
  const [placements, setPlacements] = useState<AdmPlacementResult[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);

  // Forms state
  const [creatingBlueprint, setCreatingBlueprint] = useState(false);
  const [creatingCandidate, setCreatingCandidate] = useState(false);
  const [generatingForm, setGeneratingForm] = useState(false);

  // Blueprint form
  const [bpName, setBpName] = useState('');
  const [bpSubject, setBpSubject] = useState('english');
  const [bpTargetStage, setBpTargetStage] = useState(9);
  const [bpDuration, setBpDuration] = useState(45);
  const [bpTotalMarks, setBpTotalMarks] = useState(27);
  const [bpPassPercentage, setBpPassPercentage] = useState(50);
  const [bpDelivery, setBpDelivery] = useState<'practice' | 'exam'>('exam');
  const [bpDistribution, setBpDistribution] = useState('{"mcq": {"easy": 5, "medium": 8, "hard": 1}, "gap_fill": {"easy": 1, "medium": 2, "hard": 1}, "sentence_transformation": {"medium": 2, "hard": 1}}');

  // Candidate form
  const [candName, setCandName] = useState('');
  const [candEmail, setCandEmail] = useState('');
  const [candPhone, setCandPhone] = useState('');
  const [candAppliedGrade, setCandAppliedGrade] = useState('');
  const [candNotes, setCandNotes] = useState('');

  // Form generation
  const [genBlueprintId, setGenBlueprintId] = useState('');
  const [genFormCode, setGenFormCode] = useState('');

  // Report modal
  const [reportData, setReportData] = useState<CandidateReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [showReport, setShowReport] = useState(false);

  // ── Bootstrap ──

  const loadSchool = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: membership } = await supabase
      .from('school_members')
      .select('school_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .in('role_in_school', ['school_admin', 'teacher'])
      .limit(1)
      .maybeSingle();
    if (membership) setSchoolId(membership.school_id);
  }, []);

  const loadAll = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const [p, bp, f, c, a, pl] = await Promise.all([
        AdmService.fetchQuestionPools(schoolId),
        AdmService.fetchBlueprints(schoolId),
        AdmService.fetchTestForms(schoolId),
        AdmService.fetchCandidates(schoolId),
        AdmService.fetchAttempts(schoolId),
        AdmService.fetchPlacementResults(schoolId),
      ]);
      setPools(p);
      setBlueprints(bp);
      setForms(f);
      setCandidates(c);
      setAttempts(a);
      setPlacements(pl);
    } catch (err: any) {
      addToast(err.message || 'Failed to load admission data', 'error');
    } finally {
      setLoading(false);
    }
  }, [schoolId, addToast]);

  useEffect(() => { loadSchool(); }, [loadSchool]);
  useEffect(() => { if (schoolId) loadAll(); }, [schoolId, loadAll]);

  // Load audit log on demand
  useEffect(() => {
    if (activeTab === 'audit' && schoolId) {
      AdmService.fetchAuditLog(schoolId).then(setAuditLog).catch(() => {});
    }
  }, [activeTab, schoolId]);

  // ── Handlers ──

  const handleCreateBlueprint = async () => {
    if (!schoolId || !bpName) return;
    setCreatingBlueprint(true);
    try {
      let dist: Record<string, any>;
      try { dist = JSON.parse(bpDistribution); } catch { addToast('Invalid JSON for distribution', 'error'); return; }
      await AdmService.createBlueprint({
        school_id: schoolId,
        name: bpName,
        subject: bpSubject,
        target_grade: null,
        target_stage: bpTargetStage,
        total_marks: bpTotalMarks,
        duration_minutes: bpDuration,
        question_distribution: dist,
        delivery_mode: bpDelivery,
        pass_percentage: bpPassPercentage,
        is_active: true,
        created_by: null,
      });
      addToast('Blueprint created', 'success');
      setBpName(''); setBpDistribution('{"mcq": {"easy": 5, "medium": 8, "hard": 1}, "gap_fill": {"easy": 1, "medium": 2, "hard": 1}, "sentence_transformation": {"medium": 2, "hard": 1}}');
      await loadAll();
    } catch (err: any) {
      addToast(err.message || 'Failed to create blueprint', 'error');
    } finally {
      setCreatingBlueprint(false);
    }
  };

  const handleGenerateForm = async () => {
    if (!genBlueprintId || !genFormCode) return;
    setGeneratingForm(true);
    try {
      const res = await AdmService.generateTestForm(genBlueprintId, genFormCode);
      if (res.success) {
        addToast(`Form ${genFormCode} generated`, 'success');
        setGenFormCode('');
        await loadAll();
      } else {
        addToast(res.error || 'Failed to generate form', 'error');
      }
    } finally {
      setGeneratingForm(false);
    }
  };

  const handlePublishForm = async (formId: string) => {
    const res = await AdmService.publishForm(formId);
    if (res.success) { addToast('Form published', 'success'); await loadAll(); }
    else addToast(res.error || 'Failed to publish', 'error');
  };

  const handleCloseForm = async (formId: string) => {
    const res = await AdmService.closeForm(formId);
    if (res.success) { addToast('Form closed', 'success'); await loadAll(); }
    else addToast(res.error || 'Failed to close', 'error');
  };

  const handleCreateCandidate = async () => {
    if (!schoolId || !candName) return;
    setCreatingCandidate(true);
    try {
      await AdmService.createCandidate({
        school_id: schoolId,
        full_name: candName,
        email: candEmail || null,
        parent_phone: candPhone || null,
        applied_grade: candAppliedGrade ? parseInt(candAppliedGrade, 10) : null,
        notes: candNotes || null,
      });
      addToast('Candidate registered', 'success');
      setCandName(''); setCandEmail(''); setCandPhone(''); setCandAppliedGrade(''); setCandNotes('');
      await loadAll();
    } catch (err: any) {
      addToast(err.message || 'Failed to create candidate', 'error');
    } finally {
      setCreatingCandidate(false);
    }
  };

  const handleViewReport = async (attemptId: string) => {
    setReportLoading(true);
    setShowReport(true);
    try {
      const report = await AdmService.getCandidateReport(attemptId);
      setReportData(report);
    } catch {
      addToast('Failed to load report', 'error');
      setShowReport(false);
    } finally {
      setReportLoading(false);
    }
  };

  const handleRecordPlacement = async (attemptId: string, band: PlacementBand) => {
    const res = await AdmService.recordPlacement(attemptId, band, null, null, null);
    if (res.success) { addToast('Placement recorded', 'success'); await loadAll(); }
    else addToast(res.error || 'Failed', 'error');
  };

  const copyTestLink = (token: string, formCode: string) => {
    const link = AdmService.buildTestLink(window.location.origin, token, formCode);
    navigator.clipboard.writeText(link).then(() => addToast('Link copied', 'success'));
  };

  // ── Tab config ──

  const tabs: { key: AdmTab; label: string; icon: string }[] = [
    { key: 'overview', label: 'Overview', icon: '📊' },
    { key: 'pools', label: 'Question Pools', icon: '📝' },
    { key: 'blueprints', label: 'Blueprints', icon: '📐' },
    { key: 'forms', label: 'Test Forms', icon: '📋' },
    { key: 'candidates', label: 'Candidates', icon: '👤' },
    { key: 'results', label: 'Results', icon: '🏆' },
    { key: 'audit', label: 'Audit Log', icon: '📜' },
  ];

  // ── Render helpers ──

  const statCard = (label: string, value: number | string, icon: string, accent: string) => (
    <div className={`rounded-xl border ${accent} bg-slate-800/60 p-4 flex items-center gap-3`}>
      <span className="text-2xl">{icon}</span>
      <div>
        <div className="text-2xl font-bold text-white">{value}</div>
        <div className="text-xs text-gray-400 uppercase tracking-wider">{label}</div>
      </div>
    </div>
  );

  const bandBadge = (band: PlacementBand) => (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-bold ${BAND_COLORS[band]}`}>
      Band {band} <span className="font-normal opacity-75">· {BAND_LABELS[band]}</span>
    </span>
  );

  const statusPill = (status: string) => {
    const map: Record<string, string> = {
      draft: 'bg-gray-500/20 text-gray-300 border-gray-500/40',
      published: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      closed: 'bg-red-500/20 text-red-300 border-red-500/40',
      registered: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
      testing: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      completed: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      placed: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
      in_progress: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      submitted: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
      scored: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    };
    return (
      <span className={`inline-flex px-2 py-0.5 rounded-md border text-xs font-semibold capitalize ${map[status] || 'bg-gray-500/20 text-gray-300'}`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  const inputClass = 'w-full rounded-lg border border-gray-600 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-cyan-400 focus:outline-none';
  const btnPrimary = 'rounded-lg bg-cyan-600 hover:bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-40 disabled:cursor-not-allowed';
  const btnSecondary = 'rounded-lg border border-gray-600 hover:border-gray-500 px-3 py-1.5 text-xs text-gray-300 hover:text-white transition';

  // ── RENDER ──

  if (loading && !schoolId) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-cyan-200">
        <div className="h-8 w-8 rounded-full border-2 border-cyan-400/70 border-t-transparent animate-spin" />
        <span className="ml-3 text-sm">Loading Admission Hub…</span>
      </div>
    );
  }

  if (!schoolId) {
    return (
      <div className="space-y-4">
        <BackButton onClick={onComplete} label="Back" />
        <div className="card-glass p-8 text-center">
          <span className="text-4xl mb-3 block">🏫</span>
          <h2 className="text-xl font-heading text-white mb-2">No School Access</h2>
          <p className="text-sm text-gray-400">You need school admin or teacher role to access the Admission Hub.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-12">
      {/* Header */}
      <div className="flex items-center gap-4">
        <BackButton onClick={onComplete} label="Back" />
        <div className="flex-1">
          <h1 className="text-2xl font-heading text-white flex items-center gap-2">
            <span className="text-3xl">🎓</span> Admission Hub
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Manage entrance tests, candidates, and placements</p>
        </div>
        <button
          onClick={() => loadAll()}
          disabled={loading}
          className="rounded-lg border border-gray-600 hover:border-cyan-500 bg-slate-800/60 hover:bg-slate-700/60 px-3 py-2 text-sm text-gray-300 hover:text-cyan-200 transition flex items-center gap-1.5 disabled:opacity-40"
          title="Refresh data"
        >
          <span className={loading ? 'animate-spin' : ''}>🔄</span> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 pb-2" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            role="tab"
            aria-selected={activeTab === t.key}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              activeTab === t.key
                ? 'bg-cyan-600/30 text-cyan-200 border border-cyan-500/50'
                : 'bg-slate-800/50 text-gray-400 border border-transparent hover:text-gray-200 hover:bg-slate-700/50'
            }`}
          >
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="flex items-center gap-2 text-cyan-300 text-sm py-4">
          <div className="h-4 w-4 rounded-full border-2 border-cyan-400/70 border-t-transparent animate-spin" />
          Loading data…
        </div>
      )}

      {/*  ━━━ OVERVIEW TAB ━━━  */}
      {activeTab === 'overview' && !loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {statCard('Question Pools', pools.length, '📝', 'border-cyan-500/30')}
            {statCard('Blueprints', blueprints.length, '📐', 'border-blue-500/30')}
            {statCard('Test Forms', forms.length, '📋', 'border-indigo-500/30')}
            {statCard('Candidates', candidates.length, '👤', 'border-purple-500/30')}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {statCard('Active Tests', forms.filter(f => f.status === 'published').length, '✅', 'border-emerald-500/30')}
            {statCard('Attempts', attempts.length, '📊', 'border-amber-500/30')}
            {statCard('Scored', attempts.filter(a => a.status === 'scored').length, '🏆', 'border-yellow-500/30')}
            {statCard('Placed', placements.length, '🎯', 'border-pink-500/30')}
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button onClick={() => setActiveTab('candidates')} className="rounded-xl border border-purple-500/30 bg-slate-800/60 p-4 hover:bg-slate-700/60 transition text-left">
              <span className="text-2xl">➕</span>
              <div className="text-sm font-semibold text-white mt-2">Register Candidates</div>
              <div className="text-xs text-gray-400">Add new applicants for testing</div>
            </button>
            <button onClick={() => setActiveTab('forms')} className="rounded-xl border border-indigo-500/30 bg-slate-800/60 p-4 hover:bg-slate-700/60 transition text-left">
              <span className="text-2xl">📋</span>
              <div className="text-sm font-semibold text-white mt-2">Manage Test Forms</div>
              <div className="text-xs text-gray-400">Generate, publish, or close tests</div>
            </button>
            <button onClick={() => setActiveTab('results')} className="rounded-xl border border-amber-500/30 bg-slate-800/60 p-4 hover:bg-slate-700/60 transition text-left">
              <span className="text-2xl">🏆</span>
              <div className="text-sm font-semibold text-white mt-2">View Results</div>
              <div className="text-xs text-gray-400">Review scores and decide placements</div>
            </button>
          </div>
        </div>
      )}

      {/*  ━━━ POOLS TAB ━━━  */}
      {activeTab === 'pools' && !loading && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Question Pools</h2>
          {pools.length === 0 ? (
            <div className="card-glass p-6 text-center text-gray-400 text-sm">
              No question pools yet. Run the import script or upload pool JSON to get started.
            </div>
          ) : (
            <div className="space-y-3">
              {pools.map((p) => (
                <div key={p.id} className="rounded-xl border border-gray-700 bg-slate-800/60 p-4 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-white">{p.name}</div>
                    <div className="text-xs text-gray-400">{p.subject} · Stage {p.stage} {p.school_id ? '' : '· 🌐 Global'}</div>
                  </div>
                  <div className="text-xs text-gray-500">{new Date(p.created_at).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/*  ━━━ BLUEPRINTS TAB ━━━  */}
      {activeTab === 'blueprints' && !loading && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Test Blueprints</h2>
            <button onClick={() => setCreatingBlueprint(!creatingBlueprint)} className={btnSecondary}>
              {creatingBlueprint ? 'Cancel' : '+ New Blueprint'}
            </button>
          </div>

          {creatingBlueprint && (
            <div className="rounded-xl border border-cyan-500/30 bg-slate-800/80 p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Name</label>
                  <input className={inputClass} value={bpName} onChange={e => setBpName(e.target.value)} placeholder="e.g. English Stage 9 — Standard Admission Test" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Subject</label>
                  <select className={inputClass} value={bpSubject} onChange={e => setBpSubject(e.target.value)}>
                    <option value="english">English</option>
                    <option value="math">Math</option>
                    <option value="science">Science</option>
                    <option value="chemistry">Chemistry</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Target Stage</label>
                  <input type="number" className={inputClass} value={bpTargetStage} onChange={e => setBpTargetStage(+e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Duration (min)</label>
                  <input type="number" className={inputClass} value={bpDuration} onChange={e => setBpDuration(+e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Total Marks</label>
                  <input type="number" className={inputClass} value={bpTotalMarks} onChange={e => setBpTotalMarks(+e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Pass Percentage (%)</label>
                  <input type="number" className={inputClass} value={bpPassPercentage} onChange={e => setBpPassPercentage(+e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Mode</label>
                  <select className={inputClass} value={bpDelivery} onChange={e => setBpDelivery(e.target.value as 'practice' | 'exam')}>
                    <option value="exam">Exam</option>
                    <option value="practice">Practice</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">Question Distribution (JSON — nested by difficulty)</label>
                <textarea className={`${inputClass} h-20 font-mono text-xs`} value={bpDistribution} onChange={e => setBpDistribution(e.target.value)} />
                <p className="text-xs text-gray-500 mt-1">e.g. {`{"mcq": {"easy": 5, "medium": 8, "hard": 1}, "gap_fill": {"medium": 2}}`}</p>
              </div>
              <button onClick={handleCreateBlueprint} disabled={creatingBlueprint && !bpName} className={btnPrimary}>
                Create Blueprint
              </button>
            </div>
          )}

          {blueprints.length === 0 && !creatingBlueprint ? (
            <div className="card-glass p-6 text-center text-gray-400 text-sm">
              No blueprints yet. Create one to define your test structure.
            </div>
          ) : (
            <div className="space-y-3">
              {blueprints.map((bp) => (
                <div key={bp.id} className="rounded-xl border border-gray-700 bg-slate-800/60 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-white">{bp.name}</div>
                      <div className="text-xs text-gray-400">
                        {bp.duration_minutes}min · {bp.total_marks} marks · {bp.delivery_mode} · pass ≥ {bp.pass_percentage}%
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 font-mono">{bp.id.slice(0, 8)}</div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {Object.entries(bp.question_distribution).map(([type, val]) => {
                      const total = typeof val === 'object' && val !== null
                        ? Object.values(val as Record<string, number>).reduce((s, n) => s + n, 0)
                        : val;
                      return (
                        <span key={type} className="px-2 py-0.5 rounded bg-slate-700 text-xs text-gray-300">
                          {type}: {String(total)}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/*  ━━━ FORMS TAB ━━━  */}
      {activeTab === 'forms' && !loading && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Test Forms</h2>
            <button onClick={() => setGeneratingForm(!generatingForm)} className={btnSecondary}>
              {generatingForm ? 'Cancel' : '+ Generate Form'}
            </button>
          </div>

          {generatingForm && (
            <div className="rounded-xl border border-indigo-500/30 bg-slate-800/80 p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Blueprint</label>
                  <select className={inputClass} value={genBlueprintId} onChange={e => setGenBlueprintId(e.target.value)}>
                    <option value="">Select blueprint…</option>
                    {blueprints.map(bp => <option key={bp.id} value={bp.id}>{bp.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Form Code</label>
                  <input className={inputClass} value={genFormCode} onChange={e => setGenFormCode(e.target.value)} placeholder="e.g. ENG9-2026-A" />
                </div>
              </div>
              <button onClick={handleGenerateForm} disabled={!genBlueprintId || !genFormCode} className={btnPrimary}>
                Generate Form
              </button>
            </div>
          )}

          {forms.length === 0 && !generatingForm ? (
            <div className="card-glass p-6 text-center text-gray-400 text-sm">
              No test forms yet. Generate one from a blueprint.
            </div>
          ) : (
            <div className="space-y-3">
              {forms.map((f) => (
                <div key={f.id} className="rounded-xl border border-gray-700 bg-slate-800/60 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="font-mono text-sm font-bold text-white">{f.form_code}</div>
                      {statusPill(f.status)}
                    </div>
                    <div className="flex items-center gap-2">
                      {f.status === 'draft' && (
                        <button onClick={() => handlePublishForm(f.id)} className="text-xs px-2 py-1 rounded bg-emerald-600/30 text-emerald-300 hover:bg-emerald-600/50 transition">
                          Publish
                        </button>
                      )}
                      {f.status === 'published' && (
                        <button onClick={() => handleCloseForm(f.id)} className="text-xs px-2 py-1 rounded bg-red-600/30 text-red-300 hover:bg-red-600/50 transition">
                          Close
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Created {new Date(f.created_at).toLocaleString()}
                    {f.published_at && ` · Published ${new Date(f.published_at).toLocaleString()}`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/*  ━━━ CANDIDATES TAB ━━━  */}
      {activeTab === 'candidates' && !loading && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Candidates</h2>
            <button onClick={() => setCreatingCandidate(!creatingCandidate)} className={btnSecondary}>
              {creatingCandidate ? 'Cancel' : '+ Register Candidate'}
            </button>
          </div>

          {creatingCandidate && (
            <div className="rounded-xl border border-purple-500/30 bg-slate-800/80 p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Full Name *</label>
                  <input className={inputClass} value={candName} onChange={e => setCandName(e.target.value)} placeholder="Ahmed Al-Rashid" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Email</label>
                  <input type="email" className={inputClass} value={candEmail} onChange={e => setCandEmail(e.target.value)} placeholder="parent@email.com" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Parent Phone</label>
                  <input className={inputClass} value={candPhone} onChange={e => setCandPhone(e.target.value)} placeholder="+971 50 123 4567" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Applied Grade</label>
                  <input type="number" className={inputClass} value={candAppliedGrade} onChange={e => setCandAppliedGrade(e.target.value)} placeholder="9" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Notes</label>
                  <input className={inputClass} value={candNotes} onChange={e => setCandNotes(e.target.value)} placeholder="Any additional notes…" />
                </div>
              </div>
              <button onClick={handleCreateCandidate} disabled={!candName} className={btnPrimary}>
                Register Candidate
              </button>
            </div>
          )}

          {candidates.length === 0 && !creatingCandidate ? (
            <div className="card-glass p-6 text-center text-gray-400 text-sm">
              No candidates registered yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-700">
                    <th className="pb-2 pr-4">Name</th>
                    <th className="pb-2 pr-4">Email</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 pr-4">Token</th>
                    <th className="pb-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {candidates.map((c) => {
                    const publishedForms = forms.filter(f => f.status === 'published');
                    return (
                      <tr key={c.id} className="text-gray-300 hover:bg-slate-700/30 transition">
                        <td className="py-2 pr-4 font-medium text-white">{c.full_name}</td>
                        <td className="py-2 pr-4 text-xs">{c.email || '—'}</td>
                        <td className="py-2 pr-4">{statusPill(c.status)}</td>
                        <td className="py-2 pr-4 font-mono text-xs">{c.token.slice(0, 12)}…</td>
                        <td className="py-2">
                          <div className="flex items-center gap-1">
                            {publishedForms.map(f => (
                              <button
                                key={f.id}
                                onClick={() => copyTestLink(c.token, f.form_code)}
                                className="text-xs px-2 py-1 rounded bg-cyan-600/30 text-cyan-300 hover:bg-cyan-600/50 transition"
                                title={`Copy test link for ${f.form_code}`}
                              >
                                📋 {f.form_code}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/*  ━━━ RESULTS TAB ━━━  */}
      {activeTab === 'results' && !loading && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-white">Test Results</h2>

          {attempts.length === 0 ? (
            <div className="card-glass p-6 text-center text-gray-400 text-sm">
              No test attempts yet.
            </div>
          ) : (
            <div className="space-y-3">
              {attempts.map((a) => {
                const cand = candidates.find(c => c.id === a.candidate_id);
                const placement = placements.find(p => p.attempt_id === a.id);
                return (
                  <div key={a.id} className="rounded-xl border border-gray-700 bg-slate-800/60 p-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <div className="font-semibold text-white">{cand?.full_name || 'Unknown'}</div>
                        <div className="text-xs text-gray-400">
                          {statusPill(a.status)}
                          {a.percentage !== null && (
                            <span className="ml-2">
                              Score: {a.total_score}/{a.max_score} ({a.percentage}%)
                            </span>
                          )}
                          {placement && <span className="ml-2">{bandBadge(placement.band)}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {a.status === 'scored' && (
                          <button onClick={() => handleViewReport(a.id)} className="text-xs px-2 py-1 rounded bg-blue-600/30 text-blue-300 hover:bg-blue-600/50 transition">
                            📊 Report
                          </button>
                        )}
                        {a.status === 'scored' && !placement && (
                          <div className="flex items-center gap-1">
                            {(['A', 'B', 'C', 'D', 'E'] as PlacementBand[]).map(b => (
                              <button
                                key={b}
                                onClick={() => handleRecordPlacement(a.id, b)}
                                className={`text-xs px-1.5 py-0.5 rounded border ${BAND_COLORS[b]} hover:opacity-80 transition`}
                              >
                                {b}
                              </button>
                            ))}
                          </div>
                        )}
                        {placement && (
                          <span className="text-xs text-gray-400">Placed: {bandBadge(placement.band)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/*  ━━━ AUDIT TAB ━━━  */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Audit Log</h2>
          {auditLog.length === 0 ? (
            <div className="card-glass p-6 text-center text-gray-400 text-sm">No entries yet.</div>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {auditLog.map((entry, i) => (
                <div key={i} className="rounded-lg border border-gray-700/50 bg-slate-800/40 px-3 py-2 text-xs flex items-start gap-3">
                  <span className="text-gray-500 shrink-0 w-36">{new Date(entry.created_at).toLocaleString()}</span>
                  <span className="text-cyan-300 font-semibold shrink-0 w-20">{entry.action}</span>
                  <span className="text-gray-300">{entry.target_type} · {entry.target_id?.slice(0, 8)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/*  ━━━ REPORT MODAL ━━━  */}
      {showReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => { setShowReport(false); setReportData(null); }}>
          <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-slate-900 border border-gray-700 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            {reportLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 rounded-full border-2 border-cyan-400/70 border-t-transparent animate-spin" />
              </div>
            ) : reportData ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-heading text-white">{reportData.candidate_name}</h3>
                    <p className="text-xs text-gray-400">Form: {reportData.form_code}</p>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-white">{reportData.percentage}%</div>
                    {bandBadge(reportData.band)}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {statCard('Score', `${reportData.total_score}/${reportData.max_score}`, '🎯', 'border-cyan-500/30')}
                  {statCard('Started', new Date(reportData.started_at).toLocaleTimeString(), '🕐', 'border-gray-500/30')}
                  {statCard('Submitted', new Date(reportData.submitted_at).toLocaleTimeString(), '✅', 'border-emerald-500/30')}
                </div>

                {/* By Topic */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-300 mb-2">Performance by Topic</h4>
                  <div className="space-y-1.5">
                    {(reportData.by_topic ?? []).map((t, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 w-40 truncate">{t.topic}</span>
                        <div className="flex-1 h-3 rounded bg-slate-700 overflow-hidden">
                          <div
                            className={`h-full rounded transition-all ${t.pct >= 70 ? 'bg-emerald-500' : t.pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${t.pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-300 w-12 text-right">{t.correct}/{t.total}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* By Type */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-300 mb-2">Performance by Question Type</h4>
                  <div className="space-y-1.5">
                    {(reportData.by_type ?? []).map((t, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 w-40 truncate capitalize">{t.question_type.replace('_', ' ')}</span>
                        <div className="flex-1 h-3 rounded bg-slate-700 overflow-hidden">
                          <div
                            className={`h-full rounded transition-all ${t.pct >= 70 ? 'bg-emerald-500' : t.pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${t.pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-300 w-12 text-right">{t.correct}/{t.total}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Strengths / Weaknesses */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-semibold text-emerald-300 mb-1">Strengths</h4>
                    <ul className="text-xs text-gray-300 space-y-0.5">
                      {(reportData.strengths ?? []).map((s, i) => <li key={i}>✓ {s}</li>)}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-red-300 mb-1">Areas for Improvement</h4>
                    <ul className="text-xs text-gray-300 space-y-0.5">
                      {(reportData.weaknesses ?? []).map((w, i) => <li key={i}>△ {w}</li>)}
                    </ul>
                  </div>
                </div>

                <button onClick={() => { setShowReport(false); setReportData(null); }} className={`${btnPrimary} w-full`}>
                  Close Report
                </button>
              </div>
            ) : (
              <div className="text-center text-gray-400 py-8">No report data</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdmissionHub;
