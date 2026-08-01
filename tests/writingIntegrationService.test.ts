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
  getStudentWritingState,
  getSmartWritingPromptForStudent,
  getTodayWritingTask,
  getWeeklyWritingReview,
  listStudentWritingHistoryByGenre,
  listWritingPrompts,
  persistInitialWritingRichFeedback,
  setWritingPromptActiveStatus,
  seedWritingPilotReadinessDemoData,
  runWritingPilotVerificationChecklist,
  saveAdminReviewSignal,
  setCalibrationFollowUpFlag,
  setPromptQualityFlag,
  submitDailyWritingPractice,
  submitInitialWritingAssessment,
  retryWritingHydration,
} from '../src/lib/brains_heist/writingIntegrationService.js';
import { WRITING_PILOT_GUARDRAILS } from '../src/lib/brains_heist/writingAdminConfig.js';
import { parseAdminDrilldownFilters, serializeAdminDrilldownFilters } from '../src/lib/brains_heist/writingAdminFilters.js';

const prompt = `Write a response that includes:
- describe the event
- explain why it mattered
- give one suggestion`;

const installMockLocalStorage = () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
    clear: () => data.clear(),
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
};

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

test('retryWritingHydration rehydrates fallback snapshot from local storage', async () => {
  installMockLocalStorage();
  __resetWritingIntegrationStoreForTests();
  submitInitialWritingAssessment({
    student_id: 'svc-retry',
    grade: 8,
    genre: 'article',
    prompt_text: prompt,
    target_word_count: 120,
    student_response: 'The event happened in school and mattered because students collaborated effectively.',
  });

  const store = __getWritingIntegrationStoreForTests();
  store.states.clear();
  store.profiles.clear();

  await retryWritingHydration();
  const reloaded = getStudentWritingState('svc-retry', 'article');
  assert.strictEqual(reloaded.ok, true);
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

test('email starter prompt is assigned until student completes it', async () => {
  __resetWritingIntegrationStoreForTests();
  const starterPromptText =
    'Write a formal email to a local community partner suggesting a collaboration on a student project. In your email, clearly explain the purpose of the project, outline the expected benefits for both students and the community, and provide one strong, evidence-based reason why they should support this initiative.';

  const firstSelection = await getSmartWritingPromptForStudent({
    student_id: 'starter-1',
    grade: 8,
    genre: 'email',
  });
  assert.strictEqual(firstSelection.ok, true);
  assert.strictEqual(firstSelection.data!.prompt_text, starterPromptText);

  submitInitialWritingAssessment({
    student_id: 'starter-1',
    grade: 8,
    genre: 'email',
    prompt_text: starterPromptText,
    target_word_count: 120,
    student_response: 'Dear Community Partner, our class proposes a recycling project supported by attendance and waste data.',
  });

  const secondSelection = await getSmartWritingPromptForStudent({
    student_id: 'starter-1',
    grade: 8,
    genre: 'email',
  });
  assert.strictEqual(secondSelection.ok, true);
  assert.notStrictEqual(secondSelection.data!.prompt_text, '');
});

test('smart prompt selection changes task identity after a submitted essay', async () => {
  __resetWritingIntegrationStoreForTests();
  const firstSelection = await getSmartWritingPromptForStudent({
    student_id: 'rotation-smart-1',
    grade: 8,
    genre: 'essay',
  });
  assert.strictEqual(firstSelection.ok, true);
  assert.ok((firstSelection.data!.pool_size ?? 0) > 1);

  submitInitialWritingAssessment({
    student_id: 'rotation-smart-1',
    grade: 8,
    genre: 'essay',
    prompt_id: firstSelection.data!.prompt_id,
    prompt_text: firstSelection.data!.prompt_text,
    target_word_count: firstSelection.data!.target_word_count,
    student_response:
      'Schools should consider this question carefully. One benefit is stronger community participation, while one challenge is finding enough time. I recommend a flexible programme because it gives students meaningful experience without creating unnecessary pressure.',
  });

  const secondSelection = await getSmartWritingPromptForStudent({
    student_id: 'rotation-smart-1',
    grade: 8,
    genre: 'essay',
    current_prompt_id: firstSelection.data!.prompt_id ?? undefined,
    current_prompt_text: firstSelection.data!.prompt_text,
  });
  assert.strictEqual(secondSelection.ok, true);
  assert.notStrictEqual(secondSelection.data!.prompt_id, firstSelection.data!.prompt_id);
  assert.notStrictEqual(secondSelection.data!.base_prompt_text, firstSelection.data!.base_prompt_text);
});

test('rich feedback persists complete weakness memory and remains replayable in history', () => {
  __resetWritingIntegrationStoreForTests();
  const submitted = submitInitialWritingAssessment({
    student_id: 'feedback-memory-1',
    grade: 8,
    genre: 'essay',
    prompt_text: prompt,
    target_word_count: 120,
    student_response:
      'There is many reason for this event. It was importent for everyone and the class should do more activity like this',
    attempted_at: '2026-07-27T10:00:00.000Z',
  });
  assert.strictEqual(submitted.ok, true);

  const saved = persistInitialWritingRichFeedback({
    student_id: 'feedback-memory-1',
    genre: 'essay',
    attempt_id: submitted.data!.attempt_id,
    rich_feedback: {
      task_understanding: 'You addressed the event and gave a recommendation.',
      next_move: 'Correct agreement and punctuation before adding detail.',
      weakness_tags: ['agreement_error', 'spelling_error'],
      grammar_fixes: [
        {
          issue: 'subject-verb agreement',
          original: 'There is many reason',
          better_version: 'There are many reasons',
        },
        {
          issue: 'spelling',
          original: 'It was importent',
          better_version: 'It was important',
        },
        {
          issue: 'subject-verb agreement',
          original: 'class should do more activity',
          better_version: 'class should do more activities',
        },
      ],
      punctuation_fixes: [
        {
          original: 'activity like this',
          better_version: 'activity like this.',
        },
      ],
      natural_phrase_upgrades: [
        {
          original: 'do more activity',
          better_version: 'organise more activities',
          why_it_helps: 'This is more precise.',
        },
      ],
    },
  });
  assert.strictEqual(saved.ok, true);

  const state = getStudentWritingState('feedback-memory-1', 'essay');
  assert.strictEqual(state.ok, true);
  const weaknessTags = state.data!.latest_assessment!.weakness_tags;
  assert.ok(weaknessTags.includes('agreement_error'));
  assert.ok(weaknessTags.includes('spelling_error'));
  assert.ok(weaknessTags.includes('punctuation_error'));
  assert.ok(weaknessTags.includes('weak_word_choice'));
  const tagCounts = state.data!.repeated_error_memory.byStudent['feedback-memory-1']!.tagCounts;
  assert.strictEqual(tagCounts.agreement_error, 1);
  assert.strictEqual(tagCounts.spelling_error, 1);
  assert.strictEqual(tagCounts.punctuation_error, 1);
  assert.strictEqual(tagCounts.weak_word_choice, 1);
  assert.ok(state.data!.active_daily_tasks.some((task) =>
    task.target_tags.some((tag) => weaknessTags.includes(tag))
  ));

  const history = listStudentWritingHistoryByGenre('feedback-memory-1');
  assert.strictEqual(history.ok, true);
  const essayEntry = history.data!.find((group) => group.genre === 'essay')!.entries[0]!;
  assert.strictEqual(essayEntry.has_feedback, true);
  assert.strictEqual(essayEntry.grammar_issue_count, 3);
  assert.strictEqual(essayEntry.punctuation_issue_count, 1);
  assert.ok(essayEntry.weakness_tags.includes('agreement_error'));
  assert.strictEqual(essayEntry.weakness_tag_counts.agreement_error, 2);
  assert.strictEqual(essayEntry.weakness_tag_counts.spelling_error, 1);
  assert.strictEqual(essayEntry.weakness_tag_counts.punctuation_error, 1);
  assert.ok(essayEntry.rich_feedback);

  const analytics = getWritingAnalyticsDashboard();
  assert.strictEqual(analytics.ok, true);
  const studentCounts = analytics.data!.student_weakness_counts.find((student) => student.student_id === 'feedback-memory-1');
  assert.strictEqual(studentCounts?.tags.find((tag) => tag.tag === 'agreement_error')?.count, 2);
  assert.strictEqual(analytics.data!.most_common_weakness_tags.find((tag) => tag.tag === 'agreement_error')?.count, 2);
});

test('existing saved feedback is backfilled into weakness memory on student load', () => {
  __resetWritingIntegrationStoreForTests();
  submitInitialWritingAssessment({
    student_id: 'feedback-backfill-1',
    grade: 8,
    genre: 'essay',
    prompt_text: prompt,
    target_word_count: 120,
    student_response: 'There is many reason for this event and it was importent',
  });
  // Complete the normal hydration cycle before simulating an older persisted
  // attempt whose rich feedback predates canonical weakness tagging.
  getStudentWritingState('feedback-backfill-1', 'essay');
  const store = __getWritingIntegrationStoreForTests();
  store.attempts[0]!.rich_feedback = {
    grammar_fixes: [
      {
        issue: 'subject-verb agreement',
        original: 'There is many reason',
        better_version: 'There are many reasons',
      },
      {
        issue: 'spelling',
        original: 'importent',
        better_version: 'important',
      },
    ],
    punctuation_fixes: [
      {
        original: 'it was importent',
        better_version: 'it was important.',
      },
    ],
  };

  const state = getStudentWritingState('feedback-backfill-1', 'essay');
  assert.strictEqual(state.ok, true);
  assert.ok(state.data!.latest_assessment!.weakness_tags.includes('agreement_error'));
  assert.ok(state.data!.latest_assessment!.weakness_tags.includes('spelling_error'));
  assert.ok(state.data!.latest_assessment!.weakness_tags.includes('punctuation_error'));
  assert.strictEqual(
    state.data!.repeated_error_memory.byStudent['feedback-backfill-1']!.tagCounts.agreement_error,
    1
  );
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
  const first = submitInitialWritingAssessment({
    student_id: 'ana-1',
    grade: 8,
    genre: 'article',
    prompt_text: prompt,
    target_word_count: 120,
    student_response: 'I is short text',
    revision_cycle_id: 'cycle-a',
    attempt_number: 1,
    retry_kind: 'new_prompt',
    attempted_at: '2026-02-01T10:00:00.000Z',
  });
  const second = submitInitialWritingAssessment({
    student_id: 'ana-1',
    grade: 8,
    genre: 'article',
    prompt_text: prompt,
    target_word_count: 120,
    student_response: 'This article explains event impact and gives one recommendation.',
    revision_cycle_id: 'cycle-a',
    attempt_number: 2,
    retry_kind: 'same_prompt',
    parent_attempt_id: first.data?.attempt_id ?? null,
    attempted_at: '2026-03-01T10:00:00.000Z',
  });
  assert.strictEqual(first.ok, true);
  assert.strictEqual(second.ok, true);

  const analytics = getWritingAnalyticsDashboard();
  assert.strictEqual(analytics.ok, true);
  assert.ok(analytics.data!.summary.total_students >= 1);
  assert.ok(Array.isArray(analytics.data!.most_common_weakness_tags));
  assert.ok(analytics.data!.retry_insights);
  assert.strictEqual(analytics.data!.retry_insights!.retry_cycle_count, 1);
  assert.strictEqual(analytics.data!.retry_insights!.same_prompt_retry_count, 1);
  assert.ok(Array.isArray(analytics.data!.retry_insights!.student_retry_profiles));
  assert.strictEqual(analytics.data!.retry_insights!.student_retry_profiles[0].student_id, 'ana-1');

  const filtered = getWritingAnalyticsDashboard({ grade: 8, genre: 'article' });
  assert.strictEqual(filtered.ok, true);
  assert.ok(filtered.data!.retry_insights);

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
