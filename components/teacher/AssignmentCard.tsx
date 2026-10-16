import React, { useEffect, useId, useRef, useState } from 'react';
import type { TeacherAssignmentSummary } from '../../types';
import './AssignmentCard.css';

interface AssignmentCardProps {
  assignment: TeacherAssignmentSummary;
  canManage: boolean;
  printing: boolean;
  printDisabled: boolean;
  deleting: boolean;
  deleteDisabled: boolean;
  onReport: () => void;
  onPrint: () => void;
  onRecord: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

type ActionIconName = 'report' | 'print' | 'record' | 'edit' | 'delete' | 'more';
const iconPaths: Record<ActionIconName, React.ReactNode> = {
  report: <><path d="M4 3v18h17" /><path d="M8 16v-4m5 4V7m5 9V4" /></>,
  print: <><path d="M7 8V3h10v5M7 17H4V9h16v8h-3" /><path d="M7 14h10v7H7zM16 11h1" /></>,
  record: <><path d="m3 6 1 1 2-3m-3 9 1 1 2-3m-3 9 1 1 2-3M10 5h11M10 12h11M10 19h11" /></>,
  edit: <><path d="m14 4 6 6M4 20l4-1L21 6l-4-4L4 15z" /></>,
  delete: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></>,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
};
function ActionIcon({ name }: { name: ActionIconName }) {
  return <svg className="assignment-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>;
}

function validDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function readableDate(date: Date): string {
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AssignmentCard({ assignment, canManage, printing, printDisabled, deleting, deleteDisabled, onReport, onPrint, onRecord, onEdit, onDelete }: AssignmentCardProps) {
  const titleId = useId();
  const menuRef = useRef<HTMLDetailsElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const title = assignment.title || assignment.topic_name;
  const total = Math.max(0, assignment.student_count);
  const done = Math.max(0, Math.min(total, assignment.completed_count));
  const remaining = total - done;
  const percent = total > 0 ? Math.round(done / total * 100) : 0;
  const complete = total > 0 && remaining === 0;
  const due = validDate(assignment.due_at);
  const assigned = validDate(assignment.assigned_at);
  const now = Date.now();
  const pastDue = due !== null && due.getTime() < now;
  const draft = assignment.publish_status === 'draft';
  const scheduled = assignment.publish_status === 'scheduled' && assigned !== null && assigned.getTime() > now;
  const group = assignment.subject_group_name || (assignment.assignment_mode === 'custom' ? 'Selected students' : assignment.batch || 'Class');
  const mode = assignment.delivery_mode === 'paper' ? 'Paper' : assignment.delivery_mode === 'mixed' ? 'Mixed' : 'Online';
  const status = draft ? 'Draft' : scheduled ? 'Scheduled' : complete ? 'Completed'
    : pastDue ? (assignment.close_submissions_after_due ? 'Closed' : 'Overdue')
    : due?.toDateString() === new Date(now).toDateString() ? 'Due today'
    : due && due.getTime() - now <= 24 * 60 * 60 * 1000 ? 'Due soon' : null;
  const statusTone = draft || scheduled ? 'neutral' : complete ? 'success' : status === 'Closed' ? 'closed' : 'warning';

  useEffect(() => {
    if (!menuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target) && menuRef.current) menuRef.current.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menuRef.current) {
        menuRef.current.open = false;
        menuRef.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);

  const closeAndRun = (action: () => void) => {
    if (menuRef.current) menuRef.current.open = false;
    action();
  };

  return (
    <article className="assignment-card" aria-labelledby={titleId}>
      <div className="assignment-card__top">
        <div className="assignment-card__identity">
          <span className="assignment-card__eyebrow">{assignment.subject_name} · {assignment.topic_name}</span>
          <span className="assignment-card__mode">{mode}</span>
        </div>
        <details ref={menuRef} className="assignment-card__options" onToggle={() => setMenuOpen(Boolean(menuRef.current?.open))}>
          <summary aria-label={`Options for ${title}`}><ActionIcon name="more" /></summary>
          <div className="assignment-card__options-panel">
            <button type="button" onClick={() => closeAndRun(onEdit)} disabled={!canManage}><ActionIcon name="edit" />Edit assignment</button>
            <button type="button" onClick={() => closeAndRun(onDelete)} disabled={!canManage || deleteDisabled} className="assignment-card__delete" aria-busy={deleting}><ActionIcon name="delete" />{deleting ? 'Deleting…' : 'Delete assignment'}</button>
            {assigned ? <div className="assignment-card__assigned">Assigned <time dateTime={assigned.toISOString()}>{readableDate(assigned)}</time></div> : null}
          </div>
        </details>
      </div>
      <h3 id={titleId} className="assignment-card__title">{title}</h3>
      <div className="assignment-card__meta">
        <span>{group}</span><span aria-hidden="true">·</span>
        <span>{total} student{total === 1 ? '' : 's'}</span><span aria-hidden="true">·</span>
        <span>{assignment.question_count} question{assignment.question_count === 1 ? '' : 's'}</span>
      </div>
      <div className="assignment-card__progress-heading">
        <span className="assignment-card__completed">{total > 0 ? `${done} of ${total} completed` : 'No students assigned'}</span>
        <span className="assignment-card__percentage">{percent}%</span>
      </div>
      <div className={`assignment-card__track${complete ? ' assignment-card__track--complete' : ''}`} role="progressbar" aria-label="Student completion" aria-valuemin={0} aria-valuemax={total || 1} aria-valuenow={done} aria-valuetext={`${done} of ${total} students completed`}>
        <span style={{ width: `${total > 0 ? done / total * 100 : 0}%` }} />
      </div>
      <div className="assignment-card__status-row">
        <span>{total === 0 ? 'Add students to get started' : complete ? 'All students finished' : `${remaining} remaining`}</span>
        <div className="assignment-card__deadline">
          {status ? <span className={`assignment-card__status assignment-card__status--${statusTone}`}>{status}</span> : null}
          {scheduled && assigned ? <span>Starts <time dateTime={assigned.toISOString()}>{readableDate(assigned)}</time></span>
            : due ? <span>Due <time dateTime={due.toISOString()}>{readableDate(due)}</time></span>
            : <span>No deadline</span>}
        </div>
      </div>
      <button type="button" className="assignment-card__report" onClick={onReport}><ActionIcon name="report" />View report<span className="assignment-card__arrow" aria-hidden="true">→</span></button>
      <div className="assignment-card__paper">
        <span className="assignment-card__paper-label">Paper tools</span>
        <button type="button" onClick={onPrint} disabled={!canManage || printDisabled} aria-busy={printing} aria-label={`Print papers for ${title}`}><ActionIcon name="print" />{printing ? 'Preparing…' : 'Print papers'}</button>
        <button type="button" onClick={onRecord} disabled={!canManage} aria-label={`Record paper answers for ${title}`}><ActionIcon name="record" />Record answers</button>
      </div>
    </article>
  );
}
