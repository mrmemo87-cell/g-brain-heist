// @ts-check
const { test, expect } = require('@playwright/test');

const now = '2026-05-18T08:00:00.000Z';

const ids = {
  school: 'school-smoke-1',
  class: 'class-smoke-1',
  admin: 'admin-smoke-1',
  student: 'student-smoke-1',
  assignment: 'assignment-smoke-1',
  readingItem: 'assignment-item-reading-1',
  listeningItem: 'assignment-item-listening-1',
  readingSet: 101,
};

const classRow = {
  id: ids.class,
  school_id: ids.school,
  class_code: 'IELTS-9A',
  class_name: 'IELTS Pilot 9A',
  grade_level: 9,
  is_active: true,
};

const school = {
  id: ids.school,
  name: 'IELTS Pilot Smoke School',
  slug: 'ielts-pilot-smoke-school',
  logo_url: null,
  settings: { allow_student_signup: true, allow_teacher_signup: true },
  invite_code: 'SMOKE1',
};

const adminProfile = {
  id: ids.admin,
  username: 'Smoke Admin',
  email: 'admin-smoke@example.test',
  role: 'school_admin',
  school_id: ids.school,
  level: 1,
  xp: 0,
  coins: 0,
  gemstones: 0,
  ap_max: 100,
  avatar_url: null,
  is_banned: false,
  needs_setup: false,
};

const studentProfile = {
  id: ids.student,
  user_id: ids.student,
  username: 'Smoke Student',
  email: 'student-smoke@example.test',
  role: 'student',
  role_in_school: 'student',
  school_id: ids.school,
  grade: 9,
  batch: '9A',
  level: 1,
  xp: 0,
  avatar_url: null,
  is_banned: false,
  joined_at: now,
};

const contentItem = {
  skill: 'reading',
  content_type: 'ielts_reading_set',
  content_id: String(ids.readingSet),
  title: 'Smoke Reading Set',
  description: 'Short smoke-test reading passage.',
  difficulty: 'easy',
  band: '5.0',
};

const readingSet = {
  id: ids.readingSet,
  slug: 'smoke-reading-set',
  title: contentItem.title,
  description: contentItem.description,
  level: 'easy',
  est_band_min: 4,
  est_band_max: 6,
  duration_minutes: 5,
  passage_text: 'Smoke passage text for IELTS Pilot QA.',
  required_tier: 'free',
  created_by: ids.admin,
  created_at: now,
  is_active: true,
};

const readingQuestion = {
  id: 9001,
  set_id: ids.readingSet,
  question_order: 1,
  question_type: 'short_answer',
  body: 'What type of passage is this?',
  options: null,
  correct_answer: 'Smoke',
  explanation: 'The passage is the smoke-test passage.',
};

function authUser(profile) {
  return {
    id: profile.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: profile.email,
    email_confirmed_at: now,
    confirmed_at: now,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { full_name: profile.username },
    created_at: now,
    updated_at: now,
  };
}

async function seedSession(page, profile) {
  const user = authUser(profile);
  await page.addInitScript(({ user }) => {
    const session = {
      access_token: 'smoke-access-token',
      refresh_token: 'smoke-refresh-token',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer',
      user,
    };
    window.localStorage.setItem('sb-test-auth-token', JSON.stringify(session));
  }, { user });
}

function assignmentSummary(overrides = {}) {
  return {
    id: ids.assignment,
    school_id: ids.school,
    class_id: ids.class,
    assigned_by: ids.admin,
    title: 'Smoke Week 1 IELTS Practice',
    description: 'Smoke assignment for IELTS Pilot QA.',
    status: 'assigned',
    due_at: '2026-05-20T10:00:00.000Z',
    created_at: now,
    updated_at: now,
    class_name: classRow.class_name,
    total_students: 1,
    assigned_count: 1,
    in_progress_count: 0,
    completed_count: 0,
    overdue_count: 0,
    excused_count: 0,
    completion_percent: 0,
    item_count: 1,
    items: [assignmentItem()],
    ...overrides,
  };
}

