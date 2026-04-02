import test from 'node:test';
import assert from 'node:assert/strict';

import {
  __getWritingIntegrationStoreForTests,
  __resetWritingIntegrationStoreForTests,
  archiveWritingPrompt,
  createWritingPrompt,
  editWritingPrompt,
  exportAdminCalibrationReport,
  getWritingPersistenceDiagnostics,
  getWritingAnalyticsDashboard,
  exportStudentMonthlyWritingReport,
  exportTeacherWeeklyClassSummary,
  getNextRotatedPromptForStudent,
  listAdminReviewSignals,
  getCurrentWeeklyPlan,
  getMonthlyWritingReport,
  getTodayWritingTask,
  getWeeklyWritingReview,
  listWritingPrompts,
  setWritingPromptActiveStatus,
  seedWritingPilotReadinessDemoData,
  runWritingPilotVerificationChecklist,
  saveAdminReviewSignal,
  setCalibrationFollowUpFlag,
  setPromptQualityFlag,
  submitDailyWritingPractice,
  submitInitialWritingAssessment,
} from '../src/lib/brains_heist/writingIntegrationService.js';
import { WRITING_PILOT_GUARDRAILS } from '../src/lib/brains_heist/writingAdminConfig.js';
import { parseAdminDrilldownFilters, serializeAdminDrilldownFilters } from '../src/lib/brains_heist/writingAdminFilters.js';

const prompt = `Write a response that includes:
- describe the event
- explain why it mattered
- give one suggestion`;

test('initial assessment persistence flow', () => {
  __resetWritingIntegrationStoreForTests();
  const response = submitInitialWritingAssessment({
    student_id: 'svc-1',
    grade: 8,
    genre: 'article',
    prompt_text: prompt,
    target_word_count: 120,
    student_response: 'The event was sports day. It mattered because teamwork improved. I suggest more team rounds.',
    attempted_at: '2026-03-01T10:00:00.000Z',
  });

  assert.strictEqual(response.ok, true);
  const store = __getWritingIntegrationStoreForTests();
  assert.strictEqual(store.profiles.has('svc-1'), true);
  assert.ok(store.attempts.length >= 1);
  assert.ok(store.weeklyPlans.length >= 1);
  assert.ok(store.dailyTasks.length >= 7);
});

test('persistence diagnostics report fallback mode in test runtime', () => {
  __resetWritingIntegrationStoreForTests();
  const diagnostics = getWritingPersistenceDiagnostics();
  assert.strictEqual(diagnostics.ok, true);
  assert.strictEqual(diagnostics.data!.repository_mode, 'disabled');
  assert.ok(['runtime-only', 'fallback-local', 'db'].includes(diagnostics.data!.mode));
});

test('daily practice submission persistence flow', () => {
  __resetWritingIntegrationStoreForTests();
  submitInitialWritingAssessment({
    student_id: 'svc-2',
    grade: 9,
    genre: 'essay',
    prompt_text: prompt,
    target_word_count: 120,
    student_response: 'I is write event and explain matter and suggest',
  });

  const today = getTodayWritingTask('svc-2');
  assert.strictEqual(today.ok, true);

  const submit = submitDailyWritingPractice({
    student_id: 'svc-2',
    day_number: today.data!.day_number,
    submission_text:
      'This essay describes the event, explains why it mattered for students, and gives one practical suggestion for next term.',
  });

  assert.strictEqual(submit.ok, true);
  const store = __getWritingIntegrationStoreForTests();
  assert.ok(store.dailySubmissions.length >= 1);
  assert.ok(store.dailyEvaluations.length >= 1);
  assert.ok(store.memorySnapshots.length >= 2);
});

