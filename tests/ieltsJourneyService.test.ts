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
      assigned_practice: [],
      completed_practice: [],
      teacher_feedback: [],
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
    path.join(process.cwd(), 'supabase/migrations/20260519113000_ielts_student_journey_schema_alignment_repair.sql'),
    'utf8',
  );

  assert.match(migration, /rpc_ielts_student_journey\(p_student_id uuid default auth\.uid\(\)\)/i, 'journey RPC must accept an optional student id defaulting to auth.uid()');
  assert.match(migration, /v_student_id\s*=\s*v_actor_id/i, 'students must be able to view only their own journey directly');
  assert.match(migration, /u\.school_id = v_student_school_id/i, 'school admin access must be scoped to the target student school');
  assert.match(migration, /class_teacher_assignments[\s\S]*class_students[\s\S]*cs\.student_id = v_student_id/i, 'teacher access must be scoped through assigned classes');
  assert.match(migration, /if not v_can_view then raise exception 'forbidden'/i, 'journey RPC must deny cross-scope callers');
  assert.match(migration, /to_regclass\('public\.ielts_practice_assignment_students'\)/i, 'journey RPC should read practice assignments only when available');
  assert.match(migration, /ielts_practice_assignment_students/i, 'journey RPC must use assigned practice summary data');
  assert.match(migration, /assigned_practice/i, 'journey RPC must include active assigned practice');
  assert.match(migration, /completed_practice/i, 'journey RPC must include completed practice');
  assert.match(migration, /ielts_productive_skill_reviews/i, 'journey RPC must use the productive skill reviews table');
  assert.match(migration, /review_status = 'finalized'/i, 'journey RPC must include only finalized teacher feedback');
  assert.match(migration, /teacher_feedback/i, 'journey RPC must include finalized teacher feedback');
  assert.match(migration, /review_result_link/i, 'journey RPC must include review result links');
  assert.match(migration, /ielts_exam_submissions/i, 'journey RPC must use Exam Mode submission metadata when available');
  assert.match(migration, /auto_submitted/i, 'journey RPC must include auto-submitted exam attempts');
  assert.match(migration, /Submitted — results pending/i, 'journey RPC must provide pending exam result status messaging');
  assert.doesNotMatch(migration, /private_notes/i, 'journey RPC must not expose private review notes');
  assert.doesNotMatch(migration, /answer_key/i, 'journey RPC must not expose protected answer data');
  assert.doesNotMatch(migration, /rpc_is_ielts_admin|ielts_teachers|is_ielts_admin/i, 'journey RPC must not use legacy IELTS admin permissions');
});



