import React, { useEffect, useMemo, useState } from 'react';
import type { GuardianChildProgress } from '../../services/guardianService';

type TimelineItem = GuardianChildProgress['timeline'][number];
type TrendTone = 'assignment' | 'writing';

type TrendEvent = {
  key: string;
  observedAt: string;
  score: number;
  label: string;
  detail: string;
  focusCount: number;
  developingCount: number;
  strengthCount: number;
};

type TrendSeries = {
  key: TrendTone;
  label: string;
  tone: TrendTone;
  events: TrendEvent[];
};

type PlottedPoint = {
  key: string;
  series: TrendSeries;
  event: TrendEvent;
  x: number;
  y: number;
};

const normalizeSubject = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^maths$/, 'mathematics');

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

const observationSignal = (item: TimelineItem) => {
  const raw = item.evidence_percentage == null ? null : Number(item.evidence_percentage);
  const percentage = raw == null || Number.isNaN(raw) ? null : Math.max(0, Math.min(100, raw));
  if (item.observation_type === 'focus') return percentage == null ? 28 : 16 + percentage * 0.24;
  if (item.observation_type === 'strength') return percentage == null ? 90 : 80 + percentage * 0.16;
  return percentage == null ? 62 : 48 + percentage * 0.24;
};

const trendPositionLabel = (score: number) => score >= 78 ? 'Strong evidence' : score >= 46 ? 'Developing evidence' : 'Needs support';

const sourceTone = (item: TimelineItem): TrendTone | null => {
  if (item.source_type === 'assignment_result') return 'assignment';
  if (item.source_type === 'writing_attempt') return 'writing';
  return null;
};

const buildEvidenceSeries = (items: TimelineItem[], subject: string, tone: TrendTone): TrendEvent[] => {
  const groups = new Map<string, {
    values: number[];
    observedAt: string;
    labels: string[];
    focusCount: number;
    developingCount: number;
    strengthCount: number;
  }>();

  items
    .filter((item) => normalizeSubject(item.subject) === normalizeSubject(subject) && sourceTone(item) === tone)
    .forEach((item) => {
      const safeMoment = item.observed_at.slice(0, 19);
      const key = `${tone}:${safeMoment}`;
      const group = groups.get(key) || {
        values: [],
        observedAt: item.observed_at,
        labels: [],
        focusCount: 0,
        developingCount: 0,
        strengthCount: 0,
      };
      group.values.push(observationSignal(item));
      if (!group.labels.includes(item.skill)) group.labels.push(item.skill);
      if (item.observation_type === 'focus') group.focusCount += 1;
      else if (item.observation_type === 'strength') group.strengthCount += 1;
      else group.developingCount += 1;
      if (item.observed_at > group.observedAt) group.observedAt = item.observed_at;
      groups.set(key, group);
    });

  return [...groups.entries()].map(([key, group]) => ({
    key,
    observedAt: group.observedAt,
    score: Math.round(group.values.reduce((sum, value) => sum + value, 0) / Math.max(group.values.length, 1)),
    label: group.labels.slice(0, 2).join(' · ') || 'Academic evidence',
    detail: tone === 'writing' ? 'Writing Hub evidence' : 'School assignment evidence',
    focusCount: group.focusCount,
    developingCount: group.developingCount,
    strengthCount: group.strengthCount,
  })).sort((a, b) => a.observedAt.localeCompare(b.observedAt));
};

const buildAssignmentFallback = (progress: GuardianChildProgress, subject: string): TrendEvent[] => progress.recent_assignments
  .filter((item) => normalizeSubject(item.subject) === normalizeSubject(subject))
  .map((item) => ({
    key: `assignment:${item.assignment_id}:${item.completed_at}`,
    observedAt: item.completed_at,
    score: Math.max(0, Math.min(100, Number(item.accuracy) || 0)),
    label: item.title,
    detail: item.topic || 'School assignment',
    focusCount: item.accuracy < 46 ? 1 : 0,
    developingCount: item.accuracy >= 46 && item.accuracy < 78 ? 1 : 0,
    strengthCount: item.accuracy >= 78 ? 1 : 0,
  }))
  .sort((a, b) => a.observedAt.localeCompare(b.observedAt));

