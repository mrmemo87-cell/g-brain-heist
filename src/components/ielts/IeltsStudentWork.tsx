import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ieltsMaterialTitle } from '../../../services/ieltsMaterialCode';
import { learningWorkspace, type LearningAllocation } from '../../../services/ieltsLearningService';
import { rpcIeltsPracticeStudentAssignments, type IeltsPracticeStudentAssignment } from '../../../services/ieltsPracticeAssignmentService';
import '../../styles/ielts-navigation.css';

const skillName = (skill?: string | null) => (skill ? skill[0].toUpperCase() + skill.slice(1) : 'Practice');
const dueText = (iso: string | null | undefined) => {
  if (!iso || !Number.isFinite(Date.parse(iso))) return '';
  const due = new Date(iso);
  return `${due.getTime() < Date.now() ? 'Was due' : 'Due'} ${due.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
};

/**
 * Student home: everything a teacher has given the student, in one list, before the starting-point checks.
 * Reads the same two student RPCs the Assignments and Targeted practice pages already use; it changes no state.
 */
export default function IeltsStudentWork() {
  const [tasks, setTasks] = useState<LearningAllocation[] | null>(null);
  const [tasksError, setTasksError] = useState(false);
  const [sets, setSets] = useState<IeltsPracticeStudentAssignment[] | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setTasks(null); setTasksError(false);
    learningWorkspace().then((w) => { if (active) setTasks(w.allocations); }).catch(() => { if (active) setTasksError(true); });
    return () => { active = false; };
  }, [retry]);
  useEffect(() => {
    let active = true;
    rpcIeltsPracticeStudentAssignments().then((rows) => { if (active) setSets(rows); }).catch(() => { if (active) setSets([]); });
    return () => { active = false; };
  }, []);

  const openSets = (sets ?? []).filter((a) => a.status !== 'closed' && a.student_status !== 'completed');
  const finishedSets = (sets ?? []).filter((a) => a.student_status === 'completed');
  const openTasks = (tasks ?? []).filter((t) => t.status === 'assigned' || t.status === 'in_progress');
  const feedback = (tasks ?? []).filter((t) => t.reviewed && t.status !== 'closed');
  const waiting = (tasks ?? []).filter((t) => t.status === 'submitted' && !t.reviewed);
  const todo = openSets.length + openTasks.length;
  const loading = tasks === null && !tasksError;

  return (
    <section className="ij-panel iw-panel" aria-labelledby="student-work-heading">
      <div className="iw-head">
        <h2 id="student-work-heading">Your work</h2>
        {!loading && <span className="iw-count">{todo === 0 ? 'Nothing to do' : `${todo} to do`}</span>}
      </div>
      {loading && <p role="status">Checking your work…</p>}
      {(todo > 0 || openSets.length > 0) && (
        <ul className="iw-list" aria-label="To do">
          {openSets.map((a) => (
            <li key={a.id} className="it-task iw-row">
              <div>
                <p className="iw-kind">Assignment{a.student_status === 'in_progress' ? ' · in progress' : ''}</p>
                <h3>{a.title}</h3>
                <p>{a.item_count ?? a.items?.length ?? 0} {(a.item_count ?? a.items?.length ?? 0) === 1 ? 'task' : 'tasks'}{dueText(a.due_at) ? ` · ${dueText(a.due_at)}` : ''}</p>
              </div>
              <Link className="iw-action" to={`/ielts/practice/assigned?assignment=${encodeURIComponent(a.id)}`}>{a.student_status === 'in_progress' ? 'Continue' : 'Start'}</Link>
            </li>
          ))}
          {openTasks.map((t) => (
            <li key={t.id} className="it-task iw-row">
              <div>
                <p className="iw-kind">{skillName(t.skill)} · targeted practice</p>
                <h3>{ieltsMaterialTitle(t.display_code, t.title)}</h3>
                {t.reason && <p><span className="iw-label">From your teacher:</span> {t.reason}</p>}
                {dueText(t.due_at) && <p>{dueText(t.due_at)}</p>}
              </div>
              <Link className="iw-action" to={'/ielts/practice/targeted/' + t.id}>{t.status === 'in_progress' ? 'Continue task' : 'Start task'}</Link>
            </li>
          ))}
        </ul>
      )}
      {!loading && todo === 0 && !tasksError && (
        <p className="iw-empty">Nothing to do right now. New work from your teachers will appear here.</p>
      )}
      {tasksError && (
        <div role="alert" className="iw-empty">
          <p>We could not check your targeted tasks. Your saved work is safe.</p>
          <button type="button" className="ij-link" onClick={() => setRetry((v) => v + 1)}>Try targeted practice again</button>
        </div>
      )}
      {feedback.length > 0 && (
        <>
          <h3 className="iw-subhead">Feedback ready</h3>
          <ul className="iw-list" aria-label="Feedback ready">
            {feedback.map((t) => (
              <li key={t.id} className="it-task iw-row">
                <div>
                  <p className="iw-kind">{skillName(t.skill)} · targeted practice</p>
                  <h3>{ieltsMaterialTitle(t.display_code, t.title)}</h3>
                  {t.reason && <p><span className="iw-label">From your teacher:</span> {t.reason}</p>}
                </div>
                <Link className="iw-action iw-action--quiet" to={'/ielts/practice/targeted/' + t.id}>View teacher feedback</Link>
              </li>
            ))}
          </ul>
        </>
      )}
      {(waiting.length > 0 || finishedSets.length > 0) && (
        <p className="iw-foot">
          {waiting.length > 0 && <>{waiting.length} submitted {waiting.length === 1 ? 'task is' : 'tasks are'} waiting for your teacher. </>}
          {finishedSets.length > 0 && <Link className="iw-link" to="/ielts/practice/assigned">See finished assignments and results ({finishedSets.length})</Link>}
        </p>
      )}
    </section>
  );
}