test('retrieving today task from active state', () => {
  __resetWritingIntegrationStoreForTests();
  submitInitialWritingAssessment({
    student_id: 'svc-3',
    grade: 7,
    genre: 'email',
    prompt_text: prompt,
    target_word_count: 80,
    student_response: 'Dear teacher, event was great because teamwork. I suggest add reflection. Regards.',
  });

  const plan = getCurrentWeeklyPlan('svc-3');
  const today = getTodayWritingTask('svc-3');

  assert.strictEqual(plan.ok, true);
  assert.strictEqual(today.ok, true);
  assert.ok(today.data!.day_number >= 1);
});

test('weekly review retrieval after multiple completed tasks', () => {
  __resetWritingIntegrationStoreForTests();
  submitInitialWritingAssessment({
    student_id: 'svc-4',
    grade: 8,
    genre: 'paragraph',
    prompt_text: prompt,
    target_word_count: 100,
    student_response: 'Event was good.',
  });

  for (const day of [1, 2, 3]) {
    submitDailyWritingPractice({
      student_id: 'svc-4',
      day_number: day,
      submission_text: 'bad',
      submitted_at: `2026-03-0${day}T10:00:00.000Z`,
    });
  }

  const weekly = getWeeklyWritingReview('svc-4');
  assert.strictEqual(weekly.ok, true);
  assert.ok(weekly.data!.weekly_review_summary.completed_tasks >= 3);
  assert.ok(weekly.data!.next_week_planning_inputs.carry_forward_primary_target.length > 0);
});

test('monthly report persistence and retrieval', () => {
  __resetWritingIntegrationStoreForTests();
  submitInitialWritingAssessment({
    student_id: 'svc-5',
    grade: 9,
    genre: 'essay',
    prompt_text: prompt,
    target_word_count: 120,
    student_response: 'I is write event and suggest',
    attempted_at: '2026-02-02T10:00:00.000Z',
  });

  submitInitialWritingAssessment({
    student_id: 'svc-5',
    grade: 9,
    genre: 'essay',
    prompt_text: prompt,
    target_word_count: 120,
    student_response:
      'This essay describes the event clearly, explains why it mattered, and gives one practical suggestion.',
    attempted_at: '2026-03-05T10:00:00.000Z',
  });

  const monthly = getMonthlyWritingReport('svc-5', '2026-03');
  assert.strictEqual(monthly.ok, true);
  assert.ok(monthly.data!.student_facing_monthly_report.score_change.length > 0);

  const store = __getWritingIntegrationStoreForTests();
  assert.ok(store.monthlyReports.length >= 1);
});

test('prompt bank create/edit/filter/archive flows', () => {
  __resetWritingIntegrationStoreForTests();
  const created = createWritingPrompt({
    title: 'School Festival Reflection',
    prompt_text: 'Describe your school festival and one improvement idea.',
    genre: 'article',
    grade_band: '7-9',
    target_word_count: 130,
    difficulty_label: 'core',
    curriculum_tags: ['festival', 'reflection'],
    safety_status: 'approved',
  });
  assert.strictEqual(created.ok, true);

  const promptId = created.data!.id;
  const edited = editWritingPrompt(promptId, {
    difficulty_label: 'stretch',
    curriculum_tags: ['festival', 'reflection', 'audience'],
  });
  assert.strictEqual(edited.ok, true);
  assert.strictEqual(edited.data!.difficulty_label, 'stretch');

  const filtered = listWritingPrompts({ grade: 8, genre: 'article', difficulty_label: 'stretch', is_active: true });
  assert.strictEqual(filtered.ok, true);
  assert.strictEqual(filtered.data!.length, 1);

  const deactivated = setWritingPromptActiveStatus(promptId, false);
  assert.strictEqual(deactivated.ok, true);
  assert.strictEqual(deactivated.data!.is_active, false);

  const archived = archiveWritingPrompt(promptId);
  assert.strictEqual(archived.ok, true);
  assert.strictEqual(archived.data!.is_archived, true);
});

