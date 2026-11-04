import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../../styles/ielts-course.css';
import { useSheetDismiss } from '../../components/ielts/useSheetDismiss';
import IeltsStudentShell from '../../components/ielts/student/IeltsStudentShell';
import { IeltsCourseHabitBar, IeltsHabitCelebration, useIeltsCourseHabit } from '../../components/ielts/IeltsCourseHabit';
import { IeltsLeagueCard } from './IeltsCourseLeague';
import { IeltsExamCountdown, IeltsExamPlanSheet } from '../../components/ielts/IeltsExamPlan';
import { useIeltsAudience } from '../../lib/ieltsAudience';
import {
  cachedIeltsCourseState,
  fetchIeltsCourseState,
  ieltsCourseAccessMessage,
  ieltsCourseTaskKey,
  ieltsCourseUnitLabel,
  ieltsCourseUnitRoute,
  type IeltsCourseState,
  type IeltsCourseTrack,
  type IeltsCourseTrackState,
  type IeltsCourseUnitSummary,
} from '../../../services/ieltsCourseService';
import IeltsSeatRequest from '../../components/ielts/IeltsSeatRequest';
import { chapterFor, chaptersFor, primarySkill, skillTheme } from './ieltsCourseTheme';

const trackCopy: Record<IeltsCourseTrack, { eyebrow: string; title: string; body: string; unitWord: string }> = {
  main: {
    eyebrow: 'Brains Heist IELTS · self-paced',
    title: 'Your route to IELTS',
    body: 'Twenty short units. A lesson, then real practice with instant feedback. Finish one stop to open the next.',
    unitWord: 'units',
  },
  vocabulary: {
    eyebrow: 'Brains Heist IELTS · vocabulary path',
    title: 'Word power',
    body: 'Six vocabulary lessons, six short steps each. Every step marks itself and explains each answer. Finish a lesson to open the next.',
    unitWord: 'lessons',
  },
};

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
  const [track, setTrack] = useState<IeltsCourseTrack>(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('path') === 'vocabulary' ? 'vocabulary' : 'main');
  const [state, setState] = useState<IeltsCourseState | null>(() => cachedIeltsCourseState());
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [sheet, setSheet] = useState<IeltsCourseUnitSummary | null>(null);
  const sheetRef = useSheetDismiss<HTMLDivElement>(() => setSheet(null));
  const currentRef = useRef<HTMLLIElement | null>(null);
  const { habit, setHabit } = useIeltsCourseHabit();
  const audience = useIeltsAudience();
  const [planOpen, setPlanOpen] = useState(false);
  const firstVisit = Boolean(habit?.exam && !habit.exam.onboarded && audience === 'independent');
  const scrolled = useRef(false);

  useEffect(() => {
    let alive = true;
    setError(null);
    fetchIeltsCourseState()
      .then((next) => { if (alive) setState(next); })
      .catch((err: unknown) => { if (alive) setError(err instanceof Error ? err.message : 'The course could not load.'); });
    return () => { alive = false; };
  }, [retry]);

  /** The path being shown: the main route, or the separate vocabulary path. */
  const view: IeltsCourseTrackState | null = state ? (track === 'vocabulary' ? state.vocabulary ?? null : state) : null;
  const copy = trackCopy[track];
  const chapters = chaptersFor(track);
  const chooseTrack = (next: IeltsCourseTrack) => {
    if (next === track) return;
    scrolled.current = false;
    setSheet(null);
    setTrack(next);
    // Keep the choice in the address so Back, refresh and links return to the same path.
    try { window.history.replaceState(window.history.state, '', next === 'vocabulary' ? '/ielts/course?path=vocabulary' : '/ielts/course'); } catch { /* history unavailable */ }
  };

  useEffect(() => {
    if (!view || scrolled.current || !currentRef.current) return;
    scrolled.current = true;
    const current = view.units.find((u) => u.id === view.current_unit_id);
    if ((current?.position ?? 1) > 2) currentRef.current.scrollIntoView({ block: 'center', behavior: 'auto' });
  }, [view]);

  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheet(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet]);

  const currentUnit = useMemo(() => view?.units.find((u) => u.id === view.current_unit_id) ?? null, [view]);
  const allDone = Boolean(view && view.units_total > 0 && view.units_completed === view.units_total);
  const percent = view && view.units_total ? Math.round((100 * view.units_completed) / view.units_total) : 0;
  const baseAccess = state ? ieltsCourseAccessMessage(state.access.reason) : null;
  const access = baseAccess && track === 'vocabulary' && baseAccess.cta
    ? {
      ...baseAccess,
      title: 'V1 is free. V2 to V6 are part of IELTS Prime.',
      body: state?.access.reason === 'prime_required' ? 'Try the first vocabulary lesson, then unlock the whole path and the full course with IELTS Prime.' : 'Your school has not given you an IELTS seat. Unlock V2 to V6 with IELTS Prime, or ask your school for a seat.',
    }
    : baseAccess;
  const tasksDone = view ? view.units.reduce((n, u) => n + u.tasks.filter((t) => t.completed).length, 0) : 0;
  const otherTrack: IeltsCourseTrack = track === 'main' ? 'vocabulary' : 'main';
  const otherView = state ? (otherTrack === 'vocabulary' ? state.vocabulary ?? null : state) : null;

  const start = (unit: IeltsCourseUnitSummary) => {
    if (unit.unlocked) navigate(ieltsCourseUnitRoute(unit.id));
    else if (unit.locked_reason === 'needs_access' && state?.access.reason === 'prime_required') navigate('/ielts/apply-prime');
  };

  return (
    <IeltsStudentShell active="course">
      <div className="ic-page ic-page--embedded">
        <main className="ic-main">
          {(firstVisit || planOpen) && habit?.exam && (
            <IeltsExamPlanSheet initial={habit.exam} firstVisit={firstVisit} onClose={() => setPlanOpen(false)}
              onDone={(next) => { setHabit(next); setPlanOpen(false); }} />
          )}
          {!firstVisit && <IeltsHabitCelebration habit={habit} />}
          <IeltsCourseHabitBar habit={habit} onChange={setHabit} />
          <IeltsLeagueCard />
          {habit?.exam?.onboarded && <IeltsExamCountdown exam={habit.exam} onEdit={() => setPlanOpen(true)} />}

          <div className="ic-tracks" role="tablist" aria-label="Course paths">
            {(['main', 'vocabulary'] as IeltsCourseTrack[]).map((t) => {
              const v = t === track ? view : otherView;
              return (
                <button key={t} type="button" role="tab" aria-selected={t === track} className={`ic-track${t === track ? ' is-active' : ''} ic-track--${t}`} onClick={() => chooseTrack(t)}>
                  <span className="ic-track-icon" aria-hidden="true">{t === 'main' ? '🧭' : '🔤'}</span>
                  <span className="ic-track-text">
                    <b>{t === 'main' ? 'Skills route' : 'Vocabulary'}</b>
                    <small>{v ? `${v.units_completed}/${v.units_total} ${trackCopy[t].unitWord}` : t === 'main' ? '20 units' : '6 lessons'}</small>
                  </span>
                </button>
              );
            })}
          </div>

          <section className={`ic-hero ic-hero--${track}`} aria-labelledby="ic-course-title">
            <div className="ic-hero-glow" aria-hidden="true" />
            <div className="ic-hero-row">
              <div>
                <div className="ic-eyebrow ic-eyebrow--light">{copy.eyebrow}</div>
                <h1 id="ic-course-title">{copy.title}</h1>
                <p>{copy.body}</p>
              </div>
              <ProgressRing percent={percent} />
            </div>
            <div className="ic-stats" aria-label="Your progress">
              <span><b>{view?.units_completed ?? 0}</b> of {view?.units_total ?? (track === 'main' ? 20 : 6)} {copy.unitWord}</span>
              <span><b>{tasksDone}</b> {track === 'main' ? 'tasks' : 'steps'} done</span>
              {track === 'main'
                ? <span><b>{currentUnit ? chapterFor(currentUnit.position).index : allDone ? 4 : 1}</b> of 4 chapters</span>
                : <span><b>{view ? view.units.reduce((n, u) => n + u.tasks.length, 0) : 36}</b> steps in all</span>}
            </div>
            {currentUnit && (
              <button type="button" className="ic-btn ic-btn--light ic-btn--glow" onClick={() => (currentUnit.unlocked ? start(currentUnit) : setSheet(currentUnit))}>
                {currentUnit.unlocked ? `${currentUnit.lesson_viewed ? 'Continue' : 'Start'} ${ieltsCourseUnitLabel(currentUnit)}` : 'Unlock the full course'} <span aria-hidden="true">→</span>
              </button>
            )}
            {allDone && <p className="ic-hero-done">🏆 {track === 'main' ? 'Route complete. Revisit any stop to practise again.' : 'Vocabulary path complete. Revisit any lesson to practise again.'}</p>}
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
              <div className="ic-unlock-actions">
                {access.cta === 'prime' && (
                  <button type="button" className="ic-btn ic-btn--gold" onClick={() => navigate('/ielts/apply-prime')}>See Prime plans</button>
                )}
                {access.askSchool && <IeltsSeatRequest />}
              </div>
            </div>
          )}

          {!state && !error && (
            <div className="ic-route" aria-busy="true">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="ic-skeleton" style={{ marginLeft: `${30 + laneOffset(i + 1) / 2}%` }} />)}
            </div>
          )}

          {state && !view && (
            <div className="ic-notice" role="status"><b>The vocabulary path is on its way. Refresh in a moment.</b></div>
          )}

          {view && chapters.map((chapter) => {
            const units = view.units.filter((u) => u.position >= chapter.from && u.position <= chapter.to);
            if (!units.length) return null;
            const done = units.filter((u) => u.completed).length;
            return (
              <section key={chapter.index} className={`ic-chapter ic-chapter--${chapter.index}${track === 'vocabulary' ? ' ic-chapter--vocab' : ''}`} aria-labelledby={`ic-chapter-${chapter.index}`}>
                <header className="ic-chapter-banner">
                  <span className="ic-chapter-emblem" aria-hidden="true">{chapter.emblem}</span>
                  <div>
                    <p className="ic-eyebrow ic-eyebrow--light">{track === 'main' ? `Chapter ${chapter.index} · units ${chapter.from}–${chapter.to}` : `${units.length} lessons · 6 steps each`}</p>
                    <h2 id={`ic-chapter-${chapter.index}`}>{chapter.title}</h2>
                    <p>{chapter.tagline}</p>
                  </div>
                  <span className="ic-chapter-count">{done}/{units.length}</span>
                </header>
                <ChapterRoute label={`${chapter.title} units`} version={units.map((u) => `${u.id}:${u.completed ? 1 : 0}`).join(',')}>
                  {units.map((unit) => {
                    const skill = primarySkill(unit.focus_skills);
                    const theme = skillTheme[skill];
                    const isCurrent = unit.id === view.current_unit_id;
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
                          aria-label={`${ieltsCourseUnitLabel(unit)}: ${unit.title}. ${status === 'done' ? 'Completed' : status === 'locked' ? 'Locked' : `${doneTasks} of ${unit.tasks.length} tasks done`}`}
                          onClick={() => setSheet(unit)}
                        >
                          <span className="ic-medallion-face" aria-hidden="true">{status === 'done' ? '✓' : status === 'locked' ? '🔒' : theme.icon}</span>
                          <span className="ic-medallion-num" aria-hidden="true">{track === 'vocabulary' ? `V${unit.position}` : unit.position}</span>
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
            <div ref={sheetRef} className="ic-sheet" role="dialog" aria-modal="true" aria-labelledby="ic-sheet-title" onClick={(e) => e.stopPropagation()}
              style={{ ['--tone' as string]: skillTheme[primarySkill(sheet.focus_skills)].tone } as React.CSSProperties}>
              <span className="ic-sheet-grip" aria-hidden="true" />
              <p className="ic-eyebrow">{ieltsCourseUnitLabel(sheet)} · {chapterFor(sheet.position, sheet.track).title} · about {sheet.estimated_minutes} min</p>
              <h2 id="ic-sheet-title">{sheet.title}</h2>
              {sheet.subtitle && <p className="ic-sheet-sub">{sheet.subtitle}</p>}
              <div className="ic-sheet-skills">
                {sheet.focus_skills.map((s) => <span key={s} className="ic-chip" style={{ ['--tone' as string]: skillTheme[s].tone } as React.CSSProperties}>{skillTheme[s].icon} {skillTheme[s].label}</span>)}
                {sheet.is_free_preview && <span className="ic-chip ic-chip--free">{track === 'main' ? 'Free unit' : 'Free lesson'}</span>}
              </div>
              <ol className="ic-sheet-steps">
                <li className={sheet.lesson_viewed ? 'is-done' : ''}><span>1</span>Short lesson</li>
                {sheet.tasks.map((t, i) => (
                  <li key={ieltsCourseTaskKey(t)} className={t.completed ? 'is-done' : ''}>
                    <span>{i + 2}</span>{skillTheme[t.skill].icon} {t.title || skillTheme[t.skill].label}
                  </li>
                ))}
              </ol>
              {sheet.unlocked ? (
                <button type="button" className="ic-btn ic-btn--primary ic-btn--block" onClick={() => start(sheet)}>
                  {sheet.completed ? 'Review this unit' : sheet.lesson_viewed ? 'Continue unit' : 'Start unit'} <span aria-hidden="true">→</span>
                </button>
              ) : sheet.locked_reason === 'previous_unit' ? (
                <p className="ic-sheet-lock">🔒 Finish {ieltsCourseUnitLabel({ track: sheet.track, position: sheet.position - 1 })} to open this {track === 'main' ? 'stop' : 'lesson'}.</p>
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
