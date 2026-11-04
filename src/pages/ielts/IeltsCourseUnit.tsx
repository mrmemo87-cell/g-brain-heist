import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '../../styles/ielts-course.css';
import IeltsStudentShell from '../../components/ielts/student/IeltsStudentShell';
import { IeltsHabitCelebration, useIeltsCourseHabit } from '../../components/ielts/IeltsCourseHabit';
import {
  fetchIeltsCourseUnit,
  ieltsCourseAccessMessage,
  ieltsCourseMapRoute,
  ieltsCourseTaskKey,
  ieltsCourseTaskRoute,
  ieltsCourseUnitLabel,
  ieltsCourseUnitRoute,
  cachedIeltsCourseState,
  fetchIeltsCourseState,
  markIeltsCourseLessonViewed,
  type IeltsCourseAccessReason,
  syncIeltsCourseProgress,
  type IeltsCourseUnitDetail,
  type IeltsCourseUnitLocked,
} from '../../../services/ieltsCourseService';
import { chapterFor, primarySkill, skillTheme } from './ieltsCourseTheme';

type UnitData = IeltsCourseUnitDetail | IeltsCourseUnitLocked;
type Step = 'lesson' | 'practice' | 'done';
type Card =
  | { kind: 'cover' }
  | { kind: 'section'; title: string; body: string; n: number }
  | { kind: 'example'; label: string; text: string }
  | { kind: 'tips'; tips: string[] }
  | { kind: 'ready' };

const isLocked = (unit: UnitData): unit is IeltsCourseUnitLocked => unit.unlocked === false;
/** Celebrate a cleared unit once per device, the first time its completion is seen. */
const celebrationKey = (id: number) => `bh_ielts_course_cleared_${id}`;
const celebrated = (id: number) => { try { return localStorage.getItem(celebrationKey(id)) === '1'; } catch { return true; } };
const markCelebrated = (id: number) => { try { localStorage.setItem(celebrationKey(id), '1'); } catch { /* storage unavailable */ } };
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function Confetti() {
  const pieces = useMemo(() => Array.from({ length: 36 }).map((_, i) => ({
    left: (i * 37) % 100,
    delay: (i % 9) * 70,
    hue: ['#34d399', '#60a5fa', '#a78bfa', '#fbbf24', '#f472b6', '#22d3ee'][i % 6],
    rot: (i * 47) % 360,
  })), []);
  if (reducedMotion()) return null;
  return <div className="ic-confetti" aria-hidden="true">{pieces.map((p, i) => <i key={i} style={{ left: `${p.left}%`, animationDelay: `${p.delay}ms`, background: p.hue, transform: `rotate(${p.rot}deg)` }} />)}</div>;
}

/**
 * One course unit: a lesson told as story cards (swipe or use the buttons), then the unit's practice, then a
 * celebration with the way to the next unit. Opening practice records the lesson as read.
 */
