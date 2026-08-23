import React, { useMemo } from 'react';
import type { GuardianChild, GuardianChildProgress } from '../../services/guardianService';
import { SchoolBrand } from '../../src/components/SchoolBrand';
import { createSchoolBrand, PRODUCT_LOGO_URL, PRODUCT_NAME } from '../../src/lib/schoolBranding';
import './ParentDashboardPremium.css';

const fmtDate = (value?: string | null) => value
  ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  : '—';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

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

const recommendationCopy = (item: GuardianChildProgress['focus_areas'][number]) => {
  const evidence = item.evidence_items === 1 ? '1 assessed activity' : `${item.evidence_items} assessed activities`;
  if (item.priority === 'high') return `Prioritise ${item.skill.toLowerCase()} in ${item.subject}. This need has appeared across ${evidence}.`;
  if (item.status === 'persistent') return `Keep revisiting ${item.skill.toLowerCase()} in ${item.subject} with short, regular practice.`;
  return `Add focused practice for ${item.skill.toLowerCase()} in ${item.subject} this week.`;
};

const Icon: React.FC<{ name: 'home' | 'academics' | 'progress' | 'focus' | 'profile' | 'chevron' | 'check' | 'alert' }> = ({ name }) => {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {name === 'home' ? <><path {...common} d="M3.5 10.5 12 3.8l8.5 6.7"/><path {...common} d="M5.5 9.8v10.1h13V9.8M9.5 19.9v-6h5v6"/></> : null}
    {name === 'academics' ? <><path {...common} d="M4 5.2c2.8-.8 5.3-.4 8 1.4v13c-2.7-1.8-5.2-2.2-8-1.4z"/><path {...common} d="M20 5.2c-2.8-.8-5.3-.4-8 1.4v13c2.7-1.8 5.2-2.2 8-1.4z"/></> : null}
    {name === 'progress' ? <><path {...common} d="M4 18.5V13M10 18.5V9M16 18.5V5M3 20h18"/></> : null}
    {name === 'focus' ? <><circle {...common} cx="12" cy="12" r="7.4"/><circle {...common} cx="12" cy="12" r="3.2"/><path {...common} d="m14.3 9.7 5.1-5.1M16.8 4.6h2.6v2.6"/></> : null}
    {name === 'profile' ? <><circle {...common} cx="12" cy="8.2" r="3.2"/><path {...common} d="M5.2 20c.7-4 3-6.1 6.8-6.1s6.1 2.1 6.8 6.1"/></> : null}
    {name === 'chevron' ? <path {...common} d="m9 6 6 6-6 6"/> : null}
    {name === 'check' ? <path {...common} d="m5 12.5 4.1 4.1L19 6.7"/> : null}
    {name === 'alert' ? <><path {...common} d="M12 3.8 21 20H3z"/><path {...common} d="M12 9v4.5M12 17h.01"/></> : null}
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

const PerformanceSparkline: React.FC<{ values: number[] }> = ({ values }) => {
  if (!values.length) return <div className="parent-premium-chart-empty">Complete assessed work to unlock a progress trend.</div>;
  const display = values.slice(-6);
  const width = 330;
  const height = 118;
  const left = 14;
  const right = width - 14;
  const top = 12;
  const bottom = height - 20;
  const minValue = Math.min(...display);
  const maxValue = Math.max(...display);
  const spread = Math.max(10, maxValue - minValue);
  const points = display.map((value, index) => {
    const x = display.length === 1 ? width / 2 : left + (index / (display.length - 1)) * (right - left);
    const y = bottom - ((value - (minValue - spread * .18)) / (spread * 1.36)) * (bottom - top);
    return { x: Number(x.toFixed(1)), y: Number(clamp(y, top, bottom).toFixed(1)), value };
  });
  const polyline = points.map((point) => `${point.x},${point.y}`).join(' ');
  const area = `${left},${bottom} ${polyline} ${right},${bottom}`;

  return <div className="parent-premium-chart-wrap">
    <svg className="parent-premium-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Recent assessment trend: ${display.join(', ')} percent`}>
      <defs>
        <linearGradient id="parentTrendArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#00b8d4" stopOpacity=".2"/>
          <stop offset="1" stopColor="#7c3aed" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path className="parent-premium-chart-grid" d={`M${left} ${top + 18}H${right}M${left} ${top + 48}H${right}M${left} ${top + 78}H${right}`}/>
      <polygon className="parent-premium-chart-area" points={area}/>
      <polyline className="parent-premium-chart-line" points={polyline}/>
      {points.map((point, index) => <g key={`${point.x}-${point.y}`} className="parent-premium-chart-point" style={{ animationDelay: `${index * 90}ms` }}>
        <circle cx={point.x} cy={point.y} r="6.4" className="halo"/>
        <circle cx={point.x} cy={point.y} r="3.4" className="dot"/>
      </g>)}
    </svg>
    <div className="parent-premium-chart-labels">{display.map((_, index) => <span key={index}>#{index + 1}</span>)}</div>
  </div>;
};

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
  const currentChild = children.find((child) => child.student_id === selectedId) || children[0];
  const brand = createSchoolBrand({ schoolId: currentChild?.school_id, schoolName: currentChild?.school_name, schoolLogoUrl: currentChild?.school_logo_url });
  const trendValues = useMemo(() => (progress?.recent_assignments || [])
    .slice()
    .sort((a, b) => new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime())
    .map((item) => item.accuracy), [progress?.recent_assignments]);
  const tone = progress ? progressTone(progress) : { label: 'Steady', tone: 'steady' as const };
  const summary = progress?.summary;
  const strengths = progress?.strengths.slice(0, 3) || [];
  const focusAreas = progress?.focus_areas.slice(0, 3) || [];
  const recent = progress?.recent_assignments.slice(0, 3) || [];

  const previousFor = (index: number) => {
    if (!progress) return null;
    const current = progress.recent_assignments[index];
    if (!current) return null;
    return progress.recent_assignments.slice(index + 1).find((item) => item.subject.toLowerCase() === current.subject.toLowerCase()) || null;
  };

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

      <section className="parent-premium-child-card">
        <div className="parent-premium-avatar" aria-hidden="true">{currentChild?.student_name?.slice(0, 1).toUpperCase() || 'S'}</div>
        <div className="parent-premium-child-copy">
          <span>Student</span>
          <h1>{currentChild?.student_name || 'Your child'}</h1>
          <p>{currentChild?.grade ? `Grade ${currentChild.grade}` : 'Grade —'} · Class {currentChild?.class_name || '—'} · Last {days} days</p>
        </div>
        {children.length > 1 ? <label className="parent-premium-child-switcher"><span>Switch child</span><select value={selectedId || ''} onChange={(event) => onSelectChild(event.target.value)}>{children.map((child) => <option value={child.student_id} key={child.relationship_id}>{child.student_name}</option>)}</select></label> : null}
      </section>

      {loading && !progress ? <section className="parent-premium-loading"><div className="parent-premium-spinner"/><strong>Preparing academic progress</strong><span>Bringing together the latest school evidence.</span></section> : null}

      {progress ? <div className="parent-premium-dashboard">
        <section id="parent-home" className="parent-premium-card parent-premium-snapshot">
          <div className="parent-premium-section-heading"><div><span>Academic snapshot</span><h2>How things are moving</h2></div><div className={`parent-premium-trend-pill tone-${tone.tone}`}>{tone.tone === 'up' ? '↗' : tone.tone === 'down' ? '↘' : '→'} {tone.label}</div></div>
          <div className="parent-premium-snapshot-grid">
            <div className="parent-premium-big-metric"><span>Overall average</span><strong>{summary?.assignment_average == null ? '—' : `${summary.assignment_average}%`}</strong><small>{summary?.completed_assignments || 0} completed assignments</small></div>
            <div className="parent-premium-mini-metrics">
              <article><span>Improving</span><strong>{summary?.improving_count || 0}</strong><small>skills moving positively</small></article>
              <article><span>Strengths</span><strong>{summary?.strength_count || 0}</strong><small>secure academic strengths</small></article>
            </div>
            <div className="parent-premium-chart-panel"><div className="parent-premium-chart-title"><strong>Performance trend</strong><span>Recent assessed work</span></div><PerformanceSparkline values={trendValues}/></div>
          </div>
        </section>

        <section id="parent-academics" className="parent-premium-card">
          <div className="parent-premium-section-heading"><div><span>Subject performance</span><h2>Academic picture</h2></div><p>Current scores are based on assessed school work in this reporting period.</p></div>
          {progress.subjects.length ? <div className="parent-premium-subject-table">
            <div className="parent-premium-subject-head"><span>Subject</span><span>Current score</span><span>Evidence</span><span>Trend</span></div>
            {progress.subjects.map((subject, index) => { const trend = trendLabelForSubject(subject); return <article key={subject.subject}>
              <div className="parent-premium-subject-name"><SubjectGlyph index={index}/><strong>{subject.subject}</strong></div>
              <strong className="parent-premium-subject-score">{subject.assignment_average == null ? '—' : `${subject.assignment_average}%`}</strong>
              <span className="parent-premium-subject-evidence">{subject.completed_assignments} assessed</span>
              <span className={`parent-premium-subject-trend tone-${trend.tone}`}>{trend.tone === 'up' ? '↗' : trend.tone === 'down' ? '↘' : '→'} {trend.label}</span>
            </article>; })}
          </div> : <div className="parent-premium-empty">No subject results are available in this period yet.</div>}
        </section>

        <section className="parent-premium-two-up">
          <article className="parent-premium-card parent-premium-list-card is-strength">
            <div className="parent-premium-section-heading compact"><div><span>Strengths</span><h2>What is going well</h2></div><Icon name="check"/></div>
            <div className="parent-premium-signal-list">{strengths.length ? strengths.map((item) => <div key={`${item.subject}:${item.skill}`}><span className="signal-icon"><Icon name="check"/></span><div><strong>{item.skill}</strong><small>{item.subject}</small></div></div>) : <p className="parent-premium-empty-copy">Strengths will appear as more assessed evidence is collected.</p>}</div>
          </article>
          <article id="parent-focus" className="parent-premium-card parent-premium-list-card is-support">
            <div className="parent-premium-section-heading compact"><div><span>Areas needing support</span><h2>Where to focus</h2></div><Icon name="alert"/></div>
            <div className="parent-premium-signal-list">{focusAreas.length ? focusAreas.map((item) => <div key={`${item.subject}:${item.skill}`}><span className="signal-icon"><Icon name="alert"/></span><div><strong>{item.skill}</strong><small>{item.subject} · {item.evidence_items} evidence item{item.evidence_items === 1 ? '' : 's'}</small></div></div>) : <p className="parent-premium-empty-copy">No recurring or persistent support areas are currently identified.</p>}</div>
          </article>
        </section>

        <section className="parent-premium-two-up lower">
          <article className="parent-premium-card parent-premium-assessments">
            <div className="parent-premium-section-heading compact"><div><span>Recent assessments</span><h2>Latest school work</h2></div></div>
            <div className="parent-premium-assessment-list">{recent.length ? recent.map((item, index) => { const previous = previousFor(index); const delta = previous ? item.accuracy - previous.accuracy : null; return <div key={`${item.assignment_id}:${item.completed_at}`}>
              <SubjectGlyph index={index}/><div className="assessment-copy"><strong>{item.title}</strong><span>{item.subject} · {fmtDate(item.completed_at)}</span></div><div className="assessment-score"><strong>{item.accuracy}%</strong>{delta == null ? <small>Latest result</small> : <small className={delta > 0 ? 'up' : delta < 0 ? 'down' : ''}>{delta > 0 ? '↗' : delta < 0 ? '↘' : '→'} {Math.abs(delta).toFixed(1)} pts vs previous {item.subject}</small>}</div>
            </div>; }) : <p className="parent-premium-empty-copy">Recent assessed school work will appear here.</p>}</div>
          </article>

          <article id="parent-progress" className="parent-premium-card parent-premium-story">
            <div className="parent-premium-section-heading compact"><div><span>Progress story</span><h2>What has changed</h2></div><Icon name="progress"/></div>
            <div className="parent-premium-story-grid">
              <div><span className="story-dot up"/><div><strong>{summary?.improving_count || 0} improving</strong><small>{progress.improving[0] ? `${progress.improving[0].skill} · ${progress.improving[0].subject}` : 'No improving skill recorded yet'}</small></div></div>
              <div><span className="story-dot resolved"/><div><strong>{summary?.resolved_count || 0} resolved</strong><small>{progress.resolved[0] ? `${progress.resolved[0].skill} · ${progress.resolved[0].subject}` : 'Resolved needs will appear here'}</small></div></div>
              <div><span className="story-dot evidence"/><div><strong>{summary?.assigned_assignments || 0} assigned</strong><small>{summary?.overdue_assignments ? `${summary.overdue_assignments} currently overdue` : 'No overdue work in this period'}</small></div></div>
            </div>
          </article>
        </section>

        <section className="parent-premium-card parent-premium-recommendations">
          <div className="parent-premium-recommendation-copy"><div className="parent-premium-section-heading compact"><div><span>Recommended focus</span><h2>What to work on next</h2></div><Icon name="focus"/></div>
            <div className="parent-premium-recommendation-list">{focusAreas.length ? focusAreas.map((item) => <div key={`${item.subject}:${item.skill}:recommendation`}><span><Icon name="chevron"/></span><p>{recommendationCopy(item)}</p></div>) : <div><span><Icon name="check"/></span><p>Keep the current learning routine going. No repeated academic concern is flagged right now.</p></div>}</div>
          </div>
          <AnimatedChecklist />
        </section>

        <section className="parent-premium-evidence-note"><strong>School evidence only</strong><span>This parent view uses assessed academic evidence. Private staff records remain internal.</span></section>
      </div> : null}
    </div>

    <nav className="parent-premium-bottom-nav" aria-label="Parent dashboard sections">
      <a href="#parent-home" className="active"><Icon name="home"/><span>Home</span></a>
      <a href="#parent-academics"><Icon name="academics"/><span>Academics</span></a>
      <a href="#parent-progress"><Icon name="progress"/><span>Progress</span></a>
      <a href="#parent-focus"><Icon name="focus"/><span>Focus</span></a>
      <button type="button" onClick={onSignOut}><Icon name="profile"/><span>Account</span></button>
    </nav>
  </main>;
};

export default ParentDashboardPremium;
