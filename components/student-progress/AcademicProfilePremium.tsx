import React, { useId, useState } from 'react';
import type { StudentAcademicProfile } from '../../services/studentAcademicProfileService';

export type ProfileIconName = 'result' | 'target' | 'support' | 'document' | 'trend' | 'strength' | 'clock' | 'calendar' | 'info' | 'back' | 'shield' | 'bell' | 'menu' | 'home' | 'book';
const paths: Record<ProfileIconName, React.ReactNode> = {
  result: <><rect x="4" y="13" width="3" height="7" rx="1"/><rect x="10" y="8" width="3" height="12" rx="1"/><rect x="16" y="3" width="3" height="17" rx="1"/></>,
  target: <><circle cx="11" cy="13" r="8"/><circle cx="11" cy="13" r="4"/><path d="m11 13 9-10M15 3h5v5"/></>,
  support: <><circle cx="12" cy="7" r="3"/><path d="M6 20v-3a6 6 0 0 1 12 0v3ZM3 9a2.5 2.5 0 0 1 3-4M21 9a2.5 2.5 0 0 0-3-4M2 19v-3a4 4 0 0 1 3-4M22 19v-3a4 4 0 0 0-3-4"/></>,
  document: <><path d="M6 3h8l4 4v14H6ZM14 3v5h4M9 12h6M9 16h6"/></>,
  trend: <><path d="M3 3v18h18M6 16l5-6 4 3 6-8"/><path d="M17 5h4v4"/></>,
  strength: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h1M14 14h1M8 17h1"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/></>,
  back: <path d="m10 5-7 7 7 7M3 12h18"/>,
  shield: <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6ZM8 12l3 3 5-6"/>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0v7l2 3H4l2-3ZM10 21h4"/></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
  home: <path d="m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9"/>,
  book: <path d="M12 5v16M12 5C9 3 6 3 3 4v16c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Z"/>,
};
export const ProfileIcon: React.FC<{ name: ProfileIconName; className?: string }> = ({ name, className = '' }) => <svg className={`ap-icon ${className}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;

export const ProfileSection: React.FC<{ title: string; icon: ProfileIconName; className?: string; subtitle?: string; children: React.ReactNode }> = ({ title, icon, className = '', subtitle, children }) => <section className={`ap-section ${className}`} aria-label={title}>
  <header className="ap-section-heading"><span className="ap-icon-disc"><ProfileIcon name={icon}/></span><div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div></header>{children}
</section>;

export const ProfileStat: React.FC<{ label: string; icon: ProfileIconName; value: React.ReactNode; detail: string; tone?: string }> = ({ label, icon, value, detail, tone = 'blue' }) => <article className={`ap-stat ap-stat--${tone}`}><span className="ap-icon-disc"><ProfileIcon name={icon}/></span><div><h2>{label}</h2><div className="ap-stat-value">{value}</div><p>{detail}</p></div></article>;

/** Keeps full collection totals distinct from preview size; expansion is local and accessible. */
export const ProfilePreview: React.FC<{ count: number; limit: number; label: string; children: (limit: number) => React.ReactNode }> = ({ count, limit, label, children }) => {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return <><div id={id}>{children(expanded ? count : limit)}</div>{count > limit ? <div className="ap-preview-footer"><span>Showing {expanded ? count : limit} of {count}</span><button type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show less' : 'View all'}<span className="ap-sr-only"> {label}</span></button></div> : null}</>;
};

/** Official outcomes are disconnected points, never a substitute for comparable skill progress. */
export const AssignmentResultTimeline: React.FC<{ assignments: StudentAcademicProfile['assignments'] }> = ({ assignments }) => {
  const id = useId();
  const [active, setActive] = useState<string | null>(null);
  const rows = [...assignments].filter(item => Number.isFinite(item.accuracy)).sort((a, b) => a.completed_at.localeCompare(b.completed_at));
  const times = rows.map(item => Date.parse(item.completed_at)).filter(Number.isFinite);
  const min = times.length ? Math.min(...times) : 0;
  const max = times.length ? Math.max(...times) : 0;
  const dates = new Set(rows.map(item => item.completed_at.slice(0, 10))).size;
  const dateLabel = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const selected = rows.find(item => `${item.assignment_id}:${item.completed_at}` === active);
  return <div className="ap-results-timeline"><div className="ap-results-plot" tabIndex={0} role="region" aria-label="Assignment result chart">
    <svg viewBox="0 0 640 142" role="img" aria-labelledby={id}>
      <title id={id}>Official assignment results; points do not imply comparable learning progress</title>
      {[0, 25, 50, 75, 100].map(value => <g key={value}><line x1="42" x2="620" y1={102 - value * .82} y2={102 - value * .82} className="ap-chart-guide"/><text x="33" y={106 - value * .82} textAnchor="end">{value}%</text></g>)}
      {rows.map((item, index) => {
        const key = `${item.assignment_id}:${item.completed_at}`;
        const time = Date.parse(item.completed_at);
        const x = max > min && Number.isFinite(time) ? 60 + 540 * (time - min) / (max - min) : 330;
        const y = 102 - Math.max(0, Math.min(100, item.accuracy)) * .82;
        return <g key={key}><line x1={x} x2={x} y1={y} y2="102" className="ap-chart-guide"/><circle cx={x} cy={y} r="4.5" tabIndex={0} role="button" aria-label={`${item.subject}, ${item.title}, ${dateLabel(item.completed_at)}, ${item.accuracy}%`} onFocus={() => setActive(key)} onBlur={() => setActive(null)} onMouseEnter={() => setActive(key)} onMouseLeave={() => setActive(null)} onClick={() => setActive(active === key ? null : key)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setActive(active === key ? null : key); } }}/>{rows.length === 1 || active === key ? <text className="ap-chart-value" x={x} y={y - 11} textAnchor="middle">{Math.round(item.accuracy)}%</text> : null}{rows.length === 1 || index === 0 || index === rows.length - 1 ? <text x={x} y="122" textAnchor="middle">{dateLabel(item.completed_at)}</text> : null}{rows.length === 1 ? <text x={x} y="137" textAnchor="middle">{item.title.length > 45 ? `${item.title.slice(0, 42)}…` : item.title}</text> : null}</g>;
      })}
    </svg>{selected ? <p className="ap-chart-detail" role="status">{selected.subject} · {selected.title} · {dateLabel(selected.completed_at)} · {selected.correct}/{selected.correct + selected.incorrect} correct ({selected.accuracy}%)</p> : null}
  </div><aside className="ap-trend-context"><span className="ap-icon-disc"><ProfileIcon name="result"/></span><strong>{dates} assessment date{dates === 1 ? '' : 's'}</strong><p>{dates <= 1 ? 'Progress comparison begins after another comparable assessment.' : 'Assignment outcomes are shown separately. Progress compares the same skill across assessment dates.'}</p></aside></div>;
};
