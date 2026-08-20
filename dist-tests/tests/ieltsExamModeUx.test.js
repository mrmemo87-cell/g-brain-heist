import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canStartIeltsExamAttempt, formatIeltsCountdown, getIeltsAttemptOperationalLabel, getIeltsStudentExamSyncMessage, resolveIeltsStudentExamSyncState, shouldIeltsAutosaveRun, resolveIeltsExamLifecycleMeta, resolveIeltsExamLifecycleState, } from '../services/ieltsExamModeUx.js';
test('IELTS exam lifecycle labels cover pilot states with human-friendly labels', () => {
    const now = Date.parse('2026-05-18T10:00:00.000Z');
    assert.equal(resolveIeltsExamLifecycleMeta('draft', null, null, now).label, 'Draft');
    assert.equal(resolveIeltsExamLifecycleMeta('scheduled', '2026-05-18T11:00:00.000Z', '2026-05-18T13:00:00.000Z', now).label, 'Scheduled');
    assert.equal(resolveIeltsExamLifecycleMeta('live', '2026-05-18T09:00:00.000Z', '2026-05-18T13:00:00.000Z', now).label, 'Live now');
    assert.equal(resolveIeltsExamLifecycleMeta('paused', '2026-05-18T09:00:00.000Z', '2026-05-18T13:00:00.000Z', now).label, 'Paused');
    assert.equal(resolveIeltsExamLifecycleMeta('ended', '2026-05-18T08:00:00.000Z', '2026-05-18T09:00:00.000Z', now).label, 'Ended');
    assert.equal(resolveIeltsExamLifecycleMeta('archived', null, null, now).label, 'Archived');
});
test('IELTS lifecycle requires an explicit live status instead of promoting scheduled by time', () => {
    const now = Date.parse('2026-05-18T10:00:00.000Z');
    assert.equal(resolveIeltsExamLifecycleState('scheduled', '2026-05-18T09:00:00.000Z', '2026-05-18T11:00:00.000Z', now), 'scheduled');
    assert.equal(resolveIeltsExamLifecycleState('paused', '2026-05-18T09:00:00.000Z', '2026-05-18T11:00:00.000Z', now), 'paused');
    assert.equal(resolveIeltsExamLifecycleState('scheduled', '2026-05-18T11:00:00.000Z', '2026-05-18T12:00:00.000Z', now), 'scheduled');
    assert.equal(resolveIeltsExamLifecycleState('scheduled', '2026-05-18T08:00:00.000Z', '2026-05-18T09:59:59.000Z', now), 'ended');
    assert.equal(resolveIeltsExamLifecycleState('live', '2026-05-18T09:00:00.000Z', '2026-05-18T11:00:00.000Z', now), 'live_now');
    assert.equal(resolveIeltsExamLifecycleState('live', '2026-05-18T08:00:00.000Z', '2026-05-18T09:59:59.000Z', now), 'ended');
});
test('IELTS student start eligibility requires the confirmed live event state', () => {
    const ready = {
        allowed: true,
        assignmentId: 'assignment-1',
        hasAttempt: false,
        isSubmitted: false,
        isBeforeStart: false,
        isAfterExamWindow: false,
        isPaused: false,
    };
    assert.equal(canStartIeltsExamAttempt({ ...ready, eventStatus: 'scheduled' }), false);
    assert.equal(canStartIeltsExamAttempt({ ...ready, eventStatus: 'paused' }), false);
    assert.equal(canStartIeltsExamAttempt({ ...ready, eventStatus: 'live' }), true);
    assert.equal(canStartIeltsExamAttempt({ ...ready, eventStatus: 'live', allowed: false }), false);
    assert.equal(canStartIeltsExamAttempt({ ...ready, eventStatus: 'live', hasAttempt: true }), false);
});
test('IELTS waiting countdown renders locally understandable durations', () => {
    assert.equal(formatIeltsCountdown(65), '1:05');
    assert.equal(formatIeltsCountdown(3661), '1:01:01');
    assert.equal(formatIeltsCountdown(90061), '1d 1h 1m');
});
test('IELTS monitor labels emphasize not started, active, submitted and connection issue', () => {
    assert.equal(getIeltsAttemptOperationalLabel('assigned'), 'Not started');
    assert.equal(getIeltsAttemptOperationalLabel('in_progress'), 'Active');
    assert.equal(getIeltsAttemptOperationalLabel('submitted'), 'Submitted');
    assert.equal(getIeltsAttemptOperationalLabel('in_progress', true), 'Possible connection issue');
});
test('IELTS student live sync maps teacher pause, force submit and void states', () => {
    assert.equal(resolveIeltsStudentExamSyncState('in_progress', 'paused', 'ok'), 'paused');
    assert.equal(getIeltsStudentExamSyncMessage('paused'), 'This exam is paused by the teacher.');
    assert.equal(resolveIeltsStudentExamSyncState('auto_submitted', 'live', 'ok'), 'teacher_submitted');
    assert.equal(getIeltsStudentExamSyncMessage('teacher_submitted'), 'Your exam has been submitted by your teacher.');
    assert.equal(resolveIeltsStudentExamSyncState('void', 'live', 'assignment_void'), 'voided');
    assert.equal(getIeltsStudentExamSyncMessage('voided'), 'This attempt was voided by the teacher.');
});
test('IELTS student autosave only runs while the live sync state is active', () => {
    assert.equal(shouldIeltsAutosaveRun('active'), true);
    assert.equal(shouldIeltsAutosaveRun('paused'), false);
    assert.equal(shouldIeltsAutosaveRun('teacher_submitted'), false);
    assert.equal(shouldIeltsAutosaveRun('voided'), false);
    assert.equal(shouldIeltsAutosaveRun('not_in_progress'), false);
});
test('IELTS Exam Mode UI surfaces start-exam backend errors instead of silently resetting', () => {
    const source = readFileSync('src/pages/ielts/IeltsExamMode.tsx', 'utf8');
    assert.match(source, /Start exam failed:/, 'start failure must include backend reason prefix');
    assert.match(source, /alert=\{error\}/, 'start card must render the captured failure message');
    assert.match(source, /if \(isStarting \|\| !whoami\?\.assignment_id\) return;/, 'start action must be retry-safe against double clicks');
    assert.match(source, /canStartIeltsExamAttempt\(\{[\s\S]*allowed: whoami\?\.allowed,[\s\S]*eventStatus,/, 'student start UI must consume live-state eligibility');
    assert.match(source, /Your invigilator must also launch the exam before you can begin\./, 'scheduled countdown must not promise that time alone opens the exam');
});
test('IELTS Exam Mode student page polls live status, ticks countdown, and locks teacher actions', () => {
    const source = readFileSync('src/pages/ielts/IeltsExamMode.tsx', 'utf8');
    assert.match(source, /setInterval\(\(\) => \{[\s\S]*refreshLiveState\(\)[\s\S]*\}, 10000\)/, 'student page must poll live state every 10 seconds');
    assert.match(source, /window\.addEventListener\('focus', onFocusOrVisible\)/, 'student page must refresh status on focus');
    assert.match(source, /document\.addEventListener\('visibilitychange', onFocusOrVisible\)/, 'student page must refresh status on visibilitychange');
    assert.match(source, /setInterval\(\(\) => \{[\s\S]*setNowTick\(Date\.now\(\)\)[\s\S]*setRemainingSeconds[\s\S]*\}, 1000\)/, 'countdown must visibly tick every second');
    assert.match(source, /syncStateRef\.current === 'paused'\) return;/, 'countdown display must pause while teacher has paused the event');
    assert.match(source, /shouldIeltsAutosaveRun\(syncStateRef\.current\)/, 'autosave must be gated by live sync state');
    assert.match(source, /attempt_not_in_progress\|assignment_void\|exam_paused/, 'teacher state changes must suppress scary autosave errors');
    assert.match(source, /Your exam has been submitted by your teacher\./, 'force submit must show teacher-submitted state');
    assert.match(source, /This attempt was voided by the teacher\./, 'void must show teacher-voided state');
    assert.match(source, /This exam is paused by the teacher\./, 'pause must show teacher-paused state');
});
test('IELTS whoami RPC exposes event status for pause without exposing protected answers', () => {
    const sql = readFileSync('supabase/migrations/20260518170000_ielts_exam_whoami_live_state_sync.sql', 'utf8');
    assert.match(sql, /'event_status', v_event\.status/, 'whoami must expose event_status separately from attempt status');
    assert.match(sql, /'attempt_status', coalesce\(v_attempt\.status, v_assignment\.status\)/, 'whoami must expose attempt_status for terminal monitor actions');
    assert.doesNotMatch(sql, /answer_key/i, 'student whoami migration must not expose answer keys');
});
test('IELTS Exam Mode pilot UI does not expose answer_key or depend on legacy IELTS admin checks', () => {
    const files = [
        'src/pages/ielts/IeltsExamMode.tsx',
        'src/pages/ielts/IeltsExamMonitor.tsx',
        'src/pages/ielts/IeltsExamManager.tsx',
        'services/ieltsExamModeUx.ts',
    ];
    for (const file of files) {
        const source = readFileSync(file, 'utf8');
        if (file !== 'src/pages/ielts/IeltsExamManager.tsx') {
            assert.doesNotMatch(source, /answer_key/i, `${file} must not expose answer_key in student or monitor UI`);
        }
        assert.doesNotMatch(source, /rpc_is_ielts_admin|ielts_teachers|is_ielts_admin/i, `${file} must not use legacy IELTS admin permissions`);
    }
});
