import React from 'react';
import { ieltsMaterialTitle } from '../../../../services/ieltsMaterialCode';
import type { LearningAllocation } from '../../../../services/ieltsLearningService';
import IeltsWorkCard, { skillName } from '../student/IeltsWorkCard';
import { IeltsCardGroup } from '../student/IeltsStudentShell';
import type { IeltsTeacherTab } from './IeltsTeacherNav';
import IeltsShellIcon, { type IeltsShellIconName } from '../IeltsShellIcon';
import { displayDateLocale } from '../../../utils/displayDate';

export type TeacherWaitingItem = { key: string; name: string; at: string; kind: string; skill: 'writing' | 'speaking'; route: string; started: boolean };

const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export const formatDay = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(displayDateLocale(), { day: 'numeric', month: 'short' });
};
const ago = (iso: string) => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const days = Math.floor((Date.now() - t) / 86400000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 14 ? `${days} days ago` : formatDay(iso);
};

/** One card for a submission waiting for the teacher. Older work (3+ days) is flagged so it is picked up first. */
export function TeacherWaitingCard({ item, index }: { item: TeacherWaitingItem; index: number }) {
  const old = Number.isFinite(Date.parse(item.at)) && Date.now() - Date.parse(item.at) > 3 * 86400000;
  return (
    <IeltsWorkCard index={index} tone={item.started ? 'continue' : old ? 'waiting' : 'new'} chip={item.started ? 'Draft saved' : old ? 'Waiting' : 'New'}
      kicker={item.kind} skill={item.skill} title={item.name} meta={item.at ? `Submitted ${ago(item.at)}` : undefined}
      action={{ label: (item.started ? 'Continue review' : 'Review') + ' →', to: item.route }} />
  );
}
export function TeacherFeedbackCard({ task, index }: { task: LearningAllocation; index: number }) {
  return (
    <IeltsWorkCard index={index} tone="feedback" chip="Submitted" kicker={`${skillName(task.skill)} · targeted practice`} skill={task.skill}
      title={task.student_name} meta={ieltsMaterialTitle(task.display_code, task.title)}
      action={{ label: 'Give feedback →', to: '/ielts/practice/targeted/' + task.id }} />
  );
}

/**
 * Teacher Today: only what needs the teacher now (submissions to review and targeted work to give feedback on),
 * then a few shortcuts. Everything else lives in its own tab.
 */
