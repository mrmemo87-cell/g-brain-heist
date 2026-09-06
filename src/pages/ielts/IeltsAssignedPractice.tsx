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
import { supabase } from '../../../services/supabaseClient';
import {
  buildAssignedPracticeRoute as buildAssignedPracticeRouteWithMetadata,
  getAssignmentItemVisualStatus,
  getAssignmentProgressSummaryFromAssignment,
} from '../../../services/ieltsAssignmentUx';
import { AssignmentItemStatusBadge, AssignmentProgressBar } from './assignmentPracticeUi';

type AssignmentLoadState = 'loading' | 'ready' | 'error';

const skillLabels: Record<string, string> = {
  reading: 'Reading',
  listening: 'Listening',
  writing: 'Writing',
  speaking: 'Speaking',
};

const skillOrder = ['reading', 'listening', 'writing', 'speaking'];

type WritingSubmissionDetail = {
  attemptId: string;
  wordCount: number | null;
  submittedAt: string | null;
  reviewStatus: string | null;
  sampleAnswer: string | null;
  taskType: string | null;
};

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
  const [writingDetailsByItemId, setWritingDetailsByItemId] = useState<Record<string, WritingSubmissionDetail | null>>({});
  const [loadingWritingDetailItemId, setLoadingWritingDetailItemId] = useState<string | null>(null);

  const loadWritingSubmissionDetail = async (itemId: string, attemptId: string) => {
    if (writingDetailsByItemId[itemId]) return;
    setLoadingWritingDetailItemId(itemId);
    try {
      const { data: attempt, error: attemptError } = await supabase
        .from('ielts_writing_attempts')
        .select('id, task_id, word_count, submitted_at, review_status')
        .eq('id', attemptId)
        .single();
      if (attemptError || !attempt) throw attemptError ?? new Error('Attempt not found');

      const { data: task, error: taskError } = await supabase
        .from('ielts_writing_tasks')
        .select('sample_answer, task_type')
        .eq('id', attempt.task_id)
        .single();
      if (taskError) throw taskError;

      setWritingDetailsByItemId((current) => ({
        ...current,
        [itemId]: {
          attemptId,
          wordCount: attempt.word_count ?? null,
          submittedAt: attempt.submitted_at ?? null,
          reviewStatus: attempt.review_status ?? null,
          sampleAnswer: task?.sample_answer ?? null,
          taskType: task?.task_type ?? null,
        },
      }));
    } catch {
      setWritingDetailsByItemId((current) => ({ ...current, [itemId]: null }));
    } finally {
      setLoadingWritingDetailItemId(null);
    }
  };

  const loadAssignments = async () => {
    setLoadState('loading');
    setError(null);
    try {
      const rows = await rpcIeltsPracticeStudentAssignments();
      setAssignments(rows);
      setLoadState('ready');
      const progressRows = await Promise.allSettled(rows.map((assignment) => rpcIeltsPracticeAssignmentProgress(assignment.id)));
      const progressById = progressRows.reduce<Record<string, IeltsPracticeAssignmentProgress>>((acc, result) => {
        if (result.status === 'fulfilled') {
          acc[result.value.assignment_id] = result.value;
        }
        return acc;
      }, {});
      setAssignmentProgressById(progressById);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load assigned IELTS practice.');
      setLoadState('error');
    }
  };

  useEffect(() => {
    void loadAssignments();
  }, []);

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

  return (
    <div data-testid="ielts-assigned-practice-page" style={{ minHeight: '100vh', background: '#f8fafc', color: '#0f172a', padding: '1rem', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: '64rem', margin: '0 auto' }}>

        {/* Back */}
        <button
          type="button"
          onClick={() => navigate('/ielts')}
          style={{ marginBottom: '1rem', color: '#0891b2', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.875rem', padding: '0.25rem 0' }}
        >
          ← Back to IELTS Home
        </button>

        {/* Header */}
        <header style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '1rem', padding: '1.25rem', marginBottom: '1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <p style={{ margin: '0 0 0.35rem', color: '#0891b2', textTransform: 'uppercase', letterSpacing: '0.16em', fontSize: '0.65rem', fontWeight: 800 }}>SCHOOL IELTS PRACTICE</p>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, color: '#0f172a' }}>Assigned Practice</h1>
          <p style={{ margin: '0.5rem 0 0', color: '#64748b', lineHeight: 1.6, fontSize: '0.82rem' }}>
            IELTS practice assigned by your school or teacher. Clear item states help you pick up exactly where you left off.
          </p>
        </header>

        {/* Error */}
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '0.875rem', borderRadius: '0.75rem', marginBottom: '1rem', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        {/* Loading */}
        {loadState === 'loading' && (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.75rem', padding: '1rem', color: '#64748b', fontSize: '0.875rem' }}>
            Loading assigned IELTS practice…
          </div>
        )}

        {/* Load error */}
        {loadState === 'error' && (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.75rem', padding: '1rem' }}>
            <p style={{ margin: '0 0 0.75rem', color: '#64748b' }}>We could not load your assigned practice.</p>
            <button type="button" onClick={() => void loadAssignments()} style={{ background: '#0891b2', color: '#ffffff', border: 'none', borderRadius: '0.5rem', padding: '0.55rem 1rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.875rem' }}>
              Try again
            </button>
          </div>
        )}

        {/* Empty */}
        {loadState === 'ready' && sortedAssignments.length === 0 && (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.75rem', padding: '1.25rem', color: '#64748b', fontSize: '0.875rem', lineHeight: 1.6 }}>
            No IELTS practice has been assigned yet. Assignments complete automatically after all required items are finished, and closed assignments are read-only.
          </div>
        )}

        {/* Assignment cards */}
        {loadState === 'ready' && sortedAssignments.map((assignment) => {
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
            <article key={assignment.id} data-testid={`ielts-assigned-assignment-${assignment.id}`} style={{ background: '#ffffff', border: `1px solid ${isOverdue ? '#fca5a5' : '#e2e8f0'}`, borderRadius: '1rem', padding: '1rem', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>

              {/* Assignment header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}>
                  <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>{assignment.title}</h2>
                  {assignment.description && <p style={{ margin: '0.35rem 0 0', color: '#64748b', lineHeight: 1.5, fontSize: '0.82rem' }}>{assignment.description}</p>}
                </div>
                <span style={{ background: lightBadge.bg, color: lightBadge.color, border: `1px solid ${lightBadge.border}`, borderRadius: '9999px', padding: '0.3rem 0.7rem', fontSize: '0.68rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
                  {badge.label}
                </span>
              </div>

              {/* Meta */}
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.65rem', color: '#94a3b8', fontSize: '0.8rem' }}>
                <span>Due: <strong style={{ color: isOverdue ? '#dc2626' : '#475569' }}>{formatDueDate(assignment.due_at)}</strong></span>
                <span>Items: <strong style={{ color: '#475569' }}>{assignment.item_count ?? assignment.items?.length ?? 0}</strong></span>
                <span>Status: <strong style={{ color: '#475569' }}>{(assignment.status === 'closed' && assignment.student_status !== 'completed' ? 'closed' : assignment.student_status).replace(/_/g, ' ')}</strong></span>
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
                onClick={() => setExpandedAssignments((current) => ({ ...current, [assignment.id]: !isExpanded }))}
                style={{ marginTop: '0.75rem', background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: '0.5rem', padding: '0.45rem 0.75rem', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer' }}
              >
                {isExpanded ? 'Hide submission details' : 'View submission details'}
              </button>

              {/* Skill sections */}
              {isExpanded && <div style={{ marginTop: '0.85rem' }}>
                {visibleSkills.length === 0 && (
                    <div data-testid={`ielts-assigned-no-items-${assignment.id}`} style={{ border: '1px dashed #cbd5e1', background: '#f8fafc', borderRadius: '0.75rem', padding: '0.875rem', color: '#94a3b8', fontSize: '0.82rem', fontWeight: 700 }}>
                    This assignment has no items yet. Ask your teacher to add practice content.
                  </div>
                )}

                {visibleSkills.map((skill) => (
                  <section key={skill} style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem', marginTop: '0.75rem' }}>
                    <h3 style={{ margin: '0 0 0.5rem', color: '#0891b2', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 800 }}>{skillLabels[skill] ?? skill}</h3>
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
                                <p style={{ margin: 0, fontWeight: 700, color: '#0f172a', fontSize: '0.875rem' }}>{item.title || `${skillLabels[skill] ?? skill} practice`}</p>
                                <AssignmentItemStatusBadge status={itemStatus} />
                              </div>
                              <p style={{ margin: '0.2rem 0 0', color: '#94a3b8', fontSize: '0.75rem' }}>{item.required ? 'Required' : 'Optional'}</p>
                            </div>
                            {route && assignedRoute ? (
                              isClosedReadOnly ? (
                                <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', borderRadius: '0.5rem', padding: '0.45rem 0.75rem', fontWeight: 800, fontSize: '0.75rem' }}>
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
                                        style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac', borderRadius: '0.5rem', padding: '0.45rem 0.75rem', fontWeight: 800, textDecoration: 'none', fontSize: '0.75rem' }}
                                      >
                                        {skill === 'reading' || skill === 'listening' ? 'View result →' : 'View feedback →'}
                                      </a>
                                    );
                                  }
                                  const unavailableCopy = skill === 'reading' || skill === 'listening'
                                    ? '✓ Completed · Result not available yet'
                                    : skill === 'writing' || skill === 'speaking'
                                      ? '✓ Completed · Feedback not finalized yet'
                                      : 'Complete task first';
                                  return (
                                    <span style={{ background: '#f8fafc', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '0.5rem', padding: '0.45rem 0.75rem', fontWeight: 800, fontSize: '0.75rem' }}>
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
                                  style={{ background: itemStatus === 'in_progress' ? '#dbeafe' : '#eff6ff', color: itemStatus === 'in_progress' ? '#1d4ed8' : '#0891b2', border: `1px solid ${itemStatus === 'in_progress' ? '#93c5fd' : '#bfdbfe'}`, borderRadius: '0.5rem', padding: '0.45rem 0.85rem', fontWeight: 800, textDecoration: 'none', fontSize: '0.8rem', opacity: isBusy ? 0.65 : 1, pointerEvents: isBusy ? 'none' : 'auto' }}
                                >
                                  {itemStatus === 'in_progress' ? 'Continue →' : 'Open →'}
                                </a>
                              )
                            ) : (
                              <span style={{ color: '#cbd5e1', fontSize: '0.75rem' }}>Unavailable</span>
                            )}

                            {item.skill === 'writing' && itemStatus === 'completed' && itemProgress?.practice_attempt_id && (
                              <div style={{ width: '100%', marginTop: '0.35rem' }}>
                                <button
                                  type="button"
                                  onClick={() => void loadWritingSubmissionDetail(item.id, itemProgress.practice_attempt_id as string)}
                                  style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b', borderRadius: '0.5rem', padding: '0.4rem 0.7rem', fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer' }}
                                >
                                  View submission details
                                </button>
                                {loadingWritingDetailItemId === item.id && (
                                  <p style={{ margin: '0.5rem 0 0', color: '#64748b', fontSize: '0.75rem' }}>Loading submission details…</p>
                                )}
                                {writingDetailsByItemId[item.id] && (
                                  <div style={{ marginTop: '0.6rem', border: '1px solid #bfdbfe', background: '#eff6ff', borderRadius: '0.6rem', padding: '0.75rem' }}>
                                    <p style={{ margin: 0, color: '#1e3a8a', fontWeight: 700, fontSize: '0.8rem' }}>Teacher feedback will appear here after finalization.</p>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.6rem', marginTop: '0.65rem' }}>
                                      <div style={{ background: '#fff', borderRadius: '0.5rem', padding: '0.6rem' }}><div style={{ fontSize: '0.7rem', color: '#64748b' }}>Word Count</div><div style={{ fontWeight: 800, color: '#b45309' }}>{writingDetailsByItemId[item.id]?.wordCount ?? '--'}</div></div>
                                      <div style={{ background: '#fff', borderRadius: '0.5rem', padding: '0.6rem' }}><div style={{ fontSize: '0.7rem', color: '#64748b' }}>Review Status</div><div style={{ fontWeight: 800, color: '#0f766e' }}>{writingDetailsByItemId[item.id]?.reviewStatus ?? 'pending'}</div></div>
                                    </div>
                                    {writingDetailsByItemId[item.id]?.sampleAnswer ? (
                                      <details style={{ marginTop: '0.7rem' }}>
                                        <summary style={{ cursor: 'pointer', color: '#92400e', fontWeight: 800 }}>📝 View Sample Answer (Band 8+)</summary>
                                        <div style={{ marginTop: '0.5rem', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '0.5rem', padding: '0.65rem', color: '#78350f', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                                          {writingDetailsByItemId[item.id]?.sampleAnswer}
                                        </div>
                                      </details>
                                    ) : null}
                                  </div>
                                )}
                              </div>
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
              ) : assignment.student_status !== 'completed' && (
                <div style={{ marginTop: '0.85rem', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', borderRadius: '0.65rem', padding: '0.75rem', fontSize: '0.8rem', fontWeight: 700 }}>
                  Assignment completes automatically after all required items are finished.
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );

};

export default IeltsAssignedPractice;