function assignmentItem(overrides = {}) {
  return {
    id: ids.readingItem,
    assignment_id: ids.assignment,
    skill: 'reading',
    content_type: 'ielts_reading_set',
    content_id: String(ids.readingSet),
    title: contentItem.title,
    required: true,
    order_index: 0,
    created_at: now,
    ...overrides,
  };
}

function progressItem(status = 'assigned', item = assignmentItem()) {
  return {
    assignment_item_id: item.id,
    skill: item.skill,
    content_type: item.content_type,
    content_id: item.content_id,
    title: item.title,
    required: item.required,
    order_index: item.order_index,
    status,
    practice_attempt_type: status === 'completed' ? 'reading' : null,
    practice_attempt_id: status === 'completed' ? 'attempt-smoke-1' : null,
    started_at: status !== 'assigned' ? now : null,
    completed_at: status === 'completed' ? now : null,
    updated_at: now,
  };
}

function assignmentProgress({ completed = false, multi = false } = {}) {
  const items = multi
    ? [assignmentItem(), assignmentItem({ id: ids.listeningItem, skill: 'listening', content_type: 'ielts_listening_set', content_id: '202', title: 'Smoke Listening Set', order_index: 1 })]
    : [assignmentItem()];
  const completedCount = completed ? items.length : 0;
  return {
    assignment_id: ids.assignment,
    student_id: ids.student,
    student_status: completed ? 'completed' : 'assigned',
    assignment_completed_at: completed ? now : null,
    required_count: items.length,
    completed_required_count: completedCount,
    item_count: items.length,
    completed_item_count: completedCount,
    all_required_completed: completed,
    items: items.map((item) => progressItem(completed ? 'completed' : 'assigned', item)),
  };
}