const ParentLearningTrendChart: React.FC<{ progress: GuardianChildProgress }> = ({ progress }) => {
  const subjects = useMemo(() => {
    const values = new Map<string, string>();
    progress.subjects.forEach((item) => values.set(normalizeSubject(item.subject), item.subject));
    progress.timeline.forEach((item) => values.set(normalizeSubject(item.subject), item.subject));
    progress.recent_assignments.forEach((item) => values.set(normalizeSubject(item.subject), item.subject));
    return [...values.values()];
  }, [progress]);

  const subjectByEvidence = useMemo(() => subjects
    .map((subject) => ({
      subject,
      count: progress.timeline.filter((item) => normalizeSubject(item.subject) === normalizeSubject(subject)).length
        + progress.recent_assignments.filter((item) => normalizeSubject(item.subject) === normalizeSubject(subject)).length,
    }))
    .sort((a, b) => b.count - a.count), [progress, subjects]);

  const [subject, setSubject] = useState(subjectByEvidence[0]?.subject || subjects[0] || '');
  const [activeKey, setActiveKey] = useState<string | null>(null);

  useEffect(() => {
    if (!subject || !subjects.some((item) => normalizeSubject(item) === normalizeSubject(subject))) {
      setSubject(subjectByEvidence[0]?.subject || subjects[0] || '');
    }
    setActiveKey(null);
  }, [progress, subject, subjectByEvidence, subjects]);

  const series = useMemo<TrendSeries[]>(() => {
    if (!subject) return [];
    const assignmentEvidence = buildEvidenceSeries(progress.timeline, subject, 'assignment');
    const writingEvidence = buildEvidenceSeries(progress.timeline, subject, 'writing');
    const assignmentEvents = assignmentEvidence.length ? assignmentEvidence : buildAssignmentFallback(progress, subject);
    return [
      { key: 'assignment', label: 'Assignments', tone: 'assignment', events: assignmentEvents },
      { key: 'writing', label: 'Writing', tone: 'writing', events: writingEvidence },
    ].filter((item) => item.events.length) as TrendSeries[];
  }, [progress, subject]);

  const width = 620;
  const height = 224;
  const left = 90;
  const right = 26;
  const top = 22;
  const bottom = 40;
  const usableWidth = width - left - right;
  const usableHeight = height - top - bottom;
  const yAt = (value: number) => top + ((100 - value) / 100) * usableHeight;
  const allEvents = series.flatMap((item) => item.events.map((event) => ({ series: item, event })))
    .sort((a, b) => a.event.observedAt.localeCompare(b.event.observedAt));
  const validTimes = allEvents.map(({ event }) => Date.parse(event.observedAt)).filter(Number.isFinite);
  const minTime = validTimes.length ? Math.min(...validTimes) : 0;
  const maxTime = validTimes.length ? Math.max(...validTimes) : 0;
  const xAt = (event: TrendEvent, fallbackIndex: number, fallbackCount: number) => {
    const time = Date.parse(event.observedAt);
    if (Number.isFinite(time) && maxTime > minTime) return left + ((time - minTime) / (maxTime - minTime)) * usableWidth;
    return fallbackCount <= 1 ? left + usableWidth / 2 : left + (fallbackIndex / (fallbackCount - 1)) * usableWidth;
  };
  const plottedPoints: PlottedPoint[] = series.flatMap((trendSeries) => trendSeries.events.map((event, index) => ({
    key: `${trendSeries.key}:${event.key}`,
    series: trendSeries,
    event,
    x: xAt(event, index, trendSeries.events.length),
    y: yAt(event.score),
  })));
  const activePoint = activeKey ? plottedPoints.find((point) => point.key === activeKey) || null : null;
  const activeSeriesIndex = activePoint ? activePoint.series.events.findIndex((event) => event.key === activePoint.event.key) : -1;
  const previousEvent = activePoint && activeSeriesIndex > 0 ? activePoint.series.events[activeSeriesIndex - 1] : null;
  const pointDelta = activePoint && previousEvent ? activePoint.event.score - previousEvent.score : null;
  const firstEvent = allEvents[0]?.event || null;
  const lastEvent = allEvents[allEvents.length - 1]?.event || null;
  const overallDelta = allEvents.length > 1 ? allEvents[allEvents.length - 1].event.score - allEvents[0].event.score : 0;
  const trendText = allEvents.length === 0
    ? 'No evidence in this period'
    : allEvents.length < 2
      ? 'One evidence point so far'
      : overallDelta >= 10
        ? 'Overall evidence is moving up'
        : overallDelta <= -10
          ? 'Recent evidence needs attention'
          : 'Overall evidence is broadly steady';
  const horizontalEdge = activePoint ? activePoint.x / width < .3 ? 'left' : activePoint.x / width > .7 ? 'right' : 'center' : 'center';
  const verticalEdge = activePoint && activePoint.y / height < .38 ? 'below' : 'above';

  if (!subjects.length) return <div className="parent-smart-trend-empty">More assessed evidence is needed before a learning trend can be shown.</div>;

  return <div className="parent-smart-trend">
    <div className="parent-smart-trend-subjects" role="tablist" aria-label="Choose a subject trend">
      {subjectByEvidence.map((item) => <button
        key={item.subject}
        type="button"
        role="tab"
        aria-selected={normalizeSubject(item.subject) === normalizeSubject(subject)}
        className={normalizeSubject(item.subject) === normalizeSubject(subject) ? 'active' : ''}
        onClick={() => { setSubject(item.subject); setActiveKey(null); }}
      >{item.subject}</button>)}
    </div>

    <article className="parent-smart-trend-card">
      <header>
        <div><span>Learning trend</span><h3>{subject}</h3></div>
        <strong>{trendText}</strong>
      </header>

      {series.length > 1 ? <div className="parent-smart-trend-legend" aria-label={`${subject} evidence sources`}>
        {series.map((item) => <span key={item.key} className={`tone-${item.tone}`}><i aria-hidden="true" />{item.label}</span>)}
      </div> : null}

      {allEvents.length ? <>
        <div className="parent-smart-trend-chart-wrap">
          <svg className="parent-smart-trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${subject} learning evidence trend over the selected period`}>
            {[25, 60, 90].map((value) => <g key={value}>
              <line x1={left} y1={yAt(value)} x2={width - right} y2={yAt(value)} className="parent-smart-trend-guide" />
              <text x={left - 12} y={yAt(value) + 4} textAnchor="end" className="parent-smart-trend-axis">{value === 25 ? 'Needs support' : value === 60 ? 'Developing' : 'Strong'}</text>
            </g>)}
            {series.map((trendSeries) => trendSeries.events.length > 1 ? <polyline
              key={`${trendSeries.key}:line`}
              points={trendSeries.events.map((event, index) => `${xAt(event, index, trendSeries.events.length)},${yAt(event.score)}`).join(' ')}
              className={`parent-smart-trend-line tone-${trendSeries.tone}`}
            /> : null)}
            {plottedPoints.map((point, index) => <circle
              key={point.key}
              cx={point.x}
              cy={point.y}
              r="6.5"
              className={`parent-smart-trend-point tone-${point.series.tone}`}
              style={{ animationDelay: `${index * 70}ms` }}
              tabIndex={0}
              aria-label={`${formatDate(point.event.observedAt)}, ${point.series.label}, ${point.event.label}, ${trendPositionLabel(point.event.score)}`}
              onMouseEnter={() => setActiveKey(point.key)}
              onMouseLeave={() => setActiveKey(null)}
              onFocus={() => setActiveKey(point.key)}
              onBlur={() => setActiveKey(null)}
              onClick={() => setActiveKey((current) => current === point.key ? null : point.key)}
            />)}
            {firstEvent ? <text x={left} y={height - 9} className="parent-smart-trend-date">{formatDate(firstEvent.observedAt)}</text> : null}
            {lastEvent ? <text x={width - right} y={height - 9} textAnchor="end" className="parent-smart-trend-date">{formatDate(lastEvent.observedAt)}</text> : null}
          </svg>

          {activePoint ? <div className={`parent-smart-trend-tooltip edge-${horizontalEdge} edge-${verticalEdge} tone-${activePoint.series.tone}`} role="status">
            <div className="parent-smart-trend-tooltip-head"><span>{activePoint.series.label}</span><strong>{trendPositionLabel(activePoint.event.score)}</strong></div>
            <h4>{activePoint.event.label}</h4>
            <p>{activePoint.event.detail} · {formatDate(activePoint.event.observedAt)}</p>
            <div className="parent-smart-trend-tooltip-signals">
              {activePoint.event.strengthCount ? <span className="strong">{activePoint.event.strengthCount} strong</span> : null}
              {activePoint.event.developingCount ? <span className="developing">{activePoint.event.developingCount} developing</span> : null}
              {activePoint.event.focusCount ? <span className="support">{activePoint.event.focusCount} support</span> : null}
            </div>
            <small>{pointDelta == null ? 'First point in this evidence series' : `${pointDelta > 0 ? '↗' : pointDelta < 0 ? '↘' : '→'} ${Math.abs(pointDelta)} evidence points vs previous`}</small>
          </div> : null}
        </div>
        <p className="parent-smart-trend-note">This is a learning-evidence trend, not a simple average. It combines the same governed strength, developing and support signals used in the Academic Profile.</p>
      </> : <div className="parent-smart-trend-empty">No parent-safe evidence is available for {subject} in this reporting period yet.</div>}
    </article>
  </div>;
};

export default ParentLearningTrendChart;
