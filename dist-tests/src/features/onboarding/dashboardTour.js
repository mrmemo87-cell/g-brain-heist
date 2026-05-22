import { isLearnerSegment } from './ftueTakeover.js';
export const DASHBOARD_TOUR_STEPS = [
    'base_unlocked',
    'profile_progress',
    'xp_rewards',
    'first_mission',
];
export const isDashboardTourStep = (value) => (typeof value === 'string' && DASHBOARD_TOUR_STEPS.includes(value));
export const getDashboardTourMetadata = (state) => {
    const raw = state?.metadata?.['dashboard_tour'];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        return {};
    const data = raw;
    return {
        status: typeof data['status'] === 'string' ? data['status'] : undefined,
        current_step: isDashboardTourStep(data['current_step']) ? data['current_step'] : undefined,
        completed_steps: Array.isArray(data['completed_steps'])
            ? data['completed_steps'].filter(isDashboardTourStep)
            : undefined,
        started_at: typeof data['started_at'] === 'string' ? data['started_at'] : undefined,
        completed_at: typeof data['completed_at'] === 'string' ? data['completed_at'] : undefined,
        skipped_at: typeof data['skipped_at'] === 'string' ? data['skipped_at'] : undefined,
        first_mission_cta_clicked: typeof data['first_mission_cta_clicked'] === 'boolean' ? data['first_mission_cta_clicked'] : undefined,
    };
};
export const getInitialDashboardTourStep = (metadata) => {
    if (isDashboardTourStep(metadata['current_step']))
        return metadata['current_step'];
    const completed = new Set(metadata['completed_steps'] ?? []);
    return DASHBOARD_TOUR_STEPS.find((step) => !completed.has(step)) ?? 'first_mission';
};
export const getNextDashboardTourStep = (step) => {
    const index = DASHBOARD_TOUR_STEPS.indexOf(step);
    return DASHBOARD_TOUR_STEPS[index + 1] ?? 'complete';
};
export const appendDashboardTourCompletedStep = (completedSteps, step) => Array.from(new Set([...(completedSteps ?? []), step]));
export const shouldShowDashboardTour = ({ profile, state, ftueEnabled, }) => {
    if (!ftueEnabled)
        return false;
    if (!profile || (profile.role && profile.role !== 'student'))
        return false;
    if (!state || !isLearnerSegment(state.segment ?? undefined))
        return false;
    if (!state.core_completed_at)
        return false;
    if (state.metadata?.['skipped'] === true)
        return false;
    const tour = getDashboardTourMetadata(state);
    return tour.status !== 'completed' && tour.status !== 'skipped';
};