async function installSupabaseMocks(page, profile, options = {}) {
  const role = profile.role;
  let createdAssignment = Boolean(options.assignmentExists);
  let studentCompleted = Boolean(options.studentCompleted);
  let multiItem = Boolean(options.multiItem);

  await page.route('**/auth/v1/user', async (route) => {
    await route.fulfill({ json: authUser(profile) });
  });

  await page.route('**/rest/v1/rpc/**', async (route) => {
    const url = new URL(route.request().url());
    const fn = url.pathname.split('/').pop();
    const body = route.request().postDataJSON?.() ?? {};

    const rpc = {
      check_user_setup_status: { authenticated: true, needs_setup: false, has_role: true, has_username: true, role, school_id: ids.school, user_id: profile.id, username: profile.username },
      get_effective_tier: 'free',
      get_school_plan_details: { success: true, plan: 'pilot', is_active: true, trial_ends_at: '2026-06-01T00:00:00.000Z', trial_expired: false, seats: { cambridge: 0, ielts: 10, game: 0 }, current_members: 2 },
      get_school_pilot_quotas: { is_pilot: false },
      get_school_details: { success: true, school, stats: { students: 1, teachers: 0, admins: 1, total: 2 } },
      get_school_members: { success: true, members: [studentProfile], total: 1 },
      school_admin_list_classes: [classRow],
      school_admin_list_teachers: [],
      school_admin_list_teacher_assignments: [],
      school_admin_list_class_students: [{ class_id: ids.class, student_id: ids.student }],
      school_admin_list_subjects: [],
      rpc_ielts_practice_content_catalog: [contentItem],
      rpc_ielts_practice_list_assignments: createdAssignment ? [assignmentSummary(studentCompleted ? { completed_count: 1, completion_percent: 100 } : {})] : [],
      rpc_ielts_practice_create_assignment: assignmentSummary({ id: ids.assignment, title: body.p_title || 'Smoke Week 1 IELTS Practice' }),
      rpc_ielts_practice_assign_to_class: assignmentSummary(),
      rpc_ielts_practice_assignment_detail: {
        assignment: assignmentSummary(studentCompleted ? { completed_count: 1, completion_percent: 100 } : {}),
        items: [assignmentItem()],
        students: [{ student_id: ids.student, username: studentProfile.username, email: studentProfile.email, class_id: ids.class, class_name: classRow.class_name, status: studentCompleted ? 'completed' : 'assigned', completed_at: studentCompleted ? now : null, updated_at: now, required_count: 1, completed_required_count: studentCompleted ? 1 : 0, item_count: 1, completed_item_count: studentCompleted ? 1 : 0 }],
      },
      rpc_ielts_practice_student_assignments: [assignmentSummary({ student_assignment_id: 'student-assignment-1', student_status: studentCompleted ? 'completed' : 'assigned', completed_at: studentCompleted ? now : null, item_count: multiItem ? 2 : 1, items: multiItem ? [assignmentItem(), assignmentItem({ id: ids.listeningItem, skill: 'listening', content_type: 'ielts_listening_set', content_id: '202', title: 'Smoke Listening Set', order_index: 1 })] : [assignmentItem()] })],
      rpc_ielts_practice_assignment_progress: assignmentProgress({ completed: studentCompleted, multi: multiItem }),
      rpc_ielts_practice_mark_started: assignmentSummary({ student_status: 'in_progress' }),
      rpc_ielts_practice_mark_item_started: assignmentProgress({ completed: false, multi: multiItem }),
      rpc_ielts_practice_mark_item_completed: assignmentProgress({ completed: true, multi: multiItem }),
      rpc_ielts_school_results: {
        summary: { total_students: 1, assigned_practice_count: 1, completed_practice_count: 1, exam_submission_count: 0, latest_overall_estimate_avg: 5.5 },
        rows: [{ student_id: ids.student, username: studentProfile.username, email: studentProfile.email, class_id: ids.class, class_name: classRow.class_name, assigned_practice_total: 1, completed_practice_total: 1, exam_submission_total: 0, latest_reading_estimate: 5.5, latest_listening_estimate: null, latest_writing_estimate: null, latest_speaking_estimate: null, latest_overall_estimate: 5.5, last_activity_at: now }],
        filters_applied: { school_id: ids.school, class_id: null, student_id: null, limit: 25 },
      },
    };

    if (fn === 'rpc_ielts_practice_create_assignment' || fn === 'rpc_ielts_practice_assign_to_class') {
      createdAssignment = true;
    }
    if (fn === 'rpc_ielts_practice_mark_item_completed') {
      studentCompleted = true;
    }

    await route.fulfill({ json: Object.prototype.hasOwnProperty.call(rpc, fn) ? rpc[fn] : [] });
  });

  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const table = url.pathname.split('/').pop();
    const method = route.request().method();

    if (method === 'PATCH') return route.fulfill({ json: [] });
    if (table === 'users') return route.fulfill({ json: role === 'school_admin' ? adminProfile : studentProfile });
    if (table === 'schools') return route.fulfill({ json: school });
    if (table === 'school_members') return route.fulfill({ json: { school_id: ids.school, role_in_school: role === 'school_admin' ? 'school_admin' : 'student' } });
    if (table === 'ielts_reading_sets') return route.fulfill({ json: [readingSet] });
    if (table === 'ielts_reading_questions') return route.fulfill({ json: [readingQuestion] });
    if (table === 'ielts_users') return route.fulfill({ json: { id: profile.id, email: profile.email, full_name: profile.username, tier: 'free' } });
    if (table === 'ielts_reading_attempts') return route.fulfill({ json: { id: 'attempt-smoke-1', user_id: ids.student, set_id: ids.readingSet, completed_at: now } });

    await route.fulfill({ json: [] });
  });
}

