import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../../styles/ielts-course.css';
import IeltsStudentShell from '../../components/ielts/student/IeltsStudentShell';
import {
  cachedIeltsCourseState,
  fetchIeltsCourseState,
  ieltsCourseAccessMessage,
  ieltsCourseUnitRoute,
  type IeltsCourseState,
  type IeltsCourseUnitSummary,
} from '../../../services/ieltsCourseService';
import { chapterFor, courseChapters, primarySkill, skillTheme } from './ieltsCourseTheme';

/** Horizontal offset (in % of the lane) for the winding route. */
const laneOffset = (position: number) => Math.round(Math.sin((position - 1) * 0.95) * 30);

function ProgressRing({ percent }: { percent: number }) {
  const r = 30, c = 2 * Math.PI * r;
  return (
    <svg className="ic-ring" viewBox="0 0 72 72" aria-hidden="true">
      <circle cx="36" cy="36" r={r} className="ic-ring-track" />
      <circle cx="36" cy="36" r={r} className="ic-ring-value" strokeDasharray={c} strokeDashoffset={c * (1 - percent / 100)} />
      <text x="36" y="41" textAnchor="middle">{percent}%</text>
    </svg>
  );
}

/** A smooth trail through the stops of one chapter: solid where cleared, dashed ahead. */
function RouteTrail({ list, version }: { list: React.RefObject<HTMLOListElement | null>; version: string }) {
  const [paths, setPaths] = useState<{ done: string; ahead: string; w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const ol = list.current;
    if (!ol) return;
    const draw = () => {
      const box = ol.getBoundingClientRect();
      const stops = Array.from(ol.querySelectorAll<HTMLElement>('.ic-medallion')).map((m) => {
        const r = m.getBoundingClientRect();
        return { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2, done: Boolean(m.closest('.ic-stop--done')) };
      });
      if (stops.length < 2) { setPaths(null); return; }
      const seg = (a: { x: number; y: number }, b: { x: number; y: number }) => {
        const my = (a.y + b.y) / 2;
        return ` C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.y}`;
      };
      let done = '', ahead = '';
      stops.slice(1).forEach((b, i) => {
        const a = stops[i]!;
        const piece = `M ${a.x} ${a.y}${seg(a, b)}`;
        if (a.done && b.done) done += piece; else if (a.done) done += piece; else ahead += piece;
      });
      setPaths({ done, ahead, w: box.width, h: box.height });
    };
    draw();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(draw) : null;
    ro?.observe(ol);
    window.addEventListener('resize', draw);
    return () => { ro?.disconnect(); window.removeEventListener('resize', draw); };
  }, [list, version]);
  if (!paths) return null;
  return (
    <svg className="ic-trail" width={paths.w} height={paths.h} viewBox={`0 0 ${paths.w} ${paths.h}`} aria-hidden="true">
      <path d={paths.ahead} className="ic-trail-ahead" />
      <path d={paths.done} className="ic-trail-done" />
    </svg>
  );
}

function ChapterRoute({ label, version, children }: { label: string; version: string; children: React.ReactNode }) {
  const ref = useRef<HTMLOListElement | null>(null);
  return (
    <div className="ic-route-wrap">
      <ol ref={ref} className="ic-route" aria-label={label}>{children}</ol>
      {/* After the list so its ref is attached before the trail measures it. */}
      <RouteTrail list={ref} version={version} />
    </div>
  );
}

/**
 * The course map: twenty units on one winding route, grouped into four chapters. Tapping a stop opens a sheet with
 * what the unit covers. Unit 1 is open to everyone; later units need a school IELTS seat or IELTS Prime.
 */
