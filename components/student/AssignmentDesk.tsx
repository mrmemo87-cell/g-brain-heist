import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../src/contexts/LanguageContext';
import type { CompletedAssignment, MyAssignmentAnswer, StudentAssignmentTask } from '../../types';
import * as GameService from '../../services/gameService';
import { assignmentCategoryBadgeStyle, getAssignmentCategoryMeta } from '../../src/lib/assignmentCategory';
import './AssignmentDesk.css';

interface Props {
  assignments: StudentAssignmentTask[];
  studentId: string;
  onOpen: (assignment: StudentAssignmentTask) => void;
}
const subject = (row: { subject_name: string }) => row.subject_name?.trim() || 'General';
const subjectKey = (row: { subject_name: string }) => subject(row).toLocaleLowerCase();
const pendingReview = (row: CompletedAssignment) => row.grading_status === 'pending_review' || (row.pending_review_count ?? 0) > 0;
const progressing = (row: StudentAssignmentTask) => row.student_status === 'in_progress' || (row.resume_answered_count ?? 0) > 0;
const overdue = (row: StudentAssignmentTask) => Boolean(row.is_late || (row.due_at && new Date(row.due_at).getTime() < Date.now()));
const assignedTime = (row: StudentAssignmentTask) => new Date(row.assigned_at).getTime() || 0;
const priority = (row: StudentAssignmentTask) => progressing(row) ? 0 : overdue(row) ? 2 : 1;
const deadline = (row: StudentAssignmentTask) => row.due_at ? new Date(row.due_at).getTime() || Infinity : Infinity;

