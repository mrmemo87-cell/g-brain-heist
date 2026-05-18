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

const getAssignmentBadge = (assignment: IeltsPracticeStudentAssignment) => {
  if (assignment.student_status === 'completed') {
    return { label: 'Completed', backgroundColor: '#dcfce7', color: '#166534' };
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
    <div data-testid="ielts-assigned-practice-page" style={{ minHeight: '100vh', backgroundColor: '#f8fafc', color: '#111827', padding: '1rem' }}>
      <div style={{ maxWidth: '64rem', margin: '0 auto' }}>
        <button
          type="button"
          onClick={() => navigate('/ielts')}
          style={{ marginBottom: '1rem', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
        >
          ← Back to IELTS Home
        </button>

        <header style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)', borderRadius: '1rem', padding: '1.5rem', color: '#ffffff', marginBottom: '1rem' }}>
          <p style={{ margin: '0 0 0.5rem', color: '#bfdbfe', textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: '0.75rem', fontWeight: 700 }}>School IELTS Practice</p>
          <h1 style={{ margin: 0, fontSize: '1.875rem', fontWeight: 800 }}>Assigned IELTS Practice</h1>
          <p style={{ margin: '0.75rem 0 0', color: '#dbeafe', lineHeight: 1.6 }}>
            Review IELTS practice assigned by your school or teacher. Clear item states and progress help you pick up exactly where you left off.
          </p>
        </header>

        {error && (
          <div style={{ backgroundColor: '#fee2e2', border: '1px solid #fecaca', color: '#991b1b', padding: '0.875rem', borderRadius: '0.75rem', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        {loadState === 'loading' && (
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1rem', color: '#64748b' }}>
            Loading assigned IELTS practice…
          </div>
        )}

        {loadState === 'error' && (
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1rem' }}>
            <p style={{ margin: '0 0 0.75rem', color: '#64748b' }}>We could not load your assigned practice.</p>
            <button type="button" onClick={() => void loadAssignments()} style={{ backgroundColor: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '0.5rem', padding: '0.625rem 1rem', cursor: 'pointer', fontWeight: 700 }}>
              Try again
            </button>
          </div>
        )}

        {loadState === 'ready' && sortedAssignments.length === 0 && (
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1.25rem', color: '#64748b' }}>
            No IELTS practice has been assigned yet.
          </div>
        )}

        {loadState === 'ready' && sortedAssignments.map((assignment) => {
          const groupedItems = groupItemsBySkill(assignment.items);
          const visibleSkills = [...skillOrder, ...Object.keys(groupedItems).filter((skill) => !skillOrder.includes(skill))]
            .filter((skill) => (groupedItems[skill] ?? []).length > 0);
          const badge = getAssignmentBadge(assignment);
          const isBusy = busyAssignmentId === assignment.id;
          const assignmentProgress = assignmentProgressById[assignment.id] ?? null;
          const progressSummary = getAssignmentProgressSummaryFromAssignment(assignment, assignmentProgress);
          const progressItemsById = new Map((assignmentProgress?.items ?? []).map((progressItem) => [progressItem.assignment_item_id, progressItem]));

          return (
            <article key={assignment.id} data-testid={`ielts-assigned-assignment-${assignment.id}`} style={{ backgroundColor: '#ffffff', border: isAssignmentOverdue(assignment) ? '1px solid #fca5a5' : '1px solid #e5e7eb', borderRadius: '1rem', padding: '1rem', marginBottom: '1rem', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#111827' }}>{assignment.title}</h2>
                  {assignment.description && <p style={{ margin: '0.5rem 0 0', color: '#475569', lineHeight: 1.5 }}>{assignment.description}</p>}
                </div>
                <span style={{ backgroundColor: badge.backgroundColor, color: badge.color, borderRadius: '9999px', padding: '0.35rem 0.75rem', fontSize: '0.75rem', fontWeight: 800 }}>
                  {badge.label}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.875rem', color: '#64748b', fontSize: '0.875rem' }}>
                <span>Due: <strong style={{ color: '#334155' }}>{formatDueDate(assignment.due_at)}</strong></span>
                <span>Items: <strong style={{ color: '#334155' }}>{assignment.item_count ?? assignment.items?.length ?? 0}</strong></span>
                <span>Status: <strong style={{ color: '#334155' }}>{assignment.student_status.replace(/_/g, ' ')}</strong></span>
              </div>

              <AssignmentProgressBar
                testId={`ielts-assigned-progress-${assignment.id}`}
                summary={progressSummary}
                label={`${progressSummary.completedCount} of ${progressSummary.totalCount} completed`}
                style={{ marginTop: '1rem', color: '#334155' }}
              />

              <div style={{ marginTop: '1rem' }}>
                {visibleSkills.map((skill) => (
                  <section key={skill} style={{ borderTop: '1px solid #e5e7eb', paddingTop: '0.875rem', marginTop: '0.875rem' }}>
                    <h3 style={{ margin: '0 0 0.5rem', color: '#1e40af', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{skillLabels[skill] ?? skill}</h3>
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      {(groupedItems[skill] ?? []).map((item) => {
                        const route = getIeltsPracticeItemRoute(item);
                        const assignedRoute = route ? buildAssignedPracticeRoute(route, assignment, item) : null;
                        const itemProgress = progressItemsById.get(item.id);
                        const itemStatus = getAssignmentItemVisualStatus(itemProgress ?? item, assignment);
                        const itemTone = itemStatus === 'completed'
                          ? { border: '#86efac', background: '#f0fdf4' }
                          : itemStatus === 'in_progress'
                            ? { border: '#93c5fd', background: '#eff6ff' }
                            : { border: '#e2e8f0', background: '#ffffff' };
                        return (
                          <div key={item.id} data-testid={`ielts-assigned-item-${item.id}`} data-status={itemStatus} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', border: `1px solid ${itemTone.border}`, backgroundColor: itemTone.background, borderRadius: '0.75rem', padding: '0.75rem', flexWrap: 'wrap' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <p style={{ margin: 0, fontWeight: 700, color: '#111827' }}>{item.title || `${skillLabels[skill] ?? skill} practice`}</p>
                                <AssignmentItemStatusBadge status={itemStatus} />
                              </div>
                              <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.8125rem' }}>{item.required ? 'Required' : 'Optional'}</p>
                            </div>
                            {route && assignedRoute ? (
                              itemStatus === 'completed' ? (
                                <span style={{ backgroundColor: '#dcfce7', color: '#166534', borderRadius: '0.5rem', padding: '0.55rem 0.875rem', fontWeight: 900 }}>
                                  ✓ Completed
                                </span>
                              ) : (
                                <a
                                  data-testid={`ielts-assigned-open-item-${item.id}`}
                                  href={assignedRoute}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    void handleOpenItem(assignment, item, route);
                                  }}
                                  style={{ backgroundColor: itemStatus === 'in_progress' ? '#1d4ed8' : '#2563eb', color: '#ffffff', borderRadius: '0.5rem', padding: '0.55rem 0.875rem', fontWeight: 800, textDecoration: 'none', opacity: isBusy ? 0.65 : 1, pointerEvents: isBusy ? 'none' : 'auto' }}
                                >
                                  Open
                                </a>
                              )
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: '0.8125rem' }}>Unavailable</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>

              {assignment.student_status !== 'completed' && (
                <div style={{ marginTop: '1rem', border: '1px solid #bfdbfe', backgroundColor: '#eff6ff', color: '#1e40af', borderRadius: '0.75rem', padding: '0.875rem', fontSize: '0.875rem', fontWeight: 700 }}>
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
