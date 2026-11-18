import React, { useEffect, useMemo, useState } from 'react';
import type { TeacherAssignmentSummary, TeacherAssignmentReportRow } from '../../types';
import * as GameService from '../../services/gameService';
import {
  assignmentsForGroup,
  buildClassworkGrid,
  classworkAttention,
  scoreBand,
  studentTimeline,
  type ClassworkGroup,
  type TimelineItem,
} from '../../src/lib/classworkModel';
import './Classwork.css';

export type ClassworkMode = 'class' | 'student' | 'manage';

interface ClassworkProps {
  mode: ClassworkMode;
  onMode: (mode: ClassworkMode) => void;
  assignments: TeacherAssignmentSummary[];
  groups: ClassworkGroup[];
  studentName: (studentId: string) => string;
  canCreate: boolean;
  onCreateAssignment: () => void;
  onCreateDiagnostic: () => void;
  onOpenReport: (assignment: TeacherAssignmentSummary) => void;
  onPrintExport: () => void;
  /** The existing assignment manager (edit, print papers, record answers, delete), shown in Manage mode. */
  children?: React.ReactNode;
}

const RECENT_COLUMNS = 5;
const shortDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};
const STATUS_LABEL: Record<TimelineItem['status'], string> = {
  done: 'Done', missing: 'Missing', 'past-due': 'Past due', 'not-started': 'Not started',
};

/**
 * Classwork: Assignments and Reports in one place. "By class" is a live grid of students against class
 * assignments; "By student" is one timeline of everything set for a student; "Manage" keeps the assignment
 * cards with their edit, print and paper tools.
 */