test('prompt rotation avoids repetitive recent prompts for student', () => {
  __resetWritingIntegrationStoreForTests();
  for (const idx of [1, 2, 3]) {
    createWritingPrompt({
      title: `Rotation Prompt ${idx}`,
      prompt_text: `Prompt body ${idx}`,
      genre: 'essay',
      grade_band: '9-10',
      target_word_count: 140,
      difficulty_label: 'core',
      curriculum_tags: ['rotation'],
      safety_status: 'approved',
    });
  }

  const first = getNextRotatedPromptForStudent({ student_id: 'rot-1', grade: 9, genre: 'essay' });
  const second = getNextRotatedPromptForStudent({ student_id: 'rot-1', grade: 9, genre: 'essay' });
  const third = getNextRotatedPromptForStudent({ student_id: 'rot-1', grade: 9, genre: 'essay' });
  assert.strictEqual(first.ok, true);
  assert.strictEqual(second.ok, true);
  assert.strictEqual(third.ok, true);
  assert.notStrictEqual(first.data!.id, second.data!.id);
});

test('student/teacher/admin exports produce html and pdf-ready payloads', () => {
  __resetWritingIntegrationStoreForTests();
  submitInitialWritingAssessment({
    student_id: 'exp-1',
    student_name: 'Export Student',
    grade: 9,
    genre: 'essay',
    prompt_text: prompt,
    target_word_count: 120,
    student_response: 'I is write event and suggest',
    attempted_at: '2026-02-02T10:00:00.000Z',
  });
  submitInitialWritingAssessment({
    student_id: 'exp-1',
    student_name: 'Export Student',
    grade: 9,
    genre: 'essay',
    prompt_text: prompt,
    target_word_count: 120,
    student_response: 'This essay describes the event and proposes a clear suggestion.',
    attempted_at: '2026-03-05T10:00:00.000Z',
  });
  submitDailyWritingPractice({
    student_id: 'exp-1',
    day_number: 1,
    submission_text: 'Practice submission for export coverage.',
    submitted_at: '2026-03-06T10:00:00.000Z',
  });
  getMonthlyWritingReport('exp-1', '2026-03');

  const studentExport = exportStudentMonthlyWritingReport('exp-1', '2026-03');
  assert.strictEqual(studentExport.ok, true);
  assert.ok(studentExport.data!.html.includes('Student Monthly Writing Report'));
  assert.ok(studentExport.data!.pdf_ready.sections.length >= 5);

  const teacherExport = exportTeacherWeeklyClassSummary('2026-03');
  assert.strictEqual(teacherExport.ok, true);
  assert.ok(teacherExport.data!.html.includes('Teacher Weekly/Class Writing Summary'));

  const adminExport = exportAdminCalibrationReport('exp-1', '2026-03');
  assert.strictEqual(adminExport.ok, true);
  assert.ok(adminExport.data!.html.includes('Admin Calibration Export'));
});

