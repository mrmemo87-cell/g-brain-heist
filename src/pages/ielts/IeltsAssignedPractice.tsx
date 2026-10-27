import IeltsMaterialProvenance from "../../components/ielts/IeltsMaterialProvenance";
import { ieltsMaterialTitle } from "../../../services/ieltsMaterialCode";
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getIeltsPracticeItemRoute,
  rpcIeltsPracticeAssignmentProgress,
  rpcIeltsPracticeMarkItemStarted,
  rpcIeltsPracticeMarkStarted,
  rpcIeltsPracticeStudentAssignments,
  type IeltsPracticeAssignmentItem,
  type IeltsPracticeAssignmentProgress,
  type IeltsPracticeStudentAssignment,
} from '../../../services/ieltsPracticeAssignmentService';
import {
  buildAssignedPracticeRoute as buildAssignedPracticeRouteWithMetadata,
  getAssignmentItemVisualStatus,
  getAssignmentProgressSummaryFromAssignment,
} from '../../../services/ieltsAssignmentUx';
import IeltsStudentShell, { IeltsCardGroup } from '../../components/ielts/student/IeltsStudentShell';
import { invalidateIeltsStudentWork } from '../../components/ielts/student/useIeltsStudentWork';
import { AssignmentItemStatusBadge, AssignmentProgressBar } from './assignmentPracticeUi';

type AssignmentLoadState = 'loading' | 'ready' | 'error';

const skillLabels: Record<string, string> = {
  reading: 'Reading',
  listening: 'Listening',
  writing: 'Writing',
  speaking: 'Speaking',
};

const skillOrder = ['reading', 'listening', 'writing', 'speaking'];

