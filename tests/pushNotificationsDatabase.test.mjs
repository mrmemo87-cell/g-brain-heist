import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const STUDENT_A = id(1), STUDENT_B = id(2), NO_SUB = id(3), TEACHER = id(9);

await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create schema private;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table auth.users(id uuid primary key);
create table public.assignments(id uuid primary key default gen_random_uuid(), teacher_id uuid, title text, subject_name text,
  publish_status text default 'published', assigned_at timestamptz default now(), due_at timestamptz);
create table public.student_assignments(id uuid primary key default gen_random_uuid(), assignment_id uuid, student_id uuid,
  status text default 'pending', assigned_at timestamptz, due_at timestamptz);
insert into auth.users values ('${STUDENT_A}'),('${STUDENT_B}'),('${NO_SUB}'),('${TEACHER}');
`);
await db.exec(readFileSync('supabase/migrations/20261028170000_student_push_notifications.sql', 'utf8'));
await db.exec(`grant usage on schema public to anon, authenticated, service_role;`);

const actor = (user) => db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
const asRole = async (role, fn) => { await db.exec(`set role ${role}`); try { return await fn(); } finally { await db.exec('reset role'); } };
const outbox = async (where = 'true') => (await db.query(`select * from public.push_notification_outbox where ${where} order by created_at`)).rows;

test('students manage only their own devices; the outbox and config are never readable by students', async () => {
  await actor(STUDENT_A);
  await asRole('authenticated', async () => {
    await db.query(`insert into public.push_subscriptions(user_id, endpoint, p256dh, auth, platform) values ($1,'https://push.example/a','k','a','ios')`, [STUDENT_A]);
    await assert.rejects(
      db.query(`insert into public.push_subscriptions(user_id, endpoint, p256dh, auth) values ($1,'https://push.example/spoof','k','a')`, [STUDENT_B]),
      /row-level security/i, 'cannot register a device for someone else');
    await assert.rejects(db.query('select * from public.push_notification_outbox'), /permission denied/i);
    await assert.rejects(db.query('select * from public.push_dispatch_config'), /permission denied/i);
    await assert.rejects(db.query('select public.rpc_claim_push_notifications(10)'), /permission denied/i);
  });
  await actor(STUDENT_B);
  await asRole('authenticated', async () => {
    await db.query(`insert into public.push_subscriptions(user_id, endpoint, p256dh, auth, platform) values ($1,'https://push.example/b','k','b','android')`, [STUDENT_B]);
    const mine = (await db.query('select endpoint from public.push_subscriptions')).rows;
    assert.deepEqual(mine.map((r) => r.endpoint), ['https://push.example/b'], 'sees only own device');
    await db.query(`delete from public.push_subscriptions where endpoint='https://push.example/a'`);
  });
  assert.equal((await db.query('select count(*)::int c from public.push_subscriptions')).rows[0].c, 2, 'cross-user delete was a no-op');
});

test('publishing an assignment queues one message per subscribed student, once, and only once', async () => {
  const { rows: [a] } = await db.query(`insert into public.assignments(teacher_id, title, subject_name, due_at) values ($1,'Fractions quiz','Maths', now() + interval '3 days') returning id`, [TEACHER]);
  await db.query(`insert into public.student_assignments(assignment_id, student_id) values ($1,$2),($1,$3),($1,$4)`, [a.id, STUDENT_A, STUDENT_B, NO_SUB]);
  let rows = await outbox();
  assert.deepEqual(rows.map((r) => r.user_id).sort(), [STUDENT_A, STUDENT_B].sort(), 'student without a device gets no queue row');
  assert.equal(rows[0].event_type, 'assignment_published');
  assert.match(rows[0].body, /Fractions quiz · Maths/);
  // Re-publishing (status flips) must not duplicate.
  await db.query(`update public.assignments set publish_status='draft' where id=$1`, [a.id]);
  await db.query(`update public.assignments set publish_status='published' where id=$1`, [a.id]);
  assert.equal((await outbox()).length, 2, 'idempotency key blocks duplicates');
  // A draft assignment queues nothing until it is published.
  const { rows: [d] } = await db.query(`insert into public.assignments(teacher_id, title, publish_status) values ($1,'Draft work','draft') returning id`, [TEACHER]);
  await db.query(`insert into public.student_assignments(assignment_id, student_id) values ($1,$2)`, [d.id, STUDENT_A]);
  assert.equal((await outbox(`event_type='assignment_published' and payload->>'title'='Draft work'`)).length, 0);
  await db.query(`update public.assignments set publish_status='published' where id=$1`, [d.id]);
  assert.equal((await outbox(`payload->>'title'='Draft work'`)).length, 1, 'publishing the draft queues it');
});

test('due-tomorrow reminders fire once inside the 23–25 h window and skip completed work', async () => {
  const { rows: [due] } = await db.query(`insert into public.assignments(teacher_id, title, due_at) values ($1,'Essay plan', now() + interval '24 hours') returning id`, [TEACHER]);
  await db.query(`insert into public.student_assignments(assignment_id, student_id, status) values ($1,$2,'pending'),($1,$3,'completed')`, [due.id, STUDENT_A, STUDENT_B]);
  const { rows: [far] } = await db.query(`insert into public.assignments(teacher_id, title, due_at) values ($1,'Far away', now() + interval '5 days') returning id`, [TEACHER]);
  await db.query(`insert into public.student_assignments(assignment_id, student_id) values ($1,$2)`, [far.id, STUDENT_A]);
  const first = (await db.query('select public.rpc_enqueue_due_push_reminders() r')).rows[0].r;
  assert.equal(first.assignment_due_reminders, 1, 'only the pending student in the window');
  const second = (await db.query('select public.rpc_enqueue_due_push_reminders() r')).rows[0].r;
  assert.equal(second.assignment_due_reminders, 1, 'loop counts again but…');
  const reminders = await outbox(`event_type='assignment_due_reminder'`);
  assert.equal(reminders.length, 1, '…the idempotency key stops a second row');
  assert.equal(reminders[0].user_id, STUDENT_A);
  assert.match(reminders[0].body, /Essay plan is due tomorrow/);
});

test('claim marks rows processing exactly once; stale claims recover; a disabled device gets nothing new', async () => {
  const claimed = await asRole('service_role', async () => (await db.query('select * from public.rpc_claim_push_notifications(100)')).rows);
  assert.ok(claimed.length >= 3);
  assert.ok(claimed.every((r) => r.status === 'processing' && r.attempts === 1));
  const again = await asRole('service_role', async () => (await db.query('select * from public.rpc_claim_push_notifications(100)')).rows);
  assert.equal(again.length, 0, 'nothing left to claim');
  await db.query(`update public.push_notification_outbox set updated_at = now() - interval '11 minutes' where status='processing'`);
  const cleanup = await asRole('service_role', async () => (await db.query('select public.rpc_push_cleanup() r')).rows[0].r);
  assert.equal(cleanup.recovered, claimed.length);
  await db.query(`update public.push_subscriptions set disabled_at = now(), disabled_reason = 'gone' where user_id=$1`, [STUDENT_B]);
  const { rows: [a] } = await db.query(`insert into public.assignments(teacher_id, title) values ($1,'After disable') returning id`, [TEACHER]);
  await db.query(`insert into public.student_assignments(assignment_id, student_id) values ($1,$2)`, [a.id, STUDENT_B]);
  assert.equal((await outbox(`payload->>'title'='After disable'`)).length, 0);
});
