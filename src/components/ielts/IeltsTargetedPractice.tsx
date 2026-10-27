import React from 'react';
import { Link } from 'react-router-dom';
import IeltsMaterialProvenance from './IeltsMaterialProvenance';
import { ieltsMaterialTitle } from '../../../services/ieltsMaterialCode';
import type { LearningAllocation } from '../../../services/ieltsLearningService';
import { IeltsCardGroup } from './student/IeltsStudentShell';
import IeltsWorkCard, { dueText, skillName, type IeltsWorkTone } from './student/IeltsWorkCard';
import '../../styles/ielts-navigation.css';

const status = (task: LearningAllocation) => task.status === 'closed' ? 'Closed · saved work' : task.reviewed ? 'Teacher feedback ready' : task.status === 'submitted' ? 'Submitted · awaiting review' : task.status === 'in_progress' ? 'In progress' : 'Ready to start';
const actionLabel = (task: LearningAllocation) => task.status === 'closed' ? 'View saved work' : task.reviewed ? 'View teacher feedback' : task.status === 'submitted' ? 'View saved work' : task.status === 'in_progress' ? 'Continue task' : 'Start task';
const tone = (task: LearningAllocation): IeltsWorkTone => task.status === 'closed' ? 'closed' : task.reviewed ? 'feedback' : task.status === 'submitted' ? 'waiting' : task.status === 'in_progress' ? 'continue' : 'new';

function TaskCard({ task, index }: { task: LearningAllocation; index: number }) {
  const t = tone(task);
  return (
    <IeltsWorkCard index={index} tone={t} chip={status(task)} kicker={`${skillName(task.skill)} · ${task.purpose === 'independent_check' ? 'fresh check' : 'guided practice'}`} skill={task.skill}
      title={ieltsMaterialTitle(task.display_code, task.title)} meta={dueText(task.due_at) || undefined} note={task.reason}
      extra={<IeltsMaterialProvenance label={task.originality_label} />}
      action={{ label: actionLabel(task) + ' →', to: '/ielts/practice/targeted/' + task.id, quiet: t === 'waiting' || t === 'closed' }} />
  );
}

/**
 * Targeted practice, grouped: what to do and feedback to read stay open; work waiting for the teacher and closed work
 * fold away so the page shows only what matters now.
 */
export function IeltsTargetedGroups({ tasks }: { tasks: LearningAllocation[] }) {
  if (tasks.length === 0) {
    return (
      <div className="it-task isn-empty">
        <span aria-hidden="true">🎯</span>
        <div><h3>No targeted tasks yet</h3><p>Your teacher can assign a short task based on your screener feedback. Your saved results are in Journey.</p><Link to="/ielts/journey">Open Journey →</Link></div>
      </div>
    );
  }
  const todo = tasks.filter((t) => t.status === 'assigned' || t.status === 'in_progress').sort((a, b) => Number(b.status === 'in_progress') - Number(a.status === 'in_progress'));
  const feedback = tasks.filter((t) => t.reviewed && t.status !== 'closed');
  const waiting = tasks.filter((t) => t.status === 'submitted' && !t.reviewed);
  const closed = tasks.filter((t) => t.status === 'closed');
  let n = 0;
  return (
    <div className="isn-groups">
      {todo.length > 0 && <IeltsCardGroup title="To do" count={todo.length} tone="todo">{todo.map((t) => <TaskCard key={t.id} task={t} index={n++} />)}</IeltsCardGroup>}
      {feedback.length > 0 && <IeltsCardGroup title="Feedback ready" count={feedback.length} tone="feedback">{feedback.map((t) => <TaskCard key={t.id} task={t} index={n++} />)}</IeltsCardGroup>}
      {todo.length === 0 && feedback.length === 0 && <p className="isn-waiting"><span aria-hidden="true">✓</span> Nothing to do here right now.</p>}
      {waiting.length > 0 && <IeltsCardGroup title="Waiting for your teacher" count={waiting.length} tone="waiting" defaultOpen={false}>{waiting.map((t) => <TaskCard key={t.id} task={t} index={n++} />)}</IeltsCardGroup>}
      {closed.length > 0 && <IeltsCardGroup title="Closed" count={closed.length} tone="done" defaultOpen={false}>{closed.map((t) => <TaskCard key={t.id} task={t} index={n++} />)}</IeltsCardGroup>}
    </div>
  );
}
