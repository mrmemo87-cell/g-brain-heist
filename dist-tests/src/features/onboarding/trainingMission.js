export const FTUE_TRAINING_MISSION_ID = 'first_signal';
const isRecord = (value) => (Boolean(value) && typeof value === 'object' && !Array.isArray(value));
export const getTrainingMissionMetadata = (state) => {
    const raw = state?.metadata?.['ftue_training_mission'];
    if (!isRecord(raw))
        return {};
    return {
        id: typeof raw['id'] === 'string' ? raw['id'] : undefined,
        status: typeof raw['status'] === 'string' ? raw['status'] : undefined,
        started_at: typeof raw['started_at'] === 'string' ? raw['started_at'] : undefined,
        completed_at: typeof raw['completed_at'] === 'string' ? raw['completed_at'] : undefined,
        skipped_at: typeof raw['skipped_at'] === 'string' ? raw['skipped_at'] : undefined,
        last_question_index: typeof raw['last_question_index'] === 'number' ? raw['last_question_index'] : undefined,
    };
};
export const shouldLaunchFtueTrainingMission = (state) => {
    if (!state || state.metadata?.['skipped'])
        return false;
    const training = getTrainingMissionMetadata(state);
    if (training.status === 'completed' || training.status === 'skipped')
        return false;
    if (training.status === 'started')
        return true;
    const dashboardTour = state.metadata?.['dashboard_tour'];
    if (!isRecord(dashboardTour))
        return false;
    return dashboardTour['first_mission_cta_clicked'] === true;
};
