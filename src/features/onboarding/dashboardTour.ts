import type { Profile } from '../../../types';
import type { OnboardingState } from './onboardingTypes';
import { isLearnerSegment } from './ftueTakeover.js';

export type DashboardTourStatus = 'not_started' | 'active' | 'completed' | 'skipped';

export type DashboardTourStep =
  | 'base_unlocked'
  | 'profile_progress'
  | 'xp_rewards'
  | 'navigation'
  | 'first_mission';

export interface DashboardTourMetadata {
  status?: DashboardTourStatus;
  current_step?: DashboardTourStep;
  completed_steps?: DashboardTourStep[];
  started_at?: string;
  completed_at?: string;
  skipped_at?: string;
  first_mission_cta_clicked?: boolean;
}

export const DASHBOARD_TOUR_STEPS: DashboardTourStep[] = [
  'base_unlocked',
  'profile_progress',
  'xp_rewards',
  'navigation',
  'first_mission',
];

export const isDashboardTourStep = (value: unknown): value is DashboardTourStep => (
  typeof value === 'string' && (DASHBOARD_TOUR_STEPS as string[]).includes(value)
);

export const getDashboardTourMetadata = (state?: OnboardingState | null): DashboardTourMetadata => {
  const raw = state?.metadata?.['dashboard_tour'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const data = raw as Record<string, unknown>;
  return {
    status: typeof data['status'] === 'string' ? data['status'] as DashboardTourStatus : undefined,
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

export const getInitialDashboardTourStep = (metadata: DashboardTourMetadata): DashboardTourStep => {
  const completed = new Set(metadata['completed_steps'] ?? []);
  const currentStep = metadata['current_step'];
  // Active tours created before the navigation step was introduced should
  // receive that guidance before their final mission rather than silently
  // skipping the new dashboard map.
  if (isDashboardTourStep(currentStep)) {
    const navigationIndex = DASHBOARD_TOUR_STEPS.indexOf('navigation');
    if (!completed.has('navigation') && DASHBOARD_TOUR_STEPS.indexOf(currentStep) > navigationIndex) {
      return 'navigation';
    }
    return currentStep;
  }
  return DASHBOARD_TOUR_STEPS.find((step) => !completed.has(step)) ?? 'first_mission';
};

export const getNextDashboardTourStep = (step: DashboardTourStep): DashboardTourStep | 'complete' => {
  const index = DASHBOARD_TOUR_STEPS.indexOf(step);
  return DASHBOARD_TOUR_STEPS[index + 1] ?? 'complete';
};

export const appendDashboardTourCompletedStep = (
  completedSteps: DashboardTourStep[] | undefined,
  step: DashboardTourStep,
): DashboardTourStep[] => Array.from(new Set([...(completedSteps ?? []), step]));

export const shouldShowDashboardTour = ({
  profile,
  state,
  ftueEnabled,
}: {
  profile?: Partial<Profile> | null;
  state?: OnboardingState | null;
  ftueEnabled: boolean;
}): boolean => {
  if (!ftueEnabled) return false;
  if (!profile || (profile.role && profile.role !== 'student')) return false;
  if (!state || !isLearnerSegment(state.segment ?? undefined)) return false;
  if (!state.core_completed_at) return false;
  if (state.metadata?.['skipped'] === true) return false;

  const tour = getDashboardTourMetadata(state);
  return tour.status !== 'completed' && tour.status !== 'skipped';
};
