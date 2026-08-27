import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import type { SchoolHeadSnapshot, SchoolHeadTab } from '../services/schoolHeadService';

interface SchoolHeadOverviewProps {
  snapshot: SchoolHeadSnapshot;
  onOpenTab: (tab: SchoolHeadTab) => void;
}

interface EngagementPoint {
  label: string;
  starts_at: string;
  ends_at: string;
  active_students: number;
  activity_rate: number;
}

interface DonutSegment {
  label: string;
  value: number;
  color: string;
  note?: string;
}

const ratioPercent = (value: number, total: number): number => (
  total > 0 ? Math.max(0, Math.min(100, Math.round((value / total) * 100))) : 0
);

const formatPercent = (value: number | null): string => (
  value === null ? 'No data' : `${Math.round(value * 10) / 10}%`
);

const toneLabel = (severity: string): string => {
  if (severity === 'critical') return 'Critical';
  if (severity === 'warning') return 'High';
  if (severity === 'notice') return 'Medium';
  return 'Review';
};

const ExecutiveIcon: React.FC<{ kind: 'learners' | 'classes' | 'progress' | 'risk' }> = ({ kind }) => {
  if (kind === 'learners') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2" /><path d="M3.5 20c.4-4 2.2-6 5.5-6s5.1 2 5.5 6M14 15c3.5-.3 5.5 1.3 6 4" /></svg>;
  }
  if (kind === 'classes') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 8h8M8 12h5M8 16h7" /></svg>;
  }
  if (kind === 'progress') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18V11M9 18V8M14 18v-5M19 18V5" /><path d="m4 9 5-3 5 3 5-6" /></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.8 2.9 8 7 10 4.1-2 7-5.2 7-10V6z" /><path d="M12 8v5M12 16h.01" /></svg>;
};

const ExecutiveKpi: React.FC<{
  kind: 'learners' | 'classes' | 'progress' | 'risk';
  label: string;
  value: React.ReactNode;
  note: string;
  tone: 'blue' | 'purple' | 'cyan' | 'red';
  meta?: string;
}> = ({ kind, label, value, note, tone, meta }) => (
  <article className={`school-head-v3-kpi is-${tone}`}>
    <div className="school-head-v3-kpi-icon"><ExecutiveIcon kind={kind} /></div>
    <div className="school-head-v3-kpi-copy">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
    {meta && <b>{meta}</b>}
  </article>
);

const DonutChart: React.FC<{
  segments: DonutSegment[];
  centerValue: string;
  centerLabel: string;
  ariaLabel: string;
}> = ({ segments, centerValue, centerLabel, ariaLabel }) => {
  const safeSegments = segments.map((segment) => ({ ...segment, value: Math.max(0, segment.value) }));
  const total = safeSegments.reduce((sum, segment) => sum + segment.value, 0);
  let cursor = 0;
  const stops = safeSegments.map((segment) => {
    const start = total > 0 ? (cursor / total) * 100 : 0;
    cursor += segment.value;
    const end = total > 0 ? (cursor / total) * 100 : 0;
    return `${segment.color} ${start}% ${end}%`;
  });
  const background = total > 0 ? `conic-gradient(${stops.join(', ')})` : 'conic-gradient(#e6edf5 0 100%)';

  return (
    <div className="school-head-v3-donut-layout">
      <div className="school-head-v3-donut" style={{ background }} role="img" aria-label={ariaLabel}>
        <div><strong>{centerValue}</strong><span>{centerLabel}</span></div>
      </div>
      <div className="school-head-v3-donut-legend">
        {safeSegments.map((segment) => {
          const percent = total > 0 ? Math.round((segment.value / total) * 100) : 0;
          return <div key={segment.label}><i style={{ background: segment.color }} /><span><strong>{segment.label}</strong>{segment.note && <small>{segment.note}</small>}</span><b>{segment.value}<small>{total > 0 ? ` · ${percent}%` : ''}</small></b></div>;
        })}
      </div>
    </div>
  );
};

