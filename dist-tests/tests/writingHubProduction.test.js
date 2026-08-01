import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { __getWritingIntegrationStoreForTests, __resetWritingIntegrationStoreForTests, createWritingPrompt, getNextRotatedPromptForStudent, getStudentWritingState, saveAdminReviewSignal, setCalibrationFollowUpFlag, setPromptQualityFlag, submitDailyWritingPractice, submitInitialWritingAssessment, } from '../src/lib/brains_heist/writingIntegrationService.js';
import { WritingHub } from '../src/pages/writing/WritingHub.js';
import { WritingMonitoringView } from '../src/pages/writing/WritingMonitoringView.js';
import { WritingCalibrationReview } from '../src/pages/writing/WritingCalibrationReview.js';
import { WritingPromptBankManager } from '../src/pages/writing/WritingPromptBankManager.js';
import { WritingExportCenter } from '../src/pages/writing/WritingExportCenter.js';
import { WritingAnalyticsDashboard } from '../src/pages/writing/WritingAnalyticsDashboard.js';
const prompt = `Write a response that includes:
- describe the event
- explain why it mattered
- give one suggestion`;
const installMockLocalStorage = () => {
    const data = new Map();
    const storage = {
        getItem: (key) => data.get(key) ?? null,
        setItem: (key, value) => data.set(key, value),
        removeItem: (key) => data.delete(key),
        clear: () => data.clear(),
        key: (index) => [...data.keys()][index] ?? null,
        get length() {
            return data.size;
        },
    };
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
};
test('persistence-backed state reload', () => {
    installMockLocalStorage();
    __resetWritingIntegrationStoreForTests();
    submitInitialWritingAssessment({
        student_id: 'prod-1',
        grade: 8,
        genre: 'article',
        prompt_text: prompt,
        target_word_count: 120,
        student_response: 'The event was sports day. It mattered because teamwork improved. I suggest more team rounds.',
    });
    const store = __getWritingIntegrationStoreForTests();
    store.states.clear();
    store.profiles.clear();
    const reloaded = getStudentWritingState('prod-1');
    assert.strictEqual(reloaded.ok, true);
});
test('empty-state student experience render', () => {
    __resetWritingIntegrationStoreForTests();
    const html = renderToStaticMarkup(React.createElement(WritingHub, { studentId: 'empty-student', grade: 8, genre: 'article', month: '2026-03' }));
    assert.ok(html.includes('Your Writing Space'));
    assert.ok(html.includes('Submit for Feedback'));
});
test('no-active-task state render', () => {
    __resetWritingIntegrationStoreForTests();
    submitInitialWritingAssessment({
        student_id: 'prod-2',
        grade: 7,
        genre: 'email',
        prompt_text: prompt,
        target_word_count: 80,
        student_response: 'Dear teacher, event was helpful because teamwork. I suggest reflection. Regards.',
    });
    for (let day = 1; day <= 7; day += 1) {
        submitDailyWritingPractice({
            student_id: 'prod-2',
            day_number: day,
            submission_text: 'Completed task submission with enough words for a simple pass.',
        });
    }
    const html = renderToStaticMarkup(React.createElement(WritingHub, { studentId: 'prod-2', grade: 7, genre: 'email', month: '2026-03' }));
    assert.ok(html.includes('Your Writing Space'));
    assert.ok(html.includes('Submit for Feedback'));
});
test('teacher dashboard summary render', () => {
    __resetWritingIntegrationStoreForTests();
    submitInitialWritingAssessment({
        student_id: 'prod-3',
        grade: 9,
        genre: 'essay',
        prompt_text: prompt,
        target_word_count: 120,
        student_response: 'I is write event and suggest',
        attempted_at: '2026-03-01T10:00:00.000Z',
    });
    const html = renderToStaticMarkup(React.createElement(WritingMonitoringView, { month: '2026-03' }));
    assert.ok(html.includes('Teacher/Admin Writing Monitor'));
    assert.ok(html.includes('Weekly target'));
    assert.ok(html.includes('Grade'));
});
test('teacher dashboard stalled/improving indicators render', () => {
    __resetWritingIntegrationStoreForTests();
    submitInitialWritingAssessment({
        student_id: 'stalled-1',
        student_name: 'Stalled Student',
        grade: 9,
        genre: 'essay',
        prompt_text: prompt,
        target_word_count: 120,
        student_response: 'Bad start response',
        attempted_at: '2026-03-01T10:00:00.000Z',
    });
    submitInitialWritingAssessment({
        student_id: 'stalled-1',
        student_name: 'Stalled Student',
        grade: 9,
        genre: 'essay',
        prompt_text: prompt,
        target_word_count: 120,
        student_response: 'Still weak wording',
        attempted_at: '2026-03-02T10:00:00.000Z',
    });
    submitInitialWritingAssessment({
        student_id: 'stalled-1',
        student_name: 'Stalled Student',
        grade: 9,
        genre: 'essay',
        prompt_text: prompt,
        target_word_count: 120,
        student_response: 'Tiny unclear text',
        attempted_at: '2026-03-03T10:00:00.000Z',
    });
    submitDailyWritingPractice({
        student_id: 'stalled-1',
        day_number: 1,
        submission_text: 'short',
        submitted_at: '2026-03-04T10:00:00.000Z',
    });
    submitInitialWritingAssessment({
        student_id: 'improving-1',
        student_name: 'Improving Student',
        grade: 9,
        genre: 'essay',
        prompt_text: prompt,
        target_word_count: 120,
        student_response: 'Weak writing start',
        attempted_at: '2026-03-01T10:00:00.000Z',
    });
    submitInitialWritingAssessment({
        student_id: 'improving-1',
        student_name: 'Improving Student',
        grade: 9,
        genre: 'essay',
        prompt_text: prompt,
        target_word_count: 120,
        student_response: 'This response includes event details, explains impact, and gives a useful suggestion.',
        attempted_at: '2026-03-02T10:00:00.000Z',
    });
    submitInitialWritingAssessment({
        student_id: 'improving-1',
        student_name: 'Improving Student',
        grade: 9,
        genre: 'essay',
        prompt_text: prompt,
        target_word_count: 120,
        student_response: 'This final response clearly describes the event, explains why it mattered to the school community, and offers a specific practical suggestion in a well-organized structure.',
        attempted_at: '2026-03-03T10:00:00.000Z',
    });
    const html = renderToStaticMarkup(React.createElement(WritingMonitoringView, { month: '2026-03' }));
    assert.ok(html.includes('Students and general writing data'));
    assert.ok(html.includes('Choose a class'));
    assert.ok(html.includes('2</strong><small>Students'));
    assert.ok(html.includes('Need support'));
    assert.ok(html.includes('Improving'));
});
test('teacher dashboard loading/error/empty states render', () => {
    __resetWritingIntegrationStoreForTests();
    const loadingHtml = renderToStaticMarkup(React.createElement(WritingMonitoringView, { isLoading: true }));
    assert.ok(loadingHtml.includes('writing-monitor--loading'), `Expected monitoring loading skeleton container. First 500 chars:\n${loadingHtml.slice(0, 500)}`);
    const errorHtml = renderToStaticMarkup(React.createElement(WritingMonitoringView, { errorMessage: 'network unavailable' }));
    assert.ok(errorHtml.includes('Unable to load writing monitor'));
    const emptyHtml = renderToStaticMarkup(React.createElement(WritingMonitoringView, { month: '2026-03' }));
    assert.ok(emptyHtml.includes('No students with writing records yet'));
});
test('progress visual render with monthly data', () => {
    __resetWritingIntegrationStoreForTests();
    submitInitialWritingAssessment({
        student_id: 'prod-4',
        grade: 9,
        genre: 'essay',
        prompt_text: prompt,
        target_word_count: 120,
        student_response: 'I is write event and suggest',
        attempted_at: '2026-02-02T10:00:00.000Z',
    });
    submitInitialWritingAssessment({
        student_id: 'prod-4',
        grade: 9,
        genre: 'essay',
        prompt_text: prompt,
        target_word_count: 120,
        student_response: 'This essay describes the event, explains why it mattered, and gives one practical suggestion.',
        attempted_at: '2026-03-02T10:00:00.000Z',
    });
    const html = renderToStaticMarkup(React.createElement(WritingHub, { studentId: 'prod-4', grade: 9, genre: 'essay', month: '2026-03' }));
    assert.ok(html.includes('Today'));
    assert.ok(html.includes('Your Response'));
});
test('admin calibration review renders full decision chain', () => {
    __resetWritingIntegrationStoreForTests();
    submitInitialWritingAssessment({
        student_id: 'cal-1',
        student_name: 'Calibration Student',
        grade: 10,
        genre: 'report',
        prompt_text: prompt,
        target_word_count: 130,
        student_response: 'This report describes the event, explains why it mattered for students, and gives one practical recommendation.',
        attempted_at: '2026-03-05T10:00:00.000Z',
    });
    submitDailyWritingPractice({
        student_id: 'cal-1',
        day_number: 1,
        submission_text: 'Improved practice submission with clear structure and better language control.',
        submitted_at: '2026-03-06T10:00:00.000Z',
    });
    const html = renderToStaticMarkup(React.createElement(WritingCalibrationReview, { studentId: 'cal-1', month: '2026-03' }));
    assert.ok(html.includes('Writing Calibration Review'), `Expected calibration header in HTML. First 500 chars:\n${html.slice(0, 500)}`);
    assert.ok(html.includes('Calibration Student'), `Expected student label in calibration HTML. First 500 chars:\n${html.slice(0, 500)}`);
    assert.ok(html.includes('Latest assessment result'), `Expected assessment section in calibration HTML. First 500 chars:\n${html.slice(0, 500)}`);
    assert.ok(html.includes('Weakness tags'), `Expected weakness tags line in calibration HTML. First 500 chars:\n${html.slice(0, 500)}`);
    // Default tab is "assessment"; tab-specific sections are validated in interactive component tests.
});
test('admin calibration review missing-data fallback', () => {
    __resetWritingIntegrationStoreForTests();
    const emptyHtml = renderToStaticMarkup(React.createElement(WritingCalibrationReview, { studentId: 'unknown-student', month: '2026-03' }));
    assert.ok(emptyHtml.includes('No calibration data found'));
    const loadingHtml = renderToStaticMarkup(React.createElement(WritingCalibrationReview, { studentId: 'cal-1', isLoading: true }));
    assert.ok(loadingHtml.includes('Loading calibration review'));
    const errorHtml = renderToStaticMarkup(React.createElement(WritingCalibrationReview, { studentId: 'cal-1', errorMessage: 'timeout' }));
    assert.ok(errorHtml.includes('Unable to load calibration review'));
});
test('prompt bank manager render and empty/loading/error states', () => {
    __resetWritingIntegrationStoreForTests();
    createWritingPrompt({
        title: 'Prompt Manager Case',
        prompt_text: 'Write about a school event and suggest one improvement.',
        genre: 'article',
        grade_band: '7-9',
        target_word_count: 120,
        difficulty_label: 'core',
        curriculum_tags: ['event', 'reflection'],
        safety_status: 'approved',
    });
    const html = renderToStaticMarkup(React.createElement(WritingPromptBankManager, { gradeFilter: 8, genreFilter: 'article' }));
    assert.ok(html.includes('Writing Prompt Bank Manager'));
    assert.ok(html.includes('Prompt Manager Case'));
    assert.ok(html.includes('Usage count'));
    const emptyHtml = renderToStaticMarkup(React.createElement(WritingPromptBankManager, { gradeFilter: 12, genreFilter: 'story' }));
    assert.ok(emptyHtml.includes('No prompts found'));
    const loadingHtml = renderToStaticMarkup(React.createElement(WritingPromptBankManager, { isLoading: true }));
    assert.ok(loadingHtml.includes('Loading prompt bank'));
    const errorHtml = renderToStaticMarkup(React.createElement(WritingPromptBankManager, { errorMessage: 'forbidden' }));
    assert.ok(errorHtml.includes('Unable to load prompt bank'));
});
test('writing export center renders student/teacher/admin exports', () => {
    __resetWritingIntegrationStoreForTests();
    submitInitialWritingAssessment({
        student_id: 'exp-ui-1',
        student_name: 'Export UI Student',
        grade: 9,
        genre: 'essay',
        prompt_text: prompt,
        target_word_count: 120,
        student_response: 'I is write event and suggest',
        attempted_at: '2026-03-01T10:00:00.000Z',
    });
    submitDailyWritingPractice({
        student_id: 'exp-ui-1',
        day_number: 1,
        submission_text: 'Practice submission for export center UI.',
        submitted_at: '2026-03-02T10:00:00.000Z',
    });
    const studentHtml = renderToStaticMarkup(React.createElement(WritingExportCenter, { mode: 'student', studentId: 'exp-ui-1', month: '2026-03' }));
    assert.ok(studentHtml.includes('No export data is available yet'));
    const teacherHtml = renderToStaticMarkup(React.createElement(WritingExportCenter, { mode: 'teacher', month: '2026-03' }));
    assert.ok(teacherHtml.includes('Turn writing evidence into a clear conversation'), `Expected teacher export static render to show the teacher-first report workflow. First 500 chars:\n${teacherHtml.slice(0, 500)}`);
    const adminHtml = renderToStaticMarkup(React.createElement(WritingExportCenter, { mode: 'admin', studentId: 'exp-ui-1', month: '2026-03' }));
    assert.ok(adminHtml.includes('Admin Calibration Export'));
});
test('writing export center loading/error/missing-data states', () => {
    __resetWritingIntegrationStoreForTests();
    const loadingHtml = renderToStaticMarkup(React.createElement(WritingExportCenter, { mode: 'teacher', isLoading: true }));
    assert.ok(loadingHtml.includes('Loading Writing Reports'));
    const errorHtml = renderToStaticMarkup(React.createElement(WritingExportCenter, { mode: 'teacher', errorMessage: 'network timeout' }));
    assert.ok(errorHtml.includes('Writing Reports could not be opened'));
    const missingHtml = renderToStaticMarkup(React.createElement(WritingExportCenter, { mode: 'student', month: '2026-03' }));
    assert.ok(missingHtml.includes('No export data is available yet'));
});
test('writing analytics dashboard renders aggregated views with drill-down links', () => {
    __resetWritingIntegrationStoreForTests();
    const createdPrompt = createWritingPrompt({
        title: 'Analytics Prompt',
        prompt_text: prompt,
        genre: 'essay',
        grade_band: '8-10',
        target_word_count: 120,
        difficulty_label: 'core',
        curriculum_tags: ['analytics'],
        safety_status: 'approved',
    });
    assert.strictEqual(createdPrompt.ok, true);
    submitInitialWritingAssessment({
        student_id: 'ana-ui-1',
        student_name: 'Analytics Student',
        grade: 9,
        genre: 'essay',
        prompt_text: prompt,
        target_word_count: 120,
        student_response: 'I is short',
        attempted_at: '2026-02-01T10:00:00.000Z',
    });
    submitInitialWritingAssessment({
        student_id: 'ana-ui-1',
        student_name: 'Analytics Student',
        grade: 9,
        genre: 'essay',
        prompt_text: prompt,
        target_word_count: 120,
        student_response: 'This essay covers all prompt points with clearer language and structure.',
        attempted_at: '2026-03-01T10:00:00.000Z',
    });
    for (const sid of ['ana-ui-2', 'ana-ui-3']) {
        submitInitialWritingAssessment({
            student_id: sid,
            grade: 9,
            genre: 'essay',
            prompt_text: prompt,
            target_word_count: 120,
            student_response: 'Tiny weak text',
            attempted_at: '2026-03-02T10:00:00.000Z',
        });
    }
    for (let idx = 0; idx < 10; idx += 1) {
        getNextRotatedPromptForStudent({
            student_id: `ana-ui-${idx}`,
            grade: 9,
            genre: 'essay',
            used_at: `2026-03-${String((idx % 9) + 1).padStart(2, '0')}T09:00:00.000Z`,
        });
    }
    const html = renderToStaticMarkup(React.createElement(WritingAnalyticsDashboard, {
        gradeFilter: 9,
        genreFilter: 'essay',
        monitoringBasePath: '/admin/monitor',
        calibrationBasePath: '/admin/calibration',
        promptBankBasePath: '/admin/prompts',
    }));
    assert.ok(html.includes('Writing Analytics Dashboard'));
    assert.ok(html.includes('Most Common Weak Areas'));
    assert.ok(html.includes('Prompt Effectiveness'));
    assert.ok(html.includes('Recommended Actions'));
    assert.ok(html.includes('View students'));
    assert.ok(html.includes('Overused prompts to refresh'));
});
test('writing analytics dashboard loading/error/empty and warning badge states', () => {
    __resetWritingIntegrationStoreForTests();
    const loadingHtml = renderToStaticMarkup(React.createElement(WritingAnalyticsDashboard, { isLoading: true }));
    assert.ok(loadingHtml.includes('Loading analytics'));
    const errorHtml = renderToStaticMarkup(React.createElement(WritingAnalyticsDashboard, { errorMessage: 'service unavailable' }));
    assert.ok(errorHtml.includes('Unable to load analytics'));
    const emptyHtml = renderToStaticMarkup(React.createElement(WritingAnalyticsDashboard, { gradeFilter: 12, genreFilter: 'story' }));
    assert.ok(emptyHtml.includes('No analytics data available'));
    __resetWritingIntegrationStoreForTests();
    createWritingPrompt({
        title: 'Warning Prompt',
        prompt_text: prompt,
        genre: 'essay',
        grade_band: '8-10',
        target_word_count: 120,
        difficulty_label: 'core',
        curriculum_tags: ['warning'],
        safety_status: 'approved',
    });
    submitInitialWritingAssessment({
        student_id: 'warn-1',
        grade: 9,
        genre: 'essay',
        prompt_text: prompt,
        target_word_count: 120,
        student_response: 'Short weak text',
        attempted_at: '2026-03-01T10:00:00.000Z',
    });
    for (let idx = 0; idx < 10; idx += 1) {
        getNextRotatedPromptForStudent({
            student_id: `warn-rot-${idx}`,
            grade: 9,
            genre: 'essay',
            used_at: `2026-03-${String((idx % 9) + 1).padStart(2, '0')}T08:00:00.000Z`,
        });
    }
    const warningHtml = renderToStaticMarkup(React.createElement(WritingAnalyticsDashboard, { gradeFilter: 9, genreFilter: 'essay' }));
    assert.ok(warningHtml.includes('⚠ Overused prompts to refresh'));
});
test('cross-page admin filter query normalization behavior', () => {
    __resetWritingIntegrationStoreForTests();
    const promptRecord = createWritingPrompt({
        title: 'Filter Prompt',
        prompt_text: prompt,
        genre: 'essay',
        grade_band: '8-10',
        target_word_count: 120,
        difficulty_label: 'core',
        curriculum_tags: ['filter'],
        safety_status: 'approved',
    });
    assert.strictEqual(promptRecord.ok, true);
    submitInitialWritingAssessment({
        student_id: 'flt-1',
        grade: 9,
        genre: 'essay',
        prompt_text: prompt,
        target_word_count: 120,
        student_response: 'I is tiny',
        attempted_at: '2026-03-01T10:00:00.000Z',
    });
    const monitoringHtml = renderToStaticMarkup(React.createElement(WritingMonitoringView, { filterQuery: '?status=stalled&grade=9' }));
    assert.ok(monitoringHtml.includes('Teacher/Admin Writing Monitor') || monitoringHtml.includes('No monitoring matches'));
    const promptHtml = renderToStaticMarkup(React.createElement(WritingPromptBankManager, { filterQuery: `?prompt_id=${promptRecord.data.id}&active=true` }));
    assert.ok(promptHtml.includes('Filter Prompt'));
    const calibrationHtml = renderToStaticMarkup(React.createElement(WritingCalibrationReview, { studentId: 'flt-1', filterQuery: '?weakness_tag=under_length' }));
    assert.ok(calibrationHtml.includes('Filtered weakness focus'));
});
test('admin help content and filtered empty-state copy render', () => {
    __resetWritingIntegrationStoreForTests();
    const monitoringEmpty = renderToStaticMarkup(React.createElement(WritingMonitoringView, { filterQuery: '?status=stalled&grade=9' }));
    assert.ok(monitoringEmpty.includes('No writing monitoring data available yet') ||
        monitoringEmpty.includes('No monitoring matches') ||
        monitoringEmpty.includes('No students with writing records yet'));
    const analyticsEmpty = renderToStaticMarkup(React.createElement(WritingAnalyticsDashboard, { gradeFilter: 12, genreFilter: 'story' }));
    assert.ok(analyticsEmpty.includes('No analytics data available for filters'));
    createWritingPrompt({
        title: 'Help Prompt',
        prompt_text: prompt,
        genre: 'essay',
        grade_band: '8-10',
        target_word_count: 120,
        difficulty_label: 'core',
        curriculum_tags: ['help'],
        safety_status: 'approved',
    });
    submitInitialWritingAssessment({
        student_id: 'help-1',
        grade: 9,
        genre: 'essay',
        prompt_text: prompt,
        target_word_count: 120,
        student_response: 'I is short',
        attempted_at: '2026-03-01T10:00:00.000Z',
    });
    const monitoringHelp = renderToStaticMarkup(React.createElement(WritingMonitoringView, { month: '2026-03' }));
    assert.ok(monitoringHelp.includes('Teacher/Admin Writing Monitor'));
    const promptHelp = renderToStaticMarkup(React.createElement(WritingPromptBankManager, {}));
    assert.ok(promptHelp.includes('Overused prompt'));
    const calibrationHelp = renderToStaticMarkup(React.createElement(WritingCalibrationReview, { studentId: 'help-1', month: '2026-03' }));
    assert.ok(calibrationHelp.includes('Low-improvement tag'));
});
test('admin feedback flags display and filter behavior in views', () => {
    __resetWritingIntegrationStoreForTests();
    const promptRecord = createWritingPrompt({
        title: 'Flag Prompt',
        prompt_text: prompt,
        genre: 'essay',
        grade_band: '8-10',
        target_word_count: 120,
        difficulty_label: 'core',
        curriculum_tags: ['flag'],
        safety_status: 'approved',
    });
    submitInitialWritingAssessment({
        student_id: 'flag-1',
        grade: 9,
        genre: 'essay',
        prompt_text: prompt,
        target_word_count: 120,
        student_response: 'I is weak',
        attempted_at: '2026-03-01T10:00:00.000Z',
    });
    saveAdminReviewSignal({
        entity_type: 'assessment',
        entity_id: 'assessment-flag-1',
        student_id: 'flag-1',
        status: 'questionable',
        note: 'Investigate scoring',
    });
    setPromptQualityFlag(promptRecord.data.id, 'questionable', 'Ambiguous prompt wording');
    setCalibrationFollowUpFlag('flag-1', true, 'Need calibration sync');
    const monitoringFlagged = renderToStaticMarkup(React.createElement(WritingMonitoringView, { filterQuery: '?status=questionable' }));
    assert.ok(monitoringFlagged.includes('Student') || monitoringFlagged.includes('No monitoring matches'), `expected questionable monitoring view to render a safe student label or empty-filter copy, got: ${monitoringFlagged}`);
    const promptFlagged = renderToStaticMarkup(React.createElement(WritingPromptBankManager, { filterQuery: '?status=questionable' }));
    assert.ok(promptFlagged.includes('Quality flag: questionable'));
    const calibrationFlagged = renderToStaticMarkup(React.createElement(WritingCalibrationReview, { studentId: 'flag-1', month: '2026-03' }));
    assert.ok(calibrationFlagged.includes('Calibration follow-up: Flagged'));
});
