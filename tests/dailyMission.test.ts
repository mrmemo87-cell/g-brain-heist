import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('supabase/migrations/20261021130000_daily_mission.sql', 'utf8');
const service = readFileSync('services/dailyMissionService.ts', 'utf8');
const card = readFileSync('components/student/DailyMissionCard.tsx', 'utf8');
const app = readFileSync('App.tsx', 'utf8');
const guide = readFileSync('components/StreakRewardGuide.tsx', 'utf8');

test('the daily streak reward is earned by finishing the mission, not by logging in', () => {
  assert.match(migration, /create or replace function public\.rpc_record_daily_streak\(\)/i);
  assert.match(migration, /'mission_required', true/);
  assert.match(migration, /cardinality\(v_mission\.answered_ids\) >= cardinality\(v_mission\.question_ids\)[\s\S]*private\.award_daily_streak/i);
});

test('students without a mission keep the login reward', () => {
  assert.match(migration, /if v_ids is null or cardinality\(v_ids\) < 5 then\s+return null;/i);
  assert.match(migration, /return private\.award_daily_streak\(v_user_id, v_today\);\s+end;/i);
});

test('missions start from the student’s own recent mistakes', () => {
  assert.match(migration, /student_assignment_answers a\s+where a\.student_id = p_user_id and a\.is_correct = false/i);
  assert.match(migration, /\(array\['review', 'topic', 'subject', 'grade'\]\)/);
  assert.match(migration, /qa\.is_correct and qa\.attempted_at > now\(\) - interval '7 days'/i);
});

test('mission answers are graded on the server and never sent ahead of time', () => {
  const getMission = migration.slice(migration.indexOf('function public.rpc_get_daily_mission'), migration.indexOf('function public.rpc_submit_daily_mission_answer'));
  assert.doesNotMatch(getMission, /correct_answer/);
  assert.match(migration, /v_result := public\.rpc_submit_mcq_answer\(p_question_id, p_answer\)/);
  assert.match(migration, /Question is not part of today''s mission/);
  assert.match(migration, /Question already answered/);
});

test('mission functions are closed to anonymous callers and reward helpers are private', () => {
  assert.match(migration, /revoke all on function public\.rpc_get_daily_mission\(\) from public, anon/i);
  assert.match(migration, /revoke all on function public\.rpc_submit_daily_mission_answer\(uuid, text\) from public, anon/i);
  assert.match(migration, /revoke all on function private\.award_daily_streak\(uuid, date\) from public, anon, authenticated/i);
  assert.match(migration, /alter table public\.daily_missions enable row level security/i);
});

test('the dashboard shows the mission card and celebrates the reward', () => {
  assert.match(service, /rpc\('rpc_get_daily_mission'\)/);
  assert.match(service, /rpc\('rpc_submit_daily_mission_answer'/);
  assert.match(card, /Start mission/);
  assert.match(card, /if \(reward\) onStreakReward\?\.\(reward\);/);
  assert.match(app, /<DailyMissionCard/);
  assert.match(app, /setStreakRewardData\(receipt\)/);
  assert.match(guide, /Finish today’s mission/);
});

test('the dashboard hides the card when the mission is unavailable', () => {
  assert.match(service, /if \(error \|\| !data \|\| data\.available !== true\) return null;/);
  assert.match(card, /if \(!loaded \|\| !mission\) return null;/);
});
