import React, { useEffect, useState } from 'react';
import '../../styles/ielts-course.css';
import { IELTS_COURSE_ROUTE, cachedIeltsCourseState, fetchIeltsCourseState, ieltsCourseUnitRoute, type IeltsCourseState } from '../../../services/ieltsCourseService';

function Ring({ percent }: { percent: number }) {
  const r = 30, c = 2 * Math.PI * r;
  return (
    <svg className="ic-ring" viewBox="0 0 72 72" aria-hidden="true">
      <circle cx="36" cy="36" r={r} className="ic-ring-track" />
      <circle cx="36" cy="36" r={r} className="ic-ring-value" strokeDasharray={c} strokeDashoffset={c * (1 - percent / 100)} />
      <text x="36" y="41" textAnchor="middle">{percent}%</text>
    </svg>
  );
}

/** Compact "continue your route" card for the IELTS home screen. Silent on error. */
const IeltsCourseEntryCard: React.FC<{ onNavigate: (route: string) => void }> = ({ onNavigate }) => {
  const [state, setState] = useState<IeltsCourseState | null>(() => cachedIeltsCourseState());
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
      <Ring percent={percent} />
      <div>
        <div className="ic-eyebrow ic-eyebrow--light">Self-paced course</div>
        <h2 id="ic-entry-title">Your route to IELTS</h2>
        <p>
          {state
            ? current
              ? `${started ? 'Up next' : 'Start with'}: Unit ${current.position} · ${current.title}`
              : state.units_total > 0 ? 'Route complete. Revisit any stop to practise again.' : 'Twenty short units: a lesson, then practice with feedback.'
            : 'Twenty short units: a lesson, then practice with feedback. Unit 1 is free.'}
        </p>
      </div>
      <button type="button" className="ic-btn ic-btn--light ic-btn--glow" onClick={() => onNavigate(target)}>
        {started ? 'Continue' : 'Start the course'} <span aria-hidden="true">→</span>
      </button>
      {state && state.units_total > 0 && (
        <div className="ic-entry-foot">
          <span>{state.units_completed} of {state.units_total} units done</span>
          <button type="button" className="ic-link" onClick={() => onNavigate(IELTS_COURSE_ROUTE)}>View the map</button>
        </div>
      )}
    </section>
  );
};

export default IeltsCourseEntryCard;
