import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePart2CommunicativeAchievement, sanitizeCommunicativeAchievementText, } from '../src/lib/writingCommunicativeAchievement.js';
test('valid communicative achievement payload passes unchanged', () => {
    const payload = {
        suggestedMarks: { communicativeAchievement: 4 },
        markJustifications: { communicativeAchievement: 'The register is mostly appropriate and engaging.' },
    };
    const result = normalizePart2CommunicativeAchievement(payload);
    assert.equal(result.errors.length, 0);
    assert.equal(payload.suggestedMarks.communicativeAchievement, 4);
    assert.equal(payload.markJustifications.communicativeAchievement, 'The register is mostly appropriate and engaging.');
});
test('missing communicative achievement score fails validation', () => {
    const payload = {
        suggestedMarks: {},
        markJustifications: { communicativeAchievement: 'A valid justification is present.' },
    };
    const result = normalizePart2CommunicativeAchievement(payload);
    assert.ok(result.errors.some((error) => error.includes('suggestedMarks.communicativeAchievement')));
});
test('alias keys are normalized to communicativeAchievement', () => {
    const payload = {
        suggestedMarks: { communicative_achievement: '5' },
        markJustifications: { 'communicative achievement': 'Excellent control of task conventions.' },
    };
    const result = normalizePart2CommunicativeAchievement(payload);
    assert.equal(result.errors.length, 0);
    assert.equal(payload.suggestedMarks.communicativeAchievement, 5);
    assert.equal(payload.markJustifications.communicativeAchievement, 'Excellent control of task conventions.');
});
test('placeholder communicative achievement justification is rejected', () => {
    const payload = {
        suggestedMarks: { communicativeAchievement: 3 },
        markJustifications: { communicativeAchievement: '__' },
    };
    const result = normalizePart2CommunicativeAchievement(payload);
    assert.ok(result.errors.some((error) => error.includes('meaningful non-empty string')));
});
test('wrong score type is rejected', () => {
    const payload = {
        suggestedMarks: { communicativeAchievement: 'high' },
        markJustifications: { communicativeAchievement: 'The writing mostly achieves its purpose.' },
    };
    const result = normalizePart2CommunicativeAchievement(payload);
    assert.ok(result.errors.some((error) => error.includes('integer 0-5')));
});
test('sanitizeCommunicativeAchievementText removes placeholder values', () => {
    assert.equal(sanitizeCommunicativeAchievementText('__', 'fallback text'), 'fallback text');
    assert.equal(sanitizeCommunicativeAchievementText('  Clear and relevant.  ', 'fallback text'), 'Clear and relevant.');
});
