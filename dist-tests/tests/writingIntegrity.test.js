import test from 'node:test';
import assert from 'node:assert/strict';
import { createWritingCompositionTelemetry, finalizeWritingCompositionTelemetry, recordWritingInput, recordWritingPaste, recordWritingVisibilityHidden, } from '../src/lib/brains_heist/writingIntegrity.js';
test('practice mode records substantial paste and recommends teacher review', () => {
    const started = new Date('2026-07-26T10:00:00.000Z');
    const submission = 'A'.repeat(180);
    let telemetry = createWritingCompositionTelemetry('practice');
    telemetry = recordWritingPaste(telemetry, submission.length, false, started);
    telemetry = recordWritingInput(telemetry, '', submission, started, submission.length);
    const finalized = finalizeWritingCompositionTelemetry(telemetry, submission, '', new Date('2026-07-26T10:01:00.000Z'));
    assert.equal(finalized.review_status, 'review_recommended');
    assert.equal(finalized.paste_ratio, 1);
    assert.deepEqual(finalized.review_reasons, ['substantial_paste']);
});
test('independent mode records a blocked paste without counting it as composed text', () => {
    const telemetry = recordWritingPaste(createWritingCompositionTelemetry('independent'), 240, true, new Date('2026-07-26T10:00:00.000Z'));
    const finalized = finalizeWritingCompositionTelemetry(telemetry, 'This short response was typed in the editor.', '', new Date('2026-07-26T10:01:00.000Z'));
    assert.equal(finalized.blocked_paste_events, 1);
    assert.equal(finalized.pasted_characters, 0);
    assert.equal(finalized.review_status, 'review_recommended');
    assert.ok(finalized.review_reasons.includes('blocked_paste_attempt'));
});
test('supervised mode flags leaving the page and revisions preserve change evidence', () => {
    let telemetry = createWritingCompositionTelemetry('supervised', 'attempt_original');
    telemetry = recordWritingInput(telemetry, '', 'Schools should teach writing with clear examples.', new Date('2026-07-26T10:00:00.000Z'));
    telemetry = recordWritingVisibilityHidden(telemetry);
    const finalized = finalizeWritingCompositionTelemetry(telemetry, 'International schools should teach writing with clear examples and purposeful revision.', 'Schools should teach writing with clear examples.', new Date('2026-07-26T10:02:00.000Z'));
    assert.equal(finalized.revision_origin_attempt_id, 'attempt_original');
    assert.equal(typeof finalized.revision_changed_word_percent, 'number');
    assert.ok(finalized.review_reasons.includes('left_supervised_page'));
});
