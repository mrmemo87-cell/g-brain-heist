import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { rpcIeltsStudentJourney, type IeltsJourneyRpcClient } from '../services/ieltsJourneyService.js';

const createClient = (handler: (name: string, params: Record<string, unknown>) => unknown): IeltsJourneyRpcClient => ({
  rpc: ((name: string, params: Record<string, unknown>) => Promise.resolve({ data: handler(name, params), error: null })) as unknown as IeltsJourneyRpcClient['rpc'],
});

test('IELTS journey service maps RPC name and optional student parameter', async () => {
  const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const client = createClient((name, params) => {
    calls.push({ name, params });
    return {
      student_id: 'student-1',
      target_band: null,
      current_estimates: { reading: null, listening: null, writing: null, speaking: null, overall: null },
      confidence_level: 'low',
      recent_practice: [],
      recent_exam_mode_submissions: [],
      assigned_practice_summary: { total: 0, assigned: 0, in_progress: 0, completed: 0, overdue: 0 },
      weak_skill: null,
      next_recommendation: 'Complete a practice set.',
    };
  });

  await rpcIeltsStudentJourney(null, client);
  await rpcIeltsStudentJourney('student-1', client);

  assert.deepEqual(calls, [
    { name: 'rpc_ielts_student_journey', params: { p_student_id: null } },
    { name: 'rpc_ielts_student_journey', params: { p_student_id: 'student-1' } },
  ]);
});

test('IELTS journey SQL is scoped, defensive, and avoids protected answer data', () => {
  const migration = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20260516150000_ielts_student_journey_foundation.sql'),
    'utf8',
  );

  assert.match(migration, /rpc_ielts_student_journey\(p_student_id uuid default auth\.uid\(\)\)/i, 'journey RPC must accept an optional student id defaulting to auth.uid()');
  assert.match(migration, /v_student_id\s*=\s*v_actor_id/i, 'students must be able to view only their own journey directly');
  assert.match(migration, /u\.school_id = v_student_school_id/i, 'school admin access must be scoped to the target student school');
  assert.match(migration, /class_teacher_assignments[\s\S]*class_students[\s\S]*cs\.student_id = v_student_id/i, 'teacher access must be scoped through assigned classes');
  assert.match(migration, /if not v_can_view then raise exception 'forbidden'/i, 'journey RPC must deny cross-scope callers');
  assert.match(migration, /to_regclass\('public\.ielts_reading_attempts'\)[\s\S]*information_schema\.columns/i, 'attempt reads must be defensive about table and column availability');
  assert.match(migration, /ielts_practice_assignment_students/i, 'journey RPC must use assigned practice summary data');
  assert.match(migration, /ielts_exam_submissions/i, 'journey RPC must use Exam Mode submission metadata when available');
  assert.doesNotMatch(migration, /answer_key/i, 'journey RPC must not expose protected answer data');
  assert.doesNotMatch(migration, /rpc_is_ielts_admin|ielts_teachers|is_ielts_admin/i, 'journey RPC must not use legacy IELTS admin permissions');
});

test('IELTS journey route, home link, and page use the journey service safely', () => {
  const routes = fs.readFileSync(path.join(process.cwd(), 'index.tsx'), 'utf8');
  const home = fs.readFileSync(path.join(process.cwd(), 'src/pages/ielts/IeltsHome.tsx'), 'utf8');
  const page = fs.readFileSync(path.join(process.cwd(), 'src/pages/ielts/IeltsJourneyDashboard.tsx'), 'utf8');

  assert.match(routes, /path:\s*'\/ielts\/journey'/, 'IELTS journey route must be registered');
  assert.match(home, /navigate\('\/ielts\/journey'\)/, 'IELTS home should link to journey dashboard');
  assert.match(page, /rpcIeltsStudentJourney/, 'journey page must use the journey RPC service');
  assert.match(page, /Estimated readiness/, 'journey page must use honest readiness wording');
  assert.match(page, /Not enough data|No practice attempts yet|No secure Exam Mode submissions yet/, 'journey page should include empty states');
  assert.doesNotMatch(page, /\.from\(['"]ielts_/i, 'journey page must not query raw IELTS tables directly');
  assert.doesNotMatch(page, /answer_key/i, 'journey page must not expose protected answer data');
});
