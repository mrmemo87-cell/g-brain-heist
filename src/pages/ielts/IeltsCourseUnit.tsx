import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '../../styles/ielts-course.css';
import {
  IELTS_COURSE_ROUTE,
  fetchIeltsCourseUnit,
  ieltsCourseAccessMessage,
  ieltsCourseSkillLabel,
  ieltsCourseTaskRoute,
  ieltsCourseUnitRoute,
  markIeltsCourseLessonViewed,
  syncIeltsCourseProgress,
  type IeltsCourseUnitDetail,
  type IeltsCourseUnitLocked,
} from '../../../services/ieltsCourseService';

type UnitData = IeltsCourseUnitDetail | IeltsCourseUnitLocked;
type Step = 'lesson' | 'practice' | 'done';

const isLocked = (unit: UnitData): unit is IeltsCourseUnitLocked => unit.unlocked === false;

const skillIcon: Record<string, string> = { reading: 'R', listening: 'L', writing: 'W', speaking: 'S' };

/**
 * One course unit: a short lesson, then its practice tasks, then a completion banner
 * with the link to the next unit. The lesson is step one; opening practice marks it read.
 */
const IeltsCourseUnit: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams();
  const unitId = Number(params.unitId);
  const [unit, setUnit] = useState<UnitData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('lesson');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(unitId) || unitId <= 0) { setError('This unit is not available.'); return; }
    setError(null);
    try {
      // Stamp completion if tasks were finished since the last visit, then read fresh state.
      await syncIeltsCourseProgress(unitId);
      const next = await fetchIeltsCourseUnit(unitId);
      setUnit(next);
      if (!isLocked(next)) setStep(next.completed ? 'done' : next.lesson_viewed ? 'practice' : 'lesson');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The unit could not load.');
    }
  }, [unitId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [step, unitId]);

  const detail = unit && !isLocked(unit) ? unit : null;
  const doneCount = useMemo(() => detail ? detail.tasks.filter((task) => task.completed).length : 0, [detail]);

  const startPractice = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      const result = await markIeltsCourseLessonViewed(detail.id);
      setUnit({ ...detail, lesson_viewed: true, completed: result.completed });
      setStep(result.completed ? 'done' : 'practice');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your progress could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const openTask = (route: string) => {
    if (!detail) return;
    navigate(ieltsCourseTaskRoute({ route }, detail.id));
  };

  return (
    <div className="ic-page">
      <main className="ic-main">
        <div className="ic-topbar">
          <button type="button" className="ic-link" onClick={() => navigate(IELTS_COURSE_ROUTE)}>← Course map</button>
          {unit && <span className="ic-chip">Unit {unit.position} of 20</span>}
        </div>

        {error && (
          <div className="ic-notice ic-notice--error" role="alert">
            <b>{error}</b>
            <button type="button" className="ic-btn ic-btn--ghost" onClick={() => void load()}>Retry</button>
          </div>
        )}

        {!unit && !error && <div className="ic-skeleton" style={{ height: 220 }} aria-busy="true" />}

        {unit && isLocked(unit) && (
          <section className="ic-card">
            <div className="ic-eyebrow">Unit {unit.position}</div>
            <h2>{unit.title}</h2>
            {unit.subtitle && <p className="ic-unit-sub">{unit.subtitle}</p>}
            {unit.locked_reason === 'previous_unit' ? (
              <div className="ic-notice"><b>Finish the previous unit first.</b><span>Units unlock in order so each technique builds on the last.</span></div>
            ) : (
              <div className="ic-notice ic-notice--warn">
                <b>{ieltsCourseAccessMessage(unit.access_reason).title || 'This unit needs full course access.'}</b>
                <span>{ieltsCourseAccessMessage(unit.access_reason).body}</span>
                {unit.access_reason === 'prime_required' && (
                  <button type="button" className="ic-btn ic-btn--primary" onClick={() => navigate('/ielts/apply-prime')}>See IELTS Prime plans</button>
                )}
              </div>
            )}
            <button type="button" className="ic-btn ic-btn--ghost" onClick={() => navigate(IELTS_COURSE_ROUTE)}>Back to the course map</button>
          </section>
        )}

        {detail && (
          <>
            <section className="ic-card" aria-labelledby="ic-unit-title">
              <div className="ic-eyebrow">Unit {detail.position} · {detail.focus_skills.map((skill) => ieltsCourseSkillLabel[skill]).join(' + ')} · about {detail.estimated_minutes} min</div>
              <h2 id="ic-unit-title">{detail.title}</h2>
              {detail.subtitle && <p className="ic-unit-sub">{detail.subtitle}</p>}
              <ol className="ic-steps" aria-label="Unit steps">
                <li aria-current={step === 'lesson' ? 'step' : undefined} className={detail.lesson_viewed ? 'ic-step--done' : ''}>1 · Lesson</li>
                <li aria-current={step === 'practice' ? 'step' : undefined} className={doneCount === detail.tasks.length && detail.tasks.length > 0 ? 'ic-step--done' : ''}>2 · Practice ({doneCount}/{detail.tasks.length})</li>
                <li aria-current={step === 'done' ? 'step' : undefined} className={detail.completed ? 'ic-step--done' : ''}>3 · Done</li>
              </ol>
            </section>

            {step === 'lesson' && (
              <section className="ic-card ic-lesson" aria-label="Lesson">
                {detail.lesson.intro && <p>{detail.lesson.intro}</p>}
                {(detail.lesson.sections ?? []).map((section) => (
                  <div key={section.title} className="ic-lesson-section">
                    <h3>{section.title}</h3>
                    {section.body.split('\n').map((paragraph, index) => <p key={index}>{paragraph}</p>)}
                  </div>
                ))}
                {detail.lesson.example && (
                  <div className="ic-example">
                    <div className="ic-eyebrow">{detail.lesson.example.label}</div>
                    <p>{detail.lesson.example.text}</p>
                  </div>
                )}
                {detail.lesson.tips && detail.lesson.tips.length > 0 && (
                  <div className="ic-lesson-section">
                    <h3>Remember</h3>
                    <ul className="ic-tips">{detail.lesson.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
                  </div>
                )}
                <button type="button" className="ic-btn ic-btn--primary ic-btn--block" disabled={saving} onClick={() => void startPractice()}>
                  {saving ? 'Saving…' : detail.lesson_viewed ? 'Back to practice →' : 'Got it, start practice →'}
                </button>
              </section>
            )}

            {step === 'practice' && (
              <section className="ic-card" aria-label="Practice">
                <h3>Practice</h3>
                <p className="ic-unit-sub">Complete every task to finish the unit. Writing and Speaking count as soon as you submit.</p>
                <div className="ic-tasklist">
                  {detail.tasks.map((task) => (
                    <button key={`${task.skill}-${task.task_id}`} type="button" className={`ic-task${task.completed ? ' ic-task--done' : ''}`} onClick={() => openTask(task.route)}>
                      <span className="ic-task-icon" aria-hidden="true">{task.completed ? '✓' : skillIcon[task.skill]}</span>
                      <span className="ic-task-body">
                        <b>{task.title || `${ieltsCourseSkillLabel[task.skill]} practice`}</b>
                        <span>{ieltsCourseSkillLabel[task.skill]}{task.display_code ? ` · ${task.display_code}` : ''}{task.minutes ? ` · ${task.minutes} min` : ''}</span>
                      </span>
                      <span className="ic-task-go">{task.completed ? 'Review' : 'Start →'}</span>
                    </button>
                  ))}
                </div>
                <div className="ic-nav">
                  <button type="button" className="ic-btn ic-btn--ghost" onClick={() => setStep('lesson')}>Re-read the lesson</button>
                  <button type="button" className="ic-btn ic-btn--ghost" onClick={() => void load()}>Refresh progress</button>
                </div>
              </section>
            )}

            {step === 'done' && (
              <>
                <section className="ic-done-banner" role="status">
                  <h2>Unit {detail.position} complete</h2>
                  <p>{detail.next_unit_id ? 'The next unit is unlocked. Keep the momentum going.' : 'That was the last unit. You have finished the course.'}</p>
                  {detail.next_unit_id ? (
                    <button type="button" className="ic-btn ic-btn--light" onClick={() => navigate(ieltsCourseUnitRoute(detail.next_unit_id as number))}>Next unit →</button>
                  ) : (
                    <button type="button" className="ic-btn ic-btn--light" onClick={() => navigate(IELTS_COURSE_ROUTE)}>Back to the course map</button>
                  )}
                </section>
                <section className="ic-card">
                  <h3>Review this unit</h3>
                  <div className="ic-tasklist">
                    {detail.tasks.map((task) => (
                      <button key={`${task.skill}-${task.task_id}`} type="button" className="ic-task ic-task--done" onClick={() => openTask(task.route)}>
                        <span className="ic-task-icon" aria-hidden="true">✓</span>
                        <span className="ic-task-body"><b>{task.title || `${ieltsCourseSkillLabel[task.skill]} practice`}</b><span>{ieltsCourseSkillLabel[task.skill]}</span></span>
                        <span className="ic-task-go">Open</span>
                      </button>
                    ))}
                  </div>
                  <button type="button" className="ic-btn ic-btn--ghost" onClick={() => setStep('lesson')}>Re-read the lesson</button>
                </section>
              </>
            )}

            <div className="ic-nav">
              {detail.prev_unit_id ? <button type="button" className="ic-link" onClick={() => navigate(ieltsCourseUnitRoute(detail.prev_unit_id as number))}>← Previous unit</button> : <span />}
              {detail.completed && detail.next_unit_id ? <button type="button" className="ic-link" onClick={() => navigate(ieltsCourseUnitRoute(detail.next_unit_id as number))}>Next unit →</button> : null}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default IeltsCourseUnit;