const formatDueDate = (dueAt: string | null): string => {
  if (!dueAt) return 'No due date';
  const parsed = new Date(dueAt);
  if (Number.isNaN(parsed.getTime())) return 'Due date unavailable';
  return parsed.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const isAssignmentOverdue = (assignment: IeltsPracticeStudentAssignment): boolean => {
  if (assignment.student_status === 'completed') return false;
  if (assignment.student_status === 'overdue') return true;
  if (!assignment.due_at) return false;
  const dueTime = new Date(assignment.due_at).getTime();
  return Number.isFinite(dueTime) && dueTime < Date.now();
};

const groupItemsBySkill = (items: IeltsPracticeAssignmentItem[] = []) => items.reduce<Record<string, IeltsPracticeAssignmentItem[]>>((groups, item) => {
  const skill = item.skill || 'other';
  groups[skill] = [...(groups[skill] ?? []), item];
  return groups;
}, {});

const buildAssignedPracticeRoute = (route: string, assignment: IeltsPracticeStudentAssignment, item: IeltsPracticeAssignmentItem): string => buildAssignedPracticeRouteWithMetadata(
  route,
  assignment.id,
  item.id,
  {
    assignmentItemCount: assignment.item_count ?? assignment.items?.length ?? 0,
    assignmentTitle: assignment.title,
    assignmentDueAt: assignment.due_at,
  },
);


const hasValidAttemptId = (value: string | null | undefined): value is string => typeof value === 'string' && value.trim().length > 0;

type AssignmentProgressReviewMetadata = {
  has_finalized_review?: boolean | null;
  review_status?: string | null;
  feedback_status?: string | null;
};

const hasFinalizedReview = (progressItem?: (IeltsPracticeAssignmentProgress['items'][number] & AssignmentProgressReviewMetadata) | undefined): boolean => (
  progressItem?.has_finalized_review === true || String(progressItem?.review_status ?? progressItem?.feedback_status ?? '').toLowerCase() === 'finalized'
);

const getSubmissionDetailRoute = (itemStatus: string, progressItem?: (IeltsPracticeAssignmentProgress['items'][number] & AssignmentProgressReviewMetadata) | undefined): string | null => {
  if (itemStatus !== 'completed' || !hasValidAttemptId(progressItem?.practice_attempt_id)) return null;
  const skill = String(progressItem.practice_attempt_type ?? progressItem.skill ?? '').toLowerCase();
  const attemptId = encodeURIComponent(progressItem.practice_attempt_id.trim());

  if (skill === 'reading' || skill === 'listening') {
    return `/ielts/${skill}/result/${attemptId}`;
  }
  if (skill === 'writing' || skill === 'speaking') {
    return hasFinalizedReview(progressItem) ? `/ielts/review-result/${skill}/${attemptId}` : null;
  }
  return null;
};

// Older batch assignments stored the teacher's evidence note as the description; students see only the practice focus.
const studentDescription = (description: string | null): string | null => {
  if (!description) return null;
  const legacy = /^Shared target: (.+?)\. Evidence from each student's screener and checks \(provisional policy v1\)\.$/.exec(description.trim());
  return legacy ? `Practice focus: ${legacy[1]}.` : description;
};

const getAssignmentBadge = (assignment: IeltsPracticeStudentAssignment) => {
  if (assignment.student_status === 'completed') {
    return { label: 'Completed', backgroundColor: '#dcfce7', color: '#166534' };
  }
  if (assignment.status === 'closed') {
    return { label: 'Closed', backgroundColor: '#fef3c7', color: '#92400e' };
  }
  if (isAssignmentOverdue(assignment)) {
    return { label: 'Overdue', backgroundColor: '#fee2e2', color: '#991b1b' };
  }
  if (assignment.student_status === 'in_progress') {
    return { label: 'In progress', backgroundColor: '#dbeafe', color: '#1d4ed8' };
  }
  return { label: 'Assigned', backgroundColor: '#fef3c7', color: '#92400e' };
};

const IeltsAssignedPractice: React.FC = () => {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<IeltsPracticeStudentAssignment[]>([]);
  const [loadState, setLoadState] = useState<AssignmentLoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [busyAssignmentId, setBusyAssignmentId] = useState<string | null>(null);
  const [assignmentProgressById, setAssignmentProgressById] = useState<Record<string, IeltsPracticeAssignmentProgress>>({});
  const [expandedAssignments, setExpandedAssignments] = useState<Record<string, boolean>>({});

  const loadAssignments = async () => {
    setLoadState('loading');
    setError(null);
    try {
      const rows = await rpcIeltsPracticeStudentAssignments();
      setAssignments(rows);
      setLoadState('ready');
      setAssignmentProgressById({});
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load assigned IELTS practice.');
      setLoadState('error');
    }
  };

  useEffect(() => {
    void loadAssignments();
  }, []);

  // Deep link from the student home ("?assignment=<id>") opens that set's tasks once.
  const deepLinked = React.useRef(false);
  useEffect(() => {
    if (deepLinked.current || loadState !== 'ready') return;
    const wanted = new URLSearchParams(window.location.search).get('assignment');
    const target = wanted ? assignments.find(a => a.id === wanted) : undefined;
    deepLinked.current = true;
    if (target) void toggleAssignment(target);
  }, [loadState, assignments]);

  const toggleAssignment = async (assignment: IeltsPracticeStudentAssignment) => {
    if (busyAssignmentId) return;
    const opening = !expandedAssignments[assignment.id];
    setExpandedAssignments(current => ({ ...current, [assignment.id]: opening }));
    if (!opening || assignmentProgressById[assignment.id] || busyAssignmentId) return;
    setBusyAssignmentId(assignment.id);
    try {
      const progress = await rpcIeltsPracticeAssignmentProgress(assignment.id);
      setAssignmentProgressById(current => ({ ...current, [assignment.id]: progress }));
    } catch {
      setError('The assignment details could not load. Close and reopen its details to try again.');
    } finally { setBusyAssignmentId(null); }
  };

  const handleOpenItem = async (assignment: IeltsPracticeStudentAssignment, item: IeltsPracticeAssignmentItem, route: string) => {
    if (assignment.status === 'closed') {
      setError('This assignment is closed and can only be reviewed read-only.');
      return;
    }

    const assignedRoute = buildAssignedPracticeRoute(route, assignment, item);

    setBusyAssignmentId(assignment.id);
    try {
      if (assignment.student_status === 'assigned') {
        const updated = await rpcIeltsPracticeMarkStarted(assignment.id);
        setAssignments((current) => current.map((row) => (row.id === assignment.id ? { ...row, ...updated } : row)));
      }
      const progress = await rpcIeltsPracticeMarkItemStarted({ assignmentId: assignment.id, assignmentItemId: item.id });
      setAssignmentProgressById((current) => ({ ...current, [assignment.id]: progress }));
      invalidateIeltsStudentWork();
      navigate(assignedRoute);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'Unable to mark assignment item as started.');
    } finally {
      setBusyAssignmentId(null);
    }
  };

  const sortedAssignments = useMemo(() => [...assignments].sort((a, b) => {
    if (a.student_status === 'completed' && b.student_status !== 'completed') return 1;
    if (a.student_status !== 'completed' && b.student_status === 'completed') return -1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  }), [assignments]);

  const renderAssignment = (assignment: IeltsPracticeStudentAssignment) => {
          const assignmentProgress = assignmentProgressById[assignment.id] ?? null;
          const normalizedItems = (assignment.items && assignment.items.length > 0)
            ? assignment.items
            : (assignmentProgress?.items ?? []).map((progressItem) => ({
              id: progressItem.assignment_item_id,
              assignment_id: assignment.id,
              skill: progressItem.skill,
              content_type: progressItem.content_type,
              content_id: progressItem.content_id,
              title: progressItem.title,
              required: Boolean(progressItem.required),
              order_index: progressItem.order_index ?? 0,
              created_at: progressItem.started_at ?? progressItem.completed_at ?? progressItem.updated_at ?? assignment.created_at,
            }));
          const groupedItems = groupItemsBySkill(normalizedItems);
          const visibleSkills = [...skillOrder, ...Object.keys(groupedItems).filter((skill) => !skillOrder.includes(skill))]
            .filter((skill) => (groupedItems[skill] ?? []).length > 0);
          const badge = getAssignmentBadge(assignment);
          const isBusy = busyAssignmentId === assignment.id;
          const progressSummary = getAssignmentProgressSummaryFromAssignment({ ...assignment, items: normalizedItems }, assignmentProgress);
          const progressItemsById = new Map((assignmentProgress?.items ?? []).map((progressItem) => [progressItem.assignment_item_id, progressItem]));
          const isClosedReadOnly = assignment.status === 'closed' && assignment.student_status !== 'completed';
          const isOverdue = isAssignmentOverdue(assignment);
          const isExpanded = Boolean(expandedAssignments[assignment.id]);

          const lightBadge = assignment.student_status === 'completed'
            ? { bg: '#dcfce7', color: '#166534', border: '#86efac' }
            : assignment.status === 'closed'
              ? { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' }
              : isOverdue
                ? { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' }
                : assignment.student_status === 'in_progress'
                  ? { bg: '#dbeafe', color: '#1d4ed8', border: '#93c5fd' }
                  : { bg: '#ede9fe', color: '#5b21b6', border: '#c4b5fd' };

          return (
            <article key={assignment.id} data-testid={`ielts-assigned-assignment-${assignment.id}`} className={'isn-set' + (isOverdue ? ' is-overdue' : '') + (assignment.student_status === 'completed' ? ' is-done' : '')}>

              {/* Assignment header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}>
                  <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>{assignment.title}</h2>
                  {studentDescription(assignment.description) && <p className="isn-clamp" style={{ margin: '0.35rem 0 0', color: 'var(--bh-ielts-foreground-muted)', lineHeight: 1.5, fontSize: '0.875rem' }}>{studentDescription(assignment.description)}</p>}
                </div>
                <span style={{ background: lightBadge.bg, color: lightBadge.color, border: `1px solid ${lightBadge.border}`, borderRadius: '9999px', padding: '0.3rem 0.7rem', fontSize: '0.68rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {badge.label}
                </span>
              </div>

              {/* Meta */}
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.65rem', color: 'var(--bh-ielts-foreground-muted)', fontSize: '0.8rem' }}>
                <span>Due: <strong style={{ color: isOverdue ? '#dc2626' : '#475569' }}>{formatDueDate(assignment.due_at)}</strong></span>
                <span>{assignment.item_count ?? assignment.items?.length ?? 0} {(assignment.item_count ?? assignment.items?.length ?? 0) === 1 ? 'task' : 'tasks'}</span>
              </div>

              {/* Progress bar */}
              <AssignmentProgressBar
                testId={`ielts-assigned-progress-${assignment.id}`}
                summary={progressSummary}
                label={`${progressSummary.completedCount} of ${progressSummary.totalCount} completed`}
                style={{ marginTop: '0.85rem', color: '#475569' }}
              />

              <button
                type="button"
                disabled={busyAssignmentId !== null}
                aria-expanded={isExpanded}
                onClick={() => void toggleAssignment(assignment)}
                style={{ marginTop: '0.75rem', minHeight: '44px', background: assignment.student_status === 'completed' ? '#ffffff' : 'var(--bh-ielts-primary)', color: assignment.student_status === 'completed' ? 'var(--bh-ielts-primary)' : '#ffffff', border: `1px solid ${assignment.student_status === 'completed' ? 'var(--bh-ielts-border)' : 'var(--bh-ielts-primary)'}`, borderRadius: '0.625rem', padding: '0.55rem 1rem', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}
              >
                {assignment.student_status === 'completed'
                  ? (isExpanded ? 'Hide results' : 'See results and feedback')
                  : (isExpanded ? 'Hide tasks' : assignment.student_status === 'in_progress' ? 'Continue: show tasks' : 'Start: show tasks')}
              </button>

              {/* Skill sections */}
              {isExpanded && isBusy && <p role="status">Checking assignment details…</p>}
              {isExpanded && !isBusy && <div style={{ marginTop: '0.85rem' }}>
                {visibleSkills.length === 0 && (
                    <div data-testid={`ielts-assigned-no-items-${assignment.id}`} style={{ border: '1px dashed #cbd5e1', background: '#f8fafc', borderRadius: '0.75rem', padding: '0.875rem', color: 'var(--bh-ielts-foreground-muted)', fontSize: '0.82rem', fontWeight: 700 }}>
                    This assignment has no items yet. Ask your teacher to add practice content.
                  </div>
                )}

                {visibleSkills.map((skill) => (
                  <section key={skill} style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem', marginTop: '0.75rem' }}>
                    <h3 style={{ margin: '0 0 0.5rem', color: 'var(--bh-ielts-primary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>{skillLabels[skill] ?? skill}</h3>
                    <div style={{ display: 'grid', gap: '0.45rem' }}>
                      {(groupedItems[skill] ?? []).map((item) => {
                        const route = getIeltsPracticeItemRoute(item);
                        const assignedRoute = route ? buildAssignedPracticeRoute(route, assignment, item) : null;
                        const itemProgress = progressItemsById.get(item.id);
                        const itemStatus = getAssignmentItemVisualStatus(itemProgress ?? item, assignment);
                        const skill = String(itemProgress?.practice_attempt_type ?? itemProgress?.skill ?? item.skill ?? '').toLowerCase();
                        const itemStyle = itemStatus === 'completed'
                          ? { border: '#86efac', bg: '#f0fdf4' }
                          : itemStatus === 'in_progress'
                            ? { border: '#93c5fd', bg: '#eff6ff' }
                            : { border: '#e2e8f0', bg: '#f8fafc' };

                        return (
                          <div key={item.id} data-testid={`ielts-assigned-item-${item.id}`} data-status={itemStatus} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', border: `1px solid ${itemStyle.border}`, background: itemStyle.bg, borderRadius: '0.65rem', padding: '0.65rem', flexWrap: 'wrap' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <p style={{ margin: 0, fontWeight: 700, color: '#0f172a', fontSize: '0.875rem' }}>{ieltsMaterialTitle(item.display_code, item.title || `${skillLabels[skill] ?? skill} practice`)}<IeltsMaterialProvenance label={item.originality_label}/></p>
                                <AssignmentItemStatusBadge status={itemStatus} />
                              </div>
                              <p style={{ margin: '0.2rem 0 0', color: 'var(--bh-ielts-foreground-muted)', fontSize: '0.75rem' }}>{item.required ? 'Required' : 'Optional'}</p>
                            </div>
                            {route && assignedRoute ? (
                              isClosedReadOnly ? (
                                <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', borderRadius: '0.5rem', padding: '0.45rem 0.75rem', fontWeight: 700, fontSize: '0.75rem' }}>
                                  Closed
                                </span>
                              ) : itemStatus === 'completed' ? (
                                (() => {
                                  const submissionDetailRoute = getSubmissionDetailRoute(itemStatus, itemProgress);
                                  if (submissionDetailRoute) {
                                    return (
                                      <a
                                        data-testid={`ielts-assigned-view-submission-${item.id}`}
                                        href={submissionDetailRoute}
                                        onClick={(event) => {
                                          event.preventDefault();
                                          navigate(submissionDetailRoute);
                                        }}
                                        style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac', borderRadius: '0.5rem', padding: '0.45rem 0.75rem', fontWeight: 700, textDecoration: 'none', fontSize: '0.75rem' }}
                                      >
                                        {skill === 'reading' || skill === 'listening' ? 'View result →' : 'View feedback →'}
                                      </a>
                                    );
                                  }
                                  // The progress RPC carries no review metadata, so the feedback link above cannot appear for
                                  // writing/speaking. The item page itself restores the submitted work with its AI feedback and,
                                  // once finalized, the teacher review link.
                                  if ((skill === 'writing' || skill === 'speaking') && hasValidAttemptId(itemProgress?.practice_attempt_id)) {
                                    return (
                                      <a
                                        data-testid={`ielts-assigned-view-work-${item.id}`}
                                        href={assignedRoute}
                                        onClick={(event) => { event.preventDefault(); navigate(assignedRoute); }}
                                        style={{ background: '#ffffff', color: 'var(--bh-ielts-primary)', border: '1px solid var(--bh-ielts-border)', borderRadius: '0.5rem', padding: '0.45rem 0.85rem', fontWeight: 600, textDecoration: 'none', fontSize: '0.8rem' }}
                                      >
                                        Open your {skill === 'writing' ? 'essay' : 'recording'} and feedback →
                                      </a>
                                    );
                                  }
                                  const unavailableCopy = skill === 'reading' || skill === 'listening'
                                    ? '✓ Completed · Result not available yet'
                                    : skill === 'writing' || skill === 'speaking'
                                      ? '✓ Completed · Feedback not finalized yet'
                                      : 'Complete task first';
                                  return (
                                    <span style={{ background: '#f8fafc', color: 'var(--bh-ielts-foreground-muted)', border: '1px solid #cbd5e1', borderRadius: '0.5rem', padding: '0.45rem 0.75rem', fontWeight: 700, fontSize: '0.75rem' }}>
                                      {unavailableCopy}
                                    </span>
                                  );
                                })()
                              ) : (
                                <a
                                  data-testid={`ielts-assigned-open-item-${item.id}`}
                                  href={assignedRoute}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    void handleOpenItem(assignment, item, route);
                                  }}
                                  style={{ background: itemStatus === 'in_progress' ? '#dbeafe' : '#eff6ff', color: itemStatus === 'in_progress' ? '#1d4ed8' : 'var(--bh-ielts-primary)', border: `1px solid ${itemStatus === 'in_progress' ? '#93c5fd' : '#bfdbfe'}`, borderRadius: '0.5rem', padding: '0.45rem 0.85rem', fontWeight: 700, textDecoration: 'none', fontSize: '0.8rem', opacity: isBusy ? 0.65 : 1, pointerEvents: isBusy ? 'none' : 'auto' }}
                                >
                                  {itemStatus === 'in_progress' ? 'Continue →' : 'Open →'}
                                </a>
                              )
                            ) : (
                              <span style={{ color: '#cbd5e1', fontSize: '0.75rem' }}>Unavailable</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>}

              {/* Footer banners */}
              {isClosedReadOnly ? (
                <div data-testid={`ielts-assigned-closed-read-only-${assignment.id}`} style={{ marginTop: '0.85rem', border: '1px solid #fcd34d', background: '#fef9c3', color: '#92400e', borderRadius: '0.65rem', padding: '0.75rem', fontSize: '0.8rem', fontWeight: 700 }}>
                  Closed assignments are read-only. Your progress is preserved, but no new submissions are available.
                </div>
              ) : assignment.student_status !== 'completed' && isExpanded && (
                <p style={{ margin: '0.75rem 0 0', color: 'var(--bh-ielts-foreground-muted)', fontSize: '0.78rem' }}>
                  Assignment completes automatically after all required items are finished.
                </p>
              )}
            </article>
          );
  };
  const todoSets = sortedAssignments.filter(a => a.student_status !== 'completed' && a.status !== 'closed');
  const closedSets = sortedAssignments.filter(a => a.student_status !== 'completed' && a.status === 'closed');
  const doneSets = sortedAssignments.filter(a => a.student_status === 'completed');

  return (
    <IeltsStudentShell active="assigned" eyebrow="From your teachers" title="Assignments" lead="Practice sets from your teachers. Open a set to see its tasks, results and feedback. Assignments complete automatically after all required items are finished.">
      <div data-testid="ielts-assigned-practice-page" className="bh-ielts-page bh-ielts-assignments isn-assignments">
        {/* Error */}
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '0.875rem', borderRadius: '0.75rem', marginBottom: '1rem', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        {/* Loading */}
        {loadState === 'loading' && (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.75rem', padding: '1rem', color: 'var(--bh-ielts-foreground-muted)', fontSize: '0.875rem' }}>
            Loading assigned IELTS practice…
          </div>
        )}

        {/* Load error */}
        {loadState === 'error' && (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.75rem', padding: '1rem' }}>
            <p style={{ margin: '0 0 0.75rem', color: 'var(--bh-ielts-foreground-muted)' }}>We could not load your assigned practice.</p>
            <button type="button" onClick={() => void loadAssignments()} style={{ background: 'var(--bh-ielts-primary)', color: '#ffffff', border: 'none', borderRadius: '0.5rem', padding: '0.55rem 1rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.875rem' }}>
              Try again
            </button>
          </div>
        )}

        {/* Empty */}
        {loadState === 'ready' && sortedAssignments.length === 0 && (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.75rem', padding: '1.25rem', color: 'var(--bh-ielts-foreground-muted)', fontSize: '0.875rem', lineHeight: 1.6 }}>
            <p style={{ margin: 0 }}><span aria-hidden="true">📋 </span>No school assignment sets right now. Your teacher may have assigned a focused task in Targeted Practice.</p>
            <button type="button" className="ij-link" onClick={() => navigate('/ielts/practice/targeted')}>Open Targeted Practice →</button>
          </div>
        )}

        {loadState === 'ready' && sortedAssignments.length > 0 && (
          <div className="isn-groups">
            {todoSets.length > 0 && <IeltsCardGroup title="To do" count={todoSets.length} tone="todo">{todoSets.map(renderAssignment)}</IeltsCardGroup>}
            {todoSets.length === 0 && <p className="isn-waiting"><span aria-hidden="true">✓</span> No open assignments right now.</p>}
            {doneSets.length > 0 && <IeltsCardGroup title="Finished · results and feedback" count={doneSets.length} tone="done" defaultOpen={false}>{doneSets.map(renderAssignment)}</IeltsCardGroup>}
            {closedSets.length > 0 && <IeltsCardGroup title="Closed" count={closedSets.length} tone="waiting" defaultOpen={false}>{closedSets.map(renderAssignment)}</IeltsCardGroup>}
          </div>
        )}
      </div>
    </IeltsStudentShell>
  );

};

export default IeltsAssignedPractice;
