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

type TrendState = {
  label: string;
  hasReliableTrend: boolean;
};

const normalizeSubject = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^maths$/, 'mathematics');

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

const dayKey = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : date.toISOString().slice(0, 10);
};

const observationSignal = (item: TimelineItem) => {
  const raw = item.evidence_percentage == null ? null : Number(item.evidence_percentage);
  const percentage = raw == null || Number.isNaN(raw) ? null : Math.max(0, Math.min(100, raw));
  if (item.observation_type === 'focus') return percentage == null ? 28 : 16 + percentage * 0.24;
  if (item.observation_type === 'strength') return percentage == null ? 90 : 80 + percentage * 0.16;
  return percentage == null ? 62 : 48 + percentage * 0.24;
};

const trendPositionLabel = (score: number) => score >= 78 ? 'Strong evidence' : score >= 46 ? 'Developing evidence' : 'Needs support';

const signalCounts = (items: TimelineItem[], fallbackScore?: number) => {
  if (!items.length && fallbackScore != null) {
    return {
      focusCount: fallbackScore < 46 ? 1 : 0,
      developingCount: fallbackScore >= 46 && fallbackScore < 78 ? 1 : 0,
      strengthCount: fallbackScore >= 78 ? 1 : 0,
    };
  }
  return items.reduce((counts, item) => {
    if (item.observation_type === 'focus') counts.focusCount += 1;
    else if (item.observation_type === 'strength') counts.strengthCount += 1;
    else counts.developingCount += 1;
    return counts;
  }, { focusCount: 0, developingCount: 0, strengthCount: 0 });
};

const buildAssignmentSeries = (progress: GuardianChildProgress, subject: string): TrendEvent[] => {
  const observations = progress.timeline.filter((item) => normalizeSubject(item.subject) === normalizeSubject(subject) && item.source_type === 'assignment_result');
  const observationsByAssignment = new Map<string, TimelineItem[]>();
  observations.forEach((item) => {
    if (!item.source_id) return;
    const rows = observationsByAssignment.get(item.source_id) || [];
    rows.push(item);
    observationsByAssignment.set(item.source_id, rows);
  });

  return progress.recent_assignments
    .filter((item) => normalizeSubject(item.subject) === normalizeSubject(subject))
    .map((item) => {
      const score = Math.max(0, Math.min(100, Number(item.accuracy) || 0));
      const governedRows = observationsByAssignment.get(item.assignment_id) || [];
      return {
        key: `assignment:${item.assignment_id}`,
        observedAt: item.completed_at,
        score,
        label: item.title,
        detail: item.topic || 'Completed assignment',
        ...signalCounts(governedRows, score),
      };
    })
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
};

const buildWritingSeries = (items: TimelineItem[], subject: string): TrendEvent[] => {
  const groups = new Map<string, {
    values: number[];
    observedAt: string;
    labels: string[];
    rows: TimelineItem[];
  }>();

  items
    .filter((item) => normalizeSubject(item.subject) === normalizeSubject(subject) && item.source_type === 'writing_attempt')
    .forEach((item) => {
      const key = item.source_id ? `writing:${item.source_id}` : `writing:${item.observed_at.slice(0, 19)}`;
      const group = groups.get(key) || { values: [], observedAt: item.observed_at, labels: [], rows: [] };
      group.values.push(observationSignal(item));
      group.rows.push(item);
      const label = item.subskill || item.skill;
      if (label && !group.labels.includes(label)) group.labels.push(label);
      if (item.observed_at > group.observedAt) group.observedAt = item.observed_at;
      groups.set(key, group);
    });

  return [...groups.entries()].map(([key, group]) => ({
    key,
    observedAt: group.observedAt,
    score: Math.round(group.values.reduce((sum, value) => sum + value, 0) / Math.max(group.values.length, 1)),
    label: group.labels.slice(0, 2).join(' · ') || 'Writing evidence',
    detail: 'Writing Hub evidence',
    ...signalCounts(group.rows),
  })).sort((a, b) => a.observedAt.localeCompare(b.observedAt));
};

