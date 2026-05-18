import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { rpcIeltsSchoolResults, type IeltsResultsRpcClient } from '../services/ieltsResultsService.js';

const createClient = (handler: (name: string, params: Record<string, unknown>) => unknown): IeltsResultsRpcClient => ({
  rpc: ((name: string, params: Record<string, unknown>) => Promise.resolve({ data: handler(name, params), error: null })) as unknown as IeltsResultsRpcClient['rpc'],
});

test('IELTS results service maps school results RPC parameters', async () => {
  const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const client = createClient((name, params) => {
    calls.push({ name, params });
    return {
      school_id: 'school-1',
      filters_applied: { class_id: params['p_class_id'], student_id: params['p_student_id'], limit: params['p_limit'] },
      summary: {
        total_students: 1,
        assigned_practice_count: 2,
        completed_practice_count: 1,
        exam_submission_count: 3,
        average_estimated_overall: 6.5,
      },
      students: [{
        student_id: 'student-1',
        username: 'Learner',
        email: 'learner@example.com',
        class_id: 'class-1',
        class_name: 'Class A',
        assigned_practice_total: 2,
        completed_practice_total: 1,
        latest_reading_estimate: 6,
        latest_listening_estimate: 6.5,
        latest_writing_estimate: null,
        latest_speaking_estimate: 7,
        latest_overall_estimate: 6.5,
        last_activity_at: '2026-05-16T12:00:00Z',
      }],
    };
  });

  const response = await rpcIeltsSchoolResults({ schoolId: 'school-1', classId: 'class-1', studentId: 'student-1', limit: 25 }, client);

  assert.equal(response.summary.average_estimated_overall, 6.5);
  assert.equal(response.students[0].latest_speaking_estimate, 7);
  assert.deepEqual(calls, [{
    name: 'rpc_ielts_school_results',
    params: { p_school_id: 'school-1', p_class_id: 'class-1', p_student_id: 'student-1', p_limit: 25 },
  }]);
});

test('IELTS results service defaults optional filters safely', async () => {
  const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const client = createClient((name, params) => {
    calls.push({ name, params });
    return {
      school_id: 'school-1',
      filters_applied: { class_id: null, student_id: null, limit: 100 },
      summary: {
        total_students: 0,
        assigned_practice_count: 0,
        completed_practice_count: 0,
        exam_submission_count: 0,
        average_estimated_overall: null,
      },
      students: [],
    };
  });

  await rpcIeltsSchoolResults({}, client);

  assert.deepEqual(calls, [{
    name: 'rpc_ielts_school_results',
    params: { p_school_id: null, p_class_id: null, p_student_id: null, p_limit: 100 },
  }]);
});

test('IELTS Results tab uses scoped results RPC and Estimated readiness wording', () => {
  const tab = fs.readFileSync(path.join(process.cwd(), 'components/school-admin/tabs/IeltsResultsTab.tsx'), 'utf8');

  assert.match(tab, /rpcIeltsSchoolResults/, 'Results tab must load rows through the scoped results service');
  assert.match(tab, /Loading results/, 'Results tab must include a loading state');
  assert.match(tab, /Unable to load IELTS Results/, 'Results tab must include an error state');
  assert.match(tab, /Results have no completed practice yet/, 'Results tab must include a completed-practice empty state');
  assert.match(tab, /Total students/, 'Results tab must show total students summary');
  assert.match(tab, /Assigned practice/, 'Results tab must show assigned practice summary');
  assert.match(tab, /Completed practice/, 'Results tab must show completed practice summary');
  assert.match(tab, /Exam submissions/, 'Results tab must show exam submissions summary');
  assert.match(tab, /Estimated readiness/, 'Results tab must use Estimated readiness wording');
  assert.match(tab, /selectedClassId/, 'Results tab should expose a simple class filter');
  assert.match(tab, /selectedStudentId/, 'Results tab should expose a simple student filter');
  assert.doesNotMatch(tab, /official\s+IELTS\s+score/i, 'Results tab must not label readiness with certified-score wording');
  assert.doesNotMatch(tab, /answer_key/i, 'Results tab must not expose protected answer data');
  assert.doesNotMatch(tab, /rpc_is_ielts_admin|ielts_teachers|is_ielts_admin/i, 'Results tab must not rely on legacy IELTS admin permissions');
  assert.doesNotMatch(tab, /\.from\(['"]ielts_/i, 'Results tab must not query raw IELTS tables directly');
});

test('IELTS results service and SQL avoid protected data and legacy admin paths', () => {
  const service = fs.readFileSync(path.join(process.cwd(), 'services/ieltsResultsService.ts'), 'utf8');
  const migration = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20260516160000_ielts_school_results_foundation.sql'),
    'utf8',
  );

  assert.match(service, /rpc_ielts_school_results/, 'service must wrap the school results RPC');
  assert.match(service, /IeltsSchoolResultsSummary/, 'service must expose a typed summary interface');
  assert.match(service, /IeltsSchoolResultsStudentRow/, 'service must expose a typed student row interface');
  assert.match(service, /IeltsSchoolResultsFiltersApplied/, 'service must expose typed applied filters');
  assert.match(service, /IeltsSchoolResultsResponse/, 'service must expose a typed response interface');
  assert.doesNotMatch(service, /\.from\(['"]ielts_/i, 'service must not query raw IELTS tables directly');
  assert.doesNotMatch(service, /answer_key/i, 'service must not expose protected answer data');
  assert.doesNotMatch(service, /rpc_is_ielts_admin|ielts_teachers|is_ielts_admin/i, 'service must not use legacy IELTS admin permissions');

  assert.doesNotMatch(migration, /answer_key/i, 'results RPC must not expose protected answer data');
  assert.doesNotMatch(migration, /rpc_is_ielts_admin|ielts_teachers|is_ielts_admin/i, 'results RPC must not use legacy IELTS admin permissions');
});

test('IELTS school results RPC uses readiness helper without legacy admin or protected answer data', () => {
  const migration = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20260518130000_ielts_readiness_engine_foundation.sql'),
    'utf8',
  );

  assert.match(migration, /left join lateral public\.ielts_latest_skill_readiness\(target\.student_id\) readiness on true/i, 'school results must use the shared readiness helper');
  assert.match(migration, /latest_reading_estimate = r\.reading[\s\S]*latest_writing_estimate = r\.writing/i, 'school results must hydrate skill estimate fields from readiness rows');
  assert.match(migration, /cross join lateral \(values \(base\.latest_reading_estimate\), \(base\.latest_listening_estimate\), \(base\.latest_writing_estimate\), \(base\.latest_speaking_estimate\)\) v\(value\)[\s\S]*where value is not null/i, 'school results overall must average available skills only');
  assert.doesNotMatch(migration, /answer_key/i, 'school results readiness foundation must not expose protected answer data');
  assert.doesNotMatch(migration, /rpc_is_ielts_admin|ielts_teachers|is_ielts_admin/i, 'school results must not depend on legacy IELTS admin permissions');
});
