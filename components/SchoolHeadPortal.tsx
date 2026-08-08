import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ToastMessage } from '../types';
import { listSchoolMembers, type SchoolMember } from '../services/schoolAdminService';
import {
  getSchoolHeadSnapshot,
  listSchoolGovernanceAudit,
  transferSchoolHeadOwnership,
  type SchoolGovernanceAuditEntry,
  type SchoolHeadDecision,
  type SchoolHeadSnapshot,
  type SchoolHeadTab,
} from '../services/schoolHeadService';
import { SchoolBrand } from '../src/components/SchoolBrand';
import { createSchoolBrand } from '../src/lib/schoolBranding';
import '../src/styles/school-head.css';

interface SchoolHeadPortalProps {
  schoolId: string;
  onLogout: () => void;
  onOpenAdministration: (adminTab?: string) => void;
  onOpenTeacherPortal?: () => void;
  addToast: (message: string, type: ToastMessage['type']) => void;
}

const HEAD_TABS: Array<{ id: SchoolHeadTab; label: string; shortLabel: string; code: string }> = [
  { id: 'overview', label: 'Executive Overview', shortLabel: 'Overview', code: 'EO' },
  { id: 'decisions', label: 'Decision Center', shortLabel: 'Decisions', code: 'DC' },
  { id: 'academic', label: 'Academic Performance', shortLabel: 'Academic', code: 'AP' },
  { id: 'people', label: 'People & Structure', shortLabel: 'People', code: 'PS' },
  { id: 'programs', label: 'Programs', shortLabel: 'Programs', code: 'PR' },
  { id: 'subscription', label: 'Subscription & Value', shortLabel: 'Plan', code: 'SV' },
  { id: 'governance', label: 'Governance & Audit', shortLabel: 'Audit', code: 'GA' },
];

const VALID_HEAD_TABS = new Set<SchoolHeadTab>(HEAD_TABS.map(({ id }) => id));

const formatPercent = (value: number | null): string => value === null ? 'No data' : `${Math.round(value * 10) / 10}%`;
const ratioPercent = (value: number, total: number): number => total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
const formatPlan = (value: string): string => value ? value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'No plan';
const formatDate = (value: string | null): string => {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not scheduled' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};
const formatDateTime = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const MetricCard: React.FC<{
  label: string;
  value: React.ReactNode;
  note: string;
  tone?: 'healthy' | 'monitor' | 'action' | 'neutral';
}> = ({ label, value, note, tone = 'neutral' }) => (
  <article className={`school-head-metric school-head-tone-${tone}`}>
    <div className="school-head-metric-status" aria-hidden="true" />
    <span>{label}</span>
    <strong>{value}</strong>
    <small>{note}</small>
  </article>
);

const ProgressLine: React.FC<{ label: string; value: number; total: number; note?: string }> = ({ label, value, total, note }) => {
  const percent = ratioPercent(value, total);
  return (
    <div className="school-head-progress-row">
      <div><strong>{label}</strong><span>{value} of {total}{note ? ` · ${note}` : ''}</span></div>
      <b>{percent}%</b>
      <div className="school-head-progress-track" aria-label={`${label}: ${percent}%`}><i style={{ width: `${percent}%` }} /></div>
    </div>
  );
};

const DecisionCard: React.FC<{ decision: SchoolHeadDecision; onOpen: (tab: SchoolHeadTab) => void }> = ({ decision, onOpen }) => (
  <article className={`school-head-decision is-${decision.severity}`}>
    <div className="school-head-decision-count">{decision.count}</div>
    <div>
      <span>{decision.severity === 'critical' ? 'Action required' : decision.severity === 'warning' ? 'Monitor closely' : 'For review'}</span>
      <h3>{decision.title}</h3>
      <p>{decision.description}</p>
    </div>
    <button type="button" onClick={() => onOpen(decision.destination)}>{decision.action}<span aria-hidden="true">→</span></button>
  </article>
);

const EmptyState: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="school-head-empty"><span aria-hidden="true">✓</span><h3>{title}</h3><p>{children}</p></div>
);