const IeltsCoursePath: React.FC = () => {
  const navigate = useNavigate();
  const [state, setState] = useState<IeltsCourseState | null>(() => cachedIeltsCourseState());
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [sheet, setSheet] = useState<IeltsCourseUnitSummary | null>(null);
  const currentRef = useRef<HTMLLIElement | null>(null);
  const scrolled = useRef(false);

  useEffect(() => {
    let alive = true;
    setError(null);
    fetchIeltsCourseState()
      .then((next) => { if (alive) setState(next); })
      .catch((err: unknown) => { if (alive) setError(err instanceof Error ? err.message : 'The course could not load.'); });
    return () => { alive = false; };
  }, [retry]);

  useEffect(() => {
    if (!state || scrolled.current || !currentRef.current) return;
    scrolled.current = true;
    if ((state.current_unit_id ?? 1) > 2) currentRef.current.scrollIntoView({ block: 'center', behavior: 'auto' });
  }, [state]);

  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheet(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet]);

  const currentUnit = useMemo(() => state?.units.find((u) => u.id === state.current_unit_id) ?? null, [state]);
  const allDone = Boolean(state && state.units_total > 0 && state.units_completed === state.units_total);
  const percent = state && state.units_total ? Math.round((100 * state.units_completed) / state.units_total) : 0;
  const access = state ? ieltsCourseAccessMessage(state.access.reason) : null;
  const tasksDone = state ? state.units.reduce((n, u) => n + u.tasks.filter((t) => t.completed).length, 0) : 0;

  const start = (unit: IeltsCourseUnitSummary) => {
    if (unit.unlocked) navigate(ieltsCourseUnitRoute(unit.id));
    else if (unit.locked_reason === 'needs_access' && state?.access.reason === 'prime_required') navigate('/ielts/apply-prime');
  };

  return (
    <IeltsStudentShell active="course">
      <div className="ic-page ic-page--embedded">
        <main className="ic-main">
          <section className="ic-hero" aria-labelledby="ic-course-title">
            <div className="ic-hero-glow" aria-hidden="true" />
            <div className="ic-hero-row">
              <div>
                <div className="ic-eyebrow ic-eyebrow--light">Brains Heist IELTS · self-paced</div>
                <h1 id="ic-course-title">Your route to IELTS</h1>
                <p>Twenty short units. A lesson, then real practice with instant feedback. Finish one stop to open the next.</p>
              </div>
              <ProgressRing percent={percent} />
            </div>
            <div className="ic-stats" aria-label="Your progress">
              <span><b>{state?.units_completed ?? 0}</b> of {state?.units_total ?? 20} units</span>
              <span><b>{tasksDone}</b> tasks done</span>
              <span><b>{currentUnit ? chapterFor(currentUnit.position).index : allDone ? 4 : 1}</b> of 4 chapters</span>
            </div>
            {currentUnit && (
              <button type="button" className="ic-btn ic-btn--light ic-btn--glow" onClick={() => (currentUnit.unlocked ? start(currentUnit) : setSheet(currentUnit))}>
                {currentUnit.unlocked ? `${currentUnit.lesson_viewed ? 'Continue' : 'Start'} Unit ${currentUnit.position}` : 'Unlock the full course'} <span aria-hidden="true">→</span>
              </button>
            )}
            {allDone && <p className="ic-hero-done">🏆 Route complete. Revisit any stop to practise again.</p>}
          </section>

          {error && (
            <div className="ic-notice ic-notice--error" role="alert">
              <b>{error}</b>
              <button type="button" className="ic-btn ic-btn--ghost" onClick={() => setRetry((n) => n + 1)}>Retry</button>
            </div>
          )}

          {state && !state.access.full && access?.cta && (
            <div className="ic-unlock" role="status">
              <span className="ic-unlock-icon" aria-hidden="true">✦</span>
              <div>
                <b>{access.title}</b>
                <span>{access.body}</span>
              </div>
              {access.cta === 'prime' && (
                <button type="button" className="ic-btn ic-btn--gold" onClick={() => navigate('/ielts/apply-prime')}>See Prime plans</button>
              )}
            </div>
          )}

          {!state && !error && (
            <div className="ic-route" aria-busy="true">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="ic-skeleton" style={{ marginLeft: `${30 + laneOffset(i + 1) / 2}%` }} />)}
            </div>
          )}

          {state && courseChapters.map((chapter) => {
            const units = state.units.filter((u) => u.position >= chapter.from && u.position <= chapter.to);
            if (!units.length) return null;
            const done = units.filter((u) => u.completed).length;
            return (
              <section key={chapter.index} className={`ic-chapter ic-chapter--${chapter.index}`} aria-labelledby={`ic-chapter-${chapter.index}`}>
                <header className="ic-chapter-banner">
                  <span className="ic-chapter-emblem" aria-hidden="true">{chapter.emblem}</span>
                  <div>
                    <p className="ic-eyebrow ic-eyebrow--light">Chapter {chapter.index} · units {chapter.from}–{chapter.to}</p>
                    <h2 id={`ic-chapter-${chapter.index}`}>{chapter.title}</h2>
                    <p>{chapter.tagline}</p>
                  </div>
                  <span className="ic-chapter-count">{done}/{units.length}</span>
                </header>
                <ChapterRoute label={`${chapter.title} units`} version={units.map((u) => `${u.id}:${u.completed ? 1 : 0}`).join(',')}>
                  {units.map((unit) => {
                    const skill = primarySkill(unit.focus_skills);
                    const theme = skillTheme[skill];
                    const isCurrent = unit.id === state.current_unit_id;
                    const status = unit.completed ? 'done' : unit.unlocked ? (isCurrent ? 'current' : 'open') : 'locked';
                    const doneTasks = unit.tasks.filter((t) => t.completed).length;
                    return (
                      <li
                        key={unit.id}
                        ref={isCurrent ? currentRef : undefined}
                        className={`ic-stop ic-stop--${status}`}
                        style={{ ['--lane' as string]: `${laneOffset(unit.position)}%`, ['--tone' as string]: theme.tone, ['--soft' as string]: theme.soft } as React.CSSProperties}
                      >
                        {isCurrent && <span className="ic-here">You are here</span>}
                        <button
                          type="button"
                          className="ic-medallion"
                          aria-label={`Unit ${unit.position}: ${unit.title}. ${status === 'done' ? 'Completed' : status === 'locked' ? 'Locked' : `${doneTasks} of ${unit.tasks.length} tasks done`}`}
                          onClick={() => setSheet(unit)}
                        >
                          <span className="ic-medallion-face" aria-hidden="true">{status === 'done' ? '✓' : status === 'locked' ? '🔒' : theme.icon}</span>
                          <span className="ic-medallion-num" aria-hidden="true">{unit.position}</span>
                          {status !== 'locked' && unit.tasks.length > 0 && (
                            <svg className="ic-medallion-ring" viewBox="0 0 80 80" aria-hidden="true">
                              <circle cx="40" cy="40" r="36" strokeDasharray={226} strokeDashoffset={226 * (1 - doneTasks / unit.tasks.length)} />
                            </svg>
                          )}
                        </button>
                        <span className="ic-stop-label" aria-hidden="true">{unit.title}</span>
                        {unit.is_free_preview && <span className="ic-free" aria-hidden="true">Free</span>}
                      </li>
                    );
                  })}
                </ChapterRoute>
              </section>
            );
          })}
        </main>

        {sheet && (
          <div className="ic-sheet-backdrop" onClick={() => setSheet(null)}>
            <div className="ic-sheet" role="dialog" aria-modal="true" aria-labelledby="ic-sheet-title" onClick={(e) => e.stopPropagation()}
              style={{ ['--tone' as string]: skillTheme[primarySkill(sheet.focus_skills)].tone } as React.CSSProperties}>
              <span className="ic-sheet-grip" aria-hidden="true" />
              <p className="ic-eyebrow">Unit {sheet.position} · {chapterFor(sheet.position).title} · about {sheet.estimated_minutes} min</p>
              <h2 id="ic-sheet-title">{sheet.title}</h2>
              {sheet.subtitle && <p className="ic-sheet-sub">{sheet.subtitle}</p>}
              <div className="ic-sheet-skills">
                {sheet.focus_skills.map((s) => <span key={s} className="ic-chip" style={{ ['--tone' as string]: skillTheme[s].tone } as React.CSSProperties}>{skillTheme[s].icon} {skillTheme[s].label}</span>)}
                {sheet.is_free_preview && <span className="ic-chip ic-chip--free">Free unit</span>}
              </div>
              <ol className="ic-sheet-steps">
                <li className={sheet.lesson_viewed ? 'is-done' : ''}><span>1</span>Short lesson</li>
                {sheet.tasks.map((t, i) => (
                  <li key={`${t.skill}-${t.task_id}`} className={t.completed ? 'is-done' : ''}>
                    <span>{i + 2}</span>{skillTheme[t.skill].icon} {t.title || skillTheme[t.skill].label}
                  </li>
                ))}
              </ol>
              {sheet.unlocked ? (
                <button type="button" className="ic-btn ic-btn--primary ic-btn--block" onClick={() => start(sheet)}>
                  {sheet.completed ? 'Review this unit' : sheet.lesson_viewed ? 'Continue unit' : 'Start unit'} <span aria-hidden="true">→</span>
                </button>
              ) : sheet.locked_reason === 'previous_unit' ? (
                <p className="ic-sheet-lock">🔒 Finish Unit {sheet.position - 1} to open this stop.</p>
              ) : state?.access.reason === 'prime_required' ? (
                <button type="button" className="ic-btn ic-btn--gold ic-btn--block" onClick={() => navigate('/ielts/apply-prime')}>Unlock with IELTS Prime</button>
              ) : (
                <p className="ic-sheet-lock">🔒 Ask your school admin for an IELTS seat to open this unit.</p>
              )}
              <button type="button" className="ic-btn ic-btn--ghost ic-btn--block" onClick={() => setSheet(null)}>Close</button>
            </div>
          </div>
        )}
      </div>
    </IeltsStudentShell>
  );
};

export default IeltsCoursePath;
