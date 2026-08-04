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
    && reviewAttempt.length > 0
    && reviewAttempt.length <= 200
      ? { skill: reviewSkill, attemptId: reviewAttempt }
      : null;
  const requestedMonitorExamId = params.get('monitorExam')?.trim() ?? '';
  const monitorExamId = adminTab === 'ielts'
    && ieltsTab === 'ielts-exams'
    && UUID_PATTERN.test(requestedMonitorExamId)
      ? requestedMonitorExamId
      : null;

  return { adminTab, ieltsTab, review, monitorExamId };
}

export function buildSchoolAdminNavigationUrl(
  state: SchoolAdminNavigationState,
  currentUrl: string,
): string {
  const url = new URL(currentUrl, 'https://brainsheist.invalid');
  url.searchParams.set('view', 'school_admin');
  url.searchParams.set('adminTab', state.adminTab);

  if (state.adminTab === 'ielts') {
    url.searchParams.set('ieltsTab', state.ieltsTab);
    if (state.ieltsTab === 'ielts-reviews' && state.review) {
      url.searchParams.set('reviewSkill', state.review.skill);
      url.searchParams.set('reviewAttempt', state.review.attemptId);
    } else {
      url.searchParams.delete('reviewSkill');
      url.searchParams.delete('reviewAttempt');
    }
    if (state.ieltsTab === 'ielts-exams' && state.monitorExamId) {
      url.searchParams.set('monitorExam', state.monitorExamId);
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