test.describe('IELTS Pilot QA smoke flows', () => {
  test('school admin can create a practice assignment and see it in the list', async ({ page }) => {
    await seedSession(page, adminProfile);
    await installSupabaseMocks(page, adminProfile);

    await page.goto('/');
    await expect(page.getByTestId('school-admin-portal')).toBeVisible();
    await page.getByTestId('school-admin-tab-ielts-practice').click();
    await expect(page.getByTestId('ielts-practice-admin-tab')).toBeVisible();

    await page.getByTestId('ielts-practice-class-select').selectOption(ids.class);
    await page.getByTestId('ielts-practice-title-input').fill('Smoke Week 1 IELTS Practice');
    await page.getByTestId('ielts-practice-description-input').fill('Smoke assignment for IELTS Pilot QA.');
    await page.getByTestId('ielts-practice-content-picker-0').click();
    await page.getByTestId(`ielts-practice-content-option-ielts_reading_set-${ids.readingSet}`).click();
    await page.getByTestId('ielts-practice-create-assignment').click();

    await expect(page.getByTestId(`ielts-practice-assignment-${ids.assignment}`)).toContainText('Smoke Week 1 IELTS Practice');
  });

  test('student can open assigned practice, complete a reading item, and see progress update', async ({ page }) => {
    await seedSession(page, studentProfile);
    await installSupabaseMocks(page, studentProfile, { assignmentExists: true });

    await page.goto('/ielts/practice/assigned');
    await expect(page.getByTestId('ielts-assigned-practice-page')).toBeVisible();
    await expect(page.getByTestId(`ielts-assigned-assignment-${ids.assignment}`)).toContainText('Smoke Week 1 IELTS Practice');
    await page.getByTestId(`ielts-assigned-open-item-${ids.readingItem}`).click();

    await page.getByTestId('ielts-reading-answer-input').fill('Smoke');
    await page.getByTestId('ielts-reading-submit').click();

    await expect(page.getByTestId('assignment-completion-status')).toContainText('1 of 1 assignment items completed');
    await expect(page.getByTestId('assignment-completion-status')).toContainText('School assignment completed');
    await page.getByTestId('assignment-completion-back-to-assigned').click();
    await expect(page.getByTestId(`ielts-assigned-progress-${ids.assignment}-bar`)).toHaveAttribute('aria-valuenow', '100');
  });

  test('multi-item assignment shows parent completion after all required items are completed', async ({ page }) => {
    await seedSession(page, studentProfile);
    await installSupabaseMocks(page, studentProfile, { assignmentExists: true, studentCompleted: true, multiItem: true });

    await page.goto('/ielts/practice/assigned');
    await expect(page.getByTestId(`ielts-assigned-assignment-${ids.assignment}`)).toContainText('Completed');
    await expect(page.getByTestId(`ielts-assigned-progress-${ids.assignment}-bar`)).toHaveAttribute('aria-valuenow', '100');
    await expect(page.getByTestId(`ielts-assigned-item-${ids.readingItem}`)).toHaveAttribute('data-status', 'completed');
    await expect(page.getByTestId(`ielts-assigned-item-${ids.listeningItem}`)).toHaveAttribute('data-status', 'completed');
  });

  test('teacher/admin progress view shows completed student', async ({ page }) => {
    await seedSession(page, adminProfile);
    await installSupabaseMocks(page, adminProfile, { assignmentExists: true, studentCompleted: true });

    await page.goto('/');
    await expect(page.getByTestId('school-admin-portal')).toBeVisible();
    await page.getByTestId('school-admin-tab-ielts-practice').click();
    await page.getByTestId(`ielts-practice-view-progress-${ids.assignment}`).click();

    await expect(page.getByTestId(`ielts-practice-progress-student-${ids.student}`)).toContainText('Smoke Student');
    await expect(page.getByTestId(`ielts-practice-progress-student-${ids.student}`)).toContainText('completed');
  });

  test('IELTS Results tab loads summary cards and student row', async ({ page }) => {
    await seedSession(page, adminProfile);
    await installSupabaseMocks(page, adminProfile, { assignmentExists: true, studentCompleted: true });

    await page.goto('/');
    await expect(page.getByTestId('school-admin-portal')).toBeVisible();
    await page.getByTestId('school-admin-tab-ielts-results').click();

    await expect(page.getByTestId('ielts-results-tab')).toBeVisible();
    await expect(page.getByTestId('ielts-results-summary-total-students')).toContainText('1');
    await expect(page.getByTestId('ielts-results-summary-completed-practice')).toContainText('1');
    await expect(page.getByTestId(`ielts-results-student-${ids.student}`)).toContainText('Smoke Student');
  });
});
