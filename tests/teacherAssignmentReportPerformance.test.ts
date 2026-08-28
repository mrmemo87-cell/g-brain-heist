import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (path: string) => fs.readFileSync(path, 'utf8');

test('teacher assignment report opens immediately and loads report payloads in parallel', () => {
  const portal = read('components/TeacherPortal.tsx');
  const start = portal.indexOf('const handleOpenReport = async');
  const end = portal.indexOf('\n  };', portal.indexOf("await Promise.allSettled([loadReportRows(), loadQuestionAnalysis()]);", start)) + 5;
  assert.ok(start >= 0 && end > start, 'handleOpenReport should be present');
  const handler = portal.slice(start, end);

  assert.match(handler, /setView\('report-detail'\)/);
  assert.match(handler, /supabase\.rpc\('rpc_teacher_assignment_report'/);
  assert.match(handler, /supabase\.rpc\('rpc_get_assignment_question_analysis'/);
  assert.match(handler, /Promise\.allSettled\(\[loadReportRows\(\), loadQuestionAnalysis\(\)\]\)/);
  assert.match(handler, /p_teacher_id: teacherId/);
  assert.doesNotMatch(handler, /GameService\.get_teacher_assignment_report/);
  assert.doesNotMatch(handler, /GameService\.get_assignment_question_analysis/);
});

test('teacher report detail progressively renders student results and question analysis', () => {
  const portal = read('components/TeacherPortal.tsx');
  assert.match(portal, /const \[questionAnalysisLoading, setQuestionAnalysisLoading\] = useState\(false\)/);
  assert.match(portal, /Loading student results…/);
  assert.match(portal, /Question analysis is loading in parallel\./);
  assert.match(portal, /Preparing question analysis in parallel…/);
  assert.match(portal, /questionAnalysisLoading \? 'Loading analysis…'/);
});

test('assignment question analysis has a composite assignment-question index', () => {
  const migration = read('supabase/migrations/20260828230500_teacher_assignment_report_performance.sql');
  assert.match(migration, /student_assignment_answers_assignment_question_idx/);
  assert.match(migration, /student_assignment_answers \(assignment_id, question_id\)/);
});
