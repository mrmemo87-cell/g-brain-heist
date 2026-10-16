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
  const page = fs.readFileSync(path.join(process.cwd(), 'src/pages/ielts/IeltsJourneyDashboard.tsx'), 'utf8') + fs.readFileSync(path.join(process.cwd(), 'src/pages/ielts/components/IeltsStudentJourney.tsx'), 'utf8');

  assert.match(routes, /path:\s*'\/ielts\/journey'/, 'IELTS journey route must be registered');
  assert.match(home, /navigate\('\/ielts\/journey'\)/, 'IELTS home should link to journey dashboard');
  assert.match(page, /rpcIeltsStudentJourney/, 'journey page must use the journey RPC service');
  assert.match(page, /My IELTS Journey/, 'journey page should include title');
  assert.match(page, /School assignments/, 'journey must explain the practice step');
  assert.match(page, /Your learning trail/, 'saved screeners and reviews must be included');
  assert.match(page, /Teacher feedback/, 'shared comments must be clearly attributed');
  assert.match(page, /Your next step/, 'there must be a useful next action');
  assert.match(page, /No active school assignments right now/, 'no task must be invented');
  assert.match(page, /Your feedback will appear here/, 'pending feedback must not become a zero score');
  assert.match(page, /What about my estimated band/, 'band eligibility must be explained');
  assert.doesNotMatch(page, /\.from\(['"]ielts_/i, 'journey page must not query raw IELTS tables directly');
  assert.doesNotMatch(page, /answer_key/i, 'journey page must not expose protected answer data');
});

test('IELTS Bible alignment migration fails closed on legacy readiness sources', () => {
  const migration = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20261005111500_ielts_diagnostic_bible_alignment.sql'),
    'utf8',
  );

  assert.match(migration, /revoke all on function public\.ielts_estimated_readiness_band\(numeric,numeric,numeric\) from public, anon, authenticated/i, 'generic percentage-to-band helper must not be callable by browser users');
  assert.match(migration, /create or replace function public\.ielts_latest_skill_readiness\(p_student_id uuid\)[\s\S]*where false;/i, 'legacy practice evidence must fail closed instead of becoming readiness');
  assert.match(migration, /grant execute on function public\.ielts_latest_skill_readiness\(uuid\) to service_role/i, 'readiness bridge must stay server-only');
  assert.match(migration, /'reading', null[\s\S]*'listening', null[\s\S]*'writing', null[\s\S]*'speaking', null[\s\S]*'overall', null/i, 'student journey must suppress unverified per-skill and overall readiness');
  assert.match(migration, /item - 'estimated_band'/i, 'completed practice cards must strip legacy estimated-band metadata');
  assert.match(migration, /'\{latest_overall_estimate\}', 'null'::jsonb/i, 'school results must suppress unverified overall readiness');
  assert.match(migration, /'\{summary,average_estimated_overall\}',[\s\S]*'null'::jsonb/i, 'school summary must not average partial or legacy readiness');
});

test('IELTS journey public contract keeps practice separate from verified readiness', () => {
  const migration = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20261005111500_ielts_diagnostic_bible_alignment.sql'),
    'utf8',
  );

  assert.match(migration, /private\.actor_can_access_school_programme\(v_school_id, 'ielts', false\)/i, 'student journey must preserve school programme access checks');
  assert.match(migration, /v_result := public\.rpc_ielts_student_journey_entitlement_internal\(v_student_id\)/i, 'public wrapper must retain the authorized internal journey source');
  assert.match(migration, /'\{confidence_level\}', to_jsonb\('low'::text\)/i, 'confidence must fail closed while verified readiness evidence is unavailable');
  assert.match(migration, /'\{weak_skill\}', 'null'::jsonb/i, 'a tested or practised skill must not automatically become the weak skill');
  assert.doesNotMatch(migration, /avg\([^)]*latest_(?:reading|listening|writing|speaking)_estimate/i, 'Bible alignment must not derive an overall score from partial skill estimates');
});

test('IELTS mission card keeps practice separate from verified readiness', () => {
  const missionCard = fs.readFileSync(path.join(process.cwd(), 'src/pages/ielts/components/IeltsMissionCard.tsx'), 'utf8');

  assert.match(missionCard, /No target set/i, 'target band empty state should read No target set');
  assert.match(missionCard, /Set target band/i, 'target band empty state should include CTA to set target');
  assert.match(missionCard, /href="\/ielts\/prime"/i, 'target band CTA should navigate to IELTS Prime setup flow');
  assert.match(missionCard, /Readiness appears only when verified evidence meets the required skill coverage/i, 'mission card must explain readiness evidence gating');
  assert.equal((missionCard.match(/Verified readiness pending/g) || []).length, 4, 'each skill must fail closed until verified readiness exists');
  assert.doesNotMatch(missionCard, /reading:\s*'Latest result'|listening:\s*'Latest result'/i, 'practice results must not masquerade as readiness sources');
});

test('IELTS mission card separates current assignment progress from completed practice history', () => {
  const missionCard = fs.readFileSync(path.join(process.cwd(), 'src/pages/ielts/components/IeltsMissionCard.tsx'), 'utf8');

  assert.match(missionCard, /const total = activeAssignments\.length;/i, 'current progress denominator should come only from active assignments');
  assert.match(missionCard, /Current assignment progress/i, 'current assignment progress heading should be explicit');
  assert.match(missionCard, /No active assignments right now\./i, 'no-active-assignment state should be explicit');
  assert.match(missionCard, /Completed practice/i, 'historical completed practice should be shown separately');
  assert.doesNotMatch(missionCard, />\s*Assignment progress\s*</i, 'legacy ambiguous assignment progress label should be removed');
});
