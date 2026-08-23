import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GuardianChild, GuardianChildProgress } from '../../services/guardianService';
import { SchoolBrand } from '../../src/components/SchoolBrand';
import { createSchoolBrand, PRODUCT_LOGO_URL, PRODUCT_NAME } from '../../src/lib/schoolBranding';
import { useSmartCollapsedNavigation } from '../../src/hooks/useSmartCollapsedNavigation';
import ParentLearningTrendChart from './ParentLearningTrendChart';
import './ParentDashboardPremium.css';
import './ParentDashboardPremiumTabs.css';
import './ParentDashboardPremiumMobileFixes.css';

const fmtDate = (value?: string | null) => value
  ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  : '—';

const trendLabelForSubject = (subject: GuardianChildProgress['subjects'][number]) => {
  if (subject.improving_count > subject.persistent_focus_count) return { label: 'Up', tone: 'up' as const };
  if (subject.persistent_focus_count > subject.improving_count) return { label: 'Focus', tone: 'down' as const };
  return { label: 'Steady', tone: 'steady' as const };
};

const progressTone = (progress: GuardianChildProgress) => {
  const support = progress.summary.persistent_focus_count + progress.summary.recurring_focus_count;
  if (progress.summary.improving_count > support) return { label: 'Improving', tone: 'up' as const };
  if (support > progress.summary.improving_count) return { label: 'Needs focus', tone: 'down' as const };
  return { label: 'Steady', tone: 'steady' as const };
};

const focusLabel = (item: { skill: string; subskill?: string | null }) => item.subskill || item.skill;

const recommendationCopy = (item: GuardianChildProgress['focus_areas'][number]) => {
  const evidence = item.evidence_items === 1 ? '1 assessed activity' : `${item.evidence_items} assessed activities`;
  const label = focusLabel(item).toLowerCase();
  if (item.priority === 'high') return `Prioritise ${label} in ${item.subject}. This need has appeared across ${evidence}.`;
  if (item.status === 'persistent') return `Keep revisiting ${label} in ${item.subject} with short, regular practice.`;
  return `Add focused practice for ${label} in ${item.subject} this week.`;
};

type IconName = 'home' | 'academics' | 'progress' | 'focus' | 'profile' | 'chevron' | 'check' | 'alert' | 'down' | 'workspace';

const Icon: React.FC<{ name: IconName }> = ({ name }) => {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {name === 'home' ? <><path {...common} d="M3.5 10.5 12 3.8l8.5 6.7"/><path {...common} d="M5.5 9.8v10.1h13V9.8M9.5 19.9v-6h5v6"/></> : null}
    {name === 'academics' ? <><path {...common} d="M4 5.2c2.8-.8 5.3-.4 8 1.4v13c-2.7-1.8-5.2-2.2-8-1.4z"/><path {...common} d="M20 5.2c-2.8-.8-5.3-.4-8 1.4v13c2.7-1.8 5.2-2.2 8-1.4z"/></> : null}
    {name === 'progress' ? <><path {...common} d="M4 18.5V13M10 18.5V9M16 18.5V5M3 20h18"/></> : null}
    {name === 'focus' ? <><circle {...common} cx="12" cy="12" r="7.4"/><circle {...common} cx="12" cy="12" r="3.2"/><path {...common} d="m14.3 9.7 5.1-5.1M16.8 4.6h2.6v2.6"/></> : null}
    {name === 'profile' ? <><circle {...common} cx="12" cy="8.2" r="3.2"/><path {...common} d="M5.2 20c.7-4 3-6.1 6.8-6.1s6.1 2.1 6.8 6.1"/></> : null}
    {name === 'chevron' ? <path {...common} d="m9 6 6 6-6 6"/> : null}
    {name === 'down' ? <path {...common} d="m6.5 9 5.5 5.5L17.5 9"/> : null}
    {name === 'check' ? <path {...common} d="m5 12.5 4.1 4.1L19 6.7"/> : null}
    {name === 'alert' ? <><path {...common} d="M12 3.8 21 20H3z"/><path {...common} d="M12 9v4.5M12 17h.01"/></> : null}
    {name === 'workspace' ? <><rect {...common} x="4" y="4" width="6" height="6" rx="1.3"/><rect {...common} x="14" y="4" width="6" height="6" rx="1.3"/><rect {...common} x="4" y="14" width="6" height="6" rx="1.3"/><rect {...common} x="14" y="14" width="6" height="6" rx="1.3"/></> : null}
  </svg>;
};

