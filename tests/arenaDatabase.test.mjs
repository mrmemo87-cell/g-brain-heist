import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const S = '10000000-0000-0000-0000-000000000001'; // student in class
const O = '10000000-0000-0000-0000-000000000002'; // student, other school
const T = '10000000-0000-0000-0000-000000000003'; // teacher of the class
const A = '10000000-0000-0000-0000-000000000004'; // school admin
const C = '20000000-0000-0000-0000-000000000001'; // school
const C2 = '20000000-0000-0000-0000-000000000002';
const K = '30000000-0000-0000-0000-000000000001'; // class
const TR = '40000000-0000-0000-0000-000000000001'; // teachers row
const IELTS_Q = '50000000-0000-0000-0000-000000000099';

const fixture = `
create schema private; create schema auth; create role anon; create role authenticated;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table public.users (id uuid primary key, username text, role text, school_id uuid, grade text, xp integer default 0, gemstones integer default 0, is_banned boolean default false);
create table public.schools (id uuid primary key);
create table public.school_members (school_id uuid, user_id uuid, role_in_school text, status text);
create table public.teachers (id uuid primary key, user_id uuid);
create table public.classes (id uuid primary key, school_id uuid, class_name text, teacher_id uuid, is_active boolean default true);
create table public.class_students (class_id uuid, student_id uuid, joined_at timestamptz default now());
create table public.class_teacher_assignments (class_id uuid, school_id uuid, teacher_user_id uuid, active boolean default true);
create table public.student_assignments (student_id uuid, assignment_id uuid, status text);
create table public.student_assignment_results (student_id uuid, assignment_id uuid, completed_at timestamptz);
create table public.student_assignment_answers (student_id uuid, question_id uuid, is_correct boolean, answered_at timestamptz default now());
create table public.question_attempts (id uuid primary key default gen_random_uuid(), student_id uuid, question_id uuid, answer_given text, is_correct boolean, points_earned integer, attempted_at timestamptz default now());
create table public.quest_runs (id uuid primary key default gen_random_uuid(), user_id uuid, status text);
create table public.quiz_scores (id uuid primary key default gen_random_uuid(), student_id uuid, percentage integer);
create table public.daily_streak_rewards (user_id uuid, reward_date date);
create table public.questions (id uuid primary key, question_text text, options jsonb, correct_answer text, subject text, is_active boolean, is_public boolean default true,
  verification_status text, pool_scope text, question_type text, verified_content_hash text, current_content_hash text, eligible_grade_levels integer[], image_url text);
insert into public.schools values ('${C}'), ('${C2}');
insert into public.users (id, username, role, school_id, grade) values
  ('${S}', 'Student', 'student', '${C}', '8'), ('${O}', 'Other', 'student', '${C2}', '8'),
  ('${T}', 'Teacher', 'teacher', '${C}', null), ('${A}', 'Admin', 'school_admin', '${C}', null);
insert into public.school_members values ('${C}', '${A}', 'school_admin', 'active');
insert into public.teachers values ('${TR}', '${T}');
insert into public.classes values ('${K}', '${C}', '8A', '${TR}', true);
insert into public.class_students (class_id, student_id) values ('${K}', '${S}');
insert into public.questions select ('50000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 'Question ' || n, '["alpha","beta","gamma","delta"]', 'alpha',
  case when n % 2 = 0 then 'Chemistry' else 'English' end, true, true, 'verified', 'global', 'multiple_choice', 'hash', 'hash', array[8], null from generate_series(1, 20) n;
insert into public.questions values ('${IELTS_Q}', 'IELTS question', '["alpha","beta","gamma","delta"]', 'alpha', 'IELTS Reading', true, true, 'verified', 'global', 'multiple_choice', 'hash', 'hash', array[8], null);
`;

const migration = fs.readdirSync('supabase/migrations').filter((n) => n.includes('_proving_grounds_arena') || n.includes('_arena_on_by_default')).sort().map((n) => fs.readFileSync(`supabase/migrations/${n}`, 'utf8')).join('\n');
async function setup() { const db = new PGlite(); await db.exec(fixture); await db.exec(migration); return db; }
async function as(db, id) { await db.query("select set_config('test.uid', $1, false)", [id || '']); }
async function call(db, q, p = []) { return (await db.query(q, p)).rows[0].value; }
async function withDB(fn) { const db = await setup(); try { await fn(db); } finally { await db.close(); } }
async function enableSchool(db, cap = 5) {
  await as(db, A);
  await call(db, "select public.rpc_arena_update_school_settings($1, true, $2, '00:00', '23:59', true) value", [C, cap]);
  await as(db, S);
}
const status = (db) => call(db, 'select public.rpc_arena_status() value');
const start = (db, fighter = 'rivet') => call(db, 'select public.rpc_arena_start_match($1) value', [fighter]);
const finish = (db, id, mine = 100, theirs = 40, mvp = false) => call(db, 'select public.rpc_arena_finish_match($1, $2, $3, $4) value', [id, mine, theirs, mvp]);
async function backdate(db, id, seconds) { await db.query('update public.arena_matches set started_at = now() - make_interval(secs => $2) where id = $1', [id, seconds]); }
async function giveTickets(db, n) { await db.query('select private.arena_grant_tickets($1, $2, $3)', [S, n, 'test']); }