test('IELTS journey objective result links use attempt tables and latest student-owned attempts', () => {
  const migration = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20260522153000_ielts_journey_objective_result_links.sql'),
    'utf8',
  );

  assert.doesNotMatch(migration, /i\.practice_attempt_id/i, 'objective result mapping must not use assignment-item practice_attempt_id');
  assert.match(migration, /from public\.ielts_practice_assignment_items i[\s\S]*left join lateral[\s\S]*from public\.ielts_reading_attempts ra[\s\S]*ra\.user_id = v_student_id[\s\S]*ra\.set_id::text = i\.content_id[\s\S]*order by coalesce\(ra\.completed_at, ra\.started_at\) desc/i, 'reading objective result should use latest student-owned attempt by assignment content mapping');
  assert.match(migration, /left join lateral[\s\S]*from public\.ielts_listening_attempts la[\s\S]*la\.user_id = v_student_id[\s\S]*la\.set_id::text = i\.content_id[\s\S]*order by coalesce\(la\.completed_at, la\.started_at\) desc/i, 'listening objective result should use latest student-owned attempt by assignment content mapping');
  assert.match(migration, /objective_attempt_id/i, 'completed assignment cards should include objective attempt id when found');
  assert.match(migration, /\/ielts\/reading\/result\//i, 'reading result link should render using attempt id');
  assert.match(migration, /\/ielts\/listening\/result\//i, 'listening result link should render using attempt id');
  assert.match(migration, /coalesce\(ra_match\.id, la_match\.id\) is not null/i, 'objective result links should render only when a matched attempt exists');
  assert.match(migration, /score_correct/i, 'objective result payload should expose score_correct from attempts');
  assert.match(migration, /score_total/i, 'objective result payload should expose score_total from attempts');
  assert.match(migration, /percent_correct/i, 'objective result payload should expose percent_correct from attempts');
  assert.match(migration, /coalesce\(meta\.productive_skill_count, 0\) = 0 then 'not_required'/i, 'objective-only cards should remain not_required feedback status');
  assert.match(migration, /Result available\.|Practice completed/i, 'objective-only cards should preserve result-available/completed preview messaging');
  assert.match(migration, /\/ielts\/review-result\//i, 'writing/speaking review links should remain unchanged');
});
test('IELTS journey route, home link, and page use the journey service safely', () => {
  const routes = fs.readFileSync(path.join(process.cwd(), 'index.tsx'), 'utf8');
  const home = fs.readFileSync(path.join(process.cwd(), 'src/pages/ielts/IeltsHome.tsx'), 'utf8');
  const page = fs.readFileSync(path.join(process.cwd(), 'src/pages/ielts/IeltsJourneyDashboard.tsx'), 'utf8');

  assert.match(routes, /path:\s*'\/ielts\/journey'/, 'IELTS journey route must be registered');
  assert.match(home, /navigate\('\/ielts\/journey'\)/, 'IELTS home should link to journey dashboard');
  assert.match(page, /rpcIeltsStudentJourney/, 'journey page must use the journey RPC service');
  assert.match(page, /My IELTS Journey/, 'journey page should include title');
  assert.match(page, /Current assignments/, 'journey page should include current assignments section');
  assert.match(page, /Completed assignments/, 'journey page should include completed assignments section');
  assert.match(page, /Results & Feedback/, 'journey page should include results and feedback section');
  assert.match(page, /Next action/, 'journey page should include next action section');
  assert.match(page, /No current IELTS assignments\./, 'journey page should include current empty state');
  assert.match(page, /No completed IELTS assignments yet\./, 'journey page should include completed empty state');
  assert.match(page, /No reviewed feedback yet\./, 'journey page should include reviewed feedback empty state');
  assert.match(page, /No results available yet\./, 'journey page should include results empty state');
  assert.doesNotMatch(page, /\.from\(['"]ielts_/i, 'journey page must not query raw IELTS tables directly');
  assert.doesNotMatch(page, /answer_key/i, 'journey page must not expose protected answer data');
});

test('IELTS readiness engine SQL normalizes safe skill readiness defensively', () => {
  const migration = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20260518130000_ielts_readiness_engine_foundation.sql'),
    'utf8',
  );

  assert.match(migration, /ielts_latest_skill_readiness\(p_student_id uuid\)/i, 'readiness helper must expose latest skill readiness rows');
  assert.match(migration, /returns table\s*\([\s\S]*skill text[\s\S]*estimated_band numeric[\s\S]*source_type text[\s\S]*source_id text[\s\S]*confidence text[\s\S]*last_activity_at timestamptz/i, 'helper must return the readiness contract');
  assert.match(migration, /to_regclass\('public\.ielts_reading_attempts'\)[\s\S]*information_schema\.columns/i, 'helper must defensively check reading schema');
  assert.match(migration, /public\.ielts_estimated_readiness_band\(%4\$s, %5\$s, %6\$s\)/i, 'reading estimates should be calculated when percent or raw score data exists');
  assert.match(migration, /when pct >= 65 then 6\.0/i, 'raw score mapping should use a conservative readiness band ladder');
  assert.match(migration, /band_overall[\s\S]*band_score[\s\S]*estimated_band[\s\S]*rubric_band/i, 'writing and speaking must use existing rubric or band fields only');
  assert.doesNotMatch(migration, /openai|chatgpt|ask AI|AI to grade/i, 'readiness foundation must not introduce AI grading');
  assert.doesNotMatch(migration, /answer_key/i, 'readiness foundation must not expose protected answer data');
});

test('IELTS journey RPC uses readiness helper and averages available skills only', () => {
  const migration = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20260518130000_ielts_readiness_engine_foundation.sql'),
    'utf8',
  );

  assert.match(migration, /from public\.ielts_latest_skill_readiness\(v_student_id\)/i, 'journey must use the readiness helper');
  assert.match(migration, /from \(values \(v_reading\), \(v_listening\), \(v_writing\), \(v_speaking\)\) estimates\(value\)[\s\S]*where value is not null/i, 'overall readiness must average only available skill values');
  assert.match(migration, /'estimated_band', estimated_band/i, 'recent practice rows should use estimated readiness fields');
  assert.doesNotMatch(migration, /official\s+IELTS\s+(score|band)/i, 'RPC must not overclaim official IELTS scores');
});

test('IELTS mission card clarifies target band and score source labels', () => {
  const missionCard = fs.readFileSync(path.join(process.cwd(), 'src/pages/ielts/components/IeltsMissionCard.tsx'), 'utf8');

  assert.match(missionCard, /No target set/i, 'target band empty state should read No target set');
  assert.match(missionCard, /Set target band/i, 'target band empty state should include CTA to set target');
  assert.match(missionCard, /href="\/ielts\/prime"/i, 'target band CTA should navigate to IELTS Prime setup flow');
  assert.match(missionCard, /Based on your latest completed results and finalized feedback\./i, 'mission card should explain score derivation basis');
  assert.match(missionCard, /reading:\s*'Latest result'/i, 'reading source label should be shown');
  assert.match(missionCard, /listening:\s*'Latest result'/i, 'listening source label should be shown');
  assert.match(missionCard, /writing:\s*'Latest reviewed feedback'/i, 'writing source label should be shown');
  assert.match(missionCard, /speaking:\s*'Latest reviewed feedback'/i, 'speaking source label should be shown');
});

test('IELTS mission card separates current assignment progress from completed practice history', () => {
  const missionCard = fs.readFileSync(path.join(process.cwd(), 'src/pages/ielts/components/IeltsMissionCard.tsx'), 'utf8');

  assert.match(missionCard, /const total = activeAssignments\.length;/i, 'current progress denominator should come only from active assignments');
  assert.match(missionCard, /Current assignment progress/i, 'current assignment progress heading should be explicit');
  assert.match(missionCard, /No active assignments right now\./i, 'no-active-assignment state should be explicit');
  assert.match(missionCard, /Completed practice/i, 'historical completed practice should be shown separately');
  assert.doesNotMatch(missionCard, />\s*Assignment progress\s*</i, 'legacy ambiguous assignment progress label should be removed');
});