const IeltsCourseUnit: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams();
  const unitId = Number(params.unitId);
  const [unit, setUnit] = useState<UnitData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('lesson');
  const [card, setCard] = useState(0);
  const [saving, setSaving] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const touch = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const { habit, refresh: refreshHabit } = useIeltsCourseHabit();
  const [accessReason, setAccessReason] = useState<IeltsCourseAccessReason | null>(() => {
    const cached = cachedIeltsCourseState();
    return cached ? (cached.access.full ? null : cached.access.reason) : null;
  });

  const load = useCallback(async () => {
    if (!Number.isFinite(unitId) || unitId <= 0) { setError('This unit is not available.'); return; }
    setError(null);
    try {
      await syncIeltsCourseProgress(unitId);
      const next = await fetchIeltsCourseUnit(unitId);
      setUnit(next);
      if (!isLocked(next) && next.completed && !celebrated(next.id)) { markCelebrated(next.id); setCelebrate(true); }
      if (!isLocked(next)) setStep(next.completed ? 'done' : next.lesson_viewed ? 'practice' : 'lesson');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The unit could not load.');
    }
  }, [unitId]);

  useEffect(() => { setUnit(null); setCard(0); setCelebrate(false); void load(); }, [load]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [step, unitId]);
  // Clearing a free unit without full access is the moment to offer the rest of the course.
  useEffect(() => {
    if (step !== 'done' || !unit || isLocked(unit) || !unit.is_free_preview) return;
    let alive = true;
    fetchIeltsCourseState().then((st) => { if (alive) setAccessReason(st.access.full ? null : st.access.reason); }).catch(() => undefined);
    return () => { alive = false; };
  }, [step, unit]);

  const detail = unit && !isLocked(unit) ? unit : null;
  const skill = detail ? primarySkill(detail.focus_skills) : 'reading';
  const theme = skillTheme[skill];
  const doneCount = detail ? detail.tasks.filter((t) => t.completed).length : 0;
  const isVocab = unit?.track === 'vocabulary';
  const mapRoute = ieltsCourseMapRoute(unit?.track);
  const label = (position: number) => ieltsCourseUnitLabel({ track: unit?.track, position });

  const cards: Card[] = useMemo(() => {
    if (!detail) return [];
    const list: Card[] = [{ kind: 'cover' }];
    (detail.lesson.sections ?? []).forEach((s, i) => list.push({ kind: 'section', title: s.title, body: s.body, n: i + 1 }));
    if (detail.lesson.example) list.push({ kind: 'example', ...detail.lesson.example });
    if (detail.lesson.tips?.length) list.push({ kind: 'tips', tips: detail.lesson.tips });
    list.push({ kind: 'ready' });
    return list;
  }, [detail]);

  const go = (delta: number) => {
    setCard((c) => Math.max(0, Math.min(cards.length - 1, c + delta)));
    cardRef.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (step !== 'lesson') return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const startPractice = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      const result = await markIeltsCourseLessonViewed(detail.id);
      setUnit({ ...detail, lesson_viewed: true, completed: result.completed });
      void refreshHabit();
      setStep(result.completed ? 'done' : 'practice');
      if (result.completed && !celebrated(detail.id)) { markCelebrated(detail.id); setCelebrate(true); }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your progress could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const openTask = (route: string) => { if (detail) navigate(ieltsCourseTaskRoute({ route }, detail.id)); };
  const current = cards[card];

  return (
    <IeltsStudentShell focus={{ label: isVocab ? 'Vocabulary path' : 'Course map', to: mapRoute }}>
      <div className="ic-page ic-page--embedded" style={{ ['--tone' as string]: theme.tone, ['--soft' as string]: theme.soft } as React.CSSProperties}>
        <main className="ic-main">
          <IeltsHabitCelebration habit={habit} />
          {error && (
            <div className="ic-notice ic-notice--error" role="alert">
              <b>{error}</b>
              <button type="button" className="ic-btn ic-btn--ghost" onClick={() => void load()}>Retry</button>
            </div>
          )}

          {!unit && !error && <div className="ic-skeleton" style={{ height: 320 }} aria-busy="true" />}

          {unit && isLocked(unit) && (
            <section className="ic-card ic-locked-card">
              <span className="ic-locked-icon" aria-hidden="true">🔒</span>
              <p className="ic-eyebrow">{label(unit.position)}</p>
              <h2>{unit.title}</h2>
              {unit.subtitle && <p className="ic-muted">{unit.subtitle}</p>}
              {unit.locked_reason === 'previous_unit' ? (
                <p>{isVocab ? 'Finish the previous vocabulary lesson first. Lessons open in order.' : 'Finish the previous unit first. Units open in order so each technique builds on the last.'}</p>
              ) : (
                <>
                  <p><b>{ieltsCourseAccessMessage(unit.access_reason).title || 'This unit needs full course access.'}</b> {ieltsCourseAccessMessage(unit.access_reason).body}</p>
                  {unit.access_reason === 'prime_required' && <button type="button" className="ic-btn ic-btn--gold ic-btn--block" onClick={() => navigate('/ielts/apply-prime')}>Unlock with IELTS Prime</button>}
                </>
              )}
              <button type="button" className="ic-btn ic-btn--ghost ic-btn--block" onClick={() => navigate(mapRoute)}>Back to the course map</button>
            </section>
          )}

          {detail && (
            <>
              <nav className="ic-unit-steps" aria-label="Unit steps">
                {(['lesson', 'practice', 'done'] as Step[]).map((s, i) => {
                  const complete = s === 'lesson' ? detail.lesson_viewed : s === 'practice' ? doneCount === detail.tasks.length && detail.tasks.length > 0 : detail.completed;
                  const reachable = s === 'lesson' || (s === 'practice' && detail.lesson_viewed) || (s === 'done' && detail.completed);
                  return (
                    <button key={s} type="button" disabled={!reachable} aria-current={step === s ? 'step' : undefined}
                      className={`ic-unit-step${complete ? ' is-done' : ''}`} onClick={() => setStep(s)}>
                      <span aria-hidden="true">{complete ? '✓' : i + 1}</span>{s === 'lesson' ? 'Lesson' : s === 'practice' ? <>Practice <small className="ic-step-count">{doneCount}/{detail.tasks.length}</small></> : 'Done'}
                    </button>
                  );
                })}
              </nav>

              {step === 'lesson' && current && (
                <section className="ic-story" aria-roledescription="carousel" aria-label="Lesson">
                  <div className="ic-story-bars" aria-hidden="true">
                    {cards.map((_, i) => <span key={i} className={i < card ? 'is-past' : i === card ? 'is-now' : ''} />)}
                  </div>
                  <div
                    ref={cardRef}
                    tabIndex={-1}
                    key={card}
                    className={`ic-story-card ic-story-card--${current.kind}`}
                    role="group"
                    aria-roledescription="slide"
                    aria-label={`${card + 1} of ${cards.length}`}
                    onTouchStart={(e) => { touch.current = e.touches[0]?.clientX ?? null; }}
                    onTouchEnd={(e) => {
                      const start = touch.current; touch.current = null;
                      const end = e.changedTouches[0]?.clientX;
                      if (start == null || end == null || Math.abs(end - start) < 50) return;
                      go(end < start ? 1 : -1);
                    }}
                  >
                    {current.kind === 'cover' && (
                      <>
                        <div className="ic-cover-art" aria-hidden="true">
                          <span className="ic-cover-num">{isVocab ? `V${detail.position}` : detail.position}</span>
                          <span className="ic-cover-icon">{theme.icon}</span>
                        </div>
                        <p className="ic-eyebrow">{isVocab ? `Vocabulary · ${label(detail.position)}` : `Chapter ${chapterFor(detail.position).index} · ${chapterFor(detail.position).title}`}</p>
                        <h1 className="ic-cover-title">{detail.title}</h1>
                        {detail.subtitle && <p className="ic-cover-sub">{detail.subtitle}</p>}
                        <div className="ic-cover-meta">
                          {detail.focus_skills.map((s) => <span key={s} className="ic-chip" style={{ ['--tone' as string]: skillTheme[s].tone } as React.CSSProperties}>{skillTheme[s].icon} {skillTheme[s].label}</span>)}
                          <span className="ic-chip">⏱ {detail.estimated_minutes} min</span>
                        </div>
                        {detail.lesson.intro && <p className="ic-lead">{detail.lesson.intro}</p>}
                      </>
                    )}
                    {current.kind === 'section' && (
                      <>
                        <span className="ic-section-num" aria-hidden="true">{String(current.n).padStart(2, '0')}</span>
                        <h2>{current.title}</h2>
                        {current.body.split('\n').map((p, i) => {
                          const m = /^([A-Z][A-Za-z /'-]{1,24}):\s+(.*)$/.exec(p);
                          return m ? <p key={i} className="ic-body ic-body--term"><span className="ic-term">{m[1]}</span>{m[2]}</p> : <p key={i} className="ic-body">{p}</p>;
                        })}
                      </>
                    )}
                    {current.kind === 'example' && (
                      <>
                        <p className="ic-eyebrow">Worked example</p>
                        <h2>{current.label}</h2>
                        <div className="ic-paper">
                          <span className="ic-paper-tab" aria-hidden="true">EXAM PAPER</span>
                          {current.text.split('\n').map((line, i) => <p key={i}>{line}</p>)}
                        </div>
                      </>
                    )}
                    {current.kind === 'tips' && (
                      <>
                        <p className="ic-eyebrow">Remember</p>
                        <h2>{['', 'One thing', 'Two things', 'Three things', 'Four things', 'Five things'][current.tips.length] ?? `${current.tips.length} things`} to take into practice</h2>
                        <ul className="ic-tips">
                          {current.tips.map((tip, i) => <li key={tip} style={{ ['--n' as string]: i } as React.CSSProperties}><span aria-hidden="true">✓</span>{tip}</li>)}
                        </ul>
                      </>
                    )}
                    {current.kind === 'ready' && (
                      <>
                        <span className="ic-ready-icon" aria-hidden="true">🚀</span>
                        <h2>Ready to practise?</h2>
                        <p className="ic-body">{isVocab
                          ? `Six short steps. Each one marks itself and explains every answer.`
                          : <>Use what you just learned on {detail.tasks.length === 1 ? 'one real task' : `${detail.tasks.length} real tasks`}. Writing and Speaking get feedback in about a minute.</>}</p>
                        <ul className="ic-ready-list">
                          {detail.tasks.map((t) => <li key={ieltsCourseTaskKey(t)}><span aria-hidden="true">{isVocab ? t.position : skillTheme[t.skill].icon}</span>{t.title || skillTheme[t.skill].label}<small>{t.minutes ? `${t.minutes} min` : ''}</small></li>)}
                        </ul>
                        <button type="button" className="ic-btn ic-btn--primary ic-btn--block ic-btn--glow" disabled={saving} onClick={() => void startPractice()}>
                          {saving ? 'Saving…' : detail.lesson_viewed ? 'Back to practice' : 'Start practice'} <span aria-hidden="true">→</span>
                        </button>
                      </>
                    )}
                  </div>
                  <div className="ic-story-nav">
                    <button type="button" className="ic-round" disabled={card === 0} onClick={() => go(-1)} aria-label="Previous card">←</button>
                    <span className="ic-story-count" aria-live="polite">{card + 1} / {cards.length}</span>
                    {card < cards.length - 1
                      ? <button type="button" className="ic-round ic-round--primary" onClick={() => go(1)} aria-label="Next card">→</button>
                      : <span className="ic-round ic-round--ghost" aria-hidden="true" />}
                  </div>
                </section>
              )}

              {step === 'practice' && (
                <section className="ic-card ic-practice" aria-label="Practice">
                  <p className="ic-eyebrow">{label(detail.position)} · {isVocab ? 'steps' : 'practice'}</p>
                  <h2>{isVocab ? 'Six steps to the mixed check' : 'Put it into practice'}</h2>
                  <p className="ic-muted">{isVocab
                    ? 'Work through the steps in order. Each one starts with a short LEARN FIRST box, and every answer is explained after you submit. Step 6 mixes everything together.'
                    : 'Finish every task to clear this stop. Writing and Speaking count as soon as you submit, and you can get feedback straight after.'}</p>
                  <div className="ic-practice-meter" role="progressbar" aria-valuemin={0} aria-valuemax={detail.tasks.length} aria-valuenow={doneCount} aria-label={isVocab ? 'Steps done' : 'Tasks done'}>
                    <span style={{ width: `${detail.tasks.length ? (100 * doneCount) / detail.tasks.length : 0}%` }} />
                    <b>{doneCount} of {detail.tasks.length} done</b>
                  </div>
                  <div className="ic-tasklist">
                    {detail.tasks.map((task, i) => (
                      <button key={ieltsCourseTaskKey(task)} type="button" className={`ic-task${task.completed ? ' ic-task--done' : ''}`}
                        style={{ ['--tone' as string]: skillTheme[task.skill].tone, ['--soft' as string]: skillTheme[task.skill].soft, ['--n' as string]: i } as React.CSSProperties}
                        onClick={() => openTask(task.route)}>
                        <span className="ic-task-icon" aria-hidden="true">{task.completed ? '✓' : isVocab ? task.position : skillTheme[task.skill].icon}</span>
                        <span className="ic-task-body">
                          <b>{task.title || `${skillTheme[task.skill].label} practice`}</b>
                          <span>{isVocab ? `Step ${task.position}${task.position === detail.tasks.length ? ' · mixed check' : ''}` : skillTheme[task.skill].label}{task.display_code ? ` · ${task.display_code}` : ''}{task.minutes ? ` · ${task.minutes} min` : ''}</span>
                        </span>
                        <span className="ic-task-go">{task.completed ? 'Review' : 'Start'} <span aria-hidden="true">→</span></span>
                      </button>
                    ))}
                  </div>
                  <div className="ic-nav">
                    <button type="button" className="ic-btn ic-btn--ghost" onClick={() => { setCard(0); setStep('lesson'); }}>Re-read the lesson</button>
                    <button type="button" className="ic-btn ic-btn--ghost" onClick={() => void load()}>Refresh progress</button>
                  </div>
                </section>
              )}

              {step === 'done' && (
                <>
                  <section className="ic-victory" role="status">
                    {celebrate && <Confetti />}
                    <div className="ic-medal" aria-hidden="true"><span>{isVocab ? `V${detail.position}` : detail.position}</span></div>
                    <p className="ic-eyebrow ic-eyebrow--light">{isVocab ? 'Lesson cleared' : 'Stop cleared'}</p>
                    <h2>{label(detail.position)} complete</h2>
                    <p>{detail.is_free_preview && accessReason
                      ? (isVocab ? 'You finished the free vocabulary lesson. Five more are waiting.' : 'You finished the free unit. Nineteen more stops are waiting on your route.')
                      : detail.next_unit_id
                      ? (isVocab ? 'The next vocabulary lesson is open. Keep the momentum going.' : 'The next stop on your route is open. Keep the momentum going.')
                      : (isVocab ? 'That was the last vocabulary lesson. You have finished the whole path.' : 'That was the final stop. You have finished the whole route.')}</p>
                    {detail.is_free_preview && accessReason ? null : detail.next_unit_id ? (
                      <button type="button" className="ic-btn ic-btn--light ic-btn--glow" onClick={() => navigate(ieltsCourseUnitRoute(detail.next_unit_id as number))}>{isVocab ? 'Next lesson' : 'Next unit'} <span aria-hidden="true">→</span></button>
                    ) : (
                      <button type="button" className="ic-btn ic-btn--light" onClick={() => navigate(mapRoute)}>Back to the course map</button>
                    )}
                  </section>
                  {detail.is_free_preview && accessReason === 'prime_required' && (
                    <section className="po-card" aria-labelledby="po-title">
                      <div className="po-glow" aria-hidden="true" />
                      <p className="po-kicker">IELTS Prime</p>
                      <h3 id="po-title">{isVocab ? 'Unlock V2 to V6 and the full course' : 'Unlock the next 19 units'}</h3>
                      <ul className="po-list">
                        <li>All 20 units: Reading, Listening, Writing and Speaking</li>
                        <li>The whole vocabulary path: 6 lessons, 36 steps</li>
                        <li>Writing and Speaking feedback on all four criteria</li>
                        <li>Keep your streak, league and badges going</li>
                      </ul>
                      <div className="po-price"><b>$34.50</b><span>for 3 months · most popular</span></div>
                      <button type="button" className="ic-btn ic-btn--gold ic-btn--block ic-btn--glow" onClick={() => navigate('/ielts/apply-prime')}>See Prime plans <span aria-hidden="true">→</span></button>
                      <p className="po-fine">From $14.50 a month. Cancel the monthly plan anytime.</p>
                    </section>
                  )}
                  {detail.is_free_preview && accessReason === 'school_seat_missing' && (
                    <section className="ic-card"><h3>Ready for Unit 2?</h3><p className="ic-muted">Ask your school admin to allocate an IELTS seat to you to continue the course.</p></section>
                  )}
                  <section className="ic-card">
                    <h3>{isVocab ? 'Review this lesson' : 'Review this unit'}</h3>
                    <div className="ic-tasklist">
                      {detail.tasks.map((task) => (
                        <button key={ieltsCourseTaskKey(task)} type="button" className="ic-task ic-task--done"
                          style={{ ['--tone' as string]: skillTheme[task.skill].tone, ['--soft' as string]: skillTheme[task.skill].soft } as React.CSSProperties}
                          onClick={() => openTask(task.route)}>
                          <span className="ic-task-icon" aria-hidden="true">✓</span>
                          <span className="ic-task-body"><b>{task.title || skillTheme[task.skill].label}</b><span>{isVocab ? `Step ${task.position}` : skillTheme[task.skill].label}</span></span>
                          <span className="ic-task-go">Open <span aria-hidden="true">→</span></span>
                        </button>
                      ))}
                    </div>
                    <button type="button" className="ic-btn ic-btn--ghost" onClick={() => { setCard(0); setStep('lesson'); }}>Re-read the lesson</button>
                  </section>
                </>
              )}

              <div className="ic-nav">
                {detail.prev_unit_id ? <button type="button" className="ic-link" onClick={() => navigate(ieltsCourseUnitRoute(detail.prev_unit_id as number))}>← {label(detail.position - 1)}</button> : <span />}
                {detail.completed && detail.next_unit_id ? <button type="button" className="ic-link" onClick={() => navigate(ieltsCourseUnitRoute(detail.next_unit_id as number))}>{label(detail.position + 1)} →</button> : null}
              </div>
            </>
          )}
        </main>
      </div>
    </IeltsStudentShell>
  );
};

export default IeltsCourseUnit;