test('export html escapes user-controlled fields', () => {
  __resetWritingIntegrationStoreForTests();
  submitInitialWritingAssessment({
    student_id: 'xss-1',
    student_name: '<script>alert(1)</script>',
    grade: 9,
    genre: 'essay',
    prompt_text: '<img src=x onerror=alert(2)>',
    target_word_count: 120,
    student_response: '<svg onload=alert(3)>x</svg>',
    attempted_at: '2026-03-05T10:00:00.000Z',
  });

  const adminExport = exportAdminCalibrationReport('xss-1', '2026-03');
  assert.strictEqual(adminExport.ok, true);
  assert.ok(!adminExport.data!.html.includes('<script>'));
  assert.ok(adminExport.data!.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
});

test('analytics aggregation and filter behavior', () => {
  __resetWritingIntegrationStoreForTests();
  submitInitialWritingAssessment({
    student_id: 'ana-1',
    grade: 8,
    genre: 'article',
    prompt_text: prompt,
    target_word_count: 120,
    student_response: 'I is short text',
    attempted_at: '2026-02-01T10:00:00.000Z',
  });
  submitInitialWritingAssessment({
    student_id: 'ana-1',
    grade: 8,
    genre: 'article',
    prompt_text: prompt,
    target_word_count: 120,
    student_response: 'This article explains event impact and gives one recommendation.',
    attempted_at: '2026-03-01T10:00:00.000Z',
  });

  const analytics = getWritingAnalyticsDashboard();
  assert.strictEqual(analytics.ok, true);
  assert.ok(analytics.data!.summary.total_students >= 1);
  assert.ok(Array.isArray(analytics.data!.most_common_weakness_tags));

  const filtered = getWritingAnalyticsDashboard({ grade: 8, genre: 'article' });
  assert.strictEqual(filtered.ok, true);

  const empty = getWritingAnalyticsDashboard({ grade: 12, genre: 'story' });
  assert.strictEqual(empty.ok, false);
});

test('seeded pilot-readiness data produces expected analytics risk states', () => {
  __resetWritingIntegrationStoreForTests();
  const seeded = seedWritingPilotReadinessDemoData();
  assert.strictEqual(seeded.ok, true);
  assert.ok(seeded.data!.seeded_students.length >= 6);

  const analytics = getWritingAnalyticsDashboard();
  assert.strictEqual(analytics.ok, true);
  assert.ok(
    analytics.data!.pilot_readiness.overused_prompts.length >= 1,
    `expected overused prompts at threshold ${WRITING_PILOT_GUARDRAILS.prompt_overuse_threshold}`
  );
});

test('admin filter normalization parse/serialize is consistent', () => {
  const query = serializeAdminDrilldownFilters({ grade: 9, genre: 'essay', status: 'stalled', weakness_tag: 'under_length' });
  const parsed = parseAdminDrilldownFilters(query);
  assert.strictEqual(parsed.grade, 9);
  assert.strictEqual(parsed.genre, 'essay');
  assert.strictEqual(parsed.status, 'stalled');
  assert.strictEqual(parsed.weakness_tag, 'under_length');
});

test('pilot verification helper produces checklist output', () => {
  const verification = runWritingPilotVerificationChecklist();
  assert.strictEqual(verification.ok, true);
  assert.ok(verification.data!.checks.length >= 7);
  assert.ok(verification.data!.checks.some((item) => item.name === 'seeded demo data'));
});

test('admin feedback save/display/filter behavior', () => {
  __resetWritingIntegrationStoreForTests();
  const promptRecord = createWritingPrompt({
    title: 'Feedback Prompt',
    prompt_text: prompt,
    genre: 'essay',
    grade_band: '8-10',
    target_word_count: 120,
    difficulty_label: 'core',
    curriculum_tags: ['feedback'],
    safety_status: 'approved',
  });
  submitInitialWritingAssessment({
    student_id: 'fb-1',
    grade: 9,
    genre: 'essay',
    prompt_text: prompt,
    target_word_count: 120,
    student_response: 'I is weak',
    attempted_at: '2026-03-01T10:00:00.000Z',
  });

  const signal = saveAdminReviewSignal({
    entity_type: 'assessment',
    entity_id: 'attempt-1',
    student_id: 'fb-1',
    status: 'questionable',
    note: 'Needs spot-check',
  });
  assert.strictEqual(signal.ok, true);

  const filteredSignals = listAdminReviewSignals({ status: 'questionable', student_id: 'fb-1' });
  assert.strictEqual(filteredSignals.ok, true);
  assert.ok(filteredSignals.data!.length >= 1);

  const flaggedPrompt = setPromptQualityFlag(promptRecord.data!.id, 'questionable', 'Prompt may be ambiguous');
  assert.strictEqual(flaggedPrompt.ok, true);
  assert.strictEqual(flaggedPrompt.data!.prompt_quality_flag, 'questionable');

  const followUp = setCalibrationFollowUpFlag('fb-1', true, 'Schedule calibration meeting');
  assert.strictEqual(followUp.ok, true);
  assert.strictEqual(followUp.data!.flagged, true);
});
