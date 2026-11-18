import React from 'react';
import type { TeacherAssignmentSummary } from '../../types';
import {
  groupTargetedPracticeByStudent,
  targetedPracticeSkill,
  targetedPracticeStatus,
} from '../../src/lib/teacherTargetedPractice';
import './TargetedPracticeList.css';

interface TargetedPracticeListProps {
  assignments: TeacherAssignmentSummary[];
  resolveStudentName: (studentId: string | null) => string | null;
  canManage: (assignment: TeacherAssignmentSummary) => boolean;
  deletingId: string | null;
  onReport: (assignment: TeacherAssignmentSummary) => void;
  onDelete: (assignment: TeacherAssignmentSummary) => void;
}

const STATUS_LABEL = { completed: 'Completed', overdue: 'Past due', 'not-started': 'Not started' } as const;

function shortDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Targeted practice grouped by student: one compact row per task. */
export default function TargetedPracticeList({ assignments, resolveStudentName, canManage, deletingId, onReport, onDelete }: TargetedPracticeListProps) {
  const groups = groupTargetedPracticeByStudent(assignments, resolveStudentName);
  return (
    <section className="targeted-practice" aria-label="Targeted practice by student">
      {groups.map((group) => (
        <article key={group.key} className="targeted-practice__student">
          <header className="targeted-practice__student-header">
            <div>
              <h3>{group.studentName}</h3>
              {group.groupName ? <p>{group.groupName}</p> : null}
            </div>
            <span className={`targeted-practice__count${group.openCount > 0 ? ' targeted-practice__count--open' : ''}`}>
              {group.openCount > 0 ? `${group.openCount} open` : 'All done'}
            </span>
          </header>
          <ul className="targeted-practice__tasks">
            {group.tasks.map((task) => {
              const status = targetedPracticeStatus(task);
              const due = shortDate(task.due_at);
              const assigned = shortDate(task.assigned_at);
              const skill = targetedPracticeSkill(task);
              return (
                <li key={task.id} className="targeted-practice__task">
                  <div className="targeted-practice__task-main">
                    <span className="targeted-practice__skill">{skill}</span>
                    <span className="targeted-practice__meta">
                      {task.question_count} question{task.question_count === 1 ? '' : 's'}
                      {assigned ? ` · Set ${assigned}` : ''}
                      {due ? ` · Due ${due}` : ''}
                    </span>
                  </div>
                  <span className={`targeted-practice__status targeted-practice__status--${status}`}>{STATUS_LABEL[status]}</span>
                  <div className="targeted-practice__actions">
                    <button type="button" onClick={() => onReport(task)} aria-label={`View report for ${skill}, ${group.studentName}`}>Report</button>
                    <button
                      type="button"
                      className="targeted-practice__delete"
                      onClick={() => onDelete(task)}
                      disabled={!canManage(task) || deletingId !== null}
                      aria-busy={deletingId === task.id}
                      aria-label={`Delete ${skill} for ${group.studentName}`}
                    >
                      {deletingId === task.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </article>
      ))}
    </section>
  );
}