const SubjectGlyph: React.FC<{ index: number }> = ({ index }) => {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return <span className={`parent-premium-subject-glyph glyph-${index % 4}`} aria-hidden="true">
    <svg viewBox="0 0 24 24">
      {index % 3 === 0 ? <><path {...common} d="M5 5.5c2.6-.8 4.7-.4 7 1.2v12c-2.3-1.6-4.4-2-7-1.2z"/><path {...common} d="M19 5.5c-2.6-.8-4.7-.4-7 1.2v12c2.3-1.6 4.4-2 7-1.2z"/></> : null}
      {index % 3 === 1 ? <><path {...common} d="M18 5H8l5 7-5 7h10"/><path {...common} d="M6 5h1M6 19h1"/></> : null}
      {index % 3 === 2 ? <><path {...common} d="M9 3.8h6M10 3.8v5.1l-5 8.6a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-8.6V3.8"/><path {...common} d="M7.8 15h8.4"/></> : null}
    </svg>
  </span>;
};

const ChildAvatar: React.FC<{ child?: GuardianChild | null; className?: string }> = ({ child, className = 'parent-premium-avatar' }) => <span className={className} aria-hidden="true">
  {child?.avatar_url ? <img src={child.avatar_url} alt="" /> : child?.student_name?.slice(0, 1).toUpperCase() || 'S'}
</span>;

const AnimatedChecklist = () => <div className="parent-premium-checklist-art" aria-hidden="true">
  <svg viewBox="0 0 180 150">
    <defs>
      <linearGradient id="parentPaperGlow" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#00b8d4"/><stop offset="1" stopColor="#7c3aed"/></linearGradient>
    </defs>
    <rect className="sheet" x="34" y="20" width="92" height="110" rx="14"/>
    <path className="clip" d="M63 24v-7h34v7"/>
    <g className="checks"><path d="m52 49 5 5 9-12"/><path d="m52 73 5 5 9-12"/><path d="m52 97 5 5 9-12"/></g>
    <g className="lines"><path d="M76 49h32"/><path d="M76 73h32"/><path d="M76 97h26"/></g>
    <g className="pen"><path d="m118 112 30-54 12 7-30 54-17 10z"/><path d="m148 58 5-8 12 7-5 8"/></g>
  </svg>
</div>;

type ParentTab = 'home' | 'academics' | 'progress' | 'focus' | 'account';
const PARENT_TABS: Array<{ id: ParentTab; label: string; icon: IconName }> = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'academics', label: 'Academics', icon: 'academics' },
  { id: 'progress', label: 'Progress', icon: 'progress' },
  { id: 'focus', label: 'Focus', icon: 'focus' },
  { id: 'account', label: 'Account', icon: 'profile' },
];

const readInitialTab = (): ParentTab => {
  if (typeof window === 'undefined') return 'home';
  const requested = new URL(window.location.href).searchParams.get('parentTab') as ParentTab | null;
  return PARENT_TABS.some((item) => item.id === requested) ? requested as ParentTab : 'home';
};

interface ParentDashboardPremiumProps {
  children: GuardianChild[];
  selectedId: string | null;
  progress: GuardianChildProgress | null;
  days: number;
  loading: boolean;
  error: string | null;
  message: string | null;
  onSelectChild: (studentId: string) => void;
  onChangeDays: (days: number) => void;
  onRetry: () => void;
  onSignOut: () => void;
  onChooseWorkspace?: () => void;
}