export default function Classwork(props: ClassworkProps) {
  const { mode, onMode, assignments, groups, studentName } = props;
  const [groupId, setGroupId] = useState<string>('');
  const [studentId, setStudentId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState<'all' | 'todo' | 'done'>('all');
  const [results, setResults] = useState<Record<string, TeacherAssignmentReportRow[]>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  // Groups with work come first so the page opens on something useful.
  const orderedGroups = useMemo(() => groups
    .map((group) => ({ group, count: assignmentsForGroup(assignments, group).length }))
    .sort((a, b) => Number(b.count > 0) - Number(a.count > 0) || a.group.name.localeCompare(b.group.name, undefined, { numeric: true })),
  [groups, assignments]);
  const activeGroup = orderedGroups.find((g) => g.group.id === groupId)?.group ?? orderedGroups[0]?.group ?? null;

  const idsKey = assignments.map((a) => a.id).join(',');
  useEffect(() => {
    if (mode === 'manage' || !idsKey) return;
    let cancelled = false;
    setLoading(true); setLoadError('');
    GameService.get_all_assignment_reports(idsKey.split(','))
      .then((data) => { if (!cancelled) setResults(data); })
      .catch(() => { if (!cancelled) setLoadError('Results could not be loaded. Check your connection and try again.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [idsKey, mode]);

  const grid = useMemo(() => activeGroup
    ? buildClassworkGrid({ group: activeGroup, assignments, results, nameOf: studentName })
    : { columns: [], rows: [] },
  [activeGroup, assignments, results, studentName]);
  const attention = useMemo(() => classworkAttention(grid), [grid]);
  const visibleColumns = showAll ? grid.columns.length : Math.min(RECENT_COLUMNS, grid.columns.length);

  const allStudents = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; group: string }>();
    groups.forEach((group) => group.studentIds.forEach((id) => {
      if (!seen.has(id)) seen.set(id, { id, name: studentName(id), group: group.name });
    }));
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [groups, studentName]);
  const matchingStudents = allStudents.filter((s) => s.name.toLowerCase().includes(search.trim().toLowerCase()));
  const timeline = useMemo(() => studentId ? studentTimeline({ studentId, assignments, results }) : [], [studentId, assignments, results]);
  const shownTimeline = timeline.filter((item) => filter === 'all' || (filter === 'done' ? item.status === 'done' : item.status !== 'done'));
  const done = timeline.filter((item) => item.status === 'done');
  const average = done.length ? Math.round(done.reduce((sum, item) => sum + (item.accuracy ?? 0), 0) / done.length) : null;

  const openStudent = (id: string) => { setStudentId(id); setFilter('all'); onMode('student'); };

  const scoreCell = (accuracy: number) => <span className={`classwork-score classwork-score--${scoreBand(accuracy)}`}>{accuracy}%</span>;

  return (
    <div className="classwork">
      <header className="classwork__header">
        <div>
          <h2>Classwork</h2>
          <p>Set work, see who has done it and how well, in one place.</p>
        </div>
        <div className="classwork__actions">
          <div className="classwork__modes" role="group" aria-label="View">
            {([['class', 'By class'], ['student', 'By student'], ['manage', 'Manage']] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={mode === value} onClick={() => onMode(value)}>{label}</button>
            ))}
          </div>
          <button type="button" className="classwork__secondary" onClick={props.onPrintExport} disabled={assignments.length === 0}>Print or export</button>
          <details className="classwork__create">
            <summary aria-disabled={!props.canCreate}>+ Create</summary>
            <div>
              <button type="button" disabled={!props.canCreate} onClick={props.onCreateAssignment}><strong>New assignment</strong><span>Choose your questions</span></button>
              <button type="button" disabled={!props.canCreate} onClick={props.onCreateDiagnostic}><strong>Create diagnostic</strong><span>Find strengths and next steps</span></button>
            </div>
          </details>
        </div>
      </header>

      {mode === 'manage' ? props.children : null}

      {mode !== 'manage' && loadError ? <p className="classwork__error" role="alert">{loadError}</p> : null}

      {mode === 'class' ? (
        orderedGroups.length === 0 ? (
          <p className="classwork__empty">You have no teaching groups yet. Ask your school administrator to allocate your classes.</p>
        ) : (
          <>
            <nav className="classwork__groups" aria-label="Classes">
              {orderedGroups.map(({ group, count }) => (
                <button key={group.id} type="button" aria-pressed={activeGroup?.id === group.id} onClick={() => { setGroupId(group.id); setShowAll(false); }}>
                  {group.name}<span>{count}</span>
                </button>
              ))}
            </nav>

            {activeGroup && grid.columns.length > 0 && (attention.pastDue > 0 || attention.mostMissing || attention.repeatMissing.count > 0) ? (
              <section className="classwork__attention" aria-label={`Needs attention in ${activeGroup.name}`}>
                {attention.pastDue > 0 ? (
                  <div className="classwork__flag classwork__flag--danger"><b>{attention.pastDue}</b><span><strong>Past due</strong>{attention.pastDue === 1 ? 'assignment still has' : 'assignments still have'} work outstanding</span></div>
                ) : null}
                {attention.mostMissing ? (
                  <div className="classwork__flag classwork__flag--warning"><b>{attention.mostMissing.missing} of {attention.mostMissing.set}</b><span><strong>Not handed in</strong>{attention.mostMissing.title}</span></div>
                ) : null}
                {attention.repeatMissing.count > 0 ? (
                  <div className="classwork__flag classwork__flag--info"><b>{attention.repeatMissing.count}</b><span><strong>{attention.repeatMissing.count === 1 ? 'Student' : 'Students'} to talk to</strong>{attention.repeatMissing.names.join(', ')}{attention.repeatMissing.count > 3 ? ` and ${attention.repeatMissing.count - 3} more` : ''} · missing 3 or more</span></div>
                ) : null}
              </section>
            ) : null}

            {activeGroup ? (
              <section className="classwork__panel" aria-label={`${activeGroup.name} results`} aria-busy={loading}>
                <div className="classwork__panel-head">
                  <div>
                    <h3>{activeGroup.name}</h3>
                    <span>{grid.rows.length} student{grid.rows.length === 1 ? '' : 's'} · {grid.columns.length} class assignment{grid.columns.length === 1 ? '' : 's'}{grid.columns.length > visibleColumns ? ` · showing the ${visibleColumns} most recent` : ''}</span>
                  </div>
                  <div className="classwork__legend" aria-label="Key">
                    <span className="classwork-score classwork-score--strong">80% and above</span>
                    <span className="classwork-score classwork-score--developing">60 to 79%</span>
                    <span className="classwork-score classwork-score--support">Below 60%</span>
                    <span className="classwork-missing">Missing</span>
                    <span>— not set</span>
                  </div>
                </div>
                {grid.columns.length === 0 ? (
                  <p className="classwork__empty">No class assignments for {activeGroup.name} yet. Choose Create to set the first one.</p>
                ) : grid.rows.length === 0 ? (
                  <p className="classwork__empty">No students are listed in {activeGroup.name} yet.</p>
                ) : (
                  <div className="classwork__scroll">
                    <table className="classwork__table">
                      <thead>
                        <tr>
                          <th scope="col" className="classwork__student-col">Student</th>
                          {grid.columns.slice(0, visibleColumns).map((column) => (
                            <th scope="col" key={column.assignment.id} className="classwork__assignment-col">
                              <button type="button" onClick={() => props.onOpenReport(column.assignment as TeacherAssignmentSummary)} aria-label={`Open the report for ${column.title}`}>{column.title}</button>
                              <span className={column.pastDue ? 'classwork__due classwork__due--late' : 'classwork__due'}>
                                {shortDate(column.assignment.assigned_at) ?? ''}{column.pastDue ? ' · past due' : ''}
                              </span>
                              <span className="classwork__bar" aria-hidden="true"><span style={{ width: `${column.setCount ? (column.doneCount / column.setCount) * 100 : 0}%` }} /></span>
                              <span className="classwork__colstat">{column.doneCount} of {column.setCount} done{column.average !== null ? ` · avg ${column.average}%` : ''}</span>
                            </th>
                          ))}
                          <th scope="col">Done</th>
                          <th scope="col">Average</th>
                          <th scope="col">Targeted practice</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grid.rows.map((row) => (
                          <tr key={row.studentId}>
                            <th scope="row" className="classwork__student-col">
                              <button type="button" onClick={() => openStudent(row.studentId)} aria-label={`Open ${row.name}'s work`}>{row.name}</button>
                            </th>
                            {row.cells.slice(0, visibleColumns).map((cell, index) => (
                              <td key={grid.columns[index].assignment.id}>
                                {cell.kind === 'score' ? (
                                  <button type="button" className="classwork__cell" onClick={() => props.onOpenReport(grid.columns[index].assignment as TeacherAssignmentSummary)} aria-label={`${row.name}, ${grid.columns[index].title}: ${cell.accuracy}%. Open the report`}>{scoreCell(cell.accuracy)}</button>
                                ) : cell.kind === 'missing' ? <span className="classwork-missing">{loading ? '…' : 'Missing'}</span>
                                  : <span className="classwork-notset" title="Not set for this student" aria-label="Not set">—</span>}
                              </td>
                            ))}
                            <td className="classwork__num">{row.doneCount} of {row.setCount}</td>
                            <td className="classwork__num"><strong>{row.average !== null ? `${row.average}%` : '—'}</strong></td>
                            <td>{row.openTargeted > 0
                              ? <button type="button" className="classwork__targeted" onClick={() => openStudent(row.studentId)}>{row.openTargeted} open</button>
                              : <span className="classwork-notset">None</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {grid.columns.length > RECENT_COLUMNS ? (
                  <div className="classwork__panel-foot">
                    <button type="button" onClick={() => setShowAll((value) => !value)}>{showAll ? `Show the ${RECENT_COLUMNS} most recent` : `Show all ${grid.columns.length} assignments`}</button>
                  </div>
                ) : null}
              </section>
            ) : null}
          </>
        )
      ) : null}

      {mode === 'student' ? (
        <div className="classwork__student">
          <aside className="classwork__picker" aria-label="Students">
            <label><span className="classwork__sr">Search students</span><input type="search" placeholder="Search students" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <ul>
              {matchingStudents.map((student) => (
                <li key={student.id}><button type="button" aria-pressed={student.id === studentId} onClick={() => { setStudentId(student.id); setFilter('all'); }}><strong>{student.name}</strong><span>{student.group}</span></button></li>
              ))}
              {matchingStudents.length === 0 ? <li className="classwork__empty">No student matches that name.</li> : null}
            </ul>
          </aside>
          <section className="classwork__timeline" aria-label="Student work" aria-busy={loading}>
            {!studentId ? (
              <p className="classwork__empty">Choose a student to see everything set for them: class assignments and targeted practice in one list.</p>
            ) : (
              <>
                <h3>{studentName(studentId)}</h3>
                <div className="classwork__summary">
                  <div><strong>{done.length} of {timeline.length}</strong><span>handed in</span></div>
                  <div><strong>{average !== null ? `${average}%` : '—'}</strong><span>average</span></div>
                  <div className={timeline.length - done.length > 0 ? 'is-warning' : ''}><strong>{timeline.length - done.length}</strong><span>to do</span></div>
                </div>
                <div className="classwork__modes" role="group" aria-label="Filter">
                  {([['all', 'Everything'], ['todo', 'To do'], ['done', 'Done']] as const).map(([value, label]) => (
                    <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
                  ))}
                </div>
                <ul className="classwork__items">
                  {shownTimeline.map((item) => (
                    <li key={item.assignment.id}>
                      <button type="button" onClick={() => props.onOpenReport(item.assignment as TeacherAssignmentSummary)}>
                        <span className="classwork__item-main">
                          <span className={`classwork__kind classwork__kind--${item.kind}`}>{item.kind === 'targeted' ? 'Targeted practice' : 'Class assignment'}</span>
                          <strong>{item.title}</strong>
                          <span>{[item.groupName, item.status === 'done' ? `Done ${shortDate(item.date) ?? ''}` : `Set ${shortDate(item.assignment.assigned_at) ?? ''}`, item.assignment.due_at && item.status !== 'done' ? `due ${shortDate(item.assignment.due_at)}` : null].filter(Boolean).join(' · ')}</span>
                        </span>
                        {item.accuracy !== null ? scoreCell(item.accuracy) : <span className="classwork-missing">{STATUS_LABEL[item.status]}</span>}
                      </button>
                    </li>
                  ))}
                  {shownTimeline.length === 0 ? <li className="classwork__empty">{loading ? 'Loading…' : 'Nothing here.'}</li> : null}
                </ul>
              </>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
