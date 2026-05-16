import type { CSSProperties } from 'react';
import type { IeltsPracticeAssignmentProgress } from '../../../services/ieltsPracticeAssignmentService';

export interface IeltsPracticeAssignmentContext {
  assignmentId: string | null;
  assignmentItemId: string | null;
  assignmentItemCount: number;
  isAssignedPractice: boolean;
}

export const readIeltsPracticeAssignmentContext = (search = typeof window === 'undefined' ? '' : window.location.search): IeltsPracticeAssignmentContext => {
  const assignmentSearchParams = new URLSearchParams(search);
  const assignmentId = assignmentSearchParams.get('assignment_id');
  const assignmentItemId = assignmentSearchParams.get('assignment_item_id');
  const assignmentItemCountParam = Number(assignmentSearchParams.get('assignment_item_count') ?? 0);

  return {
    assignmentId,
    assignmentItemId,
    assignmentItemCount: Number.isFinite(assignmentItemCountParam) ? assignmentItemCountParam : 0,
    isAssignedPractice: Boolean(assignmentId && assignmentItemId),
  };
};

export interface AssignmentCompletionStatusProps {
  context: IeltsPracticeAssignmentContext;
  progress: IeltsPracticeAssignmentProgress | null;
  completionError: string | null;
  style?: CSSProperties;
}

export const getAssignmentCompletionStatus = (
  context: IeltsPracticeAssignmentContext,
  progress: IeltsPracticeAssignmentProgress | null,
) => {
  const completedCount = progress?.completed_required_count ?? progress?.completed_item_count ?? 0;
  const totalCount = progress?.required_count || progress?.item_count || context.assignmentItemCount || 1;
  const allItemsComplete = Boolean(
    progress?.student_status === 'completed'
    || progress?.all_required_completed
    || (progress?.required_count && progress.completed_required_count === progress.required_count)
  );

  return { completedCount, totalCount, allItemsComplete };
};

export const AssignmentCompletionStatus = ({
  context,
  progress,
  completionError,
  style,
}: AssignmentCompletionStatusProps) => {
  if (!context.isAssignedPractice) {
    return null;
  }

  const { completedCount, totalCount, allItemsComplete } = getAssignmentCompletionStatus(context, progress);

  return (
    <div style={{
      background: allItemsComplete ? '#dcfce7' : '#eff6ff',
      border: `1px solid ${allItemsComplete ? '#86efac' : '#93c5fd'}`,
      borderRadius: '0.75rem',
      padding: 'clamp(1rem, 3vw, 1.25rem)',
      marginBottom: '1.5rem',
      color: allItemsComplete ? '#166534' : '#1e40af',
      textAlign: 'left',
      ...style,
    }}>
      <h2 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 800 }}>
        {completionError ? 'Assignment item needs attention' : 'Assignment item completed'}
      </h2>
      <p style={{ margin: 0, fontWeight: 700 }}>
        {completedCount} of {totalCount} assignment items completed
      </p>
      {allItemsComplete && (
        <p style={{ margin: '0.5rem 0 0', fontWeight: 800 }}>
          School assignment completed
        </p>
      )}
      {completionError && (
        <p style={{ margin: '0.75rem 0 0', color: '#92400e', fontSize: '0.875rem' }}>
          Your practice result was saved, but assignment item completion could not be confirmed: {completionError}
        </p>
      )}
    </div>
  );
};