export default function IeltsTeacherToday({ schoolName, canManage, waiting, waitingCount, feedback, feedbackError, practiceError, students, onOpen, onRetry, extraTools }: {
  schoolName?: string;
  canManage: boolean;
  waiting: TeacherWaitingItem[];
  waitingCount: number;
  /** Targeted tasks students submitted that have no teacher feedback yet; null while loading. */
  feedback: LearningAllocation[] | null;
  feedbackError: boolean;
  practiceError: boolean;
  students: number;
  onOpen: (tab: IeltsTeacherTab | 'assign' | 'targeted' | 'history' | 'interviews') => void;
  onRetry: () => void;
  extraTools?: React.ReactNode;
}) {
  const toGive = feedback ?? [];
  const total = waitingCount + toGive.length;
  const today = new Date().toLocaleDateString(displayDateLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
  const summary = total === 0
    ? 'Nothing is waiting for you. A good moment to prepare the next lesson.'
    : [waitingCount && plural(waitingCount, 'submission to review', 'submissions to review'), toGive.length && plural(toGive.length, 'targeted task needs feedback', 'targeted tasks need feedback')].filter(Boolean).join(' · ');
  const shown = waiting.slice(0, 4), feedbackShown = toGive.slice(0, 3);
  const more = waiting.length - shown.length + toGive.length - feedbackShown.length;
  let n = 0;
  // The IELTS map (Visual & UX Bible 13.12): every teacher area on one card, grouped by the job a teacher is doing,
  // each with one line saying what it is for. It replaces the separate shortcut tiles and the folded "More tools".
  type Spot = { id: Parameters<typeof onOpen>[0]; icon: IeltsShellIconName; title: string; text: string; count?: number; hot?: boolean; manage?: boolean };
  const map: { title: string; spots: Spot[] }[] = [
    { title: 'Check work', spots: [
      { id: 'reviews', icon: 'review', title: 'Reviews', text: 'Writing and Speaking waiting for feedback', count: total, hot: true },
      { id: 'history', icon: 'practice', title: 'Practice history', text: 'Current and earlier student work', manage: true },
    ] },
    { title: 'Give work', spots: [
      { id: 'assign', icon: 'plus', title: 'Create assignment', text: 'A class, a batch or one student', manage: true },
      { id: 'targeted', icon: 'target', title: 'Targeted practice', text: 'Evidence-led work for one student', manage: true },
      { id: 'speaking', icon: 'mic', title: 'Speaking practice mocks', text: 'Students take them alone; you review' },
    ] },
    { title: 'Teach', spots: [
      { id: 'lessons', icon: 'lessons', title: 'Lessons', text: 'Plans, slides, workbooks and audio', manage: true },
      { id: 'batches', icon: 'batches', title: 'Batches', text: 'Course groups and their practice', manage: true },
    ] },
    { title: 'Know your students', spots: [
      { id: 'students', icon: 'students', title: 'Student progress', text: 'Four-skill evidence, plans, reports', count: students },
    ] },
    { title: 'Run tests', spots: [
      { id: 'exams', icon: 'exams', title: 'Exam sessions', text: 'Schedule, launch and monitor', manage: true },
      { id: 'interviews', icon: 'mic', title: 'Speaking interviews', text: 'Face to face, at a set time' },
    ] },
    { title: 'Set up', spots: [
      { id: 'team', icon: 'team', title: 'Programme team', text: 'Who leads IELTS at your school' },
    ] },
  ].map((g) => ({ ...g, spots: g.spots.filter((s) => canManage || !s.manage) })).filter((g) => g.spots.length);

  return (
    <div className="isn-home itn-today">
      <section className="isn-hero itn-hero" aria-labelledby="itn-hello">
        <p className="isn-date">{today}{schoolName ? ` · ${schoolName}` : ''}</p>
        <h2 id="itn-hello">{greeting()}</h2>
        <p className="isn-summary" aria-live="polite">{summary}</p>
        <div className="isn-stats">
          <button type="button" className={'isn-stat itn-stat' + (waitingCount ? ' is-hot' : '')} onClick={() => onOpen('reviews')}><b>{waitingCount}</b> To review</button>
          {canManage && <button type="button" className={'isn-stat itn-stat' + (toGive.length ? ' is-hot' : '')} onClick={() => onOpen('reviews')}><b>{feedback === null && !feedbackError ? '–' : toGive.length}</b> Feedback to give</button>}
          <button type="button" className="isn-stat itn-stat" onClick={() => onOpen('students')}><b>{students}</b> {students === 1 ? 'Student' : 'Students'}</button>
        </div>
      </section>

      {(practiceError || feedbackError) && (
        <div role="alert" className="isn-alert">
          <p>Some submitted work could not be checked just now. Nothing has been lost.</p>
          <button type="button" className="itn-see-all" onClick={onRetry}>Check again</button>
        </div>
      )}

      {total > 0 ? (
        <section className="isn-section" aria-labelledby="itn-now">
          <h2 id="itn-now" className="isn-section-title"><span className="isn-pulse" aria-hidden="true" />Needs you now</h2>
          <div className="isn-cards">
            {shown.map((w) => <TeacherWaitingCard key={w.key} item={w} index={n++} />)}
            {feedbackShown.map((t) => <TeacherFeedbackCard key={t.id} task={t} index={n++} />)}
          </div>
          {(more > 0 || waitingCount > waiting.length) && (
            <button type="button" className="itn-see-all" onClick={() => onOpen('reviews')}>
              See all {waitingCount + toGive.length} in Reviews →
            </button>
          )}
        </section>
      ) : (
        <section className="isn-caught-up" aria-label="All caught up">
          <span className="isn-check" aria-hidden="true">✓</span>
          <div>
            <h2>All caught up</h2>
            <p>Submitted essays, interviews and targeted tasks appear here as soon as students send them.</p>
          </div>
        </section>
      )}

      <section className="isn-section itn-map" aria-labelledby="itn-map">
        <h2 id="itn-map" className="isn-section-title"><IeltsShellIcon name="map" size={20} />Your IELTS map</h2>
        <p className="itn-map-lead">Everything you can do in IELTS, grouped by the job you are doing. The tab bar takes you to the same places.</p>
        <div className="itn-map-groups">
          {map.map((g) => (
            <div key={g.title} className="itn-map-group">
              <h3>{g.title}</h3>
              {g.spots.map((s) => (
                <button key={g.title + s.id} type="button" className="itn-map-spot" style={{ ['--n' as string]: n++ } as React.CSSProperties} onClick={() => onOpen(s.id)}>
                  <span className="itn-map-icon" aria-hidden="true"><IeltsShellIcon name={s.icon} size={18} /></span>
                  <strong>{s.title}{s.count ? <span className={'itn-map-count' + (s.hot ? ' is-hot' : '')}>{s.count}</span> : null}</strong>
                  <small>{s.text}</small>
                </button>
              ))}
            </div>
          ))}
        </div>
      </section>

      {extraTools}
      <p className="itn-evidence"><strong>Evidence before estimates.</strong> Screeners show a starting point, not an official IELTS band. Missing evidence is not a weakness.</p>
    </div>
  );
}
