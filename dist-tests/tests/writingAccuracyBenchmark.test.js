import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateWritingBenchmarkResult, } from '../src/lib/brains_heist/writingAccuracyBenchmark.js';
const cases = JSON.parse(readFileSync('tests/fixtures/writingAccuracyAdversarialV1.json', 'utf8'));
test('accuracy benchmark covers the known false-high and false-low failure families', () => {
    const categories = new Set(cases.map((item) => item.category));
    for (const required of ['keyword_stuffing', 'paraphrase_coverage', 'language_error_density', 'off_topic_fluency', 'instruction_injection']) {
        assert.ok(categories.has(required), `missing ${required}`);
    }
});
test('benchmark gate rejects an inflated keyword-stuffed assessment', () => {
    const benchmark = cases.find((item) => item.id === 'keyword-stuffed-fragment');
    assert.ok(benchmark);
    const inflated = {
        total_score: 15,
        subscores: { content: 3, communicative_achievement: 5, organisation: 3, language: 4 },
        assessment_status: 'verified',
    };
    const result = evaluateWritingBenchmarkResult(benchmark, inflated);
    assert.equal(result.passed, false);
    assert.ok(result.failures.length >= 3);
});
