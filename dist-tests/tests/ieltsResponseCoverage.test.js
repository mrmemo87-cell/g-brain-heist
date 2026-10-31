import test from 'node:test';
import assert from 'node:assert/strict';
import { responseCoverage, coverageLabel, coverageNextStep } from '../services/ieltsResponseCoverage.js';
import { startingPointCompleted, journeyNextStep } from '../services/ieltsStartingPointService.js';
test('coverage distinguishes missing responses from incorrect answers and rejects impossible counts', () => {
    assert.equal(responseCoverage(0, 12), 'empty');
    assert.equal(responseCoverage(6, 12), 'partial');
    assert.equal(responseCoverage(12, 12), 'complete');
    for (const pair of [[undefined, 12], [null, 12], [-1, 12], [13, 12], [1.5, 12], [0, 0], ['12', 12]]) {
        assert.equal(responseCoverage(...pair), 'unknown');
    }
    assert.equal(coverageLabel('empty'), 'No assessment evidence');
    assert.match(coverageNextStep('empty', 'fallback'), /does not show.*ability/);
    assert.match(coverageNextStep('partial', 'fallback'), /independent check/);
});
const data = (answered, score = 0) => ({
    student_name: 'Fixture', school_managed: true, speaking_available: true, confidence: 'low', readiness_available: false, band_estimate: null,
    catalog: [{ code: 'bh-reading-screener-a', title: 'Reading', status: 'completed', attempt_id: 'saved', assignment_id: 'assigned', exam_event_id: 'event', duration_minutes: 20, starts_at: '' },
        { code: 'bh-listening-screener-a', title: 'Listening', status: 'ready', attempt_id: null, assignment_id: null, exam_event_id: 'listening', duration_minutes: 20, starts_at: '' }],
    results: { reading: { attempt_id: 'saved', occurred_at: '', conditions_need_review: false, raw_score: score, total: 12, items_answered: answered } },
});
test('empty/partial/unknown results do not count as completed; zero attainment with full coverage does', () => {
    for (const count of [undefined, 0, 6])
        assert.equal(startingPointCompleted(data(count), 'reading'), false);
    assert.equal(startingPointCompleted(data(12), 'reading'), true);
    const flagged = data(12);
    flagged.results.reading.conditions_need_review = true;
    assert.equal(startingPointCompleted(flagged, 'reading'), false);
});
test('next action gathers available Listening evidence instead of reopening exposed Reading', () => {
    const next = journeyNextStep(data(6), { assigned_practice: [] });
    assert.equal(next.route, '/ielts/listening-screener');
    assert.doesNotMatch(next.description, /weak|low ability/);
});
