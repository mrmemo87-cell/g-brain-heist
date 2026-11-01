import React, { useEffect, useState } from 'react';
import '../../styles/ielts-course.css';
import { IELTS_COURSE_ROUTE, fetchIeltsCourseState, ieltsCourseUnitRoute, type IeltsCourseState } from '../../../services/ieltsCourseService';

/** Compact "continue the course" card for the IELTS home screen. Silent on error. */
const IeltsCourseEntryCard: React.FC<{ onNavigate: (route: string) => void }> = ({ onNavigate }) => {
  const [state, setState] = useState<IeltsCourseState | null>(null);
  useEffect(() => {
    let alive = true;
    fetchIeltsCourseState().then((next) => { if (alive) setState(next); }).catch(() => { /* card still renders with a generic CTA */ });
    return () => { alive = false; };
  }, []);

  const current = state?.units.find((unit) => unit.id === state.current_unit_id) ?? null;
  const percent = state && state.units_total ? Math.round((100 * state.units_completed) / state.units_total) : 0;
  const started = Boolean(state && (state.units_completed > 0 || current?.lesson_viewed));
  const target = current && current.unlocked ? ieltsCourseUnitRoute(current.id) : IELTS_COURSE_ROUTE;

  return (
    <section className="ic-entry" aria-labelledby="ic-entry-title">
      <div className="ic-entry-head">
        <div>
          <div className="ic-eyebrow">Self-paced</div>
          <h2 id="ic-entry-title">The IELTS Course</h2>
          <p>
            {state
              ? current
                ? `${started ? 'Up next' : 'Start with'}: Unit ${current.position} · ${current.title}`
                : state.units_total > 0 ? 'Course complete. Repeat any unit from the map.' : 'Twenty short units, lesson first, then practice.'
              : 'Twenty short units, lesson first, then practice. Unit 1 is free.'}
          </p>
        </div>
        <button type="button" className="ic-btn ic-btn--primary" onClick={() => onNavigate(target)}>
          {started ? 'Continue →' : 'Start the course →'}
        </button>
      </div>
      {state && state.units_total > 0 && (
        <>
          <div className="ic-minibar" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
          <p>{state.units_completed} of {state.units_total} units done · <button type="button" className="ic-link" onClick={() => onNavigate(IELTS_COURSE_ROUTE)}>View course map</button></p>
        </>
      )}
    </section>
  );
};

export default IeltsCourseEntryCard;
