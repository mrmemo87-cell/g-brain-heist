import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toIeltsLocalDateTimeInput, validateIeltsExamSchedule, } from '../src/lib/ieltsExamSchedule.js';
const validSchedule = {
    startsAt: '2026-08-04T09:00',
    endsAt: '2026-08-04T11:00',
    durationMinutes: 120,
};
test('IELTS create and reschedule flows share the same four schedule rules', () => {
    assert.equal(validateIeltsExamSchedule(validSchedule), null);
    assert.equal(validateIeltsExamSchedule({ ...validSchedule, startsAt: '' }), 'Start and end time are required.');
    assert.equal(validateIeltsExamSchedule({ ...validSchedule, endsAt: '2026-08-04T08:59' }), 'End time must be after start time.');
    assert.equal(validateIeltsExamSchedule({ ...validSchedule, durationMinutes: 0 }), 'Duration must be greater than zero.');
    assert.equal(validateIeltsExamSchedule({ ...validSchedule, durationMinutes: 121 }), 'Duration must fit within start and end times.');
});
test('IELTS exam detail date conversion fails safely for missing and malformed values', () => {
    assert.equal(toIeltsLocalDateTimeInput(null), null);
    assert.equal(toIeltsLocalDateTimeInput('not-a-date'), null);
    assert.match(toIeltsLocalDateTimeInput('2026-08-04T09:00:00.000Z') ?? '', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
});
test('IELTS Exam Manager applies safe detail state and shared validation in both flows', () => {
    const source = readFileSync('src/pages/ielts/IeltsExamManager.tsx', 'utf8');
    assert.match(source, /const applyExamDetail = useCallback/);
    assert.equal((source.match(/applyExamDetail\(nextDetail\)/g) ?? []).length, 2);
    assert.match(source, /const createScheduleError = validateIeltsExamSchedule\(\{ startsAt, endsAt, durationMinutes \}\)/);
    assert.match(source, /const scheduleError = validateIeltsExamSchedule\(\{[\s\S]*startsAt: scheduleStartsAt,[\s\S]*endsAt: scheduleEndsAt,[\s\S]*durationMinutes: scheduleDurationMinutes/);
});