const SchoolHeadPortal: React.FC<SchoolHeadPortalProps> = ({
  schoolId,
  onLogout,
  onOpenAdministration,
  onOpenTeacherPortal,
  addToast,
}) => {
  const initialTab = useMemo<SchoolHeadTab>(() => {
    const value = new URLSearchParams(window.location.search).get('headTab') as SchoolHeadTab | null;
    return value && VALID_HEAD_TABS.has(value) ? value : 'overview';
  }, []);
  const [activeTab, setActiveTab] = useState<SchoolHeadTab>(initialTab);
  const [periodDays, setPeriodDays] = useState(30);
  const [snapshot, setSnapshot] = useState<SchoolHeadSnapshot | null>(null);
  const [audit, setAudit] = useState<SchoolGovernanceAuditEntry[]>([]);
  const [schoolAdmins, setSchoolAdmins] = useState<SchoolMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auditFilter, setAuditFilter] = useState('all');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTarget, setTransferTarget] = useState('');
  const [transferConfirmation, setTransferConfirmation] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [transferBusy, setTransferBusy] = useState(false);

  const load = useCallback(async (options: { silent?: boolean } = {}) => {
    if (options.silent) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const [snapshotResult, auditResult, adminResult] = await Promise.allSettled([
        getSchoolHeadSnapshot(schoolId, periodDays),
        listSchoolGovernanceAudit(schoolId, { limit: 75 }),
        listSchoolMembers(schoolId, { role: 'school_admin', limit: 100 }),
      ]);
      if (snapshotResult.status === 'rejected') throw snapshotResult.reason;
      setSnapshot(snapshotResult.value);
      setAudit(auditResult.status === 'fulfilled' ? auditResult.value : []);
      setSchoolAdmins(adminResult.status === 'fulfilled'
        ? adminResult.value.members.filter((member) => !member.is_owner)
        : []);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Executive data could not be loaded.';
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [periodDays, schoolId]);

  useEffect(() => { void load(); }, [load]);

  const selectTab = useCallback((tab: SchoolHeadTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'school_head');
    url.searchParams.set('headTab', tab);
    url.searchParams.delete('adminTab');
    window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const value = new URLSearchParams(window.location.search).get('headTab') as SchoolHeadTab | null;
      setActiveTab(value && VALID_HEAD_TABS.has(value) ? value : 'overview');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const openAdministration = useCallback((tab?: string) => onOpenAdministration(tab), [onOpenAdministration]);

  const academicTrend = useMemo(() => {
    if (!snapshot || snapshot.academics.average === null || snapshot.academics.previous_average === null) return null;
    return Math.round((snapshot.academics.average - snapshot.academics.previous_average) * 10) / 10;
  }, [snapshot]);

  const filteredAudit = useMemo(() => (
    auditFilter === 'all' ? audit : audit.filter((entry) => entry.category === auditFilter)
  ), [audit, auditFilter]);

  const handleTransfer = async () => {
    if (!snapshot || !transferTarget) return;
    setTransferBusy(true);
    const result = await transferSchoolHeadOwnership({
      schoolId,
      newHeadUserId: transferTarget,
      confirmationText: transferConfirmation,
      reason: transferReason,
    });
    setTransferBusy(false);
    if (!result.success) {
      addToast(result.error || 'Ownership could not be transferred.', 'error');
      return;
    }
    addToast(result.message || 'School Head ownership transferred.', 'success');
    setShowTransfer(false);
    openAdministration('dashboard');
  };

  if (loading) {
    return (
      <main className="school-head-portal school-head-loading" aria-busy="true">
        <div className="school-head-loading-mark">BH</div>
        <p>Preparing your executive briefing…</p>
        <div className="school-head-loading-line"><i /></div>
      </main>
    );
  }

  if (error || !snapshot) {
    return (
      <main className="school-head-portal school-head-error">
        <section><span>Executive access unavailable</span><h1>We could not verify this School Head workspace.</h1><p>{error || 'The executive response was incomplete.'}</p><div><button type="button" onClick={() => void load()}>Try again</button><button type="button" onClick={onLogout}>Sign out</button></div></section>
      </main>
    );
  }

  const studentActivityRate = ratioPercent(snapshot.engagement.active_students_7d, snapshot.totals.students);
  const teacherActivityRate = ratioPercent(snapshot.engagement.active_teachers_7d, snapshot.totals.teachers);
  const seatPercent = snapshot.subscription.seat_limit
    ? ratioPercent(snapshot.subscription.seats_used, snapshot.subscription.seat_limit)
    : null;

  const renderOverview = () => (
    <div className="school-head-page">
      <section className="school-head-briefing">
        <div>
          <p className="school-head-kicker">Executive briefing · {snapshot.period.days}-day view</p>
          <h2>{snapshot.school.name} at a glance</h2>
          <p>Performance, participation, staffing and decisions that need senior attention.</p>
        </div>
        <div className="school-head-briefing-score">
          <span>Priority items</span><strong>{snapshot.decisions.length}</strong><small>{snapshot.decisions.some((item) => item.severity === 'critical') ? 'Action required' : 'No critical issues'}</small>
        </div>
      </section>

      <section className="school-head-metric-grid" aria-label="Executive school indicators">
        <MetricCard label="Students" value={snapshot.totals.students} note={`${snapshot.engagement.active_students_7d} active in 7 days`} tone={studentActivityRate >= 75 ? 'healthy' : studentActivityRate >= 50 ? 'monitor' : 'action'} />
        <MetricCard label="Teaching staff" value={snapshot.totals.teachers} note={`${snapshot.engagement.active_teachers_7d} active in 7 days`} tone={teacherActivityRate >= 75 ? 'healthy' : 'monitor'} />
        <MetricCard label="Academic average" value={formatPercent(snapshot.academics.average)} note={academicTrend === null ? 'First comparable period' : `${academicTrend >= 0 ? '+' : ''}${academicTrend}% vs previous period`} tone={academicTrend === null || academicTrend >= 0 ? 'healthy' : academicTrend > -5 ? 'monitor' : 'action'} />
        <MetricCard label="Assignment completion" value={formatPercent(snapshot.academics.completion_rate)} note={`${snapshot.academics.assignment_completed} of ${snapshot.academics.assignment_total} completed`} tone={(snapshot.academics.completion_rate ?? 100) >= 75 ? 'healthy' : 'monitor'} />
        <MetricCard label="Classes covered" value={`${snapshot.structure.covered_classes}/${snapshot.totals.classes}`} note="Active teaching coverage" tone={snapshot.structure.covered_classes === snapshot.totals.classes ? 'healthy' : 'action'} />
        <MetricCard label="Student placement" value={`${snapshot.structure.placed_students}/${snapshot.totals.students}`} note="Connected to an active class" tone={snapshot.structure.placed_students === snapshot.totals.students ? 'healthy' : 'action'} />
      </section>

      <div className="school-head-overview-grid">
        <section className="school-head-panel school-head-priority-panel">
          <div className="school-head-panel-heading"><div><p>Decision Center</p><h3>What needs your attention</h3></div><button type="button" onClick={() => selectTab('decisions')}>View all</button></div>
          {snapshot.decisions.length ? <div className="school-head-priority-list">{snapshot.decisions.slice(0, 4).map((decision) => (
            <button type="button" key={decision.id} onClick={() => selectTab(decision.destination)} className={`is-${decision.severity}`}>
              <span>{decision.count}</span><div><strong>{decision.title}</strong><small>{decision.description}</small></div><b aria-hidden="true">→</b>
            </button>
          ))}</div> : <EmptyState title="No urgent decisions">The current indicators are healthy. Keep monitoring trends and recent governance events.</EmptyState>}
        </section>

        <section className="school-head-panel">
          <div className="school-head-panel-heading"><div><p>Operational readiness</p><h3>School structure</h3></div></div>
          <div className="school-head-progress-list">
            <ProgressLine label="Students placed" value={snapshot.structure.placed_students} total={snapshot.totals.students} />
            <ProgressLine label="Classes covered" value={snapshot.structure.covered_classes} total={snapshot.totals.classes} />
            <ProgressLine label="Teachers assigned" value={snapshot.structure.assigned_teachers} total={snapshot.totals.teachers} />
            <ProgressLine label="Students active this month" value={snapshot.engagement.active_students_30d} total={snapshot.totals.students} />
          </div>
          <button type="button" className="school-head-secondary-action" onClick={() => selectTab('people')}>Review people and structure</button>
        </section>
      </div>

      <section className="school-head-panel school-head-program-strip">
        <div className="school-head-panel-heading"><div><p>Enabled intelligence</p><h3>Program pulse</h3></div><button type="button" onClick={() => selectTab('programs')}>Open programs</button></div>
        <div><article><span>Cambridge</span><strong>{snapshot.programs.cambridge_attempts}</strong><small>assessment attempts in period</small></article><article><span>Writing Hub</span><strong>{snapshot.programs.writing_students}</strong><small>students with writing profiles</small></article><article><span>IELTS</span><strong>{snapshot.programs.ielts_students}</strong><small>school-linked learners</small></article><article><span>Admissions</span><strong>{snapshot.programs.admission_candidates}</strong><small>candidate records</small></article></div>
      </section>
    </div>
  );

  const renderDecisions = () => (
    <div className="school-head-page">
      <section className="school-head-page-heading"><div><p className="school-head-kicker">Decision Center</p><h2>Senior attention, clearly prioritised</h2><p>Only material issues are shown here. Operational alerts remain in the administration workspace.</p></div><span className="school-head-heading-count">{snapshot.decisions.length} open</span></section>
      {snapshot.decisions.length ? <section className="school-head-decision-list">{snapshot.decisions.map((decision) => <DecisionCard key={decision.id} decision={decision} onOpen={selectTab} />)}</section> : <EmptyState title="Everything important is under control">There are no executive-level decision items in the current snapshot.</EmptyState>}
      <section className="school-head-assurance"><div><span>Healthy</span><strong>Every decision is generated from school-scoped records.</strong><p>No cross-school or unverified profile data is used.</p></div><div><span>Traceable</span><strong>Sensitive changes are written to governance history.</strong><p>Actor, target, reason and timestamp stay visible to the School Head.</p></div><div><span>Delegated</span><strong>Daily operations remain with school administrators.</strong><p>The Head retains final authority without becoming a daily operator.</p></div></section>
    </div>
  );

  const renderAcademic = () => (
    <div className="school-head-page">
      <section className="school-head-page-heading"><div><p className="school-head-kicker">Academic performance</p><h2>Outcomes and engagement</h2><p>Aggregated school intelligence for the last {snapshot.period.days} days. Individual records remain in controlled operational reports.</p></div><div className="school-head-trend"><span>Average trend</span><strong>{academicTrend === null ? '—' : `${academicTrend >= 0 ? '+' : ''}${academicTrend}%`}</strong><small>vs previous {snapshot.period.days} days</small></div></section>
      <section className="school-head-metric-grid school-head-metric-grid-four">
        <MetricCard label="Assessment average" value={formatPercent(snapshot.academics.average)} note="Cambridge and recorded quizzes" tone={(snapshot.academics.average ?? 100) >= 70 ? 'healthy' : 'monitor'} />
        <MetricCard label="Completion rate" value={formatPercent(snapshot.academics.completion_rate)} note={`${snapshot.academics.assignment_total} assignment records`} tone={(snapshot.academics.completion_rate ?? 100) >= 75 ? 'healthy' : 'monitor'} />
        <MetricCard label="Weekly learners" value={snapshot.engagement.active_students_7d} note={`${studentActivityRate}% of active students`} tone={studentActivityRate >= 70 ? 'healthy' : 'monitor'} />
        <MetricCard label="Needs re-engagement" value={snapshot.engagement.inactive_students_14d} note="Inactive for 14+ days" tone={snapshot.engagement.inactive_students_14d ? 'action' : 'healthy'} />
      </section>
      <section className="school-head-panel">
        <div className="school-head-panel-heading"><div><p>Grade view</p><h3>Performance by grade</h3></div><span>Current active class placement</span></div>
        {snapshot.academics.grade_performance.length ? <div className="school-head-grade-table" role="table" aria-label="Performance by grade">
          <div role="row" className="school-head-grade-header"><span role="columnheader">Grade</span><span role="columnheader">Students</span><span role="columnheader">Assessments</span><span role="columnheader">Average</span><span role="columnheader">Performance</span></div>
          {snapshot.academics.grade_performance.map((grade) => <div role="row" key={grade.grade} className="school-head-grade-row"><strong role="cell">Grade {grade.grade}</strong><span role="cell">{grade.students}</span><span role="cell">{grade.assessments}</span><b role="cell">{formatPercent(grade.average)}</b><div role="cell" className="school-head-grade-bar"><i style={{ width: `${Math.max(0, Math.min(100, grade.average ?? 0))}%` }} /></div></div>)}
        </div> : <EmptyState title="No grade performance yet">Assessment results will appear here after school-linked students complete recorded tests.</EmptyState>}
      </section>
      <section className="school-head-callout"><div><p>Privacy-aware drill-down</p><h3>Need individual or class-level detail?</h3><span>Open controlled academic reports in the administration workspace. Sensitive access remains scoped and auditable.</span></div><button type="button" onClick={() => openAdministration('cambridge')}>Open assessment reports</button></section>
    </div>
  );

  const renderPeople = () => (
    <div className="school-head-page">
      <section className="school-head-page-heading"><div><p className="school-head-kicker">People & structure</p><h2>Coverage, delegation and accountability</h2><p>A governance view of the school organisation. Daily roster changes remain in Operational Administration.</p></div><button type="button" className="school-head-primary-action" onClick={() => openAdministration('members')}>Open administration</button></section>
      <section className="school-head-structure-grid">
        <article><span>Students</span><strong>{snapshot.totals.students}</strong><ProgressLine label="Placed in classes" value={snapshot.structure.placed_students} total={snapshot.totals.students} /></article>
        <article><span>Teaching staff</span><strong>{snapshot.totals.teachers}</strong><ProgressLine label="With active assignments" value={snapshot.structure.assigned_teachers} total={snapshot.totals.teachers} /></article>
        <article><span>Active classes</span><strong>{snapshot.totals.classes}</strong><ProgressLine label="With teaching coverage" value={snapshot.structure.covered_classes} total={snapshot.totals.classes} /></article>
      </section>
      <div className="school-head-two-column">
        <section className="school-head-panel">
          <div className="school-head-panel-heading"><div><p>Leadership team</p><h3>School administrators</h3></div><span>{snapshot.totals.admins} total</span></div>
          <div className="school-head-leadership-list">
            <article className="is-head"><span>{snapshot.head?.name.slice(0, 1).toUpperCase() || 'H'}</span><div><strong>{snapshot.head?.name || 'School Head'}</strong><small>Primary School Head · protected owner</small></div><b>HEAD</b></article>
            {schoolAdmins.map((admin) => <article key={admin.user_id}><span>{admin.username.slice(0, 1).toUpperCase()}</span><div><strong>{admin.full_name || admin.username}</strong><small>Delegated school administrator{admin.can_teach ? ' · teaching access' : ''}</small></div><b>ADMIN</b></article>)}
          </div>
        </section>
        <section className="school-head-panel">
          <div className="school-head-panel-heading"><div><p>Authority model</p><h3>Reserved Head privileges</h3></div></div>
          <ul className="school-head-authority-list"><li><span>✓</span><div><strong>Appoint or remove delegated administrators</strong><small>Daily staff and class operations can be delegated.</small></div></li><li><span>✓</span><div><strong>Full subscription and value visibility</strong><small>Billing authority is not inherited by ordinary admins.</small></div></li><li><span>✓</span><div><strong>School-wide governance history</strong><small>Sensitive events remain visible and immutable to school users.</small></div></li><li><span>✓</span><div><strong>Protected ownership transfer</strong><small>Requires an eligible admin, exact confirmation and a reason.</small></div></li></ul>
        </section>
      </div>
      <section className="school-head-operation-grid"><button type="button" onClick={() => openAdministration('members')}><span>People</span><strong>Staff & students</strong><small>Roles, access, moderation and member records.</small></button><button type="button" onClick={() => openAdministration('teachers')}><span>Coverage</span><strong>Teacher assignments</strong><small>Class, subject and teaching responsibility.</small></button><button type="button" onClick={() => openAdministration('classes')}><span>Structure</span><strong>Classes & registration</strong><small>Academic years, classes and student placement.</small></button><button type="button" onClick={() => openAdministration('subjects')}><span>Curriculum</span><strong>Subjects</strong><small>School curriculum and active subject records.</small></button></section>
    </div>
  );

  const programCards = [
    { name: 'Cambridge Assessments', metric: snapshot.programs.cambridge_attempts, label: `attempts in ${snapshot.period.days} days`, description: 'School-wide assessment performance, readiness and verified student results.', tab: 'cambridge' },
    { name: 'Writing Hub', metric: snapshot.programs.writing_students, label: 'students with profiles', description: 'Writing growth, feedback coverage and recurring support needs.', tab: 'documents' },
    { name: 'IELTS Programme', metric: snapshot.programs.ielts_students, label: 'school-linked learners', description: 'Exam participation, assignment progress, reviews and result intelligence.', tab: 'ielts' },
    { name: 'Admission Hub', metric: snapshot.programs.admission_candidates, label: `${snapshot.admissions.pending_candidates} awaiting progress`, description: 'Candidates, diagnostics, placement evidence and admission workflow.', tab: 'admissions' },
  ];

  const renderPrograms = () => (
    <div className="school-head-page">
      <section className="school-head-page-heading"><div><p className="school-head-kicker">Programs</p><h2>One executive view across Brain Heist</h2><p>Only active programme signals appear in your briefing. Operational tools remain with the teams responsible for delivery.</p></div></section>
      <section className="school-head-program-grid">{programCards.map((program) => <article key={program.name}><div><span>{program.name.split(' ').map((word) => word[0]).join('').slice(0, 2)}</span><b>School programme</b></div><strong>{program.metric}</strong><small>{program.label}</small><p>{program.description}</p><button type="button" onClick={() => openAdministration(program.tab)}>Open programme <span aria-hidden="true">→</span></button></article>)}</section>
      <section className="school-head-panel school-head-admission-summary"><div className="school-head-panel-heading"><div><p>Admissions intelligence</p><h3>Candidate pipeline</h3></div></div><div><MetricCard label="Candidates" value={snapshot.admissions.total_candidates} note="All candidate records" /><MetricCard label="Awaiting progress" value={snapshot.admissions.pending_candidates} note="Active review stages" tone={snapshot.admissions.pending_candidates ? 'monitor' : 'healthy'} /><MetricCard label="Tests completed" value={snapshot.admissions.completed_attempts} note="Submitted diagnostic attempts" /><MetricCard label="Diagnostic average" value={formatPercent(snapshot.admissions.average)} note="Completed admission tests" /></div></section>
    </div>
  );

  const renderSubscription = () => (
    <div className="school-head-page">
      <section className="school-head-page-heading"><div><p className="school-head-kicker">Subscription & value</p><h2>Plan ownership and capacity</h2><p>This page is reserved for the School Head. Delegated administrators can see operational limits but not governance controls.</p></div><span className="school-head-exclusive">Head authority</span></section>
      <section className="school-head-subscription-hero"><div><span>Current plan</span><h3>{formatPlan(snapshot.subscription.plan)}</h3><p>{formatPlan(snapshot.subscription.status)}{snapshot.subscription.billing_interval ? ` · ${formatPlan(snapshot.subscription.billing_interval)} billing` : ''}</p></div><dl><div><dt>Current period ends</dt><dd>{formatDate(snapshot.subscription.current_period_end)}</dd></div><div><dt>Seats used</dt><dd>{snapshot.subscription.seats_used}{snapshot.subscription.seat_limit ? ` / ${snapshot.subscription.seat_limit}` : ''}</dd></div><div><dt>Renewal status</dt><dd>{snapshot.subscription.cancel_at_period_end ? 'Set to end' : 'Continuing'}</dd></div></dl></section>
      <div className="school-head-two-column">
        <section className="school-head-panel"><div className="school-head-panel-heading"><div><p>Capacity</p><h3>Student seat usage</h3></div>{seatPercent !== null && <span>{seatPercent}% used</span>}</div>{snapshot.subscription.seat_limit ? <div className="school-head-seat-visual"><div><i style={{ width: `${seatPercent}%` }} /></div><p><strong>{Math.max(snapshot.subscription.seat_limit - snapshot.subscription.seats_used, 0)}</strong> seats available</p></div> : <EmptyState title="No seat limit recorded">Your current school plan does not expose a fixed student limit.</EmptyState>}</section>
        <section className="school-head-panel"><div className="school-head-panel-heading"><div><p>Value signals</p><h3>Current adoption</h3></div></div><ul className="school-head-value-list"><li><span>{studentActivityRate}%</span><div><strong>Weekly student adoption</strong><small>{snapshot.engagement.active_students_7d} active students</small></div></li><li><span>{teacherActivityRate}%</span><div><strong>Weekly staff adoption</strong><small>{snapshot.engagement.active_teachers_7d} active teaching staff</small></div></li><li><span>{snapshot.programs.cambridge_attempts}</span><div><strong>Assessment activity</strong><small>Recorded attempts in the reporting period</small></div></li></ul></section>
      </div>
      {snapshot.subscription.cancel_at_period_end && <section className="school-head-critical-banner"><div><span>Action required</span><h3>The subscription is scheduled to end.</h3><p>Review the billing record before the current period closes to avoid interruption.</p></div><button type="button" onClick={() => openAdministration('billing')}>Review billing</button></section>}
      <section className="school-head-callout"><div><p>Billing operations</p><h3>Invoices, checkout and plan management</h3><span>Continue in the secure operational billing page when you need to change the subscription.</span></div><button type="button" onClick={() => openAdministration('billing')}>Open Plan & Billing</button></section>
    </div>
  );

  const renderGovernance = () => (
    <div className="school-head-page">
      <section className="school-head-page-heading"><div><p className="school-head-kicker">Governance & audit</p><h2>Permanent accountability</h2><p>Role changes, ownership actions, school configuration and billing events are recorded with their actor and timestamp.</p></div><button type="button" className="school-head-danger-action" onClick={() => setShowTransfer(true)}>Transfer School Head</button></section>
      <section className="school-head-governance-summary"><article><span>Primary authority</span><strong>{snapshot.head?.name || 'School Head'}</strong><small>One protected Head per school</small></article><article><span>Delegated administrators</span><strong>{schoolAdmins.length}</strong><small>Managed by the School Head</small></article><article><span>Recorded events</span><strong>{audit.length}</strong><small>Latest governance history</small></article></section>
      <section className="school-head-panel">
        <div className="school-head-panel-heading school-head-audit-heading"><div><p>Governance ledger</p><h3>Recent sensitive activity</h3></div><label><span>Filter</span><select value={auditFilter} onChange={(event) => setAuditFilter(event.target.value)}><option value="all">All categories</option><option value="ownership">Ownership</option><option value="people">People</option><option value="school">School</option><option value="billing">Billing</option><option value="security">Security</option><option value="academic">Academic</option><option value="admissions">Admissions</option></select></label></div>
        {filteredAudit.length ? <div className="school-head-audit-list">{filteredAudit.map((entry) => <article key={entry.id}><div className={`school-head-audit-mark is-${entry.severity}`} aria-hidden="true" /><div><div><span>{formatPlan(entry.category)}</span><time dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time></div><h4>{entry.summary}</h4><p>{entry.actor?.name ? `By ${entry.actor.name}` : 'System event'}{entry.target?.name ? ` · Affected: ${entry.target.name}` : ''}</p>{entry.reason && <blockquote>Reason: {entry.reason}</blockquote>}</div></article>)}</div> : <EmptyState title="No events in this category">New sensitive actions will appear here automatically.</EmptyState>}
      </section>
      <section className="school-head-governance-note"><span>Security model</span><p>Governance records are private to this school, visible only to the active School Head or platform superadmin, and not writable through the browser.</p></section>
    </div>
  );

  const renderActiveTab = () => {
    if (activeTab === 'overview') return renderOverview();
    if (activeTab === 'decisions') return renderDecisions();
    if (activeTab === 'academic') return renderAcademic();
    if (activeTab === 'people') return renderPeople();
    if (activeTab === 'programs') return renderPrograms();
    if (activeTab === 'subscription') return renderSubscription();
    return renderGovernance();
  };

  return (
    <div className="school-head-portal" data-testid="school-head-portal">
      <header className="school-head-header">
        <div className="school-head-brand">
          <SchoolBrand brand={createSchoolBrand({ schoolId: snapshot.school.id, schoolName: snapshot.school.name, schoolLogoUrl: snapshot.school.logo_url })} showName={false} imageClassName="school-head-school-logo" />
          <div><p>Brains Heist · Executive Intelligence</p><h1>{snapshot.school.name}</h1><span>School Head workspace</span></div>
        </div>
        <div className="school-head-header-actions">
          <label><span>Reporting window</span><select value={periodDays} onChange={(event) => setPeriodDays(Number(event.target.value))}><option value={30}>Last 30 days</option><option value={60}>Last 60 days</option><option value={90}>Last 90 days</option></select></label>
          <button type="button" onClick={() => void load({ silent: true })} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh data'}</button>
          <button type="button" className="school-head-menu-button" onClick={() => setMobileMenuOpen((open) => !open)} aria-expanded={mobileMenuOpen} aria-label="Open executive navigation">Menu</button>
          <button type="button" className="school-head-signout" onClick={onLogout}>Sign out</button>
        </div>
      </header>

      <div className="school-head-layout">
        <aside className={mobileMenuOpen ? 'is-open' : ''} aria-label="School Head navigation">
          <div className="school-head-profile"><div>{snapshot.head?.name.slice(0, 1).toUpperCase() || 'H'}</div><span><strong>{snapshot.head?.name || 'School Head'}</strong><small>Primary decision maker</small></span><b>HEAD</b></div>
          <nav>{HEAD_TABS.map((tab) => <button type="button" key={tab.id} className={activeTab === tab.id ? 'is-active' : ''} aria-current={activeTab === tab.id ? 'page' : undefined} onClick={() => selectTab(tab.id)}><span>{tab.code}</span>{tab.label}{tab.id === 'decisions' && snapshot.decisions.length > 0 && <b>{snapshot.decisions.length}</b>}</button>)}</nav>
          <div className="school-head-sidebar-actions"><p>Workspaces</p><button type="button" onClick={() => openAdministration('dashboard')}>Operational Administration <span>→</span></button>{onOpenTeacherPortal && <button type="button" onClick={onOpenTeacherPortal}>Teacher Workspace <span>→</span></button>}</div>
          <div className="school-head-security"><span aria-hidden="true">◆</span><div><strong>School-isolated data</strong><small>Executive access verified by active ownership.</small></div></div>
        </aside>

        <main className="school-head-content">
          <div className="school-head-data-stamp"><span><i /> Live school records</span><time dateTime={snapshot.generated_at}>Updated {formatDateTime(snapshot.generated_at)}</time></div>
          {renderActiveTab()}
        </main>
      </div>

      <nav className="school-head-mobile-nav" aria-label="School Head mobile navigation">{HEAD_TABS.slice(0, 4).map((tab) => <button type="button" key={tab.id} className={activeTab === tab.id ? 'is-active' : ''} onClick={() => selectTab(tab.id)}><span>{tab.code}</span><small>{tab.shortLabel}</small></button>)}<button type="button" className={!HEAD_TABS.slice(0, 4).some((tab) => tab.id === activeTab) ? 'is-active' : ''} onClick={() => setMobileMenuOpen(true)}><span>•••</span><small>More</small></button></nav>

      {showTransfer && <div className="school-head-modal-layer" role="dialog" aria-modal="true" aria-labelledby="school-head-transfer-title">
        <button type="button" className="school-head-modal-backdrop" aria-label="Close ownership transfer" onClick={() => !transferBusy && setShowTransfer(false)} />
        <section className="school-head-transfer-modal">
          <div className="school-head-transfer-warning"><span>High-risk action</span><h2 id="school-head-transfer-title">Transfer School Head ownership</h2><p>The selected administrator becomes the only School Head. You will remain a delegated administrator and lose executive billing, governance and ownership authority.</p></div>
          <div className="school-head-transfer-fields">
            <label><span>New School Head</span><select value={transferTarget} onChange={(event) => setTransferTarget(event.target.value)}><option value="">Select an active administrator</option>{schoolAdmins.map((admin) => <option value={admin.user_id} key={admin.user_id}>{admin.full_name || admin.username} · {admin.email}</option>)}</select><small>Only existing active delegated administrators are eligible.</small></label>
            <label><span>Reason for transfer</span><textarea value={transferReason} onChange={(event) => setTransferReason(event.target.value)} rows={3} maxLength={1000} placeholder="Explain why ownership is being transferred…" /><small>Minimum 12 characters. This becomes part of the permanent audit record.</small></label>
            <label><span>Type the exact school name to confirm</span><input value={transferConfirmation} onChange={(event) => setTransferConfirmation(event.target.value)} autoComplete="off" placeholder={snapshot.school.name} /><small>{snapshot.school.name}</small></label>
          </div>
          <div className="school-head-transfer-actions"><button type="button" onClick={() => setShowTransfer(false)} disabled={transferBusy}>Cancel</button><button type="button" onClick={() => void handleTransfer()} disabled={transferBusy || !transferTarget || transferReason.trim().length < 12 || transferConfirmation.trim() !== snapshot.school.name}>{transferBusy ? 'Transferring…' : 'Transfer ownership permanently'}</button></div>
        </section>
      </div>}
    </div>
  );
};

export default SchoolHeadPortal;
