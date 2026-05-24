import type { CSSProperties } from 'react';
import type { IeltsPracticeAssignmentProgress } from '../../../services/ieltsPracticeAssignmentService';
import {
  buildNextAssignmentItemRoute,
  getAssignmentProgressSummaryFromProgress,
  type AssignmentProgressSummary,
} from '../../../services/ieltsAssignmentUx';

export interface IeltsPracticeAssignmentContext {
  assignmentId: string | null;
  assignmentItemId: string | null;
  assignmentItemCount: number;
  assignmentTitle: string | null;
  assignmentDueAt: string | null;
  isAssignedPractice: boolean;
}

export const readIeltsPracticeAssignmentContext = (search = typeof window === 'undefined' ? '' : window.location.search): IeltsPracticeAssignmentContext => {
  const assignmentSearchParams = new URLSearchParams(search);
  const assignmentId = assignmentSearchParams.get('assignment_id') ?? assignmentSearchParams.get('assignmentId');
  const assignmentItemId = assignmentSearchParams.get('assignment_item_id') ?? assignmentSearchParams.get('assignmentItemId');
  const assignmentItemCountParam = Number(
    assignmentSearchParams.get('assignment_item_count')
    ?? assignmentSearchParams.get('assignmentItemCount')
    ?? 0,
  );

  return {
    assignmentId,
    assignmentItemId,
    assignmentItemCount: Number.isFinite(assignmentItemCountParam) ? assignmentItemCountParam : 0,
    assignmentTitle: assignmentSearchParams.get('assignment_title') ?? assignmentSearchParams.get('assignmentTitle'),
    assignmentDueAt: assignmentSearchParams.get('assignment_due_at') ?? assignmentSearchParams.get('assignmentDueAt'),
    isAssignedPractice: Boolean(assignmentId && assignmentItemId),
  };
};

