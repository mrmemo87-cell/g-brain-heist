import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ieltsMaterialTitle } from '../../../../services/ieltsMaterialCode';
import {
  fetchIeltsStartingPoint,
  startingPointCompleted,
  startingPointSkills,
  type IeltsStartingPoint,
} from '../../../../services/ieltsStartingPointService';
import IeltsWorkCard, { dueText, skillName } from './IeltsWorkCard';
import { openSet, seenFeedback, useIeltsStudentWork } from './useIeltsStudentWork';

const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Student Home: only what is new or waiting on the student — new work, work in progress and teacher feedback they
 * have not opened yet — plus one line about starting checks if any are left. Everything else lives in its own tab.
 */
export default function IeltsStudentHome() {
  const navigate = useNavigate();
  const work = useIeltsStudentWork();
  const [point, setPoint] = useState<IeltsStartingPoint | null>(null);
  useEffect(() => {
    let active = true;
    fetchIeltsStartingPoint().then((p) => { if (active) setPoint(p); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const seen = useMemo(() => seenFeedback(), [work.tasks]);
  const tasks = work.tasks ?? [];
  const sets = work.sets ?? [];
  const feedback = tasks.filter((t) => t.reviewed && t.status !== 'closed' && !seen.has(t.id));
  const newSets = sets.filter((a) => openSet(a) && a.student_status !== 'in_progress');
  const newTasks = tasks.filter((t) => t.status === 'assigned');
  const goingSets = sets.filter((a) => openSet(a) && a.student_status === 'in_progress');
  const goingTasks = tasks.filter((t) => t.status === 'in_progress');
  const waiting = tasks.filter((t) => t.status === 'submitted' && !t.reviewed);
  const newCount = newSets.length + newTasks.length;
  const goingCount = goingSets.length + goingTasks.length;
  const loading = work.tasks === null && !work.tasksError;
  const checksDone = point ? startingPointSkills.filter((s) => startingPointCompleted(point, s)).length : 4;
  const firstName = point?.student_name?.split(/\s+/)[0];
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const summary = loading
    ? 'Checking what is new for you…'
    : newCount + goingCount + feedback.length === 0
      ? 'You are all caught up. New work from your teachers will appear here.'
      : [newCount && plural(newCount, 'new task', 'new tasks'), feedback.length && plural(feedback.length, 'piece of feedback', 'pieces of feedback'), goingCount && `${goingCount} to finish`]
          .filter(Boolean).join(' · ');
  let n = 0;

  return (
    <div className="isn-home">
      <section className="isn-hero" aria-labelledby="isn-hello">
        <span className="isn-orb isn-orb--a" aria-hidden="true" />
        <span className="isn-orb isn-orb--b" aria-hidden="true" />
        <p className="isn-date">{today}</p>
        <h2 id="isn-hello">{greeting()}{firstName ? `, ${firstName}` : ''} <span className="isn-wave" aria-hidden="true">👋</span></h2>
        <p className="isn-summary" aria-live="polite">{summary}</p>
        <div className="isn-stats">
          <span className={'isn-stat' + (newCount ? ' is-hot' : '')}><b>{loading ? '–' : newCount}</b> New</span>
          <span className={'isn-stat' + (feedback.length ? ' is-hot' : '')}><b>{loading ? '–' : feedback.length}</b> Feedback</span>
          <span className="isn-stat"><b>{loading ? '–' : goingCount}</b> In progress</span>
        </div>
      </section>

      {work.tasksError && (
        <div role="alert" className="isn-alert">
          <p>We could not check your targeted tasks. Your saved work is safe.</p>
          <button type="button" className="ij-link" onClick={work.reload}>Try targeted practice again</button>
        </div>
      )}

      {loading && <div className="isn-skeletons" role="status" aria-label="Checking your work"><span /><span /></div>}

      {(feedback.length > 0 || newCount > 0) && (
        <section className="isn-section" aria-labelledby="isn-new">
          <h2 id="isn-new" className="isn-section-title"><span className="isn-pulse" aria-hidden="true" />New for you</h2>
          <div className="isn-cards">
            {feedback.map((t) => (
              <IeltsWorkCard key={t.id} index={n++} tone="feedback" chip="Feedback" kicker={`${skillName(t.skill)} · targeted`} skill={t.skill}
                title={ieltsMaterialTitle(t.display_code, t.title)} meta="Your teacher has reviewed this task."
                action={{ label: 'Read feedback →', to: '/ielts/practice/targeted/' + t.id }} />
            ))}
            {newSets.map((a) => (
              <IeltsWorkCard key={a.id} index={n++} tone="new" chip="New" kicker={`Assignment · ${plural(a.item_count ?? a.items?.length ?? 0, 'task', 'tasks')}`}
                title={a.title} meta={dueText(a.due_at) || undefined}
                action={{ label: 'Start →', to: `/ielts/practice/assigned?assignment=${encodeURIComponent(a.id)}` }} />
            ))}
            {newTasks.map((t) => (
              <IeltsWorkCard key={t.id} index={n++} tone="new" chip="New" kicker={`${skillName(t.skill)} · targeted`} skill={t.skill}
                title={ieltsMaterialTitle(t.display_code, t.title)} meta={dueText(t.due_at) || undefined} note={t.reason}
                action={{ label: 'Start task →', to: '/ielts/practice/targeted/' + t.id }} />
            ))}
          </div>
        </section>
      )}

      {goingCount > 0 && (
        <section className="isn-section" aria-labelledby="isn-going">
          <h2 id="isn-going" className="isn-section-title">Pick up where you left off</h2>
          <div className="isn-cards">
            {goingTasks.map((t) => (
              <IeltsWorkCard key={t.id} index={n++} tone="continue" chip="In progress" kicker={`${skillName(t.skill)} · targeted`} skill={t.skill}
                title={ieltsMaterialTitle(t.display_code, t.title)} meta={dueText(t.due_at) || undefined} note={t.reason}
                action={{ label: 'Continue task →', to: '/ielts/practice/targeted/' + t.id }} />
            ))}
            {goingSets.map((a) => (
              <IeltsWorkCard key={a.id} index={n++} tone="continue" chip="In progress" kicker={`Assignment · ${plural(a.item_count ?? a.items?.length ?? 0, 'task', 'tasks')}`}
                title={a.title} meta={dueText(a.due_at) || undefined}
                action={{ label: 'Continue →', to: `/ielts/practice/assigned?assignment=${encodeURIComponent(a.id)}` }} />
            ))}
          </div>
        </section>
      )}

      {!loading && !work.tasksError && newCount + goingCount + feedback.length === 0 && (
        <section className="isn-caught-up" aria-label="All caught up">
          <span className="isn-check" aria-hidden="true">✓</span>
          <div>
            <h2>All caught up</h2>
            <p>Nothing new right now. Your finished work and feedback are in Journey.</p>
          </div>
        </section>
      )}

      {point && checksDone < 4 && (
        <button type="button" className="isn-nudge" onClick={() => navigate('/ielts/journey')}>
          <span className="isn-nudge-icon" aria-hidden="true">🧭</span>
          <span className="isn-nudge-text"><strong>Starting checks · {checksDone} of 4 done</strong><small>Finish them to complete your starting point.</small></span>
          <span className="isn-segments" aria-hidden="true">{startingPointSkills.map((s) => <i key={s} className={startingPointCompleted(point, s) ? 'is-done' : ''} />)}</span>
        </button>
      )}

      {waiting.length > 0 && (
        <p className="isn-waiting"><span aria-hidden="true">⏳</span> {plural(waiting.length, 'submitted task is', 'submitted tasks are')} waiting for your teacher.</p>
      )}

      <p className="isn-foot"><button type="button" className="ij-link" onClick={() => navigate('/ielts?view=library')}>Explore other practice tools →</button></p>
    </div>
  );
}
