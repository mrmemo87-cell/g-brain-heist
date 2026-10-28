import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const TEACHER = id(1), OTHER_TEACHER = id(2), MINE_ON = id(11), MINE_OFF = id(12), SUSPENDED = id(13), NOT_MINE = id(21);
const SCHOOL = id(100);

await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create schema private;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table auth.users(id uuid primary key);
create table public.assignments(id uuid primary key default gen_random_uuid(), title text, subject_name text,
  publish_status text default 'published', assigned_at timestamptz default now(), due_at timestamptz);
create table public.student_assignments(id uuid primary key default gen_random_uuid(), assignment_id uuid, student_id uuid,
  status text default 'pending', due_at timestamptz);
insert into auth.users values ('${TEACHER}'),('${OTHER_TEACHER}'),('${MINE_ON}'),('${MINE_OFF}'),('${SUSPENDED}'),('${NOT_MINE}');
-- Stand-in for the production roster RPC: rows scoped to auth.uid(), same output columns used here.
create table public.test_roster(teacher uuid, student_id uuid, school_id uuid, access_status text);
insert into public.test_roster values
  ('${TEACHER}','${MINE_ON}','${SCHOOL}','active'),('${TEACHER}','${MINE_OFF}','${SCHOOL}','active'),
  ('${TEACHER}','${SUSPENDED}','${SCHOOL}','suspended'),('${OTHER_TEACHER}','${NOT_MINE}','${SCHOOL}','active');
create function public.rpc_get_my_teacher_class_roster()
returns table(school_id uuid, student_id uuid, access_status text)
language sql stable security definer set search_path = '' as $$
  select r.school_id, r.student_id, r.access_status from public.test_roster r where r.teacher = auth.uid() $$;
`);
await db.exec(readFileSync('supabase/migrations/20261028170000_student_push_notifications.sql', 'utf8'));
await db.exec(readFileSync('supabase/migrations/20261029090000_teacher_push_announcements.sql', 'utf8'));
await db.exec(`grant usage on schema public to anon, authenticated, service_role;
insert into public.push_subscriptions(user_id, endpoint, p256dh, auth) values
  ('${MINE_ON}','https://push.example/on','k','a'),('${NOT_MINE}','https://push.example/other','k','a'),('${SUSPENDED}','https://push.example/s','k','a');`);

const as = async (user, fn) => {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? '']);
  await db.exec(`set role ${user ? 'authenticated' : 'anon'}`);
  try { return await fn(); } finally { await db.exec('reset role'); }
};
const send = (ids, title, body) => db.query('select public.rpc_teacher_send_push_announcement($1::uuid[], $2, $3) r', [ids, title, body]).then((x) => x.rows[0].r);
const announcements = async () => (await db.query("select * from public.push_notification_outbox where event_type='teacher_announcement' order by created_at")).rows;

test('a teacher reaches their own students; only students with notifications on get a queued message', async () => {
  const result = await as(TEACHER, () => send([MINE_ON, MINE_OFF, MINE_ON], '', 'Bring your textbooks tomorrow.'));
  assert.equal(result.recipients, 2, 'duplicates collapse');
  assert.equal(result.reachable, 1);
  const rows = await announcements();
  assert.deepEqual(rows.map((r) => r.user_id), [MINE_ON]);
  assert.equal(rows[0].title, 'Message from your teacher', 'blank title gets the default');
  assert.equal(rows[0].body, 'Bring your textbooks tomorrow.');
  assert.equal(rows[0].payload.announcement_id, result.announcement_id);
  const audit = (await db.query('select * from public.push_announcements')).rows;
  assert.equal(audit.length, 1);
  assert.equal(audit[0].school_id, SCHOOL);
  assert.equal(audit[0].recipient_count, 2);
});

test('students outside the roster, suspended students and empty selections are refused, and nothing is queued', async () => {
  const before = (await announcements()).length;
  await assert.rejects(as(TEACHER, () => send([MINE_ON, NOT_MINE], 'Hi', 'Hello')), /student_not_in_your_classes/);
  await assert.rejects(as(TEACHER, () => send([SUSPENDED], 'Hi', 'Hello')), /student_not_in_your_classes/);
  await assert.rejects(as(TEACHER, () => send([], 'Hi', 'Hello')), /recipients_required/);
  await assert.rejects(as(TEACHER, () => send([MINE_ON], 'Hi', '   ')), /message_required/);
  await assert.rejects(as(TEACHER, () => send([MINE_ON], 'Hi', 'x'.repeat(201))), /message_too_long/);
  await assert.rejects(as(MINE_ON, () => send([MINE_OFF], 'Hi', 'Hello')), /student_not_in_your_classes/, 'a student has no roster');
  await assert.rejects(as(null, () => send([MINE_ON], 'Hi', 'Hello')), /permission denied/i, 'anon cannot call it');
  assert.equal((await announcements()).length, before);
  assert.equal((await db.query('select count(*)::int c from public.push_announcements')).rows[0].c, 1, 'no audit rows for refusals');
});

test('reachable-students check only reveals the caller\'s own roster; audit rows are private to the sender', async () => {
  const mine = await as(TEACHER, async () => (await db.query('select public.rpc_teacher_push_reachable_students($1::uuid[]) r', [[MINE_ON, MINE_OFF, NOT_MINE]])).rows[0].r);
  assert.deepEqual(mine, [MINE_ON]);
  const theirs = await as(OTHER_TEACHER, async () => ({
    reachable: (await db.query('select public.rpc_teacher_push_reachable_students($1::uuid[]) r', [[MINE_ON, NOT_MINE]])).rows[0].r,
    audit: (await db.query('select * from public.push_announcements')).rows,
  }));
  assert.deepEqual(theirs.reachable, [NOT_MINE]);
  assert.equal(theirs.audit.length, 0, 'cannot read another teacher\'s announcements');
  await assert.rejects(as(TEACHER, () => db.query('select * from public.push_notification_outbox')), /permission denied/i);
  await assert.rejects(as(TEACHER, () => db.query(`insert into public.push_announcements(teacher_user_id,title,body) values ('${TEACHER}','x','y')`)), /permission denied/i);
});

test('a teacher can send at most 20 announcements in 24 hours', async () => {
  for (let i = 0; i < 19; i += 1) await as(TEACHER, () => send([MINE_ON], `Note ${i}`, 'Reminder'));
  await assert.rejects(as(TEACHER, () => send([MINE_ON], 'One too many', 'Reminder')), /announcement_limit_reached/);
  await db.query(`update public.push_announcements set created_at = now() - interval '25 hours'`);
  const ok = await as(TEACHER, () => send([MINE_ON], 'Next day', 'Reminder'));
  assert.equal(ok.recipients, 1, 'the window rolls');
});