test('arena is on by default, a school admin can switch it off, and non-students never see it', () => withDB(async (db) => {
  await as(db, S);
  let s = await status(db);
  assert.equal(s.available, true);
  assert.equal(s.daily_cap, 5);
  assert.equal(s.window_start, '15:00');
  await as(db, null);
  await assert.rejects(status(db), /NOT_AUTHENTICATED/);
  await as(db, A);
  await call(db, "select public.rpc_arena_update_school_settings($1, false, 5, '15:00', '23:59', true) value", [C]);
  await as(db, S);
  s = await status(db);
  assert.equal(s.available, false);
  assert.equal(s.reason, 'school_off');
  await giveTickets(db, 3);
  await assert.rejects(start(db), /ARENA_CLOSED:school_off/);
  await as(db, O);
  assert.equal((await status(db)).available, true);
  await as(db, T);
  assert.equal((await status(db)).reason, 'not_student');
}));

test('only a school admin changes school settings and only a class teacher changes class settings', () => withDB(async (db) => {
  await as(db, S);
  await assert.rejects(call(db, "select public.rpc_arena_update_school_settings($1, true, 5, '15:00', '20:00', true) value", [C]), /NOT_AUTHORIZED/);
  await as(db, T);
  await assert.rejects(call(db, "select public.rpc_arena_update_school_settings($1, true, 5, '15:00', '20:00', true) value", [C]), /NOT_AUTHORIZED/);
  await as(db, A);
  await assert.rejects(call(db, "select public.rpc_arena_update_school_settings($1, true, 50, '15:00', '20:00', true) value", [C]), /INVALID_CAP/);
  await assert.rejects(call(db, "select public.rpc_arena_update_school_settings($1, true, 5, '20:00', '15:00', true) value", [C]), /INVALID_WINDOW/);
  const saved = await call(db, "select public.rpc_arena_update_school_settings($1, true, 3, '15:00', '20:00', false) value", [C]);
  assert.equal(saved.daily_cap, 3);
  assert.equal(saved.classes.length, 1);
  await as(db, O);
  await assert.rejects(call(db, 'select public.rpc_arena_update_class_settings($1, false, false) value', [K]), /NOT_AUTHORIZED/);
  await as(db, T);
  const cls = await call(db, 'select public.rpc_arena_update_class_settings($1, false, false) value', [K]);
  assert.equal(cls.class_enabled, false);
  assert.equal(cls.school_enabled, true);
  await db.exec('set role authenticated');
  await assert.rejects(db.query('select * from public.arena_settings'), /permission denied/);
  await assert.rejects(db.query('select * from private.arena_respawn_prompts'), /permission denied/);
  await db.exec('reset role');
}));

test('a class switched off by its teacher blocks that class without affecting the school', () => withDB(async (db) => {
  await enableSchool(db);
  await giveTickets(db, 2);
  await as(db, T);
  await call(db, 'select public.rpc_arena_update_class_settings($1, false, false) value', [K]);
  await as(db, S);
  assert.equal((await status(db)).reason, 'class_off');
  await assert.rejects(start(db), /ARENA_CLOSED:class_off/);
  await as(db, T);
  await call(db, 'select public.rpc_arena_update_class_settings($1, true, true) value', [K]);
  await db.query('insert into public.student_assignments values ($1, gen_random_uuid(), $2)', [S, 'pending']);
  await as(db, S);
  assert.equal((await status(db)).assignment_blocked, true);
  await assert.rejects(start(db), /ARENA_CLOSED:assignment/);
  await db.query('update public.student_assignments set status = $1', ['completed']);
  const m = await start(db);
  assert.ok(m.match_id);
}));

