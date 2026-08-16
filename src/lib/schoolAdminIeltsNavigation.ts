export const SCHOOL_ADMIN_TABS = [
  'dashboard',
  'members',
  'teachers',
  'classes',
  'subjects',
  'documents',
  'settings',
  'billing',
  'cambridge',
  'ielts',
  'admissions',
  'academic-profiles',
  'interventions',
  'guardians',
] as const;

export const SCHOOL_ADMIN_IELTS_TABS = [
  'ielts-exams',
  'ielts-practice',
  'ielts-reviews',
  'ielts-results',
  'ielts-student-progress',
  'ielts-settings',
] as const;

export type SchoolAdminTab = (typeof SCHOOL_ADMIN_TABS)[number];
export type SchoolAdminIeltsTab = (typeof SCHOOL_ADMIN_IELTS_TABS)[number];
export type SchoolAdminIeltsReviewSkill = 'writing' | 'speaking';

export interface SchoolAdminNavigationState {
  adminTab: SchoolAdminTab;
  ieltsTab: SchoolAdminIeltsTab;
  review: { skill: SchoolAdminIeltsReviewSkill; attemptId: string } | null;
  monitorExamId: string | null;
}

const DEFAULT_STATE: SchoolAdminNavigationState = {
  adminTab: 'dashboard',
  ieltsTab: 'ielts-exams',
  review: null,
  monitorExamId: null,
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isValidSchoolAdminIeltsMonitorExamId = (value?: string | null): boolean => (
  UUID_PATTERN.test(value?.trim() ?? '')
);

export const isValidSchoolAdminIeltsRouteExamId = (value?: string | null): boolean => (
  UUID_V4_PATTERN.test(value?.trim() ?? '')
);

export const isValidSchoolAdminIeltsReviewAttemptId = (value?: string | null): boolean => {
  const normalized = value?.trim() ?? '';
  return normalized.length > 0 && normalized.length <= 200;
};

const isAdminTab = (value: string | null): value is SchoolAdminTab => (
  value !== null && (SCHOOL_ADMIN_TABS as readonly string[]).includes(value)
);

const isIeltsTab = (value: string | null): value is SchoolAdminIeltsTab => (
  value !== null && (SCHOOL_ADMIN_IELTS_TABS as readonly string[]).includes(value)
);

const isReviewSkill = (value: string | null): value is SchoolAdminIeltsReviewSkill => (
  value === 'writing' || value === 'speaking'
);

export function parseSchoolAdminNavigation(search: string): SchoolAdminNavigationState {
  const params = new URLSearchParams(search);
  const requestedAdminTab = params.get('adminTab');
  const requestedIeltsTab = params.get('ieltsTab');
  const adminTab = isAdminTab(requestedAdminTab) ? requestedAdminTab : DEFAULT_STATE.adminTab;
  const ieltsTab = isIeltsTab(requestedIeltsTab) ? requestedIeltsTab : DEFAULT_STATE.ieltsTab;
  const reviewSkill = params.get('reviewSkill');
  const reviewAttempt = params.get('reviewAttempt')?.trim() ?? '';
  const review = adminTab === 'ielts'
    && ieltsTab === 'ielts-reviews'
    && isReviewSkill(reviewSkill)
    && isValidSchoolAdminIeltsReviewAttemptId(reviewAttempt)
      ? { skill: reviewSkill, attemptId: reviewAttempt }
      : null;
  const requestedMonitorExamId = params.get('monitorExam')?.trim() ?? '';
  const monitorExamId = adminTab === 'ielts'
    && ieltsTab === 'ielts-exams'
    && isValidSchoolAdminIeltsMonitorExamId(requestedMonitorExamId)
      ? requestedMonitorExamId
      : null;

  return { adminTab, ieltsTab, review, monitorExamId };
}

export function buildSchoolAdminNavigationUrl(
  state: SchoolAdminNavigationState,
  currentUrl: string,
): string {
  const url = new URL(currentUrl, 'https://brainsheist.invalid');
  const reviewAttemptId = state.review?.attemptId.trim() ?? '';
  const monitorExamId = state.monitorExamId?.trim() ?? '';
  url.searchParams.set('view', 'school_admin');
  url.searchParams.set('adminTab', state.adminTab);

  if (state.adminTab === 'ielts') {
    url.searchParams.set('ieltsTab', state.ieltsTab);
    if (
      state.ieltsTab === 'ielts-reviews'
      && state.review
      && isValidSchoolAdminIeltsReviewAttemptId(reviewAttemptId)
    ) {
      url.searchParams.set('reviewSkill', state.review.skill);
      url.searchParams.set('reviewAttempt', reviewAttemptId);
    } else {
      url.searchParams.delete('reviewSkill');
      url.searchParams.delete('reviewAttempt');
    }
    if (
      state.ieltsTab === 'ielts-exams'
      && isValidSchoolAdminIeltsMonitorExamId(monitorExamId)
    ) {
      url.searchParams.set('monitorExam', monitorExamId);
    } else {
      url.searchParams.delete('monitorExam');
    }
  } else {
    url.searchParams.delete('ieltsTab');
    url.searchParams.delete('reviewSkill');
    url.searchParams.delete('reviewAttempt');
    url.searchParams.delete('monitorExam');
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export function schoolAdminIeltsUrl(
  ieltsTab: SchoolAdminIeltsTab,
  review?: { skill: SchoolAdminIeltsReviewSkill; attemptId: string } | null,
  monitorExamId?: string | null,
): string {
  return buildSchoolAdminNavigationUrl(
    { adminTab: 'ielts', ieltsTab, review: review ?? null, monitorExamId: monitorExamId ?? null },
    '/',
  );
}