const ParentDashboardPremium: React.FC<ParentDashboardPremiumProps> = ({
  children,
  selectedId,
  progress,
  days,
  loading,
  error,
  message,
  onSelectChild,
  onChangeDays,
  onRetry,
  onSignOut,
  onChooseWorkspace,
}) => {
  const [activeTab, setActiveTab] = useState<ParentTab>(readInitialTab);
  const [childMenuOpen, setChildMenuOpen] = useState(false);
  const childSwitcherRef = useRef<HTMLDivElement | null>(null);
  const { navigationRef, revealNavigation } = useSmartCollapsedNavigation(activeTab, '(max-width: 768px)');
  const currentChild = children.find((child) => child.student_id === selectedId) || children[0];
  const brand = createSchoolBrand({ schoolId: currentChild?.school_id, schoolName: currentChild?.school_name, schoolLogoUrl: currentChild?.school_logo_url });
  const tone = progress ? progressTone(progress) : { label: 'Steady', tone: 'steady' as const };
  const summary = progress?.summary;
  const strengths = progress?.strengths.slice(0, 6) || [];
  const focusAreas = progress?.focus_areas.slice(0, 6) || [];
  const recent = progress?.recent_assignments.slice(0, 6) || [];
  const latestAssessment = recent[0] || null;
  const topFocus = focusAreas[0] || null;

  const previousFor = (index: number) => {
    if (!progress) return null;
    const current = progress.recent_assignments[index];
    if (!current) return null;
    return progress.recent_assignments.slice(index + 1).find((item) => item.subject.toLowerCase() === current.subject.toLowerCase()) || null;
  };

  const writeTabToHistory = useCallback((tab: ParentTab, mode: 'push' | 'replace' = 'push') => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (tab === 'home') url.searchParams.delete('parentTab');
    else url.searchParams.set('parentTab', tab);
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) window.history[mode === 'replace' ? 'replaceState' : 'pushState'](null, '', nextUrl);
  }, []);

  const selectTab = useCallback((tab: ParentTab, mode: 'push' | 'replace' = 'push') => {
    revealNavigation();
    setActiveTab(tab);
    setChildMenuOpen(false);
    writeTabToHistory(tab, mode);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
  }, [revealNavigation, writeTabToHistory]);

  useEffect(() => {
    const restoreTab = () => {
      const requested = new URL(window.location.href).searchParams.get('parentTab') as ParentTab | null;
      const next = PARENT_TABS.some((item) => item.id === requested) ? requested as ParentTab : 'home';
      setActiveTab(next);
      setChildMenuOpen(false);
      revealNavigation();
    };
    window.addEventListener('popstate', restoreTab);
    return () => window.removeEventListener('popstate', restoreTab);
  }, [revealNavigation]);

  useEffect(() => {
    if (!childMenuOpen) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
      if (event instanceof MouseEvent && childSwitcherRef.current?.contains(event.target as Node)) return;
      setChildMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
    };
  }, [childMenuOpen]);

  const selectChild = (studentId: string) => {
    if (studentId !== selectedId) onSelectChild(studentId);
    setChildMenuOpen(false);
  };

  const renderSubjectPerformance = () => <section className="parent-premium-card">
    <div className="parent-premium-section-heading"><div><span>Subject performance</span><h2>Academic picture</h2></div><p>Current scores are based on assessed school work in this reporting period.</p></div>
    {progress?.subjects.length ? <div className="parent-premium-subject-table">
      <div className="parent-premium-subject-head"><span>Subject</span><span>Current score</span><span>Evidence</span><span>Trend</span></div>
      {progress.subjects.map((subject, index) => { const trend = trendLabelForSubject(subject); return <article key={subject.subject}>
        <div className="parent-premium-subject-name"><SubjectGlyph index={index}/><strong>{subject.subject}</strong></div>
        <strong className="parent-premium-subject-score">{subject.assignment_average == null ? '—' : `${subject.assignment_average}%`}</strong>
        <span className="parent-premium-subject-evidence">{subject.completed_assignments} assessed</span>
        <span className={`parent-premium-subject-trend tone-${trend.tone}`}>{trend.tone === 'up' ? '↗' : trend.tone === 'down' ? '↘' : '→'} {trend.label}</span>
      </article>; })}
    </div> : <div className="parent-premium-empty">No subject results are available in this period yet.</div>}
  </section>;

  const renderRecentAssessments = () => <article className="parent-premium-card parent-premium-assessments">
    <div className="parent-premium-section-heading compact"><div><span>Recent assessments</span><h2>Latest school work</h2></div></div>
    <div className="parent-premium-assessment-list">{recent.length ? recent.map((item, index) => { const previous = previousFor(index); const delta = previous ? item.accuracy - previous.accuracy : null; return <div key={`${item.assignment_id}:${item.completed_at}`}>
      <SubjectGlyph index={index}/><div className="assessment-copy"><strong>{item.title}</strong><span>{item.subject} · {fmtDate(item.completed_at)}</span></div><div className="assessment-score"><strong>{item.accuracy}%</strong>{delta == null ? <small>Latest result</small> : <small className={delta > 0 ? 'up' : delta < 0 ? 'down' : ''}>{delta > 0 ? '↗' : delta < 0 ? '↘' : '→'} {Math.abs(delta).toFixed(1)} pts vs previous {item.subject}</small>}</div>
    </div>; }) : <p className="parent-premium-empty-copy">Recent assessed school work will appear here.</p>}</div>
  </article>;

  const renderStrengths = () => <article className="parent-premium-card parent-premium-list-card is-strength">
    <div className="parent-premium-section-heading compact"><div><span>Strengths</span><h2>What is going well</h2></div><Icon name="check"/></div>
    <div className="parent-premium-signal-list">{strengths.length ? strengths.map((item) => <div key={`${item.subject}:${item.skill}:${item.subskill || ''}`}><span className="signal-icon"><Icon name="check"/></span><div><strong>{focusLabel(item)}</strong><small>{item.subject}{item.subskill ? ` · ${item.skill}` : ''}</small></div></div>) : <p className="parent-premium-empty-copy">Strengths will appear as more assessed evidence is collected.</p>}</div>
  </article>;

  const renderFocusAreas = () => <article className="parent-premium-card parent-premium-list-card is-support">
    <div className="parent-premium-section-heading compact"><div><span>Areas needing support</span><h2>Where to focus</h2></div><Icon name="alert"/></div>
    <div className="parent-premium-signal-list">{focusAreas.length ? focusAreas.map((item) => <div key={item.skill_key || `${item.subject}:${item.skill}:${item.subskill || ''}`}><span className="signal-icon"><Icon name="alert"/></span><div><strong>{focusLabel(item)}</strong><small>{item.subject}{item.subskill ? ` · ${item.skill}` : ''} · {item.evidence_items} evidence item{item.evidence_items === 1 ? '' : 's'}</small></div></div>) : <p className="parent-premium-empty-copy">No recurring or persistent support areas are currently identified.</p>}</div>
  </article>;

  return <main className="parent-premium-shell">
    <div className="parent-premium-orb orb-cyan" aria-hidden="true" />
    <div className="parent-premium-orb orb-purple" aria-hidden="true" />

    <header className="parent-premium-topbar">
      <div className="parent-premium-product">
        <img src={PRODUCT_LOGO_URL} alt={`${PRODUCT_NAME} logo`} />
        <div><strong>{PRODUCT_NAME}</strong><span>Parent Dashboard</span></div>
      </div>
      <div className="parent-premium-actions">
        <label className="parent-premium-period"><span>Period</span><select value={days} onChange={(event) => onChangeDays(Number(event.target.value))} aria-label="Reporting period"><option value={30}>30 days</option><option value={90}>90 days</option><option value={180}>6 months</option><option value={365}>12 months</option></select></label>
        {onChooseWorkspace ? <button type="button" className="parent-premium-ghost" onClick={onChooseWorkspace}>Switch</button> : null}
        <button type="button" className="parent-premium-ghost" onClick={onSignOut}>Sign out</button>
      </div>
    </header>

    <div className="parent-premium-container">
      <section className="parent-premium-school-row">
        <SchoolBrand brand={brand} className="parent-premium-school" imageClassName="parent-premium-school-logo" />
        <span>School-approved academic progress</span>
      </section>

      {error ? <div className="parent-premium-alert is-error"><div><strong>Something needs your attention</strong><span>{error}</span></div><button type="button" onClick={onRetry}>Try again</button></div> : null}
      {message ? <div className="parent-premium-alert"><div><strong>All set</strong><span>{message}</span></div></div> : null}

      <div className="parent-premium-child-wrap" ref={childSwitcherRef}>
        <section className={`parent-premium-child-card ${children.length > 1 ? 'is-switchable' : ''}`}>
          <ChildAvatar child={currentChild} />
          <div className="parent-premium-child-copy">
            <span>Student</span>
            <h1>{currentChild?.student_name || 'Your child'}</h1>
            <p>{currentChild?.grade ? `Grade ${currentChild.grade}` : 'Grade —'} · Class {currentChild?.class_name || '—'} · Last {days} days</p>
          </div>
          {children.length > 1 ? <button type="button" className="parent-premium-child-toggle" aria-label="Show other linked children" aria-expanded={childMenuOpen} onClick={() => setChildMenuOpen((current) => !current)}><Icon name="down"/></button> : <span />}
        </section>
        {childMenuOpen && children.length > 1 ? <div className="parent-premium-child-menu" role="menu" aria-label="Linked children">
          {children.map((child) => <button type="button" role="menuitem" className={`parent-premium-child-option ${child.student_id === currentChild?.student_id ? 'is-active' : ''}`} key={child.relationship_id} onClick={() => selectChild(child.student_id)}>
            <ChildAvatar child={child} className="parent-premium-child-option-avatar" />
            <span className="parent-premium-child-option-copy"><strong>{child.student_name}</strong><span>{child.grade ? `Grade ${child.grade}` : 'Grade —'} · Class {child.class_name || '—'} · {child.school_name}</span></span>
            {child.student_id === currentChild?.student_id ? <span className="parent-premium-child-option-check">✓</span> : null}
          </button>)}
        </div> : null}
      </div>

      {loading && !progress ? <section className="parent-premium-loading"><div className="parent-premium-spinner"/><strong>Preparing academic progress</strong><span>Bringing together the latest school evidence.</span></section> : null}

      {progress ? <div className="parent-premium-dashboard">
        {activeTab === 'home' ? <section className="parent-premium-tab-panel" aria-label="Parent home">
          <div className="parent-premium-home-grid">
            <section className="parent-premium-card parent-premium-snapshot">
              <div className="parent-premium-section-heading"><div><span>Academic snapshot</span><h2>How things are moving</h2></div><div className={`parent-premium-trend-pill tone-${tone.tone}`}>{tone.tone === 'up' ? '↗' : tone.tone === 'down' ? '↘' : '→'} {tone.label}</div></div>
              <div className="parent-premium-snapshot-grid">
                <div className="parent-premium-big-metric"><span>Overall average</span><strong>{summary?.assignment_average == null ? '—' : `${summary.assignment_average}%`}</strong><small>{summary?.completed_assignments || 0} completed assignments</small></div>
                <div className="parent-premium-mini-metrics">
                  <article><span>Improving</span><strong>{summary?.improving_count || 0}</strong><small>skills moving positively</small></article>
                  <article><span>Strengths</span><strong>{summary?.strength_count || 0}</strong><small>secure academic strengths</small></article>
                </div>
              </div>
            </section>
            <aside className="parent-premium-card parent-premium-quick-card">
              <div className="parent-premium-section-heading compact"><div><span>Right now</span><h2>Quick academic signals</h2></div></div>
              <div className="parent-premium-quick-row"><div><strong>Latest assessed work</strong><span>{latestAssessment ? `${latestAssessment.subject} · ${fmtDate(latestAssessment.completed_at)}` : 'No recent result yet'}</span></div><strong>{latestAssessment ? `${latestAssessment.accuracy}%` : '—'}</strong></div>
              <div className="parent-premium-quick-row"><div><strong>Top support priority</strong><span>{topFocus ? topFocus.subject : 'No repeated concern'}</span></div><strong>{topFocus ? focusLabel(topFocus) : 'Clear'}</strong></div>
              <button type="button" className="parent-premium-account-secondary" onClick={() => selectTab('progress')}>Open smart progress trend →</button>
            </aside>
          </div>
        </section> : null}

        {activeTab === 'academics' ? <section className="parent-premium-tab-panel" aria-label="Academics">
          {renderSubjectPerformance()}
          <div className="parent-premium-two-up">{renderStrengths()}{renderRecentAssessments()}</div>
        </section> : null}

        {activeTab === 'progress' ? <section className="parent-premium-tab-panel" aria-label="Progress">
          <section className="parent-premium-card">
            <div className="parent-premium-section-heading"><div><span>Smart progress intelligence</span><h2>How learning evidence is changing</h2></div><p>Completed school results are always plotted and governed learning evidence enriches each point.</p></div>
            <ParentLearningTrendChart progress={progress} />
          </section>
          <article className="parent-premium-card parent-premium-story parent-premium-progress-story-wide">
            <div className="parent-premium-section-heading compact"><div><span>Progress story</span><h2>What has changed</h2></div><Icon name="progress"/></div>
            <div className="parent-premium-story-grid">
              <div><span className="story-dot up"/><div><strong>{summary?.improving_count || 0} improving</strong><small>{progress.improving[0] ? `${focusLabel(progress.improving[0])} · ${progress.improving[0].subject}` : 'No improving skill recorded yet'}</small></div></div>
              <div><span className="story-dot resolved"/><div><strong>{summary?.resolved_count || 0} resolved</strong><small>{progress.resolved[0] ? `${focusLabel(progress.resolved[0])} · ${progress.resolved[0].subject}` : 'Resolved needs will appear here'}</small></div></div>
              <div><span className="story-dot evidence"/><div><strong>{summary?.completed_assignments || 0} completed</strong><small>{summary?.overdue_assignments ? `${summary.overdue_assignments} currently overdue` : `${summary?.assigned_assignments || 0} assigned in this period`}</small></div></div>
            </div>
          </article>
        </section> : null}

        {activeTab === 'focus' ? <section className="parent-premium-tab-panel" aria-label="Focus">
          {renderFocusAreas()}
          <section className="parent-premium-card parent-premium-recommendations">
            <div className="parent-premium-recommendation-copy"><div className="parent-premium-section-heading compact"><div><span>Recommended focus</span><h2>What to work on next</h2></div><Icon name="focus"/></div>
              <div className="parent-premium-recommendation-list">{focusAreas.length ? focusAreas.map((item) => <div key={`${item.skill_key || `${item.subject}:${item.skill}:${item.subskill || ''}`}:recommendation`}><span><Icon name="chevron"/></span><p>{recommendationCopy(item)}</p></div>) : <div><span><Icon name="check"/></span><p>Keep the current learning routine going. No repeated academic concern is flagged right now.</p></div>}</div>
            </div>
            <AnimatedChecklist />
          </section>
        </section> : null}

        {activeTab === 'account' ? <section className="parent-premium-tab-panel" aria-label="Account">
          <div className="parent-premium-account-grid">
            <article className="parent-premium-card parent-premium-account-card">
              <div className="parent-premium-section-heading compact"><div><span>Family</span><h2>Linked children</h2></div><Icon name="profile"/></div>
              <div className="parent-premium-family-list">{children.map((child) => <div className="parent-premium-family-row" key={child.relationship_id}>
                <ChildAvatar child={child} className="parent-premium-family-avatar" />
                <div className="parent-premium-family-copy"><strong>{child.student_name}</strong><span>{child.grade ? `Grade ${child.grade}` : 'Grade —'} · Class {child.class_name || '—'} · {child.school_name}</span></div>
                <button type="button" disabled={child.student_id === currentChild?.student_id} onClick={() => selectChild(child.student_id)}>{child.student_id === currentChild?.student_id ? 'Viewing' : 'View'}</button>
              </div>)}</div>
            </article>

            <article className="parent-premium-card parent-premium-account-card">
              <div className="parent-premium-section-heading compact"><div><span>Brains Heist account</span><h2>Available workspaces</h2></div><Icon name="workspace"/></div>
              <span className="parent-premium-current-workspace">✓ Parent workspace active</span>
              <div className="parent-premium-workspace-list">
                <div className="parent-premium-workspace-row"><span className="parent-premium-workspace-icon"><Icon name="profile"/></span><div className="parent-premium-workspace-copy"><strong>Parent Dashboard</strong><span>Family academic progress for linked children</span></div><button type="button" disabled>Current</button></div>
                {onChooseWorkspace ? <div className="parent-premium-workspace-row"><span className="parent-premium-workspace-icon"><Icon name="workspace"/></span><div className="parent-premium-workspace-copy"><strong>Other workspaces on this account</strong><span>School Head, Administration, Teacher or Student workspaces appear here only when this signed-in account is eligible.</span></div><button type="button" onClick={onChooseWorkspace}>Show all</button></div> : null}
              </div>
              <div className="parent-premium-account-actions">
                {onChooseWorkspace ? <button type="button" className="parent-premium-account-primary" onClick={onChooseWorkspace}>Switch Brains Heist workspace</button> : null}
                <button type="button" className="parent-premium-account-secondary" onClick={onSignOut}>Sign out</button>
              </div>
            </article>
          </div>
        </section> : null}

        <section className="parent-premium-evidence-note"><strong>School evidence only</strong><span>This parent view uses assessed academic evidence. Private staff records remain internal.</span></section>
      </div> : null}
    </div>

    <nav ref={navigationRef} className="parent-premium-bottom-nav" aria-label="Parent dashboard sections">
      <button type="button" className="parent-premium-nav-reveal" onClick={revealNavigation} aria-label="Show parent navigation" />
      {PARENT_TABS.map((item) => <button type="button" key={item.id} className={activeTab === item.id ? 'active' : ''} aria-current={activeTab === item.id ? 'page' : undefined} onClick={() => selectTab(item.id)}><Icon name={item.icon}/><span>{item.label}</span></button>)}
    </nav>
  </main>;
};

export default ParentDashboardPremium;
