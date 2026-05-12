import type { OnboardingState } from './onboardingTypes';

export const FTUE_TRAINING_MISSION_ID = 'first_signal';

type TrainingMissionStatus = 'not_started' | 'started' | 'completed' | 'skipped';

export interface TrainingMissionMetadata {
  id?: string;
  status?: TrainingMissionStatus;
  started_at?: string;
  completed_at?: string;
  skipped_at?: string;
  last_question_index?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

export const getTrainingMissionMetadata = (state?: OnboardingState | null): TrainingMissionMetadata => {
  const raw = state?.metadata?.['ftue_training_mission'];
  if (!isRecord(raw)) return {};
  return {
    id: typeof raw['id'] === 'string' ? raw['id'] : undefined,
    status: typeof raw['status'] === 'string' ? raw['status'] as TrainingMissionStatus : undefined,
    started_at: typeof raw['started_at'] === 'string' ? raw['started_at'] : undefined,
    completed_at: typeof raw['completed_at'] === 'string' ? raw['completed_at'] : undefined,
    skipped_at: typeof raw['skipped_at'] === 'string' ? raw['skipped_at'] : undefined,
    last_question_index: typeof raw['last_question_index'] === 'number' ? raw['last_question_index'] : undefined,
  };
};

export const shouldLaunchFtueTrainingMission = (state?: OnboardingState | null): boolean => {
  if (!state || state.metadata?.['skipped']) return false;

  const training = getTrainingMissionMetadata(state);
  if (training.status === 'completed' || training.status === 'skipped') return false;
  if (training.status === 'started') return true;

  const dashboardTour = state.metadata?.['dashboard_tour'];
  if (!isRecord(dashboardTour)) return false;

  return dashboardTour['first_mission_cta_clicked'] === true;
};