export const formatAssignmentDueDate = (dueAt: string | null | undefined): string | null => {
  if (!dueAt) return null;
  const parsed = new Date(dueAt);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

export interface AssignmentProgressBarProps {
  summary: AssignmentProgressSummary;
  label?: string;
  style?: CSSProperties;
  testId?: string;
}

export const AssignmentProgressBar = ({ summary, label, style, testId }: AssignmentProgressBarProps) => (
  <div style={style} data-testid={testId}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.4rem', fontSize: '0.875rem', fontWeight: 800 }}>
      <span>{label ?? `${summary.completedCount} of ${summary.totalCount} completed`}</span>
      <span>{summary.percentage}%</span>
    </div>
    <div
      data-testid={testId ? `${testId}-bar` : undefined}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={summary.percentage}
      aria-label={label ?? 'Assignment progress'}
      style={{ height: '0.6rem', borderRadius: '9999px', backgroundColor: '#e2e8f0', overflow: 'hidden' }}
    >
      <div style={{ width: `${summary.percentage}%`, height: '100%', borderRadius: '9999px', background: summary.allItemsComplete ? 'linear-gradient(90deg, #22c55e, #16a34a)' : 'linear-gradient(90deg, #3b82f6, #2563eb)' }} />
    </div>
  </div>
);

export type AssignmentItemStatus = 'assigned' | 'in_progress' | 'completed';

const itemBadgeStyles: Record<AssignmentItemStatus, { label: string; background: string; border: string; color: string }> = {
  assigned: { label: 'Assigned', background: '#f8fafc', border: '#cbd5e1', color: '#475569' },
  in_progress: { label: 'In progress', background: '#eff6ff', border: '#93c5fd', color: '#1d4ed8' },
  completed: { label: '✓ Completed', background: '#dcfce7', border: '#86efac', color: '#166534' },
};

export const AssignmentItemStatusBadge = ({ status }: { status: AssignmentItemStatus }) => {
  const badge = itemBadgeStyles[status];
  return (
    <span style={{ backgroundColor: badge.background, border: `1px solid ${badge.border}`, color: badge.color, borderRadius: '9999px', padding: '0.3rem 0.65rem', fontSize: '0.75rem', fontWeight: 900, whiteSpace: 'nowrap' }}>
      {badge.label}
    </span>
  );
};

export interface AssignmentCompletionStatusProps {
  context: IeltsPracticeAssignmentContext;
  progress: IeltsPracticeAssignmentProgress | null;
  completionError: string | null;
  submissionNotice?: string | null;
  onNavigate?: (route: string) => void;
  style?: CSSProperties;
  testId?: string;
}

export const getAssignmentCompletionStatus = (
  context: IeltsPracticeAssignmentContext,
  progress: IeltsPracticeAssignmentProgress | null,
) => getAssignmentProgressSummaryFromProgress(progress, context.assignmentItemCount || 1);

export const AssignmentCompletionStatus = ({
  context,
  progress,
  completionError,
  submissionNotice,
  onNavigate,
  style,
}: AssignmentCompletionStatusProps) => {
  if (!context.isAssignedPractice) {
    return null;
  }

  const summary = getAssignmentCompletionStatus(context, progress);
  const dueDate = formatAssignmentDueDate(context.assignmentDueAt);
  const nextItemRoute = buildNextAssignmentItemRoute(progress, context.assignmentItemId, {
    assignmentTitle: context.assignmentTitle,
    assignmentDueAt: context.assignmentDueAt,
    assignmentItemCount: summary.totalCount,
  });

  return (
    <div data-testid="assignment-completion-status" style={{
      background: summary.allItemsComplete ? '#dcfce7' : '#eff6ff',
      border: `1px solid ${summary.allItemsComplete ? '#86efac' : '#93c5fd'}`,
      borderRadius: '0.75rem',
      padding: 'clamp(1rem, 3vw, 1.25rem)',
      marginBottom: '1.5rem',
      color: summary.allItemsComplete ? '#166534' : '#1e40af',
      textAlign: 'left',
      ...style,
    }}>
      <p style={{ margin: '0 0 0.35rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.75rem', fontWeight: 900 }}>
        School Assignment Progress
      </p>
      {context.assignmentTitle && (
        <h2 style={{ margin: '0 0 0.35rem', fontSize: '1.125rem', fontWeight: 900, color: summary.allItemsComplete ? '#14532d' : '#1e3a8a' }}>
          {context.assignmentTitle}
        </h2>
      )}
      {dueDate && (
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', fontWeight: 700 }}>
          Due: {dueDate}
        </p>
      )}
      <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 800 }}>
        {(completionError || submissionNotice) ? 'Assignment item needs attention' : summary.allItemsComplete ? 'Assignment item completed' : 'Assignment item submitted'}
      </h3>
      <AssignmentProgressBar summary={summary} label={`${summary.completedCount} of ${summary.totalCount} assignment items completed`} style={{ marginBottom: '0.75rem' }} />
      {summary.allItemsComplete && (
        <p style={{ margin: '0.5rem 0 0', fontWeight: 900 }}>
          School assignment completed
        </p>
      )}
      {completionError && (
        <p style={{ margin: '0.75rem 0 0', color: '#92400e', fontSize: '0.875rem' }}>
          Your practice result was saved, but assignment item completion could not be confirmed: {completionError}
        </p>
      )}
      {submissionNotice && !completionError && (
        <p style={{ margin: '0.75rem 0 0', color: '#92400e', fontSize: '0.875rem', fontWeight: 700 }}>
          {submissionNotice}
        </p>
      )}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
        {nextItemRoute && !completionError && (
          <button
            type="button"
            data-testid="assignment-completion-next-item"
            onClick={() => onNavigate?.(nextItemRoute)}
            style={{ background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '0.5rem', padding: '0.65rem 1rem', fontWeight: 900, cursor: 'pointer' }}
          >
            Continue to next assignment item
          </button>
        )}
        <button
          type="button"
          data-testid="assignment-completion-back-to-assigned"
          onClick={() => onNavigate?.('/ielts/practice/assigned')}
          style={{ background: '#ffffff', color: '#1e40af', border: '1px solid #93c5fd', borderRadius: '0.5rem', padding: '0.65rem 1rem', fontWeight: 900, cursor: 'pointer' }}
        >
          Back to assigned practice
        </button>
      </div>
    </div>
  );
};