const EngagementTrendChart: React.FC<{ schoolId: string }> = ({ schoolId }) => {
  const [points, setPoints] = useState<EngagementPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadTrend = async () => {
      setLoading(true);
      setUnavailable(false);
      const { data, error } = await supabase.rpc('school_head_get_engagement_trend', {
        p_school_id: schoolId,
        p_weeks: 8,
      });
      if (cancelled) return;
      if (error) {
        console.warn('School Head engagement trend unavailable:', error.message);
        setPoints([]);
        setUnavailable(true);
        setLoading(false);
        return;
      }
      const payload = data && typeof data === 'object' && !Array.isArray(data)
        ? data as Record<string, unknown>
        : {};
      const rows = Array.isArray(payload['points']) ? payload['points'] : [];
      const normalized = rows.flatMap((item): EngagementPoint[] => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
        const row = item as Record<string, unknown>;
        const activeStudents = Number(row['active_students']);
        const activityRate = Number(row['activity_rate']);
        return [{
          label: typeof row['label'] === 'string' ? row['label'] : '',
          starts_at: typeof row['starts_at'] === 'string' ? row['starts_at'] : '',
          ends_at: typeof row['ends_at'] === 'string' ? row['ends_at'] : '',
          active_students: Number.isFinite(activeStudents) ? activeStudents : 0,
          activity_rate: Number.isFinite(activityRate) ? activityRate : 0,
        }];
      });
      setPoints(normalized);
      setLoading(false);
    };
    void loadTrend();
    return () => { cancelled = true; };
  }, [schoolId]);

  const chart = useMemo(() => {
    const width = 720;
    const height = 250;
    const left = 48;
    const right = 18;
    const top = 18;
    const bottom = 44;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const maxObserved = Math.max(0, ...points.map((point) => point.activity_rate));
    const maxValue = Math.max(10, Math.ceil(maxObserved / 10) * 10);
    const xFor = (index: number) => left + (points.length <= 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
    const yFor = (value: number) => top + plotHeight - (Math.max(0, value) / maxValue) * plotHeight;
    const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index)} ${yFor(point.activity_rate)}`).join(' ');
    const areaPath = points.length
      ? `${linePath} L ${xFor(points.length - 1)} ${top + plotHeight} L ${xFor(0)} ${top + plotHeight} Z`
      : '';
    const grid = [1, .75, .5, .25, 0].map((ratio) => ({
      value: Math.round(maxValue * ratio * 10) / 10,
      y: top + plotHeight - ratio * plotHeight,
    }));
    return { width, height, left, top, plotHeight, xFor, yFor, linePath, areaPath, grid };
  }, [points]);

  const latest = points.length ? points[points.length - 1] : null;
  const previous = points.length > 1 ? points[points.length - 2] : null;
  const delta = latest && previous ? Math.round((latest.activity_rate - previous.activity_rate) * 10) / 10 : null;
  const hasRecordedActivity = points.some((point) => point.active_students > 0);

  return (
    <section className="school-head-v3-panel school-head-v3-trend-panel">
      <div className="school-head-v3-panel-heading">
        <div><span>Student engagement</span><h3>Engagement Trend</h3><p>Distinct enrolled learners with recorded Brains Heist learning or gameplay activity in each 7-day window.</p></div>
        {delta !== null && <b className={delta >= 0 ? 'is-positive' : 'is-negative'}>{delta >= 0 ? '↗' : '↘'} {delta >= 0 ? '+' : ''}{delta} pp <small>vs prior week</small></b>}
      </div>
      {loading ? <div className="school-head-v3-chart-loading"><i /><i /><i /></div> : unavailable ? (
        <div className="school-head-v3-chart-empty"><strong>Trend temporarily unavailable</strong><span>The executive snapshot is still live; this chart will return when weekly activity analytics are available.</span></div>
      ) : !hasRecordedActivity ? (
        <div className="school-head-v3-chart-empty"><strong>No recorded learner activity in this 8-week view</strong><span>The chart will start drawing when learners create recorded learning or gameplay activity.</span></div>
      ) : (
        <div className="school-head-v3-chart-wrap">
          <svg viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="Eight-week student engagement trend">
            <defs><linearGradient id="schoolHeadTrendArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity=".22" /><stop offset="100%" stopColor="#2563eb" stopOpacity="0" /></linearGradient></defs>
            {chart.grid.map((line) => <g key={line.value}><line x1={chart.left} x2={chart.width - 18} y1={line.y} y2={line.y} className="school-head-v3-grid-line" /><text x={chart.left - 10} y={line.y + 4} textAnchor="end" className="school-head-v3-axis-label">{line.value}%</text></g>)}
            <path d={chart.areaPath} fill="url(#schoolHeadTrendArea)" />
            <path d={chart.linePath} className="school-head-v3-line" />
            {points.map((point, index) => <g key={`${point.label}-${index}`}><circle cx={chart.xFor(index)} cy={chart.yFor(point.activity_rate)} r="4.5" className="school-head-v3-point" /><text x={chart.xFor(index)} y={chart.top + chart.plotHeight + 26} textAnchor="middle" className="school-head-v3-x-label">{point.label}</text></g>)}
          </svg>
          {latest && <div className="school-head-v3-chart-summary"><strong>{latest.active_students}</strong><span>active learners in the latest 7-day window · {latest.activity_rate}% of enrolled students</span></div>}
        </div>
      )}
    </section>
  );
};

const SchoolHeadOverview: React.FC<SchoolHeadOverviewProps> = ({ snapshot, onOpenTab }) => {
  const studentActivityRate = ratioPercent(snapshot.engagement.active_students_7d, snapshot.totals.students);
  const classCoverageRate = ratioPercent(snapshot.structure.covered_classes, snapshot.totals.classes);
  const academicTrend = snapshot.academics.average !== null && snapshot.academics.previous_average !== null
    ? Math.round((snapshot.academics.average - snapshot.academics.previous_average) * 10) / 10
    : null;
  const headFirstName = (snapshot.head?.name || 'School Head').trim().split(/\s+/)[0] || 'School Head';

  const activeThisWeek = Math.min(snapshot.engagement.active_students_7d, snapshot.totals.students);
  const activeThisMonth = Math.min(snapshot.engagement.active_students_30d, snapshot.totals.students);
  const activeEightToThirty = Math.max(activeThisMonth - activeThisWeek, 0);
  const inactiveThirtyPlus = Math.max(snapshot.totals.students - activeThisMonth, 0);

  const unplacedStudents = Math.max(snapshot.totals.students - snapshot.structure.placed_students, 0);
  const uncoveredClasses = Math.max(snapshot.totals.classes - snapshot.structure.covered_classes, 0);
  const unallocatedTeachers = Math.max(snapshot.totals.teachers - snapshot.structure.allocated_teachers, 0);

  const learnerSegments: DonutSegment[] = [
    { label: 'Active this week', value: activeThisWeek, color: '#1f8fff', note: 'Recorded activity in the last 7 days' },
    { label: 'Recently active', value: activeEightToThirty, color: '#7454e8', note: 'Last recorded activity 8–30 days ago' },
    { label: 'Re-engage', value: inactiveThirtyPlus, color: '#ffab19', note: 'No recorded activity in 30+ days' },
  ];

  const coverageSegments: DonutSegment[] = [
    { label: 'Covered classes', value: snapshot.structure.covered_classes, color: '#12bfb2' },
    { label: 'Needs coverage', value: uncoveredClasses, color: '#ffb020' },
  ];

  const generatedAt = new Date(snapshot.generated_at);
  const generatedLabel = Number.isNaN(generatedAt.getTime())
    ? 'Live school records'
    : `Updated ${generatedAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`;

  return (
    <div className="school-head-page school-head-overview-v3">
      <section className="school-head-v3-welcome">
        <div>
          <span>Executive Overview · {snapshot.period.days}-day reporting view</span>
          <h2>Welcome back, {headFirstName}</h2>
          <p>Here&apos;s what&apos;s happening at <strong>{snapshot.school.name}</strong>.</p>
        </div>
        <button type="button" onClick={() => onOpenTab('decisions')} className={snapshot.decisions.some((item) => item.severity === 'critical') ? 'has-critical' : ''}>
          <i /> <span><strong>{snapshot.decisions.length}</strong> priority item{snapshot.decisions.length === 1 ? '' : 's'}</span><b>Open Decision Center →</b>
        </button>
      </section>

      <section className="school-head-v3-kpi-grid" aria-label="Executive school indicators">
        <ExecutiveKpi kind="learners" label="Learners" value={snapshot.totals.students.toLocaleString()} note={`${snapshot.engagement.active_students_7d.toLocaleString()} with recorded activity in 7 days`} tone="blue" meta={`${studentActivityRate}% weekly`} />
        <ExecutiveKpi kind="classes" label="Active Classes" value={snapshot.totals.classes.toLocaleString()} note={`${snapshot.structure.covered_classes} with teaching coverage`} tone="purple" meta={`${classCoverageRate}% covered`} />
        <ExecutiveKpi kind="progress" label="Academic Average" value={formatPercent(snapshot.academics.average)} note={snapshot.academics.assignment_total ? `${snapshot.academics.assignment_completed} of ${snapshot.academics.assignment_total} assignments completed` : 'Recorded assessment evidence'} tone="cyan" meta={academicTrend === null ? 'Current period' : `${academicTrend >= 0 ? '+' : ''}${academicTrend} pp`} />
        <ExecutiveKpi kind="risk" label="At Risk" value={snapshot.engagement.inactive_students_14d.toLocaleString()} note="No recorded activity for 14+ days" tone="red" meta={snapshot.engagement.inactive_students_14d > 0 ? 'Needs support' : 'All active'} />
      </section>

      <div className="school-head-v3-main-grid">
        <EngagementTrendChart schoolId={snapshot.school.id} />

        <section className="school-head-v3-panel school-head-v3-activity-panel">
          <div className="school-head-v3-panel-heading"><div><span>Participation mix</span><h3>Learner Activity</h3><p>A mutually exclusive view of each learner&apos;s most recent recorded learning or gameplay activity.</p></div></div>
          <DonutChart
            segments={learnerSegments}
            centerValue={`${studentActivityRate}%`}
            centerLabel="weekly active"
            ariaLabel={`${studentActivityRate}% of enrolled learners had recorded activity in the last 7 days`}
          />
        </section>
      </div>

      <div className="school-head-v3-bottom-grid">
        <section className="school-head-v3-panel school-head-v3-coverage-panel">
          <div className="school-head-v3-panel-heading"><div><span>Operational readiness</span><h3>Class Coverage</h3><p>Active classes with at least one current teaching allocation.</p></div></div>
          <DonutChart
            segments={coverageSegments}
            centerValue={`${classCoverageRate}%`}
            centerLabel="covered"
            ariaLabel={`${snapshot.structure.covered_classes} of ${snapshot.totals.classes} active classes have teaching coverage`}
          />
          <button type="button" className="school-head-v3-link" onClick={() => onOpenTab('people')}>View people & structure <span>→</span></button>
        </section>

        <section className="school-head-v3-panel school-head-v3-interventions">
          <div className="school-head-v3-panel-heading"><div><span>Intervention Needs</span><h3>Where support is needed</h3><p>Direct counts from current school records — no inferred risk scoring.</p></div></div>
          <div className="school-head-v3-intervention-list">
            <button type="button" onClick={() => onOpenTab('academic')}><i className="is-red">!</i><span><strong>Re-engage learners</strong><small>No recorded activity for 14+ days</small></span><b>{snapshot.engagement.inactive_students_14d}</b></button>
            <button type="button" onClick={() => onOpenTab('people')}><i className="is-amber">↗</i><span><strong>Unplaced learners</strong><small>Not connected to an active class</small></span><b>{unplacedStudents}</b></button>
            <button type="button" onClick={() => onOpenTab('people')}><i className="is-purple">□</i><span><strong>Classes without coverage</strong><small>No active teaching allocation</small></span><b>{uncoveredClasses}</b></button>
            <button type="button" onClick={() => onOpenTab('people')}><i className="is-blue">◇</i><span><strong>Teachers unallocated</strong><small>No active class allocation</small></span><b>{unallocatedTeachers}</b></button>
          </div>
        </section>

        <section className="school-head-v3-panel school-head-v3-actions">
          <div className="school-head-v3-panel-heading"><div><span>Executive intelligence</span><h3>Priority Actions</h3><p>The highest-priority items already produced by the Decision Center.</p></div><button type="button" onClick={() => onOpenTab('decisions')}>View all →</button></div>
          {snapshot.decisions.length ? <div className="school-head-v3-action-list">{snapshot.decisions.slice(0, 3).map((decision, index) => (
            <button type="button" key={decision.id} onClick={() => onOpenTab(decision.destination)}>
              <i className={`is-${decision.severity}`}>{index + 1}</i>
              <span><strong>{decision.title}</strong><small>{decision.description}</small></span>
              <b className={`is-${decision.severity}`}>{toneLabel(decision.severity)}</b>
            </button>
          ))}</div> : <div className="school-head-v3-action-empty"><i>✓</i><strong>No executive actions are open</strong><span>Current decision indicators are healthy.</span></div>}
        </section>
      </div>

      <footer className="school-head-v3-footer"><span><i /> Live school records</span><small>{generatedLabel}</small><b>Engagement uses recorded learning/gameplay activity, not login presence.</b></footer>
    </div>
  );
};

export default SchoolHeadOverview;