test('tickets come only from learning work, cap at 10 and are spent one per match', () => withDB(async (db) => {
  await enableSchool(db);
  await assert.rejects(start(db), /NO_TICKETS/);
  await db.query('insert into public.quest_runs (user_id, status) values ($1, $2)', [S, 'active']);
  assert.equal((await status(db)).tickets, 0);
  await db.query('update public.quest_runs set status = $1', ['completed']);
  assert.equal((await status(db)).tickets, 1);
  await db.query('update public.quest_runs set status = $1', ['completed']); // no double grant
  assert.equal((await status(db)).tickets, 1);
  await db.query('insert into public.quiz_scores (student_id, percentage) values ($1, 69), ($1, 70)', [S]);
  assert.equal((await status(db)).tickets, 2);
  await db.query('insert into public.student_assignment_results values ($1, gen_random_uuid(), now())', [S]);
  assert.equal((await status(db)).tickets, 4);
  await db.query('insert into public.daily_streak_rewards values ($1, current_date)', [S]);
  assert.equal((await status(db)).tickets, 5);
  await giveTickets(db, 20);
  assert.equal((await status(db)).tickets, 10);
  const m = await start(db);
  assert.equal(m.tickets, 9);
  // a teacher's assignment result for a teacher account grants nothing
  await db.query('insert into public.student_assignment_results values ($1, gen_random_uuid(), now())', [T]);
  assert.equal((await db.query('select arena_tickets from public.users where id = $1', [T])).rows[0].arena_tickets, 0);
}));

test('tickets expire at the start of a new week', () => withDB(async (db) => {
  await enableSchool(db);
  await giveTickets(db, 4);
  await db.query('update public.users set arena_tickets_week = arena_tickets_week - 7 where id = $1', [S]);
  assert.equal((await status(db)).tickets, 0);
}));

test('rewards are paid only for believable matches within the daily cap', () => withDB(async (db) => {
  await enableSchool(db, 3);
  await giveTickets(db, 10);
  const tooShort = await start(db);
  const r1 = await finish(db, tooShort.match_id);
  assert.equal(r1.paid, false);
  assert.equal(r1.trophies_delta, 0);
  const m2 = await start(db);
  await backdate(db, m2.match_id, 90);
  const r2 = await finish(db, m2.match_id, 100, 40, true);
  assert.equal(r2.paid, true);
  assert.equal(r2.trophies_delta, 10);
  assert.equal(r2.xp, 15);
  assert.equal(r2.gems, 2);
  const again = await finish(db, m2.match_id, 100, 0, true);
  assert.equal(again.repeated, true);
  const m3 = await start(db);
  await backdate(db, m3.match_id, 90);
  const r3 = await finish(db, m3.match_id, 20, 100);
  assert.equal(r3.paid, true);
  assert.equal(r3.trophies_delta, -3);
  assert.equal(r3.xp, 5);
  // three finished matches today, the short one included: the cap of 3 is reached
  await assert.rejects(start(db), /DAILY_CAP/);
  const u = (await db.query('select arena_trophies, xp, gemstones from public.users where id = $1', [S])).rows[0];
  assert.equal(u.arena_trophies, 7);
  assert.equal(u.xp, 20);
  assert.equal(u.gemstones, 2);
  await assert.rejects(finish(db, '00000000-0000-0000-0000-000000000000'), /MATCH_NOT_FOUND/);
}));

test('a match that runs too long, or scores outside 0-100, pays nothing', () => withDB(async (db) => {
  await enableSchool(db);
  await giveTickets(db, 3);
  const m = await start(db);
  await backdate(db, m.match_id, 600);
  assert.equal((await finish(db, m.match_id)).paid, false);
  const m2 = await start(db);
  await backdate(db, m2.match_id, 90);
  await assert.rejects(finish(db, m2.match_id, 140, 0), /INVALID_SCORE/);
  // leaving a match open and starting another abandons it without pay
  const m3 = await start(db);
  const abandoned = (await db.query('select result from public.arena_matches where id = $1', [m2.match_id])).rows[0].result;
  assert.equal(abandoned, 'abandoned');
  assert.ok(m3.match_id);
}));

test('trophies never go below zero and unlock fighters on the road', () => withDB(async (db) => {
  await enableSchool(db, 20);
  await giveTickets(db, 10);
  await assert.rejects(start(db, 'vex'), /FIGHTER_LOCKED/);
  await assert.rejects(start(db, 'dragon'), /INVALID_FIGHTER/);
  const m = await start(db);
  await backdate(db, m.match_id, 90);
  const r = await finish(db, m.match_id, 0, 100);
  assert.equal(r.trophies_delta, 0);
  assert.equal(r.trophies, 0);
  await db.query('update public.users set arena_trophies = 39 where id = $1', [S]);
  const m2 = await start(db);
  await backdate(db, m2.match_id, 90);
  const r2 = await finish(db, m2.match_id, 100, 0);
  assert.deepEqual(r2.unlocked, ['vex']);
  assert.ok((await start(db, 'vex')).match_id);
}));

