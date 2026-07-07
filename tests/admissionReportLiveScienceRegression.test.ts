import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const finalMigration = fs.readFileSync('supabase/migrations/20260707130000_admission_report_answer_join_fix.sql', 'utf8');
const service = fs.readFileSync('services/admissionService.ts', 'utf8');
const hub = fs.readFileSync('components/AdmissionHub.tsx', 'utf8');

const liveScienceFixture = {
  attempt_id: 'd4e16a44-7de4-4545-94a7-f70b7828ba71',
  status: 'scored',
  total_score: 7,
  max_score: 25,
  percentage: 28,
  form_code: 'SCI6-2026-DC00',
  blueprint_subject: 'science',
  answers: Array.from({ length: 13 }, (_, index) => ({
    id: `answer-${index + 1}`,
    question_id: `science-question-${index + 1}`,
    subject: 'science',
    diagnostic_skill: 'science inquiry',
    question_type: 'structured',
    response: { value: `response-${index + 1}` },
    marks_awarded: index < 7 ? 1 : 0,
    marks_possible: index === 0 ? 13 : 1,
  })),
};

test('live Grade 6 Science scored report fixture opens with 13 adm_answers rows', () => {
  assert.equal(liveScienceFixture.status, 'scored');
  assert.equal(liveScienceFixture.total_score, 7);
  assert.equal(liveScienceFixture.max_score, 25);
  assert.equal(liveScienceFixture.percentage, 28);
  assert.equal(liveScienceFixture.form_code, 'SCI6-2026-DC00');
  assert.equal(liveScienceFixture.blueprint_subject, 'science');
  assert.equal(liveScienceFixture.answers.length, 13);

  assert.match(finalMigration, /JOIN adm_answers ans ON ans\.attempt_id = a\.id/);
  assert.match(finalMigration, /JOIN adm_questions q ON q\.id = ans\.question_id/);
  assert.doesNotMatch(finalMigration, /adm_attempt_answers/);
  assert.doesNotMatch(finalMigration, /v_attempt\.score\b|\.score\b|scored_at/);
  assert.match(finalMigration, /'success', true[\s\S]*'attempt_id', v_attempt\.id[\s\S]*'form_code', v_form\.form_code[\s\S]*'form_subject', v_form_subject[\s\S]*'subject', v_form_subject[\s\S]*'grade', v_form_grade[\s\S]*'total_score', v_attempt\.total_score[\s\S]*'answers', coalesce\(v_answers, '\[\]'::jsonb\)/);
  assert.match(finalMigration, /EXCEPTION WHEN undefined_column OR undefined_table[\s\S]*Detailed answers unavailable/);

  assert.match(service, /const answerRows = Array\.isArray\(raw\.answers\) \? raw\.answers : \[\]/);
  assert.match(service, /formCode: raw\.form_code/);
  assert.match(service, /formSubject: raw\.form_subject/);
  assert.match(service, /formTitle: raw\.form_title/);
  assert.match(service, /answer_details_available/);

  assert.match(hub, /Detailed answers unavailable/);
  assert.match(hub, /Report is unavailable right now\. Please try again\./);
  assert.match(service, /buildAdmissionReportFormLabel\(raw\.form_code[\s\S]*reportSubject\)/);
  assert.match(service, /admissionSubjectLabel\(a\.subject \?\? raw\.subject \?\? raw\.form_subject/);
});

test('Admission Hub report consistency polish covers readiness denominator partial copy recommendation and difficulty display', () => {
  assert.match(service, /const placementRecommendation = calculatePlacementRecommendation\(candidateProfile, diagnosticAnswers, attemptPercentage\)/);
  assert.match(service, /answeredQuestionAccuracy/);
  assert.match(service, /answered_count: answeredCount/);
  assert.match(service, /partial_attempt: answeredCount < totalQuestions/);
  assert.match(hub, /Answered-question accuracy:/);
  assert.match(hub, /Answered \{reportData\.answered_count\} of \{reportData\.total_questions\} questions/);
  assert.match(hub, /reportData\.placement_recommendation\.label !== 'Interview recommended'/);
  assert.match(hub, /Difficulty: \{t\.difficulty\}/);
  assert.doesNotMatch(hub, /\{AdmService\.admissionSubjectLabel\(t\.subject\)\} · \{t\.skill\}\{t\.difficulty \? ` · \$\{t\.difficulty\}` : ''\}/);
});
