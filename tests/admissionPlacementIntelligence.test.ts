import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateDiagnosticBreakdown, calculatePlacementRecommendation } from '../src/lib/admissionPlacementIntelligence.js';

test('calculates diagnostic breakdown from tagged questions', () => {
  const rows = calculateDiagnosticBreakdown([
    { subject: 'english', diagnostic_skill: 'reading', difficulty: 'easy', marks_awarded: 2, marks_possible: 2 },
    { subject: 'english', diagnostic_skill: 'reading', difficulty: 'easy', marks_awarded: 1, marks_possible: 2 },
    { subject: 'math', diagnostic_skill: 'number', difficulty: 'medium', marks_awarded: 0, marks_possible: 2 },
  ]);
  const reading = rows.find(r => r.subject === 'english' && r.skill === 'reading');
  assert.equal(reading?.score, 3);
  assert.equal(reading?.maxScore, 4);
  assert.equal(reading?.percentage, 75);
});

test('recommends English support when maths is strong and English is weak', () => {
  const rec = calculatePlacementRecommendation({ applied_grade: 7, current_grade: 7 }, [
    { subject: 'english', diagnostic_skill: 'grammar', marks_awarded: 4, marks_possible: 10 },
    { subject: 'math', diagnostic_skill: 'number', marks_awarded: 8, marks_possible: 10 },
  ]);
  assert.equal(rec.label, 'Accept with English support');
  assert.equal(rec.interviewFlag, false);
  assert.ok(rec.reasons.some(r => r.includes('English readiness')));
});

test('falls back gracefully when diagnostic tags or one subject are missing', () => {
  const rec = calculatePlacementRecommendation({}, [
    { subject: 'english', topic: null, marks_awarded: 7, marks_possible: 10 },
  ]);
  assert.equal(rec.mathsPercentage, null);
  assert.ok(rec.reasons.some(r => r.includes('English readiness')));
  assert.ok(!rec.reasons.some(r => r.includes('Maths readiness is 70')));
});

test('flags large grade mismatch for interview', () => {
  const rec = calculatePlacementRecommendation({ applied_grade: 9, current_grade: 6 }, [
    { subject: 'english', diagnostic_skill: 'reading', marks_awarded: 9, marks_possible: 10 },
    { subject: 'math', diagnostic_skill: 'number', marks_awarded: 9, marks_possible: 10 },
  ]);
  assert.equal(rec.label, 'Interview recommended');
  assert.equal(rec.interviewFlag, true);
});

test('fallback subject derives from MAT ENG SCI form codes', () => {
  const rows = calculateDiagnosticBreakdown([
    { form_code: 'MAT6-2026-0F31', diagnostic_skill: 'Algebraic thinking', marks_awarded: 1, marks_possible: 2 },
    { form_code: 'ENG6-2026-AAAA', diagnostic_skill: 'Reading', marks_awarded: 1, marks_possible: 1 },
    { form_code: 'SCI6-2026-BBBB', diagnostic_skill: 'Forces', marks_awarded: 0, marks_possible: 1 },
  ]);
  assert.ok(rows.some(r => r.subject === 'math' && r.label.includes('Maths')));
  assert.ok(rows.some(r => r.subject === 'english'));
  assert.ok(rows.some(r => r.subject === 'science'));
  assert.ok(!rows.some(r => r.subject === 'unknown'));
});

test('single-subject Science reports keep Science labels and readiness only', () => {
  const answers = [
    { form_code: 'SCI6-2026-LIVE', content_version: 'admission_science_grade6_v1', diagnostic_skill: 'Forces / physics', marks_awarded: 1, marks_possible: 4 },
    { form_code: 'SCI6-2026-LIVE', content_version: 'admission_science_grade6_v1', diagnostic_skill: 'Scientific enquiry / working scientifically', marks_awarded: 0, marks_possible: 3 },
  ];
  const rows = calculateDiagnosticBreakdown(answers);
  assert.ok(rows.every(r => r.label.startsWith('Science · ')));
  assert.ok(!rows.some(r => /Unknown|General/.test(r.label)));
  const rec = calculatePlacementRecommendation({ applied_grade: 6 }, answers, 28);
  assert.equal(rec.sciencePercentage, 28);
  assert.equal(rec.englishPercentage, null);
  assert.equal(rec.mathsPercentage, null);
  assert.equal(rec.currentSubject, 'science');
  assert.ok(rec.reasons.some(r => r.includes('Science readiness')));
  assert.ok(!rec.reasons.some(r => r.includes('English readiness is 28') || r.includes('Maths readiness is 28')));
});

test('diagnostic rows use friendly subject labels from ENG MAT SCI form codes', () => {
  const rows = calculateDiagnosticBreakdown([
    { form_code: 'MAT6-2026-0F31', diagnostic_skill: 'Algebraic thinking', marks_awarded: 1, marks_possible: 2 },
    { form_code: 'ENG6-2026-AAAA', diagnostic_skill: 'Reading', marks_awarded: 1, marks_possible: 1 },
    { form_code: 'SCI6-2026-BBBB', diagnostic_skill: 'Forces', marks_awarded: 0, marks_possible: 1 },
  ]);
  assert.ok(rows.some(r => r.label === 'Maths · Algebraic thinking'));
  assert.ok(rows.some(r => r.label === 'English · Reading'));
  assert.ok(rows.some(r => r.label === 'Science · Forces'));
  assert.ok(!rows.some(r => /Unknown|General/.test(r.label)));
});

test('single-subject Science readiness uses scored attempt percentage instead of answered-only accuracy', () => {
  const answers = Array.from({ length: 13 }, (_, index) => ({
    form_code: 'SCI6-2026-DC00',
    subject: 'science',
    diagnostic_skill: 'Earth and space',
    difficulty: 'medium',
    marks_awarded: index < 7 ? 1 : 0,
    marks_possible: 1,
  }));
  const rec = calculatePlacementRecommendation({ applied_grade: 6 }, answers, 28);
  assert.equal(rec.sciencePercentage, 28);
  assert.ok(rec.reasons.includes('Science readiness is 28%.'));
  assert.ok(!rec.reasons.some(r => r.includes('Science readiness is 54%')));
});

test('diagnostic labels keep difficulty separate from the main subject and topic label', () => {
  const rows = calculateDiagnosticBreakdown([
    { form_code: 'SCI6-2026-DC00', diagnostic_skill: 'Earth and space', difficulty: 'medium', marks_awarded: 1, marks_possible: 1 },
  ]);
  assert.equal(rows[0]?.label, 'Science · Earth and space');
  assert.equal(rows[0]?.difficulty, 'medium');
  assert.notEqual(rows[0]?.label, 'Science · Earth and space · medium');
});