test('respawn questions never come from IELTS, hide the answer key and are checked on the server', () => withDB(async (db) => {
  await enableSchool(db);
  await giveTickets(db, 3);
  await assert.rejects(call(db, 'select public.rpc_arena_respawn_question($1) value', ['00000000-0000-0000-0000-000000000000']), /MATCH_NOT_OPEN/);
  const m = await start(db);
  const seen = new Set();
  for (let i = 0; i < 12; i++) {
    const q = await call(db, 'select public.rpc_arena_respawn_question($1) value', [m.match_id]);
    assert.equal(q.available, true);
    assert.notEqual(q.question_id, IELTS_Q);
    assert.ok(!('correct_answer' in q));
    assert.ok(['rivet', 'fizz'].includes(q.fighter));
    seen.add(q.question_id);
    if (i === 0) {
      const wrong = await call(db, 'select public.rpc_arena_answer_respawn($1, $2, $3) value', [m.match_id, q.prompt_id, 'beta']);
      assert.equal(wrong.correct, false);
      const repeat = await call(db, 'select public.rpc_arena_answer_respawn($1, $2, $3) value', [m.match_id, q.prompt_id, 'alpha']);
      assert.equal(repeat.repeated, true);
      assert.equal(repeat.correct, false);
    } else if (i === 1) {
      const right = await call(db, 'select public.rpc_arena_answer_respawn($1, $2, $3) value', [m.match_id, q.prompt_id, 'alpha']);
      assert.equal(right.correct, true);
      assert.equal(right.xp, 2);
    }
  }
  assert.equal(seen.size, 12);
  await assert.rejects(call(db, 'select public.rpc_arena_respawn_question($1) value', [m.match_id]), /PROMPT_LIMIT/);
  const attempts = (await db.query('select count(*)::int n, count(*) filter (where is_correct)::int c from public.question_attempts where student_id = $1', [S])).rows[0];
  assert.equal(attempts.n, 2);
  assert.equal(attempts.c, 1);
  const row = (await db.query('select respawn_questions, respawn_correct from public.arena_matches where id = $1', [m.match_id])).rows[0];
  assert.equal(row.respawn_questions, 12);
  assert.equal(row.respawn_correct, 1);
  // the other student cannot answer this match's prompts
  await as(db, O);
  await assert.rejects(call(db, 'select public.rpc_arena_answer_respawn($1, $2, $3) value', [m.match_id, '00000000-0000-0000-0000-000000000000', 'alpha']), /PROMPT_NOT_FOUND/);
}));

test('fighter power follows subject mastery, not spending', () => withDB(async (db) => {
  await enableSchool(db);
  let s = await status(db);
  assert.ok(s.fighters.every((f) => f.power === 1));
  // 12 chemistry answers, 11 correct: Fizz reaches power 5; English stays at 1 with too few answers
  await db.query(`insert into public.question_attempts (student_id, question_id, is_correct) select $1, ('50000000-0000-0000-0000-' || lpad((((n - 1) % 10 + 1) * 2)::text, 12, '0'))::uuid, n <= 11 from generate_series(1, 12) n`, [S]);
  await db.query(`insert into public.student_assignment_answers (student_id, question_id, is_correct) values ($1, '50000000-0000-0000-0000-000000000001', true)`, [S]);
  s = await status(db);
  const by = Object.fromEntries(s.fighters.map((f) => [f.id, f]));
  assert.equal(by.fizz.power, 5);
  assert.equal(by.fizz.attempts, 12);
  assert.equal(by.rivet.power, 1);
  assert.equal(by.rivet.attempts, 1);
  await giveTickets(db, 1);
  const m = await start(db, 'fizz');
  assert.equal(m.power, 5);
  assert.equal(m.bot_power, 2);
}));

test('teacher summary and class bonus are scoped to the class teacher', () => withDB(async (db) => {
  await enableSchool(db);
  await as(db, O);
  await assert.rejects(call(db, 'select public.rpc_arena_teacher_summary($1) value', [K]), /NOT_AUTHORIZED/);
  await as(db, T);
  const first = await call(db, 'select public.rpc_arena_class_bonus($1) value', [K]);
  assert.equal(first.granted, 1);
  await assert.rejects(call(db, 'select public.rpc_arena_class_bonus($1) value', [K]), /BONUS_ALREADY_GIVEN/);
  const sum = await call(db, 'select public.rpc_arena_teacher_summary($1) value', [K]);
  assert.equal(sum.tickets_earned_this_week, 1);
  assert.equal(sum.students, 1);
  assert.equal(sum.matches_this_week, 0);
  await as(db, A);
  assert.equal((await call(db, 'select public.rpc_arena_teacher_summary($1) value', [K])).school_enabled, true);
}));
