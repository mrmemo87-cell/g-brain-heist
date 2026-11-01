import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../../styles/ielts-course.css';
import IeltsStudentShell from '../../components/ielts/student/IeltsStudentShell';
import {
  cachedIeltsCourseState,
  fetchIeltsCourseState,
  ieltsCourseAccessMessage,
  ieltsCourseSkillLabel,
  ieltsCourseUnitRoute,
  type IeltsCourseState,
  type IeltsCourseUnitSummary,
} from '../../../services/ieltsCourseService';

/**
 * The course map: every unit in order, Duolingo-style. Finish a unit to unlock the next.
 * Unit 1 is open to everyone; later units need a school IELTS seat or IELTS Prime.
 */
const IeltsCoursePath: React.FC = () => {
  const navigate = useNavigate();
  // Paint the last known map at once; the fresh read replaces it a moment later.
  const [state, setState] = useState<IeltsCourseState | null>(() => cachedIeltsCourseState());
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    fetchIeltsCourseState()
      .then((next) => { if (alive) setState(next); })
      .catch((err: unknown) => { if (alive) setError(err instanceof Error ? err.message : 'The course could not load.'); });
    return () => { alive = false; };
  }, [retry]);

  const currentUnit = useMemo(
    () => state?.units.find((unit) => unit.id === state.current_unit_id) ?? null,
    [state],
  );
  const allDone = Boolean(state && state.units_total > 0 && state.units_completed === state.units_total);
  const percent = state && state.units_total ? Math.round((100 * state.units_completed) / state.units_total) : 0;
  const access = state ? ieltsCourseAccessMessage(state.access.reason) : null;

  const openUnit = (unit: IeltsCourseUnitSummary) => {
    if (unit.unlocked) { navigate(ieltsCourseUnitRoute(unit.id)); return; }
    if (unit.locked_reason === 'needs_access' && state?.access.reason === 'prime_required') navigate('/ielts/apply-prime');
  };

  return (
    <IeltsStudentShell active="course">
      <div className="ic-page ic-page--embedded">
      <main className="ic-main">

        <section className="ic-hero" aria-labelledby="ic-course-title">
          <div className="ic-eyebrow">Brains Heist IELTS</div>
          <h1 id="ic-course-title">The IELTS Course</h1>
          <p>Twenty short units covering every question type in Listening, Reading, Writing and Speaking. Each unit is a quick lesson, then real practice. Finish one to unlock the next.</p>
          <div className="ic-progress" aria-hidden={!state}>
            <div className="ic-progress-bar"><span style={{ width: `${percent}%` }} /></div>
            <div className="ic-progress-label"><span>{allDone ? 'Course complete' : currentUnit ? `Up next: Unit ${currentUnit.position}` : 'Loading…'}</span><span>{percent}%</span></div>
          </div>
          <div className="ic-hero-actions">
            {currentUnit && (
              <button type="button" className="ic-btn ic-btn--light" onClick={() => openUnit(currentUnit)}>
                {currentUnit.unlocked ? (currentUnit.lesson_viewed ? 'Continue' : 'Start') + ` Unit ${currentUnit.position} →` : 'Unlock the full course'}
              </button>
            )}
          </div>
        </section>

        {error && (
          <div className="ic-notice ic-notice--error" role="alert">
            <b>{error}</b>
            <button type="button" className="ic-btn ic-btn--ghost" onClick={() => setRetry((n) => n + 1)}>Retry</button>
          </div>
        )}

        {state && !state.access.full && access?.cta && (
          <div className="ic-notice ic-notice--warn" role="status">
            <b>{access.title}</b>
            <span>{access.body}</span>
            {access.cta === 'prime' && (
              <button type="button" className="ic-btn ic-btn--primary" onClick={() => navigate('/ielts/apply-prime')}>See IELTS Prime plans</button>
            )}
          </div>
        )}

        {!state && !error && (
          <div className="ic-path" aria-busy="true">
            {Array.from({ length: 6 }).map((_, index) => <div key={index} className="ic-skeleton" />)}
          </div>
        )}

        {state && (
          <ol className="ic-path" aria-label="Course units">
            {state.units.map((unit) => {
              const done = unit.tasks.filter((task) => task.completed).length;
              const total = unit.tasks.length;
              const isCurrent = unit.id === state.current_unit_id;
              const className = [
                'ic-unit',
                unit.completed ? 'ic-unit--done' : '',
                isCurrent ? 'ic-unit--current' : '',
                !unit.unlocked ? 'ic-unit--locked' : '',
              ].filter(Boolean).join(' ');
              const clickable = unit.unlocked || (unit.locked_reason === 'needs_access' && state.access.reason === 'prime_required');
              return (
                <li key={unit.id} style={{ listStyle: 'none' }}>
                  <button
                    type="button"
                    className={className}
                    disabled={!clickable}
                    aria-current={isCurrent ? 'step' : undefined}
                    aria-label={`Unit ${unit.position}: ${unit.title}${unit.completed ? ', completed' : unit.unlocked ? '' : ', locked'}`}
                    onClick={() => openUnit(unit)}
                  >
                    <span className="ic-node" aria-hidden="true">{unit.completed ? '✓' : unit.unlocked ? unit.position : '🔒'}</span>
                    <div className="ic-unit-head">
                      <div>
                        <h3>{unit.title}</h3>
                        {unit.subtitle && <div className="ic-unit-sub">{unit.subtitle}</div>}
                      </div>
                    </div>
                    <div className="ic-unit-meta">
                      {unit.is_free_preview && <span className="ic-chip ic-chip--free">Free</span>}
                      {unit.focus_skills.map((skill) => <span key={skill} className="ic-chip">{ieltsCourseSkillLabel[skill]}</span>)}
                      <span className="ic-chip">{unit.estimated_minutes} min</span>
                      {unit.completed && <span className="ic-chip ic-chip--done">Completed</span>}
                      {!unit.unlocked && unit.locked_reason === 'needs_access' && <span className="ic-chip ic-chip--lock">{state.access.reason === 'prime_required' ? 'Prime' : 'School seat'}</span>}
                      {!unit.unlocked && unit.locked_reason === 'previous_unit' && <span className="ic-chip ic-chip--lock">Finish Unit {unit.position - 1}</span>}
                      <span className="ic-unit-tasks">{done}/{total} tasks</span>
                    </div>
                    {unit.unlocked && !unit.completed && total > 0 && (
                      <div className="ic-minibar" aria-hidden="true"><span style={{ width: `${Math.round((100 * done) / total)}%` }} /></div>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </main>
      </div>
    </IeltsStudentShell>
  );
};

export default IeltsCoursePath;