export default function AssignmentDesk({ assignments, studentId, onOpen }: Props) {
  const { language, direction } = useLanguage();
  const [tab, setTab] = useState<'todo' | 'closed'>('todo');
  const [filter, setFilter] = useState('all');
  const [completedSubject, setCompletedSubject] = useState('all');
  const [completed, setCompleted] = useState<CompletedAssignment[]>([]);
  const [historyState, setHistoryState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<CompletedAssignment | null>(null);
  const [answers, setAnswers] = useState<MyAssignmentAnswer[]>([]);
  const [reviewState, setReviewState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reviewRetry, setReviewRetry] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const date = (value: string) => new Date(value).toLocaleDateString(language, { day: 'numeric', month: 'short', year: 'numeric' });

  useEffect(() => {
    let active = true;
    setHistoryState('loading');
    setCompleted([]);
    GameService.get_student_completed_assignments({ throwOnError: true }).then(rows => {
      if (active) { setCompleted(rows); setHistoryState('ready'); }
    }).catch(() => { if (active) setHistoryState('error'); });
    return () => { active = false; };
  }, [studentId, assignments, retry]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    setAnswers([]);
    setReviewState('loading');
    GameService.get_my_assignment_answers(selected.assignment_id).then(rows => {
      if (active) { setAnswers(rows); setReviewState('ready'); }
    }).catch(() => { if (active) setReviewState('error'); });
    return () => { active = false; };
  }, [selected, reviewRetry]);

  useEffect(() => {
    if (!selected) return;
    previousFocus.current = document.activeElement as HTMLElement;
    dialog.current?.showModal();
    return () => { previousFocus.current?.focus(); };
  }, [selected]);

  // Confirmed server results win if a background summary is briefly stale.
  const completedIds = new Set(completed.map(row => row.assignment_id));
  const remaining = assignments.filter(row => !completedIds.has(row.assignment_id));
  const todo = remaining.filter(row => !row.is_closed).sort((a, b) => priority(a) - priority(b) || (overdue(a) && overdue(b) ? assignedTime(b) - assignedTime(a) : deadline(a) - deadline(b)) || assignedTime(b) - assignedTime(a));
  const closed = remaining.filter(row => row.is_closed);
  const history = [...completed].sort((a, b) => b.completed_at.localeCompare(a.completed_at));
  const subjects = Array.from(new Map([...remaining, ...history].map(row => [subjectKey(row), subject(row)])).entries()).sort((a, b) => a[1].localeCompare(b[1]));
  const chosenFilter = subjects.some(([key]) => key === filter) ? filter : 'all';
  const matches = (row: { subject_name: string }) => chosenFilter === 'all' || subjectKey(row) === chosenFilter;
  const visible = (tab === 'closed' ? closed : todo).filter(matches);
  const historySubjects = Array.from(new Map(history.map(row => [subjectKey(row), subject(row)])).entries()).sort((a, b) => a[1].localeCompare(b[1]));
  const historyFilter = historySubjects.some(([key]) => key === completedSubject) ? completedSubject : 'all';
  const visibleHistory = history.filter(row => historyFilter === 'all' || subjectKey(row) === historyFilter);
  const next = todo.filter(matches)[0];
  const total = todo.length + closed.length + completed.length;
  const percent = total ? Math.round(completed.length / total * 100) : 0;
  const action = (row: StudentAssignmentTask) => progressing(row) ? 'Continue assignment' : overdue(row) ? 'Start overdue assignment' : 'Start assignment';
  const status = (row: StudentAssignmentTask) => row.is_closed ? 'Closed' : overdue(row) ? 'Overdue · still open' : progressing(row) ? 'In progress' : 'Not started';
  const progress = (row: StudentAssignmentTask) => row.resume_answered_count != null
    ? `${row.resume_answered_count} of ${row.question_count ?? row.questions?.length ?? 0} answered`
    : progressing(row) ? 'Continue from your saved answers' : `${row.question_count ?? row.questions?.length ?? 0} questions`;
  const closeReview = () => { dialog.current?.close(); setSelected(null); };

  return <section className="assignment-desk localized-ui" lang={language} dir={direction} aria-label="My assignments">
    <header className="assignment-desk__heading">
      <div><span className="assignment-desk__eyebrow">YOUR STUDY DESK</span><h1>My assignments</h1><p>Your subjects. Your progress. Your next move.</p></div>
      {historyState === 'ready' && total > 0 && <div className="assignment-desk__completion"><span className="assignment-desk__ring" style={{ '--completion': `${percent}%` } as React.CSSProperties}><b>{percent}%</b></span><span><strong>{completed.length} of {total} finished</strong><small>Overall progress</small></span></div>}
    </header>
    {tab === 'todo' && <article className="assignment-desk__next">
      <span className="assignment-desk__next-icon" aria-hidden="true">{next ? '↗' : '✓'}</span>
      <div><span className="assignment-desk__eyebrow">YOUR NEXT MOVE</span><h2>{next ? next.title || next.topic_name || 'New assignment' : 'You’re all caught up'}</h2><p>{next ? `${subject(next)} · ${progress(next)} · ${next.due_at ? `Due ${date(next.due_at)}` : 'No deadline'}` : 'No open assignments here. Check Completed to revisit your work.'}</p></div>
      {next && <button type="button" className="assignment-desk__primary" onClick={() => onOpen(next)}>{action(next)} <span aria-hidden="true">→</span></button>}
    </article>}
    <div className="assignment-desk__tabs" role="group" aria-label="Assignment status">
      <button type="button" aria-pressed={tab === 'todo'} onClick={() => setTab('todo')}>To do <span>{todo.length}</span></button>
      <a href="#completed-assignment-history">Completed <span>{historyState === 'ready' ? completed.length : '—'}</span></a>
      {closed.length > 0 && <button type="button" aria-pressed={tab === 'closed'} onClick={() => setTab('closed')}>Closed <span>{closed.length}</span></button>}
    </div>
    <div className="assignment-desk__subjects" role="group" aria-label="Filter by subject">
      <button type="button" aria-pressed={chosenFilter === 'all'} onClick={() => setFilter('all')}>All subjects</button>
      {subjects.map(([key, label], index) => <button type="button" key={key} aria-pressed={chosenFilter === key} onClick={() => setFilter(key)}><i aria-hidden="true" className={`assignment-desk__dot assignment-desk__dot--${index % 4}`} /><bdi>{label}</bdi></button>)}
    </div>
    {historyState === 'error' && <div className="assignment-desk__notice" role="alert">Completed work couldn’t load. Your unfinished assignments are still available. <button type="button" onClick={() => setRetry(value => value + 1)}>Try again</button></div>}
    <>
      {!visible.length && <div className="assignment-desk__empty"><p>{tab === 'closed' ? 'No closed assignments in this subject.' : 'No unfinished assignments in this subject.'}</p></div>}
      <div className="assignment-desk__grid">{visible.map(row => <article className="assignment-desk__card" key={row.assignment_id}>
        <div className="assignment-desk__card-top"><span className="assignment-desk__subject"><bdi>{subject(row)}</bdi></span><span className={`assignment-desk__status ${overdue(row) && !row.is_closed ? 'assignment-desk__status--late' : ''}`}>{status(row)}</span></div>
        <h2 dir="auto">{row.title || row.topic_name || 'New assignment'}</h2><p className="assignment-desk__teacher">Assigned by <bdi>{row.teacher_username || 'Your teacher'}</bdi></p>
        <p className="assignment-desk__meta"><span>{row.batch || 'Selected students'}</span>{row.assignment_category && <span className="assignment-desk__category" style={assignmentCategoryBadgeStyle(row.assignment_category)}>{getAssignmentCategoryMeta(row.assignment_category).label}</span>}<span>{row.delivery_mode === 'paper' ? 'Paper' : row.delivery_mode === 'mixed' ? 'Online & paper' : 'Online'}</span></p>
        <div className="assignment-desk__progress"><strong>{progress(row)}</strong>{row.resume_answered_count != null && <progress value={row.resume_answered_count} max={Math.max(1, row.question_count ?? row.questions?.length ?? 0)} aria-label="Saved answer progress" />}<small>{row.due_at ? `Due ${date(row.due_at)}` : 'No deadline'}</small></div>
        <details className="assignment-desk__details"><summary>Assignment details</summary><p>Topic: <bdi>{row.topic_name || 'General'}</bdi></p><p>Given {date(row.assigned_at)}</p>{row.instructions && <p dir="auto"><strong>Teacher instructions:</strong> {row.instructions}</p>}</details>
        {row.is_closed ? <p className="assignment-desk__closed">Submissions are closed. Ask your teacher if you need more time.</p> : <button type="button" className="assignment-desk__primary" onClick={() => onOpen(row)}>{action(row)} <span aria-hidden="true">→</span></button>}
      </article>)}</div>
    </>
    <section className="assignment-desk__history" id="completed-assignment-history" aria-labelledby="completed-history-title">
      <div className="assignment-desk__history-heading"><div><span className="assignment-desk__eyebrow">YOUR LEARNING RECORD</span><h2 id="completed-history-title">Completed assignments</h2><p>Review your scores and revisit your answers.</p></div>
        <label className="assignment-desk__history-filter"><span>Subject</span><select value={historyFilter} onChange={event => setCompletedSubject(event.target.value)} aria-label="Filter completed assignments by subject"><option value="all">All subjects</option>{historySubjects.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
      </div>
      {historyState === 'loading' && <p role="status">Loading your completed work…</p>}
      {historyState === 'ready' && !visibleHistory.length && <div className="assignment-desk__empty"><p>{history.length ? 'No completed assignments in this subject.' : 'Your completed assignments and scores will appear here once you submit.'}</p></div>}
      {historyState === 'ready' && visibleHistory.length > 0 && <>
        <p className="assignment-desk__history-count">{visibleHistory.length} completed {visibleHistory.length === 1 ? 'assignment' : 'assignments'}</p>
        <div className="assignment-desk__table-scroll" role="region" aria-label="Completed assignment scores" tabIndex={0}>
          <table className="assignment-desk__table"><caption className="sr-only">Completed assignments, scores, and results</caption><thead><tr><th scope="col">Subject</th><th scope="col">Assignment</th><th scope="col">Submitted</th><th scope="col">Score</th><th scope="col">Results</th></tr></thead>
          <tbody>{visibleHistory.map(row => <tr key={row.assignment_id}>
            <td><span className="assignment-desk__subject"><bdi>{subject(row)}</bdi></span></td>
            <th scope="row"><strong dir="auto">{row.title || row.topic_name || 'Assignment'}</strong><small>Assigned by <bdi>{row.teacher_name || 'Your teacher'}</bdi></small></th>
            <td><time dateTime={row.completed_at}>{date(row.completed_at)}</time></td>
            <td>{pendingReview(row) ? <span className="assignment-desk__status assignment-desk__score--pending">Waiting for teacher feedback</span> : <strong className="assignment-desk__score">{row.total_questions > 0 ? `${row.correct}/${row.total_questions}` : '—'}</strong>}</td>
            <td><button type="button" className="assignment-desk__secondary" onClick={() => setSelected(row)} aria-label={`View results for ${row.title || row.topic_name || 'assignment'}`}>View results <span aria-hidden="true">→</span></button></td>
          </tr>)}</tbody>
          </table>
        </div>
        <p className="assignment-desk__table-hint">Swipe across the table to see every column.</p>
      </>}
    </section>
    {selected && <dialog className="assignment-desk__dialog" ref={dialog} aria-labelledby="assignment-review-title" onCancel={closeReview} onClick={event => { if (event.target === event.currentTarget) closeReview(); }}>
      <div className="assignment-desk__dialog-header"><div><span className="assignment-desk__eyebrow">YOUR COMPLETED WORK</span><h2 id="assignment-review-title" dir="auto">{selected.title || selected.topic_name || 'Assignment results'}</h2><p>{subject(selected)} · Submitted {date(selected.completed_at)}</p></div><button type="button" className="assignment-desk__secondary" onClick={closeReview} autoFocus aria-label="Close results">✕</button></div>
      <p className="assignment-desk__result"><strong>{pendingReview(selected) ? 'Waiting for teacher feedback' : `${selected.correct} of ${selected.total_questions} correct`}</strong></p>
      {reviewState === 'loading' && <p role="status">Loading your answers…</p>}
      {reviewState === 'error' && <p role="alert">Your answers couldn’t load. <button type="button" onClick={() => setReviewRetry(value => value + 1)}>Try again</button></p>}
      {reviewState === 'ready' && !answers.length && <p>Detailed answers aren’t available for this assignment. Your submission is recorded above.</p>}
      {reviewState === 'ready' && answers.map((answer, index) => {
        const reviewing = answer.is_correct == null || answer.grading_status === 'under_review' || answer.grading_status === 'reviewing';
        return <article className="assignment-desk__answer" key={answer.question_id}><span className="assignment-desk__status">{reviewing ? 'Waiting for review' : answer.is_correct ? '✓ Correct' : 'Needs another look'}</span><h3 dir="auto">{index + 1}. {answer.question_text}</h3><p dir="auto"><strong>Your answer:</strong> {answer.student_answer}</p>{!reviewing && answer.is_correct === false && <><p dir="auto"><strong>Correct answer:</strong> {answer.correct_answer}</p>{answer.explanation && <p dir="auto">{answer.explanation}</p>}</>}</article>;
      })}
      <button type="button" className="assignment-desk__primary" onClick={closeReview}>Back to assignments</button>
    </dialog>}
  </section>;
}