const buildTrendState = (events: Array<{ event: TrendEvent }>): TrendState => {
  if (!events.length) return { label: 'No evidence in this period', hasReliableTrend: false };
  if (events.length === 1) return { label: 'Building a baseline', hasReliableTrend: false };

  const daily = new Map<string, number[]>();
  events.forEach(({ event }) => {
    const key = dayKey(event.observedAt);
    const values = daily.get(key) || [];
    values.push(event.score);
    daily.set(key, values);
  });

  const days = [...daily.keys()].sort();
  const firstTime = Date.parse(events[0].event.observedAt);
  const lastTime = Date.parse(events[events.length - 1].event.observedAt);
  const spanDays = Number.isFinite(firstTime) && Number.isFinite(lastTime) ? (lastTime - firstTime) / 86400000 : 0;

  if (events.length < 3 || days.length < 2 || spanDays < 7) {
    return { label: 'Building a baseline', hasReliableTrend: false };
  }

  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
  const delta = average(daily.get(days[days.length - 1]) || []) - average(daily.get(days[0]) || []);
  if (delta >= 10) return { label: 'Overall evidence is moving up', hasReliableTrend: true };
  if (delta <= -10) return { label: 'Recent evidence needs attention', hasReliableTrend: true };
  return { label: 'Overall evidence is broadly steady', hasReliableTrend: true };
};

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
    const assignmentEvents = buildAssignmentSeries(progress, subject);
    const writingEvents = buildWritingSeries(progress.timeline, subject);
    return [
      { key: 'assignment', label: 'Assignments', tone: 'assignment', events: assignmentEvents },
      { key: 'writing', label: 'Writing', tone: 'writing', events: writingEvents },
    ].filter((item) => item.events.length) as TrendSeries[];
  }, [progress, subject]);

  const width = 520;
  const height = 270;
  const left = 94;
  const right = 20;
  const top = 28;
  const bottom = 46;
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
  const evidenceDays = [...new Set(allEvents.map(({ event }) => dayKey(event.observedAt)))];
  const sameEvidenceDay = evidenceDays.length === 1;
  const trendState = buildTrendState(allEvents);
  const horizontalEdge = activePoint ? activePoint.x / width < .3 ? 'left' : activePoint.x / width > .7 ? 'right' : 'center' : 'center';
  const verticalEdge = activePoint && activePoint.y / height < .38 ? 'below' : 'above';
  const baselineCopy = firstEvent && !trendState.hasReliableTrend
    ? sameEvidenceDay
      ? `Based on assessed work from ${formatDate(firstEvent.observedAt)}. A few more days of assessed work are needed before Brains Heist can identify a reliable learning trend.`
      : `Based on assessed work from ${formatDate(firstEvent.observedAt)} to ${formatDate(lastEvent?.observedAt)}. More history is needed before Brains Heist can identify a reliable learning trend.`
    : null;

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
        <div><span>Learning trend</span></div>
        <strong>{trendState.label}</strong>
      </header>

      {series.length ? <div className="parent-smart-trend-legend" aria-label={`${subject} evidence sources`}>
        {series.map((item) => <span key={item.key} className={`tone-${item.tone}`}><i aria-hidden="true" />{item.label}</span>)}
      </div> : null}

      {allEvents.length ? <>
        <div className="parent-smart-trend-chart-wrap">
          <svg className="parent-smart-trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${subject} learning evidence trend over the selected period`}>
            {[25, 60, 90].map((value) => <g key={value}>
              <line x1={left} y1={yAt(value)} x2={width - right} y2={yAt(value)} className="parent-smart-trend-guide" />
              <text x={left - 10} y={yAt(value) + 4} textAnchor="end" className="parent-smart-trend-axis">{value === 25 ? 'Needs support' : value === 60 ? 'Developing' : 'Strong'}</text>
            </g>)}
            {trendState.hasReliableTrend ? series.map((trendSeries) => trendSeries.events.length > 1 ? <polyline
              key={`${trendSeries.key}:line`}
              points={trendSeries.events.map((event, index) => `${xAt(event, index, trendSeries.events.length)},${yAt(event.score)}`).join(' ')}
              className={`parent-smart-trend-line tone-${trendSeries.tone}`}
            /> : null) : null}
            {plottedPoints.map((point, index) => <circle
              key={point.key}
              cx={point.x}
              cy={point.y}
              r="7.5"
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
            {sameEvidenceDay && firstEvent ? <text x={left + usableWidth / 2} y={height - 10} textAnchor="middle" className="parent-smart-trend-date">{formatDate(firstEvent.observedAt)}</text> : null}
            {!sameEvidenceDay && firstEvent ? <text x={left} y={height - 10} className="parent-smart-trend-date">{formatDate(firstEvent.observedAt)}</text> : null}
            {!sameEvidenceDay && lastEvent ? <text x={width - right} y={height - 10} textAnchor="end" className="parent-smart-trend-date">{formatDate(lastEvent.observedAt)}</text> : null}
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
            <small>{pointDelta == null ? 'First point in this evidence series' : `${pointDelta > 0 ? '↗' : pointDelta < 0 ? '↘' : '→'} ${Math.abs(pointDelta)} points vs previous ${activePoint.series.label.toLowerCase()} evidence`}</small>
          </div> : null}
        </div>
        {baselineCopy ? <p className="parent-smart-trend-baseline">{baselineCopy}</p> : null}
      </> : <div className="parent-smart-trend-empty">No parent-safe evidence is available for {subject} in this reporting period yet.</div>}
    </article>
  </div>;
};

export default ParentLearningTrendChart;
