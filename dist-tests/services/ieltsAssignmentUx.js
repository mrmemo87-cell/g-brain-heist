import { getIeltsPracticeItemRoute, } from './ieltsPracticeAssignmentService.js';
const clampPercentage = (value) => Math.max(0, Math.min(100, Math.round(value)));
export const getAssignmentProgressSummary = (params) => {
    const totalCount = Math.max(0, params.totalCount ?? 0);
    const requestedCompletedCount = params.completedCount ?? 0;
    const completedCount = Math.max(0, Math.min(requestedCompletedCount, totalCount || requestedCompletedCount));
    const percentage = totalCount > 0 ? clampPercentage((completedCount / totalCount) * 100) : 0;
    return {
        completedCount,
        totalCount,
        percentage,
        allItemsComplete: Boolean(params.allItemsComplete ?? (totalCount > 0 && completedCount >= totalCount)),
    };
};
export const getAssignmentProgressSummaryFromProgress = (progress, fallbackTotalCount = 0) => {
    const completedCount = progress?.completed_required_count ?? progress?.completed_item_count ?? 0;
    const totalCount = progress?.required_count || progress?.item_count || fallbackTotalCount || 0;
    const allItemsComplete = Boolean(progress?.student_status === 'completed'
        || progress?.all_required_completed
        || (progress?.required_count && progress.completed_required_count === progress.required_count)
        || (totalCount > 0 && completedCount >= totalCount));
    return getAssignmentProgressSummary({ completedCount, totalCount, allItemsComplete });
};
export const getAssignmentProgressSummaryFromAssignment = (assignment, progress) => {
    if (progress) {
        return getAssignmentProgressSummaryFromProgress(progress, assignment.item_count ?? assignment.items?.length ?? 0);
    }
    const totalCount = assignment.item_count ?? assignment.items?.length ?? 0;
    const completedFromItems = assignment.items?.filter((item) => getAssignmentItemVisualStatus(item, assignment) === 'completed').length;
    return getAssignmentProgressSummary({
        completedCount: assignment.student_status === 'completed' ? totalCount : completedFromItems ?? 0,
        totalCount,
        allItemsComplete: assignment.student_status === 'completed',
    });
};
export const getAssignmentItemVisualStatus = (item, assignment) => {
    const rawStatus = 'status' in item ? String(item.status ?? '') : '';
    if (rawStatus === 'completed')
        return 'completed';
    if (rawStatus === 'in_progress')
        return 'in_progress';
    return 'assigned';
};
export const buildAssignedPracticeRoute = (route, assignmentId, assignmentItemId, metadata = {}) => {
    const params = new URLSearchParams({
        assignment_id: assignmentId,
        assignment_item_id: assignmentItemId,
    });
    if (metadata.assignmentItemCount && metadata.assignmentItemCount > 0) {
        params.set('assignment_item_count', String(metadata.assignmentItemCount));
    }
    if (metadata.assignmentTitle) {
        params.set('assignment_title', metadata.assignmentTitle);
    }
    if (metadata.assignmentDueAt) {
        params.set('assignment_due_at', metadata.assignmentDueAt);
    }
    return `${route}?${params.toString()}`;
};
export const resolveNextIncompleteAssignmentItem = (progress, currentAssignmentItemId) => {
    const items = [...(progress?.items ?? [])].filter((item) => item.status !== 'completed');
    if (items.length === 0)
        return null;
    const currentItem = progress?.items?.find((item) => item.assignment_item_id === currentAssignmentItemId);
    const orderSortedItems = [...items].sort((a, b) => a.order_index - b.order_index);
    if (currentItem?.skill) {
        const sameSkillNext = orderSortedItems.find((item) => item.skill === currentItem.skill && item.assignment_item_id !== currentAssignmentItemId);
        if (sameSkillNext)
            return sameSkillNext;
    }
    return orderSortedItems.find((item) => item.assignment_item_id !== currentAssignmentItemId) ?? orderSortedItems[0] ?? null;
};
export const buildNextAssignmentItemRoute = (progress, currentAssignmentItemId, metadata = {}) => {
    const nextItem = resolveNextIncompleteAssignmentItem(progress, currentAssignmentItemId);
    if (!nextItem || !progress?.assignment_id)
        return null;
    const route = getIeltsPracticeItemRoute(nextItem);
    if (!route)
        return null;
    return buildAssignedPracticeRoute(route, progress.assignment_id, nextItem.assignment_item_id, {
        ...metadata,
        assignmentItemCount: metadata.assignmentItemCount ?? progress.item_count,
    });
};
